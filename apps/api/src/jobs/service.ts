import { runRollingDropoffSlots } from "../services/dropoff.js";
import { runPickupReminders } from "../services/pickup.js";
import { runRebookNudges } from "../services/rebooking.js";
import type { Job } from "./index.js";

export const serviceJobs: Job[] = [
  /** Finished work not collected: text at day 3 and 7, a call task at day 30, a flag at day 60 (nothing is sent at 60). Hourly; each step runs once per ticket. */
  { name: "service.pickup_reminders", everyMs: 60 * 60_000, run: async (ctx) => void (await runPickupReminders(ctx)) },
  /** Rebooking nudges at 10:00 shop time for shops with automatic sending on (service.rebooking). Hourly; only the 10 o'clock hour sends. */
  { name: "service.rebook_nudges", everyMs: 60 * 60_000, run: async (ctx) => void (await runRebookNudges(ctx)) },
  /** Keep the next N days of drop-off slots open from Locations hours. */
  { name: "commerce.generate_slots_rolling", everyMs: 6 * 60 * 60_000, run: async (ctx) => void (await runRollingDropoffSlots(ctx)) },
];
