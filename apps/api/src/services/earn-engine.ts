/**
 * wave-n: rules. The shop's stamp rules as the earn engine applies them (ledger.ts `awardPurchase` calls these):
 *
 *  - earn unit: what one stamp is worth (a visit, a purchase, or an online order picked up);
 *  - what earns: everything, or only selected categories, items and services;
 *  - abuse limits: the daily cap per customer (the cooldown lives in ledger.ts);
 *  - promo boost providers: the extension point the promo team uses for double / bonus stamps (see notes-rules.md);
 *  - the goal-change rule: customers never lose stamps or earned rewards when the stamp goal moves.
 *
 * Nothing here posts points: ledger.ts stays the only code that changes a balance.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { ledgerTransactions, loyaltyPrograms, merchantMembers, merchants, type DbOrTx, type Tx } from "@ll/db";
import type { ActiveBoost, PurchaseLine, merchantApi } from "@ll/shared";
import { HttpError } from "../lib/errors.js";

type Program = typeof loyaltyPrograms.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
type Member = typeof merchantMembers.$inferSelect;
type TxSource = (typeof ledgerTransactions.$inferInsert)["source"];

/** What kind of event an award is. Callers say so; when they don't, staff/POS awards are purchases and app awards are visits. */
export type EarnEvent = "visit" | "purchase" | "pickup";

// ---------------------------------------------------------------------------
// Earn unit
// ---------------------------------------------------------------------------
export const earnUnitOf = (p: Pick<Program, "earnType" | "earnUnit">): merchantApi.EarnUnit | "dollar" =>
  p.earnType === "per_dollar" ? "dollar" : p.earnUnit === "purchase" || p.earnUnit === "pickup" ? p.earnUnit : "visit";

/**
 * Does this event earn under the shop's unit?
 *  visit    : every visit, purchase or pickup earns.
 *  purchase : a sale or a picked-up order; a self check-in (kiosk) is not a purchase.
 *  pickup   : only an online order marked picked up.
 * per_dollar programs earn on dollars from any event.
 */
export function unitAllows(p: Pick<Program, "earnType" | "earnUnit">, event: EarnEvent): boolean {
  const unit = earnUnitOf(p);
  if (unit === "dollar" || unit === "visit") return true;
  if (unit === "purchase") return event !== "visit";
  return event === "pickup";
}

/** Plain words for a refused counter stamp. */
export function unitRefusal(p: Pick<Program, "earnUnit" | "terminology">): HttpError {
  const one = p.terminology === "points" ? "points" : p.terminology.replace(/s$/, "");
  return new HttpError(
    422,
    "earn_rule",
    p.earnUnit === "pickup"
      ? `This shop gives a ${one} for online orders that are picked up. To add one anyway, give a reason.`
      : `This shop gives a ${one} for a purchase, not a check-in. To add one anyway, give a reason.`,
    { rule: "earn_unit", earnUnit: p.earnUnit },
  );
}

// ---------------------------------------------------------------------------
// What earns
// ---------------------------------------------------------------------------
/** The line filter for a "selected only" program, or undefined when everything earns. */
export function lineEligibility(p: Pick<Program, "earnScope" | "earnCategoryIds" | "earnItemIds" | "earnServiceIds">): ((l: PurchaseLine) => boolean) | undefined {
  if (p.earnScope !== "selected") return undefined;
  const cats = new Set(p.earnCategoryIds ?? []);
  const items = new Set(p.earnItemIds ?? []);
  const svcs = new Set(p.earnServiceIds ?? []);
  return (l) => (!!l.categoryId && cats.has(l.categoryId)) || (!!l.itemId && items.has(l.itemId)) || (!!l.serviceId && svcs.has(l.serviceId));
}

export function eligibilityRefusal(p: Pick<Program, "terminology">): HttpError {
  const one = p.terminology === "points" ? "points" : p.terminology.replace(/s$/, "");
  return new HttpError(422, "earn_rule", `Only some services or items earn a ${one} here, and this one isn't on the list. To add one anyway, give a reason.`, { rule: "earn_scope" });
}

// ---------------------------------------------------------------------------
// Daily cap
// ---------------------------------------------------------------------------
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(at.getTime() / 1000) * 1000;
}

/** UTC instant of the shop-local midnight that starts the day containing `at`. */
export function shopDayStart(at: Date, timeZone: string): Date {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - tzOffsetMs(new Date(first), timeZone));
}

