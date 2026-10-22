import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantStaff, merchants, messageDeliveries, orders } from "@ll/db";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { call, customer, deliver, fake, paidMerchant, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

type M = Awaited<ReturnType<typeof paidMerchant>>;

async function kitchen(tier: "starter" | "growth" | "pro" = "pro") {
  const m = await paidMerchant(env, { plan: "free" });
  await env.db.update(merchants).set({ restaurantTier: tier }).where(eq(merchants.id, m.merchant.id));
  const url = `/v1/merchants/${m.merchant.id}/catalog/items`;
  const mk = async (body: object) => (await call(env, m.ownerToken, "POST", url, body)).body;
  const biryani = await mk({ name: "Chicken biryani", priceCents: 1600, ...(tier === "pro" ? { station: "curry", translations: { hi: { name: "चिकन बिरयानी" } } } : {}) });
  const tikka = await mk({ name: "Seekh kebab", priceCents: 1400, ...(tier === "pro" ? { station: "tandoor", translations: { hi: { name: "सीख कबाब" }, pa: { name: "ਸੀਖ ਕਬਾਬ" } } } : {}) });
  const chai = await mk({ name: "Masala chai", priceCents: 400 });
  return { m, biryani, tikka, chai };
}

const placeAtPickup = (m: M, token: string, items: { id: string; quantity?: number }[], key: string) =>
  call(env, token, "POST", "/v1/me/orders", {
    merchantId: m.merchant.id,
    locationId: m.location.id,
    items: items.map((i) => ({ catalogItemId: i.id, quantity: i.quantity ?? 1 })),
    paymentMethod: "at_pickup",
    idempotencyKey: key,
  });

const tickets = (m: M, token: string, q = "") => call(env, token, "GET", `/v1/merchants/${m.merchant.id}/kitchen/tickets${q}`);

describe("kitchen display", () => {
  it("fires tickets, routes by station and speaks the cook's language", async () => {
    const { m, biryani, tikka, chai } = await kitchen();
    const c = await customer(env);
    const placed = await placeAtPickup(m, c.token, [{ id: biryani.id, quantity: 2 }, { id: tikka.id }, { id: chai.id }], "kds-key-00001");
    expect(placed.status).toBe(201);
    expect(placed.body.order.firedAt).toBeTruthy();
    expect(placed.body.order.bumpedAt).toBeNull();

    // Owner (no station) sees everything, in English.
    const all = await tickets(m, m.ownerToken);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ station: null, lang: "en", stations: ["curry", "tandoor"] });
    expect(all.body.items).toHaveLength(1);
    expect(all.body.items[0].items.map((i: { name: string }) => i.name)).toEqual(expect.arrayContaining(["Chicken biryani", "Seekh kebab", "Masala chai"]));

    // A tandoor cook working in Hindi: own station by default, plus unrouted items; names translated.
    const cook = await staffMember(env, m.merchant.id, "staff");
    await env.db.update(merchantStaff).set({ station: "tandoor", locale: "hi" }).where(eq(merchantStaff.userId, cook.user.id));
    const mine = await tickets(m, cook.token);
    expect(mine.body).toMatchObject({ station: "tandoor", lang: "hi" });
    expect(mine.body.items[0].items.map((i: { name: string; nameEn: string }) => [i.name, i.nameEn])).toEqual(
      expect.arrayContaining([["सीख कबाब", "Seekh kebab"], ["Masala chai", "Masala chai"]]),
    );
    expect(mine.body.items[0].items.some((i: { nameEn: string }) => i.nameEn === "Chicken biryani")).toBe(false);
    // Punjabi override; stations can be switched or widened.
    expect((await tickets(m, cook.token, "?lang=pa")).body.items[0].items.find((i: { nameEn: string }) => i.nameEn === "Seekh kebab").name).toBe("ਸੀਖ ਕਬਾਬ");
    expect((await tickets(m, cook.token, "?station=curry")).body.items[0].items.map((i: { nameEn: string }) => i.nameEn)).not.toContain("Seekh kebab");
    expect((await tickets(m, cook.token, "?station=all")).body.items[0].items).toHaveLength(3);
    // A station with nothing to cook sees no ticket.
    expect((await tickets(m, cook.token, "?station=chai")).body.items[0]?.items.map((i: { nameEn: string }) => i.nameEn) ?? []).toEqual(["Masala chai"]);

    // Anonymous / outsiders.
    expect((await tickets(m, null as unknown as string)).status).toBe(401);
    const outsider = await customer(env);
    expect((await tickets(m, outsider.token)).status).toBe(403);
  });

  it("moves items queued → cooking → ready, then bumps and recalls", async () => {
    const { m, biryani, tikka } = await kitchen();
    const c = await customer(env);
    const placed = await placeAtPickup(m, c.token, [{ id: biryani.id }, { id: tikka.id }], "kds-key-00002");
    const orderId = placed.body.order.id;
    const t = (await tickets(m, m.ownerToken)).body.items[0];
    const dish = t.items.find((i: { nameEn: string }) => i.nameEn === "Chicken biryani");
    const itemUrl = `/v1/merchants/${m.merchant.id}/kitchen/items/${dish.id}`;

    expect(dish.status).toBe("queued");
    expect((await call(env, m.ownerToken, "PATCH", itemUrl, { status: "ready" })).status).toBe(409); // can't skip cooking
    const cooking = await call(env, m.ownerToken, "PATCH", itemUrl, { status: "cooking" });
    expect(cooking.body.items.find((i: { id: string }) => i.id === dish.id).status).toBe("cooking");
    expect((await call(env, m.ownerToken, "PATCH", itemUrl, { status: "ready" })).body.items.find((i: { id: string }) => i.id === dish.id).status).toBe("ready");
    expect((await call(env, m.ownerToken, "PATCH", itemUrl, { status: "bogus" })).status).toBe(400);
    expect((await call(env, m.ownerToken, "PATCH", `/v1/merchants/${m.merchant.id}/kitchen/items/00000000-0000-4000-8000-000000000000`, { status: "cooking" })).status).toBe(404);

    // Bump: the ticket leaves the screen, the order is ready and the customer is told.
    const bump = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/${orderId}/bump`);
    expect(bump.status).toBe(200);
    expect(bump.body.bumpedAt).toBeTruthy();
    expect(bump.body.items.every((i: { status: string }) => i.status === "ready")).toBe(true);
    const [o] = await env.db.select().from(orders).where(eq(orders.id, orderId));
    expect(o).toMatchObject({ status: "ready" });
    expect(o!.readyAt).toBeTruthy();
    expect(o!.bumpedAt).toBeTruthy();
    const sent = await env.db.select().from(messageDeliveries).where(eq(messageDeliveries.userId, c.user.id));
    expect(sent.some((d) => d.body.includes("is ready"))).toBe(true);
    expect((await tickets(m, m.ownerToken)).body.items).toHaveLength(0);
    expect((await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/${orderId}/bump`)).status).toBe(409);

    // Recall: back on the screen, order back to preparing.
    const recall = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/${orderId}/recall`);
    expect(recall.status).toBe(200);
    expect(recall.body.bumpedAt).toBeNull();
    expect((await call(env, c.token, "GET", `/v1/me/orders/${orderId}`)).body.status).toBe("preparing");
    expect((await tickets(m, m.ownerToken)).body.items).toHaveLength(1);
    expect((await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/${orderId}/recall`)).status).toBe(409);

    // Picked-up orders can't be recalled.
    await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/${orderId}/bump`);
    await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/orders/${orderId}/status`, { status: "picked_up" });
    expect((await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/${orderId}/recall`)).status).toBe(409);
  });

  it("fires card orders only once they're paid, and counter orders straight away", async () => {
    const { m, biryani } = await kitchen();
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: biryani.id, quantity: 1 }], idempotencyKey: "kds-key-00003" });
    expect(r.body.order.firedAt).toBeNull();
    expect((await tickets(m, m.ownerToken)).body.items).toHaveLength(0);
    await deliver(env, fake(env).succeedPaymentIntent(r.body.payment.paymentIntentId));
    const after = (await tickets(m, m.ownerToken)).body.items;
    expect(after).toHaveLength(1);
    expect(after[0].orderId).toBe(r.body.order.id);

    const counter = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/orders/counter`, { items: [{ catalogItemId: biryani.id, quantity: 1 }], tender: "cash" });
    expect(counter.status).toBe(201);
    expect(counter.body).toMatchObject({ channel: "counter", paymentStatus: "paid" });
    expect(counter.body.firedAt).toBeTruthy();
    const queue = (await tickets(m, m.ownerToken)).body.items;
    expect(queue.map((x: { orderId: string }) => x.orderId)).toEqual([r.body.order.id, counter.body.id]);
    // Counter sales under the cashier's name earn nobody points.
    await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/${counter.body.id}/bump`);
    const done = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/orders/${counter.body.id}/status`, { status: "picked_up" });
    expect(done.body).toMatchObject({ status: "picked_up", pointsEarned: 0 });
  });

  it("pre-orders fire on demand (pickup day), not when placed", async () => {
    const { m } = await kitchen();
    const pot = (await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/catalog/items`, { name: "Haleem degh", priceCents: 12000, preorderOnly: true, leadTimeHours: 12, station: "curry" })).body;
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, kind: "preorder", pickupAt: "2026-11-05T22:00:00.000Z", paymentMethod: "at_pickup", items: [{ catalogItemId: pot.id, quantity: 1 }], idempotencyKey: "kds-key-00004" });
    expect(r.status).toBe(201);
    expect(r.body.order.firedAt).toBeNull();
    const fire = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/${r.body.order.id}/fire`);
    expect(fire.status).toBe(200);
    expect(fire.body).toMatchObject({ kind: "preorder", items: [{ nameEn: "Haleem degh", station: "curry" }] });
  });

  it("is a Pro feature", async () => {
    const { m, biryani } = await kitchen("growth");
    expect((await tickets(m, m.ownerToken)).status).toBe(402);
    expect((await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/kitchen/orders/00000000-0000-4000-8000-000000000000/bump`)).status).toBe(402);
    // Without KDS an order is placed but no ticket is fired.
    const c = await customer(env);
    const placed = await placeAtPickup(m, c.token, [{ id: biryani.id }], "kds-key-00005");
    expect(placed.status).toBe(201);
    expect(placed.body.order.firedAt).toBeNull();
    // Staff on the counter still work the normal order queue.
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/orders`)).status).toBe(200);
  });
});
