/**
 * Restaurant pack subscriptions (Stripe Billing): Starter / Growth / Pro tiers,
 * add-ons as subscription items, the founding offer, fees explainer, invoices.
 *
 * Rules:
 *  - A restaurant subscription is a subscriptions row with restaurantTier set and
 *    plan "free": it never feeds merchants.plan (billing.ts). Pro comes
 *    with any tier through effectivePlan().
 *  - merchants.restaurantTier mirrors the best live restaurant subscription,
 *    updated from webhooks (created / updated / deleted) and tier changes.
 *  - Add-ons are items on the restaurant subscription, stored in merchant_add_ons.
 *    banquet_module and phone_ai unlock their feature on Growth (isFeatureEnabled
 *    addOns); whatsapp_1000 adds 1,000 messages to merchants.whatsappCreditsExtra
 *    on purchase and on every renewal (invoice.paid, subscription_cycle).
 *  - Founding offer (merchants.foundingOffer): 50% off for 12 months, then 25%
 *    off for life, as Stripe coupons plus a two-phase schedule (provider).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { merchantAddOns, merchants, subscriptions } from "@ll/db";
import {
  ADD_ONS,
  ADD_ON_IDS,
  ADD_ON_UNLOCKS,
  FOUNDING_OFFER,
  RESTAURANT_PLANS,
  RESTAURANT_TIERS,
  RESTAURANT_TIER_RANK,
  WHATSAPP_PACK_MESSAGES,
  type AddOnId,
  type RestaurantTier,
  type billingApi,
} from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { conflict } from "../lib/errors.js";
import { getPayments } from "../providers/payments.js";
import { subscriptionPeriodEnd } from "../providers/paymentsStripe.js";
import { LIVE_STATUSES, audit, billingPage, ensureCustomer, idOf, mapStatus, merchantFor, type Obj } from "./billing.js";
import { iso } from "./commerceShared.js";
import { platformFeeBpsFor } from "./fees.js";

type Merchant = typeof merchants.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

const isTier = (v: unknown): v is RestaurantTier => typeof v === "string" && (RESTAURANT_TIERS as readonly string[]).includes(v);
const pct = (cents: number, off: number) => Math.round((cents * (100 - off)) / 100);
/** Annual add-on price: two months free, like the plans. */
const addOnAmount = (id: AddOnId, interval: "month" | "year") => (interval === "year" ? ADD_ONS[id].priceCents * 10 : ADD_ONS[id].priceCents);

export function restaurantSubscriptionDto(s: Subscription): billingApi.RestaurantSubscriptionDto {
  return {
    id: s.id,
    tier: s.restaurantTier!,
    status: s.status,
    interval: s.interval === "year" ? "year" : "month",
    currentPeriodEnd: iso(s.currentPeriodEnd),
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function liveRestaurantSubscriptions(ctx: AppContext, merchantId: string): Promise<Subscription[]> {
  const rows = await ctx.db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.merchantId, merchantId), inArray(subscriptions.status, LIVE_STATUSES)))
    .orderBy(desc(subscriptions.createdAt));
  return rows.filter((r) => r.restaurantTier);
}

