/**
 * Waitlist that fills cancelled slots (docs/business/pro-value.md §3.2 P2). Contract: @ll/shared waitlistApi.
 *
 *  - Join: a client asks for a spot from a full day on the booking page (public; signed in or with a name and a phone or email), or the
 *    owner adds one by hand. Free and paid alike: seeing and keeping the list is free.
 *  - A freed slot (a cancellation, a no-show, or the owner's "Offer a slot") is recorded in `waitlist_freed_slots`. On Pro, Studio and
 *    the trial (`booking.waitlist`) the oldest matching ask is offered it at once: a held appointment row (source "waitlist", no client
 *    yet, `holdExpiresAt` = the offer's end, so the chair is blocked for everyone else) and a message by the client's best channel with
 *    the "Take it" link (/w/<token>). On Free the slot is recorded as "locked" and nobody is told.
 *  - Match: service active, the stylist can do it and is free at that start for its whole duration plus buffer (computed availability,
 *    so working hours, time off and other bookings all count), the date inside the ask's window, the start inside its part of the day,
 *    and the stylist the client asked for (or anyone).
 *  - The job (jobs/waitlist.ts, every minute): a lapsed offer releases its hold and the next match is offered, at most
 *    WAITLIST_MAX_OFFERS per slot; a slot that was never offered (a failed hook) is offered; asks whose window has passed expire.
 *  - Take: the hold becomes the client's booking, the slot is filled, `waitlist_fills` is counted with the booked amount.
 * Counters (P6, recordSignal): `waitlist_asks` on join, `cancellations` on every freed slot, `waitlist_fills` on take.
 * Pharmacies have no waitlist (an offer would say on a lock screen that someone sees a pharmacist).
 */
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import { appointmentWaitlist, appointments, locations, merchantStaff, merchants, services, staffHours, staffServices, users, waitlistFreedSlots, type DbOrTx } from "@ll/db";
import { LOCALES, smsSegments, translator, waitlistApi, type Locale } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound, tooMany } from "../lib/errors.js";
import { countHits, recordHit } from "../lib/rate-limit.js";
import { computeAvailability, guardOverlap, itemsFor, localParts, totalOf, type Appointment, type Merchant } from "./appointments.js";
import { addDays, zonedToUtc } from "./bookings.js";
import { iso } from "./commerceShared.js";
import { isFeatureOn } from "./features.js";
import { findOrCreateCustomerByPhone } from "./ledger.js";
import { requirePhone } from "./merchant.js";
import { findOrCreateUserByEmail } from "./merchant-staff.js";
import { deliverByLadder, userLocale } from "./notifications.js";
import { isPharmacy } from "./pharmacy-guard.js";
import { recordSignal } from "./signals.js";

type Entry = typeof appointmentWaitlist.$inferSelect;
type Slot = typeof waitlistFreedSlots.$inferSelect;
type Ctx = AppContext;

const { WAITLIST_HOLD_MINUTES, WAITLIST_MAX_OFFERS, WAITLIST_MIN_LEAD_MINUTES, WAITLIST_MAX_WINDOW_DAYS, WAITLIST_MAX_OPEN_PER_CLIENT, fitsTimePref } = waitlistApi;
const MIN = 60_000;
const OPEN = ["waiting", "offered"] as const;
/** Anonymous asks from one address in an hour (signed-in asks are capped per client instead). */
const ANON_JOINS_PER_HOUR = 6;
/** A no-show frees the rest of the visit from this step. */
const STEP_MIN = 15;

/** Never let a waitlist problem break the cancel that triggered it. */
function logFail(where: string, err: unknown) {
  console.error(`[waitlist.${where}]`, err);
}

export const offerGone = () => new HttpError(410, "offer_gone", "That spot was taken.");

/** The "Take it" link. */
export const offerLink = (ctx: Ctx, token: string) => `${ctx.config.publicWebUrl}/w/${token}`;
const shortOfferLink = (ctx: Ctx, token: string) => `${offerLink(ctx, token).replace(/^https?:\/\//, "")}`;

function todayIn(ctx: Ctx, tz: string): string {
  return localParts(ctx.now(), tz).date;
}

async function autoOffer(ctx: Ctx, m: Merchant): Promise<boolean> {
  return !isPharmacy(m) && (await isFeatureOn(ctx.db, m, "booking.waitlist"));
}

async function namesOf(db: DbOrTx, ids: (string | null | undefined)[]): Promise<Map<string, string | null>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, want));
  return new Map(rows.map((r) => [r.id, r.name?.trim() || null]));
}

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] ?? "";

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------
interface Who {
  userId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
}

async function resolveWho(ctx: Ctx, input: { userId?: string | null; name?: string | null; phone?: string | null; email?: string | null }): Promise<Who> {
  if (input.userId) {
    const [u] = await ctx.db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email, deletedAt: users.deletedAt }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!u || u.deletedAt) throw notFound("Client");
    const name = input.name?.trim() || u.name?.trim() || "";
    if (!u.name?.trim() && input.name?.trim()) await ctx.db.update(users).set({ name: input.name.trim() }).where(eq(users.id, u.id));
    return { userId: u.id, name: name || (u.phone ? `Client ${u.phone.slice(-4)}` : "Client"), phone: u.phone, email: u.email };
  }
  const name = input.name?.trim() ?? "";
  if (input.phone) {
    const phone = requirePhone(input.phone);
    const { user } = await findOrCreateCustomerByPhone(ctx.db, phone, name || null);
    if (user.deletedAt) throw badRequest("This phone number can't join the waitlist");
    return { userId: user.id, name: name || user.name?.trim() || `Client ${phone.slice(-4)}`, phone, email: input.email ?? null };
  }
  if (input.email) {
    const { user } = await findOrCreateUserByEmail(ctx.db, input.email.trim(), name || null);
    if (user.deletedAt) throw badRequest("This email can't join the waitlist");
    return { userId: user.id, name: name || user.name?.trim() || input.email.split("@")[0]!, phone: user.phone, email: input.email.trim() };
  }
  // The owner may write down a name with no contact; nobody can be told, but it stays on the list.
  if (!name) throw badRequest("Add a name and a phone number or email");
  return { userId: null, name, phone: null, email: null };
}

