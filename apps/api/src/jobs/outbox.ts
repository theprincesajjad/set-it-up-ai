import { cleanupOutbox, drainOutbox } from "../services/outbox.js";
import { sweepRateLimits } from "../lib/rate-limit.js";
import type { Job } from "./index.js";

export const outboxJobs: Job[] = [
  /** Durable retry for the after-commit outbox: anything the fast path did not finish (a crash, a provider outage) is delivered here, with backoff. */
  { name: "outbox.drain", everyMs: 5_000, run: async (ctx) => void (await drainOutbox(ctx)) },
  /** Delivered events are kept three days, dead ones a month. */
  { name: "outbox.cleanup", everyMs: 60 * 60_000, run: async (ctx) => void (await cleanupOutbox(ctx)) },
  /** Shared rate-limit counters (RATE_LIMIT_STORE=postgres): drop expired windows. */
  { name: "ratelimit.sweep", everyMs: 10 * 60_000, run: async (ctx) => void (await sweepRateLimits(ctx)) },
];
