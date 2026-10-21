/**
 * Counter offline queue (docs/design/screens/staff-counter.md § 6,
 * docs/engineering/api/staff.md § POST .../counter/sync).
 *
 * - Every award tapped while offline (or that failed with a retryable error)
 *   is persisted with its client idempotency key. The SAME key is used for the
 *   online attempt and the /sync replay, so the server never double-awards.
 * - flush() replays due items per merchant in order, in chunks of <= 100,
 *   via POST /v1/merchants/:id/counter/sync.
 *   - ok / duplicate → removed (counted in `lastSent`)
 *   - error "internal" → retried with backoff
 *   - any other error → final: kept as "needs attention" for staff to see
 * - A failed request (offline/timeout/5xx) backs off 2, 5, 15, 30 s then every 60 s.
 * - State survives app restarts through a QueueStorage adapter
 *   (AsyncStorage in the app, in-memory in tests).
 *
 * No React Native imports: unit-tested in Node (offlineQueue.test.ts).
 */
import type { staffApi } from "@ll/shared";

export const BACKOFF_SECONDS = [2, 5, 15, 30, 60] as const;
export const SYNC_CHUNK = 100;
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const STALE_COUNT = 50;

export type QueueStatus = "waiting" | "sending" | "failed";

export interface QueueDisplay {
  /** "Add stamp", "Award 12 pts" */
  label: string;
  /** "(416) ***-0123" or "...0123" */
  who: string;
  name?: string | null;
}

export interface QueuedEvent {
  /** = event.idempotencyKey */
  id: string;
  merchantId: string;
  event: staffApi.SyncEvent;
  display: QueueDisplay;
  status: QueueStatus;
  attempts: number;
  /** epoch ms */
  createdAt: number;
  nextAttemptAt: number;
  error?: { code: string; message: string };
}

export interface QueueStorage {
  load(): Promise<QueuedEvent[] | null>;
  save(items: QueuedEvent[]): Promise<void>;
}

export type SendBatch = (merchantId: string, events: staffApi.SyncEvent[]) => Promise<staffApi.SyncResponse>;

export interface FlushResult {
  sent: number;
  failed: number;
  retrying: number;
  /** The request itself failed (offline). */
  networkError: boolean;
}

export interface QueueSnapshot {
  items: QueuedEvent[];
  /** waiting + sending */
  pendingCount: number;
  failedCount: number;
  /** Oldest pending item older than 24 h, or > 50 pending. */
  stale: boolean;
  /** Number sent by the most recent flush that sent anything (for "Back online · 3 sent"). */
  lastSent: number;
  flushing: boolean;
}

export function backoffMs(attempts: number): number {
  const i = Math.min(Math.max(attempts - 1, 0), BACKOFF_SECONDS.length - 1);
  return (BACKOFF_SECONDS[i] ?? 60) * 1000;
}

/** Retry later? Mirrors staff.md: only "internal" (and transport failures) are retryable. */
export function isRetryableSyncError(code: string): boolean {
  return code === "internal";
}

export class OfflineQueue {
  private items: QueuedEvent[] = [];
  private loaded = false;
  private loading: Promise<void> | null = null;
  private flushing: Promise<FlushResult> | null = null;
  private listeners = new Set<(s: QueueSnapshot) => void>();
  private lastSent = 0;

  constructor(
    private readonly storage: QueueStorage,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    if (!this.loading) {
      this.loading = (async () => {
        const stored = (await this.storage.load().catch(() => null)) ?? [];
        // An app killed mid-flush leaves items "sending": they were never confirmed, so resend.
        this.items = stored.map((i) => (i.status === "sending" ? { ...i, status: "waiting" as const } : i));
        this.loaded = true;
        this.emit();
      })();
    }
    await this.loading;
  }

