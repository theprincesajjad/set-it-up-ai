/**
 * Points ledger: the only code that is allowed to change a member's points.
 *
 * Every change is a ledger_transaction with two ledger_entries that sum to
 * zero (member account vs. a merchant or network account). The cached
 * merchant_members.balance is updated in the same DB transaction.
 */
import { promoClockAt } from "../lib/testClock.js";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  locations,
  loyaltyPrograms,
  merchantCategories,
  merchantMembers,
  merchants,
  networkPerkAwards,
  networkPerks,
  promos,
  redemptions,
  rewards,
  users,
  vipLevels,
  visits,
  type DbOrTx,
  type Tx,
} from "@ll/db";
import { calculateEarn, networkBonusInShopUnits, rewardDiscountCents, type ActiveBoost, type EarnResult, type PurchaseLine } from "@ll/shared";
import type { AppContext } from "../context.js";
import { randomCode } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { enabledFeaturesFor } from "./features.js";
import { assertPharmacyConfirmed, assertPharmacyText, isPharmacy, nothingFrontStore, pharmacyAwardPlan } from "./pharmacy-guard.js";
import { recordVisitMilestones } from "./onboarding.js";
import { enqueueOutbox, kickOutbox, registerOutboxHandler } from "./outbox.js";

type TxType = (typeof ledgerTransactions.$inferInsert)["type"];
type TxSource = (typeof ledgerTransactions.$inferInsert)["source"];
type JoinSource = NonNullable<(typeof merchantMembers.$inferInsert)["joinedVia"]>;
type AccountKind = (typeof ledgerAccounts.$inferInsert)["kind"];
export type Member = typeof merchantMembers.$inferSelect;
export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
type Merchant = typeof merchants.$inferSelect;

/** Earn-type transactions count toward lifetime points (and VIP levels). */
const LIFETIME_TYPES = new Set<TxType>(["earn", "welcome_bonus", "birthday_bonus", "referral_bonus", "promo_bonus", "network_bonus", "campaign_bonus", "import"]);

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
/**
 * Account ids never change once created (an account row is only removed with its member or shop), so the lookups are
 * remembered per process: a stamp used to spend two reads on them.
 */
const accountIds = new Map<string, string>();
/**
 * Accounts a transaction created itself. Its own later reads see them, but they are not committed: if the transaction rolls back
 * (a refused redemption, a retried stamp) the row is gone, and remembering the id would make every later posting in this process
 * fail on the ledger_entries foreign key. They are remembered by the next transaction that reads them as committed.
 */
const createdInTx = new WeakMap<object, Set<string>>();
function createdHere(tx: DbOrTx, key: string) {
  let set = createdInTx.get(tx);
  if (!set) createdInTx.set(tx, (set = new Set()));
  set.add(key);
}
const ACCOUNT_CACHE_MAX = 20_000;
function rememberAccount(key: string, id: string) {
  if (accountIds.size >= ACCOUNT_CACHE_MAX) accountIds.delete(accountIds.keys().next().value as string);
  accountIds.set(key, id);
  return id;
}

async function merchantAccount(tx: DbOrTx, merchantId: string | null, kind: AccountKind): Promise<string> {
  // The network account (no merchant) is not remembered: its id is the same key in every database this process opens (tests).
  const cacheKey = merchantId ? `m:${merchantId}:${kind}` : null;
  const hit = cacheKey ? accountIds.get(cacheKey) : undefined;
  if (hit) return hit;
  const where =
    merchantId === null
      ? and(isNull(ledgerAccounts.merchantId), eq(ledgerAccounts.kind, kind), isNull(ledgerAccounts.memberId))
      : and(eq(ledgerAccounts.merchantId, merchantId), eq(ledgerAccounts.kind, kind), isNull(ledgerAccounts.memberId));
  const [existing] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(where).limit(1);
  if (existing) return cacheKey && !createdInTx.get(tx)?.has(cacheKey) ? rememberAccount(cacheKey, existing.id) : existing.id;
  const [created] = await tx.insert(ledgerAccounts).values({ merchantId, kind }).onConflictDoNothing().returning({ id: ledgerAccounts.id });
  if (created) {
    if (cacheKey) createdHere(tx, cacheKey);
    return created.id;
  }
  const [again] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(where).limit(1);
  return cacheKey ? rememberAccount(cacheKey, again!.id) : again!.id;
}

async function memberAccount(tx: DbOrTx, member: Pick<Member, "id" | "merchantId">): Promise<string> {
  const cacheKey = `u:${member.id}`;
  const hit = accountIds.get(cacheKey);
  if (hit) return hit;
  const [existing] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(eq(ledgerAccounts.memberId, member.id)).limit(1);
  if (existing) return createdInTx.get(tx)?.has(cacheKey) ? existing.id : rememberAccount(cacheKey, existing.id);
  const [created] = await tx
    .insert(ledgerAccounts)
    .values({ merchantId: member.merchantId, kind: "member", memberId: member.id })
    .onConflictDoNothing()
    .returning({ id: ledgerAccounts.id });
  if (created) {
    createdHere(tx, cacheKey);
    return created.id;
  }
  const [again] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(eq(ledgerAccounts.memberId, member.id)).limit(1);
  return rememberAccount(cacheKey, again!.id);
}