export async function currentRestaurantSubscription(ctx: AppContext, merchantId: string): Promise<Subscription | null> {
  return (await liveRestaurantSubscriptions(ctx, merchantId))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------
/** Why an add-on can't be attached to this tier right now (null = it can). */
export function addOnBlocker(id: AddOnId, tier: RestaurantTier | null): string | null {
  if (!tier) return "Choose a restaurant plan first.";
  if (ADD_ON_UNLOCKS[id]) {
    if (tier === "starter") return "Needs Restaurant Growth.";
    if (tier === "pro") return "Already included in Restaurant Pro.";
  }
  return null;
}

async function addOnRows(ctx: AppContext, merchantId: string) {
  return ctx.db.select().from(merchantAddOns).where(eq(merchantAddOns.merchantId, merchantId));
}

function addOnDto(id: AddOnId, row: { quantity: number; status: string } | undefined, tier: RestaurantTier | null): billingApi.AddOnDto {
  const active = row?.status === "active";
  const blocker = addOnBlocker(id, tier);
  return {
    id,
    name: ADD_ONS[id].name,
    priceCents: ADD_ONS[id].priceCents,
    unit: ADD_ONS[id].unit,
    quantity: active ? row!.quantity : 0,
    active,
    available: !blocker,
    unavailableReason: active ? null : blocker,
    unlocks: [...(ADD_ON_UNLOCKS[id] ?? [])],
  };
}

export async function listAddOns(ctx: AppContext, merchant: Merchant): Promise<billingApi.AddOnDto[]> {
  const rows = new Map((await addOnRows(ctx, merchant.id)).map((r) => [r.addOnId, r]));
  const tier = (await currentRestaurantSubscription(ctx, merchant.id))?.restaurantTier ?? null;
  return ADD_ON_IDS.map((id) => addOnDto(id, rows.get(id), tier));
}

async function requireLiveRestaurant(ctx: AppContext, merchant: Merchant): Promise<Subscription> {
  const live = await currentRestaurantSubscription(ctx, merchant.id);
  if (!live || !live.stripeSubscriptionId) throw conflict("Choose a restaurant plan first.");
  return live;
}

export async function attachAddOn(ctx: AppContext, merchant: Merchant, id: AddOnId, body: z.infer<typeof billingApi.attachAddOnBody>): Promise<billingApi.AddOnDto> {
  const live = await requireLiveRestaurant(ctx, merchant);
  const tier = live.restaurantTier!;
  const blocker = addOnBlocker(id, tier);
  if (blocker) throw conflict(blocker);
  const quantity = id === "extra_location" ? body.quantity : 1;
  const interval = live.interval === "year" ? "year" : "month";
  const payments = getPayments(ctx);
  const [existing] = await ctx.db.select().from(merchantAddOns).where(and(eq(merchantAddOns.merchantId, merchant.id), eq(merchantAddOns.addOnId, id)));

  let itemId = existing?.status === "active" ? existing.stripeSubscriptionItemId : null;
  if (itemId) {
    if (existing!.quantity === quantity) return addOnDto(id, existing, tier);
    await payments.updateSubscriptionItem({ itemId, quantity, subscriptionId: live.stripeSubscriptionId!, addOnId: id });
  } else {
    ({ itemId } = await payments.addSubscriptionItem({
      subscriptionId: live.stripeSubscriptionId!,
      addOnId: id,
      quantity,
      interval,
      unitAmountCents: addOnAmount(id, interval),
      name: ADD_ONS[id].name,
    }));
  }
  const [row] = await ctx.db
    .insert(merchantAddOns)
    .values({ merchantId: merchant.id, addOnId: id, quantity, status: "active", stripeSubscriptionItemId: itemId })
    .onConflictDoUpdate({ target: [merchantAddOns.merchantId, merchantAddOns.addOnId], set: { quantity, status: "active", stripeSubscriptionItemId: itemId } })
    .returning();
  // A new WhatsApp pack arrives with the first period's messages.
  if (id === "whatsapp_1000" && existing?.status !== "active") await grantWhatsappCredits(ctx, merchant.id, interval === "year" ? 12 : 1, quantity);
  await audit(ctx, merchant.id, "billing.add_on_attached", { addOnId: id, quantity });
  return addOnDto(id, row, tier);
}

export async function detachAddOn(ctx: AppContext, merchant: Merchant, id: AddOnId): Promise<billingApi.AddOnDto> {
  const [existing] = await ctx.db.select().from(merchantAddOns).where(and(eq(merchantAddOns.merchantId, merchant.id), eq(merchantAddOns.addOnId, id)));
  const tier = (await currentRestaurantSubscription(ctx, merchant.id))?.restaurantTier ?? null;
  if (!existing || existing.status !== "active") throw conflict(`${ADD_ONS[id].name} isn't on your plan.`);
  if (existing.stripeSubscriptionItemId) {
    // A founding subscription is managed by a schedule, so the provider needs the subscription to remove the item through it.
    const live = await currentRestaurantSubscription(ctx, merchant.id);
    await getPayments(ctx).removeSubscriptionItem(existing.stripeSubscriptionItemId, { subscriptionId: live?.stripeSubscriptionId ?? undefined, addOnId: id });
  }
  const [row] = await ctx.db
    .update(merchantAddOns)
    .set({ status: "cancelled", stripeSubscriptionItemId: null })
    .where(and(eq(merchantAddOns.merchantId, merchant.id), eq(merchantAddOns.addOnId, id)))
    .returning();
  await audit(ctx, merchant.id, "billing.add_on_detached", { addOnId: id });
  return addOnDto(id, row, tier);
}

/** Stop add-ons that only make sense on a different tier (banquet / phone assistant off Growth). */
async function dropIncompatibleAddOns(ctx: AppContext, merchant: Merchant, tier: RestaurantTier) {
  const rows = (await addOnRows(ctx, merchant.id)).filter((r) => r.status === "active");
  for (const r of rows) if (addOnBlocker(r.addOnId as AddOnId, tier)) await detachAddOn(ctx, merchant, r.addOnId as AddOnId);
}

async function grantWhatsappCredits(ctx: AppContext, merchantId: string, periods: number, quantity = 1) {
  const n = WHATSAPP_PACK_MESSAGES * periods * quantity;
  await ctx.db
    .update(merchants)
    .set({ whatsappCreditsExtra: sql`${merchants.whatsappCreditsExtra} + ${n}`, updatedAt: ctx.now() })
    .where(eq(merchants.id, merchantId));
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export function feeTable(merchant: Pick<Merchant, "plan" | "restaurantTier">): billingApi.FeeRowDto[] {
  const bps = (k: "order" | "deposit" | "invoice" | "tiffin") => platformFeeBpsFor(k, merchant.plan, merchant.restaurantTier);
  return [
    { kind: "order", label: "Online orders", platformFeeBps: bps("order"), customerFeeCents: 49, note: bps("order") === 0 ? "No commission. You can add an optional $0.49 service fee for your customer." : "Free plan pays 1.5%. Any paid plan or restaurant plan pays 0%." },
    { kind: "deposit", label: "Catering and banquet deposits", platformFeeBps: bps("deposit"), customerFeeCents: 0, note: "1% on deposits." },
    { kind: "invoice", label: "Invoices", platformFeeBps: bps("invoice"), customerFeeCents: 0, note: "1% on invoices paid online." },
    { kind: "tiffin", label: "Tiffin subscription billing", platformFeeBps: bps("tiffin"), customerFeeCents: 0, note: "1% on each tiffin charge." },
  ];
}

export async function restaurantOverview(ctx: AppContext, merchant: Merchant): Promise<billingApi.RestaurantBillingResponse> {
  const sub = await currentRestaurantSubscription(ctx, merchant.id);
  const tier = merchant.restaurantTier ?? sub?.restaurantTier ?? null;
  const founding = merchant.foundingOffer;
  const included = tier ? RESTAURANT_PLANS[tier].whatsappPerMonth : 0;
  return {
    tier,
    subscription: sub ? restaurantSubscriptionDto(sub) : null,
    plans: RESTAURANT_TIERS.map((t) => {
      const p = RESTAURANT_PLANS[t];
      return {
        tier: t,
        name: p.name,
        priceCents: p.priceCents,
        annualPriceCents: p.annualPriceCents,
        currency: "CAD" as const,
        blurb: p.blurb,
        whatsappPerMonth: p.whatsappPerMonth,
        current: tier === t,
        foundingPriceCents: founding ? pct(p.priceCents, FOUNDING_OFFER.firstYearPct) : null,
        foundingLifetimePriceCents: founding ? pct(p.priceCents, FOUNDING_OFFER.lifetimePct) : null,
      };
    }),
    addOns: await listAddOns(ctx, merchant),
    fees: feeTable(merchant),
    foundingOffer: { eligible: founding, firstYearPct: FOUNDING_OFFER.firstYearPct, lifetimePct: FOUNDING_OFFER.lifetimePct },
    whatsapp: { includedPerMonth: included, extraCredits: merchant.whatsappCreditsExtra, used: merchant.whatsappCreditsUsed },
    chargeMode: merchant.chargeMode === "direct" ? "direct" : "destination",
  };
}

export async function invoiceHistory(ctx: AppContext, merchant: Merchant): Promise<billingApi.InvoicesResponse> {
  if (!merchant.stripeCustomerId) return { items: [], nextCursor: null };
  const list = await getPayments(ctx).listInvoices(merchant.stripeCustomerId, 24);
  return {
    items: list.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      totalCents: i.totalCents,
      amountPaidCents: i.amountPaidCents,
      currency: i.currency,
      description: i.description,
      createdAt: i.createdAt.toISOString(),
      hostedUrl: i.hostedUrl,
      pdfUrl: i.pdfUrl,
    })),
    nextCursor: null,
  };
}

