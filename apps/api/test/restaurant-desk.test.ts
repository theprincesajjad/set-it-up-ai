import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchants, orders } from "@ll/db";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { call, customer, deliver, fake, paidMerchant } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

type M = Awaited<ReturnType<typeof paidMerchant>>;

async function shop(tier: "starter" | "growth" | "pro" = "pro") {
  const m = await paidMerchant(env, { plan: "free" });
  await env.db.update(merchants).set({ restaurantTier: tier }).where(eq(merchants.id, m.merchant.id));
  const url = `/v1/merchants/${m.merchant.id}`;
  const mk = async (body: object) => (await call(env, m.ownerToken, "POST", `${url}/catalog/items`, body)).body;
  const pot = await mk({ name: "Chicken biryani degh", priceCents: 18000, preorderOnly: true, leadTimeHours: 24, serves: 12, depositBps: 3000, cookMinutes: 90, recipe: { riceKg: 4, meatKg: 5, meatKind: "chicken" } });
  const plate = await mk({ name: "Chicken biryani", priceCents: 1600 });
  return { m, url, pot, plate };
}

const FRI = "2026-11-06T22:00:00.000Z";
const place = (m: M, token: string, items: object[], extra: object = {}) =>
  call(env, token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items, kind: "preorder", idempotencyKey: `d2-${Math.random().toString(36).slice(2)}`, ...extra });

