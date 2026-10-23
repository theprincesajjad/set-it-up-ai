/**
 * Split bills (Pro: restaurant.split_bills). A family table's bill is split evenly
 * or by item; every guest gets their own pay link (pay_token) and card payment
 * through the same Connect provider as order-ahead. The order is marked paid when
 * every split is paid; tips are per split and added to the order then.
 */
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { merchants, orderItems, orderSplits, orders } from "@ll/db";
import { restaurantApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { computeFees } from "./fees.js";
import { createConnectPayment, refundConnectPayment } from "./payments.js";
import { requirePaymentsReady } from "./commerceShared.js";
import { isFeatureOn, requireFeature } from "./features.js";
import { MIN_CARD_CHARGE_CENTS } from "./orders.js";

type Split = typeof orderSplits.$inferSelect;
type Order = typeof orders.$inferSelect;
type Merchant = typeof merchants.$inferSelect;

/** How a guest pays: link (the pay link, default), card (terminal at the table) or cash. */
export const tenderOf = (s: Pick<Split, "tender">): restaurantApi.SplitTender => (s.tender === "cash" || s.tender === "card" ? s.tender : "link");

export const splitUrl = (publicWebUrl: string, token: string) => `${publicWebUrl}/pay/split/${token}`;

export function splitDto(s: Split, publicWebUrl: string): restaurantApi.SplitDto {
  return {
    id: s.id,
    orderId: s.orderId,
    label: s.label,
    amountCents: s.amountCents,
    tipCents: s.tipCents,
    itemIds: s.itemIds,
    status: s.status === "paid" ? "paid" : "open",
    paidAt: s.paidAt ? s.paidAt.toISOString() : null,
    tender: tenderOf(s),
    paidWith: s.status === "paid" ? (s.tender === "cash" || (!s.tender && !s.stripePaymentIntentId) ? "cash" : "card") : null,
    payUrl: splitUrl(publicWebUrl, s.payToken),
    payToken: s.payToken,
  };
}

/** Share `total` cents by weight; each share is rounded down and the odd cents go to the first guest, so the parts always add up. */
export function allocate(total: number, weights: number[]): number[] {
  if (weights.reduce((a, b) => a + b, 0) <= 0) throw badRequest("Nothing to split");
  return restaurantApi.splitCents(total, weights);
}

async function loadOrder(ctx: AppContext, merchantId: string, orderId: string): Promise<Order> {
  const [o] = await ctx.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId))).limit(1);
  if (!o) throw notFound("Order");
  return o;
}

async function splitsOf(ctx: AppContext, orderId: string): Promise<Split[]> {
  return ctx.db.select().from(orderSplits).where(eq(orderSplits.orderId, orderId)).orderBy(asc(orderSplits.createdAt), asc(orderSplits.id));
}

function summary(ctx: AppContext, order: Order, rows: Split[]): restaurantApi.OrderSplitsResponse {
  return {
    orderId: order.id,
    orderNumber: order.number,
    totalCents: order.totalCents,
    paidCents: rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amountCents, 0),
    orderPaid: order.paymentStatus === "paid",
    items: rows.map((r) => splitDto(r, ctx.config.publicWebUrl)),
  };
}

export async function listSplits(ctx: AppContext, staff: StaffContext, orderId: string): Promise<restaurantApi.OrderSplitsResponse> {
  const order = await loadOrder(ctx, staff.merchant.id, orderId);
  return summary(ctx, order, await splitsOf(ctx, order.id));
}