// ---------------------------------------------------------------------------
// Checkout / change / cancel
// ---------------------------------------------------------------------------
const tierAmount = (tier: RestaurantTier, interval: "month" | "year") => (interval === "year" ? RESTAURANT_PLANS[tier].annualPriceCents : RESTAURANT_PLANS[tier].priceCents);

export async function startRestaurantCheckout(ctx: AppContext, merchant: Merchant, body: z.infer<typeof billingApi.restaurantCheckoutBody>): Promise<billingApi.CheckoutResponse> {
  const live = await currentRestaurantSubscription(ctx, merchant.id);
  if (live && !live.cancelAtPeriodEnd) throw conflict(`You're already on ${RESTAURANT_PLANS[live.restaurantTier!].name}. Change your plan instead.`);
  const payments = getPayments(ctx);
  const customerId = await ensureCustomer(ctx, merchant);
  const p = RESTAURANT_PLANS[body.tier];
  const s = await payments.createSubscriptionCheckout({
    customerId,
    merchantId: merchant.id,
    plan: "plus",
    restaurantTier: body.tier,
    couponId: merchant.foundingOffer ? await payments.foundingCouponId() : undefined,
    interval: body.interval,
    unitAmountCents: tierAmount(body.tier, body.interval),
    productName: p.name,
    successUrl: body.successUrl ?? `${billingPage(ctx, merchant.id)}?checkout=success`,
    cancelUrl: body.cancelUrl ?? `${billingPage(ctx, merchant.id)}?checkout=cancelled`,
  });
  return { sessionId: s.id, url: s.url };
}

