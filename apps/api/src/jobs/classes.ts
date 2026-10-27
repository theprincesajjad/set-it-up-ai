import { runDaily } from "../services/class-memberships.js";
import { expireDropInHolds, sendReminders } from "../services/classes.js";
import type { Job } from "./index.js";

export const classJobs: Job[] = [
  /** Push a reminder to people booked into a class that starts within three hours (once each). */
  { name: "classes.reminders", everyMs: 5 * 60_000, run: async (ctx) => void (await sendReminders(ctx)) },
  /** A drop-in that never got paid within 10 minutes frees its spot and offers it to the waitlist. */
  { name: "classes.hold_expiry", everyMs: 60_000, run: async (ctx) => void (await expireDropInHolds(ctx)) },
  /**
   * Freezes start and end, fixed-term renewal notices go out, packs expire, cancellations reach their date and each
   * membership period that is due is charged. Every step is idempotent (unique charge per period), so a short interval is safe.
   */
  { name: "classes.memberships", everyMs: 10 * 60_000, run: async (ctx) => void (await runDaily(ctx)) },
];
