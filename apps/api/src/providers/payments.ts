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
import { type AddOnId, type RestaurantTier } from "@ll/shared";
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

/**
 * destination: charge on the platform account, funds transferred to the merchant
 * (platform is merchant of record, today's default). direct: charge created ON the
 * merchant's connected account (merchant of record) with application_fee_amount.
 */
export type ChargeMode = "destination" | "direct";

export interface PaymentIntentInfo {
  id: string;
  clientSecret: string;
  status: string;
  amountCents: number;
  applicationFeeCents: number;
  metadata: Record<string, string>;
  chargeMode?: ChargeMode;
  paymentMethodTypes?: string[];
  /** The Stripe Customer the intent belongs to, when it has one. */
  customerId?: string | null;
  /** The payment method used (pm_...) once confirmed. */
  paymentMethodId?: string | null;
  /** Stripe's last_payment_error.code of the latest failed attempt (authentication_required, card_declined, ...). */
  lastErrorCode?: string | null;
}

/** A payment method kept on a customer for off-session renewals. */
export interface SavedPaymentMethod {
  id: string;
  type: "card" | "pad";
  /** visa, mastercard, ... (cards) or the bank name (PAD). */
  brand: string | null;
  last4: string | null;
}

export interface CreatePayerCustomerArgs {
  userId: string;
  merchantId: string;
  email?: string | null;
  name?: string | null;
  /** Set for direct charges: the customer lives on the merchant's connected account. Omit for destination charges (platform account). */
  connectedAccountId?: string | null;
}

/** Where a SetupIntent / saved payment method lives: the connected account for direct charges, else the platform. */
export interface SavedMethodScope {
  chargeMode?: ChargeMode;
  connectedAccountId?: string | null;
}

