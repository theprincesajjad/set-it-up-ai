/**
 * The phone owner Today (Clear, mock `?s=today-m`): greeting, four stat cards, "Needs you" and visits by hour. Same rules as the
 * web's lib/dashboard/today.ts so the two never disagree: a comparison only when there is a real one, captions only when they
 * mean something, no sparklines. Owners and managers get the report; staff see the counter's own numbers without comparisons.
 *
 * Pure module (`ownerToday.test.ts`).
 */
import type { MessageKey, reportsApi, staffApi, Vars } from "@ll/shared";

export interface Fmt {
  t: (key: MessageKey, vars?: Vars) => string;
  number: (n: number) => string;
}

export type ChipTone = "up" | "neutral" | "info";
export type StatIcon = "users" | "ticket" | "gift" | "user";

export interface StatCard {
  key: string;
  icon: StatIcon;
  label: string;
  value: string;
  chip: { text: string; tone: ChipTone; arrow: boolean } | null;
}

export interface NeedsItem {
  key: string;
  icon: "gift" | "message";
  title: string;
  subtitle: string;
}

/** "Good morning, Sana": the key and whether it takes a name. */
export function greetingKey(hour: number, named: boolean): MessageKey {
  const part = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return `shell.today.good${part}${named ? "" : "Plain"}` as MessageKey;
}

/** A real comparison against the same weekday, or null. Under 8 typical it is a count ("+2 vs last Wed"), above that a percentage. */
export function deltaVs(cur: number, typical: number | null | undefined, weekday: string, f: Fmt): { text: string; good: boolean | null } | null {
  if (typical == null || (typical <= 0 && cur <= 0)) return null;
  const good = cur > typical ? true : cur < typical ? false : null;
  if (cur === typical) return { text: f.t("shell.today.sameAs", { weekday }), good: null };
  if (typical < 8) {
    const diff = cur - typical;
    return { text: f.t("shell.today.diffVs", { diff: `${diff > 0 ? "+" : "−"}${f.number(Math.abs(diff))}`, weekday }), good };
  }
  const pct = Math.round(((cur - typical) / typical) * 100);
  return { text: f.t("shell.today.pctVs", { pct: `${pct > 0 ? "+" : "−"}${f.number(Math.abs(pct))}%`, weekday }), good };
}

const termKey = (terminology: string | null | undefined): MessageKey =>
  terminology === "stars" ? "shell.today.starsGiven" : terminology === "points" ? "shell.today.pointsGiven" : "shell.today.stampsGiven";

/** The four stat cards. `report` (owner, manager) adds the comparisons and captions; without it the counter numbers stand alone. */
export function statCards(input: { report: reportsApi.TodayReportDto | null; counter: staffApi.TodayResponse | null; terminology: string | null; weekday: string }, f: Fmt): StatCard[] {
  const d = input.report?.today;
  const c = input.counter;
  const num = (a: number | undefined, b: number | undefined) => (a ?? b) != null ? f.number((a ?? b)!) : "–";
  const visits = d ? deltaVs(d.visits, d.typicalVisitsSoFar, input.weekday, f) : null;
  const waiting = input.report?.rewardsWaiting.count ?? 0;
  return [
    { key: "visits", icon: "users", label: f.t("shell.today.visits"), value: num(d?.visits, c?.visitCount), chip: visits ? { text: visits.text, tone: visits.good ? "up" : "neutral", arrow: visits.good === true } : null },
    { key: "given", icon: "ticket", label: f.t(termKey(input.terminology)), value: num(d?.stampsGiven, c?.pointsIssued), chip: null },
    { key: "redeemed", icon: "gift", label: f.t("shell.today.redeemed"), value: num(d?.redemptions, c?.redemptions), chip: waiting > 0 ? { text: f.t("shell.today.waitingN", { n: f.number(waiting) }), tone: "neutral", arrow: false } : null },
    { key: "new", icon: "user", label: f.t("shell.today.newMembers"), value: num(d?.newMembers, c?.newMembers), chip: d && d.newMembers === 0 ? { text: f.t("shell.today.nobodyJoined"), tone: "neutral", arrow: false } : null },
  ];
}

/** "Needs you": rewards waiting and regulars slipping away, in that order (the two loyalty rows that exist on every trade). */
export function needsItems(report: reportsApi.TodayReportDto | null, f: Fmt): NeedsItem[] {
  if (!report) return [];
  const rows: NeedsItem[] = [];
  if (report.rewardsWaiting.count > 0) rows.push({ key: "rewards", icon: "gift", title: f.t("shell.today.rewardsWaiting", { n: report.rewardsWaiting.count }), subtitle: f.t("shell.today.rewardsWaitingSub") });
  if (report.slipping.count > 0) rows.push({ key: "slipping", icon: "message", title: f.t("shell.today.slipping", { n: report.slipping.count }), subtitle: f.t("shell.today.slippingSub") });
  return rows;
}

export interface HourBars {
  /** 0..1 of the busiest hour (min 0.02 so an empty hour still draws a hairline bar). */
  heights: number[];
  hours: number[];
  /** Index of the current hour (the trade-coloured bar), or -1 outside opening hours. */
  current: number;
  peakHour: number | null;
}

export function hourBars(report: reportsApi.TodayReportDto | null, nowHour: number): HourBars | null {
  const h = report?.hourly;
  if (!h || h.hours.length === 0) return null;
  const max = Math.max(1, ...h.today);
  const peakIdx = h.today.reduce((best, v, i) => (v > (h.today[best] ?? 0) ? i : best), 0);
  return {
    heights: h.today.map((v) => Math.max(0.02, v / max)),
    hours: h.hours,
    current: h.hours.indexOf(nowHour),
    peakHour: (h.today[peakIdx] ?? 0) > 0 ? (h.hours[peakIdx] ?? null) : null,
  };
}
