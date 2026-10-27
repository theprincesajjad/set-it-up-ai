import type { AppContext } from "../context.js";

/**
 * Background jobs (scheduled messages, automations, birthday bonuses, booking
 * reminders, ad budget pacing...). Each job is a function that does one pass;
 * the scheduler runs them on an interval. In production run a single API
 * instance with JOBS=1 (or a dedicated worker) so jobs don't double-run.
 */
export interface Job {
  name: string;
  everyMs: number;
  run: (ctx: AppContext) => Promise<void>;
}

import { adsJobs } from "./ads.js";
import { appointmentJobs } from "./appointments.js";
import { classJobs } from "./classes.js";
import { banquetJobs } from "./banquet.js";
import { commerceJobs } from "./commerce.js";
import { connectorsJobs } from "./connectors.js";
import { halalJobs } from "./halal.js";
import { messagingJobs } from "./messaging.js";
import { onboardingJobs } from "./onboarding.js";
import { outboxJobs } from "./outbox.js";
import { notificationJobs } from "./notifications.js";
import { redemptionJobs } from "./redemptions.js";
import { retentionJobs } from "./retention.js";
import { restaurantMessagingJobs } from "./restaurant-messaging.js";
import { serviceJobs } from "./service.js";
import { groceryJobs } from "./grocery.js";
import { barberJobs } from "./barber.js";
import { petJobs } from "./pets.js";
import { autoJobs } from "./auto.js";
import { tiffinJobs } from "./tiffin.js";

export const jobs: Job[] = [...messagingJobs, ...commerceJobs, ...adsJobs, ...connectorsJobs, ...redemptionJobs, ...notificationJobs, ...banquetJobs, ...tiffinJobs, ...restaurantMessagingJobs, ...appointmentJobs, ...classJobs, ...halalJobs, ...serviceJobs, ...onboardingJobs, ...retentionJobs, ...outboxJobs, ...groceryJobs, ...barberJobs, ...petJobs, ...autoJobs];

export function startJobs(ctx: AppContext): () => void {
  if (process.env.JOBS === "0" || ctx.config.env === "test") return () => {};
  const timers = jobs.map((job) =>
    setInterval(() => {
      job.run(ctx).catch((err) => console.error(`[job ${job.name}]`, err));
    }, job.everyMs),
  );
  return () => timers.forEach(clearInterval);
}
