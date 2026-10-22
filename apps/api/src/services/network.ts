/**
 * Public network: neighbourhoods, the shop map/list, the promo feed, public
 * merchant pages and the counter-QR join flow. All reads are public; when a
 * customer is signed in, results are personalised (balances, members-only
 * promos, muted shops hidden).
 *
 * Visibility
 *  - Network map/list/feed: merchants with status "active" whose
 *    network.listing feature isn't switched off by an admin override.
 *  - Public shop page and QR join: "onboarding" or "active" (a shop seeds its
 *    first members while onboarding).
 */
import { and, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  campaigns,
  discountCards,
  featureOverrides,
  locations,
  loyaltyPrograms,
  merchantMembers,
  merchants,
  neighbourhoods,
  networkPerks,
  promos,
  rewards,
  type DbOrTx,
} from "@ll/db";
import { FEATURE_KEYS, FEATURES, PLAN_IDS, PLANS, distanceMetres, isPlanAvailable, networkApi as networkContract, type adsApi, type networkApi } from "@ll/shared";
import { customerApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { startPhoneOtp } from "./auth.js";
import { JOINABLE_STATUSES, notMerged } from "./customer.js";
import { customerFeaturesFor, getRolloutStages } from "./features.js";
import { promoAppliesAt } from "./ledger.js";
import { cardsForMember, locationDto, merchantBrief, programSummary, promoDto, rewardDto, terminologyOf } from "./serializers.js";
import { injectSponsored as injectSponsoredItems } from "./sponsored.js";

type Merchant = typeof merchants.$inferSelect;
type Location = typeof locations.$inferSelect;
type Promo = typeof promos.$inferSelect;
type Point = { lat: number; lng: number };

// Correlated subqueries reference the outer table by its qualified name: drizzle omits the
// qualifier on single-table selects, which would bind the column to the inner table.
const listingNotDisabled = sql`not exists (select 1 from ${featureOverrides} fo where fo.merchant_id = "merchants"."id" and fo.key = 'network.listing' and fo.enabled = false)`;

function offsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number(cursor);
  if (!Number.isInteger(n) || n < 0) throw badRequest("Invalid cursor");
  return n;
}

function page<T>(all: T[], cursor: string | undefined, limit: number): { items: T[]; nextCursor: string | null } {
  const start = offsetCursor(cursor);
  const items = all.slice(start, start + limit);
  return { items, nextCursor: start + limit < all.length ? String(start + limit) : null };
}

/** Nearest location with coordinates (or the first active one). */
function nearest(locs: Location[], point: Point | null): { location: Location | null; distance: number | null } {
  if (!locs.length) return { location: null, distance: null };
  if (!point) return { location: locs[0]!, distance: null };
  let best: Location | null = null;
  let bestD = Infinity;
  for (const l of locs) {
    if (l.lat == null || l.lng == null) continue;
    const d = distanceMetres(point, { lat: l.lat, lng: l.lng });
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best ? { location: best, distance: Math.round(bestD) } : { location: locs[0]!, distance: null };
}

async function locationsByMerchant(db: DbOrTx, merchantIds: string[]): Promise<Map<string, Location[]>> {
  const out = new Map<string, Location[]>();
  if (!merchantIds.length) return out;
  const rows = await db.select().from(locations).where(and(inArray(locations.merchantId, merchantIds), eq(locations.active, true))).orderBy(locations.createdAt);
  for (const l of rows) out.set(l.merchantId, [...(out.get(l.merchantId) ?? []), l]);
  return out;
}

/** Member counts per merchant (one grouped query), hidden (null) below MEMBER_COUNT_MIN. */
async function memberCountsFor(db: DbOrTx, merchantIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!merchantIds.length) return out;
  const rows = await db
    .select({ merchantId: merchantMembers.merchantId, n: sql<number>`count(*)::int` })
    .from(merchantMembers)
    .where(and(inArray(merchantMembers.merchantId, merchantIds), notMerged))
    .groupBy(merchantMembers.merchantId);
  for (const r of rows) {
    const n = Number(r.n);
    out.set(r.merchantId, n >= networkContract.MEMBER_COUNT_MIN ? n : null);
  }
  return out;
}

