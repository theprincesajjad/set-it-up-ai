import { randomUUID } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { loyaltyPrograms, merchantMembers, messageDeliveries, notifications, pushTokens, rewards, walletPasses } from "@ll/db";
import { expoPush, EXPO_PUSH_URL, EXPO_RECEIPTS_URL } from "../src/providers/expo-push.js";
import { notifyCustomer } from "../src/services/commerceShared.js";
import { setHttp } from "../src/services/integrations-http.js";
import { awardPurchase, redeemReward } from "../src/services/ledger.js";
import { checkPushReceipts, inQuietHours, onBalanceChange, sendExpiryWarnings, sendNotification } from "../src/services/notifications.js";
import { clearGoogleTokenCache } from "../src/services/wallet-google.js";
import { createMerchant, createTestEnv, createUser, grantFeatures, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv(); // 2026-11-03 15:00Z = 10:00 in Toronto
  clearGoogleTokenCache();
});
afterEach(async () => env.close());

const MIN = 60_000;
const advance = (ms: number) => (env.clock.now = new Date(env.clock.now.getTime() + ms));

async function setup(opts: { push?: boolean } = {}) {
  const shop = await createMerchant(env);
  const user = await createUser(env.db, { name: "Priya", email: `p${randomUUID().slice(0, 6)}@example.com` });
  const token = await tokenFor(env, user);
  const h = { authorization: `Bearer ${token}` };
  if (opts.push !== false) {
    const r = await env.app.inject({ method: "POST", url: "/v1/me/push-tokens", headers: h, payload: { token: "ExponentPushToken[device-one]", platform: "ios" } });
    expect(r.statusCode).toBe(204);
  }
  // Join with a first purchase (10 points; the fixture reward costs 50).
  const first = await awardPurchase(env.ctx, { merchantId: shop.merchant.id, userId: user.id, source: "staff_app", amountCents: 1000 });
  return { shop, user, h, member: first.member };
}

const inbox = (userId: string) => env.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.createdAt);

