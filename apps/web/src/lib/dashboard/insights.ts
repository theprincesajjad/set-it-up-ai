/** Words and numbers for the weekly money report (Today tile, Reports Week, Settings goal). Pure, so it is unit-tested. docs/business/pro-value.md 3.2 P6 and 5.1. */
import type { reportsApi } from "@ll/shared";

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The locked lines a Free shop sees, each only when its count is above zero (pro-value.md 5.1). */
export type LockedLine = { kind: "cancellations"; n: number } | { kind: "fullDay"; n: number; weekday: number };

export function lockedLines(w: Pick<reportsApi.WeekInsight, "signals" | "fullDay">): LockedLine[] {
  const out: LockedLine[] = [];
  if (w.signals.cancellations.count > 0) out.push({ kind: "cancellations", n: w.signals.cancellations.count });
  if (w.fullDay && w.fullDay.views > 0) out.push({ kind: "fullDay", n: w.fullDay.views, weekday: w.fullDay.weekday });
  return out;
}

/** The "3 cancelled slots filled · 9 rebooked · 7 reviews asked" line on a paid shop: only parts with a count. */
export function signalLine(s: reportsApi.WeekInsight["signals"]): { key: "fills" | "rebooked" | "reviews" | "addons"; n: number }[] {
  return (
    [
      { key: "fills", n: s.waitlist_fills.count },
      { key: "rebooked", n: s.rebook_booked.count },
      { key: "reviews", n: s.reviews_requested.count },
      { key: "addons", n: s.addons_sold.count },
    ] as const
  ).filter((p) => p.n > 0).map((p) => ({ ...p }));
}

/** Is there anything to show for the week (money, visits, last week's money, or any signal)? */
export function hasActivity(w: reportsApi.WeekInsight): boolean {
  return w.revenueCents > 0 || w.visits > 0 || w.previous.revenueCents > 0 || Object.values(w.signals).some((s) => s.count > 0);
}

/** Bar heights in percent for the trend (the tallest is 100; a week with money never draws under 6 so it stays visible). */
export function barHeights(trend: reportsApi.WeekTrendPoint[]): number[] {
  const max = Math.max(0, ...trend.map((t) => t.revenueCents));
  return trend.map((t) => (max === 0 ? 0 : t.revenueCents === 0 ? 2 : Math.max(6, Math.round((t.revenueCents / max) * 100))));
}

/** The mood of the change: ahead is the moment to celebrate, behind is said plainly and never in red, level and quiet are neutral. */
export function deltaTone(w: Pick<reportsApi.WeekInsight, "deltaCents">): "up" | "neutral" {
  return w.deltaCents > 0 ? "up" : "neutral";
}

/** Goal progress as a whole percent for the label, and a 0 to 100 width for the bar. */
export function goalProgress(g: reportsApi.WeekInsight["goal"]): { pct: number; width: number } | null {
  if (g.progress == null || !g.cents) return null;
  const pct = Math.round(g.progress * 100);
  return { pct, width: Math.max(0, Math.min(100, pct)) };
}

/** The promo picker with a day preset: `?day=sat`. */
export const promoHref = (base: string, weekday: number) => `${base}/promos/new?day=${DAY_KEYS[weekday]}`;
export const billingHref = (base: string) => `${base}/billing?plan=plus`;

/** Dollars typed in the goal field to cents; null for empty (no goal); undefined when it is not a whole number of dollars. */
export function dollarsToCents(raw: string): number | null | undefined {
  const s = raw.replace(/[$,\s]/g, "");
  if (s === "") return null;
  if (!/^\d{1,7}$/.test(s)) return undefined;
  return Number(s) * 100;
}

/** The Monday a `?start=` value falls in; falls back to the given default for a bad value. */
export function validStart(raw: string | null | undefined): string | undefined {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T12:00:00Z`)) ? raw : undefined;
}

export function shiftWeek(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 7 * weeks)).toISOString().slice(0, 10);
}

/** A weekday's name (0 = Sunday) in the viewer's language; `date` is the locale formatter's `date`. */
export function weekdayLabel(date: (d: Date, opts: Intl.DateTimeFormatOptions, tz: string) => string, weekday: number, style: "long" | "short" = "long"): string {
  return date(new Date(Date.UTC(2024, 0, 7 + weekday, 12)), { weekday: style }, "UTC");
}
