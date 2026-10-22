/**
 * Restaurant kitchen (Pro: restaurant.kds): tickets by station, per-item status,
 * bump and recall, counter orders; plus the degh pre-order prep list (Growth).
 *
 * A ticket is an order that has been fired (orders.fired_at) and not yet bumped
 * (orders.bumped_at). Items carry their station (copied from the catalog item
 * when the order is placed) and kitchen_status queued → cooking → ready.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { catalogItems, locations, merchantStaff, merchants, orderItems, orders, users, type DbOrTx } from "@ll/db";
import { normalizePhone, type restaurantApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { addDays, zonedToUtc } from "./bookings.js";
import { iso } from "./commerceShared.js";
import { nextNumber } from "./counters.js";
import { isFeatureOn, requireFeature } from "./features.js";
import * as ordersSvc from "./orders.js";
import { computeTax, merchantProvince } from "./tax.js";

type Order = typeof orders.$inferSelect;
type OrderItem = typeof orderItems.$inferSelect;

const OPEN_STATUSES = ["pending", "accepted", "preparing"] as const;
const LANGS = ["en", "hi", "ur", "pa"] as const;

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------
/** Send an order to the kitchen. No-op without restaurant.kds, and for orders already fired. */
export async function fireTicket(ctx: AppContext, orderId: string): Promise<boolean> {
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.firedAt) return false;
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, order.merchantId)).limit(1);
  if (!merchant || !(await isFeatureOn(ctx.db, merchant, "restaurant.kds"))) return false;
  // Items placed before the item had a station: route them from the catalog now.
  const lines = await ctx.db
    .select({ id: orderItems.id, station: orderItems.station, itemStation: catalogItems.station })
    .from(orderItems)
    .leftJoin(catalogItems, eq(catalogItems.id, orderItems.catalogItemId))
    .where(eq(orderItems.orderId, order.id));
  for (const l of lines) {
    if (!l.station && l.itemStation) await ctx.db.update(orderItems).set({ station: l.itemStation }).where(eq(orderItems.id, l.id));
  }
  const [fired] = await ctx.db.update(orders).set({ firedAt: ctx.now(), updatedAt: ctx.now() }).where(and(eq(orders.id, order.id), isNull(orders.firedAt))).returning();
  return !!fired;
}

// Fire tickets when an order is placed (pay at pickup) or paid (in app).
ordersSvc.orderFiredHooks.push(async (ctx, orderId) => {
  await fireTicket(ctx, orderId);
});

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
function langOf(locale: string | null | undefined): restaurantApi.MenuLang {
  const base = (locale ?? "en").toLowerCase().split("-")[0]!;
  return (LANGS as readonly string[]).includes(base) ? (base as restaurantApi.MenuLang) : "en";
}

async function staffProfile(db: DbOrTx, staff: StaffContext) {
  const [row] = await db
    .select({ station: merchantStaff.station, locale: merchantStaff.locale })
    .from(merchantStaff)
    .where(and(eq(merchantStaff.merchantId, staff.merchant.id), eq(merchantStaff.userId, staff.user.id)))
    .limit(1);
  return row ?? { station: null, locale: "en" };
}

async function buildTickets(db: DbOrTx, rows: Order[], now: Date, station: string | null, lang: restaurantApi.MenuLang): Promise<restaurantApi.KitchenTicketDto[]> {
  if (!rows.length) return [];
  const items = await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((o) => o.id)));
  const catalogIds = [...new Set(items.map((i) => i.catalogItemId).filter((i): i is string => !!i))];
  const translations = new Map<string, Record<string, { name?: string }>>();
  if (lang !== "en" && catalogIds.length) {
    for (const c of await db.select({ id: catalogItems.id, translations: catalogItems.translations }).from(catalogItems).where(inArray(catalogItems.id, catalogIds))) translations.set(c.id, c.translations);
  }
  const itemDto = (i: OrderItem): restaurantApi.KitchenItemDto => ({
    id: i.id,
    catalogItemId: i.catalogItemId,
    name: (i.catalogItemId && translations.get(i.catalogItemId)?.[lang]?.name) || i.name,
    nameEn: i.name,
    quantity: i.quantity,
    modifiers: i.modifiers.map((m) => ({ name: m.name, option: m.option })),
    notes: i.notes,
    station: i.station,
    status: i.kitchenStatus as restaurantApi.KitchenItemStatus,
  });
  const out: restaurantApi.KitchenTicketDto[] = [];
  for (const o of rows) {
    // Items with no station show everywhere so nothing is missed.
    const mine = items.filter((i) => i.orderId === o.id && (!station || !i.station || i.station === station));
    if (!mine.length) continue;
    out.push({
      orderId: o.id,
      number: o.number,
      kind: o.kind,
      channel: o.channel,
      orderStatus: o.status,
      pickupAt: iso(o.pickupAt),
      notes: o.notes,
      firedAt: o.firedAt!.toISOString(),
      bumpedAt: iso(o.bumpedAt),
      ageSeconds: Math.max(0, Math.floor((now.getTime() - o.firedAt!.getTime()) / 1000)),
      items: mine.map(itemDto),
    });
  }
  return out;
}

