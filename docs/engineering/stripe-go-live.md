# Stripe go-live

Exact Stripe setup for launch, plus a test-mode checklist the founder can run before flipping to live keys. Everything is CAD. Verified against `apps/api/src/providers/paymentsStripe.ts`, `services/billing.ts`, `services/billing-restaurant.ts`, `services/payments.ts` and `config.ts`. The request shapes are locked by `apps/api/test/stripe-contract.test.ts`.

Do the whole thing in **test mode first**, then repeat steps 1 to 7 in live mode (test and live have separate keys, products, coupons and webhook secrets).

## Known issues to fix before live (see the verification report)

1. **Two webhook secrets (fixed).** Stripe issues a different signing secret for the "Your account" endpoint and the "Connected accounts" endpoint. Set both in `STRIPE_WEBHOOK_SECRET`, comma-separated; `verifyWebhook` tries each. Test: `stripe-contract.test.ts`, "verifies events signed by either of two configured secrets".
2. **PAD with direct charges** was a bug (the direct branch dropped `acss_debit` and the mandate options). The saved-payment-methods work now covers it and `stripe-contract.test.ts` asserts it; re-run that file after any provider change.
3. **Subscription schedule vs. later edits (fixed in code, confirm in test mode).** A founding restaurant's subscription is attached to a schedule, and Stripe rejects direct item edits on such a subscription (and the next phase would overwrite them). Tier changes, add-on attach, quantity change and detach now go through `subscriptionSchedules.update` when the subscription has a schedule: the current and all future phases get the new items, each phase keeps its coupon, dates, proration setting and tax setting, `proration_behavior` is `create_prorations`. The tier change also writes `restaurant_tier` to the subscription's metadata (metadata is not schedule-managed; the webhook reads the tier from it). Once the schedule is released after phase two the subscription is edited directly again. The request shapes are locked by the "schedule-managed (founding offer) subscription" tests in `stripe-contract.test.ts`; confirm against real Stripe with checklist F and G.
4. **`payment_intent.processing` is now handled** (see section 5 and 7). Add that event to both webhook endpoints.
5. **Automatic tax is optional and off** (`STRIPE_AUTOMATIC_TAX`). Decide before live and, if on, complete section 10 first.

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
| Local Loyalty Pro (id `plus`) | monthly | 29.00 | `plus_monthly` | `STRIPE_PRICE_PLUS_MONTHLY` |
| Local Loyalty Pro (id `plus`) | yearly | 290.00 | `plus_annual` | `STRIPE_PRICE_PLUS_ANNUAL` |
| Local Loyalty Studio | monthly | 59.00 | `studio_monthly` | `STRIPE_PRICE_STUDIO_MONTHLY` |
| Local Loyalty Studio | yearly | 590.00 | `studio_annual` | `STRIPE_PRICE_STUDIO_ANNUAL` |
| Local Loyalty Service (id `pro`) | monthly | 99.00 | `pro_monthly` | `STRIPE_PRICE_PRO_MONTHLY` |
| Local Loyalty Service (id `pro`) | yearly | 990.00 | `pro_annual` | `STRIPE_PRICE_PRO_ANNUAL` |

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
- Set the tax behaviour (**exclusive**) and product tax code (`txcd_10103001`, software as a service, business use) on every product if you collect GST/HST through Stripe Tax. With `STRIPE_AUTOMATIC_TAX` on, the app sets both on the inline checkout price and on the lookup-key prices it creates, but prices you pre-create, and the `STRIPE_PRICE_*` plan prices, must have them set by hand (section 10).

## 3. Coupons

Created automatically on first use by id, so only pre-create if you want to see them. Exact definitions:

| Coupon id | Percent off | Duration | Used for |
| --- | --- | --- | --- |
| `founding_year_one` | 50 | repeating, 12 months | Applied at Checkout for merchants with the founding offer |
| `founding_lifetime` | 25 | forever | Phase two of the subscription schedule |
| `first_year_9100` | $91.00 off (amount, CAD) | once | The first-year price of annual Pro (`FIRST_YEAR_PRICE`, $199 instead of $290 for year one, first 200 shops). The id carries the amount off, so changing `FIRST_YEAR_PRICE_CENTS` makes a new coupon. Its name, "First-year price", is what the shop sees on Checkout and the invoice |

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

