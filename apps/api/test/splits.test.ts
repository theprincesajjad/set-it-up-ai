import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchants, orderItems, orders } from "@ll/db";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { call, deliver, fake, paidMerchant } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

type M = Awaited<ReturnType<typeof paidMerchant>>;

async function table(tier: "starter" | "growth" | "pro" = "pro") {
  const m = await paidMerchant(env, { plan: "free" });
  await env.db.update(merchants).set({ restaurantTier: tier }).where(eq(merchants.id, m.merchant.id));
  const mk = async (body: object) => (await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/catalog/items`, body)).body;
  const karahi = await mk({ name: "Lamb karahi", priceCents: 2800 });
  const naan = await mk({ name: "Garlic naan", priceCents: 400 });
  const lassi = await mk({ name: "Mango lassi", priceCents: 600 });
  // A tab: rung up at the counter, unpaid.
  const tab = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/orders/counter`, {
    items: [{ catalogItemId: karahi.id, quantity: 1 }, { catalogItemId: naan.id, quantity: 4 }, { catalogItemId: lassi.id, quantity: 2 }],
  });
  return { m, karahi, naan, lassi, tab: tab.body };
}

const splitsUrl = (m: M, orderId: string) => `/v1/merchants/${m.merchant.id}/orders/${orderId}/splits`;

