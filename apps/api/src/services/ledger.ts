/**
 * Points ledger: the only code that is allowed to change a member's points.
 *
 * Every change is a ledger_transaction with two ledger_entries that sum to
 * zero (member account vs. a merchant or network account). The cached
 * merchant_members.balance is updated in the same DB transaction.
 */
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
import { recordVisitMilestones } from "./onboarding.js";

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
async function merchantAccount(tx: DbOrTx, merchantId: string | null, kind: AccountKind): Promise<string> {
  const where =
    merchantId === null
      ? and(isNull(ledgerAccounts.merchantId), eq(ledgerAccounts.kind, kind), isNull(ledgerAccounts.memberId))
      : and(eq(ledgerAccounts.merchantId, merchantId), eq(ledgerAccounts.kind, kind), isNull(ledgerAccounts.memberId));
  const [existing] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(where).limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(ledgerAccounts).values({ merchantId, kind }).onConflictDoNothing().returning({ id: ledgerAccounts.id });
  if (created) return created.id;
  const [again] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(where).limit(1);
  return again!.id;
}

async function memberAccount(tx: DbOrTx, member: Pick<Member, "id" | "merchantId">): Promise<string> {
  const [existing] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(eq(ledgerAccounts.memberId, member.id)).limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(ledgerAccounts)
    .values({ merchantId: member.merchantId, kind: "member", memberId: member.id })
    .onConflictDoNothing()
    .returning({ id: ledgerAccounts.id });
  if (created) return created.id;
  const [again] = await tx.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(eq(ledgerAccounts.memberId, member.id)).limit(1);
  return again!.id;
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
}

export interface PostResult {
  transaction: LedgerTransaction;
  member: Member;
  duplicate: boolean;
}

/** Post a balanced transaction. Must be called inside a DB transaction. */
export async function postTransaction(tx: Tx, args: PostArgs): Promise<PostResult> {
  if (!Number.isInteger(args.points)) throw badRequest("Points must be a whole number");

  if (args.idempotencyKey) {
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
  const [member] = await tx
    .select()
    .from(merchantMembers)
    .where(and(eq(merchantMembers.id, args.memberId), eq(merchantMembers.merchantId, args.merchantId)))
    .for("update")
    .limit(1);
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
  if (!args.skipWelcomeBonus && program?.active && program.welcomeBonus > 0) {
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
    const { dow, hhmm } = localParts(at, timeZone);
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
  const on = (await enabledFeaturesFor(tx, [merchant], ["promos.double_points"])).get(merchant.id);
  if (!on?.has("promos.double_points")) return [];
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
  member: Member;
  visitId: string;
  at: Date;
  source: TxSource;
}
export type VisitHook = (tx: Tx, args: VisitHookArgs) => Promise<{ pointsAwarded?: number; messages?: string[] } | void>;
export const visitHooks: VisitHook[] = [];

/**
 * Balance-change listeners run AFTER the ledger transaction commits (wallet pass
 * updates, customer notifications). They never affect the ledger result: errors
 * are logged and swallowed. In tests they are awaited so assertions are
 * deterministic; elsewhere they run in the background so the counter isn't kept waiting.
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
  /** redeem: the reward. */
  reward?: { id: string; name: string };
}
export type BalanceListener = (ctx: AppContext, change: BalanceChange) => Promise<void>;
export const balanceListeners: BalanceListener[] = [];

export async function emitBalanceChange(ctx: AppContext, change: BalanceChange): Promise<void> {
  const run = async () => {
    for (const l of balanceListeners) {
      try {
        await l(ctx, change);
      } catch (err) {
        if (ctx.config.env !== "test") console.error("[ledger] balance listener failed", err);
      }
    }
  };
  if (ctx.config.env === "test") await run();
  else void run();
}

export interface AwardArgs {
  merchantId: string;
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
}

export async function awardPurchase(ctx: AppContext, args: AwardArgs): Promise<AwardResult> {
  const r = await awardPurchaseTx(ctx, args);
  const delta = (r.transaction?.points ?? 0) + r.extraPoints;
  if (!r.duplicate && (delta !== 0 || r.messages.length))
    await emitBalanceChange(ctx, {
      kind: "award",
      merchantId: r.member.merchantId,
      memberId: r.member.id,
      userId: r.member.userId,
      delta,
      balance: r.member.balance,
      previousBalance: r.member.balance - delta,
      source: args.source,
      at: ctx.now(),
      transactionId: r.transaction?.id ?? null,
      messages: r.messages,
    });
  return r;
}

async function awardPurchaseTx(ctx: AppContext, args: AwardArgs): Promise<AwardResult> {
  return ctx.db.transaction(async (tx) => {
    const now = ctx.now();
    const [merchant] = await tx.select().from(merchants).where(eq(merchants.id, args.merchantId)).limit(1);
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
          rewardsAvailable: await affordableRewards(tx, merchant.id, m!.balance),
        };
      }
    }

    // Resolve the member.
    let member: Member;
    let memberCreated = false;
    if (args.memberId) {
      const [m] = await tx.select().from(merchantMembers).where(and(eq(merchantMembers.id, args.memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
      if (!m) throw notFound("Member");
      member = m;
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

    const lines: PurchaseLine[] = args.lines?.length ? args.lines : [{ amountCents: Math.max(0, args.amountCents ?? 0) }];
    const amountCents = lines.reduce((s, l) => s + Math.max(0, l.amountCents), 0);
    const cats = await tx.select({ id: merchantCategories.id, earn: merchantCategories.earnEligible }).from(merchantCategories).where(eq(merchantCategories.merchantId, merchant.id));
    const noEarn = cats.filter((c) => !c.earn).map((c) => c.id);
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
      });
      transaction = r.transaction;
      member = r.member;
    }

    const messages: string[] = [];
    let extraPoints = 0;
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
        .returning();
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
        const out = await hook(tx, { ctx, merchant, member, visitId: visit!.id, at: now, source: args.source });
        if (out?.pointsAwarded) extraPoints += out.pointsAwarded;
        if (out?.messages) messages.push(...out.messages);
      }
      if (extraPoints) {
        const [m2] = await tx.select().from(merchantMembers).where(eq(merchantMembers.id, member.id)).limit(1);
        member = m2!;
      }
      await maybeActivateMerchant(ctx, tx, merchant);
    }

    return {
      member,
      memberCreated,
      transaction,
      earn,
      duplicate: false,
      extraPoints,
      messages,
      rewardsAvailable: await affordableRewards(tx, merchant.id, member.balance),
    };
  });
}

