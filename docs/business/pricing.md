# Pricing (v2, Pro value packaging)

Oct 22, 2026 · Founder decision · Prices in CAD, before HST · **Updated Oct 29, 2026: two paid tiers, the trial and the first-year price (founder decisions, final)**

**What this is.** Loyalty and the reports on it are free forever. Everything else is on **Pro** (plan id `plus`) for one person, **Studio** (plan id `studio`) for a shop with chairs, **Service** (plan id `pro`) for repair, auto, alterations and print shops, or the restaurant pack. The reasoning, the research and the dollar case are in `docs/business/pro-value.md`; this page is the rules and the code names.

The source of truth is `packages/shared/src/plans.ts` (`PLANS`, `FEATURES`, `FREE_FOREVER`, the constants named below). The server enforces it with `requireFeature`. No price or count is typed in copy: pages read `PLANS`, `TRIAL_DAYS`, `FIRST_YEAR_PRICE` and the usage endpoint.

> **History.** Oct 22: Pricing v2 (only loyalty free). Oct 29, morning: the $39 plan renamed "Pro" (id `plus`), the $99 plan "Service" (id `pro`); appointments free for one calendar; promo allowance; the annual website. Oct 29, founder (this version): Pro at $29, Studio at $59, the 14-day Pro trial for every new shop, and the first-year price of $199 replacing the founding solo price.

## The plans

| | **Free** | **Pro** · `plus` | **Studio** · `studio` | **Service** · `pro` |
| --- | --- | --- | --- | --- |
| Price | $0 | **$29/mo, $290/yr** | **$59/mo, $590/yr** | $99/mo, $990/yr |
| Who | Starting out | One person, or one person and an apprentice | A shop with chairs, renters, a walk-in line or a till | Repair, auto, alterations, print |
| Bookable calendars | 1 | 2 | Unlimited, no per-chair charge | Unlimited |
| Reminder and reply texts a month | 30, then email | 300, then 4¢ | 1,000, then 4¢ | 1,500, then 4¢ |
| Promos to regulars | None | 4 a month, 48 a year on annual | 8 a month, 96 a year on annual | As Studio |
| Website on a `.ca` domain | No | Annual only | Annual only | Annual only |
| "Powered by" badge | Shown | Removed | Removed | Removed |

`PLAN_RANK`: free 0, plus 1, studio 2, pro 3. Each plan includes everything below it (Service includes Studio, Studio includes Pro). Any restaurant tier counts as Studio (`effectivePlan`), so restaurants keep ordering, pickup and POS sync.

**On Pro** (the money features for one person): the waitlist that fills cancelled slots (`booking.waitlist`), rebooking and win-back that run themselves (`service.rebooking`), a Google review request after every visit (`booking.review_requests`), add-ons at booking (`booking.add_ons`), the weekly money report with a goal (`insights.weekly`), promos, VIP levels, birthday reward, referrals, email and text campaigns, CSV export and import, advanced reports, classes and memberships, pets (except daycare) and auto care.

**On Studio** (the shop and the till): the walk-in line (`booking.walkin_queue`), payouts and chair rent (`staff.payouts`), order-ahead and pickup status (`orders.*`), pickup slots (`booking.pickup_slots`), POS auto-award and webhooks and the API (`integrations.*`), daycare check-in (`pets.daycare`) and the grocer counter tools (`grocery.*`). A locked Studio feature offers Studio at $59 (`featureOffer`).

**On Service**: service tickets, quote approval, deposits, invoices, drop-off scheduling, staff permissions.

| Rule | Code |
| --- | --- |
| Plans and prices | `PLAN_IDS`, `PLANS`, `PAID_PLAN_IDS` |
| Calendar cap: Free 1, Pro 2, Studio and up none | `FREE_BOOKABLE_CALENDARS`, `PRO_BOOKABLE_CALENDARS`, `bookableCalendarLimit()` |
| Texts | `PLANS[id].smsPerMonth`, `SMS_OVERAGE_CENTS = 4`, `TRIAL_SMS_CAP = 100` |
| Promos | `PROMOS_PER_MONTH_PLUS`, `PROMOS_PER_YEAR_ANNUAL`, `PROMOS_PER_MONTH_STUDIO`, `PROMOS_PER_YEAR_STUDIO_ANNUAL`, `promoAllowance()` |
| Website | `site.builder` (`requiresAnnual`), `ANNUAL_INCLUDES_WEBSITE`, `merchants.annual_site_entitled` (annual Pro, Studio or Service) |
| Website AI | `SITE_AI_GENERATIONS_PER_MONTH`, `SITE_AI_EDITS_PER_MONTH` |
| Deposits and no-show fees, 1%, every plan | `appointmentPaymentsReady()` |

