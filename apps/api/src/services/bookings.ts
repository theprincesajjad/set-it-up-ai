/**
 * Pickup / drop-off slots and bookings.
 *  - pickup slots: booking.pickup_slots (Plus)
 *  - dropoff / appointment slots: booking.dropoff_scheduling (Pro)
 * Slots are generated from a location's opening hours (merchant timezone).
 */
import { and, asc, desc, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import { bookingSlots, bookings, locations, merchants, orders, serviceTickets, users, type DbOrTx, type Tx } from "@ll/db";
import type { FeatureKey, commerceApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { formatLocalDateTime, formatLocalTime, iso, notifyCustomer } from "./commerceShared.js";
import { requireFeature } from "./features.js";

type Slot = typeof bookingSlots.$inferSelect;
type Booking = typeof bookings.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
export type SlotKind = commerceApi.SlotKind;

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;

export function slotFeature(kind: string): FeatureKey {
  return kind === "pickup" ? "booking.pickup_slots" : "booking.dropoff_scheduling";
}

// ---------------------------------------------------------------------------
// Time zone helpers (no dependencies; DST-safe)
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
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Wall-clock date + minutes-after-midnight in a timezone → UTC instant. */
export function zonedToUtc(dateStr: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const off1 = tzOffsetMs(new Date(guess), timeZone);
  let t = guess - off1;
  const off2 = tzOffsetMs(new Date(t), timeZone);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dayKey(dateStr: string): (typeof DAY_KEYS)[number] {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

function toMinutes(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) throw badRequest(`Invalid time "${hhmm}" in opening hours`);
  return Number(match[1]) * 60 + Number(match[2]);
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
export function slotDto(s: Slot, booked: number): commerceApi.SlotDto {
  return {
    id: s.id,
    merchantId: s.merchantId,
    locationId: s.locationId,
    kind: s.kind as SlotKind,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    capacity: s.capacity,
    booked,
    remaining: Math.max(0, s.capacity - booked),
  };
}

export function bookingDto(b: Booking, s: Slot, merchantName: string): commerceApi.BookingDto {
  return {
    id: b.id,
    slotId: b.slotId,
    merchantId: b.merchantId,
    merchantName,
    userId: b.userId,
    orderId: b.orderId,
    ticketId: b.ticketId,
    status: b.status as commerceApi.BookingDto["status"],
    kind: s.kind as SlotKind,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    locationId: s.locationId,
    notes: b.notes,
    reminderSentAt: iso(b.reminderSentAt),
    createdAt: b.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------
const MAX_SLOTS_PER_RUN = 3000;

export async function generateSlots(ctx: AppContext, merchant: Merchant, body: z.infer<typeof commerceApi.generateSlotsBody>) {
  await requireFeature(ctx.db, merchant, slotFeature(body.kind));
  const [loc] = await ctx.db.select().from(locations).where(and(eq(locations.id, body.locationId), eq(locations.merchantId, merchant.id))).limit(1);
  if (!loc) throw notFound("Location");
  const hours = loc.hours ?? {};
  if (!Object.values(hours).some((w) => w?.length)) throw badRequest("Set opening hours for this location first");
  const now = ctx.now();
  const rows: (typeof bookingSlots.$inferInsert)[] = [];
  for (let i = 0; i < body.days; i++) {
    const date = addDays(body.startDate, i);
    for (const [open, close] of hours[dayKey(date)] ?? []) {
      const start = toMinutes(open);
      let end = toMinutes(close);
      if (end <= start) end += 24 * 60;
      for (let m = start; m + body.slotMinutes <= end; m += body.slotMinutes) {
        const startsAt = zonedToUtc(date, m, merchant.timezone);
        const endsAt = zonedToUtc(date, m + body.slotMinutes, merchant.timezone);
        if (startsAt <= now) continue;
        rows.push({ merchantId: merchant.id, locationId: loc.id, kind: body.kind, startsAt, endsAt, capacity: body.capacity });
        if (rows.length > MAX_SLOTS_PER_RUN) throw badRequest(`Too many slots (max ${MAX_SLOTS_PER_RUN}); use fewer days or longer slots`);
      }
    }
  }
  const created = rows.length ? await ctx.db.insert(bookingSlots).values(rows).onConflictDoNothing().returning() : [];
  return { created: created.length, skipped: rows.length - created.length, slots: created.map((s) => slotDto(s, 0)) };
}

/** Slots with booked counts. */
export async function listSlots(
  db: DbOrTx,
  merchantId: string,
  q: { kind?: string; locationId?: string; from?: Date; to?: Date; onlyAvailable?: boolean },
): Promise<commerceApi.SlotDto[]> {
  const conds = [eq(bookingSlots.merchantId, merchantId)];
  if (q.kind) conds.push(eq(bookingSlots.kind, q.kind));
  if (q.locationId) conds.push(eq(bookingSlots.locationId, q.locationId));
  if (q.from) conds.push(gte(bookingSlots.startsAt, q.from));
  if (q.to) conds.push(lte(bookingSlots.startsAt, q.to));
  const rows = await db
    .select({ slot: bookingSlots, booked: sql<number>`count(${bookings.id}) filter (where ${bookings.status} = 'booked')`.mapWith(Number) })
    .from(bookingSlots)
    .leftJoin(bookings, eq(bookings.slotId, bookingSlots.id))
    .where(and(...conds))
    .groupBy(bookingSlots.id)
    .orderBy(asc(bookingSlots.startsAt))
    .limit(1000);
  const out = rows.map((r) => slotDto(r.slot, r.booked));
  return q.onlyAvailable ? out.filter((s) => s.remaining > 0) : out;
}

export async function deleteSlot(db: DbOrTx, merchantId: string, slotId: string) {
  const [active] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.slotId, slotId), eq(bookings.status, "booked"))).limit(1);
  if (active) throw conflict("This slot has bookings; cancel them first");
  const [row] = await db.delete(bookingSlots).where(and(eq(bookingSlots.id, slotId), eq(bookingSlots.merchantId, merchantId))).returning();
  if (!row) throw notFound("Slot");
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
/**
 * Book a slot inside the caller's transaction. Locks the slot row so two
 * customers can't both take the last place. Caller checks the feature gate.
 */
export async function bookSlotTx(
  tx: Tx,
  now: Date,
  args: { merchantId: string; slotId: string; userId: string; orderId?: string | null; ticketId?: string | null; notes?: string | null; expectKind?: string; expectLocationId?: string | null },
): Promise<{ booking: Booking; slot: Slot }> {
  const [slot] = await tx.select().from(bookingSlots).where(and(eq(bookingSlots.id, args.slotId), eq(bookingSlots.merchantId, args.merchantId))).for("update").limit(1);
  if (!slot) throw notFound("Slot");
  if (args.expectKind && slot.kind !== args.expectKind) throw badRequest(`That isn't a ${args.expectKind} slot`);
  if (args.expectLocationId && slot.locationId && slot.locationId !== args.expectLocationId) throw badRequest("That slot is at a different location");
  if (slot.startsAt <= now) throw conflict("That time has already passed");
  const active = await tx.select({ userId: bookings.userId }).from(bookings).where(and(eq(bookings.slotId, slot.id), eq(bookings.status, "booked")));
  if (active.some((b) => b.userId === args.userId) && !args.orderId) throw conflict("You already booked this time");
  if (active.length >= slot.capacity) throw new HttpError(409, "slot_full", "That time is fully booked. Please pick another.");
  const [booking] = await tx
    .insert(bookings)
    .values({ slotId: slot.id, merchantId: args.merchantId, userId: args.userId, orderId: args.orderId ?? null, ticketId: args.ticketId ?? null, notes: args.notes ?? null })
    .returning();
  return { booking: booking!, slot };
}

export async function createBooking(ctx: AppContext, userId: string, body: z.infer<typeof commerceApi.createBookingBody>) {
  const [slotRow] = await ctx.db.select().from(bookingSlots).where(eq(bookingSlots.id, body.slotId)).limit(1);
  if (!slotRow) throw notFound("Slot");
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, slotRow.merchantId)).limit(1);
  if (!merchant) throw notFound("Slot");
  await requireFeature(ctx.db, merchant, slotFeature(slotRow.kind));
  const { booking, slot } = await ctx.db.transaction(async (tx) => {
    // Links must belong to this customer at this merchant.
    if (body.orderId) {
      const [o] = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.id, body.orderId), eq(orders.userId, userId), eq(orders.merchantId, merchant.id))).limit(1);
      if (!o) throw notFound("Order");
    }
    if (body.ticketId) {
      const [t] = await tx.select({ id: serviceTickets.id }).from(serviceTickets).where(and(eq(serviceTickets.id, body.ticketId), eq(serviceTickets.userId, userId), eq(serviceTickets.merchantId, merchant.id))).limit(1);
      if (!t) throw notFound("Ticket");
    }
    return bookSlotTx(tx, ctx.now(), { merchantId: merchant.id, slotId: body.slotId, userId, orderId: body.orderId, ticketId: body.ticketId, notes: body.notes });
  });
  return bookingDto(booking, slot, merchant.name);
}

