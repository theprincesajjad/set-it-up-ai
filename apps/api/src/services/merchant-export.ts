/**
 * The owner's export of Merchant Customer Data (merchant agreement 2.1): one CSV per kind of record
 * (MERCHANT_EXPORTS in @ll/shared lists them) and a ZIP of all of them. Every query is scoped to the one merchant.
 *
 * Who may download: any paid plan (customers.csv_export) and, for 90 days after the shop closed or fell back to
 * Free, the owner (leaver-export.ts#requireCsvExport). The routes live in routes/merchant/exports.ts.
 *
 * Rules the files follow:
 *  - Accounts a customer deleted carry no name, phone, email or birthday (the rows stay for the shop's accounts).
 *  - Nothing that would let someone act as the customer or on our behalf: approval and pay links, status tokens,
 *    review tokens, signature IP and device, Stripe and payment-method identifiers.
 *  - Consent is carried, not hidden: members.csv has the marketing consent (when, how, the exact wording), the shop
 *    mute, and the STOP list for text and WhatsApp; reviews.csv has `may_follow_up` (consent given, not muted, not
 *    STOPped) so a file of reviews cannot be used to message people who said no.
 *  - Repair-ticket photos are files, not links: the ZIP carries them under photos/, the tickets CSV names them.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import {
  appointments,
  cateringEvents,
  classBookings,
  classCharges,
  classMemberships,
  classPasses,
  classSessions,
  commOptOuts,
  hallBookings,
  halls,
  invoices,
  locations,
  merchantMembers,
  messageDeliveries,
  messages,
  orderItems,
  orders,
  phoneCalls,
  quotes,
  reviewRequests,
  serviceTickets,
  tiffinDeliveries,
  tiffinPlans,
  tiffinSubscriptions,
  users,
  vipLevels,
  visits,
  whatsappMessages,
  whatsappSessions,
} from "@ll/db";
import { MERCHANT_EXPORTS, type MerchantExportKey } from "@ll/shared";
import type { AppContext } from "../context.js";
import { notFound } from "../lib/errors.js";
import { getStorage, storageKeyFromUrl } from "../providers/storage.js";
import { toCsv } from "./csv.js";
import { exportTransactionsCsv } from "./merchant-customers.js";

type Cell = string | number | boolean | null | undefined | Date;
const dollars = (c: number | null | undefined): string | null => (c == null ? null : (c / 100).toFixed(2));
const json = (v: unknown): string | null => (v == null || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length) ? null : JSON.stringify(v));

interface Person {
  name: string | null;
  phone: string | null;
  email: string | null;
}
const NOBODY: Person = { name: null, phone: null, email: null };

/** Name, phone and email by user id; a deleted account is nobody. */
async function peopleById(ctx: AppContext, ids: (string | null | undefined)[]): Promise<Map<string, Person>> {
  const list = [...new Set(ids.filter((i): i is string => !!i))];
  const out = new Map<string, Person>();
  for (let i = 0; i < list.length; i += 500) {
    const rows = await ctx.db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email, deletedAt: users.deletedAt }).from(users).where(inArray(users.id, list.slice(i, i + 500)));
    for (const r of rows) out.set(r.id, r.deletedAt ? NOBODY : { name: r.name, phone: r.phone, email: r.email });
  }
  return out;
}
const who = (m: Map<string, Person>, id: string | null | undefined): Person => (id ? m.get(id) ?? NOBODY : NOBODY);
/** A name typed at the desk belongs to a walk-in; once the account it was typed for is deleted it is personal data too. */
const deskName = (m: Map<string, Person>, userId: string | null | undefined, typed: string | null | undefined): string | null => (userId && m.get(userId) === NOBODY ? null : typed ?? who(m, userId).name);

/** Normalised phone numbers currently STOPped on a channel. */
async function stopped(ctx: AppContext, channel: "sms" | "whatsapp"): Promise<Set<string>> {
  const rows = await ctx.db.select({ phone: commOptOuts.phone, resub: commOptOuts.resubscribedAt }).from(commOptOuts).where(eq(commOptOuts.channel, channel));
  return new Set(rows.filter((r) => !r.resub).map((r) => r.phone));
}

