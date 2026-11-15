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

  it("free plan is locked (402 plan) once rolled out; Studio unlocks order-ahead but not Service", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    await setStage(env, PAID_FEATURES, "ga");
    const r = await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/catalog`);
    expect(r.status).toBe(402);
    expect(r.body.error.details.reason).toBe("plan");
    // Order-ahead is Studio's (pro-value.md §2.2): Pro does not open it.
    await setPlan(env, merchant.id, "plus");
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/catalog`)).status).toBe(402);
    await setPlan(env, merchant.id, "studio");
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/catalog`)).status).toBe(200);
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/tickets`)).status).toBe(402);
  });

  it("beta stage only for opted-in merchants", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "studio", stage: "beta" });
    expect((await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/catalog`)).status).toBe(402);
  });
});

describe("catalog", () => {
  it("managers manage the catalog; plain staff can't; unauthenticated is 401", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "studio" });
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

  it("a partial update keeps every field it did not send", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "studio" });
    const url = `/v1/merchants/${merchant.id}/catalog/items`;
    const created = await call(env, ownerToken, "POST", url, item);
    // Selling out must not wipe the dish's choices.
    const off = await call(env, ownerToken, "PATCH", `${url}/${created.body.id}`, { orderable: false, available: false });
    expect(off.body).toMatchObject({ orderable: false, available: false });
    expect(off.body.modifiers).toEqual(item.modifiers);
    // Editing only the description must not put a sold-out dish back on sale.
    const desc = await call(env, ownerToken, "PATCH", `${url}/${created.body.id}`, { description: "Double shot" });
    expect(desc.body).toMatchObject({ description: "Double shot", orderable: false, available: false });
    expect(desc.body.modifiers).toEqual(item.modifiers);
    // Sending the field still changes it, and an empty list clears the choices.
    const clear = await call(env, ownerToken, "PATCH", `${url}/${created.body.id}`, { modifiers: [], orderable: true, available: true });
    expect(clear.body).toMatchObject({ modifiers: [], orderable: true, available: true });
  });

  it("menu sections: no duplicate names, rename, and delete moves the dishes to no section", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "studio" });
    const base = `/v1/merchants/${merchant.id}/catalog`;
    const food = await call(env, ownerToken, "POST", `${base}/categories`, { name: "Food" });
    expect(food.status).toBe(201);
    const dup = await call(env, ownerToken, "POST", `${base}/categories`, { name: " food " });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe("You already have a Food section");
    const drinks = await call(env, ownerToken, "POST", `${base}/categories`, { name: "Drinks" });
    expect((await call(env, ownerToken, "PATCH", `${base}/categories/${drinks.body.id}`, { name: "FOOD" })).status).toBe(409);
    expect((await call(env, ownerToken, "PATCH", `${base}/categories/${drinks.body.id}`, { name: "Cold drinks" })).body.name).toBe("Cold drinks");
    const dish = await call(env, ownerToken, "POST", `${base}/items`, { name: "Samosa", priceCents: 300, categoryId: food.body.id });
    expect((await call(env, ownerToken, "DELETE", `${base}/categories/${food.body.id}`)).status).toBe(200);
    const cat = await call(env, ownerToken, "GET", base);
    const names = cat.body.categories.map((c: { name: string }) => c.name);
    expect(names).toContain("Cold drinks");
    expect(names).not.toContain("Food");
    expect(cat.body.items.find((i: { id: string }) => i.id === dish.body.id).categoryId).toBeNull();
  });

  it("rejects duplicate modifier groups and foreign categories", async () => {
    const a = await paidMerchant(env, { plan: "studio" });
    const b = await paidMerchant(env, { plan: "studio" });
    const dup = await call(env, a.ownerToken, "POST", `/v1/merchants/${a.merchant.id}/catalog/items`, { ...item, modifiers: [item.modifiers[0], item.modifiers[0]] });
    expect(dup.status).toBe(400);
    const foreign = await call(env, a.ownerToken, "POST", `/v1/merchants/${a.merchant.id}/catalog/items`, { ...item, categoryId: b.noEarnCategory.id });
    expect(foreign.status).toBe(400);
  });

  it("public menu lists only orderable items with tax info", async () => {
    const { merchant, ownerToken } = await paidMerchant(env, { plan: "studio" });
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