export async function createSplits(ctx: AppContext, staff: StaffContext, orderId: string, body: z.infer<typeof restaurantApi.createSplitsBody>): Promise<restaurantApi.OrderSplitsResponse> {
  const order = await loadOrder(ctx, staff.merchant.id, orderId);
  if (order.status === "cancelled" || order.status === "refunded") throw conflict(`Can't split a ${order.status} order`);
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") throw conflict("This bill is already paid");
  if (order.kind === "preorder" || order.paymentMethod !== "at_pickup") throw conflict("Only open pay-at-pickup bills can be split");

  const existing = await splitsOf(ctx, order.id);
  if (existing.some((s) => s.status === "paid")) throw conflict("Someone has already paid their share, so the split can't change");

  let drafts: { label: string; amountCents: number; itemIds: string[]; tender: restaurantApi.SplitTender }[];
  if (body.mode === "even") {
    const amounts = allocate(order.totalCents, new Array<number>(body.ways).fill(1));
    drafts = amounts.map((amountCents, i) => ({ label: body.labels?.[i] ?? `Guest ${i + 1}`, amountCents, itemIds: [], tender: body.tenders?.[i] ?? "link" }));
  } else {
    const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    let amounts: number[];
    try {
      // Each guest's food decides their share of tax and tip; a unit shared by several guests is split equally between them.
      amounts = restaurantApi.splitByItems(order.totalCents, items.map((i) => ({ id: i.id, quantity: i.quantity, unitPriceCents: i.unitPriceCents })), body.splits.map((sp) => sp.itemIds));
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    drafts = body.splits.map((sp, i) => ({ label: sp.label ?? `Guest ${i + 1}`, amountCents: amounts[i]!, itemIds: sp.itemIds, tender: sp.tender ?? "link" }));
  }
  if (drafts.reduce((s, d) => s + d.amountCents, 0) !== order.totalCents) throw conflict("The shares don't add up to the bill. Try again.");
  const links = drafts.filter((d) => d.tender === "link");
  // Pay links need card payments set up; cash and terminal-card shares don't.
  if (links.length) await requirePaymentsReady(ctx.db, staff.merchant);
  if (links.some((d) => d.amountCents < MIN_CARD_CHARGE_CENTS)) throw badRequest("A share is too small to pay by card link. Use fewer splits, or take it in cash.");

  const base = ctx.now().getTime();
  const rows = await ctx.db.transaction(async (tx) => {
    await tx.delete(orderSplits).where(eq(orderSplits.orderId, order.id));
    // Distinct created_at keeps the guests in the order staff entered them.
    return tx
      .insert(orderSplits)
      .values(drafts.map((d, i) => ({ orderId: order.id, label: d.label, amountCents: d.amountCents, itemIds: d.itemIds, tender: d.tender, payToken: randomBytes(18).toString("base64url"), createdAt: new Date(base + i) })))
      .returning();
  });
  return summary(ctx, order, rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
}

/** Change how an open share is paid (link, card or cash). */
export async function setSplitTender(ctx: AppContext, staff: StaffContext, orderId: string, splitId: string, tender: restaurantApi.SplitTender): Promise<restaurantApi.OrderSplitsResponse> {
  const order = await loadOrder(ctx, staff.merchant.id, orderId);
  const [split] = await ctx.db.select().from(orderSplits).where(and(eq(orderSplits.id, splitId), eq(orderSplits.orderId, order.id))).limit(1);
  if (!split) throw notFound("Split");
  if (split.status === "paid") throw conflict("This share is already paid");
  if (tender === "link") {
    await requirePaymentsReady(ctx.db, staff.merchant);
    if (split.amountCents < MIN_CARD_CHARGE_CENTS) throw badRequest("This share is too small to pay by card link");
  }
  await ctx.db.update(orderSplits).set({ tender }).where(eq(orderSplits.id, split.id));
  return summary(ctx, order, await splitsOf(ctx, order.id));
}

/** Remove the split (before anyone has paid). */
export async function deleteSplits(ctx: AppContext, staff: StaffContext, orderId: string): Promise<void> {
  const order = await loadOrder(ctx, staff.merchant.id, orderId);
  const rows = await splitsOf(ctx, order.id);
  if (rows.some((s) => s.status === "paid")) throw conflict("Someone has already paid their share");
  await ctx.db.delete(orderSplits).where(eq(orderSplits.orderId, order.id));
}

// ---------------------------------------------------------------------------
// Public pay link
// ---------------------------------------------------------------------------
async function byToken(ctx: AppContext, token: string): Promise<{ split: Split; order: Order; merchant: Merchant }> {
  const [row] = await ctx.db
    .select({ split: orderSplits, order: orders, merchant: merchants })
    .from(orderSplits)
    .innerJoin(orders, eq(orders.id, orderSplits.orderId))
    .innerJoin(merchants, eq(merchants.id, orders.merchantId))
    .where(eq(orderSplits.payToken, token))
    .limit(1);
  if (!row) throw notFound("Bill");
  return row;
}

async function publicView(ctx: AppContext, row: { split: Split; order: Order; merchant: Merchant }): Promise<restaurantApi.PublicSplitResponse> {
  const { split, order, merchant } = row;
  const items = split.itemIds.length ? await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)) : [];
  return {
    merchant: { name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl },
    orderNumber: order.number,
    label: split.label,
    amountCents: split.amountCents,
    tipCents: split.tipCents,
    status: split.status === "paid" ? "paid" : "open",
    paidAt: split.paidAt ? split.paidAt.toISOString() : null,
    tender: tenderOf(split),
    canPay: split.status === "open" && tenderOf(split) === "link" && order.status !== "cancelled" && order.status !== "refunded" && order.paymentStatus !== "paid",
    lines: items.filter((i) => split.itemIds.includes(i.id)).map((i) => ({ name: i.name, quantity: i.quantity })),
  };
}