type Build = (ctx: AppContext, merchantId: string, files?: Map<string, Uint8Array>) => Promise<string>;

const BUILDERS: Record<MerchantExportKey, Build> = {
  async members(ctx, merchantId) {
    const rows = await ctx.db
      .select({ m: merchantMembers, u: users, vip: vipLevels.name })
      .from(merchantMembers)
      .innerJoin(users, eq(users.id, merchantMembers.userId))
      .leftJoin(vipLevels, eq(vipLevels.id, merchantMembers.vipLevelId))
      .where(eq(merchantMembers.merchantId, merchantId))
      .orderBy(asc(merchantMembers.createdAt), asc(merchantMembers.id));
    const [sms, wa] = await Promise.all([stopped(ctx, "sms"), stopped(ctx, "whatsapp")]);
    return toCsv(
      ["member_id", "name", "phone", "email", "member_code", "balance", "lifetime_points", "visits", "total_spend", "last_visit_at", "joined_at", "joined_via", "vip_level", "tags", "birthday", "marketing_consent_at", "marketing_consent_source", "marketing_consent_text", "muted", "stopped_sms", "stopped_whatsapp", "notes"],
      rows.map(({ m, u, vip }) => {
        const gone = !!u.deletedAt;
        return [
          m.id, gone ? null : u.name, gone ? null : u.phone, gone ? null : u.email, u.memberCode, m.balance, m.lifetimePoints, m.visitCount, dollars(Number(m.totalSpendCents)), m.lastVisitAt, m.createdAt, m.joinedVia, vip, m.tags.join(";"),
          gone ? null : u.birthday, m.marketingConsentAt, m.marketingConsentSource, m.marketingConsentText, m.muted, !gone && !!u.phone && sms.has(u.phone), !gone && !!u.phone && wa.has(u.phone), gone ? null : m.notes,
        ];
      }),
    );
  },

  async visits(ctx, merchantId) {
    const rows = await ctx.db.select({ v: visits, locationName: locations.name }).from(visits).leftJoin(locations, eq(locations.id, visits.locationId)).where(eq(visits.merchantId, merchantId)).orderBy(asc(visits.createdAt), asc(visits.id));
    const p = await peopleById(ctx, rows.map((r) => r.v.userId));
    return toCsv(["visit_id", "visited_at", "member_id", "customer_name", "phone", "location", "source", "amount"], rows.map(({ v, locationName }) => [v.id, v.createdAt, v.memberId, who(p, v.userId).name, who(p, v.userId).phone, locationName, v.source, dollars(v.amountCents)]));
  },

  "points-ledger": (ctx, merchantId) => exportTransactionsCsv(ctx, merchantId),

  async orders(ctx, merchantId) {
    const rows = await ctx.db.select().from(orders).where(eq(orders.merchantId, merchantId)).orderBy(asc(orders.createdAt), asc(orders.id));
    const p = await peopleById(ctx, rows.map((o) => o.userId));
    return toCsv(
      ["order_id", "number", "created_at", "customer_name", "phone", "status", "kind", "channel", "pickup_at", "ready_at", "picked_up_at", "subtotal", "discount", "tax", "tip", "total", "customer_fee", "cash_discount", "deposit", "deposit_paid_at", "payment_status", "payment_method", "paid_at", "points_earned", "notes", "allergy_note", "cancel_reason"],
      rows.map((o) => [o.id, o.number, o.createdAt, who(p, o.userId).name, who(p, o.userId).phone, o.status, o.kind, o.channel, o.pickupAt, o.readyAt, o.pickedUpAt, dollars(o.subtotalCents), dollars(o.discountCents), dollars(o.taxCents), dollars(o.tipCents), dollars(o.totalCents), dollars(o.customerFeeCents), dollars(o.cashDiscountCents), dollars(o.depositCents), o.depositPaidAt, o.paymentStatus, o.paymentMethod, o.paidAt, o.pointsEarned, o.notes, o.allergyNote, o.cancelReason]),
    );
  },

  async "order-items"(ctx, merchantId) {
    const rows = await ctx.db.select({ i: orderItems, number: orders.number }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(eq(orders.merchantId, merchantId)).orderBy(asc(orders.createdAt), asc(orders.id), asc(orderItems.id));
    return toCsv(["order_id", "order_number", "item_id", "name", "quantity", "unit_price", "line_total", "modifiers", "station", "kitchen_status", "notes"], rows.map(({ i, number }) => [i.orderId, number, i.id, i.name, i.quantity, dollars(i.unitPriceCents), dollars(i.unitPriceCents * i.quantity + i.modifiers.reduce((s, m) => s + m.priceCents, 0) * i.quantity), json(i.modifiers), i.station, i.kitchenStatus, i.notes]));
  },

  async appointments(ctx, merchantId) {
    const rows = await ctx.db.select({ a: appointments, locationName: locations.name }).from(appointments).leftJoin(locations, eq(locations.id, appointments.locationId)).where(eq(appointments.merchantId, merchantId)).orderBy(asc(appointments.startsAt), asc(appointments.id));
    const p = await peopleById(ctx, rows.map((r) => r.a.userId));
    return toCsv(
      ["appointment_id", "starts_at", "ends_at", "customer_name", "phone", "location", "status", "source", "services", "deposit", "deposit_paid_at", "no_show_fee", "fee_charged_at", "arrived_at", "completed_at", "cancelled_at", "cancel_reason", "notes", "client_note", "created_at"],
      rows.map(({ a, locationName }) => [a.id, a.startsAt, a.endsAt, deskName(p, a.userId, a.customerName), who(p, a.userId).phone, locationName, a.status, a.source, json(a.items), dollars(a.depositCents), a.depositPaidAt, dollars(a.noShowFeeCents), a.feeChargedAt, a.arrivedAt, a.completedAt, a.cancelledAt, a.cancelReason, a.notes, a.clientNote, a.createdAt]),
    );
  },

  async classes(ctx, merchantId) {
    const rows = await ctx.db.select({ s: classSessions, locationName: locations.name }).from(classSessions).leftJoin(locations, eq(locations.id, classSessions.locationId)).where(eq(classSessions.merchantId, merchantId)).orderBy(asc(classSessions.startsAt), asc(classSessions.id));
    const bookings = await ctx.db.select({ sessionId: classBookings.sessionId, status: classBookings.status }).from(classBookings).where(eq(classBookings.merchantId, merchantId));
    const count = new Map<string, Record<string, number>>();
    for (const b of bookings) {
      const c = count.get(b.sessionId) ?? {};
      c[b.status] = (c[b.status] ?? 0) + 1;
      count.set(b.sessionId, c);
    }
    return toCsv(
      ["class_id", "name", "starts_at", "ends_at", "instructor", "room", "location", "capacity", "booked", "attended", "waitlisted", "late_cancelled", "no_show", "women_only", "status", "cancelled_at", "cancel_reason", "series_id", "notes", "created_at"],
      rows.map(({ s, locationName }) => {
        const c = count.get(s.id) ?? {};
        return [s.id, s.name, s.startsAt, s.endsAt, s.instructorName, s.room, locationName, s.capacity, (c.booked ?? 0) + (c.attended ?? 0) + (c.held ?? 0), c.attended ?? 0, c.waitlisted ?? 0, c.late_cancelled ?? 0, c.no_show ?? 0, s.womenOnly, s.status, s.cancelledAt, s.cancelReason, s.seriesId, s.notes, s.createdAt];
      }),
    );
  },

  async "class-bookings"(ctx, merchantId) {
    const rows = await ctx.db
      .select({ b: classBookings, name: classSessions.name, startsAt: classSessions.startsAt, womenOnly: classSessions.womenOnly, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted })
      .from(classBookings)
      .innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId))
      .leftJoin(merchantMembers, and(eq(merchantMembers.merchantId, classBookings.merchantId), eq(merchantMembers.userId, classBookings.userId)))
      .where(eq(classBookings.merchantId, merchantId))
      .orderBy(asc(classSessions.startsAt), asc(classBookings.createdAt), asc(classBookings.id));
    const p = await peopleById(ctx, rows.map((r) => r.b.userId));
    const sms = await stopped(ctx, "sms");
    return toCsv(
      ["booking_id", "class_id", "class_name", "class_starts_at", "women_only", "customer_name", "phone", "status", "booked_by", "paid_with", "pass_id", "membership_id", "credit_returned", "waitlisted_at", "promoted_at", "checked_in_at", "cancelled_at", "late_fee_charged_at", "booked_at", "may_text"],
      rows.map(({ b, name, startsAt, womenOnly, consent, muted }) => {
        const person = who(p, b.userId);
        // Same test as the other files: a deleted account is nobody, and a text needs consent on file, not muted, no STOP.
        const mayText = !!person.name && !!consent && !muted && !(person.phone && sms.has(person.phone));
        return [b.id, b.sessionId, name, startsAt, womenOnly, person.name, person.phone, b.status, b.source, b.payWith, b.passId, b.membershipId, b.creditReturned, b.waitlistedAt, b.promotedAt, b.checkedInAt, b.cancelledAt, b.feeChargedAt, b.createdAt, mayText];
      }),
    );
  },

  async "class-passes"(ctx, merchantId) {
    const rows = await ctx.db.select().from(classPasses).where(eq(classPasses.merchantId, merchantId)).orderBy(asc(classPasses.createdAt), asc(classPasses.id));
    const p = await peopleById(ctx, rows.map((r) => r.userId));
    return toCsv(["pass_id", "bought_at", "customer_name", "phone", "pass", "credits_total", "credits_left", "expires_at", "intro_offer", "status"], rows.map((r) => [r.id, r.createdAt, who(p, r.userId).name, who(p, r.userId).phone, r.name, r.creditsTotal, r.creditsLeft, r.expiresAt, r.introOffer, r.status]));
  },

  async "class-memberships"(ctx, merchantId) {
    const rows = await ctx.db
      .select({ m: classMemberships, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted })
      .from(classMemberships)
      .leftJoin(merchantMembers, and(eq(merchantMembers.merchantId, classMemberships.merchantId), eq(merchantMembers.userId, classMemberships.userId)))
      .where(eq(classMemberships.merchantId, merchantId))
      .orderBy(asc(classMemberships.createdAt), asc(classMemberships.id));
    const p = await peopleById(ctx, rows.map((r) => r.m.userId));
    const sms = await stopped(ctx, "sms");
    return toCsv(
      ["membership_id", "created_at", "customer_name", "phone", "membership", "status", "price_per_period", "taxable", "term_months", "classes_per_month", "start_date", "term_ends_on", "period_start", "period_end", "next_billing_date", "frozen_from", "frozen_until", "freezes_used", "decline_renewal", "renewal_notice_sent_at", "agreement_accepted_at", "cooling_off_ends_on", "cancel_effective_on", "cancelled_at", "cancelled_by", "cancel_reason", "card_brand", "card_last4", "may_text"],
      rows.map(({ m, consent, muted }) => {
        const person = who(p, m.userId);
        const mayText = !!person.name && !!consent && !muted && !(person.phone && sms.has(person.phone));
        return [m.id, m.createdAt, person.name, person.phone, m.name, m.status, dollars(m.priceCents), m.taxable, m.termMonths, m.classesPerMonth, m.startDate, m.termEndsOn, m.currentPeriodStart, m.currentPeriodEnd, m.nextBillingDate, m.frozenFrom, m.frozenUntil, m.freezesUsed, m.declineRenewal, m.renewalNoticeSentAt, m.agreementAcceptedAt, m.coolingOffEndsOn, m.cancelEffectiveOn, m.cancelledAt, m.cancelledBy, person === NOBODY ? null : m.cancelReason, person === NOBODY ? null : m.paymentMethodBrand, person === NOBODY ? null : m.paymentMethodLast4, mayText];
      }),
    );
  },

  async "class-charges"(ctx, merchantId) {
    const rows = await ctx.db.select().from(classCharges).where(eq(classCharges.merchantId, merchantId)).orderBy(asc(classCharges.createdAt), asc(classCharges.id));
    const p = await peopleById(ctx, rows.map((r) => r.userId));
    return toCsv(
      ["charge_id", "created_at", "customer_name", "kind", "membership_id", "pass_id", "booking_id", "period_start", "period_end", "amount", "tax", "platform_fee", "status", "paid_with", "paid_at", "refunded_at", "attempts", "last_attempt_on"],
      rows.map((c) => [c.id, c.createdAt, who(p, c.userId).name, c.kind, c.membershipId, c.passId, c.bookingId, c.periodStart, c.periodEnd, dollars(c.amountCents), dollars(c.taxCents), dollars(c.platformFeeCents), c.status, c.paymentMethod, c.paidAt, c.refundedAt, c.attempts, c.lastAttemptOn]),
    );
  },

  async "tiffin-subscriptions"(ctx, merchantId) {
    const rows = await ctx.db.select({ s: tiffinSubscriptions, plan: tiffinPlans.name }).from(tiffinSubscriptions).leftJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId)).where(eq(tiffinSubscriptions.merchantId, merchantId)).orderBy(asc(tiffinSubscriptions.createdAt), asc(tiffinSubscriptions.id));
    const p = await peopleById(ctx, rows.map((r) => r.s.userId));
    return toCsv(
      ["subscription_id", "created_at", "customer_name", "phone", "plan", "status", "servings", "fulfilment", "address", "postal_code", "delivery_notes", "dietary_notes", "start_date", "paused_until", "period_start", "period_end", "next_billing_date", "price", "payment_method", "card_brand", "card_last4", "cancelled_at", "cancel_reason"],
      rows.map(({ s, plan }) => [s.id, s.createdAt, who(p, s.userId).name, who(p, s.userId).phone, plan, s.status, s.servings, s.fulfilment, s.address, s.postalCode, s.addressNotes, s.dietaryNotes, s.startDate, s.pausedUntil, s.currentPeriodStart, s.currentPeriodEnd, s.nextBillingDate, dollars(s.priceCents), s.paymentMethod, s.paymentMethodBrand, s.paymentMethodLast4, s.cancelledAt, s.cancelReason]),
    );
  },

  async "tiffin-deliveries"(ctx, merchantId) {
    const rows = await ctx.db.select().from(tiffinDeliveries).where(eq(tiffinDeliveries.merchantId, merchantId)).orderBy(asc(tiffinDeliveries.date), asc(tiffinDeliveries.id));
    return toCsv(["delivery_id", "subscription_id", "date", "servings", "status", "stop_order", "delivered_at", "note"], rows.map((d) => [d.id, d.subscriptionId, d.date, d.servings, d.status, d.stopOrder, d.deliveredAt, d.note]));
  },

  async "catering-events"(ctx, merchantId) {
    const rows = await ctx.db.select().from(cateringEvents).where(eq(cateringEvents.merchantId, merchantId)).orderBy(asc(cateringEvents.eventDate), asc(cateringEvents.id));
    const p = await peopleById(ctx, rows.map((e) => e.userId));
    return toCsv(
      ["event_id", "number", "reference", "customer_name", "phone", "event_type", "event_date", "start_time", "headcount", "venue", "venue_address", "service", "status", "menu", "per_head", "line_items", "subtotal", "tax", "total", "deposit", "deposit_paid_at", "deposit_refund", "dietary_notes", "notes", "tasting_at", "quote_sent_at", "approved_at", "approved_by_name", "created_at"],
      rows.map((e) => [e.id, e.number, e.referenceCode, who(p, e.userId).name, who(p, e.userId).phone, e.eventType, e.eventDate, e.startTime, e.headcount, e.venueName, e.venueAddress, e.service, e.status, json(e.menu), dollars(e.perHeadCents), json(e.lineItems), dollars(e.subtotalCents), dollars(e.taxCents), dollars(e.totalCents), dollars(e.depositCents), e.depositPaidAt, dollars(e.depositRefundCents), e.dietaryNotes, e.notes, e.tastingAt, e.quoteSentAt, e.approvedAt, e.signatureName, e.createdAt]),
    );
  },

  async "hall-bookings"(ctx, merchantId) {
    const rows = await ctx.db.select({ b: hallBookings, hall: halls.name }).from(hallBookings).leftJoin(halls, eq(halls.id, hallBookings.hallId)).where(eq(hallBookings.merchantId, merchantId)).orderBy(asc(hallBookings.startsAt), asc(hallBookings.id));
    const p = await peopleById(ctx, rows.map((r) => r.b.userId));
    return toCsv(
      ["booking_id", "reference", "customer_name", "phone", "hall", "event_type", "starts_at", "ends_at", "headcount", "package", "status", "hold_expires_at", "total", "deposit", "deposit_paid_at", "deposit_refund", "schedule", "notes", "created_at"],
      rows.map(({ b, hall }) => [b.id, b.referenceCode, who(p, b.userId).name, who(p, b.userId).phone, hall, b.eventType, b.startsAt, b.endsAt, b.headcount, b.packageName, b.status, b.holdExpiresAt, dollars(b.totalCents), dollars(b.depositCents), b.depositPaidAt, dollars(b.depositRefundCents), json(b.schedule), b.notes, b.createdAt]),
    );
  },

  async tickets(ctx, merchantId, files) {
    const rows = await ctx.db.select({ t: serviceTickets, locationName: locations.name }).from(serviceTickets).leftJoin(locations, eq(locations.id, serviceTickets.locationId)).where(eq(serviceTickets.merchantId, merchantId)).orderBy(asc(serviceTickets.createdAt), asc(serviceTickets.id));
    const p = await peopleById(ctx, rows.map((r) => r.t.userId));
    const storage = getStorage(ctx);
    const out: Cell[][] = [];
    for (const { t, locationName } of rows) {
      const names: string[] = [];
      let n = 0;
      for (const url of t.photos ?? []) {
        const key = storageKeyFromUrl(url);
        if (!key) {
          names.push(url); // a link the shop pasted: it is the shop's own, listed as it is
          continue;
        }
        n++;
        const name = `photos/ticket-${t.number}-${n}.${key.split(".").pop()}`;
        names.push(name);
        const obj = files ? await storage.get?.(key) : null;
        if (files && obj) files.set(name, new Uint8Array(obj.body));
      }
      out.push([t.id, t.number, t.createdAt, who(p, t.userId).name, who(p, t.userId).phone, locationName, t.itemKind, json(t.itemDetails), t.issue, t.intakeNotes, t.status, t.promisedAt, t.readyAt, t.shelfLocation, t.termsAcceptedAt, json(t.intakeChecklist), names.join(";"), t.updatedAt]);
    }
    return toCsv(["ticket_id", "number", "created_at", "customer_name", "phone", "location", "item_kind", "item_details", "issue", "intake_notes", "status", "promised_at", "ready_at", "shelf_location", "terms_accepted_at", "intake_checklist", "photos", "updated_at"], out);
  },

  async quotes(ctx, merchantId) {
    const rows = await ctx.db.select({ q: quotes, number: serviceTickets.number }).from(quotes).innerJoin(serviceTickets, eq(serviceTickets.id, quotes.ticketId)).where(eq(quotes.merchantId, merchantId)).orderBy(asc(quotes.createdAt), asc(quotes.id));
    return toCsv(
      ["quote_id", "ticket_number", "created_at", "status", "diagnosis", "line_items", "subtotal", "tax", "total", "deposit", "deposit_paid_at", "sent_at", "first_viewed_at", "responded_at", "expires_at", "signed_by_name", "declined_reason"],
      rows.map(({ q, number }) => [q.id, number, q.createdAt, q.status, q.diagnosis, json(q.lineItems), dollars(q.subtotalCents), dollars(q.taxCents), dollars(q.totalCents), dollars(q.depositCents), q.depositPaidAt, q.sentAt, q.firstViewedAt, q.respondedAt, q.expiresAt, q.signatureName, q.declineReason]),
    );
  },

  async invoices(ctx, merchantId) {
    const rows = await ctx.db.select().from(invoices).where(eq(invoices.merchantId, merchantId)).orderBy(asc(invoices.createdAt), asc(invoices.id));
    const p = await peopleById(ctx, rows.map((i) => i.userId));
    return toCsv(
      ["invoice_id", "number", "created_at", "customer_name", "phone", "status", "ticket_id", "catering_event_id", "hall_booking_id", "appointment_id", "line_items", "subtotal", "tax", "deposit_applied", "tip", "total", "amount_due", "paid_at", "points_earned"],
      rows.map((i) => [i.id, i.number, i.createdAt, who(p, i.userId).name, who(p, i.userId).phone, i.status, i.ticketId, i.cateringEventId, i.hallBookingId, i.appointmentId, json(i.lineItems), dollars(i.subtotalCents), dollars(i.taxCents), dollars(i.depositAppliedCents), dollars(i.tipCents), dollars(i.totalCents), dollars(i.amountDueCents), i.paidAt, i.pointsEarned]),
    );
  },

  async reviews(ctx, merchantId) {
    const rows = await ctx.db.select({ r: reviewRequests, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted }).from(reviewRequests).leftJoin(merchantMembers, and(eq(merchantMembers.merchantId, reviewRequests.merchantId), eq(merchantMembers.userId, reviewRequests.userId))).where(eq(reviewRequests.merchantId, merchantId)).orderBy(asc(reviewRequests.createdAt), asc(reviewRequests.id));
    const p = await peopleById(ctx, rows.map((r) => r.r.userId));
    const sms = await stopped(ctx, "sms");
    return toCsv(
      ["review_request_id", "created_at", "customer_name", "channel", "sent_at", "opened_at", "rating", "private_comment", "google_review_clicked_at", "handled_at", "your_reply", "reply_channel", "replied_at", "may_follow_up"],
      rows.map(({ r, consent, muted }) => {
        const person = who(p, r.userId);
        // The same test the review sender uses: consent on file for this shop, not muted, and the number has not replied STOP.
        const mayFollowUp = !!person.name && !!consent && !muted && !(person.phone && sms.has(person.phone));
        return [r.id, r.createdAt, person.name, r.channel, r.sentAt, r.clickedAt, r.rating, r.feedback, r.googleClickedAt, r.handledAt, r.replyBody, r.replyChannel, r.repliedAt, mayFollowUp];
      }),
    );
  },

  async messages(ctx, merchantId) {
    const rows = await ctx.db.select().from(messages).where(eq(messages.merchantId, merchantId)).orderBy(asc(messages.createdAt), asc(messages.id));
    return toCsv(["message_id", "created_at", "channel", "kind", "subject", "body", "audience", "status", "scheduled_at", "sent_at", "recipients"], rows.map((m) => [m.id, m.createdAt, m.channel, m.automation ?? "campaign", m.subject, m.body, json(m.segment), m.status, m.scheduledAt, m.sentAt, m.recipientCount]));
  },

  async "message-deliveries"(ctx, merchantId) {
    const rows = await ctx.db.select().from(messageDeliveries).where(eq(messageDeliveries.merchantId, merchantId)).orderBy(asc(messageDeliveries.createdAt), asc(messageDeliveries.id));
    const p = await peopleById(ctx, rows.map((d) => d.userId));
    return toCsv(["delivery_id", "message_id", "sent_at", "customer_name", "channel", "to", "kind", "status", "error", "body"], rows.map((d) => [d.id, d.messageId, d.createdAt, who(p, d.userId).name, d.channel, who(p, d.userId) === NOBODY ? null : d.to, d.kind, d.status, d.error, d.body]));
  },

  async "whatsapp-messages"(ctx, merchantId) {
    const rows = await ctx.db.select({ m: whatsappMessages, phone: whatsappSessions.phone, userId: whatsappSessions.userId }).from(whatsappMessages).innerJoin(whatsappSessions, eq(whatsappSessions.id, whatsappMessages.sessionId)).where(eq(whatsappMessages.merchantId, merchantId)).orderBy(asc(whatsappMessages.createdAt), asc(whatsappMessages.id));
    const p = await peopleById(ctx, rows.map((r) => r.userId));
    return toCsv(["message_id", "sent_at", "customer_name", "customer_phone", "direction", "kind", "sender", "body"], rows.map(({ m, phone, userId }) => [m.id, m.createdAt, who(p, userId).name, phone.startsWith("deleted-") ? null : phone, m.direction, m.kind, m.sender, m.body]));
  },

  async "phone-orders"(ctx, merchantId) {
    const rows = await ctx.db.select().from(phoneCalls).where(eq(phoneCalls.merchantId, merchantId)).orderBy(asc(phoneCalls.createdAt), asc(phoneCalls.id));
    return toCsv(["call_id", "called_at", "caller_phone", "language", "status", "transcript", "drafted_order", "order_id"], rows.map((c) => [c.id, c.createdAt, c.fromPhone === "[deleted]" ? null : c.fromPhone, c.language, c.status, c.transcript, json(c.draftOrder), c.orderId]));
  },
};

