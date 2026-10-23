/**
 * Reports (cafes-retail.md 7.7): heatmap shading, the rewards-owed sentence and the joiners card. Pure, so unit-tested.
 */
import type { reportsApi } from "@ll/shared";
import { formatMoney } from "@/lib/format";

export const HEAT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
export const HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 0..1 of the busiest cell; a quiet cell is never fully empty so the grid still reads as a grid. */
export function heatLevel(n: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, n / max);
}

/** Percent of ink mixed into the cell: from 8% (nothing) to 92% (the busiest hour). */
export function heatInk(n: number, max: number): number {
  return Math.round(8 + heatLevel(n, max) * 84);
}

/** Visits that fall outside the shown hours (7 am to 6 pm), so the grid never silently hides them. */
export function visitsOutsideWindow(matrix: number[][], hours = HEAT_HOURS): number {
  return matrix.reduce((sum, row) => sum + row.reduce((a, n, h) => (hours.includes(h) ? a : a + n), 0), 0);
}

export function heatTotal(matrix: number[][]): number {
  return matrix.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
}

/** "24 free drinks" */
export function owedHeadline(r: reportsApi.RewardsOwedReport, noun: string): string {
  return `${r.rewardsOwed} ${noun}${r.rewardsOwed === 1 ? "" : "s"}`;
}

/** "248 stamps held by 39 members. About $96 at cost, from your $4.00 cost per drink (estimate; edit the cost in Rewards)." */
export function owedDetail(r: reportsApi.RewardsOwedReport, terminology: string, perNoun: string): string {
  const held = `${r.stampsOutstanding} ${r.stampsOutstanding === 1 ? terminology.replace(/s$/, "") : terminology} held by ${r.members} ${r.members === 1 ? "member" : "members"}.`;
  if (r.estCostCents == null || r.rewardCostCents == null) return `${held} Add what a ${perNoun} costs you in Rewards for a dollar estimate.`;
  return `${held} About ${formatMoney(r.estCostCents).replace(/\.00$/, "")} at cost, from your ${formatMoney(r.rewardCostCents)} cost per ${perNoun} (estimate; edit the cost in Rewards).`;
}

/** "of members who joined 2 to 6 weeks ago (11 of 17)" for the 14-day window. */
export function cameBackShare(j: reportsApi.JoinerReturnReport, days = 14): { pct: number | null; caption: string } {
  const w = j.windows.find((x) => x.days === days);
  if (!j.joined || !w) return { pct: null, caption: "No joiners in this window yet" };
  const weeksAgo = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / (7 * 86_400_000));
  return { pct: Math.round((w.cameBack / j.joined) * 100), caption: `of members who joined ${weeksAgo(j.to)} to ${weeksAgo(j.from)} weeks ago (${w.cameBack} of ${j.joined})` };
}

/** "Joined Sep 11 to Oct 9: 17 members" */
export function joinersTitle(j: reportsApi.JoinerReturnReport): string {
  const d = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" }).format(new Date(iso));
  return `Joined ${d(j.from)} to ${d(j.to)}: ${j.joined} ${j.joined === 1 ? "member" : "members"}`;
}
