/**
 * Program editor logic (merchant-dashboard.md §5): validation that mirrors the API,
 * the plain-language sentence, the live-preview model and the PATCH diff.
 */
import { VERTICAL_TEMPLATES, merchantApi, type Vertical } from "@ll/shared";
import { formatMoney, rewardInSentence } from "@/lib/format";

export type EarnType = "per_dollar" | "per_visit" | "stamps";

export interface ProgramDraft {
  name: string;
  earnType: EarnType;
  pointsPerDollar: number;
  pointsPerVisit: number;
  minSpendCents: number;
  stampGoal: number;
  terminology: "points" | "stamps" | "stars";
  welcomeBonus: number;
  birthdayBonus: number;
  referralBonus: number;
  /** null = never expire (default, recommended). */
  expiryMonths: number | null;
  visitCooldownMinutes: number;
  /** Stamp on scan (never applies to per_dollar). */
  counterAutoStamp: boolean;
  /** What one reward costs the shop, in cents (optional; Reports estimates rewards owed with it). */
  rewardCostCents: number | null;
  /** wave-n: rules. What one stamp is worth (visit/stamp programs). */
  earnUnit: merchantApi.EarnUnit;
  /** Everything earns, or only the selected categories, items and services. */
  earnScope: merchantApi.EarnScope;
  earnCategoryIds: string[];
  earnItemIds: string[];
  earnServiceIds: string[];
  /** Most stamps per customer per day; null = no limit. */
  maxStampsPerDay: number | null;
}

export const DRAFT_KEYS: (keyof ProgramDraft)[] = [
  "name", "earnType", "pointsPerDollar", "pointsPerVisit", "minSpendCents", "stampGoal", "terminology",
  "welcomeBonus", "birthdayBonus", "referralBonus", "expiryMonths", "visitCooldownMinutes", "counterAutoStamp", "rewardCostCents",
  "earnUnit", "earnScope", "earnCategoryIds", "earnItemIds", "earnServiceIds", "maxStampsPerDay",
];

export const MIN_EXPIRY_MONTHS = 12;
/** Same bounds as the API (packages/shared merchantApi). */
export const STAMP_GOAL_MIN = merchantApi.STAMP_GOAL_MIN;
export const STAMP_GOAL_MAX = merchantApi.STAMP_GOAL_MAX;
export const MAX_STAMPS_PER_DAY_LIMIT = merchantApi.MAX_STAMPS_PER_DAY_LIMIT;

export function draftFromProgram(p: merchantApi.LoyaltyProgram): ProgramDraft {
  const t = (["points", "stamps", "stars"] as const).find((x) => x === p.terminology) ?? "points";
  return {
    name: p.name,
    earnType: p.earnType,
    pointsPerDollar: p.pointsPerDollar,
    pointsPerVisit: p.pointsPerVisit,
    minSpendCents: p.minSpendCents,
    stampGoal: p.stampGoal,
    terminology: t,
    welcomeBonus: p.welcomeBonus,
    birthdayBonus: p.birthdayBonus,
    referralBonus: p.referralBonus,
    expiryMonths: p.expiryMonths,
    visitCooldownMinutes: p.visitCooldownMinutes,
    counterAutoStamp: p.counterAutoStamp,
    rewardCostCents: p.rewardCostCents,
    earnUnit: p.earnUnit ?? (p.minSpendCents > 0 ? "purchase" : "visit"),
    earnScope: p.earnScope ?? "all",
    earnCategoryIds: p.earnCategoryIds ?? [],
    earnItemIds: p.earnItemIds ?? [],
    earnServiceIds: p.earnServiceIds ?? [],
    maxStampsPerDay: p.maxStampsPerDay ?? null,
  };
}

/** What one stamp is worth, as the Rewards page words it: one visit, one purchase (optional minimum), one pickup, or points per dollar. */
export type EarnMode = "visit" | "purchase" | "pickup" | "dollar";