export const isExportKey = (k: string): k is MerchantExportKey => k in BUILDERS;

export async function buildExportCsv(ctx: AppContext, merchantId: string, key: string): Promise<string> {
  if (!isExportKey(key)) throw notFound("Export");
  return BUILDERS[key](ctx, merchantId);
}

const slug = (k: string) => k.replaceAll("-", "_");

/** Every dataset plus the ticket photo files, as one ZIP, with a README that says what is in it and what was left out. */
export async function buildExportZip(ctx: AppContext, merchant: { id: string; name: string }, window: { until: Date | null }): Promise<{ zip: Buffer; files: string[] }> {
  const entries: Record<string, Uint8Array> = {};
  const photos = new Map<string, Uint8Array>();
  for (const d of MERCHANT_EXPORTS) entries[`${slug(d.key)}.csv`] = strToU8("﻿" + (await BUILDERS[d.key](ctx, merchant.id, photos)));
  for (const [name, bytes] of photos) entries[name] = bytes;
  const readme = [
    `${merchant.name}: your customer data`,
    `Exported ${ctx.now().toISOString()}`,
    window.until ? `Your free export after leaving stays open until ${window.until.toISOString().slice(0, 10)}.` : "",
    "",
    "Files",
    ...MERCHANT_EXPORTS.map((d) => `  ${slug(d.key)}.csv  ${d.description}`),
    "  photos/  the repair-ticket photos named in tickets.csv",
    "",
    "What is not in these files",
    "  Customers who deleted their account appear without a name, phone, email or birthday; the amounts and dates stay for your accounts.",
    "  Links and codes that would let someone act as a customer or as us (quote approval and pay links, status and review links, signature IP and device, Stripe identifiers).",
    "  Your customers' activity at other shops.",
    "",
    "Using these files",
    "  You are responsible for using them lawfully (PIPEDA, CASL). Only send promotions to members with a marketing_consent_at in members.csv who are not muted and have not replied STOP (stopped_sms, stopped_whatsapp).",
    "  reviews.csv has may_follow_up: false means do not contact that customer about their review.",
    "  class_bookings.csv and class_memberships.csv have may_text: false means do not text that customer (no consent on file, muted, STOPped, or the account was deleted).",
    "",
  ].join("\r\n");
  entries["README.txt"] = strToU8(readme);
  return { zip: Buffer.from(zipSync(entries, { level: 6 })), files: Object.keys(entries) };
}
