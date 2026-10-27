/**
 * Classes: the schedule with capacity and a waitlist, booking against a membership, a pass or a paid drop-in,
 * cancelling against the studio's window, late-cancel fees, and door check-in.
 * Contract: @ll/shared classesApi. Routes: routes/classes. Memberships and the money for packs live in
 * class-memberships.ts; both share the class_charges table.
 *
 * Rules (the customer sees them before they tap Book):
 *  - Free cancel until `cancelWindowHours` before the start. Inside the window the class is used: a pack credit is
 *    not returned, a drop-in is not refunded, and a member with a saved card pays the studio's late fee (if set).
 *    A no-show is treated like a late cancel. Staff can excuse either (credit back, fee refunded).
 *  - A full class takes a waitlist. Nothing is used while waiting. When a spot opens (a cancel, a bigger room) the
 *    first person on the list who has a membership or a pass is booked and told; someone with nothing to use is
 *    skipped. No one is promoted inside `waitlistCutoffMinutes` of the start.
 *  - Credit order: an active membership that covers the day (and has classes left in its month), then the pass that
 *    expires first. Otherwise the customer pays a drop-in, which holds the spot for 10 minutes.
 *  - Booking is serialised per class (the class row is locked), so the last spot is never sold twice.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { classBookings, classCharges, classMemberships, classPasses, classProducts, classSessions, classSettings, classTypes, locations, loyaltyPrograms, merchantMembers, merchants, users, type DbOrTx } from "@ll/db";
import { classesApi, normalizeLocale, normalizePhone, salesTaxBps, salesTaxCopy, translator, type Locale, LOCALES } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { getPayments } from "../providers/payments.js";
import { iso, loadMerchant, money, notifyCustomer, paymentsReady } from "./commerceShared.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { platformFeeFor } from "./fees.js";
import { findOrCreateCustomerByPhone, awardPurchase, ensureMember } from "./ledger.js";
import { chargeConnectSavedMethod, chargeModeFor, createConnectPayment, refundConnectPayment, savedMethodScope } from "./payments.js";
import { maskedPhone } from "./serializers.js";
import { parseMemberCode } from "./staff.js";
import { merchantProvince } from "./tax.js";
import { addDays, zonedToUtc } from "./bookings.js";
import { localParts } from "./appointments.js";

export type Merchant = typeof merchants.$inferSelect;
export type Session = typeof classSessions.$inferSelect;
export type Booking = typeof classBookings.$inferSelect;
export type Pass = typeof classPasses.$inferSelect;
export type Membership = typeof classMemberships.$inferSelect;
export type Product = typeof classProducts.$inferSelect;
export type Charge = typeof classCharges.$inferSelect;

const MIN = 60_000;
const HOUR = 60 * MIN;
const MIN_CHARGE_CENTS = 50;
/** A customer may hold at most this many unpaid drop-in bookings at once. */
const MAX_OPEN_HOLDS = 3;
/** Booking rows that take a spot. A held booking only counts while its hold is live. */
const SPOT = ["held", "booked", "attended"] as const;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const DEFAULT_SETTINGS: classesApi.ClassSettingsDto = {
  cancelWindowHours: classesApi.DEFAULT_CLASS_CANCEL_WINDOW_HOURS,
  lateFeeCents: 0,
  waitlistCutoffMinutes: 120,
  freezeMaxDays: 30,
  freezesPerYear: 2,
  renewalNoticeDays: 60,
  termsNote: null,
  awardOnCheckIn: true,
};

export async function getSettings(db: DbOrTx, merchantId: string): Promise<classesApi.ClassSettingsDto> {
  const [r] = await db.select().from(classSettings).where(eq(classSettings.merchantId, merchantId)).limit(1);
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    cancelWindowHours: r.cancelWindowHours,
    lateFeeCents: r.lateFeeCents,
    waitlistCutoffMinutes: r.waitlistCutoffMinutes,
    freezeMaxDays: r.freezeMaxDays,
    freezesPerYear: r.freezesPerYear,
    renewalNoticeDays: r.renewalNoticeDays,
    termsNote: r.termsNote,
    awardOnCheckIn: r.awardOnCheckIn,
  };
}

export async function putSettings(ctx: AppContext, merchantId: string, body: z.output<typeof classesApi.classSettingsBody>): Promise<classesApi.ClassSettingsDto> {
  const cur = await getSettings(ctx.db, merchantId);
  const next = { ...cur, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) } as classesApi.ClassSettingsDto;
  await ctx.db
    .insert(classSettings)
    .values({ merchantId, ...next, createdAt: ctx.now(), updatedAt: ctx.now() })
    .onConflictDoUpdate({ target: classSettings.merchantId, set: { ...next, updatedAt: ctx.now() } });
  return next;
}

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------
const typeDto = (t: typeof classTypes.$inferSelect): classesApi.ClassTypeDto => ({ id: t.id, name: t.name, description: t.description, durationMin: t.durationMin, capacity: t.capacity, womenOnly: t.womenOnly, active: t.active, sort: t.sort });

export async function listTypes(db: DbOrTx, merchantId: string): Promise<classesApi.ClassTypesResponse> {
  const rows = await db.select().from(classTypes).where(eq(classTypes.merchantId, merchantId)).orderBy(asc(classTypes.sort), asc(classTypes.name));
  return { items: rows.map(typeDto) };
}
export async function createType(ctx: AppContext, merchantId: string, body: z.output<typeof classesApi.createClassTypeBody>): Promise<classesApi.ClassTypeDto> {
  const [t] = await ctx.db.insert(classTypes).values({ merchantId, ...body, description: body.description ?? null, createdAt: ctx.now(), updatedAt: ctx.now() }).returning();
  return typeDto(t!);
}
export async function updateType(ctx: AppContext, merchantId: string, id: string, body: z.output<typeof classesApi.updateClassTypeBody>): Promise<classesApi.ClassTypeDto> {
  const set = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const [t] = await ctx.db.update(classTypes).set({ ...set, updatedAt: ctx.now() }).where(and(eq(classTypes.id, id), eq(classTypes.merchantId, merchantId))).returning();
  if (!t) throw notFound("Class type");
  return typeDto(t);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
async function firstLocation(db: DbOrTx, merchantId: string, locationId?: string) {
  const [l] = await db.select().from(locations).where(and(eq(locations.merchantId, merchantId), locationId ? eq(locations.id, locationId) : undefined)).orderBy(asc(locations.createdAt)).limit(1);
  if (!l) throw badRequest("Add a location first");
  return l;
}

/** How many spots are taken per session (a live hold counts), and how many wait. */
async function countsFor(db: DbOrTx, sessionIds: string[], now: Date): Promise<Map<string, { booked: number; waitlisted: number }>> {
  const out = new Map<string, { booked: number; waitlisted: number }>();
  if (!sessionIds.length) return out;
  const rows = await db
    .select({ sessionId: classBookings.sessionId, status: classBookings.status, holdExpiresAt: classBookings.holdExpiresAt, n: sql<number>`count(*)::int` })
    .from(classBookings)
    .where(and(inArray(classBookings.sessionId, sessionIds), inArray(classBookings.status, ["held", "booked", "attended", "waitlisted"])))
    .groupBy(classBookings.sessionId, classBookings.status, classBookings.holdExpiresAt);
  for (const r of rows) {
    const c = out.get(r.sessionId) ?? { booked: 0, waitlisted: 0 };
    if (r.status === "waitlisted") c.waitlisted += Number(r.n);
    else if (r.status === "held" && r.holdExpiresAt && r.holdExpiresAt <= now) continue;
    else c.booked += Number(r.n);
    out.set(r.sessionId, c);
  }
  return out;
}

const freeCancelUntil = (s: Pick<Session, "startsAt">, windowHours: number) => new Date(s.startsAt.getTime() - windowHours * HOUR);

export async function sessionDtos(ctx: AppContext, rows: Session[], opts: { userId?: string; windowHours?: number } = {}): Promise<classesApi.ClassSessionDto[]> {
  const ids = rows.map((r) => r.id);
  const counts = await countsFor(ctx.db, ids, ctx.now());
  let mine = new Map<string, Booking>();
  const positions = new Map<string, number>();
  if (opts.userId && ids.length) {
    const mb = await ctx.db.select().from(classBookings).where(and(eq(classBookings.userId, opts.userId), inArray(classBookings.sessionId, ids), inArray(classBookings.status, ["held", "booked", "waitlisted", "attended"])));
    mine = new Map(mb.map((b) => [b.sessionId, b]));
    for (const b of mb.filter((x) => x.status === "waitlisted")) positions.set(b.id, await waitlistPosition(ctx.db, b));
  }
  const hours = opts.windowHours ?? DEFAULT_SETTINGS.cancelWindowHours;
  return rows.map((s) => {
    const c = counts.get(s.id) ?? { booked: 0, waitlisted: 0 };
    const b = mine.get(s.id);
    return {
      id: s.id,
      classTypeId: s.classTypeId,
      name: s.name,
      instructorName: s.instructorName,
      room: s.room,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      capacity: s.capacity,
      booked: c.booked,
      waitlisted: c.waitlisted,
      womenOnly: s.womenOnly,
      status: s.status as "scheduled" | "cancelled",
      locationId: s.locationId,
      notes: s.notes,
      ...(opts.userId ? { mine: b ? { bookingId: b.id, status: b.status as classesApi.ClassBookingStatus, waitlistPosition: b.status === "waitlisted" ? (positions.get(b.id) ?? null) : null, payWith: (b.payWith as classesApi.PayWith | null) ?? null, freeCancelUntil: freeCancelUntil(s, hours).toISOString(), holdExpiresAt: iso(b.holdExpiresAt) } : null } : {}),
    };
  });
}

async function waitlistPosition(db: DbOrTx, b: Booking): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(classBookings)
    .where(and(eq(classBookings.sessionId, b.sessionId), eq(classBookings.status, "waitlisted"), or(lt(classBookings.waitlistedAt, b.waitlistedAt ?? b.createdAt), and(eq(classBookings.waitlistedAt, b.waitlistedAt ?? b.createdAt), lt(classBookings.id, b.id)))));
  return Number(r?.n ?? 0) + 1;
}

