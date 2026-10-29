import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchants, notifications, tiffinCharges, tiffinDeliveries, tiffinSubscriptions, userNotificationPrefs } from "@ll/db";
import { FEES } from "@ll/shared";
import { cutoffAt, generateDeliveries, localInstant, mrrOf, rollBilling, runDaily } from "../src/services/tiffin.js";
import { FAKE_PM } from "../src/providers/paymentsFake.js";
import { call, customer, deliver, fake, paidMerchant } from "./commerce-fixtures.js";
import { createTestEnv, createUser, grantFeatures, openSupportSession, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
// 2026-11-03 10:00 in Toronto (EST). Tuesday.
const T0 = new Date("2026-11-03T15:00:00Z");
beforeEach(async () => {
  actors.length = 0;
  env = await createTestEnv({ now: T0 });
});
afterEach(async () => env.close());

// Access tokens expire on the fake clock, so moving it re-signs every token handed out.
const actors: { holder: Record<string, unknown>; user: string; token: string }[] = [];
const at = async (iso: string) => {
  env.clock.now = new Date(iso);
  for (const a of actors) a.holder[a.token] = await tokenFor(env, a.holder[a.user] as { id: string; platformRole: "none" | "rep" | "admin" });
};

async function kitchen() {
  const m = await paidMerchant(env, { plan: "free" });
  // An existing kitchen on destination charges (new shops default to direct since phase-solo A; these tests switch modes from destination).
  await env.db.update(merchants).set({ chargeMode: "destination" }).where(eq(merchants.id, m.merchant.id));
  m.merchant = { ...m.merchant, chargeMode: "destination" };
  await grantFeatures(env, m.merchant.id, ["restaurant.tiffin"]);
  actors.push({ holder: m, user: "owner", token: "ownerToken" });
  const base = `/v1/merchants/${m.merchant.id}/tiffin`;
  const plan = (
    await call(env, m.ownerToken, "POST", `${base}/plans`, {
      name: "Veg thali, weekdays",
      cadence: "monthly",
      daysOfWeek: [1, 2, 3, 4, 5],
      priceCents: 12000,
      extraServingCents: 6000,
      deliveryFeeCents: 1000,
      cutoffHours: 24,
      dietary: { vegetarian: true, halal: true, halalCertifier: "HMA" },
      translations: { hi: { name: "शाकाहारी थाली" } },
    })
  ).body;
  return { m, base, plan, shop: m.merchant.slug };
}

type K = Awaited<ReturnType<typeof kitchen>>;

async function join(k: K, body: Record<string, unknown> = {}, who?: Awaited<ReturnType<typeof customer>>) {
  const c = who ?? (await customer(env));
  if (!actors.some((a) => a.holder === c)) actors.push({ holder: c, user: "user", token: "token" });
  const r = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", {
    planId: k.plan.id,
    servings: 1,
    fulfilment: "delivery",
    address: "12 Queen St W",
    postalCode: "L4T 1A1",
    startDate: "2026-11-04",
    ...body,
  });
  return { c, r, sub: r.body?.subscription, charge: r.body?.charge, payment: r.body?.payment };
}

async function pay(paymentIntentId: string) {
  const res = await deliver(env, fake(env).succeedPaymentIntent(paymentIntentId));
  expect(res.statusCode).toBe(200);
}

async function activeSub(k: K, body: Record<string, unknown> = {}, who?: Awaited<ReturnType<typeof customer>>) {
  const j = await join(k, body, who);
  expect(j.r.status).toBe(201);
  await pay(j.payment.paymentIntentId);
  return j;
}

/** Forget the saved card, so renewals take the manual path (renewal_due, the customer confirms). */
async function forgetCard(subId: string) {
  await env.db.update(tiffinSubscriptions).set({ paymentMethodId: null, paymentMethodBrand: null, paymentMethodLast4: null }).where(eq(tiffinSubscriptions.id, subId));
}

describe("plans", () => {
  it("creates, lists, updates, translates and archives plans", async () => {
    const k = await kitchen();
    expect(k.plan).toMatchObject({ name: "Veg thali, weekdays", cadence: "monthly", daysOfWeek: [1, 2, 3, 4, 5], mealsPerDay: 1, maxServings: 6, dietary: { halal: true, halalCertifier: "HMA" } });
    const bad = await call(env, k.m.ownerToken, "POST", `${k.base}/plans`, { name: "x", priceCents: 10, daysOfWeek: [] });
    expect(bad.status).toBe(400);
    const noMode = await call(env, k.m.ownerToken, "POST", `${k.base}/plans`, { name: "Nothing", priceCents: 5000, pickupAllowed: false, deliveryAllowed: false });
    expect(noMode.status).toBe(400);

    const weekly = (await call(env, k.m.ownerToken, "POST", `${k.base}/plans`, { name: "Weekend biryani", cadence: "weekly", daysOfWeek: [6, 0], priceCents: 4500 })).body;
    const upd = await call(env, k.m.ownerToken, "PATCH", `${k.base}/plans/${weekly.id}`, { priceCents: 4800, cutoffHours: 36 });
    expect(upd.body).toMatchObject({ priceCents: 4800, cutoffHours: 36, cadence: "weekly" });
    const list = await call(env, k.m.ownerToken, "GET", `${k.base}/plans`);
    expect(list.body.items.map((p: { name: string }) => p.name)).toEqual(["Veg thali, weekdays", "Weekend biryani"]);

    // Public browse (no auth), localized.
    const pub = await call(env, null, "GET", `/v1/public/shops/${k.shop}/tiffin/plans?lang=hi`);
    expect(pub.status).toBe(200);
    expect(pub.body.plans[0]).toMatchObject({ name: "शाकाहारी थाली", priceCents: 12000 });
    expect(pub.body.shop.slug).toBe(k.shop);

    // A plan with subscribers is archived, not deleted; one without is deleted.
    await activeSub(k);
    expect((await call(env, k.m.ownerToken, "DELETE", `${k.base}/plans/${k.plan.id}`)).body).toEqual({ deleted: false, archived: true });
    expect((await call(env, k.m.ownerToken, "DELETE", `${k.base}/plans/${weekly.id}`)).body).toEqual({ deleted: true, archived: false });
    const pub2 = await call(env, null, "GET", `/v1/public/shops/${k.shop}/tiffin/plans`);
    expect(pub2.body.plans).toHaveLength(0);
  });

  it("shows the upcoming menu (plan menu beats the shop-wide one)", async () => {
    const k = await kitchen();
    await call(env, k.m.ownerToken, "PUT", `${k.base}/menus`, {
      menus: [
        { planId: null, date: "2026-11-04", items: [{ name: "Dal tadka" }] },
        { planId: k.plan.id, date: "2026-11-05", items: [{ name: "Paneer butter masala", dietary: { vegetarian: true } }, { name: "Roti" }], notes: "Mild spice" },
        { planId: null, date: "2026-11-05", items: [{ name: "Not shown" }] },
      ],
    });
    // Upsert, not duplicate.
    await call(env, k.m.ownerToken, "PUT", `${k.base}/menus`, { menus: [{ planId: null, date: "2026-11-04", items: [{ name: "Dal tadka" }, { name: "Jeera rice" }] }] });
    const menus = await call(env, k.m.ownerToken, "GET", `${k.base}/menus?from=2026-11-04&to=2026-11-05`);
    expect(menus.body.items).toHaveLength(3);
    const pub = await call(env, null, "GET", `/v1/public/shops/${k.shop}/tiffin/plans`);
    expect(pub.body.plans[0].upcomingMenu).toEqual([
      { date: "2026-11-04", items: [{ name: "Dal tadka" }, { name: "Jeera rice" }], notes: null },
      { date: "2026-11-05", items: [{ name: "Paneer butter masala", dietary: { vegetarian: true } }, { name: "Roti" }], notes: "Mild spice" },
    ]);
  });
});

describe("feature gating", () => {
  it("locks merchant routes and public browsing without restaurant.tiffin", async () => {
    const m = await paidMerchant(env, { plan: "free" });
    const base = `/v1/merchants/${m.merchant.id}/tiffin`;
    expect((await call(env, m.ownerToken, "GET", `${base}/plans`)).status).toBe(402);
    expect((await call(env, m.ownerToken, "POST", `${base}/plans`, { name: "x", priceCents: 5000 })).status).toBe(402);
    expect((await call(env, m.ownerToken, "GET", `${base}/kitchen`)).body.error.code).toBe("feature_locked");
    expect((await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/tiffin/plans`)).status).toBe(402);
    await grantFeatures(env, m.merchant.id, ["restaurant.tiffin"]);
    expect((await call(env, m.ownerToken, "GET", `${base}/plans`)).status).toBe(200);
    expect((await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/tiffin/plans`)).status).toBe(200);
    // Other merchants' staff and anonymous callers are still refused.
    const other = await paidMerchant(env, { plan: "free" });
    await grantFeatures(env, other.merchant.id, ["restaurant.tiffin"]);
    expect((await call(env, other.ownerToken, "GET", `${base}/plans`)).status).toBe(403);
    expect((await call(env, null, "GET", `${base}/plans`)).status).toBe(401);
  });
});

