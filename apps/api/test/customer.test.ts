import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, discountCards, ledgerEntries, locations, loyaltyPrograms, merchantMembers, pushTokens, rewards, sessions, users, vipLevels } from "@ll/db";
import { customerApi } from "@ll/shared";
import { awardPurchase, ledgerBalance } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv, grantFeatures } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, token?: string) =>
  env.app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function customer(name = "Sam Lee") {
  const user = await createUser(env.db, { name, phoneVerifiedAt: new Date() });
  return { user, token: await tokenFor(env, user) };
}

async function shop(opts: Parameters<typeof createMerchant>[1] = {}) {
  const m = await createMerchant(env, opts);
  const [loc] = await env.db
    .insert(locations)
    .values({ merchantId: m.merchant.id, name: "Main", address: "1 Roncesvalles Ave", lat: 43.64, lng: -79.45, qrCode: `QR${m.merchant.slug}` })
    .returning();
  return { ...m, location: loc! };
}

const CONSENT = "Yes, Test Shop may send me offers by text and email. Reply STOP to unsubscribe.";

describe("profile", () => {
  it("gets and updates the profile, normalising postal codes and checking email uniqueness", async () => {
    const { user, token } = await customer();
    const hood = await createNeighbourhood(env.db, "roncy");
    expect((await call("GET", "/v1/me")).statusCode).toBe(401);
    const me = await call("GET", "/v1/me", undefined, token);
    expect(me.json()).toMatchObject({ id: user.id, name: "Sam Lee", memberCode: user.memberCode, homeNeighbourhood: null });

    const up = await call("PATCH", "/v1/me", { name: "Samira Lee", email: "Sam@Example.com", birthday: "1990-05-04", postalCode: "m6r2k3", homeNeighbourhoodId: hood.id }, token);
    expect(up.statusCode).toBe(200);
    expect(up.json()).toMatchObject({
      name: "Samira Lee",
      email: "sam@example.com",
      birthday: "1990-05-04",
      postalCode: "M6R 2K3",
      homeNeighbourhood: { id: hood.id, slug: "roncy", name: "roncy" },
    });
    await createUser(env.db, { email: "taken@example.com" });
    expect((await call("PATCH", "/v1/me", { email: "TAKEN@example.com" }, token)).statusCode).toBe(409);
    expect((await call("PATCH", "/v1/me", { postalCode: "90210" }, token)).statusCode).toBe(400);
    expect((await call("PATCH", "/v1/me", { homeNeighbourhoodId: "00000000-0000-4000-8000-000000000000" }, token)).statusCode).toBe(400);
  });
});