// ---------------------------------------------------------------------------
// Core posting
// ---------------------------------------------------------------------------
export interface PostArgs {
  merchantId: string;
  memberId: string;
  type: TxType;
  source: TxSource;
  /** Signed delta for the member. */
  points: number;
  description?: string | null;
  amountCents?: number | null;
  eligibleCents?: number | null;
  breakdown?: string[] | null;
  idempotencyKey?: string | null;
  externalRef?: string | null;
  staffUserId?: string | null;
  locationId?: string | null;
  promoId?: string | null;
  rewardId?: string | null;
  campaignId?: string | null;
  reversesTransactionId?: string | null;
  /** Which account funds/absorbs the points. Defaults by type. */
  counterAccount?: "merchant_issued" | "merchant_redeemed" | "network_issued";
  /** Allow the balance to go below zero (refund reversals only). */
  allowNegative?: boolean;
  /** createdAt for the transaction (callers pass ctx.now() so injected clocks line up). Defaults to the DB clock. */
  at?: Date;
  /** The member row, already read FOR UPDATE in this transaction (and not changed since): skips the locking read. */
  lockedMember?: Member;
  /** The caller already looked for an existing transaction with this idempotency key in this transaction. */
  idempotencyChecked?: boolean;
}

export interface PostResult {
  transaction: LedgerTransaction;
  member: Member;
  duplicate: boolean;
}

/** Post a balanced transaction. Must be called inside a DB transaction. */
export async function postTransaction(tx: Tx, args: PostArgs): Promise<PostResult> {
  if (!Number.isInteger(args.points)) throw badRequest("Points must be a whole number");

  if (args.idempotencyKey && !args.idempotencyChecked) {
    const [dup] = await tx
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.merchantId, args.merchantId), eq(ledgerTransactions.idempotencyKey, args.idempotencyKey)))
      .limit(1);
    if (dup) {
      const [m] = await tx.select().from(merchantMembers).where(eq(merchantMembers.id, dup.memberId)).limit(1);
      return { transaction: dup, member: m!, duplicate: true };
    }
  }

  // Lock the member row so concurrent awards/redeems serialize.
  const member =
    args.lockedMember ??
    (
      await tx
        .select()
        .from(merchantMembers)
        .where(and(eq(merchantMembers.id, args.memberId), eq(merchantMembers.merchantId, args.merchantId)))
        .for("update")
        .limit(1)
    )[0];
  if (!member) throw notFound("Member");
  if (!args.allowNegative && member.balance + args.points < 0) {
    throw new HttpError(409, "insufficient_points", `Not enough points (balance ${member.balance}, needs ${-args.points})`);
  }

  const [inserted] = await tx
    .insert(ledgerTransactions)
    .values({
      merchantId: args.merchantId,
      memberId: args.memberId,
      type: args.type,
      source: args.source,
      points: args.points,
      description: args.description ?? null,
      amountCents: args.amountCents ?? null,
      eligibleCents: args.eligibleCents ?? null,
      breakdown: args.breakdown ?? null,
      idempotencyKey: args.idempotencyKey ?? null,
      externalRef: args.externalRef ?? null,
      staffUserId: args.staffUserId ?? null,
      locationId: args.locationId ?? null,
      promoId: args.promoId ?? null,
      rewardId: args.rewardId ?? null,
      campaignId: args.campaignId ?? null,
      reversesTransactionId: args.reversesTransactionId ?? null,
      ...(args.at ? { createdAt: args.at } : {}),
    })
    .onConflictDoNothing()
    .returning();
  if (!inserted) {
    // Lost a race on the idempotency key.
    const [dup] = await tx
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.merchantId, args.merchantId), eq(ledgerTransactions.idempotencyKey, args.idempotencyKey!)))
      .limit(1);
    return { transaction: dup!, member, duplicate: true };
  }

  const counterKind =
    args.counterAccount ?? (args.type === "redeem" ? "merchant_redeemed" : args.type === "network_bonus" ? "network_issued" : "merchant_issued");
  const counterId = await merchantAccount(tx, counterKind === "network_issued" ? null : args.merchantId, counterKind);
  const memberAcct = await memberAccount(tx, member);
  if (args.points !== 0) {
    await tx.insert(ledgerEntries).values([
      { transactionId: inserted.id, accountId: memberAcct, amount: args.points },
      { transactionId: inserted.id, accountId: counterId, amount: -args.points },
    ]);
  }

  const lifetimeDelta = args.points > 0 && LIFETIME_TYPES.has(args.type) ? args.points : 0;
  const [updated] = await tx
    .update(merchantMembers)
    .set({
      balance: sql`${merchantMembers.balance} + ${args.points}`,
      lifetimePoints: sql`${merchantMembers.lifetimePoints} + ${lifetimeDelta}`,
    })
    .where(eq(merchantMembers.id, member.id))
    .returning();
  return { transaction: inserted, member: updated!, duplicate: false };
}

/** Recompute a balance from ledger entries (audit / repair). */
export async function ledgerBalance(db: DbOrTx, memberId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(eq(ledgerAccounts.memberId, memberId));
  return Number(row?.total ?? 0);
}

// ---------------------------------------------------------------------------
// Customers & membership
// ---------------------------------------------------------------------------
export async function generateMemberCode(tx: DbOrTx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(8);
    const [hit] = await tx.select({ id: users.id }).from(users).where(eq(users.memberCode, code)).limit(1);
    if (!hit) return code;
  }
  throw new Error("Could not allocate member code");
}

/** One network identity per phone number. */
export async function findOrCreateCustomerByPhone(tx: DbOrTx, phone: string, name?: string | null) {
  const [existing] = await tx.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (existing) {
    if (name && !existing.name) {
      const [u] = await tx.update(users).set({ name }).where(eq(users.id, existing.id)).returning();
      return { user: u!, created: false };
    }
    return { user: existing, created: false };
  }
  const memberCode = await generateMemberCode(tx);
  const [created] = await tx.insert(users).values({ phone, name: name ?? null, memberCode }).onConflictDoNothing().returning();
  if (created) return { user: created, created: true };
  const [again] = await tx.select().from(users).where(eq(users.phone, phone)).limit(1);
  return { user: again!, created: false };
}

