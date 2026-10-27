import { runTirePickupReminders } from "../services/auto-tires.js";
import { runServiceReminders } from "../services/auto-vehicles.js";
import type { Job } from "./index.js";

export const autoJobs: Job[] = [
  /** Service reminders at 10:00 shop time, only for shops that switched them on, once per car, service and due date, never overnight. Hourly; only the 10 o'clock hour sends. */
  { name: "auto.service_reminders", everyMs: 60 * 60_000, run: async (ctx) => void (await runServiceReminders(ctx)) },
  /** Tire pickup texts at 10:00 shop time (auto.tires): stored sets wanted in the next window, once per window. */
  { name: "auto.tire_pickup", everyMs: 60 * 60_000, run: async (ctx) => void (await runTirePickupReminders(ctx)) },
];
