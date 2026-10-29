/**
 * phase-solo A: the monthly text allowance and transactional text accounting (docs/business/solo-pro-launch.md §3.2).
 * A leaf module (no service imports) so notifications.ts and commerceShared.ts can use it without an import cycle.
 */
import { and, eq, sql } from "drizzle-orm";
import { merchants, type DbOrTx } from "@ll/db";
import { PLANS, SMS_OVERAGE_CENTS, TRIAL_SMS_CAP, effectivePlan } from "@ll/shared";

type Merchant = typeof merchants.$inferSelect;

type AllowanceInput = Pick<Merchant, "plan"> & { restaurantTier?: Merchant["restaurantTier"]; trialPlan?: string | null };

/** phase-pro P1: a shop on its trial with no paid plan: capped at TRIAL_SMS_CAP, then email, like Free. */
const onTrialOnly = (m: AllowanceInput) => !!m.trialPlan && effectivePlan(m.plan, m.restaurantTier) === "free";

/**
 * Monthly text allowance: the plan's (Free 30, reserved for transactional texts; Pro 300; Studio 1,000; Service 1,500; a restaurant
 * tier counts as Studio; the trial TRIAL_SMS_CAP). Campaign texts need marketing.sms, so on Free only a pilot override sends them.
 */
export function smsAllowance(m: AllowanceInput): number {
  if (onTrialOnly(m)) return TRIAL_SMS_CAP;
  return PLANS[effectivePlan(m.plan, m.restaurantTier)].smsPerMonth;
}

/** Free and the trial stop at the allowance (the reminder goes by email); paid plans go over at SMS_OVERAGE_CENTS. */
export const textsCapped = (m: AllowanceInput) => effectivePlan(m.plan, m.restaurantTier) === "free";

/**
 * Count one transactional text (confirmation, reminder) against the shop's allowance. Free stops at the allowance and the
 * caller falls back to email (returns false). Paid plans keep sending past it; each extra text is overage at SMS_OVERAGE_CENTS.
 */
export async function reserveTransactionalText(db: DbOrTx, merchantId: string): Promise<boolean> {
  const [m] = await db.select({ plan: merchants.plan, restaurantTier: merchants.restaurantTier, trialPlan: merchants.trialPlan }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) return false;
  const capped = textsCapped(m);
  const r = await db
    .update(merchants)
    .set({ smsCreditsUsed: sql`${merchants.smsCreditsUsed} + 1` })
    .where(and(eq(merchants.id, merchantId), capped ? sql`${merchants.smsCreditsUsed} + 1 <= ${smsAllowance(m)}` : undefined))
    .returning({ used: merchants.smsCreditsUsed });
  return r.length > 0;
}

/** Texts over the allowance this month and what they cost (paid plans only; Free never goes over). */
export function smsOverage(m: AllowanceInput & Pick<Merchant, "smsCreditsUsed">): { texts: number; cents: number } {
  if (textsCapped(m)) return { texts: 0, cents: 0 };
  const texts = Math.max(0, m.smsCreditsUsed - smsAllowance(m));
  return { texts, cents: texts * SMS_OVERAGE_CENTS };
}
