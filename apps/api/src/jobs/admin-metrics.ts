import type { Job } from "./index.js";
import { purgeApiMetrics } from "../services/admin-performance.js";

/** Wave N (admin): api_metrics rows are kept 30 days. */
export const adminMetricsJobs: Job[] = [{ name: "admin.api-metrics-purge", everyMs: 6 * 3_600_000, run: async (ctx) => void (await purgeApiMetrics(ctx.db, ctx.now())) }];
