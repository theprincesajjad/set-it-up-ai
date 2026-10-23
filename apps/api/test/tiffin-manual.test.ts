import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, merchants, notifications, tiffinCharges, tiffinSubscriptions } from "@ll/db";
import { computeFees, platformFeeFor } from "../src/services/fees.js";
import { generateDeliveries, remindManualCharges, rollBilling } from "../src/services/tiffin.js";
import { call, customer, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createTestEnv, grantFeatures, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
// 2026-11-03 10:00 Toronto (EST), a Tuesday.
const T0 = new Date("2026-11-03T15:00:00Z");
beforeEach(async () => {
  env = await createTestEnv({ now: T0 });
});
afterEach(async () => env.close());

/** A kitchen with NO Stripe account that takes e-transfer. */
async function kitchen(opts: { cash?: boolean; startOnTrust?: boolean; graceDays?: number; taxRegistered?: boolean } = {}) {
  const m = await paidMerchant(env, { plan: "free", connect: false });
  await grantFeatures(env, m.merchant.id, ["restaurant.tiffin"]);
  const base = `/v1/merchants/${m.merchant.id}`;
  const set = await call(env, m.ownerToken, "PUT", `${base}/payment-settings`, { etransferEnabled: true, etransferEmail: "Pay@ShreeKitchen.ca", instructions: "Auto-deposit is on.", cashEnabled: !!opts.cash, startOnTrust: !!opts.startOnTrust, graceDays: opts.graceDays ?? 3 });
  expect(set.status).toBe(200);
  if (opts.taxRegistered !== undefined) await call(env, m.ownerToken, "PUT", `${base}/tax-settings`, { taxRegistered: opts.taxRegistered, taxNumber: opts.taxRegistered ? "123456789RT0001" : null });
  const plan = (await call(env, m.ownerToken, "POST", `${base}/tiffin/plans`, { name: "Veg thali", cadence: "monthly", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 12000, deliveryFeeCents: 1000, cutoffHours: 24 })).body;
  return { m, base, tiffin: `${base}/tiffin`, plan };
}
type K = Awaited<ReturnType<typeof kitchen>>;

async function join(k: K, body: Record<string, unknown> = {}, who?: Awaited<ReturnType<typeof customer>>) {
  const c = who ?? (await customer(env, { name: "Jaspreet Mann" }));
  const r = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", { planId: k.plan.id, servings: 1, fulfilment: "delivery", address: "12 Queen St W", postalCode: "L4T 1A1", startDate: "2026-11-04", paymentMethod: "etransfer", ...body });
  return { c, r, sub: r.body?.subscription, charge: r.body?.charge, manual: r.body?.manual };
}
const events = async (userId: string) => (await env.db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, "tiffin_update")))).map((n) => n.data.event);

