/**
 * Plan subscriptions (Stripe Billing).
 *
 * Rules:
 *  - Free is always available and stays free forever.
 *  - Paid plans are purchasable only once rolled out (isPlanAvailable).
 *  - Downgrading never deletes anything: members, points, rewards, promos and
 *    every free feature keep working. Only paid features lock (402).
 *  - merchants.plan is derived from subscription state delivered by webhooks.
 *  - Restaurant pack subscriptions (subscriptions.restaurantTier set) live in
 *    billing-restaurant.ts and never feed merchants.plan.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { auditLogs, merchants, subscriptions } from "@ll/db";
import { PLANS, PLAN_IDS, PLAN_RANK, PLATFORM_PAYMENT_FEE_BPS, isPlanAvailable, type PlanId, type billingApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict } from "../lib/errors.js";
import { featureLocked } from "../lib/errors.js";
import { getPayments } from "../providers/payments.js";
import { subscriptionPeriodEnd } from "../providers/paymentsStripe.js";
import { iso } from "./commerceShared.js";
import { getRolloutStages } from "./features.js";

type Merchant = typeof merchants.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;
export type SubStatus = Subscription["status"];

export const LIVE_STATUSES: SubStatus[] = ["active", "trialing", "past_due"];

export function subscriptionDto(s: Subscription): billingApi.SubscriptionDto {
  return {
    id: s.id,
    plan: s.plan,
    status: s.status,
    interval: s.interval === "year" ? "year" : "month",
    currentPeriodEnd: iso(s.currentPeriodEnd),
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function currentSubscription(ctx: AppContext, merchantId: string): Promise<Subscription | null> {
  const [live] = await ctx.db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.merchantId, merchantId), isNull(subscriptions.restaurantTier), inArray(subscriptions.status, LIVE_STATUSES)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return live ?? null;
}

export async function billingOverview(ctx: AppContext, merchant: Merchant): Promise<billingApi.BillingOverviewResponse> {
  const stages = await getRolloutStages(ctx.db);
  const sub = await currentSubscription(ctx, merchant.id);
  return {
    plan: merchant.plan,
    restaurantTier: merchant.restaurantTier ?? null,
    subscription: sub ? subscriptionDto(sub) : null,
    hasBillingAccount: !!merchant.stripeCustomerId,
    plans: PLAN_IDS.map((id) => {
      const p = PLANS[id];
      return {
        id,
        name: p.name,
        priceCents: p.priceCents,
        annualPriceCents: p.annualPriceCents,
        currency: "CAD" as const,
        blurb: p.blurb,
        bestFor: p.bestFor,
        smsPerMonth: p.smsPerMonth,
        available: isPlanAvailable(id, stages),
        current: merchant.plan === id,
        platformFeeBps: id === "free" ? 0 : PLATFORM_PAYMENT_FEE_BPS,
      };
    }),
  };
}

function priceIdFor(ctx: AppContext, plan: "plus" | "pro", interval: "month" | "year"): string | undefined {
  const p = ctx.config.stripe.prices;
  if (plan === "plus") return interval === "year" ? p.plusAnnual : p.plusMonthly;
  return interval === "year" ? p.proAnnual : p.proMonthly;
}

function planForPrice(ctx: AppContext, priceId: string | undefined | null): PlanId | null {
  if (!priceId) return null;
  const p = ctx.config.stripe.prices;
  if (priceId === p.plusMonthly || priceId === p.plusAnnual) return "plus";
  if (priceId === p.proMonthly || priceId === p.proAnnual) return "pro";
  return null;
}

export async function ensureCustomer(ctx: AppContext, merchant: Merchant): Promise<string> {
  if (merchant.stripeCustomerId) return merchant.stripeCustomerId;
  const { customerId } = await getPayments(ctx).createCustomer({ merchantId: merchant.id, email: merchant.email, name: merchant.name });
  await ctx.db.update(merchants).set({ stripeCustomerId: customerId, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  return customerId;
}

export const billingPage = (ctx: AppContext, merchantId: string) => `${ctx.config.publicWebUrl}/m/${merchantId}/billing`;

export async function startCheckout(ctx: AppContext, merchant: Merchant, body: z.infer<typeof billingApi.checkoutBody>): Promise<billingApi.CheckoutResponse> {
  const stages = await getRolloutStages(ctx.db);
  if (!isPlanAvailable(body.plan, stages)) throw featureLocked(`${PLANS[body.plan].name} plan`, "rollout");
  const live = await currentSubscription(ctx, merchant.id);
  if (live && !live.cancelAtPeriodEnd) throw conflict(`You're already on ${PLANS[live.plan].name}. Use Manage billing to change plans.`);
  const customerId = await ensureCustomer(ctx, merchant);
  const p = PLANS[body.plan];
  const s = await getPayments(ctx).createSubscriptionCheckout({
    customerId,
    merchantId: merchant.id,
    plan: body.plan,
    interval: body.interval,
    priceId: priceIdFor(ctx, body.plan, body.interval),
    unitAmountCents: body.interval === "year" ? p.annualPriceCents : p.priceCents,
    productName: `${p.name} plan`,
    successUrl: body.successUrl ?? `${billingPage(ctx, merchant.id)}?checkout=success`,
    cancelUrl: body.cancelUrl ?? `${billingPage(ctx, merchant.id)}?checkout=cancelled`,
  });
  return { sessionId: s.id, url: s.url };
}

export async function portalLink(ctx: AppContext, merchant: Merchant, returnUrl?: string): Promise<billingApi.UrlResponse> {
  if (!merchant.stripeCustomerId) throw conflict("No billing account yet. Choose a plan first.");
  return getPayments(ctx).createPortalSession({ customerId: merchant.stripeCustomerId, returnUrl: returnUrl ?? billingPage(ctx, merchant.id) });
}

async function requireLive(ctx: AppContext, merchant: Merchant): Promise<Subscription> {
  const live = await currentSubscription(ctx, merchant.id);
  if (!live || !live.stripeSubscriptionId) throw conflict("You're on the Free plan. Nothing to cancel.");
  return live;
}

export async function cancelAtPeriodEnd(ctx: AppContext, merchant: Merchant) {
  const live = await requireLive(ctx, merchant);
  const snap = await getPayments(ctx).cancelSubscription({ subscriptionId: live.stripeSubscriptionId!, atPeriodEnd: true });
  const [row] = await ctx.db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true, currentPeriodEnd: snap.currentPeriodEnd ?? live.currentPeriodEnd, updatedAt: ctx.now() })
    .where(eq(subscriptions.id, live.id))
    .returning();
  await audit(ctx, merchant.id, "billing.cancel_at_period_end", { subscriptionId: live.id });
  return subscriptionDto(row!);
}

export async function resumeSubscription(ctx: AppContext, merchant: Merchant) {
  const live = await requireLive(ctx, merchant);
  if (!live.cancelAtPeriodEnd) throw conflict("Your subscription isn't set to cancel");
  await getPayments(ctx).resumeSubscription(live.stripeSubscriptionId!);
  const [row] = await ctx.db.update(subscriptions).set({ cancelAtPeriodEnd: false, updatedAt: ctx.now() }).where(eq(subscriptions.id, live.id)).returning();
  await audit(ctx, merchant.id, "billing.resume", { subscriptionId: live.id });
  return subscriptionDto(row!);
}

/**
 * Downgrade to Free. Default: at the end of the paid period. `immediate`
 * cancels now. Loyalty data is never touched.
 */
