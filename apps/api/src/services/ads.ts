/**
 * Network advertising (Phase 3): merchant self-serve ad campaigns, admin
 * review, tracking (impressions/clicks), reporting and lifecycle jobs.
 *
 * Serving lives in ./sponsored.ts, visit attribution in ./attribution.ts.
 * Spec: docs/business/network-monetization.md
 */
import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { adCampaigns, adEvents, auditLogs, locations, merchants, neighbourhoods, promos, type DbOrTx } from "@ll/db";
import { adsApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { getPayments } from "../providers/payments.js";
import { getMerchantFeatures, requireFeature } from "./features.js";

const { AD_PLACEMENT_FEATURE, AD_RATE_CARD, AD_RULES } = adsApi;

type CreateBody = z.output<typeof adsApi.createAdCampaignBody>;
export type AdCampaignRow = typeof adCampaigns.$inferSelect;
type Merchant = typeof merchants.$inferSelect;

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
export function toAdCampaign(r: AdCampaignRow, extra: { paymentClientSecret?: string | null } = {}): adsApi.AdCampaign {
  return {
    id: r.id,
    merchantId: r.merchantId,
    placement: r.placement,
    status: r.status,
    promoId: r.promoId,
    headline: r.headline,
    body: r.body,
    imageUrl: r.imageUrl,
    neighbourhoodIds: r.neighbourhoodIds,
    radiusMetres: r.radiusMetres,
    pricingModel: r.pricingModel as adsApi.AdPricingModel,
    rateCents: r.rateCents,
    budgetCents: r.budgetCents,
    spentCents: r.spentCents,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    impressions: r.impressions,
    clicks: r.clicks,
    attributedVisits: r.attributedVisits,
    paymentStatus: r.paymentStatus as adsApi.AdPaymentStatus,
    ...(extra.paymentClientSecret !== undefined ? { paymentClientSecret: extra.paymentClientSecret } : {}),
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    endedReason: (r.endedReason as adsApi.AdCampaign["endedReason"]) ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Number of (started) flight days, rounded up. */
export function flightDays(startsAt: Date, endsAt: Date): number {
  return Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / DAY_MS));
}

/** CPM spend for a number of billable impressions (whole cents, rounded down, capped at budget). */
export function cpmSpend(impressions: number, rateCents: number, budgetCents: number): number {
  return Math.min(budgetCents, Math.floor((impressions * rateCents) / 1000));
}

/**
 * Even pacing: the spend a campaign is allowed to have reached by `now`
 * (budget × elapsed share of the flight, plus one hour of look-ahead so a fresh
 * campaign can serve immediately).
 */
export function pacedSpendLimit(ad: Pick<AdCampaignRow, "startsAt" | "endsAt" | "budgetCents">, now: Date): number {
  const total = ad.endsAt.getTime() - ad.startsAt.getTime();
  if (total <= 0) return ad.budgetCents;
  const share = Math.min(1, Math.max(0, (now.getTime() - ad.startsAt.getTime() + HOUR_MS) / total));
  return Math.ceil(ad.budgetCents * share);
}

/** Can this campaign serve right now (status, window, budget)? Frequency cap and targeting are checked separately. */
export function isServing(ad: AdCampaignRow, now: Date): boolean {
  if (ad.status !== "active" || now < ad.startsAt || now >= ad.endsAt) return false;
  // Daily-rate campaigns have bought the whole day; CPM campaigns stop at budget.
  return ad.pricingModel === "daily" || ad.spentCents < ad.budgetCents;
}

async function audit(db: DbOrTx, actorUserId: string | null, merchantId: string, action: string, entityId: string, data?: unknown) {
  await db.insert(auditLogs).values({ actorUserId, merchantId, action, entity: "ad_campaign", entityId, data: data ?? null });
}

// ---------------------------------------------------------------------------
// Merchant self-serve
// ---------------------------------------------------------------------------
/** Is any ads feature on for this merchant (used to gate the ads dashboard itself)? */
export async function requireAnyAdsFeature(db: DbOrTx, merchant: Merchant): Promise<void> {
  const features = await getMerchantFeatures(db, merchant);
  if (features["ads.sponsored_listing"].enabled || features["ads.sponsored_promo"].enabled || features["ads.map_pin"].enabled) return;
  // Throws the standard 402 feature_locked error.
  await requireFeature(db, merchant, "ads.sponsored_listing");
}

export async function createAdCampaign(ctx: AppContext, merchant: Merchant, body: CreateBody, actorUserId: string) {
  const db = ctx.db;
  await requireFeature(db, merchant, AD_PLACEMENT_FEATURE[body.placement]);
  if (merchant.status !== "active") throw conflict("Only active shops can advertise");
  const now = ctx.now();
  if (body.startsAt.getTime() < now.getTime() - HOUR_MS) throw badRequest("startsAt can't be in the past");
  const days = flightDays(body.startsAt, body.endsAt);
  if (days > AD_RULES.maxFlightDays) throw badRequest(`Campaigns run at most ${AD_RULES.maxFlightDays} days`);

  let headline = body.headline ?? null;
  let adBody = body.body ?? null;
  let imageUrl = body.imageUrl ?? null;
  if (body.promoId) {
    const [promo] = await db.select().from(promos).where(and(eq(promos.id, body.promoId), eq(promos.merchantId, merchant.id))).limit(1);
    if (!promo) throw notFound("Promo");
    if (promo.status === "archived" || promo.status === "ended" || (promo.endsAt && promo.endsAt <= now)) throw conflict("That promo has ended");
    if (promo.audience !== "network") throw conflict("Only network-wide promos can be boosted");
    headline ??= promo.title;
    adBody ??= promo.body;
    imageUrl ??= promo.imageUrl;
  }

  const hoodIds = [...new Set(body.neighbourhoodIds)];
  if (hoodIds.length) {
    const found = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(inArray(neighbourhoods.id, hoodIds));
    if (found.length !== hoodIds.length) throw badRequest("Unknown neighbourhood");
  }
  if (body.radiusMetres) {
    const [loc] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.merchantId, merchant.id), eq(locations.active, true), sql`${locations.lat} is not null and ${locations.lng} is not null`))
      .limit(1);
    if (!loc) throw badRequest("Radius targeting needs a location with a map position");
  }

  const card = AD_RATE_CARD[body.placement];
  let rateCents: number;
  let budgetCents: number;
  if (body.pricingModel === "daily") {
    if (card.dailyCents === null) throw badRequest(`${body.placement} is sold by CPM only`);
    rateCents = card.dailyCents;
    budgetCents = rateCents * days;
  } else {
    rateCents = card.cpmCents;
    budgetCents = body.budgetCents!;
  }

  const [row] = await db
    .insert(adCampaigns)
    .values({
      merchantId: merchant.id,
      placement: body.placement,
      promoId: body.promoId ?? null,
      neighbourhoodIds: hoodIds,
      radiusMetres: body.radiusMetres ?? null,
      headline: headline!,
      body: adBody,
      imageUrl,
      pricingModel: body.pricingModel,
      rateCents,
      budgetCents,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      status: "pending_review",
      // Ad spend is paid by the merchant to the platform. The payments provider
      // only offers destination charges to a merchant's own Connect account, so
      // ad spend is collected by invoice and confirmed by an admin
      // (POST /v1/admin/ads/:id/mark-paid) until a platform-charge method exists.
      paymentStatus: "pending",
    })
    .returning();
  await audit(db, actorUserId, merchant.id, "ad.create", row!.id, { placement: row!.placement, budgetCents });
  return row!;
}

