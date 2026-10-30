import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { merchantAddOns, merchants, subscriptions } from "@ll/db";
import { ADD_ONS, PLANS, RESTAURANT_PLANS } from "@ll/shared";
import { addOnMrrCents } from "../src/services/admin-ops.js";
import { createMerchant, createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());
const get = async (url: string, token: string) => (await env.app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } })).json();

describe("add-on pricing in MRR", () => {
  it("prices packs, quantities and yearly billing", () => {
    expect(addOnMrrCents("whatsapp_1000", 1, "month")).toBe(ADD_ONS.whatsapp_1000.priceCents);
    expect(addOnMrrCents("extra_location", 3, "month")).toBe(3 * ADD_ONS.extra_location.priceCents);
    // Yearly pays ten months up front: a twelfth of that each month.
    expect(addOnMrrCents("banquet_module", 1, "year")).toBe(Math.round((ADD_ONS.banquet_module.priceCents * 10) / 12));
    expect(addOnMrrCents("nope", 1, "month")).toBe(0);
  });
});

describe("founder Today: MRR includes add-ons and restaurant tiers, and shows the split", () => {
  it("adds add-ons on paying shops, splits plans / restaurant / WhatsApp / locations / other, ignores trials and cancelled add-ons", async () => {
    const admin = await createUser(env.db, { platformRole: "admin" });
    const token = await tokenFor(env, admin);

    const plus = await createMerchant(env);
    const resto = await createMerchant(env);
    const yearly = await createMerchant(env);
    const trial = await createMerchant(env);
    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, plus.merchant.id));
    await env.db.insert(subscriptions).values([
      { merchantId: plus.merchant.id, plan: "plus", status: "active", interval: "month" },
      { merchantId: resto.merchant.id, plan: "free", restaurantTier: "growth", status: "active", interval: "month" },
      { merchantId: yearly.merchant.id, plan: "free", restaurantTier: "starter", status: "active", interval: "year" },
      { merchantId: trial.merchant.id, plan: "free", restaurantTier: "growth", status: "trialing", interval: "month" },
    ]);
    await env.db.insert(merchantAddOns).values([
      { merchantId: resto.merchant.id, addOnId: "whatsapp_1000", quantity: 2, status: "active" },
      { merchantId: resto.merchant.id, addOnId: "extra_location", quantity: 2, status: "active" },
      { merchantId: resto.merchant.id, addOnId: "banquet_module", quantity: 1, status: "cancelled" },
      { merchantId: yearly.merchant.id, addOnId: "phone_ai", quantity: 1, status: "active" },
      { merchantId: trial.merchant.id, addOnId: "extra_location", quantity: 1, status: "active" },
      { merchantId: plus.merchant.id, addOnId: "whatsapp_1000", quantity: 1, status: "active" },
    ]);

    const wa = ADD_ONS.whatsapp_1000.priceCents;
    const loc = ADD_ONS.extra_location.priceCents;
    const phone = Math.round((ADD_ONS.phone_ai.priceCents * 10) / 12);
    const plansCents = PLANS.plus.priceCents;
    const restaurantCents = RESTAURANT_PLANS.growth.priceCents + Math.round(RESTAURANT_PLANS.starter.annualPriceCents / 12);
    const expected = { plansCents, restaurantCents, whatsappCents: 3 * wa, extraLocationsCents: 2 * loc, otherAddOnsCents: phone };

    const o = await get("/v1/admin/overview", token);
    expect(o.money.mrrSplit).toEqual(expected);
    expect(o.money.mrrCents).toBe(Object.values(expected).reduce((a, b) => a + b, 0));
    expect(o.money.payingShops).toBe(3);
    expect(o.money.byPlan).toEqual({ plus: 1, studio: 0, pro: 0, restaurant: 2 });

    // One shop's money view and the costs table agree with the overview.
    const money = await get(`/v1/admin/merchants/${resto.merchant.id}/money`, token);
    expect(money.mrrSplit).toEqual({ subscriptionCents: RESTAURANT_PLANS.growth.priceCents, addOnCents: 2 * wa + 2 * loc });
    expect(money.mrrCents).toBe(RESTAURANT_PLANS.growth.priceCents + 2 * wa + 2 * loc);
    const costs = await get("/v1/admin/costs", token);
    expect(costs.totals.subscriptionCents).toBe(o.money.mrrCents);
    const row = costs.shops.find((s: { merchantId: string }) => s.merchantId === resto.merchant.id);
    expect(row.subscriptionCents).toBe(money.mrrCents);
  });

  it("founding restaurants pay half in year one on the tier; add-ons are full price", async () => {
    const admin = await createUser(env.db, { platformRole: "admin" });
    const m = await createMerchant(env);
    await env.db.update(merchants).set({ foundingOffer: true }).where(eq(merchants.id, m.merchant.id));
    await env.db.insert(subscriptions).values({ merchantId: m.merchant.id, plan: "free", restaurantTier: "growth", status: "active", interval: "month" });
    await env.db.insert(merchantAddOns).values({ merchantId: m.merchant.id, addOnId: "extra_location", quantity: 1, status: "active" });
    const o = await get("/v1/admin/overview", await tokenFor(env, admin));
    expect(o.money.mrrSplit.restaurantCents).toBe(Math.round(RESTAURANT_PLANS.growth.priceCents / 2));
    expect(o.money.mrrSplit.extraLocationsCents).toBe(ADD_ONS.extra_location.priceCents);
  });
});
