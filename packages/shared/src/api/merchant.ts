/**
 * API contract for the "merchant" area (/v1/merchants/...): zod request
 * schemas and response types. Endpoint docs: docs/engineering/api/merchant.md.
 */
import { z } from "zod";
import type { FeatureKey, PlanId, RolloutStage } from "../plans.js";
import { VERTICALS, type Vertical } from "../verticals.js";
import { LOCALE_CODES } from "../i18n/locales.js";
import { centsSchema, phoneSchema, uuidSchema } from "./common.js";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");
export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
/** Opening hours: { mon: [["09:00","17:00"]], sun: [] }. Missing day = closed. */
export const hoursSchema = z.partialRecord(z.enum(DAY_KEYS), z.array(z.tuple([hhmm, hhmm])).max(4));
export type Hours = z.infer<typeof hoursSchema>;

export const verticalSchema = z.enum(VERTICALS);
export const staffRoleSchema = z.enum(["owner", "manager", "staff"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;
export const brandColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1A7F5A");
const urlSchema = z.url().max(2000);
const nullableText = (max: number) => z.string().trim().max(max).nullable();

// ---------------------------------------------------------------------------
// Merchant signup + profile
// ---------------------------------------------------------------------------
export const createMerchantBody = z.object({
  name: z.string().trim().min(2).max(120),
  vertical: verticalSchema,
  /** Street address of the first location. */
  address: z.string().trim().min(3).max(300),
  city: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(10).optional(),
  phone: phoneSchema,
  email: z.email().optional(),
  /** Neighbourhood by id or slug (one of them; both optional). */
  neighbourhoodId: uuidSchema.optional(),
  neighbourhoodSlug: z.string().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  hours: hoursSchema.optional(),
});
export type CreateMerchantBody = z.infer<typeof createMerchantBody>;

export const updateProfileBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: nullableText(2000),
    logoUrl: urlSchema.nullable(),
    coverUrl: urlSchema.nullable(),
    brandColor: brandColorSchema.nullable(),
    email: z.email().nullable(),
    phone: phoneSchema.nullable(),
    website: urlSchema.nullable(),
    /** Handle without @ or a full URL. */
    instagram: nullableText(200),
    /** Applied to the primary (first) location. */
    hours: hoursSchema,
    neighbourhoodId: uuidSchema.nullable(),
    /** Transactional SMS receipt after each award (muted members never get one). */
    smsReceiptsEnabled: z.boolean(),
  })
  .partial();
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;

export const betaOptInBody = z.object({ optIn: z.boolean() });

export interface Location {
  id: string;
  merchantId: string;
  name: string;
  address: string;
  city: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  hours: Hours | null;
  qrCode: string;
  /** `${PUBLIC_WEB_URL}/j/<qrCode>` — what the counter QR encodes. */
  joinUrl: string;
  active: boolean;
  createdAt: string;
}

export interface MerchantProfile {
  id: string;
  slug: string;
  name: string;
  vertical: Vertical;
  description: string | null;
  neighbourhoodId: string | null;
  status: "onboarding" | "active" | "paused" | "closed";
  plan: PlanId;
  betaOptIn: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  brandColor: string | null;
  timezone: string;
  repUserId: string | null;
  activatedAt: string | null;
  onboardingStep: string;
  smsCreditsUsed: number;
  /** Text a transactional receipt after each award. */
  smsReceiptsEnabled: boolean;
  hasApiKey: boolean;
  /** Primary location hours (same as locations[0].hours). */
  hours: Hours | null;
  createdAt: string;
}

/** POST /v1/merchants and GET /v1/merchants/:id */
export interface MerchantDetail {
  merchant: MerchantProfile;
  /** Caller's role at this merchant (admins/assigned reps act as "owner"). */
  role: StaffRole;
  locations: Location[];
  program: LoyaltyProgram | null;
}

/** GET /v1/merchants — merchants the caller is staff at. */
export interface MyMerchant {
  id: string;
  slug: string;
  name: string;
  vertical: Vertical;
  status: MerchantProfile["status"];
  plan: PlanId;
  role: StaffRole;
  logoUrl: string | null;
}

