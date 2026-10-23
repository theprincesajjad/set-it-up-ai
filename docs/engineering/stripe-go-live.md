# Stripe go-live

Exact Stripe setup for launch, plus a test-mode checklist the founder can run before flipping to live keys. Everything is CAD. Verified against `apps/api/src/providers/paymentsStripe.ts`, `services/billing.ts`, `services/billing-restaurant.ts`, `services/payments.ts` and `config.ts`. The request shapes are locked by `apps/api/test/stripe-contract.test.ts`.

Do the whole thing in **test mode first**, then repeat steps 1 to 7 in live mode (test and live have separate keys, products, coupons and webhook secrets).

## Known issues to fix before live (see the verification report)

1. **Two webhook secrets, one env var.** Stripe issues a different signing secret for the "Your account" endpoint and the "Connected accounts" endpoint. `verifyWebhook` accepts one secret only, so one of the two endpoints will fail with 400. Until the lead ships the proposed patch (comma-separated `STRIPE_WEBHOOK_SECRET`, try each), you cannot receive both platform and Connect events. Test: `stripe-contract.test.ts`, "verifies events signed by either of two configured secrets" (`it.fails`).
2. **PAD with direct charges** was a bug (the direct branch dropped `acss_debit` and the mandate options). The saved-payment-methods work now covers it and `stripe-contract.test.ts` asserts it; re-run that file after any provider change.
3. **Subscription schedule vs. later edits (unverified offline).** A founding restaurant's subscription is attached to a schedule. Confirm in test mode (checklist F and G) that changing tier and attaching add-ons still works after the schedule exists. If Stripe rejects those calls, they need to go through the schedule instead.

## 1. Account settings

- Business details, public name "Local Loyalty", support email, statement descriptor `LOCALLOYALTY` (22 chars max).
- Settings, Business, Customer emails: turn on successful payment receipts and refund receipts.
- Settings, Payments, Payment methods: Cards on. Apple Pay and Google Pay on. **Pre-authorized debit in Canada (ACSS)** on (step 5).
- Developers, API keys: copy the secret key (`sk_test_...` now, `sk_live_...` at launch). Use a restricted key in production if you prefer; it needs write on Customers, PaymentIntents, Refunds, Checkout Sessions, Customer portal, Prices, Products, Coupons, Subscriptions, Subscription Schedules, Subscription Items, Accounts, Account Links, and read on Invoices.

## 2. Products and prices

### Plan products (Plus and Pro): create these by hand

The code reads the price ids from env vars. Without them it falls back to an inline price, which works but creates a throwaway product on every checkout, so create them.

| Product name | Interval | Amount (CAD) | Price lookup key | Env var |
| --- | --- | --- | --- | --- |
| Local Loyalty Plus | monthly | 39.00 | `plus_monthly` | `STRIPE_PRICE_PLUS_MONTHLY` |
| Local Loyalty Plus | yearly | 390.00 | `plus_annual` | `STRIPE_PRICE_PLUS_ANNUAL` |
| Local Loyalty Pro | monthly | 99.00 | `pro_monthly` | `STRIPE_PRICE_PRO_MONTHLY` |
| Local Loyalty Pro | yearly | 990.00 | `pro_annual` | `STRIPE_PRICE_PRO_ANNUAL` |

Recurring, flat rate, licensed usage, no trial. Copy each `price_...` id into the env var. Lookup keys on these are only for your own reference; the app uses the ids.

### Restaurant tiers and add-ons: created on first use, or pre-create

The app finds restaurant tier changes and add-on prices by **lookup key** and creates them if missing (`priceFor`). The key is `ll_<kind>_<interval>_<unit amount in cents>`, so a price change in `packages/shared/src/plans.ts` produces a new key automatically. Pre-create them so the first customer does not create products with a default name, and so the founder controls product names and tax codes.

Create one product per row, one recurring price per interval, and set **Lookup key** exactly as shown (price, Advanced options).

