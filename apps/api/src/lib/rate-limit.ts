import { gt, lte, sql } from "drizzle-orm";
import { rateLimitCounters } from "@ll/db";
import type { AppContext } from "../context.js";
import { rowsOf } from "./sql.js";

/**
 * Per-key rate-limit counters used by the public-link guards (enumeration misses, driver links, split pay) and, in
 * production, the blanket @fastify/rate-limit cap. Two stores, picked by `config.rateLimit.store`
 * (RATE_LIMIT_STORE):
 *
 *  - `memory` (default): sliding-window counters in this process, one map per app context (so tests with fake clocks
 *    stay isolated), swept so a scanner rotating tokens or addresses cannot grow the map without bound.
 *    THE COUNTERS ARE PER PROCESS: with N API instances the effective limit is up to N times the configured one
 *    (the load balancer spreads a caller across instances). Fine for one instance, a development machine or tests.
 *  - `postgres`: one fixed window per key in `rate_limit_counters`, shared by every instance. The window starts at the
 *    key's first hit and the whole limit resets when it ends (so a burst can straddle two windows, like the blanket
 *    limiter). Expired rows are deleted by the `ratelimit.sweep` job. Costs one indexed upsert per check; the
 *    blanket limiter uses it too, which adds one upsert to every request, so enable it only when you run more than
 *    one instance.
 */
const stores = new WeakMap<AppContext, Map<string, number[]>>();
const MAX_KEYS = 5000;

function store(ctx: AppContext) {
  let m = stores.get(ctx);
  if (!m) stores.set(ctx, (m = new Map()));
  return m;
}

const shared = (ctx: AppContext) => ctx.config.rateLimit.store === "postgres";

/** Number of events for `key` in the last `windowMs` (postgres: in the current window). */
export async function countHits(ctx: AppContext, key: string, windowMs: number): Promise<number> {
  if (shared(ctx)) {
    const [r] = await ctx.db
      .select({ hits: rateLimitCounters.hits })
      .from(rateLimitCounters)
      .where(sql`${rateLimitCounters.key} = ${key} and ${gt(rateLimitCounters.expiresAt, ctx.now())}`)
      .limit(1);
    return r?.hits ?? 0;
  }
  const now = ctx.now().getTime();
  return (store(ctx).get(key) ?? []).filter((t) => now - t < windowMs).length;
}

/** Atomically count one hit in the shared table and return the window's total. */
async function sharedHit(ctx: AppContext, key: string, windowMs: number): Promise<{ hits: number; expiresAt: Date }> {
  const now = ctx.now();
  const expires = new Date(now.getTime() + windowMs);
  const res = await ctx.db.execute(sql`
    INSERT INTO rate_limit_counters (key, hits, expires_at) VALUES (${key}, 1, ${expires.toISOString()})
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN rate_limit_counters.expires_at <= ${now.toISOString()} THEN 1 ELSE rate_limit_counters.hits + 1 END,
      expires_at = CASE WHEN rate_limit_counters.expires_at <= ${now.toISOString()} THEN ${expires.toISOString()} ELSE rate_limit_counters.expires_at END
    RETURNING hits, expires_at`);
  const row = rowsOf<{ hits: number; expires_at: string | Date }>(res)[0]!;
  return { hits: Number(row.hits), expiresAt: new Date(row.expires_at) };
}

/** Record one event for `key`. */
export async function recordHit(ctx: AppContext, key: string, windowMs: number): Promise<void> {
  if (shared(ctx)) {
    await sharedHit(ctx, key, windowMs);
    return;
  }
  const m = store(ctx);
  const now = ctx.now().getTime();
  const recent = (m.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  m.set(key, recent);
  if (m.size > MAX_KEYS) {
    for (const [k, v] of m) if (!v.some((t) => now - t < windowMs)) m.delete(k);
    // Still too big (everything is recent): drop the oldest keys.
    if (m.size > MAX_KEYS) for (const k of [...m.keys()].slice(0, m.size - MAX_KEYS)) m.delete(k);
  }
}

/** Record a hit and report whether it is within `max` per `windowMs`. */
export async function allow(ctx: AppContext, key: string, max: number, windowMs: number): Promise<boolean> {
  if (shared(ctx)) return (await sharedHit(ctx, key, windowMs)).hits <= max;
  if ((await countHits(ctx, key, windowMs)) >= max) return false;
  await recordHit(ctx, key, windowMs);
  return true;
}

/** Delete expired windows from the shared table (job `ratelimit.sweep`). A no-op with the memory store. */
export async function sweepRateLimits(ctx: AppContext): Promise<number> {
  if (!shared(ctx)) return 0;
  const gone = await ctx.db.delete(rateLimitCounters).where(lte(rateLimitCounters.expiresAt, ctx.now())).returning({ key: rateLimitCounters.key });
  return gone.length;
}

/**
 * Store for @fastify/rate-limit (`store` option) backed by the shared table, so the blanket per-user / per-address cap
 * is also one limit across instances. Same fixed-window rule as above.
 */
export function postgresBlanketStore(ctx: AppContext) {
  return class PostgresRateLimitStore {
    incr(key: string, cb: (err: Error | null, res?: { current: number; ttl: number }) => void, timeWindow = 60_000) {
      sharedHit(ctx, `global:${key}`, timeWindow)
        .then((r) => cb(null, { current: r.hits, ttl: Math.max(1, r.expiresAt.getTime() - ctx.now().getTime()) }))
        .catch((err: Error) => cb(err));
    }
    child() {
      return new PostgresRateLimitStore();
    }
  };
}