describe("ledger events → notifications", () => {
  it("points_earned: push on the 'points' channel with a shop deep link, inbox row; collapsed per shop per 10 min", async () => {
    const { shop, user, member } = await setup();
    expect(env.ctx.providers.outbox.push).toHaveLength(1);
    const p = env.ctx.providers.outbox.push[0]!;
    expect(p).toMatchObject({ token: "ExponentPushToken[device-one]", title: "+10 points at Test Shop", body: "You now have 10 points. 40 points to $5 off.", channelId: "points" });
    expect(p.data).toMatchObject({ type: "points_earned", screen: "shop", merchantId: shop.merchant.id, slug: shop.merchant.slug, url: `ll://shop/${shop.merchant.slug}` });
    let rows = await inbox(user.id);
    expect(rows).toHaveLength(1);
    expect(p.data!.notificationId).toBe(rows[0]!.id);
    expect(rows[0]).toMatchObject({ type: "points_earned", merchantId: shop.merchant.id, channels: ["push"] });

    // Second purchase 5 minutes later: no new push, the inbox row accumulates.
    advance(5 * MIN);
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, source: "staff_app", amountCents: 500 });
    expect(env.ctx.providers.outbox.push).toHaveLength(1);
    rows = await inbox(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "+15 points at Test Shop", body: "You now have 15 points. 35 points to $5 off." });

    // After the window, a new push.
    advance(11 * MIN);
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, source: "staff_app", amountCents: 300 });
    expect(env.ctx.providers.outbox.push).toHaveLength(2);
    expect(await inbox(user.id)).toHaveLength(2);
  });

  it("counter award over HTTP crosses a reward threshold → reward_ready (not points_earned)", async () => {
    const { shop, user } = await setup();
    advance(60 * MIN);
    const r = await env.app.inject({
      method: "POST",
      url: `/v1/merchants/${shop.merchant.id}/counter/award`,
      headers: { authorization: `Bearer ${await tokenFor(env, shop.owner)}`, "idempotency-key": randomUUID() },
      payload: { memberCode: user.memberCode, amountCents: 4500 },
    });
    expect(r.statusCode).toBeLessThan(300);
    const last = env.ctx.providers.outbox.push.at(-1)!;
    expect(last).toMatchObject({ title: "Reward ready at Test Shop", channelId: "points" });
    expect(last.body).toContain("55 points: enough for $5 off");
    expect((await inbox(user.id)).map((n) => n.type)).toEqual(["points_earned", "reward_ready"]);
  });

  it("redeem_confirmed for staff redemptions, none for in-app codes; adjustments/reversals send nothing", async () => {
    const { shop, user, member } = await setup();
    advance(60 * MIN);
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, source: "staff_app", amountCents: 9000 });
    const before = env.ctx.providers.outbox.push.length;
    const red = await redeemReward(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, rewardId: shop.reward.id, source: "staff_app" });
    expect(env.ctx.providers.outbox.push.at(-1)).toMatchObject({ title: "Test Shop: $5 off redeemed", body: "Enjoy. You have 50 points left." });
    await redeemReward(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, rewardId: shop.reward.id, source: "customer_app" });
    expect(env.ctx.providers.outbox.push.length).toBe(before + 1);
    const { reverseTransaction } = await import("../src/services/ledger.js");
    await reverseTransaction(env.ctx, { merchantId: shop.merchant.id, transactionId: red.redemption.transactionId!, reason: "oops" });
    expect(env.ctx.providers.outbox.push.length).toBe(before + 1);
    expect((await inbox(user.id)).map((n) => n.type)).toEqual(["points_earned", "reward_ready", "redeem_confirmed"]);
  });

  it("passport_progress from campaign/perk messages", async () => {
    const { shop, user, member } = await setup();
    await onBalanceChange(env.ctx, {
      kind: "award",
      merchantId: shop.merchant.id,
      memberId: member.id,
      userId: user.id,
      delta: 0,
      balance: 10,
      previousBalance: 10,
      source: "staff_app",
      at: env.clock.now,
      transactionId: null,
      messages: ["Dundas West Passport: 3 of 5 shops visited."],
    });
    expect(env.ctx.providers.outbox.push.at(-1)).toMatchObject({ title: "Neighbourhood passport", body: "Dundas West Passport: 3 of 5 shops visited.", channelId: "points" });
  });
});

describe("preferences", () => {
  it("GET defaults, PUT changes (partial), unsupported channel 400, auth 401; disabled push is respected but the inbox still records it", async () => {
    const { shop, user, h, member } = await setup();
    expect((await env.app.inject({ method: "GET", url: "/v1/me/notification-prefs" })).statusCode).toBe(401);
    const g = await env.app.inject({ method: "GET", url: "/v1/me/notification-prefs", headers: h });
    expect(g.statusCode).toBe(200);
    const items = g.json().items as { type: string; kind: string; channels: Record<string, boolean> }[];
    expect(items.map((i) => i.type)).toEqual(["points_earned", "reward_ready", "reward_expiring", "redeem_confirmed", "order_ready", "ticket_updated", "quote_sent", "booking_reminder", "passport_progress", "tiffin_update", "tiffin_menu", "promo_nearby"]);
    expect(items.find((i) => i.type === "points_earned")!.channels).toEqual({ push: true });
    expect(items.find((i) => i.type === "reward_ready")!.channels).toEqual({ push: true, sms: true });
    expect(items.find((i) => i.type === "promo_nearby")).toMatchObject({ kind: "marketing", channels: { push: true } });
    expect(g.json().quietHours).toEqual({ start: "21:00", end: "08:00", appliesTo: "marketing" });

    const bad = await env.app.inject({ method: "PUT", url: "/v1/me/notification-prefs", headers: h, payload: { prefs: [{ type: "points_earned", channel: "sms", enabled: true }] } });
    expect(bad.statusCode).toBe(400);
    expect((await env.app.inject({ method: "PUT", url: "/v1/me/notification-prefs", headers: h, payload: { prefs: [] } })).statusCode).toBe(400);
    const put = await env.app.inject({ method: "PUT", url: "/v1/me/notification-prefs", headers: h, payload: { prefs: [{ type: "points_earned", channel: "push", enabled: false }] } });
    expect(put.statusCode).toBe(200);
    expect(put.json().items.find((i: { type: string }) => i.type === "points_earned").channels).toEqual({ push: false });
    expect(put.json().items.find((i: { type: string }) => i.type === "reward_ready").channels).toEqual({ push: true, sms: true });
    // Idempotent upsert.
    await env.app.inject({ method: "PUT", url: "/v1/me/notification-prefs", headers: h, payload: { prefs: [{ type: "points_earned", channel: "push", enabled: false }] } });

    advance(60 * MIN);
    const before = env.ctx.providers.outbox.push.length;
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, source: "staff_app", amountCents: 500 });
    expect(env.ctx.providers.outbox.push.length).toBe(before);
    const rows = await inbox(user.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.channels).toEqual([]);
  });
});

