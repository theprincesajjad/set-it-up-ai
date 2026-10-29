/**
 * phase-pro P1: two paid tiers (Pro `plus`, Studio `studio`), the calendar caps 1 / 2 / unlimited, the Studio checkout and webhook, and
 * the 14-day Pro trial (docs/business/pro-value.md §2.2, §3.2 P1).
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantMilestones, merchants, subscriptions } from "@ll/db";
import { PLANS, TRIAL_SMS_CAP } from "@ll/shared";
import { runTrialJob, trialReceiptMessage } from "../src/jobs/billing-trial.js";
import { onSubscriptionEvent, planUsage } from "../src/services/billing.js";
import { isFeatureOn } from "../src/services/features.js";
import { reserveTransactionalText } from "../src/services/text-allowance.js";
import { startTrial, startTrialOnLinkLive } from "../src/services/trial.js";
import { call, fake, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createMerchant, createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => {
  await env.close();
});

const row = async (id: string) => (await env.db.select().from(merchants).where(eq(merchants.id, id)))[0]!;
const MON_SAT = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "09:00", endsLocal: "17:00" }));
const milestones = async (id: string) => (await env.db.select().from(merchantMilestones).where(eq(merchantMilestones.merchantId, id))).map((r) => r.key);

describe("calendars: Free 1, Pro 2, Studio unlimited", () => {
  it("refuses a Pro shop's third bookable calendar with the Studio offer; Studio takes it", async () => {
    const m = await paidMerchant(env, { plan: "plus", vertical: "barber" });
    const base = `/v1/merchants/${m.merchant.id}`;
    const [a, b, c] = [await staffMember(env, m.merchant.id), await staffMember(env, m.merchant.id), await staffMember(env, m.merchant.id)];
    expect((await call(env, m.ownerToken, "PUT", `${base}/staff/${a.user.id}/hours`, { days: MON_SAT })).status).toBe(200);
    expect((await call(env, m.ownerToken, "PUT", `${base}/staff/${b.user.id}/hours`, { days: MON_SAT })).status).toBe(200);
    const refused = await call(env, m.ownerToken, "PUT", `${base}/staff/${c.user.id}/hours`, { days: MON_SAT });
    expect(refused.status).toBe(402);
    expect(refused.body.error).toMatchObject({ code: "plan_limit", details: { limit: "bookable_calendars", max: 2, offer: { kind: "plan", plan: "studio", name: "Studio", priceCents: 5900 } } });

    await env.db.update(merchants).set({ plan: "studio" }).where(eq(merchants.id, m.merchant.id));
    expect((await call(env, m.ownerToken, "PUT", `${base}/staff/${c.user.id}/hours`, { days: MON_SAT })).status).toBe(200);
    expect((await call(env, m.ownerToken, "GET", `${base}/billing/usage`)).body.calendars).toEqual({ limit: null, used: 3 });
    // The walk-in line and payouts are Studio features.
    expect(await isFeatureOn(env.db, await row(m.merchant.id), "booking.walkin_queue")).toBe(true);
    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, m.merchant.id));
    expect(await isFeatureOn(env.db, await row(m.merchant.id), "booking.walkin_queue")).toBe(false);
    expect(await isFeatureOn(env.db, await row(m.merchant.id), "booking.waitlist")).toBe(true);
  });
});

describe("Studio checkout and webhook", () => {
  it("a Studio checkout carries the Studio price; the webhook maps the price to studio; annual Studio includes the website", async () => {
    env.ctx.config.stripe.prices.studioMonthly = "price_studio_m";
    env.ctx.config.stripe.prices.studioAnnual = "price_studio_y";
    const { merchant, ownerToken } = await createMerchant(env, { vertical: "barber" });
    const base = `/v1/merchants/${merchant.id}/billing`;
    const overview = await call(env, ownerToken, "GET", base);
    expect(overview.body.plans.map((p: { id: string }) => p.id)).toEqual(["free", "plus", "studio", "pro"]);
    expect(overview.body.plans.find((p: { id: string }) => p.id === "studio")).toMatchObject({ name: "Studio", priceCents: 5900, annualPriceCents: 59000, smsPerMonth: 1000, available: true });

    const monthly = await call(env, ownerToken, "POST", `${base}/checkout`, { plan: "studio", interval: "month" });
    expect(monthly.status).toBe(200);
    expect(fake(env).sessions.get(monthly.body.sessionId)).toMatchObject({ plan: "studio", priceId: "price_studio_m", unitAmountCents: 5900, productName: "Studio plan" });
    expect(fake(env).sessions.get(monthly.body.sessionId)!.couponId).toBeUndefined();

    const yearly = await call(env, ownerToken, "POST", `${base}/checkout`, { plan: "studio", interval: "year" });
    expect(fake(env).sessions.get(yearly.body.sessionId)).toMatchObject({ priceId: "price_studio_y", unitAmountCents: 59000 });
    // No first-year price on Studio.
    expect(fake(env).sessions.get(yearly.body.sessionId)!.couponId).toBeUndefined();
    await call(env, null, "POST", "/v1/payments/fake/simulate", { action: "complete_checkout", id: yearly.body.sessionId });
    expect(await row(merchant.id)).toMatchObject({ plan: "studio", annualSiteEntitled: true });

    // A subscription event with no plan metadata maps by price id.
    const other = await createMerchant(env, { vertical: "salon" });
    await onSubscriptionEvent(env.ctx, { id: "sub_price_only", customer: null, metadata: { merchant_id: other.merchant.id }, status: "active", items: { data: [{ price: { id: "price_studio_m", recurring: { interval: "month" } } }] } }, "customer.subscription.created");
    const [sub] = await env.db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, "sub_price_only"));
    expect(sub).toMatchObject({ plan: "studio", interval: "month" });
    expect((await row(other.merchant.id)).plan).toBe("studio");
  });
});

describe("the 14-day Pro trial", () => {
  it("starts once, turns Pro on with no card, caps texts at 100 and falls back to email after", async () => {
    const { merchant, ownerToken } = await createMerchant(env, { vertical: "nails" });
    const base = `/v1/merchants/${merchant.id}/billing`;
    expect(await isFeatureOn(env.db, await row(merchant.id), "booking.waitlist")).toBe(false);
    const started = await call(env, ownerToken, "POST", `${base}/trial`);
    expect(started.status).toBe(201);
    expect(started.body).toEqual({ plan: "plus", startedAt: "2026-11-03T15:00:00.000Z", endsAt: "2026-11-17T15:00:00.000Z" });
    const second = await call(env, ownerToken, "POST", `${base}/trial`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("trial_used");

    const m = await row(merchant.id);
    expect(m).toMatchObject({ plan: "free", trialPlan: "plus", trialUsed: true, reviewRequestsMode: "on" });
    for (const k of ["booking.waitlist", "booking.review_requests", "booking.add_ons", "insights.weekly"] as const) expect(await isFeatureOn(env.db, m, k), k).toBe(true);
    expect(await isFeatureOn(env.db, m, "booking.walkin_queue")).toBe(false);
    expect(await milestones(merchant.id)).toContain("trial_started");

    const usage = await call(env, ownerToken, "GET", `${base}/usage`);
    expect(usage.body).toMatchObject({ plan: "free", trial: { plan: "plus", endsAt: "2026-11-17T15:00:00.000Z", daysLeft: 14 }, texts: { includedPerMonth: TRIAL_SMS_CAP }, calendars: { limit: 2 }, promos: { limit: 4 } });
    const features = await call(env, ownerToken, "GET", `/v1/merchants/${merchant.id}/features`);
    expect(features.body.trial).toMatchObject({ plan: "plus", endsAt: "2026-11-17T15:00:00.000Z" });

    for (let i = 0; i < TRIAL_SMS_CAP; i++) expect(await reserveTransactionalText(env.db, merchant.id)).toBe(true);
    // The 101st text is refused: the caller sends the reminder by email.
    expect(await reserveTransactionalText(env.db, merchant.id)).toBe(false);
    expect((await row(merchant.id)).smsCreditsUsed).toBe(TRIAL_SMS_CAP);
  });

  it("is refused on a paid plan", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    const r = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/billing/trial`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("trial_not_needed");
  });

  it("starts when the booking link goes live, for any trade, and only once", async () => {
    const { merchant } = await createMerchant(env, { vertical: "cafe" });
    await env.db.insert(merchantMilestones).values({ merchantId: merchant.id, key: "booking_link_live", reachedAt: env.clock.now });
    expect(await startTrialOnLinkLive(env.ctx, merchant.id)).toBe(true);
    expect(await startTrialOnLinkLive(env.ctx, merchant.id)).toBe(false);
    expect(await row(merchant.id)).toMatchObject({ trialPlan: "plus", trialUsed: true });
  });

  it("the job starts a missed trial, then ends it at day 14 with the trial_ended milestone and the receipt; nothing is lost", async () => {
    const { merchant, ownerToken } = await createMerchant(env, { vertical: "nails" });
    await env.db.insert(merchantMilestones).values({ merchantId: merchant.id, key: "booking_link_live", reachedAt: env.clock.now });
    expect(await runTrialJob(env.ctx)).toMatchObject({ started: 1, ended: 0 });
    expect((await row(merchant.id)).trialPlan).toBe("plus");

    env.clock.now = new Date("2026-11-14T15:00:00Z"); // day 11
    // (The owner's token has expired on the moved clock: read the usage from the service.)
    expect((await planUsage(env.ctx, await row(merchant.id))).trial).toMatchObject({ daysLeft: 3 });
    expect(await runTrialJob(env.ctx)).toMatchObject({ ended: 0 });

    env.clock.now = new Date("2026-11-17T16:00:00Z");
    const sent = env.ctx.providers.email as unknown as { sent?: unknown[] };
    const before = sent.sent?.length ?? 0;
    expect(await runTrialJob(env.ctx)).toMatchObject({ ended: 1, receipts: 1 });
    expect(await runTrialJob(env.ctx)).toMatchObject({ ended: 0 });
    const m = await row(merchant.id);
    expect(m).toMatchObject({ plan: "free", trialPlan: null, trialUsed: true });
    expect(await isFeatureOn(env.db, m, "booking.waitlist")).toBe(false);
    expect(await milestones(merchant.id)).toEqual(expect.arrayContaining(["trial_started", "trial_ended"]));
    if (sent.sent) expect(sent.sent.length).toBe(before + 1);
    const usage = await planUsage(env.ctx, await row(merchant.id));
    expect(usage).toMatchObject({ trial: null, trialUsed: true, trialEndedAt: "2026-11-17T15:00:00.000Z" });
    // Never a second trial.
    await expect(startTrial(env.ctx, await row(merchant.id))).rejects.toMatchObject({ statusCode: 409, code: "trial_used" });
    void ownerToken;
  });

  it("a paid subscription ends the trial at once", async () => {
    const { merchant, ownerToken } = await createMerchant(env, { vertical: "nails" });
    await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/billing/trial`);
    const co = await call(env, ownerToken, "POST", `/v1/merchants/${merchant.id}/billing/checkout`, { plan: "plus", interval: "month" });
    await call(env, null, "POST", "/v1/payments/fake/simulate", { action: "complete_checkout", id: co.body.sessionId });
    expect(await row(merchant.id)).toMatchObject({ plan: "plus", trialPlan: null, trialUsed: true });
    const [ended] = await env.db.select().from(merchantMilestones).where(and(eq(merchantMilestones.merchantId, merchant.id), eq(merchantMilestones.key, "trial_ended")));
    expect(ended?.data).toMatchObject({ reason: "subscribed" });
  });

  it("the receipt says what the trial did, with the price from PLANS", () => {
    const msg = trialReceiptMessage({ days: 14, bookings: 31, amountCents: 170500, fills: 3, rebooked: 5, reviews: 22, addons: 7, chasedCents: 61000 }, { locale: "en", billingUrl: "https://x.test/billing" });
    expect(msg.subject).toBe(`${PLANS.plus.name} ended today. Here's what it did.`);
    expect(msg.text).toContain("14 days · 31 bookings · $1,705");
    expect(msg.text).toContain("3 cancelled slots filled · 5 rebooked from reminders · 22 review requests · 7 add-ons");
    expect(msg.text).toContain(`Turn ${PLANS.plus.name} on, $29`);
  });
});
