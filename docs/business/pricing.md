# Pricing (v2)

Oct 22, 2026 · Founder decision · Prices in CAD

**What changed:** only the loyalty program and the reports on it are free. Every other feature moves to Plus or Pro, and paid features roll out later as the network grows. This replaces the earlier "every loyalty feature, promos and integrations free" split.

The source of truth is `packages/shared/src/plans.ts` (`FEATURES`, `FREE_FOREVER`). The server enforces it with `requireFeature`. The financial effect is in `docs/finance/unit-economics.md` §0.

## Free, forever ($0, no transaction fee)

| Feature | Why it is free |
| --- | --- |
| Points per dollar, per visit, stamp cards, points per item | This is the loyalty program |
| Rewards catalog, welcome bonus, manual adjustments | Same |
| No-earn categories (prescriptions, alcohol, tobacco, lottery, gift cards) | Compliance: it has to be on for everyone |
| Network listing (map and feed) | Shops must be findable or there is no network |
| Apple / Google Wallet pass | How customers join without downloading an app |
| Customer directory | You need to see your members to run a program |
| Basic reports (visits, members, rewards, redemptions, activation) | Reporting on the free program |
| Unlimited staff, unlimited locations, unlimited members | Kept free per the founder's earlier instruction. **Open question**: staff and locations may be revisited |

The invariant still holds: a free-forever feature can never be gated. Admins can't hide it, and a test fails if it moves to a paid plan. Before launch we moved the features listed below once. After launch, what is free stays free.

## Café & Retail: $39/mo ($390/yr), 500 SMS/mo included

- **Promos:** offers, double-points days, bonus points on items, nearby push promos.
- **Loyalty extras:** VIP levels, birthday reward, referrals, digital discount cards.
- **Marketing:** email and push campaigns, SMS campaigns, automations (win-back, reward-ready).
- **Data:** CSV export, CSV import and migration from another app.
- **Integrations:** POS auto-award (Square, Clover, Shopify, Lightspeed, Toast), Mailchimp, outgoing webhooks, Zapier/Make and the merchant REST API.
- **Reports:** advanced reports (retention cohorts, network overlap, promo results).
- **Commerce:** order-ahead, pickup status, pickup slots, in-app payments (Stripe fee at cost; 0% platform fee on orders, 1% on deposits and invoices).
- **Appointments:** the staff-column calendar, services and prices, staff hours and time off, online booking with a deposit or a card on file, walk-ins, reminders and no-show protection, and checkout with a tip for the stylist (`booking.appointments`). Founder default until told otherwise: salons, barbers, threading, henna and bridal artists buy Café & Retail at $39, with no per-chair charge.

## Service: $99/mo ($990/yr), 1,500 SMS/mo included

Everything in Plus, plus:

- Service tickets
- Quote approval
- Deposits
- Invoices
- Drop-off scheduling
- Staff permissions

## Restaurant pack: Starter $99, Growth $199, Pro $349 per month

A separate ladder for restaurants, sweet shops and tiffin kitchens, sold beside Free, Café & Retail and Service. Any restaurant tier includes everything in Café & Retail (`effectivePlan`), so a restaurant never pays for both. Annual price is 10 months (Starter $990, Growth $1,990, Pro $3,490). Source of truth: `RESTAURANT_PLANS`, `ADD_ONS`, `FEES`, `FOUNDING_OFFER` in `packages/shared/src/plans.ts`. Restaurant features ship GA; they are reachable only by buying the pack.

| Tier | Price | Adds | WhatsApp included |
| --- | --- | --- | --- |
| Starter | $99/mo | Commission-free ordering, branded ordering page, halal and dietary tags, multilingual menu, WhatsApp order updates, Google review requests | 300 a month (order updates and review requests) |
| Growth | $199/mo | Everything in Starter, plus tiffin subscriptions, catering and events, biryani pot (degh) pre-orders, festival campaigns, WhatsApp ordering and marketing | 1,000 a month |
| Pro | $349/mo | Everything in Growth, plus banquet hall booking, kitchen display, multilingual staff screens, cash discount pricing (not in Quebec), split bills, phone ordering assistant, restaurant analytics | 3,000 a month |

### Add-ons

Add-ons are subscription items on the restaurant subscription (`merchant_add_ons`). They need a live restaurant plan, are prorated by Stripe, and can be removed any time. Annual restaurant plans pay 10 months of the add-on price.

| Add-on | Price | What it does |
| --- | --- | --- |
| 1,000 WhatsApp messages | $49 per pack | Adds 1,000 to `merchants.whatsappCreditsExtra` when bought and on every paid renewal (12,000 up front on an annual plan) |
| Extra restaurant location | $49/mo each | Quantity item for each additional restaurant |
| Banquet module | $99/mo | Unlocks `restaurant.banquet` on Growth. Already in Pro, so it can't be added there. Needs Growth, not Starter |
| Phone ordering assistant | $79/mo | Unlocks `restaurant.phone_ai` on Growth. Same rules as the banquet module |

