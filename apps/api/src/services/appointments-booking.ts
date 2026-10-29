/**
 * Appointments, the money and the customer side: online booking with a 10-minute hold, the deposit or the
 * card on file (confirmed by webhook), cancel and reschedule against the shop's window, the no-show fee,
 * status changes at the front desk, and the reminder and hold-expiry jobs.
 *
 * Policy (the customer sees it before adding a card): free change or cancel until `cancelWindowHours`
 * before the visit. After that, or on a no-show, the shop's fee goes to the card the customer saved. A
 * deposit already paid counts toward the fee and is kept; before the window it is refunded.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { appointments, locations, merchants, pets, services, staffHours, staffServices, users } from "@ll/db";
import { LOCALES, smsSegments, addressVisibilityOf, appointmentsApi, bookingMaySeeAddress, isAddressPrivate, normalizeLocale, publicPlaceLine, salesTaxCopy, translator, type Locale } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound, tooMany } from "../lib/errors.js";
import { autoSetPreferred } from "./preferred-staff.js";
import {
  assertBookable,
  appointmentDto,
  expireHolds,
  getAppointment,
  guardOverlap,
  initialsOf,
  itemsFor,
  loadAppointmentServices,
  resolveLocation,
  totalOf,
  type Appointment,
  type Merchant,
} from "./appointments.js";
import { iso, loadMerchant, money, notifyCustomer } from "./commerceShared.js";
import { deliverByLadder } from "./notifications.js";
import { requireFeature } from "./features.js";
import { platformFeeFor } from "./fees.js";
import { merchantProvince } from "./tax.js";
import { assertNoPharmacyNotes, isPharmacy } from "./pharmacy-guard.js";
import { appointmentPaymentsReady, chargeConnectSavedMethod, createConnectPayment, refundConnectPayment, retrieveConnectPayment, savedMethodScope, chargeModeFor } from "./payments.js";
import { getPayments } from "../providers/payments.js";

const { ACTIVE_APPOINTMENT_STATUSES, HOLD_MINUTES } = appointmentsApi;
const MIN = 60_000;
const HOUR = 60 * MIN;
const ACTIVE = [...ACTIVE_APPOINTMENT_STATUSES] as string[];
/** A customer may hold at most this many unpaid online bookings at once (stops hold-hoarding). */
const MAX_OPEN_HOLDS = 3;
/** Stripe won't take less. */
const MIN_CHARGE_CENTS = 50;

// ---------------------------------------------------------------------------
// Public shop page data
// ---------------------------------------------------------------------------
export async function publicServices(ctx: AppContext, merchant: Merchant): Promise<appointmentsApi.PublicServicesResponse> {
  const loc = await resolveLocation(ctx.db, merchant.id).catch(() => null);
  const [rows, hours, assigned, cats, cardsOk] = await Promise.all([
    ctx.db.select().from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, "appointment"), eq(services.active, true))).orderBy(asc(services.sort), asc(services.name), asc(services.id)),
    loc ? ctx.db.select({ userId: staffHours.userId }).from(staffHours).where(and(eq(staffHours.merchantId, merchant.id), eq(staffHours.locationId, loc.id))) : Promise.resolve([]),
    ctx.db.select().from(staffServices).where(eq(staffServices.merchantId, merchant.id)),
    ctx.db.query.merchantCategories.findMany({ where: (c, { eq: e }) => e(c.merchantId, merchant.id) }),
    appointmentPaymentsReady(ctx, merchant), // phase-solo A: deposits on the free calendar (direct charges); keep when editing
  ]);
  const staffIds = [...new Set(hours.map((h) => h.userId))];
  const people = staffIds.length ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds)) : [];
  const staff = staffIds
    .map((id) => {
      const name = people.find((p) => p.id === id)?.name?.trim() || "Staff";
      return { id, name, initials: initialsOf(name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return {
    // A home studio or a travelling pro: no street address before booking, only the public line (phase-solo B, §2.3).
    shop: { name: merchant.name, slug: merchant.slug, timezone: merchant.timezone, address: loc && !isAddressPrivate(loc.addressVisibility) ? loc.address : null, addressVisibility: addressVisibilityOf(loc?.addressVisibility), placeLine: loc ? publicPlaceLine(loc) : null, phone: merchant.phone ?? loc?.phone ?? null, logoUrl: merchant.logoUrl, brandColor: merchant.brandColor, locationId: loc?.id ?? null, vertical: merchant.vertical, ...(isPharmacy(merchant) ? { pharmacy: true } : {}) },
    tax: salesTaxCopy({ province: await merchantProvince(ctx.db, merchant), taxRegistered: merchant.taxRegistered }),
    policy: { cancelWindowHours: merchant.cancelWindowHours, noShowFeeCents: isPharmacy(merchant) ? 0 : merchant.noShowFeeCents, takesCards: isPharmacy(merchant) ? false : cardsOk },
    services: rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMin: s.durationMin,
      priceCents: s.priceCents,
      priceFrom: s.priceFrom,
      depositCents: s.depositCents,
      categoryName: s.categoryId ? (catName.get(s.categoryId) ?? null) : null,
      translations: s.translations ?? {},
      taxable: s.taxable,
      staffIds: assigned.filter((a) => a.serviceId === s.id).map((a) => a.userId),
      staffOverrides: assigned.filter((a) => a.serviceId === s.id && (a.durationMin !== null || a.priceCents !== null)).map((a) => ({ staffId: a.userId, durationMin: a.durationMin, priceCents: a.priceCents })),
      intakeQuestion: isPharmacy(merchant) ? null : s.intakeQuestion, // phase-solo D
    })),
    staff,
  };
}