export async function getPublicSplit(ctx: AppContext, token: string): Promise<restaurantApi.PublicSplitResponse> {
  const row = await byToken(ctx, token);
  await requireFeature(ctx.db, row.merchant, "restaurant.split_bills");
  return publicView(ctx, row);
}

export async function paySplit(ctx: AppContext, token: string, body: z.infer<typeof restaurantApi.paySplitBody>): Promise<restaurantApi.PaySplitResponse> {
  const row = await byToken(ctx, token);
  const { split, order, merchant } = row;
  await requireFeature(ctx.db, merchant, "restaurant.split_bills");
  if (split.status === "paid") throw conflict("This share is already paid");
  if (tenderOf(split) !== "link") throw conflict("This share is paid at the table, not by link");
  if (order.status === "cancelled" || order.status === "refunded" || order.paymentStatus === "paid") throw conflict("This bill is closed");
  const accountId = await requirePaymentsReady(ctx.db, merchant);
  const amount = split.amountCents + body.tipCents;
  // Split shares are order payments: same rule as the whole bill (0% paid/restaurant, 1.5% Free). No customer fee on shares.
  const fees = computeFees({ kind: "order", amountCents: amount, plan: merchant.plan, restaurantTier: merchant.restaurantTier });
  let pi;
  try {
    pi = await createConnectPayment(ctx, merchant, {
      amountCents: amount,
      connectedAccountId: accountId,
      applicationFeeCents: fees.applicationFeeCents,
      description: `${merchant.name} order #${order.number}: ${split.label}`,
      metadata: { ll_kind: "split", ll_id: split.id, merchant_id: merchant.id },
      idempotencyKey: `split:${split.id}:pi:${body.tipCents}`,
    });
  } catch (err) {
    throw new HttpError(502, "payment_error", "We couldn't start the payment. Please try again.", { cause: (err as Error).message });
  }
  const [updated] = await ctx.db.update(orderSplits).set({ tipCents: body.tipCents, stripePaymentIntentId: pi.id }).where(and(eq(orderSplits.id, split.id), eq(orderSplits.status, "open"))).returning();
  if (!updated) throw conflict("This share was just paid");
  return { split: await publicView(ctx, { ...row, split: updated }), payment: { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents } };
}

