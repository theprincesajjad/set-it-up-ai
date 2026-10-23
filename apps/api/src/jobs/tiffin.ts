import { remindManualCharges, runDaily } from "../services/tiffin.js";
import type { Job } from "./index.js";

export const tiffinJobs: Job[] = [
  /**
   * Resume paused subscriptions, roll billing periods due today, generate tomorrow's deliveries and send
   * opted-in menu notifications. Every step is idempotent (unique indexes), so a short interval is safe.
   */
  { name: "tiffin.daily", everyMs: 10 * 60_000, run: async (ctx) => void (await runDaily(ctx)) },
  /** Day-1 and day-3 reminders for hand-paid charges (not between 21:00 and 08:00), then past due after the grace days. Idempotent. */
  { name: "tiffin.remind_manual", everyMs: 60 * 60_000, run: async (ctx) => void (await remindManualCharges(ctx)) },
];