async function membershipsFor(db: DbOrTx, userId: string | null, merchantIds: string[]) {
  const out = new Map<string, { balance: number; muted: boolean; vip: boolean }>();
  if (!userId || !merchantIds.length) return out;
  const rows = await db
    .select({ merchantId: merchantMembers.merchantId, balance: merchantMembers.balance, muted: merchantMembers.muted, vip: merchantMembers.vipLevelId })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.userId, userId), inArray(merchantMembers.merchantId, merchantIds)));
  for (const r of rows) out.set(r.merchantId, { balance: r.balance, muted: r.muted, vip: !!r.vip });
  return out;
}

/** Candidate promos for these merchants: status live/scheduled and inside their date window. */
async function windowPromos(db: DbOrTx, merchantIds: string[], at: Date): Promise<Promo[]> {
  if (!merchantIds.length) return [];
  return db
    .select()
    .from(promos)
    .where(
      and(
        inArray(promos.merchantId, merchantIds),
        inArray(promos.status, ["live", "scheduled"]),
        lte(promos.startsAt, at),
        or(isNull(promos.endsAt), sql`${promos.endsAt} > ${at.toISOString()}::timestamptz`),
      ),
    )
    .orderBy(promos.startsAt);
}

async function hoodBySlug(db: DbOrTx, slug: string) {
  const [n] = await db.select().from(neighbourhoods).where(eq(neighbourhoods.slug, slug)).limit(1);
  if (!n) throw notFound("Neighbourhood");
  return n;
}

// ---------------------------------------------------------------------------
// Neighbourhoods
// ---------------------------------------------------------------------------
export const shopCountSql = sql<number>`(select count(*)::int from ${merchants} m where m.neighbourhood_id = "neighbourhoods"."id" and m.status = 'active'
  and not exists (select 1 from ${featureOverrides} fo where fo.merchant_id = m.id and fo.key = 'network.listing' and fo.enabled = false))`;

export function hoodDto(n: typeof neighbourhoods.$inferSelect, shopCount: number): networkApi.NeighbourhoodDto {
  return {
    id: n.id,
    slug: n.slug,
    name: n.name,
    city: n.city,
    province: n.province,
    status: n.status,
    centerLat: n.centerLat ?? null,
    centerLng: n.centerLng ?? null,
    radiusMetres: n.radiusMetres,
    biaName: n.biaName ?? null,
    shopCount: Number(shopCount),
  };
}

export async function listNeighbourhoods(ctx: AppContext): Promise<networkApi.NeighbourhoodsResponse> {
  const rows = await ctx.db
    .select({ n: neighbourhoods, shopCount: shopCountSql })
    .from(neighbourhoods)
    .where(inArray(neighbourhoods.status, ["pilot", "live"]))
    .orderBy(neighbourhoods.name);
  return { items: rows.map((r) => hoodDto(r.n, r.shopCount)) };
}

export async function getNeighbourhood(ctx: AppContext, slug: string): Promise<networkApi.NeighbourhoodDetailResponse> {
  const now = ctx.now();
  const [row] = await ctx.db
    .select({ n: neighbourhoods, shopCount: shopCountSql })
    .from(neighbourhoods)
    .where(and(eq(neighbourhoods.slug, slug), inArray(neighbourhoods.status, ["pilot", "live"])))
    .limit(1);
  if (!row) throw notFound("Neighbourhood");
  const [perks, live, shops] = await Promise.all([
    ctx.db
      .select()
      .from(networkPerks)
      .where(and(eq(networkPerks.active, true), or(eq(networkPerks.neighbourhoodId, row.n.id), isNull(networkPerks.neighbourhoodId)))),
    ctx.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.neighbourhoodId, row.n.id), eq(campaigns.status, "live"), lte(campaigns.startsAt, now), gte(campaigns.endsAt, now))),
    ctx.db
      .select({ id: merchants.id, timezone: merchants.timezone })
      .from(merchants)
      .where(and(eq(merchants.neighbourhoodId, row.n.id), eq(merchants.status, "active"), listingNotDisabled)),
  ]);
  const tz = new Map(shops.map((s) => [s.id, s.timezone]));
  const ps = (await windowPromos(ctx.db, shops.map((s) => s.id), now)).filter((p) => p.audience === "network" && promoAppliesAt(p, now, tz.get(p.merchantId)!));
  return {
    neighbourhood: hoodDto(row.n, row.shopCount),
    perks: perks.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      ruleType: p.ruleType,
      threshold: p.threshold,
      windowDays: p.windowDays,
      bonusPoints: p.bonusPoints,
    })),
    liveCampaigns: live.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      kind: c.kind,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      goalVisits: c.goalVisits,
      bonusPoints: c.bonusPoints,
      multiplierPct: c.multiplierPct ?? null,
      prize: c.prize ?? null,
    })),
    livePromoCount: ps.length,
  };
}