  subscribe(fn: (s: QueueSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): QueueSnapshot {
    const pending = this.items.filter((i) => i.status !== "failed");
    const oldest = pending.reduce((min, i) => Math.min(min, i.createdAt), Infinity);
    return {
      items: [...this.items],
      pendingCount: pending.length,
      failedCount: this.items.length - pending.length,
      stale: pending.length > STALE_COUNT || (pending.length > 0 && this.now() - oldest > STALE_AFTER_MS),
      lastSent: this.lastSent,
      flushing: this.flushing !== null,
    };
  }

  /** Persist an event. Re-enqueueing the same idempotency key is a no-op (one tap = one award). */
  async enqueue(merchantId: string, event: staffApi.SyncEvent, display: QueueDisplay): Promise<QueuedEvent> {
    await this.load();
    const existing = this.items.find((i) => i.id === event.idempotencyKey);
    if (existing) return existing;
    const t = this.now();
    const item: QueuedEvent = {
      id: event.idempotencyKey,
      merchantId,
      event,
      display,
      status: "waiting",
      attempts: 0,
      createdAt: t,
      nextAttemptAt: t,
    };
    this.items.push(item);
    await this.persist();
    return item;
  }

  /** Staff dismissed a "needs attention" item (or it was undone before sending). */
  async remove(id: string): Promise<void> {
    await this.load();
    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
  }

  async clear(): Promise<void> {
    this.items = [];
    this.lastSent = 0;
    this.loaded = true;
    await this.persist();
  }

  has(id: string): boolean {
    return this.items.some((i) => i.id === id);
  }

  /** Earliest time something is due (for scheduling the next timer), or null. */
  nextDueAt(): number | null {
    const due = this.items.filter((i) => i.status === "waiting").map((i) => i.nextAttemptAt);
    return due.length ? Math.min(...due) : null;
  }

  /**
   * Send everything that's due (or everything waiting when `force`, e.g. "Retry now"
   * or the network just came back). Concurrent calls share one flush.
   */
  flush(send: SendBatch, opts: { force?: boolean } = {}): Promise<FlushResult> {
    if (!this.flushing) {
      this.flushing = this.doFlush(send, opts.force ?? false).finally(() => {
        this.flushing = null;
        this.emit();
      });
      this.emit();
    }
    return this.flushing;
  }

  private async doFlush(send: SendBatch, force: boolean): Promise<FlushResult> {
    await this.load();
    const t = this.now();
    const result: FlushResult = { sent: 0, failed: 0, retrying: 0, networkError: false };
    const due = this.items.filter((i) => i.status === "waiting" && (force || i.nextAttemptAt <= t));
    if (due.length === 0) return result;

    // Group by merchant, keep tap order (sync processes events in order; cooldowns depend on it).
    const byMerchant = new Map<string, QueuedEvent[]>();
    for (const item of [...due].sort((a, b) => a.createdAt - b.createdAt)) {
      const list = byMerchant.get(item.merchantId) ?? [];
      list.push(item);
      byMerchant.set(item.merchantId, list);
    }

    for (const [merchantId, list] of byMerchant) {
      for (let i = 0; i < list.length; i += SYNC_CHUNK) {
        const chunk = list.slice(i, i + SYNC_CHUNK);
        for (const item of chunk) item.status = "sending";
        this.emit();
        let response: staffApi.SyncResponse;
        try {
          response = await send(merchantId, chunk.map((c) => c.event));
        } catch (e) {
          const status = (e as { status?: number }).status;
          const code = (e as { code?: string }).code ?? "network";
          const message = (e as Error).message ?? "Request failed";
          const transport = status === undefined || status === 0 || status >= 500;
          for (const item of chunk) {
            if (transport) {
              item.status = "waiting";
              item.attempts += 1;
              item.nextAttemptAt = this.now() + backoffMs(item.attempts);
              result.retrying += 1;
            } else {
              // The whole batch was rejected (e.g. 400 validation, 403 signed out of this shop): final.
              item.status = "failed";
              item.error = { code, message };
              result.failed += 1;
            }
          }
          if (transport) result.networkError = true;
          await this.persist();
          if (transport) return this.finish(result);
          continue;
        }
        const byKey = new Map(response.results.map((r) => [r.idempotencyKey, r]));
        const sentIds = new Set<string>();
        for (const item of chunk) {
          const r = byKey.get(item.id);
          if (!r) {
            item.status = "waiting";
            item.attempts += 1;
            item.nextAttemptAt = this.now() + backoffMs(item.attempts);
            result.retrying += 1;
          } else if (r.status === "ok" || r.status === "duplicate") {
            sentIds.add(item.id);
            result.sent += 1;
          } else if (isRetryableSyncError(r.error.code)) {
            item.status = "waiting";
            item.attempts += 1;
            item.nextAttemptAt = this.now() + backoffMs(item.attempts);
            item.error = r.error;
            result.retrying += 1;
          } else {
            item.status = "failed";
            item.error = r.error;
            result.failed += 1;
          }
        }
        this.items = this.items.filter((it) => !sentIds.has(it.id));
        await this.persist();
      }
    }
    return this.finish(result);
  }

  private finish(result: FlushResult): FlushResult {
    if (result.sent > 0) this.lastSent = result.sent;
    return result;
  }

  private async persist(): Promise<void> {
    this.emit();
    await this.storage.save(this.items).catch(() => undefined);
  }

  private emit(): void {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }
}

/** In-memory storage for tests and as a fallback. */
export function memoryQueueStorage(initial: QueuedEvent[] = []): QueueStorage & { data: QueuedEvent[] | null } {
  const store = {
    data: initial.length ? (JSON.parse(JSON.stringify(initial)) as QueuedEvent[]) : null,
    async load() {
      return store.data ? (JSON.parse(JSON.stringify(store.data)) as QueuedEvent[]) : null;
    },
    async save(items: QueuedEvent[]) {
      store.data = JSON.parse(JSON.stringify(items)) as QueuedEvent[];
    },
  };
  return store;
}