How it is enforced:

- **Calendar cap.** A person past the cap getting booking hours or a service list is refused with `402 plan_limit`. The offer names the next plan: a second calendar on Free offers Pro, a third on Pro (or the trial) offers Studio (`apps/api/src/services/appointments.ts`). After a downgrade the first calendars by join order stay bookable. Unlimited staff logins stay free: only *bookable* calendars are capped.
- **Texts.** Every text counts against `merchants.sms_credits_used` (reset on the 1st). Free and the trial stop at their allowance and the reminder goes by email; paid plans keep sending and the extra texts show on the billing page as overage at 4¢. Charging the overage through Stripe usage records is a follow-up; until then it is shown, not billed.
- **Promos.** `consumePromo()` in `apps/api/src/services/billing.ts` is the atomic gate. Free gets `402 feature_locked` with the Pro offer, a used-up allowance `402 promo_allowance_used`.
- **Annual entitlement.** `recomputePlan()` sets `merchants.annual_site_entitled` when a live paid subscription bills yearly, and clears it when that ends.
- **Usage.** `GET /v1/merchants/:id/billing/usage` returns calendars, texts, promos, the website flag and the trial.

## The 14-day Pro trial

Every new shop, any trade, gets **14 days of Pro, free, with no card**, starting the day its booking link goes live (the `booking_link_live` milestone), not at signup, so the two weeks cover real bookings. One per shop.