export async function listMyBookings(db: DbOrTx, userId: string, now: Date, includePast = false) {
  const conds = [eq(bookings.userId, userId)];
  if (!includePast) conds.push(gt(bookingSlots.endsAt, now));
  const rows = await db
    .select({ b: bookings, s: bookingSlots, merchantName: merchants.name })
    .from(bookings)
    .innerJoin(bookingSlots, eq(bookingSlots.id, bookings.slotId))
    .innerJoin(merchants, eq(merchants.id, bookings.merchantId))
    .where(and(...conds))
    .orderBy(asc(bookingSlots.startsAt))
    .limit(200);
  return rows.map((r) => bookingDto(r.b, r.s, r.merchantName));
}

export async function listMerchantBookings(db: DbOrTx, merchant: Merchant, q: { from?: Date; to?: Date; kind?: string }) {
  const conds = [eq(bookings.merchantId, merchant.id)];
  if (q.from) conds.push(gte(bookingSlots.startsAt, q.from));
  if (q.to) conds.push(lte(bookingSlots.startsAt, q.to));
  if (q.kind) conds.push(eq(bookingSlots.kind, q.kind));
  const rows = await db
    .select({ b: bookings, s: bookingSlots, customerName: users.name, orderNumber: orders.number, ticketNumber: serviceTickets.number })
    .from(bookings)
    .innerJoin(bookingSlots, eq(bookingSlots.id, bookings.slotId))
    .innerJoin(users, eq(users.id, bookings.userId))
    .leftJoin(orders, eq(orders.id, bookings.orderId))
    .leftJoin(serviceTickets, eq(serviceTickets.id, bookings.ticketId))
    .where(and(...conds))
    .orderBy(asc(bookingSlots.startsAt))
    .limit(500);
  return rows.map((r) => ({ ...bookingDto(r.b, r.s, merchant.name), customerName: r.customerName, orderNumber: r.orderNumber ?? null, ticketNumber: r.ticketNumber ?? null }));
}