export interface ConsentInput {
  /** Exact consent language shown to the customer (CASL record keeping). */
  text: string;
  source: string;
}

export interface EnsureMemberArgs {
  merchantId: string;
  userId: string;
  joinedVia: JoinSource;
  locationId?: string | null;
  consent?: ConsentInput | null;
  referredByMemberId?: string | null;
  source?: TxSource;
  /** Don't post the welcome bonus (e.g. members migrated from another program via CSV import). */
  skipWelcomeBonus?: boolean;
}

/** Join a customer to a merchant (idempotent). Applies the welcome bonus once. */
export async function ensureMember(ctx: AppContext, tx: Tx, args: EnsureMemberArgs): Promise<{ member: Member; created: boolean }> {
  const [existing] = await tx
    .select()
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, args.merchantId), eq(merchantMembers.userId, args.userId)))
    .limit(1);
  if (existing) {
    if (args.consent && !existing.marketingConsentAt) {
      const [m] = await tx
        .update(merchantMembers)
        .set({ marketingConsentAt: ctx.now(), marketingConsentSource: args.consent.source, marketingConsentText: args.consent.text })
        .where(eq(merchantMembers.id, existing.id))
        .returning();
      return { member: m!, created: false };
    }
    return { member: existing, created: false };
  }
  const [inserted] = await tx
    .insert(merchantMembers)
    .values({
      merchantId: args.merchantId,
      userId: args.userId,
      joinedVia: args.joinedVia,
      joinedLocationId: args.locationId ?? null,
      referredByMemberId: args.referredByMemberId ?? null,
      marketingConsentAt: args.consent ? ctx.now() : null,
      marketingConsentSource: args.consent?.source ?? null,
      marketingConsentText: args.consent?.text ?? null,
      createdAt: ctx.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (!inserted) {
    const [again] = await tx
      .select()
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, args.merchantId), eq(merchantMembers.userId, args.userId)))
      .limit(1);
    return { member: again!, created: false };
  }
  await memberAccount(tx, inserted);
  let member = inserted;
  const [program] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, args.merchantId)).limit(1);
  // A pharmacy never pays a welcome bonus: points for joining are a benefit for a visit, which may be a prescription visit.
  const [shopRow] = !args.skipWelcomeBonus && program?.active && program.welcomeBonus > 0 ? await tx.select({ vertical: merchants.vertical }).from(merchants).where(eq(merchants.id, args.merchantId)).limit(1) : [];
  if (!args.skipWelcomeBonus && program?.active && program.welcomeBonus > 0 && !isPharmacy(shopRow)) {
    const r = await postTransaction(tx, {
      merchantId: args.merchantId,
      memberId: inserted.id,
      type: "welcome_bonus",
      source: args.source ?? "system",
      points: program.welcomeBonus,
      description: "Welcome bonus",
      idempotencyKey: `welcome:${inserted.id}`,
      locationId: args.locationId ?? null,
      at: ctx.now(),
    });
    member = r.member;
  }
  return { member, created: true };
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------
/** Local weekday (0=Sun) and HH:MM in a merchant's timezone. */
export function localParts(date: Date, timeZone: string): { dow: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { dow, hhmm: `${get("hour")}:${get("minute")}` };
}

type Promo = typeof promos.$inferSelect;

export function promoAppliesAt(p: Promo, at: Date, timeZone: string): boolean {
  if (p.status !== "live" && p.status !== "scheduled") return false;
  if (p.startsAt > at) return false;
  if (p.endsAt && p.endsAt <= at) return false;
  if (p.daysOfWeek?.length || p.startTime || p.endTime) {
    const { dow, hhmm } = localParts(promoClockAt(at), timeZone); // TEST_PROMO_NOW pins weekday and hour in tests
    if (p.daysOfWeek?.length && !p.daysOfWeek.includes(dow)) return false;
    if (p.startTime && hhmm < p.startTime) return false;
    if (p.endTime && hhmm >= p.endTime) return false;
  }
  return true;
}

/**
 * Promo boosts (double points / bonus points) live right now. Boosts are a paid
 * feature (promos.double_points): a shop without it gets no boosts, even from
 * promos created while it had the feature (the rows stay; they apply again once enabled).
 */
export async function activeBoosts(
  tx: DbOrTx,
  merchant: Pick<Merchant, "id" | "timezone" | "plan" | "betaOptIn">,
  at: Date,
): Promise<(ActiveBoost & { promoId: string })[]> {
  const rows = await tx
    .select()
    .from(promos)
    .where(
      and(
        eq(promos.merchantId, merchant.id),
        inArray(promos.kind, ["multiplier", "bonus_points"]),
        inArray(promos.status, ["live", "scheduled"]),
        lte(promos.startsAt, at),
        or(isNull(promos.endsAt), gte(promos.endsAt, at)),
      ),
    );
  // Most shops have no live boost: only resolve the feature (three queries) when there is something it could switch off.
  if (!rows.length) return [];
  const on = (await enabledFeaturesFor(tx, [merchant], ["promos.double_points"])).get(merchant.id);
  if (!on?.has("promos.double_points")) return [];
  return rows
    .filter((p) => promoAppliesAt(p, at, merchant.timezone))
    .map((p) => ({
      promoId: p.id,
      multiplier: p.multiplierPct ? p.multiplierPct / 100 : undefined,
      bonusPoints: p.bonusPoints ?? undefined,
      itemId: p.itemId,
      categoryId: p.categoryId,
    }));
}

/**
 * Hooks run after a visit is recorded, inside the same DB transaction
 * (network perks are built in; neighbourhood campaigns register here).
 */
