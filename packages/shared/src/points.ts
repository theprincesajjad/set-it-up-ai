import type { EarnType } from "./verticals.js";

/**
 * Pure earn calculation. The API wraps this in a ledger transaction; POS
 * connectors and the staff app call the same function so every source agrees.
 */

export interface ProgramRules {
  earnType: EarnType;
  /** Points per whole dollar of eligible spend (per_dollar). */
  pointsPerDollar: number;
  /** Points (or stamps) per qualifying visit (per_visit / stamps). */
  pointsPerVisit: number;
  /** Minimum eligible spend in cents for a visit to qualify (0 = any). */
  minSpendCents: number;
}

export interface PurchaseLine {
  amountCents: number;
  /** Merchant category id; lines in no-earn categories never earn. */
  categoryId?: string | null;
  /** Optional catalog item id for item bonuses. */
  itemId?: string | null;
  quantity?: number;
}

export interface ActiveBoost {
  /** Multiplier on base points, e.g. 2 for double points. */
  multiplier?: number;
  /** Flat bonus points added once. */
  bonusPoints?: number;
  /** If set, only applies when a line has this item. */
  itemId?: string | null;
  /** If set, only applies when a line is in this category. */
  categoryId?: string | null;
}

export interface EarnInput {
  rules: ProgramRules;
  lines: PurchaseLine[];
  /** Category ids that must never earn (e.g. prescriptions). */
  noEarnCategoryIds: ReadonlySet<string> | string[];
  boosts?: ActiveBoost[];
  /** VIP level earn multiplier (1 = none). */
  vipMultiplier?: number;
}

export interface EarnResult {
  eligibleCents: number;
  excludedCents: number;
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  qualifiesAsVisit: boolean;
  breakdown: string[];
}

export function calculateEarn(input: EarnInput): EarnResult {
  const noEarn = input.noEarnCategoryIds instanceof Set ? input.noEarnCategoryIds : new Set(input.noEarnCategoryIds);
  let eligibleCents = 0;
  let excludedCents = 0;
  for (const line of input.lines) {
    const amt = Math.max(0, Math.round(line.amountCents));
    if (line.categoryId && noEarn.has(line.categoryId)) excludedCents += amt;
    else eligibleCents += amt;
  }
  const breakdown: string[] = [];
  const { rules } = input;
  const qualifiesAsVisit = eligibleCents >= rules.minSpendCents && (eligibleCents > 0 || rules.minSpendCents === 0);

  let basePoints = 0;
  if (rules.earnType === "per_dollar") {
    basePoints = Math.floor(eligibleCents / 100) * rules.pointsPerDollar;
    if (basePoints) breakdown.push(`${rules.pointsPerDollar} pt/$ on $${(eligibleCents / 100).toFixed(2)}`);
  } else if (qualifiesAsVisit) {
    basePoints = rules.pointsPerVisit;
    if (basePoints) breakdown.push(rules.earnType === "stamps" ? `${basePoints} stamp(s)` : `${basePoints} pts for visit`);
  }

  const vip = input.vipMultiplier && input.vipMultiplier > 1 ? input.vipMultiplier : 1;
  let multiplier = vip;
  if (vip > 1) breakdown.push(`VIP x${vip}`);
  let bonusPoints = 0;
  const lineMatches = (b: ActiveBoost) =>
    (!b.itemId && !b.categoryId) ||
    input.lines.some(
      (l) =>
        (!b.itemId || l.itemId === b.itemId) &&
        (!b.categoryId || l.categoryId === b.categoryId) &&
        !(l.categoryId && noEarn.has(l.categoryId)),
    );
  for (const b of input.boosts ?? []) {
    if (!lineMatches(b)) continue;
    if (b.multiplier && b.multiplier > 1) {
      // Boost multipliers don't stack with each other; the largest wins, then VIP applies.
      const boosted = b.multiplier * vip;
      if (boosted > multiplier) multiplier = boosted;
    }
    if (b.bonusPoints && b.bonusPoints > 0) bonusPoints += Math.floor(b.bonusPoints);
  }
  if (multiplier > vip) breakdown.push(`Promo x${multiplier / vip}`);
  if (bonusPoints) breakdown.push(`+${bonusPoints} bonus`);
  if (excludedCents) breakdown.push(`$${(excludedCents / 100).toFixed(2)} excluded (no-earn)`);

  const boostedBase = Math.floor(basePoints * multiplier);
  // Flat bonuses only apply to a qualifying purchase.
  const appliedBonus = qualifiesAsVisit ? bonusPoints : 0;
  return {
    eligibleCents,
    excludedCents,
    basePoints: boostedBase,
    bonusPoints: appliedBonus,
    totalPoints: boostedBase + appliedBonus,
    qualifiesAsVisit,
    breakdown,
  };
}

export interface RewardLike {
  rewardType: "amount_off" | "percent_off" | "free_item" | "custom";
  /** cents for amount_off, whole percent for percent_off. */
  value: number;
  maxDiscountCents?: number | null;
}

/** Discount a reward is worth against an eligible subtotal (cents). */
export function rewardDiscountCents(reward: RewardLike, eligibleSubtotalCents: number): number {
  const sub = Math.max(0, eligibleSubtotalCents);
  let d = 0;
  if (reward.rewardType === "amount_off") d = Math.min(reward.value, sub);
  else if (reward.rewardType === "percent_off") d = Math.round((sub * Math.min(100, reward.value)) / 100);
  if (reward.maxDiscountCents != null) d = Math.min(d, reward.maxDiscountCents);
  return d;
}

/** Normalize a North American phone number to E.164 (+1XXXXXXXXXX). Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Mask a phone for display at the counter: (416) ***-1234 */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164;
  return `(${d.slice(0, 3)}) ***-${d.slice(6)}`;
}

/** Great-circle distance in metres. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Network- and campaign-funded bonuses are set in points (e.g. "+50 pts for
 * visiting 3 shops"). Points-per-dollar shops get them as-is; at stamp and
 * per-visit shops a raw 50 would mean 50 stamps, so they get one visit's worth
 * (one bonus stamp) instead.
 */
export function networkBonusInShopUnits(rules: Pick<ProgramRules, "earnType" | "pointsPerVisit">, bonusPoints: number): number {
  if (bonusPoints <= 0) return 0;
  if (rules.earnType === "per_dollar") return Math.floor(bonusPoints);
  return Math.max(1, rules.pointsPerVisit);
}
