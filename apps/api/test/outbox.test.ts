/**
 * The after-commit outbox (services/outbox.ts): written in the ledger transaction, delivered once, in order per member,
 * retried with backoff, recoverable after a crash, safe with several workers.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantMembers, notifications, outboxEvents, pushTokens } from "@ll/db";
import { awardPurchase, adjustPoints, redeemReward, reverseTransaction } from "../src/services/ledger.js";
import { MAX_ATTEMPTS, STALE_LOCK_MS, cleanupOutbox, drainOutbox, enqueueOutbox, kickOutbox, outboxBacklog, registerOutboxHandler, retryDelayMs } from "../src/services/outbox.js";
import { createMerchant, createTestEnv, createUser, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const MIN = 60_000;
const rows = () => env.db.select().from(outboxEvents).orderBy(outboxEvents.seq);
/** Production behaviour: the request does not deliver; nothing runs until a drain. */
const async = () => (env.ctx.config.outbox = { inline: false, fastPath: false });

const log: string[] = [];
let failures = new Map<string, number>();
registerOutboxHandler("test.steps", async (_ctx, ev, steps) => {
  const p = ev.payload as { name: string; failStepB?: number };
  await steps.run("a", async () => void log.push(`${p.name}:a`));
  await steps.run("b", async () => {
    const left = failures.get(p.name) ?? 0;
    if (left > 0) {
      failures.set(p.name, left - 1);
      throw new Error(`${p.name} b failed`);
    }
    log.push(`${p.name}:b`);
  });
});
beforeEach(() => {
  log.length = 0;
  failures = new Map();
});

const enqueue = (name: string, orderKey = "m1", dedupeKey = `t:${name}`) => enqueueOutbox(env.ctx, env.db, { kind: "test.steps", orderKey, dedupeKey, payload: { name } });

describe("enqueue", () => {
  it("is idempotent on the dedupe key", async () => {
    expect(await enqueue("x")).toBe(true);
    expect(await enqueue("x")).toBe(false);
    expect(await rows()).toHaveLength(1);
  });
});