describe("subscribing without Stripe", () => {
  it("takes an e-transfer subscriber on a kitchen with no Stripe account", async () => {
    const k = await kitchen();
    const pub = await call(env, null, "GET", `/v1/public/shops/${k.m.merchant.slug}/tiffin/plans`);
    expect(pub.body.accepted).toEqual({ card: false, pad: false, etransfer: true, cash: false });
    expect(pub.body.etransfer).toEqual({ email: "pay@shreekitchen.ca", instructions: "Auto-deposit is on." });

    const j = await join(k);
    expect(j.r.status).toBe(201);
    expect(j.r.body.payment).toBeNull();
    expect(j.sub.status).toBe("pending");
    expect(j.sub.paymentMethod).toBe("etransfer");
    expect(j.charge).toMatchObject({ status: "awaiting", amountCents: 13000, platformFeeCents: 0, taxCents: 0, remainingCents: 13000 });
    expect(j.charge.referenceCode).toMatch(/^JM-\d{4}$/);
    expect(j.manual).toEqual({ email: "pay@shreekitchen.ca", amountCents: 13000, referenceCode: j.charge.referenceCode, instructions: "Auto-deposit is on." });
    // One "how to pay" message with the reference.
    expect(await events(j.c.user.id)).toContain("payment_due");

    // Card is refused on this kitchen; an e-transfer is refused on one that doesn't take it.
    const card = await join(k, { paymentMethod: "card" }, await customer(env));
    expect(card.r.status).toBe(409);
    const cash = await join(k, { paymentMethod: "cash" }, await customer(env));
    expect(cash.r.status).toBe(400);
  });

  it("starts on trust when the kitchen allows it, and cash gets plain instructions", async () => {
    const k = await kitchen({ cash: true, startOnTrust: true });
    const j = await join(k, { paymentMethod: "cash" });
    expect(j.sub.status).toBe("active");
    expect(j.manual).toMatchObject({ email: "", amountCents: 13000 });
    expect(j.manual.instructions).toContain(j.charge.referenceCode);
  });

  it("keeps card kitchens working and shows all methods when both are set up", async () => {
    const m = await paidMerchant(env, { plan: "free" });
    await grantFeatures(env, m.merchant.id, ["restaurant.tiffin"]);
    await call(env, m.ownerToken, "PUT", `/v1/merchants/${m.merchant.id}/payment-settings`, { etransferEnabled: true, etransferEmail: "pay@x.ca" });
    const pub = await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/tiffin/plans`);
    expect(pub.body.accepted).toMatchObject({ card: true, etransfer: true, cash: false });
  });
});

describe("record payment", () => {
  it("records the full amount: charge paid, subscription active, one ledger row, one receipt, no platform fee, audited", async () => {
    const k = await kitchen();
    const j = await join(k);
    const rec = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, { method: "etransfer", amountCents: 13000, receivedOn: "2026-11-03", bankReference: "CA8H2K", note: "auto-deposit" });
    expect(rec.status).toBe(200);
    expect(rec.body).toMatchObject({ status: "paid", paidMethod: "etransfer", receivedOn: "2026-11-03", remainingCents: 0, platformFeeCents: 0 });
    const [sub] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, j.sub.id));
    expect(sub!.status).toBe("active");
    expect((await events(j.c.user.id)).filter((e) => e === "payment_receipt")).toHaveLength(1);
    const audit = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "payment.record"));
    expect(audit).toHaveLength(1);
    // Deliveries start now the subscription is active.
    expect((await generateDeliveries(env.ctx, "2026-11-04")).created).toBe(1);
    // It shows in revenue by method and leaves the awaiting list.
    const rev = await call(env, k.m.ownerToken, "GET", `${k.tiffin}/revenue?month=2026-11`);
    expect(rev.body.collectedByMethod).toEqual([{ method: "etransfer", cents: 13000, count: 1 }]);
    expect(rev.body.awaitingCount).toBe(0);
    expect((await call(env, k.m.ownerToken, "GET", `${k.tiffin}/awaiting`)).body.items).toHaveLength(0);
  });

  it("is idempotent: a second record answers 409 with the existing record", async () => {
    const k = await kitchen();
    const j = await join(k);
    const body = { method: "etransfer", amountCents: 13000, receivedOn: "2026-11-03" };
    await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, body);
    const again = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, body);
    expect(again.status).toBe(409);
    expect(again.body.error?.details ?? again.body.details).toMatchObject({ payment: { method: "etransfer", amountCents: 13000 } });
    const [row] = await env.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, j.charge.id));
    expect(row!.paidCents).toBe(13000);
  });

  it("keeps an under-payment awaiting with the remainder; void reopens; over-payment is flagged", async () => {
    const k = await kitchen();
    const j = await join(k);
    const part = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, { method: "cash", amountCents: 5000, receivedOn: "2026-11-03", sendReceipt: false });
    expect(part.body).toMatchObject({ status: "awaiting", remainingCents: 8000 });
    expect(await events(j.c.user.id)).not.toContain("payment_receipt");
    const rest = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, { method: "etransfer", amountCents: 9000, receivedOn: "2026-11-03" });
    expect(rest.body).toMatchObject({ status: "paid", remainingCents: 0, overpaidCents: 1000 });

    const voided = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${j.charge.id}/void-payment`, { reason: "Wrong person" });
    expect(voided.status).toBe(200);
    expect(voided.body).toMatchObject({ status: "awaiting", remainingCents: 8000, overpaidCents: 0 });
    // Voiding the only paid charge sends the subscription back to waiting.
    const [sub] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, j.sub.id));
    expect(sub!.status).toBe("pending");
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "payment.void"))).toHaveLength(1);
    // Nothing left to void on a fresh charge.
    const k2 = await join(k);
    const none = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${k2.charge.id}/void-payment`, { reason: "x" });
    expect(none.status).toBe(409);
  });

  it("rejects a future date and non-staff, and lists awaiting charges for the kitchen", async () => {
    const k = await kitchen();
    const j = await join(k);
    const future = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, { method: "etransfer", amountCents: 13000, receivedOn: "2026-11-04" });
    expect(future.status).toBe(400);
    const nope = await call(env, j.c.token, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, { method: "etransfer", amountCents: 13000, receivedOn: "2026-11-03" });
    expect(nope.status).toBe(403);
    const awaiting = await call(env, k.m.ownerToken, "GET", `${k.tiffin}/awaiting`);
    expect(awaiting.body).toMatchObject({ totalCents: 13000, items: [{ customerName: "Jaspreet Mann", remainingCents: 13000, ageDays: 0, referenceCode: j.charge.referenceCode }] });
    // Staff (not just owners) can record.
    const staff = await staffMember(env, k.m.merchant.id, "staff");
    const ok = await call(env, staff.token, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, { method: "etransfer", amountCents: 13000, receivedOn: "2026-11-03" });
    expect(ok.status).toBe(200);
  });

  it("filters subscribers by how they pay and by awaiting, and shows the awaiting amount", async () => {
    const k = await kitchen();
    const a = await join(k);
    await join(k, { paymentMethod: "etransfer" }, await customer(env, { name: "Bina Shah" }));
    await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${a.charge.id}/record-payment`, { method: "etransfer", amountCents: 13000, receivedOn: "2026-11-03" });
    const all = await call(env, k.m.ownerToken, "GET", `${k.tiffin}/subscribers?payment=etransfer`);
    expect(all.body.items).toHaveLength(2);
    expect((await call(env, k.m.ownerToken, "GET", `${k.tiffin}/subscribers?payment=card`)).body.items).toHaveLength(0);
    const aw = await call(env, k.m.ownerToken, "GET", `${k.tiffin}/subscribers?awaiting=true`);
    expect(aw.body.items).toHaveLength(1);
    expect(aw.body.items[0]).toMatchObject({ customer: { name: "Bina Shah" }, awaitingCents: 13000 });
    expect(aw.body.items[0].awaitingReferenceCode).toMatch(/^BS-/);
  });
});