export async function downgradeToFree(ctx: AppContext, merchant: Merchant, immediate: boolean) {
  if (!immediate) return { plan: merchant.plan, subscription: await cancelAtPeriodEnd(ctx, merchant) };
  const live = await requireLive(ctx, merchant);
  await getPayments(ctx).cancelSubscription({ subscriptionId: live.stripeSubscriptionId!, atPeriodEnd: false });
  const [row] = await ctx.db.update(subscriptions).set({ status: "canceled", cancelAtPeriodEnd: false, updatedAt: ctx.now() }).where(eq(subscriptions.id, live.id)).returning();
  const plan = await recomputePlan(ctx, merchant.id);
  await audit(ctx, merchant.id, "billing.downgrade_now", { subscriptionId: live.id });
  return { plan, subscription: subscriptionDto(row!) };
}

/** merchants.plan = best plan among live subscriptions, else free. */
export async function recomputePlan(ctx: AppContext, merchantId: string): Promise<PlanId> {
  const live = await ctx.db.select().from(subscriptions).where(and(eq(subscriptions.merchantId, merchantId), isNull(subscriptions.restaurantTier), inArray(subscriptions.status, LIVE_STATUSES)));
  const plan = live.reduce<PlanId>((best, s) => (PLAN_RANK[s.plan] > PLAN_RANK[best] ? s.plan : best), "free");
  const [before] = await ctx.db.select({ plan: merchants.plan }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (before && before.plan !== plan) {
    await ctx.db.update(merchants).set({ plan, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
    await audit(ctx, merchantId, "billing.plan_changed", { from: before.plan, to: plan });
  }
  return plan;
}

export async function audit(ctx: AppContext, merchantId: string, action: string, data: Record<string, unknown>) {
  await ctx.db.insert(auditLogs).values({ merchantId, action, entity: "subscription", data });
}

// ---------------------------------------------------------------------------
// Webhook handlers (Stripe-shaped objects)
// ---------------------------------------------------------------------------
export function mapStatus(s: string): SubStatus {
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
    case "incomplete":
      return s;
    case "unpaid":
    case "paused":
      return "past_due";
    default:
      return "canceled"; // canceled, incomplete_expired
  }
}

export const idOf = (v: unknown): string | null => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String((v as { id: unknown }).id) : null);

export async function merchantFor(ctx: AppContext, metadata: Record<string, string> | undefined, customerId: string | null): Promise<Merchant | null> {
  const mid = metadata?.merchant_id;
  if (mid) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, mid)).limit(1);
    if (m) return m;
  }
  if (customerId) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.stripeCustomerId, customerId)).limit(1);
    if (m) return m;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Obj = Record<string, any>;