describe("joining and the wallet", () => {
  it("joins by counter QR with CASL consent, applies the welcome bonus once, and shows the wallet", async () => {
    const s = await shop({ welcomeBonus: 10 });
    await env.db.update(loyaltyPrograms).set({ expiryMonths: 12 }).where(eq(loyaltyPrograms.merchantId, s.merchant.id));
    const { user, token } = await customer();
    const res = await call("POST", "/v1/me/memberships", { locationQrCode: s.location.qrCode, consent: { text: CONSENT } }, token);
    expect(res.statusCode).toBe(201);
    const body: customerApi.JoinResponse = res.json();
    expect(body.created).toBe(true);
    expect(body.bonusPoints).toBe(10);
    expect(body.membership).toMatchObject({
      balance: 10,
      terminology: "points",
      expiryDisclosure: "Points expire after 12 months with no visits.",
      marketingConsent: { granted: true, text: CONSENT, source: "counter_qr" },
      nextReward: { rewardId: s.reward.id, pointsNeeded: 40, progressPct: 20 },
      rewardsAvailableCount: 0,
      muted: false,
    });
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, user.id));
    expect(m!.joinedVia).toBe("qr");
    expect(m!.joinedLocationId).toBe(s.location.id);
    const logs = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "consent.granted"));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.data).toMatchObject({ text: CONSENT });

    const again = await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id }, token);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ created: false, bonusPoints: 0, membership: { balance: 10 } });

    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: user.id, source: "staff_app", amountCents: 4500 });
    const wallet = await call("GET", "/v1/me/memberships", undefined, token);
    expect(wallet.statusCode).toBe(200);
    expect(wallet.json().totals).toEqual({ shops: 1, rewardsAvailable: 1 });
    expect(wallet.json().items[0]).toMatchObject({ balance: 55, rewardsAvailableCount: 1, nextReward: null, visitCount: 1 });
  });

  it("rejects bad join requests", async () => {
    const { token } = await customer();
    expect((await call("POST", "/v1/me/memberships", {}, token)).statusCode).toBe(400);
    expect((await call("POST", "/v1/me/memberships", { locationQrCode: "NOPE123" }, token)).statusCode).toBe(404);
    expect((await call("POST", "/v1/me/memberships", { merchantId: "00000000-0000-4000-8000-000000000000" }, token)).statusCode).toBe(404);
    expect((await call("POST", "/v1/me/memberships", { merchantId: "00000000-0000-4000-8000-000000000000" })).statusCode).toBe(401);
  });

  it("shows membership detail with history paging, rewards, cards and VIP; hides it from other users", async () => {
    const s = await shop();
    await grantFeatures(env, s.merchant.id, ["loyalty.vip_levels", "discount_cards"]); // Plus (Pricing v2): pilot shop
    const [gold] = await env.db.insert(vipLevels).values({ merchantId: s.merchant.id, name: "Gold", thresholdPoints: 50, multiplierPct: 150 }).returning();
    await env.db.insert(discountCards).values([
      { merchantId: s.merchant.id, name: "Seniors 10%", percentOff: 10, eligibility: "seniors", terms: "Not on prescriptions" },
      { merchantId: s.merchant.id, name: "VIP 15%", percentOff: 15, eligibility: "vip" },
    ]);
    await env.db.insert(rewards).values({ merchantId: s.merchant.id, name: "$20 off", pointsCost: 200, rewardType: "amount_off", value: 2000 });
    const { user, token } = await customer();
    for (let i = 0; i < 3; i++) await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: user.id, source: "staff_app", amountCents: 3000 });
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, user.id));

    const p1 = await call("GET", `/v1/me/memberships/${m!.id}?historyLimit=2`, undefined, token);
    expect(p1.statusCode).toBe(200);
    const d: customerApi.MembershipDetailResponse = p1.json();
    expect(d.membership.vip).toMatchObject({ id: gold!.id, name: "Gold", multiplierPct: 150 });
    expect(d.history.items).toHaveLength(2);
    expect(d.history.nextCursor).toBeTruthy();
    expect(d.rewards.map((r) => [r.name, r.affordable])).toEqual([
      ["$5 off", true],
      ["$20 off", false],
    ]);
    expect(d.discountCards.map((c) => c.name).sort()).toEqual(["Seniors 10%", "VIP 15%"]);
    const p2 = await call("GET", `/v1/me/memberships/${m!.id}?historyLimit=2&historyCursor=${d.history.nextCursor}`, undefined, token);
    expect(p2.json().history.items).toHaveLength(1);
    expect(p2.json().history.nextCursor).toBeNull();
    const ids = [...d.history.items, ...p2.json().history.items].map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(3);

    const other = await customer("Other");
    expect((await call("GET", `/v1/me/memberships/${m!.id}`, undefined, other.token)).statusCode).toBe(404);
    expect((await call("GET", `/v1/me/memberships/not-a-uuid`, undefined, other.token)).statusCode).toBe(404);
  });
});

describe("consent, mute and app redemptions", () => {
  it("mutes, grants and withdraws marketing consent with an audit trail", async () => {
    const s = await shop();
    const { token } = await customer();
    const join = (await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id }, token)).json();
    const id = join.membership.id;
    expect(join.membership.marketingConsent.granted).toBe(false);

    expect((await call("PATCH", `/v1/me/memberships/${id}`, { muted: true }, token)).json().muted).toBe(true);
    expect((await call("PATCH", `/v1/me/memberships/${id}`, { muted: false }, token)).json().muted).toBe(false);

    const g = await call("POST", `/v1/me/memberships/${id}/consent`, { text: CONSENT }, token);
    expect(g.json().marketingConsent).toMatchObject({ granted: true, text: CONSENT, source: "customer_app" });
    expect((await call("POST", `/v1/me/memberships/${id}/consent`, { text: "" }, token)).statusCode).toBe(400);
    const w = await call("DELETE", `/v1/me/memberships/${id}/consent`, undefined, token);
    expect(w.json().marketingConsent).toEqual({ granted: false, grantedAt: null, text: null, source: null });
    const logs = await env.db.select().from(auditLogs).where(eq(auditLogs.entityId, id));
    expect(logs.map((l) => l.action).sort()).toEqual(["consent.granted", "consent.withdrawn"]);
    expect(logs.find((l) => l.action === "consent.withdrawn")!.data).toMatchObject({ text: CONSENT });
  });

  it("issues a 6-char reward code from the app, idempotently, and cancels it", async () => {
    const s = await shop();
    const { user, token } = await customer();
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: user.id, source: "staff_app", amountCents: 6000 });
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, user.id));
    const body = { rewardId: s.reward.id, idempotencyKey: "tap-0001-abc" };
    const r = await call("POST", `/v1/me/memberships/${m!.id}/redeem`, body, token);
    expect(r.statusCode).toBe(201);
    expect(r.json().redemption).toMatchObject({ status: "issued", rewardName: "$5 off", usedAt: null });
    expect(r.json().redemption.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(r.json().balance).toBe(10);
    const dup = await call("POST", `/v1/me/memberships/${m!.id}/redeem`, body, token);
    expect(dup.statusCode).toBe(200);
    expect(dup.json()).toMatchObject({ duplicate: true, balance: 10, redemption: { code: r.json().redemption.code } });

    const detail = await call("GET", `/v1/me/memberships/${m!.id}`, undefined, token);
    expect(detail.json().openRedemptions).toHaveLength(1);

    expect((await call("POST", `/v1/me/memberships/${m!.id}/redeem`, { rewardId: s.reward.id }, token)).statusCode).toBe(409);
    const other = await customer("Other");
    expect((await call("DELETE", `/v1/me/redemptions/${r.json().redemption.id}`, undefined, other.token)).statusCode).toBe(404);
    const cancel = await call("DELETE", `/v1/me/redemptions/${r.json().redemption.id}`, undefined, token);
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().balance).toBe(60);
    expect(await ledgerBalance(env.db, m!.id)).toBe(60);
    expect((await call("DELETE", `/v1/me/redemptions/${r.json().redemption.id}`, undefined, token)).statusCode).toBe(409);
  });
});

