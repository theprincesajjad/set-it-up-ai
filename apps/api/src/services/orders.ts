/**
 * Order-ahead (Plus). Server-side pricing only: client prices are never
 * trusted. Points are awarded once, through ledger.awardPurchase, when the
 * order is picked up (idempotency key `order:<id>`).
 */
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { bookings, catalogItems, ledgerTransactions, locations, merchantCategories, merchantStaff, merchants, orderItems, orderSplits, orders, redemptions, rewards, users, type DbOrTx } from "@ll/db";
import { rewardDiscountCents, type commerceApi, type PurchaseLine } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { bookSlotTx, cancelBookingsForOrder } from "./bookings.js";
import { decodeCursor, encodeCursor, formatLocalDateTime, iso, loadMerchant, notifyCustomer, requirePaymentsReady } from "./commerceShared.js";
import { nextNumber } from "./counters.js";
import { getMerchantFeatures, isFeatureOn, requireFeature } from "./features.js";
import { computeFees } from "./fees.js";
import { createConnectPayment, refundConnectPayment, retrieveConnectPayment } from "./payments.js";
import { awardPurchase, ensureMember, redeemReward, reverseTransaction } from "./ledger.js";
import { computeTax, merchantProvince } from "./tax.js";

type Order = typeof orders.$inferSelect;
type OrderItem = typeof orderItems.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
export type OrderStatus = commerceApi.OrderStatus;

/** Smallest card charge Stripe accepts in CAD. */
export const MIN_CARD_CHARGE_CENTS = 50;
const MAX_PICKUP_AHEAD_MS = 14 * 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES: OrderStatus[] = ["pending", "accepted", "preparing", "ready"];

/** Allowed staff transitions. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
  refunded: [],
};

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
/** What the customer still owes: deposit orders owe the balance, unpaid orders owe the total. */
export function balanceDueCents(o: Pick<Order, "status" | "paymentStatus" | "kind" | "totalCents" | "depositCents" | "customerFeeCents" | "depositPaidAt">): number {
  if (o.paymentStatus === "paid" || o.paymentStatus === "refunded" || o.status === "cancelled" || o.status === "refunded") return 0;
  return Math.max(0, o.totalCents - (o.kind === "preorder" && o.depositPaidAt ? o.depositCents + o.customerFeeCents : 0));
}

export function orderDto(o: Order, items: OrderItem[], merchantName: string, customer?: { name: string | null; phone: string | null }): commerceApi.OrderDto {
  return {
    id: o.id,
    merchantId: o.merchantId,
    merchantName,
    locationId: o.locationId,
    userId: o.userId,
    number: o.number,
    status: o.status,
    pickupAt: iso(o.pickupAt),
    notes: o.notes,
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    taxCents: o.taxCents,
    tipCents: o.tipCents,
    totalCents: o.totalCents,
    platformFeeCents: o.platformFeeCents,
    paymentMethod: o.paymentMethod as "in_app" | "at_pickup",
    paymentStatus: o.paymentStatus,
    redemptionId: o.redemptionId,
    pointsEarned: o.pointsEarned,
    readyAt: iso(o.readyAt),
    pickedUpAt: iso(o.pickedUpAt),
    paidAt: iso(o.paidAt),
    cancelReason: o.cancelReason,
    createdAt: o.createdAt.toISOString(),
    kind: o.kind,
    channel: o.channel,
    depositCents: o.depositCents,
    depositPaidAt: iso(o.depositPaidAt),
    balanceDueCents: balanceDueCents(o),
    customerFeeCents: o.customerFeeCents,
    cashDiscountCents: o.cashDiscountCents,
    firedAt: iso(o.firedAt),
    bumpedAt: iso(o.bumpedAt),
    items: items.map((i) => ({
      id: i.id,
      catalogItemId: i.catalogItemId,
      name: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      modifiers: i.modifiers,
      categoryId: i.categoryId,
      lineTotalCents: i.unitPriceCents * i.quantity,
    })),
    ...(customer ? { customer } : {}),
  };
}

async function itemsFor(db: DbOrTx, orderIds: string[]): Promise<Map<string, OrderItem[]>> {
  const map = new Map<string, OrderItem[]>();
  if (!orderIds.length) return map;
  const rows = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds));
  for (const r of rows) map.set(r.orderId, [...(map.get(r.orderId) ?? []), r]);
  return map;
}

