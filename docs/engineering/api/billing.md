# Billing API (plan subscriptions)

Contract: `packages/shared/src/api/billing.ts` (`billingApi`). Code: `apps/api/src/routes/billing/`, `services/billing.ts`,
provider `providers/payments*.ts`. Webhook: `payments.md`.

Rules:
- **Free is free forever**: no transaction fees, every loyalty feature, unlimited locations/staff/members.
- **Plus $39/mo · $390/yr** and **Pro $79/mo · $790/yr**, CAD (`PLANS` in `@ll/shared`).
- A paid plan is **purchasable only once rolled out** (`isPlanAvailable`: any feature on that plan not `hidden`).
- **Downgrading never deletes data.** Members, balances, ledger, rewards, promos, catalog items, tickets — all kept.
  Free features keep working; paid endpoints return `402 feature_locked` (`reason: "plan"`).
- `merchants.plan` is derived from subscription state (webhooks): `active`/`trialing`/`past_due` keep the plan
  (past_due = Stripe retrying); `canceled`/`incomplete_expired` → Free. Every change is written to `audit_logs`.

All endpoints: **owner only** (`requireStaff(..., "owner")`; admins and the merchant's rep pass).
Errors: `401`, `403`, `404` merchant.

## Objects

- `PlanOption`: `id (free|plus|pro), name, priceCents, annualPriceCents, currency "CAD", blurb, bestFor[], smsPerMonth, available, current, platformFeeBps (0 free, 75 paid)`
- `Subscription`: `id, plan, status (trialing|active|past_due|canceled|incomplete), interval (month|year), currentPeriodEnd, cancelAtPeriodEnd, createdAt`

## `GET /v1/merchants/:merchantId/billing`
→ `{ plan, subscription: Subscription | null, plans: PlanOption[], hasBillingAccount }`.

## `GET /v1/merchants/:merchantId/billing/plans`
→ `{ items: PlanOption[], nextCursor: null }`.

## `POST /v1/merchants/:merchantId/billing/checkout`
Body: `{ plan: "plus"|"pro", interval?: "month"|"year" (month), successUrl?, cancelUrl? }`.
Creates the Stripe customer if needed, then a Checkout Session (subscription mode, CAD; configured
`STRIPE_PRICE_*` ids or an inline price). Redirect the owner to `url`. The plan changes when the
`checkout.session.completed` / `customer.subscription.*` webhooks arrive — poll `GET .../billing`.
Default return URLs: `${PUBLIC_WEB_URL}/dashboard/billing?merchant=<id>&checkout=success|cancelled`.
→ `{ sessionId, url }`. Errors: `402 feature_locked` (`reason: "rollout"`), `409` (already subscribed; use the portal).

## `POST /v1/merchants/:merchantId/billing/portal`
Body: `{ returnUrl? }`. Stripe customer portal (cards, invoices, plan switch). → `{ url }`. Errors: `409` (no billing account yet).

## `POST /v1/merchants/:merchantId/billing/cancel`
Cancel at period end (plan stays until then). → `{ subscription }`. Errors: `409` (on Free).

## `POST /v1/merchants/:merchantId/billing/resume`
Undo a pending cancellation. → `{ subscription }`. Errors: `409`.

## `POST /v1/merchants/:merchantId/billing/downgrade`
Body: `{ immediate?: boolean (false) }`. `false` = same as cancel (Free at period end). `true` = cancel now, Free now
(no proration refund). → `{ plan, subscription }`. Errors: `409` (already Free).

## Dev / test

With no `STRIPE_SECRET_KEY`, `FakePayments` is used. Checkout URLs point at `${PUBLIC_WEB_URL}/dev/checkout/<sessionId>`;
complete them with `POST /v1/payments/fake/simulate { action: "complete_checkout", id: "<sessionId>" }` (see `payments.md`).
