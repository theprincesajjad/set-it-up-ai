import { expireIssuedRedemptions } from "../services/redemptions.js";
import type { Job } from "./index.js";

export const redemptionJobs: Job[] = [
  /** Void app-issued reward codes not used within 10 minutes and refund the points (via the ledger). */
  { name: "redemptions.expire", everyMs: 60_000, run: async (ctx) => void (await expireIssuedRedemptions(ctx)) },
];
