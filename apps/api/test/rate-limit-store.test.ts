/**
 * lib/rate-limit.ts: the default in-memory counters are per process; RATE_LIMIT_STORE=postgres shares them through
 * rate_limit_counters, so two API instances (two app contexts on one database here) enforce one limit.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rateLimitCounters } from "@ll/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { AppContext } from "../src/context.js";
import { allow, countHits, postgresBlanketStore, recordHit, sweepRateLimits } from "../src/lib/rate-limit.js";
import { createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

/** A second API instance on the same database: its own context (and so its own in-memory counters). */
const instance = (store: "memory" | "postgres"): AppContext => ({ ...env.ctx, config: { ...env.ctx.config, rateLimit: { store } } });

describe("config", () => {
  it("defaults to memory; RATE_LIMIT_STORE=postgres switches it on", () => {
    expect(loadConfig({ NODE_ENV: "test" }).rateLimit.store).toBe("memory");
    expect(loadConfig({ NODE_ENV: "test", RATE_LIMIT_STORE: "postgres" }).rateLimit.store).toBe("postgres");
    expect(loadConfig({ NODE_ENV: "test", RATE_LIMIT_STORE: "redis" }).rateLimit.store).toBe("memory");
  });
});

describe("memory store (default)", () => {
  it("is per process: a second instance has its own counters", async () => {
    const a = instance("memory");
    const b = instance("memory");
    for (let i = 0; i < 3; i++) expect(await allow(a, "k", 3, 60_000)).toBe(true);
    expect(await allow(a, "k", 3, 60_000)).toBe(false);
    // The other instance has not seen those hits, so the caller gets a fresh allowance there.
    expect(await allow(b, "k", 3, 60_000)).toBe(true);
    expect(await env.db.select().from(rateLimitCounters)).toHaveLength(0);
  });

  it("slides: hits older than the window stop counting", async () => {
    for (let i = 0; i < 3; i++) await recordHit(env.ctx, "k", 60_000);
    expect(await countHits(env.ctx, "k", 60_000)).toBe(3);
    env.clock.now = new Date(env.clock.now.getTime() + 61_000);
    expect(await countHits(env.ctx, "k", 60_000)).toBe(0);
  });
});

describe("postgres store", () => {
  it("is shared: two instances enforce one limit", async () => {
    const a = instance("postgres");
    const b = instance("postgres");
    expect(await allow(a, "k", 3, 60_000)).toBe(true);
    expect(await allow(b, "k", 3, 60_000)).toBe(true);
    expect(await allow(a, "k", 3, 60_000)).toBe(true);
    expect(await allow(b, "k", 3, 60_000)).toBe(false);
    expect(await allow(a, "k", 3, 60_000)).toBe(false);
    expect(await countHits(b, "k", 60_000)).toBeGreaterThanOrEqual(3);
    // Other keys are independent.
    expect(await allow(a, "other", 3, 60_000)).toBe(true);
  });

  it("counts concurrent hits atomically", async () => {
    const a = instance("postgres");
    const results = await Promise.all(Array.from({ length: 10 }, () => allow(a, "burst", 4, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(4);
  });

  it("starts a new window when the old one ends, and the sweep drops expired rows", async () => {
    const a = instance("postgres");
    for (let i = 0; i < 3; i++) await recordHit(a, "k", 60_000);
    await recordHit(a, "later", 3_600_000);
    expect(await countHits(a, "k", 60_000)).toBe(3);
    env.clock.now = new Date(env.clock.now.getTime() + 61_000);
    expect(await countHits(a, "k", 60_000)).toBe(0);
    expect(await allow(a, "k", 3, 60_000)).toBe(true);
    expect((await env.db.select().from(rateLimitCounters).where(eq(rateLimitCounters.key, "k")))[0]!.hits).toBe(1);
    env.clock.now = new Date(env.clock.now.getTime() + 61_000);
    expect(await sweepRateLimits(a)).toBe(1);
    expect((await env.db.select().from(rateLimitCounters)).map((r) => r.key)).toEqual(["later"]);
    // The sweep does nothing with the memory store.
    expect(await sweepRateLimits(instance("memory"))).toBe(0);
  });

  it("backs the enumeration guard across instances", async () => {
    const a = instance("postgres");
    const b = instance("postgres");
    const appA = await buildApp(a);
    const appB = await buildApp(b);
    const miss = (app: typeof appA, n: number) => app.inject({ method: "GET", url: `/v1/public/tickets/${"z".repeat(20)}${n}`, headers: { "x-forwarded-for": "198.51.100.7" } });
    // 40 misses are allowed in total, however they are spread; the 41st is refused on either instance.
    for (let i = 0; i < 40; i++) expect((await miss(i % 2 ? appA : appB, i)).statusCode).toBe(404);
    // The hit is counted in an onResponse hook, after the reply has gone out: with a database over a socket it lands a moment later.
    for (let i = 0; i < 100 && (await countHits(a, "miss:198.51.100.7", 600_000)) < 40; i++) await new Promise((r) => setTimeout(r, 20));
    expect((await miss(appA, 99)).statusCode).toBe(429);
    expect((await miss(appB, 100)).statusCode).toBe(429);
    await appA.close();
    await appB.close();
  });

  it("backs the blanket @fastify/rate-limit store across instances (fixed window, ttl counts down)", async () => {
    const incr = (store: InstanceType<ReturnType<typeof postgresBlanketStore>>, key: string) =>
      new Promise<{ current: number; ttl: number }>((resolve, reject) => store.incr(key, (err, res) => (err ? reject(err) : resolve(res!)), 60_000));
    const a = new (postgresBlanketStore(instance("postgres")))();
    const b = new (postgresBlanketStore(instance("postgres")))().child();
    expect((await incr(a, "user:1")).current).toBe(1);
    expect((await incr(b, "user:1")).current).toBe(2);
    env.clock.now = new Date(env.clock.now.getTime() + 20_000);
    const third = await incr(a, "user:1");
    expect(third.current).toBe(3);
    expect(third.ttl).toBe(40_000);
    expect((await incr(a, "ip:9")).current).toBe(1);
    env.clock.now = new Date(env.clock.now.getTime() + 41_000);
    expect((await incr(b, "user:1")).current).toBe(1);
  });

  it("registers the blanket limiter on that store when the app runs outside tests", async () => {
    const live = { ...instance("postgres"), config: { ...env.ctx.config, env: "development" as const, rateLimit: { store: "postgres" as const } } };
    const app = await buildApp(live);
    for (let i = 0; i < 3; i++) expect((await app.inject({ method: "GET", url: "/health", remoteAddress: "198.51.100.20" })).statusCode).toBe(200);
    const rows = await env.db.select().from(rateLimitCounters);
    expect(rows.filter((r) => r.key.startsWith("global:ip:"))).toEqual([expect.objectContaining({ hits: 3 })]);
    await app.close();
  });
});
