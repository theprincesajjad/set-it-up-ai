/**
 * wave-n: rules. Stamp rules end to end: the earn unit (visit / purchase / pickup), what earns (selected services, categories,
 * items), reward tiers, permissions, the audit log and change history, the goal-change rule for existing balances, the daily
 * cap, rate limits, idempotent pickup and the promo boost hook.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, catalogItems, ledgerTransactions, locations, loyaltyPrograms, merchantCategories, merchantMembers, orders, outboxEvents, rewards, services } from "@ll/db";
import { awardPurchase } from "../src/services/ledger.js";
import { carryOverStamps, registerEarnBoostProvider, unregisterEarnBoostProvider } from "../src/services/earn-engine.js";
import { awardOrderPoints } from "../src/services/orders.js";
import { shopPassModel } from "../src/services/wallet-shop.js";
import { call, customer, deliver, fake, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createMerchant, createTestEnv, nextPhone, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

let seq = 0;
const key = () => `rules-${Date.now()}-${seq++}`;

/** A stamp card: 10 stamps for a free gel manicure, no cooldown (tests stamp the same person often). */
async function stampShop(opts: { goal?: number; earnUnit?: "visit" | "purchase" | "pickup"; minSpendCents?: number } = {}) {
  const m = await createMerchant(env, { earnType: "stamps" });
  await env.db
    .update(loyaltyPrograms)
    .set({ stampGoal: opts.goal ?? 10, terminology: "stamps", visitCooldownMinutes: 0, earnUnit: opts.earnUnit ?? "visit", minSpendCents: opts.minSpendCents ?? 0 })
    .where(eq(loyaltyPrograms.merchantId, m.merchant.id));
  await env.db.update(rewards).set({ name: "Free gel manicure", pointsCost: opts.goal ?? 10, rewardType: "free_item", value: 0 }).where(eq(rewards.id, m.reward.id));
  const staff = await staffMember(env, m.merchant.id, "staff");
  const manager = await staffMember(env, m.merchant.id, "manager");
  const [loc] = await env.db.insert(locations).values({ merchantId: m.merchant.id, name: "Main", address: "1 Queen St W", qrCode: `QR${key()}` }).returning();
  const base = `/v1/merchants/${m.merchant.id}`;
  return { ...m, staff, manager, location: loc!, base };
}

const balanceOf = async (memberId: string) => (await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, memberId)))[0]!.balance;

/** A member with `n` stamps (posted through the real engine). */
async function memberWith(merchantId: string, n: number) {
  const phone = nextPhone();
  let memberId = "";
  let left = n;
  if (n === 0) {
    const r = await awardPurchase(env.ctx, { merchantId, phone, source: "dashboard", ignoreCooldown: true, idempotencyKey: key(), event: "purchase", quantity: 1 });
    memberId = r.member.id;
    await env.db.update(merchantMembers).set({ balance: 0 }).where(eq(merchantMembers.id, memberId));
    return memberId;
  }
  while (left > 0) {
    const q = Math.min(10, left);
    const r = await awardPurchase(env.ctx, { merchantId, ...(memberId ? { memberId } : { phone }), source: "dashboard", ignoreCooldown: true, idempotencyKey: key(), event: "purchase", quantity: q });
    memberId = r.member.id;
    left -= q;
  }
  return memberId;
}