export async function listSessions(ctx: AppContext, merchant: Merchant, q: z.output<typeof classesApi.listSessionsQuery>, userId?: string): Promise<classesApi.SessionsResponse> {
  const from = q.from ? new Date(q.from) : new Date(ctx.now().getTime() - 6 * HOUR);
  const to = q.to ? new Date(q.to) : new Date(ctx.now().getTime() + 14 * 24 * HOUR);
  const rows = await ctx.db
    .select()
    .from(classSessions)
    .where(and(eq(classSessions.merchantId, merchant.id), gte(classSessions.startsAt, from), lte(classSessions.startsAt, to), q.locationId ? eq(classSessions.locationId, q.locationId) : undefined))
    .orderBy(asc(classSessions.startsAt), asc(classSessions.id))
    .limit(500);
  const s = await getSettings(ctx.db, merchant.id);
  return { items: await sessionDtos(ctx, rows, { userId, windowHours: s.cancelWindowHours }) };
}

export async function createSessions(ctx: AppContext, merchant: Merchant, body: z.output<typeof classesApi.createSessionBody>): Promise<classesApi.CreateSessionsResponse> {
  const [type] = await ctx.db.select().from(classTypes).where(and(eq(classTypes.id, body.classTypeId), eq(classTypes.merchantId, merchant.id))).limit(1);
  if (!type) throw notFound("Class type");
  const loc = await firstLocation(ctx.db, merchant.id, body.locationId);
  const start = new Date(body.startsAt);
  if (start.getTime() < ctx.now().getTime() - HOUR) throw badRequest("That time has passed");
  const tz = merchant.timezone;
  const local = localParts(start, tz);
  const seriesId = body.repeatWeeks > 1 ? crypto.randomUUID() : null;
  const values = Array.from({ length: body.repeatWeeks }, (_, i) => {
    // Repeat on the same wall-clock time, so a class stays at 6:30 PM across the November clock change.
    const startsAt = i === 0 ? start : zonedToUtc(addDays(local.date, 7 * i), local.minutes, tz);
    return {
      merchantId: merchant.id,
      locationId: loc.id,
      classTypeId: type.id,
      name: type.name,
      instructorName: body.instructorName ?? null,
      room: body.room ?? null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + type.durationMin * MIN),
      capacity: body.capacity ?? type.capacity,
      womenOnly: body.womenOnly ?? type.womenOnly,
      seriesId,
      notes: body.notes ?? null,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    };
  });
  const rows = await ctx.db.insert(classSessions).values(values).returning();
  const s = await getSettings(ctx.db, merchant.id);
  return { items: await sessionDtos(ctx, rows, { windowHours: s.cancelWindowHours }) };
}

async function loadSession(db: DbOrTx, merchantId: string, id: string): Promise<Session> {
  const [s] = await db.select().from(classSessions).where(and(eq(classSessions.id, id), eq(classSessions.merchantId, merchantId))).limit(1);
  if (!s) throw notFound("Class");
  return s;
}

export async function updateSession(ctx: AppContext, merchant: Merchant, id: string, body: z.output<typeof classesApi.updateSessionBody>): Promise<classesApi.ClassSessionDto> {
  const cur = await loadSession(ctx.db, merchant.id, id);
  if (cur.status === "cancelled") throw conflict("This class is cancelled");
  const type = cur.classTypeId ? (await ctx.db.select().from(classTypes).where(eq(classTypes.id, cur.classTypeId)).limit(1))[0] : null;
  const set: Partial<typeof classSessions.$inferInsert> = { updatedAt: ctx.now() };
  if (body.instructorName !== undefined) set.instructorName = body.instructorName ?? null;
  if (body.room !== undefined) set.room = body.room ?? null;
  if (body.notes !== undefined) set.notes = body.notes ?? null;
  if (body.womenOnly !== undefined) set.womenOnly = body.womenOnly;
  if (body.capacity !== undefined) {
    const counts = await countsFor(ctx.db, [id], ctx.now());
    if (body.capacity < (counts.get(id)?.booked ?? 0)) throw conflict("More people are booked than that. Move or cancel some first.");
    set.capacity = body.capacity;
  }
  const moved = body.startsAt ? new Date(body.startsAt) : null;
  if (moved && moved.getTime() !== cur.startsAt.getTime()) {
    set.startsAt = moved;
    set.endsAt = new Date(moved.getTime() + (cur.endsAt.getTime() - cur.startsAt.getTime()));
    void type;
  }
  const [row] = await ctx.db.update(classSessions).set(set).where(eq(classSessions.id, id)).returning();
  if (set.startsAt) await notifyBooked(ctx, merchant, row!, "moved");
  if (body.capacity !== undefined) await promoteWaitlist(ctx, id);
  const s = await getSettings(ctx.db, merchant.id);
  return (await sessionDtos(ctx, [row!], { windowHours: s.cancelWindowHours }))[0]!;
}

/** Cancel a class: everyone booked gets their credit back (a drop-in is refunded), waiting people are released, all are told. */
export async function cancelSession(ctx: AppContext, merchant: Merchant, id: string, reason?: string): Promise<classesApi.ClassSessionDto> {
  const cur = await loadSession(ctx.db, merchant.id, id);
  if (cur.status === "cancelled") throw conflict("This class is already cancelled");
  const now = ctx.now();
  const [row] = await ctx.db.update(classSessions).set({ status: "cancelled", cancelledAt: now, cancelReason: reason ?? null, updatedAt: now }).where(eq(classSessions.id, id)).returning();
  const live = await ctx.db.select().from(classBookings).where(and(eq(classBookings.sessionId, id), inArray(classBookings.status, ["held", "booked", "waitlisted"])));
  for (const b of live) {
    await ctx.db.update(classBookings).set({ status: "cancelled", cancelledAt: now, creditReturned: b.status === "booked", holdExpiresAt: null, updatedAt: now }).where(eq(classBookings.id, b.id));
    if (b.status === "booked") await returnCredit(ctx, merchant, b);
    await notifyOne(ctx, merchant, row!, b.userId, "cancelledByStudio", { refund: b.payWith === "drop_in" ? "Your payment is refunded." : b.payWith === "pass" ? "Your class credit is back on your pass." : "" });
  }
  const s = await getSettings(ctx.db, merchant.id);
  return (await sessionDtos(ctx, [row!], { windowHours: s.cancelWindowHours }))[0]!;
}