export interface VisitHookArgs {
  ctx: AppContext;
  merchant: Merchant;
  /** The shop's loyalty program, already read by the stamp (hooks called on their own may omit it). */
  program?: typeof loyaltyPrograms.$inferSelect;
  /** The member row, locked by this transaction since the start of the stamp. */
  member: Member;
  visitId: string;
  at: Date;
  source: TxSource;
}
export type VisitHook = (tx: Tx, args: VisitHookArgs) => Promise<{ pointsAwarded?: number; messages?: string[] } | void>;
export const visitHooks: VisitHook[] = [];

/**
 * Balance-change listeners (wallet pass updates, customer notifications) run AFTER the ledger transaction commits,
 * from the outbox: the event is written in the same transaction as the ledger rows (`publishBalanceChange`), so it
 * cannot be lost, and delivered by services/outbox.ts (fast path right after the commit, `outbox.drain` job as the
 * retry). They never affect the ledger result. Each listener is a named step: a retry skips the steps that already
 * completed, so a notification is not sent twice. Events for one member are delivered in order.
 */
export interface BalanceChange {
  kind: "award" | "redeem" | "adjust" | "reversal";
  merchantId: string;
  memberId: string;
  userId: string;
  /** Signed change in the shop's own units (points/stamps). */
  delta: number;
  balance: number;
  previousBalance: number;
  source: TxSource;
  at: Date;
  transactionId: string | null;
  /** award: messages from perks/campaign hooks ("Passport: 3 of 5 shops visited."). */
  messages?: string[];
  /** award: the visit this stamp recorded (drives the visit effects: onboarding milestones, ad attribution). */
  visitId?: string;
  /** redeem: the reward. */
  reward?: { id: string; name: string };
}
export type BalanceListener = (ctx: AppContext, change: BalanceChange) => Promise<void>;
export const balanceListeners: BalanceListener[] = [];
const listenerNames = new Map<BalanceListener, string>();

/** Register a listener under a stable step name (stored with the outbox event; do not rename once shipped). */
export function registerBalanceListener(name: string, listener: BalanceListener) {
  if (listenerNames.get(listener) === name) return;
  listenerNames.set(listener, name);
  balanceListeners.push(listener);
}

/** Write the balance change to the outbox inside the ledger transaction. Call `kickOutbox` once it has committed. */
export async function publishBalanceChange(ctx: AppContext, tx: DbOrTx, change: BalanceChange): Promise<void> {
  await enqueueOutbox(ctx, tx, {
    kind: "balance_change",
    orderKey: change.memberId,
    // One event per ledger transaction; a stamp that posted nothing is keyed by its visit.
    dedupeKey: change.transactionId ? `balance:${change.kind}:${change.transactionId}` : `balance:${change.kind}:visit:${change.visitId ?? `${change.memberId}:${change.at.getTime()}`}`,
    merchantId: change.merchantId,
    payload: { ...change, at: change.at.toISOString() },
  });
}

/**
 * Bookkeeping that follows a recorded visit but changes nothing the counter shows: onboarding milestones and
 * activation, ad attribution. They run from the outbox (as named steps, like the listeners), not in the stamp's transaction.
 */
export interface VisitEffectArgs {
  merchantId: string;
  memberId: string;
  userId: string;
  visitId: string;
  at: Date;
  source: TxSource;
}
export type VisitEffect = (ctx: AppContext, args: VisitEffectArgs) => Promise<void>;
const visitEffects = new Map<string, VisitEffect>();
export function registerVisitEffect(name: string, effect: VisitEffect) {
  visitEffects.set(name, effect);
}

registerVisitEffect("milestones", async (ctx, a) => {
  await ctx.db.transaction(async (tx) => {
    const [m] = await tx.select({ id: merchants.id, activatedAt: merchants.activatedAt, status: merchants.status }).from(merchants).where(eq(merchants.id, a.merchantId)).limit(1);
    if (m) await maybeActivateMerchant({ ...ctx, now: () => a.at }, tx, m);
  });
});

registerOutboxHandler("balance_change", async (ctx, ev, steps) => {
  const p = ev.payload as unknown as Omit<BalanceChange, "at"> & { at: string };
  const change: BalanceChange = { ...p, at: new Date(p.at) };
  if (change.kind === "award" && change.visitId) {
    const args: VisitEffectArgs = { merchantId: change.merchantId, memberId: change.memberId, userId: change.userId, visitId: change.visitId, at: change.at, source: change.source };
    for (const [name, effect] of visitEffects) await steps.run(name, () => effect(ctx, args));
  }
  // A visit that earned nothing (a stamp below the minimum spend) has nothing to tell the customer.
  if (change.delta !== 0 || change.messages?.length) for (const l of balanceListeners) await steps.run(listenerNames.get(l) ?? l.name ?? "listener", () => l(ctx, change));
});

export interface AwardArgs {
  merchantId: string;
  /** The shop row, when the caller has just read it (the counter): saves one read. */
  merchant?: Merchant;
  /** Provide one of memberId, userId or phone (E.164). */
  memberId?: string;
  userId?: string;
  phone?: string;
  customerName?: string | null;
  /** Total purchase amount; used when lines are not provided. */
  amountCents?: number;
  lines?: PurchaseLine[];
  source: TxSource;
  locationId?: string | null;
  staffUserId?: string | null;
  idempotencyKey?: string | null;
  externalRef?: string | null;
  /** Skip the visit cooldown (e.g. POS events, which are always real purchases). */
  ignoreCooldown?: boolean;
  joinedVia?: JoinSource;
  consent?: ConsentInput | null;
  /** Visit/stamp programs: items in this visit (e.g. 2 coffees = 2 stamps), 1-10, default 1. Ignored for per_dollar. */
  quantity?: number;
  /** Pharmacies: the cashier confirmed the whole sale is front store (no prescriptions or pharmacy services). */
  frontStoreOnly?: boolean;
}