export async function getMerchantAd(db: DbOrTx, merchantId: string, adId: string): Promise<AdCampaignRow> {
  const [row] = await db.select().from(adCampaigns).where(and(eq(adCampaigns.id, adId), eq(adCampaigns.merchantId, merchantId))).limit(1);
  if (!row) throw notFound("Ad campaign");
  return row;
}

export async function listMerchantAds(db: DbOrTx, merchantId: string, q: { status?: adsApi.AdStatus; limit: number; cursor?: string }) {
  const conds = [eq(adCampaigns.merchantId, merchantId)];
  if (q.status) conds.push(eq(adCampaigns.status, q.status));
  if (q.cursor) conds.push(lt(adCampaigns.createdAt, new Date(q.cursor)));
  const rows = await db.select().from(adCampaigns).where(and(...conds)).orderBy(desc(adCampaigns.createdAt)).limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { items: page.map((r) => toAdCampaign(r)), nextCursor: rows.length > q.limit ? page[page.length - 1]!.createdAt.toISOString() : null };
}

export async function setMerchantAdState(ctx: AppContext, merchantId: string, adId: string, action: "pause" | "resume" | "cancel", actorUserId: string) {
  return ctx.db.transaction(async (tx) => {
    const [ad] = await tx.select().from(adCampaigns).where(and(eq(adCampaigns.id, adId), eq(adCampaigns.merchantId, merchantId))).for("update").limit(1);
    if (!ad) throw notFound("Ad campaign");
    let patch: Partial<AdCampaignRow>;
    if (action === "pause") {
      if (ad.status !== "active") throw conflict("Only active campaigns can be paused");
      patch = { status: "paused" };
    } else if (action === "resume") {
      if (ad.status !== "paused") throw conflict("Only paused campaigns can be resumed");
      if (ad.endsAt <= ctx.now()) throw conflict("This campaign's flight has ended");
      patch = { status: "active" };
    } else {
      if (ad.status === "ended" || ad.status === "rejected") throw conflict("This campaign is already closed");
      patch = { status: "ended", endedReason: "cancelled" };
    }
    const [row] = await tx.update(adCampaigns).set(patch).where(eq(adCampaigns.id, ad.id)).returning();
    await audit(tx, actorUserId, merchantId, `ad.${action}`, ad.id);
    return row!;
  });
}