// ---------------------------------------------------------------------------
// Notifications (customer language)
// ---------------------------------------------------------------------------
async function localeOf(ctx: AppContext, userId: string): Promise<Locale> {
  const [u] = await ctx.db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return normalizeLocale(u?.locale) ?? "en";
}
export function whenText(at: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALES[locale].bcp47, { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
}
export async function notify(ctx: AppContext, merchant: Pick<Merchant, "id" | "name" | "slug">, userId: string, key: string, params: Record<string, string | number>, data: Record<string, unknown>, opts: { sms?: boolean } = {}): Promise<void> {
  const locale = await localeOf(ctx, userId);
  const t = translator(locale);
  const body = t(`cl.msg.${key}` as never, { shop: merchant.name, ...params } as never);
  await notifyCustomer(ctx, { userId, merchantId: merchant.id, title: t(`cl.msg.${key}Title` as never, { shop: merchant.name, ...params } as never), body, sms: opts.sms ?? false, data: { ...data, link: `${ctx.config.publicWebUrl}/me/classes` } });
}
async function notifyOne(ctx: AppContext, merchant: Merchant, s: Session, userId: string, key: string, extra: Record<string, string | number> = {}, opts: { sms?: boolean } = {}): Promise<void> {
  const locale = await localeOf(ctx, userId);
  const st = await getSettings(ctx.db, merchant.id);
  await notify(ctx, merchant, userId, key, { name: s.name, when: whenText(s.startsAt, merchant.timezone, locale), until: whenText(freeCancelUntil(s, st.cancelWindowHours), merchant.timezone, locale), ...extra }, { type: `class_${key}`, sessionId: s.id }, opts);
}
async function notifyBooked(ctx: AppContext, merchant: Merchant, s: Session, key: "moved"): Promise<void> {
  const rows = await ctx.db.select({ userId: classBookings.userId }).from(classBookings).where(and(eq(classBookings.sessionId, s.id), inArray(classBookings.status, ["booked", "waitlisted"])));
  for (const r of rows) await notifyOne(ctx, merchant, s, r.userId, key);
}

// ---------------------------------------------------------------------------
// Credits: what pays for a class
// ---------------------------------------------------------------------------
const localDate = (at: Date, tz: string) => localParts(at, tz).date;

/** Add whole months to a local day, clamping to the month's last day ("2026-01-31" + 1 = "2026-02-28"). */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Start and end (inclusive) of the billing month a class day falls in, counted from the membership's current period. */
export function periodBucket(m: Pick<Membership, "currentPeriodStart">, date: string): { start: string; end: string } | null {
  if (!m.currentPeriodStart) return null;
  let k = 0;
  while (k < 12) {
    const start = addMonths(m.currentPeriodStart, k);
    const next = addMonths(m.currentPeriodStart, k + 1);
    if (date < next) return { start, end: addDays(next, -1) };
    k++;
  }
  return null;
}

/** Does this membership pay for a class on `date`? Returns why not, for the desk and the customer. */
export function membershipCovers(m: Membership, date: string): { ok: true } | { ok: false; reason: "inactive" | "outside" | "past_due" | "frozen" | "ended" } {
  if (m.status === "past_due") return { ok: false, reason: "past_due" };
  if (m.status === "frozen") return { ok: false, reason: "frozen" };
  if (m.status !== "active") return { ok: false, reason: "inactive" };
  if (!m.currentPeriodStart || !m.currentPeriodEnd) return { ok: false, reason: "inactive" };
  if (date < m.currentPeriodStart) return { ok: false, reason: "outside" };
  if (m.cancelEffectiveOn && date >= m.cancelEffectiveOn) return { ok: false, reason: "ended" };
  // A class up to two weeks past the paid period is covered: the next payment is due before it.
  if (date > addDays(m.currentPeriodEnd, 14)) return { ok: false, reason: "outside" };
  // Past a fixed term's end the membership only covers a class when it will renew (a notice was sent and the member did not decline).
  if (m.termEndsOn && date > m.termEndsOn && (m.declineRenewal || !m.renewalNoticeSentAt)) return { ok: false, reason: "ended" };
  return { ok: true };
}

async function usedInBucket(db: DbOrTx, m: Membership, bucket: { start: string; end: string }, tz: string): Promise<number> {
  const startAt = zonedToUtc(bucket.start, 0, tz);
  const endAt = zonedToUtc(addDays(bucket.end, 1), 0, tz);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(classBookings)
    .innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId))
    .where(and(eq(classBookings.membershipId, m.id), inArray(classBookings.status, ["held", "booked", "attended", "late_cancelled", "no_show"]), gte(classSessions.startsAt, startAt), lt(classSessions.startsAt, endAt)));
  return Number(r?.n ?? 0);
}

export interface CreditChoice {
  payWith: "membership" | "pass";
  membershipId: string | null;
  passId: string | null;
  label: string;
}
export type CreditProblem = "none" | "past_due" | "frozen" | "month_used";

/**
 * Pick what pays for this class (without using it). A membership that is past due or frozen is reported so the desk
 * and the app can say why, instead of silently falling back.
 */
export async function chooseCredit(ctx: AppContext, merchant: Merchant, userId: string, s: Pick<Session, "startsAt">): Promise<{ choice: CreditChoice | null; problem: CreditProblem; amountDueCents: number | null }> {
  const date = localDate(s.startsAt, merchant.timezone);
  let problem: CreditProblem = "none";
  let amountDueCents: number | null = null;
  const ms = await ctx.db.select().from(classMemberships).where(and(eq(classMemberships.userId, userId), eq(classMemberships.merchantId, merchant.id), inArray(classMemberships.status, ["active", "past_due", "frozen"]))).orderBy(asc(classMemberships.createdAt));
  for (const m of ms) {
    const c = membershipCovers(m, date);
    if (!c.ok) {
      if (c.reason === "past_due") {
        problem = "past_due";
        const [due] = await ctx.db.select({ a: classCharges.amountCents }).from(classCharges).where(and(eq(classCharges.membershipId, m.id), eq(classCharges.status, "failed"))).orderBy(desc(classCharges.createdAt)).limit(1);
        amountDueCents = due?.a ?? null;
      } else if (c.reason === "frozen") problem = "frozen";
      continue;
    }
    if (m.classesPerMonth) {
      const bucket = periodBucket(m, date);
      if (!bucket || (await usedInBucket(ctx.db, m, bucket, merchant.timezone)) >= m.classesPerMonth) {
        problem = "month_used";
        continue;
      }
    }
    return { choice: { payWith: "membership", membershipId: m.id, passId: null, label: m.name }, problem: "none", amountDueCents: null };
  }
  const [p] = await ctx.db
    .select()
    .from(classPasses)
    .where(and(eq(classPasses.userId, userId), eq(classPasses.merchantId, merchant.id), eq(classPasses.status, "active"), gt(classPasses.creditsLeft, 0), gte(classPasses.expiresAt, s.startsAt)))
    .orderBy(asc(classPasses.expiresAt), asc(classPasses.createdAt))
    .limit(1);
  if (p) return { choice: { payWith: "pass", membershipId: null, passId: p.id, label: p.name }, problem: "none", amountDueCents: null };
  return { choice: null, problem, amountDueCents };
}

/** Use one credit atomically. Returns false when the pass ran out in the meantime. */
async function useCredit(db: DbOrTx, choice: CreditChoice, now: Date): Promise<boolean> {
  if (choice.payWith === "membership") return true;
  const [p] = await db
    .update(classPasses)
    .set({ creditsLeft: sql`${classPasses.creditsLeft} - 1`, status: sql`case when ${classPasses.creditsLeft} - 1 <= 0 then 'used_up' else ${classPasses.status} end`, updatedAt: now })
    .where(and(eq(classPasses.id, choice.passId!), gt(classPasses.creditsLeft, 0)))
    .returning({ id: classPasses.id });
  return !!p;
}

/** Hand a credit back: a pass gets its class again, a drop-in is refunded. A membership has nothing to return. */
export async function returnCredit(ctx: AppContext, merchant: Merchant, b: Pick<Booking, "id" | "payWith" | "passId" | "membershipId">): Promise<void> {
  if (b.payWith === "pass" && b.passId) {
    await ctx.db
      .update(classPasses)
      .set({ creditsLeft: sql`${classPasses.creditsLeft} + 1`, status: sql`case when ${classPasses.status} = 'used_up' then 'active' else ${classPasses.status} end`, updatedAt: ctx.now() })
      .where(eq(classPasses.id, b.passId));
  } else if (b.payWith === "drop_in") {
    await refundCharge(ctx, merchant, { bookingId: b.id, kind: "drop_in" });
  }
}

/** Refund the paid charge of a kind for a booking (idempotent: a refunded charge is not refunded twice). */
export async function refundCharge(ctx: AppContext, merchant: Merchant, where: { bookingId?: string; chargeId?: string; kind: string }): Promise<number> {
  const rows = await ctx.db
    .select()
    .from(classCharges)
    .where(and(eq(classCharges.merchantId, merchant.id), eq(classCharges.kind, where.kind), eq(classCharges.status, "paid"), where.bookingId ? eq(classCharges.bookingId, where.bookingId) : undefined, where.chargeId ? eq(classCharges.id, where.chargeId) : undefined));
  let refunded = 0;
  for (const c of rows) {
    if (c.stripePaymentIntentId) {
      try {
        await refundConnectPayment(ctx, merchant, { paymentIntentId: c.stripePaymentIntentId, idempotencyKey: `class_charge:${c.id}:refund`, reason: "requested_by_customer" });
      } catch (err) {
        if (ctx.config.env !== "test") console.error("[classes] refund failed", err);
        continue;
      }
    }
    await ctx.db.update(classCharges).set({ status: "refunded", refundedAt: ctx.now() }).where(eq(classCharges.id, c.id));
    refunded += c.amountCents;
  }
  return refunded;
}

// ---------------------------------------------------------------------------
// Charges (shared with class-memberships.ts)
// ---------------------------------------------------------------------------
export async function taxFor(ctx: AppContext, merchant: Merchant, subtotalCents: number, taxable: boolean): Promise<number> {
  // Tax only for a studio that says it is registered for GST/HST (a customer agreed to a price, so an unset status adds none).
  if (merchant.taxRegistered !== true || !taxable) return 0;
  const bps = salesTaxBps({ province: await merchantProvince(ctx.db, merchant), taxRegistered: true });
  return Math.round((subtotalCents * bps) / 10_000);
}
export async function taxLabel(ctx: AppContext, merchant: Merchant): Promise<classesApi.TaxCopyDto> {
  return salesTaxCopy({ province: await merchantProvince(ctx.db, merchant), taxRegistered: merchant.taxRegistered });
}

