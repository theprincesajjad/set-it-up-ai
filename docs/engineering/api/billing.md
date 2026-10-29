# Billing API (plan subscriptions)

Contract: `packages/shared/src/api/billing.ts` (`billingApi`). Code: `apps/api/src/routes/billing/`, `services/billing.ts`,
provider `providers/payments*.ts`. Webhook: `payments.md`.

Rules:
- **Free is free forever**: no transaction fees, every loyalty feature, unlimited locations/staff/members.
- **Pro** (id `plus`) $29/mo · $290/yr, **Studio** (id `studio`) $59/mo · $590/yr, **Service** (id `pro`) $99/mo · $990/yr, CAD
  (`PLANS` in `@ll/shared`; rules in `docs/business/pricing.md`).
- **The 14-day Pro trial**: a flag on the merchant (`trial_plan`, `trial_ends_at`), no Stripe object; one per shop.
- A paid plan is **purchasable only once rolled out** (`isPlanAvailable`: any feature on that plan not `hidden`).
- **Downgrading never deletes data.** Members, balances, ledger, rewards, promos, catalog items, tickets — all kept.
  Free features keep working; paid endpoints return `402 feature_locked` (`reason: "plan"`).
- `merchants.plan` is derived from subscription state (webhooks): `active`/`trialing`/`past_due` keep the plan
  (past_due = Stripe retrying); `canceled`/`incomplete_expired` → Free. Every change is written to `audit_logs`.

All endpoints: **owner only** (`requireStaff(..., "owner")`; admins and the merchant's rep pass).
Errors: `401`, `403`, `404` merchant.

## Objects

- `PlanOption`: `id (free|plus|studio|pro), name, priceCents, annualPriceCents, currency "CAD", blurb, bestFor[], smsPerMonth, available, current, platformFeeBps (0 free, 75 paid)`
- `Subscription`: `id, plan, status (trialing|active|past_due|canceled|incomplete), interval (month|year), currentPeriodEnd, cancelAtPeriodEnd, createdAt`

## `GET /v1/merchants/:merchantId/billing`
→ `{ plan, subscription: Subscription | null, plans: PlanOption[], hasBillingAccount, usage, firstYearPrice }`.
`firstYearPrice`: `{ shown, priceCents, listPriceCents, eligible, taken }` (the first-year price of annual Pro; no spots count).

## `GET /v1/merchants/:merchantId/billing/usage` (manager+)
→ `{ plan, interval, calendars, texts, promos, annualSiteEntitled, trial: { plan, endsAt, daysLeft } | null, trialUsed, trialEndedAt }`.
During the trial `texts.includedPerMonth` is `TRIAL_SMS_CAP` (100) and `calendars.limit` is 2.

## `POST /v1/merchants/:merchantId/billing/trial`
Starts the shop's one 14-day Pro trial. → `201 { plan: "plus", startedAt, endsAt }`. Errors: `409 trial_used` (had one),
`409 trial_not_needed` (on a paid plan or a restaurant tier). The booking link going live starts it too.

## `GET /v1/billing/first-year-price` (public)
→ `{ shown, priceCents, listPriceCents, eligible: false, taken: false }`. Config: `FIRST_YEAR_PRICE_*`.

## `GET /v1/merchants/:merchantId/billing/plans`
→ `{ items: PlanOption[], nextCursor: null }`.

## `POST /v1/merchants/:merchantId/billing/checkout`
Body: `{ plan: "plus"|"studio"|"pro", interval?: "month"|"year" (month), successUrl?, cancelUrl? }`. An annual Pro checkout
of an eligible shop carries the first-year coupon (`first_year_<cents off>`) and `first_year_price: "1"` metadata.
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
