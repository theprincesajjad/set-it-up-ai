/**
 * The counters behind the weekly report and the upgrade moments (docs/business/pro-value.md 3.2 P6).
 *
 * Other workstreams write here through ONE helper, `recordSignal(ctx, merchantId, key, { count, amountCents })`: it upserts into the
 * shop's week bucket (Monday to Sunday in the shop's timezone). A counter is never worth failing the action that caused it, so a
 * write that fails is logged and swallowed. Rows carry no personal data.
 *
 * Keys (SIGNAL_KEYS): cancellations, waitlist_asks, waitlist_fills, full_day_views, rebook_due, rebook_sent, rebook_booked,
 * reviews_requested, reviews_google, addons_sold, promo_bookings. Amounts are the booked money the event brought (cents), where one exists.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { merchantSignals, merchants, staffHours, type DbOrTx } from "@ll/db";
import { reportsApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { addDays, zonedToUtc } from "./bookings.js";

export const SIGNAL_KEYS = reportsApi.SIGNAL_KEYS;
export type SignalKey = reportsApi.SignalKey;

/** The one extra key: the full day a client looked at, `full_day_views@YYYY-MM-DD` (count only), so the tile can name the day. */
const FULL_DAY_PREFIX = "full_day_views@";

/** The shop-local calendar date and weekday (0 = Sunday) of an instant. */
export function localDate(at: Date, timeZone: string): { date: string; weekday: number } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { date, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** The Monday (YYYY-MM-DD, shop time) of the week containing `at`. */
export function weekStartOf(at: Date, timeZone: string): string {
  const { date, weekday } = localDate(at, timeZone);
  return addDays(date, -((weekday + 6) % 7));
}

/** The Monday of the week containing a shop-local date string. */
export function weekStartOfDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** The instants a week spans: [start, end), midnight to midnight in the shop's timezone (a DST week is 167 or 169 hours). */
export function weekBounds(weekStart: string, timeZone: string): { start: Date; end: Date } {
  return { start: zonedToUtc(weekStart, 0, timeZone), end: zonedToUtc(addDays(weekStart, 7), 0, timeZone) };
}

async function timezoneOf(db: DbOrTx, merchantId: string): Promise<string | null> {
  const [m] = await db.select({ tz: merchants.timezone }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  return m?.tz ?? null;
}

/**
 * Count one thing that happened for a shop this week. `count` defaults to 1; `amountCents` is the money it brought (default 0).
 * Never throws.
 */
export async function recordSignal(
  ctx: Pick<AppContext, "db" | "now">,
  merchantId: string,
  key: SignalKey,
  opts: { count?: number; amountCents?: number; at?: Date } = {},
): Promise<void> {
  try {
    const count = Math.max(0, Math.round(opts.count ?? 1));
    const amountCents = Math.round(opts.amountCents ?? 0);
    if (count === 0 && amountCents === 0) return;
    const tz = await timezoneOf(ctx.db, merchantId);
    if (!tz) return;
    await upsert(ctx.db, merchantId, weekStartOf(opts.at ?? ctx.now(), tz), key, count, amountCents);
  } catch (err) {
    console.error("[signals.record]", merchantId, key, err);
  }
}

async function upsert(db: DbOrTx, merchantId: string, periodStart: string, key: string, count: number, amountCents: number): Promise<void> {
  await db
    .insert(merchantSignals)
    .values({ merchantId, periodStart, key, count, amountCents })
    .onConflictDoUpdate({
      target: [merchantSignals.merchantId, merchantSignals.periodStart, merchantSignals.key],
      set: { count: sql`${merchantSignals.count} + ${count}`, amountCents: sql`${merchantSignals.amountCents} + ${amountCents}` },
    });
}

/** A client looked at a day with no openings (the public availability endpoint). Writes the total and the per-day row. */
export async function recordFullDayView(ctx: Pick<AppContext, "db" | "now">, merchantId: string, date: string): Promise<void> {
  try {
    const tz = await timezoneOf(ctx.db, merchantId);
    if (!tz) return;
    const week = weekStartOf(ctx.now(), tz);
    await upsert(ctx.db, merchantId, week, "full_day_views", 1, 0);
    await upsert(ctx.db, merchantId, week, `${FULL_DAY_PREFIX}${date}`, 1, 0);
  } catch (err) {
    console.error("[signals.fullDay]", merchantId, err);
  }
}

export interface SignalWeek {
  totals: Record<SignalKey, reportsApi.SignalTotal>;
  fullDay: { date: string; views: number } | null;
}

const emptyTotals = (): Record<SignalKey, reportsApi.SignalTotal> => Object.fromEntries(SIGNAL_KEYS.map((k) => [k, { count: 0, amountCents: 0 }])) as Record<SignalKey, reportsApi.SignalTotal>;

/** Every signal for each week in [from, to] (Mondays), keyed by week. Weeks with no rows come back all zero. */
export async function signalsByWeek(db: DbOrTx, merchantId: string, from: string, to: string): Promise<Map<string, SignalWeek>> {
  const rows = await db
    .select()
    .from(merchantSignals)
    .where(and(eq(merchantSignals.merchantId, merchantId), gte(merchantSignals.periodStart, from), lte(merchantSignals.periodStart, to)));
  const out = new Map<string, SignalWeek>();
  const weekOf = (w: string) => out.get(w) ?? out.set(w, { totals: emptyTotals(), fullDay: null }).get(w)!;
  for (const r of rows) {
    const w = weekOf(r.periodStart);
    if ((SIGNAL_KEYS as readonly string[]).includes(r.key)) w.totals[r.key as SignalKey] = { count: r.count, amountCents: r.amountCents };
    else if (r.key.startsWith(FULL_DAY_PREFIX) && (!w.fullDay || r.count > w.fullDay.views)) w.fullDay = { date: r.key.slice(FULL_DAY_PREFIX.length), views: r.count };
  }
  return out;
}

export const noSignals = (): SignalWeek => ({ totals: emptyTotals(), fullDay: null });

/**
 * The public availability endpoint calls this with what it is about to return: every upcoming day the shop works that has no openings
 * counts as one look at a full day (full_day_views). No client data is read or kept.
 */
export async function noteFullDays(
  ctx: Pick<AppContext, "db" | "now">,
  merchant: { id: string; timezone: string },
  av: { days: { date: string; times: unknown[] }[] },
): Promise<void> {
  try {
    const empty = av.days.filter((d) => d.times.length === 0 && d.date >= localDate(ctx.now(), merchant.timezone).date);
    if (!empty.length) return;
    const rows = await ctx.db.selectDistinct({ weekday: staffHours.weekday }).from(staffHours).where(eq(staffHours.merchantId, merchant.id));
    const worked = new Set(rows.map((r) => r.weekday));
    for (const d of empty) {
      const [y, m, day] = d.date.split("-").map(Number) as [number, number, number];
      if (worked.has(new Date(Date.UTC(y, m - 1, day)).getUTCDay())) await recordFullDayView(ctx, merchant.id, d.date);
    }
  } catch (err) {
    console.error("[signals.noteFullDays]", merchant.id, err);
  }
}
