import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { featureInterest, featureOverrides, featureRollouts, leads, ledgerTransactions, locations, merchantMembers, merchantStaff, redemptions, visits } from "@ll/db";
import { BRAND } from "@ll/shared";
import { awardPurchase, ledgerBalance, redeemReward } from "../src/services/ledger.js";
import { expireIssuedRedemptions } from "../src/services/redemptions.js";
import { flushReceipts } from "../src/services/staff.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await flushReceipts();
  await env.close();
});

const call = (method: "GET" | "POST", url: string, payload?: unknown, token?: string, headers: Record<string, string> = {}) =>
  env.app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });

let seq = 0;
const key = () => `gap-${Date.now()}-${seq++}`;

async function shop(opts: Parameters<typeof createMerchant>[1] = {}) {
  const m = await createMerchant(env, opts);
  const [loc] = await env.db.insert(locations).values({ merchantId: m.merchant.id, name: "Main", address: "1 Queen St W", qrCode: `QR${m.merchant.slug}` }).returning();
  const staffUser = await createUser(env.db, { name: "Jo Staff" });
  await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: staffUser.id, role: "staff" });
  const manager = await createUser(env.db, { name: "Max Manager" });
  await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: manager.id, role: "manager" });
  return { ...m, location: loc!, base: `/v1/merchants/${m.merchant.id}`, staffToken: await tokenFor(env, staffUser), managerToken: await tokenFor(env, manager) };
}

async function addMembers(merchantId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const u = await createUser(env.db);
    await env.db.insert(merchantMembers).values({ merchantId, userId: u.id });
  }
}

describe("public lead capture", () => {
  it("creates an unassigned new lead, emails support, validates, and rate-limits per IP", async () => {
    const hood = await createNeighbourhood(env.db, "roncesvalles");
    const body = { businessName: "Cafe Uno", contactName: "Ana", email: "ana@example.com", vertical: "cafe", neighbourhoodSlug: "roncesvalles", message: "Can you visit Tuesday?", kind: "book_visit" };
    const res = await call("POST", "/v1/public/leads", body);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ received: true });
    const [lead] = await env.db.select().from(leads).where(eq(leads.id, res.json().id));
    expect(lead).toMatchObject({ businessName: "Cafe Uno", stage: "new", assignedRepId: null, neighbourhoodId: hood.id, email: "ana@example.com" });
    expect(lead!.notes).toContain("book_visit");
    expect(lead!.notes).toContain("Can you visit Tuesday?");
    expect(lead!.createdAt.toISOString()).toBe(env.clock.now.toISOString());
    const mail = env.ctx.providers.outbox.email.at(-1)!;
    expect(mail.to).toBe(BRAND.supportEmail);
    expect(mail.subject).toContain("Cafe Uno");
    expect(mail.text).toContain("Can you visit Tuesday?");

    expect((await call("POST", "/v1/public/leads", { businessName: "X", kind: "talk_to_us" })).statusCode).toBe(400);
    expect((await call("POST", "/v1/public/leads", { businessName: "X", email: "a@b.co", kind: "nope" })).statusCode).toBe(400);
    expect((await call("POST", "/v1/public/leads", { businessName: "X", phone: "12", kind: "bia" })).statusCode).toBe(400);

    for (let i = 0; i < 4; i++) expect((await call("POST", "/v1/public/leads", { businessName: `Shop ${i}`, phone: nextPhone(), kind: "talk_to_us" })).statusCode).toBe(201);
    const limited = await call("POST", "/v1/public/leads", { businessName: "Too many", email: "x@example.com", kind: "bia" });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("rate_limited");
    env.clock.now = new Date(env.clock.now.getTime() + 61 * 60_000);
    expect((await call("POST", "/v1/public/leads", { businessName: "Later", email: "x@example.com", kind: "bia" })).statusCode).toBe(201);
  });
});

describe("feature notify-me", () => {
  it("records interest once per merchant (manager+), and admins see interestCount", async () => {
    const s = await shop();
    const url = `${s.base}/features/orders.order_ahead/notify`;
    expect((await call("POST", url)).statusCode).toBe(401);
    expect((await call("POST", url, undefined, s.staffToken)).statusCode).toBe(403);
    const first = await call("POST", url, undefined, s.managerToken);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ key: "orders.order_ahead", interested: true, createdAt: env.clock.now.toISOString() });
    const again = await call("POST", url, undefined, s.ownerToken);
    expect(again.statusCode).toBe(200);
    expect(await env.db.select().from(featureInterest).where(eq(featureInterest.merchantId, s.merchant.id))).toHaveLength(1);
    expect((await call("POST", `${s.base}/features/nope.nope/notify`, undefined, s.ownerToken)).statusCode).toBe(404);
    const released = await call("POST", `${s.base}/features/reports.basic/notify`, undefined, s.ownerToken);
    expect(released.statusCode).toBe(409);
    expect(released.json().error.code).toBe("feature_released");

    const other = await shop();
    await call("POST", `${other.base}/features/orders.order_ahead/notify`, undefined, other.ownerToken);
    const admin = await createUser(env.db, { platformRole: "admin" });
    const list = await call("GET", "/v1/admin/features", undefined, await tokenFor(env, admin));
    const items = list.json().items as { key: string; interestCount: number }[];
    expect(items.find((f) => f.key === "orders.order_ahead")!.interestCount).toBe(2);
    expect(items.find((f) => f.key === "service.tickets")!.interestCount).toBe(0);
  });
});

