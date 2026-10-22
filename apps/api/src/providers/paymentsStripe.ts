/**
 * Stripe implementation (active when STRIPE_SECRET_KEY is set).
 *
 *  - Connect: Express accounts in Canada; onboarding via Account Links.
 *  - Payments: destination charges (transfer_data.destination = merchant's
 *    account) with application_fee_amount, or direct charges created on the
 *    connected account (chargeMode "direct", merchant of record) with the same
 *    application_fee_amount.
 *  - Billing: Checkout in subscription mode (CAD) + Customer Portal.
 *  - Webhooks: signature verified with STRIPE_WEBHOOK_SECRET.
 */
import Stripe from "stripe";
import type { Config } from "../config.js";
import type { AddOnId, RestaurantTier } from "@ll/shared";
import { FOUNDING_OFFER } from "@ll/shared";
import type {
  BillingInterval,
  ChargeMode,
  CheckoutArgs,
  ConnectAccountStatus,
  CreatePaymentIntentArgs,
  PaymentIntentInfo,
  PaymentsEvent,
  PaymentsProvider,
  PlatformChargeArgs,
  PlatformChargeResult,
  ProviderInvoice,
  SubscriptionSnapshot,
} from "./payments.js";
import { PLATFORM_CHARGE_MARKER } from "./payments.js";

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
    if (args.chargeMode === "direct") {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: args.amountCents,
          currency: "cad",
          application_fee_amount: args.applicationFeeCents,
          automatic_payment_methods: { enabled: true },
          description: args.description,
          metadata: { ...args.metadata, ll_charge_mode: "direct", ll_account: args.connectedAccountId },
          receipt_email: args.receiptEmail ?? undefined,
        },
        { idempotencyKey: args.idempotencyKey, stripeAccount: args.connectedAccountId },
      );
      return toInfo(pi);
    }
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: args.amountCents,
        currency: "cad",
        application_fee_amount: args.applicationFeeCents,
        transfer_data: { destination: args.connectedAccountId },
        on_behalf_of: args.connectedAccountId,
        ...(args.paymentMethodTypes?.length
          ? {
              payment_method_types: args.paymentMethodTypes,
              ...(args.paymentMethodTypes.includes("acss_debit")
                ? { payment_method_options: { acss_debit: { mandate_options: { payment_schedule: "combined", interval_description: "Tiffin subscription", transaction_type: "personal" as const }, verification_method: "automatic" as const } } }
                : {}),
            }
          : { automatic_payment_methods: { enabled: true } }),
        description: args.description,
        metadata: args.metadata,
        receipt_email: args.receiptEmail ?? undefined,
      },
      { idempotencyKey: args.idempotencyKey },
    );
    return toInfo(pi);
  }

  async createPlatformCharge(args: PlatformChargeArgs): Promise<PlatformChargeResult> {
    const customerId = args.stripeCustomerId ?? (await this.createCustomer({ merchantId: args.merchantId, email: args.customerEmail, name: args.customerName ?? args.merchantId })).customerId;
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: args.amountCents,
        currency: "cad",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        setup_future_usage: "off_session",
        description: args.description,
        metadata: { ...args.metadata, merchant_id: args.merchantId, [PLATFORM_CHARGE_MARKER]: "true" },
      },
      { idempotencyKey: args.idempotencyKey },
    );
    return { id: pi.id, clientSecret: pi.client_secret ?? "", status: pi.status, customerId };
  }

  async retrievePaymentIntent(id: string, opts?: { connectedAccountId?: string }): Promise<PaymentIntentInfo> {
    return toInfo(await this.stripe.paymentIntents.retrieve(id, undefined, opts?.connectedAccountId ? { stripeAccount: opts.connectedAccountId } : undefined));
  }

  async refund(args: { paymentIntentId: string; amountCents?: number; idempotencyKey: string; reason?: string; connectedAccountId?: string; chargeMode?: ChargeMode }) {
    const direct = args.chargeMode === "direct";
    if (direct && !args.connectedAccountId) throw new Error("Refunding a direct charge needs its connectedAccountId");
    const r = await this.stripe.refunds.create(
      {
        payment_intent: args.paymentIntentId,
        amount: args.amountCents,
        // Destination charge: pull the funds back from the merchant and return our fee.
        // Direct charge: the refund runs on the merchant's account; we only return our fee.
        ...(direct ? {} : { reverse_transfer: true }),
        refund_application_fee: true,
        reason: "requested_by_customer",
        metadata: args.reason ? { reason: args.reason.slice(0, 450) } : undefined,
      },
      { idempotencyKey: args.idempotencyKey, ...(direct ? { stripeAccount: args.connectedAccountId } : {}) },
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
    const metadata = { merchant_id: args.merchantId, plan: args.plan, interval: args.interval, ...(args.restaurantTier ? { restaurant_tier: args.restaurantTier } : {}) };
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
      // Stripe rejects discounts + allow_promotion_codes together; the founding coupon wins.
      ...(args.couponId ? { discounts: [{ coupon: args.couponId }] } : { allow_promotion_codes: true }),
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

  // ---- Restaurant pack: tier changes, add-on items, founding offer, invoices ----
  /** Price by lookup key (created on first use) so restaurant prices need no env configuration. */
  private async priceFor(lookupKey: string, unitAmountCents: number, interval: BillingInterval, name: string): Promise<string> {
    const key = `${lookupKey}_${interval}_${unitAmountCents}`;
    const found = await this.stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    if (found.data[0]) return found.data[0].id;
    const created = await this.stripe.prices.create({
      currency: "cad",
      unit_amount: unitAmountCents,
      recurring: { interval },
      lookup_key: key,
      transfer_lookup_key: true,
      product_data: { name },
    });
    return created.id;
  }

  async changeSubscriptionTier(args: { subscriptionId: string; tier: RestaurantTier; interval: BillingInterval; unitAmountCents: number; productName: string }): Promise<SubscriptionSnapshot> {
    const sub = await this.stripe.subscriptions.retrieve(args.subscriptionId);
    const base = sub.items.data.find((i) => !i.metadata?.add_on_id);
    if (!base) throw new Error("Subscription has no plan item");
    const price = await this.priceFor(`ll_restaurant_${args.tier}`, args.unitAmountCents, args.interval, args.productName);
    const updated = await this.stripe.subscriptions.update(args.subscriptionId, {
      items: [{ id: base.id, price }],
      metadata: { ...sub.metadata, restaurant_tier: args.tier },
      proration_behavior: "create_prorations",
    });
    return toSnapshot(updated);
  }

  async addSubscriptionItem(args: { subscriptionId: string; addOnId: AddOnId; quantity: number; interval: BillingInterval; unitAmountCents: number; name: string }) {
    const price = await this.priceFor(`ll_addon_${args.addOnId}`, args.unitAmountCents, args.interval, args.name);
    const item = await this.stripe.subscriptionItems.create({
      subscription: args.subscriptionId,
      price,
      quantity: args.quantity,
      metadata: { add_on_id: args.addOnId },
      proration_behavior: "create_prorations",
    });
    return { itemId: item.id };
  }

  async updateSubscriptionItem(args: { itemId: string; quantity: number }) {
    await this.stripe.subscriptionItems.update(args.itemId, { quantity: args.quantity, proration_behavior: "create_prorations" });
  }

  async removeSubscriptionItem(itemId: string) {
    await this.stripe.subscriptionItems.del(itemId, { proration_behavior: "create_prorations" });
  }

  /** Coupons are created on first use: 50% for 12 months, then 25% forever. */
  private async coupon(id: string, params: Stripe.CouponCreateParams): Promise<string> {
    try {
      return (await this.stripe.coupons.retrieve(id)).id;
    } catch (err) {
      if ((err as { code?: string }).code !== "resource_missing") throw err;
      return (await this.stripe.coupons.create({ ...params, id })).id;
    }
  }

  async foundingCouponId(): Promise<string> {
    return this.coupon("founding_year_one", {
      name: `Founding restaurant: ${FOUNDING_OFFER.firstYearPct}% off for 12 months`,
      percent_off: FOUNDING_OFFER.firstYearPct,
      duration: "repeating",
      duration_in_months: 12,
    });
  }

  /**
   * Two-phase schedule: 12 months at the year-one coupon, then one period on the
   * lifetime coupon, then release, which keeps the last phase (25% off) for life.
   */
  async scheduleFoundingOffer(subscriptionId: string): Promise<void> {
    const yearOne = await this.foundingCouponId();
    const lifetime = await this.coupon("founding_lifetime", {
      name: `Founding restaurant: ${FOUNDING_OFFER.lifetimePct}% off for life`,
      percent_off: FOUNDING_OFFER.lifetimePct,
      duration: "forever",
    });
    const sched = await this.stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
    const first = sched.phases[0];
    if (!first) return;
    const items = first.items.map((i) => ({ price: typeof i.price === "string" ? i.price : i.price.id, quantity: i.quantity ?? 1 }));
    const interval = (await this.stripe.subscriptions.retrieve(subscriptionId)).items.data[0]?.price.recurring?.interval;
    await this.stripe.subscriptionSchedules.update(sched.id, {
      end_behavior: "release",
      phases: [
        { items, start_date: first.start_date, duration: interval === "year" ? { interval: "year", interval_count: 1 } : { interval: "month", interval_count: 12 }, discounts: [{ coupon: yearOne }], proration_behavior: "none" },
        { items, duration: interval === "year" ? { interval: "year", interval_count: 1 } : { interval: "month", interval_count: 1 }, discounts: [{ coupon: lifetime }], proration_behavior: "none" },
      ],
    });
  }

  async listInvoices(customerId: string, limit = 24): Promise<ProviderInvoice[]> {
    const list = await this.stripe.invoices.list({ customer: customerId, limit });
    return list.data.map((i) => ({
      id: i.id ?? "",
      number: i.number ?? null,
      status: i.status ?? "draft",
      totalCents: i.total,
      amountPaidCents: i.amount_paid,
      currency: i.currency,
      description: i.lines?.data?.[0]?.description ?? null,
      createdAt: new Date(i.created * 1000),
      hostedUrl: i.hosted_invoice_url ?? null,
      pdfUrl: i.invoice_pdf ?? null,
    }));
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
    chargeMode: pi.metadata?.ll_charge_mode === "direct" ? "direct" : "destination",
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
