# Solo pro launch: nail, brow and lash techs, barbers, and the storefront trades behind them

> **Oct 29, 2026, founder decisions:** (1) the $39 plan formerly shown as "Café & Retail" is shown as **Pro** (plan id unchanged, `plus`); (2) deposits are an optional feature, not the lead message: the landing pages lead with one link for bookings, clients booking themselves, reminders sending themselves and regulars coming back, and the booking flow shows a deposit only as an option; (3) the landing hero copy and job order are swappable variants for A/B tests (`LANDING_VARIANTS` in `apps/web/src/copy/en-CA.ts`, resolver in `apps/web/src/lib/marketing/landing-variants.ts`).

Oct 28, 2026 · Strategy for @Sajjad Pirani · CAD unless marked US$ · Builds on `pricing.md` (Pricing v2), `strategy-audit-2.md`, `combined-strategy.md`, `docs/research/barbers-beauty.md`, `docs/research/service-businesses.md` and `docs/research/merchant-onboarding.md`. Where this document overturns an earlier decision it says so in a box. The founder's decisions of Oct 28 (app-first reminders, read-only Instagram, the built-in website builder, promos inside paid plans, area-only map pins, no licensing content) are folded in throughout.

**Tags.** (W) verified on the web on Oct 28, 2026, source at the end · (W?) found on the web but third-party, undated, or currency not stated · (C) read from our code · (A) assumption · (H) hand math · (U) could not verify.

> **Updated Oct 29, 2026 (founder).** Three changes run through this document. (1) The $39 plan is called **Pro** everywhere a person reads it (plan id stays `plus`). (2) **Deposits are optional and no longer the lead message**: many techs do not take deposits and many clients refuse them. They stay on Free at 1%, off by default, switched on per service. (3) **The lead message is "Your clients stay yours"**: a booking link that is not a marketplace, no cut of a booking, no "new client" fee, no per-chair charge, prices in CAD. "Stop booking in your DMs" is the first challenger and the two are A/B tested. Evidence, copy per trade and the test plan: `docs/marketing/value-props.md`; build spec: `scratchpad/landing-v2/ab-spec.md`. Lines below that still read deposit-first are historical and are marked where it matters.

---

## 0. The verdict in one page

**What is sound**

1. **The segment is real.** Home-based nail, brow and lash techs run on Instagram DMs, e-transfer and a calendar link. The incumbents price per seat in US dollars and lead with a marketplace that charges 20% of a new client's first visit (Fresha, W). Nobody serves "the brow tech in a Scarborough basement" in Canadian dollars, with a free plan, without taking a cut of her clients.
2. **Appointment-led first, loyalty second.** The founder is right that not everyone needs the map. For a solo pro the product is: booking link, reminders, client list, a page that looks professional, and a deposit only if she wants one. Loyalty is what keeps the regulars, and regulars are the whole business; it is the second sentence of the pitch, not the first.
3. **Reminders through the app, not through texts, is the right default.** Push is free (Expo and web push cost nothing per message, W?). The catch is real and sized in §4.1: not every client of one tech will install an app. The answer is the fallback ladder (app push → web push on the pass → email → a capped text) and the network reason to install ("one app for every local spot you go to"), which only works once a client has two or three shops on the pass.
4. **A built-in website on the annual plan is cheap for us and strong against Squarespace.** The shop page already exists (`/shops/[slug]`, C). A `.ca` domain is about CA$13 a year (W?), hosting is marginal, and AI copy generation costs cents per site (§4.1). "Your site, already connected to your bookings, prices, loyalty and reviews" is something no booking tool and no site builder offers together.
5. **"Reiterate the people side."** Correct priority. The audit in `people-side.md` found the client profile is still a loyalty ledger with a notes box: no appointment history, no 1:1 thread, no way to see a client's last set. That gap is closed in the build plan before ads run.

**What does not hold, or needs changing**

1. **"Manage all your stuff in one place" is three different products.** For a nail tech it means booking, deposits, clients, a page. For a barbershop it adds the walk-in line and payouts (built). For a coffee shop or a butcher it means a POS, which we are not and must not imply. **Sequence the verticals** (§2.4): beauty pros and barbers with paid ads now; pet groomers next (same calendar); cafés and butchers through the street and BIA channel, where their wedge (free loyalty, pre-orders, flyers) is already built and already modelled.
2. **Paid ads cannot be the main engine for free signups.** On cited benchmarks (§4.3) a free signup from Meta ads costs CA$35–110, 8% of free users convert within six months (the self-serve freemium median, W?), and a payer contributes about $24 a month. That is $750 of ads per paying customer in the base case against a lifetime contribution of about $680. **Ads only pay back in the optimistic case.** They are a test budget and a kicker. The engine is the client-side loop (every booking page says "are you a tech? get your own link, free"), the pro's own Instagram, referrals between pros, and, for storefronts, the BIA channel. Kill criteria in §5.4.
3. **Instagram in the app is read-only at launch and needs Meta's review either way.** Reading DMs requires the same permission as sending them (`instagram_business_manage_messages`, W), plus Advanced Access through App Review and Business Verification, plus a professional account on the pro's side. Read-only removes every messaging-window and human-agent-tag problem, which is a real simplification. It does not remove the review. We build the inbox and "create a booking from this message" now behind a connector interface; the Meta connector ships when review passes (§6).
4. **A free plan that costs us money is a risk in exactly one place: texts.** Push and email are free or cents. One reminder text is about 2.5 cents all-in (W, §4.1). Free gets app push, web push and email without limit and **30 texts a month**, reserved for clients who have none of those; paid gets 500. Deposits on Free earn us 1%, which roughly covers the free pro who uses them, **but only if we move to Stripe direct charges** (§4.1). On destination charges the C$2 per active Connect account (W) wipes the margin.
5. **Pricing v2's 35% free-to-paid assumption does not transfer to self-serve solo pros.** That number was for storefront loyalty shops with a founder phone call. For solo pros who sign up from an ad with nobody calling, the honest base case is 8% (bear 4%, bull 15%). This document overturns that assumption for this segment only.
6. **"Payments through Whoop" is an open question.** WHOOP is a fitness wearable and does not process payments. We assume Stripe, which is integrated (Connect, deposits, checkout, billing, C). If the founder meant a Canadian processor, the options are Helcim (interchange-plus, Canadian), Moneris, Square, Interac e-Transfer (already supported as a recorded manual payment, C) and Wave (invoicing with payments). Each is a different integration; none changes the pricing in §3. Listed in §8 for the founder to clarify.

**What this launches** (full detail in §3): **Free** (loyalty as today, plus one bookable calendar, online booking in the app and on the web pass, optional deposits and no-show protection at 1%, app push, web push and email reminders, 30 texts, client list with notes and history) · **Pro, $39 a month** as today, now the upgrade for unlimited calendars, 500 texts, rebooking nudges and **four promos a month to your regulars with seasonal templates per trade** · **Annual, $390** adds the built-in website on the pro's own `.ca` domain. A founding price of $290 a year for the first 200 beauty pros is proposed as a founder decision.