export interface AwardResult {
  member: Member;
  memberCreated: boolean;
  transaction: LedgerTransaction | null;
  earn: EarnResult;
  duplicate: boolean;
  extraPoints: number;
  messages: string[];
  /** Rewards the member can now afford. */
  rewardsAvailable: { id: string; name: string; pointsCost: number }[];
  /** What the stamp already read about the shop, so the counter's response does not read it again. */
  preloaded?: { program: typeof loyaltyPrograms.$inferSelect; rewards: { id: string; name: string; pointsCost: number }[] };
}

export async function awardPurchase(ctx: AppContext, args: AwardArgs): Promise<AwardResult> {
  const r = await awardPurchaseTx(ctx, args);
  // The outbox row was written in the transaction; start delivering now that it has committed.
  if (!r.duplicate && (r.transaction || r.extraPoints || r.messages.length || r.earn.qualifiesAsVisit)) await kickOutbox(ctx);
  return r;
}

async function awardPurchaseTx(ctx: AppContext, args: AwardArgs): Promise<AwardResult> {
  return ctx.db.transaction(async (tx) => {
    const now = ctx.now();
    const merchant = args.merchant?.id === args.merchantId ? args.merchant : (await tx.select().from(merchants).where(eq(merchants.id, args.merchantId)).limit(1))[0];
    if (!merchant) throw notFound("Merchant");
    if (merchant.status === "closed" || merchant.status === "paused") throw conflict("This shop's loyalty program is paused");
    const [program] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchant.id)).limit(1);
    if (!program || !program.active) throw conflict("Loyalty program is not set up yet");
    if (args.locationId) {
      const [loc] = await tx.select({ id: locations.id }).from(locations).where(and(eq(locations.id, args.locationId), eq(locations.merchantId, merchant.id))).limit(1);
      if (!loc) throw badRequest("Unknown location");
    }

    if (args.idempotencyKey) {
      const [dup] = await tx
        .select()
        .from(ledgerTransactions)
        .where(and(eq(ledgerTransactions.merchantId, merchant.id), eq(ledgerTransactions.idempotencyKey, args.idempotencyKey)))
        .limit(1);
      if (dup) {
        const [m] = await tx.select().from(merchantMembers).where(eq(merchantMembers.id, dup.memberId)).limit(1);
        return {
          member: m!,
          memberCreated: false,
          transaction: dup,
          earn: { eligibleCents: dup.eligibleCents ?? 0, excludedCents: 0, basePoints: dup.points, bonusPoints: 0, totalPoints: dup.points, qualifiesAsVisit: true, breakdown: dup.breakdown ?? [] },
          duplicate: true,
          extraPoints: 0,
          messages: [],
          ...(await rewardsFor(tx, merchant.id, m!.balance, program)),
        };
      }
    }

    // A pharmacy cannot give points until its pharmacist-owner has confirmed the rules.
    assertPharmacyConfirmed(merchant);

    // Resolve the member.
    let member: Member;
    let lockedMember: Member | undefined;
    let memberCreated = false;
    if (args.memberId) {
      // Locked here (the ledger post would lock it next anyway): one read serves the cooldown check and the post.
      const [m] = await tx.select().from(merchantMembers).where(and(eq(merchantMembers.id, args.memberId), eq(merchantMembers.merchantId, merchant.id))).for("update").limit(1);
      if (!m) throw notFound("Member");
      member = m;
      lockedMember = m;
    } else {
      let userId = args.userId;
      if (!userId) {
        if (!args.phone) throw badRequest("Provide a phone number, member code or member");
        userId = (await findOrCreateCustomerByPhone(tx, args.phone, args.customerName)).user.id;
      }
      const r = await ensureMember(ctx, tx, {
        merchantId: merchant.id,
        userId,
        joinedVia: args.joinedVia ?? (args.source === "square" || args.source === "clover" ? "pos" : "phone"),
        locationId: args.locationId,
        consent: args.consent,
        source: args.source,
      });
      member = r.member;
      memberCreated = r.created;
    }

    const visitBased = program.earnType !== "per_dollar";
    if (visitBased && !args.ignoreCooldown && member.lastVisitAt && program.visitCooldownMinutes > 0) {
      const mins = (now.getTime() - member.lastVisitAt.getTime()) / 60000;
      if (mins < program.visitCooldownMinutes) {
        throw new HttpError(409, "cooldown", `Already checked in ${Math.floor(mins)} min ago. Next ${program.terminology === "stamps" ? "stamp" : "visit"} in ${Math.ceil(program.visitCooldownMinutes - mins)} min.`);
      }
    }

    const rawLines: PurchaseLine[] = args.lines?.length ? args.lines : [{ amountCents: Math.max(0, args.amountCents ?? 0) }];
    // Pharmacies: per-dollar only, a front-store confirmation for amount-only sales, uncategorised lines earn nothing (services/pharmacy.ts).
    const rx = isPharmacy(merchant) ? pharmacyAwardPlan(program, args, rawLines) : null;
    const lines: PurchaseLine[] = rx?.lines ?? rawLines;
    let amountCents = lines.reduce((s, l) => s + Math.max(0, l.amountCents), 0);
    // Only lines tagged with a category can fall in a no-earn one; an amount-only stamp needs no category read.
    const cats = lines.some((l) => l.categoryId) ? await tx.select({ id: merchantCategories.id, earn: merchantCategories.earnEligible, dispensary: merchantCategories.dispensary }).from(merchantCategories).where(eq(merchantCategories.merchantId, merchant.id)) : [];
    const noEarn = [...cats.filter((c) => !c.earn || c.dispensary).map((c) => c.id), ...(rx?.extraNoEarn ?? [])];
    const boosts = await activeBoosts(tx, merchant, now);
    let vipMultiplier = 1;
    // VIP multipliers are a paid feature (loyalty.vip_levels); levels are kept but don't boost earn while it's off.
    if (member.vipLevelId && (await enabledFeaturesFor(tx, [merchant], ["loyalty.vip_levels"])).get(merchant.id)?.has("loyalty.vip_levels")) {
      const [lvl] = await tx.select().from(vipLevels).where(eq(vipLevels.id, member.vipLevelId)).limit(1);
      if (lvl) vipMultiplier = lvl.multiplierPct / 100;
    }
    const quantity = visitBased ? Math.min(10, Math.max(1, Math.floor(args.quantity ?? 1))) : 1;
    const earn = calculateEarn({
      rules: { earnType: program.earnType, pointsPerDollar: program.pointsPerDollar, pointsPerVisit: program.pointsPerVisit * quantity, minSpendCents: program.minSpendCents },
      lines,
      noEarnCategoryIds: noEarn,
      boosts,
      vipMultiplier,
    });
    // A pharmacy sale with nothing from the front store is not a visit: no member, no welcome bonus, no bonus points, no network perk.
    // Throwing rolls back everything this transaction did (including a member it just created).
    if (rx && earn.eligibleCents <= 0) throw nothingFrontStore();
    // Front-store reporting: what a pharmacy records (the sale, the visit, lifetime spend) is the front-store amount, never the prescription part of a mixed sale.
    if (rx) amountCents = earn.eligibleCents;

    let transaction: LedgerTransaction | null = null;
    if (earn.totalPoints > 0) {
      const r = await postTransaction(tx, {
        merchantId: merchant.id,
        memberId: member.id,
        type: "earn",
        source: args.source,
        points: earn.totalPoints,
        amountCents,
        eligibleCents: earn.eligibleCents,
        breakdown: earn.breakdown,
        description: program.earnType === "per_dollar" ? `Purchase $${(amountCents / 100).toFixed(2)}` : "Visit",
        idempotencyKey: args.idempotencyKey,
        externalRef: args.externalRef,
        staffUserId: args.staffUserId,
        locationId: args.locationId,
        promoId: boosts[0]?.promoId ?? null,
        at: now,
        lockedMember,
        idempotencyChecked: true,
      });
      transaction = r.transaction;
      member = r.member;
    }

    const messages: string[] = [];
    let extraPoints = 0;
    let visitId: string | undefined;
    if (earn.qualifiesAsVisit) {
      const [visit] = await tx
        .insert(visits)
        .values({
          merchantId: merchant.id,
          memberId: member.id,
          userId: member.userId,
          locationId: args.locationId ?? null,
          transactionId: transaction?.id ?? null,
          neighbourhoodId: merchant.neighbourhoodId,
          source: args.source,
          amountCents,
          createdAt: now,
        })
        .returning({ id: visits.id });
      visitId = visit!.id;
      const [m] = await tx
        .update(merchantMembers)
        .set({
          visitCount: sql`${merchantMembers.visitCount} + 1`,
          lastVisitAt: now,
          totalSpendCents: sql`${merchantMembers.totalSpendCents} + ${amountCents}`,
        })
        .where(eq(merchantMembers.id, member.id))
        .returning();
      member = m!;
      member = await refreshVipLevel(tx, member);

      const perk = await applyNetworkPerks(tx, merchant, program, member, now, args.source);
      if (perk) {
        member = perk.member;
        extraPoints += perk.points;
        messages.push(perk.message);
      }
      for (const hook of visitHooks) {
        const out = await hook(tx, { ctx, merchant, program, member, visitId: visit!.id, at: now, source: args.source });
        if (out?.pointsAwarded) extraPoints += out.pointsAwarded;
        if (out?.messages) messages.push(...out.messages);
      }
      if (extraPoints) {
        const [m2] = await tx.select().from(merchantMembers).where(eq(merchantMembers.id, member.id)).limit(1);
        member = m2!;
      }
    }

    const delta = (transaction?.points ?? 0) + extraPoints;
    if (delta !== 0 || messages.length || visitId)
      await publishBalanceChange(ctx, tx, {
        kind: "award",
        merchantId: merchant.id,
        memberId: member.id,
        userId: member.userId,
        delta,
        balance: member.balance,
        previousBalance: member.balance - delta,
        source: args.source,
        at: now,
        transactionId: transaction?.id ?? null,
        messages,
        visitId,
      });

    return {
      member,
      memberCreated,
      transaction,
      earn,
      duplicate: false,
      extraPoints,
      messages,
      ...(await rewardsFor(tx, merchant.id, member.balance, program)),
    };
  });
}