/** A Stripe customer for this person at this studio (on the connected account for direct charges). */
export async function ensurePayerCustomer(ctx: AppContext, merchant: Merchant, userId: string, existing?: string | null): Promise<string> {
  if (existing) return existing;
  const [other] = await ctx.db.select({ id: classMemberships.stripeCustomerId }).from(classMemberships).where(and(eq(classMemberships.userId, userId), eq(classMemberships.merchantId, merchant.id), sql`${classMemberships.stripeCustomerId} is not null`)).limit(1);
  if (other?.id) return other.id;
  const [u] = await ctx.db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const direct = chargeModeFor(ctx, merchant) === "direct";
  return (await getPayments(ctx).createPayerCustomer({ userId, merchantId: merchant.id, email: u?.email, name: u?.name, connectedAccountId: direct ? merchant.stripeAccountId : null })).customerId;
}

/** Start a customer payment for a charge row: a PaymentIntent that keeps the card for renewals and late fees. */
export async function startPayment(ctx: AppContext, merchant: Merchant, charge: Charge, customerId: string, description: string, attempt = 0): Promise<classesApi.PaymentRefDto> {
  const pi = await createConnectPayment(ctx, merchant, {
    amountCents: charge.amountCents,
    connectedAccountId: merchant.stripeAccountId!,
    applicationFeeCents: charge.platformFeeCents,
    description,
    metadata: { ll_kind: "class", ll_id: charge.id, merchant_id: merchant.id },
    idempotencyKey: `class:${charge.id}:pi${attempt ? `:${attempt}` : ""}${chargeModeFor(ctx, merchant) === "direct" ? ":direct" : ""}`,
    customerId,
    setupFutureUsage: "off_session",
  });
  await ctx.db.update(classCharges).set({ stripePaymentIntentId: pi.id, status: "pending" }).where(eq(classCharges.id, charge.id));
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
}