export function earnModeOf(d: Pick<ProgramDraft, "earnType" | "minSpendCents"> & { earnUnit?: merchantApi.EarnUnit }): EarnMode {
  if (d.earnType === "per_dollar") return "dollar";
  return d.earnUnit ?? (d.minSpendCents > 0 ? "purchase" : "visit");
}

/** One visit / one purchase (the minimum is optional) / one pickup / points per dollar. Stamps stay stamps. */
export function setEarnMode(d: ProgramDraft, mode: EarnMode): ProgramDraft {
  if (mode === "dollar") return { ...changeEarnType(d, "per_dollar"), minSpendCents: 0, counterAutoStamp: false };
  const base = d.earnType === "per_visit" ? d : changeEarnType(d, "stamps");
  return {
    ...base,
    earnUnit: mode,
    minSpendCents: mode === "purchase" ? d.minSpendCents : 0,
    // A pickup card stamps itself when an order is picked up: no scan at the counter.
    counterAutoStamp: mode === "pickup" ? false : base.counterAutoStamp,
  };
}

/** "A weekly regular earns it in about 10 weeks." (one stamp a week, so the goal in weeks). */
export function weeklyRegularSentence(goal: number, perVisit: number): string {
  const weeks = Math.max(1, Math.ceil(goal / Math.max(1, perVisit)));
  return `A weekly regular earns it in about ${weeks} weeks.`;
}

/** Preset chips for step 3: the vertical template's rewards first, then a few common ones, then Custom. */
export function rewardPresets(vertical: string): { label: string; name: string; rewardType: merchantApi.Reward["rewardType"]; value: number }[] {
  const t = VERTICAL_TEMPLATES[vertical as Vertical];
  const base = (t?.rewards ?? []).map((r) => ({ label: r.name, name: r.name, rewardType: r.rewardType, value: r.value }));
  const extra =
    vertical === "cafe"
      ? [{ label: "Free pastry", name: "Free pastry", rewardType: "free_item" as const, value: 0 }, { label: "$5 off", name: "$5 off", rewardType: "amount_off" as const, value: 500 }]
      : vertical === "bakery"
        ? [{ label: "Free coffee", name: "Free coffee", rewardType: "free_item" as const, value: 0 }, { label: "$5 off", name: "$5 off", rewardType: "amount_off" as const, value: 500 }]
        : [{ label: "$5 off", name: "$5 off", rewardType: "amount_off" as const, value: 500 }];
  const seen = new Set<string>();
  return [...base, ...extra].filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true))).concat([{ label: "Custom", name: "", rewardType: "custom", value: 0 }]);
}

/** Verticals where the "categories that don't earn" table applies (pharmacy rx, grocery lottery and tobacco, retail gift cards). */
export const CATEGORY_VERTICALS: readonly string[] = ["beauty_supply", "pharmacy", "grocery", "retail"];

/**
 * Show the no-earn categories table for pharmacy, grocery and retail, or for any shop whose POS has synced categories.
 * Cafés and bakeries never see it (their stored categories are kept).
 */
export function categoriesVisible(vertical: string, categories: Pick<merchantApi.Category, "externalIds">[], posConnected: boolean): boolean {
  if (vertical === "cafe" || vertical === "bakery") return false;
  if (CATEGORY_VERTICALS.includes(vertical)) return true;
  return posConnected && categories.some((c) => Object.keys(c.externalIds ?? {}).length > 0);
}

/** Switching earn type picks sensible companions (stamps use "stamps" wording and a 10-stamp card). */
export function changeEarnType(d: ProgramDraft, earnType: EarnType): ProgramDraft {
  if (earnType === d.earnType) return d;
  if (earnType === "stamps")
    return { ...d, earnType, terminology: "stamps", pointsPerVisit: d.pointsPerVisit || 1, stampGoal: clampStampGoal(d.stampGoal || 10) };
  if (earnType === "per_visit") return { ...d, earnType, terminology: d.terminology === "stamps" ? "points" : d.terminology, pointsPerVisit: d.pointsPerVisit || 10 };
  return { ...d, earnType, terminology: d.terminology === "stamps" ? "points" : d.terminology, pointsPerDollar: d.pointsPerDollar || 1 };
}