/** The shop's active rewards (one read), the ones `balance` can afford, and both kept for the caller's response. */
async function rewardsFor(tx: DbOrTx, merchantId: string, balance: number, program: typeof loyaltyPrograms.$inferSelect) {
  const all = await tx
    .select({ id: rewards.id, name: rewards.name, pointsCost: rewards.pointsCost })
    .from(rewards)
    .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true)))
    .orderBy(rewards.pointsCost);
  return { rewardsAvailable: all.filter((r) => r.pointsCost <= balance), preloaded: { program, rewards: all } };
}

export async function refreshVipLevel(tx: DbOrTx, member: Member): Promise<Member> {
  const levels = await tx.select().from(vipLevels).where(eq(vipLevels.merchantId, member.merchantId)).orderBy(desc(vipLevels.thresholdPoints));
  const level = levels.find((l) => member.lifetimePoints >= l.thresholdPoints) ?? null;
  const next = level?.id ?? null;
  if (next === member.vipLevelId) return member;
  const [m] = await tx.update(merchantMembers).set({ vipLevelId: next }).where(eq(merchantMembers.id, member.id)).returning();
  return m!;
}

// Drizzle writes the columns of a single-table select without their table name, which would let the sub-selects below read their
// own tables' `id`; the outer perk columns are therefore spelled out.
const PERK_ID = sql.raw('"network_perks"."id"');
const PERK_WINDOW_DAYS = sql.raw('"network_perks"."window_days"');

