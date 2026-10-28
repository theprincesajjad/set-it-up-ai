/**
 * Counter operations for staff (award, redeem, lookup, undo, offline sync,
 * kiosk check-in, merging duplicates). Built for a ≤5 s round trip on bad
 * Wi-Fi: lookups are single joined queries plus a few small parallel reads.
 *
 * Isolation: every query is filtered by the merchant id that requireStaff()
 * authorized. A member id, member code or phone from another merchant simply
 * resolves to "not found" here.
 *
 * Points only change through ledger.ts.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  auditLogs,
  discountCards,
  ledgerTransactions,
  locations,
  loyaltyPrograms,
  merchantCategories,
  merchantMembers,
  merchants,
  messageDeliveries,
  redemptions,
  rewards,
  users,
  vipLevels,
  visits,
  type DbOrTx,
} from "@ll/db";
import { normalizePhone, staffApi, type customerApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { notMerged, requireUuid } from "./customer.js";
import {
  awardPurchase,
  ensureMember,
  findOrCreateCustomerByPhone,
  postTransaction,
  redeemReward,
  refreshVipLevel,
  reverseTransaction,
  type AwardResult,
  type ConsentInput,
} from "./ledger.js";
import { enabledFeaturesByMerchantId, enabledFeaturesFor } from "./features.js";
import { memberRhythms, shopDate } from "./member-stats.js";
import { affordable, cardsForMember, expiryDisclosure, firstName, iso, maskedPhone, nextReward, terminologyOf, vipDto } from "./serializers.js";
import { sendSms } from "./opt-out.js";
import { assertPharmacyRedeem } from "./pharmacy-guard.js";

type Merchant = typeof merchants.$inferSelect;
type Member = typeof merchantMembers.$inferSelect;
type Program = typeof loyaltyPrograms.$inferSelect;
type SqlWhere = ReturnType<typeof and>;

const MERGED_TAG = "merged";
const mergedIntoTag = (id: string) => `merged_into:${id}`;

// ---------------------------------------------------------------------------
// Member summaries
// ---------------------------------------------------------------------------
async function loadProgram(db: DbOrTx, merchantId: string): Promise<Program | null> {
  const [p] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  return p ?? null;
}

/**
 * Builds summaries for the members matching `where` (always AND-ed with the
 * merchant scope and "not merged"). One joined query (member, user, VIP level, open redemptions, optionally this
 * month's visits) plus the program, the rewards and the feature check in parallel; discount cards are read only
 * when the shop has them.
 */
interface SummaryOptions {
  /** Also count each member's visits since this instant. */
  monthStart?: Date;
  /** What the caller already read; each one saves a statement. */
  preloaded?: { merchant?: Merchant; program?: Program; rewards?: { id: string; name: string; pointsCost: number }[] };
}

async function loadSummaries(db: DbOrTx, merchantId: string, where: SqlWhere, limit: number, opts: SummaryOptions = {}): Promise<{ dto: staffApi.MemberSummaryDto; visitsThisMonth: number }[]> {
  const { monthStart, preloaded } = opts;
  const [rows, program, rs, paid] = await Promise.all([
    db
      .select({
        member: merchantMembers,
        phone: users.phone,
        name: users.name,
        memberCode: users.memberCode,
        vip: vipLevels,
        open: sql<number>`(select count(*)::int from ${redemptions} where ${redemptions.merchantId} = ${merchantId} and ${redemptions.status} = 'issued' and ${redemptions.memberId} = ${merchantMembers.id})`,
        month: monthStart ? sql<number>`(select count(*)::int from ${visits} where ${visits.memberId} = ${merchantMembers.id} and ${visits.createdAt} >= ${monthStart.toISOString()}::timestamptz)` : sql<number>`0`,
      })
      .from(merchantMembers)
      .innerJoin(users, eq(users.id, merchantMembers.userId))
      .leftJoin(vipLevels, eq(vipLevels.id, merchantMembers.vipLevelId))
      .where(and(eq(merchantMembers.merchantId, merchantId), notMerged, where))
      .orderBy(desc(merchantMembers.lastVisitAt))
      .limit(limit),
    preloaded?.program ?? loadProgram(db, merchantId),
    preloaded?.rewards ??
      db
        .select({ id: rewards.id, name: rewards.name, pointsCost: rewards.pointsCost })
        .from(rewards)
        .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true))),
    (preloaded?.merchant ? enabledFeaturesFor(db, [preloaded.merchant], ["discount_cards", "loyalty.vip_levels"]) : enabledFeaturesByMerchantId(db, [merchantId], ["discount_cards", "loyalty.vip_levels"])).then((m) => m.get(merchantId) ?? new Set()),
  ]);
  if (!rows.length) return [];
  const cards = paid.has("discount_cards") ? await db.select().from(discountCards).where(and(eq(discountCards.merchantId, merchantId), eq(discountCards.active, true))) : [];
  return rows.map(({ member, phone, name, memberCode, vip, open, month }) => ({
    visitsThisMonth: Number(month),
    dto: {
      memberId: member.id,
      name: name ?? null,
      maskedPhone: maskedPhone(phone),
      memberCode,
      balance: member.balance,
      terminology: terminologyOf(program),
      visitCount: member.visitCount,
      lastVisitAt: iso(member.lastVisitAt),
      joinedAt: member.createdAt.toISOString(),
      // VIP levels and discount cards are paid: hidden at the counter while the shop doesn't have them.
      vip: paid.has("loyalty.vip_levels") ? vipDto(vip) : null,
      rewardsAffordable: affordable(rs, member.balance),
      nextReward: nextReward(rs, member.balance),
      discountCards: paid.has("discount_cards") ? cardsForMember(cards.filter((c) => c.eligibility !== "vip" || paid.has("loyalty.vip_levels")), member) : [],
      openRedemptionCount: Number(open),
      marketingConsent: !!member.marketingConsentAt,
      expiryDisclosure: expiryDisclosure(program),
    },
  }));
}