async function affordableRewards(tx: DbOrTx, merchantId: string, balance: number) {
  return tx
    .select({ id: rewards.id, name: rewards.name, pointsCost: rewards.pointsCost })
    .from(rewards)
    .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true), lte(rewards.pointsCost, balance)))
    .orderBy(rewards.pointsCost);
}

export async function refreshVipLevel(tx: DbOrTx, member: Member): Promise<Member> {
  const levels = await tx.select().from(vipLevels).where(eq(vipLevels.merchantId, member.merchantId)).orderBy(desc(vipLevels.thresholdPoints));
  const level = levels.find((l) => member.lifetimePoints >= l.thresholdPoints) ?? null;
  const next = level?.id ?? null;
  if (next === member.vipLevelId) return member;
  const [m] = await tx.update(merchantMembers).set({ vipLevelId: next }).where(eq(merchantMembers.id, member.id)).returning();
  return m!;
}

/** Network-funded bonus when a customer visits N distinct shops in the neighbourhood. */
async function applyNetworkPerks(tx: Tx, merchant: Merchant, program: typeof loyaltyPrograms.$inferSelect, member: Member, now: Date, source: TxSource) {
  if (!merchant.neighbourhoodId) return null;
  const perks = await tx
    .select()
    .from(networkPerks)
    .where(and(eq(networkPerks.active, true), or(eq(networkPerks.neighbourhoodId, merchant.neighbourhoodId), isNull(networkPerks.neighbourhoodId))));
  for (const perk of perks) {
    if (perk.ruleType !== "distinct_merchants") continue;
    const [already] = await tx
      .select({ id: networkPerkAwards.id })
      .from(networkPerkAwards)
      .where(and(eq(networkPerkAwards.perkId, perk.id), eq(networkPerkAwards.userId, member.userId)))
      .limit(1);
    if (already) continue;
    const since = new Date(now.getTime() - perk.windowDays * 86400000);
    const [row] = await tx
      .select({ n: sql<number>`count(distinct ${visits.merchantId})::int` })
      .from(visits)
      .where(and(eq(visits.userId, member.userId), eq(visits.neighbourhoodId, merchant.neighbourhoodId), gte(visits.createdAt, since)));
    if (Number(row?.n ?? 0) < perk.threshold) continue;
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
  if (!r.duplicate)
    await emitBalanceChange(ctx, {
      kind: "redeem",
      merchantId: args.merchantId,
      memberId: r.member.id,
      userId: r.member.userId,
      delta: -r.reward.pointsCost,
      balance: r.member.balance,
      previousBalance: r.member.balance + r.reward.pointsCost,
      source: args.source,
      at: ctx.now(),
      transactionId: r.redemption.transactionId,
      reward: { id: r.reward.id, name: r.reward.name },
    });
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
    return { redemption: redemption!, member: r.member, reward, duplicate: false };
  });
}

export async function adjustPoints(
  ctx: AppContext,
  args: { merchantId: string; memberId: string; points: number; reason: string; staffUserId: string; source?: TxSource; idempotencyKey?: string | null },
) {
  if (!args.reason.trim()) throw badRequest("A reason is required for manual adjustments");
  if (args.points === 0) throw badRequest("Adjustment cannot be zero");
  const r = await ctx.db.transaction((tx) =>
    postTransaction(tx, {
      merchantId: args.merchantId,
      memberId: args.memberId,
      type: "adjust",
      source: args.source ?? "dashboard",
      points: args.points,
      description: args.reason,
      staffUserId: args.staffUserId,
      idempotencyKey: args.idempotencyKey,
      at: ctx.now(),
    }),
  );
  if (!r.duplicate)
    await emitBalanceChange(ctx, {
      kind: "adjust",
      merchantId: args.merchantId,
      memberId: r.member.id,
      userId: r.member.userId,
      delta: args.points,
      balance: r.member.balance,
      previousBalance: r.member.balance - args.points,
      source: args.source ?? "dashboard",
      at: ctx.now(),
      transactionId: r.transaction.id,
    });
  return r;
}

/** Reverse a transaction (refund, mistake). Each transaction can be reversed once. */
export async function reverseTransaction(
  ctx: AppContext,
  args: { merchantId: string; transactionId: string; reason: string; staffUserId?: string | null; source?: TxSource },
) {
  const r = await reverseTransactionTx(ctx, args);
  await emitBalanceChange(ctx, {
    kind: "reversal",
    merchantId: args.merchantId,
    memberId: r.member.id,
    userId: r.member.userId,
    delta: r.transaction.points,
    balance: r.member.balance,
    previousBalance: r.member.balance - r.transaction.points,
    source: args.source ?? "dashboard",
    at: ctx.now(),
    transactionId: r.transaction.id,
  });
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
    return { transaction: r.transaction, member: member! };
  });
}