describe("subscribe", () => {
  it("creates a pending subscription and the first charge with the tiffin platform fee, then activates on payment", async () => {
    const k = await kitchen();
    const { r, sub, charge, payment, c } = await join(k, { servings: 2 });
    expect(r.status).toBe(201);
    // 12000 + 1 extra serving 6000 + delivery 1000
    expect(sub).toMatchObject({ status: "pending", servings: 2, priceCents: 19000, currentPeriodStart: "2026-11-04", currentPeriodEnd: "2026-12-03", nextBillingDate: "2026-12-04" });
    expect(charge).toMatchObject({ status: "pending", amountCents: 19000, creditCents: 0, platformFeeCents: Math.round((19000 * FEES.tiffinBps) / 10000), periodStart: "2026-11-04", periodEnd: "2026-12-03" });
    expect(payment).toMatchObject({ amountCents: 19000, methods: ["card"] });
    expect(fake(env).intents.get(payment.paymentIntentId)).toMatchObject({ applicationFeeCents: 190, connectedAccountId: k.m.merchant.stripeAccountId, metadata: { ll_kind: "tiffin", ll_id: charge.id } });

    await pay(payment.paymentIntentId);
    const mine = await call(env, c.token, "GET", "/v1/me/tiffin/subscriptions");
    expect(mine.body.items[0]).toMatchObject({ status: "active", latestCharge: { status: "paid" }, merchant: { slug: k.shop } });
    // Replayed webhook is harmless.
    await pay(payment.paymentIntentId);
    const detail = await call(env, c.token, "GET", `/v1/me/tiffin/subscriptions/${sub.id}`);
    expect(detail.body.charges).toHaveLength(1);
    expect(detail.body.upcoming[0]).toMatchObject({ date: "2026-11-04", status: "scheduled", canSkip: false });
  });

  it("validates servings, fulfilment, address, dates and duplicates", async () => {
    const k = await kitchen();
    expect((await join(k, { servings: 9 })).r.status).toBe(400);
    expect((await join(k, { address: undefined, postalCode: undefined })).r.status).toBe(400);
    expect((await join(k, { startDate: "2026-11-02" })).r.status).toBe(400);
    expect((await join(k, { startDate: "2027-03-01" })).r.status).toBe(400);
    await call(env, k.m.ownerToken, "PATCH", `${k.base}/plans/${k.plan.id}`, { pickupAllowed: false });
    expect((await join(k, { fulfilment: "pickup" })).r.status).toBe(400);
    await call(env, k.m.ownerToken, "PATCH", `${k.base}/plans/${k.plan.id}`, { pickupAllowed: true });
    const first = await join(k);
    expect(first.r.status).toBe(201);
    const again = await join(k, {}, first.c);
    expect(again.r.status).toBe(409);
    const noConnect = await paidMerchant(env, { plan: "free", connect: false });
    await grantFeatures(env, noConnect.merchant.id, ["restaurant.tiffin"]);
    const p = (await call(env, noConnect.ownerToken, "POST", `/v1/merchants/${noConnect.merchant.id}/tiffin/plans`, { name: "x", priceCents: 9000 })).body;
    const r = await call(env, (await customer(env)).token, "POST", "/v1/me/tiffin/subscriptions", { planId: p.id, fulfilment: "pickup", startDate: "2026-11-04" });
    expect(r.status).toBe(409);
  });

  it("passes pre-authorized debit through to the provider only when enabled", async () => {
    const k = await kitchen();
    expect((await join(k, { paymentMethod: "pad" })).r.status).toBe(400);
    env.ctx.config.tiffin = { padEnabled: true };
    const j = await join(k, { paymentMethod: "pad" });
    expect(j.r.status).toBe(201);
    expect(j.payment.methods).toEqual(["acss_debit"]);
    expect(fake(env).intents.get(j.payment.paymentIntentId)?.paymentMethodTypes).toEqual(["acss_debit"]);
    const card = await join(k, {}, await customer(env));
    expect(fake(env).intents.get(card.payment.paymentIntentId)?.paymentMethodTypes).toBeUndefined();
    const pub = await call(env, null, "GET", `/v1/public/shops/${k.shop}/tiffin/plans`);
    expect(pub.body.padEnabled).toBe(true);
  });
});

