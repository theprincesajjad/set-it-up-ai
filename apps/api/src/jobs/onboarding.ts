import { runOnboardingNudges } from "../services/onboarding.js";
import type { Job } from "./index.js";

export const onboardingJobs: Job[] = [
  /** Setup nudges to owners of shops that have not activated: day 1, 3, 7, 14, 25 (9:00 to 20:00 Toronto, once each). */
  { name: "onboarding.nudges", everyMs: 3_600_000, run: async (ctx) => void (await runOnboardingNudges(ctx)) },
];