export async function loadOrderDto(db: DbOrTx, order: Order, withCustomer = false): Promise<commerceApi.OrderDto> {
  const [m] = await db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, order.merchantId)).limit(1);
  const items = (await itemsFor(db, [order.id])).get(order.id) ?? [];
  let customer: { name: string | null; phone: string | null } | undefined;
  if (withCustomer) {
    const [u] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, order.userId)).limit(1);
    customer = u ?? { name: null, phone: null };
  }
  return orderDto(order, items, m?.name ?? "", customer);
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
export interface PricedLine {
  catalogItemId: string;
  name: string;
  quantity: number;
  basePriceCents: number;
  unitPriceCents: number;
  modifiers: { name: string; option: string; priceCents: number }[];
  categoryId: string | null;
  discountEligible: boolean;
  lineTotalCents: number;
  /** Restaurant pack: routing, pre-order rules. */
  station: string | null;
  preorderOnly: boolean;
  leadTimeHours: number;
  depositBps: number;
}

/** Price an order from the catalog. Throws 400 for unknown/unavailable items or modifiers. */
export async function priceItems(db: DbOrTx, merchantId: string, input: z.infer<typeof commerceApi.placeOrderBody>["items"]): Promise<PricedLine[]> {
  const ids = [...new Set(input.map((i) => i.catalogItemId))];
  const rows = await db.select().from(catalogItems).where(and(eq(catalogItems.merchantId, merchantId), inArray(catalogItems.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId));
  const catById = new Map(cats.map((c) => [c.id, c]));
  return input.map((line) => {
    const item = byId.get(line.catalogItemId);
    if (!item) throw badRequest("An item in your order isn't on this menu");
    if (!item.available || !item.orderable) throw new HttpError(409, "item_unavailable", `${item.name} isn't available right now`, { catalogItemId: item.id });
    const seen = new Set<string>();
    const mods = line.modifiers.map((sel) => {
      const group = item.modifiers.find((g) => g.name.toLowerCase() === sel.name.toLowerCase());
      if (!group) throw badRequest(`${item.name} has no "${sel.name}" option`);
      if (seen.has(group.name)) throw badRequest(`Pick one ${group.name} for ${item.name}`);
      seen.add(group.name);
      const opt = group.options.find((o) => o.name.toLowerCase() === sel.option.toLowerCase());
      if (!opt) throw badRequest(`"${sel.option}" isn't a ${group.name} option for ${item.name}`);
      return { name: group.name, option: opt.name, priceCents: opt.priceCents };
    });
    const unit = item.priceCents + mods.reduce((s, m) => s + m.priceCents, 0);
    const cat = item.categoryId ? catById.get(item.categoryId) : undefined;
    return {
      catalogItemId: item.id,
      name: item.name,
      quantity: line.quantity,
      basePriceCents: item.priceCents,
      unitPriceCents: unit,
      modifiers: mods,
      categoryId: item.categoryId,
      discountEligible: cat ? cat.discountEligible && cat.earnEligible : true,
      lineTotalCents: unit * line.quantity,
      station: item.station,
      preorderOnly: item.preorderOnly,
      leadTimeHours: item.leadTimeHours,
      depositBps: item.depositBps,
    };
  });
}

// ---------------------------------------------------------------------------
// Restaurant pack: kitchen hooks, pre-orders, cash discount
// ---------------------------------------------------------------------------
/**
 * Called when an order is ready for the kitchen: placed (pay at pickup / counter)
 * or paid (in app). services/kitchen.ts registers the KDS ticket firing here.
 */
export type OrderFiredHook = (ctx: AppContext, orderId: string) => Promise<void>;
export const orderFiredHooks: OrderFiredHook[] = [];
async function fireOrder(ctx: AppContext, orderId: string) {
  for (const h of orderFiredHooks) await h(ctx, orderId);
}

const MAX_PREORDER_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in the shop's timezone. */
export function localDateKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Pots (pre-order-only units) already booked for a local pickup day, excluding cancelled orders. */
export async function potsBookedOn(db: DbOrTx, merchant: Pick<Merchant, "id" | "timezone">, dateKey: string): Promise<number> {
  const rows = await db
    .select({ pickupAt: orders.pickupAt, quantity: orderItems.quantity })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(catalogItems, eq(catalogItems.id, orderItems.catalogItemId))
    .where(and(eq(orders.merchantId, merchant.id), eq(orders.kind, "preorder"), eq(catalogItems.preorderOnly, true), inArray(orders.status, ["pending", "accepted", "preparing", "ready", "picked_up"])));
  return rows.filter((r) => r.pickupAt && localDateKey(r.pickupAt, merchant.timezone) === dateKey).reduce((s, r) => s + r.quantity, 0);
}

/**
 * Cash discount (dual pricing): off the post-reward card subtotal. Tax is charged on the discounted price.
 * Zero unless the shop has restaurant.dual_pricing and a cash discount set.
 */
export async function cashDiscountFor(db: DbOrTx, merchant: Merchant, baseCents: number): Promise<number> {
  if (merchant.cashDiscountBps <= 0 || baseCents <= 0) return 0;
  if (!(await isFeatureOn(db, merchant, "restaurant.dual_pricing"))) return 0;
  return Math.round((baseCents * merchant.cashDiscountBps) / 10_000);
}

/** Discount for a reward against priced lines (no-earn/discount-ineligible categories excluded). */
export function rewardDiscountForLines(
  reward: Pick<typeof rewards.$inferSelect, "rewardType" | "value" | "maxDiscountCents" | "catalogItemId" | "name">,
  lines: PricedLine[],
): number {
  const eligible = lines.filter((l) => l.discountEligible);
  const eligibleSubtotal = eligible.reduce((s, l) => s + l.lineTotalCents, 0);
  let d = 0;
  if (reward.rewardType === "free_item") {
    const hit = eligible.find((l) => l.catalogItemId === reward.catalogItemId);
    if (!hit) throw badRequest(`Add the item for "${reward.name}" to your order to use it`);
    d = hit.unitPriceCents;
    if (reward.maxDiscountCents != null) d = Math.min(d, reward.maxDiscountCents);
  } else if (reward.rewardType === "amount_off" || reward.rewardType === "percent_off") {
    d = rewardDiscountCents(reward, eligibleSubtotal);
  } else {
    throw badRequest(`"${reward.name}" can only be redeemed at the counter`);
  }
  d = Math.min(d, eligibleSubtotal);
  if (d <= 0) throw badRequest(`"${reward.name}" doesn't apply to the items in this order`);
  return d;
}

/** Purchase lines for awardPurchase: post-discount, per item & category so no-earn categories apply. */
export function earnLines(items: Pick<OrderItem, "unitPriceCents" | "quantity" | "categoryId" | "catalogItemId">[], discountCents: number, eligibleFor: (categoryId: string | null) => boolean): PurchaseLine[] {
  const totals = items.map((i) => i.unitPriceCents * i.quantity);
  const eligibleIdx = items.map((i, idx) => (eligibleFor(i.categoryId) ? idx : -1)).filter((i) => i >= 0);
  const eligibleTotal = eligibleIdx.reduce((s, i) => s + totals[i]!, 0);
  const share = new Array<number>(items.length).fill(0);
  if (discountCents > 0 && eligibleTotal > 0) {
    let left = discountCents;
    eligibleIdx.forEach((i, n) => {
      const s = n === eligibleIdx.length - 1 ? left : Math.floor((discountCents * totals[i]!) / eligibleTotal);
      share[i] = Math.min(s, totals[i]!);
      left -= share[i]!;
    });
  }
  return items.map((i, idx) => ({ amountCents: Math.max(0, totals[idx]! - share[idx]!), categoryId: i.categoryId, itemId: i.catalogItemId, quantity: i.quantity }));
}

// ---------------------------------------------------------------------------
// Place order (customer)
// ---------------------------------------------------------------------------
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function paymentFor(ctx: AppContext, order: Order) {
  if (order.paymentMethod !== "in_app" || !order.stripePaymentIntentId || order.paymentStatus === "paid" || order.paymentStatus === "refunded") return null;
  const pi = await retrieveConnectPayment(ctx, await merchantOf(ctx, order.merchantId), order.stripePaymentIntentId);
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
}

export async function placeOrder(ctx: AppContext, userId: string, body: z.infer<typeof commerceApi.placeOrderBody>): Promise<commerceApi.PlaceOrderResponse> {
  const [existing] = await ctx.db.select().from(orders).where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, body.idempotencyKey))).limit(1);
  if (existing) return { order: await loadOrderDto(ctx.db, existing), payment: await paymentFor(ctx, existing), duplicate: true };

  const merchant = await loadMerchant(ctx.db, body.merchantId);
  if (!merchant) throw notFound("Merchant");
  if (merchant.status === "closed" || merchant.status === "paused") throw conflict(`${merchant.name} isn't taking orders right now`);
  await requireFeature(ctx.db, merchant, "orders.order_ahead");
  const [loc] = await ctx.db.select().from(locations).where(and(eq(locations.id, body.locationId), eq(locations.merchantId, merchant.id))).limit(1);
  if (!loc || !loc.active) throw badRequest("Unknown location");
  if (body.slotId) await requireFeature(ctx.db, merchant, "booking.pickup_slots");
  const isPreorder = body.kind === "preorder";
  if (isPreorder) {
    await requireFeature(ctx.db, merchant, "restaurant.degh_preorders");
    if (body.slotId) throw badRequest("Pre-orders are picked up at a time you choose, not a pickup slot");
    if (!body.pickupAt) throw badRequest("Choose a pickup time for your pre-order");
  }
  let accountId = body.paymentMethod === "in_app" && !isPreorder ? await requirePaymentsReady(ctx.db, merchant) : null;

  const now = ctx.now();
  let pickupAt: Date | null = null;
  if (!body.slotId && body.pickupAt) {
    pickupAt = new Date(body.pickupAt);
    if (pickupAt.getTime() < now.getTime() - 60_000) throw badRequest("Pickup time is in the past");
    if (pickupAt.getTime() > now.getTime() + (isPreorder ? MAX_PREORDER_AHEAD_MS : MAX_PICKUP_AHEAD_MS)) throw badRequest("Pickup time is too far ahead");
  }

  const lines = await priceItems(ctx.db, merchant.id, body.items);
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0);

  let potsRequested = 0;
  let depositBase = 0;
  if (isPreorder) {
    const leadHours = Math.max(0, ...lines.map((l) => l.leadTimeHours));
    const earliest = new Date(now.getTime() + leadHours * 3_600_000);
    if (pickupAt!.getTime() < earliest.getTime()) {
      throw new HttpError(409, "preorder_lead_time", `These items need ${leadHours} hours' notice. Earliest pickup is ${formatLocalDateTime(earliest, merchant.timezone)}.`, { leadTimeHours: leadHours, earliestPickupAt: earliest.toISOString() });
    }
    potsRequested = lines.filter((l) => l.preorderOnly).reduce((s, l) => s + l.quantity, 0);
    depositBase = lines.reduce((s, l) => s + Math.round((l.lineTotalCents * l.depositBps) / 10_000), 0);
  } else {
    const po = lines.find((l) => l.preorderOnly);
    if (po) throw new HttpError(409, "preorder_only", `${po.name} is pre-order only. Place it as a pre-order with a pickup day.`, { catalogItemId: po.catalogItemId });
  }

  // Optional reward redemption (points move only through the ledger).
  let discount = 0;
  let redemption: { id: string; transactionId: string | null } | null = null;
  if (body.redeemRewardId) {
    const [reward] = await ctx.db.select().from(rewards).where(and(eq(rewards.id, body.redeemRewardId), eq(rewards.merchantId, merchant.id))).limit(1);
    if (!reward || !reward.active) throw notFound("Reward");
    discount = rewardDiscountForLines(reward, lines);
    const { member } = await ctx.db.transaction((tx) => ensureMember(ctx, tx, { merchantId: merchant.id, userId, joinedVia: "app", source: "customer_app", locationId: loc.id }));
    const r = await redeemReward(ctx, {
      merchantId: merchant.id,
      memberId: member.id,
      rewardId: reward.id,
      source: "customer_app",
      locationId: loc.id,
      idempotencyKey: `order-redeem:${userId}:${body.idempotencyKey}`,
    });
    await ctx.db.update(redemptions).set({ status: "used", usedAt: now, discountCents: discount }).where(eq(redemptions.id, r.redemption.id));
    redemption = { id: r.redemption.id, transactionId: r.redemption.transactionId };
  }

  const undoRedemption = async (reason: string) => {
    if (redemption?.transactionId) {
      await reverseTransaction(ctx, { merchantId: merchant.id, transactionId: redemption.transactionId, reason, source: "system" }).catch(() => undefined);
    }
  };

  const province = await merchantProvince(ctx.db, merchant);
  const tax = computeTax(subtotal - discount, province);
  const commissionFree = await isFeatureOn(ctx.db, merchant, "restaurant.commission_free");
  // Pre-orders pay the deposit online (none configured: everything is paid at pickup).
  const depositCents = isPreorder ? Math.min(depositBase, subtotal - discount) : 0;
  const inApp = isPreorder ? depositCents > 0 : body.paymentMethod === "in_app";
  if (isPreorder && depositCents > 0 && body.paymentMethod === "at_pickup") {
    await undoRedemption("Order not placed");
    throw badRequest("This pre-order needs a deposit by card. Choose pay in app.");
  }
  // Commission-free shops charge the customer a small service fee on card payments instead of a platform commission.
  // computeFees (services/fees.ts) is the single source of truth: 0% commission on paid plans and restaurant tiers, 1.5% on Free.
  const saleBeforeFee = subtotal - discount + tax.taxCents + body.tipCents;
  const fees = computeFees({
    kind: "order",
    amountCents: inApp ? (isPreorder ? depositCents : saleBeforeFee) : 0,
    plan: merchant.plan,
    restaurantTier: merchant.restaurantTier,
    customerServiceFee: inApp && commissionFree,
  });
  const customerFee = fees.customerFeeCents;
  const total = saleBeforeFee + customerFee;
  const charge = isPreorder ? depositCents + customerFee : total;
  if (inApp && charge > 0 && charge < MIN_CARD_CHARGE_CENTS) {
    await undoRedemption("Order not placed");
    throw badRequest("This total is too small to pay by card. Choose pay at pickup.");
  }
  const fee = fees.platformFeeCents;
  const paymentMethod = inApp ? "in_app" : "at_pickup";
  if (inApp && !accountId) {
    try {
      accountId = await requirePaymentsReady(ctx.db, merchant);
    } catch (err) {
      await undoRedemption("Order not placed");
      throw err;
    }
  }

  let order: Order;
  try {
    order = await ctx.db.transaction(async (tx) => {
      if (isPreorder && potsRequested > 0 && merchant.preorderDailyCap != null) {
        const day = localDateKey(pickupAt!, merchant.timezone);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`preorder:${merchant.id}:${day}`}))`);
        const booked = await potsBookedOn(tx, merchant, day);
        if (booked + potsRequested > merchant.preorderDailyCap) {
          const remaining = Math.max(0, merchant.preorderDailyCap - booked);
          throw new HttpError(409, "preorder_full", remaining ? `Only ${remaining} pot${remaining === 1 ? "" : "s"} left for that day.` : "That day is fully booked. Pick another day.", { remaining, date: day });
        }
      }
      const number = await nextNumber(tx, merchant.id, "order");
      const [o] = await tx
        .insert(orders)
        .values({
          merchantId: merchant.id,
          locationId: loc.id,
          userId,
          number,
          status: "pending",
          pickupAt,
          notes: body.notes ?? null,
          subtotalCents: subtotal,
          discountCents: discount,
          taxCents: tax.taxCents,
          tipCents: body.tipCents,
          totalCents: total,
          platformFeeCents: fee,
          paymentMethod,
          paymentStatus: inApp ? (total === 0 ? "paid" : "requires_action") : "unpaid",
          paidAt: inApp && total === 0 ? now : null,
          kind: body.kind,
          depositCents,
          customerFeeCents: customerFee,
          redemptionId: redemption?.id ?? null,
          idempotencyKey: body.idempotencyKey,
        })
        .returning();
      await tx.insert(orderItems).values(
        lines.map((l) => ({
          orderId: o!.id,
          catalogItemId: l.catalogItemId,
          name: l.name,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          modifiers: l.modifiers,
          categoryId: l.categoryId,
          station: l.station,
        })),
      );
      if (body.slotId) {
        const { slot } = await bookSlotTx(tx, now, { merchantId: merchant.id, slotId: body.slotId, userId, orderId: o!.id, expectKind: "pickup", expectLocationId: loc.id });
        const [withPickup] = await tx.update(orders).set({ pickupAt: slot.startsAt }).where(eq(orders.id, o!.id)).returning();
        return withPickup!;
      }
      return o!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const [dup] = await ctx.db.select().from(orders).where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, body.idempotencyKey))).limit(1);
      if (dup) return { order: await loadOrderDto(ctx.db, dup), payment: await paymentFor(ctx, dup), duplicate: true };
    }
    await undoRedemption("Order not placed");
    throw err;
  }

  let payment: commerceApi.PlaceOrderResponse["payment"] = null;
  if (inApp && charge > 0 && accountId) {
    try {
      const pi = await createConnectPayment(ctx, merchant, {
        amountCents: charge,
        connectedAccountId: accountId,
        applicationFeeCents: fees.applicationFeeCents,
        description: `${merchant.name} order #${order.number}`,
        metadata: { ll_kind: "order", ll_id: order.id, merchant_id: merchant.id },
        idempotencyKey: `order:${order.id}:pi`,
      });
      [order] = (await ctx.db.update(orders).set({ stripePaymentIntentId: pi.id, updatedAt: now }).where(eq(orders.id, order.id)).returning()) as [Order];
      payment = { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
    } catch (err) {
      await ctx.db.update(orders).set({ status: "cancelled", cancelReason: "Payment could not be started", paymentStatus: "failed", updatedAt: now }).where(eq(orders.id, order.id));
      await cancelBookingsForOrder(ctx.db, order.id);
      await undoRedemption("Order payment failed to start");
      throw new HttpError(502, "payment_error", "We couldn't start the payment. Please try again.", { cause: (err as Error).message });
    }
  }
  // Kitchen: pay-at-pickup orders and free orders are placed now; card orders fire when paid. Pre-orders fire on the day.
  if (!isPreorder && (!inApp || total === 0)) {
    await fireOrder(ctx, order.id);
    [order] = (await ctx.db.select().from(orders).where(eq(orders.id, order.id)).limit(1)) as [Order];
  }
  return { order: await loadOrderDto(ctx.db, order), payment, duplicate: false };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export async function listMerchantOrders(db: DbOrTx, merchant: Merchant, q: z.infer<typeof commerceApi.listOrdersQuery>) {
  const statuses = (q.status ? q.status.split(",").map((s) => s.trim()) : ACTIVE_STATUSES) as OrderStatus[];
  for (const s of statuses) if (!TRANSITIONS[s]) throw badRequest(`Unknown status "${s}"`);
  const conds = [eq(orders.merchantId, merchant.id), inArray(orders.status, statuses)];
  if (q.locationId) conds.push(eq(orders.locationId, q.locationId));
  if (q.includeUnpaid !== "true") conds.push(or(eq(orders.paymentMethod, "at_pickup"), inArray(orders.paymentStatus, ["paid", "refunded", "authorized"]))!);
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(orders.createdAt, cur.createdAt), and(eq(orders.createdAt, cur.createdAt), lt(orders.id, cur.id)))!);
  const rows = await db
    .select({ o: orders, name: users.name, phone: users.phone })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const items = await itemsFor(db, page.map((r) => r.o.id));
  return {
    items: page.map((r) => orderDto(r.o, items.get(r.o.id) ?? [], merchant.name, { name: r.name, phone: r.phone })),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.o) : null,
  };
}

