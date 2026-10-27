/** "My barber" follows the last completed visit until the customer picks one (docs/research/barbers-beauty.md 2.3). */
import { preferredStaff } from "@ll/db";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";

export async function autoSetPreferred(ctx: AppContext, userId: string | null, merchantId: string, staffId: string | null): Promise<void> {
  if (!userId || !staffId) return;
  const now = ctx.now();
  // A pick the customer made stays; only an automatic one follows the last visit.
  await ctx.db.insert(preferredStaff).values({ userId, merchantId, staffId, source: "auto", updatedAt: now }).onConflictDoUpdate({ target: [preferredStaff.userId, preferredStaff.merchantId], set: { staffId, updatedAt: now }, setWhere: eq(preferredStaff.source, "auto") });
}
