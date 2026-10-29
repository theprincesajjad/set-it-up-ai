import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogItems, merchants, neighbourhoods } from "@ll/db";
import { activationFor, FEATURE_KEYS, FEATURES } from "@ll/shared";
import { awardPurchase } from "../src/services/ledger.js";
import type { Geocoder } from "../src/providers/geocoder.js";
import { call, setPlan } from "./commerce-fixtures.js";
import { createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

/** Founder decision 2026-10-27, "Trade tools self-serve": a new shop buys its trade's tools on day one; only network-wide extras wait. */
let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ activationThreshold: 25 });
});
afterEach(async () => env.close());

const signup = async (token: string, body: Record<string, unknown>) =>
  call(env, token, "POST", "/v1/merchants", { name: "New Shop", vertical: "salon", address: "10 Test St", phone: "(416) 555-0123", ...body });
const owner = async () => {
  const u = await createUser(env.db, { email: `o${Math.random().toString(36).slice(2)}@example.com` });
  return tokenFor(env, u);
};
const features = async (token: string, id: string) => {
  const r = await call(env, token, "GET", `/v1/merchants/${id}/features`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.fromEntries(r.body.features.map((f: { key: string }) => [f.key, f])) as any;
};
const geocoder = (hit: { lat: number; lng: number } | null): Geocoder => ({ name: "test", geocode: async () => hit });

describe("trade tools self-serve", () => {
  it("a new salon has its free calendar at once and buys Café & Retail for the rest, with no admin override", async () => {
    const token = await owner();
    const made = await signup(token, { vertical: "salon" });
    const id = made.body.merchant.id as string;
    let f = await features(token, id);
    // phase-solo A: one bookable calendar is free; the walk-in line is locked because of the plan (a price and a checkout), not "coming soon".
    expect(f["booking.appointments"]).toMatchObject({ enabled: true, lockedReason: null, stage: "ga" });
    expect(f["booking.walkin_queue"]).toMatchObject({ enabled: false, lockedReason: "plan" });

    const co = await call(env, token, "POST", `/v1/merchants/${id}/billing/checkout`, { plan: "plus" });
    expect(co.status).toBe(200);
    await call(env, null, "POST", "/v1/payments/fake/simulate", { action: "complete_checkout", id: co.body.sessionId });
    f = await features(token, id);
    for (const k of ["booking.appointments", "booking.walkin_queue", "staff.payouts", "booking.classes", "memberships.recurring", "orders.order_ahead"]) expect(f[k]?.enabled, k).toBe(true);
  });

  it("network-wide extras stay shut, even on the top plan, until an admin opens them", async () => {
    const token = await owner();
    const id = (await signup(token, { vertical: "retail" })).body.merchant.id as string;
    await setPlan(env, id, "pro");
    const f = await features(token, id);
    for (const k of ["ads.sponsored_promo", "ads.sponsored_listing", "ads.map_pin", "campaigns.neighbourhood", "promos.push_nearby"]) expect(f[k], k).toMatchObject({ enabled: false, lockedReason: "rollout" });
    expect(f["service.tickets"].enabled).toBe(true);
  });

  it("every feature is either a live trade tool or network-gated, including ones added later", () => {
    for (const k of FEATURE_KEYS) {
      const d = FEATURES[k];
      expect(d.defaultStage, k).toBe(d.networkGated ? "hidden" : "ga");
    }
  });

  it("pharmacist appointments are free for a pharmacy; classes are not", async () => {
    const token = await owner();
    const id = (await signup(token, { vertical: "pharmacy", name: "Corner Pharmacy" })).body.merchant.id as string;
    const f = await features(token, id);
    expect(f["booking.appointments"]).toMatchObject({ enabled: true, lockedReason: null });
    expect(f["booking.classes"].enabled).toBe(false);
    // phase-solo A: a salon on the same free plan gets one free calendar too; classes stay paid.
    const salon = (await signup(token, { vertical: "salon", name: "Cuts" })).body.merchant.id as string;
    expect((await features(token, salon))["booking.appointments"]).toMatchObject({ enabled: true, lockedReason: null });
    expect((await features(token, salon))["booking.classes"]).toMatchObject({ enabled: false, lockedReason: "plan" });
  });

  it("a pet shop's four pet features turn on with its plan, and only for pet shops", async () => {
    const token = await owner();
    const pet = (await signup(token, { vertical: "pet", name: "Paws" })).body.merchant.id as string;
    expect((await features(token, pet))["pets.daycare"].enabled).toBe(false);
    await setPlan(env, pet, "plus");
    const f = await features(token, pet);
    for (const k of ["pets.profiles", "pets.daycare", "pets.food_cards", "pets.report_cards"]) expect(f[k].enabled, k).toBe(true);
    const cafe = (await signup(token, { vertical: "cafe", name: "Beans" })).body.merchant.id as string;
    await setPlan(env, cafe, "plus");
    expect((await features(token, cafe))["pets.daycare"].enabled).toBe(false);
  });

  it("tiffin and catering need Growth, not Starter; banquet needs Pro", async () => {
    const token = await owner();
    const id = (await signup(token, { vertical: "tiffin", name: "Tiffin Co" })).body.merchant.id as string;
    await env.db.update(merchants).set({ restaurantTier: "starter" }).where(eq(merchants.id, id));
    let f = await features(token, id);
    expect(f["orders.order_ahead"].enabled).toBe(true); // a restaurant tier switches ordering on at once
    expect(f["restaurant.tiffin"].enabled).toBe(false);
    expect(f["restaurant.catering"].enabled).toBe(false);
    await env.db.update(merchants).set({ restaurantTier: "growth" }).where(eq(merchants.id, id));
    f = await features(token, id);
    expect(f["restaurant.tiffin"].enabled && f["restaurant.catering"].enabled).toBe(true);
    expect(f["restaurant.banquet"].enabled).toBe(false);
  });
});

describe("signup puts the shop on the map and on its street", () => {
  it("geocodes the address and assigns the nearest open street", async () => {
    const hood = await createNeighbourhood(env.db, "roncesvalles");
    env.ctx.providers.geocoder = geocoder({ lat: 43.6501, lng: -79.4501 });
    const made = await signup(await owner(), { address: "300 Lake Shore Blvd" });
    expect(made.status).toBe(201);
    expect(made.body.locations[0]).toMatchObject({ lat: 43.6501, lng: -79.4501 });
    expect(made.body.merchant.neighbourhoodId).toBe(hood.id);
  });

  it("falls back to a street named in the address when the geocoder finds nothing", async () => {
    const hood = await createNeighbourhood(env.db, "roncesvalles");
    env.ctx.providers.geocoder = geocoder(null);
    const made = await signup(await owner(), { address: "123 roncesvalles Ave" });
    expect(made.body.locations[0]).toMatchObject({ lat: hood.centerLat, lng: hood.centerLng });
    expect(made.body.merchant.neighbourhoodId).toBe(hood.id);
  });

  it("a shop no street covers can ask for its own street, which stays hidden until it opens", async () => {
    await createNeighbourhood(env.db, "roncesvalles");
    env.ctx.providers.geocoder = geocoder({ lat: 43.58, lng: -79.55 }); // Lake Shore: far from the only street
    const token = await owner();
    const made = await signup(token, { address: "1 Lake Shore Blvd W" });
    const id = made.body.merchant.id as string;
    expect(made.body.merchant.neighbourhoodId).toBeNull();
    expect((await call(env, token, "GET", `/v1/merchants/${id}/street`)).body).toMatchObject({ onMap: true, neighbourhood: null, open: false, opensAt: 5 });

    const asked = await call(env, token, "POST", `/v1/merchants/${id}/street`, { name: "Lake Shore Village" });
    expect(asked.status).toBe(200);
    expect(asked.body).toMatchObject({ neighbourhood: { name: "Lake Shore Village", status: "scouting" }, open: false, shops: 1, opensAt: 5 });
    // Asking again reuses the street; a second shop counts toward opening it.
    const second = (await signup(token, { name: "Second Shop", address: "5 Lake Shore Blvd W" })).body.merchant.id as string;
    expect((await call(env, token, "POST", `/v1/merchants/${second}/street`, { name: "lake shore village" })).body).toMatchObject({ shops: 2 });
    const hoods = await env.db.select().from(neighbourhoods).where(eq(neighbourhoods.name, "Lake Shore Village"));
    expect(hoods).toHaveLength(1);
    // Not on the public list while it is only a request.
    const pub = await call(env, null, "GET", "/v1/network/neighbourhoods");
    expect(pub.body.items.map((n: { name: string }) => n.name)).not.toContain("Lake Shore Village");
    // Only the owner can ask.
    expect((await call(env, await owner(), "POST", `/v1/merchants/${id}/street`, { name: "Elsewhere" })).status).toBe(403);
  });

  it("a shop with no pin can try its address again", async () => {
    await createNeighbourhood(env.db, "roncesvalles");
    env.ctx.providers.geocoder = geocoder(null);
    const token = await owner();
    const id = (await signup(token, { address: "Somewhere unlisted" })).body.merchant.id as string;
    expect((await call(env, token, "GET", `/v1/merchants/${id}/street`)).body).toMatchObject({ onMap: false });
    env.ctx.providers.geocoder = geocoder({ lat: 43.65, lng: -79.45 });
    expect((await call(env, token, "POST", `/v1/merchants/${id}/locate`, {})).body).toMatchObject({ onMap: true, open: true });
  });
});

describe("a shop is listed from its first member", () => {
  it("shows in network search once one member has visited, long before 25", async () => {
    env.ctx.providers.geocoder = geocoder({ lat: 43.65, lng: -79.45 });
    const token = await owner();
    const made = await signup(token, { name: "Lakeshore Hardware", vertical: "retail", address: "9 Lake Shore" });
    const id = made.body.merchant.id as string;
    expect(made.body.merchant.status).toBe("onboarding");
    const search = () => call(env, null, "GET", "/v1/network/shops?q=Lakeshore");
    expect((await search()).body.items).toHaveLength(0);
    await awardPurchase(env.ctx, { merchantId: id, phone: nextPhone(), amountCents: 4250, source: "staff_app" });
    const after = await search();
    expect(after.body.items.map((i: { merchant: { name: string } }) => i.merchant.name)).toEqual(["Lakeshore Hardware"]);
    expect(after.body.items[0].location).toMatchObject({ lat: 43.65, lng: -79.45 });
    expect((await env.db.select().from(merchants).where(eq(merchants.id, id)))[0]!.status).toBe("onboarding");
  });
});

describe("onboarding by trade", () => {
  const checklist = async (token: string, id: string) => (await call(env, token, "GET", `/v1/merchants/${id}/onboarding`)).body;

  it("starts a restaurant with its menu and a salon with services after the program", async () => {
    const t1 = await owner();
    const r = await signup(t1, { vertical: "restaurant_south_asian", name: "Karahi House" });
    const c1 = await checklist(t1, r.body.merchant.id);
    expect(c1.steps.map((s: { key: string }) => s.key).slice(0, 3)).toEqual(["trade_setup", "program", "first_stamp"]);
    expect(c1.steps[0]).toMatchObject({ label: "Add your menu", done: false });
    expect(c1.currentStep).toBe("trade_setup");
    await env.db.insert(catalogItems).values({ merchantId: r.body.merchant.id, name: "Chicken biryani", priceCents: 1699 });
    expect((await checklist(t1, r.body.merchant.id)).steps[0].done).toBe(true);

    const t2 = await owner();
    const s = await signup(t2, { vertical: "barber", name: "Fade Lab" });
    const c2 = await checklist(t2, s.body.merchant.id);
    expect(c2.steps.map((x: { key: string }) => x.key).slice(0, 3)).toEqual(["program", "trade_setup", "first_stamp"]);
    expect(c2.steps[1].label).toBe("Services, hours and tax");

    const t3 = await owner();
    const cafe = await signup(t3, { vertical: "cafe", name: "Beans" });
    expect((await checklist(t3, cafe.body.merchant.id)).steps.map((x: { key: string }) => x.key)).not.toContain("trade_setup");
  });

  it("gives a florist 10 members in 60 days, not 25 in 30, and never a 'Past day 30' card", async () => {
    expect(activationFor("florist")).toMatchObject({ target: 10, windowDays: 60, slow: true });
    expect(activationFor("cafe")).toMatchObject({ target: 25, windowDays: 30, slow: false });
    const token = await owner();
    const id = (await signup(token, { vertical: "florist", name: "Petal & Stem" })).body.merchant.id as string;
    const c = await checklist(token, id);
    expect(c.activationTarget).toBe(10);
    expect(c.activation).toMatchObject({ windowDays: 60, target: 10, leadingMembers: 5, leadingByDay: 30 });
    // 40 days in with 3 members: still on the clock, not "late".
    const created = new Date(env.clock.now.getTime() - 40 * 86_400_000);
    await env.db.update(merchants).set({ createdAt: created }).where(eq(merchants.id, id));
    for (let i = 0; i < 3; i++) await awardPurchase(env.ctx, { merchantId: id, phone: nextPhone(), amountCents: 3000, source: "staff_app" });
    const later = (await checklist(token, id)).activation;
    expect(later.pace).not.toBe("late");
    expect(later.paceLabel).toMatch(/day 41 of 60/);
    // 70 days in: the label is the count, not a verdict.
    await env.db.update(merchants).set({ createdAt: new Date(env.clock.now.getTime() - 70 * 86_400_000) }).where(eq(merchants.id, id));
    expect((await checklist(token, id)).activation.paceLabel).toBe("3 of 10 so far");
    // A tenth member makes the shop active.
    for (let i = 0; i < 7; i++) await awardPurchase(env.ctx, { merchantId: id, phone: nextPhone(), amountCents: 3000, source: "staff_app" });
    expect((await env.db.select().from(merchants).where(eq(merchants.id, id)))[0]!.status).toBe("active");
  });
});
