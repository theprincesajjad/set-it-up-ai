import { sendHalalExpiryReminders } from "../services/halal.js";
import type { Job } from "./index.js";

export const halalJobs: Job[] = [
  /** Owners hear 60 and 30 days before their halal certificate expires (WhatsApp if opted in, else email). Idempotent per expiry date. */
  { name: "halal.expiry-reminders", everyMs: 6 * 60 * 60_000, run: async (ctx) => void (await sendHalalExpiryReminders(ctx)) },
];
