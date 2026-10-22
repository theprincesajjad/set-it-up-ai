import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchants } from "@ll/db";
import { call, customer, deliver, fake, paidMerchant } from "./commerce-fixtures.js";
import { createTestEnv, grantFeatures, type TestEnv } from "./helpers.js";

let env: TestEnv;
const T0 = new Date("2026-11-03T15:00:00Z");
beforeEach(async () => {
  env = await createTestEnv({ now: T0 });
});
afterEach(async () => env.close());

const view = (id: string, cs?: string) => call(env, null, "GET", `/v1/public/payments/${id}${cs === undefined ? "" : `?cs=${encodeURIComponent(cs)}`}`);

describe("GET /public/payments/:paymentIntentId", () => {
  it("describes a tiffin charge, and flips to succeeded once paid", async () => {
    const m = await paidMerchant(env, { plan: "free" });
    await grantFeatures(env, m.merchant.id, ["restaurant.tiffin"]);
    await env.db.update(merchants).set({ logoUrl: "https://example.com/logo.png", brandColor: "#0f766e" }).where(eq(merchants.id, m.merchant.id));
    const plan = (await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/tiffin/plans`, { name: "Veg thali, weekdays", cadence: "monthly", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 12000, extraServingCents: 6000, deliveryFeeCents: 1000, cutoffHours: 24 })).body;
    const c = await customer(env);
    const sub = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", { planId: plan.id, servings: 1, fulfilment: "delivery", address: "12 Queen St W", postalCode: "L4T 1A1", startDate: "2026-11-04" });
    expect(sub.status).toBe(201);
    const { paymentIntentId, clientSecret } = sub.body.payment;

    const r = await view(paymentIntentId, clientSecret);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      merchant: { name: m.merchant.name, slug: m.merchant.slug, logoUrl: "https://example.com/logo.png", brandColor: "#0f766e" },
      amountCents: 13000,
      currency: "CAD",
      kind: "tiffin",
      status: "requires_payment",
    });
    expect(r.body.description).toContain("Veg thali, weekdays");

    expect((await deliver(env, fake(env).succeedPaymentIntent(paymentIntentId))).statusCode).toBe(200);
    expect((await view(paymentIntentId, clientSecret)).body.status).toBe("succeeded");
  });

  it("describes a hall deposit", async () => {
    const m = await paidMerchant(env, { plan: "free" });
    await env.db.update(merchants).set({ restaurantTier: "pro" }).where(eq(merchants.id, m.merchant.id));
    const hall = (await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/banquet/halls`, { name: "Zaitoon Hall", capacity: 250, baseCents: 150000, depositBps: 2500 })).body;
    const c = await customer(env);
    const hold = await call(env, c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 100, startsAt: "2026-12-12T17:00:00Z", endsAt: "2026-12-12T23:00:00Z" });
    expect(hold.status).toBe(201);
    const r = await view(hold.body.deposit.paymentIntentId, hold.body.deposit.clientSecret);
    expect(r.body).toMatchObject({ kind: "hall_deposit", amountCents: hold.body.deposit.amountCents, status: "requires_payment" });
    expect(r.body.description).toContain("Zaitoon Hall");
  });

  it("treats a missing, wrong or foreign client secret and an unknown intent as not found", async () => {
    const m = await paidMerchant(env, { plan: "free" });
    await env.db.update(merchants).set({ restaurantTier: "pro" }).where(eq(merchants.id, m.merchant.id));
    const hall = (await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/banquet/halls`, { name: "Noor Room", capacity: 80, baseCents: 50000, depositBps: 2500 })).body;
    const c = await customer(env);
    const a = (await call(env, c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 40, startsAt: "2026-12-12T17:00:00Z", endsAt: "2026-12-12T23:00:00Z" })).body.deposit;
    const b = (await call(env, c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 40, startsAt: "2026-12-14T17:00:00Z", endsAt: "2026-12-14T23:00:00Z" })).body.deposit;
    expect((await view(a.paymentIntentId)).status).toBe(404);
    expect((await view(a.paymentIntentId, "")).status).toBe(404);
    expect((await view(a.paymentIntentId, `${a.clientSecret}x`)).status).toBe(404);
    expect((await view(a.paymentIntentId, b.clientSecret)).status).toBe(404);
    expect((await view("pi_does_not_exist", a.clientSecret)).status).toBe(404);
    expect((await view(a.paymentIntentId, a.clientSecret)).status).toBe(200);
  });
});
