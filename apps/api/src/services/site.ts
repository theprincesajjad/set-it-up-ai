/**
 * The built-in website builder (phase solo, workstream G): drafts, edits, publish, the AI allowance, the annual entitlement and
 * its lapse rules, custom domains and the public page data. Contracts: @ll/shared siteApi. Docs: docs/engineering/site-builder.md.
 *
 * Rules that live here:
 *  - Anyone on the shop's owner side can build and preview; publishing needs the annual plan (merchants.annual_site_entitled,
 *    an active yearly paid subscription, or an admin grant on feature key "site.builder"). Others get 402 with offer "annual".
 *  - AI caps: SITE_AI_GENERATIONS_PER_MONTH drafts and SITE_AI_EDITS_PER_MONTH one-line rewrites per monthly window, anchored on
 *    the billing date; the counter is reserved before the call (so two tabs cannot overspend) and refunded when the call never
 *    reached the model. No API key: presets and template copy only, no counters touched.
 *  - Lapse: a published site that loses the annual plan stays up with a banner for SITE_LAPSE_GRACE_DAYS, then its custom domain
 *    stops routing; {siteUrl}/s/{slug} keeps working.
 *  - The page never carries a street address for an "area" or "city" location (solo-pro-launch.md §2.3).
 */
import { and, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { featureOverrides, locations, merchants, neighbourhoods, reviewRequests, services, siteDomains, sites, subscriptions } from "@ll/db";
import {
  SITE_AI_EDITS_PER_MONTH,
  SITE_AI_GENERATIONS_PER_MONTH,
  SITE_LAPSE_GRACE_DAYS,
  defaultContent,
  defaultCopy,
  defaultPresetFor,
  effectivePlan,
  getCopyField,
  isCaDomain,
  normalizeCopy,
  normalizeHidden,
  normalizeHostname,
  normalizeOrder,
  setCopyField,
  siteDraftOutput,
  siteLineOutput,
  tradeLabelFor,
  type SiteContent,
  type SitePreset,
  type SiteShopFacts,
  type siteApi,
} from "@ll/shared";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { isFeatureOn } from "./features.js";
import { publicShop } from "./network.js";
import { DRAFT_MAX_TOKENS, DRAFT_SYSTEM, EDIT_MAX_TOKENS, REWRITE_SYSTEM, draftSchema, draftUserMessage, lineSchema, rewriteUserMessage, runLogged, siteAiFor, type DraftFacts } from "./site-ai.js";
import { dnsFor, domainsAuto, domainsFor } from "./site-domains.js";

type Merchant = typeof merchants.$inferSelect;
type SiteRow = typeof sites.$inferSelect;
type DomainRow = typeof siteDomains.$inferSelect;

const DAY = 86_400_000;
export const FALLBACK_MESSAGE = "We couldn't write this one. Here's a draft to edit.";
const NO_AI_MESSAGE = "Writing with AI isn't switched on. Here's a draft to edit.";

/** 402 for publishing without the annual plan; the UI shows the plan line with the annual offer. */
export const annualRequired = () =>
  new HttpError(402, "feature_locked", "Your website goes live with the annual plan.", { feature: "site.builder", reason: "plan", offer: "annual" });

// ---------------------------------------------------------------------------
// Entitlement and the allowance window
// ---------------------------------------------------------------------------
async function liveSubscription(ctx: AppContext, merchantId: string) {
  const [s] = await ctx.db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.merchantId, merchantId), inArray(subscriptions.status, ["active", "trialing", "past_due"])))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return s ?? null;
}

export async function entitlementOf(ctx: AppContext, m: Merchant): Promise<{ entitled: boolean; reason: siteApi.SiteEntitlementDto["reason"]; sub: Awaited<ReturnType<typeof liveSubscription>> }> {
  const sub = await liveSubscription(ctx, m.id);
  const [grant] = await ctx.db.select().from(featureOverrides).where(and(eq(featureOverrides.merchantId, m.id), eq(featureOverrides.key, "site.builder"))).limit(1);
  if (grant?.enabled) return { entitled: true, reason: "grant", sub };
  const paid = effectivePlan(m.plan, m.restaurantTier) !== "free";
  if (m.annualSiteEntitled || (paid && sub?.interval === "year")) return { entitled: true, reason: "annual", sub };
  // A future feature-key rollout (workstream A's "site.builder") also counts, when it exists.
  if (await isFeatureOn(ctx.db, m, "site.builder").catch(() => false)) return { entitled: true, reason: "annual", sub };
  return { entitled: false, reason: paid ? "monthly" : "free", sub };
}

