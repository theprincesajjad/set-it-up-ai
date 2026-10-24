import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchants, neighbourhoods, orders } from "@ll/db";
import { createNeighbourhood, createTestEnv, grantFeatures, type TestEnv } from "./helpers.js";
import { call, customer, deliver, fake, paidMerchant } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

type M = Awaited<ReturnType<typeof paidMerchant>>;

/** A restaurant-pack shop (plan free: the tier alone unlocks ordering). */
async function restaurant(tier: "starter" | "growth" | "pro" | null, opts: { slug?: string } = {}): Promise<M> {
  const m = await paidMerchant(env, { plan: "free", slug: opts.slug });
  await env.db.update(merchants).set({ restaurantTier: tier }).where(eq(merchants.id, m.merchant.id));
  const [merchant] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
  return { ...m, merchant: merchant! };
}

const itemsUrl = (m: M) => `/v1/merchants/${m.merchant.id}/catalog/items`;

describe("dietary tags", () => {
  it("creates and returns dietary tags + translations; gated by tier", async () => {
    const plain = await restaurant(null);
    // No pack, no ordering: a plain catalog item can't carry restaurant fields (402) and isn't even reachable on Free.
    expect((await call(env, plain.ownerToken, "POST", itemsUrl(plain), { name: "Karahi", priceCents: 1800, dietary: { halal: true } })).status).toBe(402);

    const m = await restaurant("starter");
    const r = await call(env, m.ownerToken, "POST", itemsUrl(m), {
      name: "Chicken karahi",
      priceCents: 1800,
      dietary: { zabihah: true, halalCertifier: "HMA Canada", spice: 2, allergens: ["dairy"] },
      translations: { hi: { name: "चिकन कड़ाही", description: "तीखा" }, ur: { name: "چکن کڑاہی" } },
    });
    expect(r.status).toBe(201);
    expect(r.body.dietary).toMatchObject({ halal: true, zabihah: true, halalCertifier: "HMA Canada", spice: 2 });
    expect(r.body.translations.hi.name).toBe("चिकन कड़ाही");
    const upd = await call(env, m.ownerToken, "PATCH", `${itemsUrl(m)}/${r.body.id}`, { dietary: { vegan: true } });
    expect(upd.body.dietary).toMatchObject({ vegan: true, vegetarian: true });
    const cat = await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/catalog`);
    expect(cat.body.items[0].dietary.vegan).toBe(true);

    // Validation: certifier needs a halal claim, unknown language, bad spice.
    expect((await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "X", priceCents: 100, dietary: { halalCertifier: "A" } })).status).toBe(400);
    expect((await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "X", priceCents: 100, translations: { fr: { name: "x" } } })).status).toBe(400);
    expect((await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "X", priceCents: 100, dietary: { spice: 5 } })).status).toBe(400);
  });

  it("feature tiers: preorder fields need Growth, station needs Pro", async () => {
    const m = await restaurant("starter");
    expect((await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Pot", priceCents: 9000, preorderOnly: true, leadTimeHours: 24 })).status).toBe(402);
    expect((await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Pot", priceCents: 9000, station: "curry" })).status).toBe(402);
    await env.db.update(merchants).set({ restaurantTier: "growth" }).where(eq(merchants.id, m.merchant.id));
    expect((await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Pot", priceCents: 9000, preorderOnly: true, leadTimeHours: 24, serves: 12, depositBps: 3000 })).status).toBe(201);
    expect((await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Pot", priceCents: 9000, station: "curry" })).status).toBe(402);
  });

  it("public menu filters halal, veg and spice; non-restaurant shops are unchanged", async () => {
    const m = await restaurant("starter", { slug: "biryani-house" });
    const mk = (body: object) => call(env, m.ownerToken, "POST", itemsUrl(m), body);
    await mk({ name: "Haleem", priceCents: 1400, dietary: { halal: true, spice: 3 } });
    await mk({ name: "Palak paneer", priceCents: 1500, dietary: { halal: true, vegetarian: true, spice: 1 } });
    await mk({ name: "Dal", priceCents: 1000, dietary: { jain: true, spice: 0 } });
    await mk({ name: "Plain naan", priceCents: 300 });
    const names = (b: { uncategorized: { name: string }[] }) => b.uncategorized.map((i) => i.name).sort();

    const all = await call(env, null, "GET", "/v1/public/shops/biryani-house/menu");
    expect(names(all.body)).toEqual(["Dal", "Haleem", "Palak paneer", "Plain naan"]);
    expect((await call(env, null, "GET", "/v1/public/shops/biryani-house/menu?halal=1")).body.uncategorized.map((i: { name: string }) => i.name).sort()).toEqual(["Haleem", "Palak paneer"]);
    expect(names((await call(env, null, "GET", "/v1/public/shops/biryani-house/menu?veg=1")).body)).toEqual(["Dal", "Palak paneer"]);
    expect(names((await call(env, null, "GET", "/v1/public/shops/biryani-house/menu?halal=1&veg=1&maxSpice=2")).body)).toEqual(["Palak paneer"]);
    expect(names((await call(env, null, "GET", "/v1/public/shops/biryani-house/menu?maxSpice=0")).body)).toEqual(["Dal", "Plain naan"]);
    expect((await call(env, null, "GET", "/v1/public/shops/biryani-house/menu?maxSpice=9")).status).toBe(400);

    // A café without the pack: filters are ignored and no restaurant keys appear.
    const cafe = await restaurant(null, { slug: "plain-cafe" });
    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, cafe.merchant.id));
    await call(env, cafe.ownerToken, "POST", itemsUrl(cafe), { name: "Latte", priceCents: 500 });
    const menu = await call(env, null, "GET", "/v1/public/shops/plain-cafe/menu?halal=1&lang=hi");
    expect(menu.status).toBe(200);
    expect(menu.body.uncategorized).toHaveLength(1);
    expect(Object.keys(menu.body.uncategorized[0]).sort()).toEqual(["available", "categoryId", "createdAt", "description", "id", "imageUrl", "merchantId", "modifiers", "name", "orderable", "priceCents", "sortOrder"]);
    expect(menu.body.lang).toBeUndefined();
    expect(menu.body.dualPricing).toBeUndefined();
  });

  it("network shop list filters halal menus", async () => {
    const hood = await createNeighbourhood(env.db);
    const mk = async (slug: string, items: object[]) => {
      const m = await restaurant("starter", { slug });
      await env.db.update(merchants).set({ neighbourhoodId: hood.id, name: slug }).where(eq(merchants.id, m.merchant.id));
      for (const i of items) await call(env, m.ownerToken, "POST", itemsUrl(m), i);
    };
    await mk("all-halal", [{ name: "A", priceCents: 100, dietary: { halal: true } }, { name: "B", priceCents: 100, dietary: { zabihah: true } }]);
    await mk("some-halal", [{ name: "A", priceCents: 100, dietary: { halal: true } }, { name: "B", priceCents: 100 }]);
    await mk("no-halal", [{ name: "A", priceCents: 100 }]);
    const slugs = async (q: string) => (await call(env, null, "GET", `/v1/network/shops${q}`)).body.items.map((i: { merchant: { slug: string } }) => i.merchant.slug).sort();
    expect(await slugs("")).toEqual(["all-halal", "no-halal", "some-halal"]);
    expect(await slugs("?halal=1")).toEqual(["all-halal", "some-halal"]);
    expect(await slugs("?halal=all")).toEqual(["all-halal"]);
    const list = await call(env, null, "GET", "/v1/network/shops");
    const by = Object.fromEntries(list.body.items.map((i: { merchant: { slug: string }; halalMenu?: string }) => [i.merchant.slug, i.halalMenu]));
    expect(by).toEqual({ "all-halal": "all", "some-halal": "some", "no-halal": undefined });
  });
});

describe("multilingual menu", () => {
  it("returns translated names with English fallback and manages languages", async () => {
    const m = await restaurant("starter", { slug: "lahori" });
    await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Nihari", priceCents: 1700, description: "Slow-cooked beef", translations: { ur: { name: "نہاری" }, hi: { name: "निहारी", description: "धीमी आंच" } } });
    await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Chai", priceCents: 300 });
    const url = `/v1/merchants/${m.merchant.id}/menu/languages`;

    // Only English is on until the shop adds languages.
    const before = await call(env, null, "GET", "/v1/public/shops/lahori/menu?lang=hi");
    expect(before.body.lang).toBe("en");
    expect(before.body.uncategorized.find((i: { id: string; name: string }) => i.name === "Nihari")).toBeTruthy();

    expect((await call(env, m.ownerToken, "PUT", url, { languages: ["hi", "ur"] })).status).toBe(400); // en required
    expect((await call(env, m.ownerToken, "PUT", url, { languages: ["en", "hi", "ur"] })).body).toEqual({ languages: ["en", "hi", "ur"] });
    expect((await call(env, m.ownerToken, "GET", url)).body.languages).toEqual(["en", "hi", "ur"]);

    const hi = (await call(env, null, "GET", "/v1/public/shops/lahori/menu?lang=hi")).body;
    expect(hi.lang).toBe("hi");
    expect(hi.languages).toEqual(["en", "hi", "ur"]);
    const nihari = hi.uncategorized.find((i: { priceCents: number }) => i.priceCents === 1700);
    expect(nihari).toMatchObject({ name: "निहारी", description: "धीमी आंच" });
    expect(hi.uncategorized.find((i: { priceCents: number }) => i.priceCents === 300).name).toBe("Chai"); // fallback

    const ur = (await call(env, null, "GET", "/v1/public/shops/lahori/menu?lang=ur")).body;
    expect(ur.uncategorized.find((i: { priceCents: number }) => i.priceCents === 1700)).toMatchObject({ name: "نہاری", description: "Slow-cooked beef" });
    // pa isn't offered by this shop: English.
    expect((await call(env, null, "GET", "/v1/public/shops/lahori/menu?lang=pa")).body.lang).toBe("en");
    expect((await call(env, null, "GET", "/v1/public/shops/lahori/menu?lang=fr")).status).toBe(400);

    const plain = await restaurant(null);
    expect((await call(env, plain.ownerToken, "PUT", `/v1/merchants/${plain.merchant.id}/menu/languages`, { languages: ["en", "hi"] })).status).toBe(402);
  });
});

describe("dual pricing", () => {
  it("rejects Quebec, shows both prices, and gives cash its discount at the counter and at pickup", async () => {
    const m = await restaurant("pro", { slug: "karahi-corner" });
    const url = `/v1/merchants/${m.merchant.id}/dual-pricing`;
    const latte = (await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Karahi", priceCents: 2000 })).body;

    expect((await call(env, m.ownerToken, "PUT", url, { cashDiscountBps: 2000 })).status).toBe(400);
    expect((await call(env, m.ownerToken, "PUT", url, { cashDiscountBps: 400 })).body).toEqual({ cashDiscountBps: 400, enabled: true });
    const menu = (await call(env, null, "GET", "/v1/public/shops/karahi-corner/menu")).body;
    expect(menu.dualPricing).toEqual({ cashDiscountBps: 400 });
    expect(menu.uncategorized[0]).toMatchObject({ priceCents: 2000, cashPriceCents: 1920 });

    // Counter: cash takes the discount, card doesn't; tax follows the price paid.
    const counter = `/v1/merchants/${m.merchant.id}/orders/counter`;
    const cash = await call(env, m.ownerToken, "POST", counter, { items: [{ catalogItemId: latte.id, quantity: 1 }], tender: "cash" });
    expect(cash.status).toBe(201);
    expect(cash.body).toMatchObject({ channel: "counter", subtotalCents: 2000, cashDiscountCents: 80, taxCents: 250, totalCents: 2170, paymentStatus: "paid", status: "accepted" });
    const card = await call(env, m.ownerToken, "POST", counter, { items: [{ catalogItemId: latte.id, quantity: 1 }], tender: "card" });
    expect(card.body).toMatchObject({ cashDiscountCents: 0, taxCents: 260, totalCents: 2260, paymentStatus: "paid" });

    // Pay at pickup, settled in cash by staff.
    const c = await customer(env);
    const placed = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: latte.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "pickup-key-0001" });
    expect(placed.body.order).toMatchObject({ totalCents: 2260, cashDiscountCents: 0 });
    const base = `/v1/merchants/${m.merchant.id}/orders/${placed.body.order.id}/status`;
    await call(env, m.ownerToken, "POST", base, { status: "accepted" });
    await call(env, m.ownerToken, "POST", base, { status: "ready" });
    const done = await call(env, m.ownerToken, "POST", base, { status: "picked_up", tender: "cash" });
    expect(done.body).toMatchObject({ paymentStatus: "paid", cashDiscountCents: 80, taxCents: 250, totalCents: 2170 });

    // Quebec shops can't turn it on; turning it off is always fine.
    const [qc] = await env.db.insert(neighbourhoods).values({ slug: "montreal", name: "Montreal", status: "live", province: "QC", centerLat: 45.5, centerLng: -73.6 }).returning();
    await env.db.update(merchants).set({ neighbourhoodId: qc!.id }).where(eq(merchants.id, m.merchant.id));
    const blocked = await call(env, m.ownerToken, "PUT", url, { cashDiscountBps: 300 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("dual_pricing_not_allowed");
    expect((await call(env, m.ownerToken, "PUT", url, { cashDiscountBps: 0 })).body.enabled).toBe(false);
  });

  it("is a Pro feature", async () => {
    const m = await restaurant("growth");
    expect((await call(env, m.ownerToken, "PUT", `/v1/merchants/${m.merchant.id}/dual-pricing`, { cashDiscountBps: 300 })).status).toBe(402);
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/dual-pricing`)).status).toBe(402);
  });
});