export async function listMyOrders(db: DbOrTx, userId: string, q: { limit: number; cursor?: string }) {
  const conds = [eq(orders.userId, userId)];
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(orders.createdAt, cur.createdAt), and(eq(orders.createdAt, cur.createdAt), lt(orders.id, cur.id)))!);
  const rows = await db
    .select({ o: orders, merchantName: merchants.name })
    .from(orders)
    .innerJoin(merchants, eq(merchants.id, orders.merchantId))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const items = await itemsFor(db, page.map((r) => r.o.id));
  return {
    items: page.map((r) => orderDto(r.o, items.get(r.o.id) ?? [], r.merchantName)),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.o) : null,
  };
}

export async function getMerchantOrder(db: DbOrTx, merchantId: string, orderId: string): Promise<Order> {
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId))).limit(1);
  if (!o) throw notFound("Order");
  return o;
}

export async function getMyOrder(db: DbOrTx, userId: string, orderId: string): Promise<Order> {
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
  if (!o) throw notFound("Order");
  return o;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
async function transition(ctx: AppContext, order: Order, to: OrderStatus, patch: Partial<typeof orders.$inferInsert> = {}): Promise<Order> {
  const [row] = await ctx.db
    .update(orders)
    .set({ ...patch, status: to, updatedAt: ctx.now() })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning();
  if (!row) throw conflict("This order was just updated by someone else. Refresh and try again.");
  return row;
}

async function merchantOf(ctx: AppContext, merchantId: string) {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  return m;
}

/** Refund the in-app payment (if any) and give back redeemed points. */
async function unwindPaymentAndRewards(ctx: AppContext, order: Order, reason: string): Promise<Partial<typeof orders.$inferInsert>> {
  const patch: Partial<typeof orders.$inferInsert> = {};
  const depositHeld = order.kind === "preorder" && !!order.depositPaidAt && order.paymentStatus === "authorized";
  if (order.paymentMethod === "in_app" && (order.paymentStatus === "paid" || depositHeld) && order.stripePaymentIntentId) {
    await refundConnectPayment(ctx, await merchantOf(ctx, order.merchantId), { paymentIntentId: order.stripePaymentIntentId, idempotencyKey: `order:${order.id}:refund`, reason });
    patch.paymentStatus = "refunded";
  } else if (order.paymentMethod === "at_pickup" && order.paymentStatus === "paid") {
    patch.paymentStatus = "refunded";
  }
  // Split bills: every share already paid goes back to the guest who paid it.
  const paidSplits = await ctx.db.select().from(orderSplits).where(and(eq(orderSplits.orderId, order.id), eq(orderSplits.status, "paid")));
  for (const sp of paidSplits) {
    if (sp.stripePaymentIntentId) await refundConnectPayment(ctx, await merchantOf(ctx, order.merchantId), { paymentIntentId: sp.stripePaymentIntentId, idempotencyKey: `split:${sp.id}:refund`, reason });
  }
  if (paidSplits.length) patch.paymentStatus = "refunded";
  if (order.redemptionId) {
    const [red] = await ctx.db.select().from(redemptions).where(and(eq(redemptions.id, order.redemptionId), eq(redemptions.merchantId, order.merchantId))).limit(1);
    if (red?.transactionId && red.status !== "void") {
      await reverseTransaction(ctx, { merchantId: order.merchantId, transactionId: red.transactionId, reason: `Order #${order.number} ${reason}`, source: "system" }).catch((e) => {
        if ((e as HttpError).statusCode !== 409) throw e;
      });
    }
  }
  return patch;
}

/** Award points for a completed order. Idempotent via `order:<id>`. */
export async function awardOrderPoints(ctx: AppContext, order: Order): Promise<number> {
  const items = (await itemsFor(ctx.db, [order.id])).get(order.id) ?? [];
  const cats = await ctx.db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, order.merchantId));
  const catById = new Map(cats.map((c) => [c.id, c]));
  const eligible = (categoryId: string | null) => {
    const c = categoryId ? catById.get(categoryId) : undefined;
    return c ? c.discountEligible && c.earnEligible : true;
  };
  try {
    const r = await awardPurchase(ctx, {
      merchantId: order.merchantId,
      userId: order.userId,
      lines: earnLines(items, order.discountCents, eligible),
      source: "customer_app",
      locationId: order.locationId,
      idempotencyKey: `order:${order.id}`,
      externalRef: `order:${order.number}`,
      ignoreCooldown: true,
      joinedVia: "app",
    });
    const points = r.transaction?.points ?? 0;
    await ctx.db.update(orders).set({ pointsEarned: points }).where(eq(orders.id, order.id));
    return points;
  } catch (err) {
    // Loyalty paused/not set up: the order still completes.
    if (err instanceof HttpError && err.statusCode < 500) return 0;
    throw err;
  }
}