export async function onCheckoutCompleted(ctx: AppContext, session: Obj): Promise<void> {
  if (session.mode !== "subscription") return;
  const subId = idOf(session.subscription);
  const customerId = idOf(session.customer);
  const merchant = await merchantFor(ctx, { merchant_id: session.metadata?.merchant_id ?? session.client_reference_id }, customerId);
  if (!merchant || !subId) return;
  const plan = (session.metadata?.plan === "pro" ? "pro" : "plus") as PlanId;
  const interval = session.metadata?.interval === "year" ? "year" : "month";
  if (customerId && merchant.stripeCustomerId !== customerId) {
    await ctx.db.update(merchants).set({ stripeCustomerId: customerId }).where(eq(merchants.id, merchant.id));
  }
  await ctx.db
    .insert(subscriptions)
    .values({ merchantId: merchant.id, plan, status: "active", interval, stripeSubscriptionId: subId })
    .onConflictDoNothing({ target: subscriptions.stripeSubscriptionId });
  await recomputePlan(ctx, merchant.id);
}

export async function onSubscriptionEvent(ctx: AppContext, sub: Obj, type: string): Promise<void> {
  const customerId = idOf(sub.customer);
  const merchant = await merchantFor(ctx, sub.metadata, customerId);
  if (!merchant) return;
  const item = sub.items?.data?.[0];
  const plan: PlanId = (["plus", "pro"].includes(sub.metadata?.plan) ? sub.metadata.plan : planForPrice(ctx, item?.price?.id)) ?? "plus";
  const interval = (item?.price?.recurring?.interval ?? sub.metadata?.interval) === "year" ? "year" : "month";
  const status = type === "customer.subscription.deleted" ? "canceled" : mapStatus(String(sub.status));
  const values = {
    plan,
    status,
    interval,
    currentPeriodEnd: subscriptionPeriodEnd(sub),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    updatedAt: ctx.now(),
  };
  await ctx.db
    .insert(subscriptions)
    .values({ merchantId: merchant.id, stripeSubscriptionId: String(sub.id), ...values })
    .onConflictDoUpdate({ target: subscriptions.stripeSubscriptionId, set: values });
  await recomputePlan(ctx, merchant.id);
}

export async function onBillingInvoiceFailed(ctx: AppContext, invoice: Obj): Promise<void> {
  const subId = idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);
  if (!subId) return;
  const [row] = await ctx.db.update(subscriptions).set({ status: "past_due", updatedAt: ctx.now() }).where(eq(subscriptions.stripeSubscriptionId, subId)).returning();
  // past_due keeps the plan during Stripe's retry window; deleted/canceled drops to Free.
  if (row) await recomputePlan(ctx, row.merchantId);
}
