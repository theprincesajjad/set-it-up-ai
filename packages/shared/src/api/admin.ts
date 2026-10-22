/**
 * API contract for the "admin" area (/v1/admin/...). Auth: platform role "admin".
 * Endpoint docs: docs/engineering/api/admin.md.
 */
import { z } from "zod";
import type { FeatureKey, PlanId, RolloutStage } from "../plans.js";
import { phoneSchema, uuidSchema } from "./common.js";

const page = { limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().optional() };
const nullableText = (max: number) => z.string().trim().max(max).nullable();

// ---------------------------------------------------------------------------
// Network dashboard
// ---------------------------------------------------------------------------
export interface NetworkDashboard {
  merchants: {
    total: number;
    byStatus: Record<"onboarding" | "active" | "paused" | "closed", number>;
    byVertical: { vertical: string; count: number }[];
    byNeighbourhood: { neighbourhoodId: string | null; name: string; merchants: number; activated: number }[];
    byPlan: Record<PlanId, number>;
  };
  activatedMerchants: number;
  /** activated ÷ (all merchants that aren't closed). PRD target 60% by month 6. */
  activationRate: number;
  /** Users with at least one merchant membership. */
  customers: number;
  /** Customers holding 2+ shops. PRD target 30%. */
  multiShopCustomers: number;
  multiShopPct: number;
  memberships: number;
  /** Last 8 ISO weeks (Mon start, America/Toronto), oldest first. */
  weeklyVisits: { weekStart: string; visits: number; activeCustomers: number }[];
}

// ---------------------------------------------------------------------------
// Feature rollout control
// ---------------------------------------------------------------------------
export interface AdminFeature {
  key: FeatureKey;
  name: string;
  description: string;
  minPlan: PlanId;
  phase: 1 | 2 | 3;
  stage: RolloutStage;
  defaultStage: RolloutStage;
  /** Free-forever features can only be "ga". */
  freeForever: boolean;
  unlockAtMerchants: number;
  /** Merchants with status "active" right now. */
  activeMerchants: number;
  /** activeMerchants >= unlockAtMerchants. */
  readyToUnlock: boolean;
  overrides: { enabled: number; disabled: number };
  /** Merchants that tapped "Notify me" on this feature (demand signal before flipping the gate). */
  interestCount: number;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}
export const setFeatureStageBody = z.object({
  stage: z.enum(["hidden", "beta", "ga"]),
  note: z.string().trim().max(500).optional(),
});
export const featureOverrideBody = z.object({
  merchantId: uuidSchema,
  /** true = force on (pilot shop); false = force off (never allowed for free-forever features). */
  enabled: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});
export interface FeatureOverride {
  key: FeatureKey;
  merchantId: string;
  merchantName: string;
  enabled: boolean;
  reason: string | null;
  createdAt: string;
}
export interface PlanAvailability {
  id: PlanId;
  name: string;
  priceCents: number;
  /** Purchasable: at least one feature on the plan is out of "hidden". */
  available: boolean;
  features: { key: FeatureKey; stage: RolloutStage }[];
}

// ---------------------------------------------------------------------------
// Neighbourhoods (BIA info) + network perks
// ---------------------------------------------------------------------------
export const neighbourhoodStatusSchema = z.enum(["scouting", "pilot", "live"]);
const neighbourhoodFields = {
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, "lowercase letters, digits and dashes"),
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80),
  province: z.string().trim().length(2),
  status: neighbourhoodStatusSchema,
  centerLat: z.number().min(-90).max(90).nullable(),
  centerLng: z.number().min(-180).max(180).nullable(),
  radiusMetres: z.number().int().min(100).max(20000),
  biaName: nullableText(160),
  biaContactName: nullableText(120),
  biaContactEmail: z.email().nullable(),
  biaContactPhone: phoneSchema.nullable(),
  storefrontEstimate: z.number().int().min(0).max(100000).nullable(),
  notes: nullableText(5000),
};
export const createNeighbourhoodBody = z.object(neighbourhoodFields).partial().required({ slug: true, name: true });
export const updateNeighbourhoodBody = z.object(neighbourhoodFields).partial();
export interface AdminNeighbourhood {
  id: string;
  slug: string;
  name: string;
  city: string;
  province: string;
  status: z.infer<typeof neighbourhoodStatusSchema>;
  centerLat: number | null;
  centerLng: number | null;
  radiusMetres: number;
  biaName: string | null;
  biaContactName: string | null;
  biaContactEmail: string | null;
  biaContactPhone: string | null;
  storefrontEstimate: number | null;
  notes: string | null;
  merchants: number;
  activatedMerchants: number;
  createdAt: string;
}

