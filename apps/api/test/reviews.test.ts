import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, cateringEvents, merchantMembers, merchants, orders, pushTokens, reviewRequests, tiffinDeliveries, tiffinPlans, tiffinSubscriptions, users } from "@ll/db";
import { scheduleCompletedReviewRequests, scheduleReviewRequest, sendDueReviewRequests, SEND_DELAY_MS } from "../src/services/reviews.js";
import { call, customer, paidMerchant } from "./commerce-fixtures.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";
import { connectWhatsapp, optIn, req, restaurantShop, wa } from "./restaurant-msg-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

type Shop = Awaited<ReturnType<typeof restaurantShop>>;

async function pickedUpOrder(shop: Shop, userId: string, at = env.clock.now) {
  const [o] = await env.db
    .insert(orders)
    .values({ merchantId: shop.merchant.id, locationId: shop.location.id, userId, number: Math.floor(Math.random() * 1e6), status: "picked_up", pickedUpAt: at, subtotalCents: 1400, totalCents: 1582 })
    .returning();
  return o!;
}

const consent = (shop: Shop, userId: string) => env.db.insert(merchantMembers).values({ merchantId: shop.merchant.id, userId, marketingConsentAt: env.clock.now }).onConflictDoNothing();
const advance = (ms: number) => (env.clock.now = new Date(env.clock.now.getTime() + ms));

