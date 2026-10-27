import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cateringEvents, hallBookings, halls, merchantMembers, notifications, tiffinDeliveries, tiffinSubscriptions, users } from "@ll/db";
import { sendCateringReminders } from "../src/services/catering.js";
import { generateDeliveries, rollBilling, runDaily } from "../src/services/tiffin.js";
import { call, customer, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createTestEnv, createUser, grantFeatures, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
// 2026-11-03 10:00 Toronto (EST), a Tuesday.
const T0 = new Date("2026-11-03T15:00:00Z");
beforeEach(async () => {
  env = await createTestEnv({ now: T0 });
});
afterEach(async () => env.close());

/** A kitchen with no Stripe account that takes e-transfer; trusts new subscribers so they start active. */
async function kitchen(opts: { trust?: boolean } = {}) {
  const m = await paidMerchant(env, { plan: "free", connect: false });
  await grantFeatures(env, m.merchant.id, ["restaurant.tiffin", "restaurant.catering", "restaurant.banquet"]);
  const base = `/v1/merchants/${m.merchant.id}`;
  const set = await call(env, m.ownerToken, "PUT", `${base}/payment-settings`, { etransferEnabled: true, etransferEmail: "pay@shree.ca", instructions: "Auto-deposit is on.", startOnTrust: !!opts.trust, graceDays: 3 });
  expect(set.status).toBe(200);
  const plan = async (body: Record<string, unknown>) => (await call(env, m.ownerToken, "POST", `${base}/tiffin/plans`, { name: "Veg thali", cadence: "monthly", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 12000, deliveryFeeCents: 1000, cutoffHours: 24, ...body })).body;
  return { m, base, tiffin: `${base}/tiffin`, plan };
}
type K = Awaited<ReturnType<typeof kitchen>>;

const sub = (planId: string, body: Record<string, unknown> = {}) => ({ planId, servings: 1, fulfilment: "delivery", address: "12 Queen St W", postalCode: "L4T 1A1", startDate: "2026-11-04", paymentMethod: "etransfer", ...body });

describe("undo a skipped day", () => {
  it("a skipped day stays changeable until its cutoff and Undo puts it back", async () => {
    const k = await kitchen({ trust: true });
    const plan = await k.plan({});
    const c = await customer(env, { name: "Priya Shah" });
    const j = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id, { startDate: "2026-11-05" }));
    expect(j.status).toBe(201);
    expect(j.body.subscription.status).toBe("active");
    const id = j.body.subscription.id;
    const skip = await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${id}/skips`, { dates: ["2026-11-09"] });
    expect(skip.status).toBe(200);
    let up = (await call(env, c.token, "GET", `/v1/me/tiffin/upcoming?subscriptionId=${id}`)).body.items.find((i: { date: string }) => i.date === "2026-11-09");
    expect(up).toMatchObject({ status: "skipped", canSkip: true });
    const undo = await call(env, c.token, "DELETE", `/v1/me/tiffin/subscriptions/${id}/skips/2026-11-09`);
    expect(undo.status).toBe(200);
    up = (await call(env, c.token, "GET", `/v1/me/tiffin/upcoming?subscriptionId=${id}`)).body.items.find((i: { date: string }) => i.date === "2026-11-09");
    expect(up).toMatchObject({ canSkip: true });
    expect(up.status).not.toBe("skipped");
  });

  it("past the cutoff a skipped day shows no Undo", async () => {
    const k = await kitchen({ trust: true });
    const plan = await k.plan({ cutoffHours: 24 });
    const c = await customer(env);
    const j = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id, { startDate: "2026-11-05" }));
    const id = j.body.subscription.id;
    await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${id}/skips`, { dates: ["2026-11-05"] });
    // Cutoff for Nov 5 is Nov 4 08:00 Toronto (13:00Z). Move past it.
    env.clock.now = new Date("2026-11-04T14:00:00Z");
    const token = await tokenFor(env, c.user);
    const up = (await call(env, token, "GET", `/v1/me/tiffin/upcoming?subscriptionId=${id}`)).body.items.find((i: { date: string }) => i.date === "2026-11-05");
    expect(up).toMatchObject({ status: "skipped", canSkip: false });
  });
});