/** The monthly window `now` falls in, anchored on the subscription's billing day (calendar month without one). */
export function allowanceWindow(now: Date, anchor: Date | null): { start: Date; end: Date } {
  if (!anchor) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start, end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
  }
  const day = anchor.getUTCDate();
  const at = (y: number, mo: number) => {
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, mo, Math.min(day, last), anchor.getUTCHours(), anchor.getUTCMinutes()));
  };
  let start = at(now.getUTCFullYear(), now.getUTCMonth());
  if (start.getTime() > now.getTime()) start = at(now.getUTCFullYear(), now.getUTCMonth() - 1);
  const end = at(start.getUTCFullYear(), start.getUTCMonth() + 1);
  return { start, end };
}

function usageOf(row: SiteRow, win: { start: Date; end: Date }): siteApi.SiteUsageDto {
  const current = row.periodStart && row.periodStart.getTime() >= win.start.getTime();
  return {
    drafts: { used: current ? row.aiGenerationsPeriod : 0, limit: SITE_AI_GENERATIONS_PER_MONTH },
    edits: { used: current ? row.aiEditsPeriod : 0, limit: SITE_AI_EDITS_PER_MONTH },
    periodStart: win.start.toISOString(),
    periodEnd: win.end.toISOString(),
  };
}

/**
 * Take one draft or edit from the allowance, atomically: resets the counters when the window moved on, refuses when spent.
 * Returns false when the cap is reached.
 */
async function reserve(ctx: AppContext, row: SiteRow, kind: "draft" | "rewrite", win: { start: Date }): Promise<boolean> {
  const col = kind === "draft" ? sites.aiGenerationsPeriod : sites.aiEditsPeriod;
  const other = kind === "draft" ? sites.aiEditsPeriod : sites.aiGenerationsPeriod;
  const limit = kind === "draft" ? SITE_AI_GENERATIONS_PER_MONTH : SITE_AI_EDITS_PER_MONTH;
  const key = kind === "draft" ? "aiGenerationsPeriod" : "aiEditsPeriod";
  const otherKey = kind === "draft" ? "aiEditsPeriod" : "aiGenerationsPeriod";
  const stale = sql`(${sites.periodStart} is null or ${sites.periodStart} < ${win.start.toISOString()}::timestamptz)`;
  const updated = await ctx.db
    .update(sites)
    .set({
      [key]: sql`case when ${stale} then 1 else ${col} + 1 end`,
      [otherKey]: sql`case when ${stale} then 0 else ${other} end`,
      periodStart: sql`case when ${stale} then ${win.start.toISOString()}::timestamptz else ${sites.periodStart} end`,
    } as unknown as Partial<SiteRow>)
    .where(and(eq(sites.id, row.id), sql`(${stale} or ${col} < ${limit})`))
    .returning({ id: sites.id });
  return updated.length > 0;
}

async function refund(ctx: AppContext, row: SiteRow, kind: "draft" | "rewrite") {
  const col = kind === "draft" ? sites.aiGenerationsPeriod : sites.aiEditsPeriod;
  const key = kind === "draft" ? "aiGenerationsPeriod" : "aiEditsPeriod";
  await ctx.db.update(sites).set({ [key]: sql`greatest(${col} - 1, 0)` } as unknown as Partial<SiteRow>).where(eq(sites.id, row.id));
}

// ---------------------------------------------------------------------------
// Shop facts (template copy, the prompt, the public page)
// ---------------------------------------------------------------------------
async function primaryLocation(ctx: AppContext, merchantId: string) {
  const [l] = await ctx.db.select().from(locations).where(and(eq(locations.merchantId, merchantId), eq(locations.active, true))).orderBy(locations.createdAt).limit(1);
  return l ?? null;
}

async function areaOf(ctx: AppContext, m: Merchant, loc: Awaited<ReturnType<typeof primaryLocation>>): Promise<string | null> {
  if (loc?.areaLabel) return loc.areaLabel;
  if (!m.neighbourhoodId) return null;
  const [n] = await ctx.db.select({ name: neighbourhoods.name }).from(neighbourhoods).where(eq(neighbourhoods.id, m.neighbourhoodId)).limit(1);
  return n?.name ?? null;
}

async function factsOf(ctx: AppContext, m: Merchant): Promise<SiteShopFacts> {
  const loc = await primaryLocation(ctx, m.id);
  const [books, area] = await Promise.all([isFeatureOn(ctx.db, m, "booking.appointments").catch(() => false), areaOf(ctx, m, loc)]);
  return { name: m.name, tradeLabel: tradeLabelFor(m.vertical), areaLabel: area, city: loc?.city ?? null, books, hasLoyalty: true };
}

