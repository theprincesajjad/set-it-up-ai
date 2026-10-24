import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campaigns, discountCards, featureOverrides, locations, loyaltyPrograms, merchantMembers, merchants, neighbourhoods, networkPerks, promos } from "@ll/db";
import type { networkApi } from "@ll/shared";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv, grantFeatures } from "./helpers.js";

// 2026-11-03T15:00Z is Tuesday 10:00 in Toronto.
let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const call = (method: "GET" | "POST", url: string, payload?: unknown, token?: string) =>
  env.app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

/** Pricing v2: promos and discount cards are Plus. Shops here are pilots (admin overrides) unless `free: true`. */
const PILOT = ["promos.basic", "promos.double_points", "discount_cards"] as const;
async function shop(
  name: string,
  lat: number,
  lng: number,
  opts: { hood?: string; vertical?: string; hours?: Record<string, [string, string][]>; status?: "onboarding" | "active" | "paused"; free?: boolean } = {},
) {
  const m = await createMerchant(env, { neighbourhoodId: opts.hood });
  if (!opts.free) await grantFeatures(env, m.merchant.id, [...PILOT]);
  await env.db
    .update(merchants)
    .set({ name, vertical: opts.vertical ?? "cafe", status: opts.status ?? "active", description: `${name} on the strip` })
    .where(eq(merchants.id, m.merchant.id));
  const [loc] = await env.db
    .insert(locations)
    .values({ merchantId: m.merchant.id, name: "Main", address: "Roncesvalles Ave", lat, lng, hours: opts.hours ?? null, qrCode: `QR-${m.merchant.slug}` })
    .returning();
  return { ...m, location: loc! };
}

const ME = { lat: 43.6487, lng: -79.4495 };

describe("neighbourhoods", () => {
  it("lists live neighbourhoods with shop counts and shows perks and live campaigns", async () => {
    const hood = await createNeighbourhood(env.db, "roncesvalles");
    const scouting = await createNeighbourhood(env.db, "scouting-only");
    await env.db.update(neighbourhoods).set({ status: "scouting" }).where(eq(neighbourhoods.id, scouting.id));
    await shop("Cafe", 43.649, -79.45, { hood: hood.id });
    await shop("Paused", 43.649, -79.45, { hood: hood.id, status: "paused" });
    await env.db.insert(networkPerks).values({ neighbourhoodId: hood.id, name: "Strip explorer", threshold: 3, bonusPoints: 25 });
    await env.db.insert(campaigns).values([
      { neighbourhoodId: hood.id, name: "Passport week", startsAt: new Date("2026-11-01"), endsAt: new Date("2026-11-08"), status: "live", goalVisits: 5, prize: "Basket" },
      { neighbourhoodId: hood.id, name: "Old", startsAt: new Date("2026-09-01"), endsAt: new Date("2026-09-08"), status: "live" },
    ]);
    const list = await call("GET", "/v1/network/neighbourhoods");
    expect(list.statusCode).toBe(200);
    const items: networkApi.NeighbourhoodDto[] = list.json().items;
    expect(items.find((n) => n.slug === "roncesvalles")).toMatchObject({ shopCount: 1, status: "live" });
    expect(items.find((n) => n.slug === "scouting-only")).toBeUndefined();

    const d = await call("GET", "/v1/network/neighbourhoods/roncesvalles");
    expect(d.json()).toMatchObject({
      neighbourhood: { slug: "roncesvalles", shopCount: 1 },
      perks: [{ name: "Strip explorer", threshold: 3, bonusPoints: 25 }],
      liveCampaigns: [{ name: "Passport week", goalVisits: 5, prize: "Basket" }],
      livePromoCount: 0,
    });
    expect((await call("GET", "/v1/network/neighbourhoods/nowhere")).statusCode).toBe(404);
  });
});

