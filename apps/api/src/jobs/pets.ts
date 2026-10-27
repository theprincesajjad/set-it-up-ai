import { runRunOutReminders } from "../services/pet-food.js";
import { runGroomReminders } from "../services/pets.js";
import type { Job } from "./index.js";

export const petJobs: Job[] = [
  /** Groom reminders at 10:00 shop time, only for shops that switched them on, once per pet and cycle, never overnight. Hourly; only the 10 o'clock hour sends. */
  { name: "pets.groom_reminders", everyMs: 60 * 60_000, run: async (ctx) => void (await runGroomReminders(ctx)) },
  /** Run-out texts at 10:00 shop time (pets.food_cards): only people who asked, once per bag. */
  { name: "pets.runout_reminders", everyMs: 60 * 60_000, run: async (ctx) => void (await runRunOutReminders(ctx)) },
];
