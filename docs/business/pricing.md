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
- **Walk-in line and barber payouts** (`booking.walkin_queue`, `staff.payouts`): a live line for barbershops and threading bars (join from a phone or the tablet at the door, a wait estimate, a text when next, the barber picks who is next, a no-show rule), "my barber" and family members under one card for kids' cuts, and a payouts report with chair rent and commission per barber (a report, no money moves) where a renter sees only their own clients. Founder default until told otherwise: barbershops and threading bars buy Café & Retail at $39, with no per-chair charge. Beauty supply stores use the existing points per dollar, categories and discount cards on the same plan; texts, promos and rewards from a beauty supply shop are checked for treatment claims. Research: `docs/research/barbers-beauty.md`.
- **Classes and memberships** (`booking.classes`, `memberships.recurring`): class schedule with capacity and a waitlist that fills itself, drop-ins, class packs and intro offers, recurring memberships billed to the card on file with freezes, renewal notices and the Ontario 10-day cooling-off refund, late-cancel fees, and door check-in with the member card. Founder decision (keep today's plan structure): yoga, pilates, boxing, dance, bhangra, women-only and small-gym studios buy Café & Retail at $39, with no per-room or per-member charge and no add-on. Online class money carries the 1% fee below; money taken by hand at the desk carries none. See `docs/research/fitness-studios.md` section 4.

- **Pets** (`pets.profiles`, `pets.daycare`, `pets.food_cards`, `pets.report_cards`): pets under the owner with vaccine expiry dates and a photo of the certificate, a groom cadence per pet with a reminder text, a daycare check-in that stops expired shots with packs, capacity and dogs per staff, buy-12-get-1 food cards per brand and bag size (locked until earned, with a run-out text), and a report-card text after a visit. Founder default until told otherwise: groomers, dog daycares and independent pet food stores buy Café & Retail at $39, with no per-pet, per-dog or pack charge. The features only switch on for shops whose vertical is `pet`. Daycare packs are recorded by hand and carry no platform fee. Research: `docs/research/pet-care.md`.

- **Auto care** (`auto.vehicles`, `auto.tires`, `auto.wash`): cars under the owner with an optional plate and odometer readings, service reminders by km or months whichever comes first (a ride-hail car on shorter intervals) with a reminder text, a tire swap capacity plan for the fall and spring windows with customer booking that refuses a full day, a tire hotel record with rack and tread and a pickup text, and a wash check-in by plate, QR or phone with one wash a day and a list of plan members who stopped coming. Wash plans and the punch card are the memberships and packs above. The vehicle estimate rules (written estimate with part condition and dates, no work and no invoice before approval, the 10% cap, the estimate and odometer on the invoice) apply to vehicle tickets on the Service plan below. Founder default until told otherwise: car washes, garages and tire shops buy Café & Retail at $39 (a garage that writes estimates in the app buys Service at $99), with no per-bay charge.

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
| Class bookings, packs and intro offers paid online, membership billing, and late-cancel or no-show fees on a saved card (`FEES.classBps`, kind `class`) | 1% |
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

**Decision, 2026-10-27 (founder): "Trade tools self-serve."** A new shop subscribes to its own trade's tools right away, with no 100-shop wait and no admin override. That covers calendar and booking, ordering and pre-orders, classes and memberships, the walk-in line and payouts, pets, grocer tools, auto care, the restaurant tiers (including tiffin, catering and banquet) and pharmacist appointments. Café & Retail ($39), Service ($99) and the restaurant ladder ($99 / $199 / $349) are all buyable today, with one status and one price everywhere (pricing page, billing, gate cards, sales assistant).

Only **network-wide extras** wait for the gate, because they are worth nothing without a big network: sponsored promos, sponsored listings, map pins as ads, BIA neighbourhood campaigns, and nearby push promos. They ship **hidden** and an admin moves them hidden → beta → GA once the network has 100 active shops (`NETWORK_GATE_SHOPS`; 300 for ads). Until then a shop sees "Opens when the network reaches N shops" and a "Notify me" button.

How it is built: `FeatureDef.networkGated` in `packages/shared/src/plans.ts`. It is set for every phase 3 feature and by hand with `network(...)`. Every other feature, including ones added later, is a trade tool and ships GA (`settle()` sets `defaultStage` and `unlockAtMerchants`; a new `f(...)` needs no extra flag). A feature can also set `freeForVerticals`: pharmacist appointments (`booking.appointments`) are **free for pharmacy shops** (docs/audits/pharmacies.md P1); every other shop needs Café & Retail. Trade features that are tied to one vertical (`vertical`: pets, grocery, auto) switch on with the plan for shops of that vertical: pet shops' four pet features are on with Café & Retail (docs/audits/pet-care.md P1).

- **Admin overrides still work** (Admin → Rollout → Overrides) and still win, for example to give a pilot shop a network extra early or to switch a trade tool off for one shop.
- **Existing data stays** when a shop doesn't have a feature: promos, VIP levels, discount cards, webhooks and POS connections are kept but stop applying. Merchants can still read and delete their data.
- **Locked cards name the plan.** A feature that is off because of the plan says "On Café & Retail, $39 a month", "On Restaurant Growth, $199 a month" (tiffin, catering) or "On Restaurant Pro, $349 a month" (banquet), with a button to that plan's checkout. Tiffin and catering need Growth, not Starter.
- **Class fee:** 1% on online class sales and membership billing, none on desk sales. A cap was considered and not adopted (a $1,200 annual membership pays $12, still below card-network-style fees elsewhere); revisit if studios push back.

## Why

1. **Free has to win the counter, not give away the business.** A complete loyalty program with no fee and unlimited rewards and locations is still more generous than SoPoints Free (5% fee, 1 location, no active rewards) and Starter (US$49, 2.5% fee).
2. **The features that drive conversion were free.** Promos, email/SMS and POS auto-award are what merchants upgrade for. With them on Free, the model's blended 12-month conversion was 20%. Pricing v2 assumes 35% (bear 20%, bull 45%), and that is the main thing to validate on pilot shops.
3. **Free gets cheaper to serve.** No email, SMS or POS sync on Free: $3.87 per free merchant per month instead of $4.62.
4. **The cost is adoption.** A thinner free tier may sign fewer shops. The model takes 15% fewer sign-ups, which delays the paid unlock by about 2 months and weakens network density on each strip.

Base-case result: break-even moves from month 60 to **month 51**. Cash needed to reach break-even falls from $420,715 to **$357,308**. LTV/CAC rises from 2.6x to **3.6x**. The figures and risks are in `docs/finance/unit-economics.md` §0.