describe("channels: wallet pass and paid SMS for no-app customers", () => {
  it("no app, no pass: SMS only if the shop has paid SMS (marketing.sms) and the pref is on", async () => {
    const { shop, user, member } = await setup({ push: false });
    advance(60 * MIN);
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, source: "staff_app", amountCents: 4500 }); // reward_ready
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);
    expect((await inbox(user.id)).at(-1)).toMatchObject({ type: "reward_ready", channels: [] });

    await grantFeatures(env, shop.merchant.id, ["marketing.sms"]);
    await env.db.update(rewards).set({ pointsCost: 100 }).where(eq(rewards.id, shop.reward.id));
    advance(60 * MIN);
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, source: "staff_app", amountCents: 5000 }); // 105 ≥ 100
    expect(env.ctx.providers.outbox.sms).toHaveLength(1);
    expect(env.ctx.providers.outbox.sms[0]!.body).toBe("Reward ready at Test Shop: You have 105 points: enough for $5 off. Show your card at the counter to redeem.");
    const [d] = await env.db.select().from(messageDeliveries).where(eq(messageDeliveries.userId, user.id));
    expect(d).toMatchObject({ channel: "sms", kind: "transactional", status: "sent" });
    // points_earned never goes by SMS.
    advance(60 * MIN);
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, source: "staff_app", amountCents: 100 });
    expect(env.ctx.providers.outbox.sms).toHaveLength(1);
  });

  it("wallet-pass holders get the pass (Google message for reward ready), not SMS", async () => {
    const { shop, user, member } = await setup({ push: false });
    await grantFeatures(env, shop.merchant.id, ["marketing.sms"]);
    await env.db.insert(walletPasses).values({ userId: user.id, platform: "google", serialNumber: `G${randomUUID()}`, authToken: "x".repeat(24) });
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    env.ctx.config.google = { ...env.ctx.config.google, walletIssuerId: "3388000000012345678", walletServiceAccountJson: JSON.stringify({ client_email: "w@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }) };
    const urls: string[] = [];
    setHttp(env.ctx, (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes("oauth2") ? { access_token: "t", expires_in: 3600 } : {}), { status: 200 });
    }) as unknown as typeof fetch);
    advance(60 * MIN);
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, memberId: member.id, source: "staff_app", amountCents: 4500 });
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);
    expect((await inbox(user.id)).at(-1)).toMatchObject({ type: "reward_ready", channels: ["wallet"] });
    expect(urls.filter((u) => u.endsWith("/addMessage"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/loyaltyObject/") && !u.endsWith("/addMessage"))).toHaveLength(1); // PATCH
  });
});

