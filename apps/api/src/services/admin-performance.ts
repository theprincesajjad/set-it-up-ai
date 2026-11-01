/**
 * API latency and errors for the admin performance page, from `api_metrics` (written by lib/metrics.ts) plus the window this
 * process still holds in memory. Percentiles are read off the merged histograms: the upper bound of the bucket the rank falls in.
 */
import { and, gt, lt, lte } from "drizzle-orm";
import { apiMetrics, type DbOrTx } from "@ll/db";
import type { adminCockpitApi as api } from "@ll/shared";
import type { AppContext } from "../context.js";
import { LATENCY_BUCKETS_MS, percentileMs, type RouteAgg } from "../lib/metrics.js";

const HOUR = 3_600_000;

interface Agg {
  count: number;
  errors: number;
  maxMs: number;
  hist: number[];
}
const newAgg = (): Agg => ({ count: 0, errors: 0, maxMs: 0, hist: new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0) });
function add(a: Agg, r: { count: number; errors: number; maxMs: number; hist: readonly number[] }) {
  a.count += r.count;
  a.errors += r.errors;
  if (r.maxMs > a.maxMs) a.maxMs = r.maxMs;
  r.hist.forEach((n, i) => {
    if (i < a.hist.length) a.hist[i]! += n;
  });
}
const stat = (key: string, a: Agg): api.RouteStat => ({
  key,
  count: a.count,
  errors: a.errors,
  errorRate: a.count ? Math.round((a.errors / a.count) * 10000) / 10000 : 0,
  p50Ms: percentileMs(a.hist, 0.5),
  p95Ms: percentileMs(a.hist, 0.95),
  maxMs: Math.round(a.maxMs),
});

export interface MetricRowLike {
  bucketStart: Date;
  routeGroup: string;
  route: string;
  count: number;
  errors: number;
  maxMs: number;
  hist: number[];
}

/** Pure: the report from metric rows (tests feed fixed rows). */
export function summarize(rows: MetricRowLike[], now: Date, hours: number): api.PerformanceReport {
  const total = newAgg();
  const groups = new Map<string, Agg>();
  const routes = new Map<string, Agg>();
  const hourly = new Map<number, Agg>();
  const firstHour = Math.floor((now.getTime() - hours * HOUR) / HOUR) * HOUR;
  for (const r of rows) {
    add(total, r);
    for (const [map, k] of [[groups, r.routeGroup], [routes, r.route]] as const) {
      let a = map.get(k);
      if (!a) map.set(k, (a = newAgg()));
      add(a, r);
    }
    const h = Math.max(firstHour, Math.floor(r.bucketStart.getTime() / HOUR) * HOUR);
    let a = hourly.get(h);
    if (!a) hourly.set(h, (a = newAgg()));
    add(a, r);
  }
  const trend: api.PerformanceReport["trend"] = [];
  for (let h = firstHour; h <= now.getTime(); h += HOUR) {
    const a = hourly.get(h) ?? newAgg();
    trend.push({ hourStart: new Date(h).toISOString(), count: a.count, p95Ms: percentileMs(a.hist, 0.95), errorRate: a.count ? Math.round((a.errors / a.count) * 10000) / 10000 : 0 });
  }
  return {
    generatedAt: now.toISOString(),
    hours,
    total: stat("all", total),
    groups: [...groups].map(([k, a]) => stat(k, a)).sort((x, y) => y.count - x.count || x.key.localeCompare(y.key)),
    slowest: [...routes]
      .map(([k, a]) => stat(k, a))
      .filter((s) => s.count >= 5)
      .sort((x, y) => y.p95Ms - x.p95Ms || y.count - x.count || x.key.localeCompare(y.key))
      .slice(0, 10),
    trend,
    bucketsMs: LATENCY_BUCKETS_MS,
  };
}

export async function performanceReport(ctx: AppContext, hours: number, live?: { windowStart: Date; routes: Map<string, RouteAgg> }): Promise<api.PerformanceReport> {
  const now = ctx.now();
  const since = new Date(now.getTime() - hours * HOUR);
  const stored = await ctx.db
    .select({ bucketStart: apiMetrics.bucketStart, routeGroup: apiMetrics.routeGroup, route: apiMetrics.route, count: apiMetrics.count, errors: apiMetrics.errors, maxMs: apiMetrics.maxMs, hist: apiMetrics.hist })
    .from(apiMetrics)
    .where(and(gt(apiMetrics.bucketStart, since), lte(apiMetrics.bucketStart, now)));
  const rows: MetricRowLike[] = stored.map((r) => ({ ...r, count: Number(r.count), errors: Number(r.errors), maxMs: Number(r.maxMs), hist: (r.hist ?? []).map(Number) }));
  if (live) for (const [route, r] of live.routes) rows.push({ bucketStart: live.windowStart > since ? live.windowStart : now, routeGroup: r.group, route, count: r.count, errors: r.errors, maxMs: r.maxMs, hist: r.hist });
  return summarize(rows, now, hours);
}

/** Retention: rows older than 30 days. */
export async function purgeApiMetrics(db: DbOrTx, now: Date): Promise<number> {
  const r = await db.delete(apiMetrics).where(lt(apiMetrics.bucketStart, new Date(now.getTime() - 30 * 24 * HOUR))).returning({ id: apiMetrics.id });
  return r.length;
}