/** Webhook: a split's PaymentIntent succeeded or failed. */
export async function onSplitPayment(ctx: AppContext, splitId: string, paymentIntentId: string, outcome: "succeeded" | "failed" | "processing"): Promise<void> {
  if (outcome !== "succeeded") return; // failed: the guest can retry from the same link. processing: the share stays open until it clears.
  const [split] = await ctx.db.select().from(orderSplits).where(eq(orderSplits.id, splitId)).limit(1);
  if (!split) return;
  if (split.status === "paid" && split.stripePaymentIntentId === paymentIntentId) return;
  if (split.status === "paid" || split.stripePaymentIntentId !== paymentIntentId) {
    // (Also: a share staff already marked paid in cash, then paid by card from the pay link.)
    // Paid with a link whose tip was changed afterwards: give that charge back.
    const [m] = await ctx.db.select({ m: merchants }).from(orders).innerJoin(merchants, eq(merchants.id, orders.merchantId)).where(eq(orders.id, split.orderId)).limit(1);
    if (m) await refundConnectPayment(ctx, m.m, { paymentIntentId, idempotencyKey: `split:${split.id}:stale:${paymentIntentId}`, reason: "Replaced payment" });
    return;
  }
  const now = ctx.now();
  const [paid] = await ctx.db.update(orderSplits).set({ status: "paid", paidAt: now }).where(and(eq(orderSplits.id, split.id), eq(orderSplits.status, "open"))).returning();
  if (!paid) return;
  await settleOrderIfAllPaid(ctx, split.orderId, now);
}

/** When every share is paid, mark the order paid, add the tips and total the platform fee on the card shares (cash shares carry none). */
async function settleOrderIfAllPaid(ctx: AppContext, orderId: string, now: Date): Promise<void> {
  const all = await splitsOf(ctx, orderId);
  if (!all.length || !all.every((s) => s.status === "paid")) return;
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const [merchant] = order ? await ctx.db.select().from(merchants).where(eq(merchants.id, order.merchantId)).limit(1) : [];
  if (!order || !merchant) return;
  const tips = all.reduce((s, r) => s + r.tipCents, 0);
  const anyCard = all.some((r) => !!r.stripePaymentIntentId);
  await ctx.db
    .update(orders)
    .set({
      paymentStatus: "paid",
      paymentMethod: anyCard ? "in_app" : "at_pickup",
      paidAt: now,
      tipCents: order.tipCents + tips,
      totalCents: order.totalCents + tips,
      platformFeeCents: all.filter((r) => !!r.stripePaymentIntentId).reduce((s, r) => s + computeFees({ kind: "order", amountCents: r.amountCents + r.tipCents, plan: merchant.plan, restaurantTier: merchant.restaurantTier }).platformFeeCents, 0),
      updatedAt: now,
    })
    .where(eq(orders.id, order.id));
}

export async function markSplitPaid(ctx: AppContext, staff: StaffContext, orderId: string, splitId: string, body: { tender: "cash" | "card"; tipCents: number }): Promise<restaurantApi.OrderSplitsResponse> {
  const order = await loadOrder(ctx, staff.merchant.id, orderId);
  if (order.status === "cancelled" || order.status === "refunded") throw conflict(`This order is ${order.status}`);
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") throw conflict("This bill is already paid");
  const [split] = await ctx.db.select().from(orderSplits).where(and(eq(orderSplits.id, splitId), eq(orderSplits.orderId, order.id))).limit(1);
  if (!split) throw notFound("Split");
  if (split.status === "paid") throw conflict("This share is already paid");
  const now = ctx.now();
  // Clearing the intent id means a card payment started from the pay link before this is refunded if it completes later (onSplitPayment).
  const [paid] = await ctx.db.update(orderSplits).set({ status: "paid", paidAt: now, tipCents: body.tipCents, tender: body.tender, stripePaymentIntentId: null }).where(and(eq(orderSplits.id, split.id), eq(orderSplits.status, "open"))).returning();
  if (!paid) throw conflict("This share was just paid");
  await settleOrderIfAllPaid(ctx, order.id, now);
  const [fresh] = await ctx.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return summary(ctx, fresh!, await splitsOf(ctx, order.id));
}

/** Staff: a guest paid their share in cash at the table. Tips are optional. Fees apply to card-link shares only. */
export async function markSplitPaidCash(ctx: AppContext, staff: StaffContext, orderId: string, splitId: string, body: z.infer<typeof restaurantApi.markSplitCashBody>): Promise<restaurantApi.OrderSplitsResponse> {
  return markSplitPaid(ctx, staff, orderId, splitId, { tender: "cash", tipCents: body.tipCents });
}
