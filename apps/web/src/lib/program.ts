/** Plain-language program summaries ("1 stamp per visit. 10 stamps = Free drink."). */
import type { customerApi } from "@ll/shared";
import { formatMoney } from "./format";

type ProgramLike = Pick<customerApi.ProgramSummaryDto, "earnType" | "pointsPerDollar" | "pointsPerVisit" | "stampGoal" | "terminology"> & { minSpendCents?: number };

export function howYouEarn(p: ProgramLike): string {
  const t = p.terminology || "points";
  if (p.earnType === "stamps") return `${p.pointsPerVisit || 1} ${singular(t, p.pointsPerVisit || 1)} per visit${p.minSpendCents ? ` over ${formatMoney(p.minSpendCents)}` : ""}.`;
  if (p.earnType === "per_visit") return `${p.pointsPerVisit} ${singular(t, p.pointsPerVisit)} every visit${p.minSpendCents ? ` over ${formatMoney(p.minSpendCents)}` : ""}.`;
  return `${p.pointsPerDollar} ${singular(t, p.pointsPerDollar)} for every $1.`;
}

export function rewardLine(p: ProgramLike, reward: { name: string; pointsCost: number } | undefined): string | null {
  if (!reward) return null;
  return `${reward.pointsCost} ${p.terminology || "points"} = ${reward.name}`;
}

function singular(t: string, n: number) {
  return n === 1 && t.endsWith("s") ? t.slice(0, -1) : t;
}

/** Welcome offer pill for the join page: "Join and get 1 free stamp". */
export function welcomeOffer(p: ProgramLike & { welcomeBonus: number }, networkShops?: number): string {
  if (p.welcomeBonus > 0) return `Join and get ${p.welcomeBonus} free ${singular(p.terminology || "points", p.welcomeBonus)}`;
  if (networkShops && networkShops > 1) return `${howYouEarn(p).replace(/\.$/, "")} here and at ${networkShops} shops nearby`;
  return howYouEarn(p);
}
