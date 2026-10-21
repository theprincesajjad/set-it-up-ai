/**
 * Sponsored item serving: which ad campaigns to show a customer, and how to
 * interleave them into organic lists without feeling spammy.
 *
 *  - Relevance: the ad must target the viewer's neighbourhood or have the
 *    viewer inside its radius; closer shops rank higher.
 *  - Frequency cap: max AD_RULES.frequencyCapPerDay impressions per user per
 *    campaign in a rolling 24 hours.
 *  - Pacing: CPM campaigns spend evenly across their flight.
 *  - Muted shops are never shown to the customer who muted them.
 *  - Interleave: at most 1 sponsored per 5 organic, first at position 2,
 *    always labelled `sponsored: true`.
 */
import { and, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { adCampaigns, adEvents, locations, merchantMembers, merchants, neighbourhoods, promos, users } from "@ll/db";
import { adsApi, distanceMetres } from "@ll/shared";
import type { AppContext } from "../context.js";
import { DAY_MS, isServing, pacedSpendLimit, type AdCampaignRow } from "./ads.js";

const { AD_RULES } = adsApi;

export interface SelectSponsoredOpts {
  placement: adsApi.AdPlacement;
  lat?: number | null;
  lng?: number | null;
  neighbourhoodId?: string | null;
  userId?: string | null;
  limit?: number;
  /** Merchants not to advertise in this response (e.g. the shop page being viewed). */
  excludeMerchantIds?: string[];
}

interface Candidate {
  ad: AdCampaignRow;
  merchant: { id: string; name: string; slug: string; logoUrl: string | null };
  distance: number | null;
  nearest: { lat: number; lng: number } | null;
  seenToday: number;
  paceRatio: number;
}

/** Pick up to `limit` sponsored items for this viewer and placement. */
export async function selectSponsored(ctx: AppContext, opts: SelectSponsoredOpts): Promise<adsApi.SponsoredItem[]> {
  const limit = Math.max(0, Math.min(opts.limit ?? 1, 10));
  if (limit === 0) return [];
  const db = ctx.db;
  const now = ctx.now();
  const point = opts.lat != null && opts.lng != null ? { lat: opts.lat, lng: opts.lng } : null;

  // Where is the viewer? Explicit neighbourhood, else neighbourhoods containing
  // the point, else the customer's home neighbourhood.
  const hoodIds = new Set<string>();
  if (opts.neighbourhoodId) hoodIds.add(opts.neighbourhoodId);
  else if (point) {
    const hoods = await db.select().from(neighbourhoods);
    for (const h of hoods) {
      if (h.centerLat != null && h.centerLng != null && distanceMetres(point, { lat: h.centerLat, lng: h.centerLng }) <= h.radiusMetres) hoodIds.add(h.id);
    }
  }
  if (!hoodIds.size && !point && opts.userId) {
    const [u] = await db.select({ home: users.homeNeighbourhoodId }).from(users).where(eq(users.id, opts.userId)).limit(1);
    if (u?.home) hoodIds.add(u.home);
  }
  if (!hoodIds.size && !point) return []; // No relevance signal: serve nothing rather than something random.

  const rows = await db
    .select({ ad: adCampaigns, m: { id: merchants.id, name: merchants.name, slug: merchants.slug, logoUrl: merchants.logoUrl } })
    .from(adCampaigns)
    .innerJoin(merchants, eq(merchants.id, adCampaigns.merchantId))
    .where(
      and(
        eq(adCampaigns.status, "active"),
        eq(adCampaigns.placement, opts.placement),
        lte(adCampaigns.startsAt, now),
        gt(adCampaigns.endsAt, now),
        eq(merchants.status, "active"),
      ),
    );
  let live = rows.filter((r) => isServing(r.ad, now) && !opts.excludeMerchantIds?.includes(r.m.id));
  if (!live.length) return [];

  // Muted shops.
  if (opts.userId) {
    const muted = await db
      .select({ merchantId: merchantMembers.merchantId })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.userId, opts.userId), eq(merchantMembers.muted, true)));
    const mutedSet = new Set(muted.map((m) => m.merchantId));
    live = live.filter((r) => !mutedSet.has(r.m.id));
    if (!live.length) return [];
  }

  // Frequency cap.
  const seen = new Map<string, number>();
  if (opts.userId) {
    const counts = await db
      .select({ id: adEvents.adCampaignId, n: sql<number>`count(*)::int` })
      .from(adEvents)
      .where(
        and(
          eq(adEvents.userId, opts.userId),
          eq(adEvents.kind, "impression"),
          gte(adEvents.createdAt, new Date(now.getTime() - DAY_MS)),
          inArray(
            adEvents.adCampaignId,
            live.map((r) => r.ad.id),
          ),
        ),
      )
      .groupBy(adEvents.adCampaignId);
    for (const c of counts) seen.set(c.id, Number(c.n));
  }

  // Advertiser locations for distance relevance.
  const locs = await db
    .select({ merchantId: locations.merchantId, lat: locations.lat, lng: locations.lng })
    .from(locations)
    .where(and(inArray(locations.merchantId, [...new Set(live.map((r) => r.m.id))]), eq(locations.active, true)));

  const candidates: Candidate[] = [];
  for (const r of live) {
    const seenToday = seen.get(r.ad.id) ?? 0;
    if (seenToday >= AD_RULES.frequencyCapPerDay) continue;
    // Even pacing for CPM (daily-rate campaigns have bought the whole day).
    let paceRatio = 0;
    if (r.ad.pricingModel !== "daily") {
      const limitNow = pacedSpendLimit(r.ad, now);
      if (r.ad.spentCents >= limitNow) continue;
      paceRatio = limitNow > 0 ? r.ad.spentCents / limitNow : 0;
    }
    let distance: number | null = null;
    let nearest: { lat: number; lng: number } | null = null;
    for (const l of locs) {
      if (l.merchantId !== r.m.id || l.lat == null || l.lng == null) continue;
      const here = { lat: l.lat, lng: l.lng };
      const d = point ? distanceMetres(point, here) : null;
      if (nearest === null || (d !== null && (distance === null || d < distance))) {
        nearest = here;
        distance = d;
      }
    }
    const inHood = r.ad.neighbourhoodIds.some((id) => hoodIds.has(id));
    const inRadius = r.ad.radiusMetres != null && distance != null && distance <= r.ad.radiusMetres;
    if (!inHood && !inRadius) continue;
    candidates.push({ ad: r.ad, merchant: r.m, distance, nearest, seenToday, paceRatio });
  }

  // Rank: closest first (unknown distance sorts after known), then the ad the
  // viewer has seen least, then the campaign furthest behind its pacing.
  candidates.sort(
    (a, b) =>
      (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY) ||
      a.seenToday - b.seenToday ||
      a.paceRatio - b.paceRatio ||
      a.ad.createdAt.getTime() - b.ad.createdAt.getTime(),
  );

  // One campaign per advertiser per response.
  const picked: Candidate[] = [];
  const usedMerchants = new Set<string>();
  for (const c of candidates) {
    if (usedMerchants.has(c.merchant.id)) continue;
    usedMerchants.add(c.merchant.id);
    picked.push(c);
  }

  // Attach boosted promos; drop boosts whose promo is no longer live.
  const promoIds = picked.map((c) => c.ad.promoId).filter((x): x is string => !!x);
  const promoRows = promoIds.length ? await db.select().from(promos).where(inArray(promos.id, promoIds)) : [];
  const promoMap = new Map(promoRows.map((p) => [p.id, p]));
  const out: adsApi.SponsoredItem[] = [];
  for (const c of picked) {
    let promo: adsApi.SponsoredItem["promo"] = null;
    if (c.ad.promoId) {
      const p = promoMap.get(c.ad.promoId);
      const promoLive = p && p.status !== "archived" && p.status !== "ended" && p.status !== "draft" && p.startsAt <= now && (!p.endsAt || p.endsAt > now);
      if (!promoLive) continue;
      promo = { id: p.id, title: p.title, body: p.body, imageUrl: p.imageUrl, endsAt: p.endsAt?.toISOString() ?? null };
    }
    out.push({
      sponsored: true,
      label: "Sponsored",
      adCampaignId: c.ad.id,
      placement: c.ad.placement,
      headline: c.ad.headline,
      body: c.ad.body,
      imageUrl: c.ad.imageUrl,
      merchant: c.merchant,
      promo,
      location: c.nearest,
      distanceMetres: c.distance === null ? null : Math.round(c.distance),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Pure interleave: sponsored item k (0-based) goes right after organic item
 * 1 + 5k, and only while the list keeps at least 5 organic items per
 * sponsored item. Lists shorter than 5 organic items get no ads.
 */
export function interleaveSponsored<T, S>(organic: T[], sponsored: S[]): (T | S)[] {
  const per = AD_RULES.organicPerSponsored;
  const first = AD_RULES.firstSponsoredPosition - 1; // organic items before the first ad
  const max = Math.min(sponsored.length, Math.floor(organic.length / per));
  if (max === 0) return [...organic];
  const out: (T | S)[] = [];
  let used = 0;
  organic.forEach((item, i) => {
    out.push(item);
    const organicSoFar = i + 1;
    if (used < max && organicSoFar >= first && (organicSoFar - first) % per === 0) out.push(sponsored[used++]!);
  });
  return out;
}

/** How many sponsored slots a list of `organicCount` items allows. */
export function sponsoredSlots(organicCount: number): number {
  return Math.floor(organicCount / AD_RULES.organicPerSponsored);
}

export type InjectSponsoredOpts = Omit<SelectSponsoredOpts, "limit"> & { maxSponsored?: number };

/**
 * Extension point for organic lists (network feed, search, map). Returns the
 * organic items with sponsored items (`sponsored: true`) interleaved.
 */
export async function injectSponsored<T>(items: T[], ctx: AppContext, opts: InjectSponsoredOpts): Promise<(T | adsApi.SponsoredItem)[]> {
  const slots = Math.min(sponsoredSlots(items.length), opts.maxSponsored ?? Number.POSITIVE_INFINITY);
  if (slots <= 0) return items;
  const ads = await selectSponsored(ctx, { ...opts, limit: slots });
  return interleaveSponsored(items, ads);
}