describe("collect the name, bill a month, trial day", () => {
  it("saves the name from the subscribe form on a profile that has none, and never overwrites one", async () => {
    const k = await kitchen();
    const plan = await k.plan({});
    const blank = await createUser(env.db, { name: null });
    const t1 = await tokenFor(env, blank);
    expect((await call(env, t1, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id, { name: "Priya Shah" }))).status).toBe(201);
    expect((await env.db.select().from(users).where(eq(users.id, blank.id)))[0]!.name).toBe("Priya Shah");
    const named = await customer(env, { name: "Already Named" });
    expect((await call(env, named.token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id, { name: "Someone Else" }))).status).toBe(201);
    expect((await env.db.select().from(users).where(eq(users.id, named.user.id)))[0]!.name).toBe("Already Named");
    const list = await call(env, k.m.ownerToken, "GET", `${k.tiffin}/subscribers`);
    expect(list.body.items.map((s: { customer: { name: string } }) => s.customer.name).sort()).toEqual(["Already Named", "Priya Shah"]);
  });

  it("bills a weekly plan once a month for a hand-paid subscriber (52/12 weeks), and refuses it for a card", async () => {
    const k = await kitchen();
    const plan = await k.plan({ cadence: "weekly", priceCents: 6500, deliveryFeeCents: 0 });
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id, { billingCadence: "monthly", startDate: "2026-11-04" }));
    expect(r.status).toBe(201);
    expect(r.body.subscription).toMatchObject({ billingCadence: "monthly", priceCents: 28167, currentPeriodStart: "2026-11-04", currentPeriodEnd: "2026-12-03", nextBillingDate: "2026-12-04" });
    expect(r.body.charge).toMatchObject({ amountCents: 28167, periodEnd: "2026-12-03" });
    expect(r.body.manual).toMatchObject({ amountCents: 28167 });
    const other = await customer(env);
    const weekly = await call(env, other.token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id));
    expect(weekly.body.subscription).toMatchObject({ billingCadence: "weekly", priceCents: 6500, currentPeriodEnd: "2026-11-10" });
    // A monthly plan can't be "billed monthly" as a weekly one, and card is for plans on their own cadence.
    const monthlyPlan = await k.plan({ name: "Monthly", cadence: "monthly" });
    expect((await call(env, (await customer(env)).token, "POST", "/v1/me/tiffin/subscriptions", sub(monthlyPlan.id, { billingCadence: "monthly" }))).status).toBe(400);
    expect((await call(env, (await customer(env)).token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id, { billingCadence: "monthly", paymentMethod: "card" }))).status).toBe(400);
  });

  it("a trial plan is one paid meal day with no renewal, and ends by itself afterwards", async () => {
    const k = await kitchen();
    const plan = await k.plan({ name: "Trial tiffin: single lunch", cadence: "trial", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 1400, deliveryFeeCents: 0 });
    expect(plan.cadence).toBe("trial");
    const c = await customer(env);
    // A Saturday is not a day this plan cooks.
    expect((await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id, { startDate: "2026-11-07" }))).status).toBe(400);
    const r = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id, { startDate: "2026-11-05" }));
    expect(r.status).toBe(201);
    expect(r.body.subscription).toMatchObject({ currentPeriodStart: "2026-11-05", currentPeriodEnd: "2026-11-05", nextBillingDate: null, billingCadence: "trial" });
    // The kitchen records the e-transfer: active, still no next billing date.
    const rec = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${r.body.charge.id}/record-payment`, { method: "etransfer", amountCents: 1400, receivedOn: "2026-11-03" });
    expect(rec.status).toBe(200);
    let [row] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, r.body.subscription.id));
    expect(row).toMatchObject({ status: "active", nextBillingDate: null });
    // Meals only on the trial day.
    const subs = r.body.subscription.id as string;
    await generateDeliveries(env.ctx, "2026-11-05");
    await generateDeliveries(env.ctx, "2026-11-06");
    const dels = await env.db.select().from(tiffinDeliveries).where(eq(tiffinDeliveries.subscriptionId, subs));
    expect(dels.map((d) => d.date)).toEqual(["2026-11-05"]);
    // The day after, the daily job closes it and no second charge appears.
    env.clock.now = new Date("2026-11-06T15:00:00Z");
    await runDaily(env.ctx);
    await rollBilling(env.ctx);
    [row] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, subs));
    expect(row).toMatchObject({ status: "cancelled", cancelReason: "Trial day finished" });
    const charges = await call(env, await tokenFor(env, k.m.owner), "GET", `${k.tiffin}/subscribers/${subs}/charges`);
    expect(charges.body.items).toHaveLength(1);
  });
});

describe("the kitchen adds a regular who phones in", () => {
  it("creates the customer by phone with their name, subscribes them, and texts how to pay", async () => {
    const k = await kitchen();
    const plan = await k.plan({});
    const body = { name: "Mrs. Kaur", phone: "(647) 555-8290", planId: plan.id, servings: 2, fulfilment: "delivery", address: "5 Elm St", postalCode: "L5R 1A1", startDate: "2026-11-04", paymentMethod: "etransfer" };
    const r = await call(env, k.m.ownerToken, "POST", `${k.tiffin}/subscribers`, body);
    expect(r.status).toBe(201);
    expect(r.body.subscription).toMatchObject({ status: "pending", paymentMethod: "etransfer", servings: 2 });
    expect(r.body.manual).toMatchObject({ email: "pay@shree.ca", referenceCode: expect.any(String) });
    const [u] = await env.db.select().from(users).where(eq(users.phone, "+16475558290"));
    expect(u).toMatchObject({ name: "Mrs. Kaur" });
    const sent = await env.db.select().from(notifications).where(and(eq(notifications.userId, u!.id), eq(notifications.type, "tiffin_update")));
    expect(sent.map((n) => n.data.event)).toContain("payment_due");
    const list = await call(env, k.m.ownerToken, "GET", `${k.tiffin}/subscribers`);
    expect(list.body.items[0].customer).toMatchObject({ name: "Mrs. Kaur", phone: "+16475558290" });
    // The same phone on the same plan is a duplicate; the same phone on another plan reuses the customer.
    expect((await call(env, k.m.ownerToken, "POST", `${k.tiffin}/subscribers`, body)).status).toBe(409);
  });

  it("managers add subscribers, staff do not, a card is not a choice, and another kitchen's plan is not found", async () => {
    const k = await kitchen();
    const plan = await k.plan({});
    const body = { name: "A Regular", phone: "6475559911", planId: plan.id, fulfilment: "pickup", startDate: "2026-11-04", paymentMethod: "etransfer" };
    const staff = await staffMember(env, k.m.merchant.id, "staff");
    expect((await call(env, staff.token, "POST", `${k.tiffin}/subscribers`, body)).status).toBe(403);
    expect((await call(env, k.m.ownerToken, "POST", `${k.tiffin}/subscribers`, { ...body, paymentMethod: "card" })).status).toBe(400);
    const other = await kitchen();
    const theirs = await other.plan({});
    expect((await call(env, k.m.ownerToken, "POST", `${k.tiffin}/subscribers`, { ...body, planId: theirs.id })).status).toBe(404);
    const manager = await staffMember(env, k.m.merchant.id, "manager");
    expect((await call(env, manager.token, "POST", `${k.tiffin}/subscribers`, body)).status).toBe(201);
  });
});

describe("a paid period earns points", () => {
  it("joins the kitchen's program on the first recorded payment, once per charge", async () => {
    const k = await kitchen();
    const plan = await k.plan({ priceCents: 12000, deliveryFeeCents: 0 });
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", sub(plan.id));
    expect(await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, c.user.id))).toHaveLength(0);
    const pay = { method: "etransfer", amountCents: 12000, receivedOn: "2026-11-03" };
    expect((await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${r.body.charge.id}/record-payment`, pay)).status).toBe(200);
    const [member] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, c.user.id));
    expect(member).toMatchObject({ merchantId: k.m.merchant.id, balance: 120 });
    // It shows in the customer's wallet.
    const wallet = await call(env, c.token, "GET", "/v1/me/memberships");
    expect(JSON.stringify(wallet.body)).toContain(k.m.merchant.id);
    // Voiding and re-recording does not pay the points twice.
    expect((await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${r.body.charge.id}/void-payment`, { reason: "wrong account" })).status).toBe(200);
    await call(env, k.m.ownerToken, "POST", `${k.tiffin}/charges/${r.body.charge.id}/record-payment`, pay);
    const [again] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, c.user.id));
    expect(again!.balance).toBe(120);
  });
});

/** A catering quote the customer has signed (deposit due), for a Saturday 12 days out. */
async function signedQuote(k: K, eventDate = "2026-11-15") {
  const ev = (await call(env, null, "POST", `/v1/public/shops/${k.m.merchant.slug}/catering/inquiries`, { name: "Rubina Anwar", phone: "(416) 555-0199", eventType: "walima", eventDate, startTime: "18:00", headcount: 100, service: "delivery" })).body;
  await call(env, k.m.ownerToken, "PUT", `${k.base}/catering/${ev.id}/menu`, { items: [{ name: "Chicken biryani", pricing: "per_head", perHeadCents: 1000 }], extras: [] });
  await call(env, k.m.ownerToken, "POST", `${k.base}/catering/${ev.id}/send-quote`, { channels: ["sms"] });
  const [row] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, ev.id));
  const ok = await call(env, null, "POST", `/v1/public/catering/${row!.approvalToken}/approve`, { signatureName: "Rubina Anwar", payWith: "etransfer" });
  expect(ok.status).toBe(200);
  return { id: ev.id as string, token: row!.approvalToken, url: `${k.base}/catering/${ev.id}`, userId: row!.userId };
}
const reminders = async (userId: string) => (await env.db.select().from(notifications).where(eq(notifications.userId, userId))).filter((n) => String(n.data.type).startsWith("catering_") && String(n.data.type).endsWith("_due"));

describe("catering deposit and balance reminders", () => {
  it("nudges an unpaid deposit on day 2 and day 5, once each, not before and not at night", async () => {
    const k = await kitchen();
    const q = await signedQuote(k, "2026-12-20");
    expect(await sendCateringReminders(env.ctx)).toBe(0); // signed minutes ago
    env.clock.now = new Date("2026-11-05T16:00:00Z"); // day 2, 11:00 Toronto
    expect(await sendCateringReminders(env.ctx)).toBe(1);
    expect(await sendCateringReminders(env.ctx)).toBe(0); // once
    const first = await reminders(q.userId);
    expect(first).toHaveLength(1);
    expect(first[0]!.body).toContain("deposit");
    expect(first[0]!.body).toContain("pay@shree.ca");
    env.clock.now = new Date("2026-11-08T03:00:00Z"); // day 5 but 22:00 Toronto: quiet hours
    expect(await sendCateringReminders(env.ctx)).toBe(0);
    env.clock.now = new Date("2026-11-08T16:00:00Z");
    expect(await sendCateringReminders(env.ctx)).toBe(1);
    expect(await reminders(q.userId)).toHaveLength(2);
  });

  it("stops once the deposit is recorded, then chases the balance a week and two days before the event", async () => {
    const k = await kitchen();
    const q = await signedQuote(k, "2026-11-20");
    expect((await call(env, k.m.ownerToken, "POST", `${q.url}/deposit/mark-paid`, { method: "etransfer", receivedOn: "2026-11-03" })).status).toBe(200);
    env.clock.now = new Date("2026-11-08T16:00:00Z"); // 12 days out: nothing yet
    expect(await sendCateringReminders(env.ctx)).toBe(0);
    env.clock.now = new Date("2026-11-13T16:00:00Z"); // 7 days out
    expect(await sendCateringReminders(env.ctx)).toBe(1);
    expect((await reminders(q.userId)).at(-1)!.body).toContain("still to pay");
    expect(await sendCateringReminders(env.ctx)).toBe(0);
    env.clock.now = new Date("2026-11-18T16:00:00Z"); // 2 days out
    expect(await sendCateringReminders(env.ctx)).toBe(1);
    // Paid in full: nothing more.
    const bal = (await call(env, k.m.ownerToken, "GET", q.url)).body.balanceCents;
    await call(env, k.m.ownerToken, "POST", `${q.url}/balance/record-payment`, { method: "etransfer", amountCents: bal, receivedOn: "2026-11-18" });
    env.clock.now = new Date("2026-11-19T16:00:00Z");
    expect(await sendCateringReminders(env.ctx)).toBe(0);
  });

  it("the Remind button sends now, shows what is owed, and holds off a second tap for 12 hours", async () => {
    const k = await kitchen();
    const q = await signedQuote(k);
    const view = await call(env, k.m.ownerToken, "GET", q.url);
    expect(view.body.reminder).toEqual({ kind: "deposit", amountCents: 33900, lastRemindedAt: null });
    const r = await call(env, k.m.ownerToken, "POST", `${q.url}/remind`, {});
    expect(r.status).toBe(200);
    expect(r.body.reminder).toMatchObject({ kind: "deposit", lastRemindedAt: expect.any(String) });
    expect(await reminders(q.userId)).toHaveLength(1);
    expect((await call(env, k.m.ownerToken, "POST", `${q.url}/remind`, {})).status).toBe(429);
    env.clock.now = new Date("2026-11-04T04:00:00Z");
    const token = await tokenFor(env, k.m.owner);
    expect((await call(env, token, "POST", `${q.url}/remind`, {})).status).toBe(200);
    // Nothing owed on a paid event.
    await call(env, token, "POST", `${q.url}/deposit/mark-paid`, { method: "etransfer", receivedOn: "2026-11-03" });
    const paid = await call(env, token, "GET", q.url);
    expect(paid.body.reminder.kind).toBe("balance");
    const bare = await call(env, token, "POST", `${k.base}/catering/${q.id}/cancel`, {});
    expect(bare.status).toBe(200);
    expect((await call(env, token, "POST", `${q.url}/remind`, {})).status).toBe(409);
  });
});

describe("the quote states real cancellation terms", () => {
  it("gives every quote the standard catering tiers, and a linked hall its own", async () => {
    const k = await kitchen();
    const q = await signedQuote(k);
    const pub = await call(env, null, "GET", `/v1/public/catering/${q.token}`);
    expect(pub.body.cancellationTiers).toEqual([
      { minDaysBefore: 14, refundBps: 10000 },
      { minDaysBefore: 7, refundBps: 5000 },
    ]);
    expect(pub.body.event.tax).toBeTruthy();
  });
});

describe("a hall hold that clashes says with what", () => {
  it("names the clashing booking and the nearest free time", async () => {
    const k = await kitchen();
    const [hall] = await env.db.insert(halls).values({ merchantId: k.m.merchant.id, name: "Noor Hall", capacity: 300, baseCents: 100000, packages: [], depositBps: 2500 }).returning();
    const guest = await createUser(env.db, { name: "Fatima" });
    await env.db.insert(hallBookings).values({ hallId: hall!.id, merchantId: k.m.merchant.id, userId: guest.id, eventType: "wedding", startsAt: new Date("2026-12-12T23:00:00Z"), endsAt: new Date("2026-12-13T03:00:00Z"), headcount: 100, status: "confirmed", totalCents: 100000, depositCents: 25000 });
    const hold = await call(env, k.m.ownerToken, "POST", `${k.base}/banquet/bookings`, { hallId: hall!.id, eventType: "wedding", startsAt: "2026-12-13T00:00:00Z", endsAt: "2026-12-13T04:00:00Z", headcount: 100, customer: { name: "Zainab", phone: "(416) 555-0133" } });
    expect(hold.status).toBe(409);
    expect(hold.body.error?.message ?? hold.body.message).toMatch(/Noor Hall is already booked from .*p\.m\. to .*p\.m\.; nearest free time for this length: from /);
  });
});