describe("shops map/list", () => {
  it("sorts by distance, computes open-now and promo flags, filters, and adds my balance when signed in", async () => {
    const hood = await createNeighbourhood(env.db, "roncy");
    const near = await shop("Near Cafe", 43.6488, -79.4496, { hood: hood.id, hours: { tue: [["09:00", "17:00"]] } });
    const far = await shop("Far Books", 43.66, -79.46, { hood: hood.id, vertical: "bookstore", hours: { tue: [["11:00", "17:00"]] } });
    const mid = await shop("Mid Bakery", 43.652, -79.452, { vertical: "bakery", hours: { mon: [["20:00", "11:00"]] } });
    const hidden = await shop("Hidden", 43.6487, -79.4495);
    await env.db.insert(featureOverrides).values({ merchantId: hidden.merchant.id, key: "network.listing", enabled: false });
    await shop("Paused", 43.6487, -79.4495, { status: "paused" });
    await env.db.insert(promos).values({ merchantId: far.merchant.id, title: "2x Tuesdays", kind: "multiplier", multiplierPct: 200, startsAt: new Date("2026-10-01"), daysOfWeek: [2], status: "live" });

    const res = await call("GET", `/v1/network/shops?lat=${ME.lat}&lng=${ME.lng}`);
    expect(res.statusCode).toBe(200);
    const body: networkApi.ShopsResponse = res.json();
    expect(body.items.map((i) => i.merchant.name)).toEqual(["Near Cafe", "Mid Bakery", "Far Books"]);
    expect(body.items[0]!.distanceMetres).toBeLessThan(50);
    expect(body.items.map((i) => i.openNow)).toEqual([true, true, false]);
    expect(body.items.map((i) => i.hasPromo)).toEqual([false, false, true]);
    expect(body.items[0]).toMatchObject({ myBalance: null, isMember: false, locationCount: 1, terminology: "points" });

    expect((await call("GET", `/v1/network/shops?neighbourhood=roncy`)).json().items.map((i: networkApi.ShopListItemDto) => i.merchant.name)).toEqual([
      "Far Books",
      "Near Cafe",
    ]);
    expect((await call("GET", `/v1/network/shops?vertical=bakery`)).json().items).toHaveLength(1);
    expect((await call("GET", `/v1/network/shops?q=books`)).json().items[0].merchant.id).toBe(far.merchant.id);
    expect((await call("GET", `/v1/network/shops?lat=${ME.lat}&lng=${ME.lng}&radiusMetres=1000`)).json().items).toHaveLength(2);
    const p1 = (await call("GET", `/v1/network/shops?lat=${ME.lat}&lng=${ME.lng}&limit=2`)).json();
    expect(p1.items).toHaveLength(2);
    const p2 = (await call("GET", `/v1/network/shops?lat=${ME.lat}&lng=${ME.lng}&limit=2&cursor=${p1.nextCursor}`)).json();
    expect(p2).toMatchObject({ items: [{ merchant: { name: "Far Books" } }], nextCursor: null });
    expect((await call("GET", `/v1/network/shops?lat=${ME.lat}`)).statusCode).toBe(400);

    const user = await createUser(env.db);
    await awardPurchase(env.ctx, { merchantId: near.merchant.id, userId: user.id, source: "staff_app", amountCents: 1500 });
    const mine = (await call("GET", `/v1/network/shops?lat=${ME.lat}&lng=${ME.lng}`, undefined, await tokenFor(env, user))).json();
    expect(mine.items[0]).toMatchObject({ isMember: true, myBalance: 15 });
    expect(mine.items[1]).toMatchObject({ isMember: false, myBalance: null });
    void mid;
  });
});