// ---------------------------------------------------------------------------
// Shops (map / list)
// ---------------------------------------------------------------------------
export async function listShops(ctx: AppContext, q: networkApi.ShopsQuery, userId: string | null): Promise<networkApi.ShopsResponse> {
  const now = ctx.now();
  const point = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
  if (q.radiusMetres && !point) throw badRequest("radiusMetres needs lat and lng");
  const hood = q.neighbourhood ? await hoodBySlug(ctx.db, q.neighbourhood) : null;
  const rows = await ctx.db
    .select({ m: merchants, program: loyaltyPrograms })
    .from(merchants)
    .leftJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, merchants.id))
    .where(
      and(
        eq(merchants.status, "active"),
        listingNotDisabled,
        hood ? eq(merchants.neighbourhoodId, hood.id) : undefined,
        q.vertical ? eq(merchants.vertical, q.vertical) : undefined,
        q.q ? or(ilike(merchants.name, `%${q.q}%`), ilike(merchants.description, `%${q.q}%`)) : undefined,
      ),
    );
  const ids = rows.map((r) => r.m.id);
  const [locs, ps, mine, counts] = await Promise.all([
    locationsByMerchant(ctx.db, ids),
    windowPromos(ctx.db, ids, now),
    membershipsFor(ctx.db, userId, ids),
    memberCountsFor(ctx.db, ids),
  ]);
  const promoBy = new Set(ps.filter((p) => p.audience === "network" && promoAppliesAt(p, now, rows.find((r) => r.m.id === p.merchantId)!.m.timezone)).map((p) => p.merchantId));
  let items: networkApi.ShopListItemDto[] = rows.map(({ m, program }) => {
    const ls = locs.get(m.id) ?? [];
    const { location, distance } = nearest(ls, point);
    const loc = location ? locationDto(location, m.timezone, now) : null;
    const membership = mine.get(m.id);
    return {
      merchant: { ...merchantBrief(m), description: m.description ?? null },
      location: loc,
      locationCount: ls.length,
      distanceMetres: distance,
      openNow: loc?.openNow ?? null,
      hasPromo: promoBy.has(m.id),
      terminology: terminologyOf(program),
      earnType: program?.earnType ?? null,
      myBalance: membership ? membership.balance : null,
      isMember: !!membership,
      memberCount: counts.get(m.id) ?? null,
    };
  });
  if (q.radiusMetres) items = items.filter((i) => i.distanceMetres !== null && i.distanceMetres <= q.radiusMetres!);
  items.sort((a, b) =>
    point ? (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity) || a.merchant.name.localeCompare(b.merchant.name) : a.merchant.name.localeCompare(b.merchant.name),
  );
  return page(items, q.cursor, q.limit);
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------
export interface SponsoredOpts {
  placement: adsApi.AdPlacement;
  lat?: number | null;
  lng?: number | null;
  neighbourhoodId?: string | null;
  userId?: string | null;
  /** Merchants the viewer muted: never advertise them to this viewer. */
  excludeMerchantIds?: string[];
}

/**
 * ===== EXTENSION POINT (owned by the ads team) =====
 * Sponsored-item injection for the network feed. Delegates to the ads team's
 * services/sponsored.ts → injectSponsored (same signature); sponsored entries carry
 * `sponsored: true` and respect `excludeMerchantIds` (muted shops).
 */
export async function injectSponsored<T>(items: T[], ctx: AppContext, opts: SponsoredOpts): Promise<(T | adsApi.SponsoredItem)[]> {
  return injectSponsoredItems(items, ctx, opts);
}