---

## 1. Who we are launching to

| Segment | How they run today (A unless cited) | What they pay for | The one thing we must do |
| --- | --- | --- | --- |
| **Home-based nail, brow, lash and makeup techs** (the wedge) | Instagram DMs to book, a Linktree or Fresha link, e-transfer deposits by hand, reminders typed by hand, address sent by DM the day before | Nothing, or US$19.95–29.99 a month to Fresha or Booksy, or 20% of a new client to a marketplace | A booking link live in minutes that never shows their home address and takes no cut of their clients; a deposit if they want one |
| **Barbershops and threading bars** (2–8 chairs) | Walk-ins plus Booksy or Fresha per chair; chair renters keep their own books | US$29.99 plus US$20 per staff (Booksy, W) | The calendar with no per-chair charge, the walk-in line and payouts (built) |
| **Pet groomers** | Phone and Instagram, the same no-show problem | Per-seat booking software | Already built (`pets.*`); same calendar, same launch kit, second wave |
| **Cafés, bakeries, butchers, pet shops (retail)** | A POS, Instagram, a counter stamp card | Square or Clover, DoorDash on pickup | Free loyalty and pre-orders, sold on the street. Not this ad campaign (§2.4) |

The pro in the wedge is often under 35, often South Asian, Filipino, Caribbean, East Asian or Middle Eastern, often a second income becoming a first one; the clients are women within about 5 km. We have no census count of home-based beauty pros in Toronto (U); the ad metrics will size the market faster than a report would.

---

## 2. Validation

### 2.1 What the competitors charge today

All prices as shown on the vendor page or a third-party guide on Oct 28, 2026. Where the page did not state a currency it is marked. Only Square and Booksy publish a Canadian page.

| Product | Free plan | Paid | Payment processing | Marketplace / new-client fee | Texts | Website | Tag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Fresha** | None since 2025 (W? Pabau, Jul 2026); vendor page shows no free plan | Independent $19.95/mo (one bookable member), Team $14.95 per member/mo, 7-day trial; currency not stated | Online 2.79% + $0.20; in person 2.29% + $0.20 | **20% of a new client's first visit, minimum $6** | 100 free automated texts/mo, then $0.02; marketing texts $0.08 | No | (W) vendor page; currency (U) |
| **GlossGenius** | None ("does not offer a free plan"); 14-day trial | Standard $28/mo or $24 annual; Gold $56/$48 (up to 9 staff); Platinum $168/$148; currency not stated | Online 2.9% + $0.30; in-person figure inconsistent on the page | None | Included | Yes (booking site) | (W) vendor page; CA availability (U) |
| **Booksy** | None; free trial | $29.99/mo plus tax, $20 per extra staff/mo, free past 14 staff (Canadian page) | Not on the CA page; US guides say 2.49% + 10¢ reader | **Boost: 30% of a new client's first visit** (W?) | Included | Profile page | (W) en-ca page; Boost (W?) |
| **Vagaro** | None | US$10 per bookable calendar/mo, up to seven, then free | Not on the page; guides say 2.2–3.5% | Marketplace listing | Add-on | Add-on (MySite) | (W) vendor, US$ |
| **Square Appointments (Canada)** | **Free, single location, no employee limit**, text and email reminders; no no-show fees on Free | Plus $35 per location/mo (no-show protection, confirmations); Premium $85 | In person 2.5%; Interac 0.75% + 7¢; online 2.8% + 30¢; keyed 3.3% + 15¢ | None | Included | Square Online (separate) | (W) squareup.com/ca |
| **Setmore** | Free plan exists | Pro about US$5 per user/mo (W?) | Via Square/Stripe | None | Paid | No | (W?) |
| **Acuity** | None; 7-day trial | From US$16–20/mo; text reminders on the mid tier (about US$27) | Via Stripe/Square | None | Mid tier | No | (W?) tiers disagree |
| **Squarespace** | None; 14-day trial | Basic US$19, Core US$29 annual (Sep 2026 guide) | n/a | n/a | n/a | Yes | (W?) US$ |
| **Wix** | Free with ads | Core about US$29 annual (W?); 2023 CAD guide CA$15–28 (dated) | n/a | n/a | n/a | Yes | (W?) |
| **Linktree** | Free with Linktree branding | Starter, Pro, Premium; regional prices not on the plan page; guides say US$5–8 / US$9–15 / US$24–35 | Commerce fee by tier (W?) | n/a | n/a | A bio page | (W) plan page; prices (W?) |

**What this says.**

- **A free booking plan is table stakes only against Square.** Fresha, GlossGenius, Booksy, Vagaro and Acuity are all paid. Square's free plan is the one we are measured against in Canada, and it has no deposits or no-show fees on Free (W).
- **Nobody offers deposits and a no-show fee on a free plan.** We do, as an option per service, off by default; it earns us 1% without a subscription. It is a differentiator in the plan table, not the lead message: many techs do not take deposits and many clients refuse them (founder, Oct 29; the review evidence in `docs/marketing/value-props.md` §1 agrees).
- **The marketplaces tax new clients at 20–30%.** We do the opposite: discovery through the shared customer map is free and we never take a cut of a client. **This is the lead message** (Oct 29): "Your clients stay yours. No cut, no 'new client' fee, no per-chair charge, prices in CAD." It is the most specific complaint in the Fresha and Booksy review sets (`value-props.md` §1.1).
- **Per-seat pricing punishes barbershops.** Booksy at four chairs is US$89.99 a month. Our Pro at $39 with no per-chair charge (pricing.md) is the barbershop pitch.
- **Nobody bundles a connected website.** GlossGenius has a booking site, Vagaro sells one as an add-on, Squarespace is US$19–29 on its own and knows nothing about your bookings. A site that already shows your services, prices, booking, loyalty, promos, reviews and map pin, built in, is unique in this list and costs us about $1.10 a month to run.
- **Nobody sends promos to regulars inside the plan.** Fresha charges $0.08 a marketing text; Booksy's Boost sells new clients at 30%. Four promos a month to the people who already come, by app push and email, at no per-message cost, is a different proposition: keep your regulars rather than buy strangers.
- **Everything is priced in US dollars.** $19.95 is about CA$28. We price in CAD and say so.

### 2.2 Where the idea is weak or wrong

