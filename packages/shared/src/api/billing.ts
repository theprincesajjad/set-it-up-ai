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
import type { PlanId } from "../plans.js";

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