// ---------------------------------------------------------------------------
// Customer DTO
// ---------------------------------------------------------------------------
export async function myDtos(ctx: AppContext, rows: Appointment[]): Promise<appointmentsApi.MyAppointmentDto[]> {
  if (!rows.length) return [];
  const ms = await ctx.db.select().from(merchants).where(inArray(merchants.id, [...new Set(rows.map((r) => r.merchantId))]));
  const ls = await ctx.db.select().from(locations).where(inArray(locations.id, [...new Set(rows.map((r) => r.locationId))]));
  const staffIds = [...new Set(rows.map((r) => r.staffId).filter((s): s is string => !!s))];
  const staff = staffIds.length ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds)) : [];
  // Tax copy: the shop's province and registration, and whether any service on the visit carries tax.
  const serviceIds = [...new Set(rows.flatMap((r) => r.items.map((i) => i.serviceId)).filter((x): x is string => !!x))];
  const taxableById = new Map((serviceIds.length ? await ctx.db.select({ id: services.id, taxable: services.taxable }).from(services).where(inArray(services.id, serviceIds)) : []).map((x) => [x.id, x.taxable] as const));
  const provinces = new Map<string, string>();
  for (const m of ms) provinces.set(m.id, await merchantProvince(ctx.db, m));
  const rxUsers = [...new Set(rows.filter((r) => r.userId && isPharmacy(ms.find((x) => x.id === r.merchantId))).map((r) => r.userId!))];
  const rxLocale = new Map((rxUsers.length ? await ctx.db.select({ id: users.id, locale: users.locale }).from(users).where(inArray(users.id, rxUsers)) : []).map((u) => [u.id, normalizeLocale(u.locale) ?? "en"] as const));
  const petIds = [...new Set(rows.map((r) => r.petId).filter((x): x is string => !!x))];
  const petNames = new Map((petIds.length ? await ctx.db.select({ id: pets.id, name: pets.name }).from(pets).where(inArray(pets.id, petIds)) : []).map((p) => [p.id, p.name] as const));
  return rows.map((r): appointmentsApi.MyAppointmentDto => {
    const m = ms.find((x) => x.id === r.merchantId)!;
    const copy = salesTaxCopy({ province: provinces.get(m.id), taxRegistered: m.taxRegistered });
    const anyTaxable = r.items.some((i) => (i.serviceId ? (taxableById.get(i.serviceId) ?? true) : true));
    const l = ls.find((x) => x.id === r.locationId);
    return {
      id: r.id,
      merchant: { id: m.id, name: m.name, slug: m.slug, logoUrl: m.logoUrl, brandColor: m.brandColor, address: releasedAddress(l, r), phone: m.phone ?? l?.phone ?? null, timezone: m.timezone, addressPrivate: !!l && isAddressPrivate(l.addressVisibility), placeLine: l ? publicPlaceLine(l) : null },
      staffId: r.staffId,
      staffName: staff.find((s) => s.id === r.staffId)?.name?.trim() ?? null,
      items: r.items,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status as appointmentsApi.AppointmentStatus,
      totalCents: totalOf(r.items),
      depositCents: r.depositCents,
      depositPaidAt: iso(r.depositPaidAt),
      hasCardOnFile: !!r.paymentMethodId,
      pending: r.status === "booked" && !!r.holdExpiresAt,
      holdExpiresAt: iso(r.holdExpiresAt),
      policy: { cancelWindowHours: m.cancelWindowHours, noShowFeeCents: r.noShowFeeCents ?? m.noShowFeeCents },
      tax: { applies: copy.applies && anyTaxable, name: copy.name },
      freeChangeUntil: new Date(r.startsAt.getTime() - m.cancelWindowHours * HOUR).toISOString(),
      feeChargedAt: iso(r.feeChargedAt),
      notes: r.notes,
      petName: r.petId ? (petNames.get(r.petId) ?? null) : null,
      ...(isPharmacy(m) && r.userId ? { reminderText: pharmacyReminderText(ctx, m, r, rxLocale.get(r.userId) ?? "en").sms } : {}),
    };
  });
}

/**
 * The street address a booking may see: always for a storefront; for a home studio or a travelling pro only once the booking is
 * confirmed (no unpaid hold) and not cancelled or a no-show (solo-pro-launch.md §2.3). A pro who travels has none to give.
 */
export function releasedAddress(l: { address: string; addressVisibility: string } | undefined | null, a: Pick<Appointment, "status" | "holdExpiresAt">): string | null {
  if (!l || !l.address.trim()) return null;
  if (!isAddressPrivate(l.addressVisibility)) return l.address;
  return bookingMaySeeAddress(a) ? l.address : null;
}

async function getMine(ctx: AppContext, userId: string, id: string): Promise<Appointment> {
  const [a] = await ctx.db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.userId, userId))).limit(1);
  if (!a) throw notFound("Appointment");
  return a;
}

export async function listMine(ctx: AppContext, userId: string): Promise<appointmentsApi.MyAppointmentsResponse> {
  const now = ctx.now();
  const rows = await ctx.db
    .select()
    .from(appointments)
    .where(and(eq(appointments.userId, userId), gte(appointments.startsAt, new Date(now.getTime() - 120 * 24 * HOUR))))
    .orderBy(desc(appointments.startsAt))
    .limit(100);
  // A booking still waiting on a payment that ran out is gone.
  const live = rows.filter((r) => !(r.status === "booked" && r.holdExpiresAt && r.holdExpiresAt <= now));
  return { items: await myDtos(ctx, live) };
}

