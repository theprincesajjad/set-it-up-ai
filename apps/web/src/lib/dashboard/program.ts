/**
 * Program editor logic (merchant-dashboard.md §5): validation that mirrors the API,
 * the plain-language sentence, the live-preview model and the PATCH diff.
 */
import type { merchantApi } from "@ll/shared";
import { formatMoney } from "@/lib/format";

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
}

export const DRAFT_KEYS: (keyof ProgramDraft)[] = [
  "name", "earnType", "pointsPerDollar", "pointsPerVisit", "minSpendCents", "stampGoal", "terminology",
  "welcomeBonus", "birthdayBonus", "referralBonus", "expiryMonths", "visitCooldownMinutes",
];

export const MIN_EXPIRY_MONTHS = 12;
export const STAMP_GOAL_MIN = 6;
export const STAMP_GOAL_MAX = 12;

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
  };
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
  if (d.earnType === "stamps" && (d.stampGoal < STAMP_GOAL_MIN || d.stampGoal > STAMP_GOAL_MAX)) e.stampGoal = `Pick ${STAMP_GOAL_MIN} to ${STAMP_GOAL_MAX} stamps.`;
  if (d.expiryMonths !== null && !(d.expiryMonths >= MIN_EXPIRY_MONTHS)) e.expiryMonths = `Expiry must be at least ${MIN_EXPIRY_MONTHS} months without a visit.`;
  if (d.expiryMonths !== null && d.expiryMonths > 120) e.expiryMonths = "Pick 120 months or fewer.";
  for (const k of ["welcomeBonus", "birthdayBonus", "referralBonus", "visitCooldownMinutes", "minSpendCents"] as const) if (d[k] < 0) e[k] = "Use 0 or more.";
  if (d.visitCooldownMinutes > 1440) e.visitCooldownMinutes = "Use 1,440 minutes (a day) or fewer.";
  return e;
}

function word(t: string, n: number) {
  return n === 1 && t.endsWith("s") ? t.slice(0, -1) : t;
}

/** "Customers earn 1 point for every $1." / "Customers get 1 stamp per visit. 10 stamps = Free drink." */
export function programSentence(d: ProgramDraft, firstReward?: { name: string; pointsCost: number } | null): string {
  const t = d.terminology;
  const min = d.minSpendCents > 0 ? ` over ${formatMoney(d.minSpendCents)}` : "";
  if (d.earnType === "stamps") {
    const goal = d.stampGoal;
    return `Customers get ${d.pointsPerVisit} ${word(t, d.pointsPerVisit)} per visit${min}. ${goal} ${word(t, goal)} = ${firstReward?.name ?? "a reward"}.`;
  }
  const base = d.earnType === "per_visit" ? `Customers earn ${d.pointsPerVisit} ${word(t, d.pointsPerVisit)} every visit${min}.` : `Customers earn ${d.pointsPerDollar} ${word(t, d.pointsPerDollar)} for every $1.`;
  return firstReward ? `${base} ${firstReward.pointsCost} ${word(t, firstReward.pointsCost)} = ${firstReward.name}.` : base;
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
  const sentence = programSentence(d, active[0]);
  const welcome = d.welcomeBonus > 0 ? `Join and get ${d.welcomeBonus} free ${word(d.terminology, d.welcomeBonus)}` : null;
  if (d.earnType === "stamps") {
    const goal = clampStampGoal(d.stampGoal);
    const stamps = Math.min(goal - 1, d.welcomeBonus + sample.visits * Math.max(1, d.pointsPerVisit));
    return { kind: "stamps", stamps: Math.max(0, stamps), goal, rewardName: active[0]?.name ?? "Free reward", terminology: d.terminology, expiry, sentence, rewards: active, welcome, lastEarn: Math.max(1, d.pointsPerVisit) };
  }
  const perVisit = d.earnType === "per_visit" ? d.pointsPerVisit : Math.floor((sample.spendCents / 100) * d.pointsPerDollar);
  const earned = d.welcomeBonus + sample.visits * Math.max(0, perVisit);
  const next = active.find((r) => r.pointsCost > earned) ?? active[active.length - 1];
  return { kind: "points", balance: earned, goal: next?.pointsCost ?? 0, rewardName: next?.name ?? null, terminology: d.terminology, expiry, sentence, rewards: active, welcome, lastEarn: Math.max(0, perVisit) };
}

/** Only changed fields, for PATCH /program. */
export function diffProgram(original: ProgramDraft, draft: ProgramDraft): Partial<ProgramDraft> {
  const out: Partial<ProgramDraft> = {};
  for (const k of DRAFT_KEYS) if (original[k] !== draft[k]) (out as Record<string, unknown>)[k] = draft[k];
  return out;
}

/** Changes that make existing customers need more to reach a reward → confirm dialog. */
export function raisesTheBar(original: ProgramDraft, draft: ProgramDraft): boolean {
  if (draft.earnType === "stamps" && original.earnType === "stamps" && draft.stampGoal > original.stampGoal) return true;
  if (draft.earnType === original.earnType && draft.earnType === "per_dollar" && draft.pointsPerDollar < original.pointsPerDollar) return true;
  if (draft.earnType === original.earnType && draft.earnType !== "per_dollar" && draft.pointsPerVisit < original.pointsPerVisit) return true;
  return false;
}
