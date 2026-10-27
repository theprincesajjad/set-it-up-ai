/**
 * Restaurant kitchen (Pro: restaurant.kds): tickets by station, per-item status,
 * bump and recall, counter orders; plus the degh pre-order prep list (Growth).
 *
 * A ticket is an order that has been fired (orders.fired_at) and not yet bumped
 * (orders.bumped_at). Items carry their station (copied from the catalog item
 * when the order is placed) and kitchen_status queued → cooking → ready.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { catalogItems, locations, merchantStaff, merchants, orderItems, orders, users, type DbOrTx } from "@ll/db";
import { normalizePhone, restaurantApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { addDays, zonedToUtc } from "./bookings.js";
import { iso } from "./commerceShared.js";
import { findOrCreateUserByPhone } from "./channel-orders.js";
import { nextNumber } from "./counters.js";
import { isFeatureOn, requireFeature, requireAnyFeature, PREORDER_FEATURES } from "./features.js";
import * as ordersSvc from "./orders.js";
import { assertPreorderCapacity, buildPlan, capFor, localMidnightUtc, overrideLeadHours, rulesDto, waitlistCounts, type PlanInputLine } from "./preorderPlanning.js";
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
  const cookMinutes = new Map<string, number>();
  if (catalogIds.length) {
    for (const c of await db.select({ id: catalogItems.id, translations: catalogItems.translations, cook: catalogItems.cookMinutes }).from(catalogItems).where(inArray(catalogItems.id, catalogIds))) {
      cookMinutes.set(c.id, c.cook);
      if (lang !== "en") translations.set(c.id, c.translations);
    }
  }
  // Guests named on the ticket: phone, WhatsApp and web orders. Counter orders sit under the cashier's account, so no name.
  const namedIds = [...new Set(rows.filter((o) => o.channel !== "counter").map((o) => o.userId))];
  const names = new Map<string, string | null>();
  if (namedIds.length) for (const u of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, namedIds))) names.set(u.id, u.name);
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
    const all = items.filter((i) => i.orderId === o.id);
    const mine = all.filter((i) => !station || !i.station || i.station === station);
    if (!mine.length) continue;
    const cook = Math.max(0, ...all.map((i) => (i.catalogItemId ? (cookMinutes.get(i.catalogItemId) ?? 0) : 0)));
    const fireAt = o.kind === "preorder" && o.pickupAt ? new Date(o.pickupAt.getTime() - cook * 60_000) : null;
    out.push({
      orderId: o.id,
      number: o.number,
      kind: o.kind,
      channel: o.channel,
      orderStatus: o.status,
      pickupAt: iso(o.pickupAt),
      notes: o.notes,
      firedAt: iso(o.firedAt),
      bumpedAt: iso(o.bumpedAt),
      ageSeconds: o.firedAt ? Math.max(0, Math.floor((now.getTime() - o.firedAt.getTime()) / 1000)) : 0,
      items: mine.map(itemDto),
      customerName: o.channel !== "counter" ? (names.get(o.userId) ?? null) : null,
      allergyNote: o.allergyNote,
      fireAt: iso(fireAt),
      cookMinutes: cook,
      pinned: !o.firedAt && !!fireAt,
    });
  }
  return out;
}

/** Pre-orders not yet fired that are inside their pin window (120 minutes before the fire time): the "Start dum" group. */
async function pinnedPreorders(db: DbOrTx, merchantId: string, now: Date): Promise<Order[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.kind, "preorder"),
        isNull(orders.firedAt),
        isNull(orders.bumpedAt),
        inArray(orders.status, [...OPEN_STATUSES]),
        isNotNull(orders.pickupAt),
        lte(orders.pickupAt, new Date(now.getTime() + 24 * 3_600_000)),
        or(eq(orders.paymentMethod, "at_pickup"), eq(orders.paymentStatus, "paid"), isNotNull(orders.depositPaidAt)),
      ),
    )
    .orderBy(asc(orders.pickupAt));
  if (!rows.length) return [];
  const lines = await db
    .select({ orderId: orderItems.orderId, cook: catalogItems.cookMinutes })
    .from(orderItems)
    .leftJoin(catalogItems, eq(catalogItems.id, orderItems.catalogItemId))
    .where(inArray(orderItems.orderId, rows.map((o) => o.id)));
  return rows.filter((o) => {
    const cook = Math.max(0, ...lines.filter((l) => l.orderId === o.id).map((l) => l.cook ?? 0));
    const fireAt = o.pickupAt!.getTime() - cook * 60_000;
    return now.getTime() >= fireAt - restaurantApi.KITCHEN_PIN_BEFORE_FIRE_MIN * 60_000;
  });
}

