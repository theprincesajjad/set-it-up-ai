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
  /** Under the number: "rewards ready", "stamps to go for a free drink at Pinecone". */
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
    const shortLabel = `${unitFor(closest.terminology, n, false)} to go for ${rewardPhrase(closest.nextReward.name)}`;
    return { kind: "closest", value: n, label: `${shortLabel} at ${closest.merchant.name}`, shortLabel, context };
  }
  return { kind: "none", value: 0, label: "rewards ready", shortLabel: "rewards ready", context };
}

/**
 * A barista's Undo within seconds (a wrong tap) is noise to the customer: "Visit +2" then "Reversal -2". Both rows leave
 * the activity list when a reversal follows the entry it cancels by less than `windowMs` for the same shop and amount.
 */
export function hideQuickUndos<T extends { tx: { id: string; type: string; points: number; createdAt: string; reversed?: boolean }; m: { id: string } }>(rows: T[], windowMs = 15_000): T[] {
  const hidden = new Set<string>();
  for (const r of rows) {
    if (r.tx.type !== "reversal") continue;
    const at = Date.parse(r.tx.createdAt);
    const original = rows.find((o) => o.m.id === r.m.id && !hidden.has(o.tx.id) && o.tx.id !== r.tx.id && o.tx.reversed && o.tx.points === -r.tx.points && at - Date.parse(o.tx.createdAt) >= 0 && at - Date.parse(o.tx.createdAt) <= windowMs);
    if (original) {
      hidden.add(r.tx.id);
      hidden.add(original.tx.id);
    }
  }
  return rows.filter((r) => !hidden.has(r.tx.id));
}
