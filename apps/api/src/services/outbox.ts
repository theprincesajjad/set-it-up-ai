/**
 * After-commit outbox.
 *
 * Anything that must happen because a transaction committed, but must not slow the request down or be lost if the
 * process dies right after the commit (customer notifications, wallet pass pushes, passport progress messages), is
 * written to `outbox_events` INSIDE the same transaction (`enqueueOutbox`) and delivered afterwards:
 *
 *   - fast path: `kickOutbox` runs right after the commit (next tick, in the background; awaited in tests and when
 *     OUTBOX_INLINE=1), so delivery normally lands within a second;
 *   - durable path: the `outbox.drain` job (jobs/outbox.ts) re-claims anything still pending or stuck, with backoff.
 *
 * Guarantees: at-least-once delivery with per-step idempotence (a handler splits its work into named steps and a
 * step that completed is never run again on a retry); one event per `order_key` (the member) at a time, oldest
 * first (a failing event holds back that member's later events until it succeeds or is declared dead after
 * MAX_ATTEMPTS); `dedupe_key` makes enqueueing idempotent. Claiming is a single `UPDATE ... RETURNING` so several API
 * instances can drain the same table without double-delivering.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { outboxEvents, type DbOrTx } from "@ll/db";
import type { AppContext } from "../context.js";
import { rowsOf } from "../lib/sql.js";

export type OutboxEvent = typeof outboxEvents.$inferSelect;

export const MAX_ATTEMPTS = 8;
/** A claim older than this is assumed to belong to a crashed worker and can be taken again. */
export const STALE_LOCK_MS = 2 * 60_000;
/** Events claimed per round, and how many are delivered at once. Small on purpose: delivery runs beside the counter's requests and must never take the whole connection pool. */
const BATCH = 12;
const CONCURRENCY = 3;
const KEEP_DONE_MS = 3 * 24 * 3_600_000;
const KEEP_DEAD_MS = 30 * 24 * 3_600_000;

export const retryDelayMs = (attempts: number) => Math.min(15 * 60_000, 10_000 * 2 ** Math.max(0, attempts - 1));

export interface OutboxSteps {
  /** Run `fn` once per event: skipped when this step already completed on an earlier attempt. A throw fails the event (it is retried). */
  run(name: string, fn: () => Promise<unknown>): Promise<void>;
}
export type OutboxHandler = (ctx: AppContext, event: OutboxEvent, steps: OutboxSteps) => Promise<void>;
const handlers = new Map<string, OutboxHandler>();

export function registerOutboxHandler(kind: string, handler: OutboxHandler) {
  handlers.set(kind, handler);
}

export interface EnqueueArgs {
  kind: string;
  /** Delivery order is per key (the member id for balance changes). */
  orderKey: string;
  /** Enqueueing the same key twice is a no-op. */
  dedupeKey: string;
  merchantId?: string | null;
  payload: Record<string, unknown>;
}

/** Write the event in the caller's transaction. Returns false when the dedupe key already exists. */
export async function enqueueOutbox(ctx: AppContext, db: DbOrTx, args: EnqueueArgs): Promise<boolean> {
  const now = ctx.now();
  const rows = await db
    .insert(outboxEvents)
    .values({ kind: args.kind, orderKey: args.orderKey, dedupeKey: args.dedupeKey, merchantId: args.merchantId ?? null, payload: args.payload, nextAttemptAt: now, createdAt: now })
    .onConflictDoNothing()
    .returning({ id: outboxEvents.id });
  return rows.length > 0;
}

/** Claim up to `limit` events: the oldest unfinished event of each order key, when it is due (or its claim went stale). */
async function claim(ctx: AppContext, limit: number): Promise<OutboxEvent[]> {
  const now = ctx.now();
  const stale = new Date(now.getTime() - STALE_LOCK_MS);
  const res = await ctx.db.execute(sql`
    UPDATE outbox_events SET status = 'processing', locked_at = ${now.toISOString()}, attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM (
        SELECT DISTINCT ON (order_key) id, status, next_attempt_at, locked_at
        FROM outbox_events
        WHERE status IN ('pending', 'processing')
        ORDER BY order_key, seq
      ) head
      WHERE (head.status = 'pending' AND head.next_attempt_at <= ${now.toISOString()})
         OR (head.status = 'processing' AND head.locked_at < ${stale.toISOString()})
      LIMIT ${limit}
    )
    AND (status = 'pending' OR locked_at < ${stale.toISOString()})
    RETURNING id
  `);
  const ids = rowsOf<{ id: string }>(res).map((r) => r.id);
  if (!ids.length) return [];
  return ctx.db.select().from(outboxEvents).where(inArray(outboxEvents.id, ids)).orderBy(outboxEvents.seq);
}

