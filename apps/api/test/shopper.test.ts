import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { campaigns, notifications } from "@ll/db";
import { customerApi, unitLabel } from "@ll/shared";
import { awardPurchase } from "../src/services/ledger.js";
import { sendExpiryWarnings } from "../src/services/notifications.js";
import { passLocations, walletSummary } from "../src/services/wallet.js";
import { buildPassJson } from "../src/services/wallet-apple.js";
import { loyaltyObject } from "../src/services/wallet-google.js";
import { merchantMembers, loyaltyPrograms } from "@ll/db";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, grantFeatures, tokenFor, type TestEnv } from "./helpers.js";

/** Shopper app: the shopper's language follows them into pushes and the wallet pass; routine pushes are budgeted. */
let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv(); // 2026-11-03 15:00Z = 10:00 in Toronto
});
afterEach(async () => env.close());

const MIN = 60_000;
const HOUR = 60 * MIN;
const advance = (ms: number) => (env.clock.now = new Date(env.clock.now.getTime() + ms));
const DEVANAGARI = /[ऀ-ॿ]/;
const GURMUKHI = /[਀-੿]/;

async function shopper(opts: { locale?: string } = {}) {
  const user = await createUser(env.db, { name: "Priya", email: `p${randomUUID().slice(0, 6)}@example.com` });
  const h = { authorization: `Bearer ${await tokenFor(env, user)}` };
  const r = await env.app.inject({ method: "POST", url: "/v1/me/push-tokens", headers: h, payload: { token: `ExponentPushToken[${randomUUID().slice(0, 8)}]`, platform: "ios" } });
  expect(r.statusCode).toBe(204);
  if (opts.locale) {
    const p = await env.app.inject({ method: "PATCH", url: "/v1/me", headers: h, payload: { locale: opts.locale } });
    expect(p.statusCode).toBe(200);
  }
  return { user, h };
}
const inbox = (userId: string) => env.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.createdAt);