export async function newCharge(ctx: AppContext, merchant: Merchant, userId: string, v: { kind: "pack" | "drop_in" | "late_fee" | "membership"; subtotalCents: number; taxable: boolean; membershipId?: string; passId?: string; bookingId?: string; periodStart?: string; periodEnd?: string; manual?: string }): Promise<Charge> {
  const tax = v.kind === "late_fee" ? 0 : await taxFor(ctx, merchant, v.subtotalCents, v.taxable);
  const manual = !!v.manual;
  const [c] = await ctx.db
    .insert(classCharges)
    .values({
      merchantId: merchant.id,
      userId,
      kind: v.kind,
      membershipId: v.membershipId ?? null,
      passId: v.passId ?? null,
      bookingId: v.bookingId ?? null,
      periodStart: v.periodStart ?? null,
      periodEnd: v.periodEnd ?? null,
      amountCents: v.subtotalCents + tax,
      taxCents: tax,
      // The platform fee is a share of the sale before tax; a payment recorded by hand at the desk carries none.
      platformFeeCents: platformFeeFor(manual ? "manual" : "class", v.subtotalCents, merchant),
      ...(manual ? { status: "paid", paidAt: ctx.now(), paymentMethod: v.manual } : {}),
      createdAt: ctx.now(),
    })
    .returning();
  return c!;
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
async function expireHoldsFor(ctx: AppContext, sessionId?: string): Promise<number> {
  const now = ctx.now();
  const rows = await ctx.db
    .update(classBookings)
    .set({ status: "cancelled", cancelledAt: now, holdExpiresAt: null, updatedAt: now })
    .where(and(eq(classBookings.status, "held"), lte(classBookings.holdExpiresAt, now), sessionId ? eq(classBookings.sessionId, sessionId) : undefined))
    .returning({ id: classBookings.id, sessionId: classBookings.sessionId });
  for (const r of rows) if (r.sessionId) await promoteWaitlist(ctx, r.sessionId).catch(() => undefined);
  return rows.length;
}
/** Job: a drop-in that never got paid within 10 minutes frees its spot. */
export const expireDropInHolds = (ctx: AppContext) => expireHoldsFor(ctx);

async function takenSpots(db: DbOrTx, sessionId: string, now: Date): Promise<number> {
  return (await countsFor(db, [sessionId], now)).get(sessionId)?.booked ?? 0;
}

interface BookInput {
  userId: string;
  merchant: Merchant;
  session: Session;
  source: "customer" | "staff";
  use: "auto" | "drop_in" | "comp";
  waitlist: boolean;
  overCapacity?: boolean;
}
interface BookResult {
  booking: Booking;
  outcome: "booked" | "needs_payment" | "waitlisted";
  payment: classesApi.PaymentRefDto | null;
}

async function bookCore(ctx: AppContext, b: BookInput): Promise<BookResult> {
  const { merchant, session: s, userId } = b;
  const now = ctx.now();
  if (s.status !== "scheduled") throw conflict("This class was cancelled");
  if (s.startsAt.getTime() <= now.getTime() && b.source === "customer") throw conflict("This class has started");
  if (s.endsAt.getTime() <= now.getTime()) throw conflict("This class is over");
  await expireHoldsFor(ctx, s.id);
  const st = await getSettings(ctx.db, merchant.id);

  // Drop-in: needs a drop-in offer and card payments, decided before the lock so a failure leaves nothing behind.
  const dropIn = b.use === "drop_in" ? await dropInProduct(ctx, merchant) : null;
  if (b.use === "drop_in" && !dropIn) throw conflict("This studio does not sell drop-ins");
  if (dropIn && !(await paymentsReady(ctx.db, merchant))) throw conflict("This studio can't take card payments yet");

  const result = await ctx.db.transaction(async (tx): Promise<{ row: Booking; outcome: BookResult["outcome"]; charge: Charge | null }> => {
    // Everything in here must run on the transaction's connection (a second connection would wait for this one to finish).
    const tctx = { ...ctx, db: tx } as unknown as AppContext;
    await tx.select({ id: classSessions.id }).from(classSessions).where(eq(classSessions.id, s.id)).for("update");
    const [dup] = await tx.select().from(classBookings).where(and(eq(classBookings.sessionId, s.id), eq(classBookings.userId, userId), inArray(classBookings.status, ["held", "booked", "waitlisted", "attended"]))).limit(1);
    if (dup) throw conflict(dup.status === "waitlisted" ? "You are already on the waitlist for this class" : "You are already booked into this class");
    if (b.use === "auto") {
      const [open] = await tx.select({ n: sql<number>`count(*)::int` }).from(classBookings).where(and(eq(classBookings.userId, userId), eq(classBookings.status, "held"), gt(classBookings.holdExpiresAt, now)));
      if (Number(open?.n ?? 0) >= MAX_OPEN_HOLDS) throw conflict("Finish or wait out your open bookings first");
    }
    const taken = await takenSpots(tx, s.id, now);
    const full = taken >= s.capacity && !b.overCapacity;
    if (full) {
      if (!b.waitlist) throw conflict("This class is full");
      const [w] = await tx.insert(classBookings).values({ merchantId: merchant.id, sessionId: s.id, userId, status: "waitlisted", source: b.source, waitlistedAt: now, createdAt: now, updatedAt: now }).returning();
      return { row: w!, outcome: "waitlisted", charge: null };
    }
    if (b.use === "comp") {
      const [r] = await tx.insert(classBookings).values({ merchantId: merchant.id, sessionId: s.id, userId, status: "booked", source: b.source, payWith: "comp", createdAt: now, updatedAt: now }).returning();
      return { row: r!, outcome: "booked", charge: null };
    }
    if (b.use === "auto") {
      const { choice, problem, amountDueCents } = await chooseCredit(tctx, merchant, userId, s);
      if (choice) {
        if (!(await useCredit(tx, choice, now))) throw conflict("That pass has no classes left");
        const [r] = await tx.insert(classBookings).values({ merchantId: merchant.id, sessionId: s.id, userId, status: "booked", source: b.source, payWith: choice.payWith, passId: choice.passId, membershipId: choice.membershipId, createdAt: now, updatedAt: now }).returning();
        return { row: r!, outcome: "booked", charge: null };
      }
      if (problem === "past_due") throw new HttpError(409, "membership_past_due", `Your membership payment${amountDueCents ? ` of ${money(amountDueCents)}` : ""} did not go through. Update your card to keep booking.`);
      if (problem === "frozen") throw new HttpError(409, "membership_frozen", "Your membership is frozen on that day.");
      if (problem === "month_used") throw new HttpError(409, "month_used", "You have used every class in this month of your membership.");
      throw new HttpError(409, "no_pass", "You need a membership, a pass or a drop-in to book this class.");
    }
    // Drop-in: hold the spot while the card payment is confirmed.
    const [r] = await tx.insert(classBookings).values({ merchantId: merchant.id, sessionId: s.id, userId, status: "held", source: b.source, payWith: "drop_in", holdExpiresAt: new Date(now.getTime() + classesApi.DROP_IN_HOLD_MINUTES * MIN), createdAt: now, updatedAt: now }).returning();
    const charge = await newCharge(tctx, merchant, userId, { kind: "drop_in", subtotalCents: dropIn!.priceCents, taxable: dropIn!.taxable, bookingId: r!.id });
    return { row: r!, outcome: "needs_payment", charge };
  });

  let payment: classesApi.PaymentRefDto | null = null;
  if (result.charge) {
    try {
      const customerId = await ensurePayerCustomer(ctx, merchant, userId);
      payment = await startPayment(ctx, merchant, result.charge, customerId, `${merchant.name} drop-in: ${s.name}`);
    } catch (err) {
      // The provider refused: do not leave the spot held (it would block a retry and count as an open booking).
      await ctx.db.update(classBookings).set({ status: "cancelled", cancelledAt: now, holdExpiresAt: null, updatedAt: now }).where(eq(classBookings.id, result.row.id));
      throw err;
    }
  }
  const [fresh] = await ctx.db.select().from(classBookings).where(eq(classBookings.id, result.row.id)).limit(1);
  const dto = fresh!;
  if (result.outcome === "booked") await notifyOne(ctx, merchant, s, userId, "booked");
  if (result.outcome === "waitlisted") {
    const n = await waitlistPosition(ctx.db, dto);
    await notifyOne(ctx, merchant, s, userId, "waitlisted", { n });
  }
  void st;
  return { booking: dto, outcome: result.outcome, payment };
}

async function dropInProduct(ctx: AppContext, merchant: Merchant): Promise<Product | null> {
  const [p] = await ctx.db.select().from(classProducts).where(and(eq(classProducts.merchantId, merchant.id), eq(classProducts.kind, "drop_in"), eq(classProducts.active, true))).orderBy(asc(classProducts.sort), asc(classProducts.priceCents)).limit(1);
  return p ?? null;
}

/** First person on the list who has something to use gets each open spot. Safe to call any time; does nothing when nothing is open. */
export async function promoteWaitlist(ctx: AppContext, sessionId: string): Promise<number> {
  const [s] = await ctx.db.select().from(classSessions).where(eq(classSessions.id, sessionId)).limit(1);
  if (!s || s.status !== "scheduled") return 0;
  const merchant = await loadMerchant(ctx.db, s.merchantId);
  if (!merchant) return 0;
  const st = await getSettings(ctx.db, merchant.id);
  const now = ctx.now();
  if (s.startsAt.getTime() - now.getTime() < st.waitlistCutoffMinutes * MIN) return 0;
  let promoted = 0;
  const skipped = new Set<string>();
  for (let guard = 0; guard < 50; guard++) {
    const done = await ctx.db.transaction(async (tx): Promise<{ stop: boolean; booking?: Booking }> => {
      const tctx = { ...ctx, db: tx } as unknown as AppContext;
      await tx.select({ id: classSessions.id }).from(classSessions).where(eq(classSessions.id, s.id)).for("update");
      if ((await takenSpots(tx, s.id, now)) >= s.capacity) return { stop: true };
      const waiting = await tx.select().from(classBookings).where(and(eq(classBookings.sessionId, s.id), eq(classBookings.status, "waitlisted"))).orderBy(asc(classBookings.waitlistedAt), asc(classBookings.id));
      for (const w of waiting) {
        if (skipped.has(w.id)) continue;
        const { choice } = await chooseCredit(tctx, merchant, w.userId, s);
        if (!choice || !(await useCredit(tx, choice, now))) {
          skipped.add(w.id);
          continue;
        }
        const [r] = await tx.update(classBookings).set({ status: "booked", payWith: choice.payWith, passId: choice.passId, membershipId: choice.membershipId, promotedAt: now, updatedAt: now }).where(eq(classBookings.id, w.id)).returning();
        return { stop: false, booking: r! };
      }
      return { stop: true };
    });
    if (done.booking) {
      promoted++;
      // A spot you were waiting for is worth a text.
      await notifyOne(ctx, merchant, s, done.booking.userId, "promoted", {}, { sms: true });
    }
    if (done.stop) break;
  }
  return promoted;
}

export async function bookMine(ctx: AppContext, userId: string, body: z.output<typeof classesApi.bookClassBody>): Promise<classesApi.BookClassResponse> {
  const [s] = await ctx.db.select().from(classSessions).where(eq(classSessions.id, body.sessionId)).limit(1);
  if (!s) throw notFound("Class");
  const merchant = await loadMerchant(ctx.db, s.merchantId);
  if (!merchant || merchant.status === "closed") throw notFound("Studio");
  await requireFeature(ctx.db, merchant, "booking.classes");
  const r = await bookCore(ctx, { userId, merchant, session: s, source: "customer", use: body.use, waitlist: body.waitlist });
  return { booking: (await myBookingDtos(ctx, [r.booking]))[0]!, payment: r.payment, outcome: r.outcome };
}

async function getMyBooking(ctx: AppContext, userId: string, id: string): Promise<Booking> {
  const [b] = await ctx.db.select().from(classBookings).where(and(eq(classBookings.id, id), eq(classBookings.userId, userId))).limit(1);
  if (!b) throw notFound("Booking");
  return b;
}

/** The cancel rule in one place, for the customer and for staff. */
async function cancelCore(ctx: AppContext, merchant: Merchant, b: Booking, s: Session, opts: { forceFree?: boolean }): Promise<{ late: boolean; creditReturned: boolean; feeChargedCents: number }> {
  const now = ctx.now();
  const st = await getSettings(ctx.db, merchant.id);
  if (b.status === "waitlisted" || b.status === "held") {
    await ctx.db.update(classBookings).set({ status: "cancelled", cancelledAt: now, holdExpiresAt: null, updatedAt: now }).where(and(eq(classBookings.id, b.id), eq(classBookings.status, b.status)));
    return { late: false, creditReturned: false, feeChargedCents: 0 };
  }
  const late = !opts.forceFree && s.startsAt.getTime() > now.getTime() && now.getTime() > freeCancelUntil(s, st.cancelWindowHours).getTime();
  const [row] = await ctx.db
    .update(classBookings)
    .set({ status: late ? "late_cancelled" : "cancelled", cancelledAt: now, creditReturned: !late, updatedAt: now })
    .where(and(eq(classBookings.id, b.id), eq(classBookings.status, "booked")))
    .returning();
  if (!row) throw conflict("This booking was just updated. Refresh and try again.");
  let fee = 0;
  if (late) fee = await chargeLateFee(ctx, merchant, row, s, st);
  else await returnCredit(ctx, merchant, row);
  await promoteWaitlist(ctx, s.id).catch(() => undefined);
  return { late, creditReturned: !late, feeChargedCents: fee };
}

export async function cancelMine(ctx: AppContext, userId: string, id: string): Promise<classesApi.CancelBookingResponse> {
  const b = await getMyBooking(ctx, userId, id);
  if (!["booked", "waitlisted", "held"].includes(b.status)) throw conflict(`This booking is ${b.status.replace("_", " ")}`);
  const [s] = await ctx.db.select().from(classSessions).where(eq(classSessions.id, b.sessionId)).limit(1);
  const merchant = (await loadMerchant(ctx.db, b.merchantId))!;
  const r = await cancelCore(ctx, merchant, b, s!, {});
  const [fresh] = await ctx.db.select().from(classBookings).where(eq(classBookings.id, b.id)).limit(1);
  return { booking: (await myBookingDtos(ctx, [fresh!]))[0]!, creditReturned: r.creditReturned, late: r.late, feeChargedCents: r.feeChargedCents };
}

/**
 * The late fee: only for a member with a saved card (an unlimited member loses nothing else by skipping), only when
 * the studio set one, and never twice for one booking (the provider key repeats the same charge on a race).
 */
export async function chargeLateFee(ctx: AppContext, merchant: Merchant, b: Booking, s: Session, st: classesApi.ClassSettingsDto): Promise<number> {
  if (st.lateFeeCents < MIN_CHARGE_CENTS || b.payWith !== "membership" || !b.membershipId || b.feeChargedAt) return 0;
  const [m] = await ctx.db.select().from(classMemberships).where(eq(classMemberships.id, b.membershipId)).limit(1);
  if (!m?.paymentMethodId || !m.stripeCustomerId || !merchant.stripeAccountId) return 0;
  const charge = await newCharge(ctx, merchant, b.userId, { kind: "late_fee", subtotalCents: st.lateFeeCents, taxable: false, bookingId: b.id, membershipId: m.id });
  const r = await chargeConnectSavedMethod(ctx, merchant, {
    amountCents: charge.amountCents,
    connectedAccountId: merchant.stripeAccountId,
    applicationFeeCents: charge.platformFeeCents,
    description: `${merchant.name} late cancel: ${s.name}`,
    metadata: { ll_kind: "class", ll_id: charge.id, merchant_id: merchant.id },
    idempotencyKey: `class_fee:${b.id}`,
    customerId: m.stripeCustomerId,
    paymentMethodId: m.paymentMethodId,
  });
  await ctx.db.update(classCharges).set({ stripePaymentIntentId: r.intent.id, status: r.outcome === "succeeded" ? "paid" : r.outcome === "processing" ? "processing" : "failed", ...(r.outcome === "succeeded" ? { paidAt: ctx.now(), paymentMethod: "card" } : {}) }).where(eq(classCharges.id, charge.id));
  if (r.outcome !== "succeeded" && r.outcome !== "processing") return 0;
  await ctx.db.update(classBookings).set({ feeChargedAt: ctx.now() }).where(eq(classBookings.id, b.id));
  await notifyOne(ctx, merchant, s, b.userId, "lateFee", { fee: money(charge.amountCents) });
  return charge.amountCents;
}

// ---------------------------------------------------------------------------
// DTOs for the customer
// ---------------------------------------------------------------------------
export async function myBookingDtos(ctx: AppContext, rows: Booking[]): Promise<classesApi.MyBookingDto[]> {
  if (!rows.length) return [];
  const sessions = await ctx.db.select().from(classSessions).where(inArray(classSessions.id, [...new Set(rows.map((r) => r.sessionId))]));
  const ms = await ctx.db.select().from(merchants).where(inArray(merchants.id, [...new Set(rows.map((r) => r.merchantId))]));
  const locs = await ctx.db.select().from(locations).where(inArray(locations.id, [...new Set(sessions.map((x) => x.locationId))]));
  const out: classesApi.MyBookingDto[] = [];
  for (const b of rows) {
    const s = sessions.find((x) => x.id === b.sessionId)!;
    const m = ms.find((x) => x.id === b.merchantId)!;
    const st = await getSettings(ctx.db, m.id);
    const dto = (await sessionDtos(ctx, [s], { windowHours: st.cancelWindowHours }))[0]!;
    out.push({
      id: b.id,
      status: b.status as classesApi.ClassBookingStatus,
      payWith: (b.payWith as classesApi.PayWith | null) ?? null,
      waitlistPosition: b.status === "waitlisted" ? await waitlistPosition(ctx.db, b) : null,
      holdExpiresAt: iso(b.holdExpiresAt),
      freeCancelUntil: freeCancelUntil(s, st.cancelWindowHours).toISOString(),
      lateFeeCents: st.lateFeeCents,
      session: dto,
      merchant: { id: m.id, name: m.name, slug: m.slug, address: locs.find((l) => l.id === s.locationId)?.address ?? null, timezone: m.timezone },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public page
// ---------------------------------------------------------------------------
export async function productDto(p: Product, extra: { activeCount?: number; soldLast30?: number } = {}): Promise<classesApi.ProductDto> {
  return { id: p.id, kind: p.kind as classesApi.ClassProductKind, name: p.name, description: p.description, priceCents: p.priceCents, credits: p.credits, validDays: p.validDays, introOnly: p.introOnly, termMonths: p.termMonths, classesPerMonth: p.classesPerMonth, taxable: p.taxable, active: p.active, sort: p.sort, ...extra };
}

export async function publicClasses(ctx: AppContext, merchant: Merchant, q: z.output<typeof classesApi.publicClassesQuery>, userId?: string): Promise<classesApi.PublicClassesResponse> {
  await requireFeature(ctx.db, merchant, "booking.classes");
  const [loc] = await ctx.db.select().from(locations).where(eq(locations.merchantId, merchant.id)).orderBy(asc(locations.createdAt)).limit(1);
  const from = q.from ? new Date(q.from) : ctx.now();
  const to = q.to ? new Date(q.to) : new Date(ctx.now().getTime() + 14 * 24 * HOUR);
  const rows = await ctx.db
    .select()
    .from(classSessions)
    .where(and(eq(classSessions.merchantId, merchant.id), eq(classSessions.status, "scheduled"), gte(classSessions.endsAt, from), lte(classSessions.startsAt, to)))
    .orderBy(asc(classSessions.startsAt), asc(classSessions.id))
    .limit(300);
  const st = await getSettings(ctx.db, merchant.id);
  const sessions = await sessionDtos(ctx, rows, { userId, windowHours: st.cancelWindowHours });
  const memberships = merchantHasMemberships(await enabledMemberships(ctx, merchant));
  const prods = await ctx.db.select().from(classProducts).where(and(eq(classProducts.merchantId, merchant.id), eq(classProducts.active, true))).orderBy(asc(classProducts.sort), asc(classProducts.priceCents));
  const intro = userId ? await introEligible(ctx, userId, merchant.id) : true;
  const products = await Promise.all(prods.filter((p) => (p.kind !== "membership" || memberships) && (!p.introOnly || intro)).map((p) => productDto(p)));
  return {
    shop: { id: merchant.id, name: merchant.name, slug: merchant.slug, address: loc?.address ?? null, phone: merchant.phone ?? loc?.phone ?? null, timezone: merchant.timezone, brandColor: merchant.brandColor, logoUrl: merchant.logoUrl },
    policy: { cancelWindowHours: st.cancelWindowHours, lateFeeCents: st.lateFeeCents, waitlistCutoffMinutes: st.waitlistCutoffMinutes, termsNote: st.termsNote },
    sessions,
    products,
    tax: await taxLabel(ctx, merchant),
    hasWomenOnly: sessions.some((x) => x.womenOnly),
  };
}
async function enabledMemberships(ctx: AppContext, merchant: Merchant): Promise<boolean> {
  return (await getMerchantFeatures(ctx.db, merchant))["memberships.recurring"].enabled;
}
const merchantHasMemberships = (b: boolean) => b;

/** An intro offer is for someone with no earlier pack or class at this studio. */
export async function introEligible(ctx: AppContext, userId: string, merchantId: string): Promise<boolean> {
  const [p] = await ctx.db.select({ id: classPasses.id }).from(classPasses).where(and(eq(classPasses.userId, userId), eq(classPasses.merchantId, merchantId), ne(classPasses.status, "pending"))).limit(1);
  if (p) return false;
  const [m] = await ctx.db.select({ id: classMemberships.id }).from(classMemberships).where(and(eq(classMemberships.userId, userId), eq(classMemberships.merchantId, merchantId), ne(classMemberships.status, "pending"))).limit(1);
  if (m) return false;
  const [b] = await ctx.db.select({ id: classBookings.id }).from(classBookings).where(and(eq(classBookings.userId, userId), eq(classBookings.merchantId, merchantId), inArray(classBookings.status, ["attended", "late_cancelled", "no_show"]))).limit(1);
  return !b;
}

// ---------------------------------------------------------------------------
// Staff: roster, booking, check-in, marking
// ---------------------------------------------------------------------------
async function resolveUser(ctx: AppContext, merchantId: string, ref: { phone?: string; memberCode?: string; memberId?: string; customerName?: string }, create: boolean): Promise<{ userId: string; memberId: string | null }> {
  if (ref.memberId) {
    const [m] = await ctx.db.select({ id: merchantMembers.id, userId: merchantMembers.userId }).from(merchantMembers).where(and(eq(merchantMembers.id, ref.memberId), eq(merchantMembers.merchantId, merchantId))).limit(1);
    if (!m) throw notFound("Member");
    return { userId: m.userId, memberId: m.id };
  }
  let userId: string | null = null;
  if (ref.memberCode) {
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.memberCode, parseMemberCode(ref.memberCode)), isNull(users.deletedAt))).limit(1);
    if (!u) throw notFound("Member code");
    userId = u.id;
  } else {
    const phone = normalizePhone(ref.phone ?? "");
    if (!phone) throw badRequest("Enter a valid phone number");
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (u) userId = u.id;
    else if (create) userId = (await findOrCreateCustomerByPhone(ctx.db, phone, ref.customerName ?? null)).user.id;
    else throw notFound("Member");
  }
  const [m] = await ctx.db.select({ id: merchantMembers.id }).from(merchantMembers).where(and(eq(merchantMembers.userId, userId), eq(merchantMembers.merchantId, merchantId))).limit(1);
  return { userId, memberId: m?.id ?? null };
}

async function payLabelFor(ctx: AppContext, b: Booking): Promise<string> {
  if (b.payWith === "membership" && b.membershipId) return (await ctx.db.select({ n: classMemberships.name }).from(classMemberships).where(eq(classMemberships.id, b.membershipId)).limit(1))[0]?.n ?? "Membership";
  if (b.payWith === "pass" && b.passId) {
    const [p] = await ctx.db.select().from(classPasses).where(eq(classPasses.id, b.passId)).limit(1);
    return p ? `${p.name}, ${p.creditsLeft} left` : "Pass";
  }
  if (b.payWith === "drop_in") return "Drop-in";
  if (b.payWith === "comp") return "Guest";
  return "Nothing used yet";
}

export async function roster(ctx: AppContext, merchant: Merchant, sessionId: string): Promise<classesApi.RosterResponse> {
  const s = await loadSession(ctx.db, merchant.id, sessionId);
  const st = await getSettings(ctx.db, merchant.id);
  const bs = await ctx.db
    .select({ b: classBookings, name: users.name, phone: users.phone })
    .from(classBookings)
    .innerJoin(users, eq(users.id, classBookings.userId))
    .where(and(eq(classBookings.sessionId, sessionId), inArray(classBookings.status, ["held", "booked", "waitlisted", "attended", "late_cancelled", "no_show"])))
    .orderBy(asc(classBookings.createdAt), asc(classBookings.id));
  const memberRows = bs.length ? await ctx.db.select({ id: merchantMembers.id, userId: merchantMembers.userId }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), inArray(merchantMembers.userId, bs.map((x) => x.b.userId)))) : [];
  const waiting = bs.filter((x) => x.b.status === "waitlisted").sort((a, c) => (a.b.waitlistedAt?.getTime() ?? 0) - (c.b.waitlistedAt?.getTime() ?? 0) || a.b.id.localeCompare(c.b.id));
  const rows: classesApi.RosterRowDto[] = [];
  // The waitlist reads in line order, after everyone holding a spot.
  for (const x of [...bs.filter((y) => y.b.status !== "waitlisted"), ...waiting]) {
    rows.push({
      bookingId: x.b.id,
      memberId: memberRows.find((m) => m.userId === x.b.userId)?.id ?? null,
      userId: x.b.userId,
      name: x.name,
      maskedPhone: maskedPhone(x.phone),
      status: x.b.status as classesApi.ClassBookingStatus,
      payWith: (x.b.payWith as classesApi.PayWith | null) ?? null,
      payLabel: await payLabelFor(ctx, x.b),
      waitlistPosition: x.b.status === "waitlisted" ? waiting.findIndex((w) => w.b.id === x.b.id) + 1 : null,
      checkedInAt: iso(x.b.checkedInAt),
      creditReturned: x.b.creditReturned,
    });
  }
  return { session: (await sessionDtos(ctx, [s], { windowHours: st.cancelWindowHours }))[0]!, policy: { cancelWindowHours: st.cancelWindowHours, lateFeeCents: st.lateFeeCents, freeCancelUntil: freeCancelUntil(s, st.cancelWindowHours).toISOString() }, rows };
}

