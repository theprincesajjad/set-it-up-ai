import { runAdsLifecycle } from "../services/ads.js";
import { deliverNearbyPushes } from "../services/adsPush.js";
import { runCampaignLifecycle } from "../services/campaigns.js";
import type { Job } from "./index.js";

/** Network monetization jobs: ad lifecycle/accrual, sponsored push delivery, BIA campaign status. */
export const adsJobs: Job[] = [
  { name: "ads.lifecycle", everyMs: 5 * 60_000, run: async (ctx) => void (await runAdsLifecycle(ctx)) },
  { name: "ads.nearby_push", everyMs: 15 * 60_000, run: async (ctx) => void (await deliverNearbyPushes(ctx)) },
  { name: "campaigns.lifecycle", everyMs: 5 * 60_000, run: async (ctx) => void (await runCampaignLifecycle(ctx)) },
];