export async function changeRestaurantTier(ctx: AppContext, merchant: Merchant, tier: RestaurantTier): Promise<billingApi.RestaurantSubscriptionResponse> {
  const live = await requireLiveRestaurant(ctx, merchant);
  if (live.restaurantTier === tier) throw conflict(`You're already on ${RESTAURANT_PLANS[tier].name}.`);
  const interval = live.interval === "year" ? "year" : "month";
  const snap = await getPayments(ctx).changeSubscriptionTier({
    subscriptionId: live.stripeSubscriptionId!,
    tier,
    interval,
    unitAmountCents: tierAmount(tier, interval),
    productName: RESTAURANT_PLANS[tier].name,
  });
  const from = live.restaurantTier!;
  const [row] = await ctx.db
    .update(subscriptions)
    .set({ restaurantTier: tier, currentPeriodEnd: snap.currentPeriodEnd ?? live.currentPeriodEnd, updatedAt: ctx.now() })
    .where(eq(subscriptions.id, live.id))
    .returning();
  await audit(ctx, merchant.id, "billing.restaurant_tier_changed", { from, to: tier });
  await dropIncompatibleAddOns(ctx, merchant, tier);
  const mirrored = await recomputeRestaurantTier(ctx, merchant.id);
  return { subscription: restaurantSubscriptionDto(row!), tier: mirrored };
}

