/**
 * The modules half of the shopper's "download my data" file (GET /v1/me/export, PIPEDA access and Law 25
 * portability). customer.ts#exportData adds the loyalty half (profile, memberships, ledger, visits...). Everything
 * here is the customer's own rows only: by user id, and by phone number for the records keyed by number (WhatsApp
 * chats, phone calls, wait lists). Links and secrets that would let someone else act as the customer
 * (pay and approval tokens, status links, wallet auth tokens) are left out; the customer's own words, addresses,
 * signatures and photos are in.
 */
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  appointments,
  classBookings,
  classCharges,
  classMemberships,
  classPasses,
  bookings,
  cateringEvents,
  commOptOuts,
  hallBookings,
  manualPayments,
  merchants,
  notifications,
  orderItems,
  orderSplits,
  orders,
  phoneCalls,
  preorderWaitlist,
  quotes,
  rebookingNudges,
  reviewRequests,
  serviceTickets,
  ticketEvents,
  tiffinCharges,
  tiffinDeliveries,
  tiffinSkips,
  tiffinSubscriptions,
  userNotificationPrefs,
  walletPasses,
  whatsappMessages,
  whatsappSessions,
} from "@ll/db";
import type { customerApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { uploadSigner } from "../providers/storage.js";

/** The shopper downloads one file and reads it later, so its photo links last longer than a page view (still hours, not forever). */
const EXPORT_PHOTO_TTL_SECONDS = 60 * 60;

const SECRET_KEYS = new Set(["approvalToken", "statusToken", "payToken", "authToken", "token"]);
/** A row without the fields that would let someone else act as the customer. */
function clean<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET_KEYS.has(k)));
}
const cleanAll = <T extends Record<string, unknown>>(rows: T[]) => rows.map(clean);

