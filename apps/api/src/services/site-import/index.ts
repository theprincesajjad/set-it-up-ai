/**
 * "Have a website or Instagram?" (wave O, team import): onboarding step 1 and Settings, "Refresh from my website".
 *
 * importSite reads the homepage and at most three same-site pages (contact, services/menu, book, about) through the SSRF guard
 * in net.ts, respecting robots.txt, plus up to three stylesheets and one logo image, all inside one 8-second deadline. It
 * returns every value it found with its source; nothing is written to the shop. The owner reviews, edits or drops each field
 * and confirms; only then does applySiteImport save the kept fields (and copy the downloaded logo into object storage).
 *
 * Instagram is never fetched (its terms forbid scraping): an instagram.com link or an @handle only gives the handle.
 * Home-based trades never get a street address from the import (address-privacy.ts: a home studio's address is private).
 * Rate limits: 10 imports an hour per signed-in user and 20 per address. Results are cached for 24 hours per address.
 * Every import and every apply writes an audit row.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, lte } from "drizzle-orm";
import { locations, merchants, services, siteImportCache } from "@ll/db";
import { SERVICE_STARTERS, SOLO_ONLY_VERTICALS, isAddressPrivate, type siteImportApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { HttpError, tooMany } from "../../lib/errors.js";
import { allow } from "../../lib/rate-limit.js";
import { MAX_UPLOAD_BYTES, getStorage, sniffImage } from "../../providers/storage.js";
import { writeAudit } from "../admin-audit.js";
import { updateProfile } from "../merchant.js";
import { tidyWithAi } from "./ai.js";
import { cssVarColors, frequentColors, logoDominantColor, pickColors } from "./colors.js";
import { cleanTitle, extractPage, guessTrade, instagramHandle, pickSubpages, toCanadianE164, type PageFacts } from "./extract.js";
import { CSS_TYPES, HTML_TYPES, IMAGE_TYPES_OK, MAX_PAGE_BYTES, SiteImportError, TOTAL_TIMEOUT_MS, checkUrl, guardedGet, robotsFor, type RobotsRules } from "./net.js";

type Merchant = typeof merchants.$inferSelect;
type Result = siteImportApi.SiteImportResult;

export const CACHE_TTL_MS = 24 * 3_600_000;
export const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_CSS_BYTES = 512 * 1024;
const MAX_SUBPAGES = 3;
const MAX_STYLESHEETS = 3;
export const RATE = { perUser: 10, perIp: 20, windowMs: 3_600_000 };

export { SiteImportError };

/** "@priyanails", "instagram.com/priyanails", "https://www.instagram.com/priyanails/" → the handle; anything else → null. */
export function instagramInput(raw: string): string | null {
  const s = raw.trim();
  const at = /^@([A-Za-z0-9_.]{1,30})$/.exec(s);
  if (at) return at[1]!.toLowerCase();
  return /instagram\.com/i.test(s) ? instagramHandle(/^https?:\/\//i.test(s) ? s : `https://${s}`) : null;
}

/** The cache key and the first address to try: scheme added when missing (https), lower-case host, no fragment. */
export function normaliseInput(raw: string): { url: string; guessedScheme: boolean } {
  const s = raw.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[\w.-]+:\d+(\/|$)/.test(s);
  const u = checkUrl(hasScheme ? s : `https://${s}`);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (!u.hostname.includes(".") && !/^\[/.test(u.hostname) && u.hostname !== "localhost") throw new SiteImportError("bad_url", "That doesn't look like a web address.");
  return { url: u.toString(), guessedScheme: !hasScheme };
}

export interface ImportActor {
  userId: string | null;
  ip: string | null;
}

async function rateLimit(ctx: AppContext, actor: ImportActor) {
  if (actor.userId && !(await allow(ctx, `site-import:user:${actor.userId}`, RATE.perUser, RATE.windowMs))) throw tooMany("That's a lot of imports in an hour. Try again later, or type your details in.");
  if (actor.ip && !(await allow(ctx, `site-import:ip:${actor.ip}`, RATE.perIp, RATE.windowMs))) throw tooMany("That's a lot of imports in an hour. Try again later, or type your details in.");
}

const emptyFields = (): Result["fields"] => ({ name: null, logo: null, website: null, phone: null, address: null, hours: null, instagram: null, socials: null, description: null, brandColor: null, accentColor: null, services: null, vertical: null });

export async function importSite(ctx: AppContext, raw: string, actor: ImportActor, merchant: Merchant | null = null): Promise<Result> {
  await rateLimit(ctx, actor);
  const handle = instagramInput(raw);
  if (handle) {
    const result: Result = {
      id: randomUUID(),
      url: `https://www.instagram.com/${handle}/`,
      kind: "instagram",
      fetchedAt: ctx.now().toISOString(),
      cached: false,
      pages: [],
      fields: { ...emptyFields(), instagram: { value: handle, source: "instagram_url" } },
      notes: ["instagram_handle_only"],
      ai: false,
    };
    await saveCache(ctx, `instagram:${handle}`, result, null);
    await audit(ctx, actor, merchant, result, "instagram");
    return result;
  }
  const { url, guessedScheme } = normaliseInput(raw);
  const [hit] = await ctx.db.select().from(siteImportCache).where(and(eq(siteImportCache.url, url), gt(siteImportCache.expiresAt, ctx.now()))).limit(1);
  if (hit) {
    // The cache is shared by address, so the privacy rule runs again for whoever asks (a home studio never gets a street).
    const result = await withPrivacy(ctx, { ...(hit.result as unknown as Result), id: hit.id, cached: true }, merchant);
    await audit(ctx, actor, merchant, result, new URL(url).hostname);
    return result;
  }
  let crawl: Crawl;
  try {
    crawl = await crawlSite(ctx, url);
  } catch (e) {
    if (guessedScheme && e instanceof SiteImportError && e.reason === "fetch_failed") crawl = await crawlSite(ctx, url.replace(/^https:/, "http:"));
    else throw e;
  }
  const result = await buildResult(ctx, url, crawl, merchant);
  await saveCache(ctx, url, result, crawl.logo);
  const shown = await withPrivacy(ctx, result, merchant);
  await audit(ctx, actor, merchant, shown, new URL(url).hostname);
  return shown;
}

/**
 * Home-studio privacy (packages/shared/src/address-privacy.ts): no street address for a trade that usually works from home, or for
 * a shop whose address is private (area or city visibility). The street stays out of the review card, so it can never be prefilled.
 */
async function withPrivacy(ctx: AppContext, r: Result, merchant: Merchant | null): Promise<Result> {
  if (!r.fields.address) return r;
  let priv = SOLO_ONLY_VERTICALS.includes(merchant?.vertical ?? r.fields.vertical?.value ?? "");
  if (!priv && merchant) {
    const [loc] = await ctx.db.select({ v: locations.addressVisibility }).from(locations).where(eq(locations.merchantId, merchant.id)).orderBy(asc(locations.createdAt)).limit(1);
    priv = isAddressPrivate(loc?.v);
  }
  if (!priv) return r;
  return { ...r, fields: { ...r.fields, address: null }, notes: r.notes.includes("address_private") ? r.notes : [...r.notes, "address_private"] };
}

async function audit(ctx: AppContext, actor: ImportActor, merchant: Merchant | null, r: Result, host: string) {
  await writeAudit(ctx.db, {
    actorUserId: actor.userId,
    merchantId: merchant?.id ?? null,
    action: "site_import.read",
    entity: "site_import",
    entityId: r.id,
    data: { host, kind: r.kind, cached: r.cached, pages: r.pages.length, found: Object.entries(r.fields).filter(([, v]) => v).map(([k]) => k), ai: r.ai },
    ip: actor.ip,
  });
}

async function saveCache(ctx: AppContext, url: string, result: Result, logo: { body: Buffer; type: string } | null) {
  const now = ctx.now();
  await ctx.db.delete(siteImportCache).where(eq(siteImportCache.url, url));
  await ctx.db.delete(siteImportCache).where(lte(siteImportCache.expiresAt, now));
  await ctx.db.insert(siteImportCache).values({ id: result.id, url, result: result as unknown as Record<string, unknown>, logoB64: logo ? logo.body.toString("base64") : null, logoType: logo?.type ?? null, createdAt: now, expiresAt: new Date(now.getTime() + CACHE_TTL_MS) });
}

// ---------------------------------------------------------------------------
// The crawl
// ---------------------------------------------------------------------------
interface Crawl {
  home: PageFacts;
  pages: PageFacts[];
  css: string;
  logo: { body: Buffer; type: string; source: siteImportApi.SiteImportSource; from: string } | null;
  robotsSkipped: boolean;
}

async function crawlSite(ctx: AppContext, url: string): Promise<Crawl> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  const robots = new Map<string, RobotsRules>();
  const allowed = async (u: string) => {
    const x = new URL(u);
    let r = robots.get(x.origin);
    if (!r) robots.set(x.origin, (r = await robotsFor(ctx, x.origin, deadline)));
    return r.allow(`${x.pathname}${x.search}`);
  };
  if (!(await allowed(url))) throw new SiteImportError("robots", "This website asks robots not to read it, so we didn't. Type your details in instead.");
  const homeRes = await guardedGet(ctx, url, { deadline, maxBytes: MAX_PAGE_BYTES, types: HTML_TYPES, accept: "text/html,application/xhtml+xml" });
  // A redirect to another origin is checked against that origin's robots.txt too.
  if (new URL(homeRes.url).origin !== new URL(url).origin && !(await allowed(homeRes.url))) throw new SiteImportError("robots", "This website asks robots not to read it, so we didn't. Type your details in instead.");
  const home = extractPage(homeRes.body.toString("utf8"), homeRes.url);
  const pages: PageFacts[] = [];
  let robotsSkipped = false;
  for (const sub of pickSubpages(home, MAX_SUBPAGES)) {
    if (Date.now() > deadline - 500) break;
    try {
      if (!(await allowed(sub))) {
        robotsSkipped = true;
        continue;
      }
      const r = await guardedGet(ctx, sub, { deadline, maxBytes: MAX_PAGE_BYTES, types: HTML_TYPES, accept: "text/html" });
      pages.push(extractPage(r.body.toString("utf8"), r.url));
    } catch (e) {
      if (e instanceof SiteImportError && e.reason === "timeout") break;
      // One page that fails does not spoil the import.
    }
  }
  let css = home.inlineCss;
  for (const sheet of [...new Set(home.stylesheets)].slice(0, MAX_STYLESHEETS)) {
    if (Date.now() > deadline - 500) break;
    try {
      const r = await guardedGet(ctx, sheet, { deadline, maxBytes: MAX_CSS_BYTES, types: CSS_TYPES, accept: "text/css" });
      css += `\n${r.body.toString("utf8")}`;
    } catch {
      // Skip a stylesheet that fails.
    }
  }
  const all = [home, ...pages];
  const firstOf = <K extends keyof PageFacts>(k: K) => all.map((p) => p[k]).find(Boolean) as PageFacts[K] | undefined;
  const icon = [...all.flatMap((p) => p.icons)].filter((i) => !/\.(svg|ico)(\?|$)/i.test(i.href)).sort((a, b) => b.size - a.size)[0]?.href;
  const candidates: [string | null | undefined, siteImportApi.SiteImportSource][] = [
    [firstOf("ldLogo"), "jsonld"],
    [firstOf("appleIcon"), "apple_touch_icon"],
    [icon, "icon"],
    [home.ogImage, "og_image"],
  ];
  let logo: Crawl["logo"] = null;
  let tries = 0;
  for (const [src, source] of candidates) {
    if (!src || tries >= 3 || Date.now() > deadline - 300) continue;
    tries++;
    try {
      const r = await guardedGet(ctx, src, { deadline, maxBytes: MAX_LOGO_BYTES, types: IMAGE_TYPES_OK, accept: "image/png,image/jpeg,image/webp" });
      const type = sniffImage(r.body);
      if (!type || (type !== "image/png" && type !== "image/jpeg" && type !== "image/webp")) continue;
      logo = { body: r.body, type, source, from: r.url };
      break;
    } catch (e) {
      if (e instanceof SiteImportError && e.reason === "timeout") break;
    }
  }
  return { home, pages, css, logo, robotsSkipped };
}

// ---------------------------------------------------------------------------
// From the pages to the review card
// ---------------------------------------------------------------------------
const sameSite = (a: string, b: string) => {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
};

async function buildResult(ctx: AppContext, url: string, c: Crawl, merchant: Merchant | null): Promise<Result> {
  const all = [c.home, ...c.pages];
  const f = emptyFields();
  const notes: Result["notes"] = [];
  const host = new URL(c.home.url).hostname;
  const field = <T>(value: T, source: siteImportApi.SiteImportSource, page?: string) => ({ value, source, page: page ?? null });
  const find = <T>(pick: (p: PageFacts) => T | null | undefined): { value: T; page: string } | null => {
    for (const p of all) {
      const v = pick(p);
      if (v) return { value: v, page: p.url };
    }
    return null;
  };

  // Name: JSON-LD, then og:site_name, then the cleaned title.
  const ld = find((p) => p.ldName);
  const og = c.home.ogSiteName;
  const titled = c.home.title ? cleanTitle(c.home.title, host) : null;
  if (ld) f.name = field(ld.value.slice(0, 120), "jsonld", ld.page);
  else if (og && !/^(squarespace|wix|shopify|wordpress)$/i.test(og)) f.name = field(og.slice(0, 120), "og", c.home.url);
  else if (titled) f.name = field(titled.slice(0, 120), "title", c.home.url);

  // Website: the canonical address when it is on the same site, else where we ended up.
  const canon = [c.home.canonical, c.home.ogUrl].find((u) => u && sameSite(u, c.home.url));
  const site = new URL(canon ?? c.home.url);
  f.website = field(site.pathname === "/" || site.pathname === "" ? `${site.origin}/` : `${site.origin}${site.pathname}`, canon ? "canonical" : "links", c.home.url);

  // Phone: JSON-LD telephone, then a tel: link, then a number in the text.
  const ldPhone = find((p) => toCanadianE164(p.ldPhone));
  const tel = find((p) => p.telLinks.map(toCanadianE164).find(Boolean));
  const textPhone = find((p) => toCanadianE164(p.textPhone));
  if (ldPhone) f.phone = field(ldPhone.value, "jsonld", ldPhone.page);
  else if (tel) f.phone = field(tel.value, "tel_link", tel.page);
  else if (textPhone) f.phone = field(textPhone.value, "page_text", textPhone.page);

  const ldAddr = find((p) => p.ldAddress);
  const visAddr = find((p) => p.visibleAddress);
  const hours = find((p) => p.hours);
  if (hours) f.hours = field(hours.value, "jsonld", hours.page);

  const socials = [...new Map(all.flatMap((p) => p.socials).map((s) => [s.url.toLowerCase(), s])).values()].slice(0, 8);
  if (socials.length) f.socials = field(socials, "links", c.home.url);
  const ig = socials.map((s) => (s.network === "instagram" ? instagramHandle(s.url) : null)).find(Boolean);
  if (ig) f.instagram = field(ig, "links", c.home.url);

  const ldDesc = find((p) => p.ldDescription);
  if (ldDesc) f.description = field(ldDesc.value.slice(0, 300), "jsonld", ldDesc.page);
  else if (c.home.metaDescription) f.description = field(c.home.metaDescription.slice(0, 300), "meta", c.home.url);
  else if (c.home.ogDescription) f.description = field(c.home.ogDescription.slice(0, 300), "og", c.home.url);

  const ldSvc = find((p) => (p.ldServices.length ? p.ldServices : null));
  const listSvc = find((p) => (p.priceServices.length >= 2 ? p.priceServices : null));
  if (ldSvc) f.services = field(ldSvc.value.map((s) => ({ ...s, source: "jsonld" as const })), "jsonld", ldSvc.page);
  else if (listSvc) f.services = field(listSvc.value.map((s) => ({ ...s, source: "price_list" as const })), "price_list", listSvc.page);

  const trade = guessTrade(all.map((p) => `${p.title ?? ""} ${p.metaDescription ?? ""} ${p.text}`).join(" "), all.flatMap((p) => p.ldTypes));
  if (trade) f.vertical = field(trade, "keywords", c.home.url);
  const tradeForColor = merchant?.vertical ?? trade;

  // Address, with the home-studio rule: a trade that usually works from home never gets a street address from the import.
  const homeBased = SOLO_ONLY_VERTICALS.includes(merchant?.vertical ?? trade ?? "");
  if (homeBased && (ldAddr || visAddr)) notes.push("address_private");
  else if (ldAddr) f.address = field(ldAddr.value.slice(0, 300), "jsonld", ldAddr.page);
  else if (visAddr) f.address = field(visAddr.value.slice(0, 300), "page_text", visAddr.page);

  if (c.logo) f.logo = { value: "", source: c.logo.source, page: c.logo.from, contentType: c.logo.type, bytes: c.logo.body.length };
  else notes.push("no_logo");

  const colors = pickColors(
    {
      themeColor: c.home.themeColor,
      vars: { primary: [...c.home.cssVars.primary, ...cssVarColors(c.css).primary], accent: [...c.home.cssVars.accent, ...cssVarColors(c.css).accent] },
      frequent: frequentColors(c.css),
      logo: c.logo?.type === "image/png" ? logoDominantColor(c.logo.body) : null,
    },
    tradeForColor,
  );
  if (colors.primary) f.brandColor = { value: colors.primary.value, found: colors.primary.found, adjusted: colors.primary.adjusted, source: colors.primary.source, page: c.home.url };
  if (colors.accent) f.accentColor = field(colors.accent.value, colors.accent.source, c.home.url);
  if (c.robotsSkipped) notes.push("robots_blocked_some");

  // Optional tidy-up by a small model (works without it).
  let ai = false;
  const tidy = await tidyWithAi(ctx, merchant?.id ?? null, { host, name: f.name?.value ?? null, title: c.home.title, description: f.description?.value ?? null, services: (f.services?.value ?? []).map((s) => ({ name: s.name, priceCents: s.priceCents })) });
  if (tidy) {
    ai = true;
    notes.push("ai_tidied");
    if (tidy.name && f.name && tidy.name !== f.name.value) f.name = field(tidy.name, "ai", f.name.page ?? undefined);
    if (tidy.description && f.description) f.description = field(tidy.description, "ai", f.description.page ?? undefined);
    if (f.services && tidy.services.length) f.services = { ...f.services, value: tidy.services.map((s) => ({ ...s, source: "ai" as const })) };
  }

  const id = randomUUID();
  if (f.logo) f.logo.value = `/v1/site-import/${id}/logo`;
  return { id, url, kind: "website", fetchedAt: ctx.now().toISOString(), cached: false, pages: all.map((p) => p.url), fields: f, notes, ai };
}

// ---------------------------------------------------------------------------
// Logo preview and apply
// ---------------------------------------------------------------------------
export async function cachedImport(ctx: AppContext, id: string) {
  const [row] = await ctx.db.select().from(siteImportCache).where(and(eq(siteImportCache.id, id), gt(siteImportCache.expiresAt, ctx.now()))).limit(1);
  return row ?? null;
}

export const LOGO_PATH = "/v1/public/logos/";

export async function applySiteImport(ctx: AppContext, merchant: Merchant, actorUserId: string, body: siteImportApi.SiteImportApplyBody & { importId: string }, ip: string | null): Promise<siteImportApi.SiteImportApplyResponse> {
  const row = await cachedImport(ctx, body.importId);
  if (!row) throw new HttpError(410, "import_expired", "That import has expired. Read your website again.");
  const { importId: _id, logo, services: svc, ...profile } = body;
  const set = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)) as Parameters<typeof updateProfile>[3];
  const applied = Object.keys(set);
  if (applied.length) await updateProfile(ctx, merchant.id, actorUserId, set);
  let logoUrl: string | null = profile.logoUrl ?? null;
  if (logo && row.logoB64) {
    const bytes = Buffer.from(row.logoB64, "base64");
    const type = sniffImage(bytes);
    if (!type || bytes.length > Math.min(MAX_UPLOAD_BYTES, MAX_LOGO_BYTES)) throw new HttpError(422, "bad_logo", "That logo couldn't be used. Add one in Settings.");
    const stored = await getStorage(ctx).put({ merchantId: merchant.id, contentType: type, body: bytes });
    logoUrl = `${ctx.config.publicApiUrl.replace(/\/+$/, "")}${LOGO_PATH}${stored.key}`;
    await ctx.db.update(merchants).set({ logoUrl, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
    applied.push("logo");
  }
  if (svc?.length && SERVICE_STARTERS[merchant.vertical as keyof typeof SERVICE_STARTERS]) {
    const starters = SERVICE_STARTERS[merchant.vertical as keyof typeof SERVICE_STARTERS] ?? [];
    await ctx.db.transaction(async (tx) => {
      const have = await tx.select({ name: services.name }).from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, "appointment")));
      const names = new Set(have.map((s) => s.name.toLowerCase()));
      let sort = have.length;
      for (const s of svc) {
        if (names.has(s.name.toLowerCase())) continue;
        names.add(s.name.toLowerCase());
        const starter = starters.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
        // The site lists no duration: the trade's starter when the name matches, else 45 minutes the owner adjusts on the services step.
        await tx.insert(services).values({ merchantId: merchant.id, kind: "appointment", name: s.name, durationMin: starter?.durationMin ?? 45, priceCents: s.priceCents, depositCents: 0, sort: sort++ });
      }
    });
    applied.push("services");
  }
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "site_import.applied", entity: "site_import", entityId: row.id, data: { fields: applied, host: safeHost(row.url) }, ip });
  return { applied, logoUrl };
}

const safeHost = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u.slice(0, 80);
  }
};

/** The stored logo behind a public logo URL, only while it is still that shop's logo. */
export async function publicLogo(ctx: AppContext, merchantId: string, file: string) {
  if (!/^[0-9a-f]{32}\.(png|jpg|webp)$/.test(file)) return null;
  const key = `${merchantId}/${file}`;
  const [m] = await ctx.db.select({ logoUrl: merchants.logoUrl }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m?.logoUrl || !m.logoUrl.endsWith(`${LOGO_PATH}${key}`)) return null;
  return (await getStorage(ctx).get?.(key)) ?? null;
}

