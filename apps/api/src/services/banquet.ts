/**
 * Banquet halls (Pro: restaurant.banquet): halls with packages, availability,
 * 72-hour holds, deposit (ll_kind hall_deposit) → confirmed, cancel, and a
 * two-way link to a catering event. A stale hold is cancelled by the
 * banquet.expire_holds job; overlap is checked against confirmed bookings and
 * live holds on the same hall, with the hall row locked so two requests can't
 * both win the same slot.
 */
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { cateringEvents, hallBookings, halls, users, type DbOrTx } from "@ll/db";
import { paymentsManualApi, restaurantApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { platformFeeFor } from "./fees.js";
import { createConnectPayment, retrieveConnectPayment } from "./payments.js";
import { paidInApp, refundDeposit, refundSentence, resolveDepositRefund } from "./depositRefunds.js";
import { formatLocalDateTime, iso, loadMerchant, merchantBrands, money, notifyCustomer, paymentsReady } from "./commerceShared.js";
import { computeTax, merchantProvince } from "./tax.js";
import { addLedger, assertNotFuture, ledgerDtos, liveLedger, manualInstructions, newReferenceCode, receiptLine, todayFor, voidLedger } from "./manual-payments.js";
import { localDate } from "./messaging.js";
import { inQuietHours } from "./notifications.js";

export type Hall = typeof halls.$inferSelect;
export type HallBooking = typeof hallBookings.$inferSelect;
type Merchant = NonNullable<Awaited<ReturnType<typeof loadMerchant>>>;

export const HOLD_HOURS = 72;
const HOLD_MS = HOLD_HOURS * 3_600_000;
const MAX_EVENT_MS = 48 * 3_600_000;
const MIN_CARD_CENTS = 50;

type Step = { label: string; bps: number; dueOffsetDays: number };

/** The hall's staged-payment template; a hall without one gets deposit at hold, then two thirds / one third of the rest at 14 and 7 days. */
export function scheduleTemplate(h: Pick<Hall, "paymentSchedule" | "depositBps">): Step[] {
  if (h.paymentSchedule?.length) return h.paymentSchedule;
  const rest = 10_000 - h.depositBps;
  const second = Math.round((rest * 2) / 3);
  return [
    { label: "Deposit to hold the date", bps: h.depositBps, dueOffsetDays: 0 },
    ...(rest > 0 ? [{ label: "Second payment", bps: second, dueOffsetDays: 14 }, { label: "Final payment", bps: rest - second, dueOffsetDays: 7 }] : []),
  ].filter((x) => x.bps > 0);
}

export const hallDto = (h: Hall): restaurantApi.HallDto => ({
  id: h.id,
  merchantId: h.merchantId,
  name: h.name,
  capacity: h.capacity,
  description: h.description,
  baseCents: h.baseCents,
  packages: h.packages,
  depositBps: h.depositBps,
  refundPolicy: h.refundPolicy,
  paymentSchedule: scheduleTemplate(h),
  autoConfirmOnFirstPayment: h.autoConfirmOnFirstPayment,
  active: h.active,
  createdAt: h.createdAt.toISOString(),
});

export const bookingDto = (b: HallBooking, hallName: string | null = null, refundPolicy: restaurantApi.HallRefundPolicy | null = null): restaurantApi.HallBookingDto => ({
  id: b.id,
  hallId: b.hallId,
  hallName,
  merchantId: b.merchantId,
  userId: b.userId,
  eventType: b.eventType as restaurantApi.CateringEventType,
  startsAt: b.startsAt.toISOString(),
  endsAt: b.endsAt.toISOString(),
  headcount: b.headcount,
  packageName: b.packageName,
  status: b.status as restaurantApi.HallBookingStatus,
  holdExpiresAt: iso(b.holdExpiresAt),
  totalCents: b.totalCents,
  depositCents: b.depositCents,
  depositPaidAt: iso(b.depositPaidAt),
  depositRefundCents: b.depositRefundCents,
  depositRefundedAt: iso(b.depositRefundedAt),
  refundPolicy,
  cateringEventId: b.cateringEventId,
  notes: b.notes,
  referenceCode: b.referenceCode,
  schedule: b.schedule ?? [],
  createdAt: b.createdAt.toISOString(),
});

// ---------------------------------------------------------------------------
// Halls CRUD
// ---------------------------------------------------------------------------
export async function getHall(db: DbOrTx, merchantId: string, hallId: string): Promise<Hall> {
  const [h] = await db.select().from(halls).where(and(eq(halls.id, hallId), eq(halls.merchantId, merchantId))).limit(1);
  if (!h) throw notFound("Hall");
  return h;
}

export async function listHalls(db: DbOrTx, merchantId: string, opts: { activeOnly?: boolean } = {}) {
  const rows = await db.select().from(halls).where(and(eq(halls.merchantId, merchantId), opts.activeOnly ? eq(halls.active, true) : undefined)).orderBy(asc(halls.name));
  return { items: rows.map(hallDto), nextCursor: null };
}

function checkTemplate(steps: Step[] | null | undefined) {
  if (steps && steps.reduce((s, x) => s + x.bps, 0) !== 10_000) throw badRequest("The payment steps must add up to 100%");
}

export async function createHall(db: DbOrTx, merchantId: string, body: z.infer<typeof restaurantApi.createHallBody>) {
  checkTemplate(body.paymentSchedule);
  const [h] = await db.insert(halls).values({ merchantId, ...body, paymentSchedule: body.paymentSchedule ?? null, description: body.description ?? null }).returning();
  return hallDto(h!);
}

export async function updateHall(db: DbOrTx, merchantId: string, hallId: string, body: z.infer<typeof restaurantApi.updateHallBody>) {
  await getHall(db, merchantId, hallId);
  checkTemplate(body.paymentSchedule);
  const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) return hallDto(await getHall(db, merchantId, hallId));
  const [h] = await db.update(halls).set(patch).where(eq(halls.id, hallId)).returning();
  return hallDto(h!);
}