/** Open tickets (fired, not bumped), oldest first. station: the caller's own unless ?station= is given ("all" = every station). */
export async function listTickets(ctx: AppContext, staff: StaffContext, q: z.infer<typeof restaurantApi.kitchenTicketsQuery>): Promise<restaurantApi.KitchenTicketsResponse> {
  const profile = await staffProfile(ctx.db, staff);
  const requested = q.station ?? profile.station ?? null;
  const station = requested && requested.toLowerCase() !== "all" ? requested : null;
  const lang = q.lang ?? langOf(profile.locale);
  const rows = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.merchantId, staff.merchant.id), isNotNull(orders.firedAt), isNull(orders.bumpedAt), inArray(orders.status, [...OPEN_STATUSES])))
    .orderBy(asc(orders.firedAt), asc(orders.number));
  const all = await buildTickets(ctx.db, rows, ctx.now(), null, lang);
  const stations = [...new Set(all.flatMap((t) => t.items.map((i) => i.station)).filter((s): s is string => !!s))].sort();
  const tickets = station ? await buildTickets(ctx.db, rows, ctx.now(), station, lang) : all;
  return { station, lang, stations, items: tickets };
}

async function ticketFor(ctx: AppContext, staff: StaffContext, orderId: string): Promise<restaurantApi.KitchenTicketDto> {
  const profile = await staffProfile(ctx.db, staff);
  const [o] = await ctx.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, staff.merchant.id))).limit(1);
  if (!o || !o.firedAt) throw notFound("Ticket");
  const [t] = await buildTickets(ctx.db, [o], ctx.now(), null, langOf(profile.locale));
  return t!;
}

/** queued → cooking → ready, one step at a time. Repeating the current status is fine. */
export async function setItemStatus(ctx: AppContext, staff: StaffContext, itemId: string, status: "cooking" | "ready"): Promise<restaurantApi.KitchenTicketDto> {
  const [row] = await ctx.db
    .select({ item: orderItems, order: orders })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.id, itemId), eq(orders.merchantId, staff.merchant.id)))
    .limit(1);
  if (!row || !row.order.firedAt) throw notFound("Ticket item");
  if (row.order.bumpedAt || !(OPEN_STATUSES as readonly string[]).includes(row.order.status)) throw conflict("This ticket is already closed. Recall it to change items.");
  const from = row.item.kitchenStatus;
  if (from !== status) {
    const allowed = (from === "queued" && status === "cooking") || (from === "cooking" && status === "ready");
    if (!allowed) throw conflict(`Can't move an item from ${from} to ${status}`);
    await ctx.db.update(orderItems).set({ kitchenStatus: status }).where(and(eq(orderItems.id, itemId), eq(orderItems.kitchenStatus, from)));
  }
  return ticketFor(ctx, staff, row.order.id);
}

/** Bump: the ticket leaves the screen, every item is ready, and the order becomes "ready" (customer gets the ready notification). */
export async function bumpTicket(ctx: AppContext, staff: StaffContext, orderId: string): Promise<restaurantApi.KitchenTicketDto> {
  const [order] = await ctx.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, staff.merchant.id))).limit(1);
  if (!order || !order.firedAt) throw notFound("Ticket");
  if (order.bumpedAt) throw conflict("This ticket was already bumped");
  if (!(["pending", "accepted", "preparing", "ready"] as string[]).includes(order.status)) throw conflict(`Can't bump a ${order.status} order`);
  if (order.status === "pending") await ordersSvc.updateOrderStatus(ctx, staff, order.id, { status: "accepted" });
  if (order.status !== "ready") await ordersSvc.updateOrderStatus(ctx, staff, order.id, { status: "ready" });
  await ctx.db.update(orderItems).set({ kitchenStatus: "ready" }).where(eq(orderItems.orderId, order.id));
  await ctx.db.update(orders).set({ bumpedAt: ctx.now(), updatedAt: ctx.now() }).where(eq(orders.id, order.id));
  return ticketFor(ctx, staff, order.id);
}

