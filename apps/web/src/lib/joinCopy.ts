/**
 * Join page copy (canvas Join.dc.html): "get a stamp for today's coffee", "10 stamps = a free drink.
 * Your card works at 16 shops on Roncesvalles. No app needed." and the "Also earning here…" footer.
 * Pure, unit tested.
 */
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

/** Up to `n` nearby shops with different kinds of place, nearest first (the footer's objects). */
export function pickVaried<T extends { merchant: { id: string; vertical: string } }>(shops: T[], exceptId: string, n = 3): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of shops) {
    if (s.merchant.id === exceptId) continue;
    const k = placeKind(s.merchant.vertical);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length === n) break;
  }
  return out;
}
