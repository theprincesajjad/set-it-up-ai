import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appointments,
  auditLogs,
  hallBookings,
  halls,
  locations,
  orders,
  phoneCalls,
  quotes,
  reviewRequests,
  serviceTickets,
  ticketEvents,
  tiffinDriverLinks,
  tiffinPlans,
  tiffinRoutes,
  tiffinSubscriptions,
  whatsappMessages,
  whatsappSessions,
} from "@ll/db";
import { RETENTION, daysAgo, legalTokens, monthsAgo } from "@ll/shared";
import { jobs } from "../src/jobs/index.js";
import { MemoryStorage } from "../src/providers/storage.js";
import {
  purgeAbandonedHolds,
  purgeClosedTickets,
  purgeDriverLinks,
  purgeWhatsappMessages,
  runRetention,
  scrubAllergyNotes,
  scrubAppointments,
  scrubPhoneCalls,
  scrubReviewFeedback,
  scrubTiffinAddresses,
} from "../src/services/retention.js";
import { createMerchant, createTestEnv, createUser, nextPhone, type TestEnv } from "./helpers.js";

let env: TestEnv;
const NOW = new Date("2026-11-03T15:00:00Z");
beforeEach(async () => {
  env = await createTestEnv({ now: NOW });
});
afterEach(async () => env.close());

const ago = {
  days: (n: number) => daysAgo(NOW, n),
  months: (n: number) => monthsAgo(NOW, n),
};
/** Just past the period, and just inside it. */
const past = (d: Date) => new Date(d.getTime() - 3_600_000);
const inside = (d: Date) => new Date(d.getTime() + 3_600_000);

describe("retention periods come from one config", () => {
  it("the policy prints the numbers from RETENTION", () => {
    const t = legalTokens();
    expect(t["retention.phoneTranscriptDays"]).toBe("90 days");
    expect(t["retention.repairPhotoMonths"]).toBe("24 months");
    expect(t["retention.tiffinAddressMonths"]).toBe("12 months");
    for (const k of Object.keys(RETENTION)) expect(t[`retention.${k}`], k).toBeTruthy();
  });
  it("the job is registered", () => {
    expect(jobs.some((j) => j.name === "privacy.retention")).toBe(true);
  });
});

describe("phone transcripts", () => {
  it("blanks transcript, drafted order and number after the period; keeps the order link; leaves fresh calls alone", async () => {
    const { merchant } = await createMerchant(env);
    const phone = nextPhone();
    const [old] = await env.db.insert(phoneCalls).values({ merchantId: merchant.id, fromPhone: phone, transcript: "two samosas", draftOrder: { items: [{ name: "samosa", quantity: 2 }] }, status: "confirmed", createdAt: past(ago.days(RETENTION.phoneTranscriptDays)) }).returning();
    const [fresh] = await env.db.insert(phoneCalls).values({ merchantId: merchant.id, fromPhone: phone, transcript: "one chai", status: "drafted", createdAt: inside(ago.days(RETENTION.phoneTranscriptDays)) }).returning();
    expect(await scrubPhoneCalls(env.ctx)).toBe(1);
    const [a] = await env.db.select().from(phoneCalls).where(eq(phoneCalls.id, old!.id));
    expect(a).toMatchObject({ transcript: null, draftOrder: null, fromPhone: "[expired]", status: "confirmed" });
    const [b] = await env.db.select().from(phoneCalls).where(eq(phoneCalls.id, fresh!.id));
    expect(b).toMatchObject({ transcript: "one chai", fromPhone: phone });
    expect(await scrubPhoneCalls(env.ctx)).toBe(0);
  });
});

