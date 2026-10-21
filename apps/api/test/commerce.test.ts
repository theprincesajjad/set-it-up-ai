import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMerchant, createTestEnv, type TestEnv } from "./helpers.js";
import { PAID_FEATURES, call, customer, paidMerchant, setPlan, setStage, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const item = { name: "Latte", priceCents: 525, modifiers: [{ name: "Size", options: [{ name: "Small", priceCents: 0 }, { name: "Large", priceCents: 75 }] }] };

describe("commerce gating", () => {
  it("hidden rollout locks paid features even on Pro (402 rollout)", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "pro", stage: "hidden" });
    const r = await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/catalog/items`, item);
    expect(r.status).toBe(402);
    expect(r.body.error).toMatchObject({ code: "feature_locked", details: { reason: "rollout" } });
    const t = await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/tickets`);
    expect(t.status).toBe(402);
    const menu = await call(env, null, "GET", `/v1/public/shops/${merchant.slug}/menu`);
    expect(menu.status).toBe(402);
  });

  it("free plan is locked (402 plan) once rolled out; Plus unlocks order-ahead but not Pro service", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    await setStage(env, PAID_FEATURES, "ga");
    const r = await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/catalog`);
    expect(r.status).toBe(402);
    expect(r.body.error.details.reason).toBe("plan");
    await setPlan(env, merchant.id, "plus");
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/catalog`)).status).toBe(200);
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/tickets`)).status).toBe(402);
  });

  it("beta stage only for opted-in merchants", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "plus", stage: "beta" });
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/catalog`)).status).toBe(402);
  });
});

describe("catalog", () => {
  it("managers manage the catalog; plain staff can't; unauthenticated is 401", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "plus" });
    const cat = await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/catalog/categories`, { name: "Drinks" });
    expect(cat.status).toBe(201);
    const created = await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/catalog/items`, { ...item, categoryId: cat.body.id });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Latte", priceCents: 525, categoryId: cat.body.id });

    const staff = await staffMember(env, merchant.id, "staff");
    expect((await call(env, staff.token, "POST", `/v1/merchants/${merchant.id}/catalog/items`, item)).status).toBe(403);
    expect((await call(env, staff.token, "GET", `/v1/merchants/${merchant.id}/catalog`)).status).toBe(200);
    expect((await call(env, null, "GET", `/v1/merchants/${merchant.id}/catalog`)).status).toBe(401);

    const upd = await call(env, ownerToken, "PATCH", `/v1/merchants/${merchant.id}/catalog/items/${created.body.id}`, { priceCents: 550 });
    expect(upd.body.priceCents).toBe(550);
    const del = await call(env, ownerToken, "DELETE", `/v1/merchants/${merchant.id}/catalog/items/${created.body.id}`);
    expect(del.body).toMatchObject({ available: false, orderable: false });
  });

  it("rejects duplicate modifier groups and foreign categories", async () => {
    const a = await paidMerchant(env, { plan: "plus" });
    const b = await paidMerchant(env, { plan: "plus" });
    const dup = await call(env, a.ownerToken, "POST", `/v1/merchants/${a.merchant.id}/catalog/items`, { ...item, modifiers: [item.modifiers[0], item.modifiers[0]] });
    expect(dup.status).toBe(400);
    const foreign = await call(env, a.ownerToken, "POST", `/v1/merchants/${a.merchant.id}/catalog/items`, { ...item, categoryId: b.noEarnCategory.id });
    expect(foreign.status).toBe(400);
  });

  it("public menu lists only orderable items with tax info", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "plus" });
    await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/catalog/items`, item);
    await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/catalog/items`, { name: "Secret", priceCents: 100, orderable: false });
    const r = await call(env, null, "GET", `/v1/public/shops/${merchant.slug}/menu`);
    expect(r.status).toBe(200);
    expect(r.body.uncategorized.map((i: { name: string }) => i.name)).toEqual(["Latte"]);
    expect(r.body.tax).toMatchObject({ province: "ON", ratePpm: 130000, label: "HST 13%" });
    expect(r.body.payInApp).toBe(true);
    expect(r.body.pickupSlots).toBe(true);
    expect((await call(env, null, "GET", `/v1/public/shops/nope/menu`)).status).toBe(404);
  });
});

describe("cross-merchant isolation", () => {
  it("staff of one merchant can't read or modify another's catalog, orders or tickets", async () => {
    const a = await paidMerchant(env);
    const b = await paidMerchant(env);
    const it1 = await call(env, a.ownerToken, "POST", `/v1/merchants/${a.merchant.id}/catalog/items`, item);
    expect((await call(env, b.ownerToken, "GET", `/v1/merchants/${a.merchant.id}/orders`)).status).toBe(403);
    expect((await call(env, b.ownerToken, "PATCH", `/v1/merchants/${b.merchant.id}/catalog/items/${it1.body.id}`, { priceCents: 1 })).status).toBe(404);
    // An order at B can't include A's items.
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/orders", {
      merchantId: b.merchant.id,
      locationId: b.location.id,
      items: [{ catalogItemId: it1.body.id, quantity: 1 }],
      paymentMethod: "at_pickup",
      idempotencyKey: "iso-test-0001",
    });
    expect(r.status).toBe(400);
    // Or A's location.
    const r2 = await call(env, c.token, "POST", "/v1/me/orders", {
      merchantId: a.merchant.id,
      locationId: b.location.id,
      items: [{ catalogItemId: it1.body.id, quantity: 1 }],
      paymentMethod: "at_pickup",
      idempotencyKey: "iso-test-0002",
    });
    expect(r2.status).toBe(400);
  });
});
