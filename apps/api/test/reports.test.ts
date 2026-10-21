import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { featureOverrides, ledgerTransactions, merchantMembers, merchantStaff, promos, visits } from "@ll/db";
import { awardPurchase, redeemReward } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
/** A live clock (with an adjustable offset) so DB-default timestamps line up with ctx.now(). */
function liveClock(e: TestEnv) {
  let offset = 0;
  Object.defineProperty(e.clock, "now", {
    get: () => new Date(Date.now() + offset),
    set: (d: Date) => {
      offset = d.getTime() - Date.now();
    },
    configurable: true,
  });
}
beforeEach(async () => {
  env = await createTestEnv({ activationThreshold: 5 });
  liveClock(env);
});
afterEach(async () => env.close());

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const DAY = 86400000;

describe("reports", () => {
  it("overview, daily, top customers, rewards", async () => {
    const { merchant, ownerToken, reward } = await createMerchant(env);
    const p1 = nextPhone();
    const p2 = nextPhone();
    const a1 = await awardPurchase(env.ctx, { merchantId: merchant.id, phone: p1, customerName: "Ana", source: "staff_app", amountCents: 4000 });
    await awardPurchase(env.ctx, { merchantId: merchant.id, phone: p1, source: "staff_app", amountCents: 3000 });
    await awardPurchase(env.ctx, { merchantId: merchant.id, phone: p2, customerName: "Ben", source: "staff_app", amountCents: 1500 });
    await redeemReward(env.ctx, { merchantId: merchant.id, memberId: a1.member.id, rewardId: reward.id, source: "staff_app" });
    // An old visit (40 days ago) is outside the default 30-day window.
    const old = await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 9900 });
    const past = new Date(env.clock.now.getTime() - 40 * DAY);
    await env.db.update(visits).set({ createdAt: past }).where(eq(visits.memberId, old.member.id));
    await env.db.update(ledgerTransactions).set({ createdAt: past }).where(eq(ledgerTransactions.memberId, old.member.id));
    await env.db.update(merchantMembers).set({ createdAt: past }).where(eq(merchantMembers.id, old.member.id));

    const base = `/v1/merchants/${merchant.id}/reports`;
    const ov = (await env.app.inject({ method: "GET", url: `${base}/overview`, headers: auth(ownerToken) })).json();
    expect(ov.current).toMatchObject({
      totalMembers: 3,
      newMembers: 2,
      activeMembers: 2,
      visits: 3,
      pointsIssued: 85,
      pointsRedeemed: 50,
      redemptions: 1,
      redemptionRate: 0.5,
      revenueFromMembersCents: 8500,
      avgSpendPerVisitCents: 2833,
      repeatRate: 0.5,
    });
    expect(ov.previous).toMatchObject({ visits: 1, revenueFromMembersCents: 9900, newMembers: 1 });
    expect(ov.activeMembers30d).toBe(2);

    const d = (await env.app.inject({ method: "GET", url: `${base}/daily`, headers: auth(ownerToken) })).json();
    expect(d.timezone).toBe("America/Toronto");
    expect(d.series.length).toBeGreaterThanOrEqual(30);
    expect(d.series.reduce((s: number, x: { visits: number }) => s + x.visits, 0)).toBe(3);
    expect(d.series.at(-1).revenueCents).toBe(8500);

    const from = new Date(env.clock.now.getTime() - 60 * DAY).toISOString();
    const top = (await env.app.inject({ method: "GET", url: `${base}/top-customers?from=${from}&by=spend`, headers: auth(ownerToken) })).json();
    expect(top.items.map((c: { spendCents: number }) => c.spendCents)).toEqual([9900, 7000, 1500]);
    expect(top.items[1]).toMatchObject({ name: "Ana", visits: 2, phoneLast4: p1.slice(-4) });
    expect(top.items[1].phone).toBeUndefined();

    const rw = (await env.app.inject({ method: "GET", url: `${base}/rewards`, headers: auth(ownerToken) })).json();
    expect(rw.items[0]).toMatchObject({ rewardId: reward.id, redemptions: 1, uniqueMembers: 1, pointsSpent: 50, discountCents: 500 });

    expect((await env.app.inject({ method: "GET", url: `${base}/overview?from=2026-01-01T00:00:00Z&to=2025-01-01T00:00:00Z`, headers: auth(ownerToken) })).statusCode).toBe(400);
  });

  it("role and plan gating: staff blocked, retention needs Plus", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const staff = await createUser(env.db);
    await env.db.insert(merchantStaff).values({ merchantId: merchant.id, userId: staff.id, role: "staff" });
    const base = `/v1/merchants/${merchant.id}/reports`;
    expect((await env.app.inject({ method: "GET", url: `${base}/overview`, headers: auth(await tokenFor(env, staff)) })).statusCode).toBe(403);
    const locked = await env.app.inject({ method: "GET", url: `${base}/retention`, headers: auth(ownerToken) });
    expect(locked.statusCode).toBe(402);
    await env.db.insert(featureOverrides).values({ merchantId: merchant.id, key: "reports.advanced", enabled: true });
    await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1000 });
    const ret = (await env.app.inject({ method: "GET", url: `${base}/retention?months=3`, headers: auth(ownerToken) })).json();
    expect(ret.cohorts).toHaveLength(3);
    expect(ret.cohorts[2]).toMatchObject({ size: 1, retention: [1] });
    expect(ret.cohorts[0].retention).toHaveLength(3);
  });

  it("promo results with attributed visits and boosted transactions", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const [p] = await env.db
      .insert(promos)
      .values({ merchantId: merchant.id, title: "Double points", kind: "multiplier", multiplierPct: 200, startsAt: new Date(env.clock.now.getTime() - DAY), status: "live", viewCount: 40, claimCount: 3 })
      .returning();
    await env.db.insert(promos).values({ merchantId: merchant.id, title: "Draft", kind: "offer", startsAt: new Date(), status: "draft" });
    await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1000 });
    await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 2000 });
    const r = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/promos`, headers: auth(ownerToken) })).json();
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ promoId: p!.id, views: 40, claims: 3, attributedVisits: 2, boostedTransactions: 2, liftPct: null });
  });

  it("network overlap is aggregated and suppresses small shops", async () => {
    const hood = await createNeighbourhood(env.db);
    const me = await createMerchant(env, { neighbourhoodId: hood.id });
    const big = await createMerchant(env, { neighbourhoodId: hood.id, slug: "big-shop" });
    const small = await createMerchant(env, { neighbourhoodId: hood.id, slug: "small-shop" });
    const elsewhere = await createMerchant(env);
    const phones = Array.from({ length: 7 }, () => nextPhone());
    for (const ph of phones) await awardPurchase(env.ctx, { merchantId: me.merchant.id, phone: ph, source: "staff_app", amountCents: 500 });
    for (const ph of phones.slice(0, 6)) await awardPurchase(env.ctx, { merchantId: big.merchant.id, phone: ph, source: "staff_app", amountCents: 500 });
    for (const ph of phones.slice(0, 2)) await awardPurchase(env.ctx, { merchantId: small.merchant.id, phone: ph, source: "staff_app", amountCents: 500 });
    await awardPurchase(env.ctx, { merchantId: elsewhere.merchant.id, phone: phones[6]!, source: "staff_app", amountCents: 500 });
    // Customers of other shops who aren't my members don't count.
    await awardPurchase(env.ctx, { merchantId: big.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 500 });

    const r = await env.app.inject({ method: "GET", url: `/v1/merchants/${me.merchant.id}/reports/network-overlap`, headers: auth(me.ownerToken) });
    const body = r.json();
    expect(body).toMatchObject({ myMembers: 7, sharedMembers: 6, avgOtherShops: 1.3, suppressedShops: 1 });
    expect(body.sharedPct).toBeCloseTo(0.857, 2);
    expect(body.shops).toEqual([{ merchantId: big.merchant.id, name: "Test Shop", vertical: "pharmacy", sharedMembers: 6 }]);
    // No identities anywhere in the payload.
    const raw = r.body;
    for (const ph of phones) expect(raw).not.toContain(ph);
    expect(raw).not.toMatch(/userId|memberId|phone/);
  });

  it("activation progress", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    for (let i = 0; i < 3; i++) await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 500 });
    const r = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/activation`, headers: auth(ownerToken) })).json();
    expect(r).toMatchObject({ activeMembers: 3, target: 5, remaining: 2, progressPct: 60, activatedAt: null });
    expect(r.last30Days).toHaveLength(30);
    expect(r.last30Days.at(-1).newActive).toBe(3);
  });
});