describe("cutoff", () => {
  it("computes the cutoff from the Toronto meal hour, across the DST change", () => {
    expect(localInstant("2026-11-03", 8).toISOString()).toBe("2026-11-03T13:00:00.000Z");
    expect(localInstant("2026-03-09", 8).toISOString()).toBe("2026-03-09T12:00:00.000Z");
    expect(cutoffAt({ cutoffHours: 24 }, "2026-11-04").toISOString()).toBe("2026-11-03T13:00:00.000Z");
  });

  it("rejects skips after cutoff, off days and past days; accepts before cutoff", async () => {
    const k = await kitchen();
    const { c, sub } = await activeSub(k);
    const skip = (dates: string[]) => call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/skips`, { dates });
    // Now is Nov 3 10:00 Toronto; Nov 4 closed at Nov 3 08:00.
    const late = await skip(["2026-11-04"]);
    expect(late.status).toBe(409);
    expect(late.body.error).toMatchObject({ code: "cutoff_passed", details: { date: "2026-11-04", cutoffAt: "2026-11-03T13:00:00.000Z" } });
    expect((await skip(["2026-11-07"])).status).toBe(400); // Saturday
    expect((await skip(["2026-11-02"])).status).toBe(400); // past
    const ok = await skip(["2026-11-05"]);
    expect(ok.status).toBe(200);
    expect(ok.body.skipped).toEqual(["2026-11-05"]);
    expect(ok.body.subscription.skips).toEqual(["2026-11-05"]);
    // Move the clock to just after Nov 5's cutoff (Nov 4 08:00 local = 13:00Z): can't unskip or add.
    await at("2026-11-04T13:00:01Z");
    const un = await call(env, c.token, "DELETE", `/v1/me/tiffin/subscriptions/${sub.id}/skips/2026-11-05`);
    expect(un.status).toBe(409);
    await at("2026-11-04T12:59:00Z");
    expect((await call(env, c.token, "DELETE", `/v1/me/tiffin/subscriptions/${sub.id}/skips/2026-11-05`)).status).toBe(200);
  });

  it("a pause starts at the first day still before cutoff and refuses an earlier explicit start", async () => {
    const k = await kitchen();
    const { c, sub } = await activeSub(k);
    const early = await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/pause`, { from: "2026-11-04", until: "2026-11-12" });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("cutoff_passed");
    const bad = await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/pause`, { until: "2026-11-05" });
    expect(bad.status).toBe(400);
  });
});

describe("pause and resume", () => {
  it("pauses until a date, keeps already-locked meals, resumes early and auto-resumes", async () => {
    const k = await kitchen();
    const { c, sub } = await activeSub(k);
    const p = await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/pause`, { until: "2026-11-12" });
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ pausedFrom: "2026-11-05", resumesOn: "2026-11-12", skipped: ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"] });
    expect(p.body.subscription).toMatchObject({ status: "paused", pausedUntil: "2026-11-12" });
    // Tomorrow's meal is inside cutoff, so it still goes out.
    const rows = await env.db.select().from(tiffinDeliveries).where(eq(tiffinDeliveries.subscriptionId, sub.id));
    expect(rows.map((d) => [d.date, d.status])).toEqual([["2026-11-04", "scheduled"]]);
    // Paused subscriptions get no new deliveries.
    expect((await generateDeliveries(env.ctx, "2026-11-09")).created).toBe(0);
    const up = await call(env, c.token, "GET", "/v1/me/tiffin/upcoming?days=10");
    expect(up.body.items.find((i: { date: string }) => i.date === "2026-11-04").status).toBe("scheduled");
    expect(up.body.items.find((i: { date: string }) => i.date === "2026-11-09").status).toBe("skipped");

    const res = await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/resume`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "active", pausedUntil: null, skips: [] });
    expect((await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/resume`)).status).toBe(409);

    // Pause again, then let the job bring it back on the resume date.
    await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/pause`, { until: "2026-11-12" });
    await at("2026-11-11T15:00:00Z");
    expect((await runDaily(env.ctx)).resumed).toBe(0);
    await at("2026-11-12T15:00:00Z");
    expect((await runDaily(env.ctx)).resumed).toBe(1);
    const [row] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, sub.id));
    expect(row).toMatchObject({ status: "active", pausedUntil: null });
  });

  it("lets the kitchen pause, resume, skip and cancel on behalf", async () => {
    const k = await kitchen();
    const { c, sub } = await activeSub(k);
    const url = `${k.base}/subscribers/${sub.id}`;
    const p = await call(env, k.m.ownerToken, "POST", `${url}/pause`, { until: "2026-11-10" });
    expect(p.status).toBe(200);
    expect(p.body.subscriber).toMatchObject({ status: "paused", customer: { id: c.user.id } });
    expect(p.body.pausedFrom).toBe("2026-11-04"); // the kitchen is not held to the customer cutoff
    expect((await call(env, k.m.ownerToken, "POST", `${url}/resume`)).body.subscriber.status).toBe("active");
    expect((await call(env, k.m.ownerToken, "POST", `${url}/skips`, { dates: ["2026-11-04"], reason: "Closed for Diwali" })).body.skipped).toEqual(["2026-11-04"]);
    const cancelled = await call(env, k.m.ownerToken, "POST", `${url}/cancel`, { reason: "Moved away" });
    expect(cancelled.body).toMatchObject({ status: "cancelled", cancelReason: "Moved away" });
    expect((await call(env, k.m.ownerToken, "POST", `${url}/cancel`, {})).status).toBe(409);
    expect((await call(env, c.token, "GET", "/v1/me/tiffin/subscriptions")).body.items).toHaveLength(0);
    expect((await call(env, c.token, "GET", "/v1/me/tiffin/subscriptions?status=cancelled")).body.items[0].status).toBe("cancelled");
  });

  it("lets a customer cancel, and refunds a payment that lands after cancelling", async () => {
    const k = await kitchen();
    const j = await join(k);
    const out = await call(env, j.c.token, "POST", `/v1/me/tiffin/subscriptions/${j.sub.id}/cancel`, { reason: "Changed my mind" });
    expect(out.body.status).toBe("cancelled");
    await pay(j.payment.paymentIntentId);
    const [ch] = await env.db.select().from(tiffinCharges).where(eq(tiffinCharges.subscriptionId, j.sub.id));
    expect(ch!.status).toBe("refunded");
    expect(fake(env).refunds).toHaveLength(1);
    // Other customers can't touch it.
    const other = await customer(env);
    expect((await call(env, other.token, "POST", `/v1/me/tiffin/subscriptions/${j.sub.id}/cancel`, {})).status).toBe(404);
  });
});

describe("billing and skip credit", () => {
  it("credits only skips made before cutoff on the next period's charge, and takes the platform fee on the net", async () => {
    const k = await kitchen();
    const { c, sub, charge } = await activeSub(k, { servings: 2 }); // 19000, food 18000, 22 meal days in Nov 4 - Dec 3
    await forgetCard(sub.id);
    const skip = (dates: string[]) => call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/skips`, { dates });
    const first = await skip(["2026-11-10", "2026-11-11"]);
    expect(first.body.creditCents).toBe(Math.round((18000 * 2) / 22)); // 1636 estimate
    // On Nov 17 the kitchen skips Nov 18 on the customer's behalf: past cutoff, so no credit. The customer can't.
    await at("2026-11-17T15:00:00Z");
    expect((await skip(["2026-11-18"])).status).toBe(409);
    expect((await call(env, k.m.ownerToken, "POST", `${k.base}/subscribers/${sub.id}/skips`, { dates: ["2026-11-18"] })).status).toBe(200);

    // Nothing is billed before the next period starts.
    await at("2026-12-03T15:00:00Z");
    expect(await rollBilling(env.ctx)).toMatchObject({ charged: 0 });
    await at("2026-12-04T15:00:00Z");
    const run = await runDaily(env.ctx);
    expect(run.billing).toMatchObject({ charged: 1, errors: 0 });
    const charges = await env.db.select().from(tiffinCharges).where(eq(tiffinCharges.subscriptionId, sub.id));
    expect(charges).toHaveLength(2);
    const next = charges.find((x) => x.periodStart === "2026-12-04")!;
    expect(next).toMatchObject({ periodEnd: "2027-01-03", creditCents: 1636, amountCents: 19000 - 1636, platformFeeCents: Math.round(((19000 - 1636) * FEES.tiffinBps) / 10000), status: "pending" });
    expect(next.stripePaymentIntentId).toBeTruthy();
    expect(fake(env).intents.get(next.stripePaymentIntentId!)).toMatchObject({ amountCents: 17364, applicationFeeCents: 174 });
    expect(charges.find((x) => x.id === charge.id)!.creditCents).toBe(0);
    // The customer is told a renewal is ready.
    const inbox = await env.db.select().from(notifications).where(and(eq(notifications.userId, c.user.id), eq(notifications.type, "tiffin_update")));
    expect(inbox.map((n) => n.data.event)).toContain("renewal_due");

    // Re-running does not create or re-notify anything.
    expect((await rollBilling(env.ctx)).charged).toBe(0);
    expect(await env.db.select().from(tiffinCharges).where(eq(tiffinCharges.subscriptionId, sub.id))).toHaveLength(2);

    // Payment advances the period.
    await pay(next.stripePaymentIntentId!);
    const [s] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, sub.id));
    expect(s).toMatchObject({ status: "active", currentPeriodStart: "2026-12-04", currentPeriodEnd: "2027-01-03", nextBillingDate: "2027-01-04" });
  });

  it("lists a subscriber's charges for the kitchen: period, amount, credit, status and paid date", async () => {
    const k = await kitchen();
    const { c, sub } = await activeSub(k, { servings: 2 });
    await forgetCard(sub.id);
    const url = `${k.base}/subscribers/${sub.id}/charges`;
    const first = await call(env, k.m.ownerToken, "GET", url);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({ periodStart: "2026-11-04", periodEnd: "2026-12-03", amountCents: 19000, creditCents: 0, status: "paid" });
    expect(first.body.items[0].paidAt).toBeTruthy();

    await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/skips`, { dates: ["2026-11-10", "2026-11-11"] });
    await at("2026-12-04T15:00:00Z");
    await runDaily(env.ctx);
    const after = await call(env, k.m.ownerToken, "GET", url);
    expect(after.body.items.map((x: { periodStart: string }) => x.periodStart)).toEqual(["2026-12-04", "2026-11-04"]); // newest first
    expect(after.body.items[0]).toMatchObject({ status: "pending", creditCents: 1636, amountCents: 19000 - 1636, paidAt: null });

    // Another kitchen's subscriber, a stranger, and an unknown id are all refused.
    const other = await kitchen();
    expect((await call(env, other.m.ownerToken, "GET", `${other.base}/subscribers/${sub.id}/charges`)).status).toBe(404);
    expect((await call(env, other.m.ownerToken, "GET", url)).status).toBe(403);
    expect((await call(env, c.token, "GET", url)).status).toBeGreaterThanOrEqual(403);
    expect((await call(env, k.m.ownerToken, "GET", `${k.base}/subscribers/00000000-0000-4000-8000-000000000000/charges`)).status).toBe(404);
  });

  it("marks past due and tells the customer when a payment fails, then recovers on retry", async () => {
    const k = await kitchen();
    const { c, sub } = await activeSub(k);
    await forgetCard(sub.id);
    await at("2026-12-04T15:00:00Z");
    await runDaily(env.ctx);
    const [ch] = await env.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, sub.id), eq(tiffinCharges.periodStart, "2026-12-04")));
    const res = await deliver(env, fake(env).failPaymentIntent(ch!.stripePaymentIntentId!));
    expect(res.statusCode).toBe(200);
    const [s] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, sub.id));
    expect(s!.status).toBe("past_due");
    expect((await env.db.select().from(tiffinCharges).where(eq(tiffinCharges.id, ch!.id)))[0]!.status).toBe("failed");
    const pushes = env.ctx.providers.outbox.push.filter((p) => p.title === "Your tiffin payment didn't go through");
    expect(pushes).toHaveLength(1);

    // Past-due subscriptions get no deliveries and no new charges.
    expect((await generateDeliveries(env.ctx, "2026-12-07")).created).toBe(0);
    expect((await rollBilling(env.ctx)).charged).toBe(0);

    const retry = await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/retry-payment`);
    expect(retry.status).toBe(200);
    expect(retry.body.payment.paymentIntentId).not.toBe(ch!.stripePaymentIntentId);
    await pay(retry.body.payment.paymentIntentId);
    const [after] = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, sub.id));
    expect(after).toMatchObject({ status: "active", currentPeriodStart: "2026-12-04" });
  });

  it("settles a fully credited period without a payment", async () => {
    const k = await kitchen();
    // Pickup, one serving, no delivery fee: the whole bill is food, so skipping every meal day credits it all.
    const { c, sub } = await activeSub(k, { fulfilment: "pickup", address: undefined, postalCode: undefined });
    const days = ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"];
    expect((await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${sub.id}/skips`, { dates: days.slice(0, 31) })).status).toBe(200);
    await call(env, k.m.ownerToken, "POST", `${k.base}/subscribers/${sub.id}/skips`, { dates: ["2026-11-04"] });
    // The Nov 4 skip came after cutoff (no credit), so 21 of 22 days are credited.
    await at("2026-12-04T15:00:00Z");
    await runDaily(env.ctx);
    const ch = (await env.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, sub.id), eq(tiffinCharges.periodStart, "2026-12-04"))))[0]!;
    expect(ch.creditCents).toBe(Math.round((12000 * 21) / 22));
    expect(ch.amountCents).toBe(12000 - ch.creditCents);
  });
});

describe("delivery generation", () => {
  it("creates tomorrow's deliveries once, skipping skipped, paused, past-due and pending subscriptions", async () => {
    const k = await kitchen();
    const a = await activeSub(k);
    const b = await activeSub(k);
    const skipped = await activeSub(k);
    const paused = await activeSub(k);
    const pending = await join(k);
    const pastDue = await activeSub(k);
    await env.db.update(tiffinSubscriptions).set({ status: "past_due" }).where(eq(tiffinSubscriptions.id, pastDue.sub.id));
    await call(env, skipped.c.token, "POST", `/v1/me/tiffin/subscriptions/${skipped.sub.id}/skips`, { dates: ["2026-11-05"] });
    await call(env, paused.c.token, "POST", `/v1/me/tiffin/subscriptions/${paused.sub.id}/pause`, { until: "2026-11-20" });
    // Wipe the pause's locked-in row for tomorrow so the generator alone decides.
    await env.db.delete(tiffinDeliveries);

    // Tuesday Nov 3 -> generates Wednesday Nov 4.
    const r1 = await runDaily(env.ctx);
    expect(r1.deliveries).toBe(3); // a, b, skipped (Nov 4 is not its skip day)
    const r2 = await runDaily(env.ctx);
    expect(r2.deliveries).toBe(0);
    expect(await env.db.select().from(tiffinDeliveries)).toHaveLength(3);

    // Thursday Nov 5: only a and b (skipped skips; paused and past-due are out).
    expect((await generateDeliveries(env.ctx, "2026-11-05")).created).toBe(2);
    expect((await generateDeliveries(env.ctx, "2026-11-05")).created).toBe(0);
    const nov5 = await env.db.select().from(tiffinDeliveries).where(eq(tiffinDeliveries.date, "2026-11-05"));
    expect(nov5.map((d) => d.subscriptionId).sort()).toEqual([a.sub.id, b.sub.id].sort());
    // Saturday: nobody (weekday plan).
    expect((await generateDeliveries(env.ctx, "2026-11-07")).created).toBe(0);
    void pending;
  });

  it("copies the route and stop order, and drops a delivery when the day is skipped after generation", async () => {
    const k = await kitchen();
    const a = await activeSub(k);
    await generateDeliveries(env.ctx, "2026-11-10");
    const [d] = await env.db.select().from(tiffinDeliveries).where(eq(tiffinDeliveries.subscriptionId, a.sub.id));
    expect(d).toMatchObject({ date: "2026-11-10", status: "scheduled", servings: 1 });
    await call(env, a.c.token, "POST", `/v1/me/tiffin/subscriptions/${a.sub.id}/skips`, { dates: ["2026-11-10"] });
    const [after] = await env.db.select().from(tiffinDeliveries).where(eq(tiffinDeliveries.id, d!.id));
    expect(after!.status).toBe("skipped");
  });
});

describe("routes, kitchen count and manifest", () => {
  it("assigns routes by postal prefix, orders stops, and groups the manifest", async () => {
    const k = await kitchen();
    const north = (await call(env, k.m.ownerToken, "POST", `${k.base}/routes`, { name: "North run", driverName: "Imran", driverPhone: "+14165550101", areas: ["l4t", "L4W"] })).body;
    const downtown = (await call(env, k.m.ownerToken, "POST", `${k.base}/routes`, { name: "Downtown", areas: ["M5V"], sortOrder: 1 })).body;
    expect(north.areas).toEqual(["L4T", "L4W"]);
    expect((await call(env, k.m.ownerToken, "POST", `${k.base}/routes`, { name: "bad", areas: ["not a prefix!"] })).status).toBe(400);

    const s1 = await activeSub(k, { postalCode: "l4t 1a1", address: "1 Dixie Rd" });
    const s2 = await activeSub(k, { postalCode: "M5V 2B2", address: "99 Spadina" });
    const s3 = await activeSub(k, { postalCode: "L4W 3C3", address: "5 Matheson Blvd" });
    const s4 = await activeSub(k, { postalCode: "K1A 0B1", address: "Elsewhere" });
    const s5 = await activeSub(k, { fulfilment: "pickup", address: undefined, postalCode: undefined });
    expect(s1.sub).toMatchObject({ routeId: north.id, stopOrder: 1 });
    expect(s2.sub).toMatchObject({ routeId: downtown.id, stopOrder: 1 });
    expect(s3.sub).toMatchObject({ routeId: north.id, stopOrder: 2 });
    expect(s4.sub.routeId).toBeNull();
    expect(s5.sub.routeId).toBeNull();

    // A new route picks up the unrouted ones.
    const ottawa = (await call(env, k.m.ownerToken, "POST", `${k.base}/routes`, { name: "Ottawa", areas: ["K1A"], sortOrder: 2 })).body;
    expect((await call(env, k.m.ownerToken, "POST", `${k.base}/routes/auto-assign`, {})).body).toEqual({ assigned: 1 });
    const routed = await call(env, k.m.ownerToken, "GET", `${k.base}/subscribers?routeId=${ottawa.id}`);
    expect(routed.body.items.map((s: { id: string }) => s.id)).toEqual([s4.sub.id]);

    // Reverse the north run.
    const re = await call(env, k.m.ownerToken, "PUT", `${k.base}/routes/${north.id}/stops`, { subscriptionIds: [s3.sub.id, s1.sub.id] });
    expect(re.status).toBe(200);
    const man = await call(env, k.m.ownerToken, "GET", `${k.base}/manifest?date=2026-11-04`);
    expect(man.status).toBe(200);
    expect(man.body.routes.map((r: { route: { name: string } | null }) => r.route?.name)).toEqual(["North run", "Downtown", "Ottawa"]);
    const northStops = man.body.routes[0].stops;
    expect(northStops.map((s: { subscriptionId: string; stopOrder: number }) => [s.subscriptionId, s.stopOrder])).toEqual([[s3.sub.id, 1], [s1.sub.id, 2]]);
    expect(northStops[0]).toMatchObject({ address: "5 Matheson Blvd", planName: "Veg thali, weekdays", status: "scheduled", servings: 1 });
    expect(man.body.routes[0].route).toMatchObject({ driverName: "Imran", driverPhone: "+14165550101" });
    expect(man.body.pickups.map((s: { subscriptionId: string }) => s.subscriptionId)).toEqual([s5.sub.id]);
    const one = await call(env, k.m.ownerToken, "GET", `${k.base}/manifest?date=2026-11-04&routeId=${downtown.id}`);
    expect(one.body.routes).toHaveLength(1);

    // Moving a subscriber to another route shows up on the manifest.
    await call(env, k.m.ownerToken, "PATCH", `${k.base}/subscribers/${s1.sub.id}`, { routeId: downtown.id });
    const man2 = await call(env, k.m.ownerToken, "GET", `${k.base}/manifest?date=2026-11-04`);
    expect(man2.body.routes[1].stops.map((s: { subscriptionId: string }) => s.subscriptionId)).toContain(s1.sub.id);
    expect(await call(env, k.m.ownerToken, "DELETE", `${k.base}/routes/${ottawa.id}`).then((r) => r.body)).toEqual({ deleted: true, unassigned: 1 });
  });

  it("counts servings per plan after skips and pauses", async () => {
    const k = await kitchen();
    const biryani = (await call(env, k.m.ownerToken, "POST", `${k.base}/plans`, { name: "Biryani Fridays", cadence: "weekly", daysOfWeek: [5], priceCents: 2500 })).body;
    const a = await activeSub(k, { servings: 2 });
    const b = await activeSub(k, { servings: 3, dietaryNotes: "No onion or garlic (Jain)" });
    const c = await activeSub(k, { fulfilment: "pickup", servings: 1, address: undefined, postalCode: undefined });
    const d = await activeSub(k, { servings: 4 });
    await call(env, d.c.token, "POST", `/v1/me/tiffin/subscriptions/${d.sub.id}/skips`, { dates: ["2026-11-10"] });
    await call(env, k.m.ownerToken, "PUT", `${k.base}/menus`, { menus: [{ planId: k.plan.id, date: "2026-11-10", items: [{ name: "Rajma chawal" }] }] });
    const res = await call(env, k.m.ownerToken, "GET", `${k.base}/kitchen?date=2026-11-10`);
    expect(res.status).toBe(200);
    const row = res.body.plans.find((p: { planId: string }) => p.planId === k.plan.id);
    expect(row).toMatchObject({ servings: 6, subscribers: 3, deliveryServings: 5, pickupServings: 1, skippedServings: 4, menu: [{ name: "Rajma chawal" }] });
    expect(row.dietaryNotes).toEqual([{ subscriptionId: b.sub.id, customer: "Casey Customer", servings: 3, note: "No onion or garlic (Jain)" }]);
    expect(res.body.totals).toMatchObject({ servings: 6, skippedServings: 4 });
    void a; void c;
    // Biryani Fridays doesn't run Tuesday but is still listed (active plan, zero servings).
    expect(res.body.plans.find((p: { planId: string }) => p.planId === biryani.id)).toMatchObject({ servings: 0 });
    // Wednesday: everyone cooks.
    const wed = await call(env, k.m.ownerToken, "GET", `${k.base}/kitchen?date=2026-11-11`);
    expect(wed.body.totals).toMatchObject({ servings: 10, skippedServings: 0 });
  });

  it("marks deliveries out, delivered, picked up and missed, and notifies the customer", async () => {
    const k = await kitchen();
    const a = await activeSub(k);
    const p = await activeSub(k, { fulfilment: "pickup", address: undefined, postalCode: undefined });
    const man = await call(env, k.m.ownerToken, "GET", `${k.base}/manifest?date=2026-11-04`);
    const del = man.body.routes[0].stops[0];
    const pick = man.body.pickups[0];
    const set = (ids: string[], status: string) => call(env, k.m.ownerToken, "POST", `${k.base}/deliveries/status`, { ids, status });

    expect((await set([del.deliveryId], "out_for_delivery")).body).toEqual({ updated: 1, ignored: [] });
    expect(env.ctx.providers.outbox.push.some((x) => x.title === "Your tiffin is out for delivery")).toBe(true);
    expect((await set([del.deliveryId], "delivered")).body.updated).toBe(1);
    expect(env.ctx.providers.outbox.push.some((x) => x.title === "Your tiffin was delivered")).toBe(true);
    // Final states don't move, and delivery/pickup can't be mixed up.
    expect((await set([del.deliveryId], "missed")).body).toEqual({ updated: 0, ignored: [del.deliveryId] });
    expect((await set([pick.deliveryId], "delivered")).body.ignored).toEqual([pick.deliveryId]);
    expect((await set([pick.deliveryId], "picked_up")).body.updated).toBe(1);
    const after = await call(env, k.m.ownerToken, "GET", `${k.base}/manifest?date=2026-11-04`);
    expect(after.body.routes[0].stops[0]).toMatchObject({ status: "delivered" });
    expect(after.body.routes[0].stops[0].deliveredAt).toBe(T0.toISOString());
    expect(after.body.pickups[0].status).toBe("picked_up");
    expect((await set(["00000000-0000-4000-8000-000000000000"], "delivered")).status).toBe(404);
    void a; void p;
  });
});

describe("menu notifications", () => {
  it("sends tomorrow's menu once, only to customers who opted in, from 4pm", async () => {
    const k = await kitchen();
    const yes = await activeSub(k);
    const no = await activeSub(k);
    await env.db.insert(userNotificationPrefs).values({ userId: yes.c.user.id, type: "tiffin_menu", channel: "push", enabled: true });
    await call(env, k.m.ownerToken, "PUT", `${k.base}/menus`, { menus: [{ planId: null, date: "2026-11-04", items: [{ name: "Chicken karahi" }, { name: "Naan" }] }] });

    expect((await runDaily(env.ctx)).menus).toBe(0); // 10am: too early
    await at("2026-11-03T22:00:00Z"); // 5pm Toronto
    expect((await runDaily(env.ctx)).menus).toBe(1);
    expect((await runDaily(env.ctx)).menus).toBe(0);
    const rows = await env.db.select().from(notifications).where(eq(notifications.type, "tiffin_menu"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: yes.c.user.id, body: "Veg thali, weekdays: Chicken karahi, Naan." });
    expect(env.ctx.providers.outbox.push.filter((p) => p.body.includes("Chicken karahi"))).toHaveLength(1);
    void no;
  });
});

describe("subscribers and revenue", () => {
  it("filters subscribers and reports MRR, churn and skip rate", async () => {
    const k = await kitchen();
    const weekly = (await call(env, k.m.ownerToken, "POST", `${k.base}/plans`, { name: "Weekend biryani", cadence: "weekly", daysOfWeek: [6], priceCents: 4500, deliveryFeeCents: 0 })).body;
    const a = await activeSub(k, { servings: 2 }); // 19000/mo
    const b = await activeSub(k, { fulfilment: "pickup", address: undefined, postalCode: undefined }); // 12000/mo
    const w = await activeSub({ ...k, plan: weekly }, { startDate: "2026-11-07" }); // 4500/wk
    const pend = await join(k);
    const gone = await activeSub(k);
    await call(env, k.m.ownerToken, "POST", `${k.base}/subscribers/${gone.sub.id}/cancel`, {});

    const all = await call(env, k.m.ownerToken, "GET", `${k.base}/subscribers`);
    expect(all.body.items).toHaveLength(5);
    const q = (s: string) => call(env, k.m.ownerToken, "GET", `${k.base}/subscribers?${s}`).then((r) => r.body.items.map((i: { id: string }) => i.id));
    expect(await q("status=pending")).toEqual([pend.sub.id]);
    expect((await q(`planId=${weekly.id}`))).toEqual([w.sub.id]);
    expect((await q("fulfilment=pickup"))).toEqual([b.sub.id]);
    expect((await q("status=active,paused&fulfilment=delivery")).sort()).toEqual([a.sub.id, w.sub.id].sort());
    expect(await q(`q=${encodeURIComponent(a.c.user.phone!.slice(-6))}`)).toEqual([a.sub.id]);
    const page1 = await call(env, k.m.ownerToken, "GET", `${k.base}/subscribers?limit=2`);
    expect(page1.body.items).toHaveLength(2);
    const page2 = await call(env, k.m.ownerToken, "GET", `${k.base}/subscribers?limit=2&cursor=${page1.body.nextCursor}`);
    expect(page2.body.items.map((i: { id: string }) => i.id)).not.toContain(page1.body.items[0].id);
    expect((await call(env, k.m.ownerToken, "GET", `${k.base}/subscribers?status=nope`)).status).toBe(400);

    await call(env, a.c.token, "POST", `/v1/me/tiffin/subscriptions/${a.sub.id}/skips`, { dates: ["2026-11-10"] });
    await generateDeliveries(env.ctx, "2026-11-11");
    await generateDeliveries(env.ctx, "2026-11-09");
    const rev = await call(env, k.m.ownerToken, "GET", `${k.base}/revenue?month=2026-11`);
    expect(rev.status).toBe(200);
    expect(rev.body).toMatchObject({
      month: "2026-11",
      mrrCents: 19000 + 12000 + mrrOf("weekly", 4500),
      activeSubscribers: 3,
      pastDueSubscribers: 0,
      churnedThisMonth: 1,
      collectedCents: 19000 + 12000 + 4500 + 13000,
    });
    expect(rev.body.newThisMonth).toBe(4); // pending is not counted
    expect(rev.body.skipRate).toBeGreaterThan(0);
    expect(rev.body.skipRate).toBeLessThan(1);
    expect(rev.body.byPlan.find((p: { planId: string }) => p.planId === weekly.id)).toMatchObject({ activeSubscribers: 1, mrrCents: 19500 });
    expect(rev.body.platformFeeCents).toBeGreaterThan(0);
    // churn is relative to subscribers who existed when the month began (none yet).
    expect(rev.body.churnRate).toBe(0);
    const empty = await call(env, k.m.ownerToken, "GET", `${k.base}/revenue?month=2026-10`);
    expect(empty.body).toMatchObject({ mrrCents: 19000 + 12000 + 19500, newThisMonth: 0, churnedThisMonth: 0 });
  });
});

describe("charge mode", () => {
  it("a direct-mode merchant's tiffin charge is created on the connected account with the 1% fee", async () => {
    env.ctx.config.stripe.directCharges = true;
    const k = await kitchen();
    await env.db.update(merchants).set({ chargeMode: "direct" }).where(eq(merchants.id, k.m.merchant.id));
    const { payment } = await join(k, { servings: 2 });
    // 19000 x 1% (computeFees "tiffin") = 190, taken as application_fee_amount on the merchant's own account.
    expect(fake(env).intents.get(payment.paymentIntentId)).toMatchObject({ chargeMode: "direct", applicationFeeCents: 190, connectedAccountId: k.m.merchant.stripeAccountId });
  });

  it("stays a destination charge while STRIPE_DIRECT_CHARGES is off", async () => {
    env.ctx.config.stripe.directCharges = false;
    const k = await kitchen();
    await env.db.update(merchants).set({ chargeMode: "direct" }).where(eq(merchants.id, k.m.merchant.id));
    const { payment } = await join(k);
    expect(fake(env).intents.get(payment.paymentIntentId)).toMatchObject({ chargeMode: "destination" });
  });
});

describe("saved payment methods and automatic renewals", () => {
  const sub = async (id: string) => (await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, id)))[0]!;
  const chargeFor = async (subId: string, periodStart: string) => (await env.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, subId), eq(tiffinCharges.periodStart, periodStart))))[0]!;
  const events = async (userId: string) => (await env.db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, "tiffin_update")))).map((n) => n.data.event);
  /** An active subscriber whose card on file is `pm`, ready to renew on 2026-12-04. */
  async function renewing(k: K, pm: string, body: Record<string, unknown> = {}) {
    const j = await join(k, body);
    expect(j.r.status).toBe(201);
    await deliver(env, fake(env).succeedPaymentIntent(j.payment.paymentIntentId, { paymentMethod: pm }));
    await at("2026-12-04T15:00:00Z");
    return j;
  }

  it("the first payment keeps the card on a Stripe customer (reused per user and kitchen) and saves it on the subscription", async () => {
    const k = await kitchen();
    const { r, c, sub: s0, payment, charge } = await join(k);
    expect(r.status).toBe(201);
    expect(r.body.subscription).not.toHaveProperty("stripeCustomerId");
    const pi = fake(env).intents.get(payment.paymentIntentId)!;
    const customerId = (await sub(s0.id)).stripeCustomerId!;
    expect(customerId).toMatch(/^cus_fake_/);
    expect(pi).toMatchObject({ customerId, setupFutureUsage: "off_session", metadata: { ll_id: charge.id } });
    expect((await call(env, c.token, "GET", `/v1/me/tiffin/subscriptions/${s0.id}`)).body.subscription.cardOnFile).toBeNull();

    await pay(payment.paymentIntentId);
    expect(await sub(s0.id)).toMatchObject({ status: "active", paymentMethodId: FAKE_PM.visa, paymentMethodBrand: "visa", paymentMethodLast4: "4242" });
    const mine = await call(env, c.token, "GET", `/v1/me/tiffin/subscriptions/${s0.id}`);
    expect(mine.body.subscription.cardOnFile).toEqual({ type: "card", brand: "visa", last4: "4242" });
    expect((await call(env, c.token, "GET", "/v1/me/tiffin/subscriptions")).body.items[0].cardOnFile).toMatchObject({ last4: "4242" });

    // A second plan from the same kitchen reuses the customer instead of creating another.
    const other = (await call(env, k.m.ownerToken, "POST", `${k.base}/plans`, { name: "Weekend biryani", cadence: "weekly", daysOfWeek: [6, 0], priceCents: 4500 })).body;
    const second = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", { planId: other.id, servings: 1, fulfilment: "pickup", startDate: "2026-11-07" });
    expect(second.status).toBe(201);
    expect((await sub(second.body.subscription.id)).stripeCustomerId).toBe(customerId);
    expect(fake(env).customers.size).toBe(1);
  });

  it("renewals charge the saved card off-session with no action from the customer", async () => {
    const k = await kitchen();
    const { c, sub: s0 } = await renewing(k, FAKE_PM.visa);
    const run = await runDaily(env.ctx);
    expect(run.billing).toMatchObject({ charged: 1, errors: 0 });
    const ch = await chargeFor(s0.id, "2026-12-04");
    expect(ch).toMatchObject({ status: "paid", amountCents: 12000 + 1000 });
    const pi = fake(env).intents.get(ch.stripePaymentIntentId!)!;
    expect(pi).toMatchObject({ status: "succeeded", paymentMethodId: FAKE_PM.visa, customerId: (await sub(s0.id)).stripeCustomerId, applicationFeeCents: ch.platformFeeCents, connectedAccountId: k.m.merchant.stripeAccountId });
    expect(await sub(s0.id)).toMatchObject({ status: "active", currentPeriodStart: "2026-12-04", currentPeriodEnd: "2027-01-03", nextBillingDate: "2027-01-04" });
    // The customer is told it was paid, not asked to pay.
    expect(await events(c.user.id)).toContain("renewal_paid");
    expect(await events(c.user.id)).not.toContain("renewal_due");
    // Re-running neither charges again nor notifies again; the webhook for the same intent is harmless.
    expect((await rollBilling(env.ctx)).charged).toBe(0);
    await pay(ch.stripePaymentIntentId!);
    expect(await env.db.select().from(tiffinCharges).where(eq(tiffinCharges.subscriptionId, s0.id))).toHaveLength(2);
    expect((await events(c.user.id)).filter((e) => e === "renewal_paid")).toHaveLength(1);
  });

  it("falls back to the renewal_due flow when the bank wants the customer (authentication required)", async () => {
    const k = await kitchen();
    const { c, sub: s0 } = await renewing(k, FAKE_PM.authRequired);
    expect((await runDaily(env.ctx)).billing).toMatchObject({ charged: 1, errors: 0 });
    const ch = await chargeFor(s0.id, "2026-12-04");
    expect(ch).toMatchObject({ status: "pending" });
    expect(fake(env).intents.get(ch.stripePaymentIntentId!)).toMatchObject({ status: "requires_action", lastErrorCode: "authentication_required" });
    expect(await sub(s0.id)).toMatchObject({ status: "active", currentPeriodStart: "2026-11-04" });
    expect(await events(c.user.id)).toContain("renewal_due");

    // Stripe also reports the off-session attempt as failed: that must not mark it past due.
    expect((await deliver(env, fake(env).failPaymentIntent(ch.stripePaymentIntentId!, { code: "authentication_required" }))).statusCode).toBe(200);
    expect((await sub(s0.id)).status).toBe("active");
    expect((await chargeFor(s0.id, "2026-12-04")).status).toBe("pending");

    // The customer confirms the same intent from /pay/intent (retry-payment hands it back), and the period advances.
    const retry = await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${s0.id}/retry-payment`);
    expect(retry.status).toBe(200);
    expect(retry.body.payment.paymentIntentId).toBe(ch.stripePaymentIntentId);
    await deliver(env, fake(env).succeedPaymentIntent(ch.stripePaymentIntentId!, { paymentMethod: FAKE_PM.visa }));
    expect(await sub(s0.id)).toMatchObject({ status: "active", currentPeriodStart: "2026-12-04", paymentMethodId: FAKE_PM.visa, paymentMethodLast4: "4242" });
    expect(await chargeFor(s0.id, "2026-12-04")).toMatchObject({ status: "paid" });
  });

  it("a declined card fails the charge, marks the subscription past due and tells the customer; a new card recovers it", async () => {
    const k = await kitchen();
    const { c, sub: s0 } = await renewing(k, FAKE_PM.declined);
    expect((await runDaily(env.ctx)).billing).toMatchObject({ charged: 1, errors: 0 });
    const ch = await chargeFor(s0.id, "2026-12-04");
    expect(ch.status).toBe("failed");
    expect(await sub(s0.id)).toMatchObject({ status: "past_due", currentPeriodStart: "2026-11-04" });
    expect(env.ctx.providers.outbox.push.filter((p) => p.title === "Your tiffin payment didn't go through")).toHaveLength(1);
    expect(await events(c.user.id)).toEqual(expect.arrayContaining(["payment_failed"]));
    expect(await events(c.user.id)).not.toContain("renewal_due");

    // Stripe's own payment_failed webhook for the same attempt doesn't notify twice; no retry loop either.
    await deliver(env, fake(env).failPaymentIntent(ch.stripePaymentIntentId!));
    expect(env.ctx.providers.outbox.push.filter((p) => p.title === "Your tiffin payment didn't go through")).toHaveLength(1);
    expect((await rollBilling(env.ctx)).charged).toBe(0);

    // The customer retries with a different card: a fresh manual intent, and that card becomes the one on file.
    const retry = await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${s0.id}/retry-payment`);
    expect(retry.body.payment.paymentIntentId).not.toBe(ch.stripePaymentIntentId);
    await deliver(env, fake(env).succeedPaymentIntent(retry.body.payment.paymentIntentId, { paymentMethod: FAKE_PM.visa }));
    expect(await sub(s0.id)).toMatchObject({ status: "active", currentPeriodStart: "2026-12-04", paymentMethodId: FAKE_PM.visa });
  });

  it("pre-authorized debit renewals go to processing and settle when the debit clears", async () => {
    env.ctx.config.tiffin = { padEnabled: true };
    const k = await kitchen();
    const first = await join(k, { paymentMethod: "pad" });
    expect(fake(env).intents.get(first.payment.paymentIntentId)).toMatchObject({ paymentMethodTypes: ["acss_debit"], setupFutureUsage: "off_session" });
    await pay(first.payment.paymentIntentId);
    expect(await sub(first.sub.id)).toMatchObject({ paymentMethodId: FAKE_PM.pad, paymentMethodLast4: "6789" });
    expect((await call(env, first.c.token, "GET", `/v1/me/tiffin/subscriptions/${first.sub.id}`)).body.subscription.cardOnFile).toMatchObject({ type: "pad", last4: "6789" });

    await at("2026-12-04T15:00:00Z");
    await runDaily(env.ctx);
    const ch = await chargeFor(first.sub.id, "2026-12-04");
    expect(ch.status).toBe("processing");
    expect(fake(env).intents.get(ch.stripePaymentIntentId!)).toMatchObject({ status: "processing", paymentMethodTypes: ["acss_debit"] });
    expect(await events(first.c.user.id)).not.toContain("renewal_due");
    expect(await events(first.c.user.id)).toContain("payment_processing");
    // The customer sees a pending charge flagged processing, and the subscription keeps its status.
    expect((await call(env, first.c.token, "GET", `/v1/me/tiffin/subscriptions/${first.sub.id}`)).body.subscription).toMatchObject({ status: "active" });
    await pay(ch.stripePaymentIntentId!);
    expect(await sub(first.sub.id)).toMatchObject({ status: "active", currentPeriodStart: "2026-12-04" });
    expect(await chargeFor(first.sub.id, "2026-12-04")).toMatchObject({ status: "paid" });
  });

  describe("payment_intent.processing", () => {
    /** A PAD subscriber whose 2026-12-04 renewal is in flight. */
    async function inFlight() {
      env.ctx.config.tiffin = { padEnabled: true };
      const k = await kitchen();
      const first = await join(k, { paymentMethod: "pad" });
      await pay(first.payment.paymentIntentId);
      await at("2026-12-04T15:00:00Z");
      await runDaily(env.ctx);
      const ch = await chargeFor(first.sub.id, "2026-12-04");
      expect(ch.status).toBe("processing");
      return { k, first, ch };
    }

    it("first PAD payment: the charge shows processing, the subscription stays pending and nothing else is charged", async () => {
      env.ctx.config.tiffin = { padEnabled: true };
      const k = await kitchen();
      const j = await join(k, { paymentMethod: "pad" });
      const first = fake(env).processPaymentIntent(j.payment.paymentIntentId);
      expect((await deliver(env, first)).statusCode).toBe(200);
      expect(await chargeFor(j.sub.id, "2026-11-04")).toMatchObject({ status: "processing", stripePaymentIntentId: j.payment.paymentIntentId });
      expect((await sub(j.sub.id)).status).toBe("pending");
      expect(await events(j.c.user.id)).toEqual(["payment_processing"]);
      // The customer's own view says pending + processing, and "pay again" is refused rather than creating a second charge.
      const charges = await call(env, j.c.token, "GET", `/v1/me/tiffin/subscriptions/${j.sub.id}/charges`);
      if (charges.status === 200) expect(charges.body.items[0]).toMatchObject({ status: "pending", processing: true });
      const retry = await call(env, j.c.token, "POST", `/v1/me/tiffin/subscriptions/${j.sub.id}/retry-payment`);
      expect(retry.status).toBe(409);
      expect(retry.body.error.message).toMatch(/processing/);
      expect(fake(env).intents.size).toBe(1);
      // Replays are harmless and do not notify again; the debit clearing activates the subscription.
      await deliver(env, fake(env).processPaymentIntent(j.payment.paymentIntentId));
      expect(await events(j.c.user.id)).toEqual(["payment_processing"]);
      await pay(j.payment.paymentIntentId);
      expect(await sub(j.sub.id)).toMatchObject({ status: "active" });
      expect(await chargeFor(j.sub.id, "2026-11-04")).toMatchObject({ status: "paid" });
    });

    it("a renewal debit does not double charge: the roll skips it and retry-payment refuses while it is processing", async () => {
      const { first, ch } = await inFlight();
      expect((await rollBilling(env.ctx)).charged).toBe(0);
      const retry = await call(env, first.c.token, "POST", `/v1/me/tiffin/subscriptions/${first.sub.id}/retry-payment`);
      expect(retry.status).toBe(409);
      // Stripe's own processing webhook for the intent the roll already marked: no second notification.
      await deliver(env, fake(env).processPaymentIntent(ch.stripePaymentIntentId!));
      expect((await events(first.c.user.id)).filter((e) => e === "payment_processing")).toHaveLength(1);
      expect(fake(env).intents.size).toBe(2); // the first payment and this one, nothing more
    });

    it("a debit that fails after processing reverts the charge to failed, marks the subscription past due and tells the customer", async () => {
      const { first, ch } = await inFlight();
      expect((await deliver(env, fake(env).failPaymentIntent(ch.stripePaymentIntentId!, { code: "account_closed" }))).statusCode).toBe(200);
      expect(await chargeFor(first.sub.id, "2026-12-04")).toMatchObject({ status: "failed" });
      expect(await sub(first.sub.id)).toMatchObject({ status: "past_due", currentPeriodStart: "2026-11-04" });
      expect(await events(first.c.user.id)).toContain("payment_failed");
      // The customer can now retry with a fresh payment.
      const retry = await call(env, first.c.token, "POST", `/v1/me/tiffin/subscriptions/${first.sub.id}/retry-payment`);
      expect(retry.status).toBe(200);
      expect(retry.body.payment.paymentIntentId).not.toBe(ch.stripePaymentIntentId);
    });

    it("a late processing event never reopens a paid charge", async () => {
      const { first, ch } = await inFlight();
      await pay(ch.stripePaymentIntentId!);
      await deliver(env, fake(env).processPaymentIntent(ch.stripePaymentIntentId!));
      expect(await chargeFor(first.sub.id, "2026-12-04")).toMatchObject({ status: "paid" });
    });
  });

  it("a fully credited period still settles without a payment when a card is on file", async () => {
    const k = await kitchen();
    const { sub: s0 } = await activeSub(k);
    await at("2026-12-04T15:00:00Z");
    // Zero out the next period's price via a 100% credit: simplest is a free price.
    await env.db.update(tiffinSubscriptions).set({ priceCents: 0 }).where(eq(tiffinSubscriptions.id, s0.id));
    expect((await rollBilling(env.ctx)).settled).toBe(1);
    expect(await chargeFor(s0.id, "2026-12-04")).toMatchObject({ status: "paid", stripePaymentIntentId: null });
  });

  it("direct charges keep the customer and the saved method on the kitchen's connected account", async () => {
    env.ctx.config.stripe.directCharges = true;
    const k = await kitchen();
    await env.db.update(merchants).set({ chargeMode: "direct" }).where(eq(merchants.id, k.m.merchant.id));
    const { c, sub: s0 } = await renewing(k, FAKE_PM.visa);
    expect(fake(env).customers.get((await sub(s0.id)).stripeCustomerId!)).toMatchObject({ connectedAccountId: k.m.merchant.stripeAccountId, userId: c.user.id });
    await runDaily(env.ctx);
    const ch = await chargeFor(s0.id, "2026-12-04");
    expect(ch.status).toBe("paid");
    expect(fake(env).intents.get(ch.stripePaymentIntentId!)).toMatchObject({ chargeMode: "direct", status: "succeeded" });
  });

  it("changing the card: the SetupIntent is reused while open, the new card replaces the old, and renewals use it", async () => {
    const k = await kitchen();
    const { c, sub: s0 } = await activeSub(k);
    const url = `/v1/me/tiffin/subscriptions/${s0.id}/payment-method`;
    const first = await call(env, c.token, "POST", url);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ setupIntentId: expect.stringMatching(/^seti_fake_/), clientSecret: expect.stringContaining("_secret_"), methods: ["card"] });
    expect((await call(env, c.token, "POST", url)).body.setupIntentId).toBe(first.body.setupIntentId);
    // Someone else's subscription is a 404.
    expect((await call(env, (await customer(env)).token, "POST", url)).status).toBe(404);

    // The public /pay/setup page needs the secret and shows the kitchen.
    const view = (cs: string) => call(env, null, "GET", `/v1/public/payments/setup/${first.body.setupIntentId}?cs=${cs}`);
    expect((await view("nope")).status).toBe(404);
    expect((await call(env, null, "GET", `/v1/public/payments/setup/seti_fake_999999?cs=${first.body.clientSecret}`)).status).toBe(404);
    const open = await view(first.body.clientSecret);
    expect(open.body).toMatchObject({ status: "requires_payment", description: "Tiffin: Veg thali, weekdays", methods: ["card"], cardOnFile: null, merchant: { slug: k.shop } });

    expect((await deliver(env, fake(env).succeedSetupIntent(first.body.setupIntentId, { paymentMethod: FAKE_PM.declined }))).statusCode).toBe(200);
    expect(await sub(s0.id)).toMatchObject({ paymentMethodId: FAKE_PM.declined, paymentMethodLast4: "0002" });
    const mine = await call(env, c.token, "GET", `/v1/me/tiffin/subscriptions/${s0.id}`);
    expect(mine.body.subscription.cardOnFile).toEqual({ type: "card", brand: "visa", last4: "0002" });
    expect((await view(first.body.clientSecret)).body).toMatchObject({ status: "succeeded", cardOnFile: { last4: "0002" } });
    expect(await events(c.user.id)).toContain("payment_method_updated");
    // Replay is harmless, and a finished SetupIntent is not reused.
    await deliver(env, fake(env).succeedSetupIntent(first.body.setupIntentId, { paymentMethod: FAKE_PM.declined }));
    const next = await call(env, c.token, "POST", url);
    expect(next.body.setupIntentId).not.toBe(first.body.setupIntentId);

    // The new (declining) card is what the next renewal tries.
    await at("2026-12-04T15:00:00Z");
    await runDaily(env.ctx);
    expect(await sub(s0.id)).toMatchObject({ status: "past_due" });
  });

  it("refuses a card change on a cancelled subscription", async () => {
    const k = await kitchen();
    const { c, sub: s0 } = await activeSub(k);
    await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${s0.id}/cancel`, {});
    expect((await call(env, c.token, "POST", `/v1/me/tiffin/subscriptions/${s0.id}/payment-method`)).status).toBe(409);
  });
});