async function summaries(db: DbOrTx, merchantId: string, where: SqlWhere, limit = 10): Promise<staffApi.MemberSummaryDto[]> {
  return (await loadSummaries(db, merchantId, where, limit)).map((r) => r.dto);
}

export async function memberSummary(db: DbOrTx, merchantId: string, memberId: string): Promise<staffApi.MemberSummaryDto> {
  const [s] = await summaries(db, merchantId, eq(merchantMembers.id, memberId), 1);
  if (!s) throw notFound("Member");
  return s;
}

/** "LL:ABCD2345" / "abcd2345" → "ABCD2345" */
export function parseMemberCode(input: string): string {
  const s = input.trim().toUpperCase();
  return s.startsWith(staffApi.QR_PAYLOAD_PREFIX) ? s.slice(staffApi.QR_PAYLOAD_PREFIX.length).trim() : s;
}

const MEMBER_CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

/**
 * `onlyServedBy`: a chair renter who sees only their own clients finds people by phone or last 4 digits only among those they have served
 * (an appointment or walk-in at their chair). Scanning the customer's own card still finds them, because the card is in front of them.
 */
export async function lookup(ctx: AppContext, merchantId: string, qInput: string, onlyServedBy?: string): Promise<staffApi.LookupResponse> {
  const q = qInput.trim();
  const served = onlyServedBy ? sql`${users.id} in (select user_id from appointments where merchant_id = ${merchantId} and staff_id = ${onlyServedBy} and user_id is not null)` : undefined;
  const upper = q.toUpperCase();
  if (upper.startsWith(staffApi.QR_PAYLOAD_PREFIX) || MEMBER_CODE_RE.test(upper)) {
    const code = parseMemberCode(q);
    return { matchedBy: "member_code", items: await summaries(ctx.db, merchantId, and(eq(users.memberCode, code), isNull(users.deletedAt)), 1), normalizedPhone: null };
  }
  if (/^\d{4}$/.test(q)) {
    return { matchedBy: "last4", items: await summaries(ctx.db, merchantId, and(like(users.phone, `%${q}`), served), 10), normalizedPhone: null };
  }
  const phone = normalizePhone(q);
  if (!phone) throw badRequest("Enter a phone number, the last 4 digits, or scan the member's QR code");
  const items = await summaries(ctx.db, merchantId, and(eq(users.phone, phone), served), 1);
  return { matchedBy: "phone", items, normalizedPhone: items.length ? null : phone };
}

/**
 * "Stamp on tap": up to six regulars (a visit pattern, not a guess) who have not been stamped today, most frequent first.
 * The barista who knows Priya taps her name instead of keying digits. Same summary the 4-digit search returns.
 */
export async function regulars(ctx: AppContext, merchantId: string, timezone: string): Promise<staffApi.RegularsResponse> {
  const now = ctx.now();
  const today = shopDate(now, timezone);
  const rhythms = await memberRhythms(ctx.db, merchantId, timezone, now);
  const ids = [...rhythms.entries()]
    .filter(([, r]) => r.isRegular && r.lastVisitAt && shopDate(r.lastVisitAt, timezone) !== today)
    .sort((a, b) => b[1].visits30d - a[1].visits30d || (b[1].lastVisitAt!.getTime() - a[1].lastVisitAt!.getTime()))
    .slice(0, 6)
    .map(([id]) => id);
  if (!ids.length) return { items: [] };
  const items = await summaries(ctx.db, merchantId, and(inArray(merchantMembers.id, ids), isNull(users.deletedAt)), 6);
  const order = new Map(ids.map((id, i) => [id, i]));
  return { items: items.sort((a, b) => (order.get(a.memberId) ?? 0) - (order.get(b.memberId) ?? 0)) };
}

// ---------------------------------------------------------------------------
// Resolving who the customer is
// ---------------------------------------------------------------------------
interface CustomerRef {
  phone?: string;
  memberCode?: string;
  memberId?: string;
}

interface ResolvedCustomer {
  /** Existing (non-merged) member at this merchant. */
  member: Pick<Member, "id" | "lastVisitAt"> | null;
  /** Network user, when known. */
  userId: string | null;
  phone: string | null;
  joinedVia: "phone" | "wallet";
}

/**
 * Resolve a phone / member code / member id to this merchant's member,
 * following merges (a merged duplicate forwards to the member it was merged into).
 */