export async function getBookingDto(db: DbOrTx, where: { bookingId: string; userId?: string; merchantId?: string }) {
  const conds = [eq(bookings.id, where.bookingId)];
  if (where.userId) conds.push(eq(bookings.userId, where.userId));
  if (where.merchantId) conds.push(eq(bookings.merchantId, where.merchantId));
  const [r] = await db
    .select({ b: bookings, s: bookingSlots, merchantName: merchants.name })
    .from(bookings)
    .innerJoin(bookingSlots, eq(bookingSlots.id, bookings.slotId))
    .innerJoin(merchants, eq(merchants.id, bookings.merchantId))
    .where(and(...conds))
    .limit(1);
  if (!r) throw notFound("Booking");
  return bookingDto(r.b, r.s, r.merchantName);
}

export async function cancelBooking(db: DbOrTx, where: { bookingId: string; userId?: string; merchantId?: string }) {
  const conds = [eq(bookings.id, where.bookingId)];
  if (where.userId) conds.push(eq(bookings.userId, where.userId));
  if (where.merchantId) conds.push(eq(bookings.merchantId, where.merchantId));
  const [b] = await db.select().from(bookings).where(and(...conds)).limit(1);
  if (!b) throw notFound("Booking");
  if (b.status !== "booked") throw conflict(`Booking is already ${b.status}`);
  const [row] = await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, b.id)).returning();
  return row!;
}

export async function setBookingStatus(db: DbOrTx, merchant: Merchant, bookingId: string, status: "completed" | "no_show" | "cancelled") {
  if (status === "cancelled") return cancelBooking(db, { bookingId, merchantId: merchant.id });
  const [row] = await db.update(bookings).set({ status }).where(and(eq(bookings.id, bookingId), eq(bookings.merchantId, merchant.id))).returning();
  if (!row) throw notFound("Booking");
  return row;
}

/** Cancel active bookings attached to an order (order cancelled/refunded). */
export async function cancelBookingsForOrder(db: DbOrTx, orderId: string) {
  await db.update(bookings).set({ status: "cancelled" }).where(and(eq(bookings.orderId, orderId), eq(bookings.status, "booked")));
}

// ---------------------------------------------------------------------------
// Reminders (job, every few minutes): 2h before the slot starts
// ---------------------------------------------------------------------------
export async function sendBookingReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const horizon = new Date(now.getTime() + REMINDER_LEAD_MS);
  const due = await ctx.db
    .select({ b: bookings, s: bookingSlots, m: merchants })
    .from(bookings)
    .innerJoin(bookingSlots, eq(bookingSlots.id, bookings.slotId))
    .innerJoin(merchants, eq(merchants.id, bookings.merchantId))
    .where(and(eq(bookings.status, "booked"), isNull(bookings.reminderSentAt), gt(bookingSlots.startsAt, now), lte(bookingSlots.startsAt, horizon)))
    .orderBy(desc(bookingSlots.startsAt))
    .limit(500);
  let sent = 0;
  for (const { b, s, m } of due) {
    // Claim first so two workers never double-send.
    const [claimed] = await ctx.db.update(bookings).set({ reminderSentAt: now }).where(and(eq(bookings.id, b.id), isNull(bookings.reminderSentAt))).returning({ id: bookings.id });
    if (!claimed) continue;
    const [loc] = s.locationId ? await ctx.db.select({ name: locations.name, address: locations.address }).from(locations).where(eq(locations.id, s.locationId)).limit(1) : [];
    const what = s.kind === "pickup" ? "pickup" : s.kind === "dropoff" ? "drop-off" : "appointment";
    const where = loc ? ` (${loc.address})` : "";
    const body = `Reminder: your ${what} at ${m.name} is today at ${formatLocalTime(s.startsAt, m.timezone)}${where}.`;
    await notifyCustomer(ctx, {
      userId: b.userId,
      merchantId: m.id,
      title: `${m.name}: ${what} at ${formatLocalTime(s.startsAt, m.timezone)}`,
      body,
      data: { type: "booking_reminder", bookingId: b.id, startsAt: s.startsAt.toISOString(), when: formatLocalDateTime(s.startsAt, m.timezone) },
    });
    sent++;
  }
  return sent;
}
