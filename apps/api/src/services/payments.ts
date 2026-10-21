/**
 * In-app payments plumbing: Stripe Connect onboarding and the single webhook
 * dispatcher for both Connect payments and Billing events.
 *
 * Webhooks are idempotent: each event id is recorded in webhook_events
 * (unique provider + external_id) and processed once. A failed event is left
 * unprocessed (500 to Stripe) so the retry runs it again.
 */
import { eq } from "drizzle-orm";
import { merchants, webhookEvents } from "@ll/db";
import { PLATFORM_PAYMENT_FEE_BPS, type billingApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { getPayments, type PaymentsEvent } from "../providers/payments.js";
import { onBillingInvoiceFailed, onCheckoutCompleted, onSubscriptionEvent } from "./billing.js";
import { requireFeature } from "./features.js";
import { onInvoicePayment } from "./invoices.js";
import { onOrderPayment } from "./orders.js";
import { onDepositPayment } from "./quotes.js";

type Merchant = typeof merchants.$inferSelect;

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------
export async function startConnectOnboarding(ctx: AppContext, merchant: Merchant, body: z.infer<typeof billingApi.connectBody>): Promise<billingApi.ConnectResponse> {
  await requireFeature(ctx.db, merchant, "payments.in_app");
  const payments = getPayments(ctx);
  let accountId = merchant.stripeAccountId;
  if (!accountId) {
    accountId = (await payments.createConnectedAccount({ merchantId: merchant.id, email: merchant.email, businessName: merchant.name })).accountId;
    await ctx.db.update(merchants).set({ stripeAccountId: accountId, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  }
  const page = `${ctx.config.publicWebUrl}/dashboard/payments?merchant=${merchant.id}`;
  const { url } = await payments.createOnboardingLink({ accountId, returnUrl: body.returnUrl ?? `${page}&onboarding=done`, refreshUrl: body.refreshUrl ?? `${page}&onboarding=refresh` });
  return { accountId, url };
}

export async function connectStatus(ctx: AppContext, merchant: Merchant): Promise<billingApi.ConnectStatusResponse> {
  const payments = getPayments(ctx);
  let m = merchant;
  if (merchant.stripeAccountId) {
    const s = await payments.getAccountStatus(merchant.stripeAccountId);
    if (s.chargesEnabled !== m.stripeChargesEnabled || s.payoutsEnabled !== m.stripePayoutsEnabled || s.detailsSubmitted !== m.stripeDetailsSubmitted) {
      [m] = (await ctx.db
        .update(merchants)
        .set({ stripeChargesEnabled: s.chargesEnabled, stripePayoutsEnabled: s.payoutsEnabled, stripeDetailsSubmitted: s.detailsSubmitted, updatedAt: ctx.now() })
        .where(eq(merchants.id, merchant.id))
        .returning()) as [Merchant];
    }
  }
  return {
    connected: !!m.stripeAccountId,
    accountId: m.stripeAccountId,
    chargesEnabled: m.stripeChargesEnabled,
    payoutsEnabled: m.stripePayoutsEnabled,
    detailsSubmitted: m.stripeDetailsSubmitted,
    platformFeeBps: PLATFORM_PAYMENT_FEE_BPS,
    provider: payments.name,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

async function onAccountUpdated(ctx: AppContext, account: Obj) {
  await ctx.db
    .update(merchants)
    .set({
      stripeChargesEnabled: !!account.charges_enabled,
      stripePayoutsEnabled: !!account.payouts_enabled,
      stripeDetailsSubmitted: !!account.details_submitted,
      updatedAt: ctx.now(),
    })
    .where(eq(merchants.stripeAccountId, String(account.id)));
}

async function onPaymentIntent(ctx: AppContext, pi: Obj, outcome: "succeeded" | "failed") {
  const kind = pi.metadata?.ll_kind as string | undefined;
  const id = pi.metadata?.ll_id as string | undefined;
  if (!kind || !id || !/^[0-9a-f-]{36}$/i.test(id)) return; // not ours
  if (kind === "order") await onOrderPayment(ctx, id, String(pi.id), outcome);
  else if (kind === "deposit") await onDepositPayment(ctx, id, String(pi.id), outcome);
  else if (kind === "invoice") await onInvoicePayment(ctx, id, String(pi.id), outcome);
}

/** Apply one event. Exported for the dev simulator; webhooks go through processWebhookEvent. */
export async function applyPaymentsEvent(ctx: AppContext, event: PaymentsEvent): Promise<void> {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
      return onCheckoutCompleted(ctx, obj);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return onSubscriptionEvent(ctx, obj, event.type);
    case "invoice.payment_failed":
      return onBillingInvoiceFailed(ctx, obj);
    case "payment_intent.succeeded":
      return onPaymentIntent(ctx, obj, "succeeded");
    case "payment_intent.payment_failed":
      return onPaymentIntent(ctx, obj, "failed");
    case "account.updated":
      return onAccountUpdated(ctx, obj);
    default:
      return;
  }
}

export interface ProcessResult {
  duplicate: boolean;
  type: string;
}

/** Record + apply an event exactly once (webhook_events unique on provider + external id). */
export async function processWebhookEvent(ctx: AppContext, event: PaymentsEvent): Promise<ProcessResult> {
  const merchantId = typeof event.data.object?.metadata?.merchant_id === "string" ? event.data.object.metadata.merchant_id : null;
  await ctx.db
    .insert(webhookEvents)
    .values({ provider: "stripe", externalId: event.id, type: event.type, merchantId: merchantId && /^[0-9a-f-]{36}$/i.test(merchantId) ? merchantId : null, payload: event })
    .onConflictDoNothing();
  const [row] = await ctx.db.select().from(webhookEvents).where(eq(webhookEvents.externalId, event.id)).limit(1);
  if (row?.processedAt && row.provider === "stripe") return { duplicate: true, type: event.type };
  try {
    await applyPaymentsEvent(ctx, event);
    await ctx.db.update(webhookEvents).set({ processedAt: ctx.now(), error: null, attempts: (row?.attempts ?? 0) + 1 }).where(eq(webhookEvents.id, row!.id));
  } catch (err) {
    await ctx.db.update(webhookEvents).set({ error: (err as Error).message.slice(0, 1000), attempts: (row?.attempts ?? 0) + 1 }).where(eq(webhookEvents.id, row!.id));
    throw err;
  }
  return { duplicate: false, type: event.type };
}
