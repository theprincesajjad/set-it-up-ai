import { checkPushReceipts, sendExpiryWarnings } from "../services/notifications.js";
import type { Job } from "./index.js";

export const notificationJobs: Job[] = [
  /** Expo push receipts (~15 min after sending): delete DeviceNotRegistered tokens. */
  { name: "notifications.receipts", everyMs: 15 * 60_000, run: async (ctx) => void (await checkPushReceipts(ctx)) },
  /** reward_expiring: 30 days before a shop's points expire (only shops with expiry on). Deduped per visit; daytime only. */
  { name: "notifications.expiry", everyMs: 60 * 60_000, run: async (ctx) => void (await sendExpiryWarnings(ctx)) },
];