describe("delivery", () => {
  it("delivers once and marks the event done", async () => {
    await enqueue("x");
    expect(await drainOutbox(env.ctx)).toEqual({ done: 1, retried: 0, dead: 0 });
    expect(log).toEqual(["x:a", "x:b"]);
    expect((await drainOutbox(env.ctx)).done).toBe(0);
    expect(log).toHaveLength(2);
    const [r] = await rows();
    expect(r).toMatchObject({ status: "done", attempts: 1, stepsDone: ["a", "b"], lastError: null });
  });

  it("retries with backoff, and a step that already ran is not run again", async () => {
    await enqueue("x");
    failures.set("x", 2);
    expect(await drainOutbox(env.ctx)).toEqual({ done: 0, retried: 1, dead: 0 });
    expect(log).toEqual(["x:a"]);
    let [r] = await rows();
    expect(r).toMatchObject({ status: "pending", attempts: 1, stepsDone: ["a"], lastError: "x b failed" });
    expect(r!.nextAttemptAt.getTime()).toBe(env.clock.now.getTime() + retryDelayMs(1));
    // Not due yet: nothing is claimed.
    expect((await drainOutbox(env.ctx)).retried).toBe(0);
    env.clock.now = new Date(env.clock.now.getTime() + retryDelayMs(1));
    expect(await drainOutbox(env.ctx)).toEqual({ done: 0, retried: 1, dead: 0 });
    env.clock.now = new Date(env.clock.now.getTime() + retryDelayMs(2));
    expect(await drainOutbox(env.ctx)).toEqual({ done: 1, retried: 0, dead: 0 });
    // Step a ran exactly once across three attempts.
    expect(log).toEqual(["x:a", "x:b"]);
    [r] = await rows();
    expect(r).toMatchObject({ status: "done", attempts: 3, stepsDone: ["a", "b"] });
  });

  it("gives up after the maximum attempts, and a dead event does not block the member's next one", async () => {
    await enqueue("bad", "m1");
    await enqueue("next", "m1");
    failures.set("bad", 99);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await drainOutbox(env.ctx);
      env.clock.now = new Date(env.clock.now.getTime() + 20 * MIN);
    }
    const [bad, next] = await rows();
    expect(bad).toMatchObject({ status: "dead", attempts: MAX_ATTEMPTS });
    expect(next!.status).toBe("done");
    expect(log).toContain("next:b");
    expect(await outboxBacklog(env.ctx)).toBe(0);
  });

  it("delivers one member's events in order: a failing event holds back that member's later ones, not other members'", async () => {
    await enqueue("first", "m1");
    await enqueue("second", "m1");
    await enqueue("other", "m2");
    failures.set("first", 1);
    const r = await drainOutbox(env.ctx);
    expect(r).toEqual({ done: 1, retried: 1, dead: 0 });
    expect(log).toEqual(expect.arrayContaining(["first:a", "other:a", "other:b"]));
    expect(log).not.toContain("second:a");
    env.clock.now = new Date(env.clock.now.getTime() + retryDelayMs(1));
    expect((await drainOutbox(env.ctx)).done).toBe(2);
    expect(log.filter((l) => l.endsWith(":b")).filter((l) => !l.startsWith("other"))).toEqual(["first:b", "second:b"]);
  });

  it("takes a claim back from a worker that died, but not before the lock goes stale", async () => {
    await enqueue("x");
    // A worker claimed it and crashed: processing, locked, attempt used.
    await env.db.update(outboxEvents).set({ status: "processing", lockedAt: env.clock.now, attempts: 1 });
    expect((await drainOutbox(env.ctx)).done).toBe(0);
    env.clock.now = new Date(env.clock.now.getTime() + STALE_LOCK_MS + 1000);
    expect(await drainOutbox(env.ctx)).toEqual({ done: 1, retried: 0, dead: 0 });
    expect(log).toEqual(["x:a", "x:b"]);
  });

  it("two workers draining at once deliver each event exactly once", async () => {
    for (let i = 0; i < 12; i++) await enqueue(`e${i}`, `m${i % 4}`);
    const [a, b] = await Promise.all([drainOutbox(env.ctx, { limit: 3 }), drainOutbox(env.ctx, { limit: 3 })]);
    expect(a.done + b.done).toBe(12);
    expect(log.filter((l) => l.endsWith(":b"))).toHaveLength(12);
    expect(new Set(log).size).toBe(log.length);
  });

  it("cleanup removes delivered events after three days and dead ones after a month", async () => {
    await enqueue("x");
    await drainOutbox(env.ctx);
    await enqueue("dead");
    await env.db.update(outboxEvents).set({ status: "dead", processedAt: env.clock.now }).where(eq(outboxEvents.dedupeKey, "t:dead"));
    expect(await cleanupOutbox(env.ctx)).toBe(0);
    env.clock.now = new Date(env.clock.now.getTime() + 4 * 86_400_000);
    expect(await cleanupOutbox(env.ctx)).toBe(1);
    env.clock.now = new Date(env.clock.now.getTime() + 27 * 86_400_000);
    expect(await cleanupOutbox(env.ctx)).toBe(1);
    expect(await rows()).toHaveLength(0);
  });
});