describe("shop lines for Discover and the map (promoLine, perk)", () => {
  const base = { startsAt: new Date("2026-10-01"), status: "live" as const };
  const lines = async (url = `/v1/network/shops?lat=${ME.lat}&lng=${ME.lng}`) => {
    const items: networkApi.ShopListItemDto[] = (await call("GET", url)).json().items;
    return new Map(items.map((i) => [i.merchant.name, { promoLine: i.promoLine, perk: i.perk }]));
  };

  it("says a live earn window in words, with the shop's own unit and its closing time", async () => {
    const cafe = await shop("Window Cafe", 43.6488, -79.4496);
    await env.db.update(loyaltyPrograms).set({ terminology: "stamps" }).where(eq(loyaltyPrograms.merchantId, cafe.merchant.id));
    // Tuesday 7 am to 4 pm, double: on now (Tue 10:00).
    await env.db.insert(promos).values({ ...base, merchantId: cafe.merchant.id, title: "Double stamps", kind: "multiplier", multiplierPct: 200, daysOfWeek: [2], startTime: "07:00", endTime: "16:00" });
    const other = await shop("Wrong Day", 43.65, -79.45);
    await env.db.insert(promos).values({ ...base, merchantId: other.merchant.id, title: "Fridays", kind: "multiplier", multiplierPct: 150, daysOfWeek: [5], startTime: "07:00", endTime: "16:00" });
    const dated = await shop("Dated Bakery", 43.651, -79.451, { vertical: "bakery" });
    await env.db.insert(promos).values({ ...base, merchantId: dated.merchant.id, title: "1.5x", kind: "multiplier", multiplierPct: 150, endsAt: new Date("2026-11-14T17:00:00Z") });
    const got = await lines();
    expect(got.get("Window Cafe")).toEqual({ promoLine: "2× stamps till 4 pm", perk: null });
    expect(got.get("Wrong Day")).toEqual({ promoLine: null, perk: null }); // not today
    expect(got.get("Dated Bakery")!.promoLine).toBe("1.5× points till Nov 14");
  });

  it("says the standing perk: a recurring percent-off day, else the show-your-card discount", async () => {
    const grocer = await shop("Tuesday Grocer", 43.6488, -79.4496, { vertical: "grocery" });
    await env.db.insert(promos).values({ ...base, merchantId: grocer.merchant.id, title: "5% off Tuesdays", kind: "discount", percentOff: 5, daysOfWeek: [2] });
    const pharmacy = await shop("Village Apothecary", 43.65, -79.45, { vertical: "pharmacy" });
    await env.db.insert(discountCards).values({ merchantId: pharmacy.merchant.id, name: "Front-store", percentOff: 10 });
    const inactive = await shop("Old Card", 43.651, -79.451);
    await env.db.insert(discountCards).values({ merchantId: inactive.merchant.id, name: "Old", percentOff: 15, active: false });
    const seniors = await shop("Seniors Only", 43.652, -79.452);
    await env.db.insert(discountCards).values({ merchantId: seniors.merchant.id, name: "Seniors", percentOff: 20, eligibility: "seniors" });
    const got = await lines();
    expect(got.get("Tuesday Grocer")!.perk).toBe("5% off Tuesdays");
    expect(got.get("Village Apothecary")!.perk).toBe("show your card for 10% off");
    expect(got.get("Old Card")!.perk).toBeNull();
    expect(got.get("Seniors Only")!.perk).toBeNull(); // a card only some people qualify for is not the shop's perk
  });

  it("leaves both empty for a free shop (promos and discount cards are Plus)", async () => {
    const free = await shop("Free Shop", 43.6488, -79.4496, { free: true });
    await env.db.insert(promos).values({ ...base, merchantId: free.merchant.id, title: "Double", kind: "multiplier", multiplierPct: 200, startTime: "07:00", endTime: "16:00" });
    await env.db.insert(discountCards).values({ merchantId: free.merchant.id, name: "Card", percentOff: 10 });
    expect((await lines()).get("Free Shop")).toEqual({ promoLine: null, perk: null });
  });
});

