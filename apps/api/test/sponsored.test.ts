import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adCampaigns, adEvents, locations, merchantMembers, promos } from "@ll/db";
import { adsApi } from "@ll/shared";
import { injectSponsored, interleaveSponsored, selectSponsored } from "../src/services/sponsored.js";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const DAY = 86_400_000;
let qr = 0;

async function shopAt(hoodId: string, lat: number, lng: number) {
  const s = await createMerchant(env, { neighbourhoodId: hoodId });
  await env.db.insert(locations).values({ merchantId: s.merchant.id, name: "Main", address: "1 Main St", qrCode: `SPQR${qr++}`, lat, lng });
  return s;
}

async function activeAd(merchantId: string, over: Partial<typeof adCampaigns.$inferInsert> = {}) {
  const now = env.clock.now;
  const [ad] = await env.db
    .insert(adCampaigns)
    .values({
      merchantId,
      placement: "feed_top",
      neighbourhoodIds: [],
      headline: "Sponsored thing",
      pricingModel: "daily",
      rateCents: 1500,
      budgetCents: 4500,
      startsAt: new Date(now.getTime() - DAY),
      endsAt: new Date(now.getTime() + 2 * DAY),
      status: "active",
      ...over,
    })
    .returning();
  return ad!;
}

describe("interleave", () => {
  it("puts the first sponsored item at position 2 and never more than 1 per 5 organic", () => {
    const organic = Array.from({ length: 12 }, (_, i) => `o${i + 1}`);
    const ads = ["s1", "s2", "s3", "s4"];
    expect(interleaveSponsored(organic, ads)).toEqual(["o1", "s1", "o2", "o3", "o4", "o5", "o6", "s2", "o7", "o8", "o9", "o10", "o11", "o12"]);
    expect(interleaveSponsored(organic.slice(0, 4), ads)).toEqual(organic.slice(0, 4));
    expect(interleaveSponsored(organic.slice(0, 5), ads)).toEqual(["o1", "s1", "o2", "o3", "o4", "o5"]);
    expect(interleaveSponsored(organic, [])).toEqual(organic);
  });
});