| Product | Monthly price (CAD) / lookup key | Yearly price (CAD) / lookup key |
| --- | --- | --- |
| Restaurant Starter | 99.00 / `ll_restaurant_starter_month_9900` | 990.00 / `ll_restaurant_starter_year_99000` |
| Restaurant Growth | 199.00 / `ll_restaurant_growth_month_19900` | 1990.00 / `ll_restaurant_growth_year_199000` |
| Restaurant Pro | 349.00 / `ll_restaurant_pro_month_34900` | 3490.00 / `ll_restaurant_pro_year_349000` |
| 1,000 WhatsApp messages | 49.00 / `ll_addon_whatsapp_1000_month_4900` | 490.00 / `ll_addon_whatsapp_1000_year_49000` |
| Extra restaurant location | 49.00 / `ll_addon_extra_location_month_4900` | 490.00 / `ll_addon_extra_location_year_49000` |
| Banquet module (Growth) | 99.00 / `ll_addon_banquet_module_month_9900` | 990.00 / `ll_addon_banquet_module_year_99000` |
| Phone ordering assistant | 79.00 / `ll_addon_phone_ai_month_7900` | 790.00 / `ll_addon_phone_ai_year_79000` |

Notes:
- Annual add-ons are 10 months of the monthly price (two months free), the same as the plans.
- Initial restaurant checkout uses an **inline price** (price_data) with the product name "Restaurant Starter/Growth/Pro", not the pre-created prices. Only tier changes and add-ons use the lookup keys. This is harmless but means the tier price a customer first pays is not the pre-created one.
- Set the tax behaviour and product tax code on every product if you collect GST/HST through Stripe Tax. The code does not enable automatic tax on checkout today; decide this before live.

## 3. Coupons

Created automatically on first use by id, so only pre-create if you want to see them. Exact definitions:

| Coupon id | Percent off | Duration | Used for |
| --- | --- | --- | --- |
| `founding_year_one` | 50 | repeating, 12 months | Applied at Checkout for merchants with the founding offer |
| `founding_lifetime` | 25 | forever | Phase two of the subscription schedule |

If you pre-create, use these exact ids. Do not delete them while subscriptions use them.

The schedule is created when the founding merchant's `checkout.session.completed` webhook arrives: phase 1 is 12 months at `founding_year_one` (annual plans: 1 year), phase 2 is one period at `founding_lifetime`, then the schedule is released so the last phase's 25% carries on for life.

## 4. Connect (merchant payouts)