async function resolveCustomer(db: DbOrTx, merchantId: string, ref: CustomerRef): Promise<ResolvedCustomer> {
  if (ref.memberId) {
    requireUuid(ref.memberId, "Member");
    const [m] = await db
      .select({ id: merchantMembers.id, lastVisitAt: merchantMembers.lastVisitAt, tags: merchantMembers.tags, userId: merchantMembers.userId })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.id, ref.memberId), eq(merchantMembers.merchantId, merchantId)))
      .limit(1);
    if (!m) throw notFound("Member");
    return forwardMerged(db, merchantId, { member: m, userId: m.userId, phone: null, joinedVia: "phone" }, m.tags);
  }
  let userWhere: SqlWhere;
  let phone: string | null = null;
  let joinedVia: ResolvedCustomer["joinedVia"] = "phone";
  if (ref.memberCode) {
    userWhere = and(eq(users.memberCode, parseMemberCode(ref.memberCode)), isNull(users.deletedAt));
    joinedVia = "wallet";
  } else {
    phone = normalizePhone(ref.phone ?? "");
    if (!phone) throw badRequest("Enter a valid phone number", [{ path: "phone", message: "Invalid phone number" }]);
    userWhere = eq(users.phone, phone);
  }
  const [hit] = await db
    .select({ userId: users.id, memberId: merchantMembers.id, lastVisitAt: merchantMembers.lastVisitAt, tags: merchantMembers.tags })
    .from(users)
    .leftJoin(merchantMembers, and(eq(merchantMembers.userId, users.id), eq(merchantMembers.merchantId, merchantId)))
    .where(userWhere)
    .limit(1);
  if (!hit) {
    if (ref.memberCode) throw notFound("Member code");
    return { member: null, userId: null, phone, joinedVia };
  }
  const resolved: ResolvedCustomer = { member: hit.memberId ? { id: hit.memberId, lastVisitAt: hit.lastVisitAt } : null, userId: hit.userId, phone, joinedVia };
  return forwardMerged(db, merchantId, resolved, hit.tags ?? []);
}

async function forwardMerged(db: DbOrTx, merchantId: string, r: ResolvedCustomer, tags: string[]): Promise<ResolvedCustomer> {
  if (!tags.includes(MERGED_TAG)) return r;
  const targetId = tags.find((t) => t.startsWith("merged_into:"))?.slice("merged_into:".length);
  if (!targetId) throw conflict("This member was merged. Look them up again.");
  const [t] = await db
    .select({ id: merchantMembers.id, lastVisitAt: merchantMembers.lastVisitAt, userId: merchantMembers.userId })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.id, targetId), eq(merchantMembers.merchantId, merchantId)))
    .limit(1);
  if (!t) throw notFound("Member");
  return { ...r, member: { id: t.id, lastVisitAt: t.lastVisitAt }, userId: t.userId };
}

// ---------------------------------------------------------------------------
// Award
// ---------------------------------------------------------------------------
export const counterKey = (key: string) => `counter:${key}`;

export interface AwardInput extends CustomerRef {
  amountCents?: number;
  lines?: { amountCents: number; categoryId?: string | null; itemId?: string | null; quantity?: number }[];
  /** Part of amountCents that never earns (tobacco, lottery, alcohol, gift cards, bills): becomes a line in a no-earn category. */
  notCountedCents?: number;
  locationId?: string;
  customerName?: string;
  consent?: customerApi.ConsentBody;
  idempotencyKey: string;
  /** Visit/stamp programs: stamps for this visit (1-10). */
  quantity?: number;
  /** Pharmacies: the cashier confirmed the total has no prescriptions or pharmacy services. */
  frontStoreOnly?: boolean;
}

/** The shop's no-earn category for "Not counted" amounts typed at the counter: the first one it has, else one is made. */
async function notCountedCategoryId(db: DbOrTx, merchantId: string): Promise<string> {
  const [cat] = await db.select({ id: merchantCategories.id }).from(merchantCategories).where(and(eq(merchantCategories.merchantId, merchantId), eq(merchantCategories.earnEligible, false))).orderBy(asc(merchantCategories.createdAt)).limit(1);
  if (cat) return cat.id;
  const [made] = await db.insert(merchantCategories).values({ merchantId, name: "Not counted", earnEligible: false, discountEligible: false }).returning({ id: merchantCategories.id });
  return made!.id;
}

