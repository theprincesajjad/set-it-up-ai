/** Plain-language program summaries ("1 stamp per visit. 10 stamps = Free drink."). */
import type { customerApi } from "@ll/shared";
import { formatMoney } from "./format";

type ProgramLike = Pick<customerApi.ProgramSummaryDto, "earnType" | "pointsPerDollar" | "pointsPerVisit" | "stampGoal" | "terminology"> & { minSpendCents?: number; earnUnit?: customerApi.ProgramSummaryDto["earnUnit"]; earnScope?: customerApi.ProgramSummaryDto["earnScope"] };

/** wave-n: the earn unit in words ("visit", "purchase", "order picked up"); a pickup card earns only on online orders. */
const UNIT_WORD = { visit: "visit", purchase: "purchase", pickup: "order picked up" } as const;

export function howYouEarn(p: ProgramLike): string {
  const t = p.terminology || "points";
  const per = UNIT_WORD[p.earnUnit ?? "visit"];
  const some = p.earnScope === "selected" ? " Only some services or items earn." : "";
  if (p.earnType === "stamps") return `${p.pointsPerVisit || 1} ${singular(t, p.pointsPerVisit || 1)} per ${per}${p.minSpendCents ? ` over ${formatMoney(p.minSpendCents)}` : ""}.${some}`;
  if (p.earnType === "per_visit") return `${p.pointsPerVisit} ${singular(t, p.pointsPerVisit)} every ${per}${p.minSpendCents ? ` over ${formatMoney(p.minSpendCents)}` : ""}.${some}`;
  return `${p.pointsPerDollar} ${singular(t, p.pointsPerDollar)} for every $1.${some}`;
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
