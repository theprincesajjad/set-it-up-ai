import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerEntries, ledgerTransactions, merchantMembers, merchants, networkPerkAwards, networkPerks, promos, vipLevels, visits } from "@ll/db";
import { adjustPoints, awardPurchase, ledgerBalance, redeemReward, reverseTransaction } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, nextPhone, type TestEnv, grantFeatures } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ activationThreshold: 2 });
});
afterEach(async () => env.close());

describe("ledger", () => {
  it("awards per-dollar points, excludes no-earn categories, keeps entries balanced", async () => {
    const { merchant, noEarnCategory } = await createMerchant(env, { welcomeBonus: 10 });
    const phone = nextPhone();
    const r = await awardPurchase(env.ctx, {
      merchantId: merchant.id,
      phone,
      source: "staff_app",
      lines: [{ amountCents: 4299 }, { amountCents: 8000, categoryId: noEarnCategory.id }],
    });
    expect(r.memberCreated).toBe(true);
    expect(r.earn.totalPoints).toBe(42);
    expect(r.earn.excludedCents).toBe(8000);
    expect(r.member.balance).toBe(52); // 10 welcome + 42
    expect(await ledgerBalance(env.db, r.member.id)).toBe(52);
    const all = await env.db.select().from(ledgerEntries);
    expect(all.reduce((s, e) => s + e.amount, 0)).toBe(0);
  });

  it("does not remember an account created inside a transaction that rolled back", async () => {
    const { merchant } = await createMerchant(env);
    const phone = nextPhone();
    // The first posting creates the shop's accounts and the member's inside this transaction, then the transaction is undone.
    await expect(
      env.db.transaction(async (tx) => {
        await awardPurchase({ ...env.ctx, db: tx as never }, { merchantId: merchant.id, phone, source: "staff_app", amountCents: 1000 });
        throw new Error("undo");
      }),
    ).rejects.toThrow("undo");
    const again = await awardPurchase(env.ctx, { merchantId: merchant.id, phone, source: "staff_app", amountCents: 1000 });
    expect(again.earn.totalPoints).toBeGreaterThan(0);
  });

  it("is idempotent on retries", async () => {
    const { merchant } = await createMerchant(env);
    const args = { merchantId: merchant.id, phone: nextPhone(), source: "square" as const, amountCents: 1000, idempotencyKey: "sq:pay_1" };
    const a = await awardPurchase(env.ctx, args);
    const b = await awardPurchase(env.ctx, args);
    expect(b.duplicate).toBe(true);
    expect(b.member.balance).toBe(a.member.balance);
    expect(b.member.visitCount).toBe(1);
  });

  it("Pricing v2: paid-locked promo boosts and VIP multipliers don't apply in awardPurchase", async () => {
    const { merchant } = await createMerchant(env);
    await env.db.insert(promos).values({ merchantId: merchant.id, title: "Double points", kind: "multiplier", multiplierPct: 200, startsAt: new Date("2026-11-01"), status: "live" });
    const [gold] = await env.db.insert(vipLevels).values({ merchantId: merchant.id, name: "Gold", thresholdPoints: 0, multiplierPct: 150 }).returning();
    const phone = nextPhone();
    // Free shop: the promo and VIP rows exist but are locked → base earn only.
    const r = await awardPurchase(env.ctx, { merchantId: merchant.id, phone, source: "staff_app", amountCents: 1000 });
    expect(r.earn.totalPoints).toBe(10);
    expect(r.transaction!.promoId).toBeNull();
    expect(r.member.vipLevelId).toBe(gold!.id); // level kept, just not multiplying
    // Pilot override on → both apply (10 × 2 promo × 1.5 VIP).
    await grantFeatures(env, merchant.id, ["promos.double_points", "loyalty.vip_levels"]);
    const r2 = await awardPurchase(env.ctx, { merchantId: merchant.id, phone, source: "staff_app", amountCents: 1000 });
    expect(r2.earn.totalPoints).toBe(30);
    expect(r2.transaction!.promoId).not.toBeNull();
  });

  it("applies double-points promos and enforces visit cooldown for stamp programs", async () => {
    const { merchant } = await createMerchant(env, { earnType: "stamps" });
    await grantFeatures(env, merchant.id, ["promos.double_points"]); // Plus (Pricing v2): pilot override
    await env.db.insert(promos).values({ merchantId: merchant.id, title: "Double stamps", kind: "multiplier", multiplierPct: 200, startsAt: new Date("2026-11-01"), status: "live" });
    const phone = nextPhone();
    const r = await awardPurchase(env.ctx, { merchantId: merchant.id, phone, source: "staff_app" });
    expect(r.earn.totalPoints).toBe(2);
    await expect(awardPurchase(env.ctx, { merchantId: merchant.id, phone, source: "staff_app" })).rejects.toMatchObject({ code: "cooldown" });
    env.clock.now = new Date(env.clock.now.getTime() + 31 * 60000);
    const r2 = await awardPurchase(env.ctx, { merchantId: merchant.id, phone, source: "staff_app" });
    expect(r2.member.balance).toBe(4);
  });

  it("redeems, refuses overdraft, reverses once", async () => {
    const { merchant, reward, owner } = await createMerchant(env);
    const r = await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 6000 });
    const red = await redeemReward(env.ctx, { merchantId: merchant.id, memberId: r.member.id, rewardId: reward.id, source: "staff_app" });
    expect(red.member.balance).toBe(10);
    expect(red.redemption.code).toHaveLength(6);
    await expect(redeemReward(env.ctx, { merchantId: merchant.id, memberId: r.member.id, rewardId: reward.id, source: "staff_app" })).rejects.toMatchObject({ code: "insufficient_points" });
    const rev = await reverseTransaction(env.ctx, { merchantId: merchant.id, transactionId: red.redemption.transactionId!, reason: "Customer changed mind" });
    expect(rev.member.balance).toBe(60);
    await expect(reverseTransaction(env.ctx, { merchantId: merchant.id, transactionId: red.redemption.transactionId!, reason: "again" })).rejects.toMatchObject({ code: "conflict" });
    const adj = await adjustPoints(env.ctx, { merchantId: merchant.id, memberId: r.member.id, points: -5, reason: "Typo", staffUserId: owner.id });
    expect(adj.member.balance).toBe(55);
    expect(await ledgerBalance(env.db, r.member.id)).toBe(55);
  });

  it("awards a network-funded perk on the 3rd distinct shop and activates merchants", async () => {
    const hood = await createNeighbourhood(env.db);
    await env.db.insert(networkPerks).values({ neighbourhoodId: hood.id, name: "Strip explorer", threshold: 3, bonusPoints: 25 });
    const shops = await Promise.all([1, 2, 3].map(() => createMerchant(env, { neighbourhoodId: hood.id })));
    const phone = nextPhone();
    let last;
    for (const s of shops) last = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone, source: "staff_app", amountCents: 500 });
    expect(last!.extraPoints).toBe(25);
    expect(last!.member.balance).toBe(30);
    await awardPurchase(env.ctx, { merchantId: shops[0]!.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 500 });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, shops[0]!.merchant.id));
    expect(m!.activatedAt).not.toBeNull();
    const members = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, shops[2]!.merchant.id));
    expect(members).toHaveLength(1);
  });
});

