/**
 * phase-solo A: the monthly text allowance and transactional text accounting (docs/business/solo-pro-launch.md §3.2).
 * A leaf module (no service imports) so notifications.ts and commerceShared.ts can use it without an import cycle.
 */
import { and, eq, sql } from "drizzle-orm";
import { merchants, type DbOrTx } from "@ll/db";
import { PLANS, SMS_OVERAGE_CENTS, effectivePlan } from "@ll/shared";

type Merchant = typeof merchants.$inferSelect;

/**
 * Monthly text allowance: the plan's (Free 30, reserved for transactional texts; Café & Retail 500; a restaurant tier counts as
 * Café & Retail). Campaign texts need marketing.sms, so on Free only a pilot override sends them, inside the same 30.
 */
export function smsAllowance(m: Pick<Merchant, "plan"> & { restaurantTier?: Merchant["restaurantTier"] }): number {
  return PLANS[effectivePlan(m.plan, m.restaurantTier)].smsPerMonth;
}

/**
 * Count one transactional text (confirmation, reminder) against the shop's allowance. Free stops at the allowance and the
 * caller falls back to email (returns false). Paid plans keep sending past it; each extra text is overage at SMS_OVERAGE_CENTS.
 */
export async function reserveTransactionalText(db: DbOrTx, merchantId: string): Promise<boolean> {
  const [m] = await db.select({ plan: merchants.plan, restaurantTier: merchants.restaurantTier }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) return false;
  const capped = effectivePlan(m.plan, m.restaurantTier) === "free";
  const r = await db
    .update(merchants)
    .set({ smsCreditsUsed: sql`${merchants.smsCreditsUsed} + 1` })
    .where(and(eq(merchants.id, merchantId), capped ? sql`${merchants.smsCreditsUsed} + 1 <= ${smsAllowance(m)}` : undefined))
    .returning({ used: merchants.smsCreditsUsed });
  return r.length > 0;
}

/** Texts over the allowance this month and what they cost (paid plans only; Free never goes over). */
export function smsOverage(m: Pick<Merchant, "plan" | "smsCreditsUsed"> & { restaurantTier?: Merchant["restaurantTier"] }): { texts: number; cents: number } {
  const texts = Math.max(0, m.smsCreditsUsed - smsAllowance(m));
  return { texts, cents: texts * SMS_OVERAGE_CENTS };
}