export async function staffBook(ctx: AppContext, staff: StaffContext, sessionId: string, body: z.output<typeof classesApi.staffBookBody>): Promise<classesApi.RosterResponse> {
  const s = await loadSession(ctx.db, staff.merchant.id, sessionId);
  const who = await resolveUser(ctx, staff.merchant.id, body, true);
  await ensureStudioMember(ctx, staff.merchant, who.userId);
  await bookCore(ctx, { userId: who.userId, merchant: staff.merchant, session: s, source: "staff", use: body.comp ? "comp" : "auto", waitlist: false, overCapacity: body.overCapacity });
  return roster(ctx, staff.merchant, sessionId);
}

async function ensureStudioMember(ctx: AppContext, merchant: Merchant, userId: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    await ensureMember(ctx, tx, { merchantId: merchant.id, userId, joinedVia: "phone", locationId: null, consent: null, source: "staff_app" });
  });
}

export async function moveWaitlist(ctx: AppContext, merchant: Merchant, bookingId: string, position: number): Promise<classesApi.RosterResponse> {
  const [b] = await ctx.db.select().from(classBookings).where(and(eq(classBookings.id, bookingId), eq(classBookings.merchantId, merchant.id), eq(classBookings.status, "waitlisted"))).limit(1);
  if (!b) throw notFound("Waitlist entry");
  const others = await ctx.db.select().from(classBookings).where(and(eq(classBookings.sessionId, b.sessionId), eq(classBookings.status, "waitlisted"), ne(classBookings.id, b.id))).orderBy(asc(classBookings.waitlistedAt), asc(classBookings.id));
  const at = Math.min(Math.max(position, 1), others.length + 1);
  const before = others[at - 2]?.waitlistedAt ?? null;
  const after = others[at - 1]?.waitlistedAt ?? null;
  // Slot the time between the neighbours; the first place goes just before the current first.
  const t = after && before ? new Date((before.getTime() + after.getTime()) / 2) : after ? new Date(after.getTime() - 1000) : new Date((before?.getTime() ?? ctx.now().getTime()) + 1000);
  await ctx.db.update(classBookings).set({ waitlistedAt: t, updatedAt: ctx.now() }).where(eq(classBookings.id, b.id));
  await promoteWaitlist(ctx, b.sessionId);
  return roster(ctx, merchant, b.sessionId);
}

