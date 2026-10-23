# Payments API (Stripe Connect, webhooks)

Code: `apps/api/src/routes/payments/`, `services/payments.ts`, providers `providers/payments.ts` (interface,
`getPayments(ctx)`, `platformFeeCents`), `providers/paymentsFake.ts`, `providers/paymentsStripe.ts`.
Contract: `billingApi.ConnectStatusResponse`, `billingApi.ConnectResponse`.

## Model

- **Free merchants have no payments and pay no transaction fee.** In-app payments need `payments.in_app` (Plus/Pro, rolled out).
- Each merchant gets a **Stripe Connect Express** account (Canada, CAD). Customer payments are **destination charges**
  to that account with `application_fee_amount = round(amount × PLATFORM_PAYMENT_FEE_BPS / 10000)` (75 bps = 0.75%).
  Stripe's own processing fee is charged on top by Stripe. Refunds reverse the transfer and refund our fee.
- Every PaymentIntent carries `metadata: { ll_kind: "order"|"deposit"|"invoice", ll_id, merchant_id }`; the webhook routes on it.
- Provider selection: `STRIPE_SECRET_KEY` set → `StripePayments`; otherwise `FakePayments` (deterministic, nothing charged).
  `STRIPE_WEBHOOK_SECRET` verifies webhooks (Fake uses it too, else `whsec_fake_local_dev`).

## Client recipe (web + mobile)

1. Call the endpoint that starts a payment (`POST /v1/me/orders`, quote approve, `.../deposit`, invoice `pay`).
2. Confirm the returned `clientSecret` with Stripe.js / `@stripe/stripe-react-native` (Payment Element / PaymentSheet).
3. Don't trust the client result: the server marks things paid from the `payment_intent.succeeded` webhook. Poll the resource.

## `POST /v1/merchants/:merchantId/payments/connect`
Owner. Body: `{ returnUrl?, refreshUrl? }` (defaults `${PUBLIC_WEB_URL}/dashboard/payments?merchant=<id>&onboarding=done|refresh`).
Creates the Express account once (`merchants.stripe_account_id`), returns a fresh onboarding link every call.
→ `{ accountId, url }`. Errors: `401`, `402` (`payments.in_app` locked — always on Free), `403`.

## `GET /v1/merchants/:merchantId/payments/status`
Manager+. Syncs from Stripe. → `{ connected, accountId, chargesEnabled, payoutsEnabled, detailsSubmitted, platformFeeBps: 75, provider: "fake"|"stripe" }`.
In-app payment endpoints return `409 payments_not_set_up` until `chargesEnabled`.

## `POST /v1/webhooks/stripe`
No auth; **signature verified** against the raw body (`req.rawBody`, header `Stripe-Signature`). Configure one
endpoint in Stripe for both platform and Connect events.
Idempotent: each `event.id` is stored in `webhook_events` (unique `provider + external_id`) and applied once;
replays → `200 { received: true, duplicate: true }`. If handling throws, the event is left unprocessed and the API
returns `500` so Stripe retries.

| Event | Effect |
| --- | --- |
| `checkout.session.completed` (subscription) | subscription row (active), `merchants.plan`, `stripe_customer_id` |
| `customer.subscription.created/updated` | upsert subscription (status, interval, `current_period_end`, `cancel_at_period_end`), recompute plan |
| `customer.subscription.deleted` | subscription canceled → plan Free (data kept) |
| `invoice.payment_failed` | subscription `past_due` (plan kept during retries) |
| `payment_intent.succeeded` (platform charge marker) | `platformChargeHandlers` (see below) |
| `checkout.session.completed` (`mode: payment` + marker) | `platformChargeHandlers` |
| `payment_intent.succeeded` | order → `paid` (refunded immediately if it was cancelled meanwhile); deposit → `depositPaidAt` + timeline; invoice → `paid` + points |
| `payment_intent.payment_failed` | order `paymentStatus: failed` (same client secret can be retried); timeline note for deposits/invoices |
| `account.updated` | `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_details_submitted` |

Responses: `200 { received: true, duplicate }`. Errors: `400 invalid_signature` (missing/bad/tampered/expired signature), `400` malformed event.

## Platform charges (merchant pays the platform)

For platform services billed to a **merchant** (ad spend, BIA campaign fees). Money goes to the platform's own
Stripe account: **no destination, no application fee**. There is no HTTP endpoint here; the owning area (ads,
campaigns) exposes its own "pay" endpoint and calls the service.

