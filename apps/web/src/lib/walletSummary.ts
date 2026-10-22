import type { customerApi } from "@ll/shared";
import { unitFor } from "./format";

/**
 * The /me hero number. Points and stamps are different units, so balances are never summed
 * across shops: the headline is the count of rewards ready now, or (when none are ready) the
 * closest reward's remaining progress at one shop.
 */
export interface WalletHeadline {
  kind: "ready" | "closest" | "none";
  value: number;
  /** Under the number: "rewards ready", "stamps to a free drink at Pinecone". */
  label: string;
  /** Label without the shop name, for tight spots (card sheet). */
  shortLabel: string;
  /** Pill: "across 4 shops". */
  context: string;
}

type M = Pick<customerApi.MembershipDto, "balance" | "terminology" | "nextReward" | "rewardsAvailableCount"> & { merchant: { name: string } };

/** "Free drink" → "a free drink"; "$5 off" stays. */
export function rewardPhrase(name: string): string {
  return /^free\s/i.test(name) ? `a ${name.charAt(0).toLowerCase()}${name.slice(1)}` : name;
}

export function walletHeadline(items: M[]): WalletHeadline {
  const shops = items.length;
  const context = `across ${shops} ${shops === 1 ? "shop" : "shops"}`;
  const ready = items.reduce((n, m) => n + m.rewardsAvailableCount, 0);
  const label = ready === 1 ? "reward ready" : "rewards ready";
  if (ready > 0) return { kind: "ready", value: ready, label, shortLabel: label, context };
  // Closest = highest progress % (comparable across units); ties → fewest remaining.
  const closest = items
    .filter((m) => m.nextReward && m.nextReward.pointsNeeded > 0)
    .sort((a, b) => b.nextReward!.progressPct - a.nextReward!.progressPct || a.nextReward!.pointsNeeded - b.nextReward!.pointsNeeded)[0];
  if (closest?.nextReward) {
    const n = closest.nextReward.pointsNeeded;
    const shortLabel = `${unitFor(closest.terminology, n, false)} to ${rewardPhrase(closest.nextReward.name)}`;
    return { kind: "closest", value: n, label: `${shortLabel} at ${closest.merchant.name}`, shortLabel, context };
  }
  return { kind: "none", value: 0, label: "rewards ready", shortLabel: "rewards ready", context };
}