/** Open tickets (fired, not bumped), oldest first, with pre-orders about to fire pinned first. station: the caller's own unless ?station= is given ("all" = every station). */
export async function listTickets(ctx: AppContext, staff: StaffContext, q: z.infer<typeof restaurantApi.kitchenTicketsQuery>): Promise<restaurantApi.KitchenTicketsResponse> {
  const profile = await staffProfile(ctx.db, staff);
  const requested = q.station ?? profile.station ?? null;
  const station = requested && requested.toLowerCase() !== "all" ? requested : null;
  const lang = q.lang ?? langOf(profile.locale);
  const now = ctx.now();
  const fired = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.merchantId, staff.merchant.id), isNotNull(orders.firedAt), isNull(orders.bumpedAt), inArray(orders.status, [...OPEN_STATUSES])))
    .orderBy(asc(orders.firedAt), asc(orders.number));
  const pinnedRows = await pinnedPreorders(ctx.db, staff.merchant.id, now);
  const rows = [...pinnedRows, ...fired];
  const all = await buildTickets(ctx.db, rows, now, null, lang);
  const stations = [...new Set(all.flatMap((t) => t.items.map((i) => i.station)).filter((s): s is string => !!s))].sort();
  const tickets = station ? await buildTickets(ctx.db, rows, now, station, lang) : all;
  const [soldRow] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(catalogItems).where(and(eq(catalogItems.merchantId, staff.merchant.id), isNotNull(catalogItems.soldOutUntil), sql`${catalogItems.soldOutUntil} > ${now.toISOString()}`));
  return { station, lang, stations, soldOutCount: soldRow?.n ?? 0, items: tickets };
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
// Sold out (the 86 button)
// ---------------------------------------------------------------------------
export async function listSoldOut(ctx: AppContext, staff: StaffContext, lang?: restaurantApi.MenuLang): Promise<restaurantApi.SoldOutResponse> {
  const profile = await staffProfile(ctx.db, staff);
  const l = lang ?? langOf(profile.locale);
  const now = ctx.now();
  const rows = await ctx.db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.merchantId, staff.merchant.id), eq(catalogItems.available, true), eq(catalogItems.orderable, true)))
    .orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name));
  const items = rows.map((r) => ({
    id: r.id,
    name: (l !== "en" && r.translations?.[l]?.name) || r.name,
    nameEn: r.name,
    station: r.station,
    soldOutUntil: r.soldOutUntil && r.soldOutUntil.getTime() > now.getTime() ? r.soldOutUntil.toISOString() : null,
  }));
  items.sort((a, b) => Number(!!b.soldOutUntil) - Number(!!a.soldOutUntil));
  return { soldOutCount: items.filter((i) => i.soldOutUntil).length, items };
}