// ---------------------------------------------------------------------------
// Onboarding checklist + features
// ---------------------------------------------------------------------------
export const ONBOARDING_STEPS = ["profile", "program", "rewards", "staff", "qr_kit", "first_members"] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];
/** Steps a merchant can tick manually (e.g. solo owner skips "staff"). */
export const completeStepBody = z.object({ step: z.enum(["profile", "program", "rewards", "staff", "qr_kit"]) });

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  done: boolean;
  /** Human hint, e.g. "12 of 25 members have visited". */
  detail: string | null;
}
export interface OnboardingChecklist {
  steps: OnboardingStep[];
  /** First step that isn't done, or "done". */
  currentStep: OnboardingStepKey | "done";
  percentComplete: number;
  activeMembers: number;
  activationTarget: number;
  activatedAt: string | null;
}

export interface MerchantFeature {
  key: FeatureKey;
  name: string;
  description: string;
  enabled: boolean;
  stage: RolloutStage;
  minPlan: PlanId;
  phase: 1 | 2 | 3;
  /** null when enabled. "rollout" = coming soon (hide or tease); "plan" = upsell (lock icon). */
  lockedReason: "plan" | "rollout" | null;
}
export interface MerchantFeaturesResponse {
  plan: PlanId;
  betaOptIn: boolean;
  features: MerchantFeature[];
  /** Whether each paid plan can be purchased yet. */
  plansAvailable: Record<PlanId, boolean>;
}

