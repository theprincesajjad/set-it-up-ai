/**
 * Deterministic in-memory payments provider for dev and tests.
 *
 * Nothing is charged. A PaymentIntent stays "requires_payment_method" until a
 * test or the dev endpoint (POST /v1/payments/fake/simulate) calls
 * `succeedPaymentIntent`, which returns the same Stripe-shaped event a real
 * webhook would deliver. Webhook signatures use Stripe's scheme
 * (t=<unix>,v1=<hmac-sha256>) with a local secret, so the webhook route is
 * exercised end to end.
 */
import type { Config } from "../config.js";
import { hmacSha256, safeEqual } from "../lib/crypto.js";
import type { AddOnId, RestaurantTier } from "@ll/shared";
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

export const FAKE_WEBHOOK_SECRET = "whsec_fake_local_dev";
const TOLERANCE_SECONDS = 300;

interface FakeIntent extends PaymentIntentInfo {
  connectedAccountId: string;
  chargeMode: ChargeMode;
  refundedCents: number;
}

interface FakeSubscription {
  id: string;
  customerId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  plan: string;
  interval: string;
  merchantId: string;
  priceId: string;
  restaurantTier: RestaurantTier | null;
  /** Price of the base item (tier or plan), cents per period. */
  baseAmountCents: number;
  items: Map<string, FakeItem>;
  couponId: string | null;
  foundingScheduled: boolean;
}

interface FakeItem {
  id: string;
  addOnId: AddOnId;
  quantity: number;
  interval: BillingInterval;
  unitAmountCents: number;
}

export class FakePayments implements PaymentsProvider {
  readonly name = "fake" as const;
  readonly webhookSecret: string;
  private seq = 0;
  readonly accounts = new Map<string, ConnectAccountStatus & { merchantId: string }>();
  readonly intents = new Map<string, FakeIntent>();
  private readonly intentsByKey = new Map<string, string>();
  readonly customers = new Map<string, { merchantId: string; email?: string | null; name: string }>();
  readonly sessions = new Map<string, CheckoutArgs & { id: string; url: string; completed: boolean }>();
  readonly subscriptions = new Map<string, FakeSubscription>();
  readonly refunds: { id: string; paymentIntentId: string; amountCents: number; connectedAccountId?: string }[] = [];
  readonly invoices: (ProviderInvoice & { customerId: string })[] = [];