describe("promo_nearby (marketing)", () => {
  async function promoSetup() {
    const s = await setup();
    await grantFeatures(env, s.shop.merchant.id, ["promos.push_nearby"]);
    return s;
  }
  const promo = (userId: string, merchantId: string) => sendNotification(env.ctx, { userId, merchantId, type: "promo_nearby", title: "Test Shop: 2x points today", body: "You're nearby. Reply STOP to opt out." });

  it("needs CASL consent, not muted, the paid feature; channel 'offers'", async () => {
    const { shop, user, member } = await promoSetup();
    expect((await promo(user.id, shop.merchant.id)).skipped).toBe("no_consent");
    await env.db.update(merchantMembers).set({ marketingConsentAt: env.clock.now, muted: true }).where(eq(merchantMembers.id, member.id));
    expect((await promo(user.id, shop.merchant.id)).skipped).toBe("muted");
    await env.db.update(merchantMembers).set({ muted: false }).where(eq(merchantMembers.id, member.id));
    await grantFeatures(env, shop.merchant.id, ["promos.push_nearby"], false);
    expect((await promo(user.id, shop.merchant.id)).skipped).toBe("feature_off");
    await grantFeatures(env, shop.merchant.id, ["promos.push_nearby"]);
    const ok = await promo(user.id, shop.merchant.id);
    expect(ok.skipped).toBeUndefined();
    expect(ok.channels).toEqual(["push"]);
    expect(env.ctx.providers.outbox.push.at(-1)).toMatchObject({ channelId: "offers", data: { type: "promo_nearby", screen: "shop" } });
  });

  it("max one per day, never in quiet hours (21:00–08:00 shop time)", async () => {
    const { shop, user, member } = await promoSetup();
    await env.db.update(merchantMembers).set({ marketingConsentAt: env.clock.now }).where(eq(merchantMembers.id, member.id));
    expect((await promo(user.id, shop.merchant.id)).skipped).toBeUndefined();
    advance(3 * 60 * MIN);
    expect((await promo(user.id, shop.merchant.id)).skipped).toBe("daily_limit");
    env.clock.now = new Date("2026-11-05T03:30:00Z"); // 22:30 Toronto
    expect((await promo(user.id, shop.merchant.id)).skipped).toBe("quiet_hours");
    env.clock.now = new Date("2026-11-05T12:30:00Z"); // 07:30 Toronto
    expect((await promo(user.id, shop.merchant.id)).skipped).toBe("quiet_hours");
    env.clock.now = new Date("2026-11-05T13:05:00Z"); // 08:05 Toronto
    expect((await promo(user.id, shop.merchant.id)).skipped).toBeUndefined();
    expect(inQuietHours(new Date("2026-07-01T01:00:00Z"), "America/Toronto")).toBe(true); // 21:00 EDT
    expect(inQuietHours(new Date("2026-07-01T00:59:00Z"), "America/Toronto")).toBe(false);
  });
});