const perkFields = {
  /** null = network-wide. */
  neighbourhoodId: uuidSchema.nullable(),
  name: z.string().trim().min(1).max(120),
  description: nullableText(1000),
  ruleType: z.literal("distinct_merchants"),
  /** Visit this many distinct shops… */
  threshold: z.number().int().min(2).max(50),
  /** …within this many days. */
  windowDays: z.number().int().min(1).max(365),
  /** Network-funded bonus points. */
  bonusPoints: z.number().int().min(1).max(100000),
  active: z.boolean(),
};
export const createPerkBody = z.object({
  ...perkFields,
  neighbourhoodId: perkFields.neighbourhoodId.optional(),
  description: perkFields.description.optional(),
  ruleType: perkFields.ruleType.default("distinct_merchants"),
  threshold: perkFields.threshold.default(3),
  windowDays: perkFields.windowDays.default(30),
  bonusPoints: perkFields.bonusPoints.default(50),
  active: perkFields.active.default(true),
});
export const updatePerkBody = z.object(perkFields).partial();
export interface NetworkPerk {
  id: string;
  neighbourhoodId: string | null;
  name: string;
  description: string | null;
  ruleType: "distinct_merchants";
  threshold: number;
  windowDays: number;
  bonusPoints: number;
  active: boolean;
  awards: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Merchants, users, audit
// ---------------------------------------------------------------------------
export const listMerchantsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["onboarding", "active", "paused", "closed"]).optional(),
  neighbourhoodId: uuidSchema.optional(),
  vertical: z.string().max(40).optional(),
  plan: z.enum(["free", "plus", "pro"]).optional(),
  repUserId: uuidSchema.optional(),
  ...page,
});
export interface AdminMerchant {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  status: "onboarding" | "active" | "paused" | "closed";
  plan: PlanId;
  neighbourhoodId: string | null;
  repUserId: string | null;
  activatedAt: string | null;
  members: number;
  activeMembers: number;
  createdAt: string;
}
export interface AdminMerchantDetail extends AdminMerchant {
  email: string | null;
  phone: string | null;
  betaOptIn: boolean;
  smsCreditsUsed: number;
  onboardingStep: string;
  staff: { userId: string; name: string | null; email: string | null; role: "owner" | "manager" | "staff" }[];
  locations: number;
  overrides: { key: string; enabled: boolean; reason: string | null }[];
}
export const setMerchantStatusBody = z.object({
  status: z.enum(["onboarding", "active", "paused", "closed"]),
  reason: z.string().trim().min(1, "Give a reason").max(500),
});

export const listUsersQuery = z.object({
  /** Name, email, phone digits or member code. */
  q: z.string().trim().max(100).optional(),
  platformRole: z.enum(["none", "rep", "admin"]).optional(),
  ...page,
});
export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  memberCode: string;
  platformRole: "none" | "rep" | "admin";
  memberships: number;
  staffOf: number;
  deletedAt: string | null;
  createdAt: string;
}
export const setPlatformRoleBody = z.object({ platformRole: z.enum(["none", "rep", "admin"]) });

export const listAuditQuery = z.object({
  merchantId: uuidSchema.optional(),
  actorUserId: uuidSchema.optional(),
  /** Exact action, or a prefix ending in "." (e.g. "feature."). */
  action: z.string().max(80).optional(),
  entity: z.string().max(60).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  ...page,
});
export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  merchantId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  data: unknown;
  ip: string | null;
  createdAt: string;
}
