import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogItems, merchantMembers, merchants, subscriptions } from "@ll/db";
import { getMerchantFeatures } from "../src/services/features.js";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createTestEnv, nextPhone, type TestEnv } from "./helpers.js";
import { PAID_FEATURES, call, setStage, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const simulate = (action: string, id: string) => call(env, null, "POST", "/v1/payments/fake/simulate", { action, id });
const merchantRow = async (id: string) => (await env.db.select().from(merchants).where(eq(merchants.id, id)))[0]!;

describe("billing", () => {
  it("is owner-only", async () => {
    const { merchant } = await createMerchant(env);
    const mgr = await staffMember(env, merchant.id, "manager");
    expect((await call(env, mgr.token, "GET", `/v1/merchants/${merchant.id}/billing`)).status).toBe(403);
    expect((await call(env, null, "GET", `/v1/merchants/${merchant.id}/billing`)).status).toBe(401);
  });

  it("paid plans aren't purchasable until rolled out; Free always is", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const o = await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/billing`);
    expect(o.body.plan).toBe("free");
    expect(Object.fromEntries(o.body.plans.map((p: { id: string; available: boolean }) => [p.id, p.available]))).toEqual({ free: true, plus: false, pro: false });
    const r = await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/billing/checkout`, { plan: "plus" });
    expect(r.status).toBe(402);
    expect(r.body.error).toMatchObject({ code: "feature_locked", details: { reason: "rollout" } });
    await setStage(env, ["orders.order_ahead"], "ga");
    const plans = await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/billing/plans`);
    expect(plans.body.items.find((p: { id: string }) => p.id === "plus")).toMatchObject({ available: true, priceCents: 3900, annualPriceCents: 39000, currency: "CAD", platformFeeBps: 75 });
  });

  it("checkout → webhook sets the plan; cancel at period end; downgrade keeps every bit of loyalty data", async () => {
    const { merchant, ownerToken, reward } = await createMerchant(env);
    await setStage(env, PAID_FEATURES, "ga");
    const phone = nextPhone();
    const earned = await awardPurchase(env.ctx, { merchantId: merchant.id, phone, amountCents: 8000, source: "staff_app" });
    const base = `/v1/merchants/${merchant.id}/billing`;

    expect((await call(env, ownerToken, "POST", `${base}/portal`, {})).status).toBe(409);
    const co = await call(env, ownerToken, "POST", `${base}/checkout`, { plan: "plus", interval: "year" });
    expect(co.status).toBe(200);
    expect(co.body.url).toContain(co.body.sessionId);
    expect((await merchantRow(merchant.id)).stripeCustomerId).toMatch(/^cus_fake_/);

    const done = await simulate("complete_checkout", co.body.sessionId);
    expect(done.body.events.map((e: { type: string }) => e.type)).toEqual(["checkout.session.completed", "customer.subscription.created"]);
    expect((await merchantRow(merchant.id)).plan).toBe("plus");
    const overview = await call(env, ownerToken, "GET", base);
    expect(overview.body.subscription).toMatchObject({ plan: "plus", status: "active", interval: "year", cancelAtPeriodEnd: false });
    expect(overview.body.subscription.currentPeriodEnd).toBe("2027-11-03T15:00:00.000Z");
    expect((await call(env, ownerToken, "POST", `${base}/checkout`, { plan: "pro" })).status).toBe(409);
    expect((await call(env, ownerToken, "POST", `${base}/portal`, {})).body.url).toContain("billing-portal");

    // Use a paid feature while subscribed.
    const item = await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/catalog/items`, { name: "Latte", priceCents: 500 });
    expect(item.status).toBe(201);

    // Cancel at period end: still Plus until Stripe ends it.
    const cancel = await call(env, ownerToken, "POST", `${base}/cancel`);
    expect(cancel.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect((await merchantRow(merchant.id)).plan).toBe("plus");
    expect((await call(env, ownerToken, "POST", `${base}/resume`)).body.subscription.cancelAtPeriodEnd).toBe(false);
    await call(env, ownerToken, "POST", `${base}/downgrade`, {});
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, merchant.id));
    await simulate("end_subscription", sub!.stripeSubscriptionId!);
    const after = await merchantRow(merchant.id);
    expect(after.plan).toBe("free");

    // Free stays free: data intact, loyalty works, only paid features lock.
    const [member] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, earned.member.id));
    expect(member!.balance).toBe(80);
    const again = await awardPurchase(env.ctx, { merchantId: merchant.id, phone, amountCents: 2000, source: "staff_app" });
    expect(again.member.balance).toBe(100);
    const features = await getMerchantFeatures(env.db, after);
    expect(features["loyalty.points"].enabled && features["loyalty.rewards_catalog"].enabled && features["reports.basic"].enabled).toBe(true);
    // Pricing v2: promos are Plus (and hidden at launch), so they lock with the rest.
    expect(features["promos.basic"].enabled).toBe(false);
    expect(features["orders.order_ahead"]).toMatchObject({ enabled: false, lockedReason: "plan" });
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/catalog`)).status).toBe(402);
    expect(await env.db.select().from(catalogItems).where(eq(catalogItems.merchantId, merchant.id))).toHaveLength(1);
    expect(reward.active).toBe(true);
  });

  it("failed renewal keeps the plan (past_due); immediate downgrade drops to Free", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    await setStage(env, PAID_FEATURES, "ga");
    const base = `/v1/merchants/${merchant.id}/billing`;
    const co = await call(env, ownerToken, "POST", `${base}/checkout`, { plan: "pro" });
    await simulate("complete_checkout", co.body.sessionId);
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, merchant.id));
    await simulate("fail_renewal", sub!.stripeSubscriptionId!);
    const [pastDue] = await env.db.select().from(subscriptions).where(eq(subscriptions.id, sub!.id));
    expect(pastDue!.status).toBe("past_due");
    expect((await merchantRow(merchant.id)).plan).toBe("pro");
    const down = await call(env, ownerToken, "POST", `${base}/downgrade`, { immediate: true });
    expect(down.body).toMatchObject({ plan: "free", subscription: { status: "canceled" } });
    expect((await merchantRow(merchant.id)).plan).toBe("free");
    expect((await call(env, ownerToken, "POST", `${base}/cancel`)).status).toBe(409);
  });
});