export async function updateOrderStatus(ctx: AppContext, staff: StaffContext, orderId: string, body: z.infer<typeof commerceApi.updateOrderStatusBody>) {
  const merchant = staff.merchant;
  const order = await getMerchantOrder(ctx.db, merchant.id, orderId);
  const to = body.status;
  if (!TRANSITIONS[order.status].includes(to)) throw conflict(`Can't move an order from ${order.status} to ${to}`);
  const now = ctx.now();
  const depositPaid = order.kind === "preorder" && !!order.depositPaidAt;
  if (to !== "cancelled" && order.paymentMethod === "in_app" && order.paymentStatus !== "paid" && !depositPaid) {
    throw new HttpError(409, "awaiting_payment", "This order hasn't been paid yet");
  }

  let updated: Order;
  if (to === "cancelled") {
    if (!body.reason?.trim()) throw badRequest("Give the customer a reason for cancelling");
    const patch = await unwindPaymentAndRewards(ctx, order, "cancelled");
    updated = await transition(ctx, order, "cancelled", { ...patch, cancelReason: body.reason.trim() });
    await cancelBookingsForOrder(ctx.db, order.id);
    await notifyCustomer(ctx, {
      userId: order.userId,
      merchantId: merchant.id,
      title: `Order #${order.number} cancelled`,
      body: `${merchant.name} cancelled your order #${order.number}: ${body.reason.trim()}${patch.paymentStatus === "refunded" ? " You've been refunded." : ""}`,
      data: { type: "order_status", orderId: order.id, status: "cancelled" },
    });
  } else if (to === "ready") {
    updated = await transition(ctx, order, "ready", { readyAt: now });
    const features = await getMerchantFeatures(ctx.db, merchant);
    if (features["orders.pickup_status"].enabled) {
      const text = `Your order #${order.number} is ready for pickup at ${merchant.name}`;
      await notifyCustomer(ctx, {
        userId: order.userId,
        merchantId: merchant.id,
        title: `Order #${order.number} is ready`,
        body: text,
        smsBody: text,
        data: { type: "order_status", orderId: order.id, status: "ready" },
      });
    }
  } else if (to === "picked_up") {
    const patch: Partial<typeof orders.$inferInsert> = { pickedUpAt: now };
    if (order.paymentMethod === "at_pickup" && order.paymentStatus === "unpaid") {
      Object.assign(patch, { paymentStatus: "paid", paidAt: now });
      // Cash at the counter gets the cash price (restaurant.dual_pricing); tax follows the lower price.
      if (body.tender === "cash" && order.cashDiscountCents === 0 && order.depositCents === 0) {
        const cash = await cashDiscountFor(ctx.db, merchant, order.subtotalCents - order.discountCents);
        if (cash > 0) {
          const tax = computeTax(order.subtotalCents - order.discountCents - cash, await merchantProvince(ctx.db, merchant));
          Object.assign(patch, { cashDiscountCents: cash, taxCents: tax.taxCents, totalCents: order.subtotalCents - order.discountCents - cash + tax.taxCents + order.tipCents + order.customerFeeCents });
        }
      }
    } else if (depositPaid && order.paymentStatus === "authorized") {
      // Pre-order: the balance is collected at the counter.
      Object.assign(patch, { paymentStatus: "paid", paidAt: now });
    }
    updated = await transition(ctx, order, "picked_up", patch);
    await ctx.db.update(bookings).set({ status: "completed" }).where(and(eq(bookings.orderId, order.id), eq(bookings.status, "booked")));
    // A counter order rung up without a customer is under the cashier's name: no points.
    const [cashier] = order.channel === "counter" ? await ctx.db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, order.merchantId), eq(merchantStaff.userId, order.userId))).limit(1) : [];
    const points = cashier ? 0 : await awardOrderPoints(ctx, updated);
    updated = { ...updated, pointsEarned: points };
  } else {
    updated = await transition(ctx, order, to);
    if (to === "accepted") {
      const features = await getMerchantFeatures(ctx.db, merchant);
      if (features["orders.pickup_status"].enabled) {
        await notifyCustomer(ctx, {
          userId: order.userId,
          merchantId: merchant.id,
          title: `${merchant.name} got your order`,
          body: `Order #${order.number} was accepted.`,
          sms: false,
          data: { type: "order_status", orderId: order.id, status: "accepted" },
        });
      }
    }
  }
  return loadOrderDto(ctx.db, updated, true);
}

