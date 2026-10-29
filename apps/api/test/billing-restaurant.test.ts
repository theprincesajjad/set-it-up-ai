import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantAddOns, merchants, subscriptions } from "@ll/db";
import { FEES } from "@ll/shared";
import { getPayments } from "../src/providers/payments.js";
import { getMerchantFeatures } from "../src/services/features.js";
import { computeFees } from "../src/services/fees.js";
import { createConnectPayment, refundConnectPayment } from "../src/services/payments.js";
import { createMerchant, createTestEnv, createUser, openSupportSession, tokenFor, type TestEnv } from "./helpers.js";
import { call, fake, paidMerchant } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const simulate = (action: string, id: string) => call(env, null, "POST", "/v1/payments/fake/simulate", { action, id });
const row = async (id: string) => (await env.db.select().from(merchants).where(eq(merchants.id, id)))[0]!;
const send = (token: string, method: "PUT" | "DELETE", url: string, payload?: unknown) =>
  env.app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}) }).then((r) => ({ status: r.statusCode, body: r.body ? JSON.parse(r.body) : null }));

/** Owner buys a restaurant tier through (fake) Checkout. */
async function subscribe(tier: "starter" | "growth" | "pro", opts: { interval?: "month" | "year"; founding?: boolean } = {}) {
  const m = await createMerchant(env);
  if (opts.founding) await env.db.update(merchants).set({ foundingOffer: true }).where(eq(merchants.id, m.merchant.id));
  const base = `/v1/merchants/${m.merchant.id}/billing/restaurant`;
  const co = await call(env, m.ownerToken, "POST", `${base}/checkout`, { tier, interval: opts.interval ?? "month" });
  expect(co.status).toBe(200);
  const done = await simulate("complete_checkout", co.body.sessionId);
  return { ...m, base, co, done, addOns: `/v1/merchants/${m.merchant.id}/billing/add-ons` };
}