describe("public plans", () => {
  it("lists plans with availability, paid feature stages and network stats", async () => {
    const hood = await createNeighbourhood(env.db);
    await shop({ neighbourhoodId: hood.id });
    let res = await call("GET", "/v1/public/plans");
    expect(res.statusCode).toBe(200);
    let body = res.json();
    expect(body.items.map((p: { id: string }) => p.id)).toEqual(["free", "plus", "pro"]);
    expect(body.items[0]).toMatchObject({ id: "free", available: true, features: [] });
    expect(body.items[1].available).toBe(false);
    expect(body.items[1].features.find((f: { key: string }) => f.key === "orders.order_ahead")).toMatchObject({ stage: "hidden", name: "Order-ahead" });
    expect(body.network).toEqual({ activeMerchants: 1, neighbourhoods: 1, members: 0, multiShopMemberPct: 0, liveStreets: 1 });
    expect(JSON.stringify(body)).not.toContain("Test Shop");

    await env.db.insert(featureRollouts).values({ key: "orders.order_ahead", stage: "beta" });
    body = (await call("GET", "/v1/public/plans")).json();
    expect(body.items[1].available).toBe(true);
    expect(body.items[1].features.find((f: { key: string }) => f.key === "orders.order_ahead").stage).toBe("beta");
    expect(body.items[2].available).toBe(false);
    res = await call("GET", "/v1/public/plans");
    expect(res.statusCode).toBe(200);
  });
});

describe("public member counts and customer features", () => {
  it("shows memberCount only at 10+ on the shop page and network list; exposes enabled customer features", async () => {
    const s = await shop();
    await addMembers(s.merchant.id, 9);
    let page = (await call("GET", `/v1/public/shops/${s.merchant.slug}`)).json();
    expect(page.memberCount).toBeNull();
    // Pricing v2: promos, discount cards, referrals, VIP and birthday are Plus, hidden at launch.
    expect(page.features).toEqual({
      orderAhead: false,
      pickupSlots: false,
      serviceTickets: false,
      inAppPayments: false,
      promos: false,
      discountCards: false,
      referrals: false,
      vipLevels: false,
      birthdayBonus: false,
      // Restaurant pack entry points: all off for a shop with no restaurant tier.
      tiffin: false,
      catering: false,
      banquet: false,
      whatsapp: false,
      dietaryTags: false,
      // Booking entry points: a drop-off time (repair) and a stylist and time (appointments), both off here.
      dropoffScheduling: false,
      appointments: false,
    });
    let list = (await call("GET", "/v1/network/shops")).json();
    expect(list.items[0].memberCount).toBeNull();

    await addMembers(s.merchant.id, 1);
    await env.db.insert(featureOverrides).values({ merchantId: s.merchant.id, key: "orders.order_ahead", enabled: true });
    page = (await call("GET", `/v1/public/shops/${s.merchant.slug}`)).json();
    expect(page.memberCount).toBe(10);
    expect(page.features).toMatchObject({ orderAhead: true, serviceTickets: false });
    list = (await call("GET", "/v1/network/shops")).json();
    expect(list.items[0].memberCount).toBe(10);

    // Wallet memberships carry the same flags.
    const u = await createUser(env.db, { phoneVerifiedAt: new Date() });
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: u.id, source: "staff_app", amountCents: 1000 });
    const wallet = (await call("GET", "/v1/me/memberships", undefined, await tokenFor(env, u))).json();
    expect(wallet.items[0].features).toEqual({
      orderAhead: true,
      pickupSlots: false,
      serviceTickets: false,
      inAppPayments: false,
      promos: false,
      discountCards: false,
      referrals: false,
      vipLevels: false,
      birthdayBonus: false,
      tiffin: false,
      catering: false,
      banquet: false,
      whatsapp: false,
      dietaryTags: false,
      // Booking entry points: a drop-off time (repair) and a stylist and time (appointments), both off here.
      dropoffScheduling: false,
      appointments: false,
    });
  });
});

