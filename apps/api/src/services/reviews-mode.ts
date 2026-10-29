/**
 * The review-requests switch on its own, with no heavy imports, so the trial start (P1) and the purchase flow can call it without
 * pulling the messaging chain into their module graph (services/reviews.ts reaches wallet.ts through messaging.ts).
 */
import { eq } from "drizzle-orm";
import { merchants } from "@ll/db";
import type { reviewsApi } from "@ll/shared";
import type { AppContext } from "../context.js";

/** P1 calls this when the trial starts (and when Pro is bought): turn the requests on or off. */
export async function setReviewRequestsMode(ctx: Pick<AppContext, "db" | "now">, merchantId: string, mode: reviewsApi.ReviewRequestsMode): Promise<void> {
  await ctx.db.update(merchants).set({ reviewRequestsMode: mode, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
}