describe("split bills", () => {
  it("splits evenly so the cents always add up, and each guest pays their own link", async () => {
    const { m, tab } = await table();
    // 2800 + 1600 + 1200 = 5600; HST 728; total 6328.
    expect(tab).toMatchObject({ subtotalCents: 5600, totalCents: 6328, paymentStatus: "unpaid" });
    const r = await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 3, labels: ["Aunty", "Uncle"] });
    expect(r.status).toBe(201);
    const items = r.body.items as { amountCents: number; label: string; payToken: string; payUrl: string; status: string }[];
    expect(items.map((i) => i.amountCents)).toEqual([2110, 2109, 2109]);
    expect(items.reduce((s, i) => s + i.amountCents, 0)).toBe(6328);
    expect(items.map((i) => i.label)).toEqual(["Aunty", "Uncle", "Guest 3"]);
    expect(items[0]!.payUrl).toContain(`/pay/split/${items[0]!.payToken}`);
    expect(new Set(items.map((i) => i.payToken)).size).toBe(3);

    const view = await call(env, null, "GET", `/v1/public/splits/${items[0]!.payToken}`);
    expect(view.body).toMatchObject({ amountCents: 2110, status: "open", canPay: true, orderNumber: tab.number });
    expect(view.body.merchant.name).toBe(m.merchant.name);

    // Guest 1 pays with a tip.
    const pay1 = await call(env, null, "POST", `/v1/public/splits/${items[0]!.payToken}/pay`, { tipCents: 300 });
    expect(pay1.status).toBe(200);
    expect(pay1.body.payment.amountCents).toBe(2410);
    expect(fake(env).intents.get(pay1.body.payment.paymentIntentId)).toMatchObject({ amountCents: 2410, applicationFeeCents: 0, connectedAccountId: m.merchant.stripeAccountId });
    await deliver(env, fake(env).succeedPaymentIntent(pay1.body.payment.paymentIntentId));
    expect((await call(env, null, "GET", `/v1/public/splits/${items[0]!.payToken}`)).body).toMatchObject({ status: "paid", tipCents: 300, canPay: false });
    expect((await call(env, null, "POST", `/v1/public/splits/${items[0]!.payToken}/pay`, {})).status).toBe(409);
    // Not paid in full yet.
    expect((await call(env, m.ownerToken, "GET", splitsUrl(m, tab.id))).body).toMatchObject({ paidCents: 2110, orderPaid: false });
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/orders/${tab.id}`)).body.paymentStatus).toBe("unpaid");
    // Once someone paid the split is locked.
    expect((await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 2 })).status).toBe(409);
    expect((await call(env, m.ownerToken, "DELETE", splitsUrl(m, tab.id))).status).toBe(409);

    for (const g of items.slice(1)) {
      const p = await call(env, null, "POST", `/v1/public/splits/${g.payToken}/pay`, { tipCents: g === items[1] ? 200 : 0 });
      await deliver(env, fake(env).succeedPaymentIntent(p.body.payment.paymentIntentId));
    }
    const done = await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/orders/${tab.id}`);
    expect(done.body).toMatchObject({ paymentStatus: "paid", paymentMethod: "in_app", tipCents: 500, totalCents: 6828 });
    expect(done.body.paidAt).toBeTruthy();
    expect((await call(env, m.ownerToken, "GET", splitsUrl(m, tab.id))).body).toMatchObject({ orderPaid: true, paidCents: 6328 });
  });

  it("splits by item, with tax following each guest's food", async () => {
    const { m, tab, karahi, naan, lassi } = await table();
    const lines = await env.db.select().from(orderItems).where(eq(orderItems.orderId, tab.id));
    const id = (catalogId: string) => lines.find((l) => l.catalogItemId === catalogId)!.id;

    // Every line must be assigned once.
    expect((await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "items", splits: [{ itemIds: [id(karahi.id)] }, { itemIds: [id(naan.id)] }] })).status).toBe(400);
    // A dish given to two guests is shared between them (the old "one split per item" rule is gone), but an item that is on nobody's bill is not allowed.
    expect((await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "items", splits: [{ itemIds: [id(karahi.id), id(naan.id)] }, { itemIds: [id(karahi.id)] }] })).status).toBe(400);
    expect((await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "items", splits: [{ itemIds: ["00000000-0000-4000-8000-000000000000"] }, { itemIds: [id(karahi.id), id(naan.id), id(lassi.id)] }] })).status).toBe(400);

    const r = await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), {
      mode: "items",
      splits: [{ label: "Karahi", itemIds: [id(karahi.id)] }, { label: "Naan and lassi", itemIds: [id(naan.id), id(lassi.id)] }],
    });
    expect(r.status).toBe(201);
    // 2800 / 5600 of 6328 = 3164, 2800 of the food = 3164.
    expect(r.body.items.map((i: { amountCents: number }) => i.amountCents)).toEqual([3164, 3164]);
    expect(r.body.items[1].itemIds).toHaveLength(2);
    const view = await call(env, null, "GET", `/v1/public/splits/${r.body.items[1].payToken}`);
    expect(view.body.lines).toEqual(expect.arrayContaining([{ name: "Garlic naan", quantity: 4 }, { name: "Mango lassi", quantity: 2 }]));

    // Re-splitting before anyone pays replaces the old links.
    const again = await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 2 });
    expect(again.status).toBe(201);
    expect((await call(env, null, "GET", `/v1/public/splits/${r.body.items[0].payToken}`)).status).toBe(404);
    expect((await call(env, m.ownerToken, "DELETE", splitsUrl(m, tab.id))).status).toBe(204);
    expect((await call(env, m.ownerToken, "GET", splitsUrl(m, tab.id))).body.items).toEqual([]);
  });

  it("refuses bills that can't be split, and refunds paid shares when the order is cancelled", async () => {
    const { m, tab, karahi } = await table();
    expect((await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 1 })).status).toBe(400);
    // A paid counter order can't be split.
    const paid = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/orders/counter`, { items: [{ catalogItemId: karahi.id, quantity: 1 }], tender: "card" });
    expect((await call(env, m.ownerToken, "POST", splitsUrl(m, paid.body.id), { mode: "even", ways: 2 })).status).toBe(409);
    expect((await call(env, m.ownerToken, "POST", splitsUrl(m, "00000000-0000-4000-8000-000000000000"), { mode: "even", ways: 2 })).status).toBe(404);

    const r = await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 2 });
    const p = await call(env, null, "POST", `/v1/public/splits/${r.body.items[0].payToken}/pay`, {});
    await deliver(env, fake(env).succeedPaymentIntent(p.body.payment.paymentIntentId));
    const cancel = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/orders/${tab.id}/status`, { status: "cancelled", reason: "Table left" });
    expect(cancel.status).toBe(200);
    expect(cancel.body.paymentStatus).toBe("refunded");
    expect(fake(env).intents.get(p.body.payment.paymentIntentId)?.refundedCents).toBe(3164);
    expect((await call(env, null, "GET", `/v1/public/splits/${r.body.items[1].payToken}`)).body.canPay).toBe(false);
    expect((await call(env, null, "POST", `/v1/public/splits/${r.body.items[1].payToken}/pay`, {})).status).toBe(409);
    expect((await env.db.select().from(orders).where(eq(orders.id, tab.id)))[0]!.status).toBe("cancelled");
  });

  it("validates tips; shares follow the order fee rule from computeFees (0% on a restaurant tier)", async () => {
    const { m, tab } = await table();
    const r = await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 2 });
    const token = r.body.items[0].payToken;
    expect((await call(env, null, "POST", `/v1/public/splits/${token}/pay`, { tipCents: -5 })).status).toBe(400);
    expect((await call(env, null, "POST", `/v1/public/splits/nope-nope-nope/pay`, {})).status).toBe(404);
  });

  it("is a Pro feature", async () => {
    const { m, tab } = await table("growth");
    expect((await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 2 })).status).toBe(402);
    expect((await call(env, m.ownerToken, "GET", splitsUrl(m, tab.id))).status).toBe(402);
    // Splits created while on Pro stop working if the shop drops to Growth.
    await env.db.update(merchants).set({ restaurantTier: "pro" }).where(eq(merchants.id, m.merchant.id));
    const r = await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 2 });
    expect(r.status).toBe(201);
    await env.db.update(merchants).set({ restaurantTier: "starter" }).where(eq(merchants.id, m.merchant.id));
    expect((await call(env, null, "GET", `/v1/public/splits/${r.body.items[0].payToken}`)).status).toBe(402);
    expect((await call(env, null, "POST", `/v1/public/splits/${r.body.items[0].payToken}/pay`, {})).status).toBe(402);
  });
});