describe("what one stamp is worth", () => {
  it("one visit: the counter and a self check-in both earn", async () => {
    const s = await stampShop();
    const r = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key() });
    expect(r.status).toBe(200);
    expect(r.body.pointsEarned).toBe(1);
    const k = await call(env, s.staff.token, "POST", `${s.base}/counter/kiosk/check-in`, { phone: nextPhone(), locationId: s.location.id });
    expect(k.body).toMatchObject({ outcome: "visit", pointsEarned: 1 });
  });

  it("one purchase: a counter stamp is the cashier confirming a sale (even with a minimum); POS checks the minimum; a self check-in earns nothing", async () => {
    const s = await stampShop({ earnUnit: "purchase", minSpendCents: 500 });
    const counter = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key() });
    expect(counter.body.pointsEarned).toBe(1);
    const small = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), amountCents: 300, source: "square", ignoreCooldown: true, idempotencyKey: key() });
    expect(small.transaction).toBeNull();
    const big = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), amountCents: 900, source: "square", ignoreCooldown: true, idempotencyKey: key() });
    expect(big.transaction?.points).toBe(1);
    const k = await call(env, s.staff.token, "POST", `${s.base}/counter/kiosk/check-in`, { phone: nextPhone(), locationId: s.location.id });
    expect(k.body).toMatchObject({ outcome: "enrolled", pointsEarned: 0 });
  });

  it("one pickup: only picked-up online orders earn; the counter needs a reason, which is audited", async () => {
    const s = await stampShop({ earnUnit: "pickup" });
    const refused = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key() });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("earn_rule");
    const tooShort = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key(), override: { reason: "x" } });
    expect(tooShort.status).toBe(400);
    const ok = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key(), override: { reason: "Phone order picked up at the till" } });
    expect(ok.status).toBe(200);
    expect(ok.body.pointsEarned).toBe(1);
    expect(ok.body.breakdown).toContain("Staff override: Phone order picked up at the till");
    const [audit] = await env.db.select().from(auditLogs).where(and(eq(auditLogs.merchantId, s.merchant.id), eq(auditLogs.action, "earn.override")));
    expect(audit).toMatchObject({ actorUserId: s.staff.user.id, entityId: ok.body.member.memberId });
    expect(audit!.data).toMatchObject({ reason: "Phone order picked up at the till", rule: "earn_unit", points: 1, transactionId: ok.body.transactionId });
    // A POS sale is not a pickup: nothing, silently.
    const pos = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), amountCents: 900, source: "square", ignoreCooldown: true, idempotencyKey: key() });
    expect(pos.transaction).toBeNull();
    const pickup = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), amountCents: 900, source: "customer_app", ignoreCooldown: true, idempotencyKey: key(), event: "pickup" });
    expect(pickup.transaction?.points).toBe(1);
  });

  it("a picked-up order awards once through the same engine, idempotent per order", async () => {
    const m = await paidMerchant(env, { plan: "studio" });
    await env.db.update(loyaltyPrograms).set({ earnType: "stamps", stampGoal: 10, terminology: "stamps", pointsPerVisit: 1, earnUnit: "pickup", visitCooldownMinutes: 0 }).where(eq(loyaltyPrograms.merchantId, m.merchant.id));
    const latte = (await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/catalog/items`, { name: "Latte", priceCents: 525 })).body;
    const c = await customer(env);
    const placed = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: latte.id, quantity: 2 }], idempotencyKey: "rules-pickup-0001" });
    expect(placed.status).toBe(201);
    await deliver(env, fake(env).succeedPaymentIntent(placed.body.payment.paymentIntentId));
    const base = `/v1/merchants/${m.merchant.id}/orders/${placed.body.order.id}/status`;
    for (const status of ["accepted", "preparing", "ready"]) expect((await call(env, m.ownerToken, "POST", base, { status })).status).toBe(200);
    const done = await call(env, m.ownerToken, "POST", base, { status: "picked_up" });
    expect(done.body).toMatchObject({ status: "picked_up", pointsEarned: 1 });
    const [row] = await env.db.select().from(orders).where(eq(orders.id, placed.body.order.id));
    await awardOrderPoints(env.ctx, row!);
    await awardOrderPoints(env.ctx, row!);
    const earns = await env.db.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.merchantId, m.merchant.id), eq(ledgerTransactions.idempotencyKey, `order:${row!.id}`)));
    expect(earns).toHaveLength(1);
    const [mm] = await env.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, m.merchant.id), eq(merchantMembers.userId, c.user.id)));
    expect(mm!.balance).toBe(1);
  });
});

describe("what earns stamps", () => {
  async function selectedShop() {
    const s = await stampShop();
    const [gel] = await env.db.insert(services).values({ merchantId: s.merchant.id, name: "Gel manicure", priceCents: 4500 }).returning();
    const [brows] = await env.db.insert(services).values({ merchantId: s.merchant.id, name: "Brow tint", priceCents: 2000 }).returning();
    const [nails] = await env.db.insert(merchantCategories).values({ merchantId: s.merchant.id, name: "Nails" }).returning();
    const [polish] = await env.db.insert(catalogItems).values({ merchantId: s.merchant.id, name: "Polish", priceCents: 1200 }).returning();
    return { ...s, gel: gel!, brows: brows!, nails: nails!, polish: polish! };
  }

  it("lists what the shop sells (staff may read it); regulated categories are marked protected", async () => {
    const s = await selectedShop();
    const r = await call(env, s.staff.token, "GET", `${s.base}/program/earn-options`);
    expect(r.status).toBe(200);
    expect(r.body.services.map((x: { name: string }) => x.name).sort()).toEqual(["Brow tint", "Gel manicure"]);
    expect(r.body.items).toEqual([expect.objectContaining({ name: "Polish" })]);
    expect(r.body.categories.find((c: { name: string }) => c.name === "Prescriptions").protected).toBe(true);
  });

  it("validates the list: the shop's own ids, never a regulated category, at least one", async () => {
    const s = await selectedShop();
    const patch = (body: object) => call(env, s.ownerToken, "PATCH", `${s.base}/program`, body);
    expect((await patch({ earnScope: "selected" })).status).toBe(400);
    expect((await patch({ earnScope: "selected", earnCategoryIds: [s.noEarnCategory.id] })).body.error.code).toBe("no_earn_category");
    const other = await createMerchant(env);
    const [foreign] = await env.db.insert(services).values({ merchantId: other.merchant.id, name: "Theirs" }).returning();
    expect((await patch({ earnScope: "selected", earnServiceIds: [foreign!.id] })).status).toBe(400);
    const ok = await patch({ earnScope: "selected", earnServiceIds: [s.gel.id], earnCategoryIds: [s.nails.id], earnItemIds: [s.polish.id] });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ earnScope: "selected", earnServiceIds: [s.gel.id], earnCategoryIds: [s.nails.id], earnItemIds: [s.polish.id] });
  });

  it("only selected services, categories or items earn; the counter asks for a reason otherwise", async () => {
    const s = await selectedShop();
    await call(env, s.ownerToken, "PATCH", `${s.base}/program`, { earnScope: "selected", earnServiceIds: [s.gel.id], earnCategoryIds: [s.nails.id] });
    const inv = (serviceId: string) => awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), lines: [{ amountCents: 4500, serviceId }], source: "dashboard", ignoreCooldown: true, idempotencyKey: key() });
    expect((await inv(s.gel.id)).transaction?.points).toBe(1);
    const brow = await inv(s.brows.id);
    expect(brow.transaction).toBeNull();
    expect(brow.earn.breakdown).toContain("$45.00 excluded (no-earn)");
    const cat = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), lines: [{ amountCents: 900, categoryId: s.nails.id }], source: "square", ignoreCooldown: true, idempotencyKey: key() });
    expect(cat.transaction?.points).toBe(1);
    // Counter: a plain stamp isn't on the list; picking the service works; a reason overrides.
    const plain = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key() });
    expect(plain.status).toBe(422);
    expect(plain.body.error).toMatchObject({ code: "earn_rule", details: { rule: "earn_scope" } });
    const picked = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key(), lines: [{ amountCents: 0, serviceId: s.gel.id }] });
    expect(picked.body.pointsEarned).toBe(1);
    const over = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key(), override: { reason: "Regular, paid in cash for a brow tint" } });
    expect(over.body.pointsEarned).toBe(1);
    const [audit] = await env.db.select().from(auditLogs).where(and(eq(auditLogs.merchantId, s.merchant.id), eq(auditLogs.action, "earn.override")));
    expect(audit!.data).toMatchObject({ rule: "earn_scope" });
    // An override never unlocks a regulated category.
    const rx = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key(), lines: [{ amountCents: 900, categoryId: s.noEarnCategory.id }], override: { reason: "Trying regulated" } });
    expect(rx.status).toBe(200);
    expect(rx.body.pointsEarned).toBe(0);
  });
});

describe("the prize: goal bounds and tiers", () => {
  it("takes any goal from 2 to 50", async () => {
    const s = await stampShop();
    const patch = (stampGoal: number) => call(env, s.ownerToken, "PATCH", `${s.base}/program`, { stampGoal });
    expect((await patch(15)).body.stampGoal).toBe(15);
    expect((await patch(8)).body.stampGoal).toBe(8);
    expect((await patch(50)).body.stampGoal).toBe(50);
    expect((await patch(51)).status).toBe(400);
    expect((await patch(1)).status).toBe(400);
  });

  it("a tier on the way is redeemable at the counter and named on the wallet card, then the card's reward", async () => {
    const s = await stampShop();
    const tier = await call(env, s.ownerToken, "POST", `${s.base}/rewards`, { name: "Free polish change", pointsCost: 5, rewardType: "free_item", value: 0 });
    // The rewards catalogue is a paid feature; grant it like a pilot shop when the plan doesn't have it.
    if (tier.status !== 201) {
      await env.db.insert(rewards).values({ merchantId: s.merchant.id, name: "Free polish change", pointsCost: 5, rewardType: "free_item", value: 0 });
    }
    const id = await memberWith(s.merchant.id, 3);
    const [mm] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, id));
    let card = (await shopPassModel(env.ctx, mm!.userId, s.merchant.id)).model;
    expect(card.nextReward).toMatchObject({ name: "Free polish change", cost: 5, left: 2 });
    const r = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { memberId: id, idempotencyKey: key(), quantity: 3 });
    expect(r.body.rewardsAvailable.map((x: { name: string }) => x.name)).toEqual(["Free polish change"]);
    card = (await shopPassModel(env.ctx, mm!.userId, s.merchant.id)).model;
    expect(card.nextReward).toMatchObject({ name: "Free gel manicure", cost: 10, left: 4 });
    expect(r.body.member.nextReward).toMatchObject({ name: "Free gel manicure", pointsNeeded: 4 });
  });
});

describe("safety", () => {
  it("only owners and managers change rules; staff read them; history and impact are manager+", async () => {
    const s = await stampShop();
    expect((await call(env, s.staff.token, "PATCH", `${s.base}/program`, { stampGoal: 12 })).status).toBe(403);
    expect((await call(env, s.staff.token, "POST", `${s.base}/program/impact`, { stampGoal: 12 })).status).toBe(403);
    expect((await call(env, s.staff.token, "GET", `${s.base}/program/history`)).status).toBe(403);
    expect((await call(env, s.staff.token, "POST", `${s.base}/rewards`, { name: "X", pointsCost: 3, rewardType: "free_item", value: 0 })).status).toBe(403);
    expect((await call(env, s.staff.token, "GET", `${s.base}/program`)).status).toBe(200);
    expect((await call(env, s.manager.token, "PATCH", `${s.base}/program`, { stampGoal: 12 })).status).toBe(200);
    // The owner of another shop can't touch this one.
    const st = await call(env, (await staffMember(env, (await createMerchant(env)).merchant.id, "owner")).token, "PATCH", `${s.base}/program`, { stampGoal: 9 });
    expect([403, 404]).toContain(st.status);
  });

  it("validates with zod and bounds (cooldown, daily cap, unit)", async () => {
    const s = await stampShop();
    const patch = (b: object) => call(env, s.ownerToken, "PATCH", `${s.base}/program`, b);
    expect((await patch({ earnUnit: "teleport" })).status).toBe(400);
    expect((await patch({ maxStampsPerDay: 0 })).status).toBe(400);
    expect((await patch({ maxStampsPerDay: 51 })).status).toBe(400);
    expect((await patch({ visitCooldownMinutes: 5000 })).status).toBe(400);
    expect((await patch({ earnUnit: "pickup", counterAutoStamp: true })).body).toMatchObject({ earnUnit: "pickup", counterAutoStamp: false });
  });

  it("rate-limits rule writes", async () => {
    const s = await stampShop();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await call(env, s.ownerToken, "PATCH", `${s.base}/program`, { welcomeBonus: i % 3 })).status;
    expect(last).toBe(429);
  });

  it("logs every change with who, when, before and after, and shows it as Change history", async () => {
    const s = await stampShop();
    await call(env, s.manager.token, "PATCH", `${s.base}/program`, { stampGoal: 12, maxStampsPerDay: 3 });
    await call(env, s.ownerToken, "PATCH", `${s.base}/rewards/${s.reward.id}`, { name: "Free gel pedicure" });
    const h = await call(env, s.ownerToken, "GET", `${s.base}/program/history`);
    expect(h.status).toBe(200);
    const [reward, rules] = h.body.items;
    expect(reward).toMatchObject({ action: "reward.updated", actor: { userId: s.owner.id } });
    expect(reward.changes).toEqual([{ field: "Reward name", before: "Free gel manicure", after: "Free gel pedicure" }]);
    expect(rules).toMatchObject({ action: "program.updated", actor: { userId: s.manager.user.id } });
    expect(rules.changes).toEqual(expect.arrayContaining([{ field: "Stamps for the reward", before: 10, after: 12 }, { field: "Most stamps per day", before: null, after: 3 }]));
    expect(rules.note).toMatch(/No customer had stamps|carry-over/);
    const [row] = await env.db.select().from(auditLogs).where(and(eq(auditLogs.merchantId, s.merchant.id), eq(auditLogs.action, "program.updated")));
    expect(row!.data).toMatchObject({ before: { stampGoal: 10, maxStampsPerDay: null }, after: { stampGoal: 12, maxStampsPerDay: 3 } });
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it("caps stamps per customer per day: the counter is told, automatic sources are clipped", async () => {
    const s = await stampShop();
    await call(env, s.ownerToken, "PATCH", `${s.base}/program`, { maxStampsPerDay: 2 });
    const phone = nextPhone();
    const a = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone, idempotencyKey: key(), quantity: 3 });
    expect(a.body.pointsEarned).toBe(2);
    expect(a.body.breakdown).toContain("Daily limit 2");
    const b = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone, idempotencyKey: key() });
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe("daily_limit");
    const pos = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone, amountCents: 900, source: "square", ignoreCooldown: true, idempotencyKey: key() });
    expect(pos.transaction).toBeNull();
    // Tomorrow (shop time) they earn again.
    env.clock.now = new Date(env.clock.now.getTime() + 24 * 3600_000);
    expect((await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone, source: "dashboard", ignoreCooldown: true, idempotencyKey: key() })).transaction?.points).toBe(1);
  });
});

describe("changing the goal never takes anything away", () => {
  it("carry-over math: full cards stay full, a card in progress keeps its distance", () => {
    expect(carryOverStamps(3, 10, 15)).toBe(5);
    expect(carryOverStamps(10, 10, 15)).toBe(5);
    expect(carryOverStamps(13, 10, 15)).toBe(10);
    expect(carryOverStamps(20, 10, 15)).toBe(10);
    expect(carryOverStamps(0, 10, 15)).toBe(0);
    expect(carryOverStamps(7, 10, 6)).toBe(0);
  });

  it("a raised goal: the confirm sheet counts customers, then carry-over stamps are posted, the reward moves, cards update", async () => {
    const s = await stampShop();
    const ids = [await memberWith(s.merchant.id, 3), await memberWith(s.merchant.id, 10), await memberWith(s.merchant.id, 13), await memberWith(s.merchant.id, 0)];
    const imp = await call(env, s.ownerToken, "POST", `${s.base}/program/impact`, { stampGoal: 15 });
    expect(imp.status).toBe(200);
    expect(imp.body).toMatchObject({ goal: { from: 10, to: 15 }, membersWithProgress: 3, membersCarriedOver: 3, stampsCarriedOver: 20, rewardsUnlocked: 0 });
    expect(imp.body.lines.join(" ")).toMatch(/Nobody loses stamps/);
    // The preview changes nothing.
    expect(await balanceOf(ids[0]!)).toBe(3);
    const before = (await env.db.select().from(outboxEvents)).length;
    const r = await call(env, s.ownerToken, "PATCH", `${s.base}/program`, { stampGoal: 15 });
    expect(r.status).toBe(200);
    expect(await Promise.all(ids.map(balanceOf))).toEqual([8, 15, 23, 0]);
    const [rw] = await env.db.select().from(rewards).where(eq(rewards.id, s.reward.id));
    expect(rw!.pointsCost).toBe(15);
    const adj = await env.db.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.merchantId, s.merchant.id), eq(ledgerTransactions.type, "adjust")));
    expect(adj).toHaveLength(3);
    expect(adj[0]!.description).toMatch(/from 10 to 15 stamps/);
    // Each carry-over is a balance change in the outbox: the wallet listeners update those customers' cards.
    expect((await env.db.select().from(outboxEvents)).length - before).toBeGreaterThanOrEqual(3);
    // Lifetime points (VIP) are not inflated by a carry-over.
    const [m10] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, ids[1]!));
    expect(m10!.lifetimePoints).toBe(10);
    const h = await call(env, s.ownerToken, "GET", `${s.base}/program/history`);
    expect(h.body.items[0].note).toBe("3 customers got 20 carry-over stamps.");
  });

  it("a lowered goal keeps every stamp and unlocks rewards right away", async () => {
    const s = await stampShop();
    const ids = [await memberWith(s.merchant.id, 7), await memberWith(s.merchant.id, 3)];
    const imp = await call(env, s.ownerToken, "POST", `${s.base}/program/impact`, { stampGoal: 6 });
    expect(imp.body).toMatchObject({ goal: { from: 10, to: 6 }, rewardsUnlocked: 1, membersCarriedOver: 0 });
    await call(env, s.ownerToken, "PATCH", `${s.base}/program`, { stampGoal: 6 });
    expect(await Promise.all(ids.map(balanceOf))).toEqual([7, 3]);
    const look = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { memberId: ids[0], idempotencyKey: key() });
    expect(look.body.rewardsAvailable).toEqual([expect.objectContaining({ name: "Free gel manicure", pointsCost: 6 })]);
  });
});

describe("promo hook (for the promo team)", () => {
  it("a registered boost provider doubles stamps and hears when it applied", async () => {
    const s = await stampShop();
    const applied: string[] = [];
    registerEarnBoostProvider("test:double", async (_tx, c) => (c.merchant.id === s.merchant.id ? [{ promoId: null, multiplier: 2, onApplied: async (_t, a) => void applied.push(a.transactionId) }] : []));
    try {
      const r = await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key() });
      expect(r.body.pointsEarned).toBe(2);
      expect(applied).toEqual([r.body.transactionId]);
      // The daily cap still wins over a promo.
      await env.db.update(loyaltyPrograms).set({ maxStampsPerDay: 1 }).where(eq(loyaltyPrograms.merchantId, s.merchant.id));
      expect((await call(env, s.staff.token, "POST", `${s.base}/counter/award`, { phone: nextPhone(), idempotencyKey: key() })).body.pointsEarned).toBe(1);
    } finally {
      unregisterEarnBoostProvider("test:double");
    }
  });
});
