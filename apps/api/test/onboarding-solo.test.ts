/**
 * Solo-pro onboarding (docs/design/onboarding-v1.md §3, §4; phase-solo B): signup by "Where do you work?", the offset pin,
 * the six cards, the booking-link milestones, the solo nudges and the public link import allow-list.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locations, merchantMilestones, merchants, pushTokens } from "@ll/db";
import { AREA_PIN_MAX_METRES, MILESTONE_KEYS, distanceMetres, offsetPin, onboardingPath } from "@ll/shared";
import { allowedImportHost, importLink, parseImportPage } from "../src/services/link-import.js";
import { milestonesFor, runOnboardingNudges } from "../src/services/onboarding.js";
import { call, customer } from "./commerce-fixtures.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => env.close());

const HOOD = { lat: 43.6505, lng: -79.4757 };

async function hood() {
  const { neighbourhoods } = await import("@ll/db");
  const [n] = await env.db.insert(neighbourhoods).values({ slug: `bloor-west-${Math.random().toString(36).slice(2, 6)}`, name: "Bloor West", status: "live", centerLat: HOOD.lat, centerLng: HOOD.lng, radiusMetres: 1500 }).returning();
  return n!;
}

async function signupSolo(payload: Record<string, unknown> = {}) {
  const owner = await createUser(env.db, { email: `o${Math.random().toString(36).slice(2)}@example.com` });
  const token = await tokenFor(env, owner);
  const res = await call(env, token, "POST", "/v1/merchants", { name: "Nails by Mo", vertical: "nails", workSetting: "home", postalCode: "m6s2k1", phone: "(416) 555-0134", ...payload });
  return { owner, token, res, id: res.body?.merchant?.id as string };
}

describe("signup: where do you work", () => {
  it("a home studio needs no street address; it is placed by its area with an offset pin and the address stays private", async () => {
    await hood();
    // The geocoder only ever sees the postal code.
    const asked: string[] = [];
    env.ctx.providers.geocoder = { name: "test", geocode: async (q) => (asked.push(q.address), { lat: 43.6512, lng: -79.4801 }) };
    const { res, id } = await signupSolo();
    expect(res.status).toBe(201);
    expect(asked).toEqual(["M6S 2K1"]);
    const loc = res.body.locations[0];
    expect(loc).toMatchObject({ addressVisibility: "area", areaLabel: "Bloor West", address: "", postalCode: "M6S 2K1", lat: null, lng: null });
    expect(res.body.merchant).toMatchObject({ workSetting: "home", vertical: "nails" });
    const d = distanceMetres(HOOD, { lat: loc.mapLat, lng: loc.mapLng });
    expect(d).toBeLessThanOrEqual(AREA_PIN_MAX_METRES + 1);
    expect(d).toBeGreaterThan(50);
    // Same merchant, same pin, every time.
    expect(offsetPin(id, HOOD)).toEqual({ lat: loc.mapLat, lng: loc.mapLng });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, id));
    expect(m!.neighbourhoodId).toBeTruthy();
  });

  it("keeps where the owner came from (the landing page's src) with the signup", async () => {
    const { id } = await signupSolo({ source: "nail-techs" });
    const [row] = await env.db.select().from(merchantMilestones).where(eq(merchantMilestones.merchantId, id));
    expect(row).toMatchObject({ key: "signed_up", data: { source: "nail-techs", workSetting: "home" } });
    expect((await signupSolo({ source: "<bad>" })).res.status).toBe(400);
  });

  it("falls back to the city centre when the postal code cannot be placed; a mobile pro is city-only with a radius", async () => {
    const home = await signupSolo({ postalCode: "M6S 2K1" });
    expect(home.res.body.locations[0]).toMatchObject({ addressVisibility: "area", areaLabel: "Toronto M6S" });
    const mobile = await signupSolo({ name: "Glam on the Go", vertical: "makeup", workSetting: "mobile", postalCode: undefined, serviceRadiusKm: 20 });
    expect(mobile.res.status).toBe(201);
    expect(mobile.res.body.locations[0]).toMatchObject({ addressVisibility: "city", areaLabel: null, mapLat: 43.6532, mapLng: -79.3832 });
    expect(mobile.res.body.merchant.serviceRadiusKm).toBe(20);
  });

  it("a shop or salon still needs its street address", async () => {
    const r = await signupSolo({ workSetting: "shop", postalCode: undefined });
    expect(r.res.status).toBe(400);
    const ok = await signupSolo({ workSetting: "shop", address: "2210 Danforth Ave" });
    expect(ok.res.status).toBe(201);
    expect(ok.res.body.locations[0]).toMatchObject({ addressVisibility: "exact", address: "2210 Danforth Ave" });
  });
});

describe("offset pin", () => {
  it("is deterministic per merchant and always within 400 m of the centroid", () => {
    for (let i = 0; i < 300; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      const a = offsetPin(id, HOOD);
      expect(offsetPin(id, HOOD)).toEqual(a);
      expect(distanceMetres(HOOD, a)).toBeLessThanOrEqual(AREA_PIN_MAX_METRES + 1);
    }
    expect(offsetPin("a", HOOD)).not.toEqual(offsetPin("b", HOOD));
  });
});

describe("the six cards", () => {
  it("is the solo path for a nail tech and goes live once a service and hours are saved", async () => {
    const { id, token } = await signupSolo();
    const base = `/v1/merchants/${id}/onboarding`;
    let c = (await call(env, token, "GET", base)).body;
    expect(c.path).toBe("solo");
    expect(c.steps.map((s: { key: string }) => s.key)).toEqual(["your_link", "services", "hours", "privacy", "share", "invite"]);
    expect(c.later.map((s: { key: string }) => s.key)).toEqual(["profile", "loyalty", "instagram_connect", "site", "promos"]);
    expect(c.solo).toMatchObject({ live: false, workSetting: "home", addressVisibility: "area" });
    expect(c.solo.starters.map((s: { name: string }) => s.name)).toContain("Gel manicure");

    // Card 1: the link and the handle.
    expect((await call(env, token, "POST", `${base}/solo/link`, { slug: "admin" })).status).toBe(409);
    c = (await call(env, token, "POST", `${base}/solo/link`, { slug: "nailsbymo", instagram: "@Nails.By.Mo" })).body;
    expect(c.solo.slug).toBe("nailsbymo");
    expect(c.solo.instagram).toBe("nails.by.mo");
    expect(c.steps[0].done).toBe(true);

    // Card 2: two ticked services. Card 3: the defaults.
    env.clock.now = new Date(env.clock.now.getTime() + 95_000);
    c = (await call(env, token, "POST", `${base}/solo/services`, { items: [{ name: "Gel manicure", durationMin: 60, priceCents: 5500, depositCents: 1500 }, { name: "Removal", durationMin: 30, priceCents: 2000, depositCents: 0 }] })).body;
    expect(c.solo.services).toHaveLength(2);
    expect(c.solo.live).toBe(false);
    c = (await call(env, token, "POST", `${base}/solo/hours`, { days: [] })).body;
    expect(c.solo.hours.map((h: { weekday: number }) => h.weekday)).toEqual([2, 3, 4, 5, 6]);
    expect(c.solo.live).toBe(true);
    expect(c.solo.secondsToLive).toBe(95);
    const ms = await milestonesFor(env.db, id);
    expect(ms.has("booking_link_live")).toBe(true);

    // The public booking page works for the new slug.
    const pub = await call(env, null, "GET", "/v1/public/shops/nailsbymo/services");
    expect(pub.status).toBe(200);
    expect(pub.body.services.map((s: { name: string }) => s.name)).toEqual(["Gel manicure", "Removal"]);

    // Card 4, 5, 6.
    c = (await call(env, token, "POST", `${base}/solo/privacy`, { visibility: "city", address: "12 Willard Ave" })).body;
    expect(c.solo).toMatchObject({ addressVisibility: "city", hasStreetAddress: true });
    c = (await call(env, token, "POST", `${base}/solo/share`, { channel: "instagram" })).body;
    expect(c.solo.bookings.milestones.find((m: { key: string }) => m.key === "first_share").at).toBeTruthy();
    const inv = (await call(env, token, "POST", `${base}/solo/invite`, { people: [{ name: "Ava", phone: "416-555-0199" }] })).body;
    expect(inv.invite.created).toBe(1);
    expect(inv.currentStep).toBe("done");
    // Nothing was texted to the regular: the pro sends it from her own phone.
    expect(env.ctx.providers.outbox.sms.some((m: { to: string }) => m.to === "+14165550199")).toBe(false);
  });

  it("an online booking by a client (not the owner) is the first_online_booking milestone", async () => {
    const { id, token } = await signupSolo();
    const base = `/v1/merchants/${id}/onboarding`;
    await call(env, token, "POST", `${base}/solo/services`, { items: [{ name: "Removal", durationMin: 30, priceCents: 2000, depositCents: 0 }] });
    await call(env, token, "POST", `${base}/solo/hours`, { days: [{ weekday: 3, startsLocal: "10:00", endsLocal: "18:00" }] });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, id));
    const svc = (await call(env, null, "GET", `/v1/public/shops/${m!.slug}/services`)).body.services[0];
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [svc.id], startsAt: "2026-11-04T15:00:00.000Z" });
    expect(r.status).toBe(201);
    const cl = (await call(env, token, "GET", base)).body;
    expect(cl.solo.bookings.count).toBe(1);
    expect((await milestonesFor(env.db, id)).has("first_online_booking")).toBe(true);
  });

  it("keeps the storefront setup for older salons, and gives a salon that works from a shop the appointment-led cards", () => {
    expect(onboardingPath("salon", null)).toBe("storefront");
    expect(onboardingPath("salon", "shop")).toBe("appointment");
    expect(onboardingPath("barber", "home")).toBe("solo");
    expect(onboardingPath("nails", "shop")).toBe("solo");
    expect(onboardingPath("cafe", "shop")).toBe("storefront");
  });

  it("has the milestone keys the activation card reads", () => {
    for (const k of ["booking_link_live", "first_share", "first_online_booking", "five_bookings", "ten_bookings", "first_promo_sent", "site_published", "instagram_connected"]) expect(MILESTONE_KEYS).toContain(k);
  });
});

describe("solo nudges", () => {
  it("day 1 with no share goes by app push to the owner first, and by text when there is no app", async () => {
    const a = await signupSolo();
    await env.db.insert(pushTokens).values({ userId: a.owner.id, token: "ExponentPushToken[owner]", platform: "ios" });
    const b = await signupSolo({ name: "Brows by Bea", vertical: "brows_lashes" });
    env.clock.now = new Date(env.clock.now.getTime() + 25 * 3_600_000);
    const pushes = env.ctx.providers.outbox.push.length;
    const r = await runOnboardingNudges(env.ctx);
    expect(r.sent).toBe(2);
    expect(env.ctx.providers.outbox.push.slice(pushes).some((p: { token: string; body: string }) => p.token === "ExponentPushToken[owner]" && p.body.includes("nobody has it yet"))).toBe(true);
    const sms = env.ctx.providers.outbox.sms.at(-1)!;
    expect(sms.body).toContain("nobody has it yet");
    expect(sms.body).toContain("/v1/public/onboarding/unsubscribe");
    const keys = (await env.db.select().from(merchantMilestones).where(eq(merchantMilestones.merchantId, b.id))).map((x) => x.key);
    expect(keys).toContain("solo_d1");
    // Sent once.
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(0);
  });
});

describe("public link import", () => {
  it("only reads Linktree, Beacons, Fresha and Booksy over https", async () => {
    expect(allowedImportHost("https://linktr.ee/nailsbymo")).toBe("linktr.ee");
    expect(allowedImportHost("linktr.ee/nailsbymo")).toBe("linktr.ee");
    expect(allowedImportHost("https://www.fresha.com/a/nails-by-mo")).toBe("fresha.com");
    expect(allowedImportHost("https://booksy.com/en-ca/123")).toBe("booksy.com");
    expect(allowedImportHost("https://beacons.ai/mo")).toBe("beacons.ai");
    for (const bad of ["http://linktr.ee/x", "https://instagram.com/nailsbymo", "https://linktr.ee.evil.com/x", "https://evil.com/linktr.ee", "https://user:pw@linktr.ee/x", "https://linktr.ee:8443/x", "https://169.254.169.254/", "file:///etc/passwd", "https://sub.fresha.com/x"]) expect(allowedImportHost(bad), bad).toBeNull();
  });

  it("refuses any other host through the API without fetching it", async () => {
    const { id, token } = await signupSolo();
    const r = await call(env, token, "POST", `/v1/merchants/${id}/onboarding/import-link`, { url: "https://instagram.com/nailsbymo" });
    expect(r.status).toBe(400);
  });

  it("will not follow a redirect off the allow-list", async () => {
    const f = (async () => new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } })) as unknown as typeof fetch;
    await expect(importLink("https://linktr.ee/mo", f)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reads the links on a Linktree and the services and prices on a Fresha page", async () => {
    const lt = parseImportPage("linktr.ee", `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { links: [{ title: "Book on Fresha", url: "https://www.fresha.com/a/mo" }, { title: "TikTok", url: "https://tiktok.com/@mo" }] } } })}</script></html>`, "https://linktr.ee/mo");
    expect(lt.links).toEqual([{ title: "Book on Fresha", url: "https://www.fresha.com/a/mo" }, { title: "TikTok", url: "https://tiktok.com/@mo" }]);
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "BeautySalon", name: "Mo Nails", makesOffer: [{ "@type": "Offer", itemOffered: { "@type": "Service", name: "Gel manicure" }, price: "55.00" }, { "@type": "Service", name: "Pedicure", offers: { price: 60 }, duration: "PT1H" }] })}</script>`;
    const fr = parseImportPage("fresha.com", html, "https://www.fresha.com/a/mo");
    expect(fr.services).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Pedicure", priceCents: 6000, durationMin: 60 })]));
    const f = (async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect((await importLink("fresha.com/a/mo", f)).host).toBe("fresha.com");
  });
});

describe("locations stay exact for a storefront", () => {
  it("a café signup keeps exact visibility and no map pin of its own", async () => {
    const owner = await createUser(env.db, {});
    const token = await tokenFor(env, owner);
    const r = await call(env, token, "POST", "/v1/merchants", { name: "Sunrise Bakery", vertical: "bakery", address: "2210 Danforth Ave", phone: "(416) 555-0134" });
    expect(r.status).toBe(201);
    const [l] = await env.db.select().from(locations).where(eq(locations.merchantId, r.body.merchant.id));
    expect(l).toMatchObject({ addressVisibility: "exact", mapLat: null, areaLabel: null });
  });
});