// ---------------------------------------------------------------------------
// Payments: customer, deposit, card on file
// ---------------------------------------------------------------------------
async function ensureCustomer(ctx: AppContext, merchant: Merchant, a: Appointment): Promise<string> {
  if (a.stripeCustomerId) return a.stripeCustomerId;
  const [other] = await ctx.db
    .select({ id: appointments.stripeCustomerId })
    .from(appointments)
    .where(and(eq(appointments.userId, a.userId!), eq(appointments.merchantId, a.merchantId), isNotNull(appointments.stripeCustomerId)))
    .limit(1);
  let customerId = other?.id ?? null;
  if (!customerId) {
    const [u] = await ctx.db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, a.userId!)).limit(1);
    const direct = chargeModeFor(ctx, merchant) === "direct";
    customerId = (await getPayments(ctx).createPayerCustomer({ userId: a.userId!, merchantId: merchant.id, email: u?.email, name: u?.name, connectedAccountId: direct ? merchant.stripeAccountId : null })).customerId;
  }
  await ctx.db.update(appointments).set({ stripeCustomerId: customerId }).where(eq(appointments.id, a.id));
  a.stripeCustomerId = customerId;
  return customerId;
}

async function depositPayment(ctx: AppContext, merchant: Merchant, a: Appointment): Promise<appointmentsApi.PaymentRefDto> {
  const customerId = await ensureCustomer(ctx, merchant, a);
  const pi = a.depositPaymentIntentId
    ? await retrieveConnectPayment(ctx, merchant, a.depositPaymentIntentId)
    : await createConnectPayment(ctx, merchant, {
        amountCents: a.depositCents,
        connectedAccountId: merchant.stripeAccountId!,
        applicationFeeCents: platformFeeFor("deposit", a.depositCents, merchant),
        description: `${merchant.name} appointment deposit`,
        metadata: { ll_kind: "appointment_deposit", ll_id: a.id, merchant_id: merchant.id },
        idempotencyKey: `appt_deposit:${a.id}`,
        customerId,
        // Keeps the card for a late-cancel or no-show fee.
        setupFutureUsage: "off_session",
      });
  if (!a.depositPaymentIntentId) await ctx.db.update(appointments).set({ depositPaymentIntentId: pi.id }).where(eq(appointments.id, a.id));
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
}

async function cardSetup(ctx: AppContext, merchant: Merchant, a: Appointment): Promise<appointmentsApi.SetupRefDto> {
  const payments = getPayments(ctx);
  const scope = savedMethodScope(ctx, merchant);
  if (a.cardSetupIntentId) {
    const open = await payments.retrieveSetupIntent(a.cardSetupIntentId, scope);
    return { setupIntentId: open.id, clientSecret: open.clientSecret };
  }
  const customerId = await ensureCustomer(ctx, merchant, a);
  const si = await payments.createSetupIntent({ ...scope, customerId, metadata: { ll_kind: "appointment_setup", ll_id: a.id, merchant_id: merchant.id }, idempotencyKey: `appt_setup:${a.id}` });
  await ctx.db.update(appointments).set({ cardSetupIntentId: si.id }).where(eq(appointments.id, a.id));
  return { setupIntentId: si.id, clientSecret: si.clientSecret };
}

