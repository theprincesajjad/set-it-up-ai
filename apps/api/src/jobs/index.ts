import type { AppContext } from "../context.js";

/**
 * Background jobs (scheduled messages, automations, birthday bonuses, booking
 * reminders, ad budget pacing...). Each job is a function that does one pass;
 * the scheduler runs them on an interval. They are on unless JOBS=0: run them on exactly one
 * API instance (or a dedicated worker) so jobs don't double-run.
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
import { weeklyReportJobs } from "./weekly-report.js"; // phase-pro: p6
import { billingTrialJobs } from "./billing-trial.js"; // phase-pro: p1
import { waitlistJobs } from "./waitlist.js"; // phase-pro: p2

export const jobs: Job[] = [...messagingJobs, ...commerceJobs, ...adsJobs, ...connectorsJobs, ...redemptionJobs, ...notificationJobs, ...banquetJobs, ...tiffinJobs, ...restaurantMessagingJobs, ...appointmentJobs, ...classJobs, ...halalJobs, ...serviceJobs, ...onboardingJobs, ...retentionJobs, ...outboxJobs, ...groceryJobs, ...barberJobs, ...petJobs, ...autoJobs];

jobs.push(...weeklyReportJobs); // phase-pro: p6
jobs.push(...billingTrialJobs); // phase-pro: p1
jobs.push(...waitlistJobs); // phase-pro: p2

/** What each job last did, for /ready and the logs: a slow or failing job shows up here instead of only in the console. */
interface JobState {
  running: boolean;
  lastOkAt?: string;
  lastFailAt?: string;
  consecutiveFailures: number;
}
const state = new Map<string, JobState>();
const inFlight = new Set<Promise<void>>();
/** After this many failed passes in a row a job is reported as failing (an alert hook can watch for the log line). */
const FAIL_ALERT_AFTER = 5;

export function jobsStatus(): { enabled: boolean; failing: string[] } {
  return { enabled: state.size > 0, failing: [...state].filter(([, s]) => s.consecutiveFailures >= FAIL_ALERT_AFTER).map(([n]) => n) };
}

/** Starts every job on its interval. Returns `stop`, which stops the timers and resolves once passes already running have finished (or `timeoutMs` passed). */
export function startJobs(ctx: AppContext): (timeoutMs?: number) => Promise<void> {
  // On unless JOBS=0 (and never in tests). Run them on exactly one instance: see docs/engineering/deploy.md.
  if (process.env.JOBS === "0" || ctx.config.env === "test") return async () => {};
  const timers = jobs.map((job) => {
    const st: JobState = { running: false, consecutiveFailures: 0 };
    state.set(job.name, st);
    return setInterval(() => {
      // A slow pass must not overlap its own next tick.
      if (st.running) return;
      st.running = true;
      const pass = job
        .run(ctx)
        .then(() => {
          st.consecutiveFailures = 0;
          st.lastOkAt = new Date().toISOString();
        })
        .catch((err) => {
          st.consecutiveFailures += 1;
          st.lastFailAt = new Date().toISOString();
          console.error(`[job ${job.name}] failed (${st.consecutiveFailures} in a row${st.consecutiveFailures === FAIL_ALERT_AFTER ? ", ALERT" : ""})`, err);
        })
        .finally(() => {
          st.running = false;
          inFlight.delete(pass);
        });
      inFlight.add(pass);
    }, job.everyMs);
  });
  return async (timeoutMs = 20_000) => {
    timers.forEach(clearInterval);
    await Promise.race([Promise.allSettled([...inFlight]), new Promise((r) => setTimeout(r, timeoutMs).unref())]);
  };
}

// ---- wave N: admin cockpit ----
import { adminMetricsJobs } from "./admin-metrics.js";
jobs.push(...adminMetricsJobs);
