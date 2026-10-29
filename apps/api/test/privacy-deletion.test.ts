import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appointments,
  auditLogs,
  cateringEvents,
  commOptOuts,
  conversationMessages,
  conversations,
  hallBookings,
  halls,
  invoices,
  locations,
  manualPayments,
  merchantMembers,
  notifications,
  orders,
  orderSplits,
  phoneCalls,
  preorderWaitlist,
  pushTokens,
  quotes,
  referrals,
  reviewRequests,
  serviceTickets,
  ticketEvents,
  tiffinCharges,
  tiffinDeliveries,
  tiffinPlans,
  tiffinSkips,
  tiffinSubscriptions,
  userNotificationPrefs,
  users,
  walletDeviceRegistrations,
  walletPasses,
  webPushSubscriptions,
  whatsappMessages,
  whatsappSessions,
} from "@ll/db";
import { MemoryStorage } from "../src/providers/storage.js";
import { deleteAccount, exportData } from "../src/services/customer.js";
import { createMerchant, createTestEnv, createUser, nextPhone, type TestEnv } from "./helpers.js";

let env: TestEnv;
const NOW = new Date("2026-11-03T15:00:00Z");
const FUTURE = new Date("2026-12-01T15:00:00Z");
beforeEach(async () => {
  env = await createTestEnv({ now: NOW });
});
afterEach(async () => env.close());

import { seedEverything as seed } from "./privacy-fixtures.js";

const seedEverything = () => seed(env);

