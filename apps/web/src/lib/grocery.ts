/**
 * Pure helpers for the grocer and butcher screens (docs/research/grocers.md): money and weight words, the deal price line,
 * the weigh-in preview, the season strip and the pantry words. No React, so they are unit-tested (test/grocery.test.ts).
 */
import { formatWeight, gramsPerUnit, per100gLabel, rewardBackPct, weighedLineCents, type GrocerSeason, type groceryApi } from "@ll/shared";
import { pickupDays } from "@/lib/restaurant/order";

export type WeightUnit = "kg" | "lb";

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

/** "$21.99", "$13.99/kg" for a deal price. */
export function dealPriceLabel(d: Pick<groceryApi.DealDto, "priceCents" | "priceUnit">): string {
  return `${dollars(d.priceCents)}${d.priceUnit === "each" ? "" : `/${d.priceUnit}`}`;
}

/** "$1.37/100 g" under the price, or null when it cannot be worked out. */
export function dealPerUnitLine(d: Pick<groceryApi.DealDto, "per100gCents">): string | null {
  return d.per100gCents == null ? null : per100gLabel(d.per100gCents);
}

/** "Mon 2 Nov to Sun 8 Nov" for a deal's dates (plain YYYY-MM-DD in the shop's zone). */
export function dealDates(startsOn: string, endsOn: string): string {
  const f = (k: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${k}T12:00:00Z`));
  return startsOn === endsOn ? f(startsOn) : `${f(startsOn)} to ${f(endsOn)}`;
}

/** "in 3 days", "tomorrow", "today", "3 days ago". */
export function daysWords(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** The line on a season card: when the stock-up flyer should go out. */
export function seasonFlyerLine(s: Pick<GrocerSeason, "flyerDue" | "flyerFrom" | "daysUntil" | "qurbani" | "bookingsOpen">): string {
  if (s.qurbani && s.bookingsOpen) return s.flyerDue ? "Bookings should be open: set animals per day" : `Open bookings on ${dealDates(s.bookingsOpen, s.bookingsOpen)}`;
  return s.flyerDue ? "Put the stock-up flyer out now" : `Flyer from ${dealDates(s.flyerFrom, s.flyerFrom)}`;
}

/** Dollars typed in a field ("13.99") to cents, or null when it is not a price. */
export function priceToCents(v: string): number | null {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** Grams from what the cashier types at the scale: "2.14" in the shop's unit (kg or lb) to whole grams, or null. */
export function weightToGrams(v: string, unit: WeightUnit): number | null {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const g = Math.round(n * gramsPerUnit(unit));
  return g >= 1 && g <= 300_000 ? g : null;
}

export interface WeighPreview {
  /** What this line weighs out to, in cents. */
  lineCents: number;
  /** The difference from the estimate the customer saw. */
  deltaCents: number;
  /** "2.14 kg" */
  weightText: string;
}

/** What one weighed line will cost, and how far it is from the estimate. */
export function weighPreview(perUnitCents: number, unit: WeightUnit, grams: number, estimateCents: number): WeighPreview {
  const lineCents = weighedLineCents(perUnitCents, unit, grams);
  return { lineCents, deltaCents: lineCents - estimateCents, weightText: formatWeight(grams, unit) };
}

/** "+$2.00 over the estimate" / "$1.00 under" / "same as the estimate". */
export function deltaWords(deltaCents: number): string {
  if (deltaCents === 0) return "same as the estimate";
  return `${dollars(Math.abs(deltaCents))} ${deltaCents > 0 ? "over" : "under"} the estimate`;
}

/** The sentence under the reward setup: "Giving back 0.5% of what members spend". null when it cannot be worked out. */
export function rewardCostLine(pointsPerDollar: number, pointsCost: number, rewardValueCents: number): string | null {
  const pct = rewardBackPct(pointsPerDollar, pointsCost, rewardValueCents);
  return pct == null ? null : `Giving back ${pct}% of what members spend`;
}

/** Pantry: "every 6 weeks" for an interval in days. */
export function intervalWords(days: number): string {
  if (days < 14) return `every ${days} days`;
  const w = Math.round(days / 7);
  return w < 9 ? `every ${w} weeks` : `every ${Math.round(days / 30)} months`;
}

/** Order status words for the butcher list. */
export const BUTCHER_STATUS: Record<groceryApi.GroceryHomeResponse["butcher"][number]["status"], { label: string; tone: "accent" | "positive" | "neutral" }> = {
  weigh: { label: "Weigh at pick-up", tone: "accent" },
  deposit_paid: { label: "Deposit paid", tone: "positive" },
  paid: { label: "Paid", tone: "positive" },
  unpaid: { label: "Pay at pick-up", tone: "neutral" },
};

// ---------------------------------------------------------------------------
// Restock reserve page (frame 12): pick-up windows for a staple that is already on the shelf
// ---------------------------------------------------------------------------
export interface RestockWindow {
  /** Shop-local YYYY-MM-DD. */
  date: string;
  /** Wall clock "09:00" and "12:00". */
  start: string;
  end: string;
  /** The instant the order asks for: the start of the window. */
  iso: string;
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Up to three three-hour windows on the first day the shop is open with an hour's notice ("Sat 9 am to 12", "Sat 12 to 4"),
 * from the opening hours. The order asks for the start of the window. Empty when nothing is bookable in the next four days.
 */
export function restockWindows(hours: Parameters<typeof pickupDays>[0], now: Date, noticeMin = 60): RestockWindow[] {
  const day = pickupDays(hours, now, noticeMin, 4)[0];
  if (!day || !day.times.length) return [];
  const last = minutesOf(day.times[day.times.length - 1]!.hhmm) + 15;
  const out: RestockWindow[] = [];
  let startMin = minutesOf(day.times[0]!.hhmm);
  // Start on the hour when the first time is within 15 minutes of it, so "9 am" not "9:15".
  startMin = Math.ceil(startMin / 60) * 60 - startMin <= 15 ? Math.ceil(startMin / 60) * 60 : startMin;
  while (out.length < 3 && startMin < last) {
    const t = day.times.find((x) => minutesOf(x.hhmm) >= startMin);
    if (!t) break;
    const end = Math.min(minutesOf(t.hhmm) + 180, last);
    out.push({ date: day.date, start: t.hhmm, end: clock(end), iso: t.iso });
    startMin = end;
  }
  return out;
}

/** "every 6 weeks" from the days a purchase lasts (42 days). Rounds to whole weeks, never below one. */
export function restockEveryWeeks(intervalDays: number): number {
  return Math.max(1, Math.round(intervalDays / 7));
}