export async function cancelRestaurant(ctx: AppContext, merchant: Merchant, immediate: boolean): Promise<billingApi.RestaurantSubscriptionResponse> {
  const live = await requireLiveRestaurant(ctx, merchant);
  const payments = getPayments(ctx);
  if (!immediate) {
    const snap = await payments.cancelSubscription({ subscriptionId: live.stripeSubscriptionId!, atPeriodEnd: true });
    const [row] = await ctx.db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true, currentPeriodEnd: snap.currentPeriodEnd ?? live.currentPeriodEnd, updatedAt: ctx.now() })
      .where(eq(subscriptions.id, live.id))
      .returning();
    await audit(ctx, merchant.id, "billing.restaurant_cancel_at_period_end", { subscriptionId: live.id });
    return { subscription: restaurantSubscriptionDto(row!), tier: merchant.restaurantTier ?? null };
  }
  await payments.cancelSubscription({ subscriptionId: live.stripeSubscriptionId!, atPeriodEnd: false });
  const [row] = await ctx.db.update(subscriptions).set({ status: "canceled", cancelAtPeriodEnd: false, updatedAt: ctx.now() }).where(eq(subscriptions.id, live.id)).returning();
  await ctx.db.update(merchantAddOns).set({ status: "cancelled", stripeSubscriptionItemId: null }).where(eq(merchantAddOns.merchantId, merchant.id));
  await audit(ctx, merchant.id, "billing.restaurant_cancel_now", { subscriptionId: live.id });
  const tier = await recomputeRestaurantTier(ctx, merchant.id);
  return { subscription: restaurantSubscriptionDto(row!), tier };
}

export async function resumeRestaurant(ctx: AppContext, merchant: Merchant): Promise<billingApi.RestaurantSubscriptionResponse> {
  const live = await requireLiveRestaurant(ctx, merchant);
  if (!live.cancelAtPeriodEnd) throw conflict("Your subscription isn't set to cancel");
  await getPayments(ctx).resumeSubscription(live.stripeSubscriptionId!);
  const [row] = await ctx.db.update(subscriptions).set({ cancelAtPeriodEnd: false, updatedAt: ctx.now() }).where(eq(subscriptions.id, live.id)).returning();
  await audit(ctx, merchant.id, "billing.restaurant_resume", { subscriptionId: live.id });
  return { subscription: restaurantSubscriptionDto(row!), tier: merchant.restaurantTier ?? null };
}