describe("card, push tokens and referrals", () => {
  it("returns the member QR card", async () => {
    const { user, token } = await customer();
    const res = await call("GET", "/v1/me/card", undefined, token);
    expect(res.json()).toMatchObject({ memberCode: user.memberCode, qrPayload: `LL:${user.memberCode}`, name: "Sam Lee" });
    expect(res.json().qrSvg).toContain("<svg");
  });

  it("registers, moves and unregisters push tokens", async () => {
    const a = await customer();
    const b = await customer("B");
    const token = "ExponentPushToken[abc123def456]";
    expect((await call("POST", "/v1/me/push-tokens", { token, platform: "ios" }, a.token)).statusCode).toBe(204);
    expect((await call("POST", "/v1/me/push-tokens", { token, platform: "ios" }, b.token)).statusCode).toBe(204);
    let rows = await env.db.select().from(pushTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(b.user.id);
    await call("DELETE", `/v1/me/push-tokens/${encodeURIComponent(token)}`, undefined, a.token);
    expect(await env.db.select().from(pushTokens)).toHaveLength(1);
    await call("DELETE", `/v1/me/push-tokens/${encodeURIComponent(token)}`, undefined, b.token);
    rows = await env.db.select().from(pushTokens);
    expect(rows).toHaveLength(0);
    expect((await call("POST", "/v1/me/push-tokens", { token, platform: "blackberry" }, a.token)).statusCode).toBe(400);
  });

  it("rewards both sides of a referral once via the ledger", async () => {
    const s = await shop();
    await env.db.update(loyaltyPrograms).set({ referralBonus: 25 }).where(eq(loyaltyPrograms.merchantId, s.merchant.id));
    const ann = await customer("Ann");
    const annJoin = (await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id }, ann.token)).json();
    // Pricing v2: referrals are Plus. Without the feature: no code (402) and the bonus shows as 0 (apps hide "Invite").
    expect(annJoin.membership.program.referralBonus).toBe(0);
    expect((await call("GET", `/v1/me/memberships/${annJoin.membership.id}/referral`, undefined, ann.token)).statusCode).toBe(402);
    await grantFeatures(env, s.merchant.id, ["loyalty.referrals"]);
    const ref = await call("GET", `/v1/me/memberships/${annJoin.membership.id}/referral`, undefined, ann.token);
    expect(ref.statusCode).toBe(200);
    const { code, shareUrl, bonusPoints } = ref.json();
    expect(bonusPoints).toBe(25);
    expect(shareUrl).toBe(`http://localhost:3000/shops/${s.merchant.slug}?ref=${code}`);
    // GET is stable until the code is used.
    expect((await call("GET", `/v1/me/memberships/${annJoin.membership.id}/referral`, undefined, ann.token)).json().code).toBe(code);

    const own = await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id, referralCode: code }, ann.token);
    expect(own.json().referral).toEqual({ applied: false, reason: "own_code" });

    // Feature switched off (pilot override removed): a code shared earlier joins the friend without bonuses.
    await grantFeatures(env, s.merchant.id, ["loyalty.referrals"], false);
    const cat = await customer("Cat");
    const catJoin = await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id, referralCode: code }, cat.token);
    expect(catJoin.statusCode).toBe(201);
    expect(catJoin.json()).toMatchObject({ bonusPoints: 0, referral: { applied: false, reason: "unavailable" }, membership: { balance: 0 } });
    await grantFeatures(env, s.merchant.id, ["loyalty.referrals"]);

    const bob = await customer("Bob");
    const bobJoin = await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id, referralCode: code.toLowerCase() }, bob.token);
    expect(bobJoin.statusCode).toBe(201);
    expect(bobJoin.json()).toMatchObject({ bonusPoints: 25, referral: { applied: true }, membership: { balance: 25 } });
    const [annMember] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, annJoin.membership.id));
    expect(annMember!.balance).toBe(25);
    const [bobMember] = await env.db.select().from(merchantMembers).where(and(eq(merchantMembers.userId, bob.user.id)));
    expect(bobMember!.referredByMemberId).toBe(annMember!.id);
    expect(bobMember!.joinedVia).toBe("referral");
    expect((await env.db.select().from(ledgerEntries)).reduce((sum, e) => sum + e.amount, 0)).toBe(0);

    const cy = await customer("Cy");
    const reuse = await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id, referralCode: code }, cy.token);
    expect(reuse.json()).toMatchObject({ bonusPoints: 0, referral: { applied: false, reason: "already_used" } });
    const bad = await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id, referralCode: "ZZZZZZZZ" }, (await customer("Di")).token);
    expect(bad.json().referral).toEqual({ applied: false, reason: "invalid" });

    const next = await call("GET", `/v1/me/memberships/${annJoin.membership.id}/referral`, undefined, ann.token);
    expect(next.json().code).not.toBe(code);
    expect(next.json().stats).toEqual({ invited: 1, rewarded: 1 });
    expect((await call("POST", `/v1/me/memberships/${annJoin.membership.id}/referral`, undefined, ann.token)).statusCode).toBe(201);
  });
});

