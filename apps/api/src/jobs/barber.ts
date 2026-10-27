import { sweep } from "../services/barber.js";
import type { Job } from "./index.js";

export const barberJobs: Job[] = [
  /** Texts the person who just became first in a line, and clears lines left over from yesterday. */
  { name: "queue.sweep", everyMs: 60_000, run: async (ctx) => void (await sweep(ctx)) },
];