export async function moduleExport(ctx: AppContext, userId: string, phone: string | null): Promise<customerApi.DataExportModules> {
  const db = ctx.db;
  const signUpload = uploadSigner(ctx, EXPORT_PHOTO_TTL_SECONDS);
  const none = [] as never[];
  const merchantRows = await db.select({ id: merchants.id, name: merchants.name }).from(merchants);
  const shop = new Map(merchantRows.map((m) => [m.id, m.name]));
  const named = <T extends { merchantId: string }>(rows: T[]) => rows.map((r) => ({ ...clean(r as unknown as Record<string, unknown>), merchantName: shop.get(r.merchantId) ?? null }));

  const ords = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(asc(orders.createdAt));
  const orderIds = ords.map((o) => o.id);
  const [items, splits] = orderIds.length
    ? await Promise.all([db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)), db.select().from(orderSplits).where(inArray(orderSplits.orderId, orderIds))])
    : [none, none];

  const appts = await db.select().from(appointments).where(eq(appointments.userId, userId)).orderBy(asc(appointments.startsAt));
  const bks = await db.select().from(bookings).where(eq(bookings.userId, userId));
  const classBks = await db.select().from(classBookings).where(eq(classBookings.userId, userId)).orderBy(asc(classBookings.createdAt));
  const classPs = await db.select().from(classPasses).where(eq(classPasses.userId, userId)).orderBy(asc(classPasses.createdAt));
  const classMs = await db.select().from(classMemberships).where(eq(classMemberships.userId, userId)).orderBy(asc(classMemberships.createdAt));
  const classCs = await db.select().from(classCharges).where(eq(classCharges.userId, userId)).orderBy(asc(classCharges.createdAt));
  const nudges = await db.select().from(rebookingNudges).where(eq(rebookingNudges.userId, userId));

  const subs = await db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.userId, userId)).orderBy(asc(tiffinSubscriptions.createdAt));
  const subIds = subs.map((s) => s.id);
  const [skips, deliveries, charges] = subIds.length
    ? await Promise.all([
        db.select().from(tiffinSkips).where(inArray(tiffinSkips.subscriptionId, subIds)),
        db.select().from(tiffinDeliveries).where(inArray(tiffinDeliveries.subscriptionId, subIds)),
        db.select().from(tiffinCharges).where(inArray(tiffinCharges.subscriptionId, subIds)),
      ])
    : [none, none, none];

  const events = await db.select().from(cateringEvents).where(eq(cateringEvents.userId, userId)).orderBy(asc(cateringEvents.eventDate));
  const halls = await db.select().from(hallBookings).where(eq(hallBookings.userId, userId)).orderBy(asc(hallBookings.startsAt));
  const subjectIds = [...subs.map((s) => s.id), ...charges.map((c) => c.id), ...events.map((e) => e.id), ...halls.map((h) => h.id)];
  const payments = subjectIds.length ? await db.select().from(manualPayments).where(inArray(manualPayments.subjectId, subjectIds)) : none;

  const sessionWhere = phone ? or(eq(whatsappSessions.userId, userId), eq(whatsappSessions.phone, phone)) : eq(whatsappSessions.userId, userId);
  const waSessions = await db.select().from(whatsappSessions).where(sessionWhere);
  const waMessages = waSessions.length ? await db.select().from(whatsappMessages).where(inArray(whatsappMessages.sessionId, waSessions.map((s) => s.id))).orderBy(asc(whatsappMessages.createdAt)) : none;
  const calls = phone ? await db.select().from(phoneCalls).where(eq(phoneCalls.fromPhone, phone)).orderBy(asc(phoneCalls.createdAt)) : none;
  const reviews = await db.select().from(reviewRequests).where(eq(reviewRequests.userId, userId)).orderBy(asc(reviewRequests.createdAt));

  const tickets = await db.select().from(serviceTickets).where(eq(serviceTickets.userId, userId)).orderBy(asc(serviceTickets.createdAt));
  const ticketIds = tickets.map((t) => t.id);
  const [tEvents, tQuotes] = ticketIds.length
    ? await Promise.all([db.select().from(ticketEvents).where(and(inArray(ticketEvents.ticketId, ticketIds), eq(ticketEvents.visibleToCustomer, true))).orderBy(asc(ticketEvents.createdAt)), db.select().from(quotes).where(inArray(quotes.ticketId, ticketIds))])
    : [none, none];

  const waitlist = await db.select().from(preorderWaitlist).where(phone ? or(eq(preorderWaitlist.userId, userId), eq(preorderWaitlist.phone, phone)) : eq(preorderWaitlist.userId, userId));
  const prefs = await db.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, userId));
  const inbox = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(500);
  const passes = await db.select().from(walletPasses).where(eq(walletPasses.userId, userId));
  const optOuts = phone ? await db.select().from(commOptOuts).where(eq(commOptOuts.phone, phone)) : none;

  return {
    orders: ords.map((o) => ({ ...clean(o), merchantName: shop.get(o.merchantId) ?? null, items: items.filter((i) => i.orderId === o.id).map(clean), splits: splits.filter((s) => s.orderId === o.id).map(clean) })),
    appointments: named(appts),
    classBookings: named(classBks),
    classPasses: named(classPs),
    classMemberships: named(classMs),
    classCharges: named(classCs),
    bookings: named(bks),
    rebookingNudges: named(nudges),
    tiffinSubscriptions: subs.map((s) => ({
      ...clean(s),
      merchantName: shop.get(s.merchantId) ?? null,
      skips: skips.filter((k) => k.subscriptionId === s.id).map(clean),
      deliveries: deliveries.filter((d) => d.subscriptionId === s.id).map(clean),
      charges: charges.filter((c) => c.subscriptionId === s.id).map(clean),
    })),
    cateringEvents: named(events),
    hallBookings: named(halls),
    manualPayments: cleanAll(payments),
    whatsapp: {
      sessions: named(waSessions),
      messages: waMessages.map((m) => ({ ...clean(m), merchantName: shop.get(m.merchantId) ?? null })),
    },
    phoneCalls: named(calls),
    reviews: named(reviews),
    serviceTickets: tickets.map((t) => ({
      ...clean(t),
      merchantName: shop.get(t.merchantId) ?? null,
      photos: (t.photos ?? []).map(signUpload),
      timeline: tEvents.filter((e) => e.ticketId === t.id).map(clean),
      quotes: tQuotes.filter((q) => q.ticketId === t.id).map(clean),
    })),
    waitlist: named(waitlist),
    notificationPrefs: cleanAll(prefs),
    notifications: cleanAll(inbox),
    walletPasses: passes.map((p) => ({ platform: p.platform, serialNumber: p.serialNumber, createdAt: p.createdAt, lastUpdatedAt: p.lastUpdatedAt })),
    doNotContact: optOuts.map((o) => ({ channel: o.channel, optedOutAt: o.optedOutAt, resubscribedAt: o.resubscribedAt, source: o.source })),
  };
}