describe("network perks", () => {
  it("awards the perk once per customer, however many more shops they visit", async () => {
    const hood = await createNeighbourhood(env.db);
    await env.db.insert(networkPerks).values({ neighbourhoodId: hood.id, name: "Strip explorer", threshold: 2, bonusPoints: 50 });
    const shops = await Promise.all([1, 2, 3, 4].map(() => createMerchant(env, { neighbourhoodId: hood.id })));
    const phone = nextPhone();
    const extra: number[] = [];
    for (const s of shops) extra.push((await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone, source: "staff_app", amountCents: 500 })).extraPoints);
    extra.push((await awardPurchase(env.ctx, { merchantId: shops[0]!.merchant.id, phone, source: "staff_app", amountCents: 500 })).extraPoints);
    expect(extra).toEqual([0, 50, 0, 0, 0]);
    expect(await env.db.select().from(networkPerkAwards)).toHaveLength(1);
    expect(await env.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.type, "network_bonus"))).toHaveLength(1);
  });

  it("counts only the visits inside the perk's window", async () => {
    const hood = await createNeighbourhood(env.db);
    await env.db.insert(networkPerks).values({ neighbourhoodId: hood.id, name: "Strip explorer", threshold: 2, bonusPoints: 50, windowDays: 30 });
    const [a, b] = await Promise.all([1, 2].map(() => createMerchant(env, { neighbourhoodId: hood.id })));
    const phone = nextPhone();
    await awardPurchase(env.ctx, { merchantId: a!.merchant.id, phone, source: "staff_app", amountCents: 500 });
    // The first visit is 40 days old: outside the window, so the second shop is only the first visit in it.
    await env.db.update(visits).set({ createdAt: new Date(env.clock.now.getTime() - 40 * 86_400_000) });
    expect((await awardPurchase(env.ctx, { merchantId: b!.merchant.id, phone, source: "staff_app", amountCents: 500 })).extraPoints).toBe(0);
    // A visit 10 days old is inside it.
    await env.db.update(visits).set({ createdAt: new Date(env.clock.now.getTime() - 10 * 86_400_000) });
    expect((await awardPurchase(env.ctx, { merchantId: a!.merchant.id, phone: phone, source: "staff_app", amountCents: 500, ignoreCooldown: true })).extraPoints).toBe(50);
  });
});

describe("network bonus units", () => {
  it("gives stamp shops one bonus stamp instead of raw points", async () => {
    const hood = await createNeighbourhood(env.db);
    await env.db.insert(networkPerks).values({ neighbourhoodId: hood.id, name: "Strip explorer", threshold: 2, bonusPoints: 50 });
    const a = await createMerchant(env, { neighbourhoodId: hood.id });
    const b = await createMerchant(env, { neighbourhoodId: hood.id, earnType: "stamps" });
    const phone = nextPhone();
    await awardPurchase(env.ctx, { merchantId: a.merchant.id, phone, source: "staff_app", amountCents: 500 });
    const r = await awardPurchase(env.ctx, { merchantId: b.merchant.id, phone, source: "staff_app" });
    expect(r.extraPoints).toBe(1);
    expect(r.member.balance).toBe(2);
  });
});
