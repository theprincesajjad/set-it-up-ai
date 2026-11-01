/**
 * In-process API latency recorder (team admin, wave N). A Fastify onResponse hook adds each request to a small in-memory map keyed
 * by route template; a timer writes the map to `api_metrics` every few minutes and on close. Overhead per request: one map lookup,
 * a few additions and a short bucket scan, no allocation after the first request of a route in a window.
 *
 * Privacy: only the matched route template (`GET /v1/merchants/:merchantId/visits`) and timings are kept. The URL, ids, query,
 * headers, body, IP and user are never read. Unmatched requests (404 scans) collapse into one "unmatched" row.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { apiMetrics, type DbOrTx } from "@ll/db";

/** Upper bounds (ms) of the latency histogram; the last bucket is everything slower. */
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 150, 250, 400, 600, 1000, 1600, 2500, 4000, 10000] as const;
export const OPEN_BUCKET_MS = 30000;
export const FLUSH_EVERY_MS = 5 * 60_000;

export interface RouteAgg {
  group: string;
  count: number;
  errors: number;
  sumMs: number;
  maxMs: number;
  hist: number[];
}

/** Index of the histogram bucket for a duration. */
export function bucketOf(ms: number): number {
  for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) if (ms <= LATENCY_BUCKETS_MS[i]!) return i;
  return LATENCY_BUCKETS_MS.length;
}

/** The upper bound of the bucket holding the q-quantile (0..1) of a histogram; 0 for an empty one. */
export function percentileMs(hist: readonly number[], q: number): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const rank = Math.max(1, Math.ceil(q * total));
  let seen = 0;
  for (let i = 0; i < hist.length; i++) {
    seen += hist[i] ?? 0;
    if (seen >= rank) return i < LATENCY_BUCKETS_MS.length ? LATENCY_BUCKETS_MS[i]! : OPEN_BUCKET_MS;
  }
  return OPEN_BUCKET_MS;
}

const SHOP_SCOPES = new Set(["merchants", "m", "staff"]);

/**
 * Route group from a template: the first segment after /v1, and for shop-scoped routes the first static segment after the shop id
 * ("/v1/merchants/:merchantId/appointments/:id" → "merchants:appointments"). Never contains an id.
 */
export function routeGroup(template: string | undefined): string {
  if (!template) return "unmatched";
  const parts = template.split("?")[0]!.split("/").filter(Boolean);
  const i = parts[0] === "v1" ? 1 : 0;
  const head = parts[i];
  if (!head) return "root";
  if (head.startsWith(":")) return "unmatched";
  if (SHOP_SCOPES.has(head)) {
    const next = parts.slice(i + 1).find((p) => !p.startsWith(":"));
    return next ? `${head}:${next}` : head;
  }
  return head;
}

export class MetricsRecorder {
  private routes = new Map<string, RouteAgg>();
  private windowStart: Date;

  constructor(private readonly now: () => Date) {
    this.windowStart = now();
  }

  record(method: string, template: string | undefined, status: number, ms: number): void {
    const key = template ? `${method} ${template}` : "unmatched";
    let r = this.routes.get(key);
    if (!r) this.routes.set(key, (r = { group: routeGroup(template), count: 0, errors: 0, sumMs: 0, maxMs: 0, hist: new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0) }));
    r.count++;
    if (status >= 500) r.errors++;
    r.sumMs += ms;
    if (ms > r.maxMs) r.maxMs = ms;
    r.hist[bucketOf(ms)]!++;
  }

  /** What is held now (tests, and the flush). */
  snapshot(): { windowStart: Date; routes: Map<string, RouteAgg> } {
    return { windowStart: this.windowStart, routes: this.routes };
  }

  /** Write the window to api_metrics and start a new one. Rows are stamped with the window's start. */
  async flush(db: DbOrTx): Promise<number> {
    const { windowStart, routes } = this.snapshot();
    this.routes = new Map();
    this.windowStart = this.now();
    if (!routes.size) return 0;
    const rows = [...routes].map(([route, r]) => ({ bucketStart: windowStart, routeGroup: r.group, route, count: r.count, errors: r.errors, sumMs: Math.round(r.sumMs * 100) / 100, maxMs: Math.round(r.maxMs * 100) / 100, hist: r.hist }));
    await db.insert(apiMetrics).values(rows);
    return rows.length;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    metrics: MetricsRecorder;
  }
}

/** Attach the recorder: onResponse hook, a flush timer outside tests, and a last flush on close. */
export function installMetrics(app: FastifyInstance, opts: { db: DbOrTx; now: () => Date; timer: boolean }): MetricsRecorder {
  const rec = new MetricsRecorder(opts.now);
  app.decorate("metrics", rec);
  app.addHook("onResponse", async (req: FastifyRequest, reply: FastifyReply) => {
    // The health probe is noise.
    if (req.url === "/health" || req.method === "OPTIONS") return;
    rec.record(req.method, req.routeOptions.url, reply.statusCode, reply.elapsedTime);
  });
  const flush = () => rec.flush(opts.db).catch((err) => console.error("[metrics] flush failed", (err as Error).message));
  const t = opts.timer ? setInterval(flush, FLUSH_EVERY_MS) : null;
  t?.unref?.();
  app.addHook("onClose", async () => {
    if (t) clearInterval(t);
    if (opts.timer) await flush();
  });
  return rec;
}
