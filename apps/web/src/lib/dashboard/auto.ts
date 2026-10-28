/** Auto care display helpers (docs/research/auto-care.md). Pure, so they are unit-tested. */
import type { autoApi } from "@ll/shared";
import type { DotTone } from "@/components/dashboard/kit";

/** "Nov 17" from a YYYY-MM-DD, without a time zone shift. */
export function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}
/** "Sat, Nov 1" */
export function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
export const kmLabel = (km: number | null | undefined): string => (km == null ? "" : `${km.toLocaleString("en-CA")} km`);

export function reminderTag(status: autoApi.ReminderStatusDto): { label: string; tone: DotTone } {
  if (status === "overdue") return { label: "Overdue", tone: "negative" };
  if (status === "due_soon") return { label: "Due soon", tone: "accent" };
  if (status === "ok") return { label: "Up to date", tone: "positive" };
  return { label: "Not logged yet", tone: "neutral" };
}

/** "Dec 8 by km (about 46 days)" or "Apr 14 by months": the earlier of the two dates and why. */
export function dueText(r: Pick<autoApi.ReminderDto, "dueOn" | "basis" | "daysToDue">): string {
  if (!r.dueOn || !r.basis) return "Log a service to start the reminder";
  const by = r.basis === "km" ? "by km" : "by months";
  const d = r.daysToDue ?? 0;
  const when = d < 0 ? `${-d} ${d === -1 ? "day" : "days"} ago` : d === 0 ? "today" : `in ${d} ${d === 1 ? "day" : "days"}`;
  return `${shortDate(r.dueOn)} ${by} (${when})`;
}

export function treadTag(s: autoApi.TireSetDto["treadStatus"]): { label: string; tone: DotTone } {
  if (s === "wear_bar") return { label: "At the wear bar", tone: "negative" };
  if (s === "replace_soon") return { label: "Replace soon", tone: "accent" };
  if (s === "ok") return { label: "Good", tone: "positive" };
  return { label: "Not measured", tone: "neutral" };
}
export const seasonLabel = (s: string): string => (s === "winter" ? "Winter" : s === "summer" ? "Summer" : "All-weather");
export const windowLabel = (w: { name: "fall" | "spring"; start: string; end: string }): string => `${w.name === "fall" ? "Fall" : "Spring"} window ${shortDate(w.start)} to ${shortDate(w.end)}`;

/** Percent over the estimate for the ticket: "3.6% over (limit 10%)", "2% under", "same as the estimate". */
export function overText(pct: number): string {
  if (pct > 0) return `${pct}% over the estimate (limit 10%)`;
  if (pct < 0) return `${-pct}% under the estimate`;
  return "Same as the estimate";
}

export const WASH_PLAN_TONE: Record<string, DotTone> = { active: "positive", frozen: "neutral", past_due: "negative", pending: "accent", cancelled: "neutral", expired: "neutral" };
export const planStateLabel = (s: string): string => s.replace("_", " ").replace(/^./, (c) => c.toUpperCase());