/** Network-funded bonus when a customer visits N distinct shops in the neighbourhood. */
async function applyNetworkPerks(tx: Tx, merchant: Merchant, program: typeof loyaltyPrograms.$inferSelect, member: Member, now: Date, source: TxSource) {
  if (!merchant.neighbourhoodId) return null;
  // A pharmacy never pays or counts toward a "visit N shops" perk (a visit is not a front-store sale).
  if (isPharmacy(merchant)) return null;
  // One read: the perks that apply here, whether this customer already has each, and (only when not) how many distinct
  // shops they visited in the perk's window. A customer who has them all, or no perk exists, costs one statement.
  const perks = await tx
    .select({
      perk: networkPerks,
      already: sql<boolean>`exists (select 1 from ${networkPerkAwards} where ${networkPerkAwards.perkId} = ${PERK_ID} and ${networkPerkAwards.userId} = ${member.userId})`,
      shops: sql<number>`case when exists (select 1 from ${networkPerkAwards} where ${networkPerkAwards.perkId} = ${PERK_ID} and ${networkPerkAwards.userId} = ${member.userId}) then 0 else (select count(distinct ${visits.merchantId})::int from ${visits} where ${visits.userId} = ${member.userId} and ${visits.merchantId} not in (select "id" from "merchants" where "vertical" = 'pharmacy') and ${visits.neighbourhoodId} = ${merchant.neighbourhoodId} and ${visits.createdAt} >= ${now.toISOString()}::timestamptz - ${PERK_WINDOW_DAYS} * interval '1 day') end`,
    })
    .from(networkPerks)
    .where(and(eq(networkPerks.active, true), or(eq(networkPerks.neighbourhoodId, merchant.neighbourhoodId), isNull(networkPerks.neighbourhoodId))));
  for (const { perk, already, shops } of perks) {
    if (perk.ruleType !== "distinct_merchants") continue;
    if (already) continue;
    if (Number(shops ?? 0) < perk.threshold) continue;
    const bonus = networkBonusInShopUnits(program, perk.bonusPoints);
    const r = await postTransaction(tx, {
      merchantId: merchant.id,
      memberId: member.id,
      type: "network_bonus",
      source,
      points: bonus,
      description: perk.name,
      idempotencyKey: `perk:${perk.id}:${member.userId}`,
      at: now,
    });
    await tx.insert(networkPerkAwards).values({ perkId: perk.id, userId: member.userId, merchantId: merchant.id, transactionId: r.transaction.id }).onConflictDoNothing();
    const unit = program.earnType === "per_dollar" ? "points" : bonus === 1 ? program.terminology.replace(/s$/, "") : program.terminology;
    return { member: r.member, points: bonus, message: `${perk.name}: +${bonus} bonus ${unit} from the neighbourhood` };
  }
  return null;
}

/** Mark the merchant activated once it has N members with at least one visit; records the onboarding milestones on the way. */
export async function maybeActivateMerchant(ctx: AppContext, tx: DbOrTx, merchant: Pick<Merchant, "id" | "activatedAt" | "status">) {
  return recordVisitMilestones(ctx, tx, merchant);
}

// ---------------------------------------------------------------------------
// Redeeming, adjusting, reversing
// ---------------------------------------------------------------------------
export interface RedeemArgs {
  merchantId: string;
  memberId: string;
  rewardId: string;
  source: TxSource;
  staffUserId?: string | null;
  locationId?: string | null;
  idempotencyKey?: string | null;
  /** Eligible subtotal for computing percent-off rewards (optional). */
  subtotalCents?: number | null;
}

/** App-issued (customer_app) redemption codes expire if not used at the counter. */
export const REDEMPTION_CODE_TTL_MS = 10 * 60_000;

export async function redeemReward(ctx: AppContext, args: RedeemArgs) {
  const r = await redeemRewardTx(ctx, args);
  if (!r.duplicate) await kickOutbox(ctx);
  return r;
}