describe("the shopper's language", () => {
  it("PATCH /v1/me accepts en, hi, ur, pa and rejects other codes", async () => {
    const { h } = await shopper();
    for (const locale of ["hi", "ur", "pa", "en"]) {
      const r = await env.app.inject({ method: "PATCH", url: "/v1/me", headers: h, payload: { locale } });
      expect(r.statusCode).toBe(200);
      expect(r.json().locale).toBe(locale);
    }
    expect((await env.app.inject({ method: "PATCH", url: "/v1/me", headers: h, payload: { locale: "fr" } })).statusCode).toBe(400);
  });

  it("an earn push and its inbox row are written in the shopper's language; an English shopper is unchanged", async () => {
    const shop = await createMerchant(env);
    const hi = await shopper({ locale: "hi" });
    const en = await shopper();
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, userId: hi.user.id, source: "staff_app", amountCents: 1000 });
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, userId: en.user.id, source: "staff_app", amountCents: 1000 });
    const [pHi, pEn] = env.ctx.providers.outbox.push;
    expect(pEn).toMatchObject({ title: "+10 points at Test Shop", body: "You now have 10 points. 40 points to $5 off." });
    expect(pHi!.title).toMatch(DEVANAGARI);
    expect(pHi!.title).toContain("Test Shop");
    expect(pHi!.title).toContain("+10");
    expect(pHi!.body).toMatch(DEVANAGARI);
    expect((await inbox(hi.user.id))[0]!.title).toBe(pHi!.title);
  });

  it("reward ready and the expiry warning follow the language too", async () => {
    const shop = await createMerchant(env);
    const pa = await shopper({ locale: "pa" });
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, userId: pa.user.id, source: "staff_app", amountCents: 6000 });
    const last = env.ctx.providers.outbox.push.at(-1)!;
    expect(last.title).toMatch(GURMUKHI);
    expect(last.body).toContain("$5 off");
    // Expiry: a 12-month shop, last visit 11.5 months ago.
    await env.db.update(loyaltyPrograms).set({ expiryMonths: 12 }).where(eq(loyaltyPrograms.merchantId, shop.merchant.id));
    const visit = new Date(env.clock.now.getTime() - 345 * 24 * HOUR);
    await env.db.update(merchantMembers).set({ lastVisitAt: visit }).where(eq(merchantMembers.userId, pa.user.id));
    expect(await sendExpiryWarnings(env.ctx)).toBe(1);
    const exp = env.ctx.providers.outbox.push.at(-1)!;
    expect(exp.title).toMatch(GURMUKHI);
    expect(exp.body).toMatch(GURMUKHI);
  });

  it("the wallet pass is written in the shopper's language, with the same shape in English", async () => {
    const shop = await createMerchant(env);
    const hi = await shopper({ locale: "hi" });
    const en = await shopper();
    for (const u of [hi, en]) await awardPurchase(env.ctx, { merchantId: shop.merchant.id, userId: u.user.id, source: "staff_app", amountCents: 6000 });
    const sHi = await walletSummary(env.ctx, hi.user.id);
    const sEn = await walletSummary(env.ctx, en.user.id);
    expect(sHi.locale).toBe("hi");
    expect(sEn.locale).toBe("en");
    const p = { passTypeId: "pass.test", teamId: "TEAM" };
    const jHi = buildPassJson(env.ctx.config, p, { serialNumber: "A", authToken: "t".repeat(32), summary: sHi });
    const jEn = buildPassJson(env.ctx.config, p, { serialNumber: "A", authToken: "t".repeat(32), summary: sEn });
    expect(jEn.storeCard.primaryFields[0]).toMatchObject({ label: "ready at Test Shop", value: "1 reward" });
    expect(jHi.storeCard.primaryFields[0]!.label).toMatch(DEVANAGARI);
    expect(jHi.storeCard.headerFields[0]!.label).toMatch(DEVANAGARI);
    expect(jHi.storeCard.headerFields[0]!.changeMessage).toContain("%@");
    expect(jHi.storeCard.secondaryFields[0]!.changeMessage).toMatch(DEVANAGARI);
    expect(jHi.storeCard.secondaryFields[0]!.changeMessage).toContain("%@");
    expect(jHi.storeCard.secondaryFields[0]!.value).toMatch(DEVANAGARI);
    expect(jHi.storeCard.backFields.map((f) => f.key)).toEqual(jEn.storeCard.backFields.map((f) => f.key));
    expect(jHi.storeCard.backFields.every((f) => f.key === "code" || f.key === "terms" || f.key === "help" || DEVANAGARI.test(f.label))).toBe(true);
    // The member's QR value and code never change with language.
    expect(jHi.barcodes[0]!.message).toBe(jEn.barcodes[0]!.message.replace(en.user.memberCode, hi.user.memberCode));
    const locs = await passLocations(env.ctx, hi.user.id, 10, "hi");
    expect(locs.length === 0 || DEVANAGARI.test(locs[0]!.relevantText)).toBe(true);
    const g = loyaltyObject(env.ctx.config, "3388000000012345678", hi.user.id, { summary: sHi });
    expect(g.loyaltyPoints.label).toMatch(DEVANAGARI);
    expect(g.textModulesData.find((x) => x.id === "how")!.body).toMatch(DEVANAGARI);
  });

  it("changing the language marks the pass for re-issue", async () => {
    const shop = await createMerchant(env);
    const u = await shopper();
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, userId: u.user.id, source: "staff_app", amountCents: 1000 });
    const { walletPasses } = await import("@ll/db");
    await env.db.insert(walletPasses).values({ userId: u.user.id, platform: "apple", serialNumber: `A${randomUUID().replace(/-/g, "").slice(0, 15)}`, authToken: "x".repeat(24), lastUpdatedAt: new Date(0) });
    const r = await env.app.inject({ method: "PATCH", url: "/v1/me", headers: u.h, payload: { locale: "ur" } });
    expect(r.statusCode).toBe(200);
    const [p] = await env.db.select().from(walletPasses).where(eq(walletPasses.userId, u.user.id));
    expect(p!.lastUpdatedAt.getTime()).toBeGreaterThan(0);
  });
});

describe("invites", () => {
  it("the invite text and link are written in the inviter's language", async () => {
    const shop = await createMerchant(env);
    await env.db.update(loyaltyPrograms).set({ referralBonus: 25 }).where(eq(loyaltyPrograms.merchantId, shop.merchant.id));
    await grantFeatures(env, shop.merchant.id, ["loyalty.referrals"]);
    const en = await shopper();
    const pa = await shopper({ locale: "pa" });
    const out: Record<string, { shareText: string; shareUrl: string }> = {};
    for (const [k, u] of [["en", en], ["pa", pa]] as const) {
      const join = await env.app.inject({ method: "POST", url: "/v1/me/memberships", headers: u.h, payload: { merchantId: shop.merchant.id } });
      const id = join.json().membership.id as string;
      const r = await env.app.inject({ method: "GET", url: `/v1/me/memberships/${id}/referral`, headers: u.h });
      expect(r.statusCode).toBe(200);
      out[k] = r.json();
    }
    expect(out.en!.shareText).toMatch(/^Join me at Test Shop on .+ and we both get 25 points: http/);
    expect(out.en!.shareUrl).not.toContain("lang=");
    expect(out.pa!.shareText).toMatch(GURMUKHI);
    expect(out.pa!.shareText).toContain("Test Shop");
    expect(out.pa!.shareUrl).toContain("&lang=pa");
  });
});