async function doAward(
  ctx: AppContext,
  staff: StaffContext,
  input: AwardInput,
  opts: { ignoreCooldown?: boolean; externalRef?: string; consentSource?: string; resolved?: ResolvedCustomer } = {},
): Promise<{ result: AwardResult; response: staffApi.AwardResponse }> {
  if (input.locationId) requireUuid(input.locationId, "Location");
  const who = opts.resolved ?? (await resolveCustomer(ctx.db, staff.merchant.id, input));
  const consent: ConsentInput | null = input.consent ? { text: input.consent.text, source: opts.consentSource ?? "counter_staff" } : null;
  let lines = input.lines;
  if (!lines && input.notCountedCents && input.amountCents != null) {
    if (input.notCountedCents > input.amountCents) throw badRequest("The part that doesn't count is more than the total.");
    lines = [
      { amountCents: input.amountCents - input.notCountedCents },
      { amountCents: input.notCountedCents, categoryId: await notCountedCategoryId(ctx.db, staff.merchant.id) },
    ];
  }
  const result = await awardPurchase(ctx, {
    merchantId: staff.merchant.id,
    merchant: staff.merchant,
    ...(who.member ? { memberId: who.member.id } : who.userId ? { userId: who.userId } : { phone: who.phone! }),
    customerName: input.customerName ?? null,
    amountCents: lines ? undefined : input.amountCents,
    lines,
    source: "staff_app",
    locationId: input.locationId ?? null,
    staffUserId: staff.user.id,
    idempotencyKey: counterKey(input.idempotencyKey),
    externalRef: opts.externalRef ?? null,
    ignoreCooldown: opts.ignoreCooldown,
    joinedVia: who.joinedVia,
    consent,
    quantity: input.quantity,
    frontStoreOnly: input.frontStoreOnly,
  });
  // ensureMember only stores consent for new or not-yet-consented members; an existing member resolved by id needs it here.
  if (consent && who.member && !result.duplicate) {
    await ctx.db
      .update(merchantMembers)
      .set({ marketingConsentAt: ctx.now(), marketingConsentSource: consent.source, marketingConsentText: consent.text })
      .where(and(eq(merchantMembers.id, result.member.id), isNull(merchantMembers.marketingConsentAt)));
  }
  if (consent && !result.duplicate) {
    await ctx.db.insert(auditLogs).values({
      actorUserId: staff.user.id,
      merchantId: staff.merchant.id,
      action: "consent.granted",
      entity: "merchant_member",
      entityId: result.member.id,
      data: { text: consent.text, source: consent.source },
      createdAt: ctx.now(),
    });
  }
  const [summary] = await loadSummaries(ctx.db, staff.merchant.id, eq(merchantMembers.id, result.member.id), 1, {
    monthStart: monthStart(ctx.now(), staff.merchant.timezone),
    preloaded: { merchant: staff.merchant, ...result.preloaded },
  });
  if (!summary) throw notFound("Member");
  const member = summary.dto;
  const pointsEarned = result.transaction?.points ?? 0;
  const receiptQueued = !result.duplicate && pointsEarned > 0 ? await queueReceipt(ctx, staff.merchant, result.member, pointsEarned, member.terminology) : false;
  return {
    result,
    response: {
      member,
      memberCreated: result.memberCreated,
      duplicate: result.duplicate,
      transactionId: result.transaction?.id ?? null,
      pointsEarned,
      extraPoints: result.extraPoints,
      balance: result.member.balance,
      breakdown: result.earn.breakdown,
      eligibleCents: result.earn.eligibleCents,
      excludedCents: result.earn.excludedCents,
      rewardsAvailable: result.rewardsAvailable,
      messages: result.messages,
      receiptQueued,
      visitsThisMonth: summary.visitsThisMonth,
    },
  };
}

export async function award(ctx: AppContext, staff: StaffContext, input: AwardInput): Promise<staffApi.AwardResponse> {
  return (await doAward(ctx, staff, input)).response;
}

/** Test hook: resolves when every in-flight receipt send settles. */
const inflightReceipts = new Set<Promise<unknown>>();
export async function flushReceipts(): Promise<void> {
  await Promise.allSettled([...inflightReceipts]);
}

/**
 * Transactional SMS receipt, sent outside the DB transaction and after the
 * response is built (fire-and-forget: a slow SMS provider never slows the
 * counter). Only when the merchant turned receipts on and the member hasn't muted.
 */
async function queueReceipt(ctx: AppContext, merchant: Merchant, member: Member, points: number, terminology: string): Promise<boolean> {
  if (!merchant.smsReceiptsEnabled || member.muted) return false;
  // Texts cost money, so receipts ride on the paid SMS feature (Free has no SMS).
  const enabled = await enabledFeaturesFor(ctx.db, [merchant], ["marketing.sms"]);
  if (!enabled.get(merchant.id)?.has("marketing.sms")) return false;
  const [u] = await ctx.db.select({ phone: users.phone, deletedAt: users.deletedAt }).from(users).where(eq(users.id, member.userId)).limit(1);
  if (!u?.phone || u.deletedAt) return false;
  const term = points === 1 ? terminology.replace(/s$/, "") : terminology;
  const body = `You earned ${points} ${term} at ${merchant.name}. Balance ${member.balance}. Reply STOP to opt out`;
  const p = (async () => {
    const [d] = await ctx.db
      .insert(messageDeliveries)
      .values({ userId: member.userId, merchantId: merchant.id, channel: "sms", to: u.phone!, body, kind: "transactional", status: "queued", createdAt: ctx.now() })
      .returning({ id: messageDeliveries.id });
    try {
      const sent = await sendSms(ctx, u.phone!, body);
      if (!sent) {
        await ctx.db.update(messageDeliveries).set({ status: "skipped", error: "opted_out" }).where(eq(messageDeliveries.id, d!.id));
        return;
      }
      await ctx.db.update(messageDeliveries).set({ status: "sent", providerId: sent.id }).where(eq(messageDeliveries.id, d!.id));
    } catch (err) {
      await ctx.db.update(messageDeliveries).set({ status: "failed", error: String((err as Error).message ?? err).slice(0, 500) }).where(eq(messageDeliveries.id, d!.id));
    }
  })().catch((err) => {
    if (ctx.config.env !== "test") console.error("receipt failed", err);
  });
  inflightReceipts.add(p);
  void p.finally(() => inflightReceipts.delete(p));
  return true;
}

// ---------------------------------------------------------------------------
// Redeem
// ---------------------------------------------------------------------------
type RedemptionRow = typeof redemptions.$inferSelect;
type RewardRow = typeof rewards.$inferSelect;

async function redemptionResponse(ctx: AppContext, merchantId: string, r: RedemptionRow, reward: RewardRow, duplicate: boolean): Promise<staffApi.CounterRedemptionResponse> {
  return {
    redemption: {
      id: r.id,
      code: r.code,
      status: r.status as "issued" | "used" | "void",
      discountCents: r.discountCents ?? null,
      reward: { id: reward.id, name: reward.name, pointsCost: reward.pointsCost, rewardType: reward.rewardType, value: reward.value },
      transactionId: r.transactionId ?? null,
      createdAt: r.createdAt.toISOString(),
      usedAt: iso(r.usedAt),
    },
    member: await memberSummary(ctx.db, merchantId, r.memberId),
    duplicate,
  };
}

