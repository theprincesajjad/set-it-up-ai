import { and, eq, gt, isNull } from "drizzle-orm";
import { merchants, supportSessions } from "@ll/db";
import type { AppContext } from "../context.js";
import { notFound, supportSessionRequired } from "./errors.js";

/** True when this platform user has a session for the shop that is not ended, not expired, and has a reason. */
export async function hasActiveSupportSession(ctx: AppContext, userId: string, merchantId: string): Promise<boolean> {
  const rows = await ctx.db
    .select({ id: supportSessions.id, reason: supportSessions.reason })
    .from(supportSessions)
    .where(and(eq(supportSessions.adminUserId, userId), eq(supportSessions.merchantId, merchantId), isNull(supportSessions.endedAt), gt(supportSessions.expiresAt, ctx.now())))
    .limit(5);
  return rows.some((r) => r.reason.trim().length >= 5);
}

export async function requireSupportSession(ctx: AppContext, userId: string, merchantId: string): Promise<void> {
  if (await hasActiveSupportSession(ctx, userId, merchantId)) return;
  // An unknown shop is a 404, not a request to start a session on it.
  const [m] = await ctx.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  throw supportSessionRequired(merchantId);
}