| | |
| --- | --- |
| Data | `merchants.trial_plan` (set only while it is live), `trial_started_at`, `trial_ends_at`, `trial_used` (migration `0042_pro_p1`) |
| Constants | `TRIAL_DAYS = 14`, `TRIAL_PLAN = "plus"`, `TRIAL_SMS_CAP = 100`, `trialActive()`, `liveTrialPlan()`, `trialDaysLeft()` |
| Start | `POST /v1/merchants/:id/billing/trial` (owner; `409 trial_used` the second time, `409 trial_not_needed` on a paid plan), and automatically when `booking_link_live` is recorded (`apps/api/src/services/trial.ts`). It writes the `trial_started` milestone, turns review requests on and rebooking to automatic |
| While live | Features resolve as Pro (`effectivePlan(plan, restaurantTier, trialPlan)`): the waitlist offers slots, reminders send themselves, review requests go out, add-ons show at booking, the Sunday report arrives. 2 calendars, 4 promos, texts capped at 100 then email. No Stripe object: there is nothing to cancel |
| End | The hourly job `billing.trial` (`apps/api/src/jobs/billing-trial.ts`) clears `trial_plan` at `trial_ends_at`, writes `trial_ended` and sends the receipt (P6's `trialReceipt`, pro-value.md §5.4) by push and email. A paid subscription going live ends it at once (`recomputePlan`). Nothing is deleted: automations pause, the waitlist stays visible, add-ons stay configured, the badge returns |
| Where it shows | The billing page banner ("Pro ends {weekday} · {n} days left" with Keep Pro monthly and yearly; after the end, "Pro ended {weekday}" with the numbers), and the Today card (`TrialCard.tsx`: start, day 11, the receipt) |

## The first-year price of annual Pro

The first **200 shops** on annual Pro pay **$199 for year one**, then $290. Founder: "Don't say founding promo, just show the discounted price!" So every page shows it as a struck-through list price, **~~$290~~ $199 first year**, and never names it; the spots counter stays internal (no page shows how many are left). Studio has no first-year price. It replaces the founding solo price ($290 for year one, then $390), which is gone.

| Setting | Default | Effect |
| --- | --- | --- |
| `FIRST_YEAR_PRICE_ENABLED` | on | `false` or `0` shows the plain $290 everywhere and stops the coupon |
| `FIRST_YEAR_PRICE_CENTS` | `19900` | Year-one price |
| `FIRST_YEAR_PRICE_SLOTS` | `200` | Shops that can take it |
| `FIRST_YEAR_PRICE_VERTICALS` | every shop | A comma list of verticals, or `solo` for `SOLO_VERTICALS` (beauty pros and barbershops), narrows it |

In code: `FIRST_YEAR_PRICE`, `firstYearPriceConfig(process.env)`, `firstYearPriceShown()`, `isFirstYearPriceEligible()` in `plans.ts`; `firstYearPriceFor()` in `apps/api/src/services/billing.ts`; public `GET /v1/billing/first-year-price` (`{ shown, priceCents, listPriceCents }`, no count). An eligible annual Pro checkout gets a once-only amount-off coupon (`first_year_<cents off>`, named "First-year price", $91 off by default) and `first_year_price = "1"` in the session metadata; the webhook sets `merchants.founding_solo` (the column kept its old name), which is what the internal counter counts. Two shops racing for the last spot can both get it; at 200 that is acceptable. The marketing pages read the same numbers through `apps/web/src/lib/marketing/plan-copy.ts`.

## Stripe

Prices: `STRIPE_PRICE_PLUS_MONTHLY` / `_ANNUAL` (Pro), `STRIPE_PRICE_STUDIO_MONTHLY` / `_ANNUAL` (Studio), `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` (Service); without them Checkout uses an inline CAD price from `PLANS`. Checkout accepts `plan: "plus" | "studio" | "pro"`; the webhook maps a subscription to its plan from the metadata, else from the price id. See `docs/engineering/stripe-go-live.md`.

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

Free also keeps one bookable calendar with online booking, deposits and card on file (1%), reminders by app, web push and email, 30 texts, the client list and the inbox. Seeing the waitlist and who is due is free; acting on them automatically is Pro.

The invariant still holds: a free-forever feature can never be gated. Admins can't hide it, and a test fails if it moves to a paid plan. After launch, what is free stays free.

## Trades on each plan

- **Nail, lash and brow techs, makeup artists, solo stylists and barbers:** Pro.
- **Barbershops and salons with chairs, threading bars:** Studio for the walk-in line, payouts and chair rent and more than 2 calendars, flat for any number of chairs. Research: `docs/research/barbers-beauty.md`.
- **Yoga, pilates, boxing, dance and small-gym studios:** Pro (classes and memberships; online class money carries 1%, desk money none). See `docs/research/fitness-studios.md` §4.
- **Groomers and pet food stores:** Pro; **dog daycares:** Studio (daycare check-in). Research: `docs/research/pet-care.md`.
- **Grocers and halal butchers:** Studio (the counter tools). Research: `docs/research/grocers.md`.
- **Cafés and bakeries** that sell order-ahead with POS auto-award: Studio; one that only runs promos and loyalty extras: Pro.
- **Car washes, garages and tire shops:** Pro; a garage that writes estimates in the app: Service.

## Restaurant pack: Starter $99, Growth $199, Pro $349 per month

A separate ladder for restaurants, sweet shops and tiffin kitchens, sold beside Free, Pro and Service. Any restaurant tier includes everything in Studio (`effectivePlan`, Oct 29: Studio took ordering, pickup and POS sync from Pro), so a restaurant never pays for both. Annual price is 10 months (Starter $990, Growth $1,990, Pro $3,490). Source of truth: `RESTAURANT_PLANS`, `ADD_ONS`, `FEES`, `FOUNDING_OFFER` in `packages/shared/src/plans.ts`. Restaurant features ship GA; they are reachable only by buying the pack.

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

Appointments: checkout taken through the calendar, at the counter or by the pay link texted from it, carries no platform fee (`FEES.appointmentCheckoutBps = 0`, kind `appointment_checkout`; card processing at cost). On a $60 service with a tip, 1% plus Stripe would sit above Square's 2.5% in person, so only the online deposit at booking (and a no-show fee charged to a saved card) pays the 1%. Check Stripe Canada's current rate before publishing any comparison. Source: `docs/research/service-businesses.md` section 4.4 (0% on in-person checkout). The same rates apply on Free since appointments became free for one calendar.

Note: every payment path now uses `computeFees()`. Pro and Service shops pay 0% on online orders (was 0.75%) and 1% on quote deposits and invoices (was 0.75%).

### Charge mode

`merchants.chargeMode` is `destination` (the payment is created on our Stripe account and the funds are transferred to the merchant, with `application_fee_amount`) or `direct` (the charge is created on the merchant's connected account, the merchant is the merchant of record, and the application fee is still taken). Since Oct 29 (migration `0032_solo_a`) **new shops default to `direct`** and `STRIPE_DIRECT_CHARGES` **defaults on** (set it to `0` to force destination for everyone). Shops created before keep `destination`. A Free shop that connects Stripe for the first time is set to `direct`. An admin switches a merchant with `PUT /v1/admin/merchants/:merchantId/charge-mode`. A direct-charge merchant needs a connected Stripe account.

**Deposits on Free require direct charges.** Under destination charges Stripe bills us about C$2 a month per active Connect account, which turns a free shop that takes deposits into a loss (solo-pro-launch.md §4.1). So a Free shop takes online deposits, cards on file and no-show fees only when its effective charge mode is direct (`appointmentPaymentsReady()` in `apps/api/src/services/payments.ts`); with the flag off, a Free shop's booking page books without a deposit. Paid shops take deposits in either mode.

## Not plan features

- **Network perks** ("visit 3 shops on the strip" bonuses) are a platform/BIA lever. Admins configure them, the network funds them, and they run for every shop whatever its plan.
- **Phase 3:** sponsored listings, sponsored promos, map pins and BIA neighbourhood campaigns are paid per campaign. Unchanged.

## Rollout

**Decision, 2026-10-27 (founder): "Trade tools self-serve."** A new shop subscribes to its own trade's tools right away, with no 100-shop wait and no admin override. That covers calendar and booking, ordering and pre-orders, classes and memberships, the walk-in line and payouts, pets, grocer tools, auto care, the restaurant tiers (including tiffin, catering and banquet) and pharmacist appointments. Pro ($29), Studio ($59), Service ($99) and the restaurant ladder ($99 / $199 / $349) are all buyable today, with one status and one price everywhere (pricing page, billing, gate cards, sales assistant).

Only **network-wide extras** wait for the gate, because they are worth nothing without a big network: sponsored promos, sponsored listings, map pins as ads, BIA neighbourhood campaigns, and nearby push promos. They ship **hidden** and an admin moves them hidden → beta → GA once the network has 100 active shops (`NETWORK_GATE_SHOPS`; 300 for ads). Until then a shop sees "Opens when the network reaches N shops" and a "Notify me" button.

How it is built: `FeatureDef.networkGated` in `packages/shared/src/plans.ts`. It is set for every phase 3 feature and by hand with `network(...)`. Every other feature, including ones added later, is a trade tool and ships GA (`settle()` sets `defaultStage` and `unlockAtMerchants`; a new `f(...)` needs no extra flag). A feature can also set `freeForVerticals`: pharmacist appointments (`booking.appointments`) are **free for pharmacy shops** (docs/audits/pharmacies.md P1); since Oct 29 appointments are free for every shop for one bookable calendar, and pharmacies keep theirs free too. Trade features that are tied to one vertical (`vertical`: pets, grocery, auto) switch on with the plan for shops of that vertical: pet shops' four pet features are on with Pro (docs/audits/pet-care.md P1).

- **Admin overrides still work** (Admin → Rollout → Overrides) and still win, for example to give a pilot shop a network extra early or to switch a trade tool off for one shop.
- **Existing data stays** when a shop doesn't have a feature: promos, VIP levels, discount cards, webhooks and POS connections are kept but stop applying. Merchants can still read and delete their data.
- **Locked cards name the plan.** A feature that is off because of the plan says "On Pro, $29 a month", "On Studio, $59 a month", "On Restaurant Growth, $199 a month" (tiffin, catering) or "On Restaurant Pro, $349 a month" (banquet), with a button to that plan's checkout. Tiffin and catering need Growth, not Starter.
- **Class fee:** 1% on online class sales and membership billing, none on desk sales. A cap was considered and not adopted (a $1,200 annual membership pays $12, still below card-network-style fees elsewhere); revisit if studios push back.

## Why

1. **Free has to win the counter, not give away the business.** A complete loyalty program with no fee and unlimited rewards and locations is still more generous than SoPoints Free (5% fee, 1 location, no active rewards) and Starter (US$49, 2.5% fee).
2. **The features that drive conversion were free.** Promos, email/SMS and POS auto-award are what merchants upgrade for. With them on Free, the model's blended 12-month conversion was 20%. Pricing v2 assumes 35% (bear 20%, bull 45%), and that is the main thing to validate on pilot shops.
3. **Free gets cheaper to serve.** No email, SMS or POS sync on Free: $3.87 per free merchant per month instead of $4.62.
4. **The cost is adoption.** A thinner free tier may sign fewer shops. The model takes 15% fewer sign-ups, which delays the paid unlock by about 2 months and weakens network density on each strip.

Base-case result: break-even moves from month 60 to **month 51**. Cash needed to reach break-even falls from $420,715 to **$357,308**. LTV/CAC rises from 2.6x to **3.6x**. The figures and risks are in `docs/finance/unit-economics.md` §0.