/** Recall a bumped ticket back to the screen. The order goes back to "preparing". */
export async function recallTicket(ctx: AppContext, staff: StaffContext, orderId: string): Promise<restaurantApi.KitchenTicketDto> {
  const [order] = await ctx.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, staff.merchant.id))).limit(1);
  if (!order || !order.firedAt) throw notFound("Ticket");
  if (!order.bumpedAt) throw conflict("This ticket is still on the screen");
  if (order.status !== "ready") throw conflict(`Can't recall a ${order.status} order`);
  await ctx.db.update(orders).set({ bumpedAt: null, status: "preparing", readyAt: null, updatedAt: ctx.now() }).where(and(eq(orders.id, order.id), eq(orders.status, "ready")));
  await ctx.db.update(orderItems).set({ kitchenStatus: "cooking" }).where(eq(orderItems.orderId, order.id));
  return ticketFor(ctx, staff, order.id);
}

/** Fire a ticket by hand (pre-orders on the pickup day, or a shop that turned KDS on mid-service). */
export async function fireTicketNow(ctx: AppContext, staff: StaffContext, orderId: string): Promise<restaurantApi.KitchenTicketDto> {
  const [order] = await ctx.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, staff.merchant.id))).limit(1);
  if (!order) throw notFound("Order");
  if (!(OPEN_STATUSES as readonly string[]).includes(order.status)) throw conflict(`Can't send a ${order.status} order to the kitchen`);
  if (order.paymentMethod === "in_app" && order.paymentStatus !== "paid" && !order.depositPaidAt) throw new HttpError(409, "awaiting_payment", "This order hasn't been paid yet");
  await fireTicket(ctx, order.id);
  return ticketFor(ctx, staff, order.id);
}

// ---------------------------------------------------------------------------
// Counter orders (staff rings up a walk-in / dine-in order)
// ---------------------------------------------------------------------------
export async function placeCounterOrder(ctx: AppContext, staff: StaffContext, body: z.infer<typeof restaurantApi.counterOrderBody>) {
  const merchant = staff.merchant;
  if (merchant.status === "closed" || merchant.status === "paused") throw conflict(`${merchant.name} isn't taking orders right now`);
  await requireFeature(ctx.db, merchant, "orders.order_ahead");
  const locs = await ctx.db.select().from(locations).where(and(eq(locations.merchantId, merchant.id), eq(locations.active, true))).orderBy(asc(locations.createdAt));
  const loc = body.locationId ? locs.find((l) => l.id === body.locationId) : locs[0];
  if (!loc) throw badRequest("Unknown location");

  const lines = await ordersSvc.priceItems(ctx.db, merchant.id, body.items);
  const po = lines.find((l) => l.preorderOnly);
  if (po) throw new HttpError(409, "preorder_only", `${po.name} is pre-order only`, { catalogItemId: po.catalogItemId });
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const cashDiscount = body.tender === "cash" ? await ordersSvc.cashDiscountFor(ctx.db, merchant, subtotal) : 0;
  const tax = computeTax(subtotal - cashDiscount, await merchantProvince(ctx.db, merchant));
  const total = subtotal - cashDiscount + tax.taxCents + body.tipCents;

  let userId = staff.user.id;
  if (body.customerPhone) {
    const phone = normalizePhone(body.customerPhone);
    if (!phone) throw badRequest("That phone number doesn't look right");
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (u) userId = u.id;
  }
  const now = ctx.now();
  const paid = !!body.tender;
  const order = await ctx.db.transaction(async (tx) => {
    const number = await nextNumber(tx, merchant.id, "order");
    const [o] = await tx
      .insert(orders)
      .values({
        merchantId: merchant.id,
        locationId: loc.id,
        userId,
        number,
        status: "accepted",
        notes: body.notes ?? null,
        subtotalCents: subtotal,
        taxCents: tax.taxCents,
        tipCents: body.tipCents,
        totalCents: total,
        cashDiscountCents: cashDiscount,
        paymentMethod: "at_pickup",
        paymentStatus: paid ? "paid" : "unpaid",
        paidAt: paid ? now : null,
        kind: "pickup",
        channel: "counter",
      })
      .returning();
    await tx.insert(orderItems).values(
      lines.map((l) => ({ orderId: o!.id, catalogItemId: l.catalogItemId, name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, modifiers: l.modifiers, categoryId: l.categoryId, station: l.station })),
    );
    return o!;
  });
  await fireTicket(ctx, order.id);
  const [fresh] = await ctx.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return ordersSvc.loadOrderDto(ctx.db, fresh!, true);
}

