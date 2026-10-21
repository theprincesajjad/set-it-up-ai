// API contract for the "ads" area: zod request schemas and response types. Owned by the agent that builds routes/ads.
// Docs: docs/engineering/api/ads.md · Product spec: docs/business/network-monetization.md
import { z } from "zod";
import type { FeatureKey } from "../plans.js";

export const AD_PLACEMENTS = ["feed_top", "search_top", "map_pin", "promo_boost", "nearby_push"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const AD_STATUSES = ["draft", "pending_review", "active", "paused", "ended", "rejected"] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

export const AD_PRICING_MODELS = ["daily", "cpm"] as const;
export type AdPricingModel = (typeof AD_PRICING_MODELS)[number];

export type AdPaymentStatus = "pending" | "paid" | "invoiced" | "refunded" | "failed";

/** Which feature key unlocks each placement (all Phase 3, hidden until the network has density). */
export const AD_PLACEMENT_FEATURE: Record<AdPlacement, FeatureKey> = {
  feed_top: "ads.sponsored_listing",
  search_top: "ads.sponsored_listing",
  map_pin: "ads.map_pin",
  promo_boost: "ads.sponsored_promo",
  nearby_push: "ads.sponsored_promo",
};

/**
 * Rate card in CAD cents. The server sets the rate; merchants pick the model.
 * `daily: null` means the placement is CPM-only.
 */
export const AD_RATE_CARD: Record<AdPlacement, { dailyCents: number | null; cpmCents: number }> = {
  feed_top: { dailyCents: 1500, cpmCents: 1200 },
  search_top: { dailyCents: 1000, cpmCents: 1000 },
  map_pin: { dailyCents: 800, cpmCents: 600 },
  promo_boost: { dailyCents: 1200, cpmCents: 1000 },
  nearby_push: { dailyCents: null, cpmCents: 4000 },
};

/** Serving rules (see docs/business/network-monetization.md). */
export const AD_RULES = {
  /** Max impressions per user per campaign in a rolling 24 hours. */
  frequencyCapPerDay: 3,
  /** At most one sponsored item per this many organic items. */
  organicPerSponsored: 5,
  /** 1-based position of the first sponsored item in a list. */
  firstSponsoredPosition: 2,
  /** A visit is attributed to an ad the same user saw or clicked within this many days. */
  attributionWindowDays: 7,
  minBudgetCents: 2500,
  maxFlightDays: 90,
  defaultRadiusMetres: 1500,
  maxRadiusMetres: 10_000,
} as const;

export const createAdCampaignBody = z
  .object({
    placement: z.enum(AD_PLACEMENTS),
    pricingModel: z.enum(AD_PRICING_MODELS),
    /** Boost an existing promo of this merchant instead of (or in addition to) custom creative. */
    promoId: z.uuid().optional(),
    headline: z.string().trim().min(3).max(80).optional(),
    body: z.string().trim().max(280).optional(),
    imageUrl: z.url().max(2000).optional(),
    /** Target by neighbourhood(s) and/or a radius around the merchant's locations. */
    neighbourhoodIds: z.array(z.uuid()).max(20).default([]),
    radiusMetres: z.number().int().min(200).max(AD_RULES.maxRadiusMetres).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    /** Required for CPM. For daily pricing the budget is rate × flight days and this is ignored. */
    budgetCents: z.number().int().min(AD_RULES.minBudgetCents).max(10_000_000).optional(),
  })
  .refine((b) => b.endsAt > b.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] })
  .refine((b) => b.headline || b.promoId, { message: "Provide a headline or a promo to boost", path: ["headline"] })
  .refine((b) => b.neighbourhoodIds.length > 0 || b.radiusMetres, { message: "Target at least one neighbourhood or a radius", path: ["neighbourhoodIds"] })
  .refine((b) => b.pricingModel !== "cpm" || b.budgetCents, { message: "CPM campaigns need a budget", path: ["budgetCents"] })
  .refine((b) => b.placement !== "promo_boost" || b.promoId, { message: "promo_boost needs a promoId", path: ["promoId"] });
export type CreateAdCampaignBody = z.input<typeof createAdCampaignBody>;

export const listAdCampaignsQuery = z.object({
  status: z.enum(AD_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const adminListAdsQuery = listAdCampaignsQuery.extend({ status: z.enum(AD_STATUSES).default("pending_review") });
export const rejectAdBody = z.object({ reason: z.string().trim().min(3).max(500) });
export const approveAdBody = z.object({ note: z.string().trim().max(500).optional() });
export const markAdPaidBody = z.object({ paymentStatus: z.enum(["paid", "invoiced"]).default("paid") });

export const sponsoredQuery = z.object({
  placement: z.enum(AD_PLACEMENTS),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  neighbourhoodId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(1),
});

export interface AdCampaign {
  id: string;
  merchantId: string;
  placement: AdPlacement;
  status: AdStatus;
  promoId: string | null;
  headline: string;
  body: string | null;
  imageUrl: string | null;
  neighbourhoodIds: string[];
  radiusMetres: number | null;
  pricingModel: AdPricingModel;
  rateCents: number;
  budgetCents: number;
  spentCents: number;
  startsAt: string;
  endsAt: string;
  impressions: number;
  clicks: number;
  attributedVisits: number;
  paymentStatus: AdPaymentStatus;
  /** Present when the payments provider returned a checkout step. */
  paymentClientSecret?: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  endedReason: "completed" | "budget_exhausted" | "cancelled" | null;
  createdAt: string;
}

/** Admin review queue row: the campaign plus who is advertising. */
export interface AdminAdCampaign extends AdCampaign {
  merchant: { id: string; name: string; slug: string };
}

export interface AdReport {
  campaignId: string;
  impressions: number;
  clicks: number;
  /** clicks / impressions, 0..1 (0 when no impressions). */
  ctr: number;
  attributedVisits: number;
  spentCents: number;
  budgetCents: number;
  /** spentCents / attributedVisits, null when no visits yet. */
  costPerVisitCents: number | null;
  uniqueUsersReached: number;
  daily: { date: string; impressions: number; clicks: number; visits: number }[];
}

/** A sponsored item as served to customers. Always rendered with a visible "Sponsored" label. */
export interface SponsoredItem {
  sponsored: true;
  label: "Sponsored";
  adCampaignId: string;
  placement: AdPlacement;
  headline: string;
  body: string | null;
  imageUrl: string | null;
  merchant: { id: string; name: string; slug: string; logoUrl: string | null };
  promo: { id: string; title: string; body: string | null; imageUrl: string | null; endsAt: string | null } | null;
  /** Nearest location of the advertiser (map pins), null when unknown. */
  location: { lat: number; lng: number } | null;
  distanceMetres: number | null;
}

export interface SponsoredResponse {
  items: SponsoredItem[];
}

export interface TrackResponse {
  /** false when deduped / over the frequency cap / campaign not serving. */
  counted: boolean;
}

export interface AdRateCardResponse {
  rateCard: typeof AD_RATE_CARD;
  rules: typeof AD_RULES;
}
