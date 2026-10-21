// API contract for the "campaigns" area: zod request schemas and response types. Owned by the agent that builds routes/campaigns.
// BIA neighbourhood campaigns ("Passport week", "Points weekend", street-wide multipliers).
// Docs: docs/engineering/api/campaigns.md · Product spec: docs/business/network-monetization.md
import { z } from "zod";

export const CAMPAIGN_KINDS = ["passport", "points_weekend", "multiplier"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "live", "ended", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** BIA packages (CAD cents, docs/finance/unit-economics.md §6). Price is set per campaign; these are the defaults. */
export const CAMPAIGN_PACKAGES = {
  points_weekend: { name: "Bronze: points weekend", priceCents: 150_000, days: 3, goalVisits: 3 },
  passport: { name: "Silver: passport week", priceCents: 225_000, days: 7, goalVisits: 5 },
  multiplier: { name: "Gold: two-week street multiplier", priceCents: 300_000, days: 14, goalVisits: 5 },
} as const satisfies Record<CampaignKind, { name: string; priceCents: number; days: number; goalVisits: number }>;

const campaignFields = {
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(CAMPAIGN_KINDS),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  /** Distinct participating shops to complete (prize draw entry). */
  goalVisits: z.number().int().min(1).max(50),
  /** Network-funded bonus per distinct participating shop visited (once per shop per customer). */
  bonusPoints: z.number().int().min(0).max(10_000),
  /** Hundredths; 200 = double points. Required for `multiplier`, optional for `points_weekend`. */
  multiplierPct: z.number().int().min(101).max(1000).nullable(),
  prize: z.string().trim().max(500).nullable(),
  priceCents: z.number().int().min(0).max(10_000_000),
};

export const createCampaignBody = z
  .object({
    neighbourhoodId: z.uuid(),
    ...campaignFields,
    goalVisits: campaignFields.goalVisits.optional(),
    bonusPoints: campaignFields.bonusPoints.default(0),
    multiplierPct: campaignFields.multiplierPct.optional(),
    prize: campaignFields.prize.optional(),
    priceCents: campaignFields.priceCents.optional(),
  })
  .refine((b) => b.endsAt > b.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] })
  .refine((b) => b.endsAt.getTime() - b.startsAt.getTime() <= 31 * 86_400_000, { message: "Campaigns run at most 31 days", path: ["endsAt"] })
  .refine((b) => b.kind !== "multiplier" || b.multiplierPct, { message: "Multiplier campaigns need multiplierPct", path: ["multiplierPct"] });
export type CreateCampaignBody = z.input<typeof createCampaignBody>;

/** Only while draft or scheduled. */
export const updateCampaignBody = z
  .object({
    name: campaignFields.name,
    description: campaignFields.description.nullable(),
    startsAt: campaignFields.startsAt,
    endsAt: campaignFields.endsAt,
    goalVisits: campaignFields.goalVisits,
    bonusPoints: campaignFields.bonusPoints,
    multiplierPct: campaignFields.multiplierPct,
    prize: campaignFields.prize,
    priceCents: campaignFields.priceCents,
  })
  .partial();
export type UpdateCampaignBody = z.input<typeof updateCampaignBody>;

export const listCampaignsQuery = z.object({
  neighbourhoodId: z.uuid().optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const addCampaignMerchantBody = z.object({ merchantId: z.uuid() });
export const markCampaignPaidBody = z.object({ paid: z.boolean().default(true) });
export const drawBody = z.object({ redraw: z.boolean().default(false) });

export const myCampaignsQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const addManagerBody = z
  .object({
    neighbourhoodId: z.uuid(),
    userId: z.uuid().optional(),
    email: z.email().optional(),
    phone: z.string().min(7).max(20).optional(),
  })
  .refine((b) => b.userId || b.email || b.phone, { message: "Provide userId, email or phone", path: ["userId"] });
export const listManagersQuery = z.object({ neighbourhoodId: z.uuid().optional() });

export interface CampaignMerchant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface Campaign {
  id: string;
  neighbourhoodId: string;
  name: string;
  description: string | null;
  kind: CampaignKind;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  goalVisits: number;
  bonusPoints: number;
  multiplierPct: number | null;
  prize: string | null;
  priceCents: number;
  paid: boolean;
  paidAt: string | null;
  merchants: CampaignMerchant[];
  drawnAt: string | null;
  createdAt: string;
}

/** Public, unauthenticated view (no price/payment details). */
export interface PublicCampaign {
  id: string;
  name: string;
  description: string | null;
  kind: CampaignKind;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  goalVisits: number;
  bonusPoints: number;
  multiplierPct: number | null;
  prize: string | null;
  neighbourhood: { id: string; name: string; slug: string };
  merchants: CampaignMerchant[];
}

export interface MyCampaign extends PublicCampaign {
  progress: {
    visitedMerchantIds: string[];
    visited: number;
    goal: number;
    completedAt: string | null;
    /** Completed passport = entered in the prize draw. */
    enteredInDraw: boolean;
  };
}

/** Merchant view: campaigns in my neighbourhood and whether I'm in. */
export interface MerchantCampaign extends PublicCampaign {
  joined: boolean;
  /** Merchants can join/leave until the campaign starts. */
  canChange: boolean;
}

/** BIA report. Aggregates only: no customer PII. */
export interface CampaignReport {
  campaignId: string;
  window: { startsAt: string; endsAt: string };
  /** Same-length window immediately before the campaign. */
  baselineWindow: { startsAt: string; endsAt: string };
  visits: number;
  baselineVisits: number;
  /** (visits - baseline) / baseline, null when the baseline is 0. */
  visitLiftPct: number | null;
  uniqueCustomers: number;
  baselineUniqueCustomers: number;
  newMembers: number;
  baselineNewMembers: number;
  participants: number;
  completions: number;
  bonusPointsIssued: number;
  perMerchant: {
    merchantId: string;
    name: string;
    visits: number;
    baselineVisits: number;
    uniqueCustomers: number;
    newMembers: number;
  }[];
}

export interface DrawResult {
  campaignId: string;
  eligibleCount: number;
  drawnAt: string;
  /** First name and masked phone only. */
  winner: { firstName: string | null; maskedPhone: string | null };
}

export interface NeighbourhoodManager {
  neighbourhoodId: string;
  userId: string;
  name: string | null;
  createdAt: string;
}
