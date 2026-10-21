/**
 * Payments provider: Stripe Connect (Express accounts, destination charges
 * with a platform application fee) + Stripe Billing (plan subscriptions).
 *
 * Two implementations:
 *  - FakePayments (providers/paymentsFake.ts): deterministic, in-memory, used
 *    in dev/test. Payments "succeed" only when simulated (dev endpoint or test).
 *  - StripePayments (providers/paymentsStripe.ts): used when STRIPE_SECRET_KEY is set.
 *
 * Use `getPayments(ctx)`; never construct a provider in a route.
 */
import { PLATFORM_PAYMENT_FEE_BPS } from "@ll/shared";
import type { Config } from "../config.js";
import type { AppContext } from "../context.js";
import { FakePayments } from "./paymentsFake.js";
import { StripePayments } from "./paymentsStripe.js";

export type BillingInterval = "month" | "year";

export interface ConnectAccountStatus {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface PaymentIntentInfo {
  id: string;
  clientSecret: string;
  status: string;
  amountCents: number;
  applicationFeeCents: number;
  metadata: Record<string, string>;
}

export interface CreatePaymentIntentArgs {
  amountCents: number;
  /** Merchant's Connect account (destination charge). */
  connectedAccountId: string;
  /** Platform fee kept by us (PLATFORM_PAYMENT_FEE_BPS of the amount). */
  applicationFeeCents: number;
  description: string;
  /** Must include ll_kind (order | deposit | invoice), ll_id and merchant_id. */
  metadata: Record<string, string>;
  idempotencyKey: string;
  receiptEmail?: string | null;
}

export interface SubscriptionSnapshot {
  id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}

export interface CheckoutArgs {
  customerId: string;
  merchantId: string;
  plan: "plus" | "pro";
  interval: BillingInterval;
  /** Configured Stripe Price id; when absent an inline CAD price is used. */
  priceId?: string;
  unitAmountCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

/** Stripe-shaped event; FakePayments produces the same shape. */
export interface PaymentsEvent {
  id: string;
  type: string;
  account?: string | null;
  created?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { object: Record<string, any> };
}

export interface PaymentsProvider {
  readonly name: "fake" | "stripe";
  // Connect
  createConnectedAccount(args: { merchantId: string; email?: string | null; businessName: string }): Promise<{ accountId: string }>;
  createOnboardingLink(args: { accountId: string; refreshUrl: string; returnUrl: string }): Promise<{ url: string }>;
  getAccountStatus(accountId: string): Promise<ConnectAccountStatus>;
  // Payments
  createPaymentIntent(args: CreatePaymentIntentArgs): Promise<PaymentIntentInfo>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentInfo>;
  refund(args: { paymentIntentId: string; amountCents?: number; idempotencyKey: string; reason?: string }): Promise<{ id: string; status: string; amountCents: number }>;
  // Billing
  createCustomer(args: { merchantId: string; email?: string | null; name: string }): Promise<{ customerId: string }>;
  createSubscriptionCheckout(args: CheckoutArgs): Promise<{ id: string; url: string }>;
  createPortalSession(args: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  cancelSubscription(args: { subscriptionId: string; atPeriodEnd: boolean }): Promise<SubscriptionSnapshot>;
  resumeSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
  // Webhooks
  /** Verify the signature header against the raw body. Throws on mismatch. */
  verifyWebhook(rawBody: string, signatureHeader: string | undefined): PaymentsEvent;
}

/** 0.75% platform fee on in-app payments, rounded to the nearest cent. */
export function platformFeeCents(amountCents: number): number {
  return Math.round((Math.max(0, amountCents) * PLATFORM_PAYMENT_FEE_BPS) / 10000);
}

export function createPaymentsProvider(config: Config): PaymentsProvider {
  return config.stripe.secretKey ? new StripePayments(config) : new FakePayments(config);
}

const cache = new WeakMap<object, PaymentsProvider>();

/**
 * The payments provider for this app context. Uses ctx.providers.payments when
 * set (tests can inject one), otherwise a per-context StripePayments (when
 * STRIPE_SECRET_KEY is set) or FakePayments.
 */
export function getPayments(ctx: Pick<AppContext, "providers" | "config">): PaymentsProvider {
  if (ctx.providers.payments) return ctx.providers.payments;
  let p = cache.get(ctx.providers);
  if (!p) {
    p = createPaymentsProvider(ctx.config);
    cache.set(ctx.providers, p);
  }
  return p;
}

export { FakePayments, StripePayments };