async function process(ctx: AppContext, ev: OutboxEvent): Promise<"done" | "retry" | "dead"> {
  const handler = handlers.get(ev.kind);
  const done = new Set(ev.stepsDone);
  let firstError: unknown = null;
  const steps: OutboxSteps = {
    async run(name, fn) {
      if (done.has(name)) return;
      try {
        await fn();
        done.add(name);
        await ctx.db.update(outboxEvents).set({ stepsDone: [...done] }).where(eq(outboxEvents.id, ev.id));
      } catch (err) {
        firstError ??= err;
        if (ctx.config.env !== "test") console.error(`[outbox] ${ev.kind}/${name} failed (attempt ${ev.attempts})`, err);
      }
    },
  };
  try {
    if (!handler) throw new Error(`no handler for outbox kind "${ev.kind}"`);
    await handler(ctx, ev, steps);
  } catch (err) {
    firstError ??= err;
  }
  if (!firstError) {
    await ctx.db.update(outboxEvents).set({ status: "done", processedAt: ctx.now(), lockedAt: null, lastError: null }).where(eq(outboxEvents.id, ev.id));
    return "done";
  }
  const message = String((firstError as Error)?.message ?? firstError).slice(0, 500);
  if (ev.attempts >= MAX_ATTEMPTS) {
    await ctx.db.update(outboxEvents).set({ status: "dead", lockedAt: null, lastError: message, processedAt: ctx.now() }).where(eq(outboxEvents.id, ev.id));
    if (ctx.config.env !== "test") console.error(`[outbox] giving up on ${ev.kind} ${ev.id} after ${ev.attempts} attempts: ${message}`);
    return "dead";
  }
  await ctx.db
    .update(outboxEvents)
    .set({ status: "pending", lockedAt: null, lastError: message, nextAttemptAt: new Date(ctx.now().getTime() + retryDelayMs(ev.attempts)) })
    .where(eq(outboxEvents.id, ev.id));
  return "retry";
}

export interface DrainResult {
  done: number;
  retried: number;
  dead: number;
}

/** Deliver everything that is due, until nothing more can be claimed. Safe to call from several workers at once. */
export async function drainOutbox(ctx: AppContext, opts: { limit?: number } = {}): Promise<DrainResult> {
  const out: DrainResult = { done: 0, retried: 0, dead: 0 };
  for (let round = 0; round < 1000; round++) {
    const batch = await claim(ctx, opts.limit ?? BATCH);
    if (!batch.length) break;
    // Different members, a few at a time; each batch holds at most one event per member, so order is kept.
    const results: ("done" | "retry" | "dead")[] = new Array(batch.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
        for (let i = next++; i < batch.length; i = next++) results[i] = await process(ctx, batch[i]!);
      }),
    );
    for (const r of results) {
      if (r === "done") out.done++;
      else if (r === "retry") out.retried++;
      else out.dead++;
    }
    // Retries are not due again yet: stop instead of spinning on them. A delivered or dead event may have unblocked its member's next one.
    if (results.every((r) => r === "retry")) break;
  }
  return out;
}

/** Delete delivered events after a few days (dead ones are kept for a month for inspection). */
export async function cleanupOutbox(ctx: AppContext): Promise<number> {
  const now = ctx.now().getTime();
  const a = await ctx.db
    .delete(outboxEvents)
    .where(and(eq(outboxEvents.status, "done"), lt(outboxEvents.processedAt, new Date(now - KEEP_DONE_MS))))
    .returning({ id: outboxEvents.id });
  const b = await ctx.db
    .delete(outboxEvents)
    .where(and(eq(outboxEvents.status, "dead"), lt(outboxEvents.processedAt, new Date(now - KEEP_DEAD_MS))))
    .returning({ id: outboxEvents.id });
  return a.length + b.length;
}

// ---------------------------------------------------------------------------
// Fast path
// ---------------------------------------------------------------------------
const loops = new WeakMap<AppContext, { running: boolean; again: boolean }>();

async function runLoop(ctx: AppContext) {
  let st = loops.get(ctx);
  if (!st) loops.set(ctx, (st = { running: false, again: false }));
  if (st.running) {
    st.again = true; // the running loop picks the new event up on its next round
    return;
  }
  st.running = true;
  try {
    do {
      st.again = false;
      await drainOutbox(ctx);
    } while (st.again);
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[outbox] fast path failed (the drain job will retry)", err);
  } finally {
    st.running = false;
  }
}

/**
 * Call after the transaction that enqueued events has committed. In tests (and OUTBOX_INLINE=1) it delivers before
 * returning so assertions are deterministic; otherwise it schedules delivery on the next tick and returns at once,
 * so the request never waits for a push provider.
 */
export async function kickOutbox(ctx: AppContext): Promise<void> {
  if (ctx.config.outbox.inline) {
    await runLoop(ctx);
    return;
  }
  if (!ctx.config.outbox.fastPath) return;
  setImmediate(() => void runLoop(ctx));
}

/** Rows still waiting (pending or in flight), for tests and the admin health view. */
export async function outboxBacklog(ctx: AppContext): Promise<number> {
  const [r] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(outboxEvents).where(inArray(outboxEvents.status, ["pending", "processing"]));
  return Number(r?.n ?? 0);
}
