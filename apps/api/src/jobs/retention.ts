import { runRetention } from "../services/retention.js";
import type { Job } from "./index.js";

export const retentionJobs: Job[] = [
  /** Deletes or de-identifies personal information past the periods in packages/shared/src/retention.ts (the privacy policy prints the same numbers). Every 6 hours; each rule is idempotent. */
  { name: "privacy.retention", everyMs: 6 * 60 * 60_000, run: async (ctx) => void (await runRetention(ctx)) },
];
