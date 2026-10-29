/**
 * API contract for the "billing" area (plan subscriptions) and Stripe Connect
 * onboarding for in-app payments. Routes: apps/api/src/routes/billing and
 * routes/payments. Endpoint docs: docs/engineering/api/billing.md and
 * docs/engineering/api/payments.md.
 *
 * Free stays free forever: downgrading keeps every member, point, reward and
 * free feature. Paid plans can't be bought until their features are rolled out.
 */
import { z } from "zod";
import { ADD_ON_IDS, RESTAURANT_TIERS, type AddOnId, type BillingInterval, type PlanId, type PromoAllowance, type RestaurantTier } from "../plans.js";

export const checkoutBody = z.object({
  /** plus = Pro, studio = Studio, pro = Service. */
  plan: z.enum(["plus", "studio", "pro"]),
  interval: z.enum(["month", "year"]).default("month"),
  /** Where Stripe Checkout returns. Defaults to the merchant dashboard billing page. */
  successUrl: z.url().optional(),
  cancelUrl: z.url().optional(),
});
export type CheckoutBody = z.input<typeof checkoutBody>;

export const portalBody = z.object({ returnUrl: z.url().optional() });

export const downgradeBody = z.object({
  /** true = drop to Free now (no refund for the current period). Default: at period end. */
  immediate: z.boolean().default(false),
});
export type DowngradeBody = z.input<typeof downgradeBody>;

export const connectBody = z.object({ returnUrl: z.url().optional(), refreshUrl: z.url().optional() });

export interface PlanOptionDto {
  id: PlanId;
  name: string;
  priceCents: number;
  annualPriceCents: number;
  currency: "CAD";
  blurb: string;
  bestFor: string[];
  smsPerMonth: number;
  /** Paid plans are purchasable only once rolled out. Free is always available. */
  available: boolean;
  current: boolean;
  /** Paid plans include in-app payments at this platform fee (basis points). */
  platformFeeBps: number;
}

