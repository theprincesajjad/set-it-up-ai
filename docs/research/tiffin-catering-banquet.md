# Tiffin, South Asian catering and banquet halls (GTA)

Slug `tiffin-catering-banquet`. Written Oct 23, 2026 by the market-expert pass (phase 1: research and design only, no app code touched).

Labels used below: **(S)** = sourced, link given. **(E)** = my estimate or inference, to validate in the founder's owner interviews. **(R)** = read from the repo or the screenshots in `scratchpad/shots/rest1`, `rest3`, `mobile-rest`.

The one-line answer to the question the brief singled out: **yes, support recording Interac e-transfer payments by hand, and make it a first-class payment method, not an "other" button.** Section 7.1 is the spec. Section 4 explains why.

---

## 1. Who this is for

### 1.1 Tiffin kitchens (the wedge)

- **Who runs them.** Mostly home cooks and small kitchens, a dozen to a few dozen subscribers each. One Mississauga operator profiled by Canadian Press cooks North Indian vegetarian lunches for about a dozen customers (S: [CP via Globe/NSNews](https://nsnews.com/the-mix/taste-of-home-tiffin-lunch-boxes-bring-comfort-affordability-to-immigrants-9619690)); a Burlington home cook sells weekday lunch boxes at **$12 each** (S: [CTV/CP](https://ctvnews.ca/business/taste-of-home-tiffin-lunch-boxes-bring-comfort-affordability-to-immigrants-1.7063883), headline only, price from the search summary of the same story). Larger restaurant-based tiffin lines (Gujarati thali houses, Punjabi dhabas) run 40 to 150 subscribers (E).
- **Customers.** Students and newcomers, working professionals (office lunch and dinner), seniors who no longer cook, and families wanting a vegetarian, Jain or halal-certain meal (E). Cuisines named in the brief: Gujarati, Punjabi, South Indian, Pakistani.
- **Tools today.** WhatsApp groups and broadcast lists, a spreadsheet, the bank app for e-transfers, Google Maps for the run, sometimes a marketplace listing. TiffinStash is the visible marketplace: it lists lunch and dinner delivery across Toronto, Mississauga, Brampton, Scarborough, Markham, Vaughan, Etobicoke and Oakville, with a one-day trial, a five-day weekly plan and a 20-meal monthly plan, and lets customers skip eligible days and pause (S: [TiffinStash](https://www.tiffinstash.com) via search summary; [Crunchbase](https://www.crunchbase.com/organization/tiffinstash)). Its co-founder is quoted saying "there are more sellers than customers" (S: CTV/CP above), and the founder strategy file records about 40 sellers and a $12 to $16 trial day (R: `docs/business/combined-strategy.md` line 377). Treat the "60+ sellers" and "75% repeat" claims in earlier briefs as unverified (the strategy file already flags them).
- **What they pay for software today.** Nothing, or a spreadsheet. Marketplace listing fees are not published (not found).

### 1.2 South Asian caterers

- Restaurants and dedicated caterers doing weddings, mehndi, sangeet, walima, aqiqah, engagement parties, corporate lunches and religious functions (R: event types in `catering_events`).
- Quoting is **per head for buffets and by the tray for biryani, nihari, karahi and naan** (E, matches the existing quote builder). GTA wedding catering overall runs about $30 to $150 a guest, buffets $50 to $100 (S: [EventSource](https://www.eventsource.ca/blog/average-catering-cost-for-weddings-in-toronto-the-gta); generic, not South Asian only).
- Tools today: WhatsApp and phone, a paper order book, sometimes a generic invoice tool (E).

### 1.3 Banquet halls

- Convention centres and halls in Mississauga, Brampton, Scarborough and Markham with capacities from about 220 to 2,400 (S: [EventSource list of 25 halls that specialise in South Asian weddings](https://www.eventsource.ca/blog/25-beautiful-banquet-halls-that-specialize-in-south-asian-weddings): Autaq up to 400, Mississauga Convention Centre up to 2,400, Embassy Grand Brampton up to 2,200, Grand Cinnamon Scarborough 50 to 1,300, Markham Convention Centre 120 to 900).
- Pricing is package-per-head with hall fee: Autaq lists **$45 to $60 a person**, Brampton venues **$45 to $60 a person with a $1,000 minimum spend** (S: [EventSource Autaq](https://www.eventsource.ca/autaq-banquet-hall), [Tagvenue Brampton](https://tagvenue.com/ca/hire/wedding-venues/brampton)). Older South Asian packages show a **15% facility fee plus 13% HST on the total, 200-guest minimum** (S: [Carmens 2020 PDF](https://www.eventsource.ca/listings/CarmensBanquetCentre/documents/Carmens-All-Inclusive-Wedding-Package-South-Asian_202007090331121909.pdf), old) and $71 to $82 buffet per person (S: [Deer Creek 2021](https://www.eventsource.ca/listings/DeerCreek/pdf/2021SouthAsianWeddingPackage_202005260315192870.pdf), old).
- Size of the tool budget: unknown (not found). Perfect Venue, the closest competitor, starts at $199 a month billed annually (see 2.4).

---

## 2. Evidence

### 2.1 Tiffin price points

| Datum | Source | Use |
| --- | --- | --- |
| $12 per weekday lunch box, Burlington home cook | S: CTV/CP link above | floor for a home kitchen |
| Trial day $12 to $16 on TiffinStash | R: strategy file, press (W?) | trial-day price to support |
| 20-meal monthly plan is a standard TiffinStash package; weekly plan is 5 days | S: TiffinStash via search | plan shapes already in the build (weekly, monthly) |
| $180 and $230 a month, Surrey/Vancouver listing | S: Google listing for Panjab Tiffin (BC, not GTA) | sanity check only |
| Seed data in the build: $69 a week lunch, $219 to $239 a month | R | in line with $11 to $12 a meal |

**(E) GTA monthly price band:** about **$220 to $300 for 20 to 26 meals** (roughly $10 to $13 a meal), more for Jain, thali-style or two-serving plans. I found no published GTA price list for Gujarati, Punjabi, South Indian or Pakistani tiffins from the first-page searches, so this band must be checked against 10 real menus before any copy quotes it. Not found: "Tiffin Wala" or a specific "mealprep app" with public GTA pricing; I could not confirm those as live products.

### 2.2 Delivery radius, routes, skip and pause

- **Radius and routes (E):** operators deliver in a loop of 10 to 25 km, two or three routes per meal time, grouped by postal-code prefix (L5R, L4Z, L5V) and a driver who is the owner, a relative or a part-timer. The build already models routes by FSA prefix (R: `createRouteBody.areas`). I found no source with real numbers.
- **Skip and pause norms:** TiffinStash allows skipping eligible days and pausing (S). HelloFresh-style "skip by Saturday" cutoffs are the pattern customers know (S: Mobbin screen below). The build uses "cutoffHours before 8:00 Toronto, default 24" and credits skips on the next bill (R). That is sane; the open question is whether kitchens want "previous evening 8 pm" instead of "24 h" because they shop and prep the evening before (E, ask).
- **Billing rhythm:** weekly or monthly, paid in advance (R, S).

### 2.3 Payment habits and Interac e-transfer

- The founder strategy file states tiffin runs on Interac e-Transfer, free to the restaurant, and that moving it to cards costs about 3.0% of a $250 plan (R: `combined-strategy.md` lines 137 to 140, itself flagged A/W). I could not find a published survey of what share of GTA tiffin is paid by e-transfer; call it **very high but unmeasured (E)**.
- **How e-transfer works for a small merchant.** Receiving is free at most banks; business sending limits and per-send fees vary by bank (S: [Laurentian Business](https://www.laurentianbank.ca/en/business/banking-solutions/interac-etransfer), [Vancity Business](https://www.vancity.com/business/cash-management/interac-e-transfers), [ATB](https://www.atb.com/business/paying-and-receiving/receive-payments/interac-e-transfer/)). Incoming is typically up to $25,000 per transfer; Request Money is capped about $3,000 per request (S: same). **Autodeposit** removes the security question, but each bank decides if it offers it (S: [Hardbacon](https://hardbacon.ca/en/banking/interac-e-transfers/), [VoPay](https://vopay.com/learn/interac-e-transfer-security-questions/)).
- **No merchant API.** There is no Interac interface a tiffin kitchen can poll; reconciliation is the owner reading the bank app or the notification email (E, consistent with the above sources which describe only bank-side tools). That is why this product records, it does not "integrate".
- **Fraud.** Fake money requests, fake invoices and interception are documented (S: [CBC Go Public](https://www.cbc.ca/1.5296860), [CIBC](https://www.cibc.com/en/privacy-security/banking-fraud/frauds-and-scams/e-transfers.html), [VoPay](https://vopay.com/learn/interac-e-transfer-fraud)). So the record screen must say "check your bank first".
- **Pre-authorized debit (PAD).** Stripe supports it in Canada through ACSS with a mandate and up to 5 business days to learn the result; "not a guaranteed payment method" (S: [Stripe docs](https://docs.stripe.com/payments/acss-debit)). One third-party guide lists 1% + $0.40 capped at $5 (S, unconfirmed: [Venn](https://www.venn.ca/resources/how-to-save-on-your-stripe-payments-for-canadian-businesses)).
- **Cash** still appears at pickup and with seniors (E).

### 2.4 Competitors

| Product | What it is | Price (public) | What we learn |
| --- | --- | --- | --- |
| **TiffinStash** | GTA tiffin marketplace | Seller terms not published | Plans (trial, 5-day, 20-meal), skip and pause exist as a customer norm. We are the operator's own tool, not a marketplace |
| **ezCater** | US catering marketplace | 15% commission + 2.99% processing on marketplace orders; about 7% on its own ordering; optional dispatch $30 min or 10% over $300 (S: [ezCater selling fees](https://catering.ezcater.com/en/help/selling-fees), [Honeycart review](https://gethoneycart.com/ezcater-review-and-a-commission-free-alternative/)). US only per [Capterra](https://www.capterra.ca/software/1011646/httpswwwezcatercom) | Commission-free is our pitch; nothing in GTA South Asian catering runs on it. I found nothing on Cater-Cow in Canada |
| **Tripleseat** | Venue and caterer CRM | Not published; an old post says $89 a month, a third party says about $400 (S: [Tripleseat blog](https://tripleseat.com/?p=2573), [Hotel Tech Report](https://hoteltechreport.com/ja/compare/meetingpackage-event-operations-vs-tripleseat)) | BEOs, calendar, proposals. Too heavy and US-priced for a 300-seat hall in Brampton |
| **Perfect Venue** | Venue booking and proposals | $199 (Professional) or $299 (Premium) a month billed annually, $239 or $339 monthly; card 2.9% + $0.30 plus 0.5% or 0.3%; ACH $5 (S: [Perfect Venue pricing](https://www.perfectvenue.com/pricing)) | Guest portal, F&B minimums, e-sign, payment plans. Our banquet module at $99 add-on or inside $349 Pro is cheaper; they do not do e-transfer or Urdu/Punjabi |
| **Planning Pod** | Event and venue management | Demo only (S: [Planning Pod](https://www.planningpod.com/pricing.cfm)) | BEOs, floor plans, CRM. Floor plans and seating are a later add |
| **HoneyBook** | Freelancer/event client flow | $29, $49 or $109 a month billed yearly; card from 2.7% + $0.10, ACH 1.5% (S: [HoneyBook pricing](https://www.honeybook.com/pricing), US page) | Closest to our quote, sign and pay flow; its "Mark as paid: Cash, Check, Other" modal is the pattern for e-transfer (see Mobbin) |

Gap in all of them: **none supports Interac e-transfer as a recorded method, per-head plus per-tray quotes, Urdu/Hindi/Punjabi customer pages, or a tiffin route sheet.**

### 2.5 Ontario rules that touch the product

- **Home kitchens are food premises.** The home area where food is prepared and sold is a food premises under O. Reg. 493/17; the operator must notify the local health unit before opening, and the 2020 relief is for **low-risk, non-hazardous** foods (jams, most baking, chocolate) (S: [York Region](https://york.ca/media/113416/download), [Simcoe Muskoka](https://www.simcoemuskokahealth.org/docs/default-source/HU_Workplaces/home-based-food-business-web.pdf?sfvrsn=4), [Ontario e-Laws](https://www.ontario.ca/laws/regulation/170493/v4)). Cooked dal, rice and curry are potentially hazardous foods, so a tiffin kitchen is **not** covered by the low-risk relief (E, my reading; confirm with Peel at 905-799-7700). Municipal zoning is separate (S: Toronto and London guidance).
- **Peel specifics.** Notify Peel Public Health; new premises 14 days before opening; home-based businesses also contact the municipality; **at least one certified food handler on site whenever open**; exam pass mark 70%; certificate valid 5 years; **Peel stopped running its own course June 30, 2025**, so operators use a Ministry-approved provider (S: [Peel food operators](http://peelregion.ca/business/owners-operators/food/), [Peel food handler certification](https://peelregion.ca/services/food-handler-certification)). Toronto Public Health also contacts home operators after notification (S: [Toronto](https://www.toronto.ca/community-people/health-wellness-care/health-programs-advice/food-safety/food-safety-for-businesses/starting-a-food-business/regulations-and-licensing-requirements/)). Food Check Peel signs apply to premises (S: Peel).
- **HST (13% in Ontario).** Catering is taxable, and where the food is charged per person or per serving the extras (delivery, servers, gratuities) do not change that (S: CRA via [travel and convention guidance](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-specific-situations/gst-hst-information-travel-convention-industry.html)). **A mandatory or suggested service charge is taxable; a freely given tip is not.** The CRA banquet example taxes $1,000 + 15% charge on $1,150 (S: same). An Ontario banquet hall's automatic 15% gratuity was held taxable in *1410109 Ontario Ltd.*, 2022 TCC 141 (S: [summary at DMA](https://dmainc.com/?p=3470)). Tips are never taxed in our `tax.ts` (R). **Small suppliers at or under $30,000 of taxable revenue over four quarters need not register or charge GST/HST** (S: [CRA RC4022](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html)). Many home tiffin operators are under that line (E).
- **Consumer rules.** The *Consumer Protection Act, 2002* has a "future performance agreement" part with cancellation rules (S: [Ontario e-Laws](https://www.ontario.ca/laws/statute/02c30/v25) headings only; I could not read ss. 23 to 24). Whether a given catering or hall contract is covered needs a lawyer. The build's tiered refund policy on halls (100% from 30 days, 50% from 14, none after, R) is a business policy, not a legal safe harbour.

### 2.6 Deposit, tasting, refund and package norms (what I could and could not verify)

- **Deposit norms: not found** in public sources (no hall or caterer in the search results published a deposit schedule). The build defaults to catering 30% and hall 25% (R). Typical practice is a retainer to hold the date, a second instalment about a month out, and the balance days before (E). **Action:** ask five hall owners and five caterers; the design assumes 25% / 50% / 25% and 30% / balance after the event, both editable.
- **Tastings:** the build treats a tasting as a status step with a time (R). Whether caterers charge for tastings or credit them to the booking is unknown (E: free for large weddings, paid and credited for small ones; ask).
- **Refund customs:** hall tiers in the build; caterers commonly keep deposits for dates already held (E). Show the policy before payment (design C3).
- **Banquet packages:** per-head with included items (tables and chairs, hall, decor) and a facility fee (S: Autaq, Carmens above). Mandap, DJ and decor are rarely listed in public pages (S: EventSource list says none lists a mandap explicitly).

### 2.7 Season calendar (E, check the panchang and Hijri calendar each year)

- Mild-weather months, **May to October**, carry the volume for outdoor-adjacent Saturdays; the **weekend nights** (Fri, Sat, Sun) are the capacity (E, consistent with generic wedding-season guidance, not GTA data).
- **Hindu weddings** cluster outside the Chaturmas months (roughly mid-July to early/mid November, ends on Dev Uthani Ekadashi, expected about Nov 20, 2026, E) and in Nov to Feb, which is why late Nov and December weekends fill. **Muslim weddings and walima** avoid Ramadan (about Feb 8 to Mar 9, 2027, E) and cluster after Eid and in summer. Sikh weddings follow Gurdwara availability (E).
- **Non-wedding peaks:** Eid and Chaand Raat (large catering), Diwali (corporate and family trays), Vaisakhi, Navratri garba nights, Ramadan iftar boxes. The build already holds the festival calendar (R: `packages/shared/src/festivals.ts`); the design reuses it for the 8-week strip and the date-clash warning.

---

## 3. Jobs to be done (ranked by frequency × pain)

**Tiffin owner and staff**

1. **Know today's count and allergies before cooking** (daily, high pain: a wrong count is wasted food or a short box). Includes dishes × servings.
2. **Get paid, and know who has not paid** (weekly or monthly, highest pain: chasing e-transfers by memory and WhatsApp).
3. **Send the driver out with the right list** (daily, high pain: address, door note, allergy, order).
4. **Handle skips and pauses without arguments** (daily, medium: cutoff and credit rules).
5. **Publish the week's menu once** (weekly, medium).
6. **Add a new subscriber and put them on a route** (weekly, medium).
7. **See whether the business is healthy** (monthly, low frequency, high value): recurring revenue, churn, skip rate.

**Tiffin customer**

8. **Skip a day or pause before cutoff, from the phone** (weekly, high).
9. **Know what I owe and how to pay it** (weekly or monthly, high for e-transfer customers).
10. **See tomorrow's menu and delivery window.**

**Caterer**

11. **Turn a phone call into a priced menu quickly** (per inquiry; per head and per tray).
12. **Get a yes in writing and a deposit before buying food** (per event, highest pain).
13. **See which dates are taken and how much money is real** (weekly in season).
14. **Collect the balance and close the event.**

**Banquet hall**

15. **Hold a date while a family decides, and know when the hold dies** (per inquiry, high pain: double-booked Saturdays).
16. **Collect staged payments and show the cancellation policy** (per booking).
17. **Tie a hall booking to a catering quote** (per booking, medium).

---

## 4. What we build and why (mapped to jobs)

Existing features already cover most of jobs 3 to 8 and 11 to 17 at a basic level (R: `docs/engineering/restaurant-endpoints.md`, screenshots). The table lists each screen and component with the job it serves, and what changes.

| Screen / component | Job | State today (R) | Decision |
| --- | --- | --- | --- |
| **Tiffin / Today**: servings to cook, per-plan menu with allergy flags | 1 | Exists (servings, menu, dietary notes) | Keep; add prep totals (32 rotli) and per-plan allergy chip |
| Today: **Delivered 14 / 22** tile | 3 | Missing (Delivery and Pickup tiles show counts only) | Add; reads `tiffin_deliveries` statuses |
| Today: **Money to confirm** tile | 2 | Missing | Add (awaiting e-transfers + failed) |
| Today: **cutoff clock** chip | 4 | Missing | Add (one line, uses `cutoffHours` + 08:00 Toronto) |
| Today: **Needs you** list (new subscriber, awaiting e-transfer, failed card) | 2, 6 | Missing | Add; one accent item only |
| Today: **Driver run** progress per route | 3 | Missing | Add |
| Today: **month snapshot** | 7 | Revenue tab only | Keep small tile |
| **Subscribers**: Pays by column and filter, Awaiting payment chip | 2 | Table has status but no method; chip row has Pending | Add |
| Subscriber sheet: **Record payment** panel | 2 | Sheet shows Billing, Pays by, Pause, Skip days, Cancel | Add panel (design T2) |
| **Deliveries**: route lists, bulk status | 3 | Exists, good | Keep; add Open driver link, Mark all out, Late notice |
| **Driver view** (tokenised, phone) | 3 | Missing. The 390 px Deliveries tab is about 3,250 CSS px tall (R: `tiffin-deliveries-390.png`, 780×6492 at 2×) | New page `/d/<token>` (design M1) |
| **Menus**: plan strip + week grid + translation counter | 5 | One plan at a time with 7 textareas and Copy last week (R) | Rework to plans × days grid (design T4) |
| **Plans**, **Routes** tabs | 5, 6 | Exist | Keep; plans card shows cutoff |
| **Revenue**: collected by method, still to come in | 2, 7 | 8 stats + by plan | Add the two blocks (design T5) |
| **Customer subscribe: choose how to pay** | 9 | Card or PAD only; Stripe account required | Add e-transfer as an equal option (design M2) |
| **My tiffin**: due banner with email and reference, Skip/Undo with cutoff | 8, 9 | Next meals + Skip exist; charges list; no manual-pay banner | Add banner (design M3) |
| **Catering pipeline**: next-action line per card, money tiles, 8-week strip | 11 to 13 | Board with value per card, no money tiles, no season view | Add (design C1) |
| **Event detail**: ledger + service charge line + per-guest total | 12, 14 | Quote builder with per-head/tray, HST, 30% deposit; mark-paid exists but drops method | Add ledger and service charge (design C2) |
| **Quote approval page** `/e/<token>`: approve, then pay card or e-transfer, cancellation terms | 12 | Card deposit only | Add e-transfer option and policy block (design C3) |
| **Banquet calendar + booking panel**: hold countdown, payment schedule | 15, 16 | Month grid exists; bookings table; single deposit | Add schedule, countdown, deposit record (design B1) |
| **Tax settings**: GST/HST registered toggle and number | 11, 14 | Missing; catering always adds 13% | Add (P0, legal) |
| **Compliance card** (food handler expiry, health-unit notice date) | none direct | Missing | P3, optional |

### What each new component earns

- **Money to confirm / Needs you / Pays by / Record payment panel**: because job 2 is the highest pain for the segment and every part of it is today either a spreadsheet or impossible in the product.
- **Reference code (JM-1023)**: the only way to match an anonymous e-transfer to a person without a bank feed; it goes in the customer's message line.
- **Collected by method**: lets the owner reconcile to the bank, and shows us the real e-transfer share.
- **Driver link**: the driver is often not the owner and will not install an app; one-tap Delivered and one-tap Late reduce phone calls.
- **Prep totals**: the cook multiplies servings by pieces each morning; the product already has the servings (R).
- **8-week strip, deposit method on cards**: capacity and cash, the two things a caterer counts in season.
- **Service charge line + tax toggle**: the HST rules above make both necessary to be correct.
- **Payment schedule on a hall booking**: halls collect in instalments (E); a single deposit forces the rest back to a spreadsheet.

---

## 5. What we deliberately don't build

- **No bank-feed, email-parsing or Interac API integration for e-transfer in this phase.** No merchant API exists (see 2.3); parsing bank emails is fragile and invites phishing. The owner confirms; we record. Revisit a "paste the bank email to fill the form" helper only if owners ask (P3).
- **No marketplace or consumer discovery for tiffin** (TiffinStash's job). The network map and shop page are the discovery we already ship.
- **No automatic pass of tiffin cash or e-transfer through our accounts.** We never hold funds for manual methods (keeps us out of payments regulation; ties to the legal opinion item in the strategy file).
- **No route optimisation or live GPS tracking.** A drive-order list plus Navigate deep link is enough for 5 to 15 stops (E). Revisit above 25 stops per route.
- **No floor plans, seating charts, BEO printing or vendor management** (Tripleseat and Planning Pod territory). Revisit when 5 halls ask.
- **No wedding website, guest RSVP or decor mood boards.**
- **No automatic legal refund logic.** We apply the hall's own policy and show it; contract wording stays the owner's, with a lawyer note.
- **No per-meal choose-your-dishes ordering inside subscriptions** (a HelloFresh pattern). Plans have a set menu; add-ons are order-ahead, which exists.
- **No dark mode work** in this phase beyond token parity (the Figma tokens carry both modes).

---

## 6. Design

**Figma file:** https://www.figma.com/design/9LPYTB531RMBi05zWfqK0R (file name "Local Loyalty — Tiffin, Catering & Banquet"). Light and dark colour tokens are variables in the collection "LL tokens" (matching `docs/design/foundations.md`: monochrome, one accent `#FF5A1F`, info blue for "waiting on a customer", Bricolage Grotesque display, Inter body, hairlines, pill buttons). Each frame has a "Why this exists" card to its right (desktop) or below (mobile) that maps components to jobs. Frames are built as auto-layout with token-bound fills; the repo's real components (`apps/web/src/components/ui`, restaurant/*) are the reusable layer, so I did not duplicate them as Figma components.

PNG exports of every frame: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/tiffin-catering-banquet/` (T1 to T5, M1 to M3, C1 to C3, B1, P1).

### 6.1 Frame list

| Page | Frame | Node | Size | Job |
| --- | --- | --- | --- | --- |
| Tiffin | **T1 Dashboard / Today** | `2:2` | 1440 | 1, 2, 3, 4, 6 |
| Tiffin | **T2 Subscribers + Record payment** | `3:2` | 1440 | 2 |
| Tiffin | **T3 Deliveries (route run)** | `3:331` | 1440 | 3 |
| Tiffin | **T4 Plans + Menu week** | `4:2` | 1440 | 5 |
| Tiffin | **T5 Revenue + cash in** | `4:247` | 1440 | 2, 7 |
| Tiffin | **M1 Driver / Route run** | `5:2` | 390 | 3 |
| Tiffin | **M2 Customer / Subscribe + choose how to pay** | `5:79` | 390 | 9 |
| Tiffin | **M3 Customer / My tiffin** | `5:140` | 390 | 8, 9, 10 |
| Catering | **C1 Pipeline** | `6:2` | 1440 | 11 to 13 |
| Catering | **C2 Event detail + quote** | `6:229` | 1440 | 11, 12, 14 |
| Catering | **C3 Customer / Quote approval** | `6:451` | 390 | 12 |
| Banquet | **B1 Calendar + booking** | `7:2` | 1440 | 15, 16 |
| Payments & notes | **P1 How they get paid** (decision table + manual lifecycle) | `7:328` | 1440 | 2, 9, 12, 16 |

Dashboard tabs not drawn separately: **Plans** (the strip at the top of T4 is its summary; keep the current Plans table and sheet) and **Routes** (current tab is fine; the postal-prefix editor stays). P1 holds the payment-method decision table and the manual-payment lifecycle.

Iteration log: built T1 and screenshotted; fixed clipped stat text, long shop name, baseline alignment. T2: the record panel covered table columns, so the table was narrowed and filter chips trimmed. C1: clipped card text shortened. C3: Punjabi label had no glyphs in Inter (switched to Anek Gurmukhi) and the frame was too short. T5: platform fee corrected to 1% of in-app collections ($18.16). B1: hold and schedule dates corrected to Oct 23, 2026 timeline. All figures in frames are illustrative seed-style data.

### 6.2 Mobbin references (and what each taught)

- HelloFresh web account home "Arrives on, change meals": [screen](https://mobbin.com/screens/24b10f29-df0c-447e-aa28-84a1f60f3157). The next delivery and the single action (change/skip) is the home of a meal subscription. Informs T1 and M3.
- HelloFresh iOS home with Skipped / Unskip and "Coming up, edit by Saturday": [screen](https://mobbin.com/screens/b245a59a-17ba-4f63-8631-dd050a7f5788). Deadline stated as a date beside the action, Undo until then. Informs M3 skip rows.
- Panera Bread subscription management with upcoming charges: [screen](https://mobbin.com/screens/e34385a6-d8da-42bb-8f50-5e48f03c1a5f). Upcoming charges as a plain dated list with Cancel last. Informs M3.
- 7-Eleven Gold Pass plan details: [screen](https://mobbin.com/screens/0ea414b2-ed61-4e8a-a63e-ea56c0227423). Status, next payment due, payment history in a flat key-value list. Informs M3 and the T2 panel layout.
- Blue Apron delivery day picker: [screen](https://mobbin.com/screens/84b950f3-5ad2-42cc-bf2b-a2767fc11c0d). Day then first date in one screen; informs the subscribe start-date pick in M2.
- DoorDash Dasher "Current dash": [screen](https://mobbin.com/screens/5859ffb5-02a0-45ee-9065-2ea87eaf43fa), and Uber Eats courier tracking: [screen](https://mobbin.com/screens/c6a30e0d-0980-429a-a7f5-dc6149b198b1). One current task card, call and navigate beside one primary action. We drop the map: stops are few and known. Informs M1.
- Wix Subscriptions page with failed-payment retry banner: [screen](https://mobbin.com/screens/e3edaaf5-1832-4828-97cf-201b86b65c2c). A short stats header then a list, and a retry notice. Informs T2 and T5 "Still to come in".
- Pipedrive deals board: [screen](https://mobbin.com/screens/2ff3c977-7902-48b5-8361-0c89710e5c2e), HubSpot board with totals per stage: [screen](https://mobbin.com/screens/35b26dbf-8d2b-4f6c-a789-738b02d927b1), HoneyBook projects board with event date and type on cards: [screen](https://mobbin.com/screens/5e54e8a6-a441-4bcc-941b-620942f78a9d). Stage columns, event date first, no probability. Informs C1.
- HubSpot quote builder with e-signature and "Accept online payments": [screen](https://mobbin.com/screens/496e0211-9d23-402b-a93e-d447ef4249f5), Behance proposal with 30% upfront and remainder due: [screen](https://mobbin.com/screens/cabf9ae3-8051-47be-a931-180e027e4847), Fresha deposit modal with policy text: [screen](https://mobbin.com/screens/5166b3a8-d385-46cd-a24b-ffd0984df410), Dribbble proposal with payment pane: [screen](https://mobbin.com/screens/bd118195-d121-4631-978d-5c6b939b25e0). Terms, sign, then pay, with the policy shown before the pay button. Informs C3.
- HoneyBook "Mark as paid: Cash / Check / Other, payment made on": [screen](https://mobbin.com/screens/4a1b5a54-7cf4-4c16-88ae-ae508ade10c3), Mercury "Mark as paid: in Mercury or externally, paid on, method": [screen](https://mobbin.com/screens/4a5d5d92-1682-4a62-b913-5152f77e8e7e), PayPal "Record a payment: amount, date, method, note": [screen](https://mobbin.com/screens/d8576d5e-0b70-422b-9789-292671e492ee). Method, date, amount, note and nothing else. Informs the Record payment panel (T2, C2, B1).
- Airbnb host calendar month with day detail panel: [screen](https://mobbin.com/screens/352eaa2b-1b3f-4211-8fdf-967884212fbe), HoneyBook calendar with tentative vs booked: [screen](https://mobbin.com/screens/49449de3-16a8-47e0-b99f-c95ae54acb90). Month grid + side panel for the selected day; booked and tentative need different fills. Informs B1.

*Mobbin usage notice returned by the tool:* "Your Mobbin AI usage is high this month. Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect." ([view usage and plan options](https://mobbin.com/settings/billing-and-usage))

### 6.3 Design vs the current build

Current screens: `scratchpad/shots/rest1` (dashboard, 1440 and 390), `rest3` (public/customer web), `mobile-rest` (app).

| Area | Current build | Design | Change |
| --- | --- | --- | --- |
| Today | 4 stats (servings, subscribers, delivery, pickup) + per plan menu | Adds Delivered x/y, Money to confirm, cutoff clock, Needs you, Driver run, prep totals | Additive; drop the "Subscribers" stat (it is on the next tab) |
| Subscribers | Status chips, plan/route/fulfilment filters, table without payment method | Pays by column and filter, Awaiting payment chip, Record payment panel | Additive |
| Deliveries | Route lists, checkboxes, expand, bulk status; very long at 390 | Adds driver link, mark all out, late notice | Additive; stop-by-stop driver page replaces the 390 admin list for drivers |
| Menus | One plan at a time, 7 textareas, Copy last week | All plans × days grid with translation counter | Rework (same API: `PUT /menus` takes up to 31 entries) |
| Revenue | 8 stats + by plan | Collected by method, Still to come in | Add two blocks, keep stats |
| Customer subscribe | Card or PAD, needs Stripe account on the kitchen | E-transfer option with instructions; kitchen needs no Stripe for that method | Backend rule change (see 7.1) |
| My tiffin | Next meals with Skip, manage rows, payments list | Due banner with email and reference, copy buttons | Additive |
| Catering pipeline | Board by stage with total per card | Money tiles, 8-week strip, next-action line | Additive |
| Event detail | Quote builder, tasting, "Where it stands", Send quote, Cancel | Payments ledger, service charge, per-guest, record payment | Additive |
| Quote page `/e/<token>` | Card deposit, language switch, quote table | Adds e-transfer option, cancellation block | Additive |
| Banquet | Bookings table, month grid (empty in screenshot), hall sheet, single deposit | Booking panel with hold countdown, staged payments, deposit record | Additive; grid shows chips |

---

## 7. Build spec

Execute in this order: **7.1 manual payments (P0)**, **7.2 tax settings (P0)**, **7.3 driver link (P1)**, **7.4 Today and Subscribers and Revenue (P1)**, **7.5 customer screens (P1)**, **7.6 catering (P1)**, **7.7 banquet (P2)**, **7.8 menus grid (P2)**, **7.9 compliance (P3)**. Each section has files, API, UI, acceptance checks. Nothing here changes `FEATURES` gating: all stay under `restaurant.tiffin`, `restaurant.catering`, `restaurant.banquet`.

### 7.1 Manual payments (e-transfer, cash, cheque) as a first-class method

**Behaviour.** A kitchen, caterer or hall can switch on "Interac e-transfer" under Settings. A payment due on a tiffin charge, catering deposit/balance or hall instalment then shows the customer exact instructions (email, amount, reference code). The owner marks it received with method, date, amount, optional bank reference and note. Recorded payments carry **no platform fee**. A kitchen can take subscribers **without a Stripe account** if e-transfer or cash is the only method it offers.

**Why it is P0.** `subscribe()` today throws `409 "This kitchen can't take payments yet"` when `merchant.stripeAccountId` or `stripeChargesEnabled` is missing (R: `apps/api/src/services/tiffin.ts`, around line 1338). A kitchen whose customers pay by e-transfer cannot onboard. Catering's `POST /catering/:id/deposit/mark-paid` accepts `{method, note}` but `markDepositPaid` calls `confirmWithDeposit(ctx, e, {})` and discards both (R: `apps/api/src/services/catering.ts` line 495; `restaurantApi.cateringMarkDepositBody`), so nothing records how or when.

**Schema** (new migration `packages/db/migrations/<next number>_manual_payments.sql` (0010 was next at time of writing, but other work is touching migrations, so check `meta/_journal.json`) and `packages/db/src/schema.ts`):

```
manual_payments            -- append-only ledger, one row per recorded receipt
  id uuid pk
  merchant_id uuid fk
  subject_type text        -- 'tiffin_charge' | 'catering_deposit' | 'catering_balance' | 'hall_instalment'
  subject_id uuid          -- tiffin_charges.id | catering_events.id | invoices.id | hall_bookings.id
  instalment_index int null -- for hall_instalment
  method text              -- 'etransfer' | 'cash' | 'cheque' | 'other'
  amount_cents int         -- may be below or above the amount due; see rules
  received_on date
  bank_reference text null -- optional Interac reference from the bank email
  note text null
  recorded_by uuid fk users
  created_at timestamptz
  voided_at timestamptz null, void_reason text null, voided_by uuid null
tiffin_charges   add  reference_code text null, payment_method text null  -- 'card' | 'pad' | 'etransfer' | 'cash'
catering_events  add  reference_code text null
hall_bookings    add  reference_code text null, schedule jsonb null  -- [{label, bps|amountCents, dueOn, paidAt|null}]
halls            add  payment_schedule jsonb null                    -- template [{label, bps, dueOffsetDays}]
merchants        add  payment_settings jsonb not null default '{}'   -- {etransferEnabled, etransferEmail, instructions, startOnTrust, graceDays, cashEnabled}
```

`tiffin_charges.status` gains `'awaiting'` (manual, instructions sent, not yet recorded). `TIFFIN_PAYMENT_METHODS` becomes `["card","pad","etransfer","cash"]`. Reference code generator: `<initials><per-merchant sequence>` such as `JM-1023`, unique per merchant (unique index on `(merchant_id, reference_code)` per table family; use one counter table or the existing `nextNumber` helper used by invoices).

**Shared contracts** (`packages/shared/src/api/tiffin.ts`, `restaurant.ts`, new `payments-manual.ts`, export in `api/index.ts`):

- `paymentSettingsBody` / `PaymentSettingsDto` for `GET|PUT /v1/merchants/:m/payment-settings` (only owners; validate email; `graceDays` 0 to 14, default 3; `startOnTrust` default false).
- `recordPaymentBody = {method: 'etransfer'|'cash'|'cheque'|'other', amountCents: int>0, receivedOn: iso date (not future), bankReference?: string<=60, note?: string<=300, sendReceipt?: boolean default true}`.
- `ChargeDto.status` adds `"awaiting"`; `ChargeDto` adds `referenceCode`, `paidMethod`, `receivedOn`.
- `SubscribeBody.paymentMethod` accepts `etransfer | cash`; `SubscribeResponse` adds `manual: {email, amountCents, referenceCode, instructions} | null` (payment is `null` for manual).
- `SubscriberDto` adds `awaitingCents`, `awaitingSince`.
- `RevenueResponse` adds `collectedByMethod: {method, cents, count}[]`, `awaitingCents`, `awaitingCount`, `pastDueCents`, `inFlightCents`.
- `CateringEventDto` adds `depositMethod`, `depositReceivedOn`, `referenceCode`, `payments: ManualPaymentDto[]`.
- `HallBookingDto` adds `schedule`, `referenceCode`, `payments`.

**API** (all behind the existing feature checks; staff routes need staff auth; log to `admin-audit` style trail):

- `POST /v1/merchants/:m/tiffin/charges/:chargeId/record-payment` (body above) -> `ChargeDto`. Rules: only `awaiting|pending|failed` charges; creates a `manual_payments` row; sets charge `paid`, `paidAt = receivedOn`; if the subscription was `pending` or `past_due` set `active`; sends `payment_receipt` notification when `sendReceipt`. Under-payment: if `amountCents < due` keep charge `awaiting` with remainder and return `remainingCents`; over-payment: store, flag for the owner, no auto credit.
- `POST /v1/merchants/:m/tiffin/charges/:chargeId/void-payment {reason}` for mistakes (marks the ledger row voided and reopens the charge; audit logged).
- `GET /v1/merchants/:m/tiffin/awaiting` -> list of awaiting charges with age, for Today and Subscribers.
- `POST /v1/merchants/:m/catering/:eventId/deposit/mark-paid` now persists `method`, `note`, plus new optional `amountCents`, `receivedOn`, `bankReference`, writing a ledger row; keep the route and default `method: "other"` for backward compatibility; DTO returns `depositMethod`.
- `POST /v1/merchants/:m/catering/:eventId/balance/record-payment` (new) and extend `markInvoicePaid` methods in `apps/web/src/lib/api/endpoints.ts` line 371 from `cash | card_terminal | other` to add `etransfer | cheque` (service invoices benefit as well).
- `POST /v1/merchants/:m/banquet/bookings/:id/payments {instalmentIndex, ...recordPaymentBody}` and `POST .../confirm {markDepositPaid}` stays, now writing a ledger row.
- Customer or public reads: catering `GET /public/catering/:token` adds `manual: {email, amountCents, referenceCode, instructions} | null` when the shop allows e-transfer.

**Job changes** (`apps/api/src/jobs/tiffin.ts`, `services/tiffin.ts`):

- `rollBilling`: for a subscription whose `paymentMethod` is `etransfer|cash`, `ensureCharge` then set `awaiting` and **do not** call `startPayment` or `chargeConnectSavedMethod`; notify once with instructions (`renewal_due` event, include `referenceCode`).
- New `remindManualCharges` (daily): day +1 and +3 reminders (WhatsApp if opted in and plan allows, else SMS/push; respect the 21:00 to 08:00 quiet rule already used by WhatsApp broadcast).
- Grace: after `graceDays` an unpaid manual charge marks the subscription `past_due`; `generateDeliveries` already returns `on_hold` for past due (R: `UpcomingDelivery.status`); keep that. `startOnTrust: false` means a new manual subscription stays `pending` (no deliveries) until recorded.
- `platformFeeFor`: add kinds so manual methods return 0 (`apps/api/src/services/fees.ts`); add tests (`apps/api/test`) for `computeFees`.
- `subscribe()` (`services/tiffin.ts`): move the Stripe-account check after the method branch; for manual methods skip it, skip `startPayment`, and return `manual`. Keep the duplicate-subscription guard.
- `FEES`/`pricing.md`: add one sentence "Payments you record by hand carry no platform fee" to `docs/business/pricing.md` and the Connect status copy so the 1% remains honest.

**Dashboard UI** (`apps/web/src/components/dashboard/restaurant/...`):

- New shared component `RecordPaymentPanel.tsx` in `components/dashboard/restaurant/` (side panel, fields: method chips, amount (prefilled), received on (date, default today, no future), optional bank reference, "Send a receipt" checkbox, info-blue warning "Check the deposit in your bank first", primary button "Mark paid $X"). Use it from: `tiffin/SubscribersTab.tsx` (subscriber sheet), `catering/EventPage.tsx` (replace the plain mark-paid button; ledger card), `banquet/BookingsTab.tsx` (booking sheet).
- New `settings` section "How you get paid" under the restaurant settings (find the existing `more` page, `apps/web/src/app/(dashboard)/m/[merchantId]/restaurant/more`): toggles for Card / Bank debit / Interac e-transfer / Cash, the e-transfer email and instruction text, grace days, start-on-trust.
- `SubscribersTab.tsx`: add "Pays by" column and filter; replace chip "Pending" with "Awaiting payment N" (info blue) and keep "Past due" (negative); status label for awaiting reads "Awaiting e-transfer".
- `TodayTab.tsx`: Money to confirm tile and Needs-you rows link into the panel.
- `RevenueTab.tsx`: two new blocks (design T5).

**Customer UI.**

- `apps/web/src/app/(pass)/me/tiffin/page.tsx` and mobile `apps/mobile/src/app/tiffin/[id].tsx`: due banner (design M3) when `latestCharge.status === 'awaiting'`, with copy-email and copy-reference buttons; payment list rows show "Awaiting e-transfer" or "Paid by e-transfer Oct 23".
- Subscribe sheet in `apps/mobile/src/app/tiffin/plans/[slug]` and web equivalent: "How will you pay?" as radio cards (design M2); e-transfer instructions block appears after selection; confirmation message repeats them. Only show methods the shop enabled; default order card, bank debit, e-transfer unless the shop has no Stripe account, in which case e-transfer is the default and card/PAD are hidden.
- Web `/e/<token>` (`apps/web/src/app/(pass)/e/[token]/page.tsx`) and mobile `apps/mobile/src/app/e/[token].tsx`: "Pay by Interac e-transfer" card under the card option; after approve, if e-transfer chosen call approve with no deposit intent and show the instructions; add the cancellation block from the hall/catering policy.
- Translations: add strings to `packages/shared/src/i18n/messages/{en,hi,ur,pa}.ts` and `docs/engineering/translation-glossary.md` ("e-transfer", "reference code", "awaiting payment"); keep RTL checks for Urdu.

**Acceptance checks (tests under `apps/api/test` and Playwright/e2e where present).**

1. A merchant with no Stripe account and e-transfer enabled can create a plan and a customer can subscribe with `paymentMethod:"etransfer"`; response has `manual` and `payment: null`; charge status `awaiting`; subscription `pending` unless `startOnTrust`.
2. Recording the full amount sets charge `paid`, subscription `active`, writes one ledger row with method and received date, sends one receipt, and platform fee is 0.
3. Recording twice does not double-pay (idempotent on charge id; second call returns 409 with the existing record).
4. Under-payment leaves `awaiting` with `remainingCents`; void reopens.
5. After `graceDays` with no record, the subscription is `past_due` and tomorrow's delivery list excludes it (existing behaviour).
6. `mark-paid` on catering now persists `depositMethod: "etransfer"` and shows it in the DTO, the pipeline card and the ledger; refund on cancel still returns 409 for a hand-recorded deposit, as before.
7. Future `receivedOn` is rejected; non-staff cannot record; every record writes an audit entry.
8. Screens match the Figma frames at 1440 and 390; Urdu RTL renders the due banner correctly.

### 7.2 Tax settings (GST/HST) and service charge

**Why.** `apps/api/src/services/tax.ts` applies provincial tax to quotes and invoices with no merchant-level registration flag (R: grep found no `gstNumber`/`taxRegistered`), and tiffin charges carry no tax at all (R: no tax in `services/tiffin.ts`). A home kitchen under the $30,000 small-supplier line should not charge HST it cannot remit; a registered caterer must charge it, including on a mandatory service charge (sources in 2.5).

**Spec.**

- `merchants` add `tax_registered boolean null` (null = not asked yet), `tax_number text null` (GST/HST number, 9 digits + RT0001 format check, not verified against the CRA), `tax_small_supplier_note boolean`.
- Settings page asks once: "Are you registered for GST/HST?" with a one-line explainer and a link to CRA RC4022. Until answered, quotes show a banner "Set your tax status" and still compute at 13% but label "tax status not set".
- `tax.ts`: when `taxRegistered === false`, tax is 0 and quote/invoice/approval pages say "No HST charged (small supplier)". When true, show the number on invoices and the approval page.
- Tiffin: add a per-plan `taxable boolean` (default true when registered) so a registered kitchen's charge includes HST: `ChargeDto` adds `taxCents`. Prepared meals are generally taxable (E: confirm with an accountant; note the Ontario point-of-sale rebate on meals of $4 or less does not apply to subscriptions). Subscribers see "$74.00 + HST". Platform fee is computed on the pre-tax or post-tax amount consistently; document the choice.
- Catering: add `serviceChargeBps int default 0` on `catering_events` and a line item kind `service_charge` that is **taxed**; tips remain untaxed and are not modelled on quotes. The approval page lists "Service charge 10% (HST applies)".
- Acceptance: unregistered merchant -> quote total equals subtotal; registered -> 13% on subtotal + service charge, rounded half-up per component; test cases in `apps/api/test/tax*.test.ts`; `QC` path unchanged.

### 7.3 Driver link and driver page

- **Table** `tiffin_driver_links(id, merchant_id, route_id, date, token unique, expires_at, created_by, last_opened_at)`.
- **Merchant API:** `POST /v1/merchants/:m/tiffin/routes/:routeId/driver-link {date?}` -> `{url, expiresAt}` (expires 23:59 Toronto that day); `POST .../driver-links/send {routeIds[], channel:'whatsapp'|'sms'}` sends to `driverPhone` using the existing messaging service (respect quiet hours).
- **Public API (token only, rate-limited, no PII beyond what the driver needs):** `GET /v1/public/tiffin/driver/:token` -> `{shop, route, date, stops[{deliveryId, order, customerName, phone, address, postalCode, addressNotes, dietaryNotes, servings, planName, status}], progress}`; `POST /v1/public/tiffin/driver/:token/stops/:deliveryId {status:'delivered'|'missed', note?}` (reuses `setDeliveryStatus` rules; ignores skipped/final); `POST .../late {minutes}` sends "running late" to remaining stops (max once per 15 minutes).
- **Page** `apps/web/src/app/(pass)/d/[token]/page.tsx` (client component, mobile first, design M1): progress bar, **Next stop** card (name, address, door note, allergy tag, Navigate `geo:`/Google Maps universal link, Call `tel:`, big Delivered, small Could not deliver with reason sheet), then stop list, sticky "Running late" button, offline-tolerant (queue taps and retry).
- **Dashboard:** Deliveries tab gets "Open driver link", "Send driver links", "Mark all out", "Send late notice" (`DeliveriesTab.tsx`).
- **Acceptance:** token for route A cannot read route B or another day; expired token returns 410; Delivered updates the Deliveries tab and the customer's My tiffin within 5 seconds (polling); Today "Delivered x / y" matches; page passes a manual run on a 360 px Android width with 12 stops; no auth cookie required.

### 7.4 Today, Subscribers and Revenue changes

- `GET :m/tiffin/kitchen?date` (`services/tiffin.ts` `kitchen`) add: `delivered`, `outForDelivery`, `routes[{id,name,done,total,driver}]`, `prep[{dish, packs, pieces?}]`, `awaiting{count, cents}`. For prep, extend `menuItemSchema` with optional `perServing: number` (e.g. Rotli 4) parsed from the "(4)" convention at save time in `putMenus`; `pieces = perServing × servings`.
- `TodayTab.tsx`: implement design T1 (KPI block of four; cutoff chip = next meal day cutoff from the plan with the earliest `cutoffAt`; Needs you list from `awaiting` + new subscribers with `routeId = null` + `past_due`; Driver run; month snapshot reuses `revenue`).
- `SubscribersTab.tsx`: Pays by column (`paymentMethod`), filter param `payment=etransfer|card|pad|cash`, status chip "Awaiting payment" mapped to `status in (pending) OR charge awaiting`; add `awaitingCents` into the row. Keep the existing sheet and add the panel.
- `RevenueTab.tsx`: `collectedByMethod` bars and "Still to come in" list; retitle fee line "Platform fee (1% of payments made in the app)".
- **Acceptance:** numbers on Today equal the sum on Deliveries; Money to confirm equals the sum of awaiting charges; Pays by filter returns only matching rows; layout matches T1, T2, T5.

### 7.5 Customer tiffin screens

- Files: `apps/mobile/src/app/tiffin/index.tsx`, `tiffin/[id].tsx`, `tiffin/plans/[slug]/*`, web `apps/web/src/app/(pass)/me/tiffin/page.tsx`, `(pass)/shops/[slug]` tiffin section.
- M2: payment option radio cards, e-transfer reveal; M3: due banner, Skip/Undo rows show "Skip within 2 d 12 h" (already exists) and a locked reason after cutoff ("Closed Sat 8:00 am").
- **Acceptance:** subscribing with e-transfer shows exact instructions; due banner disappears when recorded and the payments list shows "Paid by e-transfer"; all four languages and RTL pass the existing `rest3` screenshot set.

### 7.6 Catering

- `catering/PipelineView.tsx`: add money tiles (open quotes value, deposits to collect, balances due in 14 days, booked next 8 weeks via `GET :m/catering/calendar?from&to`), the 8-week strip (events per week, confirmed vs quoted/held), and a one-line "next action" on each card ("New: call back today", "Sent 2 days ago, not opened" needs `quoteOpenedAt`: add `quote_opened_at timestamptz` set when `GET /public/catering/:token` is first loaded).
- `catering/EventPage.tsx`: Payments card (ledger from 7.1), "Where it stands" gains payment method on the Deposit line, service charge row (7.2), "About $X a guest, tax included" (already partly present: keep), customer-facing reference code shown.
- Public approval page: see 7.1. Include a **date clash** hint when another confirmed event or hall booking has the same `eventDate` (non-blocking amber note on the card).
- **Acceptance:** an event with a recorded e-transfer deposit shows method and date in ledger and pipeline card; unopened quote line appears after 48 hours; service charge is taxed for registered merchants; Figma C1 to C3 matched.

### 7.7 Banquet

- Add `schedule` to hall bookings: on hold or confirm, copy the hall's `payment_schedule` template (default 25% at hold, 50% 14 days before, 25% 7 days before; editable per hall and per booking) into `hall_bookings.schedule` with computed due dates and amounts; reminders job (`jobs/banquet.ts`) sends payment-due and hold-expiry notices (hold expiry 24 h and 4 h before).
- `banquet/AvailabilityTab.tsx`: month grid draws booking chips per day (confirmed = black, hold = info-soft with countdown), hall toggle includes "Both halls"; selected day opens the booking panel (design B1).
- `banquet/BookingsTab.tsx`: panel shows totals with HST, schedule rows with Record payment, Confirm, Release hold, and the refund tiers text from `halls.refundPolicy`.
- API: `GET :m/banquet/availability` already returns days; extend to include booking summaries (`{bookingId, status, label, holdExpiresAt}`) if missing. Reuse `POST .../payments` from 7.1.
- **Acceptance:** an unpaid hold past `holdExpiresAt` frees the date and the chip disappears; recording the first instalment can auto-confirm if the hall setting says so; schedule math sums to the booking total to the cent; refund text matches `refundPolicy`.

### 7.8 Menus tab

- `MenusTab.tsx`: replace the one-plan view with the plans × days grid (design T4); keep `PUT /menus` (max 31 entries per call, so save per visible week), Copy last week, "One dish per line, add words after ' - '" help text. Add the translation counter: count items lacking `translations` for hi/ur/pa; link to a sheet to add words (no blocking).
- **Acceptance:** editing a cell and saving writes one `tiffin_menus` row per (plan, date); copy last week fills all plans; shop-wide row appears only when `planId null` entries exist.

### 7.9 Compliance (optional)

- Settings card "Food safety": `food_handler_expiry date`, `health_unit_notified_on date`, `health_unit` text (Peel / Toronto / other). Show a banner 60 days before expiry. Never block selling, never claim approval. Copy: "Peel no longer runs its own course; use a Ministry-approved provider" with the Peel link.
- **Acceptance:** fields save; banner appears at 60 days; nothing appears on customer pages unless the owner opts in to a "Certified food handler" badge.

### 7.10 Cross-cutting

- **Docs:** update `docs/engineering/restaurant-endpoints.md` (new routes in 7.1, 7.3), `docs/business/pricing.md` (no fee on hand-recorded payments), `docs/legal/compliance-checklist.md` (HST status, small supplier, food handler), and `docs/design/system.md` if a "waiting on customer" blue pattern is not yet listed.
- **Telemetry (counts only):** share of charges paid by method; days from `awaiting` to recorded; driver link opens; used to replace the (E) numbers in this brief.
- **Out of scope for this build team:** legal wording for cancellation and refunds; bank partnerships; Interac integrations.

---

## 8. Top findings that change the product

1. **A tiffin kitchen with no Stripe account cannot take a subscriber, and tiffin has no e-transfer path.** Support recorded e-transfer as a first-class method (7.1).
2. **Catering's "mark deposit paid" throws away the method and note it is sent, and halls have a single deposit.** Replace with a payments ledger and staged schedules (7.1, 7.7).
3. **Tax is not modelled per merchant.** Catering always adds 13% HST and tiffin adds none; small suppliers under $30,000 should charge none, and a mandatory service charge is taxable. Add a registration setting and a service charge line (7.2).
4. **Drivers get an admin table, not a driver tool.** The 390 px Deliveries tab is about 3,250 px of rows; a tokenised one-stop-at-a-time page is the missing piece (7.3).
5. **The kitchen's morning screen lacks money and prep.** Add Money to confirm, Delivered x/y, cutoff clock and prep totals so Today answers "what do I cook, who has not paid, is the run done" (7.4).

---

## 9. Open questions for owner interviews (to replace estimates)

1. What share of your subscribers pay by e-transfer, card, cash? What do you do when one is late?
2. What do you tell a new subscriber to type in the e-transfer message, and how do you match deposits today?
3. Skip cutoff: 24 hours before 8:00, or the evening before at a fixed hour?
4. Do you charge HST? Are you registered?
5. Hall owners and caterers: deposit schedule, minimums, tasting policy, refund custom.
6. Is the driver you, a relative or a part-timer, and what phone and apps do they use?
7. Where do you list or advertise today (Instagram, Kijiji, TiffinStash, Facebook groups)?

## 10. Sources (consolidated)

- CBC, tiffin in the GTA: https://amp.cbc.ca/news/canada/toronto/tiffin-gta-south-asian-food-delivery-1.7080093 (blocked on fetch; used via search summary only)
- CTV/CP, tiffin lunch boxes: https://ctvnews.ca/business/taste-of-home-tiffin-lunch-boxes-bring-comfort-affordability-to-immigrants-1.7063883
- TiffinStash: https://www.tiffinstash.com , https://www.crunchbase.com/organization/tiffinstash
- EventSource: https://www.eventsource.ca/blog/25-beautiful-banquet-halls-that-specialize-in-south-asian-weddings , https://www.eventsource.ca/autaq-banquet-hall , https://www.eventsource.ca/blog/average-catering-cost-for-weddings-in-toronto-the-gta
- Tagvenue Brampton: https://tagvenue.com/ca/hire/wedding-venues/brampton
- Peel: http://peelregion.ca/business/owners-operators/food/ , https://peelregion.ca/services/food-handler-certification
- Ontario Food Premises Regulation: https://www.ontario.ca/laws/regulation/170493/v4 ; York Region home-based: https://york.ca/media/113416/download ; Simcoe Muskoka: https://www.simcoemuskokahealth.org/docs/default-source/HU_Workplaces/home-based-food-business-web.pdf?sfvrsn=4 ; Toronto: https://www.toronto.ca/community-people/health-wellness-care/health-programs-advice/food-safety/food-safety-for-businesses/starting-a-food-business/regulations-and-licensing-requirements/
- CRA small supplier (RC4022): https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html ; CRA travel and convention (catering, service charges): https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-specific-situations/gst-hst-information-travel-convention-industry.html ; Eating establishments P-251: https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/p-251/eating-establishments.html ; gratuity case summary: https://dmainc.com/?p=3470
- Consumer Protection Act, 2002: https://www.ontario.ca/laws/statute/02c30/v25
- Interac e-Transfer: https://www.laurentianbank.ca/en/business/banking-solutions/interac-etransfer , https://www.vancity.com/business/cash-management/interac-e-transfers , https://www.atb.com/business/paying-and-receiving/receive-payments/interac-e-transfer/ , https://hardbacon.ca/en/banking/interac-e-transfers/ , https://vopay.com/learn/interac-e-transfer-security-questions/ , https://vopay.com/learn/interac-e-transfer-fraud , https://www.cbc.ca/1.5296860 , https://www.cibc.com/en/privacy-security/banking-fraud/frauds-and-scams/e-transfers.html
- Stripe PAD: https://docs.stripe.com/payments/acss-debit ; Venn: https://www.venn.ca/resources/how-to-save-on-your-stripe-payments-for-canadian-businesses
- Competitors: https://catering.ezcater.com/en/help/selling-fees , https://gethoneycart.com/ezcater-review-and-a-commission-free-alternative/ , https://www.capterra.ca/software/1011646/httpswwwezcatercom , https://tripleseat.com/?p=2573 , https://hoteltechreport.com/ja/compare/meetingpackage-event-operations-vs-tripleseat , https://www.perfectvenue.com/pricing , https://www.planningpod.com/pricing.cfm , https://www.honeybook.com/pricing

*Limits of this research:* web search returned few GTA price lists, no deposit schedules, no Cater-Cow Canadian pricing, no "Tiffin Wala" product, and CBC and some PDFs could not be fetched. Everything marked (E) must be validated before it appears in marketing copy or default settings.