/** merchants.restaurantTier = best tier among live restaurant subscriptions, else null. */
export async function recomputeRestaurantTier(ctx: AppContext, merchantId: string): Promise<RestaurantTier | null> {
  const live = await liveRestaurantSubscriptions(ctx, merchantId);
  const tier = live.reduce<RestaurantTier | null>((best, s) => (!best || RESTAURANT_TIER_RANK[s.restaurantTier!] > RESTAURANT_TIER_RANK[best] ? s.restaurantTier! : best), null);
  const [before] = await ctx.db.select({ tier: merchants.restaurantTier }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (before && before.tier !== tier) {
    await ctx.db.update(merchants).set({ restaurantTier: tier, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
    await audit(ctx, merchantId, "billing.restaurant_tier_mirrored", { from: before.tier, to: tier });
  }
  return tier;
}

// ---------------------------------------------------------------------------
// Webhook handlers (Stripe-shaped objects). Dispatched from payments.ts when
// the object's metadata carries restaurant_tier.
// ---------------------------------------------------------------------------
export const isRestaurantObject = (o: Obj): boolean => isTier(o.metadata?.restaurant_tier);

export async function onRestaurantCheckoutCompleted(ctx: AppContext, session: Obj): Promise<void> {
  if (session.mode !== "subscription") return;
  const subId = idOf(session.subscription);
  const customerId = idOf(session.customer);
  const merchant = await merchantFor(ctx, { merchant_id: session.metadata?.merchant_id ?? session.client_reference_id }, customerId);
  const tier = session.metadata?.restaurant_tier;
  if (!merchant || !subId || !isTier(tier)) return;
  const interval = session.metadata?.interval === "year" ? "year" : "month";
  if (customerId && merchant.stripeCustomerId !== customerId) await ctx.db.update(merchants).set({ stripeCustomerId: customerId }).where(eq(merchants.id, merchant.id));
  const inserted = await ctx.db
    .insert(subscriptions)
    .values({ merchantId: merchant.id, plan: "free", restaurantTier: tier, status: "active", interval, stripeSubscriptionId: subId })
    .onConflictDoNothing({ target: subscriptions.stripeSubscriptionId })
    .returning();
  await recomputeRestaurantTier(ctx, merchant.id);
  // Year-one coupon came with Checkout; now queue the 25% lifetime phase.
  if (inserted.length && merchant.foundingOffer) await getPayments(ctx).scheduleFoundingOffer(subId);
}

export async function onRestaurantSubscriptionEvent(ctx: AppContext, sub: Obj, type: string): Promise<void> {
  const merchant = await merchantFor(ctx, sub.metadata, idOf(sub.customer));
  const tier = sub.metadata?.restaurant_tier;
  if (!merchant || !isTier(tier)) return;
  const items: Obj[] = sub.items?.data ?? [];
  const interval = (items[0]?.price?.recurring?.interval ?? sub.metadata?.interval) === "year" ? "year" : "month";
  const deleted = type === "customer.subscription.deleted";
  const status = deleted ? "canceled" : mapStatus(String(sub.status));
  const values = { plan: "free" as const, restaurantTier: tier, status, interval, currentPeriodEnd: subscriptionPeriodEnd(sub), cancelAtPeriodEnd: !!sub.cancel_at_period_end, updatedAt: ctx.now() };
  await ctx.db
    .insert(subscriptions)
    .values({ merchantId: merchant.id, stripeSubscriptionId: String(sub.id), ...values })
    .onConflictDoUpdate({ target: subscriptions.stripeSubscriptionId, set: values });

  // Reconcile add-ons with the subscription's items (portal edits, renewals, cancellation).
  const seen = new Set<string>();
  if (status !== "canceled") {
    for (const item of items) {
      const id = item.metadata?.add_on_id;
      if (!(ADD_ON_IDS as readonly string[]).includes(id)) continue;
      seen.add(id);
      const quantity = Math.max(1, Number(item.quantity ?? 1));
      await ctx.db
        .insert(merchantAddOns)
        .values({ merchantId: merchant.id, addOnId: id, quantity, status: "active", stripeSubscriptionItemId: String(item.id) })
        .onConflictDoUpdate({ target: [merchantAddOns.merchantId, merchantAddOns.addOnId], set: { quantity, status: "active", stripeSubscriptionItemId: String(item.id) } });
    }
  }
  for (const r of await addOnRows(ctx, merchant.id)) {
    if (r.status === "active" && !seen.has(r.addOnId)) {
      await ctx.db.update(merchantAddOns).set({ status: "cancelled", stripeSubscriptionItemId: null }).where(and(eq(merchantAddOns.merchantId, merchant.id), eq(merchantAddOns.addOnId, r.addOnId)));
    }
  }
  await recomputeRestaurantTier(ctx, merchant.id);
}

/** A paid renewal: WhatsApp packs add their messages for the new period. */
export async function onRestaurantInvoicePaid(ctx: AppContext, invoice: Obj): Promise<void> {
  if (invoice.billing_reason !== "subscription_cycle") return;
  const subId = idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);
  if (!subId) return;
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subId)).limit(1);
  if (!sub?.restaurantTier) return;
  const [pack] = await ctx.db
    .select()
    .from(merchantAddOns)
    .where(and(eq(merchantAddOns.merchantId, sub.merchantId), eq(merchantAddOns.addOnId, "whatsapp_1000"), eq(merchantAddOns.status, "active")));
  if (pack) await grantWhatsappCredits(ctx, sub.merchantId, sub.interval === "year" ? 12 : 1, pack.quantity);
}
