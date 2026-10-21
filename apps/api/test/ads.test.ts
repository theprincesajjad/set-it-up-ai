import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adCampaigns, adEvents, featureRollouts, locations, merchantMembers, merchantStaff, promos, pushTokens } from "@ll/db";
import { adsApi } from "@ll/shared";
import { runAdsLifecycle } from "../src/services/ads.js";
import { deliverNearbyPushes } from "../src/services/adsPush.js";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const DAY = 86_400_000;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function enableAds(stage: "ga" | "hidden" = "ga") {
  for (const key of ["ads.sponsored_listing", "ads.sponsored_promo", "ads.map_pin"]) {
    await env.db.insert(featureRollouts).values({ key, stage }).onConflictDoUpdate({ target: featureRollouts.key, set: { stage } });
  }
}

async function setup() {
  const hood = await createNeighbourhood(env.db);
  const shop = await createMerchant(env, { neighbourhoodId: hood.id });
  await env.db.insert(locations).values({ merchantId: shop.merchant.id, name: "Main", address: "1 Main St", qrCode: `QR${Math.random().toString(36).slice(2, 10)}`, lat: 43.65, lng: -79.45 });
  const admin = await createUser(env.db, { platformRole: "admin" });
  const adminToken = await tokenFor(env, admin);
  return { hood, shop, admin, adminToken };
}

function adBody(hoodId: string, over: Partial<adsApi.CreateAdCampaignBody> = {}) {
  return {
    placement: "feed_top",
    pricingModel: "daily",
    headline: "Fresh croissants every morning",
    neighbourhoodIds: [hoodId],
    startsAt: new Date(env.clock.now.getTime() + 60_000).toISOString(),
    endsAt: new Date(env.clock.now.getTime() + 3 * DAY).toISOString(),
    ...over,
  };
}

async function createAndApprove(s: Awaited<ReturnType<typeof setup>>, over: Partial<adsApi.CreateAdCampaignBody> = {}) {
  const res = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id, over) });
  expect(res.statusCode).toBe(201);
  const ad = res.json() as adsApi.AdCampaign;
  const ok = await env.app.inject({ method: "POST", url: `/v1/admin/ads/${ad.id}/approve`, headers: auth(s.adminToken), payload: {} });
  expect(ok.statusCode).toBe(200);
  return ok.json() as adsApi.AdCampaign;
}

describe("ads: gating", () => {
  it("returns 402 while ads features are hidden (default)", async () => {
    const s = await setup();
    const create = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id) });
    expect(create.statusCode).toBe(402);
    expect(create.json().error.code).toBe("feature_locked");
    const list = await env.app.inject({ method: "GET", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken) });
    expect(list.statusCode).toBe(402);
  });

  it("gates each placement by its own feature key", async () => {
    const s = await setup();
    await env.db.insert(featureRollouts).values({ key: "ads.sponsored_listing", stage: "ga" });
    const feed = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id) });
    expect(feed.statusCode).toBe(201);
    const pin = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id, { placement: "map_pin" }) });
    expect(pin.statusCode).toBe(402);
  });

  it("requires owner/manager and sign-in", async () => {
    await enableAds();
    const s = await setup();
    const staff = await createUser(env.db);
    await env.db.insert(merchantStaff).values({ merchantId: s.shop.merchant.id, userId: staff.id, role: "staff" });
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(await tokenFor(env, staff)), payload: adBody(s.hood.id) });
    expect(r.statusCode).toBe(403);
    const anon = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, payload: adBody(s.hood.id) });
    expect(anon.statusCode).toBe(401);
    const other = await createMerchant(env);
    const cross = await env.app.inject({ method: "GET", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(other.ownerToken) });
    expect(cross.statusCode).toBe(403);
  });
});

