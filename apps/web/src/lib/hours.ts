/** Opening hours display: { mon: [["09:00","17:00"]], ... } in the shop's timezone. */
import type { networkApi } from "@ll/shared";

const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const LABELS: Record<string, string> = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };

/** "17:30" → "5:30 pm", "09:00" → "9 am". */
export function hhmmToLabel(t: string): string {
  const [hS, mS] = t.split(":");
  const h = Number(hS);
  const m = Number(mS);
  const suffix = h >= 12 && h < 24 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

function localNow(tz: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 3) ?? "mon";
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return { day: KEYS.indexOf(wd as (typeof KEYS)[number]), time: `${hh}:${mm}` };
}

/** "Open · closes 6 pm" / "Closed · opens 8 am" / null when hours aren't set. */
export function openStatus(hours: networkApi.OpeningHours | null | undefined, tz = "America/Toronto", now = new Date()): { open: boolean; label: string } | null {
  if (!hours || !Object.keys(hours).length) return null;
  const { day, time } = localNow(tz, now);
  const today = hours[KEYS[day]!] ?? [];
  for (const [o, c] of today) {
    const overnight = c < o;
    if ((time >= o && (overnight || time < c)) || (overnight && time < c)) return { open: true, label: `Open · closes ${hhmmToLabel(c)}` };
  }
  const later = today.find(([o]) => o > time);
  if (later) return { open: false, label: `Closed · opens ${hhmmToLabel(later[0])}` };
  for (let i = 1; i <= 7; i++) {
    const k = KEYS[(day + i) % 7]!;
    const first = hours[k]?.[0];
    if (first) return { open: false, label: `Closed · opens ${i === 1 ? "" : `${LABELS[k]!.slice(0, 3)} `}${hhmmToLabel(first[0])}` };
  }
  return { open: false, label: "Closed" };
}

export type OpenCore = { open: boolean; kind: "closes" | "opens" | "plain"; hhmm?: string; dayKey?: (typeof KEYS)[number]; sameDay?: boolean };

/** The same walk as `openStatus`, as data (so another language can word it): open until a time, closed until a time (and day), or just open / closed. */
export function openCore(hours: networkApi.OpeningHours | null | undefined, tz = "America/Toronto", now = new Date()): OpenCore | null {
  if (!hours || !Object.keys(hours).length) return null;
  const { day, time } = localNow(tz, now);
  const today = hours[KEYS[day]!] ?? [];
  for (const [o, c] of today) {
    const overnight = c < o;
    if ((time >= o && (overnight || time < c)) || (overnight && time < c)) return { open: true, kind: "closes", hhmm: c };
  }
  const later = today.find(([o]) => o > time);
  if (later) return { open: false, kind: "opens", hhmm: later[0], dayKey: KEYS[day]!, sameDay: true };
  for (let i = 1; i <= 7; i++) {
    const k = KEYS[(day + i) % 7]!;
    const first = hours[k]?.[0];
    if (first) return { open: false, kind: "opens", hhmm: first[0], dayKey: k, sameDay: i === 1 };
  }
  return { open: false, kind: "plain" };
}

/** Rows for a week table, Monday first. */
export function weekRows(hours: networkApi.OpeningHours | null | undefined): { day: string; text: string }[] {
  if (!hours) return [];
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((k) => ({
    day: LABELS[k]!,
    text: (hours[k] ?? []).length ? (hours[k] ?? []).map(([o, c]) => `${hhmmToLabel(o)}–${hhmmToLabel(c)}`).join(", ") : "Closed",
  }));
}
