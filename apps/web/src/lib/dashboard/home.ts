/**
 * Home (café & retail) pure helpers: morning vs close mode, comparison copy, chart scaling.
 * Pure so they are unit-tested; the components in components/dashboard/home only draw.
 */
import { reportsApi } from "@ll/shared";

const TZ = "America/Toronto";

export type HomeMode = "morning" | "close";

/** Hour 0-23 in Toronto. */
export function hourInToronto(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
}

/** Before noon (Toronto) the home answers "is today normal"; after, "how was today". `?mode=` overrides for QA. */
export function homeMode(now: Date, override?: string | null): HomeMode {
  if (override === "morning" || override === "close") return override;
  return hourInToronto(now) < 12 ? "morning" : "close";
}

export const weekdayName = (d: Date, timeZone = TZ) => new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "long" }).format(d);

/** "+3% vs a typical Wednesday (127)"; null when there is no typical to compare against. */
export function vsTypical(visits: number, typical: number, weekday: string): { text: string; good: boolean | null } | null {
  if (!typical) return null;
  const pct = Math.round(((visits - typical) / typical) * 100);
  return { text: `${pct > 0 ? "+" : ""}${pct}% vs a typical ${weekday} (${typical})`, good: pct > 0 ? true : pct < 0 ? false : null };
}

/** "7a", "8" ... "12p", "1": the Figma axis labels (am/pm only at the ends and at noon). */
export function hourTick(hour: number): string {
  if (hour === 7) return "7a";
  if (hour === 12) return "12p";
  return String(hour > 12 ? hour - 12 : hour);
}

/** Heights in px (0..maxPx) for a series, scaled to the largest value across the given series. */
export function barHeights(series: number[][], maxPx = 140): number[][] {
  const max = Math.max(1, ...series.flat());
  return series.map((s) => s.map((v) => (v <= 0 ? 0 : Math.max(2, Math.round((v / max) * maxPx * 10) / 10))));
}

/** Hours (7..18) inside a promo's start/end ("14:00" to "16:00"), for the shaded band. */
export function promoHours(startTime: string | null, endTime: string | null, hours: number[]): number[] {
  const from = startTime ? Number(startTime.slice(0, 2)) : hours[0]!;
  const to = endTime ? Number(endTime.slice(0, 2)) + (endTime.slice(3, 5) === "00" ? 0 : 1) : hours[hours.length - 1]! + 1;
  return hours.filter((h) => h >= from && h < to);
}

/** "2–4 pm" from "14:00" and "16:00". */
export function windowLabel(startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return "all day";
  const a = startTime ? Number(startTime.slice(0, 2)) : 0;
  const b = endTime ? Number(endTime.slice(0, 2)) : 24;
  const ap = (h: number) => (h < 12 || h === 24 ? "am" : "pm");
  const h12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);
  return ap(a) === ap(b) ? `${h12(a)}–${h12(b)} ${ap(b)}` : `${h12(a)} ${ap(a)}–${h12(b)} ${ap(b)}`;
}

/** Shift label: "Sam · 7 am to 3 pm", or just the name. */
export const staffLabel = (s: { name: string; shift: string | null }) => (s.shift ? `${s.name.split(" ")[0]} · ${s.shift}` : s.name.split(" ")[0]!);

/** Footer under "Slipping away": "9 of 11 agreed to texts. The other 2 will not be messaged." */
export function slippingFooter(canText: number, count: number): string {
  if (count === 0) return "";
  if (canText === count) return `All ${count} agreed to texts.`;
  if (canText === 0) return `None of the ${count} agreed to texts, so none will be messaged.`;
  const rest = count - canText;
  return `${canText} of ${count} agreed to texts. The other ${rest} will not be messaged.`;
}

/** Typical rhythm sentence on the Slipping away header, e.g. "11 regulars · slipping against their own rhythm". */
export const slippingMeta = (count: number) => `${count} regular${count === 1 ? "" : "s"} · overdue against their own rhythm`;

export const { isRegular, isSlipping } = reportsApi;

/** What one reward is called on Home: "free drink" at a café, "free pastry" at a bakery, otherwise "reward". */
export function rewardNoun(vertical: string | undefined, plural = false): string {
  const one = vertical === "cafe" ? "free drink" : vertical === "bakery" ? "free pastry" : "reward";
  return plural ? `${one}s` : one;
}

const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const hhmm12 = (t: string) => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 && h < 24 ? "pm" : "am"}`;
};

/** "opens 7:00 am" before opening and during the morning, "closed 6:00 pm" once the shop has shut (today's hours). */
export function hoursNote(hours: Record<string, [string, string][]> | null | undefined, mode: HomeMode, now: Date): string | null {
  const wd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "short" }).format(now).toLowerCase().slice(0, 3);
  const today = hours?.[KEYS.includes(wd as (typeof KEYS)[number]) ? wd : "mon"]?.[0];
  if (!today) return null;
  return mode === "morning" ? `opens ${hhmm12(today[0])}` : `closed ${hhmm12(today[1])}`;
}

/** "412 Roncesvalles Ave" → "412 Roncesvalles" (street type dropped, as on the frames). */
export const shortAddress = (a: string | null | undefined) => (a ?? "").replace(/\s+(Ave|Avenue|St|Street|Rd|Road|Blvd|Dr|Drive)\.?$/i, "").trim();

/** "yesterday 4:12 pm", "today 8:05 am", "2 days ago", "Oct 1". */
export function lastSeen(iso: string | null | undefined, now: Date): string {
  if (!iso) return "no visits yet";
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const days = Math.round((Date.parse(day(now)) - Date.parse(day(d))) / 86_400_000);
  const time = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d).replace(/\./g, "").replace("a m", "am").replace("p m", "pm");
  if (days <= 0) return `today ${time}`;
  if (days === 1) return `yesterday ${time}`;
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "short", day: "numeric" }).format(d);
}

/** "Oct 1": the date a slipping regular last came in. */
export const shortDay = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "short", day: "numeric" }).format(new Date(iso)) : "never");

/** "Thursday, Oct 23" (Toronto). */
export const dayLine = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" }).format(now);