export async function feed(ctx: AppContext, q: networkApi.FeedQuery, userId: string | null): Promise<networkApi.FeedResponse> {
  const now = ctx.now();
  const point = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
  const hood = q.neighbourhood ? await hoodBySlug(ctx.db, q.neighbourhood) : null;
  const shops = await ctx.db
    .select()
    .from(merchants)
    .where(and(eq(merchants.status, "active"), listingNotDisabled, hood ? eq(merchants.neighbourhoodId, hood.id) : undefined));
  const byId = new Map(shops.map((m) => [m.id, m]));
  const ids = shops.map((m) => m.id);
  const [ps, locs, mine] = await Promise.all([windowPromos(ctx.db, ids, now), locationsByMerchant(ctx.db, ids), membershipsFor(ctx.db, userId, ids)]);
  const muted = [...mine.entries()].filter(([, v]) => v.muted).map(([k]) => k);
  const mutedSet = new Set(muted);
  const items: networkApi.FeedItemDto[] = [];
  for (const p of ps) {
    const m = byId.get(p.merchantId)!;
    if (mutedSet.has(m.id)) continue;
    if (!promoAppliesAt(p, now, m.timezone)) continue;
    const membership = mine.get(m.id);
    if (p.audience === "members" && !membership) continue;
    if (p.audience === "vip" && !membership?.vip) continue;
    const { location, distance } = nearest(locs.get(m.id) ?? [], point);
    items.push({
      sponsored: false,
      promo: promoDto(p, m.timezone, now),
      merchant: merchantBrief(m),
      location: location ? locationDto(location, m.timezone, now) : null,
      distanceMetres: distance,
      isMember: !!membership,
    });
  }
  items.sort((a, b) =>
    point
      ? (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity) || b.promo.startsAt.localeCompare(a.promo.startsAt)
      : b.promo.startsAt.localeCompare(a.promo.startsAt),
  );
  const pg = page(items, q.cursor, q.limit);
  const withAds = await injectSponsored(pg.items, ctx, {
    placement: "feed_top",
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    neighbourhoodId: hood?.id ?? null,
    userId,
    excludeMerchantIds: muted,
  });
  return { items: withAds, nextCursor: pg.nextCursor };
}

// ---------------------------------------------------------------------------
// Public shop page & QR join
// ---------------------------------------------------------------------------
async function joinableMerchantBySlug(db: DbOrTx, slug: string): Promise<Merchant> {
  const [m] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.slug, slug), inArray(merchants.status, [...JOINABLE_STATUSES])))
    .limit(1);
  if (!m) throw notFound("Shop");
  return m;
}

export async function publicShop(ctx: AppContext, slug: string): Promise<networkApi.PublicShopResponse> {
  const now = ctx.now();
  const m = await joinableMerchantBySlug(ctx.db, slug);
  const [locs, [program], rs, ps, cards, hood, counts, features] = await Promise.all([
    locationsByMerchant(ctx.db, [m.id]),
    ctx.db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, m.id)).limit(1),
    ctx.db.select().from(rewards).where(and(eq(rewards.merchantId, m.id), eq(rewards.active, true))).orderBy(rewards.sortOrder, rewards.pointsCost),
    windowPromos(ctx.db, [m.id], now),
    ctx.db.select().from(discountCards).where(and(eq(discountCards.merchantId, m.id), eq(discountCards.active, true))),
    m.neighbourhoodId
      ? ctx.db.select({ id: neighbourhoods.id, slug: neighbourhoods.slug, name: neighbourhoods.name }).from(neighbourhoods).where(eq(neighbourhoods.id, m.neighbourhoodId)).limit(1)
      : Promise.resolve([]),
    memberCountsFor(ctx.db, [m.id]),
    customerFeaturesFor(ctx.db, [m]),
  ]);
  return {
    merchant: {
      ...merchantBrief(m),
      description: m.description ?? null,
      phone: m.phone ?? null,
      email: m.email ?? null,
      website: m.website ?? null,
      instagram: m.instagram ?? null,
      coverUrl: m.coverUrl ?? null,
      timezone: m.timezone,
      neighbourhood: hood[0] ?? null,
    },
    locations: (locs.get(m.id) ?? []).map((l) => locationDto(l, m.timezone, now)),
    program: programSummary(program),
    rewards: rs.map(rewardDto),
    promos: ps.filter((p) => p.audience === "network").map((p) => promoDto(p, m.timezone, now)),
    // Public visitors see every card a new member would get (VIP-only cards excluded).
    discountCards: cardsForMember(cards, null),
    consentText: customerApi.marketingConsentText(m.name),
    memberCount: counts.get(m.id) ?? null,
    features: features.get(m.id)!,
  };
}