/** until: "today" (end of the shop's day), "restore" (back on) or an ISO time. Menus, the counter and WhatsApp stop offering the dish at once. */
export async function setSoldOut(ctx: AppContext, staff: StaffContext, itemId: string, until: restaurantApi.SoldOutBody["until"]): Promise<restaurantApi.SoldOutItemDto> {
  const m = staff.merchant;
  const now = ctx.now();
  let at: Date | null;
  if (until === "restore") at = null;
  else if (until === "today") at = localMidnightUtc(addDays(ordersSvc.localDateKey(now, m.timezone), 1), m.timezone);
  else {
    at = new Date(until);
    if (at.getTime() <= now.getTime()) throw badRequest("Pick a time in the future, or restore the dish");
  }
  const [row] = await ctx.db.update(catalogItems).set({ soldOutUntil: at }).where(and(eq(catalogItems.id, itemId), eq(catalogItems.merchantId, m.id))).returning();
  if (!row) throw notFound("Dish");
  return { id: row.id, name: row.name, nameEn: row.name, station: row.station, soldOutUntil: at ? at.toISOString() : null };
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

  const now = ctx.now();
  const isPreorder = body.kind === "preorder";
  let pickupAt: Date | null = null;
  if (isPreorder) {
    await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
    if (!body.pickupAt) throw badRequest("Choose a pickup time for the pre-order");
    pickupAt = new Date(body.pickupAt);
  } else if (body.pickupAt) pickupAt = new Date(body.pickupAt);
  if (pickupAt && pickupAt.getTime() < now.getTime() - 60_000) throw badRequest("Pickup time is in the past");

  const lines = await ordersSvc.priceItems(ctx.db, merchant.id, body.items);
  const po = lines.find((l) => l.preorderOnly);
  if (po && !isPreorder) throw new HttpError(409, "preorder_only", `${po.name} is pre-order only`, { catalogItemId: po.catalogItemId });
  let pots = 0;
  let depositCents = 0;
  if (isPreorder) {
    const leadHours = Math.max(0, overrideLeadHours(merchant, pickupAt!) ?? 0, ...lines.map((l) => l.leadTimeHours));
    const earliest = new Date(now.getTime() + leadHours * 3_600_000);
    // Staff can take a pre-order inside the notice period (the shop decides); the caps still apply.
    pots = lines.filter((l) => l.preorderOnly).reduce((s, l) => s + l.quantity, 0);
    depositCents = lines.reduce((s, l) => s + Math.round((l.lineTotalCents * l.depositBps) / 10_000), 0);
    void earliest;
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const cashDiscount = body.tender === "cash" && !isPreorder ? await ordersSvc.cashDiscountFor(ctx.db, merchant, subtotal) : 0;
  const tax = computeTax(ordersSvc.taxableBaseCents(lines, cashDiscount), await merchantProvince(ctx.db, merchant));
  const total = subtotal - cashDiscount + tax.taxCents + body.tipCents;
  depositCents = Math.min(depositCents, total);

  // Phone orders sit under the caller (new account by phone if needed); counter orders only when the number matches a customer.
  let userId = staff.user.id;
  let callerName: string | null = body.customerName?.trim() || null;
  if (body.customerPhone) {
    const phone = normalizePhone(body.customerPhone);
    if (!phone) throw badRequest("That phone number doesn't look right");
    if (body.channel === "phone") {
      const u = await findOrCreateUserByPhone(ctx, phone, callerName);
      if (u) {
        userId = u.id;
        callerName = callerName ?? u.name;
      }
    } else {
      const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
      if (u) userId = u.id;
    }
  }
  const noteParts = [body.notes?.trim(), body.channel === "phone" ? `Phone order${callerName ? ` · ${callerName}` : body.customerPhone ? ` · ${body.customerPhone}` : ""}` : null].filter(Boolean);
  const paid = !!body.tender && !isPreorder;
  const depositNow = isPreorder && body.depositCollected && depositCents > 0;
  const order = await ctx.db.transaction(async (tx) => {
    if (isPreorder) await assertPreorderCapacity(tx, merchant, pickupAt!, pots);
    const number = await nextNumber(tx, merchant.id, "order");
    const [o] = await tx
      .insert(orders)
      .values({
        merchantId: merchant.id,
        locationId: loc.id,
        userId,
        number,
        status: "accepted",
        pickupAt,
        notes: noteParts.length ? noteParts.join(" | ").slice(0, 500) : null,
        allergyNote: body.allergyNote?.trim() || null,
        subtotalCents: subtotal,
        taxCents: tax.taxCents,
        tipCents: body.tipCents,
        totalCents: total,
        cashDiscountCents: cashDiscount,
        paymentMethod: "at_pickup",
        paymentStatus: paid ? "paid" : depositNow ? "authorized" : "unpaid",
        paidAt: paid ? now : null,
        kind: isPreorder ? "preorder" : "pickup",
        channel: body.channel,
        depositCents: isPreorder ? depositCents : 0,
        depositPaidAt: depositNow ? now : null,
      })
      .returning();
    await tx.insert(orderItems).values(
      lines.map((l) => ({ orderId: o!.id, catalogItemId: l.catalogItemId, name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, modifiers: l.modifiers, categoryId: l.categoryId, station: l.station, weightUnit: l.weightUnit, perUnitCents: l.perUnitCents, taxable: l.taxable })),
    );
    return o!;
  });
  // Pre-orders wait for "Start dum" on the pinned ticket; everything else goes to the kitchen now.
  if (!isPreorder) await fireTicket(ctx, order.id);
  const [fresh] = await ctx.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return ordersSvc.loadOrderDto(ctx.db, fresh!, true);
}

// ---------------------------------------------------------------------------
// Degh pre-orders: prep list, plan and shopping list by pickup day
// ---------------------------------------------------------------------------
export async function listPreorders(ctx: AppContext, staff: StaffContext, q: z.infer<typeof restaurantApi.preordersQuery>): Promise<restaurantApi.PreordersResponse> {
  const merchant = staff.merchant;
  await requireAnyFeature(ctx.db, merchant, PREORDER_FEATURES);
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
        .select({ item: orderItems, preorderOnly: catalogItems.preorderOnly, serves: catalogItems.serves, cookMinutes: catalogItems.cookMinutes, recipe: catalogItems.recipe })
        .from(orderItems)
        .leftJoin(catalogItems, eq(catalogItems.id, orderItems.catalogItemId))
        .where(inArray(orderItems.orderId, ids))
    : [];
  const days = new Map<string, restaurantApi.PreorderDayDto>();
  const planInput = new Map<string, PlanInputLine[]>();
  for (const r of rows) {
    const date = ordersSvc.localDateKey(r.o.pickupAt!, tz);
    let day = days.get(date);
    if (!day) {
      day = { date, pots: 0, cap: capFor(merchant, date).cap, remaining: null, prep: [], plan: [], shopping: null, waitlist: 0, orders: [] };
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
      // Cancelled orders are not in `rows`; picked-up ones are done, so they don't count towards what to cook.
      if (r.o.status !== "picked_up") planInput.set(date, [...(planInput.get(date) ?? []), { catalogItemId: l.item.catalogItemId, name: l.item.name, quantity: l.item.quantity, serves: l.serves, preorderOnly: !!l.preorderOnly, cookMinutes: l.cookMinutes ?? 0, recipe: l.recipe ?? null, pickupAt: r.o.pickupAt! }]);
    }
    day.orders.push({
      orderId: r.o.id,
      number: r.o.number,
      status: r.o.status,
      customerName: r.name,
      customerPhone: r.phone,
      pickupAt: r.o.pickupAt!.toISOString(),
      notes: r.o.notes,
      channel: r.o.channel,
      allergyNote: r.o.allergyNote,
      totalCents: r.o.totalCents,
      depositCents: r.o.depositCents,
      depositPaid: !!r.o.depositPaidAt,
      balanceDueCents: ordersSvc.balanceDueCents(r.o),
      items: mine.map((l) => ({ name: l.item.name, quantity: l.item.quantity, modifiers: l.item.modifiers.map((m) => ({ name: m.name, option: m.option })) })),
    });
  }
  const waiting = await waitlistCounts(ctx.db, merchant.id, from, to);
  for (const d of days.values()) {
    d.remaining = d.cap == null ? null : Math.max(0, d.cap - d.pots);
    const built = buildPlan(planInput.get(d.date) ?? []);
    d.plan = built.plan;
    d.shopping = built.shopping;
    d.waitlist = waiting.get(d.date) ?? 0;
  }
  const caps: restaurantApi.PreordersResponse["caps"] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const c = capFor(merchant, d);
    caps.push({ date: d, cap: c.cap, note: c.note });
    // Days with guests waiting but no orders still need a row for the wait list count.
    if (!days.has(d) && waiting.get(d)) days.set(d, { date: d, pots: 0, cap: c.cap, remaining: c.cap, prep: [], plan: [], shopping: null, waitlist: waiting.get(d)!, orders: [] });
  }
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), caps, rules: rulesDto(merchant) };
}