// ---------------------------------------------------------------------------
// Admin review
// ---------------------------------------------------------------------------
export async function listAdsForAdmin(db: DbOrTx, q: { status: adsApi.AdStatus; limit: number; cursor?: string }) {
  const conds = [eq(adCampaigns.status, q.status)];
  if (q.cursor) conds.push(gte(adCampaigns.createdAt, new Date(q.cursor)));
  // Oldest first: a review queue is FIFO.
  const rows = await db
    .select({ ad: adCampaigns, m: { id: merchants.id, name: merchants.name, slug: merchants.slug } })
    .from(adCampaigns)
    .innerJoin(merchants, eq(merchants.id, adCampaigns.merchantId))
    .where(and(...conds))
    .orderBy(adCampaigns.createdAt, adCampaigns.id)
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const items: adsApi.AdminAdCampaign[] = page.map((r) => ({ ...toAdCampaign(r.ad), merchant: r.m }));
  // Cursor is the createdAt of the next row (inclusive lower bound).
  return { items, nextCursor: rows.length > q.limit ? rows[q.limit]!.ad.createdAt.toISOString() : null };
}

export async function reviewAd(ctx: AppContext, adId: string, decision: { approve: true; note?: string } | { approve: false; reason: string }, adminUserId: string) {
  const refund = await ctx.db.transaction(async (tx) => {
    const [ad] = await tx.select().from(adCampaigns).where(eq(adCampaigns.id, adId)).for("update").limit(1);
    if (!ad) throw notFound("Ad campaign");
    if (ad.status !== "pending_review") throw conflict("This campaign isn't waiting for review");
    const now = ctx.now();
    if (decision.approve && ad.endsAt <= now) throw conflict("This campaign's flight has already ended");
    const [row] = await tx
      .update(adCampaigns)
      .set(
        decision.approve
          ? { status: "active", reviewNote: decision.note ?? null, reviewedAt: now, reviewedBy: adminUserId }
          : { status: "rejected", reviewNote: decision.reason, reviewedAt: now, reviewedBy: adminUserId },
      )
      .where(eq(adCampaigns.id, ad.id))
      .returning();
    await audit(tx, adminUserId, ad.merchantId, decision.approve ? "ad.approve" : "ad.reject", ad.id, decision);
    return { row: row!, needsRefund: !decision.approve && ad.paymentStatus === "paid" && !!ad.stripePaymentIntentId };
  });
  if (refund.needsRefund) {
    // Rejected after payment: refund in full (outside the DB transaction; idempotent by key).
    await getPayments(ctx).refund({ paymentIntentId: refund.row.stripePaymentIntentId!, idempotencyKey: `ad-reject:${refund.row.id}`, reason: "requested_by_customer" });
    const [row] = await ctx.db.update(adCampaigns).set({ paymentStatus: "refunded" }).where(eq(adCampaigns.id, adId)).returning();
    return row!;
  }
  return refund.row;
}

