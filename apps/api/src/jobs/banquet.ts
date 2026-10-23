import { expireHolds, sendBanquetReminders } from "../services/banquet.js";
import type { Job } from "./index.js";

export const banquetJobs: Job[] = [
  /** Hall holds past their 72 hours are cancelled so the room opens up again. */
  { name: "banquet.expire_holds", everyMs: 10 * 60_000, run: async (ctx) => void (await expireHolds(ctx)) },
  /** Payment-due and hold-expiry notices (24 h and 4 h before a hold lapses); each goes out once. */
  { name: "banquet.reminders", everyMs: 30 * 60_000, run: async (ctx) => void (await sendBanquetReminders(ctx)) },
];