export interface CreateSetupIntentArgs extends SavedMethodScope {
  customerId: string;
  /** Stripe payment method types, e.g. ["acss_debit"]. Omit for automatic (card, wallets). */
  paymentMethodTypes?: string[];
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export interface SetupIntentInfo {
  id: string;
  clientSecret: string;
  status: string;
  customerId: string | null;
  paymentMethodId: string | null;
  metadata: Record<string, string>;
  paymentMethodTypes?: string[];
}

/**
 * Outcome of confirming a saved method off-session. authentication_required: the bank wants the customer
 * present (the intent stays open for them to confirm); declined: the payment failed; processing: PAD,
 * settles later by webhook.
 */
export type OffSessionOutcome = "succeeded" | "processing" | "authentication_required" | "declined";
export interface OffSessionResult {
  outcome: OffSessionOutcome;
  intent: PaymentIntentInfo;
  /** Stripe error code or decline reason when not succeeded. */
  errorCode?: string;
  message?: string;
}

export interface CreatePaymentIntentArgs {
  amountCents: number;
  /** Merchant's Connect account (destination charge). */
  connectedAccountId: string;
  /** Platform fee kept by us (from computeFees). */
  applicationFeeCents: number;
  description: string;
  /** Must include ll_kind (order | deposit | invoice | tiffin), ll_id and merchant_id. */
  metadata: Record<string, string>;
  idempotencyKey: string;
  receiptEmail?: string | null;
  /** Stripe payment method types, e.g. ["acss_debit"] for pre-authorized debit (tiffin PAD). Omit for automatic (card, wallets). */
  paymentMethodTypes?: string[];
  /** Default "destination". Use chargeModeFor() in services/payments.ts to resolve it for a merchant. */
  chargeMode?: ChargeMode;
  /** Attach the intent to this customer (created with createPayerCustomer, on the same account as the charge). */
  customerId?: string;
  /** Keep the payment method on the customer for later off-session charges (cards; PAD also records a mandate). Needs customerId. */
  setupFutureUsage?: "off_session";
}

/**
 * A charge to a MERCHANT for platform services (ad spend, BIA campaign fees).
 * Money goes to the platform's own Stripe account: no destination, no application fee.
 */
export interface PlatformChargeArgs {
  merchantId: string;
  /** Merchant's Stripe customer; created (and returned) when absent. */
  stripeCustomerId?: string | null;
  /** Used when a customer has to be created. */
  customerName?: string;
  customerEmail?: string | null;
  amountCents: number;
  description: string;
  /** Must include kind ("ad_campaign" | "bia_campaign" | ...) and id. */
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export interface PlatformChargeResult {
  /** PaymentIntent id. */
  id: string;
  clientSecret: string;
  status: string;
  /** The Stripe customer charged (store it on merchants.stripe_customer_id). */
  customerId: string;
}

/** Marker added to platform-charge metadata so the webhook can route it. */
export const PLATFORM_CHARGE_MARKER = "ll_platform_charge";

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
  /** Restaurant pack checkout: the tier being bought (plan is then "plus", the tier's Café & Retail floor). */
  restaurantTier?: RestaurantTier;
  /** Stripe coupon id applied at checkout (founding offer year one). */
  couponId?: string;
  interval: BillingInterval;
  /** Configured Stripe Price id; when absent an inline CAD price is used. */
  priceId?: string;
  unitAmountCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

/** One line of Stripe Billing invoice history. */
export interface ProviderInvoice {
  id: string;
  number: string | null;
  status: string;
  totalCents: number;
  amountPaidCents: number;
  currency: string;
  description: string | null;
  createdAt: Date;
  hostedUrl: string | null;
  pdfUrl: string | null;
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
  retrievePaymentIntent(id: string, opts?: { connectedAccountId?: string }): Promise<PaymentIntentInfo>;
  /** Charge a merchant for platform services (PaymentIntent on the platform account). */
  createPlatformCharge(args: PlatformChargeArgs): Promise<PlatformChargeResult>;
  // Saved payment methods (tiffin renewals)
  /** A customer (a person paying a merchant) on the platform or the merchant's connected account. Idempotent per user + scope. */
  createPayerCustomer(args: CreatePayerCustomerArgs): Promise<{ customerId: string }>;
  /** SetupIntent to save or replace the payment method without charging. Confirm client-side with the client secret. */
  createSetupIntent(args: CreateSetupIntentArgs): Promise<SetupIntentInfo>;
  retrieveSetupIntent(id: string, scope?: SavedMethodScope): Promise<SetupIntentInfo>;
  retrievePaymentMethod(id: string, scope?: SavedMethodScope): Promise<SavedPaymentMethod>;
  /** Create the payment and confirm it with the saved method right away (`off_session: true, confirm: true`). Never throws for a card problem: see OffSessionResult. */
  chargeSavedMethod(args: CreatePaymentIntentArgs & { customerId: string; paymentMethodId: string }): Promise<OffSessionResult>;
  refund(args: {
    paymentIntentId: string;
    amountCents?: number;
    idempotencyKey: string;
    reason?: string;
    /** Required for direct charges on Stripe (the charge lives on the merchant's account). */
    connectedAccountId?: string;
    chargeMode?: ChargeMode;
  }): Promise<{ id: string; status: string; amountCents: number }>;
  // Billing
  createCustomer(args: { merchantId: string; email?: string | null; name: string }): Promise<{ customerId: string }>;
  createSubscriptionCheckout(args: CheckoutArgs): Promise<{ id: string; url: string }>;
  createPortalSession(args: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  cancelSubscription(args: { subscriptionId: string; atPeriodEnd: boolean }): Promise<SubscriptionSnapshot>;
  resumeSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
  /** Restaurant pack: swap the tier price on the subscription (prorated) and update its metadata. */
  changeSubscriptionTier(args: { subscriptionId: string; tier: RestaurantTier; interval: BillingInterval; unitAmountCents: number; productName: string }): Promise<SubscriptionSnapshot>;
  /** Add-ons are subscription items on the restaurant subscription. */
  addSubscriptionItem(args: { subscriptionId: string; addOnId: AddOnId; quantity: number; interval: BillingInterval; unitAmountCents: number; name: string }): Promise<{ itemId: string }>;
  updateSubscriptionItem(args: { itemId: string; quantity: number }): Promise<void>;
  removeSubscriptionItem(itemId: string): Promise<void>;
  /** Founding offer: 50% off for 12 months, then 25% off for life, as a two-phase schedule on the subscription. */
  scheduleFoundingOffer(subscriptionId: string): Promise<void>;
  /** Stripe coupon id for the first phase of the founding offer (created on demand). */
  foundingCouponId(): Promise<string>;
  listInvoices(customerId: string, limit?: number): Promise<ProviderInvoice[]>;
  // Webhooks
  /** Verify the signature header against the raw body. Throws on mismatch. */
  verifyWebhook(rawBody: string, signatureHeader: string | undefined): PaymentsEvent;
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
