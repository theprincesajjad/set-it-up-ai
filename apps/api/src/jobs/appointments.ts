import { expireHolds } from "../services/appointments.js";
import { sendReminders } from "../services/appointments-booking.js";
import type { Job } from "./index.js";

export const appointmentJobs: Job[] = [
  /** Text and push 24 hours and 2 hours before a visit (transactional). */
  { name: "appointments.reminders", everyMs: 5 * 60_000, run: async (ctx) => void (await sendReminders(ctx)) },
  /** An online booking that never got its deposit or card within 10 minutes releases the chair. */
  { name: "appointments.hold_expiry", everyMs: 60_000, run: async (ctx) => void (await expireHolds(ctx)) },
];