export async function markAdPaid(ctx: AppContext, adId: string, paymentStatus: "paid" | "invoiced", adminUserId: string) {
  const [ad] = await ctx.db.select().from(adCampaigns).where(eq(adCampaigns.id, adId)).limit(1);
  if (!ad) throw notFound("Ad campaign");
  if (ad.paymentStatus === "refunded") throw conflict("This campaign was refunded");
  const [row] = await ctx.db
    .update(adCampaigns)
    .set({ paymentStatus, paidAt: paymentStatus === "paid" ? ctx.now() : ad.paidAt })
    .where(eq(adCampaigns.id, adId))
    .returning();
  await audit(ctx.db, adminUserId, ad.merchantId, "ad.mark_paid", ad.id, { paymentStatus });
  return row!;
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------
async function countUserEvents(db: DbOrTx, adId: string, userId: string, kind: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adEvents)
    .where(and(eq(adEvents.adCampaignId, adId), eq(adEvents.userId, userId), eq(adEvents.kind, kind), gte(adEvents.createdAt, since)));
  return Number(r?.n ?? 0);
}

/**
 * Record an impression. Not counted (and not billed) when the campaign isn't
 * serving or the user is over the frequency cap. CPM campaigns accrue spend
 * per impression and end the moment the budget is exhausted.
 */
export async function trackImpression(ctx: AppContext, adId: string, userId: string): Promise<{ counted: boolean }> {
  return ctx.db.transaction(async (tx) => {
    const now = ctx.now();
    const [ad] = await tx.select().from(adCampaigns).where(eq(adCampaigns.id, adId)).for("update").limit(1);
    if (!ad) throw notFound("Ad campaign");
    if (!isServing(ad, now)) return { counted: false };
    const seen = await countUserEvents(tx, ad.id, userId, "impression", new Date(now.getTime() - DAY_MS));
    if (seen >= AD_RULES.frequencyCapPerDay) return { counted: false };
    await tx.insert(adEvents).values({ adCampaignId: ad.id, userId, kind: "impression", createdAt: now });
    const impressions = ad.impressions + 1;
    const patch: Partial<AdCampaignRow> = { impressions };
    if (ad.pricingModel === "cpm") {
      patch.spentCents = cpmSpend(impressions, ad.rateCents, ad.budgetCents);
      if (patch.spentCents >= ad.budgetCents) Object.assign(patch, { status: "ended", endedReason: "budget_exhausted" });
    }
    await tx.update(adCampaigns).set(patch).where(eq(adCampaigns.id, ad.id));
    return { counted: true };
  });
}

