import type { merchantApi } from "@ll/shared";

export const DAY_LABEL: Record<merchantApi.DayKey, string> = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
export const DAY_ORDER: merchantApi.DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type HoursDraft = Record<merchantApi.DayKey, { closed: boolean; open: string; close: string }>;

export function hoursDraft(h: merchantApi.Hours | null | undefined): HoursDraft {
  const out = {} as HoursDraft;
  for (const d of DAY_ORDER) {
    const r = h?.[d]?.[0];
    out[d] = r ? { closed: false, open: r[0], close: r[1] } : { closed: true, open: "09:00", close: "17:00" };
  }
  return out;
}

export function hoursFromDraft(d: HoursDraft): merchantApi.Hours {
  const out: merchantApi.Hours = {};
  for (const k of DAY_ORDER) out[k] = d[k].closed ? [] : [[d[k].open, d[k].close]];
  return out;
}

/** "09:00" to "9 a.m.", "17:30" to "5:30 p.m." (the dashboard's one time style). */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h == null || Number.isNaN(h)) return hhmm;
  const mins = m ? `:${String(m).padStart(2, "0")}` : "";
  return `${h % 12 === 0 ? 12 : h % 12}${mins} ${h < 12 ? "a.m." : "p.m."}`;
}

export function hoursSummary(h: merchantApi.Hours | null | undefined): string {
  if (!h) return "Hours not set";
  const open = DAY_ORDER.filter((d) => h[d]?.length);
  if (!open.length) return "Closed all week";
  const first = h[open[0]!]![0]!;
  const same = open.every((d) => h[d]![0]![0] === first[0] && h[d]![0]![1] === first[1]);
  return same ? `${open.length === 7 ? "Every day" : `${open.length} days a week`} · ${clock12(first[0])} to ${clock12(first[1])}` : `${open.length} days a week`;
}