describe("WhatsApp", () => {
  it("deletes message bodies after the period and clears carts and allergy notes on quiet chats", async () => {
    const { merchant } = await createMerchant(env);
    const [quiet] = await env.db.insert(whatsappSessions).values({ merchantId: merchant.id, phone: nextPhone(), cart: [{ catalogItemId: "i", quantity: 1 }], allergyNote: "peanuts", lastInboundAt: past(ago.days(RETENTION.whatsappMessageDays)) }).returning();
    const [live] = await env.db.insert(whatsappSessions).values({ merchantId: merchant.id, phone: nextPhone(), cart: [{ catalogItemId: "i", quantity: 1 }], allergyNote: "dairy", lastInboundAt: inside(ago.days(RETENTION.whatsappMessageDays)) }).returning();
    await env.db.insert(whatsappMessages).values([
      { merchantId: merchant.id, sessionId: quiet!.id, direction: "in", body: "old hello", createdAt: past(ago.days(RETENTION.whatsappMessageDays)) },
      { merchantId: merchant.id, sessionId: live!.id, direction: "in", body: "new hello", createdAt: inside(ago.days(RETENTION.whatsappMessageDays)) },
    ]);
    expect(await purgeWhatsappMessages(env.ctx)).toEqual({ messages: 1, sessions: 1 });
    expect((await env.db.select().from(whatsappMessages)).map((m) => m.body)).toEqual(["new hello"]);
    const [q] = await env.db.select().from(whatsappSessions).where(eq(whatsappSessions.id, quiet!.id));
    expect(q).toMatchObject({ cart: [], allergyNote: null });
    const [l] = await env.db.select().from(whatsappSessions).where(eq(whatsappSessions.id, live!.id));
    expect(l).toMatchObject({ allergyNote: "dairy" });
    expect(l!.cart).toHaveLength(1);
  });
});

describe("repair photos and closed tickets", () => {
  async function ticket(merchantId: string, userId: string, status: "picked_up" | "cancelled" | "in_progress", updatedAt: Date, photos: string[]) {
    const [t] = await env.db.insert(serviceTickets).values({ merchantId, userId, number: Math.floor(Math.random() * 1e6), issue: "cracked screen", itemDetails: { imei: "123" }, intakeNotes: "passcode 0000", photos, status, shelfLocation: "A1", statusToken: `st-${Math.random()}`, updatedAt }).returning();
    return t!;
  }
  it("deletes the stored files, then the links, item text, notes and quote signature of tickets closed longer than the period", async () => {
    const { merchant } = await createMerchant(env);
    const user = await createUser(env.db, { name: "Pat" });
    const storage = new MemoryStorage();
    env.ctx.providers.storage = storage;
    const oldFile = await storage.put({ merchantId: merchant.id, contentType: "image/jpeg", body: Buffer.from("a") });
    const liveFile = await storage.put({ merchantId: merchant.id, contentType: "image/jpeg", body: Buffer.from("b") });
    const openFile = await storage.put({ merchantId: merchant.id, contentType: "image/jpeg", body: Buffer.from("c") });
    const old = await ticket(merchant.id, user.id, "picked_up", past(ago.months(RETENTION.repairPhotoMonths)), [oldFile.url]);
    const recent = await ticket(merchant.id, user.id, "picked_up", inside(ago.months(RETENTION.repairPhotoMonths)), [liveFile.url]);
    const open = await ticket(merchant.id, user.id, "in_progress", past(ago.months(RETENTION.repairPhotoMonths + 6)), [openFile.url]);
    await env.db.insert(ticketEvents).values({ ticketId: old.id, note: "called Pat" });
    await env.db.insert(quotes).values({ ticketId: old.id, merchantId: merchant.id, lineItems: [], subtotalCents: 100, totalCents: 113, approvalToken: "qt", signatureName: "Pat", signatureIp: "1.2.3.4", signatureUserAgent: "UA", status: "approved" });

    expect(await purgeClosedTickets(env.ctx)).toEqual({ tickets: 1, files: 1 });
    expect([...storage.objects.keys()].sort()).toEqual([liveFile.key, openFile.key].sort());
    const [o] = await env.db.select().from(serviceTickets).where(eq(serviceTickets.id, old.id));
    expect(o).toMatchObject({ photos: [], issue: "[expired]", itemDetails: {}, intakeNotes: null, shelfLocation: null, statusToken: null, status: "picked_up" });
    expect(o!.updatedAt.getTime()).toBe(old.updatedAt.getTime());
    expect((await env.db.select().from(ticketEvents))[0]!.note).toBeNull();
    expect((await env.db.select().from(quotes))[0]).toMatchObject({ signatureName: null, signatureIp: null, signatureUserAgent: null, totalCents: 113 });
    expect((await env.db.select().from(serviceTickets).where(eq(serviceTickets.id, recent.id)))[0]!.photos).toEqual([liveFile.url]);
    expect((await env.db.select().from(serviceTickets).where(eq(serviceTickets.id, open.id)))[0]!.photos).toEqual([openFile.url]);
    expect(await purgeClosedTickets(env.ctx)).toEqual({ tickets: 0, files: 0 });
  });
  it("a cancelled ticket counts as closed", async () => {
    const { merchant } = await createMerchant(env);
    const user = await createUser(env.db);
    await ticket(merchant.id, user.id, "cancelled", past(ago.months(RETENTION.repairPhotoMonths)), []);
    expect((await purgeClosedTickets(env.ctx)).tickets).toBe(1);
  });
});