/** Refund a completed (picked up) order: money back, earned points reversed, redeemed points returned. */
export async function refundOrder(ctx: AppContext, staff: StaffContext, orderId: string, reason: string) {
  const order = await getMerchantOrder(ctx.db, staff.merchant.id, orderId);
  if (order.status !== "picked_up") throw conflict(order.status === "refunded" ? "Order was already refunded" : "Only picked-up orders can be refunded; cancel open orders instead");
  const patch = await unwindPaymentAndRewards(ctx, order, "refunded");
  const [earn] = await ctx.db
    .select()
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.merchantId, order.merchantId), eq(ledgerTransactions.idempotencyKey, `order:${order.id}`), isNull(ledgerTransactions.reversedAt)))
    .limit(1);
  if (earn) await reverseTransaction(ctx, { merchantId: order.merchantId, transactionId: earn.id, reason: `Refund order #${order.number}: ${reason}`, staffUserId: staff.user.id, source: "dashboard" });
  const updated = await transition(ctx, order, "refunded", { ...patch, cancelReason: reason });
  return loadOrderDto(ctx.db, updated, true);
}

/** Customer cancels before the shop accepts. */
export async function cancelMyOrder(ctx: AppContext, userId: string, orderId: string, reason?: string | null) {
  const order = await getMyOrder(ctx.db, userId, orderId);
  if (order.status !== "pending") throw conflict("The shop has already started this order. Call them to cancel.");
  const patch = await unwindPaymentAndRewards(ctx, order, "cancelled");
  const updated = await transition(ctx, order, "cancelled", { ...patch, cancelReason: reason?.trim() || "Cancelled by customer" });
  await cancelBookingsForOrder(ctx.db, order.id);
  return loadOrderDto(ctx.db, updated);
}