describe("promo feed", () => {
  it("shows in-window promos by distance, honours audience, and hides muted shops", async () => {
    const near = await shop("Near", 43.6488, -79.4496);
    const far = await shop("Far", 43.66, -79.46);
    const base = { startsAt: new Date("2026-10-01"), status: "live" as const };
    await env.db.insert(promos).values([
      { ...base, merchantId: far.merchant.id, title: "Far offer" },
      { ...base, merchantId: near.merchant.id, title: "Near offer" },
      { ...base, merchantId: near.merchant.id, title: "Members only", audience: "members" },
      { ...base, merchantId: near.merchant.id, title: "Draft", status: "draft" },
      { ...base, merchantId: near.merchant.id, title: "Ended", endsAt: new Date("2026-10-15") },
      { ...base, merchantId: near.merchant.id, title: "Future", startsAt: new Date("2026-12-01"), status: "scheduled" },
      { ...base, merchantId: near.merchant.id, title: "Fridays only", daysOfWeek: [5] },
    ]);
    const anon: networkApi.FeedResponse = (await call("GET", `/v1/network/feed?lat=${ME.lat}&lng=${ME.lng}`)).json();
    expect(anon.items.map((i) => (i.sponsored ? "ad" : i.promo.title))).toEqual(["Near offer", "Far offer"]);
    const first = anon.items[0]!;
    expect(!first.sponsored && first).toMatchObject({ merchant: { name: "Near" }, isMember: false, promo: { activeNow: true } });

    const user = await createUser(env.db);
    const token = await tokenFor(env, user);
    const r = await awardPurchase(env.ctx, { merchantId: near.merchant.id, userId: user.id, source: "staff_app", amountCents: 500 });
    const member = (await call("GET", `/v1/network/feed?lat=${ME.lat}&lng=${ME.lng}`, undefined, token)).json();
    expect(member.items.map((i: networkApi.FeedItemDto) => i.promo.title).sort()).toEqual(["Far offer", "Members only", "Near offer"]);
    await env.db.update(merchantMembers).set({ muted: true }).where(eq(merchantMembers.id, r.member.id));
    const muted = (await call("GET", `/v1/network/feed?lat=${ME.lat}&lng=${ME.lng}`, undefined, token)).json();
    expect(muted.items.map((i: networkApi.FeedItemDto) => i.promo.title)).toEqual(["Far offer"]);
  });

  it("tracks promo views and claims", async () => {
    const s = await shop("Near", 43.6488, -79.4496);
    const [p] = await env.db.insert(promos).values({ merchantId: s.merchant.id, title: "Offer", startsAt: new Date("2026-10-01"), status: "live" }).returning();
    const [draft] = await env.db.insert(promos).values({ merchantId: s.merchant.id, title: "Draft", startsAt: new Date("2026-10-01") }).returning();
    await call("POST", `/v1/network/promos/${p!.id}/view`);
    expect((await call("POST", `/v1/network/promos/${p!.id}/view`)).json()).toEqual({ ok: true, viewCount: 2, claimCount: 0 });
    expect((await call("POST", `/v1/network/promos/${p!.id}/claim`)).json()).toEqual({ ok: true, viewCount: 2, claimCount: 1 });
    expect((await call("POST", `/v1/network/promos/${draft!.id}/view`)).statusCode).toBe(404);
    expect((await call("POST", `/v1/network/promos/not-a-uuid/view`)).statusCode).toBe(404);
  });
});

describe("public shop page", () => {
  it("shows the profile, hours, program, rewards, live promos and discount cards", async () => {
    const s = await shop("Roncy Rx", 43.6488, -79.4496, { vertical: "pharmacy", hours: { tue: [["09:00", "21:00"]] }, status: "onboarding" });
    await env.db.insert(discountCards).values([
      { merchantId: s.merchant.id, name: "Seniors 10%", percentOff: 10, eligibility: "seniors", terms: "Not valid on prescriptions" },
      { merchantId: s.merchant.id, name: "VIP", percentOff: 20, eligibility: "vip" },
    ]);
    await env.db.insert(promos).values([
      { merchantId: s.merchant.id, title: "Flu shot day", startsAt: new Date("2026-10-01"), status: "live" },
      { merchantId: s.merchant.id, title: "Members", startsAt: new Date("2026-10-01"), status: "live", audience: "members" },
    ]);
    const res = await call("GET", `/v1/public/shops/${s.merchant.slug}`);
    expect(res.statusCode).toBe(200);
    const body: networkApi.PublicShopResponse = res.json();
    expect(body.merchant).toMatchObject({ name: "Roncy Rx", vertical: "pharmacy", timezone: "America/Toronto" });
    expect(body.locations[0]).toMatchObject({ openNow: true, hours: { tue: [["09:00", "21:00"]] } });
    expect(body.program).toMatchObject({ earnType: "per_dollar", expiryDisclosure: "Points never expire." });
    expect(body.rewards.map((r) => r.name)).toEqual(["$5 off"]);
    expect(body.promos.map((p) => p.title)).toEqual(["Flu shot day"]);
    expect(body.discountCards).toEqual([{ id: expect.any(String), name: "Seniors 10%", percentOff: 10, amountOffCents: 0, terms: "Not valid on prescriptions", eligibility: "seniors" }]);
    expect(body.consentText).toContain("Roncy Rx");

    await env.db.update(merchants).set({ status: "closed" }).where(eq(merchants.id, s.merchant.id));
    expect((await call("GET", `/v1/public/shops/${s.merchant.slug}`)).statusCode).toBe(404);
    expect((await call("GET", `/v1/public/shops/nope`)).statusCode).toBe(404);
  });
});