async function checkAsk(ctx: Ctx, m: Merchant, b: { serviceId: string; staffId?: string | null; windowStart: string; windowEnd: string }) {
  if (isPharmacy(m)) throw new HttpError(403, "no_waitlist", "This shop doesn't keep a waitlist.");
  const [svc] = await ctx.db.select().from(services).where(and(eq(services.id, b.serviceId), eq(services.merchantId, m.id), eq(services.kind, "appointment"))).limit(1);
  if (!svc || !svc.active) throw badRequest("Pick one of the shop's services");
  if (b.staffId) {
    const [st] = await ctx.db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, m.id), eq(merchantStaff.userId, b.staffId))).limit(1);
    if (!st) throw badRequest("Pick someone who works here");
  }
  const today = todayIn(ctx, m.timezone);
  const start = b.windowStart < today ? today : b.windowStart;
  if (b.windowEnd < start) throw badRequest("Those days have passed");
  const last = addDays(start, WAITLIST_MAX_WINDOW_DAYS - 1);
  return { svc, windowStart: start, windowEnd: b.windowEnd > last ? last : b.windowEnd };
}

async function insertEntry(ctx: Ctx, m: Merchant, who: Who, a: { serviceId: string; staffId: string | null; windowStart: string; windowEnd: string; timePref: waitlistApi.WaitlistTimePref; locationId: string | null; source: "online" | "staff" }): Promise<Entry> {
  const now = ctx.now();
  if (who.userId) {
    const open = await ctx.db
      .select()
      .from(appointmentWaitlist)
      .where(and(eq(appointmentWaitlist.merchantId, m.id), eq(appointmentWaitlist.userId, who.userId), inArray(appointmentWaitlist.status, [...OPEN])))
      .orderBy(asc(appointmentWaitlist.createdAt));
    // The same service again: widen the ask instead of a second place in the line (they keep their place).
    const same = open.find((e) => e.serviceId === a.serviceId && e.status === "waiting");
    if (same) {
      const [row] = await ctx.db
        .update(appointmentWaitlist)
        .set({ staffId: a.staffId, windowStart: a.windowStart < same.windowStart ? a.windowStart : same.windowStart, windowEnd: a.windowEnd > same.windowEnd ? a.windowEnd : same.windowEnd, timePref: a.timePref === same.timePref ? a.timePref : "any", updatedAt: now })
        .where(eq(appointmentWaitlist.id, same.id))
        .returning();
      return row!;
    }
    if (open.length >= WAITLIST_MAX_OPEN_PER_CLIENT) throw tooMany(`You can wait for ${WAITLIST_MAX_OPEN_PER_CLIENT} spots at a time here. Remove one first.`);
  }
  const [row] = await ctx.db
    .insert(appointmentWaitlist)
    .values({
      merchantId: m.id,
      locationId: a.locationId,
      userId: who.userId,
      customerName: who.name,
      customerPhone: who.phone,
      customerEmail: who.email,
      serviceId: a.serviceId,
      staffId: a.staffId,
      windowStart: a.windowStart,
      windowEnd: a.windowEnd,
      timePref: a.timePref,
      status: "waiting",
      source: a.source,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await recordSignal(ctx, m.id, "waitlist_asks");
  return row!;
}

/** Public ask from the booking page (`authUserId` when signed in). */
export async function joinPublic(ctx: Ctx, m: Merchant, body: z.output<typeof waitlistApi.joinWaitlistBody>, who: { authUserId: string | null; ip: string }): Promise<waitlistApi.MyWaitlistEntryDto> {
  const ask = await checkAsk(ctx, m, body);
  if (!who.authUserId) {
    if (!body.name?.trim() || (!body.phone && !body.email)) throw badRequest("Add your name and a phone number or email");
    const key = `waitlist:join:${who.ip}`;
    if ((await countHits(ctx, key, 60 * MIN)) >= ANON_JOINS_PER_HOUR) throw tooMany("Too many requests. Try again in a little while.");
    await recordHit(ctx, key, 60 * MIN);
  }
  const person = await resolveWho(ctx, who.authUserId ? { userId: who.authUserId, name: body.name } : body);
  const row = await insertEntry(ctx, m, person, { serviceId: ask.svc.id, staffId: body.staffId ?? null, windowStart: ask.windowStart, windowEnd: ask.windowEnd, timePref: body.timePref, locationId: body.locationId ?? null, source: "online" });
  await offerWaitingSlotsTo(ctx, m, row).catch((e) => logFail("join.offer", e));
  return (await myDtos(ctx, [row]))[0]!;
}

/** The owner adds a client by hand. */
export async function addByHand(ctx: Ctx, m: Merchant, body: z.output<typeof waitlistApi.addWaitlistBody>): Promise<waitlistApi.WaitlistEntryDto> {
  const ask = await checkAsk(ctx, m, body);
  const person = await resolveWho(ctx, body);
  const row = await insertEntry(ctx, m, person, { serviceId: ask.svc.id, staffId: body.staffId ?? null, windowStart: ask.windowStart, windowEnd: ask.windowEnd, timePref: body.timePref, locationId: body.locationId ?? null, source: "staff" });
  await offerWaitingSlotsTo(ctx, m, row).catch((e) => logFail("add.offer", e));
  return (await ownerDtos(ctx, m, [(await getEntry(ctx, m.id, row.id))]))[0]!;
}

async function getEntry(ctx: Ctx, merchantId: string, id: string): Promise<Entry> {
  const [e] = await ctx.db.select().from(appointmentWaitlist).where(and(eq(appointmentWaitlist.id, id), eq(appointmentWaitlist.merchantId, merchantId))).limit(1);
  if (!e) throw notFound("Waitlist entry");
  return e;
}

// ---------------------------------------------------------------------------
// Freed slots and offers
// ---------------------------------------------------------------------------
/**
 * The hook: an appointment was cancelled or marked a no-show. Records the slot, counts the cancellation and, on a paid plan, offers it
 * to the first match. Never throws.
 */
export async function waitlistOnFreedSlot(ctx: Ctx, merchant: Merchant, appt: Appointment): Promise<void> {
  try {
    if (appt.status !== "cancelled" && appt.status !== "no_show") return;
    // An online booking whose hold ran out never was a booking; nor is a payment that failed to start.
    if (appt.cancelReason === "hold_expired" || appt.cancelReason === "payment_setup_failed") return;
    if (isPharmacy(merchant)) return;
    // A waitlist offer that was cancelled from the calendar: that offer is over, the next match gets the slot.
    if (appt.source === "waitlist" && !appt.userId) {
      const [e] = await ctx.db.select().from(appointmentWaitlist).where(and(eq(appointmentWaitlist.offeredAppointmentHoldId, appt.id), eq(appointmentWaitlist.status, "offered"))).limit(1);
      if (e) await lapseOffer(ctx, merchant, e, "expired");
      return;
    }
    await recordSignal(ctx, merchant.id, "cancellations");
    if (!appt.staffId) return;
    const now = ctx.now();
    const lead = now.getTime() + WAITLIST_MIN_LEAD_MINUTES * MIN;
    let startMs = appt.startsAt.getTime();
    if (appt.status === "no_show" || startMs < lead) {
      // A no-show (or a late cancel) frees what is left of the visit, from the next step after the lead time.
      startMs = Math.ceil(Math.max(startMs, lead) / (STEP_MIN * MIN)) * STEP_MIN * MIN;
    }
    if (appt.endsAt.getTime() - startMs < STEP_MIN * MIN) return;
    const [pref] = await ctx.db.select().from(waitlistFreedSlots).where(eq(waitlistFreedSlots.freedAppointmentId, appt.id)).limit(1);
    if (pref) {
      // The owner turned "Offer this slot to the waitlist" off on the cancel confirm: keep the record, offer nothing.
      if (pref.status === "skipped") await ctx.db.update(waitlistFreedSlots).set({ startsAt: new Date(startMs), endsAt: appt.endsAt, reason: appt.status === "no_show" ? "no_show" : "cancelled", updatedAt: now }).where(eq(waitlistFreedSlots.id, pref.id));
      return;
    }
    const paid = await autoOffer(ctx, merchant);
    const [slot] = await ctx.db
      .insert(waitlistFreedSlots)
      .values({ merchantId: merchant.id, locationId: appt.locationId, staffId: appt.staffId, startsAt: new Date(startMs), endsAt: appt.endsAt, freedAppointmentId: appt.id, reason: appt.status === "no_show" ? "no_show" : "cancelled", status: paid ? "open" : "locked", createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning();
    if (slot && paid) await offerNext(ctx, merchant, slot);
  } catch (err) {
    logFail("onFreedSlot", err);
  }
}

/** Which of these waiting asks could take a slot starting at `start` with `staffId`, oldest first. */
async function candidatesFor(ctx: Ctx, m: Merchant, slot: Pick<Slot, "id" | "staffId" | "startsAt" | "locationId">, only?: string): Promise<Entry[]> {
  const local = localParts(slot.startsAt, m.timezone);
  const rows = await ctx.db
    .select()
    .from(appointmentWaitlist)
    .where(
      and(
        eq(appointmentWaitlist.merchantId, m.id),
        eq(appointmentWaitlist.status, "waiting"),
        lte(appointmentWaitlist.windowStart, local.date),
        gte(appointmentWaitlist.windowEnd, local.date),
        only ? eq(appointmentWaitlist.id, only) : undefined,
      ),
    )
    .orderBy(asc(appointmentWaitlist.createdAt), asc(appointmentWaitlist.id))
    .limit(200);
  return rows.filter((e) => (!e.staffId || e.staffId === slot.staffId) && (!e.locationId || e.locationId === slot.locationId) && fitsTimePref(e.timePref as waitlistApi.WaitlistTimePref, local.minutes));
}

/** Is this start free for this service with this stylist, for its whole length (hours, time off, other bookings)? */
async function fits(ctx: Ctx, m: Merchant, serviceId: string, staffId: string, start: Date, locationId: string, cache: Map<string, boolean>): Promise<boolean> {
  const k = `${serviceId}:${staffId}:${start.getTime()}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  const date = localParts(start, m.timezone).date;
  const ok = await computeAvailability(ctx, m, { serviceIds: [serviceId], staffId, from: date, to: date, locationId })
    .then((av) => !!av.days[0]?.times.some((t) => new Date(t.startsAt).getTime() === start.getTime()))
    .catch(() => false);
  cache.set(k, ok);
  return ok;
}

/** Offer a slot to its next match. Returns the entry offered, or null (the slot is then unfilled). */
export async function offerNext(ctx: Ctx, m: Merchant, slot: Slot, only?: string): Promise<Entry | null> {
  const now = ctx.now();
  const close = async (status: "unfilled") => {
    await ctx.db.update(waitlistFreedSlots).set({ status, updatedAt: now }).where(and(eq(waitlistFreedSlots.id, slot.id), inArray(waitlistFreedSlots.status, ["open", "offered"])));
    return null;
  };
  if (!slot.staffId) return close("unfilled");
  if (slot.offers >= WAITLIST_MAX_OFFERS) return close("unfilled");
  if (slot.startsAt.getTime() < now.getTime() + WAITLIST_MIN_LEAD_MINUTES * MIN) return close("unfilled");
  const cache = new Map<string, boolean>();
  for (const e of await candidatesFor(ctx, m, slot, only)) {
    // Someone who can't be told can't take it (a name with no phone or email).
    if (!e.userId) continue;
    if (!(await fits(ctx, m, e.serviceId, slot.staffId, slot.startsAt, slot.locationId, cache))) continue;
    const offered = await makeOffer(ctx, m, slot, e).catch((err) => {
      logFail("makeOffer", err);
      return null;
    });
    if (offered) return offered;
  }
  return only ? null : close("unfilled");
}

/** Hold the slot for this client and tell them. */
async function makeOffer(ctx: Ctx, m: Merchant, slot: Slot, e: Entry): Promise<Entry | null> {
  const now = ctx.now();
  const [svc] = await ctx.db.select().from(services).where(eq(services.id, e.serviceId)).limit(1);
  if (!svc) return null;
  const overrides = await ctx.db.select().from(staffServices).where(and(eq(staffServices.merchantId, m.id), eq(staffServices.userId, slot.staffId!)));
  const r = itemsFor([svc], slot.staffId, overrides);
  // Two hours, or until a quarter of an hour before the visit when it is sooner.
  const expiresAt = new Date(Math.min(now.getTime() + WAITLIST_HOLD_MINUTES * MIN, slot.startsAt.getTime() - 15 * MIN));
  const token = randomToken(12);
  const hold = await guardOverlap(async () => {
    const [a] = await ctx.db
      .insert(appointments)
      .values({
        merchantId: m.id,
        locationId: slot.locationId,
        // The client is set when they take it, so the hold never shows in their bookings as something to pay for.
        userId: null,
        customerName: e.customerName,
        staffId: slot.staffId,
        requestedStaff: !!e.staffId,
        source: "waitlist",
        items: r.items,
        startsAt: slot.startsAt,
        endsAt: new Date(slot.startsAt.getTime() + r.blockMin * MIN),
        status: "booked",
        holdExpiresAt: expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return a!;
  }).catch(() => null);
  if (!hold) return null;
  const [row] = await ctx.db
    .update(appointmentWaitlist)
    .set({ status: "offered", offeredAppointmentHoldId: hold.id, offeredAt: now, offerExpiresAt: expiresAt, freedSlotId: slot.id, offerToken: token, updatedAt: now })
    .where(and(eq(appointmentWaitlist.id, e.id), eq(appointmentWaitlist.status, "waiting")))
    .returning();
  if (!row) {
    await ctx.db.delete(appointments).where(eq(appointments.id, hold.id));
    return null;
  }
  await ctx.db.update(waitlistFreedSlots).set({ status: "offered", offers: sql`${waitlistFreedSlots.offers} + 1`, updatedAt: now }).where(eq(waitlistFreedSlots.id, slot.id));
  await sendOffer(ctx, m, row, hold, svc.name, svc.translations ?? null);
  return row;
}

function whenText(at: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALES[locale].bcp47, { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
}
function timeText(at: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALES[locale].bcp47, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
}

/** The offer message: push and email in full, the text in one segment with the link and STOP (inside the plan's texts). */
export function offerTexts(
  ctx: Ctx,
  m: Pick<Merchant, "name" | "timezone">,
  o: { token: string; startsAt: Date; expiresAt: Date; offeredAt: Date; service: string },
  locale: Locale,
): { title: string; body: string; email: string; text: string } {
  const t = translator(locale);
  const full = o.expiresAt.getTime() - o.offeredAt.getTime() >= WAITLIST_HOLD_MINUTES * MIN - MIN;
  const when = whenText(o.startsAt, m.timezone, locale);
  const until = timeText(o.expiresAt, m.timezone, locale);
  const title = t("wl.msg.title", { shop: m.name });
  const body = t(full ? "wl.msg.push" : "wl.msg.pushUntil", { shop: m.name, when, service: o.service, time: until });
  const email = t(full ? "wl.msg.email" : "wl.msg.emailUntil", { shop: m.name, when, service: o.service, time: until, link: offerLink(ctx, o.token) });
  const stop = t("bk.msg.textStop");
  const link = shortOfferLink(ctx, o.token);
  const build = (shop: string, service: string) => `${t(full ? "wl.msg.text" : "wl.msg.textUntil", { shop, when, service, time: until, link }).replace(/,\s*\./, ".").replace(/\s{2,}/g, " ")} ${stop}`;
  const shortShop = m.name.length > 20 ? `${m.name.slice(0, 19).trimEnd()}.` : m.name;
  const tries = [build(m.name, o.service), build(m.name, ""), build(shortShop, "")];
  // A text in Hindi, Urdu or Punjabi script cannot fit one segment; it keeps the shortest form.
  const text = tries.find((x) => smsSegments(x) <= 1) ?? tries.at(-1)!;
  return { title, body, email, text };
}

async function sendOffer(ctx: Ctx, m: Merchant, e: Entry, hold: Appointment, serviceName: string, translations: unknown): Promise<void> {
  if (!e.userId || !e.offerToken || !e.offerExpiresAt || !e.offeredAt) return;
  const locale = await userLocale(ctx, e.userId);
  const tr = (translations as Record<string, { name?: string }> | null)?.[locale]?.name;
  const msg = offerTexts(ctx, m, { token: e.offerToken, startsAt: hold.startsAt, expiresAt: e.offerExpiresAt, offeredAt: e.offeredAt, service: tr || serviceName }, locale);
  await deliverByLadder(ctx, {
    userId: e.userId,
    merchantId: m.id,
    type: "booking_reminder",
    title: msg.title,
    body: msg.body,
    emailBody: msg.email,
    textBody: msg.text,
    textCredits: Math.max(1, smsSegments(msg.text)),
    data: { type: "waitlist_offer", url: `/w/${e.offerToken}`, slug: m.slug, startsAt: hold.startsAt.toISOString() },
    url: `/w/${e.offerToken}`,
  });
}

/** An offer ended without a booking (lapsed, removed, or its hold cancelled): release the hold, then offer the slot to the next match. */
async function lapseOffer(ctx: Ctx, m: Merchant, e: Entry, status: "expired" | "removed"): Promise<void> {
  const now = ctx.now();
  const [row] = await ctx.db.update(appointmentWaitlist).set({ status, offerToken: null, updatedAt: now }).where(and(eq(appointmentWaitlist.id, e.id), eq(appointmentWaitlist.status, "offered"))).returning();
  if (!row) return;
  if (e.offeredAppointmentHoldId) {
    await ctx.db
      .update(appointments)
      .set({ status: "cancelled", cancelledAt: now, cancelReason: "hold_expired", holdExpiresAt: null, updatedAt: now })
      .where(and(eq(appointments.id, e.offeredAppointmentHoldId), eq(appointments.status, "booked"), isNotNull(appointments.holdExpiresAt)));
  }
  if (!e.freedSlotId) return;
  const [slot] = await ctx.db.select().from(waitlistFreedSlots).where(eq(waitlistFreedSlots.id, e.freedSlotId)).limit(1);
  if (!slot || slot.status !== "offered") return;
  // A manual offer was for one client; when it lapses the slot is simply open again.
  if (slot.reason === "manual") {
    await ctx.db.update(waitlistFreedSlots).set({ status: "unfilled", updatedAt: now }).where(eq(waitlistFreedSlots.id, slot.id));
    return;
  }
  await offerNext(ctx, m, slot);
}

/** A new ask: is there a freed slot still waiting for someone that suits it? */
async function offerWaitingSlotsTo(ctx: Ctx, m: Merchant, e: Entry): Promise<void> {
  if (e.status !== "waiting" || !e.userId || !(await autoOffer(ctx, m))) return;
  const now = ctx.now();
  const slots = await ctx.db
    .select()
    .from(waitlistFreedSlots)
    .where(and(eq(waitlistFreedSlots.merchantId, m.id), inArray(waitlistFreedSlots.status, ["open", "unfilled"]), ne(waitlistFreedSlots.reason, "manual"), gt(waitlistFreedSlots.startsAt, new Date(now.getTime() + WAITLIST_MIN_LEAD_MINUTES * MIN))))
    .orderBy(asc(waitlistFreedSlots.startsAt))
    .limit(20);
  for (const s of slots) {
    if (s.offers >= WAITLIST_MAX_OFFERS) continue;
    if (await offerNext(ctx, m, s, e.id)) return;
  }
}

// ---------------------------------------------------------------------------
// Take
// ---------------------------------------------------------------------------
async function take(ctx: Ctx, e: Entry): Promise<waitlistApi.TakeOfferResponse> {
  const now = ctx.now();
  if (e.status === "booked" && e.bookedAppointmentId) {
    const [a] = await ctx.db.select().from(appointments).where(eq(appointments.id, e.bookedAppointmentId)).limit(1);
    if (a) return { appointmentId: a.id, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString() };
  }
  if (e.status !== "offered" || !e.offerExpiresAt || e.offerExpiresAt <= now || !e.offeredAppointmentHoldId || !e.userId) throw offerGone();
  const result = await ctx.db.transaction(async (tx) => {
    const [a] = await tx
      .update(appointments)
      .set({ userId: e.userId, holdExpiresAt: null, updatedAt: now })
      .where(and(eq(appointments.id, e.offeredAppointmentHoldId!), eq(appointments.status, "booked"), isNotNull(appointments.holdExpiresAt), gt(appointments.holdExpiresAt, now)))
      .returning();
    if (!a) return null;
    await tx.update(appointmentWaitlist).set({ status: "booked", bookedAppointmentId: a.id, bookedAt: now, offerToken: null, updatedAt: now }).where(eq(appointmentWaitlist.id, e.id));
    if (e.freedSlotId) {
      await tx.update(waitlistFreedSlots).set({ status: "filled", filledAppointmentId: a.id, updatedAt: now }).where(eq(waitlistFreedSlots.id, e.freedSlotId));
      // Any other open offer for this slot is over.
      await tx.update(appointmentWaitlist).set({ status: "expired", offerToken: null, updatedAt: now }).where(and(eq(appointmentWaitlist.freedSlotId, e.freedSlotId), eq(appointmentWaitlist.status, "offered"), ne(appointmentWaitlist.id, e.id)));
    }
    return a;
  });
  if (!result) throw offerGone();
  await recordSignal(ctx, e.merchantId, "waitlist_fills", { amountCents: totalOf(result.items) });
  return { appointmentId: result.id, startsAt: result.startsAt.toISOString(), endsAt: result.endsAt.toISOString() };
}

async function entryByToken(ctx: Ctx, token: string): Promise<Entry | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null;
  const [e] = await ctx.db.select().from(appointmentWaitlist).where(eq(appointmentWaitlist.offerToken, token)).limit(1);
  return e ?? null;
}

/** POST /public/w/:token/take: the one-tap "Take it". The token is the client's (it came by their own push, email or text). */
export async function takeByToken(ctx: Ctx, token: string): Promise<waitlistApi.TakeOfferResponse> {
  const e = await entryByToken(ctx, token);
  if (!e) throw offerGone();
  return take(ctx, e);
}

/** POST /me/waitlist/:id/take: the same from the client's own list (the app, the web pass). */
export async function takeMine(ctx: Ctx, userId: string, id: string): Promise<waitlistApi.TakeOfferResponse> {
  const [e] = await ctx.db.select().from(appointmentWaitlist).where(and(eq(appointmentWaitlist.id, id), eq(appointmentWaitlist.userId, userId))).limit(1);
  if (!e) throw notFound("Waitlist entry");
  return take(ctx, e);
}

/** GET /public/w/:token: what the Take-it page shows. A used or lapsed link says the spot was taken. */
export async function offerByToken(ctx: Ctx, token: string): Promise<waitlistApi.OfferDto> {
  const e = await entryByToken(ctx, token);
  if (!e) throw offerGone();
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, e.merchantId)).limit(1);
  const [a] = e.offeredAppointmentHoldId ? await ctx.db.select().from(appointments).where(eq(appointments.id, e.offeredAppointmentHoldId)).limit(1) : [];
  if (!m || !a) throw offerGone();
  const [svc] = await ctx.db.select({ name: services.name }).from(services).where(eq(services.id, e.serviceId)).limit(1);
  const staff = await namesOf(ctx.db, [a.staffId]);
  const now = ctx.now();
  const state: waitlistApi.OfferDto["state"] = e.status === "booked" ? "booked" : e.status === "offered" && e.offerExpiresAt && e.offerExpiresAt > now && a.status === "booked" ? "open" : "expired";
  return {
    state,
    merchant: { name: m.name, slug: m.slug, brandColor: m.brandColor, logoUrl: m.logoUrl, vertical: m.vertical, timezone: m.timezone },
    serviceName: svc?.name ?? a.items.map((i) => i.name).join(", "),
    staffName: firstName(staff.get(a.staffId ?? "")) || null,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    expiresAt: iso(e.offerExpiresAt),
    priceCents: totalOf(a.items),
    appointmentId: e.status === "booked" ? e.bookedAppointmentId : null,
  };
}

// ---------------------------------------------------------------------------
// The client's list
// ---------------------------------------------------------------------------
async function myDtos(ctx: Ctx, rows: Entry[]): Promise<waitlistApi.MyWaitlistEntryDto[]> {
  if (!rows.length) return [];
  const ms = await ctx.db.select().from(merchants).where(inArray(merchants.id, [...new Set(rows.map((r) => r.merchantId))]));
  const svcs = await ctx.db.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, [...new Set(rows.map((r) => r.serviceId))]));
  const holds = rows.map((r) => r.offeredAppointmentHoldId).filter((x): x is string => !!x);
  const hs = holds.length ? await ctx.db.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(inArray(appointments.id, holds)) : [];
  const staff = await namesOf(ctx.db, rows.map((r) => r.staffId));
  const now = ctx.now();
  return rows.map((r) => {
    const m = ms.find((x) => x.id === r.merchantId)!;
    const h = hs.find((x) => x.id === r.offeredAppointmentHoldId);
    const live = r.status === "offered" && !!h && !!r.offerToken && !!r.offerExpiresAt && r.offerExpiresAt > now;
    return {
      id: r.id,
      merchant: { id: m.id, name: m.name, slug: m.slug, brandColor: m.brandColor, logoUrl: m.logoUrl },
      serviceName: svcs.find((s) => s.id === r.serviceId)?.name ?? "",
      staffName: firstName(staff.get(r.staffId ?? "")) || null,
      windowStart: r.windowStart,
      windowEnd: r.windowEnd,
      timePref: r.timePref as waitlistApi.WaitlistTimePref,
      status: r.status as waitlistApi.WaitlistStatus,
      offer: live ? { startsAt: h!.startsAt.toISOString(), endsAt: h!.endsAt.toISOString(), expiresAt: r.offerExpiresAt!.toISOString(), token: r.offerToken! } : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function listMine(ctx: Ctx, userId: string): Promise<waitlistApi.MyWaitlistResponse> {
  const rows = await ctx.db.select().from(appointmentWaitlist).where(and(eq(appointmentWaitlist.userId, userId), inArray(appointmentWaitlist.status, [...OPEN]))).orderBy(asc(appointmentWaitlist.windowStart), asc(appointmentWaitlist.createdAt)).limit(50);
  return { items: await myDtos(ctx, rows) };
}

export async function removeMine(ctx: Ctx, userId: string, id: string): Promise<void> {
  const [e] = await ctx.db.select().from(appointmentWaitlist).where(and(eq(appointmentWaitlist.id, id), eq(appointmentWaitlist.userId, userId))).limit(1);
  if (!e) throw notFound("Waitlist entry");
  await remove(ctx, e);
}

async function remove(ctx: Ctx, e: Entry): Promise<void> {
  if (e.status === "offered") {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, e.merchantId)).limit(1);
    if (m) return lapseOffer(ctx, m, e, "removed");
  }
  if (e.status === "waiting") await ctx.db.update(appointmentWaitlist).set({ status: "removed", updatedAt: ctx.now() }).where(and(eq(appointmentWaitlist.id, e.id), eq(appointmentWaitlist.status, "waiting")));
}

// ---------------------------------------------------------------------------
// The booking page
// ---------------------------------------------------------------------------
/** Is there a waitlist here, and which days does the shop work (a working day with no free time is shown as "Full"). */
export async function publicInfo(ctx: Ctx, m: Merchant, q: { from: string; to: string }): Promise<waitlistApi.PublicWaitlistInfo> {
  if (isPharmacy(m)) return { open: false, workDays: [] };
  const hours = await ctx.db.select({ weekday: staffHours.weekday }).from(staffHours).where(eq(staffHours.merchantId, m.id));
  const weekdays = new Set(hours.map((h) => h.weekday));
  const days: string[] = [];
  for (let d = q.from, i = 0; d <= q.to && i < WAITLIST_MAX_WINDOW_DAYS; d = addDays(d, 1), i++) if (weekdays.has(new Date(`${d}T00:00:00Z`).getUTCDay())) days.push(d);
  return { open: true, workDays: days };
}

// ---------------------------------------------------------------------------
// The owner
// ---------------------------------------------------------------------------
async function ownerDtos(ctx: Ctx, m: Merchant, rows: Entry[]): Promise<waitlistApi.WaitlistEntryDto[]> {
  if (!rows.length) return [];
  const svcs = await ctx.db.select().from(services).where(inArray(services.id, [...new Set(rows.map((r) => r.serviceId))]));
  const holdIds = rows.flatMap((r) => [r.offeredAppointmentHoldId, r.bookedAppointmentId]).filter((x): x is string => !!x);
  const hs = holdIds.length ? await ctx.db.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, staffId: appointments.staffId }).from(appointments).where(inArray(appointments.id, holdIds)) : [];
  const names = await namesOf(ctx.db, [...rows.map((r) => r.staffId), ...hs.map((h) => h.staffId)]);
  return rows.map((r) => {
    const s = svcs.find((x) => x.id === r.serviceId);
    const h = hs.find((x) => x.id === (r.status === "booked" ? r.bookedAppointmentId : r.offeredAppointmentHoldId));
    return {
      id: r.id,
      customer: { userId: r.userId, name: r.customerName, phone: r.customerPhone, email: r.customerEmail },
      serviceId: r.serviceId,
      serviceName: s?.name ?? "",
      durationMin: s ? s.durationMin : 0,
      staffId: r.staffId,
      staffName: names.get(r.staffId ?? "") ?? null,
      windowStart: r.windowStart,
      windowEnd: r.windowEnd,
      timePref: r.timePref as waitlistApi.WaitlistTimePref,
      status: r.status as waitlistApi.WaitlistStatus,
      source: r.source as "online" | "staff",
      offeredAt: iso(r.offeredAt),
      offerExpiresAt: iso(r.offerExpiresAt),
      offeredSlot: h && (r.status === "offered" || r.status === "booked") ? { startsAt: h.startsAt.toISOString(), endsAt: h.endsAt.toISOString(), staffName: names.get(h.staffId ?? "") ?? null } : null,
      bookedAppointmentId: r.bookedAppointmentId,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** Open asks that a slot on this date with this stylist could suit (ignores length): the "{n} waiting" count. */
function matchingCount(open: Entry[], m: Merchant, s: Pick<Slot, "staffId" | "startsAt">): number {
  const local = localParts(s.startsAt, m.timezone);
  return open.filter((e) => e.status === "waiting" && e.windowStart <= local.date && e.windowEnd >= local.date && (!e.staffId || e.staffId === s.staffId) && fitsTimePref(e.timePref as waitlistApi.WaitlistTimePref, local.minutes)).length;
}

async function openEntries(ctx: Ctx, merchantId: string): Promise<Entry[]> {
  return ctx.db.select().from(appointmentWaitlist).where(and(eq(appointmentWaitlist.merchantId, merchantId), inArray(appointmentWaitlist.status, [...OPEN]))).orderBy(asc(appointmentWaitlist.createdAt)).limit(500);
}

async function slotDtos(ctx: Ctx, m: Merchant, slots: Slot[], open: Entry[]): Promise<waitlistApi.FreedSlotDto[]> {
  if (!slots.length) return [];
  const offers = await ctx.db.select().from(appointmentWaitlist).where(and(inArray(appointmentWaitlist.freedSlotId, slots.map((s) => s.id)), inArray(appointmentWaitlist.status, ["offered", "booked"])));
  const names = await namesOf(ctx.db, slots.map((s) => s.staffId));
  const now = ctx.now();
  return slots.map((s) => {
    const live = offers.find((o) => o.freedSlotId === s.id && o.status === "offered" && o.offerExpiresAt && o.offerExpiresAt > now);
    const booked = offers.find((o) => o.freedSlotId === s.id && o.status === "booked");
    return {
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      staffId: s.staffId,
      staffName: names.get(s.staffId ?? "") ?? null,
      reason: s.reason as waitlistApi.FreedSlotDto["reason"],
      status: s.status as waitlistApi.FreedSlotStatus,
      offers: s.offers,
      offer: live ? { entryId: live.id, name: firstName(live.customerName), expiresAt: live.offerExpiresAt!.toISOString() } : null,
      filledBy: booked ? firstName(booked.customerName) : null,
      matching: matchingCount(open, m, s),
    };
  });
}

/** GET /merchants/:id/waitlist: the asks (open first, then the last 30 days of booked and ended ones), and the freed slots on `day`. */
export async function listForOwner(ctx: Ctx, m: Merchant, q: z.output<typeof waitlistApi.listWaitlistQuery>): Promise<waitlistApi.WaitlistResponse> {
  const open = await openEntries(ctx, m.id);
  const since = new Date(ctx.now().getTime() - 30 * 24 * 60 * MIN);
  const past =
    q.status === "all"
      ? await ctx.db.select().from(appointmentWaitlist).where(and(eq(appointmentWaitlist.merchantId, m.id), inArray(appointmentWaitlist.status, ["booked", "expired", "removed"]), gt(appointmentWaitlist.updatedAt, since))).orderBy(desc(appointmentWaitlist.updatedAt)).limit(100)
      : [];
  let slots: Slot[] = [];
  if (q.day) {
    const from = zonedToUtc(q.day, 0, m.timezone);
    const to = zonedToUtc(addDays(q.day, 1), 0, m.timezone);
    slots = await ctx.db.select().from(waitlistFreedSlots).where(and(eq(waitlistFreedSlots.merchantId, m.id), gte(waitlistFreedSlots.startsAt, from), lt(waitlistFreedSlots.startsAt, to), ne(waitlistFreedSlots.reason, "manual"))).orderBy(asc(waitlistFreedSlots.startsAt));
  }
  return { items: await ownerDtos(ctx, m, [...open, ...past]), waiting: open.length, autoOffer: await autoOffer(ctx, m), slots: await slotDtos(ctx, m, slots, open) };
}

export async function removeForOwner(ctx: Ctx, m: Merchant, id: string): Promise<void> {
  await remove(ctx, await getEntry(ctx, m.id, id));
}

/** "Offer a slot": the next openings that suit this ask (its service, stylist, dates and part of the day), soonest first. */
export async function openingsFor(ctx: Ctx, m: Merchant, id: string): Promise<waitlistApi.OpeningsResponse> {
  const e = await getEntry(ctx, m.id, id);
  const today = todayIn(ctx, m.timezone);
  const from = e.windowStart < today ? today : e.windowStart;
  if (e.windowEnd < from) return { timezone: m.timezone, items: [] };
  const to = e.windowEnd > addDays(from, 13) ? addDays(from, 13) : e.windowEnd;
  const av = await computeAvailability(ctx, m, { serviceIds: [e.serviceId], staffId: e.staffId ?? "any", from, to, locationId: e.locationId }).catch(() => null);
  if (!av) return { timezone: m.timezone, items: [] };
  const lead = ctx.now().getTime() + WAITLIST_MIN_LEAD_MINUTES * MIN;
  const picks = av.days
    .flatMap((d) => d.times)
    .filter((t) => new Date(t.startsAt).getTime() >= lead && fitsTimePref(e.timePref as waitlistApi.WaitlistTimePref, localParts(new Date(t.startsAt), m.timezone).minutes))
    .slice(0, 8);
  const names = await namesOf(ctx.db, picks.map((p) => p.staffId));
  return { timezone: m.timezone, items: picks.map((p) => ({ startsAt: p.startsAt, endsAt: new Date(new Date(p.startsAt).getTime() + av.blockMin * MIN).toISOString(), staffId: p.staffId, staffName: names.get(p.staffId) ?? null })) };
}

/** POST /merchants/:id/waitlist/:entryId/offer: offer one opening to this client now (paid plans; the route checks the feature). */
export async function offerSlotTo(ctx: Ctx, m: Merchant, id: string, body: z.output<typeof waitlistApi.offerSlotBody>): Promise<waitlistApi.WaitlistEntryDto> {
  const e = await getEntry(ctx, m.id, id);
  if (e.status !== "waiting") throw conflict(e.status === "offered" ? "They already have an offer open." : "This client isn't waiting any more.");
  if (!e.userId) throw new HttpError(409, "no_contact", "Add a phone number or email for this client to send an offer.");
  const startsAt = new Date(body.startsAt);
  if (startsAt.getTime() < ctx.now().getTime() + WAITLIST_MIN_LEAD_MINUTES * MIN) throw badRequest("Pick a time at least 30 minutes from now");
  const [staffRow] = await ctx.db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, m.id), eq(merchantStaff.userId, body.staffId))).limit(1);
  if (!staffRow) throw badRequest("Pick someone who works here");
  const locationId = e.locationId ?? (await ctx.db.select({ id: locations.id }).from(locations).where(and(eq(locations.merchantId, m.id), eq(locations.active, true))).orderBy(asc(locations.createdAt)).limit(1))[0]?.id;
  if (!locationId) throw badRequest("This shop has no active location");
  if (!(await fits(ctx, m, e.serviceId, body.staffId, startsAt, locationId, new Map()))) throw new HttpError(409, "slot_taken", "That time was just taken. Pick another.");
  const now = ctx.now();
  const [slot] = await ctx.db.insert(waitlistFreedSlots).values({ merchantId: m.id, locationId, staffId: body.staffId, startsAt, endsAt: startsAt, reason: "manual", status: "open", createdAt: now, updatedAt: now }).returning();
  const offered = await offerNext(ctx, m, slot!, e.id);
  if (!offered) {
    await ctx.db.update(waitlistFreedSlots).set({ status: "unfilled", updatedAt: now }).where(eq(waitlistFreedSlots.id, slot!.id));
    throw new HttpError(409, "slot_taken", "That time was just taken. Pick another.");
  }
  return (await ownerDtos(ctx, m, [offered]))[0]!;
}

/** The cancel confirm: how many are waiting for this slot, and whether it will be offered. */
export async function slotPreview(ctx: Ctx, m: Merchant, appointmentId: string): Promise<waitlistApi.SlotPreviewResponse> {
  const [a] = await ctx.db.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.merchantId, m.id))).limit(1);
  if (!a) throw notFound("Appointment");
  const open = await openEntries(ctx, m.id);
  const [pref] = await ctx.db.select({ status: waitlistFreedSlots.status }).from(waitlistFreedSlots).where(eq(waitlistFreedSlots.freedAppointmentId, a.id)).limit(1);
  return { waiting: open.filter((e) => e.status === "waiting").length, matching: matchingCount(open, m, a), autoOffer: await autoOffer(ctx, m), offer: pref?.status !== "skipped" };
}

/** The cancel confirm's switch. Off: a "skipped" record the hook finds, so this one slot is not offered. */
export async function setSlotPreference(ctx: Ctx, m: Merchant, appointmentId: string, offer: boolean): Promise<waitlistApi.SlotPreviewResponse> {
  const [a] = await ctx.db.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.merchantId, m.id))).limit(1);
  if (!a) throw notFound("Appointment");
  const now = ctx.now();
  if (offer) await ctx.db.delete(waitlistFreedSlots).where(and(eq(waitlistFreedSlots.freedAppointmentId, a.id), eq(waitlistFreedSlots.status, "skipped")));
  else
    await ctx.db
      .insert(waitlistFreedSlots)
      .values({ merchantId: m.id, locationId: a.locationId, staffId: a.staffId, startsAt: a.startsAt, endsAt: a.endsAt, freedAppointmentId: a.id, status: "skipped", createdAt: now, updatedAt: now })
      .onConflictDoNothing();
  return slotPreview(ctx, m, appointmentId);
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------
/** One pass: lapsed offers go to the next match, unoffered slots are offered, asks past their window expire. Returns offers made. */
export async function runWaitlist(ctx: Ctx): Promise<{ lapsed: number; offered: number; expired: number }> {
  const now = ctx.now();
  const out = { lapsed: 0, offered: 0, expired: 0 };
  const merchantCache = new Map<string, Merchant | null>();
  const merchantOf = async (id: string) => {
    if (!merchantCache.has(id)) merchantCache.set(id, (await ctx.db.select().from(merchants).where(eq(merchants.id, id)).limit(1))[0] ?? null);
    return merchantCache.get(id)!;
  };
  const lapsed = await ctx.db.select().from(appointmentWaitlist).where(and(eq(appointmentWaitlist.status, "offered"), lte(appointmentWaitlist.offerExpiresAt, now))).orderBy(asc(appointmentWaitlist.offerExpiresAt)).limit(200);
  for (const e of lapsed) {
    const m = await merchantOf(e.merchantId);
    if (!m) continue;
    await lapseOffer(ctx, m, e, "expired").catch((err) => logFail("job.lapse", err));
    out.lapsed++;
  }
  const open = await ctx.db.select().from(waitlistFreedSlots).where(and(eq(waitlistFreedSlots.status, "open"), gt(waitlistFreedSlots.startsAt, now))).orderBy(asc(waitlistFreedSlots.startsAt)).limit(100);
  for (const s of open) {
    const m = await merchantOf(s.merchantId);
    if (!m) continue;
    if (!(await autoOffer(ctx, m))) {
      await ctx.db.update(waitlistFreedSlots).set({ status: "locked", updatedAt: now }).where(eq(waitlistFreedSlots.id, s.id));
      continue;
    }
    if (await offerNext(ctx, m, s).catch((err) => (logFail("job.offer", err), null))) out.offered++;
  }
  // Asks whose last day has passed. Nine hours behind UTC is never later than a Canadian shop's own date, so this never expires an ask early.
  const yesterday = addDays(new Date(now.getTime() - 9 * 60 * MIN).toISOString().slice(0, 10), -1);
  const gone = await ctx.db.update(appointmentWaitlist).set({ status: "expired", updatedAt: now }).where(and(eq(appointmentWaitlist.status, "waiting"), lte(appointmentWaitlist.windowEnd, yesterday))).returning({ id: appointmentWaitlist.id });
  out.expired = gone.length;
  return out;
}