describe("renewals, reminders and grace", () => {
  it("rolls a hand-paid renewal to awaiting without Stripe, notifies once, reminds on day 1 and 3, then goes past due after the grace days", async () => {
    const k = await kitchen({ startOnTrust: true });
    const j = await join(k);
    // First period paid by hand.
    await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${j.charge.id}/record-payment`, { method: "etransfer", amountCents: 13000, receivedOn: "2026-11-03" });
    // Next period starts Dec 5 (period Nov 4 to Dec 3, next billing Dec 4).
    env.clock.now = new Date("2026-12-04T15:00:00Z");
    expect((await rollBilling(env.ctx)).errors).toBe(0);
    const [renewal] = await env.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, j.sub.id), eq(tiffinCharges.status, "awaiting")));
    expect(renewal).toBeTruthy();
    expect(renewal!.stripePaymentIntentId).toBeNull();
    expect(renewal!.referenceCode).not.toBe(j.charge.referenceCode);
    await rollBilling(env.ctx);
    expect((await events(j.c.user.id)).filter((e) => e === "renewal_due")).toHaveLength(1);

    // Day 1 reminder (not in quiet hours: 10:00).
    env.clock.now = new Date("2026-12-05T15:00:00Z");
    expect((await remindManualCharges(env.ctx)).reminded).toBe(1);
    expect((await remindManualCharges(env.ctx)).reminded).toBe(0);
    // Day 3: second reminder, and the grace (3 days) ends: past due.
    env.clock.now = new Date("2026-12-07T15:00:00Z");
    const r = await remindManualCharges(env.ctx);
    expect(r).toEqual({ reminded: 1, pastDue: 1 });
    const [sub] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, j.sub.id));
    expect(sub!.status).toBe("past_due");
    // Past due: tomorrow's delivery list excludes them.
    expect((await generateDeliveries(env.ctx, "2026-12-08")).created).toBe(0);
    // Recording the payment brings them back.
    // Access tokens expire on the fake clock: sign in again.
    const owner = await tokenFor(env, k.m.owner);
    const rr = await call(env, owner, "POST", `${k.tiffin}/charges/${renewal!.id}/record-payment`, { method: "etransfer", amountCents: 13000, receivedOn: "2026-12-07" });
    expect(rr.status).toBe(200);
    const [back] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, j.sub.id));
    expect(back!.status).toBe("active");
  });

  it("waits out quiet hours for reminders", async () => {
    const k = await kitchen();
    const j = await join(k);
    // 22:00 Toronto, the next day.
    env.clock.now = new Date("2026-11-05T03:00:00Z");
    expect((await remindManualCharges(env.ctx)).reminded).toBe(0);
    env.clock.now = new Date("2026-11-05T15:00:00Z");
    expect((await remindManualCharges(env.ctx)).reminded).toBe(1);
    expect(j.charge.id).toBeTruthy();
  });
});

describe("fees and tax", () => {
  it("hand-recorded payments carry no platform fee", () => {
    const m = { plan: "free" as const, restaurantTier: null };
    expect(platformFeeFor("manual", 13000, m)).toBe(0);
    expect(computeFees({ kind: "manual", amountCents: 13000, plan: "free" })).toMatchObject({ platformFeeBps: 0, platformFeeCents: 0, merchantNetCents: 13000 });
    expect(platformFeeFor("tiffin", 13000, m)).toBe(130);
  });

  it("adds HST to a registered kitchen's charge (fee on the pre-tax amount) and nothing when not registered", async () => {
    const reg = await kitchen({ taxRegistered: true });
    const j = await join(reg);
    expect(j.charge).toMatchObject({ amountCents: 14690, taxCents: 1690, platformFeeCents: 0 });
    const non = await kitchen({ taxRegistered: false });
    expect((await join(non)).charge).toMatchObject({ amountCents: 13000, taxCents: 0 });
    // A card kitchen: 1% of the pre-tax price.
    const m = await paidMerchant(env, { plan: "free" });
    await grantFeatures(env, m.merchant.id, ["restaurant.tiffin"]);
    await call(env, m.ownerToken, "PUT", `/v1/merchants/${m.merchant.id}/tax-settings`, { taxRegistered: true, taxNumber: "123456789" });
    const plan = (await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/tiffin/plans`, { name: "Weekday", priceCents: 10000 })).body;
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", { planId: plan.id, fulfilment: "pickup", startDate: "2026-11-04", paymentMethod: "card" });
    expect(r.body.charge).toMatchObject({ amountCents: 11300, taxCents: 1300, platformFeeCents: 100 });
    // Plans can opt out of tax.
    const [mm] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
    expect(mm!.taxRegistered).toBe(true);
  });
});

