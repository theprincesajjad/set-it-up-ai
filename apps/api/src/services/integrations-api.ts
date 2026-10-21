/**
 * Merchant REST API (X-LL-Api-Key): lets any custom POS, Zapier or Make
 * award, redeem, refund and look up members. Keys are issued by the merchant
 * area (services/merchant.ts rotateApiKey) and verified here.
 */
import { and, eq, lte } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { merchantMembers, rewards, users } from "@ll/db";
import { normalizePhone, type PurchaseLine } from "@ll/shared";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, forbidden, notFound } from "../lib/errors.js";
import { categoryMap } from "./integrations.js";
import { applyRefund } from "./integrations-pipeline.js";
import { awardPurchase, redeemReward } from "./ledger.js";
import { verifyMerchantApiKey } from "./merchant.js";
import { notifyPassUpdate } from "./wallet.js";
import { emitMerchantEvent } from "./webhooks-out.js";

export type ApiMerchant = NonNullable<Awaited<ReturnType<typeof verifyMerchantApiKey>>>;

export async function requireApiKey(ctx: AppContext, req: FastifyRequest): Promise<ApiMerchant> {
  const raw = req.headers["x-ll-api-key"];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key) throw new HttpError(401, "unauthorized", "Missing X-LL-Api-Key header");
  const m = await verifyMerchantApiKey(ctx.db, key.trim());
  if (!m) throw new HttpError(401, "unauthorized", "Invalid API key");
  if (m.status === "closed") throw forbidden("This business is closed");
  return m;
}

async function resolveUser(ctx: AppContext, input: { phone?: string; memberCode?: string }) {
  if (input.memberCode) {
    const code = input.memberCode.trim().toUpperCase().replace(/^LL:/, "");
    const [u] = await ctx.db.select().from(users).where(eq(users.memberCode, code)).limit(1);
    if (!u || u.deletedAt) throw notFound("Member");
    return { user: u, phone: u.phone };
  }
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (!phone) throw badRequest("Enter a valid phone number");
  const [u] = await ctx.db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return { user: u && !u.deletedAt ? u : null, phone };
}

const affordable = (ctx: AppContext, merchantId: string, balance: number) =>
  ctx.db
    .select({ id: rewards.id, name: rewards.name, pointsCost: rewards.pointsCost })
    .from(rewards)
    .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true), lte(rewards.pointsCost, balance)))
    .orderBy(rewards.pointsCost);

export async function apiAward(
  ctx: AppContext,
  m: ApiMerchant,
  body: {
    phone?: string;
    memberCode?: string;
    amountCents?: number;
    lines?: { amountCents: number; categoryId?: string; externalCategoryId?: string; quantity?: number }[];
    locationId?: string;
    customerName?: string;
    externalId?: string;
    idempotencyKey?: string;
  },
  headerKey?: string,
) {
  const who = await resolveUser(ctx, body);
  let lines: PurchaseLine[] | undefined;
  if (body.lines?.length) {
    const ext = await categoryMap(ctx.db, m.id, "api");
    lines = body.lines.map((l) => ({ amountCents: l.amountCents, categoryId: l.categoryId ?? (l.externalCategoryId ? (ext.get(l.externalCategoryId) ?? null) : null), quantity: l.quantity }));
  }
  const key = headerKey ?? body.idempotencyKey ?? (body.externalId ? `api:${body.externalId}` : null);
  const r = await awardPurchase(ctx, {
    merchantId: m.id,
    userId: who.user?.id,
    phone: who.user ? undefined : (who.phone ?? undefined),
    customerName: body.customerName ?? null,
    amountCents: body.amountCents,
    lines,
    source: "api",
    locationId: body.locationId ?? null,
    idempotencyKey: key,
    externalRef: body.externalId ?? null,
    ignoreCooldown: true,
    joinedVia: "pos",
  });
  if (!r.duplicate) {
    if (r.memberCreated) void emitMerchantEvent(ctx, m.id, "member.joined", { memberId: r.member.id, joinedVia: "api" });
    if (r.transaction) void emitMerchantEvent(ctx, m.id, "points.earned", { memberId: r.member.id, transactionId: r.transaction.id, points: r.transaction.points, balance: r.member.balance, source: "api", externalId: body.externalId ?? null });
    await notifyPassUpdate(ctx, r.member.userId);
  }
  return {
    memberId: r.member.id,
    memberCreated: r.memberCreated,
    pointsAwarded: r.duplicate ? 0 : (r.transaction?.points ?? 0) + r.extraPoints,
    balance: r.member.balance,
    duplicate: r.duplicate,
    transactionId: r.transaction?.id ?? null,
    rewardsAvailable: r.rewardsAvailable,
  };
}

async function memberFor(ctx: AppContext, merchantId: string, input: { phone?: string; memberCode?: string }) {
  const who = await resolveUser(ctx, input);
  if (!who.user) throw notFound("Member");
  const [member] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, who.user.id))).limit(1);
  if (!member) throw notFound("Member");
  return { member, user: who.user };
}

export async function apiRedeem(
  ctx: AppContext,
  m: ApiMerchant,
  body: { phone?: string; memberCode?: string; rewardId: string; subtotalCents?: number; locationId?: string; idempotencyKey?: string },
  headerKey?: string,
) {
  const { member, user } = await memberFor(ctx, m.id, body);
  const r = await redeemReward(ctx, {
    merchantId: m.id,
    memberId: member.id,
    rewardId: body.rewardId,
    source: "api",
    locationId: body.locationId ?? null,
    idempotencyKey: headerKey ?? body.idempotencyKey ?? null,
    subtotalCents: body.subtotalCents ?? null,
  });
  if (!r.duplicate) {
    void emitMerchantEvent(ctx, m.id, "reward.redeemed", { memberId: member.id, rewardId: r.reward.id, rewardName: r.reward.name, pointsCost: r.reward.pointsCost, balance: r.member.balance, redemptionId: r.redemption.id, source: "api" });
    await notifyPassUpdate(ctx, user.id);
  }
  return { redemptionId: r.redemption.id, code: r.redemption.code, discountCents: r.redemption.discountCents, balance: r.member.balance, duplicate: r.duplicate };
}

export async function apiRefund(ctx: AppContext, m: ApiMerchant, body: { externalId: string; refundId: string; amountCents?: number }) {
  // Sales awarded via the API use "api:<externalId>" unless the caller supplied its own idempotency key.
  const r = await applyRefund(ctx, {
    merchantId: m.id,
    source: "api",
    originalKey: `api:${body.externalId}`,
    refundKey: `api:refund:${body.refundId}`,
    amountCents: body.amountCents ?? null,
    reason: "Refund (API)",
  });
  return { status: r.status, pointsReversed: r.points, balance: r.balance };
}

export async function apiMember(ctx: AppContext, m: ApiMerchant, phoneOrCode: string) {
  const isCode = /^(LL:)?[2-9A-HJ-NP-Z]{8}$/i.test(phoneOrCode.trim()) && !/^\+?\d+$/.test(phoneOrCode.trim());
  const { member, user } = await memberFor(ctx, m.id, isCode ? { memberCode: phoneOrCode } : { phone: phoneOrCode });
  return {
    memberId: member.id,
    name: user.name,
    balance: member.balance,
    lifetimePoints: member.lifetimePoints,
    visitCount: member.visitCount,
    memberCode: user.memberCode,
    marketingConsent: !!member.marketingConsentAt && !member.muted,
    rewardsAvailable: await affordable(ctx, m.id, member.balance),
  };
}
