/**
 * The weekly money report (docs/business/pro-value.md 3.2 P6 and 5.5).
 *
 * `weekReport` builds one Monday-to-Sunday week (shop time) of booked revenue, visits, new clients, the change against last week and the
 * 4-week average, every signal from merchant_signals, the goal, the quietest open weekday and the promos left. The Today tile, Reports
 * Week, the Sunday job and the trial receipt all read it. `trialReceipt` is the 14-day version P1's trial-end job calls.
 *
 * Money: appointments that are booked, arrived, in service or completed count at the sum of their items. A shop with no appointments in
 * the window is a loyalty shop: its visits (with an amount) count instead.
 */
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { appointments, locations, merchantMembers, merchants, staffHours, visits } from "@ll/db";
import { reportsApi, type SignalKey } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest } from "../lib/errors.js";
import { addDays } from "./bookings.js";
import { promoAllowanceFor } from "./billing.js";
import { isFeatureOn } from "./features.js";
import { heatmap } from "./reports.js";
import { localDate, noSignals, signalsByWeek, weekBounds, weekStartOf, weekStartOfDate } from "./signals.js";

type Merchant = typeof merchants.$inferSelect;
const DAY_MS = 86_400_000;
/** Appointments that are, or will be, money: not cancelled, not a no-show. */
const MONEY_STATUSES = ["booked", "arrived", "in_service", "completed"];
const TREND_WEEKS = 8;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const zero = (): reportsApi.WeekNumbers => ({ revenueCents: 0, visits: 0, newClients: 0 });

interface Numbers {
  byWeek: Map<string, reportsApi.WeekNumbers>;
  source: "appointments" | "visits";
  /** Money-appointments per weekday (0 = Sunday) over the range, for the quietest day. */
  weekdayCounts: number[];
}

/** Booked revenue, visits and new clients for every week from `firstWeek` to `lastWeek` (Mondays, inclusive). */
async function numbersByWeek(ctx: AppContext, m: Merchant, firstWeek: string, lastWeek: string): Promise<Numbers> {
  const tz = m.timezone;
  const from = weekBounds(firstWeek, tz).start;
  const to = weekBounds(lastWeek, tz).end;
  const [appts, members] = await Promise.all([
    ctx.db
      .select({ startsAt: appointments.startsAt, items: appointments.items })
      .from(appointments)
      .where(and(eq(appointments.merchantId, m.id), inArray(appointments.status, MONEY_STATUSES), gte(appointments.startsAt, from), lt(appointments.startsAt, to))),
    ctx.db
      .select({ createdAt: merchantMembers.createdAt })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, m.id), gte(merchantMembers.createdAt, from), lt(merchantMembers.createdAt, to))),
  ]);
  const byWeek = new Map<string, reportsApi.WeekNumbers>();
  const at = (w: string) => byWeek.get(w) ?? byWeek.set(w, zero()).get(w)!;
  const weekdayCounts = Array<number>(7).fill(0);
  let source: Numbers["source"] = "appointments";
  if (appts.length) {
    for (const a of appts) {
      const w = at(weekStartOf(a.startsAt, tz));
      w.revenueCents += (a.items ?? []).reduce((s, i) => s + (i.priceCents ?? 0), 0);
      w.visits += 1;
      weekdayCounts[localDate(a.startsAt, tz).weekday]! += 1;
    }
  } else {
    source = "visits";
    const rows = await ctx.db
      .select({ createdAt: visits.createdAt, amountCents: visits.amountCents })
      .from(visits)
      .where(and(eq(visits.merchantId, m.id), gte(visits.createdAt, from), lt(visits.createdAt, to)));
    for (const v of rows) {
      const w = at(weekStartOf(v.createdAt, tz));
      w.revenueCents += v.amountCents ?? 0;
      w.visits += 1;
      weekdayCounts[localDate(v.createdAt, tz).weekday]! += 1;
    }
  }
  for (const mm of members) at(weekStartOf(mm.createdAt, tz)).newClients += 1;
  return { byWeek, source, weekdayCounts };
}