Settings, Connect:
- Enable Connect. Platform profile: "software platform" that takes fees; accounts are **Express**, country **CA**, capabilities `card_payments` and `transfers` (the app requests these).
- Branding: logo, icon, brand colour (#FF5A1F) for the Express onboarding screens.
- Onboarding: redirect URLs are passed per link by the app (`return_url` / `refresh_url` on the merchant billing page), nothing to set.
- Payouts: standard schedule (daily rolling, 2 business days in Canada) unless you decide otherwise.
- Settings, Connect, Settings, Payments: turn on the payment methods for connected accounts you want (cards, wallets, and ACSS for tiffin PAD).

### Destination vs. direct charges

| | Destination (default) | Direct |
| --- | --- | --- |
| Who is merchant of record | Local Loyalty | The merchant |
| Charge lives on | Platform account | Merchant's connected account |
| Request | `transfer_data[destination]`, `on_behalf_of`, `application_fee_amount` | `Stripe-Account: acct_...`, `application_fee_amount` |
| Refund | Platform account, `reverse_transfer`, `refund_application_fee` | On the connected account, `refund_application_fee` |
| Webhook events arrive at | Platform endpoint | **Connected accounts endpoint** (event has `account`) |
| Switch on | Default for every merchant | `STRIPE_DIRECT_CHARGES=1` and admin `PUT /v1/admin/merchants/:merchantId/charge-mode` with `direct` (needs a connected account) |

Launch with destination for everyone. Turn direct on for one test merchant first, and only after issue 1 at the top is fixed (direct events arrive on the Connect endpoint).

## 5. Pre-authorized debit (ACSS) for Canada

1. Dashboard, Settings, Payments, Payment methods: enable **Pre-authorized debit in Canada**. It may need a short Stripe review.
2. For connected accounts, enable the same method under Settings, Connect, Payment methods (or on the capability list) and confirm the `acss_debit_payments` capability is active on the test merchant's account.
3. Set `TIFFIN_PAD=1` in the API env.
4. The app creates tiffin PADs as `payment_method_types[]=acss_debit`, mandate `payment_schedule=combined`, `interval_description="Tiffin subscription"`, `transaction_type=personal`, `verification_method=automatic`. Customers see the standard PAD mandate; instant verification uses Financial Connections, micro-deposits are the fallback.
5. PAD payments settle in days, not seconds. `payment_intent.processing` is not handled today; the charge shows pending until `payment_intent.succeeded` or `payment_intent.payment_failed`.

## 6. Customer portal

Settings, Billing, Customer portal:
- Turn on: update payment method, view invoice history, cancel subscription (at end of period), update subscription **off** for restaurant plans (tier and add-on changes go through the app so merchant rows stay in sync; the app also reconciles portal edits from `customer.subscription.updated`).
- Business information: support email and terms/privacy URLs.
- Return URL is passed by the app per session.

## 7. Webhooks

One URL for everything: `POST {PUBLIC_API_URL}/v1/webhooks/stripe`. Create **two** endpoints pointing at it (Developers, Webhooks, Add endpoint), because Stripe separates platform and Connect events. Use the API version `2026-09-30.endive` (what the installed SDK sends) or leave the account default if it matches.

**Endpoint A: Events on your account** (platform)

| Event | Why |
| --- | --- |
| `checkout.session.completed` | Plan and restaurant tier purchase, platform charges (ads, BIA fees) |
| `customer.subscription.created` | Sync plan / tier |
| `customer.subscription.updated` | Sync status, period end, add-on items, cancel-at-period-end |
| `customer.subscription.deleted` | Drop to Free / clear restaurant tier |
| `invoice.paid` | WhatsApp pack credits each renewal |
| `invoice.payment_failed` | Mark past_due |
| `payment_intent.succeeded` | Orders, deposits, invoices, tiffin, splits, catering and hall deposits, platform charges |
| `payment_intent.payment_failed` | Release / fail the same |

**Endpoint B: Events on Connected accounts** (listen to Connect)

| Event | Why |
| --- | --- |
| `account.updated` | Onboarding status: charges / payouts enabled, details submitted |
| `payment_intent.succeeded` | Direct charges (only matters once direct is on) |
| `payment_intent.payment_failed` | Direct charges |

Events the app ignores are acknowledged with 200, so extra events are harmless, but do not select them. Every event is stored once in `webhook_events` (replays return `duplicate: true`); a handler error returns 500 so Stripe retries.

Signing secrets: copy each endpoint's `whsec_...`. Both must be accepted by the API, see issue 1. For local work use `stripe listen --forward-to localhost:4000/v1/webhooks/stripe` (add `--forward-connect-to` for Connect events) and use the secret it prints.

## 8. Environment variables (`apps/api/src/config.ts`)

| Variable | Value | Required |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_...` then `sk_live_...`. Presence switches from FakePayments to Stripe. | Yes |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` of the webhook endpoint(s) (see issue 1) | Yes |
| `STRIPE_PRICE_PLUS_MONTHLY` | `price_...` | Recommended |
| `STRIPE_PRICE_PLUS_ANNUAL` | `price_...` | Recommended |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_...` | Recommended |
| `STRIPE_PRICE_PRO_ANNUAL` | `price_...` | Recommended |
| `STRIPE_DIRECT_CHARGES` | `1` or `true` to honour `chargeMode=direct`. Leave unset at launch. | No |
| `TIFFIN_PAD` | `1` to offer PAD to tiffin subscribers | No |
| `PUBLIC_API_URL` | Public base URL of the API (webhook URL, redirects) | Yes in production |
| `PUBLIC_WEB_URL` | Web app URL, used for checkout success / cancel and portal return links | Yes in production |
| `NODE_ENV` | `production`. Also requires `JWT_SECRET` and `ENCRYPTION_KEY`; the dev payment simulator is disabled. | Yes |

Note: `apps/api/.env.example` does not list `STRIPE_DIRECT_CHARGES` or `TIFFIN_PAD`; add them there.

## 9. Test-mode checklist (founder)

Use test keys and a test merchant with Connect onboarding finished. Run the API with `stripe listen` forwarding both account and Connect events. After each step check Developers, Events for a green 200 on the webhook, and the Local Loyalty dashboard.

Test cards (any future expiry, any CVC, any postal code):

| Card | Behaviour |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0027 6000 3184` | Requires 3D Secure authentication (complete or fail the challenge) |
| `4000 0000 0000 9995` | Declined, insufficient funds |
| `4000 0000 0000 0341` | Attaches, then fails when charged (renewal failure) |

Canadian PAD (ACSS) test details: institution `000`, transit `11000`, account `000123456789` succeeds (this is also the test bank account for Connect onboarding). Stripe publishes extra test account numbers that force a failed or disputed debit, and the micro-deposit test descriptor code; take them from https://docs.stripe.com/payments/acss-debit/accept-a-payment#test-integration because they change. Use the "fails" account for the failure steps below.

**A. Connect onboarding.** Merchant, Payments, Connect. Finish the Express form with Stripe's test data (use the test-mode skip links, bank account `000123456789`, transit `11000`, institution `000`). Expect `account.updated`; dashboard shows charges and payouts enabled.

**B. Order, destination.** Place an order for $50 on a Free-plan merchant with the service fee on. In Stripe, Payments: the PaymentIntent has a transfer to the connected account, application fee $0.75 + $0.49 = $1.24, `on_behalf_of` set. Pay with `4242...`. Expect `payment_intent.succeeded` and the order marked paid. Repeat with `4000 0027 6000 3184`: complete the challenge, then fail it once and confirm the order does not go paid.

**C. Refund, destination.** Refund the order from the merchant dashboard (full, then a partial one on a second order). In Stripe the refund shows the transfer reversed and the application fee returned.

**D. Direct charge (only after issue 1 is fixed).** Set `STRIPE_DIRECT_CHARGES=1`, switch the test merchant to direct. Place an order. In Stripe, the payment appears under the connected account (switch to its view), not the platform, with the application fee. Webhook arrives on the Connect endpoint. Refund it and confirm the refund is on the connected account and the fee came back.

**E. Plan subscription.** Make Plus visible (admin rollout), buy Plus monthly with `4242...` from Billing. Expect `checkout.session.completed` and `customer.subscription.created`; merchant plan becomes Plus. Open the portal, update the card, cancel at period end, then resume in the app. Buy Pro annual on another merchant.

**F. Restaurant tier with founding offer.** Mark a merchant as founding. Buy Restaurant Growth monthly. Expect Checkout to show 50% off for 12 months ($99.50). After the webhook, in Stripe open the subscription: it has a **schedule** with two phases (12 months at 50%, then 25% off). Confirm `founding_year_one` and `founding_lifetime` exist. Use a test clock: advance 12 months plus a day and confirm the invoice drops to $149.25 (25% off $199) and stays there.

**G. Tier change and add-ons on that founding subscription.** Change Growth to Pro in the app: the base item price changes and a prorated line appears. Attach Extra restaurant location with quantity 3, then change to 2, then remove: three items events, proration lines on the next invoice. Attach WhatsApp 1,000 pack: 1,000 credits arrive immediately and again on the next renewal (advance the test clock, look for `invoice.paid` with `subscription_cycle`). Attach Banquet on Growth. If any of these fail on a subscription that has a schedule, stop and tell the engineer (issue 3).

**H. Failed renewal.** Subscribe with `4000 0000 0000 0341`, advance the test clock one period. Expect `invoice.payment_failed`, merchant goes past_due and keeps the plan during retries.

**I. Tiffin PAD.** `TIFFIN_PAD=1`, destination merchant. Subscribe a customer to a tiffin plan, choose pre-authorized debit, verify with instant or micro-deposit, then use the `000123456789` account. The PaymentIntent is `acss_debit` with the mandate; the charge stays pending, then succeeds. Repeat with Stripe's failing test account: it fails and the subscription shows payment failed.

**J. Webhook hardening.** In Stripe, resend a delivered event: the API answers 200 with `duplicate: true`. Send a request to the webhook URL with a bad signature: 400 `invalid_signature`.

**K. Go live.** Repeat steps 1 to 7 with live mode, set live env vars, run one real $1 order on the founder's own card and refund it, then cancel a real Plus subscription. Keep the first week's webhook failures list open in Developers, Webhooks.
