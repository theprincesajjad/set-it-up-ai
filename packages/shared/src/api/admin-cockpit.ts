/**
 * The founder's cockpit (team admin, wave N): overview, businesses, landing funnel, health and performance.
 * Admin only (platform role admin, re-checked against the database on every call). Aggregates never carry customer
 * PII: shop-level numbers only (counts and cents), no customer names, phones or emails anywhere in these shapes.
 * Contract: docs/engineering/api/admin.md §cockpit. Service: apps/api/src/services/admin-cockpit.ts.
 */
import { z } from "zod";

/** Window lengths the overview and funnel accept (days). The comparison is always the window just before. */
export const COCKPIT_PERIODS = [7, 30, 90] as const;
export type CockpitPeriod = (typeof COCKPIT_PERIODS)[number];
const period = z.coerce
  .number()
  .int()
  .refine((n) => (COCKPIT_PERIODS as readonly number[]).includes(n), "7, 30 or 90")
  .default(30);

/** A number for the window and the window before it. deltaPct is null when the previous window is 0. */
export interface Delta {
  current: number;
  previous: number;
  deltaPct: number | null;
}

/** Plan buckets for paying shops: Pro (`plus`), Studio, Service (`pro`), restaurant tiers. */
export type PayingPlanKey = "plus" | "studio" | "pro" | "restaurant";

/** Where money processed through the platform comes from (cents). Deposits count only when no paid invoice carries them. */
export interface GmvSplit {
  ordersCents: number;
  invoicesCents: number;
  depositsCents: number;
  tiffinCents: number;
  classesCents: number;
  /** Sales a connected POS (Square, Clover, Shopify, Lightspeed, Toast, API) reported with an award. */
  posCents: number;
}

export interface WeeklyPoint {
  /** First day (UTC, YYYY-MM-DD) of a rolling 7-day bucket ending at generatedAt. Oldest first. */
  weekStart: string;
  signups: number;
  gmvCents: number;
  stamps: number;
  bookings: number;
  activeCustomers: number;
}

export const cockpitQuery = z.object({ days: period });
export interface Cockpit {
  generatedAt: string;
  days: CockpitPeriod;
  /** Rolling 7 days vs the 7 before. */
  signupsWeek: Delta;
  shops: {
    /** Not closed. */
    total: number;
    /** Status "active" (set up and open). */
    live: number;
    /** Gave a first stamp or took a first booking. */
    activated: number;
    paying: number;
    trialing: number;
    churned: number;
    payingByPlan: Record<PayingPlanKey, number>;
  };
  money: {
    mrrCents: number;
    arrCents: number;
    /** Trials that ended (in-app 14-day trial or a Stripe trial) and how many became paying. */
    trialToPaid: { ended: number; converted: number; rate: number | null };
  };
  period: {
    signups: Delta;
    gmvCents: Delta;
    gmvSplit: GmvSplit;
    stamps: Delta;
    bookings: Delta;
    activeCustomers: Delta;
  };
  /** 12 rolling weeks, oldest first. */
  weekly: WeeklyPoint[];
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------
export const BUSINESS_STATUSES = ["trial", "paying", "churned", "free"] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];
export const HEALTH_FLAGS = ["payment_failed", "trial_ending_not_activated", "usage_drop", "no_activity_14d"] as const;
export type HealthFlag = (typeof HEALTH_FLAGS)[number];
export const BUSINESS_SORTS = ["name", "signedUpAt", "lastActiveAt", "mrrCents", "gmv30dCents", "stamps30d", "bookings30d", "activeCustomers30d"] as const;
export type BusinessSort = (typeof BUSINESS_SORTS)[number];

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const listBusinessesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  trade: z.string().max(40).optional(),
  /** free | plus | studio | pro | restaurant */
  plan: z.enum(["free", "plus", "studio", "pro", "restaurant"]).optional(),
  city: z.string().trim().max(80).optional(),
  /** trial | paying | churned | free, or at_risk (any health flag). */
  status: z.enum([...BUSINESS_STATUSES, "at_risk"]).optional(),
  signedFrom: ymd.optional(),
  signedTo: ymd.optional(),
  /** Last active within this many days (any stamp, booking or staff login). Negative: inactive for at least that many days. */
  activeWithin: z.coerce.number().int().min(-365).max(365).optional(),
  sort: z.enum(BUSINESS_SORTS).default("signedUpAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export type ListBusinessesQuery = z.infer<typeof listBusinessesQuery>;

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  trade: string;
  /** free | plus | studio | pro | restaurant (the plan paid for, else the trial's plan, else the shop's plan). */
  plan: string;
  city: string | null;
  status: BusinessStatus;
  flags: HealthFlag[];
  signedUpAt: string;
  lastActiveAt: string | null;
  mrrCents: number;
  gmv30dCents: number;
  stamps30d: number;
  bookings30d: number;
  activeCustomers30d: number;
  /** The landing page the owner came from ("/", "/for-nail-techs" ...), else null. */
  landingPage: string | null;
  source: string | null;
}
export interface BusinessList {
  items: BusinessRow[];
  total: number;
  /** Counts of the filtered set by status (before the status filter), for the filter chips. */
  counts: Record<BusinessStatus | "at_risk", number>;
  facets: { trades: string[]; cities: string[] };
}

