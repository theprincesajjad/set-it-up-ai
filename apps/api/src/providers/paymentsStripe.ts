/**
 * Stripe implementation (active when STRIPE_SECRET_KEY is set).
 *
 *  - Connect: Express accounts in Canada; onboarding via Account Links.
 *  - Payments: destination charges (transfer_data.destination = merchant's
 *    account) with application_fee_amount = PLATFORM_PAYMENT_FEE_BPS.
 *  - Billing: Checkout in subscription mode (CAD) + Customer Portal.
 *  - Webhooks: signature verified with STRIPE_WEBHOOK_SECRET.
 */
import Stripe from "stripe";
import type { Config } from "../config.js";
import type {
  CheckoutArgs,
  ConnectAccountStatus,
  CreatePaymentIntentArgs,
  PaymentIntentInfo,
  PaymentsEvent,
  PaymentsProvider,
  SubscriptionSnapshot,
} from "./payments.js";

export class StripePayments implements PaymentsProvider {
  readonly name = "stripe" as const;
  readonly stripe: Stripe;
  private readonly webhookSecret?: string;

  constructor(config: Pick<Config, "stripe">, client?: Stripe) {
    if (!config.stripe.secretKey && !client) throw new Error("STRIPE_SECRET_KEY is not set");
    this.stripe = client ?? new Stripe(config.stripe.secretKey!, { appInfo: { name: "Local Loyalty" }, maxNetworkRetries: 2 });
    this.webhookSecret = config.stripe.webhookSecret;
  }

  async createConnectedAccount(args: { merchantId: string; email?: string | null; businessName: string }) {
    const acct = await this.stripe.accounts.create(
      {
        type: "express",
        country: "CA",
        default_currency: "cad",
        email: args.email ?? undefined,
        business_profile: { name: args.businessName },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { merchant_id: args.merchantId },
      },
      { idempotencyKey: `connect-account:${args.merchantId}` },
    );
    return { accountId: acct.id };
  }

  async createOnboardingLink(args: { accountId: string; refreshUrl: string; returnUrl: string }) {
    const link = await this.stripe.accountLinks.create({ account: args.accountId, refresh_url: args.refreshUrl, return_url: args.returnUrl, type: "account_onboarding" });
    return { url: link.url };
  }

  async getAccountStatus(accountId: string): Promise<ConnectAccountStatus> {
    const a = await this.stripe.accounts.retrieve(accountId);
    return { accountId, chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled, detailsSubmitted: !!a.details_submitted };
  }

  async createPaymentIntent(args: CreatePaymentIntentArgs): Promise<PaymentIntentInfo> {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: args.amountCents,
        currency: "cad",
        application_fee_amount: args.applicationFeeCents,
        transfer_data: { destination: args.connectedAccountId },
        on_behalf_of: args.connectedAccountId,
        automatic_payment_methods: { enabled: true },
        description: args.description,
        metadata: args.metadata,
        receipt_email: args.receiptEmail ?? undefined,
      },
      { idempotencyKey: args.idempotencyKey },
    );
    return toInfo(pi);
  }

  async retrievePaymentIntent(id: string): Promise<PaymentIntentInfo> {
    return toInfo(await this.stripe.paymentIntents.retrieve(id));
  }

  async refund(args: { paymentIntentId: string; amountCents?: number; idempotencyKey: string; reason?: string }) {
    const r = await this.stripe.refunds.create(
      {
        payment_intent: args.paymentIntentId,
        amount: args.amountCents,
        // Destination charge: pull the funds back from the merchant and return our fee.
        reverse_transfer: true,
        refund_application_fee: true,
        reason: "requested_by_customer",
        metadata: args.reason ? { reason: args.reason.slice(0, 450) } : undefined,
      },
      { idempotencyKey: args.idempotencyKey },
    );
    return { id: r.id, status: r.status ?? "pending", amountCents: r.amount };
  }

  async createCustomer(args: { merchantId: string; email?: string | null; name: string }) {
    const c = await this.stripe.customers.create(
      { name: args.name, email: args.email ?? undefined, metadata: { merchant_id: args.merchantId } },
      { idempotencyKey: `billing-customer:${args.merchantId}` },
    );
    return { customerId: c.id };
  }

  async createSubscriptionCheckout(args: CheckoutArgs) {
    const metadata = { merchant_id: args.merchantId, plan: args.plan, interval: args.interval };
    const lineItem = args.priceId
      ? { price: args.priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: "cad",
            unit_amount: args.unitAmountCents,
            recurring: { interval: args.interval },
            product_data: { name: args.productName },
          },
        };
    const s = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: args.customerId,
      client_reference_id: args.merchantId,
      line_items: [lineItem],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata,
      subscription_data: { metadata },
      allow_promotion_codes: true,
    });
    return { id: s.id, url: s.url ?? "" };
  }

  async createPortalSession(args: { customerId: string; returnUrl: string }) {
    const s = await this.stripe.billingPortal.sessions.create({ customer: args.customerId, return_url: args.returnUrl });
    return { url: s.url };
  }

  async cancelSubscription(args: { subscriptionId: string; atPeriodEnd: boolean }): Promise<SubscriptionSnapshot> {
    const sub = args.atPeriodEnd
      ? await this.stripe.subscriptions.update(args.subscriptionId, { cancel_at_period_end: true })
      : await this.stripe.subscriptions.cancel(args.subscriptionId);
    return toSnapshot(sub);
  }

  async resumeSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    return toSnapshot(await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false }));
  }

  verifyWebhook(rawBody: string, signatureHeader: string | undefined): PaymentsEvent {
    if (!this.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    if (!signatureHeader) throw new Error("Missing signature");
    const ev = this.stripe.webhooks.constructEvent(rawBody, signatureHeader, this.webhookSecret);
    return ev as unknown as PaymentsEvent;
  }
}

function toInfo(pi: Stripe.PaymentIntent): PaymentIntentInfo {
  return {
    id: pi.id,
    clientSecret: pi.client_secret ?? "",
    status: pi.status,
    amountCents: pi.amount,
    applicationFeeCents: pi.application_fee_amount ?? 0,
    metadata: (pi.metadata ?? {}) as Record<string, string>,
  };
}

/** current_period_end lives on subscription items in recent API versions; fall back to the legacy field. */
export function subscriptionPeriodEnd(sub: { items?: { data?: { current_period_end?: number | null }[] }; current_period_end?: number | null }): Date | null {
  const item = sub.items?.data?.[0]?.current_period_end;
  const legacy = sub.current_period_end;
  const secs = item ?? legacy;
  return secs ? new Date(secs * 1000) : null;
}

function toSnapshot(sub: Stripe.Subscription): SubscriptionSnapshot {
  return {
    id: sub.id,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: subscriptionPeriodEnd(sub as unknown as Parameters<typeof subscriptionPeriodEnd>[0]),
  };
}
