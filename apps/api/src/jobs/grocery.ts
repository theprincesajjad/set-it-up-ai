import { runPantryReminders } from "../services/grocery.js";
import type { Job } from "./index.js";

export const groceryJobs: Job[] = [
  /** Restock texts at 10:00 shop time (grocery.pantry_reminders): only people who asked, once per purchase, never overnight. Hourly; only the 10 o'clock hour sends. */
  { name: "grocery.pantry_reminders", everyMs: 60 * 60_000, run: async (ctx) => void (await runPantryReminders(ctx)) },
];