| Claim | Verdict | Why |
| --- | --- | --- |
| "If you're a barber shop, manage all your stuff in one place" works for every vertical | **Partly wrong** | True for appointment trades (beauty, barbers, groomers). Not true for cafés and butchers: their "stuff" is a till. Use "all your bookings, clients and promos in one place" for appointment trades and keep the existing loyalty and pre-order pitch for retail |
| Paid ads per vertical will bring the users | **Risky; test, don't bet** | §4.3: base-case CAC per paying customer from ads is about $750 against a $680 lifetime contribution. Judge the ads on cost per free signup with a hard kill line, and assume most signups come from the client loop and organic |
| Free plan "with real value" | **Right, with caps** | The booking link with no cut of the clients is the real value; deposits on Free earn, as an option. The caps that keep a free user from costing money: 30 texts a month, one calendar, no promos or automations, no site. Everything else on Free costs cents |
| Reminders and messages through the app | **Right as the default; the fallback is most of the volume at first** | §4.1: at launch, expect 15–25% of a tech's clients to have the app, 30–50% to have the web pass with push, and the rest to be email-only. Design for the ladder, not for the app alone |
| Annual plan includes a built-in website | **Right** | §4.1: about $1.10 a month in domain and routing, plus cents of AI per site. Needs the builder, presets and custom-domain routing, which are build items (plan.md, workstream G) |
| Connect Instagram DMs, read-only, turn into bookings | **Right scope, still gated by Meta** | §6: review and verification are needed to read other people's inboxes. Build the inbox and the booking-from-message flow now, ship the connector after approval |
| "Later we go to bigger places with 'we have a map / network'" | **Only if solo pros feed the map** | §7: a home-based pro shows as an area or city pin with "by appointment", her clients join the same pass and map. Without this the wedge and the network are two separate businesses |
| Nail and brow techs are "not on any map" | **True, and a feature** | They are not on Google Maps because they cannot publish a home address. An area pin with "by appointment" is the first map they can safely be on |

### 2.3 Home-based privacy: the product rules (founder decision: city or area only)

The address is the whole problem for a home-based pro. Today `locations.address` is required at signup and the network listing returns `address`, `lat` and `lng` (C: `packages/db/src/schema.ts`, `apps/api/src/services/network.ts`, `merchant.ts`). Rules for the build:

1. **Two visibility levels for a home-based location**: `area` (the map shows a pin at the neighbourhood centroid with a fixed random offset of up to 400 m; the listing says "Bloor West area · by appointment") and `city` (one pin at the city centroid, "Toronto · by appointment"; used by pros who travel to clients or want no neighbourhood shown). Storefronts keep `exact`.
2. **The exact address is released only to a confirmed booking**: on the confirmation screen, in the confirmation message and the calendar file, and only after the deposit or card step when one is required. Before that the booking page says "Home studio in the Bloor West area. The address is sent after you book."
3. **The address never appears** in the public shop page, the site, Open Graph images, search results, the sitemap, the map API, exports a client can see, or any message to someone who has not booked. `privacy-scrub.ts` and `data-export.ts` must treat it like a phone number.
4. **The pro chooses it at signup** ("Where do you work? My place / A salon or shop / I travel to clients").
5. **Reschedules keep it**; cancellations do not re-send it; the 24-hour reminder repeats it (that is what the pro does by hand today).

Nothing about licensing, inspections or city rules appears in the product or the docs (founder decision: "we're not running the business").

### 2.4 Market beauty pros, barbers, coffee shops and butchers together, or in sequence?

**In sequence.** Reasons:

1. **The creative and the landing page are different products.** Beauty pros and barbers buy the calendar story; cafés and butchers buy the loyalty and pre-order story. Mixing them in one ad account doubles the creative work and halves the learning per dollar.
2. **The economics differ.** The storefront trades were modelled with the street channel and BIA distribution (`strategy-audit-2.md`, `launch-plan-economics.md`); their CAC is founder time, not ad spend.
3. **The ad audience overlaps on the beauty side only.** Nail, brow and lash techs and barbers share interests (beauty supply, nail art, barber culture) and the same creative frame.

| Wave | When | Who | Channel |
| --- | --- | --- | --- |
| 1 | Launch (Nov 2026) | Nail, brow, lash, makeup techs; barbers and threading bars | Meta/IG ads (test budget), the client-side loop, IG organic, beauty supply stores and nail academies (partnership, U) |
| 2 | Month 3 | Pet groomers, salons with 2–5 chairs, spas | Same creative family, "for groomers" page, groomer supply stores |
| 3 | From launch, no ads | Cafés, bakeries, butchers, pet shops, pharmacies | Street and BIA channel as planned; the "for shops" page as today. A café ad only if wave 1 shows a CAC under $40 per free signup |

---

## 3. Packaging

### 3.1 What changes against Pricing v2

> **Overturns pricing.md (Oct 22) in two places.** (1) `booking.appointments` moves from Pro to **Free for one bookable calendar** (paid → free is allowed by the invariant). (2) **Promos come back into the paid plan as a counted allowance**: Pro includes four promos a month to the shop's regulars by app push and email, with seasonal templates per trade (founder decision, Oct 28). Pricing v2 had promos on Pro already; what changes is the framing (a number per month, templates, app and email, no texts) and that it is the headline paid feature for this wedge.

> **Overturns `docs/research/service-businesses.md` §4.4** ("simplest: add appointments to Plus"). For a solo pro the calendar is the reason to sign up; gating it behind $39 against Square's free calendar loses the signup.

> **Keeps** the founder's "no per-chair charge" default, the free-forever loyalty program, unlimited staff and locations on Free (staff can exist on Free; only one of them is *bookable* online), 1% on online deposits and 0% on checkout through the calendar.

### 3.2 The three plans

| | **Free** | **Pro · $39/mo** | **Annual · $390/yr** (everything in monthly, plus the site) |
| --- | --- | --- | --- |
| Loyalty program, wallet pass, network listing, customer directory, basic reports | Yes (unchanged) | Yes | Yes |
| **Bookable calendars** | **1** | Unlimited, no per-chair charge | Unlimited |
| Services, prices, duration, buffer, rebook cadence | Unlimited | Unlimited | Unlimited |
| Online booking: the client books in the Local Loyalty app or on the web pass; the booking page doubles as the link-in-bio | Yes | Yes | Yes |
| **Deposits and no-show fee, optional** (off by default, on per service; card on file, cancel window) | **Yes**, 1% on online deposits and charged fees, Stripe at cost; 0% on checkout | Same | Same |
| Checkout through the calendar, tips, pay link | Yes | Yes | Yes |
| Confirmations and reminders by **app push, web push on the pass, in-app message, email** | Unlimited | Unlimited | Unlimited |
| **Reminder texts** (only to clients with none of the above) | **30 a month**, then email | 500 a month, overage $0.04 | 500 |
| Client list: notes, tags, consent, appointment history, last visit details (people-side.md) | Yes | Yes | Yes |
| 1:1 thread with a client (in-app message; SMS reply inside the text cap) | Yes | Yes | Yes |
| Inbox: Instagram DMs read in the dashboard, "create booking from message" | When Meta approves; same on all plans | Same | Same |
| **Promos to your regulars** (app push + email, seasonal templates per trade: "Valentine's nails", "Back-to-school cuts", "Eid brows", "Holiday gel") | No | **4 a month** (unused do not roll over) | **48 a year**, use them when you like |
| Rebooking nudges, win-back, reward-ready automations | No | Yes | Yes |
| VIP levels, birthday reward, referrals, discount cards, email campaigns beyond promos | No (Pricing v2) | Yes | Yes |
| Walk-in line, payouts and chair rent | No | Yes | Yes |
| CSV import and export, POS auto-award, webhooks | No | Yes | Yes |
| Shop page at `localloyalty.ca/shops/<slug>` | Yes, with "Powered by Local Loyalty" | Yes, no badge | Yes |
| **Website: built-in builder** (presets connected to bookings, services, prices, loyalty, promos, reviews, map; AI writes the copy; hosting included) | No | No | **Yes, on one `.ca` domain registered and renewed by us while the plan is active** |
| Home address: area or city pin, exact address after booking | Yes | Yes | Yes |
| Support | Help centre and assistant | Email, 1 business day | Email, 1 business day |