describe("fast path", () => {
  it("delivers right after the commit without the request waiting, and the drain job is only the backstop", async () => {
    env.ctx.config.outbox = { inline: false, fastPath: true };
    await enqueue("x");
    await kickOutbox(env.ctx);
    // Returned before delivery (it runs on the next tick) ...
    expect(log).toEqual([]);
    // ... and lands within moments.
    const t0 = Date.now();
    while ((await outboxBacklog(env.ctx)) > 0 && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
    expect(log).toEqual(["x:a", "x:b"]);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("is off with OUTBOX_FAST_PATH=0: the event waits for the drain job", async () => {
    async();
    await enqueue("x");
    await kickOutbox(env.ctx);
    await new Promise((r) => setTimeout(r, 50));
    expect(log).toEqual([]);
    expect(await outboxBacklog(env.ctx)).toBe(1);
  });
});

describe("ledger events", () => {
  async function shop() {
    const m = await createMerchant(env);
    const customer = await createUser(env.db, { name: "Pat" });
    await env.db.insert(pushTokens).values({ userId: customer.id, token: "ExponentPushToken[outbox]", platform: "ios" });
    return { ...m, customer };
  }
  const inbox = (userId: string) => env.db.select().from(notifications).where(eq(notifications.userId, userId));

  it("an award writes its event in the ledger transaction; nothing is notified until the outbox runs", async () => {
    async();
    const s = await shop();
    const r = await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: s.customer.id, source: "staff_app", amountCents: 1500 });
    expect(r.transaction!.points).toBeGreaterThan(0);
    const [ev] = await rows();
    expect(ev).toMatchObject({ kind: "balance_change", status: "pending", orderKey: r.member.id, merchantId: s.merchant.id, dedupeKey: `balance:award:${r.transaction!.id}` });
    expect(ev!.payload).toMatchObject({ kind: "award", delta: r.transaction!.points, balance: r.member.balance, userId: s.customer.id });
    expect(await inbox(s.customer.id)).toHaveLength(0);
    expect(env.ctx.providers.outbox.push).toHaveLength(0);
    // Delivered later: the notification and the push arrive exactly once.
    await drainOutbox(env.ctx);
    expect((await inbox(s.customer.id)).map((n) => n.type)).toEqual(["points_earned"]);
    expect(env.ctx.providers.outbox.push).toHaveLength(1);
    await drainOutbox(env.ctx);
    expect(env.ctx.providers.outbox.push).toHaveLength(1);
  });

  it("a stamp that is refused or repeated leaves no event behind", async () => {
    async();
    const s = await shop();
    const key = "idem-1";
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: s.customer.id, source: "staff_app", amountCents: 1500, idempotencyKey: key });
    const again = await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: s.customer.id, source: "staff_app", amountCents: 1500, idempotencyKey: key });
    expect(again.duplicate).toBe(true);
    expect(await rows()).toHaveLength(1);
    // An unknown member: the transaction rolls back, and so would its event.
    await expect(awardPurchase(env.ctx, { merchantId: s.merchant.id, memberId: "00000000-0000-4000-8000-000000000000", source: "staff_app", amountCents: 100 })).rejects.toThrow();
    expect(await rows()).toHaveLength(1);
  });

  it("redeem, adjust and reversal publish too, in the member's order", async () => {
    async();
    const s = await shop();
    const a = await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: s.customer.id, source: "staff_app", amountCents: 6000 });
    await redeemReward(env.ctx, { merchantId: s.merchant.id, memberId: a.member.id, rewardId: s.reward.id, source: "staff_app" });
    await adjustPoints(env.ctx, { merchantId: s.merchant.id, memberId: a.member.id, points: 5, reason: "goodwill", staffUserId: s.owner.id });
    await reverseTransaction(env.ctx, { merchantId: s.merchant.id, transactionId: a.transaction!.id, reason: "mistake", staffUserId: s.owner.id });
    const evs = await rows();
    expect(evs.map((e) => (e.payload as { kind: string }).kind)).toEqual(["award", "redeem", "adjust", "reversal"]);
    expect(new Set(evs.map((e) => e.orderKey))).toEqual(new Set([a.member.id]));
    expect((await drainOutbox(env.ctx)).done).toBe(4);
    const types = (await inbox(s.customer.id)).map((n) => n.type);
    expect(types).toContain("redeem_confirmed");
    const [m] = await env.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, a.member.id)));
    expect(m!.balance).toBe(60 - 50 + 5 - 60);
  });

  it("onboarding milestones and activation still follow a stamp", async () => {
    async();
    env.ctx.config.activationThreshold = 1;
    const s = await shop();
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: s.customer.id, source: "staff_app", amountCents: 1500 });
    const before = await env.db.query.merchants.findFirst({ where: (m, { eq: e }) => e(m.id, s.merchant.id) });
    expect(before!.activatedAt).toBeNull();
    await drainOutbox(env.ctx);
    const after = await env.db.query.merchants.findFirst({ where: (m, { eq: e }) => e(m.id, s.merchant.id) });
    expect(after!.activatedAt).not.toBeNull();
  });
});
