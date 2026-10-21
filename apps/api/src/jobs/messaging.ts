import { advancePromoStatuses } from "../services/merchant-program.js";
import { awardBirthdayBonuses, resetSmsCreditsIfNewMonth, runAutomations, sendScheduledCampaigns } from "../services/messaging.js";
import type { Job } from "./index.js";

export const messagingJobs: Job[] = [
  /** Campaigns whose scheduledAt has passed. */
  { name: "messaging.send-scheduled", everyMs: 60_000, run: async (ctx) => void (await sendScheduledCampaigns(ctx)) },
  /** win_back / reward_ready / birthday / welcome (Plus). Each member is messaged at most once per trigger. */
  { name: "messaging.automations", everyMs: 15 * 60_000, run: async (ctx) => void (await runAutomations(ctx)) },
  /** Free birthday points via the ledger, once per member per year. */
  { name: "loyalty.birthday-bonus", everyMs: 60 * 60_000, run: async (ctx) => void (await awardBirthdayBonuses(ctx)) },
  /** Reset merchants.smsCreditsUsed on the 1st of each month (idempotent). */
  { name: "messaging.sms-credit-reset", everyMs: 60 * 60_000, run: async (ctx) => void (await resetSmsCreditsIfNewMonth(ctx)) },
  /** Promo lifecycle: scheduled → live at startsAt, → ended after endsAt. */
  { name: "promos.lifecycle", everyMs: 60_000, run: async (ctx) => void (await advancePromoStatuses(ctx.db, ctx.now())) },
];