describe("restaurant subscriptions", () => {
  it("lists the three tiers, fees and add-ons for a merchant with no pack", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const r = await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/billing/restaurant`);
    expect(r.status).toBe(200);
    expect(r.body.tier).toBeNull();
    expect(r.body.plans.map((p: { tier: string; priceCents: number }) => [p.tier, p.priceCents])).toEqual([["starter", 9900], ["growth", 19900], ["pro", 34900]]);
    expect(r.body.plans[0].foundingPriceCents).toBeNull();
    expect(r.body.addOns.map((a: { id: string; available: boolean }) => [a.id, a.available])).toEqual([["whatsapp_1000", false], ["extra_location", false], ["banquet_module", false], ["phone_ai", false]]);
    expect(r.body.fees.find((f: { kind: string }) => f.kind === "order").platformFeeBps).toBe(FEES.orderBpsFree);
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/billing/invoices`)).body.items).toEqual([]);
  });

  it("is owner-only", async () => {
    const { merchant } = await createMerchant(env);
    expect((await call(env, null, "GET", `/v1/merchants/${merchant.id}/billing/restaurant`)).status).toBe(401);
  });

  it("checkout -> webhook stores the tier, mirrors it on the merchant and implies Café & Retail", async () => {
    const s = await subscribe("starter");
    expect(s.done.body.events.map((e: { type: string }) => e.type)).toEqual(["checkout.session.completed", "customer.subscription.created"]);
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, s.merchant.id));
    expect(sub).toMatchObject({ restaurantTier: "starter", status: "active", plan: "free", interval: "month" });
    const m = await row(s.merchant.id);
    expect(m.restaurantTier).toBe("starter");
    expect(m.plan).toBe("free"); // Plus comes from effectivePlan, not from merchants.plan
    const features = await getMerchantFeatures(env.db, m);
    expect(features["restaurant.dietary_tags"].enabled).toBe(true);
    // Trade tools are self-serve (docs/business/pricing.md, Rollout): a restaurant tier turns ordering on straight away.
    expect(features["orders.order_ahead"]).toMatchObject({ stage: "ga", enabled: true });
    expect(features["restaurant.tiffin"].enabled).toBe(false);
    // Plan billing is untouched.
    const overview = await call(env, s.ownerToken, "GET", `/v1/merchants/${s.merchant.id}/billing`);
    expect(overview.body).toMatchObject({ plan: "free", subscription: null, restaurantTier: "starter" });
    expect((await call(env, s.ownerToken, "POST", `${s.base}/checkout`, { tier: "pro" })).status).toBe(409);
  });

  it("changes tier (prorated) and the merchant mirror follows; the webhook update agrees", async () => {
    const s = await subscribe("starter");
    const up = await call(env, s.ownerToken, "POST", `${s.base}/change`, { tier: "growth" });
    expect(up.body).toMatchObject({ tier: "growth", subscription: { tier: "growth" } });
    expect((await row(s.merchant.id)).restaurantTier).toBe("growth");
    const features = await getMerchantFeatures(env.db, await row(s.merchant.id));
    expect(features["restaurant.tiffin"].enabled).toBe(true);
    expect(features["restaurant.kds"].enabled).toBe(false);
    expect((await call(env, s.ownerToken, "POST", `${s.base}/change`, { tier: "growth" })).status).toBe(409);
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, s.merchant.id));
    await simulate("update_subscription", sub!.stripeSubscriptionId!);
    expect((await row(s.merchant.id)).restaurantTier).toBe("growth");
    const down = await call(env, s.ownerToken, "POST", `${s.base}/change`, { tier: "starter" });
    expect(down.body.tier).toBe("starter");
    expect((await row(s.merchant.id)).restaurantTier).toBe("starter");
  });

  it("cancel at period end keeps the tier; the deleted webhook clears it; resume undoes cancel", async () => {
    const s = await subscribe("pro", { interval: "year" });
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, s.merchant.id));
    expect(sub!.interval).toBe("year");
    expect((await call(env, s.ownerToken, "POST", `${s.base}/cancel`, {})).body.subscription.cancelAtPeriodEnd).toBe(true);
    expect((await row(s.merchant.id)).restaurantTier).toBe("pro");
    expect((await call(env, s.ownerToken, "POST", `${s.base}/resume`)).body.subscription.cancelAtPeriodEnd).toBe(false);
    await call(env, s.ownerToken, "POST", `${s.base}/cancel`, {});
    await simulate("end_subscription", sub!.stripeSubscriptionId!);
    expect((await row(s.merchant.id)).restaurantTier).toBeNull();
    expect((await call(env, s.ownerToken, "POST", `${s.base}/cancel`, {})).status).toBe(409);
  });

  it("immediate cancel drops the tier and the add-ons", async () => {
    const s = await subscribe("growth");
    await send(s.ownerToken, "PUT", `${s.addOns}/extra_location`, { quantity: 2 });
    const r = await call(env, s.ownerToken, "POST", `${s.base}/cancel`, { immediate: true });
    expect(r.body).toMatchObject({ tier: null, subscription: { status: "canceled" } });
    expect((await row(s.merchant.id)).restaurantTier).toBeNull();
    const [a] = await env.db.select().from(merchantAddOns).where(eq(merchantAddOns.merchantId, s.merchant.id));
    expect(a!.status).toBe("cancelled");
  });

  it("founding offer: year-one coupon at checkout, then the lifetime phase is scheduled", async () => {
    const s = await subscribe("growth", { founding: true });
    const session = fake(env).sessions.get(s.co.body.sessionId)!;
    expect(session.couponId).toBe(fake(env).foundingCoupon);
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, s.merchant.id));
    expect(fake(env).subscriptions.get(sub!.stripeSubscriptionId!)!.foundingScheduled).toBe(true);
    const plans = (await call(env, s.ownerToken, "GET", s.base)).body;
    expect(plans.foundingOffer).toEqual({ eligible: true, firstYearPct: 50, lifetimePct: 25 });
    expect(plans.plans.find((p: { tier: string }) => p.tier === "growth")).toMatchObject({ foundingPriceCents: 9950, foundingLifetimePriceCents: 14925 });

    const plain = await subscribe("growth");
    expect(fake(env).sessions.get(plain.co.body.sessionId)!.couponId).toBeUndefined();
  });
});

