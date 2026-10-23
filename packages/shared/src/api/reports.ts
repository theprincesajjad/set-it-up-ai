/**
 * API contract for the "reports" area (/v1/merchants/:merchantId/reports/...).
 * Endpoint docs: docs/engineering/api/reports.md.
 *
 * reports.basic (free forever): overview, daily, top-customers, rewards, activation.
 * reports.advanced (Plus): retention cohorts, network-overlap. promos.basic (Plus): promo results.
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
  /** Outstanding points right now (not range-bound). */
  pointsLiability: PointsLiability;
}

/**
 * Points members hold but haven't redeemed. Dollar estimate = balance × cents-per-point of the
 * cheapest (lowest points cost) active `amount_off` reward; null when the shop has none.
 */
export interface PointsLiability {
  outstandingPoints: number;
  membersWithBalance: number;
  /** value ÷ pointsCost of `basisReward`, 4 decimals. */
  centsPerPoint: number | null;
  estimatedValueCents: number | null;
  basisReward: { id: string; name: string; pointsCost: number; valueCents: number } | null;
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
  /** Visits inside the promo's window (days and hours) from `startsAt` until now or `endsAt`. */
  windowVisits: number;
  /**
   * Mean visits in the same weekdays and hours over the 4 weeks before the promo, scaled to the
   * same number of window-days. Null when fewer than 2 weeks of history exist before the promo.
   */
  typicalVisits: number | null;
  /** `windowVisits - typicalVisits` (null when `typicalVisits` is null). */
  extraVisits: number | null;
  /** Rewards-type items given: boosted transactions plus redemptions during the window. */
  freeItemsGiven: number;
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
  /** Joiners of the last 4 weeks (ending 30 days ago at most) who came back within 7, 14 and 30 days. */
  joinerReturn: JoinerReturnReport;
}

// ---------------------------------------------------------------------------
// Café & retail: today (home), heatmap, rewards owed, joiner return
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;
/** A regular has at least this many visits in the last 30 days. */
export const REGULAR_MIN_VISITS_30D = 3;
/** Slipping away needs at least this many visits in the prior 60 days. */
export const SLIPPING_MIN_VISITS_60D = 3;
/** Never call someone slipping before this many days without a visit. */
export const SLIPPING_MIN_DAYS = 14;

type TimeLike = Date | number | string;
const ms = (t: TimeLike) => (t instanceof Date ? t.getTime() : typeof t === "number" ? t : new Date(t).getTime());

/** Visit times at or before `now` inside the trailing window, oldest first. */
function within(times: TimeLike[], now: TimeLike, days: number): number[] {
  const end = ms(now);
  const start = end - days * DAY_MS;
  return times.map(ms).filter((t) => t > start && t <= end).sort((a, b) => a - b);
}

/** Regular = at least 3 visits in the last 30 days. */
export function isRegular(visitTimes: TimeLike[], now: TimeLike): boolean {
  return within(visitTimes, now, 30).length >= REGULAR_MIN_VISITS_30D;
}

/** Median gap in days between consecutive visits in the prior 60 days (null with fewer than 2 visits). */
export function medianGapDays(visitTimes: TimeLike[], now: TimeLike): number | null {
  const v = within(visitTimes, now, 60);
  if (v.length < 2) return null;
  const gaps = v.slice(1).map((t, i) => (t - v[i]!) / DAY_MS).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
}

/** Days without a visit after which this person counts as slipping away: `max(14, 2 × median gap)`. */
export function slippingThresholdDays(visitTimes: TimeLike[], now: TimeLike): number | null {
  const gap = medianGapDays(visitTimes, now);
  return gap === null ? null : Math.max(SLIPPING_MIN_DAYS, 2 * gap);
}

/**
 * Slipping away = a regular (3+ visits in the prior 60 days) whose days since the last visit exceed
 * `max(14, 2 × their own median gap)`. Measured against that person's own rhythm.
 */
export function isSlipping(visitTimes: TimeLike[], now: TimeLike): boolean {
  const v = within(visitTimes, now, 60);
  if (v.length < SLIPPING_MIN_VISITS_60D) return false;
  const threshold = slippingThresholdDays(visitTimes, now);
  if (threshold === null) return false;
  return (ms(now) - v[v.length - 1]!) / DAY_MS > threshold;
}

