import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantCategories, merchantMembers, orders } from "@ll/db";
import { awardPurchase } from "../src/services/ledger.js";
import { awardOrderPoints } from "../src/services/orders.js";
import { computeTax } from "../src/services/tax.js";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { call, customer, deliver, fake, paidMerchant, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

async function menu(m: Awaited<ReturnType<typeof paidMerchant>>) {
  const url = `/v1/merchants/${m.merchant.id}/catalog`;
  const [bakery] = await env.db.insert(merchantCategories).values({ merchantId: m.merchant.id, name: "Bakery" }).returning();
  const latte = (await call(env, m.ownerToken, "POST", `${url}/items`, { name: "Latte", priceCents: 525, modifiers: [{ name: "Size", options: [{ name: "Small", priceCents: 0 }, { name: "Large", priceCents: 75 }] }] })).body;
  const croissant = (await call(env, m.ownerToken, "POST", `${url}/items`, { name: "Croissant", priceCents: 375, categoryId: bakery!.id })).body;
  const lottery = (await call(env, m.ownerToken, "POST", `${url}/items`, { name: "Lotto 6/49", priceCents: 300, categoryId: m.noEarnCategory.id })).body;
  return { latte, croissant, lottery };
}

const memberBalance = async (merchantId: string, userId: string) => {
  const rows = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, userId));
  return rows.find((r) => r.merchantId === merchantId)?.balance ?? 0;
};

describe("payment processing (bank debit in flight)", () => {
  async function placeInApp(key: string) {
    const m = await paidMerchant(env, { plan: "plus" });
    const { latte } = await menu(m);
    const c = await customer(env);
    const placed = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: latte.id, quantity: 1 }], idempotencyKey: key });
    return { m, c, order: placed.body.order, pi: placed.body.payment.paymentIntentId as string };
  }
  const row = async (id: string) => (await env.db.select().from(orders).where(eq(orders.id, id)))[0]!;

  it("marks the order processing without paying it, never charges twice, and pays when the debit clears", async () => {
    const { m, c, order, pi } = await placeInApp("proc-0001");
    expect((await deliver(env, fake(env).processPaymentIntent(pi))).statusCode).toBe(200);
    expect(await row(order.id)).toMatchObject({ paymentStatus: "requires_action", paymentProcessingAt: env.clock.now, paidAt: null });
    // Still out of the kitchen queue, and no new PaymentIntent is created for it: the customer gets the same one back.
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/orders`)).body.items).toHaveLength(0);
    expect((await call(env, c.token, "GET", `/v1/me/orders/${order.id}`)).body.payment?.paymentIntentId ?? pi).toBe(pi);
    expect(fake(env).intents.size).toBe(1);
    // A replayed or second processing event changes nothing.
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    await deliver(env, fake(env).processPaymentIntent(pi));
    expect((await row(order.id)).paymentProcessingAt).toEqual(new Date(env.clock.now.getTime() - 60_000));
    // The debit clears.
    await deliver(env, fake(env).succeedPaymentIntent(pi));
    expect(await row(order.id)).toMatchObject({ paymentStatus: "paid", paymentProcessingAt: null });
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/orders`)).body.items).toHaveLength(1);
  });

  it("a debit that fails after processing reverts the order to failed and clears the marker", async () => {
    const { order, pi } = await placeInApp("proc-0002");
    await deliver(env, fake(env).processPaymentIntent(pi));
    expect((await row(order.id)).paymentProcessingAt).toBeTruthy();
    await deliver(env, fake(env).failPaymentIntent(pi, { code: "account_closed" }));
    expect(await row(order.id)).toMatchObject({ paymentStatus: "failed", paymentProcessingAt: null });
    // A late processing event for an order that already paid does not mark it processing again.
    const paid = await placeInApp("proc-0003");
    await deliver(env, fake(env).succeedPaymentIntent(paid.pi));
    await deliver(env, fake(env).processPaymentIntent(paid.pi));
    expect(await row(paid.order.id)).toMatchObject({ paymentStatus: "paid", paymentProcessingAt: null });
  });
});