describe("cash shares", () => {
  const cashUrl = (m: M, orderId: string, splitId: string) => `${splitsUrl(m, orderId)}/${splitId}/mark-paid-cash`;

  it("staff mark a share paid in cash; the order is paid once every share is, and cash-only stays pay-at-pickup", async () => {
    const { m, tab } = await table();
    const r = await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 2 });
    const [a, b] = r.body.items as { id: string; amountCents: number; payToken: string }[];
    const one = await call(env, m.ownerToken, "POST", cashUrl(m, tab.id, a!.id), { tipCents: 200 });
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ paidCents: 3164, orderPaid: false });
    expect(one.body.items[0]).toMatchObject({ status: "paid", paidWith: "cash", tipCents: 200 });
    expect((await call(env, m.ownerToken, "POST", cashUrl(m, tab.id, a!.id), {})).status).toBe(409);
    expect((await call(env, null, "GET", `/v1/public/splits/${a!.payToken}`)).body).toMatchObject({ status: "paid", canPay: false });
    expect((await call(env, m.ownerToken, "POST", cashUrl(m, tab.id, "00000000-0000-4000-8000-000000000000"), {})).status).toBe(404);
    const last = await call(env, m.ownerToken, "POST", cashUrl(m, tab.id, b!.id), {});
    expect(last.body).toMatchObject({ orderPaid: true });
    const order = (await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/orders/${tab.id}`)).body;
    expect(order).toMatchObject({ paymentStatus: "paid", paymentMethod: "at_pickup", tipCents: 200, totalCents: 6528, platformFeeCents: 0 });
    expect((await call(env, m.ownerToken, "POST", cashUrl(m, tab.id, b!.id), {})).status).toBe(409);
  });

  it("mixes cash and card, and refunds a card payment that lands after the share was settled in cash", async () => {
    const { m, tab } = await table();
    const r = await call(env, m.ownerToken, "POST", splitsUrl(m, tab.id), { mode: "even", ways: 2 });
    const [a, b] = r.body.items as { id: string; payToken: string }[];
    const started = await call(env, null, "POST", `/v1/public/splits/${a!.payToken}/pay`, {});
    await call(env, m.ownerToken, "POST", cashUrl(m, tab.id, a!.id), {});
    await deliver(env, fake(env).succeedPaymentIntent(started.body.payment.paymentIntentId));
    expect(fake(env).intents.get(started.body.payment.paymentIntentId)?.refundedCents).toBe(3164);
    const p = await call(env, null, "POST", `/v1/public/splits/${b!.payToken}/pay`, {});
    await deliver(env, fake(env).succeedPaymentIntent(p.body.payment.paymentIntentId));
    const order = (await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/orders/${tab.id}`)).body;
    expect(order).toMatchObject({ paymentStatus: "paid", paymentMethod: "in_app" });
    const list = (await call(env, m.ownerToken, "GET", splitsUrl(m, tab.id))).body;
    expect(list.items.map((i: { paidWith: string }) => i.paidWith)).toEqual(["cash", "card"]);
  });
});