describe("PIPEDA", () => {
  it("exports everything about the customer", async () => {
    const s = await shop();
    const { user, token } = await customer();
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: user.id, source: "staff_app", amountCents: 2500 });
    const res = await call("GET", "/v1/me/export", undefined, token);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    const data: customerApi.DataExportResponse = res.json();
    expect(data.profile.id).toBe(user.id);
    expect(data.memberships).toHaveLength(1);
    expect(data.memberships[0]!.transactions[0]).toMatchObject({ type: "earn", points: 25 });
    expect(data.visits).toHaveLength(1);
  });

  it("deletes the account: scrubs PII, ends sessions, keeps the ledger balanced, frees the phone", async () => {
    const s = await shop();
    const login = await call("POST", "/v1/auth/otp/start", { phone: nextPhone() });
    const phone = env.ctx.providers.outbox.sms.at(-1)!.to;
    const auth = (await call("POST", "/v1/auth/otp/verify", { phone, code: login.json().devCode, name: "Del Me" })).json();
    await call("POST", "/v1/me/memberships", { merchantId: s.merchant.id, consent: { text: CONSENT } }, auth.accessToken);
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: auth.user.id, source: "staff_app", amountCents: 2500 });
    await call("POST", "/v1/me/push-tokens", { token: "ExponentPushToken[zzzzzzzzzz]", platform: "android" }, auth.accessToken);

    expect((await call("DELETE", "/v1/me", { confirm: "nope" }, auth.accessToken)).statusCode).toBe(400);
    expect((await call("DELETE", "/v1/me", { confirm: "DELETE" }, auth.accessToken)).statusCode).toBe(204);

    const [u] = await env.db.select().from(users).where(eq(users.id, auth.user.id));
    expect(u).toMatchObject({ phone: null, email: null, name: null, birthday: null, postalCode: null });
    expect(u!.deletedAt).not.toBeNull();
    expect(u!.memberCode).not.toBe(auth.user.memberCode);
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, auth.user.id));
    expect(m).toMatchObject({ marketingConsentAt: null, marketingConsentText: null, muted: true, balance: 25 });
    expect(await env.db.select().from(sessions).where(eq(sessions.userId, auth.user.id))).toHaveLength(0);
    expect(await env.db.select().from(pushTokens)).toHaveLength(0);
    expect((await env.db.select().from(ledgerEntries)).reduce((sum, e) => sum + e.amount, 0)).toBe(0);

    expect((await call("GET", "/v1/me", undefined, auth.accessToken)).statusCode).toBe(401);
    expect((await call("POST", "/v1/auth/refresh", { refreshToken: auth.refreshToken })).statusCode).toBe(401);
    const start = await call("POST", "/v1/auth/otp/start", { phone });
    const fresh = await call("POST", "/v1/auth/otp/verify", { phone, code: start.json().devCode });
    expect(fresh.json().created).toBe(true);
    expect(fresh.json().user.id).not.toBe(auth.user.id);
  });
});