/** Weekdays the shop takes bookings: staff hours, else the locations' opening hours, else null (unknown). */
async function openWeekdays(ctx: AppContext, m: Merchant): Promise<Set<number> | null> {
  const staff = await ctx.db.selectDistinct({ weekday: staffHours.weekday }).from(staffHours).where(eq(staffHours.merchantId, m.id));
  if (staff.length) return new Set(staff.map((s) => s.weekday));
  const locs = await ctx.db.select({ hours: locations.hours }).from(locations).where(eq(locations.merchantId, m.id));
  const open = new Set<number>();
  for (const l of locs) DAY_KEYS.forEach((k, i) => ((l.hours as Record<string, unknown[]> | null)?.[k]?.length ? open.add(i) : undefined));
  return open.size ? open : null;
}

/**
 * The quietest open weekday over the last 8 weeks, from the visits heatmap (reports.heatmap) or, for a shop that books by appointment,
 * from its appointments. Closed days never win. Null with fewer than 4 bookings behind it or fewer than two open days.
 */
export async function bestDayToPromote(
  ctx: AppContext,
  m: Merchant,
  counts?: number[],
): Promise<{ weekday: number; averagePerWeek: number } | null> {
  let perDay = counts;
  if (!perDay || perDay.every((n) => n === 0)) {
    const hm = await heatmap(ctx, m, TREND_WEEKS);
    // heatmap rows are Monday-first; this module counts from Sunday.
    perDay = Array.from({ length: 7 }, (_, d) => hm.matrix[(d + 6) % 7]!.reduce((s, n) => s + n, 0));
  }
  if (perDay.reduce((s, n) => s + n, 0) < 4) return null;
  const open = await openWeekdays(ctx, m);
  const days = [...Array(7).keys()].filter((d) => !open || open.has(d));
  if (days.length < 2) return null;
  const today = localDate(ctx.now(), m.timezone).weekday;
  const ahead = (d: number) => (d - today + 7) % 7;
  const pick = [...days].sort((a, b) => perDay![a]! - perDay![b]! || ahead(a) - ahead(b))[0]!;
  return { weekday: pick, averagePerWeek: Math.round((perDay[pick]! / TREND_WEEKS) * 10) / 10 };
}

const pctDelta = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** One week's report. `start` is any shop-local date in the week; default is this week. */
export async function weekReport(ctx: AppContext, m: Merchant, opts: { start?: string } = {}): Promise<reportsApi.WeekInsight> {
  const tz = m.timezone;
  const now = ctx.now();
  const week = opts.start ? weekStartOfDate(opts.start) : weekStartOf(now, tz);
  const first = addDays(week, -7 * (TREND_WEEKS - 1));
  const { end } = weekBounds(week, tz);
  const [nums, sig, paid, allowance] = await Promise.all([
    numbersByWeek(ctx, m, first, week),
    signalsByWeek(ctx.db, m.id, week, week),
    isFeatureOn(ctx.db, m, "insights.weekly"),
    promoAllowanceFor(ctx, m),
  ]);
  const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => addDays(first, 7 * i));
  const num = (w: string) => nums.byWeek.get(w) ?? zero();
  const cur = num(week);
  const prev = num(addDays(week, -7));
  const fourBefore = [1, 2, 3, 4].map((i) => num(addDays(week, -7 * i)).revenueCents);
  const fourWeekAvgCents = Math.round(fourBefore.reduce((s, n) => s + n, 0) / 4);
  const earlier = weeks.slice(0, -1).map((w) => num(w).revenueCents);
  const sw = sig.get(week) ?? noSignals();
  const goalCents = m.weeklyGoalCents ?? null;
  const bestDay = await bestDayToPromote(ctx, m, nums.source === "appointments" ? nums.weekdayCounts : undefined);
  return {
    weekStart: week,
    weekEnd: addDays(week, 6),
    timezone: tz,
    inProgress: now.getTime() < end.getTime(),
    source: nums.source,
    ...cur,
    previous: prev,
    deltaCents: cur.revenueCents - prev.revenueCents,
    deltaPct: pctDelta(cur.revenueCents, prev.revenueCents),
    fourWeekAvgCents,
    bestWeekOfEight: cur.revenueCents > 0 && Math.max(0, ...earlier) > 0 && cur.revenueCents >= Math.max(...earlier),
    signals: sw.totals,
    fullDay: sw.fullDay ? { date: sw.fullDay.date, weekday: new Date(`${sw.fullDay.date}T12:00:00Z`).getUTCDay(), views: sw.fullDay.views } : null,
    goal: {
      cents: goalCents,
      progress: goalCents && goalCents > 0 ? Math.round((cur.revenueCents / goalCents) * 1000) / 1000 : null,
      reached: !!goalCents && goalCents > 0 && cur.revenueCents >= goalCents,
    },
    report: { weekday: m.weeklyReportWeekday, hour: m.weeklyReportHour },
    bestDayToPromote: bestDay,
    promosLeft: allowance.remaining,
    paid,
    trend: weeks.map((w) => ({ weekStart: w, revenueCents: num(w).revenueCents })),
  };
}