describe("commerce notifications (notifyCustomer)", () => {
  it("order ready → inbox order_ready with order deep link, push on 'orders', SMS respects the pref", async () => {
    const { shop, user, h } = await setup();
    const orderId = randomUUID();
    await notifyCustomer(env.ctx, { userId: user.id, merchantId: shop.merchant.id, title: "Order #12 is ready", body: "Pick it up at the counter.", data: { type: "order_status", orderId, status: "ready" } });
    const p = env.ctx.providers.outbox.push.at(-1)!;
    expect(p).toMatchObject({ title: "Order #12 is ready", channelId: "orders" });
    expect(p.data).toMatchObject({ type: "order_status", notificationType: "order_ready", screen: "order", orderId, url: `ll://order/${orderId}` });
    expect(env.ctx.providers.outbox.sms).toHaveLength(1);
    expect((await inbox(user.id)).at(-1)).toMatchObject({ type: "order_ready", channels: ["push", "sms"] });

    await env.app.inject({ method: "PUT", url: "/v1/me/notification-prefs", headers: h, payload: { prefs: [{ type: "order_ready", channel: "sms", enabled: false }] } });
    await notifyCustomer(env.ctx, { userId: user.id, merchantId: shop.merchant.id, title: "Order #13 is ready", body: "Pick it up.", data: { type: "order_status", orderId: randomUUID(), status: "ready" } });
    expect(env.ctx.providers.outbox.sms).toHaveLength(1);
    const quote = await notifyCustomer(env.ctx, { userId: user.id, merchantId: shop.merchant.id, title: "Test Shop: quote ready", body: "Approve it here.", data: { type: "quote_sent", ticketId: randomUUID(), url: "http://localhost:3000/q/abc" } });
    expect(quote.push).toBe(1);
    expect(env.ctx.providers.outbox.push.at(-1)!.data).toMatchObject({ screen: "quote", url: "http://localhost:3000/q/abc" });
    expect((await inbox(user.id)).at(-1)!.type).toBe("quote_sent");
  });
});

describe("inbox API", () => {
  it("lists newest first with cursor + unread count; read, read-all; scoped to the user", async () => {
    const { shop, user, h } = await setup();
    for (let i = 0; i < 4; i++) {
      advance(MIN);
      await sendNotification(env.ctx, { userId: user.id, merchantId: shop.merchant.id, type: "ticket_updated", title: `Update ${i}`, body: "b", data: { ticketId: randomUUID() } });
    }
    expect((await env.app.inject({ method: "GET", url: "/v1/me/notifications" })).statusCode).toBe(401);
    const p1 = await env.app.inject({ method: "GET", url: "/v1/me/notifications?limit=3", headers: h });
    expect(p1.statusCode).toBe(200);
    expect(p1.json().items.map((n: { title: string }) => n.title)).toEqual(["Update 3", "Update 2", "Update 1"]);
    expect(p1.json().unreadCount).toBe(5);
    const first = p1.json().items[0];
    expect(first).toMatchObject({ type: "ticket_updated", read: false, readAt: null, merchant: { id: shop.merchant.id, name: "Test Shop", slug: shop.merchant.slug }, data: { screen: "ticket", notificationId: first.id } });
    const p2 = await env.app.inject({ method: "GET", url: `/v1/me/notifications?limit=3&cursor=${p1.json().nextCursor}`, headers: h });
    expect(p2.json().items.map((n: { title: string }) => n.title)).toEqual(["Update 0", "+10 points at Test Shop"]);
    expect(p2.json().nextCursor).toBeNull();

    const r = await env.app.inject({ method: "POST", url: `/v1/me/notifications/${first.id}/read`, headers: h });
    expect(r.json()).toEqual({ unreadCount: 4 });
    expect((await env.app.inject({ method: "GET", url: "/v1/me/notifications?unread=1", headers: h })).json().items).toHaveLength(4);

    const other = await createUser(env.db);
    const oh = { authorization: `Bearer ${await tokenFor(env, other)}` };
    expect((await env.app.inject({ method: "POST", url: `/v1/me/notifications/${first.id}/read`, headers: oh })).statusCode).toBe(404);
    expect((await env.app.inject({ method: "POST", url: `/v1/me/notifications/not-a-uuid/read`, headers: h })).statusCode).toBe(404);
    expect((await env.app.inject({ method: "GET", url: "/v1/me/notifications?cursor=zzz", headers: h })).statusCode).toBe(400);

    expect((await env.app.inject({ method: "POST", url: "/v1/me/notifications/read-all", headers: h })).json()).toEqual({ unreadCount: 0 });
    expect((await env.app.inject({ method: "GET", url: "/v1/me/notifications", headers: h })).json()).toMatchObject({ unreadCount: 0 });
  });
});

