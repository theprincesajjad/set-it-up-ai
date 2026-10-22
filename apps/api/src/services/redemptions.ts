/**
 * Redemption code lifecycle. App-issued codes (source customer_app) carry an
 * expiresAt (createdAt + 10 min, see ledger.ts REDEMPTION_CODE_TTL_MS); once
 * past it, the counter rejects them (redemption_expired) and this sweep voids
 * them and refunds the points through ledger.ts reverseTransaction.
 */
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { redemptions } from "@ll/db";
import type { AppContext } from "../context.js";
import { reverseTransaction } from "./ledger.js";

export async function expireIssuedRedemptions(ctx: AppContext, limit = 500): Promise<{ expired: number }> {
  const now = ctx.now();
  const due = await ctx.db
    .select({ id: redemptions.id, merchantId: redemptions.merchantId, transactionId: redemptions.transactionId })
    .from(redemptions)
    .where(and(eq(redemptions.status, "issued"), isNotNull(redemptions.expiresAt), lte(redemptions.expiresAt, now)))
    .limit(limit);
  let expired = 0;
  for (const r of due) {
    try {
      if (r.transactionId) {
        // Voids the redemption (status "void") in the same DB transaction as the refund.
        await reverseTransaction(ctx, { merchantId: r.merchantId, transactionId: r.transactionId, reason: "Reward code expired", source: "system" });
      } else {
        await ctx.db.update(redemptions).set({ status: "void" }).where(and(eq(redemptions.id, r.id), eq(redemptions.status, "issued")));
      }
      expired++;
    } catch (err) {
      // Already reversed (e.g. cancelled concurrently): just make sure it's void.
      await ctx.db.update(redemptions).set({ status: "void" }).where(and(eq(redemptions.id, r.id), eq(redemptions.status, "issued")));
      if (ctx.config.env !== "test") console.error("[redemptions.expire]", r.id, err);
    }
  }
  return { expired };
}