export function clampStampGoal(n: number): number {
  return Math.max(STAMP_GOAL_MIN, Math.min(STAMP_GOAL_MAX, Math.round(n || STAMP_GOAL_MIN)));
}

export type ProgramErrors = Partial<Record<keyof ProgramDraft, string>>;

export function validateProgram(d: ProgramDraft): ProgramErrors {
  const e: ProgramErrors = {};
  if (!d.name.trim()) e.name = "Give your program a name.";
  if (d.earnType === "per_dollar" && !(d.pointsPerDollar > 0)) e.pointsPerDollar = "Customers need to earn at least 1 point per $1.";
  if (d.earnType !== "per_dollar" && !(d.pointsPerVisit > 0)) e.pointsPerVisit = "Customers need to earn at least 1 per visit.";
  if (d.earnType === "stamps" && (!Number.isInteger(d.stampGoal) || d.stampGoal < STAMP_GOAL_MIN || d.stampGoal > STAMP_GOAL_MAX)) e.stampGoal = `Pick ${STAMP_GOAL_MIN} to ${STAMP_GOAL_MAX} stamps.`;
  if (d.earnScope === "selected" && !d.earnCategoryIds.length && !d.earnItemIds.length && !d.earnServiceIds.length) e.earnScope = "Pick at least one, or choose Everything.";
  if (d.maxStampsPerDay !== null && !(d.maxStampsPerDay >= 1 && d.maxStampsPerDay <= MAX_STAMPS_PER_DAY_LIMIT)) e.maxStampsPerDay = `Use 1 to ${MAX_STAMPS_PER_DAY_LIMIT}.`;
  if (d.expiryMonths !== null && !(d.expiryMonths >= MIN_EXPIRY_MONTHS)) e.expiryMonths = `Expiry must be at least ${MIN_EXPIRY_MONTHS} months without a visit.`;
  if (d.expiryMonths !== null && d.expiryMonths > 120) e.expiryMonths = "Pick 120 months or fewer.";
  for (const k of ["welcomeBonus", "birthdayBonus", "referralBonus", "visitCooldownMinutes", "minSpendCents"] as const) if (d[k] < 0) e[k] = "Use 0 or more.";
  if (d.visitCooldownMinutes > 1440) e.visitCooldownMinutes = "Use 1,440 minutes (a day) or fewer.";
  return e;
}

function word(t: string, n: number) {
  return n === 1 && t.endsWith("s") ? t.slice(0, -1) : t;
}

/** "Free gel manicure" → "a free gel manicure"; "$5 off" stays. */
export function prizePhrase(name: string): string {
  const n = rewardInSentence(name.trim());
  return /^free\b/.test(n) ? `a ${n}` : n;
}

/** "per visit" / "per purchase over $5.00" / "per online order picked up". */
export function unitPhrase(d: Pick<ProgramDraft, "earnType" | "minSpendCents"> & { earnUnit?: merchantApi.EarnUnit }): string {
  const min = d.minSpendCents > 0 ? ` over ${formatMoney(d.minSpendCents)}` : "";
  const mode = earnModeOf(d);
  if (mode === "pickup") return `per online order picked up${min}`;
  if (mode === "purchase") return `per purchase${min}`;
  return `per visit${min}`;
}