/** POST /v1/merchants/:merchantId/features/:key/notify ("Notify me" on a coming-soon feature). No body. */
export interface FeatureInterestResponse {
  key: FeatureKey;
  interested: true;
  /** When this merchant first asked to be notified. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
export const createLocationBody = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(3).max(300),
  city: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(10).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  hours: hoursSchema.nullable().optional(),
});
export const updateLocationBody = createLocationBody.partial().extend({ active: z.boolean().optional() });

// ---------------------------------------------------------------------------
// Team (staff management) — owner only for writes
// ---------------------------------------------------------------------------
export const inviteStaffBody = z
  .object({
    email: z.email().optional(),
    phone: phoneSchema.optional(),
    name: z.string().trim().max(120).optional(),
    role: staffRoleSchema.default("staff"),
  })
  .refine((b) => b.email || b.phone, { message: "Provide an email or phone number" });
/**
 * PATCH /merchants/:merchantId/team/:userId. `role` is owner-only; `locale` (the language their counter
 * and kitchen screens open in) and `station` (kitchen station they work, free text; null clears) are
 * owner or manager.
 */
export const updateStaffBody = z
  .object({
    role: staffRoleSchema.optional(),
    locale: z.enum(LOCALE_CODES).optional(),
    station: z.string().trim().max(60).nullable().optional(),
  })
  .refine((b) => b.role !== undefined || b.locale !== undefined || b.station !== undefined, { message: "Provide a role, locale or station to change" });
export const setPinBody = z.object({ pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits") });

export interface StaffMember {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  hasPin: boolean;
  /** UI language for their counter and kitchen screens: en | hi | ur | pa. */
  locale: (typeof LOCALE_CODES)[number];
  /** Kitchen station they work (KDS default filter), e.g. "tandoor". Null = all stations. */
  station: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Loyalty program
// ---------------------------------------------------------------------------
export const earnTypeSchema = z.enum(["per_dollar", "per_visit", "stamps"]);
export const updateProgramBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    earnType: earnTypeSchema,
    pointsPerDollar: z.number().int().min(0).max(1000),
    pointsPerVisit: z.number().int().min(0).max(10000),
    minSpendCents: centsSchema,
    stampGoal: z.number().int().min(0).max(100),
    terminology: z.enum(["points", "stamps", "stars"]),
    welcomeBonus: z.number().int().min(0).max(100000),
    birthdayBonus: z.number().int().min(0).max(100000),
    referralBonus: z.number().int().min(0).max(100000),
    /** null = points never expire (default). Otherwise >= 12 months of inactivity. */
    expiryMonths: z.number().int().min(12, "Points expiry must be at least 12 months of inactivity").max(120).nullable(),
    visitCooldownMinutes: z.number().int().min(0).max(1440),
    termsText: nullableText(5000),
    active: z.boolean(),
  })
  .partial();
export type UpdateProgramBody = z.infer<typeof updateProgramBody>;

export interface LoyaltyProgram {
  id: string;
  merchantId: string;
  name: string;
  earnType: "per_dollar" | "per_visit" | "stamps";
  pointsPerDollar: number;
  pointsPerVisit: number;
  minSpendCents: number;
  stampGoal: number;
  terminology: string;
  welcomeBonus: number;
  birthdayBonus: number;
  referralBonus: number;
  expiryMonths: number | null;
  visitCooldownMinutes: number;
  termsText: string | null;
  active: boolean;
  /** Plain-language expiry disclosure to show next to every balance. */
  expiryDisclosure: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Rewards, VIP levels, categories, discount cards
// ---------------------------------------------------------------------------
export const rewardTypeSchema = z.enum(["amount_off", "percent_off", "free_item", "custom"]);
const rewardFields = {
  name: z.string().trim().min(1).max(120),
  description: nullableText(1000),
  pointsCost: z.number().int().min(1).max(1_000_000),
  rewardType: rewardTypeSchema,
  /** cents for amount_off; whole percent (1–100) for percent_off; 0 otherwise. */
  value: z.number().int().min(0).max(10_000_000),
  maxDiscountCents: centsSchema.nullable(),
  catalogItemId: uuidSchema.nullable(),
  imageUrl: urlSchema.nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000),
};
export const createRewardBody = z.object({
  ...rewardFields,
  description: rewardFields.description.optional(),
  value: rewardFields.value.default(0),
  maxDiscountCents: rewardFields.maxDiscountCents.optional(),
  catalogItemId: rewardFields.catalogItemId.optional(),
  imageUrl: rewardFields.imageUrl.optional(),
  active: rewardFields.active.default(true),
  sortOrder: rewardFields.sortOrder.default(0),
});
/** PATCH: any subset; no defaults are applied. */
export const updateRewardBody = z.object(rewardFields).partial();
export interface Reward {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  rewardType: "amount_off" | "percent_off" | "free_item" | "custom";
  value: number;
  maxDiscountCents: number | null;
  catalogItemId: string | null;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

const vipFields = {
  name: z.string().trim().min(1).max(60),
  thresholdPoints: z.number().int().min(0).max(100_000_000),
  /** Earn multiplier in hundredths; 100 = 1x, 150 = 1.5x (max 5x). */
  multiplierPct: z.number().int().min(100).max(500),
  perks: nullableText(1000),
};
export const createVipLevelBody = z.object({ ...vipFields, multiplierPct: vipFields.multiplierPct.default(100), perks: vipFields.perks.optional() });
export const updateVipLevelBody = z.object(vipFields).partial();
export interface VipLevel {
  id: string;
  name: string;
  thresholdPoints: number;
  multiplierPct: number;
  perks: string | null;
  memberCount: number;
  createdAt: string;
}

export const createCategoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  /** Defaults to true, or false for regulated names (prescriptions, pharmacy services, tobacco, lottery, gift cards). */
  earnEligible: z.boolean().optional(),
  discountEligible: z.boolean().optional(),
  externalIds: z.record(z.string(), z.string()).optional(),
});
export const updateCategoryBody = createCategoryBody.partial();
export interface Category {
  id: string;
  name: string;
  earnEligible: boolean;
  discountEligible: boolean;
  /** Regulated category (e.g. prescriptions): can never earn or be discounted, can't be deleted. */
  protected: boolean;
  externalIds: Record<string, string>;
  createdAt: string;
}

export const discountEligibilitySchema = z.enum(["everyone", "seniors", "students", "members_only", "vip"]);
const discountCardFields = {
  name: z.string().trim().min(1).max(120),
  percentOff: z.number().int().min(0).max(100),
  amountOffCents: centsSchema,
  terms: nullableText(2000),
  eligibility: discountEligibilitySchema,
  /** Non-discount-eligible categories are always added automatically. */
  excludedCategoryIds: z.array(uuidSchema).max(100),
  active: z.boolean(),
};
export const createDiscountCardBody = z.object({
  ...discountCardFields,
  percentOff: discountCardFields.percentOff.default(0),
  amountOffCents: discountCardFields.amountOffCents.default(0),
  terms: discountCardFields.terms.optional(),
  eligibility: discountCardFields.eligibility.default("members_only"),
  excludedCategoryIds: discountCardFields.excludedCategoryIds.default([]),
  active: discountCardFields.active.default(true),
});
export const updateDiscountCardBody = z.object(discountCardFields).partial();
export interface DiscountCard {
  id: string;
  name: string;
  percentOff: number;
  amountOffCents: number;
  terms: string | null;
  eligibility: z.infer<typeof discountEligibilitySchema>;
  excludedCategoryIds: string[];
  active: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Promos
// ---------------------------------------------------------------------------
export const promoKindSchema = z.enum(["offer", "multiplier", "bonus_points", "discount", "event"]);
export const promoStatusSchema = z.enum(["draft", "scheduled", "live", "ended", "archived"]);
export type PromoStatus = z.infer<typeof promoStatusSchema>;
/** Allowed status transitions (server-enforced). */
export const PROMO_TRANSITIONS: Record<PromoStatus, PromoStatus[]> = {
  draft: ["scheduled", "live", "archived"],
  scheduled: ["draft", "live", "ended", "archived"],
  live: ["ended"],
  ended: ["archived"],
  archived: [],
};
const promoFields = {
  title: z.string().trim().min(1).max(120),
  body: nullableText(2000).optional(),
  imageUrl: urlSchema.nullable().optional(),
  kind: promoKindSchema,
  /** multiplier promos: hundredths, > 100 (200 = double points). */
  multiplierPct: z.number().int().min(101).max(1000).nullable().optional(),
  /** bonus_points promos: flat bonus per qualifying purchase. */
  bonusPoints: z.number().int().min(1).max(100000).nullable().optional(),
  /** discount promos: whole percent off. */
  percentOff: z.number().int().min(1).max(100).nullable().optional(),
  itemId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  /** Recurring weekdays, 0 = Sunday. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  startTime: hhmm.nullable().optional(),
  endTime: hhmm.nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  audience: z.enum(["network", "members", "vip"]),
};
export const createPromoBody = z.object({
  ...promoFields,
  kind: promoFields.kind.default("offer"),
  audience: promoFields.audience.default("network"),
  /** Create as draft (default) or publish straight away (scheduled/live by startsAt). */
  publish: z.boolean().default(false),
});
export const updatePromoBody = z.object(promoFields).partial();
export const promoStatusBody = z.object({ status: promoStatusSchema });
export interface Promo {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  kind: z.infer<typeof promoKindSchema>;
  multiplierPct: number | null;
  bonusPoints: number | null;
  percentOff: number | null;
  itemId: string | null;
  categoryId: string | null;
  daysOfWeek: number[] | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: string;
  endsAt: string | null;
  audience: "network" | "members" | "vip";
  status: PromoStatus;
  viewCount: number;
  claimCount: number;
  createdAt: string;
}
export const listPromosQuery = z.object({ status: promoStatusSchema.optional() });

// ---------------------------------------------------------------------------
// Customers directory
// ---------------------------------------------------------------------------
export const listCustomersQuery = z.object({
  /** Matches name, email, or phone digits. */
  q: z.string().trim().max(100).optional(),
  phoneLast4: z.string().regex(/^\d{4}$/).optional(),
  tag: z.string().trim().max(40).optional(),
  vipLevelId: uuidSchema.optional(),
  /** Any VIP level. */
  vip: z.enum(["true", "false"]).optional(),
  /** No visit in the last N days (members who never visited count as lapsed). */
  lapsedDays: z.coerce.number().int().min(1).max(3650).optional(),
  /** Balance covers at least one active reward. */
  rewardAvailable: z.enum(["true", "false"]).optional(),
  /** Joined at or after this instant (ISO date = midnight UTC, or datetime with offset). */
  joinedAfter: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  /** opted_in = marketing consent and not muted (the only members promos reach); not = everyone else. */
  consent: z.enum(["opted_in", "not"]).optional(),
  muted: z.enum(["true", "false"]).optional(),
  sort: z.enum(["recent", "joined", "balance", "visits", "spend", "name"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuery>;

export interface CustomerSummary {
  memberId: string;
  userId: string;
  name: string | null;
  /** Masked ("(416) ***-1234") in list/detail; reveal with POST …/reveal-phone. */
  phone: string | null;
  email: string | null;
  memberCode: string;
  balance: number;
  lifetimePoints: number;
  visitCount: number;
  totalSpendCents: number;
  lastVisitAt: string | null;
  joinedAt: string;
  joinedVia: string;
  vipLevel: { id: string; name: string } | null;
  tags: string[];
  marketingConsent: boolean;
  muted: boolean;
  rewardAvailable: boolean;
}

/** GET /v1/merchants/:id/customers. `phone` on each item is masked ("(416) ***-1234"). */
export interface ListCustomersResponse {
  items: CustomerSummary[];
  nextCursor: string | null;
  /** Members matching the filters (ignores cursor/limit). */
  total: number;
}

/** POST /v1/merchants/:id/customers/:memberId/reveal-phone (manager+, audit-logged). */
export interface RevealPhoneResponse {
  memberId: string;
  /** Full E.164 number, or null when the member has none. */
  phone: string | null;
}

export interface LedgerTransactionView {
  id: string;
  type: string;
  source: string;
  points: number;
  amountCents: number | null;
  description: string | null;
  breakdown: string[] | null;
  locationId: string | null;
  staffUserId: string | null;
  reversesTransactionId: string | null;
  reversedAt: string | null;
  rewardId: string | null;
  promoId: string | null;
  createdAt: string;
}
export interface VisitView {
  id: string;
  locationId: string | null;
  amountCents: number | null;
  source: string;
  transactionId: string | null;
  createdAt: string;
}
export interface CustomerDetail {
  customer: CustomerSummary & {
    birthday: string | null;
    notes: string | null;
    marketingConsentAt: string | null;
    marketingConsentSource: string | null;
  };
  transactions: LedgerTransactionView[];
  visits: VisitView[];
  redemptions: { id: string; rewardId: string; code: string; status: string; discountCents: number | null; createdAt: string }[];
}

export const updateCustomerBody = z
  .object({
    notes: nullableText(5000),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
  })
  .partial();
export const adjustPointsBody = z.object({
  points: z.number().int().refine((n) => n !== 0, "Adjustment cannot be zero"),
  reason: z.string().trim().min(1, "A reason is required").max(500),
  idempotencyKey: z.string().max(200).optional(),
});
export const reverseTransactionBody = z.object({ reason: z.string().trim().min(1, "A reason is required").max(500) });
export const listActivityQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  type: z.string().max(40).optional(),
  memberId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export interface ActivityItem extends LedgerTransactionView {
  memberId: string;
  customerName: string | null;
}

// ---------------------------------------------------------------------------
// CSV import / migration
// ---------------------------------------------------------------------------
/**
 * CSV header row required. Columns (case-insensitive): phone (required), name,
 * email, points, visits, birthday (YYYY-MM-DD), consent (yes/true/1) and
 * consent_date (ISO date) — consent is only recorded when BOTH are present (CASL).
 */
export const importCustomersBody = z.object({
  csv: z.string().min(1).max(5_000_000),
  /** Validate and report without writing anything. */
  dryRun: z.boolean().default(false),
  /** Label of the program being migrated from, e.g. "SoPoints" (for the ledger description). */
  sourceName: z.string().trim().max(60).optional(),
});
export interface ImportRowError {
  /** 1-based data row number (header = row 0). */
  row: number;
  message: string;
}
export interface ImportCustomersResult {
  dryRun: boolean;
  rows: number;
  membersCreated: number;
  membersExisting: number;
  pointsImported: number;
  /** Rows whose opening balance was already imported (idempotent re-run). */
  duplicates: number;
  consentRecorded: number;
  /** Rows that failed and were skipped. */
  errors: ImportRowError[];
  /** Rows imported with a caveat (e.g. consent ignored because consent_date was missing). */
  warnings: ImportRowError[];
}

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------
export interface ApiKeyStatus {
  configured: boolean;
}
/** Shown once. Send as `Authorization: Bearer <apiKey>` or `X-Api-Key`. */
export interface ApiKeyCreated {
  apiKey: string;
}

// ---------------------------------------------------------------------------
// QR kit (merchant + rep console)
// ---------------------------------------------------------------------------
export interface QrKit {
  merchant: { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null; vertical: Vertical };
  program: { name: string; terminology: string; headline: string } | null;
  locations: { id: string; name: string; address: string; qrCode: string; joinUrl: string; qrSvg: string }[];
  /** One-line staff script for the counter. */
  staffScript: string;
}