/** The last `weeks` weeks, oldest first, each with its change against the week before. */
export async function weeksHistory(ctx: AppContext, m: Merchant, weeks: number): Promise<reportsApi.WeeksHistory> {
  const thisWeek = weekStartOf(ctx.now(), m.timezone);
  const first = addDays(thisWeek, -7 * weeks); // one extra week at the front so the oldest shown has a delta
  const nums = await numbersByWeek(ctx, m, first, thisWeek);
  const list = Array.from({ length: weeks + 1 }, (_, i) => addDays(first, 7 * i));
  const num = (w: string) => nums.byWeek.get(w) ?? zero();
  return { weeks: list.slice(1).map((w, i) => ({ weekStart: w, ...num(w), deltaCents: num(w).revenueCents - num(list[i]!).revenueCents })) };
}

/** The 14 days P1's trial card and receipt read (pro-value.md 5.3, 5.4). `GET /insights/week?trial=1`. */
export async function trialReceipt(ctx: AppContext, m: Merchant): Promise<reportsApi.TrialReceiptDto> {
  const tz = m.timezone;
  const now = ctx.now();
  const from = new Date(now.getTime() - reportsApi.TRIAL_RECEIPT_DAYS * DAY_MS);
  const [appts, sig] = await Promise.all([
    ctx.db
      .select({ items: appointments.items })
      .from(appointments)
      .where(and(eq(appointments.merchantId, m.id), inArray(appointments.status, MONEY_STATUSES), gte(appointments.startsAt, from), lt(appointments.startsAt, now)))
      .orderBy(asc(appointments.startsAt)),
    signalsByWeek(ctx.db, m.id, weekStartOf(from, tz), weekStartOf(now, tz)),
  ]);
  const sum = (key: SignalKey) => [...sig.values()].reduce((s, w) => ({ count: s.count + w.totals[key].count, amountCents: s.amountCents + w.totals[key].amountCents }), { count: 0, amountCents: 0 });
  const fills = sum("waitlist_fills");
  const rebooked = sum("rebook_booked");
  const addons = sum("addons_sold");
  return {
    days: reportsApi.TRIAL_RECEIPT_DAYS,
    bookings: appts.length,
    amountCents: appts.reduce((s, a) => s + (a.items ?? []).reduce((t, i) => t + (i.priceCents ?? 0), 0), 0),
    fills: fills.count,
    rebooked: rebooked.count,
    reviews: sum("reviews_requested").count,
    addons: addons.count,
    chasedCents: fills.amountCents + rebooked.amountCents + addons.amountCents,
  };
}

/** Save the goal and the report time. A null goal clears it. */
export async function saveSettings(ctx: AppContext, m: Merchant, body: reportsApi.InsightsSettingsBody): Promise<{ weeklyGoalCents: number | null; weeklyReportWeekday: number; weeklyReportHour: number }> {
  const patch: Partial<Pick<Merchant, "weeklyGoalCents" | "weeklyReportWeekday" | "weeklyReportHour">> = {};
  if (body.weeklyGoalCents !== undefined) patch.weeklyGoalCents = body.weeklyGoalCents === 0 ? null : body.weeklyGoalCents;
  if (body.weeklyReportWeekday !== undefined) patch.weeklyReportWeekday = body.weeklyReportWeekday;
  if (body.weeklyReportHour !== undefined) patch.weeklyReportHour = body.weeklyReportHour;
  if (!Object.keys(patch).length) throw badRequest("Nothing to save.");
  const [row] = await ctx.db.update(merchants).set(patch).where(eq(merchants.id, m.id)).returning();
  return { weeklyGoalCents: row!.weeklyGoalCents, weeklyReportWeekday: row!.weeklyReportWeekday, weeklyReportHour: row!.weeklyReportHour };
}

