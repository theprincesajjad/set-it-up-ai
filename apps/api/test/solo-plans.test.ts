/**
 * phase-solo A: solo pro packaging (docs/business/solo-pro-launch.md §3.2). One free bookable calendar with deposits,
 * the text allowance, the promo counter, the annual website entitlement and the founding solo price.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantCategories, merchants, subscriptions, users } from "@ll/db";
import { isFeatureEnabled } from "@ll/shared";
import { zonedToUtc } from "../src/services/bookings.js";
import { consumePromo, planUsage, promoAllowanceFor } from "../src/services/billing.js";
import { isFeatureOn } from "../src/services/features.js";
import { reserveTransactionalText } from "../src/services/text-allowance.js";
import { call, customer, fake, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createMerchant, createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => {
  delete process.env.FOUNDING_SOLO_ENABLED;
  await env.close();
});

const row = async (id: string) => (await env.db.select().from(merchants).where(eq(merchants.id, id)))[0]!;
const simulate = (action: string, id: string) => call(env, null, "POST", "/v1/payments/fake/simulate", { action, id });
const at = (d: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedToUtc(d, h * 60 + m, "America/Toronto").toISOString();
};
const MON_SAT = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "09:00", endsLocal: "17:00" }));

describe("one free bookable calendar with deposits", () => {
  it("a Free shop creates services and takes an online booking with a deposit on direct charges; a second calendar is refused", async () => {
    const m = await paidMerchant(env, { plan: "free", vertical: "salon" });
    const base = `/v1/merchants/${m.merchant.id}`;
    expect((await row(m.merchant.id)).chargeMode).toBe("direct"); // new shops default to direct charges
    expect(env.ctx.config.stripe.directCharges).toBe(true); // STRIPE_DIRECT_CHARGES defaults on
    const [cat] = await env.db.insert(merchantCategories).values({ merchantId: m.merchant.id, name: "Nails" }).returning();
    const gel = await call(env, m.ownerToken, "POST", `${base}/services`, { name: "Gel manicure", durationMin: 60, priceCents: 5500, depositCents: 2000, categoryId: cat!.id });
    expect(gel.status).toBe(201);
    const tech = await staffMember(env, m.merchant.id, "staff");
    await env.db.update(users).set({ name: "Priya Nails" }).where(eq(users.id, tech.user.id));
    expect((await call(env, m.ownerToken, "PUT", `${base}/staff/${tech.user.id}/hours`, { days: MON_SAT })).status).toBe(200);

    const c = await customer(env, { name: "Neha" });
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [gel.body.id], startsAt: at("2026-11-04", "10:00") });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.deposit).toMatchObject({ amountCents: 2000 });
    expect(fake(env).intents.get(r.body.deposit.paymentIntentId)).toMatchObject({ amountCents: 2000, applicationFeeCents: 20, chargeMode: "direct" });

    const second = await staffMember(env, m.merchant.id, "staff");
    const refused = await call(env, m.ownerToken, "PUT", `${base}/staff/${second.user.id}/hours`, { days: MON_SAT });
    expect(refused.status).toBe(402);
    expect(refused.body.error).toMatchObject({ code: "plan_limit", details: { limit: "bookable_calendars", max: 1, offer: { kind: "plan", plan: "plus", name: "Café & Retail" } } });

    // Café & Retail lifts the cap.
    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, m.merchant.id));
    expect((await call(env, m.ownerToken, "PUT", `${base}/staff/${second.user.id}/hours`, { days: MON_SAT })).status).toBe(200);
    const usage = await call(env, m.ownerToken, "GET", `${base}/billing/usage`);
    expect(usage.body.calendars).toEqual({ limit: null, used: 2 });
  });

  it("a Free shop on destination charges books without a deposit (deposits on Free need direct charges)", async () => {
    const m = await paidMerchant(env, { plan: "free" });
    await env.db.update(merchants).set({ chargeMode: "destination" }).where(eq(merchants.id, m.merchant.id));
    const base = `/v1/merchants/${m.merchant.id}`;
    const svc = await call(env, m.ownerToken, "POST", `${base}/services`, { name: "Brow lamination", durationMin: 45, priceCents: 7000, depositCents: 2000 });
    expect((await call(env, m.ownerToken, "PUT", `${base}/staff/${m.owner.id}/hours`, { days: MON_SAT })).status).toBe(200);
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [svc.body.id], startsAt: at("2026-11-04", "11:00") });
    expect(r.status).toBe(201);
    expect(r.body.deposit).toBeNull();
    expect(r.body.confirmed).toBe(true);
  });
});

describe("texts", () => {
  it("Free stops at 30 transactional texts a month; paid plans keep going and count overage", async () => {
    const { merchant } = await createMerchant(env);
    for (let i = 0; i < 30; i++) expect(await reserveTransactionalText(env.db, merchant.id)).toBe(true);
    expect(await reserveTransactionalText(env.db, merchant.id)).toBe(false);
    expect((await row(merchant.id)).smsCreditsUsed).toBe(30);

    await env.db.update(merchants).set({ plan: "plus", smsCreditsUsed: 500 }).where(eq(merchants.id, merchant.id));
    expect(await reserveTransactionalText(env.db, merchant.id)).toBe(true);
    const u = await planUsage(env.ctx, await row(merchant.id));
    expect(u.texts).toMatchObject({ includedPerMonth: 500, used: 501, remaining: 0, overageTexts: 1, overageCents: 4, overageCentsEach: 4 });
  });
});

describe("promo allowance", () => {
  it("none on Free, 4 a month on Café & Retail, reset with the billing period", async () => {
    const { merchant } = await createMerchant(env);
    await expect(consumePromo(env.ctx, await row(merchant.id))).rejects.toMatchObject({ statusCode: 402, code: "feature_locked" });

    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, merchant.id));
    await env.db.insert(subscriptions).values({ merchantId: merchant.id, plan: "plus", status: "active", interval: "month", stripeSubscriptionId: "sub_t1", currentPeriodEnd: new Date("2026-11-20T00:00:00Z") });
    for (let i = 1; i <= 4; i++) expect((await consumePromo(env.ctx, await row(merchant.id))).used).toBe(i);
    await expect(consumePromo(env.ctx, await row(merchant.id))).rejects.toMatchObject({ statusCode: 402, code: "promo_allowance_used" });

    // The next billing period starts on the 20th: the counter starts over.
    env.clock.now = new Date("2026-11-21T15:00:00Z");
    expect((await promoAllowanceFor(env.ctx, await row(merchant.id))).remaining).toBe(4);
    expect((await consumePromo(env.ctx, await row(merchant.id))).used).toBe(1);
  });

  it("48 a year on the annual plan", async () => {
    const { merchant } = await createMerchant(env);
    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, merchant.id));
    await env.db.insert(subscriptions).values({ merchantId: merchant.id, plan: "plus", status: "active", interval: "year", stripeSubscriptionId: "sub_t2", currentPeriodEnd: new Date("2027-06-01T00:00:00Z") });
    expect(await promoAllowanceFor(env.ctx, await row(merchant.id))).toMatchObject({ limit: 48, period: "year", periodStart: "2026-06-01T00:00:00.000Z" });
  });
});

describe("annual website entitlement and the founding solo price", () => {
  it("an annual checkout entitles the shop to site.builder, takes a founding spot with the coupon, and lapses with the subscription", async () => {
    const { merchant, ownerToken } = await createMerchant(env, { vertical: "salon" });
    const base = `/v1/merchants/${merchant.id}/billing`;
    const before = await call(env, null, "GET", "/v1/billing/founding-solo");
    expect(before.body).toMatchObject({ enabled: true, priceCents: 29000, renewsAtCents: 39000, slots: 200, spotsLeft: 200, eligible: false });
    expect((await call(env, ownerToken, "GET", base)).body.foundingSolo).toMatchObject({ eligible: true, taken: false });

    const co = await call(env, ownerToken, "POST", `${base}/checkout`, { plan: "plus", interval: "year" });
    expect(co.status).toBe(200);
    const session = fake(env).sessions.get(co.body.sessionId)!;
    expect(session).toMatchObject({ couponId: "founding_solo_10000", metadata: { founding_solo: "1" }, unitAmountCents: 39000 });
    await simulate("complete_checkout", co.body.sessionId);

    const m = await row(merchant.id);
    expect(m).toMatchObject({ plan: "plus", annualSiteEntitled: true, foundingSolo: true });
    expect(await isFeatureOn(env.db, m, "site.builder")).toBe(true);
    expect((await call(env, null, "GET", "/v1/billing/founding-solo")).body.spotsLeft).toBe(199);
    expect((await call(env, ownerToken, "GET", `${base}/usage`)).body).toMatchObject({ interval: "year", annualSiteEntitled: true, promos: { limit: 48 } });

    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.merchantId, merchant.id));
    await simulate("end_subscription", sub!.stripeSubscriptionId!);
    const after = await row(merchant.id);
    expect(after).toMatchObject({ plan: "free", annualSiteEntitled: false });
    expect(await isFeatureOn(env.db, after, "site.builder")).toBe(false);
  });

  it("a monthly shop is not entitled; a café gets no founding price; the offer turns off by config", async () => {
    const { merchant, ownerToken } = await createMerchant(env, { vertical: "cafe" });
    const base = `/v1/merchants/${merchant.id}/billing`;
    const co = await call(env, ownerToken, "POST", `${base}/checkout`, { plan: "plus", interval: "year" });
    expect(fake(env).sessions.get(co.body.sessionId)!.couponId).toBeUndefined();

    const salon = await createMerchant(env, { vertical: "salon" });
    const monthly = await call(env, salon.ownerToken, "POST", `/v1/merchants/${salon.merchant.id}/billing/checkout`, { plan: "plus", interval: "month" });
    expect(fake(env).sessions.get(monthly.body.sessionId)!.couponId).toBeUndefined();
    await simulate("complete_checkout", monthly.body.sessionId);
    const m = await row(salon.merchant.id);
    expect(m).toMatchObject({ plan: "plus", annualSiteEntitled: false, foundingSolo: false });
    expect(isFeatureEnabled("site.builder", { plan: m.plan, stage: "ga", annualSiteEntitled: m.annualSiteEntitled })).toBe(false);

    process.env.FOUNDING_SOLO_ENABLED = "false";
    expect((await call(env, null, "GET", "/v1/billing/founding-solo")).body).toMatchObject({ enabled: false, spotsLeft: 0 });
    const other = await createMerchant(env, { vertical: "barber" });
    const off = await call(env, other.ownerToken, "POST", `/v1/merchants/${other.merchant.id}/billing/checkout`, { plan: "plus", interval: "year" });
    expect(fake(env).sessions.get(off.body.sessionId)!.couponId).toBeUndefined();
  });
});