function contentOf(raw: unknown, fallbackPreset: SitePreset, facts: SiteShopFacts): SiteContent {
  const r = (raw ?? {}) as Partial<SiteContent>;
  const preset = (["studio", "portfolio", "shopfront"] as const).includes(r.preset as SitePreset) ? (r.preset as SitePreset) : fallbackPreset;
  return { preset, order: normalizeOrder(preset, r.order), hidden: normalizeHidden(preset, r.hidden), copy: normalizeCopy(r.copy, defaultCopy(preset, facts)) };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
async function siteRow(ctx: AppContext, m: Merchant): Promise<SiteRow> {
  const [have] = await ctx.db.select().from(sites).where(eq(sites.merchantId, m.id)).limit(1);
  if (have) return have;
  const preset = defaultPresetFor(m.vertical);
  const content = defaultContent(preset, await factsOf(ctx, m));
  await ctx.db.insert(sites).values({ merchantId: m.id, preset, content }).onConflictDoNothing();
  const [row] = await ctx.db.select().from(sites).where(eq(sites.merchantId, m.id)).limit(1);
  return row!;
}

async function domainRow(ctx: AppContext, merchantId: string): Promise<DomainRow | null> {
  const [d] = await ctx.db.select().from(siteDomains).where(and(eq(siteDomains.merchantId, merchantId), ne(siteDomains.status, "removed"))).orderBy(desc(siteDomains.createdAt)).limit(1);
  return d ?? null;
}

function domainDto(d: DomainRow | null): siteApi.SiteDomainDto | null {
  if (!d) return null;
  return {
    hostname: d.hostname,
    status: d.status as siteApi.SiteDomainStatus,
    mode: d.mode as "register" | "connect",
    dns: d.verification?.dns ?? [],
    note: d.note,
    requestedAt: d.createdAt.toISOString(),
    liveAt: d.liveAt?.toISOString() ?? null,
  };
}

/** Records the start of a lapse (or clears it) and returns the lapse state. */
async function syncLapse(ctx: AppContext, row: SiteRow, entitled: boolean): Promise<{ row: SiteRow; lapse: siteApi.SiteEntitlementDto["lapsed"] }> {
  const now = ctx.now();
  if (entitled || row.status !== "published") {
    if (row.lapsedAt) {
      await ctx.db.update(sites).set({ lapsedAt: null }).where(eq(sites.id, row.id));
      row = { ...row, lapsedAt: null };
    }
    return { row, lapse: null };
  }
  if (!row.lapsedAt) {
    await ctx.db.update(sites).set({ lapsedAt: now }).where(eq(sites.id, row.id));
    row = { ...row, lapsedAt: now };
  }
  const graceEnds = new Date(row.lapsedAt!.getTime() + SITE_LAPSE_GRACE_DAYS * DAY);
  return { row, lapse: { since: row.lapsedAt!.toISOString(), graceEndsAt: graceEnds.toISOString(), domainRouted: now.getTime() < graceEnds.getTime() } };
}

async function refreshPendingDomain(ctx: AppContext, m: Merchant, d: DomainRow | null): Promise<DomainRow | null> {
  if (!d || d.status !== "pending" || !d.registrarRef || !domainsAuto(ctx)) return d;
  const state = await domainsFor(ctx).hostnameState(d.registrarRef).catch(() => null);
  if (state === "live") return markDomain(ctx, m.id, d, "live");
  if (state === "failed") return markDomain(ctx, m.id, d, "failed");
  return d;
}

async function markDomain(ctx: AppContext, merchantId: string, d: DomainRow, status: "requested" | "pending" | "live" | "failed", extra: Partial<DomainRow> = {}): Promise<DomainRow> {
  const liveAt = status === "live" ? (d.liveAt ?? ctx.now()) : null;
  const [row] = await ctx.db.update(siteDomains).set({ status, liveAt, ...extra }).where(eq(siteDomains.id, d.id)).returning();
  await ctx.db.update(sites).set({ domain: status === "live" ? d.hostname : null, domainStatus: status, updatedAt: ctx.now() }).where(eq(sites.merchantId, merchantId));
  return row!;
}

export async function builder(ctx: AppContext, m: Merchant): Promise<siteApi.SiteBuilderResponse> {
  let row = await siteRow(ctx, m);
  const ent = await entitlementOf(ctx, m);
  const lapse = await syncLapse(ctx, row, ent.entitled);
  row = lapse.row;
  const facts = await factsOf(ctx, m);
  const draft = contentOf(row.content, row.preset as SitePreset, facts);
  const published = row.publishedContent ? contentOf(row.publishedContent, row.preset as SitePreset, facts) : null;
  const domain = await refreshPendingDomain(ctx, m, await domainRow(ctx, m.id));
  const win = allowanceWindow(ctx.now(), ent.sub?.currentPeriodEnd ?? null);
  return {
    site: {
      status: row.status as siteApi.SiteStatus,
      draft,
      published,
      unpublishedChanges: !published || JSON.stringify(published) !== JSON.stringify(draft),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      domain: domainDto(domain),
      path: `/s/${m.slug}`,
    },
    entitlement: { entitled: ent.entitled, reason: ent.reason, lapsed: lapse.lapse },
    usage: usageOf(row, win),
    aiAvailable: !!siteAiFor(ctx),
    domainsAuto: domainsAuto(ctx),
  };
}

async function writeDraft(ctx: AppContext, row: SiteRow, content: SiteContent) {
  await ctx.db.update(sites).set({ preset: content.preset, content, updatedAt: ctx.now() }).where(eq(sites.id, row.id));
}

export async function save(ctx: AppContext, m: Merchant, body: siteApi.SaveSiteBody): Promise<siteApi.SiteBuilderResponse> {
  const row = await siteRow(ctx, m);
  const facts = await factsOf(ctx, m);
  const cur = contentOf(row.content, row.preset as SitePreset, facts);
  const preset = body.preset ?? cur.preset;
  // Switching preset keeps every line the owner has (the copy shape is shared) and takes the new preset's section order.
  const switched = preset !== cur.preset;
  const next: SiteContent = {
    preset,
    order: normalizeOrder(preset, switched && !body.order ? null : (body.order ?? cur.order)),
    hidden: normalizeHidden(preset, switched && !body.hidden ? [] : (body.hidden ?? cur.hidden)),
    copy: body.copy ? normalizeCopy(body.copy, cur.copy) : cur.copy,
  };
  await writeDraft(ctx, row, next);
  return builder(ctx, m);
}

export async function reset(ctx: AppContext, m: Merchant, preset?: SitePreset): Promise<siteApi.SiteBuilderResponse> {
  const row = await siteRow(ctx, m);
  await writeDraft(ctx, row, defaultContent(preset ?? (row.preset as SitePreset), await factsOf(ctx, m)));
  return builder(ctx, m);
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------
function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

async function draftFacts(ctx: AppContext, m: Merchant, preset: SitePreset, brief: string | null): Promise<DraftFacts> {
  const facts = await factsOf(ctx, m);
  const loc = await primaryLocation(ctx, m.id);
  const svc = await ctx.db.select().from(services).where(and(eq(services.merchantId, m.id), eq(services.active, true))).orderBy(services.sort, services.name).limit(40);
  const shop = await publicShop(ctx, m.slug).catch(() => null);
  const program = shop?.program ?? null;
  const reviews = await reviewSummary(ctx, m.id);
  const hours = loc?.hours ? Object.entries(loc.hours).map(([d, spans]) => `${d} ${spans.map(([a, b]) => `${a}-${b}`).join(", ") || "closed"}`) : [];
  const loyalty = program
    ? program.earnType === "stamps"
      ? `A ${program.terminology} card: one per visit, ${program.stampGoal} earn a reward.`
      : program.earnType === "per_visit"
        ? `${program.pointsPerVisit} ${program.terminology} per visit.`
        : `${program.pointsPerDollar} ${program.terminology} per dollar spent.`
    : null;
  return {
    preset,
    name: m.name,
    trade: facts.tradeLabel,
    area: facts.areaLabel,
    city: facts.city,
    description: m.description,
    books: facts.books,
    services: svc.map((s) => ({ name: s.name, price: `${s.priceFrom ? "from " : ""}${money(s.priceCents)}`, durationMin: s.durationMin })),
    hours,
    loyalty,
    rewards: (shop?.rewards ?? []).map((r) => r.name),
    promos: (shop?.promos ?? []).map((p) => p.title),
    reviews,
    brief,
  };
}

export async function draftWithAi(ctx: AppContext, m: Merchant, body: siteApi.DraftSiteBody): Promise<siteApi.SiteDraftResponse> {
  const row = await siteRow(ctx, m);
  const facts = await factsOf(ctx, m);
  const preset = body.preset ?? (row.preset as SitePreset);
  const fallback = async (message: string): Promise<siteApi.SiteDraftResponse> => {
    await writeDraft(ctx, row, defaultContent(preset, facts));
    return { ...(await builder(ctx, m)), outcome: "fallback", message };
  };
  const client = siteAiFor(ctx);
  if (!client) return fallback(NO_AI_MESSAGE);
  const ent = await entitlementOf(ctx, m);
  const win = allowanceWindow(ctx.now(), ent.sub?.currentPeriodEnd ?? null);
  if (!(await reserve(ctx, row, "draft", win))) {
    throw new HttpError(429, "site_ai_cap", `You've used all ${SITE_AI_GENERATIONS_PER_MONTH} drafts this month. You can still edit every line yourself.`, { kind: "draft", limit: SITE_AI_GENERATIONS_PER_MONTH, resetsAt: win.end.toISOString() });
  }
  const res = await runLogged(ctx, m.id, client, {
    kind: "draft",
    system: DRAFT_SYSTEM,
    user: draftUserMessage(await draftFacts(ctx, m, preset, body.brief ?? null)),
    schema: draftSchema,
    maxTokens: DRAFT_MAX_TOKENS,
  });
  if (res.outcome === "error" && res.usage.input === 0) await refund(ctx, row, "draft");
  const parsed = res.outcome === "ok" ? siteDraftOutput.safeParse(res.json) : null;
  if (!parsed?.success) return fallback(FALLBACK_MESSAGE);
  const content: SiteContent = { preset, order: normalizeOrder(preset, parsed.data.order), hidden: [], copy: normalizeCopy(parsed.data.copy, defaultCopy(preset, facts)) };
  await writeDraft(ctx, row, content);
  return { ...(await builder(ctx, m)), outcome: "ai", message: null };
}

export async function rewriteLine(ctx: AppContext, m: Merchant, body: siteApi.RewriteBody): Promise<siteApi.SiteRewriteResponse> {
  const row = await siteRow(ctx, m);
  const facts = await factsOf(ctx, m);
  const cur = contentOf(row.content, row.preset as SitePreset, facts);
  const current = getCopyField(cur.copy, body.field);
  const ent = await entitlementOf(ctx, m);
  const win = allowanceWindow(ctx.now(), ent.sub?.currentPeriodEnd ?? null);
  const client = siteAiFor(ctx);
  const usage = async () => usageOf((await ctx.db.select().from(sites).where(eq(sites.id, row.id)))[0]!, win);
  if (!client) return { field: body.field, text: current, outcome: "fallback", message: NO_AI_MESSAGE, usage: await usage() };
  if (!(await reserve(ctx, row, "rewrite", win))) {
    throw new HttpError(429, "site_ai_cap", `You've used all ${SITE_AI_EDITS_PER_MONTH} rewrites this month. You can still type over any line.`, { kind: "rewrite", limit: SITE_AI_EDITS_PER_MONTH, resetsAt: win.end.toISOString() });
  }
  const res = await runLogged(ctx, m.id, client, {
    kind: "rewrite",
    system: REWRITE_SYSTEM,
    user: rewriteUserMessage({ field: body.field, current, instruction: body.instruction ?? null, name: m.name, trade: facts.tradeLabel, area: facts.areaLabel }),
    schema: lineSchema,
    maxTokens: EDIT_MAX_TOKENS,
  });
  if (res.outcome === "error" && res.usage.input === 0) await refund(ctx, row, "rewrite");
  const parsed = res.outcome === "ok" ? siteLineOutput.safeParse(res.json) : null;
  if (!parsed?.success) return { field: body.field, text: current, outcome: "fallback", message: "We couldn't rewrite this line. It's as you left it.", usage: await usage() };
  const copy = setCopyField(cur.copy, body.field, parsed.data.text);
  await writeDraft(ctx, row, { ...cur, copy });
  return { field: body.field, text: getCopyField(copy, body.field), outcome: "ai", message: null, usage: await usage() };
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------
export async function publish(ctx: AppContext, m: Merchant): Promise<siteApi.SiteBuilderResponse> {
  const ent = await entitlementOf(ctx, m);
  if (!ent.entitled) throw annualRequired();
  const row = await siteRow(ctx, m);
  const content = contentOf(row.content, row.preset as SitePreset, await factsOf(ctx, m));
  await ctx.db.update(sites).set({ publishedContent: content, status: "published", publishedAt: ctx.now(), lapsedAt: null, updatedAt: ctx.now() }).where(eq(sites.id, row.id));
  return builder(ctx, m);
}

export async function unpublish(ctx: AppContext, m: Merchant): Promise<siteApi.SiteBuilderResponse> {
  const row = await siteRow(ctx, m);
  if (row.status === "published") await ctx.db.update(sites).set({ status: "unpublished", lapsedAt: null, updatedAt: ctx.now() }).where(eq(sites.id, row.id));
  return builder(ctx, m);
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------
export async function checkDomain(ctx: AppContext, m: Merchant, name: string): Promise<siteApi.DomainCheckResponse> {
  const hostname = normalizeHostname(name.includes(".") ? name : `${name}.ca`);
  if (!hostname) throw badRequest("That doesn't look like a web address. Try yourname.ca.");
  const auto = domainsAuto(ctx);
  const [taken] = await ctx.db.select({ id: siteDomains.id }).from(siteDomains).where(and(eq(siteDomains.hostname, hostname), ne(siteDomains.status, "removed"), ne(siteDomains.merchantId, m.id))).limit(1);
  const available = taken ? false : isCaDomain(hostname) && auto ? await domainsFor(ctx).available(hostname) : null;
  return { hostname, available, priceCents: isCaDomain(hostname) ? ctx.config.site.domainPriceCents : null, included: isCaDomain(hostname), auto };
}

export async function requestDomain(ctx: AppContext, m: Merchant, body: siteApi.DomainRequestBody): Promise<siteApi.SiteBuilderResponse> {
  const ent = await entitlementOf(ctx, m);
  if (!ent.entitled) throw annualRequired();
  const hostname = normalizeHostname(body.hostname);
  if (!hostname) throw badRequest("That doesn't look like a web address. Try yourname.ca.");
  if (body.mode === "register" && !isCaDomain(hostname)) throw badRequest("We can register .ca names. For another name you already have, choose \"I already have one\".");
  const [taken] = await ctx.db.select({ id: siteDomains.id, merchantId: siteDomains.merchantId }).from(siteDomains).where(and(eq(siteDomains.hostname, hostname), ne(siteDomains.status, "removed"))).limit(1);
  if (taken && taken.merchantId !== m.id) throw conflict("That address is already used by another site.");
  const cur = await domainRow(ctx, m.id);
  if (cur && cur.hostname !== hostname) await removeDomainRow(ctx, m.id, cur);
  if (cur && cur.hostname === hostname) return builder(ctx, m);
  const target = ctx.config.site.cnameTarget;
  const [d] = await ctx.db
    .insert(siteDomains)
    .values({
      merchantId: m.id,
      hostname,
      mode: body.mode,
      status: "requested",
      verification: { dns: dnsFor(hostname, target), provider: domainsFor(ctx).name },
      note: body.mode === "register" ? "We register this name for you and set it up. It usually takes a day or two." : "Add the records below where you bought the name. We'll take it from there.",
    })
    .returning();
  await ctx.db.update(sites).set({ domainStatus: "requested", updatedAt: ctx.now() }).where(eq(sites.merchantId, m.id));
  // Automatic path: an owner-held name is routed now; a new .ca waits for the purchase (admin) and is routed then.
  if (body.mode === "connect" && domainsAuto(ctx)) await routeHostname(ctx, m.id, d!);
  return builder(ctx, m);
}

async function routeHostname(ctx: AppContext, merchantId: string, d: DomainRow): Promise<DomainRow> {
  const r = await domainsFor(ctx).addHostname(d.hostname).catch(() => null);
  if (!r) return d;
  return markDomain(ctx, merchantId, d, r.state === "live" ? "live" : "pending", { registrarRef: r.ref, verification: { ...(d.verification ?? {}), dns: r.dns, provider: "cloudflare" } });
}

async function removeDomainRow(ctx: AppContext, merchantId: string, d: DomainRow) {
  if (d.registrarRef && domainsAuto(ctx)) await domainsFor(ctx).removeHostname(d.registrarRef).catch(() => {});
  await ctx.db.update(siteDomains).set({ status: "removed" }).where(eq(siteDomains.id, d.id));
  await ctx.db.update(sites).set({ domain: null, domainStatus: "none", updatedAt: ctx.now() }).where(eq(sites.merchantId, merchantId));
}

export async function removeDomain(ctx: AppContext, m: Merchant): Promise<siteApi.SiteBuilderResponse> {
  const d = await domainRow(ctx, m.id);
  if (d) await removeDomainRow(ctx, m.id, d);
  return builder(ctx, m);
}

/** Admin task list: domains waiting for a person (manual path), and the rest for reference. */
export async function adminDomains(ctx: AppContext): Promise<{ items: siteApi.AdminSiteDomainDto[] }> {
  const rows = await ctx.db
    .select({ d: siteDomains, name: merchants.name, slug: merchants.slug })
    .from(siteDomains)
    .innerJoin(merchants, eq(merchants.id, siteDomains.merchantId))
    .where(ne(siteDomains.status, "removed"))
    .orderBy(sql`case ${siteDomains.status} when 'requested' then 0 when 'pending' then 1 when 'failed' then 2 else 3 end`, desc(siteDomains.createdAt))
    .limit(200);
  return { items: rows.map((r) => ({ ...domainDto(r.d)!, id: r.d.id, merchantId: r.d.merchantId, merchantName: r.name, merchantSlug: r.slug, registrarRef: r.d.registrarRef })) };
}

export async function adminUpdateDomain(ctx: AppContext, id: string, body: siteApi.AdminDomainUpdateBody): Promise<siteApi.AdminSiteDomainDto> {
  const [d] = await ctx.db.select().from(siteDomains).where(and(eq(siteDomains.id, id), ne(siteDomains.status, "removed"))).limit(1);
  if (!d) throw notFound("Domain");
  let row = await markDomain(ctx, d.merchantId, d, body.status, { ...(body.registrarRef !== undefined ? { registrarRef: body.registrarRef } : {}), ...(body.note !== undefined ? { note: body.note } : {}) });
  // A purchase recorded as pending on the automatic path: add the hostname now.
  if (body.status === "pending" && domainsAuto(ctx) && row.mode === "register") row = await routeHostname(ctx, d.merchantId, row);
  const [m] = await ctx.db.select({ name: merchants.name, slug: merchants.slug }).from(merchants).where(eq(merchants.id, d.merchantId));
  return { ...domainDto(row)!, id: row.id, merchantId: row.merchantId, merchantName: m!.name, merchantSlug: m!.slug, registrarRef: row.registrarRef };
}

// ---------------------------------------------------------------------------
// Public page data
// ---------------------------------------------------------------------------
async function reviewSummary(ctx: AppContext, merchantId: string): Promise<{ count: number; average: number } | null> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int`, avg: sql<number>`coalesce(avg(${reviewRequests.rating}), 0)::float` })
    .from(reviewRequests)
    .where(and(eq(reviewRequests.merchantId, merchantId), isNotNull(reviewRequests.rating), gte(reviewRequests.rating, 1)));
  const n = Number(r?.n ?? 0);
  return n >= 3 ? { count: n, average: Math.round(Number(r!.avg) * 10) / 10 } : null;
}

function messageLink(m: Merchant, phone: string | null): siteApi.PublicSiteResponse["message"] {
  const ig = m.instagram?.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").replace(/\/.*$/, "").trim();
  if (ig) return { kind: "instagram", href: `https://ig.me/m/${encodeURIComponent(ig)}` };
  if (m.whatsappNumber) return { kind: "whatsapp", href: `https://wa.me/${m.whatsappNumber.replace(/\D/g, "")}` };
  if (phone) return { kind: "sms", href: `sms:${phone.replace(/[^\d+]/g, "")}` };
  if (m.email) return { kind: "email", href: `mailto:${m.email}` };
  return null;
}

async function pageData(ctx: AppContext, m: Merchant, content: SiteContent, mode: "published" | "preview", row: SiteRow, lapseBannerUntil: string | null): Promise<siteApi.PublicSiteResponse> {
  const [shop, loc, books, reviews, svc] = await Promise.all([
    // Not joinable yet (still onboarding): the preview still renders, without the loyalty and promo data.
    publicShop(ctx, m.slug).catch(() => null),
    primaryLocation(ctx, m.id),
    isFeatureOn(ctx.db, m, "booking.appointments").catch(() => false),
    reviewSummary(ctx, m.id),
    ctx.db.select().from(services).where(and(eq(services.merchantId, m.id), eq(services.kind, "appointment"), eq(services.active, true))).orderBy(services.sort, services.name, services.id).limit(60),
  ]);
  const visibility = (loc?.addressVisibility ?? "exact") as "exact" | "area" | "city";
  const exact = visibility === "exact";
  const area = await areaOf(ctx, m, loc);
  const pin = exact ? (loc?.lat != null && loc?.lng != null ? { lat: loc.lat, lng: loc.lng } : null) : loc?.mapLat != null && loc?.mapLng != null ? { lat: loc.mapLat, lng: loc.mapLng } : null;
  const phone = m.phone ?? loc?.phone ?? null;
  return {
    slug: m.slug,
    content,
    mode,
    lapseBannerUntil,
    canonicalHost: row.domain && row.domainStatus === "live" ? row.domain : null,
    shop: {
      id: m.id,
      name: m.name,
      slug: m.slug,
      vertical: m.vertical,
      logoUrl: m.logoUrl,
      coverUrl: m.coverUrl,
      brandColor: m.brandColor,
      description: m.description,
      phone,
      instagram: m.instagram,
      timezone: m.timezone,
      themeStyle: m.themeStyle === "warm" ? "warm" : "clear",
    },
    location: loc
      ? {
          visibility,
          areaLabel: area,
          city: loc.city,
          // The address rule: only a storefront ("exact") shows its street address before a booking.
          address: exact ? loc.address : null,
          postalCode: exact ? loc.postalCode : null,
          pin,
          hours: loc.hours ?? null,
        }
      : null,
    booking: { enabled: books },
    services: books ? svc.map((s) => ({ id: s.id, name: s.name, description: s.description, durationMin: s.durationMin, priceCents: s.priceCents, priceFrom: s.priceFrom, categoryName: null })) : [],
    loyalty: shop?.program ? { program: shop.program, rewards: shop.rewards.slice(0, 6) } : null,
    promos: (shop?.promos ?? []).slice(0, 6),
    reviews,
    message: messageLink(m, phone),
  };
}

async function merchantById(ctx: AppContext, id: string): Promise<Merchant> {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  if (!m || m.status === "closed") throw notFound("Site");
  return m;
}

export async function publicBySlug(ctx: AppContext, slug: string): Promise<siteApi.PublicSiteResponse> {
  const [hit] = await ctx.db.select({ s: sites, m: merchants }).from(sites).innerJoin(merchants, eq(merchants.id, sites.merchantId)).where(eq(merchants.slug, slug)).limit(1);
  if (!hit || hit.s.status !== "published" || !hit.s.publishedContent || hit.m.status === "closed") throw notFound("Site");
  const ent = await entitlementOf(ctx, hit.m);
  const { row, lapse } = await syncLapse(ctx, hit.s, ent.entitled);
  const facts = await factsOf(ctx, hit.m);
  return pageData(ctx, hit.m, contentOf(row.publishedContent, row.preset as SitePreset, facts), "published", row, lapse?.domainRouted ? lapse.graceEndsAt : null);
}

export async function publicByHost(ctx: AppContext, rawHost: string): Promise<siteApi.PublicSiteResponse> {
  const host = normalizeHostname(rawHost.split(":")[0] ?? "");
  if (!host) throw notFound("Site");
  const [hit] = await ctx.db
    .select({ s: sites, m: merchants })
    .from(sites)
    .innerJoin(merchants, eq(merchants.id, sites.merchantId))
    .where(and(eq(sites.domain, host), eq(sites.domainStatus, "live"), eq(sites.status, "published")))
    .limit(1);
  if (!hit || !hit.s.publishedContent || hit.m.status === "closed") throw notFound("Site");
  const ent = await entitlementOf(ctx, hit.m);
  const { row, lapse } = await syncLapse(ctx, hit.s, ent.entitled);
  // After the grace period the custom domain stops routing; the /s/<slug> page stays.
  if (lapse && !lapse.domainRouted) throw notFound("Site");
  const facts = await factsOf(ctx, hit.m);
  return pageData(ctx, hit.m, contentOf(row.publishedContent, row.preset as SitePreset, facts), "published", row, lapse ? lapse.graceEndsAt : null);
}

/** The owner's live preview: the draft words over the live shop data. */
export async function preview(ctx: AppContext, m: Merchant): Promise<siteApi.PublicSiteResponse> {
  const row = await siteRow(ctx, m);
  const facts = await factsOf(ctx, m);
  return pageData(ctx, await merchantById(ctx, m.id), contentOf(row.content, row.preset as SitePreset, facts), "preview", row, null);
}

/** Housekeeping for tests and ops: AI calls in a window (the cost check). */
export async function aiCallsSince(ctx: AppContext, merchantId: string, since: Date) {
  const { siteAiCalls } = await import("@ll/db");
  return ctx.db.select().from(siteAiCalls).where(and(eq(siteAiCalls.merchantId, merchantId), gte(siteAiCalls.createdAt, since), lt(siteAiCalls.createdAt, new Date(ctx.now().getTime() + DAY))));
}