export interface RedeemInput {
  memberId: string;
  rewardId: string;
  subtotalCents?: number;
  locationId?: string;
  /** Pharmacies: the cashier confirmed the reward goes on front-store items only. */
  frontStoreOnly?: boolean;
  idempotencyKey: string;
}

export async function redeem(ctx: AppContext, staff: StaffContext, input: RedeemInput): Promise<staffApi.CounterRedemptionResponse> {
  assertPharmacyRedeem(staff.merchant, input.frontStoreOnly);
  requireUuid(input.rewardId, "Reward");
  if (input.locationId) requireUuid(input.locationId, "Location");
  const who = await resolveCustomer(ctx.db, staff.merchant.id, { memberId: input.memberId });
  const r = await redeemReward(ctx, {
    merchantId: staff.merchant.id,
    memberId: who.member!.id,
    rewardId: input.rewardId,
    source: "staff_app",
    staffUserId: staff.user.id,
    locationId: input.locationId ?? null,
    idempotencyKey: counterKey(input.idempotencyKey),
    subtotalCents: input.subtotalCents ?? null,
  });
  return redemptionResponse(ctx, staff.merchant.id, r.redemption, r.reward, r.duplicate);
}

/** Staff enters the 6-char code a customer issued in the app; marks it used exactly once. */
export async function verifyRedemptionCode(ctx: AppContext, staff: StaffContext, codeInput: string, frontStoreOnly?: boolean): Promise<staffApi.CounterRedemptionResponse> {
  assertPharmacyRedeem(staff.merchant, frontStoreOnly);
  const code = codeInput.trim().toUpperCase();
  const [used] = await ctx.db
    .update(redemptions)
    .set({ status: "used", usedAt: ctx.now() })
    .where(
      and(
        eq(redemptions.merchantId, staff.merchant.id),
        eq(redemptions.code, code),
        eq(redemptions.status, "issued"),
        or(isNull(redemptions.expiresAt), gt(redemptions.expiresAt, ctx.now())),
      ),
    )
    .returning();
  if (used) {
    const [reward] = await ctx.db.select().from(rewards).where(eq(rewards.id, used.rewardId)).limit(1);
    await ctx.db.insert(auditLogs).values({
      actorUserId: staff.user.id,
      merchantId: staff.merchant.id,
      action: "redemption.verified",
      entity: "redemption",
      entityId: used.id,
      createdAt: ctx.now(),
    });
    return redemptionResponse(ctx, staff.merchant.id, used, reward!, false);
  }
  const [existing] = await ctx.db
    .select()
    .from(redemptions)
    .where(and(eq(redemptions.merchantId, staff.merchant.id), eq(redemptions.code, code)))
    .limit(1);
  if (!existing) throw notFound("Reward code");
  if (existing.status === "issued" && existing.expiresAt && existing.expiresAt <= ctx.now()) {
    throw new HttpError(409, "redemption_expired", "This code expired. Ask the customer to redeem again in the app (their points are refunded)");
  }
  if (existing.status === "used") throw new HttpError(409, "already_used", `This code was already used${existing.usedAt ? ` at ${existing.usedAt.toISOString()}` : ""}`);
  throw new HttpError(409, "void", "This code was cancelled");
}

// ---------------------------------------------------------------------------
// Today & activity
// ---------------------------------------------------------------------------
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(at.getTime() / 1000) * 1000;
}

/** Merchant-local date and the UTC instant of its midnight. */
export function localDayStart(at: Date, timeZone: string): { date: string; start: Date } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let start = guess - tzOffsetMs(new Date(guess), timeZone);
  start = guess - tzOffsetMs(new Date(start), timeZone);
  return { date, start: new Date(start) };
}

/** Start (UTC instant) of the shop-local calendar month containing `at`. */
export function monthStart(at: Date, timeZone: string): Date {
  return localDayStart(new Date(`${shopDate(at, timeZone).slice(0, 7)}-01T12:00:00Z`), timeZone).start;
}

