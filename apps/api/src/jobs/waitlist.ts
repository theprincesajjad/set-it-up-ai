import { runWaitlist } from "../services/waitlist.js";
import type { Job } from "./index.js";

export const waitlistJobs: Job[] = [
  /** phase-pro P2: a lapsed offer goes to the next match (at most 3 per slot), an unoffered slot is offered, past asks expire. */
  { name: "appointments.waitlist", everyMs: 60_000, run: async (ctx) => void (await runWaitlist(ctx)) },
];