Prices stay in `packages/shared/src/plans.ts` (`PLANS.plus.priceCents = 3900`, `annualPriceCents = 39000`). New constants: `FREE_BOOKABLE_CALENDARS = 1`, `FREE_REMINDER_SMS_PER_MONTH = 30`, `PROMOS_PER_MONTH_PLUS = 4`, `ANNUAL_INCLUDES_WEBSITE = true`, `SMS_OVERAGE_CENTS = 4`, `SITE_AI_GENERATIONS_PER_MONTH = 10`, `SITE_AI_EDITS_PER_MONTH = 40`.

**Founding price (founder decision, recommended):** the first 200 beauty pros and barbershops on the annual plan pay **$290** for the first year, then $390. "Founding pro · 200 spots." Not lifetime (`combined-strategy.md` on why).

**Why $39.** Pricing v2 found $29 loses money per payer once support is counted (`strategy-audit-2.md` §5.2). $39 CAD sits beside Square Plus (CA$35) and GlossGenius Standard (US$28). For a solo pro the upgrade reasons are "four promos to my regulars" and "my book fills itself" (rebooking nudges), not the calendar. If solo pros stall at the paywall, the lever is the annual founding price, not the monthly list price.

**What to cap on Free, and why**

| Cap | Why |
| --- | --- |
| 1 bookable calendar | The barbershop upgrade trigger; free to enforce (`listBookableStaff`) |
| 30 reminder texts a month, only to clients with no app, pass or email | The one variable cost that can run away (§4.1) |
| No promos, automations or email campaigns | The conversion lever, and the CASL exposure sits in campaigns |
| "Powered by" badge on the booking page and shop page | The client-side loop (§5.3) and the reason to upgrade the look |
| No site, no custom domain | The annual lever |
| Help centre and assistant only | Support is the second-largest cost per account |
| Deposits allowed, but only once `STRIPE_DIRECT_CHARGES` is on | Under destination charges the C$2 per active Connect account turns a free user with deposits into a loss (§4.1) |

### 3.3 Fees and payments (restated)

Card processing at Stripe's Canadian rate, passed through: online 2.9% + C$0.30, in person 2.7% + C$0.05, Interac in person C$0.15 (W). Our fee: 1% on an online deposit or a no-show fee charged to a saved card; 0% on checkout through the calendar (`FEES.appointmentCheckoutBps = 0`, C). Interac e-Transfer, cash and cheque recorded by hand carry nothing (C: `manual-payments.ts`). "Payments through Whoop": open, see §8.

---

## 4. Unit economics

### 4.1 Unit costs, cited

