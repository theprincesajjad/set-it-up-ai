/**
 * API contract for the "network" area: the public network (neighbourhoods,
 * shop map/list, promo feed) under /v1/network/..., the public merchant page
 * and the no-download counter-QR join flow under /v1/public/shops and
 * /v1/public/join. Endpoint docs: docs/engineering/api/network.md.
 *
 * All endpoints work without auth. When a valid bearer token is sent, the
 * response is personalised (balances, muted shops hidden, members-only promos).
 */
import { z } from "zod";
import { phoneSchema } from "./common.js";
import type { SponsoredItem } from "./ads.js";
import type { PlanId, RolloutStage, FeatureKey } from "../plans.js";
import { consentSchema, type CustomerFeaturesDto, type DiscountCardDto, type MerchantBriefDto, type ProgramSummaryDto, type RewardDto } from "./customer.js";

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
/** GET /v1/network/shops */
export const shopsQuery = z
  .object({
    lat: lat.optional(),
    lng: lng.optional(),
    /** Neighbourhood slug. */
    neighbourhood: z.string().trim().min(1).max(80).optional(),
    vertical: z.string().trim().min(1).max(40).optional(),
    /** Search by shop name or description. */
    q: z.string().trim().min(1).max(80).optional(),
    /** Only shops within this many metres (needs lat/lng). */
    radiusMetres: z.coerce.number().int().min(100).max(50_000).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "Send both lat and lng" });
export type ShopsQuery = z.infer<typeof shopsQuery>;

/** GET /v1/network/feed */
export const feedQuery = z
  .object({
    lat: lat.optional(),
    lng: lng.optional(),
    neighbourhood: z.string().trim().min(1).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "Send both lat and lng" });
export type FeedQuery = z.infer<typeof feedQuery>;

/** POST /v1/public/join/:qrCode */
export const publicJoinBody = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(120).optional(),
  /** Optional marketing consent shown on the join page; re-send it to POST /v1/me/memberships after verifying. */
  consent: consentSchema.optional(),
});
export type PublicJoinBody = z.infer<typeof publicJoinBody>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------
/** { mon: [["09:00","17:00"]], tue: [...], ... } keys: sun mon tue wed thu fri sat */
export type OpeningHours = Record<string, [string, string][]>;

export interface NeighbourhoodDto {
  id: string;
  slug: string;
  name: string;
  city: string;
  province: string;
  status: "scouting" | "pilot" | "live";
  centerLat: number | null;
  centerLng: number | null;
  radiusMetres: number;
  biaName: string | null;
  shopCount: number;
}

/** GET /v1/network/neighbourhoods */
export interface NeighbourhoodsResponse {
  items: NeighbourhoodDto[];
}

export interface NetworkPerkDto {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  threshold: number;
  windowDays: number;
  bonusPoints: number;
}

export interface CampaignBriefDto {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  startsAt: string;
  endsAt: string;
  goalVisits: number;
  bonusPoints: number;
  multiplierPct: number | null;
  prize: string | null;
}

/** GET /v1/network/neighbourhoods/:slug */
export interface NeighbourhoodDetailResponse {
  neighbourhood: NeighbourhoodDto;
  perks: NetworkPerkDto[];
  liveCampaigns: CampaignBriefDto[];
  /** Live promos from shops in the neighbourhood right now. */
  livePromoCount: number;
}

export interface LocationDto {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  hours: OpeningHours | null;
  /** Null when hours are not set. */
  openNow: boolean | null;
}

export interface ShopListItemDto {
  merchant: MerchantBriefDto & { description: string | null };
  /** Nearest active location to the caller (or the first one). */
  location: LocationDto | null;
  locationCount: number;
  /** Null when lat/lng were not given or the location has no coordinates. */
  distanceMetres: number | null;
  openNow: boolean | null;
  hasPromo: boolean;
  terminology: string;
  earnType: "per_dollar" | "per_visit" | "stamps" | null;
  /** Signed-in callers only: their balance here, or null if not a member. */
  myBalance: number | null;
  isMember: boolean;
  /** Members at this shop; null when fewer than MEMBER_COUNT_MIN (tiny numbers aren't shown). */
  memberCount: number | null;
}