export async function today(ctx: AppContext, staff: StaffContext, locationId?: string): Promise<staffApi.TodayResponse> {
  if (locationId) requireUuid(locationId, "Location");
  const { date, start } = localDayStart(ctx.now(), staff.merchant.timezone);
  const mId = staff.merchant.id;
  const visitWhere = and(eq(visits.merchantId, mId), gte(visits.createdAt, start), locationId ? eq(visits.locationId, locationId) : undefined);
  const [rows, [counts], [newMembers], [issued], [reds]] = await Promise.all([
    ctx.db
      .select({ v: visits, name: users.name, phone: users.phone, points: ledgerTransactions.points })
      .from(visits)
      .innerJoin(users, eq(users.id, visits.userId))
      .leftJoin(ledgerTransactions, eq(ledgerTransactions.id, visits.transactionId))
      .where(visitWhere)
      .orderBy(desc(visits.createdAt))
      .limit(200),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(visits).where(visitWhere),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, mId), gte(merchantMembers.createdAt, start), locationId ? eq(merchantMembers.joinedLocationId, locationId) : undefined)),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${ledgerTransactions.points}), 0)::int` })
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.merchantId, mId),
          gte(ledgerTransactions.createdAt, start),
          sql`${ledgerTransactions.points} > 0`,
          ne(ledgerTransactions.type, "reversal"),
          isNull(ledgerTransactions.reversedAt),
          locationId ? eq(ledgerTransactions.locationId, locationId) : undefined,
        ),
      ),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(redemptions)
      .where(and(eq(redemptions.merchantId, mId), gte(redemptions.createdAt, start), ne(redemptions.status, "void"))),
  ]);
  return {
    date,
    visitCount: Number(counts?.n ?? 0),
    newMembers: Number(newMembers?.n ?? 0),
    pointsIssued: Number(issued?.n ?? 0),
    redemptions: Number(reds?.n ?? 0),
    items: rows.map(({ v, name, phone, points }) => ({
      visitId: v.id,
      memberId: v.memberId,
      name: name ?? null,
      maskedPhone: maskedPhone(phone),
      locationId: v.locationId ?? null,
      points: points ?? 0,
      amountCents: v.amountCents ?? null,
      source: v.source,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}

const UNDOABLE = new Set(["earn", "redeem"]);

function canUndo(staff: StaffContext, tx: Pick<typeof ledgerTransactions.$inferSelect, "type" | "reversedAt" | "staffUserId" | "createdAt">, now: Date): boolean {
  if (!UNDOABLE.has(tx.type) || tx.reversedAt) return false;
  if (staff.role === "owner" || staff.role === "manager") return true;
  return tx.staffUserId === staff.user.id && now.getTime() - tx.createdAt.getTime() <= staffApi.UNDO_WINDOW_MINUTES * 60_000;
}

export async function activity(ctx: AppContext, staff: StaffContext, q: { locationId?: string; limit: number }): Promise<staffApi.ActivityResponse> {
  if (q.locationId) requireUuid(q.locationId, "Location");
  const staffUser = alias(users, "staff_user");
  const rows = await ctx.db
    .select({ t: ledgerTransactions, name: users.name, phone: users.phone, staffName: staffUser.name })
    .from(ledgerTransactions)
    .innerJoin(merchantMembers, eq(merchantMembers.id, ledgerTransactions.memberId))
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .leftJoin(staffUser, eq(staffUser.id, ledgerTransactions.staffUserId))
    .where(and(eq(ledgerTransactions.merchantId, staff.merchant.id), q.locationId ? eq(ledgerTransactions.locationId, q.locationId) : undefined))
    .orderBy(desc(ledgerTransactions.createdAt))
    .limit(q.limit);
  const now = ctx.now();
  return {
    items: rows.map(({ t, name, phone, staffName }) => ({
      transactionId: t.id,
      memberId: t.memberId,
      name: name ?? null,
      maskedPhone: maskedPhone(phone),
      type: t.type,
      source: t.source,
      points: t.points,
      amountCents: t.amountCents ?? null,
      description: t.description ?? null,
      staffUserId: t.staffUserId ?? null,
      staffName: staffName ?? null,
      locationId: t.locationId ?? null,
      reversed: !!t.reversedAt,
      canUndo: canUndo(staff, t, now),
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/**
 * Undo an award or redemption. Staff may undo their own within 15 minutes;
 * managers and owners may undo any. Points are reversed through the ledger;
 * the visit the award created is removed so cooldowns and visit counts are right.
 */
export async function undo(ctx: AppContext, staff: StaffContext, transactionId: string, reason: string): Promise<staffApi.UndoResponse> {
  requireUuid(transactionId, "Transaction");
  const [tx] = await ctx.db
    .select()
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.id, transactionId), eq(ledgerTransactions.merchantId, staff.merchant.id)))
    .limit(1);
  if (!tx) throw notFound("Transaction");
  if (!UNDOABLE.has(tx.type)) throw badRequest("Only awards and redemptions can be undone at the counter");
  if (tx.reversedAt) throw conflict("Transaction was already reversed");
  if (!canUndo(staff, tx, ctx.now())) {
    throw forbidden(`You can undo your own awards for ${staffApi.UNDO_WINDOW_MINUTES} minutes. Ask a manager to undo this one.`);
  }
  const rev = await reverseTransaction(ctx, { merchantId: staff.merchant.id, transactionId: tx.id, reason, staffUserId: staff.user.id, source: "staff_app" });
  if (tx.type === "earn") {
    await ctx.db.transaction(async (t) => {
      const removed = await t.delete(visits).where(and(eq(visits.transactionId, tx.id), eq(visits.merchantId, staff.merchant.id))).returning();
      for (const v of removed) {
        const [last] = await t
          .select({ at: sql<Date | null>`max(${visits.createdAt})` })
          .from(visits)
          .where(eq(visits.memberId, v.memberId));
        await t
          .update(merchantMembers)
          .set({
            visitCount: sql`greatest(0, ${merchantMembers.visitCount} - 1)`,
            totalSpendCents: sql`greatest(0, ${merchantMembers.totalSpendCents} - ${v.amountCents ?? 0})`,
            lastVisitAt: last?.at ? new Date(last.at) : null,
          })
          .where(eq(merchantMembers.id, v.memberId));
      }
    });
  }
  return { reversalTransactionId: rev.transaction.id, member: await memberSummary(ctx.db, staff.merchant.id, tx.memberId) };
}

// ---------------------------------------------------------------------------
// Offline sync
// ---------------------------------------------------------------------------
const errorOf = (err: unknown): { code: string; message: string } =>
  err instanceof HttpError ? { code: err.code, message: err.message } : { code: "internal", message: "Something went wrong. Retry this event." };

/**
 * Replays events the counter app queued while offline. Each event is
 * processed independently and idempotently (same keys as the online
 * endpoints, so an award that did reach the server before Wi-Fi dropped is
 * reported as a duplicate, never double-awarded).
 *
 * Cooldown: the server clock can't judge offline visits, so cooldown is
 * evaluated on `occurredAt` — against the member's last visit and against
 * earlier events for the same customer in the batch.
 */
export async function sync(ctx: AppContext, staff: StaffContext, events: staffApi.SyncEvent[]): Promise<staffApi.SyncResponse> {
  const now = ctx.now();
  const program = await loadProgram(ctx.db, staff.merchant.id);
  const cooldownMs = program && program.earnType !== "per_dollar" ? program.visitCooldownMinutes * 60_000 : 0;
  const lastSeen = new Map<string, number>();
  const results: staffApi.SyncEventResult[] = [];
  for (const ev of events) {
    const at = Date.parse(ev.occurredAt);
    try {
      if (at > now.getTime() + 5 * 60_000) throw badRequest("occurredAt is in the future; check the device clock");
      if (at < now.getTime() - staffApi.SYNC_MAX_AGE_DAYS * 86400_000) throw new HttpError(422, "too_old", `Offline events older than ${staffApi.SYNC_MAX_AGE_DAYS} days can't be synced`);
      if (ev.type === "award") {
        const who = await resolveCustomer(ctx.db, staff.merchant.id, ev);
        const key = who.member?.id ?? who.userId ?? who.phone ?? "";
        if (cooldownMs) {
          const [dup] = await ctx.db
            .select({ id: ledgerTransactions.id })
            .from(ledgerTransactions)
            .where(and(eq(ledgerTransactions.merchantId, staff.merchant.id), eq(ledgerTransactions.idempotencyKey, counterKey(ev.idempotencyKey))))
            .limit(1);
          const prev = lastSeen.get(key) ?? (who.member?.lastVisitAt ? who.member.lastVisitAt.getTime() : undefined);
          if (!dup && prev !== undefined && Math.abs(at - prev) < cooldownMs) {
            throw new HttpError(409, "cooldown", "Already checked in within the cooldown window");
          }
        }
        const { response } = await doAward(ctx, staff, ev, { ignoreCooldown: true, externalRef: `offline@${new Date(at).toISOString()}`, resolved: who });
        lastSeen.set(response.member.memberId, at);
        lastSeen.set(key, at);
        results.push({ idempotencyKey: ev.idempotencyKey, type: "award", status: response.duplicate ? "duplicate" : "ok", result: response });
      } else {
        const response = await redeem(ctx, staff, ev);
        results.push({ idempotencyKey: ev.idempotencyKey, type: "redeem", status: response.duplicate ? "duplicate" : "ok", result: response });
      }
    } catch (err) {
      results.push({ idempotencyKey: ev.idempotencyKey, type: ev.type, status: "error", error: errorOf(err) });
    }
  }
  const summary = { ok: 0, duplicate: 0, error: 0 };
  for (const r of results) summary[r.status]++;
  return { results, summary };
}