/** Stamps (earn transactions, not reversed) this member got since the shop's midnight. */
export async function earnedToday(tx: DbOrTx, member: Pick<Member, "id" | "merchantId">, at: Date, timeZone: string): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`coalesce(sum(${ledgerTransactions.points}), 0)::int` })
    .from(ledgerTransactions)
    .where(
      and(
        eq(ledgerTransactions.merchantId, member.merchantId),
        eq(ledgerTransactions.memberId, member.id),
        eq(ledgerTransactions.type, "earn"),
        gte(ledgerTransactions.createdAt, shopDayStart(at, timeZone)),
        sql`${ledgerTransactions.reversedAt} is null`,
      ),
    );
  return Number(r?.n ?? 0);
}

export function dailyLimitError(p: Pick<Program, "maxStampsPerDay" | "terminology">): HttpError {
  const n = p.maxStampsPerDay ?? 0;
  const unit = p.terminology === "points" ? "points" : n === 1 ? p.terminology.replace(/s$/, "") : p.terminology;
  return new HttpError(409, "daily_limit", `Already got ${n} ${unit} today, the most this shop gives in a day. Come back tomorrow.`, { max: n });
}

// ---------------------------------------------------------------------------
// Promo boost providers (the promo team's hook)
// ---------------------------------------------------------------------------
export interface EarnBoostContext {
  merchant: Merchant;
  program: Program;
  /** Locked by the award's transaction. */
  member: Member;
  at: Date;
  lines: PurchaseLine[];
  source: TxSource;
  event: EarnEvent;
}
export interface EarnBoost extends ActiveBoost {
  promoId?: string | null;
  /** Shown in the breakdown when the boost applied. */
  label?: string;
  /** Called once, inside the award's transaction, only when the boost applied to a posted award. */
  onApplied?: (tx: Tx, a: { transactionId: string; memberId: string; points: number }) => Promise<void>;
}
export type EarnBoostProvider = (tx: Tx, c: EarnBoostContext) => Promise<EarnBoost[]>;
const providers = new Map<string, EarnBoostProvider>();

/** Register (or replace) a named boost provider. Safe to call more than once with the same name. */
export function registerEarnBoostProvider(name: string, provider: EarnBoostProvider): void {
  providers.set(name, provider);
}
export function unregisterEarnBoostProvider(name: string): void {
  providers.delete(name);
}

export async function providerBoosts(tx: Tx, c: EarnBoostContext): Promise<EarnBoost[]> {
  if (!providers.size) return [];
  const out: EarnBoost[] = [];
  for (const p of providers.values()) out.push(...(await p(tx, c)));
  return out;
}

/** Whether a boost matched this purchase (same targeting rule as calculateEarn). */
export function boostMatched(b: ActiveBoost, lines: PurchaseLine[], excluded: (l: PurchaseLine) => boolean): boolean {
  if (!b.itemId && !b.categoryId) return true;
  return lines.some((l) => (!b.itemId || l.itemId === b.itemId) && (!b.categoryId || l.categoryId === b.categoryId) && !excluded(l));
}

// ---------------------------------------------------------------------------
// Goal change: nobody loses stamps or earned rewards
// ---------------------------------------------------------------------------
/**
 * Carry-over stamps for a member when the goal goes from `from` to `to` (only when raised):
 * every full card they hold stays a full card at the new size, and a card in progress keeps its distance to the reward.
 * A lowered goal adds nothing: the balance stays and rewards unlock at once.
 */
export function carryOverStamps(balance: number, from: number, to: number): number {
  if (!(from > 0) || !(to > from) || balance <= 0) return 0;
  const full = Math.floor(balance / from);
  const rest = balance % from;
  return full * (to - from) + (rest > 0 ? to - from : 0);
}

export interface GoalImpact {
  membersWithProgress: number;
  rewardsUnlocked: number;
  membersCarriedOver: number;
  stampsCarriedOver: number;
}

/** Balances of the shop's members with stamps (bounded read: one row per member with a positive balance). */
export async function balancesWithProgress(db: DbOrTx, merchantId: string): Promise<{ id: string; balance: number }[]> {
  return db
    .select({ id: merchantMembers.id, balance: merchantMembers.balance })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), sql`${merchantMembers.balance} > 0`));
}

export function goalImpact(balances: { balance: number }[], from: number, to: number): GoalImpact {
  const withProgress = balances.filter((b) => b.balance > 0);
  if (to < from) {
    return { membersWithProgress: withProgress.length, rewardsUnlocked: withProgress.filter((b) => b.balance >= to && b.balance < from).length, membersCarriedOver: 0, stampsCarriedOver: 0 };
  }
  const adds = withProgress.map((b) => carryOverStamps(b.balance, from, to)).filter((n) => n > 0);
  return { membersWithProgress: withProgress.length, rewardsUnlocked: 0, membersCarriedOver: adds.length, stampsCarriedOver: adds.reduce((s, n) => s + n, 0) };
}