/** Halls with any booking history are kept (deactivate instead) so old invoices and bookings keep their room. */
export async function deleteHall(db: DbOrTx, merchantId: string, hallId: string) {
  await getHall(db, merchantId, hallId);
  const [used] = await db.select({ id: hallBookings.id }).from(hallBookings).where(eq(hallBookings.hallId, hallId)).limit(1);
  if (used) throw conflict("This hall has bookings. Deactivate it instead of deleting it.");
  await db.delete(halls).where(eq(halls.id, hallId));
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------
/** Bookings that currently block a hall: confirmed, or a hold that hasn't lapsed. */
const blocking = (now: Date) => or(eq(hallBookings.status, "confirmed"), and(eq(hallBookings.status, "hold"), gt(hallBookings.holdExpiresAt, now)))!;

export async function availability(ctx: AppContext, merchantId: string, q: { from: Date; to: Date; hallId?: string; activeOnly?: boolean; detail?: boolean }): Promise<restaurantApi.HallAvailabilityResponse> {
  if (q.to <= q.from) throw badRequest("'to' must be after 'from'");
  const hs = (await listHalls(ctx.db, merchantId, { activeOnly: q.activeOnly })).items.filter((h) => !q.hallId || h.id === q.hallId);
  if (q.hallId && !hs.length) throw notFound("Hall");
  const busy = hs.length
    ? await ctx.db
        .select({ b: hallBookings, who: users.name })
        .from(hallBookings)
        .innerJoin(users, eq(users.id, hallBookings.userId))
        .where(and(inArray(hallBookings.hallId, hs.map((h) => h.id)), blocking(ctx.now()), lt(hallBookings.startsAt, q.to), gt(hallBookings.endsAt, q.from)))
        .orderBy(asc(hallBookings.startsAt))
    : [];
  return {
    halls: hs.map((hall) => ({
      hall,
      busy: busy
        .filter(({ b }) => b.hallId === hall.id)
        .map(({ b, who }) => ({
          bookingId: b.id,
          status: b.status as restaurantApi.HallBookingStatus,
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
          // Staff see who and what; the public calendar only sees that the room is busy.
          ...(q.detail ? { label: `${who ?? "Customer"} · ${b.eventType.replace(/_/g, " ")} · ${b.headcount}`, holdExpiresAt: iso(b.holdExpiresAt) } : {}),
        })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------
export async function createHold(ctx: AppContext, merchant: Merchant, userId: string, body: z.infer<typeof restaurantApi.createHoldBody>): Promise<restaurantApi.HoldResponse> {
  const now = ctx.now();
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (endsAt <= startsAt) throw badRequest("The booking must end after it starts");
  if (endsAt.getTime() - startsAt.getTime() > MAX_EVENT_MS) throw badRequest("Bookings can be at most 48 hours long");
  if (startsAt <= now) throw badRequest("Pick a start time in the future");
  const booking = await ctx.db.transaction(async (tx) => {
    // Lock the hall row: concurrent holds on the same hall queue up here.
    const [hall] = await tx.select().from(halls).where(and(eq(halls.id, body.hallId), eq(halls.merchantId, merchant.id))).for("update").limit(1);
    if (!hall || !hall.active) throw notFound("Hall");
    if (body.headcount > hall.capacity) throw badRequest(`${hall.name} holds up to ${hall.capacity} guests`);
    const pkg = body.packageName ? hall.packages.find((p) => p.name === body.packageName) : null;
    if (body.packageName && !pkg) throw badRequest(`${hall.name} has no package called "${body.packageName}"`);
    const [clash] = await tx
      .select({ id: hallBookings.id, status: hallBookings.status })
      .from(hallBookings)
      .where(and(eq(hallBookings.hallId, hall.id), blocking(now), lt(hallBookings.startsAt, endsAt), gt(hallBookings.endsAt, startsAt)))
      .limit(1);
    if (clash) throw conflict(`${hall.name} is already ${clash.status === "confirmed" ? "booked" : "on hold"} for part of that time`);
    let event: typeof cateringEvents.$inferSelect | undefined;
    if (body.cateringEventId) {
      [event] = await tx.select().from(cateringEvents).where(and(eq(cateringEvents.id, body.cateringEventId), eq(cateringEvents.merchantId, merchant.id))).limit(1);
      if (!event) throw notFound("Catering event");
      if (event.status === "cancelled" || event.status === "completed") throw conflict(`That catering event is ${event.status}`);
      if (event.hallBookingId) {
        const [linked] = await tx.select({ status: hallBookings.status }).from(hallBookings).where(eq(hallBookings.id, event.hallBookingId)).limit(1);
        if (linked && (linked.status === "hold" || linked.status === "confirmed")) throw conflict("That catering event already has a hall booked");
      }
    }
    const subtotal = hall.baseCents + (pkg?.perHeadCents ?? 0) * body.headcount;
    const totalCents = subtotal + (merchant.taxRegistered === false ? 0 : computeTax(subtotal, await merchantProvince(tx, merchant)).taxCents);
    // Staged payments: the hall's template (default 25% at hold, then two payments before the event) turned into dated amounts that add up to the total.
    const eventDay = localDate(startsAt, merchant.timezone || "America/Toronto");
    const schedule = restaurantApi.buildHallSchedule(totalCents, scheduleTemplate(hall), eventDay, localDate(now, merchant.timezone || "America/Toronto"));
    let depositCents = hall.paymentSchedule?.length && schedule[0] ? schedule[0].amountCents : Math.round((totalCents * hall.depositBps) / 10_000);
    if (depositCents > 0 && depositCents < MIN_CARD_CENTS) depositCents = Math.min(totalCents, MIN_CARD_CENTS);
    if (!hall.paymentSchedule?.length && schedule[0] && schedule[0].amountCents !== depositCents) schedule[0] = { ...schedule[0], amountCents: depositCents };
    const referenceCode = await newReferenceCode(tx, merchant.id, userId);
    const [b] = await tx
      .insert(hallBookings)
      .values({
        hallId: hall.id,
        merchantId: merchant.id,
        userId,
        eventType: body.eventType,
        startsAt,
        endsAt,
        headcount: body.headcount,
        packageName: pkg?.name ?? null,
        status: "hold",
        holdExpiresAt: new Date(Math.min(now.getTime() + HOLD_MS, startsAt.getTime())),
        totalCents,
        depositCents,
        referenceCode,
        schedule: fixScheduleSum(schedule, totalCents),
        cateringEventId: event?.id ?? null,
        notes: body.notes ?? null,
        createdAt: now,
      })
      .returning();
    if (event) await tx.update(cateringEvents).set({ hallBookingId: b!.id, updatedAt: now }).where(eq(cateringEvents.id, event.id));
    return { b: b!, hallName: hall.name, refundPolicy: hall.refundPolicy };
  });
  await notifyCustomer(ctx, {
    userId,
    merchantId: merchant.id,
    title: `${merchant.name}: hall on hold`,
    body: `${booking.hallName} is held for you on ${formatLocalDateTime(booking.b.startsAt, merchant.timezone)} until ${formatLocalDateTime(booking.b.holdExpiresAt!, merchant.timezone)}. Pay the ${money(booking.b.depositCents)} deposit to confirm.`,
    sms: false,
    data: { type: "hall_hold", hallBookingId: booking.b.id },
  });
  return { booking: bookingDto(booking.b, booking.hallName, booking.refundPolicy), deposit: await depositPayment(ctx, merchant, booking.b) };
}

/** The schedule rows always add up to the booking total to the cent (the last row takes any rounding left over). */
function fixScheduleSum(rows: restaurantApi.HallScheduleRow[], total: number): restaurantApi.HallScheduleRow[] {
  if (!rows.length) return rows;
  const head = rows.slice(0, -1);
  const last = rows[rows.length - 1]!;
  return [...head, { ...last, amountCents: total - head.reduce((s, r) => s + r.amountCents, 0) }];
}

/** Mark instalment `i` paid on `dateIso` (a calendar day or ISO instant). */
function withInstalmentPaid(schedule: restaurantApi.HallScheduleRow[] | null, i: number, dateIso: string): restaurantApi.HallScheduleRow[] | null {
  if (!schedule?.[i]) return schedule;
  return schedule.map((r, k) => (k === i && !r.paidAt ? { ...r, paidAt: dateIso } : r));
}

export async function getBooking(db: DbOrTx, merchantId: string, bookingId: string): Promise<HallBooking> {
  const [b] = await db.select().from(hallBookings).where(and(eq(hallBookings.id, bookingId), eq(hallBookings.merchantId, merchantId))).limit(1);
  if (!b) throw notFound("Hall booking");
  return b;
}

export async function getMyBooking(db: DbOrTx, userId: string, bookingId: string): Promise<HallBooking> {
  const [b] = await db.select().from(hallBookings).where(and(eq(hallBookings.id, bookingId), eq(hallBookings.userId, userId))).limit(1);
  if (!b) throw notFound("Hall booking");
  return b;
}

async function withHallNames(db: DbOrTx, rows: HallBooking[]) {
  const ids = [...new Set(rows.map((r) => r.hallId))];
  const hs = ids.length ? await db.select({ id: halls.id, name: halls.name, refundPolicy: halls.refundPolicy }).from(halls).where(inArray(halls.id, ids)) : [];
  const byId = new Map(hs.map((h) => [h.id, h]));
  return rows.map((r) => bookingDto(r, byId.get(r.hallId)?.name ?? null, byId.get(r.hallId)?.refundPolicy ?? null));
}

/** Customer-facing (/me/banquet/...) DTOs: hall name plus the kitchen's name, slug, logo and brand colour. */
export async function myBookingDtos(db: DbOrTx, rows: HallBooking[]) {
  const brands = await merchantBrands(db, rows.map((r) => r.merchantId));
  return (await withHallNames(db, rows)).map((d) => ({ ...d, ...brands.get(d.merchantId) }));
}

export async function myBookingDto(db: DbOrTx, b: HallBooking) {
  return (await myBookingDtos(db, [b]))[0]!;
}

export async function bookingDtoFor(db: DbOrTx, b: HallBooking) {
  const dto = (await withHallNames(db, [b]))[0]!;
  const payments = await ledgerDtos(db, "hall_instalment", b.id);
  const merchant = await loadMerchant(db, b.merchantId);
  const next = (b.schedule ?? []).find((r) => !r.paidAt);
  return { ...dto, payments, manual: merchant && next && b.status !== "cancelled" ? manualInstructions(merchant, next.amountCents, b.referenceCode) : null };
}

export async function listBookings(db: DbOrTx, merchantId: string, q: z.infer<typeof restaurantApi.listHallBookingsQuery>) {
  const rows = await db
    .select()
    .from(hallBookings)
    .where(
      and(
        eq(hallBookings.merchantId, merchantId),
        q.status ? eq(hallBookings.status, q.status) : undefined,
        q.hallId ? eq(hallBookings.hallId, q.hallId) : undefined,
        q.from ? gt(hallBookings.endsAt, new Date(q.from)) : undefined,
        q.to ? lt(hallBookings.startsAt, new Date(q.to)) : undefined,
      ),
    )
    .orderBy(asc(hallBookings.startsAt))
    .limit(500);
  return { items: await withHallNames(db, rows), nextCursor: null };
}

export async function listMyBookings(db: DbOrTx, userId: string) {
  const rows = await db.select().from(hallBookings).where(eq(hallBookings.userId, userId)).orderBy(asc(hallBookings.startsAt));
  return { items: await myBookingDtos(db, rows), nextCursor: null };
}

// ---------------------------------------------------------------------------
// Deposit, confirm, cancel
// ---------------------------------------------------------------------------
/** Deposit PaymentIntent for a held booking, or null when none is due / in-app payments aren't set up. */
export async function depositPayment(ctx: AppContext, merchant: Merchant, b: HallBooking): Promise<restaurantApi.CateringDepositPaymentDto | null> {
  if (b.depositCents <= 0 || b.depositPaidAt || b.status !== "hold") return null;
  if (!(await paymentsReady(ctx.db, merchant))) return null;
  const pi = b.depositPaymentIntentId
    ? await retrieveConnectPayment(ctx, merchant, b.depositPaymentIntentId)
    : await createConnectPayment(ctx, merchant, {
        amountCents: b.depositCents,
        connectedAccountId: merchant.stripeAccountId!,
        applicationFeeCents: platformFeeFor("deposit", b.depositCents, merchant),
        description: `${merchant.name} hall deposit`,
        metadata: { ll_kind: "hall_deposit", ll_id: b.id, merchant_id: merchant.id },
        idempotencyKey: `hall_deposit:${b.id}`,
      });
  if (!b.depositPaymentIntentId) await ctx.db.update(hallBookings).set({ depositPaymentIntentId: pi.id }).where(eq(hallBookings.id, b.id));
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
}

async function confirmBooking(ctx: AppContext, b: HallBooking, patch: Partial<typeof hallBookings.$inferInsert>): Promise<HallBooking | null> {
  const [row] = await ctx.db
    .update(hallBookings)
    .set({ ...patch, status: "confirmed", holdExpiresAt: null })
    .where(and(eq(hallBookings.id, b.id), eq(hallBookings.status, "hold")))
    .returning();
  return row ?? null;
}

async function notifyDepositProcessing(ctx: AppContext, b: HallBooking) {
  const merchant = await loadMerchant(ctx.db, b.merchantId);
  if (!merchant) return;
  await notifyCustomer(ctx, {
    userId: b.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: deposit payment is processing`,
    body: `Your ${money(b.depositCents)} deposit for the hall on ${formatLocalDateTime(b.startsAt, merchant.timezone)} is processing. Bank debits can take a few business days. We'll confirm once ${merchant.name} receives it.`,
    sms: false,
    data: { type: "hall_deposit_processing", hallBookingId: b.id },
  });
}

async function notifyConfirmed(ctx: AppContext, b: HallBooking) {
  const merchant = await loadMerchant(ctx.db, b.merchantId);
  if (!merchant) return;
  await notifyCustomer(ctx, {
    userId: b.userId,
    merchantId: merchant.id,
    title: `${merchant.name}: hall confirmed`,
    body: `Your hall booking on ${formatLocalDateTime(b.startsAt, merchant.timezone)} is confirmed. Thank you for the ${money(b.depositCents)} deposit.`,
    sms: false,
    data: { type: "hall_confirmed", hallBookingId: b.id },
  });
}

/** Staff confirm: needs the deposit paid (webhook) or recorded as received outside the app. */
export async function confirm(ctx: AppContext, merchantId: string, bookingId: string, body: z.infer<typeof restaurantApi.confirmHallBookingBody>): Promise<HallBooking> {
  const b = await getBooking(ctx.db, merchantId, bookingId);
  if (b.status === "confirmed") return b;
  if (b.status !== "hold") throw conflict(`Booking is ${b.status}`);
  if (b.holdExpiresAt && b.holdExpiresAt <= ctx.now()) throw new HttpError(409, "hold_expired", "This hold has expired. Create a new one.");
  const paid = !!b.depositPaidAt || b.depositCents === 0;
  if (!paid && !body.markDepositPaid) throw conflict("The deposit hasn't been paid yet");
  const updated = await confirmBooking(ctx, b, b.depositPaidAt || b.depositCents === 0 ? {} : { depositPaidAt: ctx.now(), schedule: withInstalmentPaid(b.schedule, 0, ctx.now().toISOString()) });
  if (!updated) throw conflict("Booking was just updated. Refresh and try again.");
  await notifyConfirmed(ctx, updated);
  return updated;
}

/** Stripe webhook (ll_kind hall_deposit): deposit paid → confirmed, unless the hold was already released or lost the slot. */
export async function onHallDeposit(ctx: AppContext, bookingId: string, paymentIntentId: string, outcome: "succeeded" | "failed" | "processing") {
  const [b] = await ctx.db.select().from(hallBookings).where(eq(hallBookings.id, bookingId)).limit(1);
  if (!b || b.depositPaidAt) return;
  if (b.depositPaymentIntentId && b.depositPaymentIntentId !== paymentIntentId) return;
  if (outcome === "failed") {
    // A debit that was processing and bounced: the deposit is unpaid again and the customer can retry while the hold lasts.
    if (b.depositProcessingAt) await ctx.db.update(hallBookings).set({ depositProcessingAt: null }).where(eq(hallBookings.id, b.id));
    return;
  }
  if (outcome === "processing") {
    if (b.depositProcessingAt) return;
    const [marked] = await ctx.db.update(hallBookings).set({ depositProcessingAt: ctx.now() }).where(and(eq(hallBookings.id, b.id), isNull(hallBookings.depositProcessingAt), isNull(hallBookings.depositPaidAt))).returning();
    if (marked && marked.status === "hold") await notifyDepositProcessing(ctx, marked);
    return;
  }
  const patch = { depositPaidAt: ctx.now(), depositPaymentIntentId: paymentIntentId, depositProcessingAt: null, schedule: withInstalmentPaid(b.schedule, 0, ctx.now().toISOString()) };
  if (b.status !== "hold") {
    // Paid after the hold lapsed or was cancelled: record it so staff can refund.
    await ctx.db.update(hallBookings).set(patch).where(eq(hallBookings.id, b.id));
    return;
  }
  const updated = await confirmBooking(ctx, b, patch);
  if (updated) await notifyConfirmed(ctx, updated);
}

async function releaseCateringLink(db: DbOrTx, bookingId: string, now: Date) {
  await db.update(cateringEvents).set({ hallBookingId: null, updatedAt: now }).where(eq(cateringEvents.hallBookingId, bookingId));
}

/**
 * Cancel a booking. Staff pass `refund` (full | none | {amountCents}, default none) for a deposit paid in the app.
 * A customer's cancel applies the hall's refund policy automatically once the deposit is paid (a hold with no
 * deposit just releases). Staff may also call it again on an already-cancelled booking to refund a deposit
 * that landed after the cancel. The refund is made first, so a Stripe failure leaves the booking as it was.
 */
export async function cancel(ctx: AppContext, where: { merchantId?: string; userId?: string; bookingId: string }, refund?: restaurantApi.DepositRefundChoice): Promise<HallBooking> {
  const staff = !!where.merchantId;
  const b = staff ? await getBooking(ctx.db, where.merchantId!, where.bookingId) : await getMyBooking(ctx.db, where.userId!, where.bookingId);
  const wasCancelled = b.status === "cancelled";
  if (wasCancelled && (!staff || !refund || refund === "none")) return b;
  if (b.status === "completed") throw conflict("Booking is already completed");
  const now = ctx.now();
  const merchant = await loadMerchant(ctx.db, b.merchantId);
  let refundCents = 0;
  if (staff) {
    refundCents = merchant ? await resolveDepositRefund(ctx, merchant, refund, b) : 0;
  } else if (merchant && !b.depositRefundedAt && b.depositCents > 0 && (await paidInApp(ctx, merchant, b))) {
    const [hall] = await ctx.db.select({ refundPolicy: halls.refundPolicy }).from(halls).where(eq(halls.id, b.hallId)).limit(1);
    refundCents = hall ? Math.round((b.depositCents * restaurantApi.hallRefundBps(hall.refundPolicy, b.startsAt, now)) / 10_000) : 0;
  }
  if (refundCents > 0 && merchant) await refundDeposit(ctx, merchant, { kind: "hall_deposit", id: b.id, paymentIntentId: b.depositPaymentIntentId! }, refundCents, staff ? "Hall booking cancelled" : "Cancelled by customer");
  const refunded = refundCents > 0 ? { depositRefundCents: refundCents, depositRefundedAt: now } : {};
  const row = await ctx.db.transaction(async (tx) => {
    const [r] = await tx.update(hallBookings).set({ status: "cancelled", holdExpiresAt: null, ...refunded }).where(eq(hallBookings.id, b.id)).returning();
    if (!wasCancelled) await releaseCateringLink(tx, b.id, now);
    return r!;
  });
  // The customer hears about a refund, and about a cancel they didn't make themselves.
  if (merchant && (refundCents > 0 || (staff && !wasCancelled))) {
    const when = formatLocalDateTime(b.startsAt, merchant.timezone);
    await notifyCustomer(ctx, {
      userId: b.userId,
      merchantId: merchant.id,
      title: `${merchant.name}: ${wasCancelled ? "deposit refunded" : "hall booking cancelled"}`,
      body: `${wasCancelled ? `Your ${when} hall booking was already cancelled.` : `Your hall booking on ${when} was cancelled.`}${refundSentence(refundCents) || (b.depositPaidAt && !refundCents ? ` ${merchant.name} will be in touch about your deposit.` : "")}`,
      sms: false,
      data: { type: "hall_cancelled", hallBookingId: b.id, ...(refundCents > 0 ? { refundCents } : {}) },
    });
  }
  return row;
}

/** Staff: mark a confirmed booking as done once the event has happened. */
export async function complete(ctx: AppContext, merchantId: string, bookingId: string): Promise<HallBooking> {
  const b = await getBooking(ctx.db, merchantId, bookingId);
  if (b.status !== "confirmed") throw conflict(`Only confirmed bookings can be completed (this one is ${b.status})`);
  const [row] = await ctx.db.update(hallBookings).set({ status: "completed" }).where(eq(hallBookings.id, b.id)).returning();
  return row!;
}

// ---------------------------------------------------------------------------
// Staged payments recorded by hand
// ---------------------------------------------------------------------------
/**
 * Record an instalment received by e-transfer, cash or cheque: a ledger row (hall_instalment) and the instalment marked
 * paid once its ledger total covers it. Instalment 0 is the deposit: it sets depositPaidAt, and confirms a hold when the
 * hall is set to confirm on the first payment. Bookings made before schedules existed get one built from the hall template.
 */
export async function recordPayment(ctx: AppContext, staff: StaffContext, bookingId: string, body: z.infer<typeof paymentsManualApi.recordPaymentBody>): Promise<HallBooking> {
  const merchant = staff.merchant;
  const b0 = await getBooking(ctx.db, merchant.id, bookingId);
  if (b0.status === "cancelled" || b0.status === "completed") throw conflict(`Booking is ${b0.status}`);
  const today = todayFor(ctx, merchant);
  assertNotFuture(body.receivedOn, today);
  const hall = await getHall(ctx.db, merchant.id, b0.hallId);
  const tz = merchant.timezone || "America/Toronto";
  let schedule = b0.schedule ?? fixScheduleSum(restaurantApi.buildHallSchedule(b0.totalCents, scheduleTemplate(hall), localDate(b0.startsAt, tz), localDate(b0.createdAt, tz)), b0.totalCents);
  if (!b0.schedule && b0.depositPaidAt && schedule[0]) schedule = withInstalmentPaid(schedule, 0, b0.depositPaidAt.toISOString())!;
  const index = body.instalmentIndex ?? Math.max(0, schedule.findIndex((r) => !r.paidAt));
  const row = schedule[index];
  if (!row) throw badRequest("That payment step doesn't exist on this booking", { instalmentIndex: index });
  if (row.paidAt) throw conflict(`"${row.label}" is already paid`);
  await addLedger(ctx, staff, ctx.db, { subjectType: "hall_instalment", subjectId: b0.id, instalmentIndex: index, body });
  const paidForRow = (await liveLedger(ctx.db, "hall_instalment", b0.id)).filter((l) => l.instalmentIndex === index).reduce((s, l) => s + l.amountCents, 0);
  const covered = paidForRow >= row.amountCents;
  const nextSchedule = covered ? schedule.map((r, k) => (k === index ? { ...r, paidAt: body.receivedOn } : r)) : schedule;
  const patch: Partial<typeof hallBookings.$inferInsert> = { schedule: nextSchedule, ...(index === 0 && covered ? { depositPaidAt: new Date(`${body.receivedOn}T12:00:00Z`) } : {}) };
  let [b] = await ctx.db.update(hallBookings).set(patch).where(eq(hallBookings.id, b0.id)).returning();
  if (index === 0 && covered && b!.status === "hold" && hall.autoConfirmOnFirstPayment) {
    const confirmed = await confirmBooking(ctx, b!, {});
    if (confirmed) {
      b = confirmed;
      await notifyConfirmed(ctx, confirmed);
    }
  }
  if (body.sendReceipt) {
    await notifyCustomer(ctx, { userId: b0.userId, merchantId: merchant.id, title: `${merchant.name}: payment received`, body: `${merchant.name} received ${receiptLine(body.amountCents, body.method, body.receivedOn)} for your hall booking on ${formatLocalDateTime(b0.startsAt, tz)}.${covered ? "" : " The rest of this payment is still due."} Thank you.`, sms: false, data: { type: "hall_payment", hallBookingId: b0.id } });
  }
  return b!;
}

/**
 * Undo an instalment recorded by hand (a mistake): owner only, with a reason, audited. The instalment is unpaid again; if it was
 * the deposit, the booking's deposit date clears too. A booking that was confirmed by that payment stays confirmed: change
 * its status separately. Card payments have no ledger row and are refunded, not voided.
 */
export async function voidPayment(ctx: AppContext, staff: StaffContext, bookingId: string, body: z.output<typeof paymentsManualApi.voidPaymentBody>): Promise<HallBooking> {
  const b0 = await getBooking(ctx.db, staff.merchant.id, bookingId);
  if (b0.status === "cancelled" || b0.status === "completed") throw conflict(`Booking is ${b0.status}`);
  const target = body.paymentId ? (await liveLedger(ctx.db, "hall_instalment", b0.id)).find((l) => l.id === body.paymentId) : undefined;
  const voided = await voidLedger(ctx, staff, "hall_instalment", b0.id, body.reason, target?.id);
  const index = voided.instalmentIndex;
  const schedule = b0.schedule;
  if (index === null || !schedule?.[index]) return b0;
  const row = schedule[index]!;
  const paidForRow = (await liveLedger(ctx.db, "hall_instalment", b0.id)).filter((l) => l.instalmentIndex === index).reduce((s, l) => s + l.amountCents, 0);
  if (paidForRow >= row.amountCents) return b0;
  const nextSchedule = schedule.map((r, k) => (k === index ? { ...r, paidAt: null } : r));
  const [b] = await ctx.db
    .update(hallBookings)
    .set({ schedule: nextSchedule, ...(index === 0 ? { depositPaidAt: null } : {}) })
    .where(eq(hallBookings.id, b0.id))
    .returning();
  return b!;
}

/**
 * Job: payment-due notices (an instalment due within 3 days, once per instalment) and hold-expiry notices (24 h and 4 h
 * before the hold lapses). `lastReminderKey` makes every notice go out once; quiet hours (21:00 to 08:00) wait for the next run.
 */
export async function sendBanquetReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const rows = await ctx.db.select().from(hallBookings).where(inArray(hallBookings.status, ["hold", "confirmed"])).limit(1000);
  let sent = 0;
  for (const b of rows) {
    const merchant = await loadMerchant(ctx.db, b.merchantId);
    if (!merchant || inQuietHours(now, merchant.timezone || "America/Toronto")) continue;
    const today = localDate(now, merchant.timezone || "America/Toronto");
    let key: string | null = null;
    let title = "";
    let text = "";
    if (b.status === "hold" && b.holdExpiresAt) {
      const left = b.holdExpiresAt.getTime() - now.getTime();
      if (left > 0 && left <= 4 * 3_600_000) key = "hold4";
      else if (left > 0 && left <= 24 * 3_600_000) key = "hold24";
      if (key) {
        title = `${merchant.name}: your hold ends soon`;
        text = `Your hold on the hall for ${formatLocalDateTime(b.startsAt, merchant.timezone)} ends ${formatLocalDateTime(b.holdExpiresAt, merchant.timezone)}. Pay the ${money(b.depositCents)} deposit to keep the date${b.referenceCode ? ` (reference ${b.referenceCode})` : ""}.`;
      }
    }
    if (!key && b.schedule) {
      const i = b.schedule.findIndex((r) => !r.paidAt);
      const r = b.schedule[i];
      // The deposit of a live hold is covered by the hold notices above.
      if (r && i > 0 && Date.parse(`${r.dueOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`) <= 3 * 86_400_000) {
        key = `due:${i}`;
        title = `${merchant.name}: a hall payment is due`;
        text = `${r.label}: ${money(r.amountCents)} is due ${r.dueOn} for your hall booking on ${formatLocalDateTime(b.startsAt, merchant.timezone)}.${b.referenceCode ? ` Reference ${b.referenceCode}.` : ""}`;
      }
    }
    if (!key || b.lastReminderKey === key) continue;
    const marked = await ctx.db.update(hallBookings).set({ lastReminderKey: key }).where(and(eq(hallBookings.id, b.id), or(isNull(hallBookings.lastReminderKey), sql`${hallBookings.lastReminderKey} <> ${key}`))).returning({ id: hallBookings.id });
    if (!marked.length) continue;
    await notifyCustomer(ctx, { userId: b.userId, merchantId: merchant.id, title, body: text, sms: false, data: { type: "hall_payment_due", hallBookingId: b.id, key } });
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Catering link (both directions)
// ---------------------------------------------------------------------------
export async function linkCatering(ctx: AppContext, merchantId: string, bookingId: string, cateringEventId: string): Promise<HallBooking> {
  const b = await getBooking(ctx.db, merchantId, bookingId);
  if (b.status !== "hold" && b.status !== "confirmed") throw conflict(`Booking is ${b.status}`);
  const [e] = await ctx.db.select().from(cateringEvents).where(and(eq(cateringEvents.id, cateringEventId), eq(cateringEvents.merchantId, merchantId))).limit(1);
  if (!e) throw notFound("Catering event");
  if (e.status === "cancelled" || e.status === "completed") throw conflict(`That catering event is ${e.status}`);
  if (e.hallBookingId && e.hallBookingId !== b.id) throw conflict("That catering event already has a hall booked");
  const now = ctx.now();
  return ctx.db.transaction(async (tx) => {
    if (b.cateringEventId && b.cateringEventId !== e.id) await tx.update(cateringEvents).set({ hallBookingId: null, updatedAt: now }).where(and(eq(cateringEvents.id, b.cateringEventId), eq(cateringEvents.hallBookingId, b.id)));
    const [row] = await tx.update(hallBookings).set({ cateringEventId: e.id }).where(eq(hallBookings.id, b.id)).returning();
    await tx.update(cateringEvents).set({ hallBookingId: b.id, updatedAt: now }).where(eq(cateringEvents.id, e.id));
    return row!;
  });
}

// ---------------------------------------------------------------------------
// Job: expire stale holds
// ---------------------------------------------------------------------------
export async function expireHolds(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const stale = await ctx.db
    .select()
    .from(hallBookings)
    .where(and(eq(hallBookings.status, "hold"), isNotNull(hallBookings.holdExpiresAt), lte(hallBookings.holdExpiresAt, now)))
    .orderBy(asc(hallBookings.holdExpiresAt))
    .limit(500);
  let n = 0;
  for (const b of stale) {
    const cancelled = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.update(hallBookings).set({ status: "cancelled" }).where(and(eq(hallBookings.id, b.id), eq(hallBookings.status, "hold"))).returning();
      if (row) await releaseCateringLink(tx, b.id, now);
      return row;
    });
    if (!cancelled) continue;
    n++;
    const merchant = await loadMerchant(ctx.db, b.merchantId);
    if (merchant) {
      await notifyCustomer(ctx, {
        userId: b.userId,
        merchantId: merchant.id,
        title: `${merchant.name}: hold released`,
        body: `Your ${HOLD_HOURS}-hour hold for ${formatLocalDateTime(b.startsAt, merchant.timezone)} has ended and the hall is open again. Call ${merchant.name} to book it.`,
        sms: false,
        data: { type: "hall_hold_expired", hallBookingId: b.id },
      });
    }
  }
  return n;
}
