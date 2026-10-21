/**
 * Customer self-service (/v1/me/...): profile, PIPEDA delete/export, wallet,
 * joining shops, consent, mute, app redemptions, QR card, push tokens and
 * referrals. Every query here is scoped to the signed-in user's own rows.
 */
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import QRCode from "qrcode";
import {
  auditLogs,
  discountCards,
  invoices,
  ledgerTransactions,
  locations,
  loyaltyPrograms,
  merchantMembers,
  merchants,
  messageDeliveries,
  neighbourhoods,
  orders,
  otpCodes,
  pushTokens,
  redemptions,
  referrals,
  rewards,
  serviceTickets,
  sessions,
  users,
  vipLevels,
  visits,
  walletPasses,
  type DbOrTx,
  type Tx,
} from "@ll/db";
import { BRAND, staffApi, type customerApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { randomCode } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { ensureMember, generateMemberCode, postTransaction, redeemReward, reverseTransaction } from "./ledger.js";
import {
  affordable,
  cardsForMember,
  consentDto,
  expiryDisclosure,
  iso,
  ledgerTxDto,
  memberRewards,
  merchantBrief,
  nextReward,
  programSummary,
  terminologyOf,
  vipDto,
} from "./serializers.js";

type Member = typeof merchantMembers.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
type Program = typeof loyaltyPrograms.$inferSelect;
type Reward = typeof rewards.$inferSelect;
type VipLevel = typeof vipLevels.$inferSelect;

/** Members folded into another member by a merge are hidden from wallets and lookups. */
export const notMerged = sql`not (${merchantMembers.tags} @> '["merged"]'::jsonb)`;

/** Merchants a customer can join or see: onboarding shops are seeding their first members. */
export const JOINABLE_STATUSES = ["onboarding", "active"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Path params are untrusted: a malformed id is a 404, not a database error. */
export function requireUuid(id: string, what: string): string {
  if (!UUID_RE.test(id)) throw notFound(what);
  return id;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
async function loadActiveUser(db: DbOrTx, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.deletedAt) throw new HttpError(401, "unauthorized", "Sign in required");
  return u;
}

export async function getProfile(ctx: AppContext, userId: string): Promise<customerApi.ProfileDto> {
  const u = await loadActiveUser(ctx.db, userId);
  let hood: customerApi.ProfileDto["homeNeighbourhood"] = null;
  if (u.homeNeighbourhoodId) {
    const [n] = await ctx.db
      .select({ id: neighbourhoods.id, slug: neighbourhoods.slug, name: neighbourhoods.name })
      .from(neighbourhoods)
      .where(eq(neighbourhoods.id, u.homeNeighbourhoodId))
      .limit(1);
    hood = n ?? null;
  }
  return {
    id: u.id,
    name: u.name ?? null,
    email: u.email ?? null,
    phone: u.phone ?? null,
    memberCode: u.memberCode,
    birthday: u.birthday ?? null,
    postalCode: u.postalCode ?? null,
    homeNeighbourhood: hood,
    locale: u.locale,
    phoneVerified: !!u.phoneVerifiedAt,
    emailVerified: !!u.emailVerifiedAt,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function updateProfile(ctx: AppContext, userId: string, body: customerApi.UpdateProfileBody): Promise<customerApi.ProfileDto> {
  const u = await loadActiveUser(ctx.db, userId);
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: ctx.now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.birthday !== undefined) patch.birthday = body.birthday;
  if (body.locale !== undefined) patch.locale = body.locale;
  if (body.postalCode !== undefined) {
    patch.postalCode = body.postalCode ? `${body.postalCode.replace(/[ -]/g, "").slice(0, 3)} ${body.postalCode.replace(/[ -]/g, "").slice(3)}`.toUpperCase() : null;
  }
  if (body.homeNeighbourhoodId !== undefined) {
    if (body.homeNeighbourhoodId) {
      const [n] = await ctx.db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.id, body.homeNeighbourhoodId)).limit(1);
      if (!n) throw badRequest("Unknown neighbourhood", [{ path: "homeNeighbourhoodId", message: "Unknown neighbourhood" }]);
    }
    patch.homeNeighbourhoodId = body.homeNeighbourhoodId;
  }
  if (body.email !== undefined) {
    const email = body.email?.trim().toLowerCase() ?? null;
    if (email !== (u.email?.toLowerCase() ?? null)) {
      if (email) {
        const [taken] = await ctx.db.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = ${email}`, ne(users.id, u.id))).limit(1);
        if (taken) throw conflict("That email is used by another account");
      }
      patch.email = email;
      patch.emailVerifiedAt = null;
    }
  }
  await ctx.db.update(users).set(patch).where(eq(users.id, u.id));
  return getProfile(ctx, userId);
}

/**
 * PIPEDA account deletion. The user row is kept (ledger rows reference it and
 * merchants' accounting must still balance) but every piece of personal
 * information is scrubbed, the member code is replaced so old QR codes stop
 * working, consents are withdrawn, and sessions/devices are removed.
 */
export async function deleteAccount(ctx: AppContext, userId: string): Promise<void> {
  const u = await loadActiveUser(ctx.db, userId);
  const now = ctx.now();
  await ctx.db.transaction(async (tx) => {
    const targets = [u.phone, u.email?.toLowerCase()].filter((t): t is string => !!t);
    if (targets.length) await tx.delete(otpCodes).where(inArray(otpCodes.target, targets));
    await tx
      .update(users)
      .set({
        email: null,
        phone: null,
        name: null,
        passwordHash: null,
        birthday: null,
        postalCode: null,
        homeNeighbourhoodId: null,
        phoneVerifiedAt: null,
        emailVerifiedAt: null,
        memberCode: await generateMemberCode(tx),
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, u.id));
    await tx
      .update(merchantMembers)
      .set({ marketingConsentAt: null, marketingConsentSource: null, marketingConsentText: null, muted: true, notes: null })
      .where(eq(merchantMembers.userId, u.id));
    await tx.update(messageDeliveries).set({ to: "[deleted]", body: "[deleted]" }).where(eq(messageDeliveries.userId, u.id));
    await tx.delete(sessions).where(eq(sessions.userId, u.id));
    await tx.delete(pushTokens).where(eq(pushTokens.userId, u.id));
    await tx.delete(walletPasses).where(eq(walletPasses.userId, u.id));
    await tx.insert(auditLogs).values({ actorUserId: u.id, action: "user.deleted", entity: "user", entityId: u.id, createdAt: now });
  });
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
interface WalletRow {
  member: Member;
  merchant: Merchant;
  program: Program | null;
  vip: VipLevel | null;
}

async function walletRows(db: DbOrTx, userId: string, memberId?: string): Promise<WalletRow[]> {
  return db
    .select({ member: merchantMembers, merchant: merchants, program: loyaltyPrograms, vip: vipLevels })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .leftJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, merchantMembers.merchantId))
    .leftJoin(vipLevels, eq(vipLevels.id, merchantMembers.vipLevelId))
    .where(and(eq(merchantMembers.userId, userId), notMerged, memberId ? eq(merchantMembers.id, memberId) : undefined, ne(merchants.status, "closed")))
    .orderBy(desc(merchantMembers.lastVisitAt), merchants.name);
}

async function activeRewardsByMerchant(db: DbOrTx, merchantIds: string[]): Promise<Map<string, Reward[]>> {
  const out = new Map<string, Reward[]>();
  if (!merchantIds.length) return out;
  const rows = await db
    .select()
    .from(rewards)
    .where(and(inArray(rewards.merchantId, merchantIds), eq(rewards.active, true)))
    .orderBy(rewards.sortOrder, rewards.pointsCost);
  for (const r of rows) out.set(r.merchantId, [...(out.get(r.merchantId) ?? []), r]);
  return out;
}

function membershipDto(row: WalletRow, rs: Reward[]): customerApi.MembershipDto {
  const { member, merchant, program, vip } = row;
  return {
    id: member.id,
    merchant: merchantBrief(merchant),
    balance: member.balance,
    lifetimePoints: member.lifetimePoints,
    visitCount: member.visitCount,
    lastVisitAt: iso(member.lastVisitAt),
    joinedAt: member.createdAt.toISOString(),
    terminology: terminologyOf(program),
    program: programSummary(program),
    expiryDisclosure: expiryDisclosure(program),
    nextReward: nextReward(rs, member.balance),
    rewardsAvailableCount: affordable(rs, member.balance).length,
    vip: vipDto(vip),
    muted: member.muted,
    marketingConsent: consentDto(member),
  };
}

export async function getWallet(ctx: AppContext, userId: string): Promise<customerApi.WalletResponse> {
  const rows = await walletRows(ctx.db, userId);
  const rs = await activeRewardsByMerchant(ctx.db, rows.map((r) => r.merchant.id));
  const items = rows.map((r) => membershipDto(r, rs.get(r.merchant.id) ?? []));
  return { items, totals: { shops: items.length, rewardsAvailable: items.reduce((s, i) => s + i.rewardsAvailableCount, 0) } };
}

async function ownMembershipRow(db: DbOrTx, userId: string, memberId: string): Promise<WalletRow> {
  requireUuid(memberId, "Membership");
  const [row] = await walletRows(db, userId, memberId);
  if (!row) throw notFound("Membership");
  return row;
}

export async function getMembership(ctx: AppContext, userId: string, memberId: string): Promise<customerApi.MembershipDto> {
  const row = await ownMembershipRow(ctx.db, userId, memberId);
  const rs = await activeRewardsByMerchant(ctx.db, [row.merchant.id]);
  return membershipDto(row, rs.get(row.merchant.id) ?? []);
}

function encodeCursor(d: Date, id: string) {
  return Buffer.from(`${d.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(c: string | undefined): { at: Date; id: string } | null {
  if (!c) return null;
  const [at, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
  if (!at || !id || Number.isNaN(Date.parse(at)) || !UUID_RE.test(id)) throw badRequest("Invalid cursor");
  return { at: new Date(at), id };
}

function redemptionDto(r: typeof redemptions.$inferSelect, rewardName: string): customerApi.RedemptionDto {
  return {
    id: r.id,
    rewardId: r.rewardId,
    rewardName,
    code: r.code,
    status: r.status as customerApi.RedemptionDto["status"],
    discountCents: r.discountCents ?? null,
    usedAt: iso(r.usedAt),
    createdAt: r.createdAt.toISOString(),
  };
}

export async function getMembershipDetail(
  ctx: AppContext,
  userId: string,
  memberId: string,
  q: { historyLimit: number; historyCursor?: string },
): Promise<customerApi.MembershipDetailResponse> {
  const row = await ownMembershipRow(ctx.db, userId, memberId);
  const cursor = decodeCursor(q.historyCursor);
  const [rs, cards, open, history] = await Promise.all([
    activeRewardsByMerchant(ctx.db, [row.merchant.id]),
    ctx.db.select().from(discountCards).where(and(eq(discountCards.merchantId, row.merchant.id), eq(discountCards.active, true))),
    ctx.db
      .select({ r: redemptions, rewardName: rewards.name })
      .from(redemptions)
      .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
      .where(and(eq(redemptions.memberId, row.member.id), eq(redemptions.merchantId, row.merchant.id), eq(redemptions.status, "issued")))
      .orderBy(desc(redemptions.createdAt)),
    ctx.db
      .select()
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.memberId, row.member.id),
          eq(ledgerTransactions.merchantId, row.merchant.id),
          cursor ? sql`(${ledgerTransactions.createdAt}, ${ledgerTransactions.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined,
        ),
      )
      .orderBy(desc(ledgerTransactions.createdAt), desc(ledgerTransactions.id))
      .limit(q.historyLimit + 1),
  ]);
  const merchantRewards = rs.get(row.merchant.id) ?? [];
  const page = history.slice(0, q.historyLimit);
  const last = page[page.length - 1];
  return {
    membership: membershipDto(row, merchantRewards),
    rewards: memberRewards(merchantRewards, row.member.balance),
    discountCards: cardsForMember(cards, row.member),
    openRedemptions: open.map((o) => redemptionDto(o.r, o.rewardName)),
    history: { items: page.map(ledgerTxDto), nextCursor: history.length > q.historyLimit && last ? encodeCursor(last.createdAt, last.id) : null },
  };
}

// ---------------------------------------------------------------------------
// Joining, referrals
// ---------------------------------------------------------------------------
type ReferralOutcome = NonNullable<customerApi.JoinResponse["referral"]>;

export async function joinMerchant(ctx: AppContext, userId: string, body: customerApi.JoinBody): Promise<customerApi.JoinResponse> {
  await loadActiveUser(ctx.db, userId);
  let merchantId = body.merchantId;
  let locationId: string | null = null;
  if (body.locationQrCode) {
    const [loc] = await ctx.db
      .select({ id: locations.id, merchantId: locations.merchantId })
      .from(locations)
      .where(and(eq(locations.qrCode, body.locationQrCode), eq(locations.active, true)))
      .limit(1);
    if (!loc) throw notFound("Shop");
    merchantId = loc.merchantId;
    locationId = loc.id;
  }
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId!)).limit(1);
  if (!merchant || !(JOINABLE_STATUSES as readonly string[]).includes(merchant.status)) throw notFound("Shop");

  const result = await ctx.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: merchantMembers.id, consentAt: merchantMembers.marketingConsentAt })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, userId)))
      .limit(1);

    let referral: ReferralOutcome | null = null;
    let ref: typeof referrals.$inferSelect | undefined;
    let referrer: Member | undefined;
    if (body.referralCode) {
      [ref] = await tx
        .select()
        .from(referrals)
        .where(and(eq(referrals.code, body.referralCode.toUpperCase()), eq(referrals.merchantId, merchant.id)))
        .for("update")
        .limit(1);
      if (ref) [referrer] = await tx.select().from(merchantMembers).where(eq(merchantMembers.id, ref.referrerMemberId)).limit(1);
      if (!ref || !referrer) referral = { applied: false, reason: "invalid" };
      else if (referrer.userId === userId) referral = { applied: false, reason: "own_code" };
      else if (existing) referral = { applied: false, reason: "already_member" };
      else if (ref.status !== "pending") referral = { applied: false, reason: "already_used" };
    }
    const applyReferral = !!body.referralCode && !referral && !!ref && !!referrer;

    const joined = await ensureMember(ctx, tx, {
      merchantId: merchant.id,
      userId,
      joinedVia: applyReferral ? "referral" : body.locationQrCode ? "qr" : "app",
      locationId,
      consent: body.consent ? { text: body.consent.text, source: body.locationQrCode ? "counter_qr" : "customer_app" } : null,
      referredByMemberId: applyReferral ? referrer!.id : null,
      source: "customer_app",
    });
    let member = joined.member;
    let bonusPoints = joined.created ? member.balance : 0;
    if (applyReferral && joined.created) {
      bonusPoints += await rewardReferral(tx, merchant.id, ref!, referrer!, member, ctx.now()).then((r) => {
        if (r.member) member = r.member;
        return r.points;
      });
      referral = { applied: true };
    }
    if (body.consent && !existing?.consentAt) {
      await logConsent(tx, ctx, member, "consent.granted", body.consent.text, body.locationQrCode ? "counter_qr" : "customer_app");
    }
    return { created: joined.created, bonusPoints, referral };
  });
  const membership = await getMembership(ctx, userId, (await memberIdFor(ctx.db, merchant.id, userId))!);
  return { membership, ...result };
}

async function memberIdFor(db: DbOrTx, merchantId: string, userId: string) {
  const [m] = await db
    .select({ id: merchantMembers.id })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, userId)))
    .limit(1);
  return m?.id;
}

/** Both sides get the merchant's referralBonus. Idempotent per referral row. */
async function rewardReferral(tx: Tx, merchantId: string, ref: typeof referrals.$inferSelect, referrer: Member, referee: Member, now: Date) {
  const [claimed] = await tx
    .update(referrals)
    .set({ refereeUserId: referee.userId, status: "rewarded", rewardedAt: now })
    .where(and(eq(referrals.id, ref.id), eq(referrals.status, "pending")))
    .returning({ id: referrals.id });
  if (!claimed) return { points: 0, member: null };
  const [program] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  const bonus = program?.active ? program.referralBonus : 0;
  if (bonus <= 0) return { points: 0, member: null };
  const r = await postTransaction(tx, {
    merchantId,
    memberId: referee.id,
    type: "referral_bonus",
    source: "customer_app",
    points: bonus,
    description: "Referral bonus: thanks for joining",
    idempotencyKey: `referral:${ref.id}:referee`,
  });
  await postTransaction(tx, {
    merchantId,
    memberId: referrer.id,
    type: "referral_bonus",
    source: "customer_app",
    points: bonus,
    description: "Referral bonus: your friend joined",
    idempotencyKey: `referral:${ref.id}:referrer`,
  });
  return { points: bonus, member: r.member };
}

export async function getOrCreateReferral(ctx: AppContext, userId: string, memberId: string, fresh: boolean): Promise<customerApi.ReferralResponse> {
  const row = await ownMembershipRow(ctx.db, userId, memberId);
  let code: string | undefined;
  if (!fresh) {
    const [pending] = await ctx.db
      .select({ code: referrals.code })
      .from(referrals)
      .where(and(eq(referrals.referrerMemberId, row.member.id), eq(referrals.status, "pending")))
      .orderBy(desc(referrals.createdAt))
      .limit(1);
    code = pending?.code;
  }
  for (let i = 0; i < 5 && !code; i++) {
    const [created] = await ctx.db
      .insert(referrals)
      .values({ merchantId: row.merchant.id, referrerMemberId: row.member.id, code: randomCode(8), createdAt: ctx.now() })
      .onConflictDoNothing()
      .returning({ code: referrals.code });
    code = created?.code;
  }
  if (!code) throw new Error("Could not allocate referral code");
  const [stats] = await ctx.db
    .select({
      invited: sql<number>`count(*) filter (where ${referrals.refereeUserId} is not null)::int`,
      rewarded: sql<number>`count(*) filter (where ${referrals.status} = 'rewarded')::int`,
    })
    .from(referrals)
    .where(eq(referrals.referrerMemberId, row.member.id));
  const bonus = row.program?.active ? row.program.referralBonus : 0;
  const shareUrl = `${ctx.config.publicWebUrl}/shops/${row.merchant.slug}?ref=${code}`;
  return {
    code,
    shareUrl,
    shareText:
      bonus > 0
        ? `Join me at ${row.merchant.name} on ${BRAND.name} and we both get ${bonus} ${terminologyOf(row.program)}: ${shareUrl}`
        : `Join me at ${row.merchant.name} on ${BRAND.name}: ${shareUrl}`,
    bonusPoints: bonus,
    stats: { invited: Number(stats?.invited ?? 0), rewarded: Number(stats?.rewarded ?? 0) },
  };
}

// ---------------------------------------------------------------------------
// Mute & consent (CASL)
// ---------------------------------------------------------------------------
async function logConsent(db: DbOrTx, ctx: AppContext, member: Pick<Member, "id" | "merchantId" | "userId">, action: "consent.granted" | "consent.withdrawn", text: string | null, source: string) {
  await db.insert(auditLogs).values({
    actorUserId: member.userId,
    merchantId: member.merchantId,
    action,
    entity: "merchant_member",
    entityId: member.id,
    data: { text, source },
    createdAt: ctx.now(),
  });
}

export async function setMuted(ctx: AppContext, userId: string, memberId: string, muted: boolean) {
  const row = await ownMembershipRow(ctx.db, userId, memberId);
  await ctx.db.update(merchantMembers).set({ muted }).where(eq(merchantMembers.id, row.member.id));
  return getMembership(ctx, userId, memberId);
}

export async function grantConsent(ctx: AppContext, userId: string, memberId: string, text: string) {
  const row = await ownMembershipRow(ctx.db, userId, memberId);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(merchantMembers)
      .set({ marketingConsentAt: ctx.now(), marketingConsentSource: "customer_app", marketingConsentText: text })
      .where(eq(merchantMembers.id, row.member.id));
    await logConsent(tx, ctx, row.member, "consent.granted", text, "customer_app");
  });
  return getMembership(ctx, userId, memberId);
}

export async function withdrawConsent(ctx: AppContext, userId: string, memberId: string) {
  const row = await ownMembershipRow(ctx.db, userId, memberId);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(merchantMembers)
      .set({ marketingConsentAt: null, marketingConsentSource: null, marketingConsentText: null })
      .where(eq(merchantMembers.id, row.member.id));
    await logConsent(tx, ctx, row.member, "consent.withdrawn", row.member.marketingConsentText ?? null, "customer_app");
  });
  return getMembership(ctx, userId, memberId);
}

// ---------------------------------------------------------------------------
// Redemptions from the app
// ---------------------------------------------------------------------------
export async function redeemFromApp(ctx: AppContext, userId: string, memberId: string, body: customerApi.CustomerRedeemBody): Promise<customerApi.CustomerRedeemResponse> {
  const row = await ownMembershipRow(ctx.db, userId, memberId);
  if (!(JOINABLE_STATUSES as readonly string[]).includes(row.merchant.status)) throw conflict("This shop's loyalty program is paused");
  const r = await redeemReward(ctx, {
    merchantId: row.merchant.id,
    memberId: row.member.id,
    rewardId: body.rewardId,
    source: "customer_app",
    idempotencyKey: body.idempotencyKey ? `app:${userId}:${body.idempotencyKey}` : null,
  });
  return { redemption: redemptionDto(r.redemption, r.reward.name), balance: r.member.balance, duplicate: r.duplicate };
}

/** Cancel an app-issued code that hasn't been used yet; points go back. */
export async function cancelRedemption(ctx: AppContext, userId: string, redemptionId: string): Promise<{ balance: number }> {
  requireUuid(redemptionId, "Redemption");
  const [row] = await ctx.db
    .select({ r: redemptions })
    .from(redemptions)
    .innerJoin(merchantMembers, eq(merchantMembers.id, redemptions.memberId))
    .where(and(eq(redemptions.id, redemptionId), eq(merchantMembers.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Redemption");
  if (row.r.status !== "issued" || !row.r.transactionId) throw conflict("This reward was already used or cancelled");
  const res = await reverseTransaction(ctx, {
    merchantId: row.r.merchantId,
    transactionId: row.r.transactionId,
    reason: "Customer cancelled reward code",
    source: "customer_app",
  });
  return { balance: res.member.balance };
}

// ---------------------------------------------------------------------------
// Card, push tokens
// ---------------------------------------------------------------------------
export async function getCard(ctx: AppContext, userId: string): Promise<customerApi.CardResponse> {
  const u = await loadActiveUser(ctx.db, userId);
  const qrPayload = `${staffApi.QR_PAYLOAD_PREFIX}${u.memberCode}`;
  const qrSvg = await QRCode.toString(qrPayload, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  return { memberCode: u.memberCode, qrPayload, qrSvg, name: u.name ?? null };
}

export async function registerPushToken(ctx: AppContext, userId: string, body: customerApi.PushTokenBody) {
  await loadActiveUser(ctx.db, userId);
  await ctx.db
    .insert(pushTokens)
    .values({ userId, token: body.token, platform: body.platform, createdAt: ctx.now() })
    .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform: body.platform } });
}

export async function unregisterPushToken(ctx: AppContext, userId: string, token: string) {
  await ctx.db.delete(pushTokens).where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)));
}

// ---------------------------------------------------------------------------
// PIPEDA export
// ---------------------------------------------------------------------------
export async function exportData(ctx: AppContext, userId: string): Promise<customerApi.DataExportResponse> {
  const profile = await getProfile(ctx, userId);
  const rows = await walletRows(ctx.db, userId);
  const memberIds = rows.map((r) => r.member.id);
  const rs = await activeRewardsByMerchant(ctx.db, rows.map((r) => r.merchant.id));
  const none = sql`false`;
  const [txs, reds, vis, refs, tokens, sess, ords, tickets, invs, msgs] = await Promise.all([
    memberIds.length ? ctx.db.select().from(ledgerTransactions).where(inArray(ledgerTransactions.memberId, memberIds)).orderBy(ledgerTransactions.createdAt) : [],
    memberIds.length
      ? ctx.db.select({ r: redemptions, rewardName: rewards.name }).from(redemptions).innerJoin(rewards, eq(rewards.id, redemptions.rewardId)).where(inArray(redemptions.memberId, memberIds))
      : [],
    ctx.db.select().from(visits).where(eq(visits.userId, userId)).orderBy(visits.createdAt),
    ctx.db
      .select()
      .from(referrals)
      .where(or(eq(referrals.refereeUserId, userId), memberIds.length ? inArray(referrals.referrerMemberId, memberIds) : none)),
    ctx.db.select().from(pushTokens).where(eq(pushTokens.userId, userId)),
    ctx.db.select().from(sessions).where(eq(sessions.userId, userId)),
    ctx.db.select().from(orders).where(eq(orders.userId, userId)),
    ctx.db.select().from(serviceTickets).where(eq(serviceTickets.userId, userId)),
    ctx.db.select().from(invoices).where(eq(invoices.userId, userId)),
    ctx.db.select().from(messageDeliveries).where(eq(messageDeliveries.userId, userId)),
  ]);
  const memberSet = new Set(memberIds);
  return {
    exportedAt: ctx.now().toISOString(),
    profile,
    memberships: rows.map((r) => ({
      ...membershipDto(r, rs.get(r.merchant.id) ?? []),
      transactions: txs.filter((t) => t.memberId === r.member.id).map(ledgerTxDto),
      redemptions: reds.filter((x) => x.r.memberId === r.member.id).map((x) => redemptionDto(x.r, x.rewardName)),
    })),
    visits: vis.map((v) => ({ merchantId: v.merchantId, locationId: v.locationId ?? null, amountCents: v.amountCents ?? null, createdAt: v.createdAt.toISOString() })),
    referrals: refs.map((r) => ({
      merchantId: r.merchantId,
      code: r.code,
      role: memberSet.has(r.referrerMemberId) ? ("referrer" as const) : ("referee" as const),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    pushTokens: tokens.map((t) => ({ platform: t.platform, createdAt: t.createdAt.toISOString() })),
    sessions: sess.map((s) => ({ userAgent: s.userAgent ?? null, createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString(), revoked: !!s.revokedAt })),
    orders: ords,
    serviceTickets: tickets,
    invoices: invs.map(({ payToken: _t, ...rest }) => rest),
    messages: msgs.map((m) => ({ merchantId: m.merchantId ?? null, channel: m.channel, kind: m.kind, body: m.body, createdAt: m.createdAt.toISOString() })),
  };
}