  constructor(private readonly config: Pick<Config, "publicWebUrl" | "publicApiUrl" | "stripe">) {
    this.webhookSecret = config.stripe.webhookSecret ?? FAKE_WEBHOOK_SECRET;
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_fake_${String(this.seq).padStart(6, "0")}`;
  }

  // ---- Connect ------------------------------------------------------------
  async createConnectedAccount(args: { merchantId: string; email?: string | null; businessName: string }) {
    const accountId = this.nextId("acct");
    this.accounts.set(accountId, { accountId, merchantId: args.merchantId, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false });
    return { accountId };
  }

  async createOnboardingLink(args: { accountId: string; refreshUrl: string; returnUrl: string }) {
    if (!this.accounts.has(args.accountId)) throw new Error(`Unknown fake account ${args.accountId}`);
    const q = new URLSearchParams({ account: args.accountId, return_url: args.returnUrl });
    return { url: `${this.config.publicWebUrl}/dev/stripe-onboarding?${q}` };
  }

  async getAccountStatus(accountId: string): Promise<ConnectAccountStatus> {
    const a = this.accounts.get(accountId);
    // Seeded demo shops (apps/api/src/seed/restaurants.ts) carry a fully onboarded `acct_demo_*` account the in-memory map never saw.
    if (!a && accountId.startsWith("acct_demo_")) return { accountId, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true };
    if (!a) return { accountId, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
    return { accountId, chargesEnabled: a.chargesEnabled, payoutsEnabled: a.payoutsEnabled, detailsSubmitted: a.detailsSubmitted };
  }

  /** Simulate the merchant finishing Express onboarding. Returns the account.updated event. */
  completeOnboarding(accountId: string): PaymentsEvent {
    const a = this.accounts.get(accountId) ?? { accountId, merchantId: "", chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
    Object.assign(a, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
    this.accounts.set(accountId, a);
    return this.event("account.updated", { id: accountId, object: "account", charges_enabled: true, payouts_enabled: true, details_submitted: true, metadata: { merchant_id: a.merchantId } }, accountId);
  }

  // ---- Payments -----------------------------------------------------------
  async createPaymentIntent(args: CreatePaymentIntentArgs): Promise<PaymentIntentInfo> {
    if (!Number.isInteger(args.amountCents) || args.amountCents < 50) throw new Error("Amount must be at least 50 cents");
    if (args.applicationFeeCents > args.amountCents) throw new Error("Application fee exceeds amount");
    const existing = this.intentsByKey.get(args.idempotencyKey);
    if (existing) return toInfo(this.intents.get(existing)!);
    const id = this.nextId("pi");
    const intent: FakeIntent = {
      id,
      clientSecret: `${id}_secret_${String(this.seq).padStart(6, "0")}`,
      status: "requires_payment_method",
      amountCents: args.amountCents,
      applicationFeeCents: args.applicationFeeCents,
      metadata: { ...args.metadata },
      connectedAccountId: args.connectedAccountId,
      chargeMode: args.chargeMode ?? "destination",
      refundedCents: 0,
      ...(args.paymentMethodTypes ? { paymentMethodTypes: args.paymentMethodTypes } : {}),
    };
    this.intents.set(id, intent);
    this.intentsByKey.set(args.idempotencyKey, id);
    return toInfo(intent);
  }

  async retrievePaymentIntent(id: string): Promise<PaymentIntentInfo> {
    const i = this.intents.get(id);
    if (!i) throw new Error(`Unknown fake payment intent ${id}`);
    return toInfo(i);
  }

  async createPlatformCharge(args: PlatformChargeArgs): Promise<PlatformChargeResult> {
    if (!Number.isInteger(args.amountCents) || args.amountCents < 50) throw new Error("Amount must be at least 50 cents");
    const customerId = args.stripeCustomerId ?? (await this.createCustomer({ merchantId: args.merchantId, email: args.customerEmail, name: args.customerName ?? args.merchantId })).customerId;
    const existing = this.intentsByKey.get(args.idempotencyKey);
    if (existing) {
      const i = this.intents.get(existing)!;
      return { id: i.id, clientSecret: i.clientSecret, status: i.status, customerId };
    }
    const id = this.nextId("pi");
    const intent: FakeIntent = {
      id,
      clientSecret: `${id}_secret_${String(this.seq).padStart(6, "0")}`,
      status: "requires_payment_method",
      amountCents: args.amountCents,
      applicationFeeCents: 0,
      metadata: { ...args.metadata, merchant_id: args.merchantId, [PLATFORM_CHARGE_MARKER]: "true" },
      connectedAccountId: "",
      chargeMode: "destination",
      refundedCents: 0,
    };
    this.intents.set(id, intent);
    this.intentsByKey.set(args.idempotencyKey, id);
    return { id, clientSecret: intent.clientSecret, status: intent.status, customerId };
  }

  /** Simulate the customer paying. Returns the payment_intent.succeeded event. */
  succeedPaymentIntent(id: string): PaymentsEvent {
    const i = this.intents.get(id);
    if (!i) throw new Error(`Unknown fake payment intent ${id}`);
    i.status = "succeeded";
    return this.event("payment_intent.succeeded", this.intentObject(i), i.chargeMode === "direct" ? i.connectedAccountId : undefined);
  }

  failPaymentIntent(id: string): PaymentsEvent {
    const i = this.intents.get(id);
    if (!i) throw new Error(`Unknown fake payment intent ${id}`);
    i.status = "requires_payment_method";
    return this.event("payment_intent.payment_failed", { ...this.intentObject(i), last_payment_error: { message: "Your card was declined." } }, i.chargeMode === "direct" ? i.connectedAccountId : undefined);
  }

  async refund(args: { paymentIntentId: string; amountCents?: number; idempotencyKey: string; reason?: string; connectedAccountId?: string; chargeMode?: ChargeMode }) {
    const i = this.intents.get(args.paymentIntentId);
    if (!i) throw new Error(`Unknown fake payment intent ${args.paymentIntentId}`);
    // Same constraint as Stripe: a direct charge can only be refunded on the connected account that owns it.
    if (i.chargeMode === "direct" && args.connectedAccountId !== i.connectedAccountId) throw new Error("Refunding a direct charge needs its connectedAccountId");
    const prior = this.refunds.find((r) => r.id === `re_${args.idempotencyKey}`);
    if (prior) return { id: prior.id, status: "succeeded", amountCents: prior.amountCents };
    const amount = args.amountCents ?? i.amountCents - i.refundedCents;
    if (amount > i.amountCents - i.refundedCents) throw new Error("Refund exceeds amount paid");
    i.refundedCents += amount;
    const r = { id: `re_${args.idempotencyKey}`, paymentIntentId: i.id, amountCents: amount, connectedAccountId: args.connectedAccountId };
    this.refunds.push(r);
    return { id: r.id, status: "succeeded", amountCents: amount };
  }

  // ---- Billing ------------------------------------------------------------
  async createCustomer(args: { merchantId: string; email?: string | null; name: string }) {
    const customerId = this.nextId("cus");
    this.customers.set(customerId, args);
    return { customerId };
  }

  async createSubscriptionCheckout(args: CheckoutArgs) {
    const id = this.nextId("cs");
    const url = `${this.config.publicWebUrl}/dev/checkout/${id}`;
    this.sessions.set(id, { ...args, id, url, completed: false });
    return { id, url };
  }

  /**
   * Simulate the merchant completing Checkout. Returns the events Stripe would
   * send: checkout.session.completed then customer.subscription.created.
   */
  completeCheckout(sessionId: string, now = new Date()): PaymentsEvent[] {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Unknown fake checkout session ${sessionId}`);
    s.completed = true;
    const subId = this.nextId("sub");
    const end = new Date(now);
    if (s.interval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    const sub: FakeSubscription = {
      id: subId,
      customerId: s.customerId,
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: end,
      plan: s.plan,
      interval: s.interval,
      merchantId: s.merchantId,
      priceId: s.priceId ?? `price_fake_${s.restaurantTier ? `restaurant_${s.restaurantTier}` : s.plan}_${s.interval}`,
      restaurantTier: s.restaurantTier ?? null,
      baseAmountCents: s.unitAmountCents,
      items: new Map(),
      couponId: s.couponId ?? null,
      foundingScheduled: false,
    };
    this.subscriptions.set(subId, sub);
    this.addInvoice(sub, sub.baseAmountCents, `${s.productName}`, now);
    const metadata = { merchant_id: s.merchantId, plan: s.plan, interval: s.interval, ...(s.restaurantTier ? { restaurant_tier: s.restaurantTier } : {}) };
    return [
      this.event("checkout.session.completed", {
        id: s.id,
        object: "checkout.session",
        mode: "subscription",
        status: "complete",
        customer: s.customerId,
        subscription: subId,
        client_reference_id: s.merchantId,
        metadata,
      }),
      this.event("customer.subscription.created", this.subscriptionObject(sub)),
    ];
  }

