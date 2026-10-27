/**
 * Join page copy (canvas Join.dc.html): "get a stamp for today's coffee", "10 stamps = a free drink.
 * Your card works at 16 shops on Roncesvalles. No app needed." and the "Also earning here…" footer.
 * Pure, unit tested.
 */
import { verticalCategory } from "@ll/design-tokens";
import { rewardNameIn } from "./i18n/rewardName";
import type { Locale, MessageKey, Vars } from "@ll/shared";
import { placeKind } from "./place";

type Program = { earnType: "per_dollar" | "per_visit" | "stamps"; terminology: string; welcomeBonus: number; stampGoal: number };

/** What today's visit is, by kind of shop. */
const TODAY: Record<string, string> = { cafe: "coffee", bakery: "treat", restaurant: "meal", bar: "round", grocery: "shop", florist: "flowers", salon: "visit", barber: "cut", fitness: "class" };

function unit(term: string, n: number): string {
  const t = (term || "points").toLowerCase();
  const one = t.endsWith("s") ? t.slice(0, -1) : t;
  return n === 1 ? one : `${one}s`;
}

/** "Roncesvalles Village" → "Roncesvalles". */
export function streetName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.replace(/\s+(Village|BIA|Neighbourhood)$/i, "").trim() || null;
}

/** "Free drink" → "a free drink"; "$5 off" stays. */
export function rewardPhrase(name: string): string {
  return /^free\s/i.test(name) ? `a ${name.charAt(0).toLowerCase()}${name.slice(1)}` : name;
}

export function joinHeadline(program: Program | null, vertical: string): string {
  // A pharmacy never pays for joining or for a visit: a visit may be a prescription visit.
  if (vertical === "pharmacy") return "start earning on front-store purchases";
  const today = TODAY[vertical] ?? "visit";
  if (!program) return `join for today’s ${today}`;
  if (program.welcomeBonus > 0) {
    const n = program.welcomeBonus;
    return program.earnType === "stamps" && n === 1 ? `get a ${unit(program.terminology, 1)} for today’s ${today}` : `get ${n} ${unit(program.terminology, n)} for today’s ${today}`;
  }
  return `start earning on today’s ${today}`;
}

export function joinIntro(program: Program | null, reward: { name: string; pointsCost: number } | null | undefined, street: { name: string; shopCount: number } | null): string {
  const parts: string[] = [];
  if (program && reward) parts.push(`${reward.pointsCost} ${unit(program.terminology, reward.pointsCost)} = ${rewardPhrase(reward.name)}.`);
  if (street && street.shopCount > 1) parts.push(`Your card works at ${street.shopCount} shops on ${street.name}.`);
  parts.push("No app needed.");
  return parts.join(" ");
}

/** "Also earning here: the bakery, the salon, the phone repair and 12 more." */
export function alsoEarning(others: { vertical: string }[], total: number): string | null {
  if (others.length === 0) return null;
  const kinds = others.map((o) => `the ${placeKind(o.vertical)}`);
  const more = Math.max(0, total - others.length);
  const list = more > 0 ? `${kinds.join(", ")} and ${more} more` : kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}` : kinds[0]!;
  return `Also earning here: ${list}.`;
}

/** Up to `n` nearby shops whose category objects differ (bakery, salon, repair…), nearest first (the footer). */
export function pickVaried<T extends { merchant: { id: string; vertical: string } }>(shops: T[], exceptId: string, n = 3): T[] {
  const seen = new Set<string>([verticalCategory(shops.find((s) => s.merchant.id === exceptId)?.merchant.vertical ?? "")]);
  const out: T[] = [];
  for (const s of shops) {
    if (s.merchant.id === exceptId) continue;
    const k = verticalCategory(s.merchant.vertical);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length === n) break;
  }
  return out;
}

// Localized variants. English keeps the shop-specific wording above ("get a stamp for today's coffee", the
// merchant's own point name); other languages use the catalog with generic wording, since the English nouns
// ("coffee", "stamps") and the merchant's terminology aren't translatable here.
type T = (key: MessageKey, vars?: Vars) => string;

/** "5 stamps" / "5 points" in the active language. */
export function unitText(t: T, program: Pick<Program, "earnType"> | null, n: number): string {
  return t(program?.earnType === "stamps" ? "auth.unit.stamps" : "auth.unit.points", { n });
}

export function joinHeadlineT(t: T, locale: Locale, program: Program | null, vertical: string): string {
  if (locale === "en") return joinHeadline(program, vertical);
  if (vertical === "pharmacy") return t("auth.join.headlineFrontStore");
  if (!program) return t("auth.join.headlineJoin");
  return program.welcomeBonus > 0 ? t("auth.join.headlineBonus", { bonus: unitText(t, program, program.welcomeBonus) }) : t("auth.join.headlineStart");
}

export function joinIntroT(t: T, locale: Locale, program: Program | null, reward: { name: string; pointsCost: number } | null | undefined, street: { name: string; shopCount: number } | null): string {
  if (locale === "en") return joinIntro(program, reward, street);
  const parts: string[] = [];
  if (program && reward) parts.push(t("auth.join.introReward", { cost: unitText(t, program, reward.pointsCost), reward: rewardNameIn(locale, t, reward.name) }));
  if (street && street.shopCount > 1) parts.push(t("auth.join.introStreet", { n: street.shopCount, street: street.name }));
  parts.push(t("auth.join.introNoApp"));
  return parts.join(" ");
}

export function alsoEarningT(t: T, locale: Locale, others: { vertical: string }[], total: number): string | null {
  if (locale === "en") return alsoEarning(others, total);
  return others.length === 0 ? null : t("auth.join.alsoNearby", { n: Math.max(total, others.length) });
}

export function stampsToGoT(t: T, locale: Locale, n: number, reward: string): string {
  return locale === "en" ? `${n} more for a ${reward.charAt(0).toLowerCase()}${reward.slice(1)}` : t("auth.joined.toGo", { n, reward: rewardNameIn(locale, t, reward) });
}