/** "Customers get 1 stamp per visit. After 10 stamps they get a free drink." / "Customers earn 1 point for every $1." */
export function programSentence(d: ProgramDraft, firstReward?: { name: string; pointsCost: number } | null): string {
  const t = d.terminology;
  if (d.earnType === "stamps") {
    const goal = d.stampGoal;
    return `Customers get ${d.pointsPerVisit} ${word(t, d.pointsPerVisit)} ${unitPhrase(d)}. After ${goal} ${word(t, goal)} they get ${firstReward ? prizePhrase(firstReward.name) : "a reward"}.`;
  }
  const min = d.minSpendCents > 0 ? ` over ${formatMoney(d.minSpendCents)}` : "";
  const base = d.earnType === "per_visit" ? `Customers earn ${d.pointsPerVisit} ${word(t, d.pointsPerVisit)} every ${earnModeOf(d) === "pickup" ? "online order picked up" : earnModeOf(d) === "purchase" ? "purchase" : "visit"}${min}.` : `Customers earn ${d.pointsPerDollar} ${word(t, d.pointsPerDollar)} for every $1.`;
  return firstReward ? `${base} ${firstReward.pointsCost} ${word(t, firstReward.pointsCost)} = ${firstReward.name}.` : base;
}

/** A smaller reward on the way to the card's goal ("At 5 stamps: free cookie"). Stored as a reward costing fewer stamps than the goal. */
export interface TierDraft {
  /** Existing reward id; absent for a new tier. */
  id?: string;
  pointsCost: number;
  name: string;
}

export function validateTiers(tiers: TierDraft[], goal: number): string | null {
  const seen = new Set<number>();
  for (const t of tiers) {
    if (!t.name.trim()) return "Name every reward.";
    if (!Number.isInteger(t.pointsCost) || t.pointsCost < 1 || t.pointsCost >= goal) return `A reward on the way needs 1 to ${goal - 1} stamps.`;
    if (seen.has(t.pointsCost)) return "Two rewards can't need the same number of stamps.";
    seen.add(t.pointsCost);
  }
  return null;
}

/**
 * Every rule in plain words, for the live preview:
 * "Customers get 1 stamp per visit." / "Only gel manicures and pedicures earn stamps." / "At 5 stamps they can take a free polish,
 * or keep going." / "After 10 stamps they get a free gel manicure." / "Up to 2 stamps a day, and one every 30 minutes."
 */
