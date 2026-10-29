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
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { auditLogs, merchants, staffHours, staffServices, subscriptions } from "@ll/db";
import {
  PLANS,
  PLAN_IDS,
  PLAN_RANK,
  PLATFORM_PAYMENT_FEE_BPS,
  SMS_OVERAGE_CENTS,
  bookableCalendarLimit,
  foundingSoloConfig,
  foundingSoloSpotsLeft,
  isFoundingSoloEligible,
  isPlanAvailable,
  promoAllowance,
  type BillingInterval,
  type PlanId,
  type PromoAllowance,
  type billingApi,
} from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, conflict } from "../lib/errors.js";
import { featureLocked } from "../lib/errors.js";
import { getPayments } from "../providers/payments.js";
import { subscriptionPeriodEnd } from "../providers/paymentsStripe.js";
import { iso } from "./commerceShared.js";
import { calendarLimitFor, getRolloutStages } from "./features.js";
import { smsAllowance, smsOverage } from "./text-allowance.js";

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
  const [usage, foundingSolo] = await Promise.all([planUsage(ctx, merchant, sub), foundingSoloFor(ctx, merchant)]);
  return {
    usage,
    foundingSolo,
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
  // Founding solo price: an annual Café & Retail checkout for a beauty pro or barbershop while spots last. The coupon takes the
  // first annual invoice down to the founding price; it renews at the list price.
  const founding = body.plan === "plus" && body.interval === "year" ? await foundingSoloFor(ctx, merchant) : null;
  const foundingOn = !!founding?.eligible && p.annualPriceCents > founding.priceCents;
  const couponId = foundingOn ? await getPayments(ctx).foundingSoloCouponId(p.annualPriceCents - founding!.priceCents) : undefined;
  const s = await getPayments(ctx).createSubscriptionCheckout({
    customerId,
    merchantId: merchant.id,
    plan: body.plan,
    interval: body.interval,
    ...(foundingOn ? { couponId, metadata: { founding_solo: "1" } } : {}),
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
  // ANNUAL_INCLUDES_WEBSITE: a live paid subscription billed yearly entitles the shop to the website builder (site.builder).
  const annualSiteEntitled = live.some((s) => s.interval === "year" && PLAN_RANK[s.plan] >= PLAN_RANK.plus);
  const [before] = await ctx.db.select({ plan: merchants.plan, annualSiteEntitled: merchants.annualSiteEntitled }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (before && (before.plan !== plan || before.annualSiteEntitled !== annualSiteEntitled)) {
    await ctx.db.update(merchants).set({ plan, annualSiteEntitled, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
    if (before.plan !== plan) await audit(ctx, merchantId, "billing.plan_changed", { from: before.plan, to: plan });
    if (before.annualSiteEntitled !== annualSiteEntitled) await audit(ctx, merchantId, "billing.annual_site_entitlement", { entitled: annualSiteEntitled });
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
  // The founding solo price took a spot (counted by merchants.founding_solo).
  if (session.metadata?.founding_solo === "1" && !merchant.foundingSolo) {
    await ctx.db.update(merchants).set({ foundingSolo: true }).where(eq(merchants.id, merchant.id));
    await audit(ctx, merchant.id, "billing.founding_solo", { subscriptionId: subId });
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

// ---- phase-solo: A: plan usage, promo allowance, founding solo price ----
const addInterval = (d: Date, interval: BillingInterval, n: number) => {
  const out = new Date(d);
  if (interval === "year") out.setUTCFullYear(out.getUTCFullYear() + n);
  else out.setUTCMonth(out.getUTCMonth() + n);
  return out;
};

/** Start of the current billing period: one interval before the paid period's end, or the calendar month on Free. */
export function billingPeriodStart(now: Date, sub: Pick<Subscription, "interval" | "currentPeriodEnd"> | null): Date {
  const interval: BillingInterval = sub?.interval === "year" ? "year" : "month";
  if (sub?.currentPeriodEnd) {
    let start = addInterval(sub.currentPeriodEnd, interval, -1);
    // A stale period end (webhook late): step forward so the window still contains now.
    while (addInterval(start, interval, 1).getTime() <= now.getTime()) start = addInterval(start, interval, 1);
    return start;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The shop's promo allowance this billing period (4 a month on Café & Retail, 48 a year on annual, none on Free). */
export async function promoAllowanceFor(ctx: AppContext, merchant: Merchant, sub?: Subscription | null): Promise<PromoAllowance> {
  const live = sub === undefined ? await currentSubscription(ctx, merchant.id) : sub;
  return promoAllowance({
    plan: merchant.plan,
    restaurantTier: merchant.restaurantTier,
    interval: live ? (live.interval === "year" ? "year" : "month") : null,
    sentCount: merchant.promosSentCount,
    sentPeriodStart: merchant.promosSentPeriodStart,
    periodStart: billingPeriodStart(ctx.now(), live),
  });
}

export const promoAllowanceUsed = (a: PromoAllowance) =>
  new HttpError(
    402,
    a.limit === 0 ? "feature_locked" : "promo_allowance_used",
    a.limit === 0 ? `Promos to your regulars come with ${PLANS.plus.name}.` : `You've sent all ${a.limit} promos for this ${a.period}. More come with the next one.`,
    { allowance: a, offer: a.limit === 0 ? { kind: "plan", plan: "plus", name: PLANS.plus.name, priceCents: PLANS.plus.priceCents } : null },
  );

/**
 * Count one promo against the allowance, atomically (two sends racing for the last promo: one wins). Throws 402 when the shop
 * has none left (Free: feature_locked with the plan offer). Returns the allowance after the send. Workstream D calls this
 * from the promo send path.
 */
export async function consumePromo(ctx: AppContext, merchant: Merchant): Promise<PromoAllowance> {
  const before = await promoAllowanceFor(ctx, merchant);
  if (before.remaining <= 0) throw promoAllowanceUsed(before);
  const start = new Date(before.periodStart);
  const fresh = sql`(${merchants.promosSentPeriodStart} is null or ${merchants.promosSentPeriodStart} < ${start})`;
  const rows = await ctx.db
    .update(merchants)
    .set({
      promosSentCount: sql`case when ${fresh} then 1 else ${merchants.promosSentCount} + 1 end`,
      promosSentPeriodStart: sql`case when ${fresh} then ${start} else ${merchants.promosSentPeriodStart} end`,
    })
    .where(and(eq(merchants.id, merchant.id), sql`(${fresh} or ${merchants.promosSentCount} < ${before.limit})`))
    .returning({ promosSentCount: merchants.promosSentCount, promosSentPeriodStart: merchants.promosSentPeriodStart });
  if (!rows.length) throw promoAllowanceUsed({ ...before, used: before.limit, remaining: 0 });
  return { ...before, used: rows[0]!.promosSentCount, remaining: Math.max(0, before.limit - rows[0]!.promosSentCount) };
}

/** Give a promo back (the send failed before anyone got it). Never below zero. */
export async function refundPromo(ctx: AppContext, merchantId: string): Promise<void> {
  await ctx.db.update(merchants).set({ promosSentCount: sql`greatest(${merchants.promosSentCount} - 1, 0)` }).where(eq(merchants.id, merchantId));
}

/** What the plan allows and what is used: calendars, texts, promos, the annual website. */
export async function planUsage(ctx: AppContext, merchant: Merchant, sub?: Subscription | null): Promise<billingApi.PlanUsageDto> {
  const live = sub === undefined ? await currentSubscription(ctx, merchant.id) : sub;
  const [hrs, svc] = await Promise.all([
    ctx.db.selectDistinct({ userId: staffHours.userId }).from(staffHours).where(eq(staffHours.merchantId, merchant.id)),
    ctx.db.selectDistinct({ userId: staffServices.userId }).from(staffServices).where(eq(staffServices.merchantId, merchant.id)),
  ]);
  const limit = await calendarLimitFor(ctx.db, merchant);
  const calendars = new Set([...hrs, ...svc].map((r) => r.userId)).size;
  const included = smsAllowance(merchant);
  const over = smsOverage(merchant);
  return {
    plan: merchant.plan,
    interval: live ? (live.interval === "year" ? "year" : "month") : null,
    calendars: { limit, used: limit == null ? calendars : Math.min(calendars, limit) },
    texts: { includedPerMonth: included, used: merchant.smsCreditsUsed, remaining: Math.max(0, included - merchant.smsCreditsUsed), overageTexts: over.texts, overageCents: over.cents, overageCentsEach: SMS_OVERAGE_CENTS },
    promos: await promoAllowanceFor(ctx, merchant, live),
    annualSiteEntitled: merchant.annualSiteEntitled,
  };
}

/** Shops that took the founding solo price. */
export async function foundingSoloTaken(ctx: AppContext): Promise<number> {
  const [r] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(merchants).where(eq(merchants.foundingSolo, true));
  return Number(r?.n ?? 0);
}

/** The founding solo price, for one shop or (merchant null) for the public pricing page. Config: FOUNDING_SOLO_* env. */
export async function foundingSoloFor(ctx: AppContext, merchant: Pick<Merchant, "vertical" | "foundingSolo"> | null): Promise<billingApi.FoundingSoloDto> {
  const cfg = foundingSoloConfig(process.env);
  const taken = cfg.enabled ? await foundingSoloTaken(ctx) : 0;
  return {
    enabled: cfg.enabled,
    priceCents: cfg.priceCents,
    renewsAtCents: PLANS.plus.annualPriceCents,
    slots: cfg.slots,
    spotsLeft: foundingSoloSpotsLeft(taken, cfg),
    eligible: merchant ? isFoundingSoloEligible(merchant, taken, cfg) : false,
    taken: !!merchant?.foundingSolo,
  };
}
// ---- end phase-solo: A ----