describe("degh pre-orders", () => {
  async function degh(opts: { cap?: number } = {}) {
    const m = await restaurant("growth", { slug: "degh-house" });
    const pot = (await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Chicken biryani degh", priceCents: 18000, preorderOnly: true, leadTimeHours: 24, serves: 12, depositBps: 3000 })).body;
    const naan = (await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Naan", priceCents: 300 })).body;
    if (opts.cap) await call(env, m.ownerToken, "PUT", `/v1/merchants/${m.merchant.id}/preorders/settings`, { preorderDailyCap: opts.cap });
    return { m, pot, naan };
  }
  const place = (m: M, token: string, items: object[], extra: object = {}) =>
    call(env, token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items, kind: "preorder", idempotencyKey: `pre-${Math.random().toString(36).slice(2)}`, ...extra });

  it("enforces lead time, charges the deposit, holds the balance for pickup, and refunds on cancel", async () => {
    const { m, pot, naan } = await degh();
    const c = await customer(env);
    const items = [{ catalogItemId: pot.id, quantity: 1 }];

    // Pot is pre-order only; the normal flow refuses it.
    const plain = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items, idempotencyKey: "plain-key-0001" });
    expect(plain.status).toBe(409);
    expect(plain.body.error.code).toBe("preorder_only");

    // Now is Tue 10:00 Toronto. 12 hours is too soon for a 24 hour pot.
    const soon = await place(m, c.token, items, { pickupAt: new Date(env.clock.now.getTime() + 12 * 3600_000).toISOString() });
    expect(soon.status).toBe(409);
    expect(soon.body.error).toMatchObject({ code: "preorder_lead_time", details: { leadTimeHours: 24 } });
    expect((await place(m, c.token, items)).status).toBe(400); // pickup time required

    const pickupAt = "2026-11-06T22:00:00.000Z"; // Fri 5 p.m. Toronto
    const r = await place(m, c.token, [...items, { catalogItemId: naan.id, quantity: 2 }], { pickupAt });
    expect(r.status).toBe(201);
    // 18000 + 600 = 18600; HST 2418; deposit 30% of the pot with its HST = 18000 x 1.13 x 0.3 = 6102; $0.49 customer fee on the card charge.
    expect(r.body.order).toMatchObject({ kind: "preorder", subtotalCents: 18600, taxCents: 2418, customerFeeCents: 49, platformFeeCents: 0, depositCents: 6102, totalCents: 21067, paymentStatus: "requires_action", balanceDueCents: 21067 });
    expect(r.body.payment.amountCents).toBe(6151);
    expect(fake(env).intents.get(r.body.payment.paymentIntentId)).toMatchObject({ amountCents: 6151, applicationFeeCents: 49 });

    // Deposit lands: order is confirmed with the balance due at pickup.
    await deliver(env, fake(env).succeedPaymentIntent(r.body.payment.paymentIntentId));
    const mine = await call(env, c.token, "GET", `/v1/me/orders/${r.body.order.id}`);
    expect(mine.body).toMatchObject({ paymentStatus: "authorized", balanceDueCents: 21067 - 6151 });
    expect(mine.body.depositPaidAt).toBeTruthy();
    const queue = await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/orders`);
    expect(queue.body.items.map((o: { id: string }) => o.id)).toContain(r.body.order.id);

    const base = `/v1/merchants/${m.merchant.id}/orders/${r.body.order.id}/status`;
    expect((await call(env, m.ownerToken, "POST", base, { status: "accepted" })).status).toBe(200);
    await call(env, m.ownerToken, "POST", base, { status: "ready" });
    const done = await call(env, m.ownerToken, "POST", base, { status: "picked_up" });
    expect(done.body).toMatchObject({ status: "picked_up", paymentStatus: "paid", balanceDueCents: 0 });

    // A second pre-order, cancelled by the shop: the deposit goes back.
    const r2 = await place(m, c.token, items, { pickupAt });
    await deliver(env, fake(env).succeedPaymentIntent(r2.body.payment.paymentIntentId));
    const cancel = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/orders/${r2.body.order.id}/status`, { status: "cancelled", reason: "Out of lamb" });
    expect(cancel.body.paymentStatus).toBe("refunded");
    expect(fake(env).intents.get(r2.body.payment.paymentIntentId)?.refundedCents).toBe(6151);
  });

  it("caps pots per pickup day and lists pre-orders by day for prep", async () => {
    const { m, pot } = await degh({ cap: 3 });
    const c = await customer(env);
    const d1 = "2026-11-06T22:00:00.000Z";
    const d2 = "2026-11-08T17:00:00.000Z";
    expect((await place(m, c.token, [{ catalogItemId: pot.id, quantity: 2 }], { pickupAt: d1 })).status).toBe(201);
    const full = await place(m, c.token, [{ catalogItemId: pot.id, quantity: 2 }], { pickupAt: "2026-11-06T20:00:00.000Z" });
    expect(full.status).toBe(409);
    expect(full.body.error).toMatchObject({ code: "preorder_full", details: { remaining: 1 } });
    expect((await place(m, c.token, [{ catalogItemId: pot.id, quantity: 1 }], { pickupAt: d1 })).status).toBe(201);
    expect((await place(m, c.token, [{ catalogItemId: pot.id, quantity: 3 }], { pickupAt: d2 })).status).toBe(201);

    const list = await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/preorders?from=2026-11-04&to=2026-11-10`);
    expect(list.status).toBe(200);
    expect(list.body.days.map((d: { date: string }) => d.date)).toEqual(["2026-11-06", "2026-11-08"]);
    expect(list.body.days[0]).toMatchObject({ pots: 3, cap: 3, remaining: 0, prep: [{ name: "Chicken biryani degh", quantity: 3, serves: 36 }] });
    expect(list.body.days[0].orders).toHaveLength(2);
    expect(list.body.days[0].orders[0]).toMatchObject({ customerName: "Casey Customer", depositPaid: false });
    expect(list.body.days[1]).toMatchObject({ pots: 3, remaining: 0 });

    // A cancelled order frees its pots.
    const cancelled = list.body.days[0].orders[0];
    await env.db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, cancelled.orderId));
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/preorders?from=2026-11-06&to=2026-11-06`)).body.days[0].pots).toBe(1);
    expect((await call(env, m.ownerToken, "PUT", `/v1/merchants/${m.merchant.id}/preorders/settings`, { preorderDailyCap: null })).body).toMatchObject({ preorderDailyCap: null });
  });

  it("is gated to Growth", async () => {
    const m = await restaurant("starter");
    const c = await customer(env);
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/preorders`)).status).toBe(402);
    expect((await call(env, m.ownerToken, "PUT", `/v1/merchants/${m.merchant.id}/preorders/settings`, { preorderDailyCap: 5 })).status).toBe(402);
    const item = (await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Naan", priceCents: 300 })).body;
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: item.id, quantity: 1 }], kind: "preorder", pickupAt: "2026-11-06T22:00:00.000Z", idempotencyKey: "pre-gated-001" });
    expect(r.status).toBe(402);
  });
});

describe("commission-free ordering and customer fee", () => {
  const order = (m: M, token: string, itemId: string, key: string) =>
    call(env, token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: itemId, quantity: 1 }], idempotencyKey: key });

  it("restaurant shops pay no commission and pass a $0.49 service fee to card customers", async () => {
    const m = await restaurant("starter");
    const item = (await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Samosa chaat", priceCents: 1000 })).body;
    const c = await customer(env);
    const r = await order(m, c.token, item.id, "fee-key-00001");
    expect(r.body.order).toMatchObject({ platformFeeCents: 0, customerFeeCents: 49, taxCents: 130, totalCents: 1179 });
    expect(fake(env).intents.get(r.body.payment.paymentIntentId)).toMatchObject({ amountCents: 1179, applicationFeeCents: 49 });
    const atPickup = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: item.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "fee-key-00002" });
    expect(atPickup.body.order).toMatchObject({ platformFeeCents: 0, customerFeeCents: 0, totalCents: 1130 });
  });

  it("without restaurant.commission_free no customer fee is charged and the platform fee still follows computeFees", async () => {
    const m = await restaurant("starter");
    await grantFeatures(env, m.merchant.id, ["restaurant.commission_free"], false);
    const item = (await call(env, m.ownerToken, "POST", itemsUrl(m), { name: "Samosa chaat", priceCents: 1000 })).body;
    const c = await customer(env);
    const r = await order(m, c.token, item.id, "fee-key-00003");
    // A restaurant tier counts as a paid plan, so the platform fee is 0% (computeFees). It was 8 under the old flat 0.75% (1130 x 0.75%).
    expect(r.body.order).toMatchObject({ platformFeeCents: 0, customerFeeCents: 0, totalCents: 1130 });
    expect(fake(env).intents.get(r.body.payment.paymentIntentId)).toMatchObject({ applicationFeeCents: 0 });
  });
});