// ---------------------------------------------------------------------------
// Degh pre-orders: prep list by pickup day
// ---------------------------------------------------------------------------
export async function listPreorders(ctx: AppContext, staff: StaffContext, q: z.infer<typeof restaurantApi.preordersQuery>): Promise<restaurantApi.PreordersResponse> {
  const merchant = staff.merchant;
  await requireFeature(ctx.db, merchant, "restaurant.degh_preorders");
  const tz = merchant.timezone;
  const today = ordersSvc.localDateKey(ctx.now(), tz);
  const from = q.from ?? today;
  const to = q.to ?? addDays(from, 14);
  if (to < from) throw badRequest("'to' is before 'from'");
  if (to > addDays(from, 92)) throw badRequest("Ask for at most 92 days at a time");
  const rows = await ctx.db
    .select({ o: orders, name: users.name, phone: users.phone })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(
      and(
        eq(orders.merchantId, merchant.id),
        eq(orders.kind, "preorder"),
        inArray(orders.status, ["pending", "accepted", "preparing", "ready", "picked_up"]),
        gte(orders.pickupAt, zonedToUtc(from, 0, tz)),
        lt(orders.pickupAt, zonedToUtc(addDays(to, 1), 0, tz)),
      ),
    )
    .orderBy(asc(orders.pickupAt), asc(orders.number));
  const ids = rows.map((r) => r.o.id);
  const lines = ids.length
    ? await ctx.db
        .select({ item: orderItems, preorderOnly: catalogItems.preorderOnly, serves: catalogItems.serves })
        .from(orderItems)
        .leftJoin(catalogItems, eq(catalogItems.id, orderItems.catalogItemId))
        .where(inArray(orderItems.orderId, ids))
    : [];
  const days = new Map<string, restaurantApi.PreorderDayDto>();
  for (const r of rows) {
    const date = ordersSvc.localDateKey(r.o.pickupAt!, tz);
    let day = days.get(date);
    if (!day) {
      day = { date, pots: 0, cap: merchant.preorderDailyCap, remaining: null, prep: [], orders: [] };
      days.set(date, day);
    }
    const mine = lines.filter((l) => l.item.orderId === r.o.id);
    for (const l of mine) {
      if (l.preorderOnly) day.pots += l.item.quantity;
      const key = l.item.catalogItemId ?? l.item.name;
      const prep = day.prep.find((p) => (p.catalogItemId ?? p.name) === key);
      if (prep) {
        prep.quantity += l.item.quantity;
        if (prep.serves != null && l.serves) prep.serves += l.item.quantity * l.serves;
      } else day.prep.push({ catalogItemId: l.item.catalogItemId, name: l.item.name, quantity: l.item.quantity, serves: l.serves ? l.item.quantity * l.serves : null });
    }
    day.orders.push({
      orderId: r.o.id,
      number: r.o.number,
      status: r.o.status,
      customerName: r.name,
      customerPhone: r.phone,
      pickupAt: r.o.pickupAt!.toISOString(),
      notes: r.o.notes,
      totalCents: r.o.totalCents,
      depositCents: r.o.depositCents,
      depositPaid: !!r.o.depositPaidAt,
      balanceDueCents: ordersSvc.balanceDueCents(r.o),
      items: mine.map((l) => ({ name: l.item.name, quantity: l.item.quantity, modifiers: l.item.modifiers.map((m) => ({ name: m.name, option: m.option })) })),
    });
  }
  for (const d of days.values()) d.remaining = d.cap == null ? null : Math.max(0, d.cap - d.pots);
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}
