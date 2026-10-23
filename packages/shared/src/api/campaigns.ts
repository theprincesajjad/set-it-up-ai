// API contract for the "campaigns" area: zod request schemas and response types. Owned by the agent that builds routes/campaigns.
// BIA neighbourhood campaigns ("Passport week", "Points weekend", street-wide multipliers).
// Docs: docs/engineering/api/campaigns.md · Product spec: docs/business/network-monetization.md
import { z } from "zod";
import type { NeighbourhoodDto } from "./network.js";

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
  /**
   * "Came back within 30 days": unique customers with a recorded visit at a participating shop during the campaign
   * who have another recorded visit at any shop in the neighbourhood in the 30 days after it ends. Null until
   * `returnWindowEndsAt` has passed (the UI shows "Available {date}"). Aggregates only.
   */
  returnedWithin30d: number | null;
  /** Share of `uniqueCustomers`, one decimal. Null with `returnedWithin30d`, or when nobody visited. */
  returnedWithin30dPct: number | null;
  /** Campaign end plus 30 days. */
  returnWindowEndsAt: string;
  /** The same measure for the same-length window before the campaign, for context. Null while the main measure is. */
  baselineReturnedWithin30d: number | null;
  baselineReturnedWithin30dPct: number | null;
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

/** GET /v1/me/neighbourhoods-managed — same shape as the public neighbourhood list. */
export type ManagedNeighbourhood = NeighbourhoodDto;

/** GET /v1/admin/neighbourhoods/:id/merchants (admin or that neighbourhood's manager). */
export interface NeighbourhoodMerchant {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  status: "onboarding" | "active" | "paused" | "closed";
  /** Reached the activation threshold (activatedAt set). */
  activated: boolean;
  activatedAt: string | null;
  logoUrl: string | null;
}

/**
 * Per-street unlock gates for neighbourhood campaigns (docs/business/network-monetization.md): the strip has been live
 * this long, has this many active shops, this many active shoppers (a visit in the last 30 days) and this share of
 * those shoppers visit two or more shops. One constant for the BIA overview, `selectSponsored` and campaign creation.
 */
export const UNLOCK_PER_NEIGHBOURHOOD = { liveMonths: 6, activeShops: 20, activeCustomers: 1500, multiShopPct: 25 } as const;
export type UnlockThresholds = { liveMonths: number; activeShops: number; activeCustomers: number; multiShopPct: number };

// ---------------------------------------------------------------------------
// BIA overview and period report (aggregates only: no customer id, name, phone or email in any response)
// ---------------------------------------------------------------------------
/** The longest period the overview and report accept. */
export const MAX_REPORT_DAYS = 366;

/** `from` and `to` are ISO dates or datetimes; `to` is exclusive. Default: the last 30 days. */
export const periodQuery = z
  .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
  .refine((q) => !q.from || !q.to || q.to > q.from, { message: "to must be after from", path: ["to"] })
  .refine((q) => !q.from || !q.to || q.to.getTime() - q.from.getTime() <= MAX_REPORT_DAYS * 86_400_000, { message: `A period is at most ${MAX_REPORT_DAYS} days`, path: ["to"] });
export const reportQuery = z
  .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), format: z.enum(["json", "csv"]).default("json") })
  .refine((q) => !q.from || !q.to || q.to > q.from, { message: "to must be after from", path: ["to"] })
  .refine((q) => !q.from || !q.to || q.to.getTime() - q.from.getTime() <= MAX_REPORT_DAYS * 86_400_000, { message: `A period is at most ${MAX_REPORT_DAYS} days`, path: ["to"] });

export interface PeriodRange {
  from: string;
  to: string;
}

export interface NeighbourhoodShopRow {
  id: string;
  name: string;
  status: NeighbourhoodMerchant["status"];
  /** Reached the activation threshold. */
  activated: boolean;
  /** Visits in the period. */
  visits: number;
  /** Members who joined this shop in the period. */
  newMembers: number;
}

/** GET /v1/neighbourhoods/:id/overview?from&to (neighbourhood manager or admin). */
export interface NeighbourhoodOverview {
  period: PeriodRange;
  /** The same length immediately before `period`. */
  prior: PeriodRange;
  shops: {
    /** Shops with status "active". */
    live: number;
    /** The BIA's own member count (neighbourhoods.biaMemberCount), null until an admin enters it. */
    members: number | null;
    /** Shops created in the period. */
    joinedInPeriod: number;
  };
  /** Distinct shoppers with a visit at any shop on the street in the period; delta is the change in people. */
  activeMembers: { value: number; delta: number };
  /** Share (0 to 100, one decimal) of those shoppers who visited two or more shops in the period; delta in points. */
  multiShopPct: { value: number; deltaPoints: number };
  /** Visits at the shops in `shopsTable` (so the stat is the sum of the table); delta against the prior period, null when that was 0. */
  visits: { value: number; deltaPct: number | null };
  /** Up to 12 weeks ending with the week that contains the period end, oldest first. `campaignIds` are the campaigns running that week. */
  weekly: { weekStart: string; visits: number; campaignIds: string[] }[];
  shopsTable: NeighbourhoodShopRow[];
  gates: {
    /** Whole months since the first shop on the street activated. */
    liveMonths: number;
    activeShops: number;
    /** Distinct shoppers with a visit in the last 30 days. */
    activeCustomers: number;
    /** Share (0 to 100) of those who visited two or more shops in the last 30 days. */
    multiShopPct: number;
    thresholds: UnlockThresholds;
  };
}

export interface NeighbourhoodReportCampaign {
  id: string;
  name: string;
  kind: CampaignKind;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  shops: number;
  report: CampaignReport;
}

/** GET /v1/neighbourhoods/:id/report?from&to&format=json: the board report for a period. */
export interface NeighbourhoodReport {
  neighbourhood: { id: string; name: string };
  period: PeriodRange;
  prior: PeriodRange;
  generatedAt: string;
  overview: NeighbourhoodOverview;
  /** Campaigns that ran inside the period (scheduled, live or ended). */
  campaigns: NeighbourhoodReportCampaign[];
}
