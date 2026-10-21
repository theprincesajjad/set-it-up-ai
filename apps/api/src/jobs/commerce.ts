import { sendBookingReminders } from "../services/bookings.js";
import { expireQuotes } from "../services/quotes.js";
import type { Job } from "./index.js";

export const commerceJobs: Job[] = [
  /** Push + SMS reminder 2h before a pickup / drop-off slot. */
  { name: "commerce.booking_reminders", everyMs: 5 * 60_000, run: async (ctx) => void (await sendBookingReminders(ctx)) },
  /** Sent quotes past their expiry become "expired" (customer must ask for a new one). */
  { name: "service.expire_quotes", everyMs: 15 * 60_000, run: async (ctx) => void (await expireQuotes(ctx)) },
];