describe("scheduling and channel choice", () => {
  it("creates a request with a token after an order is picked up and sends it after the delay", async () => {
    const shop = await restaurantShop(env, "starter");
    const c = await customer(env, { name: "Aisha Khan" });
    await consent(shop, c.user.id);
    await env.db.update(merchants).set({ email: null }).where(eq(merchants.id, shop.merchant.id));
    await env.db.update(users).set({ email: "aisha@example.com", phone: null }).where(eq(users.id, c.user.id));
    await pickedUpOrder(shop, c.user.id);
    expect(await scheduleCompletedReviewRequests(env.ctx)).toBe(1);
    expect(await scheduleCompletedReviewRequests(env.ctx)).toBe(0); // idempotent
    const [r] = await env.db.select().from(reviewRequests);
    expect(r).toMatchObject({ merchantId: shop.merchant.id, userId: c.user.id, channel: "email", sentAt: null, rating: null });
    expect(r!.token).toMatch(/^[A-Za-z0-9_-]{16,}$/);

    expect(await sendDueReviewRequests(env.ctx)).toBe(0); // too soon
    advance(SEND_DELAY_MS + 60_000);
    expect(await sendDueReviewRequests(env.ctx)).toBe(1);
    expect(await sendDueReviewRequests(env.ctx)).toBe(0);
    expect(env.ctx.providers.outbox.email.at(-1)).toMatchObject({ to: "aisha@example.com", subject: "How was Biryani House?" });
    expect(env.ctx.providers.outbox.email.at(-1)!.text).toContain(`/r/${r!.token}`);
    expect((await env.db.select().from(reviewRequests))[0]!.sentAt).toBeTruthy();
  });

  it("prefers WhatsApp (opted in) over SMS over email, and falls back when a channel can't send", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop);
    const c = await customer(env, { pushToken: false });
    await consent(shop, c.user.id);
    await env.db.update(users).set({ email: "c@example.com" }).where(eq(users.id, c.user.id));

    // CASL consent + phone + paid SMS -> sms
    let req1 = await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() });
    expect(req1!.channel).toBe("sms");

    // Opted in to WhatsApp -> whatsapp wins
    await env.db.delete(reviewRequests);
    await optIn(env, shop.merchant.id, c.user.id);
    req1 = await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() });
    expect(req1!.channel).toBe("whatsapp");
    advance(SEND_DELAY_MS + 1000);
    expect(await sendDueReviewRequests(env.ctx)).toBe(1);
    expect(wa(env).sent.at(-1)).toMatchObject({ kind: "template", template: "review_request", to: c.user.phone });
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);

    // WhatsApp out of credits -> falls back to SMS
    await env.db.delete(reviewRequests);
    await env.db.update(merchants).set({ whatsappCreditsUsed: 1000 }).where(eq(merchants.id, shop.merchant.id));
    advance(15 * 86400_000);
    const again = await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() });
    expect(again!.channel).toBe("whatsapp");
    advance(SEND_DELAY_MS + 1000);
    expect(await sendDueReviewRequests(env.ctx)).toBe(1);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("/r/");
    expect((await env.db.select().from(reviewRequests))[0]!.channel).toBe("sms");
  });

  it("asks nobody who hasn't consented: no consent, muted, or no consented channel", async () => {
    const shop = await restaurantShop(env, "starter");
    const noConsent = await customer(env, { pushToken: false });
    expect(await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: noConsent.user.id, sourceId: crypto.randomUUID() })).toBeNull();
    const muted = await createUser(env.db, { email: "m@example.com" });
    await env.db.insert(merchantMembers).values({ merchantId: shop.merchant.id, userId: muted.id, marketingConsentAt: env.clock.now, muted: true });
    expect(await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: muted.id, sourceId: crypto.randomUUID() })).toBeNull();
    // An app user gets a push, which needs no marketing consent.
    const app = await customer(env);
    const r = await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: app.user.id, sourceId: crypto.randomUUID() });
    expect(r!.channel).toBe("push");
    advance(SEND_DELAY_MS + 1000);
    expect(await sendDueReviewRequests(env.ctx)).toBe(1);
    expect(env.ctx.providers.outbox.push.at(-1)).toMatchObject({ title: "How was Biryani House?" });
    expect(await env.db.select().from(pushTokens)).toHaveLength(1);
  });

  it("needs the feature and a Google link, and never asks the same customer twice in 14 days or for the same order", async () => {
    const shop = await restaurantShop(env, "starter");
    const c = await customer(env);
    const o = await pickedUpOrder(shop, c.user.id);
    const first = await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: o.id });
    expect(first).toBeTruthy();
    expect(await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: o.id })).toBeNull();
    expect(await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() })).toBeNull(); // 14 day cap
    advance(15 * 86400_000);
    expect(await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() })).toBeTruthy();

    await env.db.update(merchants).set({ googleReviewUrl: null }).where(eq(merchants.id, shop.merchant.id));
    advance(15 * 86400_000);
    expect(await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() })).toBeNull();
    await env.db.update(merchants).set({ googleReviewUrl: "https://g.page/r/x", restaurantTier: null }).where(eq(merchants.id, shop.merchant.id));
    expect(await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() })).toBeNull();
  });

  it("also covers tiffin deliveries and completed catering events", async () => {
    const shop = await restaurantShop(env, "growth");
    const t = await customer(env);
    const [plan] = await env.db.insert(tiffinPlans).values({ merchantId: shop.merchant.id, name: "Weekday lunch", priceCents: 9000 }).returning();
    const [sub] = await env.db.insert(tiffinSubscriptions).values({ merchantId: shop.merchant.id, planId: plan!.id, userId: t.user.id, startDate: "2026-11-01", priceCents: 9000 }).returning();
    await env.db.insert(tiffinDeliveries).values({ merchantId: shop.merchant.id, subscriptionId: sub!.id, date: "2026-11-03", status: "delivered", deliveredAt: env.clock.now });
    const ev = await customer(env);
    await env.db.insert(cateringEvents).values({ merchantId: shop.merchant.id, userId: ev.user.id, number: 1, eventDate: "2026-11-01", headcount: 80, status: "completed", approvalToken: "tok1", updatedAt: env.clock.now });
    const skipped = await customer(env);
    await env.db.insert(cateringEvents).values({ merchantId: shop.merchant.id, userId: skipped.user.id, number: 2, eventDate: "2026-11-30", headcount: 20, status: "confirmed", approvalToken: "tok2" });
    expect(await scheduleCompletedReviewRequests(env.ctx)).toBe(2);
    const rows = await env.db.select().from(reviewRequests);
    expect(rows.map((r) => r.userId).sort()).toEqual([t.user.id, ev.user.id].sort());
  });
});