describe("app redemption expiry", () => {
  it("app codes expire after 10 minutes: counter rejects them and the job voids and refunds", async () => {
    const s = await shop();
    const u = await createUser(env.db, { phoneVerifiedAt: new Date() });
    const token = await tokenFor(env, u);
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: u.id, source: "staff_app", amountCents: 20000 });
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, u.id));
    const r = await call("POST", `/v1/me/memberships/${m!.id}/redeem`, { rewardId: s.reward.id }, token);
    expect(r.statusCode).toBe(201);
    const red = r.json().redemption;
    expect(red.createdAt).toBe(env.clock.now.toISOString());
    expect(red.expiresAt).toBe(new Date(env.clock.now.getTime() + 10 * 60_000).toISOString());
    expect(r.json().balance).toBe(150);

    // A second code, used in time, is unaffected by the sweep.
    const inTime = await redeemReward(env.ctx, { merchantId: s.merchant.id, memberId: m!.id, rewardId: s.reward.id, source: "customer_app" });
    expect((await call("POST", `${s.base}/counter/redemptions/verify`, { code: inTime.redemption.code }, s.staffToken)).statusCode).toBe(200);

    // Staff-applied redemptions never expire.
    const counter = await redeemReward(env.ctx, { merchantId: s.merchant.id, memberId: m!.id, rewardId: s.reward.id, source: "staff_app" });
    expect(counter.redemption.expiresAt).toBeNull();

    env.clock.now = new Date(env.clock.now.getTime() + 11 * 60_000);
    const late = await call("POST", `${s.base}/counter/redemptions/verify`, { code: red.code }, s.staffToken);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe("redemption_expired");

    expect(await expireIssuedRedemptions(env.ctx)).toEqual({ expired: 1 });
    const [row] = await env.db.select().from(redemptions).where(eq(redemptions.id, red.id));
    expect(row!.status).toBe("void");
    const [after] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, m!.id));
    expect(after!.balance).toBe(200 - 50 - 50 - 50 + 50);
    expect(await ledgerBalance(env.db, m!.id)).toBe(after!.balance);
    expect(await expireIssuedRedemptions(env.ctx)).toEqual({ expired: 0 });
    const v = await call("POST", `${s.base}/counter/redemptions/verify`, { code: red.code }, s.staffToken);
    expect(v.json().error.code).toBe("void");
  });
});

describe("ledger timestamps follow ctx.now()", () => {
  it("stamps ledger_transactions, visits and merchant_members with the injected clock", async () => {
    const s = await shop({ welcomeBonus: 5 });
    const at = env.clock.now.toISOString();
    const r = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 2000 });
    expect(r.member.createdAt.toISOString()).toBe(at);
    const txs = await env.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.memberId, r.member.id));
    expect(txs.map((t) => t.type).sort()).toEqual(["earn", "welcome_bonus"]);
    for (const t of txs) expect(t.createdAt.toISOString()).toBe(at);
    const [v] = await env.db.select().from(visits).where(eq(visits.memberId, r.member.id));
    expect(v!.createdAt.toISOString()).toBe(at);
  });
});

describe("multi-stamp awards", () => {
  it("awards quantity × pointsPerVisit as one transaction and one visit (stamps), ignores it for per_dollar", async () => {
    const s = await shop({ earnType: "stamps" });
    const phone = nextPhone();
    const res = await call("POST", `${s.base}/counter/award`, { phone, quantity: 2 }, s.staffToken, { "idempotency-key": key() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pointsEarned: 2, balance: 2 });
    const memberId = res.json().member.memberId;
    expect(await env.db.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.memberId, memberId), eq(ledgerTransactions.type, "earn")))).toHaveLength(1);
    expect(await env.db.select().from(visits).where(eq(visits.memberId, memberId))).toHaveLength(1);
    expect(res.json().member.visitCount).toBe(1);

    // Cooldown is checked once per award, not per stamp.
    const again = await call("POST", `${s.base}/counter/award`, { phone, quantity: 3 }, s.staffToken, { "idempotency-key": key() });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("cooldown");
    expect((await call("POST", `${s.base}/counter/award`, { phone: nextPhone(), quantity: 11 }, s.staffToken, { "idempotency-key": key() })).statusCode).toBe(400);

    // Offline sync events accept quantity too.
    const sync = await call(
      "POST",
      `${s.base}/counter/sync`,
      { events: [{ type: "award", idempotencyKey: key(), occurredAt: env.clock.now.toISOString(), phone: nextPhone(), quantity: 3 }] },
      s.staffToken,
    );
    expect(sync.statusCode).toBe(200);
    expect(sync.json().results[0]).toMatchObject({ status: "ok", result: { pointsEarned: 3 } });

    const d = await shop({ earnType: "per_dollar" });
    const pd = await call("POST", `${d.base}/counter/award`, { phone: nextPhone(), amountCents: 1000, quantity: 5 }, d.staffToken, { "idempotency-key": key() });
    expect(pd.json()).toMatchObject({ pointsEarned: 10 });
  });
});