async function redeemRewardTx(ctx: AppContext, args: RedeemArgs) {
  return ctx.db.transaction(async (tx) => {
    const now = ctx.now();
    const [reward] = await tx.select().from(rewards).where(and(eq(rewards.id, args.rewardId), eq(rewards.merchantId, args.merchantId))).limit(1);
    if (!reward || !reward.active) throw notFound("Reward");
    const r = await postTransaction(tx, {
      merchantId: args.merchantId,
      memberId: args.memberId,
      type: "redeem",
      source: args.source,
      points: -reward.pointsCost,
      description: `Redeemed: ${reward.name}`,
      rewardId: reward.id,
      staffUserId: args.staffUserId,
      locationId: args.locationId,
      idempotencyKey: args.idempotencyKey,
      at: now,
    });
    if (r.duplicate) {
      const [existing] = await tx.select().from(redemptions).where(eq(redemptions.transactionId, r.transaction.id)).limit(1);
      return { redemption: existing!, member: r.member, reward, duplicate: true };
    }
    const discountCents = args.subtotalCents != null ? rewardDiscountCents(reward, args.subtotalCents) : reward.rewardType === "amount_off" ? reward.value : null;
    let redemption: typeof redemptions.$inferSelect | undefined;
    for (let i = 0; i < 5 && !redemption; i++) {
      [redemption] = await tx
        .insert(redemptions)
        .values({
          merchantId: args.merchantId,
          memberId: args.memberId,
          rewardId: reward.id,
          transactionId: r.transaction.id,
          code: randomCode(6),
          // Staff-initiated redemptions are applied at the counter immediately.
          status: args.source === "customer_app" ? "issued" : "used",
          usedAt: args.source === "customer_app" ? null : now,
          expiresAt: args.source === "customer_app" ? new Date(now.getTime() + REDEMPTION_CODE_TTL_MS) : null,
          discountCents,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning();
    }
    await publishBalanceChange(ctx, tx, {
      kind: "redeem",
      merchantId: args.merchantId,
      memberId: r.member.id,
      userId: r.member.userId,
      delta: -reward.pointsCost,
      balance: r.member.balance,
      previousBalance: r.member.balance + reward.pointsCost,
      source: args.source,
      at: now,
      transactionId: redemption!.transactionId,
      reward: { id: reward.id, name: reward.name },
    });
    return { redemption: redemption!, member: r.member, reward, duplicate: false };
  });
}

export async function adjustPoints(
  ctx: AppContext,
  args: { merchantId: string; memberId: string; points: number; reason: string; staffUserId: string; source?: TxSource; idempotencyKey?: string | null },
) {
  if (!args.reason.trim()) throw badRequest("A reason is required for manual adjustments");
  if (args.points === 0) throw badRequest("Adjustment cannot be zero");
  const r = await ctx.db.transaction(async (tx) => {
    // A pharmacy can't hand out points by hand for a prescription or a health reason: the reason is checked like any other label.
    const [shop] = await tx.select({ vertical: merchants.vertical }).from(merchants).where(eq(merchants.id, args.merchantId)).limit(1);
    if (shop) assertPharmacyText(shop, args.reason, "The reason", { mode: "label" });
    const posted = await postTransaction(tx, {
      merchantId: args.merchantId,
      memberId: args.memberId,
      type: "adjust",
      source: args.source ?? "dashboard",
      points: args.points,
      description: args.reason,
      staffUserId: args.staffUserId,
      idempotencyKey: args.idempotencyKey,
      at: ctx.now(),
    });
    if (!posted.duplicate)
      await publishBalanceChange(ctx, tx, {
        kind: "adjust",
        merchantId: args.merchantId,
        memberId: posted.member.id,
        userId: posted.member.userId,
        delta: args.points,
        balance: posted.member.balance,
        previousBalance: posted.member.balance - args.points,
        source: args.source ?? "dashboard",
        at: ctx.now(),
        transactionId: posted.transaction.id,
      });
    return posted;
  });
  if (!r.duplicate) await kickOutbox(ctx);
  return r;
}

/** Reverse a transaction (refund, mistake). Each transaction can be reversed once. */
export async function reverseTransaction(
  ctx: AppContext,
  args: { merchantId: string; transactionId: string; reason: string; staffUserId?: string | null; source?: TxSource },
) {
  const r = await reverseTransactionTx(ctx, args);
  await kickOutbox(ctx);
  return r;
}

async function reverseTransactionTx(
  ctx: AppContext,
  args: { merchantId: string; transactionId: string; reason: string; staffUserId?: string | null; source?: TxSource },
) {
  return ctx.db.transaction(async (tx) => {
    const [orig] = await tx
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.id, args.transactionId), eq(ledgerTransactions.merchantId, args.merchantId)))
      .for("update")
      .limit(1);
    if (!orig) throw notFound("Transaction");
    if (orig.type === "reversal") throw badRequest("Cannot reverse a reversal");
    if (orig.reversedAt) throw conflict("Transaction was already reversed");
    const counter = orig.type === "redeem" ? "merchant_redeemed" : orig.type === "network_bonus" ? "network_issued" : "merchant_issued";
    const r = await postTransaction(tx, {
      merchantId: orig.merchantId,
      memberId: orig.memberId,
      type: "reversal",
      source: args.source ?? "dashboard",
      points: -orig.points,
      description: `Reversal: ${args.reason}`,
      staffUserId: args.staffUserId,
      reversesTransactionId: orig.id,
      idempotencyKey: `reverse:${orig.id}`,
      counterAccount: counter,
      allowNegative: true,
      at: ctx.now(),
    });
    if (orig.points > 0 && LIFETIME_TYPES.has(orig.type)) {
      await tx
        .update(merchantMembers)
        .set({ lifetimePoints: sql`greatest(0, ${merchantMembers.lifetimePoints} - ${orig.points})` })
        .where(eq(merchantMembers.id, orig.memberId));
    }
    await tx.update(ledgerTransactions).set({ reversedAt: ctx.now() }).where(eq(ledgerTransactions.id, orig.id));
    if (orig.type === "redeem") await tx.update(redemptions).set({ status: "void" }).where(eq(redemptions.transactionId, orig.id));
    const [member] = await tx.select().from(merchantMembers).where(eq(merchantMembers.id, orig.memberId)).limit(1);
    await publishBalanceChange(ctx, tx, {
      kind: "reversal",
      merchantId: args.merchantId,
      memberId: member!.id,
      userId: member!.userId,
      delta: r.transaction.points,
      balance: member!.balance,
      previousBalance: member!.balance - r.transaction.points,
      source: args.source ?? "dashboard",
      at: ctx.now(),
      transactionId: r.transaction.id,
    });
    return { transaction: r.transaction, member: member! };
  });
}