describe("public review page", () => {
  async function pending() {
    const shop = await restaurantShop(env, "starter");
    const c = await customer(env, { name: "Aisha Khan" });
    const r = await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() });
    return { shop, c, token: r!.token, id: r!.id };
  }

  it("shows the shop and always includes the Google link", async () => {
    const { token } = await pending();
    const v = await req(env, null, "GET", `/v1/public/reviews/${token}`);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ merchant: { name: "Biryani House" }, googleReviewUrl: "https://g.page/r/test-biryani/review", alreadyResponded: false, rating: null });
    expect((await env.db.select().from(reviewRequests))[0]!.clickedAt).toBeTruthy();
    expect((await req(env, null, "GET", "/v1/public/reviews/nope")).status).toBe(404);
  });

  it("4-5 stars get the same two options as every other rating", async () => {
    const { token } = await pending();
    const r = await req(env, null, "POST", `/v1/public/reviews/${token}`, { rating: 5, feedback: "Best biryani" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ rating: 5, leadWithGoogle: true, googleReviewUrl: "https://g.page/r/test-biryani/review" });
    const [row] = await env.db.select().from(reviewRequests);
    expect(row).toMatchObject({ rating: 5, feedback: "Best biryani" });
    expect(env.ctx.providers.outbox.email).toHaveLength(0); // no alert for happy customers
  });

  it("1-3 stars notify the shop privately and are offered the same Google link at the same weight", async () => {
    const { token, shop, c } = await pending();
    await env.db.update(merchants).set({ email: "owner@biryani.example" }).where(eq(merchants.id, shop.merchant.id));
    const r = await req(env, null, "POST", `/v1/public/reviews/${token}`, { rating: 2, feedback: "Cold on arrival" });
    expect(r.body).toMatchObject({ rating: 2, leadWithGoogle: true, googleReviewUrl: "https://g.page/r/test-biryani/review" });
    const mail = env.ctx.providers.outbox.email.filter((e) => e.to === "owner@biryani.example");
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe("2-star feedback at Biryani House");
    expect(mail[0]!.text).toContain("Cold on arrival");
    expect(mail[0]!.text).toContain(c.user.phone!);
    const list = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews?rating=2`);
    expect(list.body.items[0]).toMatchObject({ rating: 2, feedback: "Cold on arrival", responded: true, customer: { name: "Aisha Khan" } });
  });

  it("takes one answer per request: a repeat submit returns the stored rating and does not alert twice", async () => {
    const { token, shop } = await pending();
    await env.db.update(merchants).set({ email: "owner@biryani.example" }).where(eq(merchants.id, shop.merchant.id));
    await req(env, null, "POST", `/v1/public/reviews/${token}`, { rating: 1 });
    const again = await req(env, null, "POST", `/v1/public/reviews/${token}`, { rating: 5 });
    expect(again.body.rating).toBe(1);
    expect(env.ctx.providers.outbox.email.filter((e) => e.to === "owner@biryani.example")).toHaveLength(1);
    const v = await req(env, null, "GET", `/v1/public/reviews/${token}`);
    expect(v.body).toMatchObject({ alreadyResponded: true, rating: 1 });
  });

  it("validates the rating", async () => {
    const { token } = await pending();
    for (const rating of [0, 6, 2.5, "5"]) expect((await req(env, null, "POST", `/v1/public/reviews/${token}`, { rating })).status).toBe(400);
    expect((await req(env, null, "POST", `/v1/public/reviews/${token}`, {})).status).toBe(400);
  });
});

describe("merchant list, stats and settings", () => {
  it("reports average rating, distribution and response rate", async () => {
    const shop = await restaurantShop(env, "starter");
    const ratings = [5, 4, 2, null, null];
    const tokens: string[] = [];
    for (const rating of ratings) {
      const c = await customer(env);
      const [r] = await env.db.insert(reviewRequests).values({ merchantId: shop.merchant.id, userId: c.user.id, channel: "sms", token: crypto.randomUUID().replace(/-/g, ""), sentAt: env.clock.now, createdAt: new Date(env.clock.now.getTime() - tokens.length * 1000), ...(rating ? { rating, clickedAt: env.clock.now } : {}) }).returning();
      tokens.push(r!.token);
    }
    const s = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews/stats`);
    expect(s.body).toMatchObject({ requested: 5, sent: 5, responded: 3, responseRate: 0.6, averageRating: 3.67, opened: 3, distribution: { "1": 0, "2": 1, "3": 0, "4": 1, "5": 1 } });
    const all = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews?limit=2`);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.nextCursor).toBeTruthy();
    const next = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews?limit=10&cursor=${all.body.nextCursor}`);
    expect(next.body.items).toHaveLength(3);
    expect((await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews?status=pending`)).body.items).toHaveLength(2);
    expect((await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews?rating=9`)).status).toBe(400);
  });

  it("is empty-safe, tier-gated and scoped to staff of the shop", async () => {
    const shop = await restaurantShop(env, "starter");
    const other = await restaurantShop(env, "starter");
    const s = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews/stats`);
    expect(s.body).toMatchObject({ requested: 0, responded: 0, responseRate: 0, averageRating: null });
    expect((await req(env, other.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews`)).status).toBe(403);
    await env.db.update(merchants).set({ restaurantTier: null }).where(eq(merchants.id, shop.merchant.id));
    expect((await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reviews`)).status).toBe(402);
  });

  it("sets or clears the Google review link (https only) and can send a request for one order now", async () => {
    const shop = await restaurantShop(env, "starter");
    const url = `/v1/merchants/${shop.merchant.id}/reviews`;
    expect((await req(env, shop.ownerToken, "PUT", `${url}/settings`, { googleReviewUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await req(env, shop.ownerToken, "PUT", `${url}/settings`, { googleReviewUrl: "https://search.google.com/local/writereview?placeid=abc" })).body.googleReviewUrl).toContain("placeid=abc");

    const c = await customer(env);
    const o = await pickedUpOrder(shop, c.user.id);
    const sent = await req(env, shop.ownerToken, "POST", `${url}/requests`, { orderId: o.id });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ channel: "push", responded: false });
    expect(sent.body.sentAt).toBeTruthy();
    expect((await req(env, shop.ownerToken, "POST", `${url}/requests`, { orderId: o.id })).status).toBe(400); // already asked

    await req(env, shop.ownerToken, "PUT", `${url}/settings`, { googleReviewUrl: null });
    expect((await req(env, shop.ownerToken, "GET", `${url}/stats`)).body.googleReviewUrl).toBeNull();
  });
});

// ---- phase-pro: p4 (appointment review requests) ----
describe("appointments: a request after every completed visit", () => {
  async function solo(plan: "free" | "plus" = "plus", mode: "on" | "off" = "on") {
    const m = await paidMerchant(env, { plan, vertical: "beauty" });
    await env.db.update(merchants).set({ reviewRequestsMode: mode, googleReviewUrl: "https://g.page/r/priya-nails/review" }).where(eq(merchants.id, m.merchant.id));
    return m;
  }
  type Solo = Awaited<ReturnType<typeof solo>>;
  async function visit(m: Solo, status: string, userId: string, startsAt = env.clock.now) {
    const [a] = await env.db
      .insert(appointments)
      .values({
        merchantId: m.merchant.id,
        locationId: m.location.id,
        userId,
        staffId: m.owner.id,
        items: [{ serviceId: null, name: "Gel set", durationMin: 60, priceCents: 6500 }],
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        status,
        completedAt: status === "completed" ? startsAt : null,
      })
      .returning();
    return a!;
  }
  const requests = () => env.db.select().from(reviewRequests);

  it("schedules one request per completed visit, never for a no-show or a cancelled visit, and shares the re-ask window with orders", async () => {
    const m = await solo();
    const c = await customer(env, { name: "Ayesha Rao" });
    const noShow = await visit(m, "no_show", c.user.id);
    const cancelled = await visit(m, "cancelled", c.user.id);
    expect(await scheduleReviewRequest(env.ctx, m.merchant, { kind: "appointment", id: noShow.id })).toBeNull();
    expect(await scheduleReviewRequest(env.ctx, m.merchant, { kind: "appointment", id: cancelled.id })).toBeNull();
    expect(await requests()).toHaveLength(0);

    const done = await visit(m, "completed", c.user.id);
    const r = await scheduleReviewRequest(env.ctx, m.merchant, { kind: "appointment", id: done.id });
    expect(r).toMatchObject({ merchantId: m.merchant.id, userId: c.user.id, orderId: done.id, channel: "push", sentAt: null });
    expect(await scheduleReviewRequest(env.ctx, m.merchant, { kind: "appointment", id: done.id })).toBeNull(); // once per visit
    expect(await scheduleCompletedReviewRequests(env.ctx)).toBe(0); // the scan agrees

    // The 14-day window holds across kinds: a second visit, and an order, the same week are not asked again.
    const again = await visit(m, "completed", c.user.id);
    expect(await scheduleReviewRequest(env.ctx, m.merchant, { kind: "appointment", id: again.id })).toBeNull();
    expect(await scheduleReviewRequest(env.ctx, { merchantId: m.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() })).toBeNull();
    advance(15 * 86_400_000);
    const later = await visit(m, "completed", c.user.id);
    expect(await scheduleReviewRequest(env.ctx, m.merchant, { kind: "appointment", id: later.id })).toMatchObject({ orderId: later.id });
  });

  it("schedules nothing on Free or with the switch off", async () => {
    const c = await customer(env);
    const free = await solo("free");
    expect(await scheduleReviewRequest(env.ctx, free.merchant, { kind: "appointment", id: (await visit(free, "completed", c.user.id)).id })).toBeNull();
    const off = await solo("plus", "off");
    expect(await scheduleReviewRequest(env.ctx, off.merchant, { kind: "appointment", id: (await visit(off, "completed", c.user.id)).id })).toBeNull();
    expect(await scheduleCompletedReviewRequests(env.ctx)).toBe(0);
    expect(await requests()).toHaveLength(0);
  });

  it("a Pro shop's checkout schedules the request and it goes out two hours later on the best channel, even with no Google link", async () => {
    const m = await solo();
    await env.db.update(merchants).set({ googleReviewUrl: null }).where(eq(merchants.id, m.merchant.id));
    const c = await customer(env, { name: "Ayesha Rao" });
    const a = await visit(m, "booked", c.user.id);
    const r = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/appointments/${a.id}/checkout`, { mode: "counter", counterMethod: "cash", tipCents: 0 });
    expect(r.status).toBe(200);
    const [req1] = await requests();
    expect(req1).toMatchObject({ orderId: a.id, userId: c.user.id, sentAt: null });
    const status = await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/reviews/appointments/${a.id}`);
    expect(status.body).toMatchObject({ available: true, scheduled: true, sendAt: new Date(req1!.createdAt.getTime() + SEND_DELAY_MS).toISOString() });

    expect(await sendDueReviewRequests(env.ctx)).toBe(0);
    advance(SEND_DELAY_MS + 60_000);
    expect(await sendDueReviewRequests(env.ctx)).toBe(1);
    expect((await requests())[0]!.sentAt).toBeTruthy();

    // The page shows the private note only (no Google link) and is marked as a visit.
    const page = await call(env, null, "GET", `/v1/public/reviews/${req1!.token}`);
    expect(page.body).toMatchObject({ googleReviewUrl: null, kind: "appointment" });
    const settings = await call(env, await tokenFor(env, m.owner), "GET", `/v1/merchants/${m.merchant.id}/reviews/appointments/settings`);
    expect(settings.body).toMatchObject({ mode: "on", available: true, googleReviewUrl: null, last30: { asked: 1, google: 0, privateNotes: 0 } });
  });

  it("a Free shop's checkout schedules nothing and the status says so", async () => {
    const m = await solo("free");
    const c = await customer(env);
    const a = await visit(m, "booked", c.user.id);
    expect((await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/appointments/${a.id}/checkout`, { mode: "counter", counterMethod: "cash", tipCents: 0 })).status).toBe(200);
    expect(await requests()).toHaveLength(0);
    expect((await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/reviews/appointments/${a.id}`)).body).toMatchObject({ available: false, scheduled: false, sendAt: null });
  });

  it("the status-button path is covered by the scan, and a switch turned off before the send stops it", async () => {
    const m = await solo();
    const c = await customer(env);
    await visit(m, "completed", c.user.id);
    expect(await scheduleCompletedReviewRequests(env.ctx)).toBe(1);
    await env.db.update(merchants).set({ reviewRequestsMode: "off" }).where(eq(merchants.id, m.merchant.id));
    advance(SEND_DELAY_MS + 1000);
    expect(await sendDueReviewRequests(env.ctx)).toBe(0);
  });

  it("settings: the link saves on Free, the switch is locked on Free, and the numbers count the last 30 days", async () => {
    const free = await solo("free", "off");
    const url = `/v1/merchants/${free.merchant.id}/reviews/appointments/settings`;
    expect((await call(env, free.ownerToken, "PUT", url, { googleReviewUrl: "https://g.page/r/new/review" })).body).toMatchObject({ googleReviewUrl: "https://g.page/r/new/review", mode: "off", available: false });
    const locked = await call(env, free.ownerToken, "PUT", url, { mode: "on" });
    expect(locked.status).toBe(402);
    expect((await call(env, free.ownerToken, "PUT", url, { googleReviewUrl: "not a url" })).status).toBe(400);

    const m = await solo("plus", "off");
    const on = await call(env, m.ownerToken, "PUT", `/v1/merchants/${m.merchant.id}/reviews/appointments/settings`, { mode: "on" });
    expect(on.body).toMatchObject({ mode: "on", available: true });

    const c = await customer(env);
    const done = await visit(m, "completed", c.user.id);
    const r = (await scheduleReviewRequest(env.ctx, m.merchant, { kind: "appointment", id: done.id }))!;
    advance(SEND_DELAY_MS + 1000);
    await sendDueReviewRequests(env.ctx);
    await call(env, null, "POST", `/v1/public/reviews/${r.token}/google-opened`);
    await call(env, null, "POST", `/v1/public/reviews/${r.token}`, { rating: 5, feedback: "Loved it" });
    const owner = await tokenFor(env, m.owner);
    const s = await call(env, owner, "GET", `/v1/merchants/${m.merchant.id}/reviews/appointments/settings`);
    expect(s.body.last30).toEqual({ asked: 1, google: 1, privateNotes: 1 });
    advance(31 * 86_400_000);
    expect((await call(env, await tokenFor(env, m.owner), "GET", `/v1/merchants/${m.merchant.id}/reviews/appointments/settings`)).body.last30).toEqual({ asked: 0, google: 0, privateNotes: 0 });
  });
});
// ---- end phase-pro: p4 ----
