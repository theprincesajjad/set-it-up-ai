# Cafés and retail (slug: cafes-retail)

Oct 23, 2026 · Phase 1 research and design brief · Market: independent cafés, bakeries, grocers, apothecaries and pharmacies (front store), bookshops, boutiques and gift shops on Toronto main streets (Roncesvalles, Queen West, Danforth, Ossington, Leslieville, Bloor West).

Figma: https://www.figma.com/design/KJK4rcrFvzr83JKhWqzC4e (file "Local Loyalty — Cafés & Retail", page "Cafés & Retail"). PNG exports of every frame are in `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/cafes-retail/`.

All screens use sample data (Pinecone Coffee Co.). Where a number is an estimate it says so. Where I could not find a source I say that too.

## 1. Who this is for

**The business.** One to three locations, an owner who is also on the floor, three to ten part-time staff, and a regular base of the people who live or work within a ten-minute walk. Typical stack:

| Layer | What they use today | Notes |
| --- | --- | --- |
| POS | Square (most common for new indies), Shopify POS (retail and gift), Lightspeed (larger cafés, bookshops), Clover (older installs and many Toronto grocers) | Square Retail Plus is $79/month per location in Canada; free plan exists ([Square Canada](https://squareup.com/ca/point-of-sale/retail/features)). |
| Loyalty | A paper stamp card, or nothing. Some run Square Loyalty, Stamp Me, Loopy Loyalty or SoPoints | Pricing below. |
| Marketing | Instagram, a Mailchimp list nobody sends to, the BIA newsletter | |

**The pressure they are under.** Margin is thin and rent is the story. A Toronto operator quoted after closing Grinder Coffee on Gerrard blamed landlords raising rent sharply and said food margins are thin ([Streets of Toronto](https://streetsoftoronto.com/grinder-coffee-closing-in-toronto/)). Restaurants Canada reports 41% of operators are losing money or breaking even in 2026 ([Retail Insider](https://retail-insider.com/retail-insider/2026/08/canada-could-lose-2500-restaurants-in-2026-as-industry-pressures-mount/)). Square's data shows Canadian café tickets shrinking, to $13.04 in April 2025 from $14.31 the year before ([Retail Insider](https://retail-insider.com/?p=173184)). The owner buys software only when it brings a visit back. I found no public Toronto café margin or turnover rate (estimate: staff turnover is high; Job Bank gives accommodation and food services a 4.5% vacancy rate in Q2 2025 against 2.8% across Ontario industries, [Job Bank](https://www.jobbank.gc.ca/trend-analysis/job-market-reports/ontario/sectoral-profile-accommodation), and describes high entry-level turnover without a percentage).

**The customer.** A regular who comes weekly or daily, pays by tap, rarely downloads an app for one shop, and already carries too many programs. Canadians hold 15 loyalty programs on average ([Bond / Scene+](https://www.bnnbloomberg.ca/press-releases/2026/05/19/canadians-are-rethinking-loyalty-as-everyday-rewards-take-priority/)) and 60% prefer small, frequent rewards ([The Wise Marketer](https://thewisemarketer.com/2026-bond-loyalty-report-shows-canadians-are-sitting-on-13-15-billion-in-unredeemed-loyalty-points/)). A free coffee after 7 to 10 visits is the reference: Tim Hortons' program gives a free drink or baked good after about seven medium drip coffees, Starbucks after about $64 ([Frugal Flyer](https://frugalflyer.ca/blog/canadian-coffee-rewards-programs-compared/), [Daily Hive](https://dailyhive.com/vancouver/canadas-coffee-loyalty-programs-price-comparison-2019)).

**Staff.** Part-time, trained in five minutes, standing in a queue. The counter has to work for someone hired last week.

## 2. Evidence

### Competitors and what they cost

| Product | What it is | Price (CAD unless noted) | What it teaches us |
| --- | --- | --- | --- |
| [Square Loyalty](https://squareup.com/ca/en/software/loyalty) | POS-native points by visit, spend or item. Digital pass for Apple Wallet only. Transactional texts on earn. Email through Square Marketing | $60 / $100 / $140 per month per location by loyalty visits (0 to 500 / 501 to 1,500 / 1,501+). 30-day trial | The bar for "built in". It prices by visit volume, so a busy café pays more. No Google Wallet, no network, no SMS marketing on the page. |
| [Loopy Loyalty](https://www.loopyloyalty.com/pricing) | Stamp cards in Apple and Google Wallet, stamper app | $25 Starter (1 design, 1 location, 3 sub-users), $69 Growth, $95 Ultimate (US dollars per the vendor FAQ; confirm) | The no-download stamp card is a solved problem. Cheap. No marketing or network. |
| [Stamp Me](https://www.stampme.com/blog/loyalty-program-cost-for-cafes-2025) | Stamp-card app for cafés | $49 to $79 per month per the vendor; Capterra Canada lists US$49. Currency not stated | Competes on simplicity. |
| SoPoints | Shared card across GTA independents, field agents | Free plan with 5% fee; paid US$49 to $199 per PRD ([sopoints.com/pricing](https://sopoints.com/pricing)). I could not confirm the fee schedule from third-party listings | The direct Toronto competitor. We charge no fee on Free. |
| Belly | Early countertop-tablet loyalty | $50 to $100 per month with an iPad ([Wikipedia](https://en.wikipedia.org/wiki/Belly_(loyalty_program))). Mobivity bought its operating assets for $3M in 2019 | A hardware-first, app-first approach did not last. |
| Fivestars | SMS and loyalty for small business | Ownership history conflicts across vendor blogs (Punchh / PAR, SumUp); I could not confirm | Same warning: dependence on a customer app. |
| [Ritual](https://blogto.com/tech/2019/04/ritual-toronto-meal-pick-up-app-toronto) | Toronto-founded order-ahead app, founded 2014, $43.5M raised by 2017 ([Insight Partners](https://www.insightpartners.com/?p=7107)) | Commission per order | Cut staff by more than half in April 2020 ([MobileSyrup](https://mobilesyrup.com/2020/04/02/toronto-based-ritual-lays-off-half-of-its-employees-due-to-covid-19-report/)); the City partnered on "Ritual ONE" to waive fees ([City of Toronto](https://www.toronto.ca/news/city-of-toronto-encourages-businesses-to-sign-up-for-ritual-one-this-month-to-access-free-service-for-life/)). One profile says Shopify acquired it in January 2025 (single source, unconfirmed). Order-ahead as a commission marketplace squeezed cafés; ours is 0% on paid plans, which is the lesson. |

### What actually brings repeat visits (my judgement, flagged where sourced)

1. **A reward the customer can see getting closer.** A stamp count on the lock screen (Wallet pass) is seen far more often than an app. Mobbin examples (below) all show the count first.
2. **A reason to come on a slow day.** Double stamps in the dead hours is the single most common independent-café promo. It shifts visits to a quiet slot and costs product only on visits that would not have happened.
3. **A nudge when a regular drifts.** "Slipping away" is measured against that person's own rhythm. This is the only message type owners reliably say pays back (estimate from operator practice; no public benchmark found).
4. **No friction at the counter.** If a stamp takes more than three seconds the barista skips the ask and the program decays. PRD already says ≤5 s; I propose 3 s.
5. **Members spend more.** A vendor figure says loyalty members spend 12% to 35% more per visit ([Stamp Me](https://www.stampme.com/blog/are-coffee-shop-loyalty-programs-worth-it)); that is a vendor claim with no stated market, so we do not display it.

### Local and legal facts

- **CASL.** Promotional texts and emails need express consent (an unticked opt-in) or a narrow implied-consent relationship (for example a purchase in the last two years). The sender must identify itself and offer a working unsubscribe, honoured within 10 business days. The sender carries the burden of proof, so record when, how and which wording ([CRTC guidance](https://crtc.gc.ca/eng/com500/guide.htm)). Maximum penalty is $10 million per violation for an organization, though actual awards have been far lower (a $200,000 penalty in 2017, [BLG](https://www.blg.com/en/insights/2018/01/canadas-anti-spam-legislation-2017-year-in-review)). Directors and officers can be personally liable. Private right of action status is unclear in my sources; treat as unverified. The build already records consent text and source (`marketingConsentAt`, `marketingConsentSource`) and enforces quiet hours 21:00 to 08:00 (`QUIET_HOURS` in `apps/api/src/services/notifications.ts`).
- **Pharmacy.** Ontario bars bonus or loyalty points on prescriptions and professional services, and points cannot be redeemed against them. Paying with a rewards credit card is allowed ([OCP policy](https://ocpinfo.com/pharmacy-professionals/rules-and-standards-of-the-profession/practice-policies-guidelines/loyalty-points-program/), 2004; I did not confirm a later amendment). Front-store points are fine. The "no-earn categories" feature exists for this and should show only for pharmacy and grocery.
- **Wallet.** Apple Wallet caps a pass at 10 relevant locations and shows a lock-screen suggestion near them; balance changes can trigger a lock-screen notification. Google Wallet supports location notifications with its own daily limits (vendor sources: [PassKit](https://help.passkit.com/en/articles/12441270-gps-location-notifications-google-wallet-vs-apple-wallet), [Pushwoosh](https://www.pushwoosh.com/blog/wallet-pass-lock-screen-locations/); not first-party docs, verify before promising). The repo already has `wallet-apple.ts` and `wallet-google.ts`.
- **Language and payment.** Toronto cafés are English-first with strong Mandarin, Cantonese, Punjabi, Tagalog and Urdu minorities; the app already ships `en`, `hi`, `pa`, `ur` (see `shots/auth`). Tap-to-pay dominates; cash points are earned the same (Square Loyalty also awards on cash).

## 3. Jobs to be done (ranked by frequency × pain)

| # | Who | Job | How often | Pain today |
| --- | --- | --- | --- | --- |
| 1 | Staff | Give a stamp to the person in front of me without slowing the queue | 100+ times a day | A paper card is fast but unmeasured; our current web counter takes type, Find, Add. |
| 2 | Customer | Know how close I am to a free drink without opening an app | Every visit | Paper cards get lost; apps do not get opened. |
| 3 | Owner | At 7 am: is today normal, who is owed a reward, is the counter ready | Daily | The current home answers "how were the last 30 days". |
| 4 | Owner | At close: how was today, did the promo work, who do I call back | Daily | No promo result, no staff view. |
| 5 | Owner | Bring back regulars who stopped coming, legally | Weekly | The composer is buried behind "Write an email"; no "slipping away" segment. |
| 6 | Owner | Fill the slow hours | Weekly | Promos exist but report "views", which is not a result. |
| 7 | Owner | Set up the card in two minutes and see what customers see | Once, then rarely | Program page is a long form with compliance tables that do not apply. |
| 8 | Staff | Redeem a free drink in one tap | 5 to 15 times a day | Code entry exists; one-tap redeem is on the member card only. |
| 9 | Customer | Join in under 20 seconds with no account | Once | The join page exists (`(pass)/join`); consent copy must stay unticked and optional. |
| 10 | Owner | Understand cost and cohort: rewards owed, do new members return | Monthly | Reports show "Spend by members" and a made-up goal. |

## 4. What we build and why

Every component maps to a job number. Anything that maps to none is cut. Frames are in Figma; the "why" note sits beside each.

### Merchant dashboard

| Screen / component | Job | Decision |
| --- | --- | --- |
| **Home, morning mode** (before noon, Toronto): Yesterday vs a typical same weekday; New members yesterday; Free drinks waiting; Counter app online | 3 | New. Replaces the 30-day Performance block. |
| Hourly shape "A typical Thursday by hour" with promo band | 3, 6 | New. Replaces the 30-bar chart. |
| Free drink waiting (4 names) | 3, 8 | New list. |
| Slipping away + "Text the 9" | 5 | New. Only people who agreed are counted. |
| **Home, close mode** (after noon): Visits today vs typical; Stamps and drinks given; Regulars who came in (31 of 48) | 4 | New. |
| Promo result card (visits in window vs typical, extra visits) | 4, 6 | New. |
| Stamps by staff + undone count | 4, 1 | New. Spots a counter that skips the ask or stamps friends. |
| Open counter button | 1 | Kept. |
| First-25-members meter, setup checklist | activation | Kept until activated. |
| "More with Café & Retail" quiet line | upsell | Kept (foundations). |
| **Counter** (scan first, 4 digits second, auto-stamp, 10 s undo, auto-return 3 s, one-tap redeem) | 1, 8 | Reworked. Four states in Figma. |
| **Rewards** setup in three numbered questions with live Wallet-pass preview; minimum purchase in step 1; duplicate guard; never-expire on | 7 | Reworked from "Program & rewards". |
| **Customers**: chips Regulars, Slipping away, Reward ready, New, Birthday, Can text; columns Stamps, Visits 30 d, Last visit, Usually, Texts; side panel with consent record | 5, 3 | Reworked. |
| **Messages**: audience chips with the count that can be texted, Text / Email / Wallet message, auto-appended name, address and STOP, send window, "Send me a test", automations, Sent with "came in within 7 days" | 5 | Reworked. |
| **Promos**: four templates with a job label, running promos with Visits in window vs Typical, Extra visits, Free items given | 6 | Reworked. |
| **Reports**: stats, weekday × hour heatmap, Rewards owed in drinks and dollars (estimate), joiners who came back within 7, 14, 30 days, Network card | 10, 4 | Reworked. |

### Customer

| Screen | Job | Notes |
| --- | --- | --- |
| Join (web, from counter QR): phone, one **unticked** optional text-offers box, "first stamp is on us" | 9 | Consent copy must be the exact string stored (`marketingConsentText`). |
| Card added: Apple and Google Wallet buttons at equal weight, browser fallback | 2, 9 | Square Loyalty offers Apple only. |
| Wallet: Reward ready on top, a list of shops, balances right-aligned in accent | 2 | Matches `foundations.md`. |
| Discover: italic one-liner per shop ("your 7 / 10 · 2× stamps till 4 pm") | 2 | No ratings or feed. |

## 5. What we deliberately do not build

- **Order-ahead marketplace or our own consumer ordering app** for cafés. Ritual's trajectory and the 15% to 30% delivery-app take are the cautionary tale. Order-ahead stays a Café & Retail feature at 0% commission, off the café's first-run path.
- **Gamified badges, referral leaderboards, "points for sharing".** No job in a café with one reward.
- **Open-rate dashboards.** Owners trust "6 came in within 7 days", not opens.
- **A separate customer app download for joining.** Wallet pass first; the app is optional.
- **Surprise point expiry.** Expiry is an advanced option, off by default (Drop class action, PRD).
- **Spend by member without a POS connection.** Shown only when a POS is connected; otherwise it is a guess.
- **Visible no-earn category table for cafés.** Hidden unless vertical is pharmacy, grocery or retail.

### Components on the current dashboard that serve no job (cut or change)

Source: `scratchpad/shots/core/*-1440.png`, `scratchpad/shots/qa`, `scratchpad/shots/dashboard`, `docs/design/canvas/*.dc.html`, and `apps/web/src/app/(dashboard)/m/[merchantId]/page.tsx`. Frame `Audit` in Figma lists all 20 rows.

| Current component | Verdict | Why |
| --- | --- | --- |
| Performance block with 7 / 30 / 90 day picker | Change | Owners compare to the same weekday. |
| "Active members 38" (30 d) | Change | Vanity at this size. Replace with "Regulars who came in". |
| "Visits 150, +194%" | Change | A percentage on a 40-member base misleads; show the count against a typical weekday. |
| "Rewards redeemed 5, 3% of visits" | Move | Cost line, belongs at close and in Reports. |
| "Members who also shop the street 1%" tile | Move | A pitch number for the BIA, no daily decision. Also weak at 1%. |
| Visits per day, 30 black bars | Cut | No decision follows. |
| "Today at the counter" names and +1 stamps | Cut | Duplicates the counter's recent list; keep only exceptions and stamps by staff. |
| "Your customers also visit" | Move | Reports › Network. |
| Live promos list with title and end date | Change | Show the result. |
| Sidebar showing Orders, Service tickets, Menu & catalog, Pickup & drop-off, "More for restaurants", Ads, Street campaigns | Cut for cafés | The nav is already feature-gated (`NAV_FEATURES` in `apps/web/src/lib/dashboard/nav.ts`); the 20 items in the screenshot exist because Pinecone is a pilot with every override on. Gate by vertical as well. |
| Counter: Find customer field plus button plus "Add 1 stamp" | Change | Three steps; scan or 4 digits is one. |
| Counter: Award / Verify code tabs | Change | Redeem a code is rare; footer link. |
| Rewards: "Categories that don't earn" table (Drinks, Food, Coffee, Pastries × 2 toggles) | Cut for cafés | Compliance for pharmacy and grocery only. |
| Rewards: VIP builder, birthday, referral fields | Move | Plus features; not first-run. |
| Customers: VIP column ("–" on every row) | Cut | Empty. Joined moves to the panel. |
| Messages: "Write an email" as the only header action | Change | The composer already has SMS as a third option when `marketing.sms` is on; make Text the default. |
| Promos: "0 views · 0 redemptions" cards with avatar and shop name | Change | Views are not a result; the shop name repeats the page. |
| Reports: "Spend by members", "Goal: 20% a month" | Change | Needs POS data; the goal has no source. |
| Reports: two daily bar charts (visits, new members) | Change | Replaced by the heatmap. |

## 6. Design

Figma file: https://www.figma.com/design/KJK4rcrFvzr83JKhWqzC4e

Visual language is unchanged from `docs/design/foundations.md`: monochrome, one accent `#FF5A1F` meaning points, stamps and "reward ready", Bricolage Grotesque display and Inter body, hairlines, black pill buttons, no gradients. Icons are omitted from the frames (Lucide in build). Frames were screenshotted and iterated: first pass found clipped "Reward ready" tags in Customers (removed, the orange stamp count carries it), an inconsistent retention table in Reports (fixed to a cumulative 9, 11, 12 of 17), a quiet-hours window that contradicted the code (set to 8 am to 9 pm), and a flat counter viewfinder (reticle added).

| Frame | Node | Size |
| --- | --- | --- |
| Home · 7 am | `2:4` (note `2:177`) | 1440 |
| Home · at close (6 pm) | `2:200` (note `2:397`) | 1440 |
| Counter · ready (scan first) | `3:2` | 390 |
| Counter · two matches | `3:65` | 390 |
| Counter · stamped | `3:114` | 390 |
| Counter · reward ready | `3:155` (note `3:206`) | 390 |
| Customers | `5:6` (note `5:251`) | 1440 |
| Rewards · stamp card setup | `6:4` (note `6:170`) | 1440 |
| Messages · new text | `7:6` (note `7:155`) | 1440 |
| Promos | `7:182` (note `7:331`) | 1440 |
| Reports | `7:357` (note `7:591`) | 1440 |
| Join · from the counter QR | `8:2` | 390 |
| Card · add to wallet | `8:31` | 390 |
| Wallet (app) | `8:78` | 390 |
| Discover · near you | `8:128` (customer note `8:187`) | 390 |
| Audit · current home and sidebar vs proposal | `8:212` | 1200 |

Exports: `01-counter-ready.png` … `14-audit-current-build.png` in the scratchpad folder above.

### Mobbin references and what each taught us

| Reference | Used for | What it taught |
| --- | --- | --- |
| [Blue Bottle Coffee, "How it works"](https://mobbin.com/screens/96e5a7d0-6ca9-49ea-8ed5-6d1c96cd028b) | Wallet, rewards | One large number first, the rule in one sentence below it. |
| [Honest Greens stamp cards](https://mobbin.com/screens/6dc61bf0-a764-450e-857c-502d99dd769c) | Wallet pass, Rewards preview | A stamp grid with the last cell as the reward gift. We use the same 2×5 grid and label the last cell FREE. |
| [DoorDash punch unlocks](https://mobbin.com/screens/85cc55d2-9a99-42e4-b015-2b7e00f42607) | Rewards | Show the future reward as a locked step with its value. |
| [foodpanda stamp collection](https://mobbin.com/screens/044372e0-192b-4619-9a56-a624016e8f0d) | Rewards | States the minimum order value in the first line, which led to "Minimum purchase" in step 1. |
| [Blackbird home](https://mobbin.com/screens/87e0f308-30cb-41f6-be52-b3c0c82db230), [Blackbird balance](https://mobbin.com/screens/b628e43e-926a-4269-82bb-915f750dca63) | Wallet | One round central action in the tab bar for the card. |
| [Burger King Redeem](https://mobbin.com/screens/d7e6bcb4-276a-4f96-9472-dfb93d0e1235) | Wallet | A progress bar with the remaining amount stated as text. |
| [Everyday Rewards wallet](https://mobbin.com/screens/de5b7406-98d9-4cbc-b445-79b769d6b73f) | Wallet | "Ready to use" separated from "Available". We use "Reward ready" on top. |
| [Careem "added" confirmation](https://mobbin.com/screens/67982707-d108-492f-9a1d-9f84dcbd9f65) | Counter stamped | One fact in large type, a check, one button. Our stamped screen keeps the same single number and drops the button for a 3 s auto-return. |
| [Setel redemption success](https://mobbin.com/screens/b22d67da-0c63-46e8-9e55-cda8b0d90b03) | Counter stamped, reward | A short itemised result (points used, value) before Done. We show the redeemed reward in the toast instead. |
| [Shell pump number keypad](https://mobbin.com/screens/28c7ff60-d4a7-4e3d-b660-ad45aec69aff), [Wolt mobile number](https://mobbin.com/screens/03c092a7-b9dc-44c7-9dfc-110118a402cf) | Counter keypad, Join | System-sized keys, the field above, one primary button; used for the 4-digit entry. |
| [Square dashboard home](https://mobbin.com/screens/e4e90484-6276-486d-ae53-f5584f440bd1) | Home | Sections as plain lists under one header: Locations, Customers (New and Returning), Category sales. |
| [Shopify analytics](https://mobbin.com/screens/35153b56-4d7f-4398-ae6b-2fefaba5d024) | Home, Reports | A compact metric row above charts, with a comparison range. |
| [Fresha Daily sales](https://mobbin.com/screens/47e06b3c-bba2-49f8-b11c-e8d3be3d6084) | Home at close | A daily summary page keyed to one date. |
| [Stripe customers](https://mobbin.com/screens/eade1912-e11c-4d70-9556-1527dbd9837c) | Customers | Segment tabs above the table ("Top", "First-time", "Repeat", "Recent"). |
| [Square campaign audience](https://mobbin.com/screens/212a7ddd-dea8-4458-8175-81e12c0c6198) | Messages | "Who do you want to reach?" with audience size and a live device preview. |
| [Posh SMS campaign](https://mobbin.com/screens/9c4f4cbf-64a9-4b0e-8ba1-0949258a09ba) | Messages | Recipients, character count (7/140) and a phone preview side by side. |
| [Sweatpals email campaign](https://mobbin.com/screens/b63cc66c-822d-4163-9184-5d7f234d1eb1) | Messages | Audience choice as two radio cards with a recipient count; Send test and Save draft beside Send. |

Mobbin returned nothing for a café-specific merchant "slipping away" segment or a staff-stamps view; those two are our own.

## 7. Build spec

Another team is editing code; this is the spec to execute after Phase 1. Paths are repo-relative. Everything below reuses existing endpoints unless marked **new**.

### 7.1 Home (`apps/web/src/app/(dashboard)/m/[merchantId]/page.tsx`)

1. Delete: `Performance` block, `Segmented` range picker and `RANGE_OPTIONS` use, `DailyBars`, the "Today at the counter" `CanvasList`, the network-overlap `CanvasList`, the Live promos `CanvasList`. Keep `PageHeader`, the onboarding `Meter` row, the `NotifyLink` line.
2. Add `mode = hourInToronto < 12 ? "morning" : "close"`, plus a query string override `?mode=morning|close` for QA.
3. New components in `apps/web/src/components/dashboard/home/`: `TodayStats`, `HourlyShape` (12 columns 7 am to 6 pm, grey typical bar, black today bar, promo band in `accent-soft`), `PromoResult`, `StaffStamps`, `RewardsWaiting`, `SlippingAway`.
4. **New endpoint** `GET /merchants/:merchantId/reports/today` in `apps/api/src/routes/reports/index.ts` and `apps/api/src/services/reports.ts`. Staff role: `manager` and above. Response:

```ts
{
  asOf: string; // ISO, shop timezone Toronto
  yesterday: { visits: number; typicalVisits: number };      // typical = mean of the last 4 same weekdays before yesterday
  today: { visits: number; typicalVisitsFullDay: number; newMembers: number; newViaQr: number;
           stampsGiven: number; redemptions: number; regularsSeen: number; regularsTotal: number };
  hourly: { hours: number[]; typical: number[]; today: number[] };   // 7..18 shop time
  rewardsWaiting: { count: number; members: { memberId: string; name: string | null; balance: number; lastVisitAt: string }[] }; // top 4
  slipping: { count: number; canText: number; members: { memberId: string; name: string | null; usually: string | null; lastVisitAt: string; canText: boolean }[] }; // top 3
  staff: { staffId: string; name: string; shift: string | null; stamps: number; visits: number; undone: number }[];
  promoWindow: { promoId: string; title: string; windowVisits: number; typicalVisits: number; extraVisits: number } | null;
  counter: { online: boolean; staffName: string | null; signedInAt: string | null };
}
```

   Definitions: **regular** = at least 3 visits in the last 30 days. **Slipping away** = a regular (3+ visits in the prior 60 days) whose days since last visit exceed `max(14, 2 × their median gap)`. Both go in `packages/shared/src/api/reports.ts` as pure functions with tests.
5. `packages/shared/src/api/reports.ts`: add `TodayReportDto`; export `isRegular`, `isSlipping`.
6. Acceptance: with the seed shop, morning mode renders four stats, the hourly chart, both lists; close mode renders the promo card and staff list; every number has a test against the seeded transactions; no element appears for a paid feature the shop lacks (promo card hidden when `promos.basic` is off; "Text the N" hidden when neither `marketing.sms` nor `marketing.email` is enabled, replaced by a quiet Plus line).

### 7.2 Counter

Web `apps/web/src/components/dashboard/counter/CounterApp.tsx`, mobile `apps/mobile/src/app/counter/index.tsx` (+ `scan.tsx`).

1. Default view = scan first. Web: open `BarcodeDetector` with the camera when permission is granted; also listen for a USB/Bluetooth scanner as keyboard input ending in Enter, accept `LL:` payloads (`QR_PAYLOAD_PREFIX`). Mobile: `Camera` already exists (`counter/scan.tsx`); embed it in the main screen.
2. Keypad: 4 digits calls `GET counter/lookup?q=1034` (`matchedBy: "last4"`) as soon as the 4th digit lands. If `items.length === 1` and the program setting `counterAutoStamp` is true and the member is below the goal, call `POST counter/award` with quantity 1 immediately. If `items.length > 1`, show the two-matches list (phone prefix, stamps, last visit); a tap awards. Do not require a "Find" press.
3. **New program setting** `counterAutoStamp: boolean` (default true for `stamps` and `per_visit` programs, always off for `per_dollar`). Add to `packages/shared/src/api/merchant.ts` program DTO, `apps/api/src/services/merchant-program.ts`, DB migration in the API's migration folder, seed. Rewards screen exposes it as "Stamp on scan".
4. Stamped state: toast with `Undo` for 10 s (undo endpoint exists: `POST counter/transactions/:transactionId/undo`), big `n / goal`, stamp row, auto-return to scan after 3 s. Keep `AccessibilityInfo` and haptics as today.
5. Reward-ready state when `balance >= goal`: orange "Redeem free drink" (calls `POST counter/redeem` with the member's affordable reward) and an outlined "Stamp instead, keep the reward".
6. Move "Verify code" to a footer link "Redeem a code". Hide the quantity chips unless `program.earnType` is per-item.
7. Staff tag: every award keeps `staffId` (exists); expose a 4-digit PIN sign-in on web counter as mobile already has (`counter/pin.tsx`).
8. Acceptance: from a cold scan to the stamped screen in under 3 s on a mid-range phone on LTE (measure in a Playwright or Detox run with the API mocked at 150 ms); typing 4 digits with one match stamps with no further tap; undo within 10 s reverses; a second scan within the cooldown shows the duplicate message, not a second stamp; offline queue still works (`queue` in the mobile context).

### 7.3 Rewards (rename "Program & rewards" to "Rewards" in `apps/web/src/lib/dashboard/nav.ts`)

1. `apps/web/src/app/(dashboard)/m/[merchantId]/program/page.tsx` becomes a three-step layout; keep the route. Step 1 earn type segmented with "One per purchase over a minimum" showing `minPurchaseCents`; step 2 stamp goal stepper; step 3 reward name with preset chips from `VERTICAL_TEMPLATES[vertical].rewards`.
2. Right column: `ProgramPreview` (exists in `components/dashboard/ProgramPreview.tsx`) with tabs Wallet pass / Counter / Shop page. Add a Wallet pass tab that renders the same layout `wallet-png.ts` draws.
3. Card "At the counter": duplicate guard minutes, never-expire toggle, welcome stamp, "Stamp on scan" (`counterAutoStamp`).
4. Card "More ways to earn": a single quiet block unless `loyalty.vip_levels`, `loyalty.birthday_bonus` or `loyalty.referrals` is enabled, in which case render `VipEditor.tsx` and the birthday and referral fields as today.
5. `components/dashboard/program/CategoriesEditor.tsx`: render only when `vertical` is `pharmacy`, `grocery` or `retail`, or when a POS is connected and categories are synced. For `cafe` and `bakery` never show it, but keep the stored categories.
6. **New field** `rewardCostCents` on the program (cost to the shop of one reward), used by Reports. Add to shared DTO, service, migration; input in the reward editor labelled "What a free drink costs you (optional)".
7. Acceptance: a new café can complete the three steps in under two minutes; saving changes the preview live; the categories table is absent for a `cafe` merchant and present for `pharmacy`; existing stamp programs migrate with `counterAutoStamp = true`.

### 7.4 Customers (`.../customers/page.tsx`, `components/dashboard/customers/CustomerView.tsx`)

1. Add chips Regulars, Slipping away, Birthday this month, Can text, next to existing All, Reward ready, New, Opted in, Muted, VIP. Hide VIP unless `loyalty.vip_levels` is on.
2. Columns: Name, Stamps (`n / goal`, accent when reward ready), Visits (30 d), Last visit, Usually, Texts. Drop VIP and Joined (Joined stays in the panel).
3. **New fields** on the member list DTO (`packages/shared/src/api/merchant.ts`, `apps/api/src/services/merchant-customers.ts`): `visits30d: number`, `usually: string | null` (e.g. "Weekdays 8 am": the most common weekday group and 2-hour bucket across the last 12 visits, null with fewer than 4), `isRegular`, `isSlipping`. New query values `segment=regulars|slipping|birthday_month`.
4. Side panel: add the consent record (date, source, exact wording) from `marketingConsentAt`, `marketingConsentSource` and stored text; Add stamp, Redeem, Adjust; phone reveal logged (exists).
5. Acceptance: filtering Slipping away returns exactly the members `isSlipping` marks; the panel never shows consent unless one exists; export remains behind `customers.csv_export`.

### 7.5 Messages (`.../messages/*`, `components/` Audience.tsx)

1. `messages/page.tsx`: primary button "New message" (not "Write an email"); stat row adds "Texts left this month" from `GET messages/sms-usage`.
2. `messages/new`: audience chips from `messagingApi.segmentSchema` (add the `lapsed` default of 21 days, `reward_ready`, `all`, and a new `regulars` kind); count comes from `POST messages/audience` and must show "n can text" using that channel's consent; channel segmented Text / Email / Wallet pass message (map "Wallet pass message" to the existing `push` channel until pass message API ships). Default channel is Text when `marketing.sms` is enabled.
3. Body field shows the auto-appended footer (name, address, "Reply STOP to unsubscribe") read-only, with a character count that includes it; `SMS_MAX_BODY` already exists.
4. Send timing chips Now / Today at / Pick a time with the quiet-hours hint "8 am to 9 pm" (matches `QUIET_HOURS` 21:00 to 08:00).
5. "Send me a test" uses `POST messages/:messageId/test` (exists).
6. Sent table: add `cameIn7d` per message. **New** in `services/messaging.ts`: count distinct recipients with a visit in the 7 days after `sentAt`. Add to `GET messages` DTO.
7. Automations: `AUTOMATION_KINDS` already has `win_back`, `reward_ready`, `birthday`, `welcome`. Show win_back (default 21 days), reward_ready (delivered as a wallet pass update, not an SMS, so no consent needed; implement with `wallet-apple.ts` and `wallet-google.ts` update calls), birthday.
8. Acceptance: a member without consent is never in a count or a send (`skip reason no_consent` already exists); messages outside quiet hours queue until 08:00; the footer cannot be edited or removed; the Sent row shows the 7-day result.

### 7.6 Promos (`.../promos/page.tsx`, `components/dashboard/PromoEditor.tsx`)

1. Template row: Slow afternoons, Bring a friend, Add a pastry, Quiet Mondays. Each pre-fills `PromoEditor` (rule, hours, weekdays). "Bring a friend" depends on `loyalty.referrals`; hide that card when it is off.
2. Table: Promo, When, Visits in window, Typical, Extra visits, Free items given. **Extend** `GET reports/promos` (`svc.promoResults`) to return `windowVisits`, `typicalVisits` (mean of the same weekday and hours over the last 4 weeks), `extraVisits`, `freeItemsGiven`. Remove `views` from the card.
3. Acceptance: for the seed "Double stamps on slow afternoons" the table equals a hand-computed count; a promo with fewer than 2 weeks of baseline shows "Not enough history" in Typical.

### 7.7 Reports (`.../reports/page.tsx`)

1. Overview: stat row (Visits, New members, Came back within 14 days, Free drinks given with cost estimate). The heatmap replaces both bar charts. **New** `GET reports/heatmap?weeks=4` → `{ matrix: number[7][24], max: number }` in shop timezone.
2. Rewards owed card: `{ rewardsOwed, stampsOutstanding, members, estCostCents }` from the existing unredeemed-stamps query plus `rewardCostCents`; label "estimate" always.
3. Joiners who came back: reuse `GET reports/retention` with windows 7, 14, 30.
4. Network tab: move the overlap list from Home (exists as `networkOverlap`, `reports.advanced`).
5. "Spend by members" only when `integrations.pos_auto_award` is connected; remove "Goal: 20% a month".

### 7.8 Navigation (`apps/web/src/lib/dashboard/nav.ts`)

1. Rename labels: "Program & rewards" → "Rewards", "Integrations" → "POS & integrations".
2. Add vertical gating on top of feature gating: hide `tickets`, `slots`, restaurant entries for `cafe`, `bakery`, `bookstore`, `retail`, `grocery`, `pharmacy`, `florist`, `pet` unless the merchant's plan is `pro` or a restaurant tier; hide `ads` and `campaigns` until Phase 3 rollout stage is `ga` (the existing `unlockAtMerchants` gate). Show `discount-cards` only for `pharmacy`, `grocery`, `retail`.
3. Acceptance: Pinecone (cafe, pilot with all overrides) shows 11 items; Village Apothecary shows Discount cards; a repair shop still shows Service tickets. `nav.test` updated.

### 7.9 Customer (web pass and mobile)

1. Join page `apps/web/src/app/(pass)/join/[code]`: add the unticked optional text-offers box using `marketingConsentText(merchantName)`; send the exact displayed string as `consent.text`. Line under the button: "We text a 4-digit code to check it is you. That message is not an offer."
2. After code: card-added page shows Add to Apple Wallet and Add to Google Wallet buttons at equal size, plus "Keep it in your browser".
3. Wallet (mobile `(tabs)/wallet.tsx`): Reward ready section first when any shop has `rewardsAvailable`; otherwise a plain list. Balances right-aligned in accent, per `foundations.md`.
4. Discover (mobile `(tabs)/discover.tsx`, `map.tsx`): each row's italic subtitle is chosen in order: the member's progress, a live 2× window, the shop's perk, the category.

### 7.10 Cross-cutting acceptance

- Anti-slop checklist in `foundations.md` passes for every changed screen, including dark mode and 390 px.
- Only one accent-coloured thing per viewport on Home, Customers and Reports.
- Sample numbers are never hard-coded; empty states are one sentence and one action.
- Tests: unit tests for `isRegular`, `isSlipping`, `usually`, typical-weekday baselines; API tests for `/reports/today`, `/reports/heatmap`, promo results, `cameIn7d`; nav tests; a counter E2E that asserts a one-match four-digit entry produces exactly one award and an undo reverses it.
- No change to prices, `FEATURES`, or `FREE_FOREVER` in `packages/shared/src/plans.ts`. All of the above sits on features that already exist.

### 7.11 Open questions for the owner

1. Should `counterAutoStamp` default to on? It saves the confirm tap but a wrong last-4 match stamps the wrong person (undo is 10 s). I recommend on, with the two-match list as the guard.
2. Wallet "Free drink ready" as a pass update needs a live Apple Wallet push certificate and Google Wallet issuer access in production; confirm both are provisioned.
3. Staff PIN on web counter: reuse the mobile PIN table or add new?
4. Reports "cost per drink": a shop-entered estimate is easy; a POS-derived cost is not available.