Moving to Starter or Pro drops the banquet and phone add-ons (Starter loses the feature, Pro includes it). WhatsApp packs and extra locations stay.

### Founding offer

The first 20 restaurants per corridor (`merchants.foundingOffer`) pay 50% off for 12 months, then 25% off for life. In Stripe this is a 50%-for-12-months coupon applied at Checkout, then a two-phase subscription schedule that moves the subscription to a 25%-forever coupon and releases it. Growth is $99.50 a month in year one, then $149.25.

### Fees on payments

Card processing (Stripe's standard rate) is passed through at cost on every payment. Our fee on top:

| Payment | Platform fee |
| --- | --- |
| Online orders, restaurant tier or any paid plan | 0% (commission-free) |
| Online orders, Free plan | 1.5% |
| Optional customer service fee on orders | $0.49, only if the restaurant turns it on |
| Deposits (catering, banquet, quotes) and invoices | 1% |
| Online appointment deposits and no-show fees | 1% |
| Appointment checkout taken through the calendar (counter or pay link) | 0% (card processing at cost) |
| Tiffin subscription billing | 1% |
| Payments you record by hand (Interac e-transfer, cash, cheque) | 0% |

Payments you record by hand carry no platform fee: the 1% stays on card and bank debit taken in the app, where we do the work. A tiffin kitchen, caterer or hall that takes e-transfer or cash can sign customers up without a Stripe account. The fee on a taxed tiffin charge is a share of the price before tax. One function computes all of these: `computeFees()` in `apps/api/src/services/fees.ts`. Delivery apps commonly keep 15 to 30% of an order; a Growth restaurant doing $5,000 a month in online orders pays $199 flat instead of roughly $750 to $1,500 in commission. The pricing page and the billing screen both show this table.

Appointments: checkout taken through the calendar, at the counter or by the pay link texted from it, carries no platform fee (`FEES.appointmentCheckoutBps = 0`, kind `appointment_checkout`; card processing at cost). On a $60 service with a tip, 1% plus Stripe would sit above Square's 2.5% in person, so only the online deposit at booking (and a no-show fee charged to a saved card) pays the 1%. Check Stripe Canada's current rate before publishing any comparison. Source: `docs/research/service-businesses.md` section 4.4 (founder default: appointments inside Café & Retail, 0% on in-person checkout).

Note: every payment path now uses `computeFees()`. Café & Retail and Service shops pay 0% on online orders (was 0.75%) and 1% on quote deposits and invoices (was 0.75%).

### Charge mode

`merchants.chargeMode` is `destination` (default: the payment is created on our Stripe account and the funds are transferred to the merchant, with `application_fee_amount`) or `direct` (the charge is created on the merchant's connected account, the merchant is the merchant of record, and the application fee is still taken). Direct charges are behind `STRIPE_DIRECT_CHARGES` (default off); while it is off every merchant uses destination charges. An admin switches a merchant with `PUT /v1/admin/merchants/:merchantId/charge-mode`. A direct-charge merchant needs a connected Stripe account.

## Not plan features

- **Network perks** ("visit 3 shops on the strip" bonuses) are a platform/BIA lever. Admins configure them, the network funds them, and they run for every shop whatever its plan.
- **Phase 3:** sponsored listings, sponsored promos, map pins and BIA neighbourhood campaigns are paid per campaign. Unchanged.

## Rollout

Every paid feature ships **hidden**. An admin moves it hidden → beta → GA once the network gate is met: `unlockAtMerchants` is 100 active merchants for Plus features and 40 for Pro features. Until then:

- **Pilot shops** get paid features through admin per-merchant overrides (Admin → Rollout → Overrides). The demo seed does this for Pinecone Coffee, Hearth & Crumb and Village Apothecary.
- **Existing data stays** when a shop doesn't have a feature: promos, VIP levels, discount cards, webhooks and POS connections are kept but stop applying. Customers don't see that shop's promos or discount cards. VIP multipliers and promo boosts don't apply to earn. POS events are logged as "paused" and webhooks stop sending. Merchants can still read and delete their data.

## Why

1. **Free has to win the counter, not give away the business.** A complete loyalty program with no fee and unlimited rewards and locations is still more generous than SoPoints Free (5% fee, 1 location, no active rewards) and Starter (US$49, 2.5% fee).
2. **The features that drive conversion were free.** Promos, email/SMS and POS auto-award are what merchants upgrade for. With them on Free, the model's blended 12-month conversion was 20%. Pricing v2 assumes 35% (bear 20%, bull 45%), and that is the main thing to validate on pilot shops.
3. **Free gets cheaper to serve.** No email, SMS or POS sync on Free: $3.87 per free merchant per month instead of $4.62.
4. **The cost is adoption.** A thinner free tier may sign fewer shops. The model takes 15% fewer sign-ups, which delays the paid unlock by about 2 months and weakens network density on each strip.

Base-case result: break-even moves from month 60 to **month 51**. Cash needed to reach break-even falls from $420,715 to **$357,308**. LTV/CAC rises from 2.6x to **3.6x**. The figures and risks are in `docs/finance/unit-economics.md` §0.
