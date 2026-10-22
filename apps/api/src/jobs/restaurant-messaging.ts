import { resetWhatsappCreditsIfNewMonth } from "../services/whatsapp.js";
import { scheduleCompletedReviewRequests, sendDueReviewRequests } from "../services/reviews.js";
import type { Job } from "./index.js";

export const restaurantMessagingJobs: Job[] = [
  /** Completed orders, tiffin deliveries and catering events become review requests (one per customer per 14 days). */
  { name: "reviews.schedule-completed", everyMs: 10 * 60_000, run: async (ctx) => void (await scheduleCompletedReviewRequests(ctx)) },
  /** Send review requests two hours after completion, by consented channel (WhatsApp > SMS > email > push). */
  { name: "reviews.send-due", everyMs: 5 * 60_000, run: async (ctx) => void (await sendDueReviewRequests(ctx)) },
  /** Monthly: renew the plan's WhatsApp allowance and take used pack messages out of whatsappCreditsExtra (idempotent). */
  { name: "whatsapp.credit-reset", everyMs: 60 * 60_000, run: async (ctx) => void (await resetWhatsappCreditsIfNewMonth(ctx)) },
];