describe("review feedback", () => {
  it("deletes the comment and the reply after the period, keeps the rating", async () => {
    const { merchant } = await createMerchant(env);
    const user = await createUser(env.db);
    const [old] = await env.db.insert(reviewRequests).values({ merchantId: merchant.id, userId: user.id, channel: "sms", token: "a", rating: 2, feedback: "cold food", replyBody: "sorry", createdAt: past(ago.months(RETENTION.reviewFeedbackMonths)) }).returning();
    const [fresh] = await env.db.insert(reviewRequests).values({ merchantId: merchant.id, userId: user.id, channel: "sms", token: "b", rating: 3, feedback: "ok", createdAt: inside(ago.months(RETENTION.reviewFeedbackMonths)) }).returning();
    expect(await scrubReviewFeedback(env.ctx)).toBe(1);
    expect((await env.db.select().from(reviewRequests).where(eq(reviewRequests.id, old!.id)))[0]).toMatchObject({ feedback: null, replyBody: null, rating: 2 });
    expect((await env.db.select().from(reviewRequests).where(eq(reviewRequests.id, fresh!.id)))[0]!.feedback).toBe("ok");
  });
});

describe("driver links", () => {
  it("deletes link rows that expired more than the period ago", async () => {
    const { merchant } = await createMerchant(env);
    const [route] = await env.db.insert(tiffinRoutes).values({ merchantId: merchant.id, name: "North" }).returning();
    await env.db.insert(tiffinDriverLinks).values([
      { merchantId: merchant.id, routeId: route!.id, date: "2026-09-01", token: "t-old-0123456789abcdef", expiresAt: past(ago.days(RETENTION.driverLinkDays)) },
      { merchantId: merchant.id, routeId: route!.id, date: "2026-10-30", token: "t-new-0123456789abcdef", expiresAt: inside(ago.days(RETENTION.driverLinkDays)) },
    ]);
    expect(await purgeDriverLinks(env.ctx)).toBe(1);
    expect((await env.db.select().from(tiffinDriverLinks)).map((l) => l.token)).toEqual(["t-new-0123456789abcdef"]);
  });
});