// ---------------------------------------------------------------------------
// Payment webhooks
// ---------------------------------------------------------------------------
export async function onOrderPayment(ctx: AppContext, orderId: string, paymentIntentId: string, outcome: "succeeded" | "failed"): Promise<void> {
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;
  if (order.stripePaymentIntentId && order.stripePaymentIntentId !== paymentIntentId) return;
  const now = ctx.now();
  if (outcome === "failed") {
    if (order.paymentStatus !== "paid" && order.paymentStatus !== "refunded" && !order.depositPaidAt) {
      await ctx.db.update(orders).set({ paymentStatus: "failed", updatedAt: now }).where(eq(orders.id, order.id));
    }
    return;
  }
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") return;
  if (order.status === "cancelled") {
    // Paid after it was cancelled (e.g. payment raced a cancel): refund right away.
    await refundConnectPayment(ctx, await merchantOf(ctx, order.merchantId), { paymentIntentId, idempotencyKey: `order:${order.id}:refund`, reason: "Order was cancelled" });
    await ctx.db.update(orders).set({ paymentStatus: "refunded", stripePaymentIntentId: paymentIntentId, updatedAt: now }).where(eq(orders.id, order.id));
    return;
  }
  if (order.kind === "preorder" && order.depositCents > 0) {
    // Deposit only: "authorized" means the deposit is in and the balance is due at pickup.
    await ctx.db.update(orders).set({ paymentStatus: "authorized", depositPaidAt: now, stripePaymentIntentId: paymentIntentId, updatedAt: now }).where(eq(orders.id, order.id));
    return;
  }
  await ctx.db.update(orders).set({ paymentStatus: "paid", paidAt: now, stripePaymentIntentId: paymentIntentId, updatedAt: now }).where(eq(orders.id, order.id));
  await fireOrder(ctx, order.id);
}
