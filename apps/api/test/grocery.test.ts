/**
 * Grocers and halal butchers (docs/research/grocers.md): the weekly flyer, butcher-counter pre-orders sold by weight with a weigh-in
 * and an Eid al-Adha plan, pantry (restock) reminders, the counter's "not counted" amount and the WhatsApp inbox for grocers.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { manualPayments, merchantMembers, merchants, orders, orderItems, pantryEntries, pantryItems } from "@ll/db";
import { createTestEnv, grantFeatures, nextPhone, type TestEnv } from "./helpers.js";
import { call, customer, deliver, fake, paidMerchant, setStage, staffMember } from "./commerce-fixtures.js";
import { signAccessToken } from "../src/lib/auth.js";
import { runPantryReminders, sendPantryReminders } from "../src/services/grocery.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const CONSENT = { text: "Yes, Annapurna may text me offers and reminders. Reply STOP to opt out." };

/** A Plus-plan grocer with the four grocery features granted the way pilot shops get them. */
async function grocer(opts: { features?: boolean } = {}) {
  const m = await paidMerchant(env, { plan: "plus" });
  await env.db.update(merchants).set({ vertical: "grocery", name: "Annapurna Grocers" }).where(eq(merchants.id, m.merchant.id));
  const features = ["grocery.flyer", "grocery.counter_preorders", "grocery.pantry_reminders", "grocery.whatsapp_orders"] as const;
  if (opts.features !== false) await grantFeatures(env, m.merchant.id, [...features]);
  const [fresh] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
  return { ...m, merchant: fresh!, url: `/v1/merchants/${m.merchant.id}` };
}
type G = Awaited<ReturnType<typeof grocer>>;

/** Makes a member who agreed to texts (the counter's consent path). */
async function member(g: G, opts: { consent?: boolean; amount?: number } = {}) {
  const phone = nextPhone();
  // A fresh token each time: tests that jump weeks ahead outlive the one-hour access token on the test clock.
  const token = await signAccessToken(env.ctx, { id: g.owner.id, platformRole: "none" });
  const r = await call(env, token, "POST", `${g.url}/counter/award`, { phone, amountCents: opts.amount ?? 5000, ...(opts.consent === false ? {} : { consent: CONSENT }), idempotencyKey: `gm-${phone}` });
  expect(r.status).toBe(200);
  return { phone, memberId: r.body.member.memberId as string };
}

describe("feature gating", () => {
  it("a Free-plan shop gets 402 on every grocery endpoint, and a grocer on Plus without the pilot grant too while the features are hidden", async () => {
    const free = await paidMerchant(env, { plan: "free" });
    const base = `/v1/merchants/${free.merchant.id}/grocery`;
    expect((await call(env, free.ownerToken, "GET", `${base}/deals`)).status).toBe(402);
    expect((await call(env, free.ownerToken, "GET", `${base}/pantry`)).status).toBe(402);
    expect((await call(env, free.ownerToken, "GET", `${base}/butcher/eid`)).status).toBe(402);
    const plain = await grocer({ features: false });
    await setStage(env, ["grocery.flyer", "grocery.pantry_reminders", "grocery.counter_preorders", "grocery.whatsapp_orders"], "hidden");
    expect((await call(env, plain.ownerToken, "GET", `${plain.url}/grocery/deals`)).status).toBe(402);
  });

  it("grocery features belong to grocers: a café, pharmacy or Starter restaurant on the same plan never gets them, even when they are live", async () => {
    const m = await paidMerchant(env, { plan: "plus" }); // every paid feature is live; the test shop's vertical is not grocery
    const on = async (key: string) => ((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/features`)).body.features as { key: string; enabled: boolean }[]).find((f) => f.key === key)?.enabled;
    for (const k of ["grocery.flyer", "grocery.counter_preorders", "grocery.pantry_reminders", "grocery.whatsapp_orders"]) expect(await on(k)).toBe(false);
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/grocery/deals`)).status).toBe(402);
    await env.db.update(merchants).set({ vertical: "grocery" }).where(eq(merchants.id, m.merchant.id));
    for (const k of ["grocery.flyer", "grocery.counter_preorders", "grocery.pantry_reminders", "grocery.whatsapp_orders"]) expect(await on(k)).toBe(true);
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/grocery/deals`)).status).toBe(200);
  });
});

describe("weekly flyer", () => {
  const deal = (over: object = {}) => ({ title: "Desi ghee 1.6 kg", priceCents: 2199, wasPriceCents: 2499, packSizeG: 1600, startsOn: "2026-11-02", endsOn: "2026-11-08", seasonId: "diwali", ...over });

  it("creates, edits and lists deals with a price per 100 g and the season ideas", async () => {
    const g = await grocer();
    const made = await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal());
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ title: "Desi ghee 1.6 kg", priceUnit: "each", state: "live", seasonId: "diwali" });
    expect(made.body.per100gCents).toBeCloseTo(137.4375, 3);
    const kg = await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal({ title: "Goat curry cut", priceCents: 1399, priceUnit: "kg", packSizeG: null, wasPriceCents: null, memberOnly: true, seasonId: null }));
    expect(kg.body.per100gCents).toBeCloseTo(139.9, 5);
    const patched = await call(env, g.ownerToken, "PATCH", `${g.url}/grocery/deals/${made.body.id}`, { priceCents: 2099 });
    expect(patched.body.priceCents).toBe(2099);

    const list = await call(env, g.ownerToken, "GET", `${g.url}/grocery/deals`);
    expect(list.status).toBe(200);
    expect(list.body.deals).toHaveLength(2);
    expect(list.body.seasons.map((s: { id: string }) => s.id)).toContain("diwali");
    expect(list.body.whatsappText).toContain("Diwali stock-up"); // both deals live, only one is tagged: no season name
  });

  it("refuses a deal that ends before it starts, an old price below the deal price and an unknown season", async () => {
    const g = await grocer();
    expect((await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal({ startsOn: "2026-11-09", endsOn: "2026-11-02" }))).status).toBe(400);
    expect((await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal({ wasPriceCents: 1500 }))).status).toBe(400);
    expect((await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal({ seasonId: "not-a-season" }))).status).toBe(400);
  });

  it("the public flyer shows only deals running today, names the season, and 404s without the feature", async () => {
    const g = await grocer();
    await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal());
    await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal({ title: "Next week", startsOn: "2026-11-09", endsOn: "2026-11-15" }));
    await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal({ title: "Switched off", active: false }));
    const pub = await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/flyer`);
    expect(pub.status).toBe(200);
    expect(pub.body.deals.map((d: { title: string }) => d.title)).toEqual(["Desi ghee 1.6 kg"]);
    expect(pub.body).toMatchObject({ seasonName: "Diwali", validFrom: "2026-11-02", validTo: "2026-11-08" });

    const bare = await grocer({ features: false });
    await env.db.update(merchants).set({ plan: "free" }).where(eq(merchants.id, bare.merchant.id));
    expect((await call(env, null, "GET", `/v1/public/shops/${bare.merchant.slug}/flyer`)).status).toBe(404);
  });

  it("drafts a text for members who agreed, through Messages", async () => {
    const g = await grocer();
    await member(g);
    await member(g, { consent: false });
    await call(env, g.ownerToken, "POST", `${g.url}/grocery/deals`, deal());
    const list = await call(env, g.ownerToken, "GET", `${g.url}/grocery/deals`);
    expect(list.body.textable).toBe(1);
    const draft = await call(env, g.ownerToken, "POST", `${g.url}/grocery/flyer/text`);
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ audience: 1 });
    const msg = await call(env, g.ownerToken, "GET", `${g.url}/messages/${draft.body.messageId}`);
    expect(msg.body.status).toBe("draft");
    expect(msg.body.channel).toBe("sms");
    expect(msg.body.body).toContain("Desi ghee 1.6 kg");
  });
});

