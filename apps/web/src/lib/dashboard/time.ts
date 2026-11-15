/** Date helpers for dashboard ranges (America/Toronto display; API takes ISO instants). */
const TZ = "America/Toronto";

export type RangeKey = "today" | "7d" | "30d" | "90d";
export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

/** Start of the current Toronto day as an instant. */
export function startOfTorontoDay(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const msIntoDay = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000;
  return new Date(Math.floor(now.getTime() / 1000) * 1000 - msIntoDay);
}

export function rangeFor(key: RangeKey, now = new Date()): { from: string; to: string; label: string } {
  const to = now.toISOString();
  if (key === "today") return { from: startOfTorontoDay(now).toISOString(), to, label: "yesterday" };
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to, label: `previous ${days} days` };
}

export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function longDate(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
}

/** "just now", "5 min ago", "3 h ago", "3 days ago", "Oct 2". */
export function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "Never";
  const ms = now.getTime() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ, month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
}

/** % change, rounded; null when there's no baseline. */
export function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * The growth chip under a number on the reports page. A percentage off a tiny base reads as a bug ("+1933%"), so below
 * `MIN_BASE` in the earlier period, or past +500%, it shows the plain change ("+59") instead. Null when there is nothing to compare with.
 */
export const DELTA_MIN_BASE = 10;
export function changeChip(cur: number, prev: number): { text: string; direction: -1 | 0 | 1 } | null {
  const pct = pctDelta(cur, prev);
  if (pct === null) return null;
  const direction = cur > prev ? 1 : cur < prev ? -1 : 0;
  const plain = prev < DELTA_MIN_BASE || Math.abs(pct) > 500;
  const text = direction === 0 ? "0%" : plain ? `${cur - prev > 0 ? "+" : ""}${cur - prev}` : `${pct > 0 ? "+" : ""}${pct}%`;
  return { text, direction };
}

/** `<input type="datetime-local">` value (Toronto) ↔ ISO. */
export function toLocalInput(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** Interpret a datetime-local value as Toronto wall time and return an ISO instant with offset. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const [date, time = "00:00"] = v.split("T");
  const guess = new Date(`${date}T${time}:00Z`);
  // Toronto is UTC-4 or UTC-5: find the offset that round-trips.
  for (const off of [4, 5]) {
    const cand = new Date(guess.getTime() + off * 3_600_000);
    if (toLocalInput(cand) === `${date}T${time}`) return cand.toISOString();
  }
  return new Date(guess.getTime() + 5 * 3_600_000).toISOString();
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}
