import type { customerApi } from "@ll/shared";
import { unitWord, type Locale, type MessageKey, type Vars } from "@ll/shared";
import { formatNumber, termWord } from "./award";

/** Pass `{ locale, t }` to get the hero in the shopper's language; English keeps the wording below. */
export interface HeroI18n {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
}

type Membership = Pick<customerApi.MembershipDto, "id" | "merchant" | "terminology" | "nextReward" | "rewardsAvailableCount">;

/**
 * The Home hero's "one big number" (references.md § 2). Points and stamps are
 * different units, so the hero never adds balances together:
 * - `ready`: how many rewards can be redeemed right now, and at how many shops.
 * - `progress`: no reward ready; the closest reward in that shop's own unit.
 * - `shops`: no reward to work toward anywhere; how many shops are in the wallet.
 * - `empty`: no shops yet (Home shows the empty state instead).
 */
export type HomeHero =
  | { kind: "empty" }
  | { kind: "ready"; count: number; shopCount: number; shopName: string | null }
  | { kind: "progress"; toGo: number; unit: string; rewardName: string; shopName: string; value: number; max: number; memberId: string }
  | { kind: "shops"; count: number };

export function homeHero(memberships: readonly Membership[]): HomeHero {
  if (memberships.length === 0) return { kind: "empty" };

  const withReady = memberships.filter((m) => m.rewardsAvailableCount > 0);
  if (withReady.length > 0) {
    const count = withReady.reduce((n, m) => n + m.rewardsAvailableCount, 0);
    return { kind: "ready", count, shopCount: withReady.length, shopName: withReady.length === 1 ? withReady[0]!.merchant.name : null };
  }

  // Closest = furthest along (a % is comparable across units); ties go to fewer to go, then name.
  const closest = memberships
    .filter((m): m is Membership & { nextReward: customerApi.NextRewardDto } => !!m.nextReward && m.nextReward.pointsNeeded > 0)
    .sort((a, b) => progressOf(b) - progressOf(a) || a.nextReward.pointsNeeded - b.nextReward.pointsNeeded || a.merchant.name.localeCompare(b.merchant.name))[0];
  if (closest) {
    const r = closest.nextReward;
    return {
      kind: "progress",
      toGo: r.pointsNeeded,
      unit: termWord(closest.terminology, r.pointsNeeded),
      rewardName: rewardPhrase(r.name),
      shopName: closest.merchant.name,
      value: Math.max(0, r.pointsCost - r.pointsNeeded),
      max: r.pointsCost,
      memberId: closest.id,
    };
  }
  return { kind: "shops", count: memberships.length };
}

function progressOf(m: { nextReward: customerApi.NextRewardDto }): number {
  const r = m.nextReward;
  return r.pointsCost > 0 ? (r.pointsCost - r.pointsNeeded) / r.pointsCost : r.progressPct / 100;
}

/** "Free drink" → "a free drink"; other names ("$5 off", "Tote bag") stay as they are. */
export function rewardPhrase(name: string): string {
  return /^free\s/i.test(name) ? `a ${name.charAt(0).toLowerCase()}${name.slice(1)}` : name;
}

/** Text for the hero: big number, the line under it, the chip, and one accessibility label. */
export function heroText(h: Exclude<HomeHero, { kind: "empty" }>, i18n?: HeroI18n): { big: string; line: string; chip: string; label: string } {
  if (i18n && i18n.locale !== "en") {
    const { t } = i18n;
    switch (h.kind) {
      case "ready": {
        const line = t("sh.wallet.heroReady", { n: h.count });
        const chip = h.shopName ? t("sh.hero.atShop", { shop: h.shopName }) : t("sh.wallet.heroAcross", { n: h.shopCount });
        return { big: formatNumber(h.count), line, chip, label: `${h.count} ${line} ${chip}` };
      }
      case "progress": {
        const line = t("sh.hero.toReward", { unit: unitWord(i18n.locale, h.unit), reward: h.rewardName });
        const chip = t("sh.hero.atShop", { shop: h.shopName });
        return { big: formatNumber(h.toGo), line, chip, label: `${formatNumber(h.toGo)} ${line} ${chip}` };
      }
      case "shops": {
        const line = t("sh.hero.shopsOnCard", { n: h.count });
        return { big: String(h.count), line, chip: t("sh.hero.nextVisit"), label: `${h.count} ${line}` };
      }
    }
  }
  switch (h.kind) {
    case "ready": {
      const line = h.count === 1 ? "reward ready" : "rewards ready";
      const chip = h.shopName ? `at ${h.shopName}` : `across ${h.shopCount} shops`;
      return { big: formatNumber(h.count), line, chip, label: `${h.count} ${line} ${chip}` };
    }
    case "progress": {
      const line = `${h.unit} to ${h.rewardName}`;
      const chip = `at ${h.shopName}`;
      return { big: formatNumber(h.toGo), line, chip, label: `${formatNumber(h.toGo)} ${line} ${chip}` };
    }
    case "shops": {
      const line = h.count === 1 ? "shop on your card" : "shops on your card";
      return { big: String(h.count), line, chip: "Earn on your next visit", label: `${h.count} ${line}` };
    }
  }
}

/** Rewards redeemable right now, summed across shops (a count of rewards, never of points or stamps). */
export function rewardsReadyCount(memberships: readonly Pick<customerApi.MembershipDto, "rewardsAvailableCount">[]): number {
  return memberships.reduce((n, m) => n + Math.max(0, m.rewardsAvailableCount), 0);
}