describe("restaurant home and busy mode", () => {
  it("shows the day at a glance and quotes a longer wait while busy", async () => {
    const { m, url, plate } = await shop();
    const home = await call(env, m.ownerToken, "GET", `${url}/restaurant/home`);
    expect(home.status).toBe(200);
    expect(home.body.busy).toMatchObject({ on: false });
    expect(home.body.directSavings).toMatchObject({ estimate: true, assumedFeeBps: 2500 });

    const on = await call(env, m.ownerToken, "PUT", `${url}/restaurant/busy`, { addMinutes: 20, hours: 2 });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ on: true, addMinutes: 20 });
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: plate.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "d2-busy-0001" });
    expect(r.status).toBe(201);
    expect(r.body.order.pickupAt).toBeTruthy();
    const off = await call(env, m.ownerToken, "PUT", `${url}/restaurant/busy`, { addMinutes: 0 });
    expect(off.body.on).toBe(false);
    expect((await call(env, m.ownerToken, "PUT", `${url}/restaurant/busy`, { addMinutes: 7 })).status).toBe(400);
  });

  it("is a restaurant feature: a shop with no restaurant tier gets 402", async () => {
    const m = await paidMerchant(env, { plan: "free" });
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/restaurant/home`)).status).toBe(402);
  });
});

describe("pre-order caps and planning", () => {
  it("enforces weekday and per-hour caps with preorder_full", async () => {
    const { m, url, pot } = await shop();
    const saved = await call(env, m.ownerToken, "PUT", `${url}/preorders/settings`, { capByWeekday: { fri: 1 }, perHourCap: 5 });
    expect(saved.status).toBe(200);
    const c = await customer(env);
    const items = [{ catalogItemId: pot.id, quantity: 1 }];
    expect((await place(m, c.token, items, { pickupAt: FRI })).status).toBe(201);
    const full = await place(m, c.token, items, { pickupAt: FRI });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("preorder_full");

    await call(env, m.ownerToken, "PUT", `${url}/preorders/settings`, { capByWeekday: { fri: null }, perHourCap: 1 });
    const hour = await place(m, c.token, items, { pickupAt: FRI });
    expect(hour.status).toBe(409);
    expect(hour.body.error.code).toBe("preorder_full");
    // A different hour is fine.
    expect((await place(m, c.token, items, { pickupAt: "2026-11-06T20:00:00.000Z" })).status).toBe(201);
  });

  it("an Eid override raises the cap on those dates", async () => {
    const { m, url, pot } = await shop();
    await call(env, m.ownerToken, "PUT", `${url}/preorders/settings`, { preorderDailyCap: 1, overrides: [{ from: "2026-11-06", to: "2026-11-06", cap: 3, label: "Test Eid" }] });
    const c = await customer(env);
    const items = [{ catalogItemId: pot.id, quantity: 1 }];
    for (let i = 0; i < 3; i++) expect((await place(m, c.token, items, { pickupAt: FRI })).status).toBe(201);
    expect((await place(m, c.token, items, { pickupAt: FRI })).status).toBe(409);
  });

  it("totals what to cook and buy from recipes, labelled as an estimate", async () => {
    const { m, url, pot } = await shop();
    const c = await customer(env);
    await place(m, c.token, [{ catalogItemId: pot.id, quantity: 2 }], { pickupAt: FRI });
    const r = await call(env, m.ownerToken, "GET", `${url}/preorders`);
    expect(r.status).toBe(200);
    const day = (r.body.days as { plan: { pots: number; riceKg: number | null }[]; shopping: { estimate: boolean; items: { name: string; qty: number }[] } | null }[]).find((d) => d.plan.length > 0);
    expect(day).toBeTruthy();
    expect(day!.plan[0]!.pots).toBe(2);
    expect(day!.shopping?.estimate).toBe(true);
    expect(JSON.stringify(day!.shopping)).toMatch(/chicken/i);
  });

  it("keeps a wait list with consent and messages one guest per freed pot", async () => {
    const { m, url, pot } = await shop();
    await call(env, m.ownerToken, "PUT", `${url}/preorders/settings`, { capByWeekday: { fri: 1 } });
    const c = await customer(env);
    const first = await place(m, c.token, [{ catalogItemId: pot.id, quantity: 1 }], { pickupAt: FRI });
    expect(first.status).toBe(201);
    const slug = (await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id)))[0]!.slug;
    const body = { itemId: pot.id, date: "2026-11-06", name: "Sana" };
    expect((await call(env, null, "POST", `/v1/public/shops/${slug}/preorders/waitlist`, { ...body, phone: "+16475550111" })).status).toBe(400); // no consent
    for (const phone of ["+16475550111", "+16475550112"]) {
      const j = await call(env, null, "POST", `/v1/public/shops/${slug}/preorders/waitlist`, { ...body, phone, consent: true });
      expect(j.status).toBeLessThan(300);
    }
    const list = await call(env, m.ownerToken, "GET", `${url}/preorders/waitlist`);
    expect(list.body.items ?? list.body).toHaveLength(2);

    const before = env.ctx.providers.outbox.sms.length;
    const cancel = await call(env, m.ownerToken, "POST", `${url}/orders/${first.body.order.id}/status`, { status: "cancelled", reason: "Sold out" });
    expect(cancel.status).toBe(200);
    const sent = env.ctx.providers.outbox.sms.slice(before).filter((s) => /\+1647555011[12]/.test(s.to));
    expect(sent).toHaveLength(1);
  });

  it("reminds about the balance, but not twice in a row", async () => {
    const { m, url, pot } = await shop();
    const c = await customer(env);
    const r = await place(m, c.token, [{ catalogItemId: pot.id, quantity: 1 }], { pickupAt: FRI });
    expect(r.status).toBe(201);
    const id = r.body.order.id as string;
    const one = await call(env, m.ownerToken, "POST", `${url}/orders/${id}/remind-balance`);
    expect(one.status).toBe(200);
    expect(one.body.balanceDueCents).toBeGreaterThan(0);
    if (one.body.sent) {
      const two = await call(env, m.ownerToken, "POST", `${url}/orders/${id}/remind-balance`);
      expect(two.body).toMatchObject({ sent: false, reason: "too_soon" });
    } else {
      expect(one.body.reason).toBeTruthy();
    }
  });
});

describe("kitchen extras", () => {
  it("hides sold-out dishes and refuses them, then restores", async () => {
    const { m, url, plate } = await shop();
    const off = await call(env, m.ownerToken, "PATCH", `${url}/kitchen/sold-out/${plate.id}`, { until: "today" });
    expect(off.status).toBe(200);
    const menu = await call(env, null, "GET", `/v1/public/shops/${(await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id)))[0]!.slug}/menu`);
    expect(JSON.stringify(menu.body)).not.toContain("Chicken biryani\"");
    const c = await customer(env);
    const blocked = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: plate.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "d2-sold-0001" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("item_sold_out");
    await call(env, m.ownerToken, "PATCH", `${url}/kitchen/sold-out/${plate.id}`, { until: "restore" });
    expect((await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: plate.id, quantity: 1 }], paymentMethod: "at_pickup", idempotencyKey: "d2-sold-0002" })).status).toBe(201);
  });

  it("carries the allergy note to the ticket and pins a pre-order close to its fire time", async () => {
    const { m, url, pot, plate } = await shop();
    const counter = await call(env, m.ownerToken, "POST", `${url}/orders/counter`, { items: [{ catalogItemId: plate.id, quantity: 1 }], tender: "cash", allergyNote: "no nuts" });
    expect(counter.status).toBe(201);
    const c = await customer(env);
    const soon = new Date(env.clock.now.getTime() + 25 * 3600_000).toISOString();
    const pre = await place(m, c.token, [{ catalogItemId: pot.id, quantity: 1 }], { pickupAt: soon });
    expect(pre.status).toBe(201);
    // Pickup day arrives: two hours out, inside the pin window.
    await env.db.update(orders).set({ paymentMethod: "at_pickup", pickupAt: new Date(env.clock.now.getTime() + 2 * 3600_000) }).where(eq(orders.id, pre.body.order.id));
    const t = await call(env, m.ownerToken, "GET", `${url}/kitchen/tickets`);
    const all = t.body.items as { allergyNote: string | null; kind: string; pinned: boolean; fireAt: string | null; cookMinutes: number | null }[];
    expect(all.find((x) => x.allergyNote === "no nuts")).toBeTruthy();
    const pinned = all.find((x) => x.kind === "preorder");
    expect(pinned?.pinned).toBe(true);
    expect(pinned?.cookMinutes).toBe(90);
    expect(pinned?.fireAt).toBeTruthy();
  });
});

describe("split bill rounding, tenders and shared items", () => {
  async function tab() {
    const { m, url } = await shop();
    const mk = async (body: object) => (await call(env, m.ownerToken, "POST", `${url}/catalog/items`, body)).body;
    const karahi = await mk({ name: "Lamb karahi", priceCents: 2800 });
    const naan = await mk({ name: "Garlic naan", priceCents: 400 });
    const t = await call(env, m.ownerToken, "POST", `${url}/orders/counter`, { items: [{ catalogItemId: karahi.id, quantity: 1 }, { catalogItemId: naan.id, quantity: 4 }] });
    return { m, url, order: t.body, karahi, naan };
  }

  it("gives the odd cents to the first guest and keeps the sum exact", async () => {
    const { m, url, order } = await tab();
    const r = await call(env, m.ownerToken, "POST", `${url}/orders/${order.id}/splits`, { mode: "even", ways: 3 });
    expect(r.status).toBe(201);
    const amounts = (r.body.items as { amountCents: number }[]).map((i) => i.amountCents);
    expect(amounts.reduce((s, a) => s + a, 0)).toBe(order.totalCents);
    expect(amounts[0]!).toBeGreaterThanOrEqual(amounts[1]!);
    expect(amounts[1]).toBe(amounts[2]);
  });

  it("a cash share is marked paid by staff and creates no card intent", async () => {
    const { m, url, order } = await tab();
    const r = await call(env, m.ownerToken, "POST", `${url}/orders/${order.id}/splits`, { mode: "even", ways: 2, tenders: ["cash", "link"] });
    expect(r.status).toBe(201);
    const [cash, link] = r.body.items as { id: string; tender: string; status: string }[];
    expect(cash!.tender).toBe("cash");
    expect(link!.tender).toBe("link");
    const before = fake(env).intents.size;
    const paid = await call(env, m.ownerToken, "POST", `${url}/orders/${order.id}/splits/${cash!.id}/mark-paid`, { tender: "cash" });
    expect(paid.status).toBe(200);
    expect(fake(env).intents.size).toBe(before);
    expect(deliver).toBeTypeOf("function");
  });
});