describe("tiffin addresses", () => {
  it("clears address, postal code, location and notes of subscriptions cancelled longer ago than the period; keeps active ones", async () => {
    const { merchant } = await createMerchant(env);
    const user = await createUser(env.db);
    const [plan] = await env.db.insert(tiffinPlans).values({ merchantId: merchant.id, name: "Thali", priceCents: 9000 }).returning();
    const base = { merchantId: merchant.id, planId: plan!.id, userId: user.id, startDate: "2025-01-01", priceCents: 9000, address: "5 Elm", addressNotes: "side door", postalCode: "L4T 1A1", lat: 1, lng: 2, dietaryNotes: "no onion" };
    const [ended] = await env.db.insert(tiffinSubscriptions).values({ ...base, status: "cancelled", cancelledAt: past(ago.months(RETENTION.tiffinAddressMonths)) }).returning();
    const [recent] = await env.db.insert(tiffinSubscriptions).values({ ...base, status: "cancelled", cancelledAt: inside(ago.months(RETENTION.tiffinAddressMonths)) }).returning();
    const [active] = await env.db.insert(tiffinSubscriptions).values({ ...base, status: "active" }).returning();
    expect(await scrubTiffinAddresses(env.ctx)).toBe(1);
    expect((await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, ended!.id)))[0]).toMatchObject({ address: null, addressNotes: null, postalCode: null, lat: null, lng: null, dietaryNotes: null, priceCents: 9000 });
    for (const id of [recent!.id, active!.id]) expect((await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, id)))[0]!.address).toBe("5 Elm");
  });
});

describe("allergy notes", () => {
  it("clears the note on orders done longer ago than the period, not on open or recent ones; keeps the order", async () => {
    const { merchant } = await createMerchant(env);
    const user = await createUser(env.db);
    const mk = (number: number, status: "picked_up" | "cancelled" | "preparing", at: Date) =>
      env.db.insert(orders).values({ merchantId: merchant.id, userId: user.id, number, subtotalCents: 1000, totalCents: 1130, status, allergyNote: "peanuts", pickedUpAt: status === "picked_up" ? at : null, updatedAt: at }).returning().then((r) => r[0]!);
    const done = await mk(1, "picked_up", past(ago.days(RETENTION.allergyNoteDays)));
    const cancelled = await mk(2, "cancelled", past(ago.days(RETENTION.allergyNoteDays)));
    const recent = await mk(3, "picked_up", inside(ago.days(RETENTION.allergyNoteDays)));
    const open = await mk(4, "preparing", past(ago.days(RETENTION.allergyNoteDays + 10)));
    expect(await scrubAllergyNotes(env.ctx)).toBe(2);
    const note = async (id: string) => (await env.db.select().from(orders).where(eq(orders.id, id)))[0]!;
    expect((await note(done.id)).allergyNote).toBeNull();
    expect((await note(done.id)).totalCents).toBe(1130);
    expect((await note(cancelled.id)).allergyNote).toBeNull();
    expect((await note(recent.id)).allergyNote).toBe("peanuts");
    expect((await note(open.id)).allergyNote).toBe("peanuts");
  });
});

describe("appointments", () => {
  it("clears the typed name and notes after the period", async () => {
    const { merchant } = await createMerchant(env);
    const [loc] = await env.db.insert(locations).values({ merchantId: merchant.id, name: "Main", address: "1 Main", qrCode: "qr1" }).returning();
    const mk = (end: Date) => env.db.insert(appointments).values({ merchantId: merchant.id, locationId: loc!.id, customerName: "Pat", notes: "n", clientNote: "c", startsAt: new Date(end.getTime() - 3_600_000), endsAt: end, status: "completed" }).returning().then((r) => r[0]!);
    const old = await mk(past(ago.months(RETENTION.appointmentMonths)));
    const fresh = await mk(inside(ago.months(RETENTION.appointmentMonths)));
    expect(await scrubAppointments(env.ctx)).toBe(1);
    expect((await env.db.select().from(appointments).where(eq(appointments.id, old.id)))[0]).toMatchObject({ customerName: null, notes: null, clientNote: null, status: "completed" });
    expect((await env.db.select().from(appointments).where(eq(appointments.id, fresh.id)))[0]!.customerName).toBe("Pat");
  });
});