// ---------------------------------------------------------------------------
// Public plans (pricing page)
// ---------------------------------------------------------------------------
export async function publicPlans(ctx: AppContext): Promise<networkApi.PublicPlansResponse> {
  const [stages, [active], [hoods]] = await Promise.all([
    getRolloutStages(ctx.db),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(merchants).where(eq(merchants.status, "active")),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(neighbourhoods).where(inArray(neighbourhoods.status, ["pilot", "live"])),
  ]);
  return {
    items: PLAN_IDS.map((id) => {
      const p = PLANS[id];
      return {
        id,
        name: p.name,
        priceCents: p.priceCents,
        annualPriceCents: p.annualPriceCents,
        blurb: p.blurb,
        bestFor: [...p.bestFor],
        smsPerMonth: p.smsPerMonth,
        available: isPlanAvailable(id, stages),
        features:
          id === "free"
            ? []
            : FEATURE_KEYS.filter((k) => FEATURES[k].minPlan === id).map((k) => ({ key: k, name: FEATURES[k].name, description: FEATURES[k].description, stage: stages[k] })),
      };
    }),
    network: { activeMerchants: Number(active?.n ?? 0), neighbourhoods: Number(hoods?.n ?? 0) },
  };
}

async function resolveQr(db: DbOrTx, qrCode: string): Promise<{ merchant: Merchant; location: Location }> {
  const [row] = await db
    .select({ location: locations, merchant: merchants })
    .from(locations)
    .innerJoin(merchants, eq(merchants.id, locations.merchantId))
    .where(and(eq(locations.qrCode, qrCode), eq(locations.active, true), inArray(merchants.status, [...JOINABLE_STATUSES])))
    .limit(1);
  if (!row) throw notFound("Shop");
  return row;
}

export async function joinInfo(ctx: AppContext, qrCode: string): Promise<networkApi.JoinInfoResponse> {
  const { merchant, location } = await resolveQr(ctx.db, qrCode);
  const [[program], rs] = await Promise.all([
    ctx.db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchant.id)).limit(1),
    ctx.db.select().from(rewards).where(and(eq(rewards.merchantId, merchant.id), eq(rewards.active, true))).orderBy(rewards.pointsCost).limit(3),
  ]);
  return {
    qrCode: location.qrCode,
    merchant: merchantBrief(merchant),
    location: locationDto(location, merchant.timezone, ctx.now()),
    program: programSummary(program),
    rewards: rs.map(rewardDto),
    consentText: customerApi.marketingConsentText(merchant.name),
  };
}

export async function startQrJoin(ctx: AppContext, qrCode: string, body: networkApi.PublicJoinBody): Promise<networkApi.PublicJoinResponse> {
  const { merchant, location } = await resolveQr(ctx.db, qrCode);
  const otp = await startPhoneOtp(ctx, body.phone, { context: merchant.name });
  return {
    ...otp,
    next: { verify: "POST /v1/auth/otp/verify", join: "POST /v1/me/memberships", locationQrCode: location.qrCode },
  };
}

// ---------------------------------------------------------------------------
// Promo tracking
// ---------------------------------------------------------------------------
export async function trackPromo(ctx: AppContext, promoId: string, kind: "view" | "claim"): Promise<networkApi.PromoCounterResponse> {
  const col = kind === "view" ? promos.viewCount : promos.claimCount;
  const [row] = await ctx.db
    .update(promos)
    .set(kind === "view" ? { viewCount: sql`${col} + 1` } : { claimCount: sql`${col} + 1` })
    .where(
      and(
        eq(promos.id, promoId),
        inArray(promos.status, ["live", "scheduled"]),
        sql`exists (select 1 from ${merchants} m where m.id = "promos"."merchant_id" and m.status in ('onboarding','active'))`,
      ),
    )
    .returning({ viewCount: promos.viewCount, claimCount: promos.claimCount });
  if (!row) throw notFound("Promo");
  return { ok: true, viewCount: row.viewCount, claimCount: row.claimCount };
}
