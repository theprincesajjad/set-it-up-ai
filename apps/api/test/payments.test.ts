import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchants, orders, subscriptions, webhookEvents } from "@ll/db";
import { StripePayments, platformFeeCents } from "../src/providers/payments.js";
import { createMerchant, createTestEnv, type TestEnv } from "./helpers.js";
import { PAID_FEATURES, call, customer, paidMerchant, setStage, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

describe("platform fee", () => {
  it("is 0.75% rounded to the cent", () => {
    expect(platformFeeCents(10000)).toBe(75);
    expect(platformFeeCents(1754)).toBe(13);
    expect(platformFeeCents(29380)).toBe(220);
    expect(platformFeeCents(0)).toBe(0);
  });
});

describe("Stripe Connect onboarding", () => {
  it("creates an Express account, returns an onboarding link and syncs status from account.updated", async () => {
    const m = await paidMerchant(env, { plan: "plus", connect: false });
    const url = `/v1/merchants/${m.merchant.id}/payments`;
    const staff = await staffMember(env, m.merchant.id, "staff");
    expect((await call(env, staff.token, "POST", `${url}/connect`, {})).status).toBe(403);
    const r = await call(env, m.ownerToken, "POST", `${url}/connect`, {});
    expect(r.status).toBe(200);
    expect(r.body.accountId).toMatch(/^acct_fake_/);
    expect(r.body.url).toContain("stripe-onboarding");
    const again = await call(env, m.ownerToken, "POST", `${url}/connect`, {});
    expect(again.body.accountId).toBe(r.body.accountId);
    expect((await call(env, m.ownerToken, "GET", `${url}/status`)).body).toMatchObject({ connected: true, chargesEnabled: false, platformFeeBps: 75, provider: "fake" });
    await call(env, null, "POST", "/v1/payments/fake/simulate", { action: "complete_onboarding", id: r.body.accountId });
    const [row] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
    expect(row).toMatchObject({ stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true });
    const mgr = await staffMember(env, m.merchant.id, "manager");
    expect((await call(env, mgr.token, "GET", `${url}/status`)).body.chargesEnabled).toBe(true);
  });

  it("is not available on Free (no payments, no transaction fees)", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    await setStage(env, PAID_FEATURES, "ga");
    const r = await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/payments/connect`, {});
    expect(r.status).toBe(402);
  });
});

describe("Stripe webhook", () => {
  const secret = "whsec_test_secret_for_unit_tests";
  let stripe: Stripe;

  beforeEach(() => {
    const provider = new StripePayments({ stripe: { secretKey: "sk_test_dummy", webhookSecret: secret, prices: {} } });
    env.ctx.providers.payments = provider;
    stripe = provider.stripe;
  });

  const post = (payload: string, signature?: string) =>
    env.app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) }, payload });
  const signed = (event: object) => {
    const payload = JSON.stringify(event);
    return { payload, signature: stripe.webhooks.generateTestHeaderString({ payload, secret }) };
  };

  it("verifies signatures with the raw body", async () => {
    const { merchant } = await createMerchant(env);
    const event = { id: "evt_sig_1", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_1", object: "checkout.session", mode: "subscription", customer: "cus_1", subscription: "sub_1", metadata: { merchant_id: merchant.id, plan: "pro", interval: "month" } } } };
    const { payload, signature } = signed(event);
    expect((await post(payload)).statusCode).toBe(400);
    const bad = await post(payload, signature.replace(/v1=([0-9a-f])/, (_m, c) => `v1=${c === "0" ? "1" : "0"}`));
    expect(bad.statusCode).toBe(400);
    expect(JSON.parse(bad.body).error.code).toBe("invalid_signature");
    expect((await post(payload.replace('"pro"', '"plus"'), signature)).statusCode).toBe(400); // tampered body
    const wrongSecret = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    expect((await post(payload, wrongSecret)).statusCode).toBe(400);

    const ok = await post(payload, signature);
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body)).toEqual({ received: true, duplicate: false });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, merchant.id));
    expect(m).toMatchObject({ plan: "pro", stripeCustomerId: "cus_1" });
    // Replays are idempotent.
    expect(JSON.parse((await post(payload, signature)).body)).toEqual({ received: true, duplicate: true });
    const logged = await env.db.select().from(webhookEvents).where(eq(webhookEvents.externalId, "evt_sig_1"));
    expect(logged).toHaveLength(1);
    expect(logged[0]!.processedAt).toBeTruthy();
  });

  it("subscription updated/deleted events drive merchants.plan", async () => {
    const { merchant } = await createMerchant(env);
    await env.db.update(merchants).set({ stripeCustomerId: "cus_2" }).where(eq(merchants.id, merchant.id));
    const end = Math.floor(new Date("2026-12-03T15:00:00Z").getTime() / 1000);
    const sub = { id: "sub_2", object: "subscription", customer: "cus_2", status: "active", cancel_at_period_end: false, metadata: {}, items: { data: [{ current_period_end: end, price: { id: "price_x", recurring: { interval: "month" } } }] } };
    const s1 = signed({ id: "evt_sub_1", type: "customer.subscription.created", data: { object: { ...sub, metadata: { plan: "plus" } } } });
    expect((await post(s1.payload, s1.signature)).statusCode).toBe(200);
    let [row] = await env.db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, "sub_2"));
    expect(row).toMatchObject({ plan: "plus", status: "active", currentPeriodEnd: new Date(end * 1000) });
    expect((await env.db.select().from(merchants).where(eq(merchants.id, merchant.id)))[0]!.plan).toBe("plus");

    const s2 = signed({ id: "evt_sub_2", type: "customer.subscription.updated", data: { object: { ...sub, metadata: { plan: "plus" }, cancel_at_period_end: true } } });
    await post(s2.payload, s2.signature);
    [row] = await env.db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, "sub_2"));
    expect(row!.cancelAtPeriodEnd).toBe(true);

    const s3 = signed({ id: "evt_sub_3", type: "customer.subscription.deleted", data: { object: { ...sub, status: "canceled", metadata: { plan: "plus" } } } });
    await post(s3.payload, s3.signature);
    expect((await env.db.select().from(merchants).where(eq(merchants.id, merchant.id)))[0]!.plan).toBe("free");
  });

  it("payment_intent.succeeded marks the order paid; unknown intents are ignored", async () => {
    const m = await paidMerchant(env, { plan: "plus", connect: false });
    await env.db.update(merchants).set({ stripeAccountId: "acct_real_1", stripeChargesEnabled: true }).where(eq(merchants.id, m.merchant.id));
    const c = await customer(env);
    const created = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/catalog/items`, { name: "Bagel", priceCents: 400 });
    // Order created directly (the Stripe client here has a dummy key, so we don't call Stripe's API).
    const [order] = await env.db
      .insert(orders)
      .values({ merchantId: m.merchant.id, locationId: m.location.id, userId: c.user.id, number: 1, subtotalCents: 400, taxCents: 52, totalCents: 452, platformFeeCents: 3, paymentMethod: "in_app", paymentStatus: "requires_action", stripePaymentIntentId: "pi_real_1" })
      .returning();
    expect(created.status).toBe(201);
    const ev = signed({ id: "evt_pi_1", type: "payment_intent.succeeded", data: { object: { id: "pi_real_1", object: "payment_intent", amount: 452, metadata: { ll_kind: "order", ll_id: order!.id, merchant_id: m.merchant.id } } } });
    expect((await post(ev.payload, ev.signature)).statusCode).toBe(200);
    expect((await env.db.select().from(orders).where(eq(orders.id, order!.id)))[0]).toMatchObject({ paymentStatus: "paid" });
    const foreign = signed({ id: "evt_pi_2", type: "payment_intent.succeeded", data: { object: { id: "pi_other", metadata: {} } } });
    expect((await post(foreign.payload, foreign.signature)).statusCode).toBe(200);
    // The dev simulator is unavailable with real Stripe.
    expect((await call(env, null, "POST", "/v1/payments/fake/simulate", { action: "succeed_payment", id: "pi_real_1" })).status).toBe(404);
  });
});