/** Local weekday (0 = Sunday) and hour (0-23) of one visit in the shop's timezone. */
export interface VisitSlot {
  dow: number;
  hour: number;
}
export const USUALLY_MIN_VISITS = 4;
export const USUALLY_WINDOW = 12;

/** "8 am", "12 pm", "4 pm" for an hour 0-23. */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
}

/**
 * "Weekdays 8 am": the most common weekday group (Weekdays or Weekends) and 2-hour bucket across
 * the most recent 12 visits. `slots` are newest first. Null with fewer than 4 visits. Ties go to
 * the larger group count, then the earlier bucket.
 */
export function usuallyLabel(slots: VisitSlot[]): string | null {
  const recent = slots.slice(0, USUALLY_WINDOW);
  if (recent.length < USUALLY_MIN_VISITS) return null;
  const group = (dow: number) => (dow === 0 || dow === 6 ? "Weekends" : "Weekdays");
  const groups = new Map<string, number>();
  for (const s of recent) groups.set(group(s.dow), (groups.get(group(s.dow)) ?? 0) + 1);
  const bestGroup = [...groups.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]![0];
  const buckets = new Map<number, number>();
  for (const s of recent) if (group(s.dow) === bestGroup) buckets.set(s.hour - (s.hour % 2), (buckets.get(s.hour - (s.hour % 2)) ?? 0) + 1);
  const bestBucket = [...buckets.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  return `${bestGroup} ${hourLabel(bestBucket)}`;
}

/** Counts in the last four same-weekday buckets → typical value (mean, rounded). Null with no history. */
export function typicalFromWeeks(counts: number[], weeks = 4): number | null {
  const last = counts.slice(-weeks);
  if (!last.length) return null;
  return Math.round(last.reduce((a, b) => a + b, 0) / last.length);
}

export interface TodayReportDto {
  /** ISO, shop timezone Toronto. */
  asOf: string;
  timezone: string;
  /** typical = mean of the last 4 same weekdays before yesterday. */
  yesterday: { visits: number; typicalVisits: number };
  today: {
    visits: number;
    typicalVisitsFullDay: number;
    newMembers: number;
    newViaQr: number;
    stampsGiven: number;
    redemptions: number;
    regularsSeen: number;
    regularsTotal: number;
  };
  /** Hours 7..18 in shop time. */
  hourly: { hours: number[]; typical: number[]; today: number[] };
  /** Members at or above the reward cost; top 4 by most recent visit. */
  rewardsWaiting: { count: number; goal: number | null; members: { memberId: string; name: string | null; balance: number; lastVisitAt: string | null }[] };
  slipping: { count: number; canText: number; members: { memberId: string; name: string | null; usually: string | null; lastVisitAt: string | null; canText: boolean }[] };
  staff: { staffId: string; name: string; shift: string | null; stamps: number; visits: number; undone: number }[];
  /** A promo running today (by weekday and hours) with its window numbers, if any. */
  promoWindow: { promoId: string; title: string; startTime: string | null; endTime: string | null; windowVisits: number; typicalVisits: number; extraVisits: number } | null;
  counter: { online: boolean; staffName: string | null; signedInAt: string | null };
}

export const heatmapQuery = z.object({ weeks: z.coerce.number().int().min(1).max(26).default(4) });
export interface HeatmapReport {
  weeks: number;
  timezone: string;
  /** matrix[weekday][hour], weekday 0 = Monday ... 6 = Sunday, hour 0-23, shop time. */
  matrix: number[][];
  max: number;
}

export interface RewardsOwedReport {
  /** Free rewards members could redeem right now (floor(balance / goal) summed). */
  rewardsOwed: number;
  stampsOutstanding: number;
  members: number;
  /** `rewardsOwed × rewardCostCents`. Null when the shop has not entered a cost. Always an estimate. */
  estCostCents: number | null;
  rewardCostCents: number | null;
  estimate: true;
}

export interface JoinerReturnReport {
  /** Joiners between `from` and `to` that are old enough for every window. */
  from: string;
  to: string;
  joined: number;
  /** Cumulative: members whose first return visit (after the join visit) came within N days. */
  windows: { days: number; cameBack: number }[];
}

export interface FreeDrinksReport {
  given: number;
  estCostCents: number | null;
}