export interface SubscriptionDto {
  id: string;
  plan: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  interval: "month" | "year";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

/** GET /v1/merchants/:merchantId/billing */
export interface BillingOverviewResponse {
  plan: PlanId;
  /** Restaurant pack tier (mirrors merchants.restaurantTier), null when not on the pack. */
  restaurantTier?: RestaurantTier | null;
  subscription: SubscriptionDto | null;
  plans: PlanOptionDto[];
  /** Has a Stripe customer (the portal link works). */
  hasBillingAccount: boolean;
  /** phase-solo A: calendars, texts, promos and the annual website for this shop. */
  usage?: PlanUsageDto;
  /** phase-pro P1: the first-year price of annual Pro as this shop sees it. */
  firstYearPrice?: FirstYearPriceDto;
}

// ---- phase-solo: A ----
/** GET /v1/merchants/:merchantId/billing/usage (manager+): what the plan allows and what is used this period. */
export interface PlanUsageDto {
  plan: PlanId;
  interval: BillingInterval | null;
  /** Bookable calendars: limit null = unlimited. */
  calendars: { limit: number | null; used: number };
  /** Texts this month: Free stops at includedPerMonth (then email); paid plans go over at overageCentsEach. */
  texts: { includedPerMonth: number; used: number; remaining: number; overageTexts: number; overageCents: number; overageCentsEach: number };
  /** Promos to regulars this billing period (PROMOS_PER_MONTH_PLUS / PROMOS_PER_YEAR_ANNUAL). */
  promos: PromoAllowance;
  /** On the annual plan: the website builder is included (site.builder). */
  annualSiteEntitled: boolean;
  /** phase-pro P1: the live trial (texts.includedPerMonth is then TRIAL_SMS_CAP), or null. */
  trial?: TrialDto | null;
  /** phase-pro P1: the shop has used its one trial (live or ended). */
  trialUsed?: boolean;
  /** phase-pro P1: when the trial ended, if it ended without a paid plan (the billing page's "Pro ended {weekday}"). */
  trialEndedAt?: string | null;
}

// ---- end phase-solo: A ----

// ---- phase-pro: p1 ----
/**
 * The first-year price of annual Pro (FIRST_YEAR_PRICE): shown as a struck-through list price, never named. GET
 * /v1/billing/first-year-price returns the public part. The spots counter stays internal: neither DTO carries it.
 */
export interface FirstYearPriceDto {
  /** On offer right now (enabled, cheaper than the list price, spots left). */
  shown: boolean;
  /** Year-one price in cents. */
  priceCents: number;
  /** The annual list price it renews at (the struck-through number). */
  listPriceCents: number;
  /** This shop can take it on an annual Pro checkout (always false on the public endpoint). */
  eligible: boolean;
  /** This shop already took it. */
  taken: boolean;
}

/** A live trial: the plan it gives, when it ends and whole days left. */
export interface TrialDto {
  plan: PlanId;
  endsAt: string;
  daysLeft: number;
}

/** POST /v1/merchants/:merchantId/billing/trial: starts the one 14-day trial (409 once used, or on a paid plan). */
export interface TrialStartResponse {
  plan: PlanId;
  startedAt: string;
  endsAt: string;
}
// ---- end phase-pro: p1 ----

export interface CheckoutResponse {
  sessionId: string;
  url: string;
}

export interface UrlResponse {
  url: string;
}

/** GET /v1/merchants/:merchantId/payments/status */
export interface ConnectStatusResponse {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  platformFeeBps: number;
  provider: "fake" | "stripe";
}

/** POST /v1/merchants/:merchantId/payments/connect */
export interface ConnectResponse {
  accountId: string;
  url: string;
}

// ===========================================================================
// Restaurant pack subscriptions, add-ons, fees, invoices, charge mode
// ===========================================================================

export const restaurantCheckoutBody = z.object({
  tier: z.enum(RESTAURANT_TIERS),
  interval: z.enum(["month", "year"]).default("month"),
  successUrl: z.url().optional(),
  cancelUrl: z.url().optional(),
});
export type RestaurantCheckoutBody = z.input<typeof restaurantCheckoutBody>;

/** Move a live restaurant subscription to another tier (prorated by Stripe). */
export const restaurantChangeBody = z.object({ tier: z.enum(RESTAURANT_TIERS) });
export type RestaurantChangeBody = z.input<typeof restaurantChangeBody>;

/** Attach an add-on, or change its quantity (only extra_location takes more than 1). */
export const attachAddOnBody = z.object({ quantity: z.number().int().min(1).max(50).default(1) });
export type AttachAddOnBody = z.input<typeof attachAddOnBody>;

export const addOnIdParam = z.enum(ADD_ON_IDS);

export const setChargeModeBody = z.object({ chargeMode: z.enum(["destination", "direct"]), reason: z.string().trim().min(5, "Give a reason").max(500).optional() });

export interface RestaurantPlanOptionDto {
  tier: RestaurantTier;
  name: string;
  priceCents: number;
  annualPriceCents: number;
  currency: "CAD";
  blurb: string;
  whatsappPerMonth: number;
  current: boolean;
  /** Price after the founding offer's first-year discount (null when the merchant has no founding offer). */
  foundingPriceCents: number | null;
  foundingLifetimePriceCents: number | null;
}

export interface RestaurantSubscriptionDto {
  id: string;
  tier: RestaurantTier;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  interval: "month" | "year";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export interface AddOnDto {
  id: AddOnId;
  name: string;
  priceCents: number;
  unit: "month" | "pack";
  /** Quantity attached (0 = not attached). */
  quantity: number;
  active: boolean;
  /** Can it be attached right now, and if not, why (shown in the UI). */
  available: boolean;
  unavailableReason: string | null;
  /** Feature keys the add-on unlocks (banquet module, phone assistant). */
  unlocks: string[];
}

export interface FeeRowDto {
  kind: "order" | "deposit" | "invoice" | "tiffin";
  label: string;
  platformFeeBps: number;
  /** Optional customer service fee in cents (orders only), else 0. */
  customerFeeCents: number;
  note: string;
}

export interface FoundingOfferDto {
  eligible: boolean;
  firstYearPct: number;
  lifetimePct: number;
}

/** GET /v1/merchants/:merchantId/billing/restaurant */
export interface RestaurantBillingResponse {
  tier: RestaurantTier | null;
  subscription: RestaurantSubscriptionDto | null;
  plans: RestaurantPlanOptionDto[];
  addOns: AddOnDto[];
  fees: FeeRowDto[];
  foundingOffer: FoundingOfferDto;
  whatsapp: { includedPerMonth: number; extraCredits: number; used: number };
  chargeMode: "destination" | "direct";
}

export interface InvoiceDto {
  id: string;
  number: string | null;
  status: string;
  totalCents: number;
  amountPaidCents: number;
  currency: string;
  description: string | null;
  createdAt: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

/** GET /v1/merchants/:merchantId/billing/invoices */
export interface InvoicesResponse {
  items: InvoiceDto[];
  nextCursor: null;
}

export interface RestaurantSubscriptionResponse {
  subscription: RestaurantSubscriptionDto;
  tier: RestaurantTier | null;
}

export interface AddOnResponse {
  addOn: AddOnDto;
}

/** PUT /v1/admin/merchants/:merchantId/charge-mode */
export interface ChargeModeResponse {
  merchantId: string;
  chargeMode: "destination" | "direct";
  /** Direct charges only take effect while STRIPE_DIRECT_CHARGES is on. */
  directChargesEnabled: boolean;
  /**
   * Tiffin subscriptions whose saved customer / card were cleared because the mode changed (they live on the old
   * account); each customer is asked to re-add their card at the next renewal. 0 when the mode did not change.
   */
  tiffinSubscriptionsReset: number;
}
