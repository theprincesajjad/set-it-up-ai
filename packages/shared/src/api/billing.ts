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
import { ADD_ON_IDS, RESTAURANT_TIERS, type AddOnId, type PlanId, type RestaurantTier } from "../plans.js";

export const checkoutBody = z.object({
  plan: z.enum(["plus", "pro"]),
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
}

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

export const setChargeModeBody = z.object({ chargeMode: z.enum(["destination", "direct"]) });

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
}