export async function markBooking(ctx: AppContext, merchant: Merchant, bookingId: string, status: "no_show" | "excused"): Promise<classesApi.RosterResponse> {
  const [b] = await ctx.db.select().from(classBookings).where(and(eq(classBookings.id, bookingId), eq(classBookings.merchantId, merchant.id))).limit(1);
  if (!b) throw notFound("Booking");
  const [s] = await ctx.db.select().from(classSessions).where(eq(classSessions.id, b.sessionId)).limit(1);
  const now = ctx.now();
  if (status === "no_show") {
    if (b.status !== "booked") throw conflict(`This booking is ${b.status.replace("_", " ")}`);
    const [row] = await ctx.db.update(classBookings).set({ status: "no_show", updatedAt: now }).where(and(eq(classBookings.id, b.id), eq(classBookings.status, "booked"))).returning();
    if (row) await chargeLateFee(ctx, merchant, row, s!, await getSettings(ctx.db, merchant.id));
  } else {
    if (b.status !== "late_cancelled" && b.status !== "no_show") throw conflict("Only a late cancel or a no-show can be excused");
    await ctx.db.update(classBookings).set({ status: "cancelled", creditReturned: true, updatedAt: now }).where(eq(classBookings.id, b.id));
    await returnCredit(ctx, merchant, b);
    if (b.feeChargedAt) await refundCharge(ctx, merchant, { bookingId: b.id, kind: "late_fee" });
    await promoteWaitlist(ctx, b.sessionId).catch(() => undefined);
  }
  return roster(ctx, merchant, b.sessionId);
}

/** The class a door scan means: the one open now or starting soonest in the next two hours (a late arrival still counts for 20 minutes after the start). */
async function doorSession(ctx: AppContext, merchantId: string, sessionId?: string, userId?: string): Promise<Session | null> {
  if (sessionId) return loadSession(ctx.db, merchantId, sessionId);
  const now = ctx.now();
  const rows = await ctx.db
    .select()
    .from(classSessions)
    .where(and(eq(classSessions.merchantId, merchantId), eq(classSessions.status, "scheduled"), gt(classSessions.endsAt, now), lte(classSessions.startsAt, new Date(now.getTime() + 2 * HOUR))))
    .orderBy(asc(classSessions.startsAt));
  if (!rows.length) return null;
  if (userId) {
    const mine = await ctx.db.select({ sessionId: classBookings.sessionId }).from(classBookings).where(and(eq(classBookings.userId, userId), inArray(classBookings.sessionId, rows.map((r) => r.id)), inArray(classBookings.status, ["booked", "attended"])));
    const hit = rows.find((r) => mine.some((m) => m.sessionId === r.id));
    if (hit) return hit;
  }
  return rows[0]!;
}

export async function door(ctx: AppContext, merchant: Merchant, sessionId?: string): Promise<classesApi.DoorResponse> {
  const s = await doorSession(ctx, merchant.id, sessionId);
  if (!s) return { session: null, arrivals: [] };
  const st = await getSettings(ctx.db, merchant.id);
  const rows = await ctx.db
    .select({ b: classBookings, name: users.name })
    .from(classBookings)
    .innerJoin(users, eq(users.id, classBookings.userId))
    .where(and(eq(classBookings.sessionId, s.id), eq(classBookings.status, "attended")))
    .orderBy(desc(classBookings.checkedInAt));
  const arrivals: classesApi.CheckInArrival[] = [];
  for (const r of rows.slice(0, 30)) arrivals.push({ bookingId: r.b.id, name: r.name, payLabel: await payLabelFor(ctx, r.b), at: (r.b.checkedInAt ?? r.b.updatedAt).toISOString() });
  return { session: (await sessionDtos(ctx, [s], { windowHours: st.cancelWindowHours }))[0]!, arrivals };
}

async function visitsThisMonth(ctx: AppContext, merchant: Merchant, userId: string): Promise<number> {
  const local = localParts(ctx.now(), merchant.timezone).date;
  const start = zonedToUtc(`${local.slice(0, 7)}-01`, 0, merchant.timezone);
  const [r] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(classBookings).where(and(eq(classBookings.merchantId, merchant.id), eq(classBookings.userId, userId), eq(classBookings.status, "attended"), gte(classBookings.checkedInAt, start)));
  return Number(r?.n ?? 0);
}

