/**
 * Report periods for the BIA console: "last 30 / 90 days" (the API's default window, so no from/to) and calendar
 * quarters in Toronto time. A period is `{ from, to }` ISO instants with `to` exclusive, as the API expects.
 */
const TZ = "America/Toronto";

export interface Period {
  id: string;
  label: string;
  /** Undefined for rolling windows: the API then uses the last `days` days to now. */
  from?: string;
  to?: string;
  days: number;
}

export const ROLLING: Period[] = [
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

/** Offset of Toronto from UTC at `at`, in ms (negative). */
function tzOffsetMs(at: number): number {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(at / 1000) * 1000;
}

/** The instant of 00:00 on a Toronto calendar day. */
export function torontoMidnight(year: number, month0: number, day: number): Date {
  const guess = Date.UTC(year, month0, day);
  const first = guess - tzOffsetMs(guess);
  return new Date(guess - tzOffsetMs(first));
}

/** The last `n` calendar quarters including the one `now` falls in, newest first: "Q4 2026". */
export function quarters(now: Date, n = 4): Period[] {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "numeric" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m0 = Number(parts.find((p) => p.type === "month")!.value) - 1;
  let q = Math.floor(m0 / 3);
  let year = y;
  const out: Period[] = [];
  for (let i = 0; i < n; i++) {
    const from = torontoMidnight(year, q * 3, 1);
    const to = torontoMidnight(q === 3 ? year + 1 : year, ((q + 1) % 4) * 3, 1);
    out.push({ id: `${year}-Q${q + 1}`, label: `Q${q + 1} ${year}`, from: from.toISOString(), to: to.toISOString(), days: Math.round((to.getTime() - from.getTime()) / 86_400_000) });
    q -= 1;
    if (q < 0) {
      q = 3;
      year -= 1;
    }
  }
  return out;
}

/** "Last 30 days compared with the 30 before." / "Q4 2026 compared with the period before." */
export function comparisonLine(p: Period): string {
  return p.from ? `${p.label} compared with the period before.` : `${p.label} compared with the ${p.days} before.`;
}

/** Query for the API: nothing for a rolling window. */
export const periodQuery = (p: Period): { from?: string; to?: string } => (p.from ? { from: p.from, to: p.to } : {});