/** What a customer still has to do to keep a held booking. */
async function pendingPayment(ctx: AppContext, merchant: Merchant, a: Appointment): Promise<{ deposit: appointmentsApi.PaymentRefDto | null; setup: appointmentsApi.SetupRefDto | null }> {
  if (a.status !== "booked" || !a.holdExpiresAt) return { deposit: null, setup: null };
  if (a.depositCents > 0 && !a.depositPaidAt) return { deposit: await depositPayment(ctx, merchant, a), setup: null };
  if (!a.paymentMethodId && a.noShowFeeCents) return { deposit: null, setup: await cardSetup(ctx, merchant, a) };
  return { deposit: null, setup: null };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
async function localeOf(ctx: AppContext, userId: string): Promise<Locale> {
  const [u] = await ctx.db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return normalizeLocale(u?.locale) ?? "en";
}

function whenText(at: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALES[locale].bcp47, { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
}
function timeText(at: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALES[locale].bcp47, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
}

/** "Tue 3:15 p.m.": the one time format of a pharmacy reminder (weekday and time, nothing else). */
function weekdayTimeText(at: Date, tz: string, locale: Locale): string {
  // English writes "a.m." with a full stop; the sentence adds its own, so say "9:00 am" (the frame's "3:15 pm").
  return new Intl.DateTimeFormat(LOCALES[locale].bcp47, { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(at).replace(/\s?([ap])\.m\./i, (_, x: string) => ` ${x.toLowerCase()}m`);
}

/**
 * The fixed pharmacy reminder: the time, a link to change it, the STOP line. It names neither the shop nor what the appointment is for
 * (a lock screen must not show that someone uses a pharmacist), and the
 * same words go out the day before and two hours before, so what the booked screen shows is exactly what the phone gets.
 */
export function pharmacyReminderText(ctx: AppContext, m: Pick<Merchant, "name" | "slug" | "timezone">, a: Pick<Appointment, "id" | "startsAt">, locale: Locale): { body: string; sms: string } {
  const t = translator(locale);
  // In a right-to-left language the shop name, the time and the link are isolated, so the Latin runs do not reorder the sentence around them.
  const iso = (x: string) => (LOCALES[locale].dir === "rtl" ? `\u2068${x}\u2069` : x);
  const body = t("rx.appt.reminder", { when: iso(weekdayTimeText(a.startsAt, m.timezone, locale)), link: iso(manageLink(ctx, m, a)) });
  return { body, sms: `${body} ${t("bk.msg.stop")}` };
}

const manageLink = (ctx: AppContext, m: Pick<Merchant, "slug">, a: Pick<Appointment, "id">) => `${ctx.config.publicWebUrl}/shops/${m.slug}/book/${a.id}`;

/** The confirmation: a home studio's confirmation is where the client first gets the street address (phase-solo B, §2.3 rule 2). */
async function confirmedText(ctx: AppContext, merchant: Merchant, a: Appointment, t: ReturnType<typeof translator>, locale: Locale): Promise<string> {
  const vars = { shop: merchant.name, when: whenText(a.startsAt, merchant.timezone, locale), link: manageLink(ctx, merchant, a) };
  const [loc] = await ctx.db.select({ address: locations.address, addressVisibility: locations.addressVisibility }).from(locations).where(eq(locations.id, a.locationId)).limit(1);
  const address = loc && isAddressPrivate(loc.addressVisibility) ? releasedAddress(loc, a) : null;
  return address ? t("bk.msg.confirmedAddress", { ...vars, address }) : t("bk.msg.confirmed", vars);
}

async function notifyConfirmed(ctx: AppContext, merchant: Merchant, a: Appointment) {
  if (!a.userId) return;
  const locale = await localeOf(ctx, a.userId);
  const t = translator(locale);
  // A pharmacy confirmation, like its reminder, names neither the shop nor the service: it can show on a lock screen.
  const rx = isPharmacy(merchant);
  const body = rx
    ? t("rx.appt.confirmed", { when: whenText(a.startsAt, merchant.timezone, locale), link: manageLink(ctx, merchant, a) })
    : await confirmedText(ctx, merchant, a, t, locale);
  // phase-solo D: the ladder (app, web push, email, then a one-segment text inside the plan's texts).
  const textBody = rx ? `${body} ${t("bk.msg.stop")}` : await oneSegmentText(ctx, t, "bk.msg.textBooked", { shop: merchant.name, when: whenText(a.startsAt, merchant.timezone, locale), address: await textAddress(ctx, a), link: shortManageLink(ctx) });
  await deliverAppointmentMessage(ctx, { a, merchant, title: rx ? t("rx.appt.titleBooked") : t("bk.msg.confirmedTitle", { shop: merchant.name }), body, textBody, kind: "appointment_confirmed" });
}

// ---------------------------------------------------------------------------
// Booking (customer)
// ---------------------------------------------------------------------------
export async function createMine(ctx: AppContext, userId: string, body: z.output<typeof appointmentsApi.createMyAppointmentBody>): Promise<appointmentsApi.CreateMyAppointmentResponse> {
  const ids = [...new Set(body.serviceIds)];
  const found = await ctx.db.select({ id: services.id, merchantId: services.merchantId }).from(services).where(inArray(services.id, ids));
  if (found.length !== ids.length || new Set(found.map((f) => f.merchantId)).size !== 1) throw badRequest("Pick services from one shop");
  const merchant = await loadMerchant(ctx.db, found[0]!.merchantId);
  if (!merchant || merchant.status === "closed") throw notFound("Shop");
  await requireFeature(ctx.db, merchant, "booking.appointments");
  const now = ctx.now();
  await expireHolds(ctx, { merchantId: merchant.id });
  const [open] = await ctx.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(appointments).where(and(eq(appointments.userId, userId), eq(appointments.status, "booked"), isNotNull(appointments.holdExpiresAt), gt(appointments.holdExpiresAt, now)));
  if ((open?.n ?? 0) >= MAX_OPEN_HOLDS) throw tooMany("Finish or wait out your open bookings first");

  const startsAt = new Date(body.startsAt);
  const loc = await resolveLocation(ctx.db, merchant.id, body.locationId);
  const { staffId } = await assertBookable(ctx, merchant, { serviceIds: body.serviceIds, staffId: body.staffId ?? null, startsAt, locationId: loc.id });
  const svcs = await loadAppointmentServices(ctx.db, merchant.id, body.serviceIds, { requireActive: true });
  const overrides = await ctx.db.select().from(staffServices).where(and(eq(staffServices.merchantId, merchant.id), eq(staffServices.userId, staffId)));
  const r = itemsFor(svcs, staffId, overrides);
  const rx = isPharmacy(merchant);
  // A pharmacy appointment is free to book: no deposit, no card on file, no no-show fee, no notes (a note is where health information would go).
  assertNoPharmacyNotes(merchant, body.notes);
  if (rx) {
    r.items = r.items.map((i) => ({ ...i, priceCents: 0 }));
    r.totalCents = 0;
    r.depositCents = 0;
  }
  // Their first name, when the account has none: the shop sees "Aisha" on the calendar, not "Walk-in".
  const first = body.customerName?.trim().split(/\s+/)[0] ?? null;
  const [who] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (first && !who?.name?.trim()) await ctx.db.update(users).set({ name: first }).where(eq(users.id, userId));
  // A pet picked at booking must be the customer's own.
  let petId: string | null = null;
  if (body.petId) {
    const [pet] = await ctx.db.select({ id: pets.id }).from(pets).where(and(eq(pets.id, body.petId), eq(pets.userId, userId))).limit(1);
    if (!pet) throw badRequest("Pick one of your own pets");
    petId = pet.id;
  }
  const cardsOk = await appointmentPaymentsReady(ctx, merchant); // phase-solo A: deposits on the free calendar (direct charges); keep when editing
  const deposit = cardsOk && r.depositCents >= MIN_CHARGE_CENTS ? r.depositCents : 0;
  const fee = rx ? 0 : merchant.noShowFeeCents;
  const hold = deposit > 0 || (cardsOk && fee > 0);
  const row = await guardOverlap(async () => {
    const [a] = await ctx.db
      .insert(appointments)
      .values({
        merchantId: merchant.id,
        locationId: loc.id,
        userId,
        customerName: who?.name?.trim() || first,
        petId,
        staffId,
        requestedStaff: !!body.staffId,
        source: "online",
        items: r.items,
        startsAt,
        endsAt: new Date(startsAt.getTime() + r.blockMin * MIN),
        status: "booked",
        groupId: body.groupId ?? null,
        clientNote: body.notes ?? null,
        intakeAnswer: rx ? null : (body.intakeAnswer ?? null), // phase-solo D
        depositCents: deposit,
        noShowFeeCents: fee > 0 ? fee : null,
        holdExpiresAt: hold ? new Date(now.getTime() + HOLD_MINUTES * MIN) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return a!;
  });
  let pay: Awaited<ReturnType<typeof pendingPayment>>;
  try {
    pay = await pendingPayment(ctx, merchant, row);
  } catch (err) {
    // The provider refused the deposit or card setup: the customer sees an error, so do not leave their time held (it would block a retry and count as an open booking).
    await ctx.db.update(appointments).set({ status: "cancelled", cancelledAt: now, cancelReason: "payment_setup_failed", holdExpiresAt: null, updatedAt: now }).where(eq(appointments.id, row.id));
    throw err;
  }
  const [fresh] = await ctx.db.select().from(appointments).where(eq(appointments.id, row.id)).limit(1);
  if (!hold) await notifyConfirmed(ctx, merchant, fresh!);
  return { appointment: (await myDtos(ctx, [fresh!]))[0]!, deposit: pay.deposit, setup: pay.setup, confirmed: !hold };
}

export async function getMine2(ctx: AppContext, userId: string, id: string): Promise<appointmentsApi.MyAppointmentResponse> {
  const a = await getMine(ctx, userId, id);
  const merchant = (await loadMerchant(ctx.db, a.merchantId))!;
  const pay = a.holdExpiresAt && a.holdExpiresAt > ctx.now() ? await pendingPayment(ctx, merchant, a) : { deposit: null, setup: null };
  return { appointment: (await myDtos(ctx, [a]))[0]!, ...pay };
}

// ---------------------------------------------------------------------------
// Webhooks: the deposit or the card confirms the hold
// ---------------------------------------------------------------------------
export interface PaidWith {
  paymentMethodId?: string | null;
  customerId?: string | null;
}

async function refundDeposit(ctx: AppContext, merchant: Merchant, a: Appointment, reason: string) {
  if (!a.depositPaidAt || !a.depositPaymentIntentId || a.depositCents <= 0) return false;
  try {
    await refundConnectPayment(ctx, merchant, { paymentIntentId: a.depositPaymentIntentId, amountCents: a.depositCents, idempotencyKey: `appt_deposit:${a.id}:refund`, reason });
    return true;
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[appointments] deposit refund failed", err);
    return false;
  }
}

/** Stripe webhook (ll_kind appointment_deposit): deposit paid confirms the hold, even if it just lapsed and the chair is still free. */
export async function onDeposit(ctx: AppContext, id: string, paymentIntentId: string, outcome: "succeeded" | "failed" | "processing", paid: PaidWith = {}): Promise<void> {
  const [a] = await ctx.db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  if (!a || a.depositPaidAt) return;
  if (a.depositPaymentIntentId && a.depositPaymentIntentId !== paymentIntentId) return;
  const now = ctx.now();
  if (outcome === "processing") {
    // A bank debit takes days: keep the chair while it settles.
    if (a.depositProcessingAt || a.status !== "booked") return;
    await ctx.db.update(appointments).set({ depositProcessingAt: now, holdExpiresAt: new Date(now.getTime() + 3 * 24 * HOUR), updatedAt: now }).where(and(eq(appointments.id, a.id), isNull(appointments.depositProcessingAt)));
    return;
  }
  if (outcome === "failed") {
    if (a.depositProcessingAt && a.status === "booked") await ctx.db.update(appointments).set({ depositProcessingAt: null, holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * MIN), updatedAt: now }).where(eq(appointments.id, a.id));
    return;
  }
  const patch = {
    depositPaidAt: now,
    depositPaymentIntentId: paymentIntentId,
    depositProcessingAt: null,
    paymentMethodId: paid.paymentMethodId ?? a.paymentMethodId,
    stripeCustomerId: paid.customerId ?? a.stripeCustomerId,
    updatedAt: now,
  };
  const merchant = (await loadMerchant(ctx.db, a.merchantId))!;
  if (a.status === "booked") {
    const [row] = await ctx.db.update(appointments).set({ ...patch, holdExpiresAt: null }).where(and(eq(appointments.id, a.id), eq(appointments.status, "booked"))).returning();
    if (row) await notifyConfirmed(ctx, merchant, row);
    return;
  }
  if (a.status === "cancelled" && a.cancelReason === "hold_expired") {
    // Paid just after the hold lapsed: take the chair back if nobody else did, otherwise return the money.
    try {
      const row = await guardOverlap(async () => (await ctx.db.update(appointments).set({ ...patch, status: "booked", cancelledAt: null, cancelReason: null, holdExpiresAt: null }).where(and(eq(appointments.id, a.id), eq(appointments.status, "cancelled"))).returning())[0]);
      if (row) await notifyConfirmed(ctx, merchant, row);
    } catch (err) {
      if (!(err instanceof HttpError) || err.code !== "slot_taken") throw err;
      await ctx.db.update(appointments).set(patch).where(eq(appointments.id, a.id));
      await refundDeposit(ctx, merchant, { ...a, ...patch }, "slot_taken_after_hold");
      if (a.userId) {
        await notifyCustomer(ctx, { userId: a.userId, merchantId: merchant.id, title: `${merchant.name}: that time was taken`, body: `Your payment arrived after the 10-minute hold ended and the time was booked by someone else. Your ${money(a.depositCents)} deposit is being refunded. Please pick another time.`, data: { type: "appointment_hold_lost", appointmentId: a.id } });
      }
    }
    return;
  }
  await ctx.db.update(appointments).set(patch).where(eq(appointments.id, a.id));
}

/** Stripe webhook (ll_kind appointment_setup): a card saved, which confirms a booking that only needed a card. */
export async function onCardSaved(ctx: AppContext, id: string, setupIntentId: string, paymentMethodId: string): Promise<void> {
  const [a] = await ctx.db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  if (!a) return;
  if (a.cardSetupIntentId && a.cardSetupIntentId !== setupIntentId) return;
  if (a.paymentMethodId === paymentMethodId) return;
  const now = ctx.now();
  const merchant = (await loadMerchant(ctx.db, a.merchantId))!;
  if (a.status === "booked" && a.holdExpiresAt) {
    const [row] = await ctx.db.update(appointments).set({ paymentMethodId, holdExpiresAt: null, updatedAt: now }).where(and(eq(appointments.id, a.id), eq(appointments.status, "booked"))).returning();
    if (row) await notifyConfirmed(ctx, merchant, row);
    return;
  }
  if (a.status === "cancelled" && a.cancelReason === "hold_expired") {
    try {
      const row = await guardOverlap(async () => (await ctx.db.update(appointments).set({ paymentMethodId, status: "booked", cancelledAt: null, cancelReason: null, holdExpiresAt: null, updatedAt: now }).where(and(eq(appointments.id, a.id), eq(appointments.status, "cancelled"))).returning())[0]);
      if (row) await notifyConfirmed(ctx, merchant, row);
    } catch (err) {
      if (!(err instanceof HttpError) || err.code !== "slot_taken") throw err;
    }
    return;
  }
  await ctx.db.update(appointments).set({ paymentMethodId, updatedAt: now }).where(eq(appointments.id, a.id));
}

// ---------------------------------------------------------------------------
// The fee
// ---------------------------------------------------------------------------
/** What a late change or no-show costs now: the shop's fee less a deposit the customer already paid (which is kept). */
export function feeDue(a: Pick<Appointment, "noShowFeeCents" | "depositCents" | "depositPaidAt">, merchant: Pick<Merchant, "noShowFeeCents">): number {
  const fee = a.noShowFeeCents ?? merchant.noShowFeeCents;
  const credit = a.depositPaidAt ? a.depositCents : 0;
  return Math.max(0, fee - credit);
}

/**
 * Charge the fee to the card the customer saved. Idempotent: a fee already charged is never charged again
 * (and the provider key repeats the same charge if a retry races). 409 no_card_on_file without a saved card.
 */
export async function chargeFee(ctx: AppContext, merchant: Merchant, a: Appointment, reason: string): Promise<{ charged: boolean; cents: number }> {
  if (isPharmacy(merchant)) return { charged: false, cents: 0 };
  const cents = feeDue(a, merchant);
  if (a.feeChargedAt) return { charged: true, cents };
  if (cents === 0) {
    if ((a.noShowFeeCents ?? merchant.noShowFeeCents) > 0) return { charged: false, cents: 0 }; // the deposit covers it
    throw new HttpError(409, "no_fee", "This shop doesn't charge a no-show fee.");
  }
  if (!a.paymentMethodId || !a.stripeCustomerId) throw new HttpError(409, "no_card_on_file", "There's no card on file for this client, so the fee can't be charged.");
  if (cents < MIN_CHARGE_CENTS) return { charged: false, cents: 0 };
  const accountId = merchant.stripeAccountId;
  if (!accountId) throw new HttpError(409, "no_card_on_file", "This shop can't take card payments yet.");
  const r = await chargeConnectSavedMethod(ctx, merchant, {
    amountCents: cents,
    connectedAccountId: accountId,
    applicationFeeCents: platformFeeFor("deposit", cents, merchant),
    description: `${merchant.name} ${reason} fee`,
    metadata: { ll_kind: "appointment_fee", ll_id: a.id, merchant_id: merchant.id },
    idempotencyKey: `appt_fee:${a.id}`,
    customerId: a.stripeCustomerId,
    paymentMethodId: a.paymentMethodId,
  });
  if (r.outcome !== "succeeded" && r.outcome !== "processing") throw new HttpError(409, "fee_charge_failed", r.message ?? "The card was declined.", { outcome: r.outcome });
  await ctx.db.update(appointments).set({ feeChargedAt: ctx.now(), updatedAt: ctx.now() }).where(and(eq(appointments.id, a.id), isNull(appointments.feeChargedAt)));
  return { charged: true, cents };
}

// ---------------------------------------------------------------------------
// Customer: cancel and reschedule
// ---------------------------------------------------------------------------
const insideWindow = (a: Appointment, m: Merchant, now: Date) => a.startsAt.getTime() - now.getTime() < m.cancelWindowHours * HOUR;

export async function cancelMine(ctx: AppContext, userId: string, id: string): Promise<appointmentsApi.MyAppointmentChangeResponse> {
  const a = await getMine(ctx, userId, id);
  if (a.status !== "booked") throw conflict(`This appointment is ${a.status.replace("_", " ")}`);
  const merchant = (await loadMerchant(ctx.db, a.merchantId))!;
  const now = ctx.now();
  const confirmed = !a.holdExpiresAt;
  const late = confirmed && insideWindow(a, merchant, now);
  let fee = { charged: false, cents: 0 };
  if (late && a.startsAt > now) {
    // A saved card pays the fee; without one the shop just keeps the slot empty.
    fee = a.paymentMethodId ? await chargeFee(ctx, merchant, a, "late-cancel").catch((err) => {
      if (err instanceof HttpError && err.code === "fee_charge_failed") return { charged: false, cents: 0 };
      throw err;
    }) : { charged: false, cents: 0 };
  }
  const [row] = await ctx.db.update(appointments).set({ status: "cancelled", cancelledAt: now, cancelReason: late ? "late_cancel" : "customer", holdExpiresAt: null, updatedAt: now }).where(and(eq(appointments.id, a.id), eq(appointments.status, "booked"))).returning();
  if (!row) throw conflict("This appointment was just updated. Refresh and try again.");
  if (!late) await refundDeposit(ctx, merchant, a, "requested_by_customer");
  return { appointment: (await myDtos(ctx, [row]))[0]!, feeCharged: fee.charged, feeCents: fee.cents };
}

export async function rescheduleMine(ctx: AppContext, userId: string, id: string, body: z.output<typeof appointmentsApi.rescheduleMyAppointmentBody>): Promise<appointmentsApi.MyAppointmentChangeResponse> {
  const a = await getMine(ctx, userId, id);
  if (a.status !== "booked" || a.holdExpiresAt) throw conflict(a.holdExpiresAt ? "Finish booking first" : `This appointment is ${a.status.replace("_", " ")}`);
  const merchant = (await loadMerchant(ctx.db, a.merchantId))!;
  await requireFeature(ctx.db, merchant, "booking.appointments");
  const now = ctx.now();
  const late = insideWindow(a, merchant, now) && a.startsAt > now;
  const startsAt = new Date(body.startsAt);
  const serviceIds = a.items.map((i) => i.serviceId).filter((s): s is string => !!s);
  if (!serviceIds.length) throw badRequest("This booking can't be moved online. Call the shop.");
  const wanted = body.staffId === undefined ? (a.requestedStaff ? a.staffId : null) : (body.staffId ?? null);
  const { staffId } = await assertBookable(ctx, merchant, { serviceIds, staffId: wanted, startsAt, locationId: a.locationId }, { excludeAppointmentId: a.id });
  const svcs = await loadAppointmentServices(ctx.db, merchant.id, serviceIds);
  const overrides = await ctx.db.select().from(staffServices).where(and(eq(staffServices.merchantId, merchant.id), eq(staffServices.userId, staffId)));
  const r = itemsFor(svcs, staffId, overrides);
  let fee = { charged: false, cents: 0 };
  if (late && a.paymentMethodId) {
    fee = await chargeFee(ctx, merchant, a, "late-change").catch((err) => {
      if (err instanceof HttpError && err.code === "fee_charge_failed") return { charged: false, cents: 0 };
      throw err;
    });
  }
  const row = await guardOverlap(async () =>
    (await ctx.db.update(appointments).set({ staffId, requestedStaff: wanted !== null, items: r.items, startsAt, endsAt: new Date(startsAt.getTime() + r.blockMin * MIN), reminder24SentAt: null, reminder2SentAt: null, updatedAt: now }).where(and(eq(appointments.id, a.id), eq(appointments.status, "booked"))).returning())[0],
  );
  if (!row) throw conflict("This appointment was just updated. Refresh and try again.");
  await notifyConfirmed(ctx, merchant, row);
  return { appointment: (await myDtos(ctx, [row]))[0]!, feeCharged: fee.charged, feeCents: fee.cents };
}

// ---------------------------------------------------------------------------
// Staff: status
// ---------------------------------------------------------------------------
const TRANSITIONS: Record<string, readonly appointmentsApi.AppointmentStatus[]> = {
  booked: ["arrived", "in_service", "completed", "no_show", "cancelled"],
  arrived: ["in_service", "completed", "no_show", "cancelled"],
  in_service: ["completed"],
};

export async function setStatus(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof appointmentsApi.appointmentStatusBody>): Promise<appointmentsApi.StatusResponse> {
  const merchant = staff.merchant;
  const cur = await getAppointment(ctx.db, merchant.id, id);
  const now = ctx.now();
  // Charging a fee on a no-show that already happened is the one repeat allowed.
  if (cur.status === "no_show" && body.status === "no_show" && body.chargeFee) {
    const fee = await chargeFee(ctx, merchant, cur, "no-show");
    return { appointment: await appointmentDto(ctx.db, (await getAppointment(ctx.db, merchant.id, id))), feeCharged: fee.charged, feeCents: fee.cents };
  }
  if (!TRANSITIONS[cur.status]?.includes(body.status)) throw conflict(`An appointment that is ${cur.status.replace("_", " ")} can't become ${body.status.replace("_", " ")}`);
  if (body.status === "no_show" && cur.startsAt > now) throw new HttpError(409, "not_started", "This appointment hasn't started yet.");
  const patch: Partial<typeof appointments.$inferInsert> = { status: body.status, updatedAt: now };
  if (body.status === "arrived") patch.arrivedAt = now;
  if (body.status === "in_service") {
    patch.startedAt = now;
    if (!cur.arrivedAt) patch.arrivedAt = now;
  }
  if (body.status === "completed") patch.completedAt = now;
  if (body.status === "cancelled") {
    patch.cancelledAt = now;
    patch.cancelReason = body.reason ?? "shop";
    patch.holdExpiresAt = null;
  }
  const [row] = await ctx.db.update(appointments).set(patch).where(and(eq(appointments.id, cur.id), eq(appointments.status, cur.status))).returning();
  if (!row) throw conflict("This appointment was just updated. Refresh and try again.");
  let fee = { charged: false, cents: 0 };
  if (body.status === "no_show" && body.chargeFee) {
    // The no-show stands even if the card can't be charged; staff can retry.
    fee = await chargeFee(ctx, merchant, row, "no-show");
  }
  if (body.status === "cancelled" && cur.depositPaidAt) await refundDeposit(ctx, merchant, cur, "requested_by_customer");
  if (body.status === "completed") await autoSetPreferred(ctx, row.userId, merchant.id, row.staffId);
  return { appointment: await appointmentDto(ctx.db, (await getAppointment(ctx.db, merchant.id, id))), feeCharged: fee.charged, feeCents: fee.cents };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
/**
 * Text and push the customer 24 hours and 2 hours before. Transactional only (shop, time, address, change
 * link, STOP); a booking made inside 24 hours gets only the 2-hour one. Claims each row first so two
 * workers never double-send.
 */
export async function sendReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const horizon = new Date(now.getTime() + 24 * HOUR);
  const due = await ctx.db
    .select({ a: appointments, m: merchants })
    .from(appointments)
    .innerJoin(merchants, eq(merchants.id, appointments.merchantId))
    .where(and(eq(appointments.status, "booked"), isNull(appointments.holdExpiresAt), isNotNull(appointments.userId), gt(appointments.startsAt, now), lte(appointments.startsAt, horizon)))
    .orderBy(asc(appointments.startsAt))
    .limit(500);
  let sent = 0;
  for (const { a, m } of due) {
    const untilMs = a.startsAt.getTime() - now.getTime();
    const near = untilMs <= 2 * HOUR;
    const col = near ? "reminder2SentAt" : "reminder24SentAt";
    if (a[col]) continue;
    // Booked inside the 24-hour mark: skip the day-before text.
    const skip24 = !near && a.startsAt.getTime() - a.createdAt.getTime() <= 24 * HOUR;
    const claimed = await ctx.db
      .update(appointments)
      .set(near ? { reminder2SentAt: now, reminder24SentAt: a.reminder24SentAt ?? now } : { reminder24SentAt: now })
      .where(and(eq(appointments.id, a.id), isNull(appointments[col]), eq(appointments.status, "booked")))
      .returning({ id: appointments.id });
    if (!claimed.length || skip24) continue;
    const [loc] = await ctx.db.select({ address: locations.address }).from(locations).where(eq(locations.id, a.locationId)).limit(1);
    const locale = await localeOf(ctx, a.userId!);
    const t = translator(locale);
    // A reminder on a lock screen must not say why someone is going to a pharmacy: it says "appointment".
    const vars = { service: isPharmacy(m) ? t("rx.appt.word") : a.items.map((i) => i.name).join(", ") || "-", shop: m.name, when: near ? timeText(a.startsAt, m.timezone, locale) : whenText(a.startsAt, m.timezone, locale), address: loc?.address ?? "", link: manageLink(ctx, m, a) };
    const fixed = isPharmacy(m) ? pharmacyReminderText(ctx, m, a, locale) : null;
    const body = fixed?.body ?? t(near ? "bk.msg.remind2" : "bk.msg.remind24", vars);
    // phase-solo D: the ladder; the text (last rung) is one segment: shop, service, time, the address when it fits, a short link, STOP.
    const textBody = fixed?.sms ?? (await oneSegmentText(ctx, t, near ? "bk.msg.text2" : "bk.msg.text24", { shop: m.name, service: vars.service, when: vars.when, address: vars.address, link: shortManageLink(ctx) }));
    await deliverAppointmentMessage(ctx, { a, merchant: m, title: isPharmacy(m) ? t("rx.appt.titleReminder") : t(near ? "bk.msg.remind2Title" : "bk.msg.remind24Title", { shop: m.name }), body, textBody, kind: near ? "appointment_reminder_2h" : "appointment_reminder_24h" });
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// ---- phase-solo: D ---- Appointment messages through the channel ladder, one-segment reminder texts
// ---------------------------------------------------------------------------
/** The link in a text: the customer's own page (it lists the visit with Change and Cancel), without the scheme, to fit one segment. */
export const shortManageLink = (ctx: AppContext) => `${ctx.config.publicWebUrl.replace(/^https?:\/\//, "")}/me`;

async function textAddress(ctx: AppContext, a: Appointment): Promise<string> {
  const [loc] = await ctx.db.select({ address: locations.address, addressVisibility: locations.addressVisibility }).from(locations).where(eq(locations.id, a.locationId)).limit(1);
  return releasedAddress(loc, a) ?? "";
}

/**
 * A reminder text in one segment (160 GSM-7 characters; 70 for a text in Urdu, Hindi or Punjabi script, where it is as short as we
 * can make it). Drops the address, then the service, then shortens the shop name, until it fits. The STOP line always stays.
 */
export async function oneSegmentText(
  _ctx: AppContext,
  t: ReturnType<typeof translator>,
  key: "bk.msg.text24" | "bk.msg.text2" | "bk.msg.textBooked",
  v: { shop: string; service?: string; when: string; address?: string; link: string },
): Promise<string> {
  const stop = t("bk.msg.textStop");
  const build = (o: { shop: string; service?: string; address?: string }) => {
    const at = o.address?.trim() ? t("bk.msg.textAt", { address: o.address.trim() }) : "";
    const body = t(key, { shop: o.shop, service: o.service ?? "", when: v.when, at, link: v.link }).replace(/:\s*,\s*/, ": ").replace(/\s{2,}/g, " ");
    return `${body} ${stop}`;
  };
  const shortShop = v.shop.length > 20 ? `${v.shop.slice(0, 19).trimEnd()}.` : v.shop;
  const tries = [
    build({ shop: v.shop, service: v.service, address: v.address }),
    build({ shop: v.shop, service: v.service }),
    build({ shop: v.shop, service: key === "bk.msg.text24" ? "" : v.service }),
    build({ shop: shortShop }),
  ];
  return tries.find((x) => smsSegments(x) <= 1) ?? tries.at(-1)!;
}

/** One appointment message: the in-app row, then the first rung that reaches the client (services/notifications.ts deliverByLadder). */
async function deliverAppointmentMessage(ctx: AppContext, m: { a: Appointment; merchant: Merchant; title: string; body: string; textBody: string; kind: string }) {
  if (!m.a.userId) return;
  await deliverByLadder(ctx, {
    userId: m.a.userId,
    merchantId: m.merchant.id,
    type: "booking_reminder",
    title: m.title,
    body: m.body,
    textBody: m.textBody,
    data: { type: m.kind, appointmentId: m.a.id, startsAt: m.a.startsAt.toISOString() },
    url: `/shops/${m.merchant.slug}/book/${m.a.id}`,
  });
}
// ---- end phase-solo: D ----