describe("charge mode change", () => {
  const sub = async (id: string) => (await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, id)))[0]!;
  const events = async (userId: string) => (await env.db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, "tiffin_update")))).map((n) => n.data.event);
  const chargeFor = async (subId: string, periodStart: string) => (await env.db.select().from(tiffinCharges).where(and(eq(tiffinCharges.subscriptionId, subId), eq(tiffinCharges.periodStart, periodStart))))[0]!;
  async function setMode(merchantId: string, chargeMode: string) {
    const admin = await createUser(env.db, { platformRole: "admin" });
    await openSupportSession(env, admin.id, merchantId);
    return call(env, await tokenFor(env, admin), "PUT", `/v1/admin/merchants/${merchantId}/charge-mode`, { chargeMode });
  }

  it("clears saved customers and cards on the old account, counts them, and asks for the card again at the next renewal", async () => {
    env.ctx.config.stripe.directCharges = true;
    const k = await kitchen();
    const other = await kitchen();
    const a = await activeSub(k);
    const b = await activeSub(k);
    const gone = await activeSub(k);
    await call(env, gone.c.token, "POST", `/v1/me/tiffin/subscriptions/${gone.sub.id}/cancel`, {});
    const elsewhere = await activeSub(other);
    // A new, unpaid sign-up has a pending first charge on an intent that also lives on the old (platform) account.
    const fresh = await join(k);
    expect((await chargeFor(fresh.sub.id, "2026-11-04")).stripePaymentIntentId).toBe(fresh.payment.paymentIntentId);
    const before = await sub(a.sub.id);
    expect(before).toMatchObject({ paymentMethodId: FAKE_PM.visa });
    expect(before.stripeCustomerId).toBeTruthy();

    const res = await setMode(k.m.merchant.id, "direct");
    expect(res.status).toBe(200);
    // a, b and the unpaid sign-up (it already has a customer from its first intent); not the cancelled one, not another kitchen.
    expect(res.body).toMatchObject({ chargeMode: "direct", directChargesEnabled: true, tiffinSubscriptionsReset: 3 });
    for (const s of [a, b, fresh]) expect(await sub(s.sub.id)).toMatchObject({ stripeCustomerId: null, paymentMethodId: null, paymentMethodBrand: null, paymentMethodLast4: null, setupIntentId: null });
    expect((await sub(elsewhere.sub.id)).paymentMethodId).toBe(FAKE_PM.visa);
    expect((await sub(gone.sub.id)).stripeCustomerId).toBeTruthy();
    expect((await call(env, a.c.token, "GET", `/v1/me/tiffin/subscriptions/${a.sub.id}`)).body.subscription.cardOnFile).toBeNull();
    expect((await chargeFor(fresh.sub.id, "2026-11-04")).stripePaymentIntentId).toBeNull();
    // Same mode again changes nothing and resets nothing.
    expect((await setMode(k.m.merchant.id, "direct")).body).toMatchObject({ chargeMode: "direct", tiffinSubscriptionsReset: 0 });

    // Next renewal: no off-session charge on a card that isn't there; a new direct intent and a renewal_due notice instead.
    await at("2026-12-04T15:00:00Z");
    const intentsBefore = fake(env).intents.size;
    await runDaily(env.ctx);
    const ch = await chargeFor(a.sub.id, "2026-12-04");
    expect(ch.status).toBe("pending");
    const pi = fake(env).intents.get(ch.stripePaymentIntentId!)!;
    expect(pi).toMatchObject({ chargeMode: "direct", connectedAccountId: k.m.merchant.stripeAccountId, setupFutureUsage: "off_session" });
    expect(pi.status).not.toBe("succeeded");
    expect(await events(a.c.user.id)).toContain("renewal_due");
    expect(fake(env).intents.size).toBeGreaterThan(intentsBefore);
    // The customer confirms it with a card; that card is now on file on the new account and later renewals are automatic.
    await deliver(env, fake(env).succeedPaymentIntent(pi.id, { paymentMethod: FAKE_PM.visa }));
    expect(await sub(a.sub.id)).toMatchObject({ status: "active", currentPeriodStart: "2026-12-04", paymentMethodId: FAKE_PM.visa });
    expect((await sub(a.sub.id)).stripeCustomerId).toBeTruthy();
    // The unpaid sign-up gets a fresh intent on the connected account instead of the old one.
    const retry = await call(env, fresh.c.token, "POST", `/v1/me/tiffin/subscriptions/${fresh.sub.id}/retry-payment`);
    expect(retry.status).toBe(200);
    expect(retry.body.payment.paymentIntentId).not.toBe(fresh.payment.paymentIntentId);
    expect(fake(env).intents.get(retry.body.payment.paymentIntentId)).toMatchObject({ chargeMode: "direct" });
  });

  it("switching back to destination resets again, and a payment already processing is left alone", async () => {
    env.ctx.config.stripe.directCharges = true;
    env.ctx.config.tiffin = { padEnabled: true };
    const k = await kitchen();
    const a = await join(k, { paymentMethod: "pad" });
    await deliver(env, fake(env).processPaymentIntent(a.payment.paymentIntentId));
    expect((await setMode(k.m.merchant.id, "direct")).body.tiffinSubscriptionsReset).toBe(1);
    expect(await chargeFor(a.sub.id, "2026-11-04")).toMatchObject({ status: "processing", stripePaymentIntentId: a.payment.paymentIntentId });
    expect((await setMode(k.m.merchant.id, "destination")).body).toMatchObject({ chargeMode: "destination", tiffinSubscriptionsReset: 0 });
  });
});