  /** Simulate a renewal charge failing (invoice.payment_failed + subscription past_due). */
  failRenewal(subscriptionId: string): PaymentsEvent[] {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Unknown fake subscription ${subscriptionId}`);
    sub.status = "past_due";
    return [
      this.event("invoice.payment_failed", { id: this.nextId("in"), object: "invoice", customer: sub.customerId, subscription: sub.id }),
      this.event("customer.subscription.updated", this.subscriptionObject(sub)),
    ];
  }

  /** Simulate the end of the billing period for a subscription set to cancel. */
  endSubscription(subscriptionId: string): PaymentsEvent {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Unknown fake subscription ${subscriptionId}`);
    sub.status = "canceled";
    return this.event("customer.subscription.deleted", this.subscriptionObject(sub));
  }

  /** Simulate a renewal: next period, a paid invoice (invoice.paid) and subscription.updated. */
  renewSubscription(subscriptionId: string, now = new Date()): PaymentsEvent[] {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Unknown fake subscription ${subscriptionId}`);
    const end = new Date(sub.currentPeriodEnd);
    if (sub.interval === "year") end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    sub.currentPeriodEnd = end;
    sub.status = "active";
    const total = this.subscriptionTotal(sub);
    const inv = this.addInvoice(sub, total, "Subscription renewal", now);
    return [
      this.event("invoice.paid", {
        id: inv.id,
        object: "invoice",
        customer: sub.customerId,
        subscription: sub.id,
        billing_reason: "subscription_cycle",
        amount_paid: total,
        metadata: { merchant_id: sub.merchantId },
      }),
      this.event("customer.subscription.updated", this.subscriptionObject(sub)),
    ];
  }

  /** The customer.subscription.updated event for the subscription's current state (portal edits, tier changes). */
  subscriptionUpdated(subscriptionId: string): PaymentsEvent {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Unknown fake subscription ${subscriptionId}`);
    return this.event("customer.subscription.updated", this.subscriptionObject(sub));
  }

  async changeSubscriptionTier(args: { subscriptionId: string; tier: RestaurantTier; interval: BillingInterval; unitAmountCents: number; productName: string }): Promise<SubscriptionSnapshot> {
    const sub = this.subscriptions.get(args.subscriptionId);
    if (!sub) throw new Error(`Unknown fake subscription ${args.subscriptionId}`);
    sub.restaurantTier = args.tier;
    sub.baseAmountCents = args.unitAmountCents;
    sub.priceId = `price_fake_restaurant_${args.tier}_${sub.interval}`;
    return snap(sub);
  }

  async addSubscriptionItem(args: { subscriptionId: string; addOnId: AddOnId; quantity: number; interval: BillingInterval; unitAmountCents: number; name: string }) {
    const sub = this.subscriptions.get(args.subscriptionId);
    if (!sub) throw new Error(`Unknown fake subscription ${args.subscriptionId}`);
    const id = this.nextId("si");
    sub.items.set(id, { id, addOnId: args.addOnId, quantity: args.quantity, interval: args.interval, unitAmountCents: args.unitAmountCents });
    this.addInvoice(sub, args.unitAmountCents * args.quantity, `${args.name} (prorated)`, new Date());
    return { itemId: id };
  }

  async updateSubscriptionItem(args: { itemId: string; quantity: number }) {
    for (const sub of this.subscriptions.values()) {
      const it = sub.items.get(args.itemId);
      if (it) return void (it.quantity = args.quantity);
    }
    throw new Error(`Unknown fake subscription item ${args.itemId}`);
  }

  async removeSubscriptionItem(itemId: string) {
    for (const sub of this.subscriptions.values()) if (sub.items.delete(itemId)) return;
  }

  readonly foundingCoupon = "founding_50_12m";

  async foundingCouponId() {
    return this.foundingCoupon;
  }

  async scheduleFoundingOffer(subscriptionId: string) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Unknown fake subscription ${subscriptionId}`);
    sub.foundingScheduled = true;
  }

  async listInvoices(customerId: string, limit = 24): Promise<ProviderInvoice[]> {
    return this.invoices
      .filter((i) => i.customerId === customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(({ customerId: _c, ...inv }) => inv);
  }

  async createPortalSession(args: { customerId: string; returnUrl: string }) {
    return { url: `${this.config.publicWebUrl}/dev/billing-portal?customer=${encodeURIComponent(args.customerId)}&return_url=${encodeURIComponent(args.returnUrl)}` };
  }

  async cancelSubscription(args: { subscriptionId: string; atPeriodEnd: boolean }): Promise<SubscriptionSnapshot> {
    const sub = this.subscriptions.get(args.subscriptionId);
    if (!sub) return { id: args.subscriptionId, status: "canceled", cancelAtPeriodEnd: false, currentPeriodEnd: null };
    if (args.atPeriodEnd) sub.cancelAtPeriodEnd = true;
    else sub.status = "canceled";
    return snap(sub);
  }

  async resumeSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Unknown fake subscription ${subscriptionId}`);
    sub.cancelAtPeriodEnd = false;
    return snap(sub);
  }

  // ---- Webhooks -----------------------------------------------------------
  /** Sign a payload the way Stripe does, for tests and the dev simulator. */
  sign(payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
    return `t=${timestamp},v1=${hmacSha256(this.webhookSecret, `${timestamp}.${payload}`)}`;
  }

  verifyWebhook(rawBody: string, signatureHeader: string | undefined): PaymentsEvent {
    if (!signatureHeader) throw new Error("Missing signature");
    const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=", 2) as [string, string]));
    const t = Number(parts.t);
    const v1 = parts.v1;
    if (!t || !v1) throw new Error("Malformed signature");
    if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) throw new Error("Signature timestamp outside tolerance");
    if (!safeEqual(hmacSha256(this.webhookSecret, `${t}.${rawBody}`), v1)) throw new Error("Signature mismatch");
    return JSON.parse(rawBody) as PaymentsEvent;
  }

  // ---- helpers ------------------------------------------------------------
  private event(type: string, object: Record<string, unknown>, account?: string): PaymentsEvent {
    return { id: this.nextId("evt"), type, account: account ?? null, created: Math.floor(Date.now() / 1000), data: { object } };
  }

  private subscriptionTotal(sub: FakeSubscription): number {
    let total = sub.baseAmountCents;
    for (const it of sub.items.values()) total += it.unitAmountCents * it.quantity;
    return total;
  }

  private addInvoice(sub: FakeSubscription, totalCents: number, description: string, at: Date): ProviderInvoice {
    const id = this.nextId("in");
    const inv = {
      id,
      number: `FAKE-${String(this.invoices.length + 1).padStart(4, "0")}`,
      status: "paid",
      totalCents,
      amountPaidCents: totalCents,
      currency: "cad",
      description,
      createdAt: at,
      hostedUrl: `${this.config.publicWebUrl}/dev/invoice/${id}`,
      pdfUrl: null,
      customerId: sub.customerId,
    };
    this.invoices.push(inv);
    return inv;
  }

  private intentObject(i: FakeIntent) {
    return {
      id: i.id,
      object: "payment_intent",
      amount: i.amountCents,
      amount_received: i.status === "succeeded" ? i.amountCents : 0,
      application_fee_amount: i.applicationFeeCents,
      currency: "cad",
      status: i.status,
      metadata: i.metadata,
      // Direct charges live on the connected account: no transfer, and the event arrives as a Connect event.
      transfer_data: i.connectedAccountId && i.chargeMode === "destination" ? { destination: i.connectedAccountId } : null,
      on_behalf_of: i.connectedAccountId && i.chargeMode === "destination" ? i.connectedAccountId : null,
      ll_charge_mode: i.chargeMode,
    };
  }

  private subscriptionObject(sub: FakeSubscription) {
    const end = Math.floor(sub.currentPeriodEnd.getTime() / 1000);
    return {
      id: sub.id,
      object: "subscription",
      customer: sub.customerId,
      status: sub.status,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      metadata: { merchant_id: sub.merchantId, plan: sub.plan, interval: sub.interval, ...(sub.restaurantTier ? { restaurant_tier: sub.restaurantTier } : {}) },
      discounts: sub.couponId ? [sub.couponId] : [],
      items: {
        data: [
          { id: `si_fake_base_${sub.id}`, quantity: 1, current_period_end: end, price: { id: sub.priceId, recurring: { interval: sub.interval } }, metadata: {} },
          ...[...sub.items.values()].map((it) => ({
            id: it.id,
            quantity: it.quantity,
            current_period_end: end,
            price: { id: `price_fake_addon_${it.addOnId}_${it.interval}`, recurring: { interval: it.interval } },
            metadata: { add_on_id: it.addOnId },
          })),
        ],
      },
    };
  }
}

function toInfo(i: FakeIntent): PaymentIntentInfo {
  return { id: i.id, clientSecret: i.clientSecret, status: i.status, amountCents: i.amountCents, applicationFeeCents: i.applicationFeeCents, metadata: i.metadata, chargeMode: i.chargeMode, ...(i.paymentMethodTypes ? { paymentMethodTypes: i.paymentMethodTypes } : {}) };
}

function snap(s: FakeSubscription): SubscriptionSnapshot {
  return { id: s.id, status: s.status, cancelAtPeriodEnd: s.cancelAtPeriodEnd, currentPeriodEnd: s.currentPeriodEnd };
}