describe("abandoned holds", () => {
  it("deletes unpaid lapsed appointment and hall holds after the period; keeps paid ones and recent ones", async () => {
    const { merchant } = await createMerchant(env);
    const user = await createUser(env.db);
    const [loc] = await env.db.insert(locations).values({ merchantId: merchant.id, name: "Main", address: "1 Main", qrCode: "qr2" }).returning();
    const at = new Date(NOW.getTime() + 86_400_000);
    const appt = (cancelledAt: Date, paid: boolean) => env.db.insert(appointments).values({ merchantId: merchant.id, locationId: loc!.id, userId: user.id, startsAt: at, endsAt: new Date(at.getTime() + 3_600_000), status: "cancelled", cancelReason: "hold_expired", cancelledAt, depositPaidAt: paid ? NOW : null }).returning().then((r) => r[0]!);
    const oldUnpaid = await appt(past(ago.days(RETENTION.abandonedHoldDays)), false);
    const oldPaid = await appt(past(ago.days(RETENTION.abandonedHoldDays)), true);
    const recent = await appt(inside(ago.days(RETENTION.abandonedHoldDays)), false);
    const [hall] = await env.db.insert(halls).values({ merchantId: merchant.id, name: "Grand", capacity: 100 }).returning();
    const hb = (expires: Date, paid: boolean) => env.db.insert(hallBookings).values({ hallId: hall!.id, merchantId: merchant.id, userId: user.id, startsAt: at, endsAt: new Date(at.getTime() + 3_600_000), headcount: 10, status: "cancelled", holdExpiresAt: expires, depositPaidAt: paid ? NOW : null }).returning().then((r) => r[0]!);
    const hOld = await hb(past(ago.days(RETENTION.abandonedHoldDays)), false);
    const hPaid = await hb(past(ago.days(RETENTION.abandonedHoldDays)), true);
    const hRecent = await hb(inside(ago.days(RETENTION.abandonedHoldDays)), false);
    expect(await purgeAbandonedHolds(env.ctx)).toEqual({ appointments: 1, halls: 1 });
    const apptIds = (await env.db.select().from(appointments)).map((a) => a.id);
    expect(apptIds).not.toContain(oldUnpaid.id);
    expect(apptIds).toEqual(expect.arrayContaining([oldPaid.id, recent.id]));
    const hallIds = (await env.db.select().from(hallBookings)).map((h) => h.id);
    expect(hallIds).not.toContain(hOld.id);
    expect(hallIds).toEqual(expect.arrayContaining([hPaid.id, hRecent.id]));
  });
});

describe("runRetention", () => {
  it("runs every rule, writes one audit row, and is idempotent", async () => {
    const { merchant } = await createMerchant(env);
    await env.db.insert(phoneCalls).values({ merchantId: merchant.id, fromPhone: nextPhone(), transcript: "x", createdAt: past(ago.days(RETENTION.phoneTranscriptDays)) });
    const r = await runRetention(env.ctx);
    expect(r.phoneCalls).toBe(1);
    expect(Object.keys(r).sort()).toEqual(["allergyNotes", "appointments", "driverLinks", "holdAppointments", "holdHalls", "phoneCalls", "photoFiles", "reviewFeedback", "tickets", "tiffinAddresses", "whatsappMessages", "whatsappSessions"]);
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "retention.run"))).toHaveLength(1);
    const again = await runRetention(env.ctx);
    expect(Object.values(again).every((n) => n === 0)).toBe(true);
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "retention.run"))).toHaveLength(1);
  });
  it("the job entry runs it", async () => {
    const { merchant } = await createMerchant(env);
    await env.db.insert(phoneCalls).values({ merchantId: merchant.id, fromPhone: nextPhone(), transcript: "x", createdAt: past(ago.days(RETENTION.phoneTranscriptDays)) });
    await jobs.find((j) => j.name === "privacy.retention")!.run(env.ctx);
    expect((await env.db.select().from(phoneCalls))[0]!.transcript).toBeNull();
  });
});
