import { describe, expect, it, vi } from "vitest";
import type { staffApi } from "@ll/shared";
import { backoffMs, memoryQueueStorage, OfflineQueue, type SendBatch } from "./offlineQueue";

const award = (key: string, over: Partial<staffApi.SyncEvent> = {}): staffApi.SyncEvent =>
  ({ type: "award", idempotencyKey: key, occurredAt: "2026-10-21T15:00:00.000Z", phone: "+14165550123", ...over }) as staffApi.SyncEvent;

const display = { label: "Add stamp", who: "...0123" };

function okResponse(events: staffApi.SyncEvent[], statusFor: (k: string) => "ok" | "duplicate" | { code: string } = () => "ok"): staffApi.SyncResponse {
  const results = events.map((e) => {
    const s = statusFor(e.idempotencyKey);
    if (typeof s === "string") return { idempotencyKey: e.idempotencyKey, type: "award" as const, status: s, result: {} as staffApi.AwardResponse };
    return { idempotencyKey: e.idempotencyKey, type: "award" as const, status: "error" as const, error: { code: s.code, message: `failed: ${s.code}` } };
  });
  return { results, summary: { ok: 0, duplicate: 0, error: 0 } };
}

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("OfflineQueue", () => {
  it("persists queued awards with their idempotency key and survives a restart", async () => {
    const storage = memoryQueueStorage();
    const q1 = new OfflineQueue(storage);
    await q1.enqueue("m1", award("k-1"), display);
    await q1.enqueue("m1", award("k-2"), display);
    // same tap re-enqueued (e.g. retry button) is not duplicated
    await q1.enqueue("m1", award("k-1"), display);
    expect(storage.data?.map((i) => i.id)).toEqual(["k-1", "k-2"]);

    const q2 = new OfflineQueue(storage); // app restarted
    await q2.load();
    expect(q2.snapshot().pendingCount).toBe(2);
    expect(q2.snapshot().items[0]?.event.idempotencyKey).toBe("k-1");
  });

  it("an app killed mid-send resends 'sending' items", async () => {
    const storage = memoryQueueStorage([
      { id: "k-1", merchantId: "m1", event: award("k-1"), display, status: "sending", attempts: 0, createdAt: 1, nextAttemptAt: 1 },
    ]);
    const q = new OfflineQueue(storage);
    await q.load();
    expect(q.snapshot().items[0]?.status).toBe("waiting");
  });

  it("flush syncs per merchant in tap order and removes ok + duplicate", async () => {
    const c = clock();
    const q = new OfflineQueue(memoryQueueStorage(), c.now);
    await q.enqueue("m1", award("a"), display);
    c.advance(10);
    await q.enqueue("m2", award("b"), display);
    c.advance(10);
    await q.enqueue("m1", award("c"), display);
    const send = vi.fn<SendBatch>(async (_m, events) => okResponse(events, (k) => (k === "c" ? "duplicate" : "ok")));
    const res = await q.flush(send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toBe("m1");
    expect(send.mock.calls[0]?.[1].map((e) => e.idempotencyKey)).toEqual(["a", "c"]);
    expect(send.mock.calls[1]?.[0]).toBe("m2");
    expect(res).toMatchObject({ sent: 3, failed: 0, retrying: 0, networkError: false });
    expect(Object.keys(res.sentKeys).sort()).toEqual(["a", "b", "c"]);
    expect(q.snapshot().pendingCount).toBe(0);
    expect(q.snapshot().lastSent).toBe(3);
  });

  it("final errors stay as 'needs attention'; 'internal' errors retry with backoff", async () => {
    const c = clock();
    const q = new OfflineQueue(memoryQueueStorage(), c.now);
    await q.enqueue("m1", award("dup-cooldown"), display);
    await q.enqueue("m1", award("server-hiccup"), display);
    await q.enqueue("m1", award("fine"), display);
    const res = await q.flush(async (_m, events) =>
      okResponse(events, (k) => (k === "dup-cooldown" ? { code: "cooldown" } : k === "server-hiccup" ? { code: "internal" } : "ok")),
    );
    expect(res).toMatchObject({ sent: 1, failed: 1, retrying: 1 });
    const snap = q.snapshot();
    expect(snap.failedCount).toBe(1);
    expect(snap.pendingCount).toBe(1);
    const failed = snap.items.find((i) => i.id === "dup-cooldown");
    expect(failed).toMatchObject({ status: "failed", error: { code: "cooldown" } });
    const retry = snap.items.find((i) => i.id === "server-hiccup");
    expect(retry).toMatchObject({ status: "waiting", attempts: 1, nextAttemptAt: c.now() + 2000 });
    // staff dismisses the alert
    await q.remove("dup-cooldown");
    expect(q.snapshot().failedCount).toBe(0);
  });

  it("offline: the request fails → items wait with backoff 2, 5, 15, 30, then 60 s", async () => {
    const c = clock();
    const q = new OfflineQueue(memoryQueueStorage(), c.now);
    await q.enqueue("m1", award("k"), display);
    const offline: SendBatch = async () => {
      throw Object.assign(new Error("Network request failed"), { status: 0, code: "network" });
    };
    const schedule: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await q.flush(offline, { force: true });
      expect(res.networkError).toBe(true);
      const item = q.snapshot().items[0]!;
      schedule.push((item.nextAttemptAt - c.now()) / 1000);
    }
    expect(schedule).toEqual([2, 5, 15, 30, 60, 60]);
    expect(backoffMs(1)).toBe(2000);
  });

  it("only sends items that are due unless forced (Retry now / back online)", async () => {
    const c = clock();
    const q = new OfflineQueue(memoryQueueStorage(), c.now);
    await q.enqueue("m1", award("k"), display);
    await q.flush(async () => {
      throw Object.assign(new Error("offline"), { status: 0 });
    });
    const send = vi.fn<SendBatch>(async (_m, e) => okResponse(e));
    await q.flush(send); // not due yet (2 s backoff)
    expect(send).not.toHaveBeenCalled();
    c.advance(2000);
    await q.flush(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(q.snapshot().pendingCount).toBe(0);
  });

  it("a rejected batch (4xx, e.g. signed out of this shop) is final, not retried forever", async () => {
    const q = new OfflineQueue(memoryQueueStorage());
    await q.enqueue("m1", award("k"), display);
    const res = await q.flush(async () => {
      throw Object.assign(new Error("You are not staff here"), { status: 403, code: "forbidden" });
    });
    expect(res).toMatchObject({ failed: 1, networkError: false });
    expect(q.snapshot().items[0]).toMatchObject({ status: "failed", error: { code: "forbidden" } });
  });

  it("chunks large queues into batches of 100 (SYNC_MAX_EVENTS)", async () => {
    const q = new OfflineQueue(memoryQueueStorage());
    for (let i = 0; i < 230; i++) await q.enqueue("m1", award(`k-${String(i).padStart(3, "0")}`), display);
    const sizes: number[] = [];
    await q.flush(async (_m, events) => {
      sizes.push(events.length);
      return okResponse(events);
    });
    expect(sizes).toEqual([100, 100, 30]);
    expect(q.snapshot().pendingCount).toBe(0);
  });

  it("concurrent flushes share one request", async () => {
    const q = new OfflineQueue(memoryQueueStorage());
    await q.enqueue("m1", award("k"), display);
    const send = vi.fn<SendBatch>(async (_m, e) => {
      await new Promise((r) => setTimeout(r, 5));
      return okResponse(e);
    });
    await Promise.all([q.flush(send), q.flush(send), q.flush(send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flags stale queues (> 24 h old or > 50 items) for the danger banner", async () => {
    const c = clock();
    const q = new OfflineQueue(memoryQueueStorage(), c.now);
    await q.enqueue("m1", award("old"), display);
    expect(q.snapshot().stale).toBe(false);
    c.advance(24 * 60 * 60 * 1000 + 1);
    expect(q.snapshot().stale).toBe(true);
  });

  it("notifies subscribers with the queued count (offline banner)", async () => {
    const q = new OfflineQueue(memoryQueueStorage());
    const counts: number[] = [];
    q.subscribe((s) => counts.push(s.pendingCount));
    await q.enqueue("m1", award("a"), display);
    await q.enqueue("m1", award("b"), display);
    expect(counts.at(-1)).toBe(2);
  });
});