describe("live street campaigns (public)", () => {
  it("lists campaigns that are on now, soonest to end first, without signing in", async () => {
    const hood = await createNeighbourhood(env.db);
    await createMerchant(env, { neighbourhoodId: hood.id });
    const now = env.clock.now.getTime();
    const row = (name: string, status: string, startsIn: number, endsIn: number) => ({ neighbourhoodId: hood.id, name, kind: "passport", status, goalVisits: 4, startsAt: new Date(now + startsIn), endsAt: new Date(now + endsIn) });
    await env.db.insert(campaigns).values([
      row("Ends later", "live", -HOUR, 5 * 24 * HOUR),
      row("Ends soon", "live", -HOUR, 2 * 24 * HOUR),
      row("Not started", "scheduled", 24 * HOUR, 5 * 24 * HOUR),
      row("Draft", "draft", -HOUR, 5 * 24 * HOUR),
      row("Done", "ended", -9 * 24 * HOUR, -24 * HOUR),
    ]);
    const r = await env.app.inject({ method: "GET", url: "/v1/public/live-campaigns" });
    expect(r.statusCode).toBe(200);
    const items = r.json().items as { name: string; goalVisits: number; neighbourhood: { slug: string }; merchants: unknown[] }[];
    expect(items.map((c) => c.name)).toEqual(["Ends soon", "Ends later"]);
    expect(items[0]).toMatchObject({ goalVisits: 4, neighbourhood: { slug: hood.slug } });
  });
});

describe("unit words", () => {
  it("keeps English as the shop typed it and translates points and stamps elsewhere", () => {
    expect(unitLabel("en", "points", 120)).toBe("120 points");
    expect(unitLabel("en", "stamps", 1)).toBe("1 stamp");
    expect(unitLabel("en", "stars", 3)).toBe("3 stars");
    expect(unitLabel("hi", "points", 120)).toMatch(DEVANAGARI);
    expect(unitLabel("pa", "stamps", 2)).toMatch(GURMUKHI);
    expect(unitLabel("hi", "stars", 3)).toBe("3 stars");
    expect(unitLabel("en", "points", 1200)).toBe("1,200 points");
  });
});

describe("routine push budget", () => {
  it(`at most ${customerApi.ROUTINE_PUSHES_PER_DAY} points/passport pushes a day across all shops; the inbox keeps every one; reward ready still pushes`, async () => {
    const { user } = await shopper();
    const shops = [];
    for (let i = 0; i < 5; i++) shops.push(await createMerchant(env));
    const results = [];
    for (const s of shops.slice(0, 4)) {
      await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: user.id, source: "staff_app", amountCents: 1000 });
      results.push(env.ctx.providers.outbox.push.length);
    }
    // Pushes after each earn: 1, 2, 3, then the budget is used up.
    expect(results).toEqual([1, 2, 3, 3]);
    const rows = await inbox(user.id);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.channels.includes("push"))).toEqual([true, true, true, false]);

    // A reward is never budgeted.
    await awardPurchase(env.ctx, { merchantId: shops[4]!.merchant.id, userId: user.id, source: "staff_app", amountCents: 6000 });
    expect(env.ctx.providers.outbox.push).toHaveLength(4);
    expect(env.ctx.providers.outbox.push.at(-1)!.title).toContain("Reward ready");

    // A day later the budget is back.
    advance(25 * HOUR);
    await awardPurchase(env.ctx, { merchantId: shops[0]!.merchant.id, userId: user.id, source: "staff_app", amountCents: 500 });
    expect(env.ctx.providers.outbox.push).toHaveLength(5);
  });

  it("GET /v1/me/notification-prefs states the limits the settings screen shows", async () => {
    const { h } = await shopper();
    const r = await env.app.inject({ method: "GET", url: "/v1/me/notification-prefs", headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.json().limits).toEqual({ routinePushesPerDay: customerApi.ROUTINE_PUSHES_PER_DAY, offersPerDay: 1, pointsCollapseMinutes: 10 });
  });
});