export function plainRules(d: ProgramDraft, goalReward: { name: string } | null, tiers: TierDraft[], selectedNames: string[] = []): string[] {
  const t = d.terminology;
  const lines: string[] = [];
  if (d.earnType === "per_dollar") lines.push(`Customers earn ${d.pointsPerDollar} ${word(t, d.pointsPerDollar)} for every $1.`);
  else lines.push(`Customers get ${d.pointsPerVisit} ${word(t, d.pointsPerVisit)} ${unitPhrase(d)}.`);
  if (d.earnScope === "selected" && selectedNames.length) {
    const shown = selectedNames.slice(0, 3);
    const more = selectedNames.length - shown.length;
    const list = more > 0 ? `${shown.join(", ")} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0];
    lines.push(`Only ${list} ${selectedNames.length === 1 ? "earns" : "earn"} ${t}.`);
  }
  if (d.earnType === "stamps") {
    for (const tier of [...tiers].filter((x) => x.name.trim()).sort((a, b) => a.pointsCost - b.pointsCost))
      lines.push(`At ${tier.pointsCost} ${word(t, tier.pointsCost)} they can take ${prizePhrase(tier.name)}, or keep going.`);
    lines.push(`After ${d.stampGoal} ${word(t, d.stampGoal)} they get ${goalReward?.name.trim() ? prizePhrase(goalReward.name) : "a reward"}.`);
  }
  if (d.earnType !== "per_dollar") {
    const cap = d.maxStampsPerDay ? `Up to ${d.maxStampsPerDay} ${word(t, d.maxStampsPerDay)} a day` : null;
    const cool = d.visitCooldownMinutes > 0 ? `one every ${d.visitCooldownMinutes} minutes` : null;
    if (cap && cool) lines.push(`${cap}, and ${cool}.`);
    else if (cap) lines.push(`${cap}.`);
    else if (cool) lines.push(`At most ${cool}.`);
  }
  return lines;
}

/** Same wording as the API's expiryDisclosure (services/merchant.ts). */
export function expiryDisclosure(d: Pick<ProgramDraft, "expiryMonths" | "terminology">): string {
  return d.expiryMonths ? `Your ${d.terminology} expire after ${d.expiryMonths} months with no activity.` : `Your ${d.terminology} never expire.`;
}

export interface PreviewReward {
  name: string;
  pointsCost: number;
  rewardType: merchantApi.Reward["rewardType"];
  value: number;
  active?: boolean;
  description?: string | null;
}

export type PreviewModel =
  | { kind: "stamps"; stamps: number; goal: number; rewardName: string; terminology: string; expiry: string; sentence: string; rewards: PreviewReward[]; welcome: string | null; lastEarn: number }
  | { kind: "points"; balance: number; goal: number; rewardName: string | null; terminology: string; expiry: string; sentence: string; rewards: PreviewReward[]; welcome: string | null; lastEarn: number };

/**
 * What the customer sees with the draft values. `sampleVisits` simulates a regular
 * (default 6 visits at $12.50) so the card looks lived-in, like the real wallet.
 */
export function previewModel(d: ProgramDraft, rewards: PreviewReward[], sample = { visits: 6, spendCents: 1250 }): PreviewModel {
  const active = rewards.filter((r) => r.active !== false).sort((a, b) => a.pointsCost - b.pointsCost);
  const expiry = expiryDisclosure(d);
  // A stamp card's own reward is the one that costs the goal (smaller ones are tiers on the way).
  const cardReward = d.earnType === "stamps" ? (active.find((r) => r.pointsCost === d.stampGoal) ?? active.at(-1)) : active[0];
  const sentence = programSentence(d, cardReward);
  const welcome = d.welcomeBonus > 0 ? `Join and get ${d.welcomeBonus} free ${word(d.terminology, d.welcomeBonus)}` : null;
  if (d.earnType === "stamps") {
    const goal = clampStampGoal(d.stampGoal);
    const stamps = Math.min(goal - 1, d.welcomeBonus + sample.visits * Math.max(1, d.pointsPerVisit));
    return { kind: "stamps", stamps: Math.max(0, stamps), goal, rewardName: cardReward?.name ?? "Free reward", terminology: d.terminology, expiry, sentence, rewards: active, welcome, lastEarn: Math.max(1, d.pointsPerVisit) };
  }
  const perVisit = d.earnType === "per_visit" ? d.pointsPerVisit : Math.floor((sample.spendCents / 100) * d.pointsPerDollar);
  const earned = d.welcomeBonus + sample.visits * Math.max(0, perVisit);
  const next = active.find((r) => r.pointsCost > earned) ?? active[active.length - 1];
  return { kind: "points", balance: earned, goal: next?.pointsCost ?? 0, rewardName: next?.name ?? null, terminology: d.terminology, expiry, sentence, rewards: active, welcome, lastEarn: Math.max(0, perVisit) };
}

/** Only changed fields, for PATCH /program. */
export function diffProgram(original: ProgramDraft, draft: ProgramDraft): Partial<ProgramDraft> {
  const out: Partial<ProgramDraft> = {};
  for (const k of DRAFT_KEYS) if (JSON.stringify(original[k] ?? null) !== JSON.stringify(draft[k] ?? null)) (out as Record<string, unknown>)[k] = draft[k];
  return out;
}

/** The stamp goal moves (either way): the confirm sheet says how many customers it touches. */
export function goalMoves(original: ProgramDraft, draft: ProgramDraft): boolean {
  return original.earnType === "stamps" && draft.earnType === "stamps" && original.stampGoal !== draft.stampGoal;
}

/** Changes that make existing customers need more to reach a reward → confirm dialog. */
export function raisesTheBar(original: ProgramDraft, draft: ProgramDraft): boolean {
  if (draft.earnType === "stamps" && original.earnType === "stamps" && draft.stampGoal > original.stampGoal) return true;
  if (draft.earnType === original.earnType && draft.earnType === "per_dollar" && draft.pointsPerDollar < original.pointsPerDollar) return true;
  if (draft.earnType === original.earnType && draft.earnType !== "per_dollar" && draft.pointsPerVisit < original.pointsPerVisit) return true;
  return false;
}