/** Mark a booking attended and award the visit through the loyalty ledger (once per booking). */
async function attend(ctx: AppContext, staff: StaffContext, b: Booking, s: Session): Promise<{ pointsEarned: number; balance: number | null }> {
  const now = ctx.now();
  await ctx.db.update(classBookings).set({ status: "attended", checkedInAt: now, updatedAt: now }).where(and(eq(classBookings.id, b.id), inArray(classBookings.status, ["booked", "attended"])));
  const st = await getSettings(ctx.db, staff.merchant.id);
  if (!st.awardOnCheckIn) return { pointsEarned: 0, balance: null };
  const [program] = await ctx.db.select({ earnType: loyaltyPrograms.earnType, active: loyaltyPrograms.active }).from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, staff.merchant.id)).limit(1);
  // A per-dollar program needs an amount; checking in earns on visit and stamp programs.
  if (!program?.active || program.earnType === "per_dollar") return { pointsEarned: 0, balance: null };
  try {
    const r = await awardPurchase(ctx, { merchantId: staff.merchant.id, merchant: staff.merchant, userId: b.userId, source: "staff_app", locationId: s.locationId, staffUserId: staff.user.id, idempotencyKey: `class:checkin:${b.id}`, ignoreCooldown: true, joinedVia: "phone" });
    return { pointsEarned: r.transaction?.points ?? 0, balance: r.member.balance };
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[classes] check-in award failed", err);
    return { pointsEarned: 0, balance: null };
  }
}

export async function checkInRow(ctx: AppContext, staff: StaffContext, bookingId: string): Promise<classesApi.RosterResponse> {
  const [b] = await ctx.db.select().from(classBookings).where(and(eq(classBookings.id, bookingId), eq(classBookings.merchantId, staff.merchant.id))).limit(1);
  if (!b) throw notFound("Booking");
  if (b.status !== "booked" && b.status !== "attended") throw conflict(`This booking is ${b.status.replace("_", " ")}`);
  const [s] = await ctx.db.select().from(classSessions).where(eq(classSessions.id, b.sessionId)).limit(1);
  if (b.status === "booked") await attend(ctx, staff, b, s!);
  return roster(ctx, staff.merchant, b.sessionId);
}

/** Door check-in: a scanned member card or a phone number. The outcome tells the desk exactly what to do next. */
export async function checkIn(ctx: AppContext, staff: StaffContext, body: z.output<typeof classesApi.checkInBody>): Promise<classesApi.CheckInResponse> {
  const merchant = staff.merchant;
  const who = await resolveUser(ctx, merchant.id, body, false);
  const [u] = await ctx.db.select({ name: users.name, phone: users.phone, memberCode: users.memberCode }).from(users).where(eq(users.id, who.userId)).limit(1);
  const member = { memberId: who.memberId ?? "", name: u?.name ?? null, maskedPhone: maskedPhone(u?.phone ?? null), memberCode: u?.memberCode ?? null };
  const s = await doorSession(ctx, merchant.id, body.sessionId, who.userId);
  const base = { member, pointsEarned: 0, balance: null as number | null, visitsThisMonth: null as number | null, amountDueCents: null as number | null, arrived: 0, booked: 0, pass: null as classesApi.CheckInResponse["pass"] };
  if (!s) return { ...base, outcome: "no_class", message: "There is no class open right now.", session: null };
  const st = await getSettings(ctx.db, merchant.id);
  const tally = async () => {
    const [r] = await ctx.db.select({ arrived: sql<number>`count(*) filter (where ${classBookings.status} = 'attended')::int`, booked: sql<number>`count(*) filter (where ${classBookings.status} in ('booked','attended'))::int` }).from(classBookings).where(eq(classBookings.sessionId, s.id));
    return { arrived: Number(r?.arrived ?? 0), booked: Number(r?.booked ?? 0) };
  };
  const dto = async () => (await sessionDtos(ctx, [s], { windowHours: st.cancelWindowHours }))[0]!;
  const passInfo = async (b: Booking | null): Promise<classesApi.CheckInResponse["pass"]> => {
    if (b?.payWith === "pass" && b.passId) {
      const [p] = await ctx.db.select().from(classPasses).where(eq(classPasses.id, b.passId)).limit(1);
      return p ? { label: p.name, creditsLeft: p.creditsLeft, renewsOn: null } : null;
    }
    if (b?.payWith === "membership" && b.membershipId) {
      const [m] = await ctx.db.select().from(classMemberships).where(eq(classMemberships.id, b.membershipId)).limit(1);
      return m ? { label: m.name, creditsLeft: null, renewsOn: m.nextBillingDate } : null;
    }
    return b ? { label: b.payWith === "drop_in" ? "Drop-in" : "Guest", creditsLeft: null, renewsOn: null } : null;
  };

  let [b] = await ctx.db.select().from(classBookings).where(and(eq(classBookings.sessionId, s.id), eq(classBookings.userId, who.userId), inArray(classBookings.status, ["held", "booked", "waitlisted", "attended"]))).limit(1);
  const done = async (outcome: classesApi.CheckInOutcome, message: string, extra: Partial<classesApi.CheckInResponse> = {}): Promise<classesApi.CheckInResponse> => {
    const t = await tally();
    return { ...base, ...t, outcome, message, session: await dto(), visitsThisMonth: await visitsThisMonth(ctx, merchant, who.userId), ...extra };
  };
  const first = (u?.name ?? "").split(" ")[0] || "member";

  if (b?.status === "attended") return done("already_checked_in", `${first} is already checked in.`, { pass: await passInfo(b) });
  if (b?.status === "waitlisted") return done("class_full", `${first} is on the waitlist for ${s.name}. The class is full: offer a different class.`);
  if (b?.status === "held") return done("not_booked", `${first} has not paid for this class yet.`);
  let added = false;
  if (!b) {
    if (!body.addIfNotBooked) return done("not_booked", `${first} is not booked into ${s.name}.`);
    const { choice, problem, amountDueCents } = await chooseCredit(ctx, merchant, who.userId, s);
    if (!choice) {
      if (problem === "past_due") return done("past_due", `${first}'s membership payment${amountDueCents ? ` of ${money(amountDueCents)}` : ""} did not go through. They can pay from the app.`, { amountDueCents });
      return done("no_pass", `${first} has no membership or pass. Sell a drop-in or an intro offer.`);
    }
    if ((await takenSpots(ctx.db, s.id, ctx.now())) >= s.capacity) return done("class_full", `${s.name} is full. Offer the waitlist or a different class.`);
    await ensureStudioMember(ctx, merchant, who.userId);
    try {
      const r = await bookCore(ctx, { userId: who.userId, merchant, session: s, source: "staff", use: "auto", waitlist: false });
      b = r.booking;
      added = true;
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 409) return done("class_full", err.message);
      throw err;
    }
  }
  const earned = await attend(ctx, staff, b!, s);
  const [fresh] = await ctx.db.select().from(classBookings).where(eq(classBookings.id, b!.id)).limit(1);
  return done(added ? "added_and_checked_in" : "checked_in", added ? `Added and checked in to ${s.name}.` : `Checked in to ${s.name}.`, { pointsEarned: earned.pointsEarned, balance: earned.balance, pass: await passInfo(fresh!) });
}

// ---------------------------------------------------------------------------
// Customer: what I have
// ---------------------------------------------------------------------------
export async function passDto(ctx: AppContext, p: Pass): Promise<classesApi.MyPassDto> {
  const [m] = await ctx.db.select({ id: merchants.id, name: merchants.name, slug: merchants.slug }).from(merchants).where(eq(merchants.id, p.merchantId)).limit(1);
  return { id: p.id, name: p.name, creditsTotal: p.creditsTotal, creditsLeft: p.creditsLeft, expiresAt: p.expiresAt.toISOString(), introOffer: p.introOffer, status: p.status as classesApi.PassStatus, merchant: m! };
}

/** Mark packs past their date expired (job). */
export async function expirePasses(ctx: AppContext): Promise<number> {
  const rows = await ctx.db.update(classPasses).set({ status: "expired", updatedAt: ctx.now() }).where(and(eq(classPasses.status, "active"), lte(classPasses.expiresAt, ctx.now()))).returning({ id: classPasses.id });
  return rows.length;
}

/** Push a reminder to people booked into a class that starts in the next three hours (once). Push only: texts are for waitlist spots and failed payments. */
export async function sendReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const rows = await ctx.db
    .select({ b: classBookings, s: classSessions })
    .from(classBookings)
    .innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId))
    .where(and(eq(classBookings.status, "booked"), isNull(classBookings.reminderSentAt), eq(classSessions.status, "scheduled"), gt(classSessions.startsAt, now), lte(classSessions.startsAt, new Date(now.getTime() + 3 * HOUR))))
    .limit(200);
  let n = 0;
  for (const { b, s } of rows) {
    const claimed = await ctx.db.update(classBookings).set({ reminderSentAt: now }).where(and(eq(classBookings.id, b.id), isNull(classBookings.reminderSentAt))).returning({ id: classBookings.id });
    if (!claimed.length) continue;
    const merchant = await loadMerchant(ctx.db, b.merchantId);
    if (!merchant) continue;
    const [loc] = await ctx.db.select({ address: locations.address }).from(locations).where(eq(locations.id, s.locationId)).limit(1);
    const locale = await localeOf(ctx, b.userId);
    await notify(ctx, merchant, b.userId, "remind", { name: s.name, when: new Intl.DateTimeFormat(LOCALES[locale].bcp47, { timeZone: merchant.timezone, hour: "numeric", minute: "2-digit" }).format(s.startsAt), address: loc?.address ?? "" }, { type: "class_reminder", sessionId: s.id });
    n++;
  }
  return n;
}