| Item | Unit cost | Source |
| --- | --- | --- |
| **App push (Expo)** | $0 per message; Expo's push service has no per-message charge (EAS plans are for builds and updates) | Vendor comparison pages (W?); confirm on expo.dev/pricing |
| **Web push on the PWA** | $0 per message (browser push services); works on iOS 16.4+ only for a web app added to the home screen, after a permission prompt from a user action | Batch, OneSignal, GoodBarber (W) |
| **Apple Wallet pass update push** | $0 per push; the server pushes an empty payload and the device re-fetches the pass; a visible alert only when a field carries a change message; works only in production APNs; frequent alerts make people delete the pass | Apple developer docs, Airship (W) |
| Outbound SMS, Canada, Twilio base | US$0.0083 per segment | twilio.com/en-us/sms/pricing/ca (W) |
| Canadian carrier fee per outbound segment | Rogers/Fido US$0.0084, Telus US$0.0073, others US$0.0064; Bell/Virgin shown as $0.0087 and $0.0323 with unclear labels | Same page (W; Bell ambiguous, worst case carried) |
| **All-in reminder text, carried** | **CA$0.025 per segment** (Bell worst case about CA$0.057); a reminder must stay under 160 GSM characters or it is two segments (today's reminder plus the STOP line may be two, C: `sendReminders`) | (H), FX 1.40 (A) |
| Transactional email | Resend Pro US$20 for 50,000 a month (about US$0.0004 each); Postmark from US$15 for 10,000 | 2026 comparisons (W?) |
| Hosting, DB, monitoring per active shop | $0.60 a month | `docs/finance/unit-economics.md` (A) |
| Stripe Payments, Canada | Online 2.9% + C$0.30; in person 2.7% + C$0.05; Interac C$0.15 | stripe.com/en-ca/pricing (W) |
| Stripe Connect, destination charges (today's default) | C$2 per monthly active account, 0.25% + C$0.25 per payout | stripe.com/en-ca/connect/pricing (W, Oct 22) |
| Stripe Connect, direct charges ("Stripe handles pricing") | No platform fee; our application fee is kept whole | Same (W). `STRIPE_DIRECT_CHARGES` exists, default off (C) |
| Stripe Billing on our subscriptions | 0.7% on top of processing | (W) |
| `.ca` domain at cost | about US$9.19 a year (Cloudflare); Namecheap US$12–18 renewal | Price trackers, Aug–Oct 2026 (W?); carried as **CA$13 a year** |
| Custom hostname routing (Cloudflare for SaaS or similar) | (U); carried as CA$0.15 per site per month (A) |
| **AI copy and layout for the site builder (Claude API)** | Claude Opus 5.5 US$4 input / US$20 output per million tokens; Claude Sonnet 5.5 US$2 / US$10; Claude Haiku 5.5 US$0.10 / US$0.50 | Anthropic price table cached 2026-10-06 in the `claude-api` skill (W) |
| Site generation, per site (A on token counts) | About 6,000 input tokens (shop data, services, reviews, preset spec, rules) and 2,500 output tokens (copy as JSON). Opus 5.5: US$0.024 + US$0.050 = **US$0.074 ≈ CA$0.10** per generation. One edit ("make the hero warmer"): about 4,000 in, 800 out, **≈ CA$0.03**. Haiku 5.5 for edits: under CA$0.01 | (H) from the prices above |
| Support time | 5 min a month per free account, 15 per paying, at $25 an hour (A). Founder time at launch |

**The app-first fallback ladder, sized.** The founder's catch is right: a client will not install an app for one nail tech. What we can reach, per client, in order of cost and reliability:

| Channel | Who has it at launch (A) | Cost | Notes |
| --- | --- | --- | --- |
| Local Loyalty app push (Expo) | 15–25% of a solo pro's clients in month 1; rises with every shop the client adds to the pass | $0 | The reason to install is the network: "one app for every local spot you go to", the shared pass, stamps at the café next door. For a client with one shop on the pass, the app is a hard sell and we should not push it |
| Web pass with web push (PWA on the home screen) | 30–50% of clients who booked on the web, if the booking confirmation offers "Add to home screen" and asks for push at that moment | $0 | iOS needs the home-screen step; Android works in Chrome directly. This is the biggest free channel and the build must make the prompt part of the confirmation |
| Apple or Google Wallet pass | 40–60% of members (the existing join path) | $0 | Pass updates can carry a change message ("Your 2:00 pm with Priya is tomorrow") but should be rare; useful for the 24-hour reminder, not the 2-hour one |
| Email | 90%+ (asked at booking) | ≈ $0.0006 | Always sent; the floor of the ladder |
| Text | Clients with none of the above, or who asked for texts | $0.025 | Capped at 30 a month on Free, 500 on paid |

Expected mix on Free in month 1 (A): about 60% of reminders reach a push channel, 100% get email, and roughly 20% of bookings also need a text (clients who booked by phone with the pro typing them in, no email). That is 40 bookings × 20% = 8 texts a month, well inside the 30 cap. If the web-push prompt is not built into the confirmation, the text share rises to 40–50% and the cap binds.

### 4.2 Per-account monthly cost and contribution

Assumed activity (A): an active free solo pro does 40 bookings a month, 30% with a $30 deposit; a paying solo pro or small shop does 60 bookings a month and sends four promos.

**Free, active, solo pro**

| Line | Expected | Cap or worst case | Note |
| --- | --- | --- | --- |
| App push, web push, in-app | $0 | $0 | |
| Reminder texts | 8 × $0.025 = **$0.20** | 30 × $0.025 = $0.75 (Bell worst $1.71) | Only clients with no app, pass or email |
| Email (3 per booking) | 120 × $0.0006 = $0.07 | $0.10 | |
| Hosting, DB | $0.60 | $0.60 | |
| Stripe Connect, direct charges | $0 | $0 | Required |
| Stripe Connect, destination charges (today) | $2.00 + 0.25% × $360 + 4 payouts × $0.25 = **$3.90** | | Why direct charges are a launch prerequisite |
| **Cash cost (direct charges)** | **$0.87** | $1.45 | |
| Support (founder time) | 5 min = $2.08 | | Not cash in year 1 |
| **Deposit fee revenue** | 12 × $30 × 1% = **$3.60** | | |
| **Net, direct charges** | **+$2.73** cash (+$0.65 with support time) | | A free pro who takes deposits pays for herself |
| Net, destination charges | −$1.17 cash | | Loss |
| A free pro with **no** deposits | −$0.87 cash | | The realistic average free user, under a dollar a month |

**Paying, monthly $39**

| Line | $ | Note |
| --- | --- | --- |
| Revenue (HST passed through) | 39.00 | |
| Stripe on our subscription (2.9% + $0.30 + 0.7%) | −1.70 | |
| Texts: 60 bookings × 20% + about 20 text-only promo recipients = 32 × $0.025 | −0.80 | Cap 500 = $12.50 |
| Promos by push and email: 4 × 150 regulars × $0.0006 | −0.36 | |
| Email reminders | −0.10 | |
| Hosting, DB | −0.60 | |
| Support, 15 min | −6.25 | Founder time at launch |
| **Contribution** | **$29.19** (75%); $35.44 before support | |

**Paying, annual $390 (= $32.50 a month) with the site**

| Line | $/mo | Note |
| --- | --- | --- |
| Revenue | 32.50 | Cash up front |
| Stripe + Billing | −1.21 | |
| Texts, promos, email, hosting as above | −1.86 | |
| Domain `.ca` | −1.08 | $13 a year |
| Custom hostname routing | −0.15 | (A) |
| Site AI: 1 generation + 4 edits a month on average | −0.22 | Cap 10 + 40 = about $2.20 on Opus 5.5 |
| Support | −6.25 | |
| **Contribution** | **$21.73** (67%); $27.98 before support | Founding $290: $13.40 (and $19.65 before support) |

Blended payer contribution used below: 60% monthly, 40% annual = **$26.20** a month after support time (A on the mix).

### 4.3 Acquisition cost from Meta and Instagram ads

Benchmarks are consumer-lead figures from vendor reports; nobody publishes "cost per small-business-owner signup for a booking tool in Toronto".

| Benchmark | Figure | Source |
| --- | --- | --- |
| Facebook ads average cost per lead, all industries, 2025 | US$27.66 (up 21% year on year) | WordStream 2025 (W) |
| Same, Beauty & Personal Care | US$51.42 | WordStream 2025 (W) |
| Average Meta CPM, Canada | about US$14 | Stackmatix 2026 (W?) |
| Beauty CPM | US$10–16 in most guides | ContentStudio, TopGrowth, Sovran 2026 (W?, conflicting) |
| Reels against Feed | 30–50% cheaper impressions (W?) | TopGrowth 2026 |

Funnel assumptions (A), per 1,000 ad-driven free signups:

| Stage | Conservative | Base | Optimistic |
| --- | --- | --- | --- |
| Cost per lead (click to signup page) | CA$55 | CA$30 | CA$18 |
| Signup completion | 50% | 50% | 50% |
| **Cost per free signup** | **$110** | **$60** | **$35** |
| Active (≥1 booking a month) at month 3 | 35% | 45% | 55% |
| Free → paid within 6 months | 4% | 8% | 15% |
| Paid monthly churn | 5% | 3.5% | 2.5% |
| Contribution per payer per month | $26.20 | $26.20 | $26.20 |

Sources for conversion and churn: ChartMogul and ProductLed 2026 freemium benchmarks (median 8%, 25th percentile under 2.5%, 75th percentile 10–15%) (W?); SMB SaaS CAC payback of 8–12 months is "strong" (W?).

**Results per 1,000 free signups** (H)

| | Conservative | Base | Optimistic |
| --- | --- | --- | --- |
| Ad spend | $110,000 | $60,000 | $35,000 |
| Payers at month 6 | 40 | 80 | 150 |
| CAC per payer | **$2,750** | **$750** | **$233** |
| LTV per payer (contribution ÷ churn) | $524 | $749 | $1,048 |
| **LTV : CAC** | **0.19** | **1.0** | **4.5** |
| Monthly paid contribution at month 6 | $1,048 | $2,096 | $3,930 |
| Net cost of active free users at month 6 (active × $0.87 − deposit fees) | 350 × $0.37 = $130 | 450 × (−$0.63) = −$284 (a gain) | 550 × (−$1.63) = −$897 (a gain) |
| **Payback on the ad spend** | never | **25 months** | **7.3 months** |

**Reading it plainly:** ads alone do not pay back except in the optimistic case. **Do not plan the company on ads to free.**

**The blended plan.** If ads bring 30% of signups at $60 and the client-side loop, Instagram organic, referrals and partnerships bring 70% at about $3 (founder content time, A), the blended cost per free signup is **$20**, CAC per payer at 8% is **$250**, LTV:CAC **3.0**, payback **9.5 months**. That is a workable self-serve business. It depends on the loop, which is why the "Powered by" badge and the "Are you a tech?" line are launch features.

### 4.4 Break-even on this wedge alone

Fixed overhead in the bootstrap cost base is $340 a month (unit-economics.md). Each payer contributes $26.20 and carries about 5 active free users at roughly break-even (deposit fees against push-first costs), so call it $25 net.

| Target | Payers needed | Free signups at 8% | At 250 signups a month |
| --- | --- | --- | --- |
| Cover $340 overhead | 14 | 170 | Month 1 |
| Overhead + $2,000 a month in ads | 94 | 1,170 | Month 5 |
| Overhead + ads + a $5,000 founder draw | 294 | 3,675 | Month 15 |

**Candid summary:** the solo wedge pays its own costs within a quarter and pays the founder in about fifteen months at 250 signups a month and base conversion. It does not, by itself, make the company large. Its job is to bring the users, the deposits rail and the map density that the storefront and network plans in `strategy-audit-2.md` need. Judge it on signups, activation and conversion for the first six months.

---

## 5. Go-to-market

### 5.1 The launch funnel

```
Ad, post or "Powered by" link
  → vertical landing page (/for-nail-techs, /for-barbers)
  → signup (shop name, trade, where you work, mobile, email)         ≤ 60 s
  → setup: your link, services from a template, hours, privacy        ≤ 3 min → booking link live
  → share: copy link, "add to your Instagram bio" steps, QR
  → invite your regulars (prefilled text sent from the pro's own phone)
  → first booking by someone else (activation)
  → day 7: "your site, ready to publish" preview (annual) and "4 promos a month to your regulars" (paid)
  → upgrade: annual founding $290 or monthly $39
```

Activation for this segment is **the first online booking from someone other than the pro**. `docs/research/merchant-onboarding.md` keeps 25 members for storefronts; both milestones live in `merchant_milestones`.

### 5.2 Ad concepts per vertical

Format: 9:16 Reels and Stories first (cheaper, W?), 1:1 feed second. Every creative shows the real product on a real phone in the Clear theme; no stock photography, no gradient backdrops. The hook is on screen in the first second.

**Nail, brow and lash techs** (`/for-nail-techs`; `?trade=brows` or `lashes` swaps the hero; `?v=` names the landing variant, `value-props.md` §2.2)

| # | Hook | Visual | CTA |
| --- | --- | --- | --- |
| 1 | "Booksy and Fresha take a cut of your clients. We don't." (`?v=yours`) | "20% of a new client" and "30% Boost" struck through; the pro's client list with "Yours."; the booking page in her trade colour | "Get your booking link, free" |
| 2 | "Still booking in DMs?" (`?v=control`, today's default) | Split phone: a messy DM thread "what times u have sat?" against the booking page with Saturday slots | "Get your booking link, free" |
| 2b | "No-shows, without the deposit fight." (`?v=noshows`, runs in T3) | The reminder going out by app and email, the "Deposit: off" switch per service, the calendar filling | "Get your booking link, free" |
| 3 | "Your address stays private." (`?v=private`, runs in T2) | The map with an area pin "Bloor West area · by appointment", then the confirmation "Address: sent after you book" | "Made for home studios" |
| 4 | "Your bio link should take bookings." | An Instagram profile, the link tapped, the booking page opens in the pro's trade colour | "Replace your Linktree" |
| 5 | "A real website, built in." | The builder: pick a preset, the site appears already showing her services, prices, reviews and the Book button, on `<name>.ca` | "Included with the annual plan" |
| 6 | "Valentine's nails, sent to your regulars in one tap." | The promo template picker, "Sent to 112 regulars", three bookings landing | "4 promos a month on the paid plan" |

**Barbershops and threading bars** (`/for-barbers`)

| # | Hook | Visual | CTA |
| --- | --- | --- | --- |
| 1 | "No per-chair charge. Ever." (`?v=price`) | "$29.99 + $20 per barber" struck through; "$39 for the whole shop"; "and nobody takes a cut of your clients" | "Get your shop's link, free" |
| 1b | "Still booking in DMs?" (`?v=dms`) | The shop's DM thread against the booking page with the walk-in line beside it | "Get your shop's link, free" |
| 2 | "How long's the wait?" | The door tablet and a client's phone: "You're 3rd · about 40 min · we'll let you know" | "Walk-in line, built in" |
| 3 | "Dad books, kids' cuts on the same card." | The family card screen (built, `barbers/m3-family-390.png`) | "Family under one card" |
| 4 | "Chair renters keep their own clients." | Payouts page with a renter's private view | "Payouts and chair rent, no spreadsheet" |
| 5 | "Back-to-school cuts, sent to every regular." | The promo template and the week's calendar filling | "4 promos a month" |

**Pet groomers** (wave 2, `/for-groomers`)

| # | Hook | Visual | CTA |
| --- | --- | --- | --- |
| 1 | "Vaccines checked before the groom." | A pet profile with the expiry date and the certificate photo | "Free groom booking" |
| 2 | "Max is due. One tap to book." | The groom cadence reminder and the rebook link | "Rebooking that runs itself" |
| 3 | "Prices by dog size, no back and forth." | The booking page showing only large-dog prices after picking Max | "Set up in three minutes" |

**Cafés and butchers (wave 3, no paid ads at launch).** Organic and street only.

### 5.3 Landing pages

One page per vertical under `apps/web/src/app/(marketing)/for-<trade>/`, same structure as `for-restaurants` (C):

1. Hero: the hook, one phone mock in the Clear theme with the trade colour, "Start free" and a 20-second autoplay of the booking flow.
2. Three jobs as cards, in the order the variant sets (`value-props.md` §2.1; shipped v2 ids are `book`, `remind`, `regulars`; `noshow` and `yours` are to add): for techs, pick a time · no-shows handled your way · your clients stay yours (or reminders); for barbers, book or join the line · yours · the line. Deposits are one optional sentence inside the no-show card, never a card of their own.
3. "Your regulars" block: stamps, promos to regulars, the shared pass.
4. The privacy block for home studios (nail page only).
5. Pricing strip: Free, $39, $390 with the site. "Prices in CAD. No per-chair charge. No cut of your clients."
6. Comparison table against Fresha, Booksy, Square (the cited figures above, dated).
7. The site: three presets shown as they would look with a sample pro's data.
8. FAQ, then the signup form inline with `vertical` preset.

**The client-side loop (launch feature):** the booking page, the confirmation page and the wallet pass carry one quiet line, "Powered by Local Loyalty · Are you a nail tech or a barber? Get your own booking link, free", linking to the matching landing page with `?src=client`. Removed on paid plans.

### 5.4 Metrics and kill criteria

| Metric | Target by week 8 | Kill or change if |
| --- | --- | --- |
| Cost per free signup from ads | ≤ $60 | > $90 for four consecutive weeks: stop the campaign, keep the page for organic |
| Signup → booking link live | ≥ 70% | < 50%: fix onboarding before spending more |
| Activation: first booking by someone else within 14 days | ≥ 40% | < 25%: the share step is failing; move "invite your regulars" earlier |
| Share of a pro's clients reachable by push (app or web push) after 30 days | ≥ 50% | < 30%: the web-push prompt on the confirmation is not working; texts will exceed the cap |
| Share of signups from the client loop and organic | ≥ 50% by week 8 | < 30%: the loop line is not visible enough |
| Free → paid within 90 days | ≥ 6% | < 3%: test the founding annual price at signup; check whether 2+ chair shops carry it |
| Annual share of paid | ≥ 35% | < 20%: show the site preview earlier |
| Reminder texts per active free account | ≤ 15 a month | > 30 on average: the push ladder is broken or reminders are two segments |
| No-show rate with a deposit versus without | lower by ≥ 30% | Not lower: verify the deposit story with ten pros |
| Landing test T1 (control "yours" vs "dms"), per page | decide at 880 exposures (about 5–6 weeks of ad traffic) | Decide only at the pre-registered looks (`value-props.md` §3.8); a variant above $90 per free signup for two weeks is paused |

Budget for the test: $2,000 a month for eight weeks on the nail-tech and barber campaigns, $500 of it on creative. Decide at week 8.

---

## 6. Instagram roadmap (read-only, turned into bookings, no replies)

### 6.1 What the founder asked for

The owner presses **Connect** in the dashboard and sees their Instagram DMs there. From a message they create a calendar booking prefilled with the person's name and handle and a link back to the conversation. The app never sends a reply; the pro answers from Instagram as today. This removes the 24-hour window, the human-agent tag and every "automation pretending to be the pro" risk from the roadmap.

### 6.2 What Meta's docs say about reading (fetched Oct 28, 2026, W)

| Topic | Fact | Consequence |
| --- | --- | --- |
| Which API | **Instagram API with Instagram Login**: serves professional accounts without a Facebook Page; the pro logs in with Instagram | We use this one |
| Account type | The pro **must have an Instagram professional account** (business or creator) | Onboarding must show the two-minute switch; a personal account cannot connect |
| **Permission to read** | The Conversations API and the `messages` webhook both require `instagram_business_basic` **and `instagram_business_manage_messages`**. There is no separate read-only scope in the docs | Read-only still means the "manage messages" permission and its review |
| Access level | Standard Access covers accounts we own or add as testers; **Advanced Access is required to serve accounts we don't manage**, which requires **Meta App Review and Business Verification** | Launch with testers (the founder and five pilot pros), submit review, ship to everyone after approval |
| **Past conversations** | `GET /<IG_ID>/conversations?platform=instagram` lists conversations with `id` and `updated_time`; the messages of a conversation list `id` and `created_time` for all; **details (text, sender) are available only for the 20 most recent messages per conversation**, older ones return a "deleted" error; conversations in the Requests folder inactive for 30 days are not returned | On Connect we can import the recent thread per client (last 20 messages), which is enough to build a booking from. We cannot import a full DM history, and we should not promise to |
| New messages | Webhooks: `messages`, `messaging_optins`, `messaging_postbacks`, `messaging_reactions`, `messaging_referrals`, `messaging_seen`; inbound shares arrive as a URL only | New DMs arrive in near real time once the webhook is subscribed |
| Fields | Message: `id`, `created_time`, `from` (`username`, `id`), `to`, `message` text | Exactly what "create booking from message" needs: name, handle, text, time |
| Rate limits | Conversations API 2 calls a second per professional account; Send API not used | Poll on Connect only; rely on webhooks afterwards |
| Read receipts | Reading through the API does **not** mark the thread read in Instagram | The pro's Instagram inbox is unaffected; no false "seen" |
| ig.me links | `https://ig.me/m/<USERNAME>?ref=<REF>`; the `ref` comes back in the `referral` object of the webhook; not supported on Instagram Web | Lets a "Message me" button on the shop page land in the pro's DMs with a source tag, once the webhook exists |
| **Retention and deletion rules** | Meta's messaging pages fetched do not state retention rules for data an app stores (U). Meta's Platform Terms require honouring user data-deletion requests and deleting data when the user disconnects (not fetched; verify before App Review) | We store only `message id`, `handle`, `display name`, `text`, `created_time`; purge a pro's imported messages when they disconnect; add a data-deletion callback URL; a lawyer or the Platform Terms text confirms the exact wording before submission |

**Book button.** Instagram's "Book Now" action button works only with partners on Meta's list (Acuity, Booksy, Fresha, Square, Vagaro, GlossGenius and others per vendor pages, W?). Getting listed is a partnership, timeline (U). Until then the pro's bio link is our booking page.

### 6.3 Phasing

| Phase | When | Ships | Needs from Meta |
| --- | --- | --- | --- |
| **P0, launch** | Nov 2026 | The **inbox** (`conversations`, `conversation_messages`, `channel` = `sms` / `whatsapp` / `instagram` / `email`, generalised from `whatsapp_sessions` and `whatsapp_messages`, C) with SMS and in-app threads live; **"Create booking from message"** (opens the new-appointment sheet prefilled with name, handle, phone if known, the message as the client note, and a link back to the thread; the booking's `source` = `instagram`); a **connector interface** (`InboxConnector`: `connect`, `importRecent`, `handleWebhook`, `disconnect`) with an `InstagramConnector` stub behind `INSTAGRAM_DM_ENABLED` (Settings card: "Coming: your Instagram DMs here. Add me to the list"); the booking page as link-in-bio with `?src=ig`; the **DM reply kit** (five copy-ready replies with the booking link, for the pro to paste in Instagram) | Nothing |
| **P1, review** | Dec 2026 – Feb 2027 | Meta app, Instagram Login OAuth, webhook subscription, the real connector tested on the founder's and five pilot pros' accounts under Standard Access; App Review submission with screencasts showing read, create booking, disconnect and delete; Business Verification; data-deletion callback | App Review (weeks to months, U) |
| **P2, GA** | After approval | "Connect Instagram" in Settings for every shop; DMs in the inbox; "Create booking from message"; `ref` attribution from ig.me links | Advanced Access for `instagram_business_manage_messages` |
| **Not planned** | | Sending replies from the app; auto-replies; the human-agent tag; Click-to-Direct ads from the dashboard | |

**What we say in product and ads:** "See your Instagram messages next to your calendar and turn them into bookings in one tap. You still reply from Instagram." Never "book from DMs automatically".

---

## 7. The bridge from the wedge to the network and map

1. **Area or city pins, not addresses.** A home-based pro appears on the shared map as a soft pin in her area (or at the city level) with "by appointment" (§2.3). The client who books her joins the same network pass and sees the same map as a café customer. Density rises with every pro, and the pro's clients are the café's customers.
2. **Her clients become network members.** Every booking creates a `merchant_members` row with consent captured at booking (C: `joinMerchant`, `marketingConsentAt`). A client with three pros and two cafés on one pass is the cross-shop habit `strategy-audit-2.md` said was missing. It is also the reason a client installs the app: one app for every local spot, not one app per tech.
3. **Stamps for services, promos for regulars.** Loyalty is on by default for the pro (1 stamp per visit; the reward is a dollar amount or an add-on, never "free set", `service-businesses.md` §4.4). The paid plan's four promos a month go to those same regulars by push and email. The pro gets a reason to care about the pass; the client gets one card.
4. **The map becomes the pitch to the next tier.** "N beauty pros and M shops within 1 km, X thousand members on one pass" is the sentence for a BIA, a beauty supply chain or a plaza landlord (`network-monetization.md`). Solo pros are the fastest way to grow N, because they cost under a dollar a month to serve and sign up from a phone.
5. **What we do not do:** list a home address, rank pros by anything paid, or take a share of a new client.

---

## 8. Decisions needed from the founder

1. Confirm `booking.appointments` free for one calendar (overturns Pricing v2 for this feature).
2. Confirm the promo allowance: 4 a month on Pro, 48 a year on annual, push and email only (no texts inside the allowance).
3. Confirm the founding annual price ($290, 200 spots) or strike it.
4. Confirm the vertical sequence (beauty and barbers with ads; groomers month 3; cafés and butchers on the street).
5. Approve the $2,000 a month ad test for eight weeks with the kill criteria in §5.4.
6. Approve the Stripe direct-charges switch as a launch prerequisite (`STRIPE_DIRECT_CHARGES`), and get Stripe Canada's platform pricing in writing (open since Oct 22).
7. Decide whether we register domains for annual customers in our Cloudflare account (recommended, at cost, transferable on cancellation) or hand them a credit.
8. **"Payments through Whoop": say what you meant.** WHOOP does not process payments. Today's rail is Stripe (Connect, Checkout, Billing, Terminal available). Canadian alternatives if the aim is lower in-person rates or a Canadian processor: **Helcim** (interchange-plus, Canadian, no monthly fee), **Moneris** (bank-owned, terminals), **Square** (already the POS of many shops; we integrate for auto-award), **Interac e-Transfer** (free to the shop; already recorded by hand in the app, no API for us to automate without a bank partner), **Wave** (invoicing with payments, 2.9% + 60¢ class of pricing, U). None of these changes the plan prices; a switch away from Stripe would reopen deposits, no-show fees, subscriptions and payouts, so it is a year-two question unless the founder means something else.
9. Confirm the lead message ("Your clients stay yours") as the control and "Stop booking in your DMs" as the first challenger, and whether CSV export of the client list moves to Free so the page can say "export it any time" (`value-props.md` §2.1).

---

## Sources

All fetched or searched on Oct 28, 2026.

Competitors: [Fresha pricing (vendor)](https://www.fresha.com/pricing) · [Pabau on Fresha's free plan ending (Jul 2026)](https://pabau.com/blog/fresha-pricing/) · [GlossGenius pricing (vendor)](https://glossgenius.com/pricing) · [Booksy Canada pricing (vendor)](https://booksy.com/biz/en-ca/pricing) · [Koalendar on Booksy Boost](https://koalendar.com/blog/booksy-pricing) · [Vagaro pricing (vendor, US$)](https://www.vagaro.com/pro/pricing) · [Square Appointments Canada pricing](https://squareup.com/ca/en/appointments/pricing) · [Setmore pricing, CostBench](https://costbench.com/software/scheduling/setmore/) · [Acuity pricing, Koalendar](https://koalendar.com/blog/acuity-scheduling-pricing) · [Squarespace vs Wix 2026](https://www.stylefactoryproductions.com/blog/squarespace-vs-wix) · [Wix pricing Canada (2023)](https://ecommerce-platforms.com/?p=67072) · [Linktree plans (vendor)](https://linktr.ee/s/pricing/) · [Linktree pricing 2026, U2L](https://u2l.ai/blog/linktree-pricing)

Unit costs: [Twilio SMS pricing, Canada](https://www.twilio.com/en-us/sms/pricing/ca) · [Stripe pricing, Canada](https://stripe.com/en-ca/pricing) · [Stripe Connect pricing, Canada](https://stripe.com/en-ca/connect/pricing) · [Resend vs Postmark 2026](https://costbench.com/compare/postmark-vs-resend/) · [Cloudflare .ca price tracker](https://domainoffer.net/tld/ca/cloudflare) · [Namecheap .ca price tracker](https://domainoffer.net/tld/ca/namecheap) · [Expo push vs APNs comparison (vendor)](https://www.courier.com/integrations/compare/apple-push-notification-vs-expo) · [iOS 16.4 web push, Batch](https://batch.com/blog/posts/apple-web-push-ios16-4) · [OneSignal, web push for iOS](https://documentation.onesignal.com/docs/web-push-for-ios) · [Apple, adding a web service to update passes](https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes) · [Airship, pass update notifications](https://docs.airship.com/guides/wallet/user-guide/notifications/pass-updates) · Claude API prices: the `claude-api` skill's model table (cached 2026-10-06; confirm at platform.claude.com/pricing)

Ads and conversion: [WordStream Facebook Ads Benchmarks 2025](https://www.wordstream.com/blog/facebook-ads-benchmarks-2025) · [Stackmatix ad cost benchmarks by country 2026](https://stackmatix.com/blog/platform-ad-cost-benchmarks-country-industry-2026) · [ContentStudio Meta ads benchmarks 2026](https://contentstudio.io/blog/meta-ads-benchmarks) · [TopGrowth Instagram ads cost 2026](https://topgrowthmarketing.com/?p=44251) · [Monetizely on freemium conversion](https://www.getmonetizely.com/articles/freemium-conversion-rate-the-key-metric-that-drives-saas-growth-3588c) · [Userpilot freemium benchmarks 2026](https://userpilot.com/blog/freemium-saas/) · [SaaS Hero CAC payback benchmarks](https://saashero.net/customer-retention/cac-payback-period-benchmarks-saas/)

Meta: [Instagram Platform overview (access levels, rate limits)](https://developers.facebook.com/docs/instagram-platform/overview) · [Instagram API with Instagram Login, Conversations API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api) · [Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api) · [Webhooks](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/webhooks) · [ig.me links](https://developers.facebook.com/docs/messenger-platform/instagram/features/ig-me-links) · [Instagram Book Now partners, Goldie (vendor list, W?)](https://heygoldie.com/blog/?p=9959)