/** Record a click; at most one counted click per user per campaign per 24 hours. */
export async function trackClick(ctx: AppContext, adId: string, userId: string): Promise<{ counted: boolean }> {
  return ctx.db.transaction(async (tx) => {
    const now = ctx.now();
    const [ad] = await tx.select().from(adCampaigns).where(eq(adCampaigns.id, adId)).for("update").limit(1);
    if (!ad) throw notFound("Ad campaign");
    // Accept clicks on a campaign that just ran out of budget (the user saw it while it was live).
    const recentlyLive = ad.status === "active" || (ad.status === "ended" && ad.endedReason === "budget_exhausted");
    if (!recentlyLive || now < ad.startsAt || now >= ad.endsAt) return { counted: false };
    const already = await countUserEvents(tx, ad.id, userId, "click", new Date(now.getTime() - DAY_MS));
    if (already > 0) return { counted: false };
    await tx.insert(adEvents).values({ adCampaignId: ad.id, userId, kind: "click", createdAt: now });
    await tx.update(adCampaigns).set({ clicks: sql`${adCampaigns.clicks} + 1` }).where(eq(adCampaigns.id, ad.id));
    return { counted: true };
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
export async function adReport(db: DbOrTx, ad: AdCampaignRow, timeZone = "America/Toronto"): Promise<adsApi.AdReport> {
  const day = sql<string>`to_char(${adEvents.createdAt} at time zone ${timeZone}, 'YYYY-MM-DD')`;
  const [daily, reach] = await Promise.all([
    db
      .select({
        date: day,
        impressions: sql<number>`count(*) filter (where ${adEvents.kind} = 'impression')::int`,
        clicks: sql<number>`count(*) filter (where ${adEvents.kind} = 'click')::int`,
        visits: sql<number>`count(*) filter (where ${adEvents.kind} = 'visit')::int`,
      })
      .from(adEvents)
      .where(eq(adEvents.adCampaignId, ad.id))
      // Positional: the time zone is a bind parameter, so the expression can't be repeated.
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ n: sql<number>`count(distinct ${adEvents.userId})::int` })
      .from(adEvents)
      .where(and(eq(adEvents.adCampaignId, ad.id), eq(adEvents.kind, "impression"))),
  ]);
  return {
    campaignId: ad.id,
    impressions: ad.impressions,
    clicks: ad.clicks,
    ctr: ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 10000) / 10000 : 0,
    attributedVisits: ad.attributedVisits,
    spentCents: ad.spentCents,
    budgetCents: ad.budgetCents,
    costPerVisitCents: ad.attributedVisits > 0 ? Math.round(ad.spentCents / ad.attributedVisits) : null,
    uniqueUsersReached: Number(reach[0]?.n ?? 0),
    daily: daily.map((d) => ({ date: d.date, impressions: Number(d.impressions), clicks: Number(d.clicks), visits: Number(d.visits) })),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle (jobs)
// ---------------------------------------------------------------------------
/**
 * One pass of the ads lifecycle:
 *  1. Daily-rate campaigns accrue `rate` per flight day begun while active
 *     (days that begin while paused are skipped, not billed).
 *  2. Campaigns past endsAt end as "completed"; campaigns whose spend reached
 *     the budget end as "budget_exhausted".
 * Idempotent: running it twice in a row changes nothing the second time.
 */
export async function runAdsLifecycle(ctx: AppContext): Promise<{ accrued: number; ended: number }> {
  const now = ctx.now();
  let accrued = 0;
  let ended = 0;
  const open = await ctx.db
    .select()
    .from(adCampaigns)
    .where(and(inArray(adCampaigns.status, ["active", "paused"]), lte(adCampaigns.startsAt, now)));
  for (const candidate of open) {
    await ctx.db.transaction(async (tx) => {
      const [ad] = await tx.select().from(adCampaigns).where(eq(adCampaigns.id, candidate.id)).for("update").limit(1);
      if (!ad || (ad.status !== "active" && ad.status !== "paused")) return;
      const patch: Partial<AdCampaignRow> = {};
      let spent = ad.spentCents;
      if (ad.pricingModel === "daily") {
        const effectiveNow = now < ad.endsAt ? now : new Date(ad.endsAt.getTime() - 1);
        const begun = Math.min(flightDays(ad.startsAt, ad.endsAt), Math.floor((effectiveNow.getTime() - ad.startsAt.getTime()) / DAY_MS) + 1);
        if (begun > ad.accruedDays) {
          if (ad.status === "active") {
            spent = Math.min(ad.budgetCents, spent + ad.rateCents * (begun - ad.accruedDays));
            patch.spentCents = spent;
            accrued++;
          }
          patch.accruedDays = begun;
        }
      }
      if (now >= ad.endsAt) Object.assign(patch, { status: "ended", endedReason: "completed" });
      else if (ad.pricingModel !== "daily" && spent >= ad.budgetCents) Object.assign(patch, { status: "ended", endedReason: "budget_exhausted" });
      if (patch.status === "ended") ended++;
      if (Object.keys(patch).length) await tx.update(adCampaigns).set(patch).where(eq(adCampaigns.id, ad.id));
    });
  }
  return { accrued, ended };
}