describe("account deletion reaches every module", () => {
  it("scrubs appointments, tiffin, catering, halls, WhatsApp, calls, reviews, tickets, orders, wait lists, referrals, consents, passes and tokens", async () => {
    const s = await seedEverything();
    const storage = env.ctx.providers.storage as MemoryStorage | undefined;
    await deleteAccount(env.ctx, s.user.id);

    // profile
    const [u] = await env.db.select().from(users).where(eq(users.id, s.user.id));
    expect(u).toMatchObject({ phone: null, email: null, name: null, birthday: null, postalCode: null });

    // appointments: text cleared, future one cancelled, saved-card references gone
    const [a] = await env.db.select().from(appointments).where(eq(appointments.id, s.ids.appt.id));
    expect(a).toMatchObject({ customerName: null, notes: null, clientNote: null, stripeCustomerId: null, paymentMethodId: null, status: "cancelled", cancelReason: "account_deleted" });

    // tiffin
    const [sub] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, s.ids.sub.id));
    expect(sub).toMatchObject({ address: null, addressNotes: null, postalCode: null, lat: null, lng: null, dietaryNotes: null, paymentMethodId: null, stripeCustomerId: null, status: "cancelled", cancelReason: "account_deleted", nextBillingDate: null });
    expect(sub!.priceCents).toBe(12000);
    expect((await env.db.select().from(tiffinSkips))[0]!.reason).toBeNull();
    expect((await env.db.select().from(tiffinDeliveries))[0]!.note).toBeNull();
    const [charge] = await env.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, s.ids.charge.id));
    expect(charge).toMatchObject({ amountCents: 12000, paidCents: 12000, status: "paid" });
    const pays = await env.db.select().from(manualPayments);
    expect(pays).toHaveLength(2);
    for (const p of pays) expect(p).toMatchObject({ bankReference: null, note: null });
    expect(pays.map((p) => p.amountCents).sort()).toEqual([12000, 50000]);

    // catering and halls: amounts stay, text and signature record go, approval link revoked
    const [ev] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, s.ids.event.id));
    expect(ev).toMatchObject({ venueName: null, venueAddress: null, dietaryNotes: null, notes: null, signatureName: null, signatureIp: null, signatureUserAgent: null, totalCents: 500000, depositCents: 100000 });
    expect(ev!.approvalToken).not.toBe("tok-cat");
    const [hb] = await env.db.select().from(hallBookings).where(eq(hallBookings.id, s.ids.booking.id));
    expect(hb).toMatchObject({ notes: null, totalCents: 300000 });

    // WhatsApp, phone calls
    expect(await env.db.select().from(whatsappMessages)).toHaveLength(0);
    const [wa] = await env.db.select().from(whatsappSessions).where(eq(whatsappSessions.id, s.ids.wa.id));
    expect(wa).toMatchObject({ userId: null, cart: [], allergyNote: null, marketingOptInAt: null, state: "opted_out" });
    expect(wa!.phone).not.toBe(s.phone);
    const [call] = await env.db.select().from(phoneCalls);
    expect(call).toMatchObject({ transcript: null, draftOrder: null, fromPhone: "[deleted]" });

    // reviews
    const [rv] = await env.db.select().from(reviewRequests).where(eq(reviewRequests.id, s.ids.review.id));
    expect(rv).toMatchObject({ feedback: null, replyBody: null, replyChannel: null, rating: 2 });
    expect(rv!.token).not.toBe("rev-tok");

    // repair tickets, timeline, quotes: de-identified, totals kept
    const [t] = await env.db.select().from(serviceTickets).where(eq(serviceTickets.id, s.ids.ticket.id));
    expect(t).toMatchObject({ issue: "[deleted]", itemDetails: {}, intakeNotes: null, photos: [], shelfLocation: null, statusToken: null });
    expect((await env.db.select().from(ticketEvents))[0]!.note).toBeNull();
    const [q] = await env.db.select().from(quotes).where(eq(quotes.id, s.ids.quote.id));
    expect(q).toMatchObject({ signatureName: null, signatureIp: null, signatureUserAgent: null, authorizedBy: null, declineReason: null, totalCents: 16950 });
    expect(q!.approvalToken).not.toBe("q-tok");
    const [inv] = await env.db.select().from(invoices).where(eq(invoices.id, s.ids.invoice.id));
    expect(inv).toMatchObject({ totalCents: 16950, status: "paid" });
    expect(inv!.payToken).not.toBe("inv-tok");

    // orders: totals stay, notes and allergy note go
    const [o] = await env.db.select().from(orders).where(eq(orders.id, s.ids.order.id));
    expect(o).toMatchObject({ allergyNote: null, notes: null, totalCents: 2260, paymentStatus: "paid" });
    expect((await env.db.select().from(orderSplits))[0]!.label).toBe("[deleted]");

    // wait list: theirs deleted, the bystander's kept
    const wl = await env.db.select().from(preorderWaitlist);
    expect(wl).toHaveLength(1);
    expect(wl[0]!.name).toBe("Bystander");

    // referrals: the ones they made are gone, the link to them as referee is cut
    const refs = await env.db.select().from(referrals);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.refereeUserId).toBeNull();

    // consents, preferences, inbox, passes, tokens
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, s.member.id));
    expect(m).toMatchObject({ marketingConsentAt: null, marketingConsentText: null, marketingConsentSource: null, notes: null, tags: [], muted: true });
    expect(await env.db.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, s.user.id))).toHaveLength(0);
    expect(await env.db.select().from(notifications).where(eq(notifications.userId, s.user.id))).toHaveLength(0);
    expect(await env.db.select().from(walletPasses)).toHaveLength(0);
    expect(await env.db.select().from(walletDeviceRegistrations)).toHaveLength(0);
    expect(await env.db.select().from(pushTokens)).toHaveLength(0);

    // the do-not-contact entry stays: deleting it would let us text a number that said STOP
    expect(await env.db.select().from(commOptOuts)).toHaveLength(1);

    // the audit row says what was scrubbed
    const [log] = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "user.deleted"));
    expect((log!.data as { scrubbed: Record<string, number> }).scrubbed).toMatchObject({ appointments: 1, tiffinSubscriptions: 1, cateringEvents: 1, hallBookings: 1, whatsappMessages: 1, phoneCalls: 1, reviewRequests: 1, serviceTickets: 1, orders: 1, waitlist: 1 });
    void storage;
  });

  it("leaves no seeded SECRET text anywhere in the database", async () => {
    const s = await seedEverything();
    await deleteAccount(env.ctx, s.user.id);
    const tables = { appointments, tiffinSubscriptions, tiffinSkips, tiffinDeliveries, manualPayments, cateringEvents, hallBookings, whatsappSessions, whatsappMessages, phoneCalls, reviewRequests, serviceTickets, ticketEvents, quotes, orders, merchantMembers, notifications };
    for (const [name, table] of Object.entries(tables)) {
      const rows = await env.db.select().from(table as never);
      expect(JSON.stringify(rows), name).not.toMatch(/SECRET|Sam Secret|203\.0\.113/);
    }
  });

  it("deletes the stored repair photo files", async () => {
    const s = await seedEverything();
    const storage = new MemoryStorage();
    const stored = await storage.put({ merchantId: s.merchant.id, contentType: "image/jpeg", body: Buffer.from("jpeg-bytes") });
    env.ctx.providers.storage = storage;
    await env.db.update(serviceTickets).set({ photos: [stored.url] }).where(eq(serviceTickets.id, s.ids.ticket.id));
    expect(storage.objects.size).toBe(1);
    await deleteAccount(env.ctx, s.user.id);
    expect(storage.objects.size).toBe(0);
  });

  it("does not touch another customer's data", async () => {
    const s = await seedEverything();
    const other = s.ids.other;
    const [ot] = await env.db.insert(orders).values({ merchantId: s.merchant.id, userId: other.id, number: 2, subtotalCents: 500, totalCents: 565, allergyNote: "keep me" }).returning();
    await deleteAccount(env.ctx, s.user.id);
    const [row] = await env.db.select().from(orders).where(eq(orders.id, ot!.id));
    expect(row!.allergyNote).toBe("keep me");
    expect((await env.db.select().from(users).where(inArray(users.id, [other.id])))[0]!.name).toBe("Bystander");
  });

  it("works for an account with no data in any module", async () => {
    const u = await createUser(env.db, { name: "Empty" });
    await deleteAccount(env.ctx, u.id);
    const [row] = await env.db.select().from(users).where(eq(users.id, u.id));
    expect(row!.deletedAt).not.toBeNull();
  });

  it("the export (before deletion) holds what deletion later removes, so the two lists cannot drift apart", async () => {
    const s = await seedEverything();
    const text = JSON.stringify(await exportData(env.ctx, s.user.id));
    for (const needle of ["SECRET 5 Elm St", "SECRET appt note", "SECRET Hall", "SECRET hello I am Sam", "SECRET transcript", "SECRET rude waiter", "SECRET cracked screen", "SECRET shellfish", "SECRET reason"]) expect(text, needle).toContain(needle);
  });

  it("exports, then deletes, the customer's inbox threads and web push subscriptions (phase solo), and clears the visit note and intake answer", async () => {
    const s = await seedEverything();
    const [thread] = await env.db.insert(conversations).values({ merchantId: s.merchant.id, userId: s.user.id, channel: "in_app", displayName: "Sam" }).returning();
    await env.db.insert(conversationMessages).values({ conversationId: thread!.id, direction: "in", body: "SECRET running late", kind: "text", channel: "in_app" });
    const phone = (await env.db.select().from(users).where(eq(users.id, s.user.id)))[0]!.phone!;
    const [sms] = await env.db.insert(conversations).values({ merchantId: s.merchant.id, channel: "sms", externalId: phone }).returning();
    await env.db.insert(conversationMessages).values({ conversationId: sms!.id, direction: "in", body: "SECRET by text", kind: "text", channel: "sms" });
    const [bystander] = await env.db.insert(conversations).values({ merchantId: s.merchant.id, userId: s.ids.other.id, channel: "in_app" }).returning();
    await env.db.insert(webPushSubscriptions).values({ userId: s.user.id, endpoint: "https://push.example.com/sam", keys: { p256dh: "x".repeat(20), auth: "y".repeat(10) }, userAgent: "SECRET browser" });
    await env.db.update(appointments).set({ intakeAnswer: "SECRET sensitive skin", visitNote: "SECRET lash map" }).where(eq(appointments.id, s.ids.appt.id));

    const text = JSON.stringify(await exportData(env.ctx, s.user.id));
    for (const needle of ["SECRET running late", "SECRET by text", "SECRET browser", "SECRET sensitive skin"]) expect(text, needle).toContain(needle);
    expect(text).not.toContain("push.example.com");

    await deleteAccount(env.ctx, s.user.id);
    expect(await env.db.select().from(conversations).where(inArray(conversations.id, [thread!.id, sms!.id]))).toHaveLength(0);
    expect(await env.db.select().from(conversationMessages).where(inArray(conversationMessages.conversationId, [thread!.id, sms!.id]))).toHaveLength(0);
    expect(await env.db.select().from(conversations).where(eq(conversations.id, bystander!.id))).toHaveLength(1);
    expect(await env.db.select().from(webPushSubscriptions).where(eq(webPushSubscriptions.userId, s.user.id))).toHaveLength(0);
    const [a] = await env.db.select().from(appointments).where(eq(appointments.id, s.ids.appt.id));
    expect(a).toMatchObject({ intakeAnswer: null, visitNote: null, visitPhotoUrl: null });
  });
});