describe("settings", () => {
  it("only owners change payment settings; validates the email, grace days and requires an email to turn e-transfer on", async () => {
    const k = await kitchen();
    const url = `${k.base}/payment-settings`;
    const mgr = await staffMember(env, k.m.merchant.id, "manager");
    expect((await call(env, mgr.token, "PUT", url, { etransferEnabled: false })).status).toBe(403);
    expect((await call(env, mgr.token, "GET", url)).status).toBe(200);
    expect((await call(env, k.m.ownerToken, "PUT", url, { etransferEnabled: true, etransferEmail: "not-an-email" })).status).toBe(400);
    expect((await call(env, k.m.ownerToken, "PUT", url, { etransferEnabled: true })).status).toBe(400);
    expect((await call(env, k.m.ownerToken, "PUT", url, { graceDays: 15 })).status).toBe(400);
    const ok = await call(env, k.m.ownerToken, "GET", url);
    expect(ok.body).toMatchObject({ etransferEnabled: true, etransferEmail: "pay@shreekitchen.ca", graceDays: 3, startOnTrust: false, stripeReady: false });
  });

  it("stores tax status (GST/HST number checked) and food safety dates", async () => {
    const k = await kitchen();
    const tax = `${k.base}/tax-settings`;
    expect((await call(env, k.m.ownerToken, "GET", tax)).body).toMatchObject({ taxRegistered: null, rateBps: 1300 });
    expect((await call(env, k.m.ownerToken, "PUT", tax, { taxRegistered: true, taxNumber: "12345" })).status).toBe(400);
    expect((await call(env, k.m.ownerToken, "PUT", tax, { taxRegistered: true, taxNumber: "123456789 rt0001" })).body).toMatchObject({ taxRegistered: true, taxNumber: "123456789RT0001", rateBps: 1300 });
    expect((await call(env, k.m.ownerToken, "PUT", tax, { taxRegistered: false, taxSmallSupplierNote: true })).body).toMatchObject({ taxRegistered: false, taxNumber: null, rateBps: 0, taxSmallSupplierNote: true });

    const fs = `${k.base}/food-safety`;
    const saved = await call(env, k.m.ownerToken, "PUT", fs, { foodHandlerExpiry: "2026-12-20", healthUnit: "Peel", foodHandlerBadge: true });
    expect(saved.body).toMatchObject({ foodHandlerExpiry: "2026-12-20", healthUnit: "Peel", foodHandlerBadge: true, daysToExpiry: 47 });
    // The badge needs a date to point at.
    expect((await call(env, k.m.ownerToken, "PUT", fs, { foodHandlerBadge: true })).body).toMatchObject({ foodHandlerBadge: false, daysToExpiry: null });
  });
});