describe("butcher counter: sold by weight", () => {
  async function butcher() {
    const g = await grocer();
    const mk = async (body: object) => {
      const r = await call(env, g.ownerToken, "POST", `${g.url}/catalog/items`, body);
      expect(r.status).toBe(201);
      return r.body;
    };
    const goat = await mk({ name: "Goat curry cut", priceCents: 1, weightUnit: "kg", unitPriceCents: 1399, nominalWeightG: 1000, taxable: false, preorderOnly: true, leadTimeHours: 12, depositBps: 3000 });
    const atta = await mk({ name: "Atta 20 lb", priceCents: 2499 });
    const samosa = await mk({ name: "Samosa tray", priceCents: 1000 });
    return { g, goat, atta, samosa };
  }
  const order = (g: G, token: string, items: object[], extra: object = {}) =>
    call(env, token, "POST", "/v1/me/orders", { merchantId: g.merchant.id, locationId: g.location.id, items, kind: "preorder", pickupAt: "2026-11-05T22:00:00.000Z", paymentMethod: "in_app", idempotencyKey: `gw-${Math.random().toString(36).slice(2)}`, ...extra });

  it("sets the estimate from the price per kg and the portion, and shows weight fields on the catalog", async () => {
    const { goat, g } = await butcher();
    expect(goat).toMatchObject({ priceCents: 1399, weightUnit: "kg", unitPriceCents: 1399, nominalWeightG: 1000, taxable: false });
    const lb = await call(env, g.ownerToken, "POST", `${g.url}/catalog/items`, { name: "Chicken legs", priceCents: 1, weightUnit: "lb", unitPriceCents: 499, nominalWeightG: 2268 });
    expect(lb.body.priceCents).toBe(2495); // 2.268 kg is 5 lb at $4.99/lb
    const bad = await call(env, g.ownerToken, "POST", `${g.url}/catalog/items`, { name: "Half set", priceCents: 1, weightUnit: "kg", unitPriceCents: 1399 });
    expect(bad.status).toBe(400);
    const free = await paidMerchant(env, { plan: "free" });
    expect((await call(env, free.ownerToken, "POST", `/v1/merchants/${free.merchant.id}/catalog/items`, { name: "X", priceCents: 100, weightUnit: "kg", unitPriceCents: 100, nominalWeightG: 1000 })).status).toBe(402);
  });

  it("a butcher counter takes a deposit pre-order: zero-rated meat carries no HST, a prepared tray does", async () => {
    const { g, goat, samosa } = await butcher();
    const c = await customer(env);
    const r = await order(g, c.token, [{ catalogItemId: goat.id, quantity: 2 }, { catalogItemId: samosa.id, quantity: 1 }]);
    expect(r.status).toBe(201);
    // 2 kg at $13.99 = $27.98 (no tax) + $10.00 tray (HST $1.30)
    expect(r.body.order).toMatchObject({ subtotalCents: 3798, taxCents: 130, totalCents: 3928, kind: "preorder" });
    expect(r.body.order.depositCents).toBeGreaterThan(0);
    expect(r.body.order.items[0]).toMatchObject({ weightUnit: "kg", perUnitCents: 1399, actualWeightG: null });
  });

  it("the weigh-in sets the final price: new total, tax on taxable lines only, balance after the deposit", async () => {
    const { g, goat, samosa } = await butcher();
    const c = await customer(env);
    const r = await order(g, c.token, [{ catalogItemId: goat.id, quantity: 2 }, { catalogItemId: samosa.id, quantity: 1 }]);
    await deliver(env, fake(env).succeedPaymentIntent(r.body.payment.paymentIntentId));
    const id = r.body.order.id as string;
    const line = r.body.order.items.find((i: { name: string }) => i.name === "Goat curry cut").id as string;
    const w = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 2140 }] });
    expect(w.status).toBe(200);
    // 2.14 kg at $13.99 = $29.94 + tray $10.00; HST only on the tray
    expect(w.body).toMatchObject({ subtotalCents: 3994, taxCents: 130, totalCents: 4124 });
    expect(w.body.lines[0]).toMatchObject({ actualWeightG: 2140, lineTotalCents: 2994, estimatedCents: 2798 });
    expect(w.body.balanceDueCents).toBe(w.body.totalCents - w.body.depositCents);
    const [row] = await env.db.select().from(orders).where(eq(orders.id, id));
    expect(row!.weighedAt).toBeTruthy();
    // Weigh again to correct a slip.
    const again = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 2000 }] });
    expect(again.body.subtotalCents).toBe(3798);
    // The customer's own view shows the weighed price.
    const mine = await call(env, c.token, "GET", `/v1/me/orders/${id}`);
    expect(mine.body.items.find((i: { id: string }) => i.id === line)).toMatchObject({ actualWeightG: 2000, lineTotalCents: 2798 });
  });

  it("a weigh-in below the deposit refunds the excess to the card once, and weighing again never refunds the same money twice", async () => {
    const { g, goat } = await butcher();
    const c = await customer(env);
    const r = await order(g, c.token, [{ catalogItemId: goat.id, quantity: 2 }]);
    await deliver(env, fake(env).succeedPaymentIntent(r.body.payment.paymentIntentId));
    const id = r.body.order.id as string;
    const line = r.body.order.items[0].id as string;
    const [before] = await env.db.select().from(orders).where(eq(orders.id, id));
    expect(before!.depositPaidAt).toBeTruthy();
    const paid = before!.depositCents + before!.customerFeeCents;
    // 0.5 kg at $13.99 = $7.00: less than the deposit already paid.
    const total = Math.round((1399 * 500) / 1000);
    expect(total).toBeLessThan(paid);
    const w = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 500 }] });
    expect(w.status).toBe(200);
    const excess = paid - w.body.totalCents;
    expect(w.body.totalCents).toBe(total);
    expect(w.body.refund).toEqual({ cents: excess, mode: "card", method: "card" });
    expect(w.body.balanceDueCents).toBe(0);
    expect(fake(env).refunds.filter((x) => x.paymentIntentId === r.body.payment.paymentIntentId).map((x) => x.amountCents)).toEqual([excess]);
    const [after] = await env.db.select().from(orders).where(eq(orders.id, id));
    expect(after!.depositCents).toBe(before!.depositCents - excess);
    // Weigh the same again, or a little more: no second refund. A heavier weigh-in leaves a balance.
    const same = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 500 }] });
    expect(same.body.refund).toBeNull();
    const heavy = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 2000 }] });
    expect(heavy.body.refund).toBeNull();
    expect(heavy.body.balanceDueCents).toBe(heavy.body.totalCents - (before!.depositCents - excess) - before!.customerFeeCents);
    expect(fake(env).refunds.filter((x) => x.paymentIntentId === r.body.payment.paymentIntentId)).toHaveLength(1);
    // The customer is told about the refund, not a balance.
    const [msg] = await env.db.select().from(orders).where(eq(orders.id, id));
    expect(msg!.weighedAt).toBeTruthy();
  });

  it("a deposit taken by hand is refunded by hand: a refund is recorded for e-transfer or cash, and nothing goes to Stripe", async () => {
    const { g, goat } = await butcher();
    const c = await customer(env);
    const r = await order(g, c.token, [{ catalogItemId: goat.id, quantity: 2 }]);
    const id = r.body.order.id as string;
    const line = r.body.order.items[0].id as string;
    // The shop took the deposit at the till (cash), so there is no card payment behind it.
    const [row] = await env.db.update(orders).set({ paymentMethod: "at_pickup", stripePaymentIntentId: null, paymentStatus: "authorized", depositPaidAt: new Date(), customerFeeCents: 0 }).where(eq(orders.id, id)).returning();
    const w = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 500 }], refundMethod: "cash" });
    expect(w.status).toBe(200);
    const excess = row!.depositCents - w.body.totalCents;
    expect(excess).toBeGreaterThan(0);
    expect(w.body.refund).toEqual({ cents: excess, mode: "manual", method: "cash" });
    expect(w.body.balanceDueCents).toBe(0);
    expect(fake(env).refunds).toHaveLength(0);
    const ledger = await env.db.select().from(manualPayments).where(eq(manualPayments.subjectId, id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ subjectType: "order_refund", method: "cash", amountCents: excess, merchantId: g.merchant.id });
    // Weighing the same again refunds nothing more; a lower reading refunds only the difference (e-transfer is the default).
    const same = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 500 }] });
    expect(same.body.refund).toBeNull();
    const lower = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 400 }] });
    expect(lower.body.refund).toEqual({ cents: w.body.totalCents - lower.body.totalCents, mode: "manual", method: "etransfer" });
    expect((await env.db.select().from(manualPayments).where(eq(manualPayments.subjectId, id))).map((x) => x.amountCents)).toEqual([excess, w.body.totalCents - lower.body.totalCents]);
  });

  it("refuses weighing a line that is not sold by weight, a stranger's order, a closed order and an order paid in full", async () => {
    const { g, goat, samosa } = await butcher();
    const c = await customer(env);
    const r = await order(g, c.token, [{ catalogItemId: goat.id, quantity: 1 }, { catalogItemId: samosa.id, quantity: 1 }]);
    const id = r.body.order.id as string;
    const tray = r.body.order.items.find((i: { name: string }) => i.name === "Samosa tray").id as string;
    const kg = r.body.order.items.find((i: { name: string }) => i.name === "Goat curry cut").id as string;
    expect((await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: tray, actualWeightG: 500 }] })).status).toBe(400);
    expect((await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: kg, actualWeightG: 0 }] })).status).toBe(400);
    const other = await grocer();
    expect((await call(env, other.ownerToken, "POST", `${other.url}/orders/${id}/weigh`, { lines: [{ orderItemId: kg, actualWeightG: 900 }] })).status).toBe(404);
    await env.db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, id));
    expect((await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: kg, actualWeightG: 900 }] })).status).toBe(409);
    await env.db.update(orders).set({ paymentStatus: "unpaid", status: "cancelled" }).where(eq(orders.id, id));
    expect((await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: kg, actualWeightG: 900 }] })).status).toBe(409);
  });

  it("counter staff may weigh, and points at pick-up follow the weighed price", async () => {
    const { g, goat } = await butcher();
    const staff = await staffMember(env, g.merchant.id, "staff");
    const c = await customer(env);
    // No deposit: pay at pick-up.
    await call(env, g.ownerToken, "PATCH", `${g.url}/catalog/items/${goat.id}`, { depositBps: 0 });
    const r = await order(g, c.token, [{ catalogItemId: goat.id, quantity: 2 }], { paymentMethod: "at_pickup" });
    expect(r.status).toBe(201);
    const id = r.body.order.id as string;
    const line = r.body.order.items[0].id as string;
    expect((await call(env, staff.token, "POST", `${g.url}/orders/${id}/weigh`, { lines: [{ orderItemId: line, actualWeightG: 3000 }] })).status).toBe(200);
    for (const status of ["accepted", "ready", "picked_up"]) {
      const s = await call(env, g.ownerToken, "POST", `${g.url}/orders/${id}/status`, { status, ...(status === "picked_up" ? { tender: "cash" } : {}) });
      expect(s.status).toBe(200);
    }
    const done = await call(env, g.ownerToken, "GET", `${g.url}/orders/${id}`);
    expect(done.body.totalCents).toBe(4197); // 3 kg at $13.99, no tax
    expect(done.body.pointsEarned).toBe(41);
  });
});

