/**
 * phase-pro P1 · The 14-day Pro trial (docs/business/pro-value.md §2.2, §3.2 P1).
 *
 * Rules:
 *  - Fourteen days of Pro (TRIAL_DAYS, TRIAL_PLAN), free, no card, for every shop, starting the day the booking link goes live
 *    (the `booking_link_live` milestone), not at signup. One per shop (merchants.trial_used).
 *  - It is a flag, not a Stripe object: merchants.trial_plan is set while it is live and cleared when it ends, so there is
 *    nothing to cancel. Feature checks read trial_plan (features.ts trialPlanOf); texts are capped at TRIAL_SMS_CAP.
 *  - It ends at trial_ends_at (the hourly job in jobs/billing-trial.ts, which also sends the receipt), or at once when a paid
 *    subscription goes live (billing.ts recomputePlan). Nothing is deleted when it ends.
 *
 * This module imports no other billing module (billing.ts imports it). The rebooking mode is loaded when the trial starts (dynamic
 * import), because rebooking.ts sits in the messaging graph that imports billing.ts at load time.
 */
import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { auditLogs, merchantMilestones, merchants } from "@ll/db";
import { PLANS, TRIAL_PLAN, effectivePlan, trialEndsAt, type MilestoneKey, type PlanId, type billingApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { HttpError } from "../lib/errors.js";
import { isPharmacy } from "./pharmacy-guard.js";
import { setReviewRequestsMode } from "./reviews-mode.js";

type Merchant = typeof merchants.$inferSelect;

/** How far back a missed `booking_link_live` still starts a trial (a race between the checklist poll and this module). */
const CATCH_UP_MS = 2 * 86_400_000;

async function milestone(ctx: AppContext, merchantId: string, key: MilestoneKey, data: Record<string, unknown>): Promise<boolean> {
  const rows = await ctx.db.insert(merchantMilestones).values({ merchantId, key, reachedAt: ctx.now(), data }).onConflictDoNothing().returning({ id: merchantMilestones.id });
  return rows.length > 0;
}

async function audit(ctx: AppContext, merchantId: string, action: string, data: Record<string, unknown>) {
  await ctx.db.insert(auditLogs).values({ merchantId, action, entity: "merchant", data });
}

export const trialUsed = () => new HttpError(409, "trial_used", "This shop has already had its free trial.");
export const trialNotNeeded = (plan: PlanId) => new HttpError(409, "trial_not_needed", `You're already on ${PLANS[plan].name}.`);

/**
 * Start the shop's one trial. 409 trial_used the second time, 409 trial_not_needed on a paid plan or restaurant tier. Turns on what the
 * trial is for: automatic rebooking (P3) and review requests after every visit (P4).
 */
export async function startTrial(ctx: AppContext, merchant: Merchant, source: "booking_link_live" | "owner" = "owner"): Promise<billingApi.TrialStartResponse> {
  const paid = effectivePlan(merchant.plan, merchant.restaurantTier);
  if (paid !== "free") throw trialNotNeeded(paid);
  if (merchant.trialUsed) throw trialUsed();
  const now = ctx.now();
  const endsAt = trialEndsAt(now);
  const [row] = await ctx.db
    .update(merchants)
    .set({ trialPlan: TRIAL_PLAN, trialStartedAt: now, trialEndsAt: endsAt, trialUsed: true, updatedAt: now })
    .where(and(eq(merchants.id, merchant.id), eq(merchants.trialUsed, false)))
    .returning();
  if (!row) throw trialUsed();
  await milestone(ctx, merchant.id, "trial_started", { plan: TRIAL_PLAN, endsAt: endsAt.toISOString(), source });
  await audit(ctx, merchant.id, "billing.trial_started", { plan: TRIAL_PLAN, endsAt: endsAt.toISOString(), source });
  await switchOnTrialTools(ctx, row);
  return { plan: TRIAL_PLAN, startedAt: now.toISOString(), endsAt: endsAt.toISOString() };
}

/** The trial's tools that have a mode: review requests on, rebooking automatic (unless the owner turned it off, or a pharmacy). */
async function switchOnTrialTools(ctx: AppContext, m: Merchant): Promise<void> {
  try {
    const { setRebookingMode } = await import("./rebooking.js");
    await setReviewRequestsMode(ctx, m.id, "on");
    if (!isPharmacy(m) && m.rebookingMode !== "off") await setRebookingMode(ctx, m, "auto", { force: true });
  } catch (err) {
    console.error("[trial.tools]", m.id, err);
  }
}

/** The booking link went live: start the trial for any shop that has not had one. Never throws. */
export async function startTrialOnLinkLive(ctx: AppContext, merchantId: string): Promise<boolean> {
  try {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
    if (!m || m.trialUsed || effectivePlan(m.plan, m.restaurantTier) !== "free") return false;
    await startTrial(ctx, m, "booking_link_live");
    return true;
  } catch (err) {
    if (!(err instanceof HttpError && err.statusCode === 409)) console.error("[trial.start]", merchantId, err);
    return false;
  }
}

/** A paid subscription went live: the trial ends now (billing.ts recomputePlan). */
export async function endTrialOnSubscribe(ctx: AppContext, merchantId: string, plan: PlanId): Promise<void> {
  const rows = await ctx.db
    .update(merchants)
    .set({ trialPlan: null, updatedAt: ctx.now() })
    .where(and(eq(merchants.id, merchantId), isNotNull(merchants.trialPlan)))
    .returning({ id: merchants.id });
  if (!rows.length) return;
  await milestone(ctx, merchantId, "trial_ended", { reason: "subscribed", plan });
  await audit(ctx, merchantId, "billing.trial_ended", { reason: "subscribed", plan });
}

/**
 * End every trial whose trial_ends_at has passed (the job). Each shop is claimed by clearing trial_plan, so two workers cannot both end
 * it; returns the shops this pass ended, for the receipt.
 */
export async function endExpiredTrials(ctx: AppContext): Promise<Merchant[]> {
  const now = ctx.now();
  const due = await ctx.db.select({ id: merchants.id }).from(merchants).where(and(isNotNull(merchants.trialPlan), lte(merchants.trialEndsAt, now)));
  const ended: Merchant[] = [];
  for (const { id } of due) {
    const [row] = await ctx.db
      .update(merchants)
      .set({ trialPlan: null, updatedAt: now })
      .where(and(eq(merchants.id, id), isNotNull(merchants.trialPlan), lte(merchants.trialEndsAt, now)))
      .returning();
    if (!row) continue;
    await milestone(ctx, id, "trial_ended", { reason: "expired" });
    await audit(ctx, id, "billing.trial_ended", { reason: "expired" });
    ended.push(row);
  }
  return ended;
}

/** Shops whose link went live recently but whose trial did not start (the checklist recorded the milestone first). */
export async function startMissedTrials(ctx: AppContext): Promise<number> {
  const since = new Date(ctx.now().getTime() - CATCH_UP_MS);
  const rows = await ctx.db
    .select({ id: merchants.id })
    .from(merchants)
    .innerJoin(merchantMilestones, and(eq(merchantMilestones.merchantId, merchants.id), eq(merchantMilestones.key, "booking_link_live")))
    .where(and(eq(merchants.trialUsed, false), eq(merchants.plan, "free"), isNull(merchants.restaurantTier), gte(merchantMilestones.reachedAt, since)));
  let n = 0;
  for (const r of rows) if (await startTrialOnLinkLive(ctx, r.id)) n += 1;
  return n;
}