describe("add-ons", () => {
  it("need a restaurant subscription, and banquet/phone need Growth", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const url = (id: string) => `/v1/merchants/${merchant.id}/billing/add-ons/${id}`;
    expect((await send(ownerToken, "PUT", url("whatsapp_1000"), {})).status).toBe(409);
    expect((await send(ownerToken, "PUT", url("nonsense"), {})).status).toBe(400);

    const starter = await subscribe("starter");
    expect((await send(starter.ownerToken, "PUT", `${starter.addOns}/banquet_module`, {})).status).toBe(409);
    expect((await send(starter.ownerToken, "PUT", `${starter.addOns}/extra_location`, { quantity: 2 })).body.addOn).toMatchObject({ active: true, quantity: 2 });
    const pro = await subscribe("pro");
    const r = await send(pro.ownerToken, "PUT", `${pro.addOns}/phone_ai`, {});
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/Already included/);
  });

  it("banquet and phone assistant unlock their features on Growth; detaching locks them again", async () => {
    const s = await subscribe("growth");
    const features = async () => getMerchantFeatures(env.db, await row(s.merchant.id));
    expect((await features())["restaurant.banquet"].enabled).toBe(false);
    const on = await send(s.ownerToken, "PUT", `${s.addOns}/banquet_module`, {});
    expect(on.body.addOn).toMatchObject({ id: "banquet_module", active: true, quantity: 1, unlocks: ["restaurant.banquet"] });
    let f = await features();
    expect(f["restaurant.banquet"].enabled).toBe(true);
    expect(f["restaurant.phone_ai"].enabled).toBe(false);
    expect(f["restaurant.kds"].enabled).toBe(false);
    expect((await send(s.ownerToken, "DELETE", `${s.addOns}/banquet_module`)).body.addOn.active).toBe(false);
    f = await features();
    expect(f["restaurant.banquet"].enabled).toBe(false);
    expect((await send(s.ownerToken, "DELETE", `${s.addOns}/banquet_module`)).status).toBe(409);
  });

  it("moving off Growth drops banquet/phone add-ons but keeps the rest", async () => {
    const s = await subscribe("growth");
    await send(s.ownerToken, "PUT", `${s.addOns}/banquet_module`, {});
    await send(s.ownerToken, "PUT", `${s.addOns}/whatsapp_1000`, {});
    await call(env, s.ownerToken, "POST", `${s.base}/change`, { tier: "pro" });
    const list = (await call(env, s.ownerToken, "GET", s.addOns)).body.items as { id: string; active: boolean }[];
    expect(Object.fromEntries(list.map((a) => [a.id, a.active]))).toEqual({ whatsapp_1000: true, extra_location: false, banquet_module: false, phone_ai: false });
  });

  it("whatsapp_1000 grants 1,000 messages on purchase and on every paid renewal", async () => {
    const s = await subscribe("growth");
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, s.merchant.id));
    expect((await send(s.ownerToken, "PUT", `${s.addOns}/whatsapp_1000`, {})).status).toBe(200);
    expect((await row(s.merchant.id)).whatsappCreditsExtra).toBe(1000);
    await send(s.ownerToken, "PUT", `${s.addOns}/whatsapp_1000`, {}); // idempotent re-attach
    expect((await row(s.merchant.id)).whatsappCreditsExtra).toBe(1000);
    const renew = await simulate("renew_subscription", sub!.stripeSubscriptionId!);
    expect(renew.body.events.map((e: { type: string }) => e.type)).toEqual(["invoice.paid", "customer.subscription.updated"]);
    expect((await row(s.merchant.id)).whatsappCreditsExtra).toBe(2000);
    // The renewal's subscription.updated keeps the add-on (reconciled from the subscription items).
    expect((await env.db.select().from(merchantAddOns).where(eq(merchantAddOns.merchantId, s.merchant.id)))[0]).toMatchObject({ addOnId: "whatsapp_1000", status: "active" });
    await send(s.ownerToken, "DELETE", `${s.addOns}/whatsapp_1000`);
    await simulate("renew_subscription", sub!.stripeSubscriptionId!);
    expect((await row(s.merchant.id)).whatsappCreditsExtra).toBe(2000);
  });

  it("a portal change to the items is reconciled from the subscription webhook", async () => {
    const s = await subscribe("growth");
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, s.merchant.id));
    await fake(env).addSubscriptionItem({ subscriptionId: sub!.stripeSubscriptionId!, addOnId: "extra_location", quantity: 3, interval: "month", unitAmountCents: 4900, name: "Extra location" });
    await simulate("update_subscription", sub!.stripeSubscriptionId!);
    const list = (await call(env, s.ownerToken, "GET", s.addOns)).body.items as { id: string; quantity: number }[];
    expect(list.find((a) => a.id === "extra_location")!.quantity).toBe(3);
  });

  it("invoice history lists what Stripe billed", async () => {
    const s = await subscribe("growth");
    await send(s.ownerToken, "PUT", `${s.addOns}/extra_location`, {});
    const r = await call(env, s.ownerToken, "GET", `/v1/merchants/${s.merchant.id}/billing/invoices`);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.items.map((i: { totalCents: number }) => i.totalCents).sort((a: number, b: number) => a - b)).toEqual([4900, 19900]);
    expect(r.body.items[0]).toMatchObject({ status: "paid", currency: "cad" });
  });
});