describe("Expo push: payload shape and receipts", () => {
  it("sends channelId + data, stores tickets, and deletes DeviceNotRegistered tokens from receipts", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      if (url === EXPO_PUSH_URL) return new Response(JSON.stringify({ data: (body as unknown[]).map((_, i) => ({ status: "ok", id: `ticket-${calls.length}-${i}` })) }), { status: 200 });
      if (url === EXPO_RECEIPTS_URL) {
        const ids = (body as { ids: string[] }).ids;
        return new Response(JSON.stringify({ data: Object.fromEntries(ids.map((id, i) => [id, i === 0 ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } } : { status: "ok" }])) }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    env.ctx.providers.push = expoPush({}, fake);
    const { user } = await setup();
    await env.db.insert(pushTokens).values({ userId: user.id, token: "ExponentPushToken[device-two]", platform: "android" });
    const shopB = await createMerchant(env);
    await awardPurchase(env.ctx, { merchantId: shopB.merchant.id, userId: user.id, source: "staff_app", amountCents: 700 });

    const send = calls.filter((c) => c.url === EXPO_PUSH_URL).at(-1)!;
    expect(send.body).toEqual([
      expect.objectContaining({ to: "ExponentPushToken[device-one]", title: "+7 points at Test Shop", channelId: "points", sound: "default", data: expect.objectContaining({ type: "points_earned", screen: "shop", merchantId: shopB.merchant.id }) }),
      expect.objectContaining({ to: "ExponentPushToken[device-two]", channelId: "points" }),
    ]);
    const row = (await inbox(user.id)).at(-1)!;
    expect(row.pushTickets).toHaveLength(2);

    // Too early: receipts aren't ready.
    expect((await checkPushReceipts(env.ctx)).checked).toBe(0);
    advance(16 * MIN);
    const r = await checkPushReceipts(env.ctx);
    expect(r.removedTokens).toEqual(["ExponentPushToken[device-one]"]);
    expect((await env.db.select().from(pushTokens).where(eq(pushTokens.userId, user.id))).map((t) => t.token)).toEqual(["ExponentPushToken[device-two]"]);
    // Checked once.
    expect((await checkPushReceipts(env.ctx)).checked).toBe(0);
  });
});

describe("reward_expiring (daily job)", () => {
  it("only for shops with expiry, 30 days before, once per inactivity period, daytime only", async () => {
    const { shop, user, member } = await setup();
    const noExpiry = await createMerchant(env);
    const m2 = await awardPurchase(env.ctx, { merchantId: noExpiry.merchant.id, userId: user.id, source: "staff_app", amountCents: 500 });
    await env.db.update(loyaltyPrograms).set({ expiryMonths: 12 }).where(eq(loyaltyPrograms.merchantId, shop.merchant.id));
    const lastVisit = new Date("2025-11-20T15:00:00Z"); // expires 2026-11-20, 17 days after "now"
    await env.db.update(merchantMembers).set({ lastVisitAt: lastVisit }).where(eq(merchantMembers.id, member.id));
    await env.db.update(merchantMembers).set({ lastVisitAt: lastVisit }).where(eq(merchantMembers.id, m2.member.id));

    expect(await sendExpiryWarnings(env.ctx)).toBe(1);
    const n = (await inbox(user.id)).at(-1)!;
    expect(n).toMatchObject({ type: "reward_expiring", merchantId: shop.merchant.id, title: "Test Shop: points expiring", body: "Your 10 points expire in 17 days unless you visit. Any visit keeps them." });
    expect(await sendExpiryWarnings(env.ctx)).toBe(0);

    // Night in Toronto: wait.
    await env.db.delete(notifications).where(eq(notifications.id, n.id));
    env.clock.now = new Date("2026-11-04T04:00:00Z");
    expect(await sendExpiryWarnings(env.ctx)).toBe(0);
    // Too early in the cycle: nothing.
    env.clock.now = new Date("2026-10-01T15:00:00Z");
    expect(await sendExpiryWarnings(env.ctx)).toBe(0);
  });
});
