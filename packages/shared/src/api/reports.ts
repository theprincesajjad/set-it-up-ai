/**
 * API contract for the "reports" area (/v1/merchants/:merchantId/reports/...).
 * Endpoint docs: docs/engineering/api/reports.md.
 *
 * reports.basic (free): overview, daily, top-customers, rewards, promos,
 * network-overlap, activation. reports.advanced (Plus): retention cohorts.
 * Money is integer cents; dates in the daily series are the merchant's local dates.
 */
import { z } from "zod";

export const rangeQuery = z.object({
  /** ISO datetime; default = `to` minus 30 days. */
  from: z.iso.datetime({ offset: true }).optional(),
  /** ISO datetime; default = now. */
  to: z.iso.datetime({ offset: true }).optional(),
});
export type RangeQuery = z.infer<typeof rangeQuery>;
export const topCustomersQuery = rangeQuery.extend({
  by: z.enum(["spend", "visits", "points"]).default("spend"),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export const retentionQuery = z.object({ months: z.coerce.number().int().min(2).max(12).default(6) });

/** Network overlap never shows a shop with fewer shared members than this (privacy). */
export const OVERLAP_MIN_COHORT = 5;

export interface Range {
  from: string;
  to: string;
}

export interface OverviewMetrics {
  /** All members as of `to`. */
  totalMembers: number;
  newMembers: number;
  /** Members with ≥1 visit in the range. */
  activeMembers: number;
  visits: number;
  pointsIssued: number;
  pointsRedeemed: number;
  redemptions: number;
  /** Members who redeemed ÷ active members (0–1). PRD target: 0.2 monthly. */
  redemptionRate: number;
  /** Purchase amounts recorded on member visits. */
  revenueFromMembersCents: number;
  avgSpendPerVisitCents: number;
  /** Active members with 2+ visits in the range ÷ active members (0–1). */
  repeatRate: number;
}
export interface OverviewReport {
  range: Range;
  current: OverviewMetrics;
  /** Same-length period immediately before, for deltas. */
  previous: OverviewMetrics;
  /** Members with ≥1 visit in the last 30 days (fixed window, for the header tile). */
  activeMembers30d: number;
}

export interface DailyPoint {
  /** YYYY-MM-DD in the merchant's timezone. */
  date: string;
  visits: number;
  newMembers: number;
  pointsIssued: number;
  pointsRedeemed: number;
  revenueCents: number;
}
export interface DailyReport {
  range: Range;
  timezone: string;
  series: DailyPoint[];
}

export interface TopCustomer {
  memberId: string;
  name: string | null;
  /** Last 4 digits only. */
  phoneLast4: string | null;
  visits: number;
  spendCents: number;
  pointsEarned: number;
  balance: number;
  lastVisitAt: string | null;
}
export interface TopCustomersReport {
  range: Range;
  by: "spend" | "visits" | "points";
  items: TopCustomer[];
}

export interface RewardPerformance {
  rewardId: string;
  name: string;
  pointsCost: number;
  active: boolean;
  redemptions: number;
  uniqueMembers: number;
  pointsSpent: number;
  discountCents: number;
}
export interface RewardsReport {
  range: Range;
  items: RewardPerformance[];
}

export interface PromoResult {
  promoId: string;
  title: string;
  kind: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  views: number;
  claims: number;
  /** Visits at this shop during the promo window (and its days/hours, if set). */
  attributedVisits: number;
  /** Transactions that used this promo's boost. */
  boostedTransactions: number;
  /** Avg daily visits during the window vs. the 14 days before it (null if no baseline). */
  liftPct: number | null;
}
export interface PromosReport {
  items: PromoResult[];
}

export interface NetworkOverlapReport {
  neighbourhood: { id: string; name: string } | null;
  /** Window used for "also visits" (days). */
  windowDays: number;
  myMembers: number;
  /** My members who visited at least one other shop in my neighbourhood in the window. */
  sharedMembers: number;
  sharedPct: number;
  /** Among shared members, average number of other shops visited. */
  avgOtherShops: number;
  /** Aggregated per shop; shops under OVERLAP_MIN_COHORT shared members are hidden. Never customer identities. */
  shops: { merchantId: string; name: string; vertical: string; sharedMembers: number }[];
  suppressedShops: number;
}

export interface ActivationReport {
  /** Members with ≥1 visit (all time). */
  activeMembers: number;
  target: number;
  remaining: number;
  progressPct: number;
  activatedAt: string | null;
  daysSinceSignup: number;
  /** New active members per day for the last 30 days (merchant-local dates). */
  last30Days: { date: string; newActive: number }[];
}

export interface RetentionCohort {
  /** YYYY-MM join month. */
  cohort: string;
  size: number;
  /** retention[i] = share (0–1) of the cohort with a visit i months after joining (i=0 is join month). */
  retention: number[];
}
export interface RetentionReport {
  months: number;
  cohorts: RetentionCohort[];
}