describe("fees", () => {
  it("orders are commission-free on any paid plan or restaurant tier, 1.5% on Free", () => {
    expect(computeFees({ kind: "order", amountCents: 10000, plan: "free" })).toMatchObject({ platformFeeBps: 150, platformFeeCents: 150, customerFeeCents: 0, totalChargeCents: 10000, merchantNetCents: 9850 });
    expect(computeFees({ kind: "order", amountCents: 10000, plan: "free", restaurantTier: "starter" })).toMatchObject({ platformFeeBps: 0, platformFeeCents: 0 });
    expect(computeFees({ kind: "order", amountCents: 10000, plan: "plus" }).platformFeeCents).toBe(0);
  });

  it("adds the optional $0.49 customer fee to orders only", () => {
    const r = computeFees({ kind: "order", amountCents: 2500, plan: "free", restaurantTier: "growth", customerServiceFee: true });
    expect(r).toMatchObject({ platformFeeCents: 0, customerFeeCents: 49, totalChargeCents: 2549, applicationFeeCents: 49 });
    expect(computeFees({ kind: "deposit", amountCents: 2500, plan: "free", customerServiceFee: true }).customerFeeCents).toBe(0);
    expect(computeFees({ kind: "order", amountCents: 0, plan: "free", customerServiceFee: true }).customerFeeCents).toBe(0);
  });

  it("deposits, invoices and tiffin are 1% on every plan, rounded to the cent", () => {
    for (const kind of ["deposit", "invoice", "tiffin"] as const) {
      expect(computeFees({ kind, amountCents: 50000, plan: "pro", restaurantTier: "pro" })).toMatchObject({ platformFeeBps: 100, platformFeeCents: 500, merchantNetCents: 49500 });
    }
    expect(computeFees({ kind: "tiffin", amountCents: 4950, plan: "free" }).platformFeeCents).toBe(50);
    expect(computeFees({ kind: "tiffin", amountCents: 4940, plan: "free" }).platformFeeCents).toBe(49);
  });

  it("the explainer in the overview matches the function", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    await env.db.update(merchants).set({ restaurantTier: "growth" }).where(eq(merchants.id, merchant.id));
    const r = await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/billing/restaurant`);
    expect(Object.fromEntries(r.body.fees.map((f: { kind: string; platformFeeBps: number }) => [f.kind, f.platformFeeBps]))).toEqual({ order: 0, deposit: 100, invoice: 100, tiffin: 100 });
  });
});

describe("charge mode", () => {
  const pay = (m: Awaited<ReturnType<typeof paidMerchant>>, key = "k1") =>
    createConnectPayment(env.ctx, m.merchant, { amountCents: 5000, applicationFeeCents: 50, description: "test", metadata: { ll_kind: "order", ll_id: "x", merchant_id: m.merchant.id }, idempotencyKey: key });
  let adminId = "";
  let adminToken = "";
  // Changing a shop's charge mode is a write inside the shop: the admin opens a support session first.
  const setMode = async (token: string, id: string, chargeMode: string) => {
    if (token === adminToken && (await env.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, id))).length) await openSupportSession(env, adminId, id);
    return send(token, "PUT", `/v1/admin/merchants/${id}/charge-mode`, { chargeMode });
  };

  async function admin() {
    const u = await createUser(env.db, { platformRole: "admin" });
    adminId = u.id;
    adminToken = await tokenFor(env, u);
    return adminToken;
  }

  it("new shops default to direct and the flag defaults on; with STRIPE_DIRECT_CHARGES off every shop uses destination", async () => {
    // phase-solo A: direct charges are the default for new shops (0032_solo_a) and STRIPE_DIRECT_CHARGES defaults on.
    expect(env.ctx.config.stripe.directCharges).toBe(true);
    const fresh = await paidMerchant(env);
    expect((await row(fresh.merchant.id)).chargeMode).toBe("direct");
    expect((await pay(fresh, "k0")).chargeMode).toBe("direct");
    env.ctx.config.stripe.directCharges = false;
    // An existing shop on destination.
    const m = await paidMerchant(env);
    await env.db.update(merchants).set({ chargeMode: "destination" }).where(eq(merchants.id, m.merchant.id));
    m.merchant = await row(m.merchant.id);
    expect((await pay(m)).chargeMode).toBe("destination");
    const t = await admin();
    expect((await setMode(t, m.merchant.id, "direct")).body).toMatchObject({ chargeMode: "direct", directChargesEnabled: false });
    expect((await pay(m, "k2")).chargeMode).toBe("destination");
  });

  it("direct charges carry the application fee on the connected account when the flag is on", async () => {
    env.ctx.config.stripe.directCharges = true;
    const m = await paidMerchant(env);
    const t = await admin();
    expect((await setMode(t, m.merchant.id, "direct")).body).toMatchObject({ chargeMode: "direct", directChargesEnabled: true });
    const merchant = await row(m.merchant.id);
    const pi = await createConnectPayment(env.ctx, merchant, { amountCents: 5000, applicationFeeCents: 50, description: "direct", metadata: { ll_kind: "order", ll_id: "x", merchant_id: merchant.id }, idempotencyKey: "d1" });
    expect(pi).toMatchObject({ chargeMode: "direct", applicationFeeCents: 50, amountCents: 5000 });
    const ev = fake(env).succeedPaymentIntent(pi.id);
    expect(ev.account).toBe(merchant.stripeAccountId);
    expect(ev.data.object).toMatchObject({ transfer_data: null, application_fee_amount: 50, ll_charge_mode: "direct" });
    // Refunds run on the merchant's account.
    expect(await refundConnectPayment(env.ctx, merchant, { paymentIntentId: pi.id, idempotencyKey: "r1" })).toMatchObject({ status: "succeeded", amountCents: 5000 });
    expect(fake(env).refunds[0]!.connectedAccountId).toBe(merchant.stripeAccountId);
    await expect(getPayments(env.ctx).refund({ paymentIntentId: pi.id, idempotencyKey: "r2", amountCents: 1 })).rejects.toThrow(/connectedAccountId/);
    // Destination again.
    await setMode(t, m.merchant.id, "destination");
    const back = await createConnectPayment(env.ctx, await row(m.merchant.id), { amountCents: 5000, applicationFeeCents: 50, description: "dest", metadata: { ll_kind: "order", ll_id: "y", merchant_id: m.merchant.id }, idempotencyKey: "d2" });
    expect(back.chargeMode).toBe("destination");
    expect(fake(env).succeedPaymentIntent(back.id).data.object.transfer_data).toEqual({ destination: merchant.stripeAccountId });
  });

  it("is admin-only, validates the mode and needs a connected account for direct", async () => {
    const m = await paidMerchant(env, { connect: false });
    expect((await setMode(m.ownerToken, m.merchant.id, "direct")).status).toBe(403);
    const t = await admin();
    expect((await setMode(t, m.merchant.id, "sideways")).status).toBe(400);
    expect((await setMode(t, m.merchant.id, "direct")).status).toBe(409);
    expect((await setMode(t, "00000000-0000-4000-8000-000000000000", "destination")).status).toBe(404);
  });
});