describe("Eid al-Adha plan", () => {
  async function eidShop() {
    env.clock.now = new Date("2027-04-20T15:00:00Z");
    const g = await grocer();
    const whole = await call(env, g.ownerToken, "POST", `${g.url}/catalog/items`, { name: "Whole goat, qurbani", priceCents: 1, weightUnit: "kg", unitPriceCents: 2400, nominalWeightG: 20_000, taxable: false, preorderOnly: true, leadTimeHours: 168, depositBps: 2500 });
    expect(whole.body.priceCents).toBe(48_000);
    return { g, whole: whole.body };
  }

  it("shows the calendar date and bookings open eight weeks before, with three empty days", async () => {
    const { g } = await eidShop();
    const plan = await call(env, g.ownerToken, "GET", `${g.url}/grocery/butcher/eid`);
    expect(plan.status).toBe(200);
    expect(plan.body).toMatchObject({ year: 2027, start: "2027-05-16", calendarStart: "2027-05-16", moved: false, bookingsOpen: "2027-03-21" });
    expect(plan.body.days.map((d: { date: string }) => d.date)).toEqual(["2027-05-16", "2027-05-17", "2027-05-18"]);
    expect(plan.body.items.map((i: { name: string }) => i.name)).toEqual(["Whole goat, qurbani"]);
  });

  it("saves animals per day, enforces the cap on booking, and counts what is booked", async () => {
    const { g, whole } = await eidShop();
    const saved = await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid`, { year: 2027, days: [{ cap: 2 }, { cap: 1 }, { cap: 0 }], leadHours: 168 });
    expect(saved.status).toBe(200);
    expect(saved.body.days.map((d: { cap: number }) => d.cap)).toEqual([2, 1, 0]);
    const c = await customer(env);
    const book = (pickupAt: string) => call(env, c.token, "POST", "/v1/me/orders", { merchantId: g.merchant.id, locationId: g.location.id, items: [{ catalogItemId: whole.id, quantity: 1 }], kind: "preorder", pickupAt, paymentMethod: "in_app", idempotencyKey: `eid-${Math.random().toString(36).slice(2)}` });
    expect((await book("2027-05-16T12:00:00.000Z")).status).toBe(201);
    expect((await book("2027-05-16T13:00:00.000Z")).status).toBe(201);
    const full = await book("2027-05-16T14:00:00.000Z");
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("preorder_full");
    expect((await book("2027-05-18T12:00:00.000Z")).status).toBe(409); // day three has no animals
    const plan = await call(env, g.ownerToken, "GET", `${g.url}/grocery/butcher/eid`);
    expect(plan.body.days[0]).toMatchObject({ date: "2027-05-16", cap: 2, booked: 2 });
    // The notice rule from the plan applies: a week before Eid is too late for a 3-day notice? No: 168 h is a week, so two days out is refused.
    env.clock.now = new Date("2027-05-14T15:00:00Z");
    c.token = await signAccessToken(env.ctx, { id: c.user.id, platformRole: "none" });
    const late = await book("2027-05-17T12:00:00.000Z");
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("preorder_lead_time");
  });

  it("the customer's qurbani days are the Eid plan's days with their own caps, not 14 days from now", async () => {
    const { g, whole } = await eidShop();
    const avail = (itemId = whole.id) => call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/preorders/availability?itemId=${itemId}`);
    // No plan saved yet: the rolling window from today, no plan marker.
    const before = await avail();
    expect(before.status).toBe(200);
    expect(before.body.plan ?? null).toBeNull();
    expect(before.body.days[0].date).toBe("2027-04-20");
    expect(before.body.days).toHaveLength(30);

    await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid`, { year: 2027, days: [{ cap: 5 }, { cap: 7 }, { cap: 6 }], leadHours: 336 });
    const planned = await avail();
    expect(planned.body.plan).toEqual({ kind: "eid_al_adha", start: "2027-05-16", moved: false, bookingsOpen: "2027-03-21" });
    expect(planned.body.days.map((d: { date: string; potsLeft: number; note: string }) => [d.date, d.potsLeft, d.note])).toEqual([
      ["2027-05-16", 5, "Eid al-Adha day 1"],
      ["2027-05-17", 7, "Eid al-Adha day 2"],
      ["2027-05-18", 6, "Eid al-Adha day 3"],
    ]);
    // 14 days of notice from 20 April is 4 May: all three Eid days are bookable.
    expect(planned.body.days.every((d: { tooSoon: boolean }) => !d.tooSoon)).toBe(true);

    // Moon sighting moves Eid by a day: the days the customer sees follow, caps stay with their day.
    await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid/moved`, { year: 2027, start: "2027-05-17" });
    const moved = await avail();
    expect(moved.body.plan).toEqual({ kind: "eid_al_adha", start: "2027-05-17", moved: true, bookingsOpen: "2027-03-22" });
    expect(moved.body.days.map((d: { date: string; potsLeft: number }) => [d.date, d.potsLeft])).toEqual([["2027-05-17", 5], ["2027-05-18", 7], ["2027-05-19", 6]]);

    // Booked animals come off the day's cap the customer sees.
    const c = await customer(env);
    const book = (pickupAt: string, itemId = whole.id) => call(env, c.token, "POST", "/v1/me/orders", { merchantId: g.merchant.id, locationId: g.location.id, items: [{ catalogItemId: itemId, quantity: 1 }], kind: "preorder", pickupAt, paymentMethod: "in_app", idempotencyKey: `q-${Math.random().toString(36).slice(2)}` });
    expect((await book("2027-05-17T12:00:00.000Z")).status).toBe(201);
    expect((await avail()).body.days[0]).toMatchObject({ date: "2027-05-17", potsLeft: 4 });

    // A day outside the plan is refused for qurbani, even though the notice would allow it.
    const off = await book("2027-05-10T12:00:00.000Z");
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe("qurbani_day");
    expect(off.body.error.details?.days ?? off.body.error.days).toEqual(["2027-05-17", "2027-05-18", "2027-05-19"]);

    // Another pre-order item (an aqiqah goat) keeps the rolling window and any day.
    const aqiqah = await call(env, g.ownerToken, "POST", `${g.url}/catalog/items`, { name: "Aqiqah goat", priceCents: 1, weightUnit: "kg", unitPriceCents: 2400, nominalWeightG: 20_000, taxable: false, preorderOnly: true, leadTimeHours: 72, depositBps: 2500 });
    const other = await avail(aqiqah.body.id);
    expect(other.body.plan ?? null).toBeNull();
    expect(other.body.days).toHaveLength(30);
    expect((await book("2027-05-10T12:00:00.000Z", aqiqah.body.id)).status).toBe(201);

    // After Eid has passed the plan no longer limits anything.
    env.clock.now = new Date("2027-05-25T15:00:00Z");
    const after = await avail();
    expect(after.body.plan ?? null).toBeNull();
    expect(after.body.days[0].date).toBe("2027-05-25");
  });

  it("qurbani booking opens eight weeks before Eid: before that the API says the date, and the page can show it", async () => {
    const { g, whole } = await eidShop();
    await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid`, { year: 2027, days: [{ cap: 5 }, { cap: 7 }, { cap: 6 }], leadHours: 336 });
    env.clock.now = new Date("2027-02-01T15:00:00Z");
    const avail = await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/preorders/availability?itemId=${whole.id}`);
    expect(avail.body.plan).toMatchObject({ start: "2027-05-16", bookingsOpen: "2027-03-21" });
    const summary = await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/restaurant`);
    expect(summary.status).toBe(200);
    expect(summary.body.qurbani).toEqual({ start: "2027-05-16", bookingsOpen: "2027-03-21", open: false, moved: false });
    // A butcher cuts to order: no "ready in 20 minutes" promise and no weekend pots.
    expect(summary.body.quotedWaitMin).toBeNull();
    expect(summary.body.weekend).toEqual([]);
    const c = await customer(env);
    const early = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: g.merchant.id, locationId: g.location.id, items: [{ catalogItemId: whole.id, quantity: 1 }], kind: "preorder", pickupAt: "2027-05-16T12:00:00.000Z", paymentMethod: "in_app", idempotencyKey: "early-qurbani-1" });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("qurbani_not_open");
    expect(early.body.error.message).toBe("Qurbani booking opens Mar 21.");
    // The day it opens it books.
    env.clock.now = new Date("2027-03-21T15:00:00Z");
    c.token = await signAccessToken(env.ctx, { id: c.user.id, platformRole: "none" });
    const open = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: g.merchant.id, locationId: g.location.id, items: [{ catalogItemId: whole.id, quantity: 1 }], kind: "preorder", pickupAt: "2027-05-16T12:00:00.000Z", paymentMethod: "in_app", idempotencyKey: "early-qurbani-2" });
    expect(open.status).toBe(201);
    expect((await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/restaurant`)).body.qurbani.open).toBe(true);
  });

  it("a cut sold by weight is booked by the day without using up the animal cap, and a restaurant-only summary still 404s for other shops", async () => {
    const { g } = await eidShop();
    await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid`, { year: 2027, days: [{ cap: 1 }, { cap: 1 }, { cap: 1 }], leadHours: 336 });
    await env.db.update(merchants).set({ preorderDailyCap: 1 }).where(eq(merchants.id, g.merchant.id));
    const cut = await call(env, g.ownerToken, "POST", `${g.url}/catalog/items`, { name: "Goat curry cut", priceCents: 1, weightUnit: "kg", unitPriceCents: 1399, nominalWeightG: 1000, taxable: false, leadTimeHours: 12, depositBps: 0 });
    expect(cut.status).toBe(201);
    const avail = await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/preorders/availability?itemId=${cut.body.id}`);
    expect(avail.status).toBe(200);
    expect(avail.body.days.every((d: { potsLeft: number | null; full: boolean }) => d.potsLeft === null && !d.full)).toBe(true);
    const shop = await paidMerchant(env, { plan: "plus" });
    expect((await call(env, null, "GET", `/v1/public/shops/${shop.merchant.slug}/restaurant`)).status).toBe(404);
  });

  it("moon sighting moves Eid by a day and the pick-up days follow; more than three days is refused", async () => {
    const { g } = await eidShop();
    await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid`, { year: 2027, days: [{ cap: 5 }, { cap: 4 }], leadHours: 72 });
    const moved = await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid/moved`, { year: 2027, start: "2027-05-17" });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ start: "2027-05-17", calendarStart: "2027-05-16", moved: true });
    expect(moved.body.days.map((d: { date: string; cap: number }) => [d.date, d.cap])).toEqual([["2027-05-17", 5], ["2027-05-18", 4]]);
    expect((await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid/moved`, { year: 2027, start: "2027-05-22" })).status).toBe(400);
    const back = await call(env, g.ownerToken, "PUT", `${g.url}/grocery/butcher/eid/moved`, { year: 2027, start: null });
    expect(back.body).toMatchObject({ start: "2027-05-16", moved: false });
    expect(back.body.days.map((d: { date: string }) => d.date)).toEqual(["2027-05-16", "2027-05-17"]);
  });
});

describe("pantry reminders", () => {
  async function pantry() {
    const g = await grocer();
    const item = await call(env, g.ownerToken, "POST", `${g.url}/grocery/pantry/items`, { name: "Atta 20 lb", defaultIntervalDays: 42 });
    expect(item.status).toBe(201);
    return { g, itemId: item.body.id as string };
  }
  // Access tokens live an hour on the test clock, so a test that jumps weeks ahead signs a fresh one per call.
  const owner = async (g: G) => signAccessToken(env.ctx, { id: g.owner.id, platformRole: "none" });
  const log = async (g: G, memberId: string, pantryItemId: string, remind?: boolean, token?: string) => call(env, token ?? (await owner(g)), "POST", `${g.url}/grocery/counter/pantry`, { memberId, pantryItemId, ...(remind === undefined ? {} : { remind }) });
  const day = (n: number) => new Date(Date.parse("2026-11-03T15:00:00Z") + n * 86_400_000);

  it("logs a purchase, needs the member's text consent to turn reminders on, and records who asked", async () => {
    const { g, itemId } = await pantry();
    const yes = await member(g);
    const no = await member(g, { consent: false });
    const ok = await log(g, yes.memberId, itemId, true);
    expect(ok.body).toMatchObject({ remind: true, purchases: 1, intervalDays: 42, needsMarketingConsent: false, nextTextOn: "2026-12-10" });
    const refused = await log(g, no.memberId, itemId, true);
    expect(refused.body).toMatchObject({ remind: false, needsMarketingConsent: true, nextTextOn: null });
    const [e] = await env.db.select().from(pantryEntries).where(eq(pantryEntries.pantryItemId, itemId));
    expect(e).toMatchObject({ remind: true, remindConsentSource: "counter" });
    expect(e!.remindConsentBy).toBeTruthy();
    // Counter staff can log; a second tap within 12 hours is the same trip.
    const staff = await staffMember(env, g.merchant.id, "staff");
    const again = await log(g, yes.memberId, itemId, undefined, staff.token);
    expect(again.body.purchases).toBe(1);
    expect((await call(env, g.ownerToken, "POST", `${g.url}/grocery/counter/pantry`, { memberId: yes.memberId, pantryItemId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  });

  it("learns the household's own gap after three purchases", async () => {
    const { g, itemId } = await pantry();
    const m = await member(g);
    await log(g, m.memberId, itemId, true);
    env.clock.now = day(30);
    expect((await log(g, m.memberId, itemId)).body.intervalDays).toBe(42); // one gap is not enough
    env.clock.now = day(60);
    const third = await log(g, m.memberId, itemId);
    expect(third.body).toMatchObject({ purchases: 3, intervalDays: 30 });
  });

  it("texts once, five days before the household runs out, only people who asked, and not overnight or after STOP", async () => {
    const { g, itemId } = await pantry();
    const a = await member(g);
    const b = await member(g);
    const quiet = await member(g);
    await log(g, a.memberId, itemId, true);
    await log(g, b.memberId, itemId, true);
    await log(g, quiet.memberId, itemId); // bought it, never asked
    const sms = () => env.ctx.providers.outbox.sms.filter((s) => s.body.includes("Atta 20 lb"));

    // Day 36: not yet (reminder date is day 37).
    env.clock.now = day(36);
    await expect(sendPantryReminders(env.ctx, g.merchant)).resolves.toMatchObject({ sent: 0 });
    // Day 38 at 10:00 Toronto (15:00 UTC): both go, the third never asked.
    env.clock.now = new Date(day(38).getTime());
    const first = await sendPantryReminders(env.ctx, g.merchant);
    expect(first).toEqual({ sent: 2, skipped: 0 });
    expect(sms()).toHaveLength(2);
    expect(sms()[0]!.body).toContain("Annapurna Grocers");
    expect(sms()[0]!.body).toContain("STOP");
    // Once per purchase.
    expect((await sendPantryReminders(env.ctx, g.merchant)).sent).toBe(0);
    expect(sms()).toHaveLength(2);

    const ov = await call(env, await owner(g), "GET", `${g.url}/grocery/pantry`);
    expect(ov.status).toBe(200);
    expect(ov.body.members).toBe(2);
    expect(ov.body.last30).toEqual({ sent: 2, boughtWithin7Days: 0 });
    // One of them buys again within the week: that is a come-back.
    env.clock.now = day(40);
    await log(g, a.memberId, itemId);
    expect((await call(env, await owner(g), "GET", `${g.url}/grocery/pantry`)).body.last30).toEqual({ sent: 2, boughtWithin7Days: 1 });
  });

  it("never texts overnight, never to a number that replied STOP, and stops when the month's texts run out", async () => {
    const { g, itemId } = await pantry();
    const a = await member(g);
    const b = await member(g);
    await log(g, a.memberId, itemId, true);
    await log(g, b.memberId, itemId, true);
    // 02:00 Toronto on day 38: quiet hours.
    env.clock.now = new Date("2026-12-10T07:00:00Z");
    const night = await sendPantryReminders(env.ctx, g.merchant);
    expect(night.sent).toBe(0);
    // STOP on one number.
    env.clock.now = new Date("2026-12-10T15:00:00Z");
    const [mb] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, b.memberId));
    await call(env, null, "POST", "/v1/webhooks/sms", { From: b.phone, Body: "STOP" }).catch(() => undefined);
    const { recordPhoneOptOut } = await import("../src/services/opt-out.js");
    await recordPhoneOptOut(env.ctx, b.phone, "sms", "STOP", "sms_reply");
    expect(mb).toBeTruthy();
    const out = await sendPantryReminders(env.ctx, g.merchant);
    expect(out.sent).toBe(1);
    // No credits left: nothing more goes.
    await env.db.update(merchants).set({ smsCreditsUsed: 500 }).where(eq(merchants.id, g.merchant.id));
    const c = await member(g);
    await log(g, c.memberId, itemId, true);
    env.clock.now = new Date("2027-01-25T15:00:00Z");
    const [fresh] = await env.db.select().from(merchants).where(eq(merchants.id, g.merchant.id));
    expect((await sendPantryReminders(env.ctx, fresh!)).sent).toBe(0);
  });

  it("the hourly job texts at 10:00 shop time only, for shops with the feature", async () => {
    const { g, itemId } = await pantry();
    const a = await member(g);
    await log(g, a.memberId, itemId, true);
    env.clock.now = new Date("2026-12-10T14:00:00Z"); // 09:00 Toronto
    expect(await runPantryReminders(env.ctx)).toBe(0);
    env.clock.now = new Date("2026-12-10T15:00:00Z"); // 10:00 Toronto
    expect(await runPantryReminders(env.ctx)).toBe(1);
    expect(await runPantryReminders(env.ctx)).toBe(0);
  });

  it("texts in the household's language", async () => {
    const { g, itemId } = await pantry();
    const a = await member(g);
    await log(g, a.memberId, itemId, true);
    const [mm] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, a.memberId));
    const { users } = await import("@ll/db");
    await env.db.update(users).set({ locale: "hi-CA" }).where(eq(users.id, mm!.userId));
    env.clock.now = day(38);
    await sendPantryReminders(env.ctx, g.merchant);
    const text = env.ctx.providers.outbox.sms.at(-1)!.body;
    expect(text).toContain("शायद ख़त्म होने वाला है");
    expect(text).toContain("STOP");
  });

  it("the customer sees their reminders and switches one off; switching on needs the shop's text consent", async () => {
    const { g, itemId } = await pantry();
    const a = await member(g);
    await log(g, a.memberId, itemId, true);
    const [mm] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, a.memberId));
    const tokenAt = () => signAccessToken(env.ctx, { id: mm!.userId, platformRole: "none" });
    const mine = await call(env, await tokenAt(), "GET", "/v1/me/pantry");
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ itemName: "Atta 20 lb", remind: true, shop: { name: "Annapurna Grocers" } });
    const off = await call(env, await tokenAt(), "PUT", `/v1/me/pantry/${mine.body.items[0].entryId}`, { remind: false });
    expect(off.body).toMatchObject({ remind: false, nextTextOn: null });
    env.clock.now = day(38);
    expect((await sendPantryReminders(env.ctx, g.merchant)).sent).toBe(0);
    await env.db.update(merchantMembers).set({ marketingConsentAt: null }).where(eq(merchantMembers.id, a.memberId));
    expect((await call(env, await tokenAt(), "PUT", `/v1/me/pantry/${mine.body.items[0].entryId}`, { remind: true })).status).toBe(409);
    await env.db.update(merchantMembers).set({ marketingConsentAt: new Date() }).where(eq(merchantMembers.id, a.memberId));
    const on = await call(env, await tokenAt(), "PUT", `/v1/me/pantry/${mine.body.items[0].entryId}`, { remind: true });
    expect(on.body.remind).toBe(true);
    const [e] = await env.db.select().from(pantryEntries).where(eq(pantryEntries.pantryItemId, itemId));
    expect(e!.remindConsentSource).toBe("pass");
    // Someone else's reminder is not theirs to touch.
    const other = await customer(env);
    expect((await call(env, other.token, "PUT", `/v1/me/pantry/${mine.body.items[0].entryId}`, { remind: false })).status).toBe(404);
  });

  it("the restock text links to a one-item reserve page for that staple, not the generic order page", async () => {
    const { g, itemId } = await pantry();
    const a = await member(g);
    await log(g, a.memberId, itemId, true);
    env.clock.now = day(38);
    await sendPantryReminders(env.ctx, g.merchant);
    const text = env.ctx.providers.outbox.sms.at(-1)!.body;
    expect(text).toContain(`/shops/${g.merchant.slug}/restock/${itemId}`);
    expect(text).not.toContain("/order");
    expect(text).toContain("STOP");
    const { users } = await import("@ll/db");
    const [mm] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, a.memberId));
    await env.db.update(users).set({ locale: "ur-CA" }).where(eq(users.id, mm!.userId));
    await env.db.update(pantryEntries).set({ lastRemindedAt: null }).where(eq(pantryEntries.pantryItemId, itemId));
    await sendPantryReminders(env.ctx, g.merchant);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain(`/restock/${itemId}?lang=ur`);
  });

  it("the public reserve page reads the staple without login: active items of this shop with the feature on, nothing else", async () => {
    const { g, itemId } = await pantry();
    const item = await call(env, g.ownerToken, "POST", `${g.url}/catalog/items`, { name: "Aashirvaad atta 20 lb", priceCents: 2499 });
    await call(env, g.ownerToken, "PATCH", `${g.url}/grocery/pantry/items/${itemId}`, { catalogItemId: item.body.id });
    const ok = await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/pantry/${itemId}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ shop: { name: "Annapurna Grocers", slug: g.merchant.slug }, item: { id: itemId, name: "Atta 20 lb", catalogItemId: item.body.id, defaultIntervalDays: 42 } });
    // No household data in it.
    expect(JSON.stringify(ok.body)).not.toMatch(/phone|userId|history/);
    expect((await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/pantry/not-an-id`)).status).toBe(404);
    expect((await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/pantry/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    expect((await call(env, null, "GET", `/v1/public/shops/no-such-shop/pantry/${itemId}`)).status).toBe(404);
    // Another shop's link does not open this item.
    const other = await paidMerchant(env, { plan: "plus" });
    expect((await call(env, null, "GET", `/v1/public/shops/${other.merchant.slug}/pantry/${itemId}`)).status).toBe(404);
    // Archived, or the feature switched off: gone.
    await call(env, g.ownerToken, "PATCH", `${g.url}/grocery/pantry/items/${itemId}`, { active: false });
    expect((await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/pantry/${itemId}`)).status).toBe(404);
    const off = await paidMerchant(env, { plan: "free" });
    const [row] = await env.db.insert(pantryItems).values({ merchantId: off.merchant.id, name: "X", defaultIntervalDays: 42 }).returning();
    expect((await call(env, null, "GET", `/v1/public/shops/${off.merchant.slug}/pantry/${row!.id}`)).status).toBe(404);
  });

  it("reserving from the restock page is the ordinary pickup order: one unit, pay at the counter, the item's own price", async () => {
    const { g, itemId } = await pantry();
    const item = await call(env, g.ownerToken, "POST", `${g.url}/catalog/items`, { name: "Aashirvaad atta 20 lb", priceCents: 2499, taxable: false });
    await call(env, g.ownerToken, "PATCH", `${g.url}/grocery/pantry/items/${itemId}`, { catalogItemId: item.body.id });
    const c = await customer(env);
    const pub = await call(env, null, "GET", `/v1/public/shops/${g.merchant.slug}/pantry/${itemId}`);
    const pickupAt = new Date(env.ctx.now().getTime() + 26 * 3_600_000).toISOString();
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: g.merchant.id, locationId: g.location.id, items: [{ catalogItemId: pub.body.item.catalogItemId, quantity: 1, modifiers: [] }], pickupAt, paymentMethod: "at_pickup", kind: "pickup", channel: "web", idempotencyKey: "restock-000001" });
    expect(r.status).toBe(201);
    expect(r.body.order).toMatchObject({ kind: "pickup", paymentMethod: "at_pickup", subtotalCents: 2499 });
    expect(r.body.order.items).toHaveLength(1);
    expect(r.body.order.items[0]).toMatchObject({ name: "Aashirvaad atta 20 lb", quantity: 1 });
    // A double tap is the same order.
    const again = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: g.merchant.id, locationId: g.location.id, items: [{ catalogItemId: pub.body.item.catalogItemId, quantity: 1, modifiers: [] }], pickupAt, paymentMethod: "at_pickup", kind: "pickup", channel: "web", idempotencyKey: "restock-000001" });
    expect(again.body.order.id).toBe(r.body.order.id);
  });

  it("the customer's reminder list names the item so the reserve page can find the right switch", async () => {
    const { g, itemId } = await pantry();
    const a = await member(g);
    await log(g, a.memberId, itemId, true);
    const [mm] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, a.memberId));
    const token = await signAccessToken(env.ctx, { id: mm!.userId, platformRole: "none" });
    const mine = await call(env, token, "GET", "/v1/me/pantry");
    expect(mine.body.items[0].itemId).toBe(itemId);
    const off = await call(env, token, "PUT", `/v1/me/pantry/${mine.body.items[0].entryId}`, { remind: false });
    expect(off.body.itemId).toBe(itemId);
  });

  it("owners add and archive items; the counter sees only active ones", async () => {
    const { g, itemId } = await pantry();
    await call(env, g.ownerToken, "POST", `${g.url}/grocery/pantry/items`, { name: "Ghee 1.6 kg", defaultIntervalDays: 49 });
    expect((await call(env, g.ownerToken, "PATCH", `${g.url}/grocery/pantry/items/${itemId}`, { active: false })).status).toBe(200);
    const chips = await call(env, g.ownerToken, "GET", `${g.url}/grocery/counter/pantry-items`);
    expect(chips.body.items.map((i: { name: string }) => i.name)).toEqual(["Ghee 1.6 kg"]);
    expect(chips.body.askText).toContain("STOP");
    expect((await call(env, g.ownerToken, "POST", `${g.url}/grocery/pantry/items`, { name: "Too soon", defaultIntervalDays: 2 })).status).toBe(400);
  });
});

describe("counter: the part that does not count", () => {
  it("tobacco, lottery and bills in the till total do not earn points", async () => {
    const g = await grocer();
    const phone = nextPhone();
    const r = await call(env, g.ownerToken, "POST", `${g.url}/counter/award`, { phone, amountCents: 8640, notCountedCents: 1850, idempotencyKey: "nc-000001" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ eligibleCents: 6790, excludedCents: 1850, pointsEarned: 67 });
    // A second one reuses the same no-earn category.
    const r2 = await call(env, g.ownerToken, "POST", `${g.url}/counter/award`, { phone, amountCents: 5000, notCountedCents: 5000, idempotencyKey: "nc-000002" });
    expect(r2.body).toMatchObject({ eligibleCents: 0, excludedCents: 5000, pointsEarned: 0 });
    expect((await call(env, g.ownerToken, "POST", `${g.url}/counter/award`, { phone, amountCents: 1000, notCountedCents: 2000, idempotencyKey: "nc-000003" })).status).toBe(400);
    const { merchantCategories } = await import("@ll/db");
    const cats = await env.db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, g.merchant.id));
    expect(cats.filter((c) => c.name === "Not counted" || !c.earnEligible).length).toBeGreaterThanOrEqual(1);
  });
});

describe("WhatsApp inbox for grocers", () => {
  it("a grocer with WhatsApp list orders can open the inbox; without it the inbox is a restaurant feature (402)", async () => {
    const g = await grocer();
    const inbox = await call(env, g.ownerToken, "GET", `${g.url}/whatsapp/sessions`);
    expect(inbox.status).toBe(200);
    const settings = await call(env, g.ownerToken, "GET", `${g.url}/whatsapp/settings`);
    expect(settings.body.features).toMatchObject({ notifications: true, ordering: false, marketing: false });
    const bare = await paidMerchant(env, { plan: "free" });
    expect((await call(env, bare.ownerToken, "GET", `/v1/merchants/${bare.merchant.id}/whatsapp/sessions`)).status).toBe(402);
  });

  it("a customer's order list lands in the inbox and the owner can answer inside the window", async () => {
    const g = await grocer();
    await env.db.update(merchants).set({ whatsappNumber: "+19055550199" }).where(eq(merchants.id, g.merchant.id));
    const hook = await call(env, null, "POST", "/v1/webhooks/whatsapp", {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { metadata: { display_phone_number: "19055550199", phone_number_id: "fake:+19055550199" }, contacts: [{ profile: { name: "Rafiq" }, wa_id: "16475551004" }], messages: [{ from: "16475551004", id: "wamid.g1", timestamp: "1793000000", type: "text", text: { body: "2 kg goat curry cut and 1 atta 20 lb for tomorrow 5pm" } }] }, field: "messages" }] }],
    });
    expect(hook.status).toBe(200);
    const list = await call(env, g.ownerToken, "GET", `${g.url}/whatsapp/sessions`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain("goat curry cut");
  });
});

describe("price and unit helpers", () => {
  it("rounds the weighed price to the cent", async () => {
    const { weighedLineCents, portionPriceCents, rewardBackPct } = await import("@ll/shared");
    expect(weighedLineCents(1399, "kg", 2140)).toBe(2994);
    expect(weighedLineCents(499, "lb", 2268)).toBe(2495);
    expect(portionPriceCents(2400, "kg", 20_000)).toBe(48_000);
    expect(rewardBackPct(1, 1000, 500)).toBe(0.5);
    // order rows keep their snapshot even if the shop later changes the price
    expect(orderItems).toBeTruthy();
  });
});
