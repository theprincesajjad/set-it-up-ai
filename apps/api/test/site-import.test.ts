/**
 * Wave O, team import: "Have a website or Instagram?". Extraction across five fixture sites (Squarespace-, Wix- and Shopify-like,
 * a plain page and one with rich JSON-LD), colour picking, every SSRF block, the deadline, robots.txt, the Instagram handle path,
 * home-studio address privacy, rate limits, the 24-hour cache, the audit trail, apply (with the logo copied into storage), and the
 * optional AI tidy-up with a fake model. All network traffic goes to a local fixture server; never the real internet.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiUsage, auditLogs, merchants, merchantStaff, services, siteImportCache } from "@ll/db";
import { contrastRatio } from "@ll/design-tokens";
import type { siteImportApi } from "@ll/shared";
import { frequentColors, parseCssColor, pickColors } from "../src/services/site-import/colors.js";
import { fakeSiteImportAiClient } from "../src/services/site-import/ai.js";
import { cleanTitle, instagramHandle, toCanadianE164 } from "../src/services/site-import/extract.js";
import { isBlockedAddress, parseRobots } from "../src/services/site-import/net.js";
import { createMerchant, createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";
import { fixtureNet, startFixtureServer, type FixtureServer } from "./site-fixtures.js";

let server: FixtureServer;
let env: TestEnv;
beforeAll(async () => {
  server = await startFixtureServer();
});
afterAll(async () => server.close());
beforeEach(async () => {
  env = await createTestEnv();
  env.ctx.providers.siteImportNet = fixtureNet();
  env.ctx.providers.siteImportAi = null;
});
afterEach(async () => env.close());

let ipSeq = 1;
const freshIp = () => `198.18.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`;

async function importUrl(url: string, opts: { token?: string; ip?: string } = {}) {
  return env.app.inject({ method: "POST", url: "/v1/site-import", payload: { url }, remoteAddress: opts.ip ?? freshIp(), headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {} });
}
async function ok(url: string): Promise<siteImportApi.SiteImportResult> {
  const res = await importUrl(url);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}
const site = (host: string) => `${server.origin(host)}/`;

describe("extraction from five fixture sites", () => {
  it("Squarespace-like nail studio: og:site_name, tel link, price list, Instagram, logo colour, and no street address (home-based trade)", async () => {
    const r = await ok(site("priya-nails.test"));
    const f = r.fields;
    expect(r.kind).toBe("website");
    expect(f.name).toMatchObject({ value: "Priya Nails", source: "og" });
    expect(f.website).toMatchObject({ value: site("priya-nails.test"), source: "canonical" });
    expect(f.phone).toMatchObject({ value: "+14165550142", source: "tel_link" });
    expect(f.instagram).toMatchObject({ value: "priya.nails" });
    expect(f.description?.value).toMatch(/^Gel manicures, extensions and nail art/);
    expect(f.vertical).toMatchObject({ value: "nails", source: "keywords" });
    expect(f.logo).toMatchObject({ source: "apple_touch_icon", contentType: "image/png", value: `/v1/site-import/${r.id}/logo` });
    // No theme-color or brand variable: the logo's colour comes before the stylesheet's most frequent one.
    expect(f.brandColor).toMatchObject({ value: "#D6457A", found: "#D6457A", source: "logo_color", adjusted: false });
    expect(f.services?.source).toBe("price_list");
    expect(f.services?.value.map((s) => [s.name, s.priceCents])).toEqual([["Gel manicure", 5500], ["Gel extensions, full set", 9000], ["Fill", 6500], ["Pedicure", 6000], ["Nail art, per nail", 500]]);
    // The contact page lists the studio's street: a home-based trade never gets it from the import.
    expect(f.address).toBeNull();
    expect(r.notes).toContain("address_private");
    expect(r.pages.some((p) => p.endsWith("/services"))).toBe(true);
    expect(r.pages.length).toBeLessThanOrEqual(4);
  });

  it("Wix-like barbershop (gzip): title cleanup, phone and address in the page text, brand variables, a two-line price list", async () => {
    const r = await ok(site("bloor-barbers.test"));
    const f = r.fields;
    expect(f.name).toMatchObject({ value: "Bloor Barbers", source: "title" });
    expect(f.phone).toMatchObject({ value: "+14165550199", source: "page_text" });
    expect(f.address).toMatchObject({ value: "2210 Bloor St W, Toronto, ON M6S 1N4", source: "page_text" });
    expect(f.brandColor).toMatchObject({ value: "#7A1F2B", source: "css_vars" });
    expect(f.accentColor?.source).toBe("css_vars");
    expect(f.vertical?.value).toBe("barber");
    expect(f.logo?.source).toBe("icon");
    expect(f.services?.value.map((s) => [s.name, s.priceCents])).toEqual([["Classic cut", 3500], ["Skin fade", 4000], ["Beard trim", 2000], ["Hot towel shave", 4500]]);
    expect(f.socials?.value.map((s) => s.network).sort()).toEqual(["facebook", "tiktok"]);
    expect(f.instagram).toBeNull();
  });

  it("Shopify-like café: JSON-LD Organization name and logo, theme-color, canonical, sameAs Instagram, offers as suggestions", async () => {
    const r = await ok(site("maple-bean.test"));
    const f = r.fields;
    expect(f.name).toMatchObject({ value: "Maple & Bean Coffee", source: "jsonld" });
    expect(f.website).toMatchObject({ value: site("maple-bean.test"), source: "canonical" });
    expect(f.logo?.source).toBe("jsonld");
    expect(f.brandColor).toMatchObject({ value: "#6B4226", source: "theme_color", adjusted: false });
    expect(f.accentColor?.source).toBe("css");
    expect(f.phone).toMatchObject({ value: "+14165550177", source: "tel_link" });
    expect(f.instagram?.value).toBe("mapleandbean");
    expect(f.vertical?.value).toBe("cafe");
    expect(f.address?.value).toContain("1880 Danforth Ave");
    expect(f.services).toMatchObject({ source: "jsonld", value: [{ name: "House espresso blend, 340 g", priceCents: 1900 }] });
  });

  it("plain HTML bakery: 'Welcome | Sunrise Bakery', a price table, og:image logo, and a pale brand colour made usable", async () => {
    const r = await ok(site("sunrise-bakery.test"));
    const f = r.fields;
    expect(f.name).toMatchObject({ value: "Sunrise Bakery", source: "title" });
    expect(f.phone?.value).toBe("+16475550123");
    expect(f.address?.value).toBe("1402 Gerrard St E, Toronto, ON M4L 1Z5");
    expect(f.instagram?.value).toBe("sunrise_bakery_to");
    expect(f.logo?.source).toBe("og_image");
    expect(f.vertical?.value).toBe("bakery");
    expect(f.services?.value.map((s) => s.name)).toEqual(["Sourdough loaf", "Butter croissant", "Cinnamon bun", "Celebration cake (8 inch)"]);
    expect(f.services?.value[0]?.priceCents).toBe(900);
    // #E07A1F is under 3:1 on white: shaded by the shop colour helper until it passes.
    expect(f.brandColor?.found).toBe("#E07A1F");
    expect(f.brandColor?.adjusted).toBe(true);
    expect(contrastRatio(f.brandColor!.value, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });

  it("JSON-LD salon: LocalBusiness name, phone, address, opening hours, sameAs, offers; robots.txt keeps /private unread", async () => {
    const r = await ok(site("studio-verde.test"));
    const f = r.fields;
    expect(f.name).toMatchObject({ value: "Studio Verde Hair & Colour", source: "jsonld" });
    expect(f.phone).toMatchObject({ value: "+16475550188", source: "jsonld" });
    expect(f.address).toMatchObject({ value: "88 Ossington Ave, Toronto, ON M6J 2Y7", source: "jsonld" });
    expect(f.hours?.value).toEqual({ tue: [["10:00", "19:00"]], wed: [["10:00", "19:00"]], thu: [["10:00", "19:00"]], fri: [["10:00", "19:00"]], sat: [["09:00", "17:00"]] });
    expect(f.instagram?.value).toBe("studioverde.to");
    expect(f.socials?.value.map((s) => s.network)).toContain("pinterest");
    expect(f.description?.source).toBe("jsonld");
    expect(f.brandColor).toMatchObject({ value: "#0F6E66", source: "theme_color" });
    expect(f.accentColor).toMatchObject({ source: "css_vars" });
    expect(f.vertical?.value).toBe("salon");
    expect(f.logo?.source).toBe("jsonld");
    expect(f.services?.value.map((s) => [s.name, s.priceCents])).toEqual([["Women's cut and style", 8500], ["Balayage", 24000], ["Keratin treatment", 30000]]);
    expect(r.notes).toContain("robots_blocked_some");
    expect(server.hits.some((h) => h.startsWith("studio-verde.test /private"))).toBe(false);
  });

  it("the logo preview serves the downloaded image; a logo over 1 MB is skipped for the next candidate", async () => {
    const r = await ok(site("studio-verde.test"));
    const img = await env.app.inject({ method: "GET", url: `/v1/site-import/${r.id}/logo` });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
    const big = await ok(site("big-logo.test"));
    expect(big.fields.logo?.source).toBe("og_image");
    expect(big.fields.name?.value).toBe("Big Logo Co");
  });
});

describe("pure helpers", () => {
  it("colours: parsing, neutrals ignored, precedence, contrast", () => {
    expect(parseCssColor("#abc")).toBe("#AABBCC");
    expect(parseCssColor("rgb(214, 69, 122)")).toBe("#D6457A");
    expect(parseCssColor("rgba(0,0,0,0.1)")).toBeNull();
    expect(parseCssColor("hsl(0, 100%, 50%)")).toBe("#FF0000");
    expect(frequentColors("a{color:#333}b{color:#fff}c{color:#2E8B57}d{color:#2E8B57}e{color:#D6457A}").map((c) => c.color)).toEqual(["#2E8B57", "#D6457A"]);
    const p = pickColors({ themeColor: "#ffffff", vars: { primary: [], accent: [] }, frequent: [{ color: "#2E8B57", count: 3 }, { color: "#D6457A", count: 1 }], logo: null }, "cafe");
    expect(p.primary).toMatchObject({ found: "#2E8B57", source: "css" });
    expect(p.accent?.source).toBe("css");
    const pale = pickColors({ themeColor: "#FFE36E", vars: { primary: [], accent: [] }, frequent: [], logo: null }, "bakery");
    expect(pale.primary?.adjusted).toBe(true);
    expect(contrastRatio(pale.primary!.value, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(pickColors({ themeColor: null, vars: { primary: [], accent: [] }, frequent: [], logo: null }, null)).toEqual({ primary: null, accent: null });
  });

  it("phone, title, Instagram and robots helpers", () => {
    expect(toCanadianE164("tel:+1-416-555-0142")).toBe("+14165550142");
    expect(toCanadianE164("(905) 555 0134")).toBe("+19055550134");
    expect(toCanadianE164("+44 20 7946 0958")).toBeNull();
    expect(toCanadianE164("011-555-0100")).toBeNull();
    expect(cleanTitle("Home | Priya Nails", "priyanails.ca")).toBe("Priya Nails");
    expect(cleanTitle("Bloor Barbers | Barbershop in Toronto", "bloorbarbers.ca")).toBe("Bloor Barbers");
    expect(instagramHandle("https://www.instagram.com/priya.nails/?hl=en")).toBe("priya.nails");
    expect(instagramHandle("https://instagram.com/p/Cx12/")).toBeNull();
    const robots = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: LocalLoyaltySiteImport\nDisallow: /no-bots$\n");
    expect(robots.allow("/private/x")).toBe(true); // our own group wins over *
    expect(robots.allow("/no-bots")).toBe(false);
    const star = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok\n");
    expect(star.allow("/private/x")).toBe(false);
    expect(star.allow("/private/ok")).toBe(true);
    expect(star.allow("/")).toBe(true);
  });

  it("blocked addresses: loopback, private, link-local and metadata, IPv6 local and mapped forms", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd00:ec2::254", "fc00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "not-an-ip"]) expect(isBlockedAddress(a), a).toBe(true);
    for (const a of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isBlockedAddress(a), a).toBe(false);
  });
});

describe("network safety (SSRF)", () => {
  const blocked = async (url: string, code: string) => {
    const res = await importUrl(url);
    expect(res.statusCode, `${url}: ${res.body}`).toBe(422);
    expect(res.json().error.code, url).toBe(code);
  };

  it("refuses a redirect to the cloud metadata address (169.254.169.254)", async () => {
    await blocked(site("redirect-metadata.test"), "site_import_blocked_address");
    expect(server.hits.filter((h) => h.startsWith("169.254"))).toEqual([]);
  });
  it("refuses a DNS name that resolves to 127.0.0.1, to ::1, to a mapped loopback, to fd00:ec2::254, or to one private address among public ones", async () => {
    for (const h of ["rebind-local.test", "v6-loopback.test", "v4-mapped.test", "metadata-v6.test", "mixed.test"]) await blocked(`http://${h}:${server.port}/`, "site_import_blocked_address");
  });
  it("refuses a redirect to a name that resolves to a private address", async () => {
    await blocked(site("redirect-private-name.test"), "site_import_blocked_address");
  });
  it("refuses literal private addresses and localhost", async () => {
    for (const u of [`http://127.0.0.1:${server.port}/`, "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://2130706433/", "http://localhost/", "http://10.0.0.1/"]) await blocked(u, "site_import_blocked_address");
  });
  it("only http and https, no credentials in the address", async () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "javascript:alert(1)", `http://user:pass@priya-nails.test:${server.port}/`]) await blocked(u, "site_import_bad_url");
  });
  it("caps the body at 2 MB, streamed or declared", async () => {
    await blocked(site("huge.test"), "site_import_too_large");
    await blocked(site("huge-declared.test"), "site_import_too_large");
  });
  it("HTML pages only", async () => {
    await blocked(site("json.test"), "site_import_wrong_type");
  });
  it("follows at most 3 redirects", async () => {
    await blocked(site("redirect-loop.test"), "site_import_too_many_redirects");
    expect(server.hits.filter((h) => h.startsWith("redirect-loop.test /hop")).length).toBeLessThanOrEqual(3);
  });
  it("gives up after 8 seconds in total", async () => {
    const t = Date.now();
    await blocked(site("slow.test"), "site_import_timeout");
    expect(Date.now() - t).toBeLessThan(10_000);
  }, 20_000);
  it("respects robots.txt: a site that disallows everything is not read", async () => {
    await blocked(site("robots-closed.test"), "site_import_robots");
    expect(server.hits.filter((h) => h.startsWith("robots-closed.test") && !h.endsWith("/robots.txt"))).toEqual([]);
  });
  it("names itself in the User-Agent", async () => {
    expect(env.ctx.config.siteImport.userAgent).toMatch(/^LocalLoyaltySiteImport\/1\.0/);
  });
});

describe("Instagram, privacy, limits, cache and audit", () => {
  it("an Instagram link or @handle is never fetched: only the handle is kept", async () => {
    const before = server.hits.length;
    for (const u of ["https://www.instagram.com/priya.nails/", "instagram.com/priya.nails", "@priya.nails"]) {
      const r = await ok(u);
      expect(r.kind).toBe("instagram");
      expect(r.fields.instagram).toMatchObject({ value: "priya.nails", source: "instagram_url" });
      expect(r.notes).toEqual(["instagram_handle_only"]);
      expect(r.fields.name).toBeNull();
      expect(r.pages).toEqual([]);
    }
    expect(server.hits.length).toBe(before);
  });

  it("a home-based shop refreshing from Settings never gets a street address; apply refuses an address field", async () => {
    // Someone else read the same site first (a storefront: the street is there), so the nail studio's answer comes from the cache.
    expect((await ok(site("bloor-barbers.test"))).fields.address).not.toBeNull();
    const s = await createMerchant(env, { vertical: "nails" });
    const res = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/site-import`, payload: { url: site("bloor-barbers.test") }, headers: { authorization: `Bearer ${s.ownerToken}` }, remoteAddress: freshIp() });
    expect(res.statusCode, res.body).toBe(200);
    const r = res.json() as siteImportApi.SiteImportResult;
    expect(r.cached).toBe(true);
    expect(r.fields.address).toBeNull();
    expect(r.notes).toContain("address_private");
    const apply = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/site-import/apply`, payload: { importId: r.id, address: "2210 Bloor St W" }, headers: { authorization: `Bearer ${s.ownerToken}` } });
    expect(apply.statusCode).toBe(400);
  });

  it("rate-limits per address (20 an hour) and per signed-in user (10 an hour)", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) expect((await importUrl(`@ratelimit${i}`, { ip })).statusCode).toBe(200);
    const over = await importUrl("@ratelimitover", { ip });
    expect(over.statusCode).toBe(429);
    const u = await createUser(env.db, { email: "rl@example.com" });
    const token = await tokenFor(env, u);
    for (let i = 0; i < 10; i++) expect((await importUrl(`@user${i}`, { token })).statusCode).toBe(200);
    expect((await importUrl("@userover", { token })).statusCode).toBe(429);
    env.clock.now = new Date(env.clock.now.getTime() + 61 * 60_000);
    expect((await importUrl("@userlater", { token: await tokenFor(env, u) })).statusCode).toBe(200);
  });

  it("caches a result for 24 hours by address, then reads the site again", async () => {
    const first = await ok(site("sunrise-bakery.test"));
    const hits = server.hits.length;
    const again = await ok(site("sunrise-bakery.test"));
    expect(again.cached).toBe(true);
    expect(again.id).toBe(first.id);
    expect(again.fields.name).toEqual(first.fields.name);
    expect(server.hits.length).toBe(hits);
    env.clock.now = new Date(env.clock.now.getTime() + 25 * 3_600_000);
    const later = await ok(site("sunrise-bakery.test"));
    expect(later.cached).toBe(false);
    expect(server.hits.length).toBeGreaterThan(hits);
    expect(await env.db.select().from(siteImportCache).where(eq(siteImportCache.id, first.id))).toHaveLength(0);
  });

  it("writes an audit row for every read", async () => {
    const r = await ok(site("maple-bean.test"));
    const rows = await env.db.select().from(auditLogs).where(and(eq(auditLogs.action, "site_import.read"), eq(auditLogs.entityId, r.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data).toMatchObject({ host: "maple-bean.test", kind: "website", cached: false });
  });
});

describe("apply (Settings refresh and the step after signup)", () => {
  it("saves only the confirmed fields, copies the logo into storage and serves it publicly; audit row", async () => {
    const s = await createMerchant(env, { vertical: "salon" });
    const auth = { authorization: `Bearer ${s.ownerToken}` };
    const r = (await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/site-import`, payload: { url: site("studio-verde.test") }, headers: auth, remoteAddress: freshIp() })).json() as siteImportApi.SiteImportResult;
    // Nothing is saved by the import itself.
    const [untouched] = await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    expect(untouched!.name).toBe("Test Shop");
    expect(untouched!.logoUrl).toBeNull();
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/merchants/${s.merchant.id}/site-import/apply`,
      headers: auth,
      payload: { importId: r.id, name: "Studio Verde", logo: true, brandColor: r.fields.brandColor!.value, phone: r.fields.phone!.value, website: r.fields.website!.value, instagram: "studioverde.to", hours: r.fields.hours!.value, services: [{ name: "Balayage", priceCents: 24000 }] },
    });
    expect(res.statusCode, res.body).toBe(200);
    const out = res.json() as siteImportApi.SiteImportApplyResponse;
    expect(out.applied.sort()).toEqual(["brandColor", "hours", "instagram", "logo", "name", "phone", "services", "website"]);
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    expect(m).toMatchObject({ name: "Studio Verde", brandColor: "#0F6E66", phone: "+16475550188", instagram: "studioverde.to" });
    expect(m!.logoUrl).toBe(out.logoUrl);
    expect(m!.logoUrl!.startsWith(`${env.ctx.config.publicApiUrl.replace(/\/+$/, "")}/v1/public/logos/${s.merchant.id}/`)).toBe(true);
    const logo = await env.app.inject({ method: "GET", url: new URL(m!.logoUrl!).pathname });
    expect(logo.statusCode).toBe(200);
    expect(logo.headers["content-type"]).toBe("image/png");
    expect((await env.app.inject({ method: "GET", url: `/v1/public/logos/${s.merchant.id}/${"0".repeat(32)}.png` })).statusCode).toBe(404);
    const svc = await env.db.select().from(services).where(eq(services.merchantId, s.merchant.id));
    expect(svc.map((x) => [x.name, x.priceCents])).toContainEqual(["Balayage", 24000]);
    const audit = await env.db.select().from(auditLogs).where(and(eq(auditLogs.action, "site_import.applied"), eq(auditLogs.merchantId, s.merchant.id)));
    expect(audit).toHaveLength(1);
  });

  it("owner or manager only; an expired import is refused", async () => {
    const s = await createMerchant(env, { vertical: "salon" });
    const r = await ok(site("studio-verde.test"));
    const staffUser = await createUser(env.db, { email: "staff-import@example.com" });
    await env.db.insert(merchantStaff).values({ merchantId: s.merchant.id, userId: staffUser.id, role: "staff" });
    const asStaff = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/site-import/apply`, payload: { importId: r.id, name: "Nope" }, headers: { authorization: `Bearer ${await tokenFor(env, staffUser)}` } });
    expect(asStaff.statusCode).toBe(403);
    const anon = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/site-import/apply`, payload: { importId: r.id, name: "Nope" } });
    expect(anon.statusCode).toBe(401);
    env.clock.now = new Date(env.clock.now.getTime() + 25 * 3_600_000);
    const expired = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/site-import/apply`, payload: { importId: r.id, name: "Later" }, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` } });
    expect(expired.statusCode).toBe(410);
  });
});

describe("optional AI tidy-up", () => {
  it("works without AI (no key): the plain extraction, ai false", async () => {
    const r = await ok(site("bloor-barbers.test"));
    expect(r.ai).toBe(false);
    expect(await env.db.select().from(aiUsage).where(eq(aiUsage.feature, "site_import"))).toHaveLength(0);
  });

  it("with a (fake) model: tidies the name, meters ai_usage for this shop only, and stops at the shop's monthly allowance", async () => {
    env.ctx.providers.siteImportAi = fakeSiteImportAiClient();
    const s = await createMerchant(env, { vertical: "barber" });
    const call = () => env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/site-import`, payload: { url: site("studio-verde.test") }, headers: { authorization: `Bearer ${s.ownerToken}` }, remoteAddress: freshIp() });
    const r = (await call()).json() as siteImportApi.SiteImportResult;
    expect(r.ai).toBe(true);
    expect(r.notes).toContain("ai_tidied");
    expect(r.fields.services?.value.every((x) => x.source === "ai")).toBe(true);
    const used = await env.db.select().from(aiUsage).where(eq(aiUsage.feature, "site_import"));
    expect(used).toHaveLength(1);
    expect(used[0]!.merchantId).toBe(s.merchant.id);
    // The shop's allowance (10 a month): further imports run without the model.
    await env.db.insert(aiUsage).values(Array.from({ length: 9 }, () => ({ merchantId: s.merchant.id, feature: "site_import", model: "fake", outcome: "fake", createdAt: env.clock.now })));
    await env.db.delete(siteImportCache);
    const r2 = (await call()).json() as siteImportApi.SiteImportResult;
    expect(r2.ai).toBe(false);
    expect(r2.fields.name?.source).toBe("jsonld");
  });
});