```ts
import { createPlatformCharge, platformChargeHandlers } from "../services/payments.js";

// Start a charge (reuses merchants.stripe_customer_id, creates and saves one if missing).
const { id, clientSecret, status, customerId } = await createPlatformCharge(ctx, merchant, {
  amountCents: 15000,
  description: "Sponsored listing, Roncesvalles, Nov 3–9",
  metadata: { kind: "ad_campaign", id: campaign.id },   // kind: "ad_campaign" | "bia_campaign" | ...
  idempotencyKey: `ad_campaign:${campaign.id}:charge`,
});
// Return clientSecret to the dashboard; it confirms with Stripe.js (Payment Element).

// Register once at module load; mark things paid here (must be idempotent per metadata.id).
platformChargeHandlers.push(async (ctx, e) => {
  if (e.metadata.kind !== "ad_campaign") return;
  // e: { metadata, paymentIntentId, checkoutSessionId, amountCents, stripeEventId }
});
```

- Provider method: `PaymentsProvider.createPlatformCharge({ merchantId, stripeCustomerId?, customerName?, customerEmail?, amountCents (≥ 50), description, metadata, idempotencyKey })`
  → `{ id (PaymentIntent), clientSecret, status, customerId }`. Stripe: PaymentIntent on the platform account with
  `customer`, `setup_future_usage: off_session` (card saved for the next charge). Fake: deterministic intent, no fee.
- Metadata is stored with `merchant_id` and the marker `ll_platform_charge: "true"`.
- Webhook routing: `payment_intent.succeeded` with the marker, or `checkout.session.completed` with `mode: "payment"`
  and the marker (if an area ever uses Checkout instead), calls every handler in `platformChargeHandlers` **once per
  event** (`webhook_events` dedupe). Failed payments don't call handlers. A handler that throws makes the webhook
  return `500` so Stripe retries the event.
- Dev/test: `POST /v1/payments/fake/simulate { action: "succeed_payment", id: "<PaymentIntent id>" }`.

## `POST /v1/payments/fake/simulate` (dev/test only)
Available only when `FakePayments` is active and `NODE_ENV !== production` (else `404`). Generates the event Stripe
would send and runs it through the same webhook handler.
Body: `{ action, id, paymentMethod? }` (`paymentMethod` picks which test method `succeed_payment` / `succeed_setup` saves, see below):

| action | id | events |
| --- | --- | --- |
| `succeed_payment` | PaymentIntent id | `payment_intent.succeeded` |
| `fail_payment` | PaymentIntent id | `payment_intent.payment_failed` |
| `succeed_setup` | SetupIntent id | `setup_intent.succeeded` (tiffin "change card") |
| `complete_checkout` | Checkout Session id | `checkout.session.completed`, `customer.subscription.created` |
| `complete_onboarding` | Connect account id | `account.updated` (charges + payouts enabled) |
| `fail_renewal` | Subscription id | `invoice.payment_failed`, `customer.subscription.updated` (past_due) |
| `end_subscription` | Subscription id | `customer.subscription.deleted` |

→ `{ events: [{ id, type }] }`. The web dev pages under `/dev/checkout/<id>`, `/dev/stripe-onboarding?account=<id>`
can call this with a "Pay" / "Finish" button. Tests can also call `FakePayments#sign(payload)` and POST to the webhook.

## Saved payment methods (tiffin renewals)
- `createPayerCustomer({ userId, merchantId, email, name, connectedAccountId? })`: a Stripe Customer for a person paying a
  kitchen, on the connected account for direct charges (`connectedAccountId` set) and on the platform for destination
  charges. Reused per user + kitchen (`tiffin_subscriptions.stripe_customer_id`).
- `createPaymentIntent({ customerId, setupFutureUsage: "off_session" })`: the first tiffin payment keeps the card on the
  customer (PAD also records a mandate). The `payment_intent.succeeded` webhook carries `payment_method`; the service saves it
  on the subscription (`payment_method_id`, display `payment_method_brand` / `payment_method_last4`).
- `chargeSavedMethod(...)`: `off_session: true, confirm: true`. Never throws for a card problem; it answers with an
  outcome: `succeeded`, `processing` (PAD, settles by webhook), `authentication_required` (charge stays pending, customer gets
  `renewal_due` and confirms at `/pay/intent`) or `declined` (charge failed, subscription `past_due`, `payment_failed`).
- `createSetupIntent` / `retrieveSetupIntent` / `retrievePaymentMethod`: the "change card" flow
  (`POST /v1/me/tiffin/subscriptions/:subId/payment-method`, page `/pay/setup/<id>?cs=`).
- Fake provider test methods (`FAKE_PM` in `providers/paymentsFake.ts`): `pm_fake_visa_4242` (default, succeeds),
  `pm_fake_auth_required` (needs the customer), `pm_fake_declined` (declined), `pm_fake_pad_6789` (PAD, processing).