describe("tax", () => {
  it("Ontario HST 13% rounds half-up; Quebec stacks GST + QST", () => {
    expect(computeTax(1375, "ON").taxCents).toBe(179);
    expect(computeTax(1000, "QC")).toMatchObject({ taxCents: 150, lines: [{ label: "GST", cents: 50 }, { label: "QST", cents: 100 }] });
    expect(computeTax(1000, "AB").taxCents).toBe(50);
    expect(computeTax(1000, "XX").taxCents).toBe(130); // unknown → ON
  });
});

describe("order-ahead", () => {
  it("prices server-side with modifiers, reward discount (not on no-earn items), HST and tip; ignores client prices", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    const { latte, croissant, lottery } = await menu(m);
    const c = await customer(env);
    await awardPurchase(env.ctx, { merchantId: m.merchant.id, userId: c.user.id, amountCents: 6000, source: "staff_app" }); // 60 pts
    const r = await call(env, c.token, "POST", "/v1/me/orders", {
      merchantId: m.merchant.id,
      locationId: m.location.id,
      items: [
        { catalogItemId: latte.id, quantity: 2, modifiers: [{ name: "size", option: "large" }], priceCents: 1 },
        { catalogItemId: croissant.id, quantity: 1 },
        { catalogItemId: lottery.id, quantity: 1 },
      ],
      tipCents: 200,
      redeemRewardId: m.reward.id,
      totalCents: 1,
      idempotencyKey: "order-key-0001",
    });
    expect(r.status).toBe(201);
    const o = r.body.order;
    // Fee rule (computeFees): Plus is a paid plan, so online orders are 0% commission. This was 13 under the old flat 0.75% (1754 x 0.75%).
    expect(o).toMatchObject({ number: 1, subtotalCents: 1875, discountCents: 500, taxCents: 179, tipCents: 200, totalCents: 1754, platformFeeCents: 0, paymentStatus: "requires_action", paymentMethod: "in_app" });
    expect(o.items[0]).toMatchObject({ unitPriceCents: 600, quantity: 2, modifiers: [{ name: "Size", option: "Large", priceCents: 75 }] });
    expect(r.body.payment).toMatchObject({ amountCents: 1754 });
    expect(fake(env).intents.get(r.body.payment.paymentIntentId)).toMatchObject({ applicationFeeCents: 0, connectedAccountId: m.merchant.stripeAccountId });
    expect(await memberBalance(m.merchant.id, c.user.id)).toBe(10); // 60 - 50 redeemed

    // Retry with the same key → same order, no second redemption.
    const again = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: croissant.id, quantity: 1 }], idempotencyKey: "order-key-0001" });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, order: { id: o.id } });
    expect(again.body.payment.clientSecret).toBe(r.body.payment.clientSecret);
    expect(await memberBalance(m.merchant.id, c.user.id)).toBe(10);
  });

  it("rejects unknown modifiers, unavailable items and in-app pay without Connect", async () => {
    const m = await paidMerchant(env, { plan: "plus", connect: false });
    const { latte, croissant } = await menu(m);
    const c = await customer(env);
    const base = { merchantId: m.merchant.id, locationId: m.location.id };
    expect((await call(env, c.token, "POST", "/v1/me/orders", { ...base, items: [{ catalogItemId: latte.id, quantity: 1, modifiers: [{ name: "Size", option: "Huge" }] }], paymentMethod: "at_pickup", idempotencyKey: "bad-mod-0001" })).status).toBe(400);
    await call(env, m.ownerToken, "PATCH", `/v1/merchants/${m.merchant.id}/catalog/items/${croissant.id}`, { available: false });
    const un = await call(env, c.token, "POST", "/v1/me/orders", { ...base, items: [{ catalogItemId: croissant.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "unavail-0001" });
    expect(un.status).toBe(409);
    expect(un.body.error.code).toBe("item_unavailable");
    const inApp = await call(env, c.token, "POST", "/v1/me/orders", { ...base, items: [{ catalogItemId: latte.id, quantity: 1 }], idempotencyKey: "inapp-0001" });
    expect(inApp.status).toBe(409);
    expect(inApp.body.error.code).toBe("payments_not_set_up");
    const atPickup = await call(env, c.token, "POST", "/v1/me/orders", { ...base, items: [{ catalogItemId: latte.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "pickup-0001" });
    expect(atPickup.status).toBe(201);
    expect(atPickup.body.order).toMatchObject({ platformFeeCents: 0, paymentStatus: "unpaid", totalCents: 593 });
    expect(atPickup.body.payment).toBeNull();
  });

  it("full lifecycle: pay via webhook → accept → ready (push + SMS) → picked up awards points once", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    const { latte, croissant, lottery } = await menu(m);
    const c = await customer(env);
    const placed = await call(env, c.token, "POST", "/v1/me/orders", {
      merchantId: m.merchant.id,
      locationId: m.location.id,
      items: [{ catalogItemId: latte.id, quantity: 2 }, { catalogItemId: croissant.id, quantity: 1 }, { catalogItemId: lottery.id, quantity: 1 }],
      idempotencyKey: "life-0001",
    });
    const order = placed.body.order;
    const base = `/v1/merchants/${m.merchant.id}/orders`;

    // Unpaid in-app orders stay out of the queue and can't be accepted.
    expect((await call(env, m.ownerToken, "GET", base)).body.items).toHaveLength(0);
    const early = await call(env, m.ownerToken, "POST", `${base}/${order.id}/status`, { status: "accepted" });
    expect(early.body.error.code).toBe("awaiting_payment");

    const ev = fake(env).succeedPaymentIntent(placed.body.payment.paymentIntentId);
    expect((await deliver(env, ev)).statusCode).toBe(200);
    const dup = await deliver(env, ev);
    expect(JSON.parse(dup.body)).toMatchObject({ duplicate: true });

    const queue = await call(env, m.ownerToken, "GET", base);
    expect(queue.body.items.map((o: { id: string }) => o.id)).toEqual([order.id]);
    expect(queue.body.items[0]).toMatchObject({ paymentStatus: "paid", customer: { name: "Casey Customer" } });

    const counter = await staffMember(env, m.merchant.id, "staff");
    for (const status of ["accepted", "preparing"]) {
      expect((await call(env, counter.token, "POST", `${base}/${order.id}/status`, { status })).body.status).toBe(status);
    }
    const sms0 = env.ctx.providers.outbox.sms.length;
    const ready = await call(env, counter.token, "POST", `${base}/${order.id}/status`, { status: "ready" });
    expect(ready.body.readyAt).toBeTruthy();
    expect(env.ctx.providers.outbox.sms.slice(sms0)).toEqual([expect.objectContaining({ to: c.user.phone, body: "Your order #1 is ready for pickup at Test Shop" })]);
    expect(env.ctx.providers.outbox.push.at(-1)).toMatchObject({ title: "Order #1 is ready", body: "Your order #1 is ready for pickup at Test Shop" });

    const done = await call(env, counter.token, "POST", `${base}/${order.id}/status`, { status: "picked_up" });
    // Latte 1050 + croissant 375 eligible = $14.25 → 14 pts; lottery excluded.
    expect(done.body).toMatchObject({ status: "picked_up", pointsEarned: 14 });
    expect(await memberBalance(m.merchant.id, c.user.id)).toBe(14);
    expect((await call(env, counter.token, "POST", `${base}/${order.id}/status`, { status: "picked_up" })).status).toBe(409);
    const [row] = await env.db.select().from(orders).where(eq(orders.id, order.id));
    await awardOrderPoints(env.ctx, row!); // retried award is a no-op
    expect(await memberBalance(m.merchant.id, c.user.id)).toBe(14);

    const mine = await call(env, c.token, "GET", "/v1/me/orders");
    expect(mine.body.items[0]).toMatchObject({ id: order.id, status: "picked_up", merchantName: "Test Shop", pointsEarned: 14 });
    const other = await customer(env);
    expect((await call(env, other.token, "GET", `/v1/me/orders/${order.id}`)).status).toBe(404);

    // Refund (manager+): money back, earned points reversed.
    expect((await call(env, counter.token, "POST", `${base}/${order.id}/refund`, { reason: "Cold" })).status).toBe(403);
    const refunded = await call(env, m.ownerToken, "POST", `${base}/${order.id}/refund`, { reason: "Cold coffee" });
    expect(refunded.body).toMatchObject({ status: "refunded", paymentStatus: "refunded" });
    expect(fake(env).refunds).toHaveLength(1);
    expect(await memberBalance(m.merchant.id, c.user.id)).toBe(0);
  });

  it("cancelling a paid order refunds it and returns redeemed points; numbers are per merchant", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    const { latte } = await menu(m);
    const c = await customer(env);
    await awardPurchase(env.ctx, { merchantId: m.merchant.id, userId: c.user.id, amountCents: 5000, source: "staff_app" });
    const placed = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: latte.id, quantity: 2 }], redeemRewardId: m.reward.id, idempotencyKey: "cancel-0001" });
    expect(placed.body.order.discountCents).toBe(500);
    expect(await memberBalance(m.merchant.id, c.user.id)).toBe(0);
    await deliver(env, fake(env).succeedPaymentIntent(placed.body.payment.paymentIntentId));
    const base = `/v1/merchants/${m.merchant.id}/orders/${placed.body.order.id}/status`;
    expect((await call(env, m.ownerToken, "POST", base, { status: "cancelled" })).status).toBe(400); // reason required
    const r = await call(env, m.ownerToken, "POST", base, { status: "cancelled", reason: "Out of milk" });
    expect(r.body).toMatchObject({ status: "cancelled", paymentStatus: "refunded", cancelReason: "Out of milk" });
    expect(await memberBalance(m.merchant.id, c.user.id)).toBe(50);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("Out of milk");

    // A second order gets #2; a different merchant starts at #1.
    const second = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: latte.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "cancel-0002" });
    expect(second.body.order.number).toBe(2);
    const m2 = await paidMerchant(env, { plan: "plus" });
    const menu2 = await menu(m2);
    const third = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m2.merchant.id, locationId: m2.location.id, items: [{ catalogItemId: menu2.latte.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "cancel-0003" });
    expect(third.body.order.number).toBe(1);

    // Customer can cancel while pending; not after it's accepted.
    expect((await call(env, c.token, "POST", `/v1/me/orders/${second.body.order.id}/cancel`, {})).body.status).toBe("cancelled");
    await call(env, m2.ownerToken, "POST", `/v1/merchants/${m2.merchant.id}/orders/${third.body.order.id}/status`, { status: "accepted" });
    expect((await call(env, c.token, "POST", `/v1/me/orders/${third.body.order.id}/cancel`, {})).status).toBe(409);
  });

  it("pay-at-pickup orders become paid on pickup with no platform fee", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    const { croissant } = await menu(m);
    const c = await customer(env, { pushToken: false });
    const placed = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: croissant.id, quantity: 4 }], paymentMethod: "at_pickup", idempotencyKey: "atpickup-0001" });
    const base = `/v1/merchants/${m.merchant.id}/orders/${placed.body.order.id}/status`;
    await call(env, m.ownerToken, "POST", base, { status: "accepted" });
    await call(env, m.ownerToken, "POST", base, { status: "ready" });
    const done = await call(env, m.ownerToken, "POST", base, { status: "picked_up" });
    expect(done.body).toMatchObject({ paymentStatus: "paid", platformFeeCents: 0, pointsEarned: 15 });
  });
});
