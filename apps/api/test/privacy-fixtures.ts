import { eq } from "drizzle-orm";
import {
  appointments,
  auditLogs,
  cateringEvents,
  commOptOuts,
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
  whatsappMessages,
  whatsappSessions,
} from "@ll/db";
import { createMerchant, createTestEnv, createUser, nextPhone, type TestEnv } from "./helpers.js";

const NOW = new Date("2026-11-03T15:00:00Z");
const FUTURE = new Date("2026-12-01T15:00:00Z");

async function makeMember(env: TestEnv, merchantId: string, userId: string) {
  const [m] = await env.db.insert(merchantMembers).values({ merchantId, userId }).returning();
  return m!;
}

/** One customer with data in every module, at one shop. Everything carries "SECRET" or a recognisable name so a leak is easy to see. */
export async function seedEverything(env: TestEnv) {
  const { merchant } = await createMerchant(env);
  const phone = nextPhone();
  const user = await createUser(env.db, { phone, name: "Sam Secret", email: "sam@example.com", postalCode: "M5V 1A1", birthday: "04-02" });
  const member = await makeMember(env, merchant.id, user.id);
  await env.db.update(merchantMembers).set({ marketingConsentAt: NOW, marketingConsentText: "I agree", marketingConsentSource: "app", tags: ["vip"], notes: "SECRET note" }).where(eq(merchantMembers.id, member.id));
  const other = await createUser(env.db, { name: "Bystander" });

  const [loc] = await env.db.insert(locations).values({ merchantId: merchant.id, name: "Main", address: "1 Main", qrCode: `qr-${phone}` }).returning();
  const [appt] = await env.db.insert(appointments).values({ merchantId: merchant.id, locationId: loc!.id, userId: user.id, customerName: "Sam Secret", notes: "SECRET appt note", clientNote: "SECRET client note", startsAt: FUTURE, endsAt: new Date(FUTURE.getTime() + 3_600_000), stripeCustomerId: "cus_x", paymentMethodId: "pm_x" }).returning();

  const [plan] = await env.db.insert(tiffinPlans).values({ merchantId: merchant.id, name: "Thali", priceCents: 12000 }).returning();
  const [sub] = await env.db.insert(tiffinSubscriptions).values({ merchantId: merchant.id, planId: plan!.id, userId: user.id, status: "active", address: "SECRET 5 Elm St", addressNotes: "SECRET side door", postalCode: "L4T 1A1", lat: 43.7, lng: -79.6, dietaryNotes: "SECRET no onions", startDate: "2026-11-01", priceCents: 12000, paymentMethodId: "pm_t", stripeCustomerId: "cus_t", nextBillingDate: "2026-12-01" }).returning();
  await env.db.insert(tiffinSkips).values({ subscriptionId: sub!.id, date: "2026-11-10", reason: "SECRET away" });
  await env.db.insert(tiffinDeliveries).values({ merchantId: merchant.id, subscriptionId: sub!.id, date: "2026-11-04", note: "SECRET leave with neighbour" });
  const [charge] = await env.db.insert(tiffinCharges).values({ merchantId: merchant.id, subscriptionId: sub!.id, periodStart: "2026-11-01", periodEnd: "2026-11-30", amountCents: 12000, status: "paid", paidCents: 12000 }).returning();
  await env.db.insert(manualPayments).values({ merchantId: merchant.id, subjectType: "tiffin_charge", subjectId: charge!.id, method: "etransfer", amountCents: 12000, receivedOn: "2026-11-01", bankReference: "SECRET REF", note: "SECRET from Sam" });

  const [event] = await env.db.insert(cateringEvents).values({ merchantId: merchant.id, userId: user.id, number: 1, eventDate: "2027-01-10", headcount: 40, venueName: "SECRET Hall", venueAddress: "SECRET 9 Venue Rd", dietaryNotes: "SECRET nuts", notes: "SECRET event note", approvalToken: "tok-cat", signatureName: "Sam Secret", signatureIp: "203.0.113.9", signatureUserAgent: "SECRET UA", totalCents: 500000, depositCents: 100000, depositPaidAt: NOW }).returning();
  const [hall] = await env.db.insert(halls).values({ merchantId: merchant.id, name: "Grand", capacity: 200 }).returning();
  const [booking] = await env.db.insert(hallBookings).values({ hallId: hall!.id, merchantId: merchant.id, userId: user.id, startsAt: FUTURE, endsAt: new Date(FUTURE.getTime() + 3_600_000), headcount: 100, notes: "SECRET hall note", totalCents: 300000 }).returning();
  await env.db.insert(manualPayments).values({ merchantId: merchant.id, subjectType: "hall_instalment", subjectId: booking!.id, method: "cheque", amountCents: 50000, receivedOn: "2026-11-02", bankReference: "SECRET CHQ" });

  const [wa] = await env.db.insert(whatsappSessions).values({ merchantId: merchant.id, phone, userId: user.id, cart: [{ catalogItemId: "x", quantity: 2 }], allergyNote: "SECRET peanuts", marketingOptInAt: NOW }).returning();
  await env.db.insert(whatsappMessages).values({ merchantId: merchant.id, sessionId: wa!.id, direction: "in", body: "SECRET hello I am Sam" });
  await env.db.insert(phoneCalls).values({ merchantId: merchant.id, fromPhone: phone, transcript: "SECRET transcript", draftOrder: { items: [{ name: "SECRET samosa", quantity: 2 }] }, status: "confirmed" });
  const [review] = await env.db.insert(reviewRequests).values({ merchantId: merchant.id, userId: user.id, channel: "sms", token: "rev-tok", rating: 2, feedback: "SECRET rude waiter", replyBody: "SECRET sorry Sam", replyChannel: "sms" }).returning();

  const [ticket] = await env.db.insert(serviceTickets).values({ merchantId: merchant.id, userId: user.id, number: 1, issue: "SECRET cracked screen", itemDetails: { imei: "SECRET123" }, intakeNotes: "SECRET passcode", photos: ["/v1/public/uploads/00000000-0000-0000-0000-000000000001/0123456789abcdef0123456789abcdef.jpg"], shelfLocation: "A3", statusToken: "st-tok", status: "picked_up" }).returning();
  await env.db.insert(ticketEvents).values({ ticketId: ticket!.id, note: "SECRET called Sam" });
  const [quote] = await env.db.insert(quotes).values({ ticketId: ticket!.id, merchantId: merchant.id, lineItems: [{ description: "Screen", quantity: 1, unitPriceCents: 15000 }], subtotalCents: 15000, totalCents: 16950, approvalToken: "q-tok", signatureName: "Sam Secret", signatureIp: "203.0.113.9", signatureUserAgent: "SECRET UA", declineReason: "SECRET reason", authorizedBy: { method: "phone", name: "Sam Secret", phone, at: NOW.toISOString() }, status: "approved" }).returning();
  const [invoice] = await env.db.insert(invoices).values({ merchantId: merchant.id, userId: user.id, number: 1, lineItems: [], subtotalCents: 15000, totalCents: 16950, amountDueCents: 0, payToken: "inv-tok", status: "paid", paidAt: NOW }).returning();

  const [order] = await env.db.insert(orders).values({ merchantId: merchant.id, userId: user.id, number: 1, subtotalCents: 2000, totalCents: 2260, status: "picked_up", paymentStatus: "paid", paidAt: NOW, notes: "SECRET order note", allergyNote: "SECRET shellfish" }).returning();
  await env.db.insert(orderSplits).values({ orderId: order!.id, label: "Sam's share", amountCents: 1000, payToken: "split-tok" });
  await env.db.insert(preorderWaitlist).values({ merchantId: merchant.id, date: "2026-11-20", userId: user.id, phone, name: "Sam Secret", consentText: "text me" });
  await env.db.insert(preorderWaitlist).values({ merchantId: merchant.id, date: "2026-11-20", userId: other.id, phone: nextPhone(), name: "Bystander", consentText: "text me" });
  await env.db.insert(referrals).values({ merchantId: merchant.id, referrerMemberId: member.id, code: `ref-${phone}` });
  const otherMember = await makeMember(env, merchant.id, other.id);
  await env.db.insert(referrals).values({ merchantId: merchant.id, referrerMemberId: otherMember.id, code: `ref2-${phone}`, refereeUserId: user.id, status: "joined" });
  await env.db.insert(userNotificationPrefs).values({ userId: user.id, type: "points_earned", channel: "sms", enabled: false });
  await env.db.insert(notifications).values({ userId: user.id, merchantId: merchant.id, type: "points_earned", title: "SECRET", body: "SECRET body" });
  const [pass] = await env.db.insert(walletPasses).values({ userId: user.id, platform: "apple", serialNumber: `ser-${phone}`, authToken: "auth" }).returning();
  await env.db.insert(walletDeviceRegistrations).values({ deviceLibraryId: "dev", pushToken: "pt", passId: pass!.id });
  await env.db.insert(pushTokens).values({ userId: user.id, token: "ExponentPushToken[abc]", platform: "ios" });
  await env.db.insert(commOptOuts).values({ phone, channel: "sms", source: "sms_reply" });
  return { merchant, user, phone, member, ids: { appt: appt!, sub: sub!, charge: charge!, event: event!, booking: booking!, wa: wa!, review: review!, ticket: ticket!, quote: quote!, invoice: invoice!, order: order!, other } };
}