describe("selectSponsored", () => {
  it("targets by neighbourhood or radius, ranks by distance, and labels items", async () => {
    const hood = await createNeighbourhood(env.db);
    const otherHood = await createNeighbourhood(env.db);
    const near = await shopAt(hood.id, 43.6505, -79.4505);
    const far = await shopAt(hood.id, 43.66, -79.46);
    const elsewhere = await shopAt(otherHood.id, 43.7, -79.4);
    const radiusOnly = await shopAt(otherHood.id, 43.651, -79.451);
    await activeAd(far.merchant.id, { neighbourhoodIds: [hood.id], headline: "Far" });
    await activeAd(near.merchant.id, { neighbourhoodIds: [hood.id], headline: "Near" });
    await activeAd(elsewhere.merchant.id, { neighbourhoodIds: [otherHood.id], headline: "Elsewhere" });
    await activeAd(radiusOnly.merchant.id, { radiusMetres: 500, headline: "Radius" });
    await activeAd(near.merchant.id, { neighbourhoodIds: [hood.id], placement: "map_pin", headline: "Pin" });

    const items = await selectSponsored(env.ctx, { placement: "feed_top", neighbourhoodId: hood.id, lat: 43.65, lng: -79.45, limit: 5 });
    expect(items.map((i) => i.headline)).toEqual(["Near", "Radius", "Far"]);
    expect(items.every((i) => i.sponsored === true && i.label === "Sponsored")).toBe(true);
    expect(items[0]!.distanceMetres).toBeLessThan(100);

    // No location signal at all: nothing is served.
    expect(await selectSponsored(env.ctx, { placement: "feed_top", limit: 5 })).toEqual([]);
    // Out of radius and neighbourhood: not served.
    const away = await selectSponsored(env.ctx, { placement: "feed_top", lat: 43.9, lng: -79.9, limit: 5 });
    expect(away).toEqual([]);
  });

  it("applies the frequency cap, muted shops, pacing, budget and promo liveness", async () => {
    const hood = await createNeighbourhood(env.db);
    const a = await shopAt(hood.id, 43.65, -79.45);
    const b = await shopAt(hood.id, 43.651, -79.451);
    const c = await shopAt(hood.id, 43.652, -79.452);
    const d = await shopAt(hood.id, 43.653, -79.453);
    const e = await shopAt(hood.id, 43.654, -79.454);
    const phone = nextPhone();
    const user = await createUser(env.db, { phone });

    const capped = await activeAd(a.merchant.id, { neighbourhoodIds: [hood.id], headline: "Capped" });
    await activeAd(b.merchant.id, { neighbourhoodIds: [hood.id], headline: "Muted" });
    // CPM, halfway through the flight but already at its full budget pace → paced out.
    await activeAd(c.merchant.id, {
      neighbourhoodIds: [hood.id],
      headline: "Overpaced",
      pricingModel: "cpm",
      rateCents: 1000,
      budgetCents: 10_000,
      spentCents: 8000,
      startsAt: new Date(env.clock.now.getTime() - DAY),
      endsAt: new Date(env.clock.now.getTime() + DAY),
    });
    const [endedPromo] = await env.db.insert(promos).values({ merchantId: d.merchant.id, title: "Old", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-10"), status: "live" }).returning();
    await activeAd(d.merchant.id, { neighbourhoodIds: [hood.id], headline: "Dead promo", placement: "feed_top", promoId: endedPromo!.id });
    await activeAd(e.merchant.id, { neighbourhoodIds: [hood.id], headline: "Fine" });

    // User muted shop b.
    const joined = await awardPurchase(env.ctx, { merchantId: b.merchant.id, phone, source: "staff_app", amountCents: 100 });
    await env.db.update(merchantMembers).set({ muted: true }).where(eq(merchantMembers.id, joined.member.id));
    // 3 impressions in the last 24h on "Capped".
    for (let i = 0; i < 3; i++) await env.db.insert(adEvents).values({ adCampaignId: capped.id, userId: user.id, kind: "impression", createdAt: new Date(env.clock.now.getTime() - 3600_000) });

    const items = await selectSponsored(env.ctx, { placement: "feed_top", neighbourhoodId: hood.id, userId: user.id, limit: 10 });
    expect(items.map((i) => i.headline)).toEqual(["Fine"]);

    // Anonymous viewers still don't see paced-out or dead-promo ads, but see capped/muted ones.
    const anon = await selectSponsored(env.ctx, { placement: "feed_top", neighbourhoodId: hood.id, limit: 10 });
    expect(anon.map((i) => i.headline).sort()).toEqual(["Capped", "Fine", "Muted"]);

    // A day later the cap resets.
    env.clock.now = new Date(env.clock.now.getTime() + DAY);
    const later = await selectSponsored(env.ctx, { placement: "feed_top", neighbourhoodId: hood.id, userId: user.id, limit: 10 });
    expect(later.map((i) => i.headline)).toContain("Capped");
  });

  it("injectSponsored interleaves into an organic list and the HTTP endpoint serves items", async () => {
    const hood = await createNeighbourhood(env.db);
    const s1 = await shopAt(hood.id, 43.65, -79.45);
    const s2 = await shopAt(hood.id, 43.651, -79.451);
    const s3 = await shopAt(hood.id, 43.652, -79.452);
    for (const s of [s1, s2, s3]) await activeAd(s.merchant.id, { neighbourhoodIds: [hood.id] });
    const organic = Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, sponsored: false as const }));
    const mixed = await injectSponsored(organic, env.ctx, { placement: "feed_top", neighbourhoodId: hood.id });
    expect(mixed).toHaveLength(13);
    expect(mixed.map((x) => x.sponsored)).toEqual([false, true, false, false, false, false, false, true, false, false, false, false, false]);

    const user = await createUser(env.db);
    const res = await env.app.inject({
      method: "GET",
      url: `/v1/ads/sponsored?placement=feed_top&neighbourhoodId=${hood.id}&limit=2`,
      headers: { authorization: `Bearer ${await tokenFor(env, user)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as adsApi.SponsoredResponse;
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ sponsored: true, label: "Sponsored" });
    expect((await env.app.inject({ method: "GET", url: "/v1/ads/sponsored?placement=nope" })).statusCode).toBe(400);
  });
});

describe("network feed integration", () => {
  it("GET /v1/network/feed interleaves a labelled sponsored item at position 2", async () => {
    const hood = await createNeighbourhood(env.db);
    const shops = [];
    for (let i = 0; i < 6; i++) shops.push(await shopAt(hood.id, 43.65 + i * 0.001, -79.45));
    for (const s of shops) await env.db.insert(promos).values({ merchantId: s.merchant.id, title: `Promo ${s.merchant.id.slice(0, 4)}`, startsAt: new Date("2026-11-01"), status: "live" });
    await activeAd(shops[3]!.merchant.id, { neighbourhoodIds: [hood.id], headline: "Feed ad" });
    const res = await env.app.inject({ method: "GET", url: `/v1/network/feed?neighbourhood=${hood.slug}` });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as { sponsored?: boolean; headline?: string }[];
    expect(items).toHaveLength(7);
    expect(items.filter((i) => i.sponsored === true)).toHaveLength(1);
    expect(items[1]).toMatchObject({ sponsored: true, label: "Sponsored", headline: "Feed ad" });
  });
});
