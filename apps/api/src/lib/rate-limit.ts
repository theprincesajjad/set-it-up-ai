import type { AppContext } from "../context.js";

/**
 * In-memory sliding-window counters, one store per app context (so tests with fake clocks stay isolated).
 * Stale keys are swept so a scanner rotating tokens or addresses cannot grow the map without bound.
 * This is per process; the global @fastify/rate-limit hook remains the blanket cap in production.
 */
const stores = new WeakMap<AppContext, Map<string, number[]>>();
const MAX_KEYS = 5000;

function store(ctx: AppContext) {
  let m = stores.get(ctx);
  if (!m) stores.set(ctx, (m = new Map()));
  return m;
}

/** Number of events for `key` in the last `windowMs`. */
export function countHits(ctx: AppContext, key: string, windowMs: number): number {
  const now = ctx.now().getTime();
  return (store(ctx).get(key) ?? []).filter((t) => now - t < windowMs).length;
}

/** Record one event for `key`. */
export function recordHit(ctx: AppContext, key: string, windowMs: number): void {
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
export function allow(ctx: AppContext, key: string, max: number, windowMs: number): boolean {
  if (countHits(ctx, key, windowMs) >= max) return false;
  recordHit(ctx, key, windowMs);
  return true;
}