// ---------------------------------------------------------------------------
// Kiosk (customer-facing tablet, signed in as staff)
// ---------------------------------------------------------------------------
export async function kioskCheckIn(ctx: AppContext, staff: StaffContext, body: staffApi.KioskCheckInBody): Promise<staffApi.KioskCheckInResponse> {
  requireUuid(body.locationId, "Location");
  const phone = normalizePhone(body.phone);
  if (!phone) throw badRequest("Enter a valid phone number", [{ path: "phone", message: "Invalid phone number" }]);
  const [loc] = await ctx.db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, body.locationId), eq(locations.merchantId, staff.merchant.id)))
    .limit(1);
  if (!loc) throw badRequest("Unknown location");
  const program = await loadProgram(ctx.db, staff.merchant.id);
  if (!program?.active) throw conflict("Set up your loyalty program first, then try again.");
  if (staff.merchant.status === "paused" || staff.merchant.status === "closed") throw conflict("This shop's loyalty program is paused");
  const consent = body.consent ? { text: body.consent.text, source: "kiosk" } : null;
  const visitProgram = program.earnType !== "per_dollar" && program.minSpendCents === 0;

  let memberId: string;
  let memberCreated: boolean;
  let pointsEarned = 0;
  let rewardsAvailable: staffApi.AffordableRewardDto[] | null = null;
  if (visitProgram) {
    const { result } = await doAward(
      ctx,
      staff,
      { phone, locationId: body.locationId, consent: body.consent, idempotencyKey: body.idempotencyKey ? `kiosk:${body.idempotencyKey}` : `kiosk:${randomToken(12)}` },
      { consentSource: "kiosk" },
    );
    memberId = result.member.id;
    memberCreated = result.memberCreated;
    pointsEarned = result.transaction?.points ?? 0;
    rewardsAvailable = result.rewardsAvailable;
  } else {
    const r = await ctx.db.transaction(async (tx) => {
      const { user } = await findOrCreateCustomerByPhone(tx, phone);
      return ensureMember(ctx, tx, { merchantId: staff.merchant.id, userId: user.id, joinedVia: "phone", locationId: body.locationId, consent, source: "staff_app" });
    });
    memberId = r.member.id;
    memberCreated = r.created;
  }
  const s = await memberSummary(ctx.db, staff.merchant.id, memberId);
  const first = firstName(s.name);
  const term = s.terminology;
  const message = memberCreated
    ? `Welcome to ${staff.merchant.name}! You have ${s.balance} ${term}.`
    : pointsEarned > 0
      ? `Thanks${first ? ` ${first}` : ""}! +${pointsEarned}. You have ${s.balance} ${term}.`
      : `Welcome back${first ? ` ${first}` : ""}! You have ${s.balance} ${term}.`;
  return {
    memberCreated,
    outcome: visitProgram ? "visit" : "enrolled",
    pointsEarned,
    balance: s.balance,
    terminology: term,
    firstName: first,
    maskedPhone: maskedPhone(phone)!,
    nextReward: s.nextReward,
    rewardsAvailable: rewardsAvailable ?? s.rewardsAffordable,
    expiryDisclosure: s.expiryDisclosure,
    message,
  };
}