describe("ads: self-serve and review", () => {
  it("prices from the rate card, queues for review, rejects with a reason, approves", async () => {
    await enableAds();
    const s = await setup();
    const res = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id) });
    expect(res.statusCode).toBe(201);
    const ad = res.json() as adsApi.AdCampaign;
    expect(ad.status).toBe("pending_review");
    expect(ad.paymentStatus).toBe("pending");
    expect(ad.rateCents).toBe(adsApi.AD_RATE_CARD.feed_top.dailyCents);
    expect(ad.budgetCents).toBe(3 * adsApi.AD_RATE_CARD.feed_top.dailyCents!);

    // CPM needs a budget; nearby_push is CPM-only; promo_boost needs a promo.
    const noBudget = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id, { pricingModel: "cpm" }) });
    expect(noBudget.statusCode).toBe(400);
    const push = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id, { placement: "nearby_push" }) });
    expect(push.statusCode).toBe(400);

    // Not an admin.
    const forbidden = await env.app.inject({ method: "POST", url: `/v1/admin/ads/${ad.id}/approve`, headers: auth(s.shop.ownerToken), payload: {} });
    expect(forbidden.statusCode).toBe(403);

    const queue = await env.app.inject({ method: "GET", url: "/v1/admin/ads", headers: auth(s.adminToken) });
    expect(queue.json().items.map((i: adsApi.AdminAdCampaign) => i.id)).toEqual([ad.id]);
    expect(queue.json().items[0].merchant.id).toBe(s.shop.merchant.id);

    const noReason = await env.app.inject({ method: "POST", url: `/v1/admin/ads/${ad.id}/reject`, headers: auth(s.adminToken), payload: {} });
    expect(noReason.statusCode).toBe(400);
    const rejected = await env.app.inject({ method: "POST", url: `/v1/admin/ads/${ad.id}/reject`, headers: auth(s.adminToken), payload: { reason: "Image is blurry" } });
    expect(rejected.json()).toMatchObject({ status: "rejected", reviewNote: "Image is blurry" });
    const again = await env.app.inject({ method: "POST", url: `/v1/admin/ads/${ad.id}/approve`, headers: auth(s.adminToken), payload: {} });
    expect(again.statusCode).toBe(409);

    const approved = await createAndApprove(s);
    expect(approved.status).toBe("active");
    const paid = await env.app.inject({ method: "POST", url: `/v1/admin/ads/${approved.id}/mark-paid`, headers: auth(s.adminToken), payload: { paymentStatus: "invoiced" } });
    expect(paid.json().paymentStatus).toBe("invoiced");
  });

  it("boosts an existing promo and uses its creative", async () => {
    await enableAds();
    const s = await setup();
    const [promo] = await env.db.insert(promos).values({ merchantId: s.shop.merchant.id, title: "2-for-1 lattes", startsAt: new Date("2026-11-01"), status: "live" }).returning();
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/merchants/${s.shop.merchant.id}/ads`,
      headers: auth(s.shop.ownerToken),
      payload: adBody(s.hood.id, { placement: "promo_boost", pricingModel: "cpm", budgetCents: 2500, promoId: promo!.id, headline: undefined }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ headline: "2-for-1 lattes", promoId: promo!.id });
    // Another merchant's promo is not boostable.
    const other = await createMerchant(env);
    const [foreign] = await env.db.insert(promos).values({ merchantId: other.merchant.id, title: "Theirs", startsAt: new Date("2026-11-01"), status: "live" }).returning();
    const bad = await env.app.inject({
      method: "POST",
      url: `/v1/merchants/${s.shop.merchant.id}/ads`,
      headers: auth(s.shop.ownerToken),
      payload: adBody(s.hood.id, { placement: "promo_boost", pricingModel: "cpm", budgetCents: 2500, promoId: foreign!.id }),
    });
    expect(bad.statusCode).toBe(404);
  });

  it("sells at most 3 featured map pins per neighbourhood at a time", async () => {
    await enableAds();
    const s = await setup();
    const cpmPin = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id, { placement: "map_pin", pricingModel: "cpm", budgetCents: 5000 }) });
    expect(cpmPin.statusCode).toBe(400); // pins are sold by the day
    for (let i = 0; i < 3; i++) expect((await createAndApprove(s, { placement: "map_pin" })).status).toBe("active");
    const fourth = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id, { placement: "map_pin" }) });
    const blocked = await env.app.inject({ method: "POST", url: `/v1/admin/ads/${fourth.json().id}/approve`, headers: auth(s.adminToken), payload: {} });
    expect(blocked.statusCode).toBe(409);
  });

  it("lets the merchant pause, resume and cancel", async () => {
    await enableAds();
    const s = await setup();
    const ad = await createAndApprove(s);
    const base = `/v1/merchants/${s.shop.merchant.id}/ads/${ad.id}`;
    expect((await env.app.inject({ method: "POST", url: `${base}/pause`, headers: auth(s.shop.ownerToken) })).json().status).toBe("paused");
    expect((await env.app.inject({ method: "POST", url: `${base}/pause`, headers: auth(s.shop.ownerToken) })).statusCode).toBe(409);
    expect((await env.app.inject({ method: "POST", url: `${base}/resume`, headers: auth(s.shop.ownerToken) })).json().status).toBe("active");
    expect((await env.app.inject({ method: "POST", url: `${base}/cancel`, headers: auth(s.shop.ownerToken) })).json()).toMatchObject({ status: "ended", endedReason: "cancelled" });
  });
});

describe("ads: tracking, attribution and reporting", () => {
  it("caps impressions at 3/user/day, dedupes clicks, attributes visits within 7 days, reports CTR and cost per visit", async () => {
    await enableAds();
    const s = await setup();
    const ad = await createAndApprove(s);
    env.clock.now = new Date(env.clock.now.getTime() + 2 * 60_000); // flight started
    const phone = nextPhone();
    const customer = await createUser(env.db, { phone });
    const ct = auth(await tokenFor(env, customer));

    const counted = [];
    for (let i = 0; i < 4; i++) counted.push((await env.app.inject({ method: "POST", url: `/v1/ads/${ad.id}/impression`, headers: ct })).json().counted);
    expect(counted).toEqual([true, true, true, false]);
    expect((await env.app.inject({ method: "POST", url: `/v1/ads/${ad.id}/click`, headers: ct })).json().counted).toBe(true);
    expect((await env.app.inject({ method: "POST", url: `/v1/ads/${ad.id}/click`, headers: ct })).json().counted).toBe(false);
    expect((await env.app.inject({ method: "POST", url: `/v1/ads/${ad.id}/click` })).statusCode).toBe(401);

    // Visit 2 days later: attributed via the click.
    env.clock.now = new Date(env.clock.now.getTime() + 2 * DAY);
    await awardPurchase(env.ctx, { merchantId: s.shop.merchant.id, phone, source: "staff_app", amountCents: 1000 });
    // A second visit with no new ad interaction is not attributed again.
    env.clock.now = new Date(env.clock.now.getTime() + 3600_000);
    await awardPurchase(env.ctx, { merchantId: s.shop.merchant.id, phone, source: "staff_app", amountCents: 1000 });
    // A different customer who never saw the ad: not attributed.
    await awardPurchase(env.ctx, { merchantId: s.shop.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1000 });

    const [row] = await env.db.select().from(adCampaigns).where(eq(adCampaigns.id, ad.id));
    expect(row!.attributedVisits).toBe(1);

    // Accrue daily spend, then report.
    await runAdsLifecycle(env.ctx);
    const ownerToken = await tokenFor(env, s.shop.owner); // access tokens last an hour of (test) clock time
    const rep = await env.app.inject({ method: "GET", url: `/v1/merchants/${s.shop.merchant.id}/ads/${ad.id}/report`, headers: auth(ownerToken) });
    expect(rep.statusCode).toBe(200);
    const r = rep.json() as adsApi.AdReport;
    expect(r).toMatchObject({ impressions: 3, clicks: 1, attributedVisits: 1, uniqueUsersReached: 1 });
    expect(r.ctr).toBeCloseTo(1 / 3, 3);
    expect(r.spentCents).toBe(3 * ad.rateCents); // day 3 of the flight has begun
    expect(r.costPerVisitCents).toBe(3 * ad.rateCents);
    expect(r.daily.reduce((n, d) => n + d.visits, 0)).toBe(1);
  });

  it("does not attribute a visit more than 7 days after the last interaction", async () => {
    await enableAds();
    const s = await setup();
    const ad = await createAndApprove(s, { endsAt: new Date(env.clock.now.getTime() + 20 * DAY).toISOString() });
    env.clock.now = new Date(env.clock.now.getTime() + 2 * 60_000);
    const phone = nextPhone();
    const customer = await createUser(env.db, { phone });
    await env.app.inject({ method: "POST", url: `/v1/ads/${ad.id}/impression`, headers: auth(await tokenFor(env, customer)) });
    env.clock.now = new Date(env.clock.now.getTime() + 8 * DAY);
    await awardPurchase(env.ctx, { merchantId: s.shop.merchant.id, phone, source: "staff_app", amountCents: 1000 });
    const [row] = await env.db.select().from(adCampaigns).where(eq(adCampaigns.id, ad.id));
    expect(row!.attributedVisits).toBe(0);
    expect(await env.db.select().from(adEvents).where(eq(adEvents.kind, "visit"))).toHaveLength(0);
  });
});

describe("ads: budgets and jobs", () => {
  it("ends a CPM campaign the moment its budget is exhausted", async () => {
    const s = await setup();
    const now = env.clock.now;
    const [ad] = await env.db
      .insert(adCampaigns)
      .values({
        merchantId: s.shop.merchant.id,
        placement: "feed_top",
        neighbourhoodIds: [s.hood.id],
        headline: "Tiny budget",
        pricingModel: "cpm",
        rateCents: 1000, // 1 cent per impression
        budgetCents: 2,
        startsAt: new Date(now.getTime() - DAY),
        endsAt: new Date(now.getTime() + DAY),
        status: "active",
      })
      .returning();
    const users = await Promise.all([1, 2, 3].map(() => createUser(env.db)));
    const results = [];
    for (const u of users) results.push((await env.app.inject({ method: "POST", url: `/v1/ads/${ad!.id}/impression`, headers: auth(await tokenFor(env, u)) })).json().counted);
    expect(results).toEqual([true, true, false]);
    const [row] = await env.db.select().from(adCampaigns).where(eq(adCampaigns.id, ad!.id));
    expect(row).toMatchObject({ status: "ended", endedReason: "budget_exhausted", spentCents: 2, impressions: 2 });
  });

  it("accrues daily spend once per flight day, skips paused days, and ends at endsAt", async () => {
    await enableAds();
    const s = await setup();
    const ad = await createAndApprove(s); // 3-day flight starting in 1 minute
    const rate = ad.rateCents;
    const at = (ms: number) => (env.clock.now = new Date(new Date(ad.startsAt).getTime() + ms));
    const spent = async () => (await env.db.select().from(adCampaigns).where(eq(adCampaigns.id, ad.id)))[0]!;
    const owner = async () => auth(await tokenFor(env, s.shop.owner));

    at(-30_000);
    await runAdsLifecycle(env.ctx);
    expect((await spent()).spentCents).toBe(0); // not started
    at(3600_000);
    await runAdsLifecycle(env.ctx);
    await runAdsLifecycle(env.ctx);
    expect((await spent()).spentCents).toBe(rate);

    await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads/${ad.id}/pause`, headers: await owner() });
    expect((await spent()).status).toBe("paused");
    at(DAY + 3600_000);
    await runAdsLifecycle(env.ctx);
    expect((await spent()).spentCents).toBe(rate); // day 2 began while paused: not billed
    await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads/${ad.id}/resume`, headers: await owner() });
    expect((await spent()).status).toBe("active");
    at(2 * DAY + 3600_000);
    await runAdsLifecycle(env.ctx);
    expect((await spent()).spentCents).toBe(2 * rate);

    at(3 * DAY + 1000);
    await runAdsLifecycle(env.ctx);
    expect(await spent()).toMatchObject({ status: "ended", endedReason: "completed", spentCents: 2 * rate });
  });
});

describe("ads: nearby push", () => {
  it("only pushes to consenting, unmuted members, once per campaign, labelled and with opt-out", async () => {
    const s = await setup();
    const now = env.clock.now;
    const [ad] = await env.db
      .insert(adCampaigns)
      .values({
        merchantId: s.shop.merchant.id,
        placement: "nearby_push",
        neighbourhoodIds: [],
        radiusMetres: 1000,
        headline: "Fresh bagels until noon",
        pricingModel: "cpm",
        rateCents: 4000,
        budgetCents: 10_000,
        startsAt: new Date(now.getTime() - DAY),
        endsAt: new Date(now.getTime() + DAY),
        status: "active",
      })
      .returning();
    const make = async (consent: boolean, muted: boolean) => {
      const phone = nextPhone();
      const r = await awardPurchase(env.ctx, { merchantId: s.shop.merchant.id, phone, source: "staff_app", amountCents: 500 });
      await env.db.update(merchantMembers).set({ marketingConsentAt: consent ? now : null, muted }).where(eq(merchantMembers.id, r.member.id));
      await env.db.insert(pushTokens).values({ userId: r.member.userId, token: `tok-${phone}`, platform: "ios" });
      return phone;
    };
    const ok = await make(true, false);
    await make(false, false);
    await make(true, true);

    expect((await deliverNearbyPushes(env.ctx)).sent).toBe(1);
    expect(env.ctx.providers.outbox.push).toHaveLength(1);
    const msg = env.ctx.providers.outbox.push[0]!;
    expect(msg.token).toBe(`tok-${ok}`);
    expect(msg.title).toContain("Test Shop");
    expect(msg.title).toContain("Sponsored");
    expect(msg.body).toContain("mute");
    expect((await deliverNearbyPushes(env.ctx)).sent).toBe(0);
    const [row] = await env.db.select().from(adCampaigns).where(eq(adCampaigns.id, ad!.id));
    expect(row).toMatchObject({ impressions: 1, spentCents: 4 });
  });
});

describe("ads: card payment", () => {
  it("charges the merchant on the platform account and marks the campaign paid via webhook", async () => {
    await enableAds();
    const s = await setup();
    const create = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads`, headers: auth(s.shop.ownerToken), payload: adBody(s.hood.id) });
    const ad = create.json() as adsApi.AdCampaign;
    const pay = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads/${ad.id}/pay`, headers: auth(s.shop.ownerToken) });
    expect(pay.statusCode).toBe(200);
    const { paymentIntentId, clientSecret, amountCents } = pay.json();
    expect(clientSecret).toBeTruthy();
    expect(amountCents).toBe(ad.budgetCents);
    const sim = await env.app.inject({ method: "POST", url: `/v1/payments/fake/simulate`, payload: { action: "succeed_payment", id: paymentIntentId } });
    expect(sim.statusCode).toBe(200);
    const [row] = await env.db.select().from(adCampaigns).where(eq(adCampaigns.id, ad.id));
    expect(row!.paymentStatus).toBe("paid");
    const again = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.shop.merchant.id}/ads/${ad.id}/pay`, headers: auth(s.shop.ownerToken) });
    expect(again.statusCode).toBe(409);
  });
});