describe("Pricing v2: paid content is hidden for shops without the feature", () => {
  it("hides promos from the feed, map flags and shop page, and discount cards from the shop page", async () => {
    const free = await shop("Free Cafe", 43.6488, -79.4496, { free: true });
    await env.db.insert(promos).values({ merchantId: free.merchant.id, title: "Free shop offer", startsAt: new Date("2026-10-01"), status: "live" });
    await env.db.insert(discountCards).values({ merchantId: free.merchant.id, name: "Seniors 10%", percentOff: 10, eligibility: "seniors" });
    const feed = (await call("GET", `/v1/network/feed?lat=${ME.lat}&lng=${ME.lng}`)).json();
    expect(feed.items.filter((i: { sponsored: boolean }) => !i.sponsored)).toHaveLength(0);
    const list = (await call("GET", "/v1/network/shops")).json();
    expect(list.items.find((i: networkApi.ShopListItemDto) => i.merchant.id === free.merchant.id)!.hasPromo).toBe(false);
    const page: networkApi.PublicShopResponse = (await call("GET", `/v1/public/shops/${free.merchant.slug}`)).json();
    expect(page.promos).toEqual([]);
    expect(page.discountCards).toEqual([]);
    expect(page.features).toMatchObject({ promos: false, discountCards: false });
    // The shop stays listed (network.listing is free) and the rows are kept: an admin override shows them again.
    await grantFeatures(env, free.merchant.id, ["promos.basic", "discount_cards"]);
    const again: networkApi.PublicShopResponse = (await call("GET", `/v1/public/shops/${free.merchant.slug}`)).json();
    expect(again.promos.map((p) => p.title)).toEqual(["Free shop offer"]);
    expect(again.discountCards).toHaveLength(1);
  });
});

describe("no-download QR join", () => {
  it("joins from the counter QR in four calls", async () => {
    const s = await shop("Cafe Q", 43.6488, -79.4496, { status: "onboarding" });
    const info = await call("GET", `/v1/public/join/${s.location.qrCode}`);
    expect(info.statusCode).toBe(200);
    const i: networkApi.JoinInfoResponse = info.json();
    expect(i).toMatchObject({ qrCode: s.location.qrCode, merchant: { name: "Cafe Q" }, location: { id: s.location.id }, rewards: [{ name: "$5 off" }] });

    const phone = nextPhone();
    const start = await call("POST", `/v1/public/join/${s.location.qrCode}`, { phone, name: "Quinn", consent: { text: i.consentText } });
    expect(start.statusCode).toBe(200);
    expect(start.json().next).toEqual({ verify: "POST /v1/auth/otp/verify", join: "POST /v1/me/memberships", locationQrCode: s.location.qrCode });
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("Cafe Q");

    const auth = await call("POST", "/v1/auth/otp/verify", { phone, code: start.json().devCode, name: "Quinn" });
    const join = await call("POST", "/v1/me/memberships", { locationQrCode: s.location.qrCode, consent: { text: i.consentText } }, auth.json().accessToken);
    expect(join.statusCode).toBe(201);
    expect(join.json().membership).toMatchObject({ merchant: { name: "Cafe Q" }, marketingConsent: { granted: true, text: i.consentText } });

    expect((await call("GET", `/v1/public/join/NOT-A-CODE`)).statusCode).toBe(404);
    expect((await call("POST", `/v1/public/join/${s.location.qrCode}`, { phone: "nope" })).statusCode).toBe(400);
    await env.db.update(locations).set({ active: false }).where(eq(locations.id, s.location.id));
    expect((await call("GET", `/v1/public/join/${s.location.qrCode}`)).statusCode).toBe(404);
  });
});