// ---------------------------------------------------------------------------
// Merge duplicates (manager+)
// ---------------------------------------------------------------------------
/**
 * Fold a duplicate member into another member of the same merchant.
 *
 * Approach (ledger rule 1): history is never rewritten. The duplicate's
 * ledger rows stay attached to it for audit, and its balance moves with two
 * balanced `adjust` transactions posted through postTransaction():
 *   source: -B (counter: merchant_issued +B)   "Merged into member …"
 *   target: +B (counter: merchant_issued −B)   "Merged from member …"
 * so the merchant_issued account nets to zero and both balances still equal
 * the sum of their entries. Non-points stats (visits, spend, lifetime points)
 * are moved directly; visits are re-pointed to the target. The duplicate is
 * tagged "merged" + "merged_into:<id>", hidden from lookups/wallets, and any
 * future award to its phone/QR is forwarded to the target.
 */
export async function mergeMembers(ctx: AppContext, staff: StaffContext, body: staffApi.MergeMembersBody): Promise<staffApi.MergeMembersResponse> {
  requireUuid(body.sourceMemberId, "Member");
  requireUuid(body.targetMemberId, "Member");
  if (body.sourceMemberId === body.targetMemberId) throw badRequest("Pick two different members");
  const mId = staff.merchant.id;
  const out = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, mId), inArray(merchantMembers.id, [body.sourceMemberId, body.targetMemberId])))
      .for("update");
    const source = rows.find((r) => r.id === body.sourceMemberId);
    const target = rows.find((r) => r.id === body.targetMemberId);
    if (!source || !target) throw notFound("Member");
    if (source.tags.includes(MERGED_TAG) || target.tags.includes(MERGED_TAG)) throw conflict("One of these members was already merged");
    const moved = source.balance;
    const transferIds: string[] = [];
    if (moved !== 0) {
      const outTx = await postTransaction(tx, {
        merchantId: mId,
        memberId: source.id,
        type: "adjust",
        source: "staff_app",
        points: -moved,
        description: `Merged into member ${target.id}: ${body.reason}`,
        staffUserId: staff.user.id,
        idempotencyKey: `merge:${source.id}:out`,
        allowNegative: true,
      });
      const inTx = await postTransaction(tx, {
        merchantId: mId,
        memberId: target.id,
        type: "adjust",
        source: "staff_app",
        points: moved,
        description: `Merged from member ${source.id}: ${body.reason}`,
        staffUserId: staff.user.id,
        idempotencyKey: `merge:${source.id}:in`,
        allowNegative: true,
      });
      transferIds.push(outTx.transaction.id, inTx.transaction.id);
    }
    const movedVisits = await tx
      .update(visits)
      .set({ memberId: target.id, userId: target.userId })
      .where(and(eq(visits.memberId, source.id), eq(visits.merchantId, mId)))
      .returning({ id: visits.id });
    const lastVisitAt =
      source.lastVisitAt && (!target.lastVisitAt || source.lastVisitAt > target.lastVisitAt) ? source.lastVisitAt : target.lastVisitAt;
    const keepConsent = !target.marketingConsentAt && source.marketingConsentAt;
    const [t2] = await tx
      .update(merchantMembers)
      .set({
        visitCount: sql`${merchantMembers.visitCount} + ${source.visitCount}`,
        totalSpendCents: sql`${merchantMembers.totalSpendCents} + ${source.totalSpendCents}`,
        lifetimePoints: sql`${merchantMembers.lifetimePoints} + ${source.lifetimePoints}`,
        lastVisitAt,
        ...(keepConsent
          ? { marketingConsentAt: source.marketingConsentAt, marketingConsentSource: source.marketingConsentSource, marketingConsentText: source.marketingConsentText }
          : {}),
        tags: [...new Set([...target.tags, ...source.tags])],
      })
      .where(eq(merchantMembers.id, target.id))
      .returning();
    await refreshVipLevel(tx, t2!);
    await tx
      .update(merchantMembers)
      .set({
        tags: [...source.tags, MERGED_TAG, mergedIntoTag(target.id)],
        notes: [source.notes, `Merged into ${target.id} on ${ctx.now().toISOString().slice(0, 10)}: ${body.reason}`].filter(Boolean).join("\n"),
        marketingConsentAt: null,
        marketingConsentSource: null,
        marketingConsentText: null,
        muted: true,
        visitCount: 0,
        totalSpendCents: 0,
      })
      .where(eq(merchantMembers.id, source.id));
    await tx.insert(auditLogs).values({
      actorUserId: staff.user.id,
      merchantId: mId,
      action: "member.merged",
      entity: "merchant_member",
      entityId: target.id,
      data: { sourceMemberId: source.id, movedPoints: moved, movedVisits: movedVisits.length, reason: body.reason },
      createdAt: ctx.now(),
    });
    return { moved, movedVisits: movedVisits.length, transferIds };
  });
  return {
    target: await memberSummary(ctx.db, mId, body.targetMemberId),
    movedPoints: out.moved,
    movedVisits: out.movedVisits,
    transferTransactionIds: out.transferIds,
  };
}