export type FunnelStepKey = "signed_up" | "booking_link_live" | "first_customer" | "first_stamp" | "paid";
export interface BusinessDetail {
  row: BusinessRow;
  funnel: { key: FunnelStepKey; at: string | null }[];
  /** 12 rolling weeks, oldest first. */
  usage: { weekStart: string; stamps: number; bookings: number; logins: number; gmvCents: number; activeCustomers: number }[];
  gmv: { last30: GmvSplit & { totalCents: number }; allTimeCents: number };
  billing: {
    plan: string;
    trial: { plan: string | null; startedAt: string | null; endsAt: string | null } | null;
    subscriptions: { id: string; plan: string; restaurantTier: string | null; status: string; interval: string; createdAt: string; currentPeriodEnd: string | null; mrrCents: number }[];
  };
  attribution: {
    landingPage: string | null;
    variant: string | null;
    experimentId: string | null;
    source: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    device: string | null;
    /** True when the signup carried the landing page's anonymous id and it matched a recorded view. */
    matchedVisit: boolean;
  };
  health: { flags: HealthFlag[]; detail: string[]; usageThisWeek: number; usageLastWeek: number; changePct: number | null };
}

// ---------------------------------------------------------------------------
// Landing and conversion funnel
// ---------------------------------------------------------------------------
export const FUNNEL_DIMENSIONS = ["page", "variant", "source", "device"] as const;
export type FunnelDimension = (typeof FUNNEL_DIMENSIONS)[number];
export const funnelQuery = z.object({ days: period, by: z.enum(FUNNEL_DIMENSIONS).default("page") });
export interface FunnelCounts {
  views: number;
  ctaClicks: number;
  signupStarted: number;
  signupCompleted: number;
  wentLive: number;
  paid: number;
}
export interface LandingFunnel {
  generatedAt: string;
  days: CockpitPeriod;
  by: FunnelDimension;
  total: FunnelCounts;
  /** Sorted by views, then signups. "unattributed" holds signups with no landing visit. */
  rows: ({ key: string } & FunnelCounts)[];
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export interface HealthRow {
  merchantId: string;
  name: string;
  trade: string;
  status: BusinessStatus;
  mrrCents: number;
  flags: HealthFlag[];
  /** One plain sentence per flag, most urgent first. */
  reasons: string[];
  /** Stamps + bookings + staff logins, per rolling week, oldest first (8 weeks). */
  trend: number[];
  changePct: number | null;
  lastActiveAt: string | null;
}
export interface HealthReport {
  generatedAt: string;
  counts: Record<HealthFlag, number>;
  /** Shops with at least one flag, most urgent first. */
  atRisk: HealthRow[];
}

// ---------------------------------------------------------------------------
// Performance (in-process metrics recorder, api_metrics)
// ---------------------------------------------------------------------------
export const performanceQuery = z.object({ hours: z.coerce.number().int().min(1).max(24 * 30).default(24) });
export interface RouteStat {
  /** Route group ("admin", "merchants:appointments", "public") or a route template ("GET /v1/admin/overview"). */
  key: string;
  count: number;
  errors: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}
export interface PerformanceReport {
  generatedAt: string;
  hours: number;
  total: RouteStat;
  groups: RouteStat[];
  /** The 10 routes with the highest p95 (at least 5 requests). */
  slowest: RouteStat[];
  /** Hourly buckets, oldest first. */
  trend: { hourStart: string; count: number; p95Ms: number; errorRate: number }[];
  /** Upper bounds (ms) of the latency histogram; percentiles report the bound of the bucket they fall in. */
  bucketsMs: readonly number[];
}