/** Member counts below this are returned as null on public surfaces. */
export const MEMBER_COUNT_MIN = 10;

/** GET /v1/network/shops */
export interface ShopsResponse {
  items: ShopListItemDto[];
  nextCursor: string | null;
}

export interface PromoDto {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  kind: "offer" | "multiplier" | "bonus_points" | "discount" | "event";
  multiplierPct: number | null;
  bonusPoints: number | null;
  percentOff: number | null;
  daysOfWeek: number[] | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: string;
  endsAt: string | null;
  audience: "network" | "members" | "vip";
  /** True when the promo applies at this moment (day-of-week/time window included). */
  activeNow: boolean;
}

export interface FeedItemDto {
  /** Organic promo. Sponsored entries (adsApi.SponsoredItem) have `sponsored: true`. */
  sponsored: false;
  promo: PromoDto;
  merchant: MerchantBriefDto;
  location: LocationDto | null;
  distanceMetres: number | null;
  isMember: boolean;
}

/** Discriminate on `sponsored`. */
export type FeedEntry = FeedItemDto | SponsoredItem;

/** GET /v1/network/feed */
export interface FeedResponse {
  /** Organic promos sorted by distance; the ads team may interleave sponsored items (always labelled). */
  items: FeedEntry[];
  nextCursor: string | null;
}

/** GET /v1/public/shops/:slug */
export interface PublicShopResponse {
  merchant: MerchantBriefDto & {
    description: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    instagram: string | null;
    coverUrl: string | null;
    timezone: string;
    neighbourhood: { id: string; slug: string; name: string } | null;
  };
  locations: LocationDto[];
  program: ProgramSummaryDto | null;
  rewards: RewardDto[];
  promos: PromoDto[];
  discountCards: DiscountCardDto[];
  /** Suggested CASL consent wording for the join form. */
  consentText: string;
  /** Members at this shop; null when fewer than MEMBER_COUNT_MIN. */
  memberCount: number | null;
  /** Customer-facing entry points this shop has switched on. */
  features: CustomerFeaturesDto;
}

/** GET /v1/public/plans: pricing page data (no merchant data). */
export interface PublicPlanDto {
  id: PlanId;
  name: string;
  priceCents: number;
  annualPriceCents: number;
  blurb: string;
  bestFor: string[];
  smsPerMonth: number;
  /** Purchasable now: at least one of the plan's features is out of "hidden". Free is always true. */
  available: boolean;
  /** Paid features on this plan and their global rollout stage (empty for Free). */
  features: { key: FeatureKey; name: string; description: string; stage: RolloutStage }[];
}
export interface PublicPlansResponse {
  items: PublicPlanDto[];
  network: {
    /** Merchants with status "active". */
    activeMerchants: number;
    /** Neighbourhoods with status pilot or live. */
    neighbourhoods: number;
  };
}

/** GET /v1/public/join/:qrCode */
export interface JoinInfoResponse {
  qrCode: string;
  merchant: MerchantBriefDto;
  location: LocationDto;
  program: ProgramSummaryDto | null;
  /** Rewards to tease on the join page (cheapest first, max 3). */
  rewards: RewardDto[];
  /** Display this exact text next to the consent checkbox and send it back unchanged. */
  consentText: string;
}

/** POST /v1/public/join/:qrCode */
export interface PublicJoinResponse {
  sent: true;
  expiresInSeconds: number;
  /** Non-production only. */
  devCode?: string;
  /** Next calls for the client, in order. */
  next: { verify: "POST /v1/auth/otp/verify"; join: "POST /v1/me/memberships"; locationQrCode: string };
}

/** POST /v1/network/promos/:promoId/view and /claim */
export interface PromoCounterResponse {
  ok: true;
  viewCount: number;
  claimCount: number;
}