**Changing a merchant's charge mode and saved tiffin cards.** A tiffin customer's Stripe customer and saved card or bank account live on the account that charged them (the platform for destination, the merchant's connected account for direct), so they can't be used after a switch. When the admin endpoint changes the stored mode it clears the saved customer id, payment method id and card details of every non-cancelled tiffin subscription of that merchant, and drops the unpaid PaymentIntent of any pending charge (it lives on the old account too). The response says how many subscriptions were reset (`tiffinSubscriptionsReset`). At the next renewal the roll finds no saved card, creates a new intent and customer on the new account and sends the customer the usual "your tiffin renewal is ready" (`renewal_due`) notice; paying it saves the new card for the renewals after that. A payment that is already processing is left alone. The reset runs on any change of the stored mode, even while `STRIPE_DIRECT_CHARGES` is off, because the flag can be turned on later. Tell the kitchen before you flip a merchant with subscribers.

## 5. Pre-authorized debit (ACSS) for Canada

1. Dashboard, Settings, Payments, Payment methods: enable **Pre-authorized debit in Canada**. It may need a short Stripe review.
2. For connected accounts, enable the same method under Settings, Connect, Payment methods (or on the capability list) and confirm the `acss_debit_payments` capability is active on the test merchant's account.
3. Set `TIFFIN_PAD=1` in the API env.
4. The app creates tiffin PADs as `payment_method_types[]=acss_debit`, mandate `payment_schedule=combined`, `interval_description="Tiffin subscription"`, `transaction_type=personal`, `verification_method=automatic`. Customers see the standard PAD mandate; instant verification uses Financial Connections, micro-deposits are the fallback.
5. PAD payments settle in days, not seconds. `payment_intent.processing` is handled: the order (`orders.payment_processing_at`), invoice, quote deposit, catering deposit and hall deposit (`*_processing_at`) are marked processing and stay unpaid, and a tiffin charge goes to status `processing` (customers see it as pending with `processing: true`). The same PaymentIntent is reused everywhere, a processing tiffin charge is skipped by the renewal roll and `retry-payment` answers 409 while it is in flight, so nothing is charged twice. Customers get a "payment is processing" notification for tiffin, quote deposits, catering and hall deposits, and a visible ticket note for invoices. `payment_intent.succeeded` completes it as before; `payment_intent.payment_failed` after processing clears the marker and fails it (order `failed`, tiffin charge `failed` and the subscription past due, deposits and invoices unpaid again so the customer can retry). Migration `0009_payment_processing` adds the columns.

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
| `payment_intent.processing` | Bank debit (PAD) in flight: mark orders, invoices, deposits and tiffin charges processing |
| `payment_intent.succeeded` | Orders, deposits, invoices, tiffin, splits, catering and hall deposits, platform charges |
| `payment_intent.payment_failed` | Release / fail the same, including a debit that failed after processing |

**Endpoint B: Events on Connected accounts** (listen to Connect)

| Event | Why |
| --- | --- |
| `account.updated` | Onboarding status: charges / payouts enabled, details submitted |
| `payment_intent.processing` | Direct charges (PAD in flight) |
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
| `STRIPE_PRICE_STUDIO_MONTHLY` | `price_...` | Recommended |
| `STRIPE_PRICE_STUDIO_ANNUAL` | `price_...` | Recommended |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_...` | Recommended |
| `STRIPE_PRICE_PRO_ANNUAL` | `price_...` | Recommended |
| `STRIPE_DIRECT_CHARGES` | `1` or `true` to honour `chargeMode=direct`. Leave unset at launch. | No |
| `TIFFIN_PAD` | `1` to offer PAD to tiffin subscribers | No |
| `STRIPE_AUTOMATIC_TAX` | `1` or `true` to collect GST/HST on our own subscription checkouts (plans, restaurant tiers) with Stripe Tax. Default off. Needs section 10 done first. | No |
| `PUBLIC_API_URL` | Public base URL of the API (webhook URL, redirects) | Yes in production |
| `PUBLIC_WEB_URL` | Web app URL, used for checkout success / cancel and portal return links | Yes in production |
| `NODE_ENV` | `production`. Also requires `JWT_SECRET` and `ENCRYPTION_KEY`; the dev payment simulator is disabled. | Yes |

`apps/api/.env.example` lists all of these, including `STRIPE_DIRECT_CHARGES`, `TIFFIN_PAD` and `STRIPE_AUTOMATIC_TAX`.

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

**G. Tier change and add-ons on that founding subscription.** These go through the subscription's schedule (issue 3): after each step open the schedule in Stripe and confirm both phases have the new items and their coupons are unchanged. Change Growth to Pro in the app: the base item price changes in both phases and a prorated line appears. Attach Extra restaurant location with quantity 3, then change to 2, then remove: three items events, proration lines on the next invoice. Attach WhatsApp 1,000 pack: 1,000 credits arrive immediately and again on the next renewal (advance the test clock, look for `invoice.paid` with `subscription_cycle`). Attach Banquet on Growth. Also confirm `restaurant_tier` on the subscription's metadata now says `pro` (the webhook reads it) and that the next `customer.subscription.updated` leaves the merchant on Pro. After the schedule's second phase ends and it is released, repeat one tier change: it should be a direct subscription edit. If any of these fail on a subscription that has a schedule, stop and tell the engineer (issue 3).

**H. Failed renewal.** Subscribe with `4000 0000 0000 0341`, advance the test clock one period. Expect `invoice.payment_failed`, merchant goes past_due and keeps the plan during retries.

**I. Tiffin PAD.** `TIFFIN_PAD=1`, destination merchant. Subscribe a customer to a tiffin plan, choose pre-authorized debit, verify with instant or micro-deposit, then use the `000123456789` account. The PaymentIntent is `acss_debit` with the mandate; expect `payment_intent.processing` first (the charge shows processing, the customer gets "your tiffin payment is processing", the subscription stays as it was, and a second tap on pay says it is still processing), then `payment_intent.succeeded` settles it. Repeat with Stripe's failing test account: after processing it fails, the charge shows failed and the subscription shows payment failed. Do the same once for a catering deposit, a hall deposit, a repair quote deposit and an invoice paid by PAD: each shows processing (not paid) until the debit clears.

**J. Webhook hardening.** In Stripe, resend a delivered event: the API answers 200 with `duplicate: true`. Send a request to the webhook URL with a bad signature: 400 `invalid_signature`.

**K. Charge-mode change.** With a test merchant that has two tiffin subscribers with a saved card (one on PAD), switch the merchant to direct (admin charge-mode endpoint). The response should say `tiffinSubscriptionsReset: 2`. Both subscribers show no card on file. Advance the clock to the next renewal: each gets a "renewal is ready" notice and a new PaymentIntent on the connected account (switch to its view in Stripe); paying it saves the card on the connected account, and the renewal after that is automatic.

**L. Automatic tax (only if `STRIPE_AUTOMATIC_TAX` is on).** After section 10 is done, buy Plus monthly with a Toronto billing address: Checkout asks for the billing address, shows HST 13% added on top, and the invoice has the tax line. Repeat with a Calgary address (GST 5%) and a Vancouver address (GST only unless you registered for BC PST). The customer in Stripe now has the address and name saved. Buy Restaurant Growth with the founding offer: the 50% discount applies to the price and tax is computed on the discounted amount; after the test-clock rolls to the 25% phase, the invoice still has tax. With the flag off none of this happens: no address form, no tax line.

**M. Go live.** Repeat steps 1 to 7 and section 10 with live mode, set live env vars, run one real $1 order on the founder's own card and refund it, then cancel a real Plus subscription. Keep the first week's webhook failures list open in Developers, Webhooks.

## 10. Stripe Tax (GST/HST) for our own subscriptions

Only needed if you turn on `STRIPE_AUTOMATIC_TAX=1`. It affects Stripe Billing checkouts for **our** subscriptions: Plus and Pro plans, restaurant tiers and, through the same subscription, their add-ons. It does not touch merchant payments (orders, deposits, invoices, tiffin): those use the merchant's own tax settings in the app.

What the app does when the flag is on: Checkout is created with `automatic_tax[enabled]=true`, `billing_address_collection=required` and `customer_update[address]=auto, name=auto` (so an existing customer's address is saved from the form), inline checkout prices and the prices the app creates for tier changes and add-ons are `tax_behavior=exclusive` (tax is added on top of $39 / $99 / the tier price) with product tax code `txcd_10103001`, and founding-offer schedule phases keep automatic tax. Subscriptions created before the flag was turned on do not get tax retroactively.

Stripe Tax setup (test mode first, then live; registrations are per mode):
1. Dashboard, Tax, Settings: set the head office address (Canada), default product tax code `txcd_10103001` (software as a service, business use) and default tax behaviour **Exclusive**. Customers' tax-exempt status stays default.
2. Dashboard, Tax, Registrations: add a registration for each place you must collect. Stripe only calculates and collects tax where a registration exists; it does not file or remit for you (use Stripe Tax filing partners, or file yourself).
   - **Canada, federal GST 5%**: required once taxable supplies pass $30,000 in four quarters (small supplier rule). Enter the GST/HST number (`123456789RT0001`).
   - **Ontario HST 13%**: collected under the federal GST/HST registration (HST provinces are federal). Add Ontario as a registration with that number so Stripe applies 13% (5% federal + 8% provincial) to Ontario customers.
   - **Other HST provinces** under the same federal number: Nova Scotia 15%, New Brunswick 15%, Newfoundland and Labrador 15%, Prince Edward Island 15%. Add each province you sell into.
   - **GST-only provinces and territories** (Alberta, Yukon, NWT, Nunavut): 5% from the federal registration, nothing extra.
   - **British Columbia PST 7%, Saskatchewan PST 6%, Manitoba RST 7%, Quebec QST 9.975%**: provincial registrations are separate (BC, SK, MB through the province, Quebec through Revenu Quebec) and each has its own non-resident or small-supplier threshold; for software sold to businesses the rules differ again. Ask your accountant before adding them. Until a province is registered, Stripe charges only the 5% GST there.
   - US states: out of scope for this launch; leave unregistered.
3. Pre-created prices (`STRIPE_PRICE_PLUS_*`, `STRIPE_PRICE_STUDIO_*`, `STRIPE_PRICE_PRO_*` and the restaurant lookup-key prices in section 2) need **Tax behavior: Exclusive** and the product tax code set by hand. A price with no tax behaviour makes Checkout fail while automatic tax is on.
4. Customer portal (section 6): leave "update billing information" on, so customers can correct their address.
5. Run checklist L. Then set `STRIPE_AUTOMATIC_TAX=1` in the API env and redeploy. Turning it off again only affects new checkouts.

Tax shows on the Stripe invoice and receipt. The Billing invoice list in the app shows the invoice total including tax.
