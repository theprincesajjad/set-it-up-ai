# Pro value: what a solo pro will pay for, and how we package it

Oct 29, 2026 · For @Sajjad Pirani · CAD unless marked US$ · Follows `solo-pro-launch.md` (packaging v1, economics), `pricing.md` (Pricing v2 and the solo packaging), `people-side.md` (gaps) and `docs/marketing/value-props.md` (the lead message). Product name is a placeholder throughout.

> **Founder decisions, Oct 29, 2026 (final, built in phase "pro value" P1).** Two paid tiers as below: Pro `plus` $29/$290 and Studio `studio` $59/$590. The 14-day Pro trial with no card for every new shop, from the day the booking link goes live. **Founding price replaced:** the first 200 shops on annual Pro pay **$199** for year one (not $190), shown everywhere only as a struck-through price ("~~$290~~ $199 first year"); the words "founding" and "founding member" never appear in the product, and the spots counter stays internal. Config `FIRST_YEAR_PRICE_*`; rules in `pricing.md`. Where this document says "founding $190" below, read this box.

**The founder's brief.** "No one in their right mind signs up for the paid plan." Correct. Today's Pro ($39) sells a home nail tech unlimited calendars (she has one), 500 texts (she uses about eight), POS auto-award (she has no POS), order-ahead and class schedules (not her trade), and four promos. It is a café bundle wearing a beauty name. Nothing in it fills an empty Saturday slot, brings a lapsed client back without her typing, raises her average ticket or gets her a Google review. This document fixes that: a one-person plan at **$29** built from features with a dollar figure next to each, a **Studio** plan for shops with chairs, a 14-day Pro trial with no card, and the in-product moments where she sees the money she is leaving on the table.

**Tags.** (W) read on the web on Oct 29, 2026, source at the end · (W?) third-party, undated, or a vendor with a stake · (C) read from our code · (A) assumption · (H) hand math · (U) could not verify.

**The reference customer** for every dollar figure below: a home-based nail tech, **25 clients a week at $55** ($1,375 a week, about $5,950 a month, about 108 visits a month), roughly 100 regulars on a 3–4 week cycle, no staff, books from Instagram, no deposits (A, matched to `solo-pro-launch.md` §1).

---

## 0. The decision in one page

| | Today | Proposed |
| --- | --- | --- |
| Paid tiers | One: Pro $39/mo, $390/yr | Two: **Pro $29/mo, $290/yr** (one person, up to 2 bookable calendars) and **Studio $59/mo, $590/yr** (unlimited calendars, the walk-in line, payouts, the till-side features) |
| What Pro is for | Unlimited calendars, 500 texts, 4 promos, rebooking nudges, loyalty extras, café features | **Money features for one person:** waitlist that fills cancelled slots, rebooking and win-back that run themselves, Google review requests after every visit, add-ons at booking, a weekly money report with a goal, 4 promos a month, 300 texts, no badge |
| Annual | Pro yearly adds the website | Same, on both tiers: Pro annual $290 and Studio annual $590 include the website on a `.ca` domain |
| Founding | $290 first year of annual Pro, 200 spots | **$190** first year of annual Pro, 200 spots, beauty pros and barbershops, renews at $290 |
| Trial | None | **14 days of Pro, no card**, starts the day the booking link goes live, one per shop |
| Free | 1 calendar, deposits, reminders, 30 texts, clients, stamps, inbox, badge | Unchanged, plus the **counters that show what Pro would have done** ("Saturday was full; 6 people looked and left") |

**Why someone now pays.** At 25 clients a week, one filled cancellation ($55) pays for half the month; one add-on a day pays for it twice over. The plan is priced under every competitor in CAD (GlossGenius US$28 ≈ CA$39, Booksy US$29.99 ≈ CA$42 plus US$20 a chair, Square Plus CA$35 per location, Acuity Standard US$27 ≈ CA$38; W, FX 1.40 A), takes no cut of a client, and, unlike all of them, shows her every Sunday what it made her that week.

**Headline economics.** ARPA falls from $36.40 to about $32.50 a month (H) because Pro is cheaper, but base-case free-to-paid conversion is modelled at **12%** instead of 8% (the trial and the counters), contribution per 1,000 free signups rises from $2,096 to about **$2,670** a month (+27%), CAC per payer falls from $250 to about **$170** on the blended channel mix, and LTV:CAC moves from 3.0 to about **4.4** (§4). The company's break-even on this wedge moves from month 15 to about month 12 at 250 signups a month.

---

## 1. Research: what solo beauty pros and barbers actually pay for

### 1.1 Competitor tiers, and what sits behind the upgrade

All prices as shown on the vendor page or a third-party guide on Oct 29, 2026. Currency as stated; most vendors do not publish a Canadian page.

| Product | Entry paid | Next tier | What the upgrade or add-on buys | Tag |
| --- | --- | --- | --- | --- |
| **GlossGenius** | Standard US$24/mo annual (US$28 monthly), 2 users | Gold US$48/US$56, up to 9 users; Platinum US$148/US$168 | Team seats first; forms, extra text credits and multi-user are where "most businesses pay more" (Pabau). Home page leads with AI agents that get "more clients, bigger tickets, and more repeat visits" (`value-props.md` §1.2). No free plan, 14-day trial | (W) Koalendar, Pabau, Capterra |
| **Fresha** | Independent US$19.95/mo (one bookable member); Team US$14.95 per member | Add-ons, not tiers | Named add-ons with monthly prices: **Google Rating Boost US$14.95**, **Insights US$9.95**, Team Connect US$2.95 per member, Client Loyalty US$59.95, AI Concierge US$99.95 per location (200 minutes and 500 messages included), Data Connector US$295. Marketing texts pay per message (about US$0.02 a blast text, US$0.08 marketing text). Marketplace takes 20% of a new client's first visit, US$6 minimum | (W) PricingSaaS 2026 Q2 diff; (W?) Toolradar, CostBench |
| **Booksy** | US$29.99/mo one user, 14-day trial | US$20 per extra staff member | No-show protection (card on file, a percentage up front, a cancel deadline, auto or manual charge, a waive option) and a waitlist for filling cancellations are inside the plan; automatic review request after each visit (cancelled if the client is marked no-show within 30 minutes); message blasts; Boost takes 30% of a new client's first visit | (W) biz.booksy.com no-show page and reviews blog; (W?) Koalendar, SoftwareOne listing |
| **Vagaro** | US$30/mo one calendar (promo US$24), +US$10 per calendar | Add-ons | **Forms US$10**, **text marketing from US$20**, website builder US$10, check-in app US$10, QuickBooks sync US$20, branded app; reviewers say add-ons "increase the pricing exponentially" | (W?) Koalendar, StyleSeat comparison, SchedulingKit, Pabau |
| **Square Appointments (Canada)** | Free, one location, no staff limit | **Plus CA$35** per location; Premium CA$85 | Plus adds **no-show protection** (card at booking or prepay), cancellation policies, and (UK and AU pages) a **waitlist**; Premium adds resource management. Free has reminders and a booking site but no no-show tools | (W) squareup.com/ca features and FAQ 6238; UK and AU waitlist pages |
| **Boulevard** | About US$176/mo per location (Essentials) | Premier about US$293, Prestige about US$410 | Premier: marketing automation, analytics; Prestige: forms and charts, 2,500 texts and 10,000 emails a month, a success manager. Add-ons: Forms and Charts about US$55, Contact Center about US$25; onboarding about US$495. A salon product, not a solo product | (W) Capterra; (W?) Pabau, CostBench, Dupple (figures disagree) |
| **Squire** | Independent US$30/mo | Pro US$50, Executive US$150, Titan US$250; add-ons: branded landing pages US$25, "Operator" AI assistant US$99 | Higher tiers add commission management, loyalty, a waitlist and multi-location; recurring appointments and payroll are the barbershop pull | (W) PricingSaaS; (W?) GetApp, Capterra (entry price disagrees) |
| **Acuity** | Starter US$16/mo annual (US$20 monthly), one calendar | **Standard US$27/US$34** (6 calendars) adds **text reminders, packages, gift certificates, memberships, subscriptions**; Premium US$49/US$61 removes "Powered by", adds API, CSS, HIPAA | The clearest ladder in the set: the second tier is "recurring money" (packages, gift certificates, memberships) and texts | (W) Koalendar, Capterra, Thewearify; 7-day trial, no free plan |
| **Linktree** | Free with branding | Pro about US$9–15/mo (sources disagree); Premium above | "Powered by" removal, analytics (clicks by link, geography, referrers), scheduling, custom themes; selling and custom domains higher up; Pro and Premium carry a 7-day trial | (W?) U2L, UniLink (competitor blogs; verify on linktr.ee) |
| **Shopify** | Basic | Shopify, Advanced | The trigger Shopify itself gives: upgrade when the transaction-fee saving exceeds the price difference; more staff accounts; professional reports and abandoned-cart recovery | (W?) GrowthSuite, Praella, community thread |

**What this says.**

1. **Across the set, the second tier is "money that runs itself":** no-show protection and a waitlist (Square Plus, Booksy), review requests (Fresha sells it alone for US$14.95), packages, gift certificates and memberships (Acuity Standard), forms (Vagaro US$10, GlossGenius, Boulevard), and insights (Fresha US$9.95). Nobody upgrades for "unlimited calendars" alone; seats are the Studio story.
2. **Everyone charges for texts or seats on top.** Fresha per message, Vagaro US$20 for text marketing, Booksy and Vagaro per staff member. A flat CAD price that includes the texts a solo actually uses is a clean sentence.
3. **"Bigger tickets" and "more repeat visits" are the words the market leader uses** (GlossGenius home page). The features behind them are add-ons at booking, rebooking prompts and win-back, which we can build cheaply because the calendar, the consent model and the automations engine exist (C).
4. **Shopify's rule is the one to copy for the trial-end and the upgrade moments:** show the owner the number that exceeds the price. "You'd have filled 3 cancelled slots this month ($165). Pro is $29."
5. **Linktree's lesson** is that branding removal and analytics are enough to make creators pay US$9–15. We already remove the badge on paid plans and have the Today chips; the weekly report with a goal is our "analytics" and costs us a job and an email.

### 1.2 The evidence behind each candidate feature

| Feature | What the evidence says | Strength | Our verdict |
| --- | --- | --- | --- |
| **Waitlist that fills cancelled slots** | Salon no-show rate about 20% without reminders, cited everywhere to a Salon Today report nobody can find (W?, SchedulingKit, TRTC); Zenoti's 2026 benchmark puts spa no-shows at 1–4% (W?, vendor). A vendor claims about US$1,800 a month "recovered through waitlist management" with no method (W?). A Salon Geek thread says ad hoc methods fill cancellations 10–15% of the time (W?, forum). Square (Plus), Booksy and Squire all sell it | Pain strong, fill rate unproven | **Build.** The most visible "money" feature in the calendar. We model a 30% fill rate (A) and show the real number in the weekly report |
| **Rebooking reminders ("time for your fill")** | Average rebooking rate 40–45% (Whito, W?); Aimy claims 30% more repeat bookings from automated prompts (W?, vendor case); SchedulingKit claims 40% (W?, unsourced). Shipped on Pro today by text and push with a due list (C, `rebooking.ts`), but no email rung, no "book again" link that already knows the service, no result count | Pain strong, lift vendor-claimed | **Finish and headline it.** Add email and web push, a prefilled "book again" link, an automatic mode, and "N rebooked from reminders" in the report |
| **Win-back for lapsed clients** | Retention "around 30–35% for two decades" (W?). Exists on Pro as `win_back` with loyalty wording ("you have {{balance}} points") (C) | Real, generic | **Fold into rebooking** with appointment wording ("it's been 6 weeks since your last set") |
| **Review requests to Google** | Each 10 new reviews correlates with +2.8% conversion; owner replies correlate with +16% (W?, WiserNotify roundup); review-request workflows raise review volume up to 67% (W?, vendor citing BrightLocal, unverified). Fresha sells it for US$14.95 a month; Booksy includes it (W). Our engine exists for restaurants with the Google-policy-safe design (same ask for every rating) (C, `reviews.ts`) | Medium, well-supported direction | **Build (small).** Generalise the restaurant engine to completed appointments |
| **Gift cards** | 45% of gift cards sold through Square's Canadian merchants were unused at the time of the report (W, CTV); general breakage 6–19% (W?, NCFA); Ontario's no-expiry rule has an exception for a certificate for a specific service (W?, verify). Acuity sells gift certificates on its second tier | Seasonal, real cash | **Later (L).** Liability, redemption at checkout and Stripe handling make it a quarter's work; miss this holiday, aim for Mother's Day |
| **Packages and memberships** | Acuity Standard's upgrade hook; our class packs and memberships exist for studios (C) | Medium for solos ("5 fills, pay 4") | **Later (M).** The stamp card already does "buy N get one" free; prepaid packs come after gift cards share the same ledger |
| **Add-ons at booking** | "Bigger tickets" is GlossGenius's lead claim (W). No independent attach-rate figure for nails (U); nail art, removal, French tip, a brow tint on a lamination are the add-ons every tech lists by hand in her DMs (A) | Medium, intuitive | **Build.** Cheapest ticket lift we can offer; nothing in our booking flow does it today (C) |
| **Card on file and no-show fees** | Square gates it on Plus (CA$35); Booksy includes it. We have it on Free with a 1% fee (C) | Table stakes | **Keep free.** It earns us 1% and it is a signup reason, not an upgrade reason |
| **Client forms and consent** | Vagaro US$10, GlossGenius and Boulevard on higher tiers (W?). Our one-question intake per service is free (C) | Medium for lash and brow techs | **Later (M).** A reusable form with a signature is a Studio feature for salons; the one question covers the solo |
| **Weekly money and performance insights with goals** | Fresha sells Insights at US$9.95 (W); Linktree's analytics are its Pro reason (W?). Our Today page compares today to a usual day and Reports have the heatmap and retention (C), but nothing arrives in her hand on Sunday and nothing says "ahead of last week" | Medium alone, high as the receipt for everything else | **Build.** It is how she learns the plan paid for itself, which is the churn lever |
| **"Best time to promote" suggestion** | Heatmap report exists (C). No external evidence on lift (U) | Low alone | **One line inside the weekly report and the promo picker** ("Tuesdays run 40% under your average; send a Tuesday promo") |
| **Instagram auto-sync** | Needs Meta App Review either way (`solo-pro-launch.md` §6) | Blocked | **Later**, unchanged |
| **Custom domain and branded app** | Vagaro and Squire sell branded pages (W?). Our site on a `.ca` domain is on annual (C) | Medium, annual lever | **Keep as the annual reason.** No branded app: the cost is out of proportion for a solo |
| **Removing the badge** | Linktree's simplest upgrade reason (W?) | Low alone | **Already on paid** (`showsPoweredBy`, C). List it, do not lead with it |
| **Featured map placement** | Phase 3 network ads (C, `ads.map_pin`) | Conflicts with "we never rank pros by anything paid" (`solo-pro-launch.md` §7.5) | **Not for the Pro plan.** Stays a per-campaign network product |
| **Multi-staff seats** | Booksy US$20 a seat, Vagaro US$10 a calendar, GlossGenius tiers by seats (W) | High for shops, zero for solos | **The Studio tier** |
| **Payouts and tax reporting** | Squire's barbershop pull (payroll, commission) (W?). Our payouts report exists (C) | Medium for shops | **Studio**, plus a small year-end income summary export on Pro later (S) |
| **AI helpers** | GlossGenius leads with AI agents; Fresha AI Concierge US$99.95; Squire Operator US$99 (W). These are salon-scale phone and chat agents | Low for a solo | **Later (S):** a "write it for me" button on the promo and the site, using `site-ai.ts`. Not a headline |

---

## 2. Packaging

### 2.1 Two paid tiers, and why

One tier at $39 forces the solo tech to pay for the shop's features and the shop to get the solo's price. Two tiers let the solo price fall to $29 without discounting a four-chair barbershop, which still pays about half of Booksy (US$29.99 + 3 × US$20 ≈ CA$126 a month, W, FX A).

**Why $29 and not $19.** Pricing v2 found $29 marginal once support time was counted for storefront loyalty shops (`strategy-audit-2.md` §5.2). For a solo on push-first reminders the variable cost is under $2 a month (§4.1), so $29 contributes about $22 after 15 minutes of support. $19 would contribute $12 and would need 80% more payers to reach the same cash; nothing in the research says solo pros convert twice as often at $19 (Fresha at US$19.95 is the cheapest in the set and the most complained about on fees). $29 also reads as "less than one fill a month".

**Why $59 for Studio and not $49 or $79.** A two- or three-chair shop compares us to Booksy (CA$70–98 at two or three chairs, H) and Square Plus (CA$35 but per location with no walk-in line or payouts). $59 flat for any number of chairs is under both at two chairs and far under at four. $79 reopens "per-chair is cheaper for me" at two chairs.

### 2.2 The plans

Prices in CAD, before HST. Plan ids: `free`, `plus` (shown as **Pro**), new `studio` (shown as **Studio**), `pro` (shown as **Service**, $99, unchanged, now includes Studio). Restaurant tiers unchanged and still map to at least `plus`.

| | **Free** | **Pro · $29/mo · $290/yr** | **Studio · $59/mo · $590/yr** |
| --- | --- | --- | --- |
| Who | Starting out, or fewer than about 15 clients a week | One person, or one person and an apprentice | A shop with chairs, renters, a walk-in line or a till |
| Bookable calendars | 1 | **2** | Unlimited, no per-chair charge |
| Booking link, services, deposits and card on file (1%), reminders by push, web push, in-app and email | Yes | Yes | Yes |
| Reminder and reply texts | 30 a month, then email | **300** a month, then 4¢ | 1,000 a month, then 4¢ |
| Client profiles, visit timeline, notes, intake question, 1:1 thread, inbox | Yes | Yes | Yes |
| Loyalty stamp card, wallet pass, network listing, Today, basic reports | Yes | Yes | Yes |
| **Waitlist that fills cancelled slots** | Clients can ask; you see the list; nobody is told automatically | **Automatic:** the first match is offered the slot by their best channel with a 2-hour hold | Same |
| **Rebooking and win-back that run themselves** | You see who is due | **Automatic**, by push, email and text, with a "book again" link that already knows the service | Same |
| **Google review request after every visit** | No | **Yes**, two hours after checkout, by their best channel | Same |
| **Add-ons at booking** (nail art, removal, French tip) | No | **Yes** | Same |
| **Weekly money report** (Sunday, push and email) with a goal and "best day to promote" | No | **Yes** | Same, per staff member |
| Promos to regulars with seasonal templates | No | **4 a month** (48 a year on annual) | 8 a month |
| VIP levels, birthday reward, referrals, email campaigns, CSV export and import | No | Yes | Yes |
| Advanced reports (retention, cohorts, network overlap) | No | Yes | Yes |
| "Powered by" badge on booking and shop pages | Shown | Removed | Removed |
| Website on your own `.ca` domain, AI copy, hosting | No | **Annual only** | **Annual only** |
| Walk-in line, payouts and chair rent, per-staff booking links, staff "theirs" filter | No | No | **Yes** |
| Order-ahead, pickup slots, POS auto-award, webhooks and API, daycare and grocer counter tools | No | No | **Yes** |
| Pet profiles and groom rebooking, auto service reminders, classes and memberships | No | Yes (a solo groomer, a mobile detailer, a one-room studio) | Yes |
| Support | Help centre and assistant | Email, 1 business day | Email, same day |

Founder decisions folded in: no per-chair charge (Studio is flat), no cut of a client, loyalty free forever, deposits optional and free, the `FREE_FOREVER` invariant untouched. **One founder decision is new:** cafés and grocers that today buy the $39 plan for order-ahead and POS auto-award will be asked for Studio at $59 or get Pro at $29 without those features. The default here moves the till-side features to Studio because they imply a shop, not a person; the alternative (leave them on Pro at $29) is one line in `plans.ts` and costs margin on the storefront segment that Pricing v2 already found thin.

**Annual discount:** two months free (Pro $290, Studio $590), and the website. **Founding offer:** the first 200 beauty pros and barbershops on annual Pro pay **$190** in year one (`FOUNDING_SOLO.priceCents = 19000`), renew at $290; Studio has no founding price (shops convert on the walk-in line, not on price).

**The trial.** Fourteen days of Pro, free, no card, for every shop, starting the day the booking link goes live (`booking_link_live` milestone), not at signup, so the two weeks cover real bookings. One per shop; texts capped at 100 during the trial. The trial is a flag (`merchants.trial_plan`, `trial_ends_at`) that `effectivePlan` treats as `plus`; no Stripe object is created, so there is nothing to cancel. When it ends: automations pause, the waitlist stays visible but stops offering, add-ons stay configured but leave the booking page, the badge returns, nothing is deleted, and the Sunday report comes one last time as the receipt (§5.4).

### 2.3 The line on Free

Free must keep bringing signups (`value-props.md`: the booking link with no cut of the clients is the signup reason) and must cost under a dollar a month (`solo-pro-launch.md` §4.2). The caps are the ones a tech outgrows by getting busier, never ones that hold her clients hostage:

| Stays free | Why |
| --- | --- |
| The booking link, one calendar, deposits and card on file, reminders, the client list with history and notes, export of the client list, the inbox, stamps, the shop page | "Your clients stay yours" is the lead message; gating any of it contradicts it |
| Seeing the waitlist, seeing who is due, seeing the week's numbers on Today | Seeing is free; **acting automatically is paid.** This is what makes the counters honest: Free shows "6 people asked for Saturday", Pro calls them |
| **Binds as she gets busier** | 1 calendar (she hires an apprentice), 30 texts (phone-booked clients), cancellations she now has to chase by hand, reviews she forgets to ask for, the badge on a page she is proud of |

### 2.4 Value per paid feature for the reference tech (25 clients a week at $55)

All (H) on stated (A); the weekly report replaces these estimates with her real numbers.

| Feature | Assumption | Dollars a month | Hours a month | Confidence |
| --- | --- | --- | --- | --- |
| Waitlist fills cancelled slots | 10 late cancellations or no-shows a month (about 9% of 108 visits); 30% filled from the list | **$165** | 4 (no more "who wants 2 pm Saturday?" story and DM chase) | Medium: fill rate is the unknown |
| Rebooking reminders, automatic | 100 regulars; reminders add 4 visits a month that would have slipped a cycle or lapsed (a 4% lift on 108 visits, well under the 30% vendors claim) | **$220** | 4 (a weekly "it's been 3 weeks" DM round) | Medium |
| Win-back | 2 lapsed clients a month come back | **$110** | 1 | Medium-low |
| Add-ons at booking | 20% of visits add a $10 item | **$216** | 0 | Medium-low: attach rate unmeasured |
| Google review requests | 5 new reviews a month; one extra new client a month from search, worth $55 now and a 4-visit year | **$55 now**, about $220 a year per client won | 2 (asking by hand) | Low-medium |
| Promos to regulars (exists) | One of four promos brings 6 bookings; half incremental | **$165** | 1 | Medium |
| Weekly money report and goal | No direct dollars; the reason she keeps paying | 0 | 1 (no spreadsheet Sunday) | n/a |
| 300 texts, no badge, 2 calendars | Plan hygiene | 0 | 0 | n/a |
| **Total** | | **about $930 a month** against $29 | **about 13 hours** | Even at a quarter of this, $230 against $29 |

For a four-chair barbershop on Studio ($59): Booksy would cost about CA$126 (W, H); the walk-in line, flat pricing and payouts are the reasons (`docs/research/barbers-beauty.md`); the waitlist, reviews and add-ons (beard trim, hot towel) stack on top of that per chair.

### 2.5 Candid: table stakes versus where we win

| | Table stakes (they have it; we must too) | Where we win |
| --- | --- | --- |
| Waitlist | Square Plus, Booksy, Squire | Free shops **see** the list; the fill count is in her Sunday report |
| Review requests | Booksy (included), Fresha (US$14.95) | Included at $29; policy-safe by design; one engine for the shop page, the site and the report |
| Rebooking and win-back | Everyone claims it | A "book again" link that already knows the service, by app, web push and email with no per-message fee, and "N came back" counted |
| Add-ons | Everyone | Nothing special; we are catching up |
| Weekly report with a goal | Fresha Insights (paid), Linktree Pro analytics | **Ours is the receipt**: it names what each paid feature made her this week. Nobody in the set ties the plan price to the dollars it produced |
| Price and currency | Nobody prices in CAD except Square | $29 flat in CAD, texts included, no cut of a client, no per-chair charge on Studio |
| Website | GlossGenius booking site, Vagaro add-on, Squire US$25 pages | Built from her bookings, prices, reviews and loyalty, included on annual |
| The network | None of them have a shared pass across shops | Her clients' one app for every local spot (`solo-pro-launch.md` §7); it is why the push channel is free |

We do not win on any single feature. We win on **price, currency, the bundle, and showing the money**.

---

## 3. What to build now, and later

### 3.1 The inventory

| Feature | Exists | Partial | New | Effort | Revenue impact | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Packaging: Pro $29, Studio $59, 2 calendars on Pro, trial flag, founding $190 | plans.ts constants, founding coupon, calendar cap, annual entitlement (C) | | Studio plan id, trial, text caps 300/1,000 | **M** | Enables everything | **Now (P1)** |
| Waitlist for appointments | Class and pre-order waitlists (C) | | Appointment waitlist table, join from a full day, offer on cancel with a hold, owner list | **M** | High, visible | **Now (P2)** |
| Rebooking and win-back, automatic | `rebooking.ts` (text and push, due list, rules), `win_back` automation (C) | Email and web push rungs, auto mode, prefilled book-again link, result count, appointment wording | | **S–M** | High | **Now (P3)** |
| Review requests after visits | `reviews.ts` engine, token page, consent ladder (C, restaurants) | Trigger on completed appointments, Google link setting, settings card | | **S** | Medium | **Now (P4)** |
| Add-ons at booking | `appointments.items` jsonb, services table (C) | | Add-on services, mapping, booking step, checkout and reports | **M** | High | **Now (P5)** |
| Weekly money report, goal, best day, upgrade counters | Today chips, Reports heatmap and retention (C) | | Job, email and push, goal setting, counters for Free, trial-end summary | **M** | Retention and conversion | **Now (P6)** |
| Upgrade moments and copy | `FeatureTeaser`, `PlanLine`, gate cards (C) | New copy and placements | | **S** (across P1–P6) | Conversion | **Now** |
| Gift cards | Category only (C) | | Ledger, Stripe, redemption, Ontario rules | **L** | Seasonal cash | Later (Q1 2027) |
| Prepaid packages | Class packs (C) | Generalise to services | | **M** | Medium | Later |
| Client forms with signature | Intake question (C) | | Forms builder, signature, storage | **M** | Medium (Studio) | Later |
| AI "write it for me" on promos and replies | `site-ai.ts`, `llm.ts` (C) | | Two buttons | **S** | Low | Later |
| Year-end income summary export | Payouts report (C) | | One CSV | **S** | Low | Later |
| Instagram sync | Stub (C) | | Meta review | **L** | Medium | Later, gated |
| Gift of a branded app, featured map placement | | | | | | No |

### 3.2 Specs for the five features and the packaging

The build plan with file ownership, workstream tags and acceptance criteria is `scratchpad/pro/plan.md`. The product specs here are the source it executes.

#### P1 · Packaging, Studio and the trial

- **Data.** `PLAN_IDS = ["free", "plus", "studio", "pro"]`, `PLAN_RANK` 0–3; `PLANS.plus` = Pro $29/$290, `PLANS.studio` = Studio $59/$590, `PLANS.pro` = Service $99 unchanged; `smsPerMonth` 30/300/1,000/1,500. `bookableCalendarLimit`: free 1, plus 2, studio and above null. `PROMOS_PER_MONTH_PLUS = 4`, `PROMOS_PER_MONTH_STUDIO = 8`, annual 48/96. `FOUNDING_SOLO.priceCents = 19000`. New `TRIAL_DAYS = 14`, `TRIAL_SMS_CAP = 100`. Migration: `merchants.trial_plan text null`, `trial_started_at`, `trial_ends_at`, `trial_used boolean default false`. Feature keys: new `booking.waitlist`, `booking.review_requests`, `booking.add_ons`, `insights.weekly` on `plus`; `booking.walkin_queue`, `staff.payouts`, `orders.order_ahead`, `orders.pickup_status`, `booking.pickup_slots`, `integrations.pos_auto_award`, `integrations.webhooks`, `pets.daycare`, `grocery.*` move to `studio` (founder may veto the till-side moves; the table in §2.2 is the default).
- **API.** `effectivePlan(plan, restaurantTier, trial?)` returns `plus` while `trial_ends_at` is in the future; `POST /v1/merchants/:id/billing/trial` starts it (idempotent; refused after `trial_used`); the onboarding milestone `booking_link_live` calls it for shops in `SOLO_VERTICALS` and every other vertical too (the trial is for everyone); a daily job ends expired trials, writes the `trial_ended` milestone and queues the receipt (P6). Stripe prices for Studio monthly and annual (`priceIds.studioMonthly`, `studioAnnual`). `GET /billing/usage` adds `trial: { endsAt, daysLeft } | null`.
- **Owner UI.** Pricing page: three cards Free, Pro, Studio with Service as a line under, the founding strip at $190, "14 days of Pro free, no card" under the Pro card. Billing page: the trial banner with days left and the one-tap annual and monthly buttons; after the trial, "Pro ended Thursday" with the receipt numbers. Phone: cards stack; the comparison table scrolls horizontally with sticky first column (as today).
- **Client UI.** None.
- **Tests.** `plans.test.ts`: `FREE_FOREVER` unchanged; `featureOffer` for each moved key names Studio and $59; `bookableCalendarLimit` 1/2/null; `promoAllowance` for studio; trial makes `isFeatureEnabled("booking.waitlist")` true and false after `trial_ends_at`. API: starting a trial twice is refused; a trial shop's 101st text falls back to email; pricing e2e at 390 and 1440.
- **Accept.** A new nail tech whose link goes live gets Pro for 14 days with no card, sees the waitlist, reviews and add-ons, and lands on Free with her data intact when it ends; a second bookable calendar is allowed on Pro and a third is refused with the Studio offer.

#### P2 · Waitlist that fills cancelled slots

- **Data.** Table `appointment_waitlist`: `id, merchant_id, location_id, user_id (nullable for a named walk-in), customer_name, customer_phone, customer_email, service_id, staff_id (nullable = any), window_start (date), window_end (date), time_pref ("any" | "morning" | "afternoon" | "evening"), status ("waiting" | "offered" | "booked" | "expired" | "removed"), offered_appointment_hold_id, offered_at, offer_expires_at, source ("online" | "staff"), created_at`. Index on `(merchant_id, status, window_start)`. Reuse the existing 10-minute hold mechanism (`holdExpiresAt`, C) for the 2-hour offer hold.
- **API.** Public: `POST /v1/public/shops/:slug/waitlist` (from a full day on the booking page; requires name and one of phone or email; CASL transactional, no marketing consent needed for the offer itself); `GET /v1/me/waitlist`, `DELETE /v1/me/waitlist/:id`. Owner: `GET /v1/merchants/:id/waitlist`, `POST .../waitlist` (add a client by hand), `POST .../waitlist/:id/offer` (offer a specific open slot now), `DELETE`. Engine: on `cancelMine`, staff cancel, or a no-show mark that frees a slot, `matchWaitlist(slot)` finds the oldest `waiting` entry whose service fits the freed duration, staff and window; on Pro or trial it creates a hold on the slot and notifies by the best channel (app push → web push → email → text inside the cap) with a one-tap "Take it" link; if the hold lapses, the next entry is offered; at most 3 offers per freed slot. On Free, no offer is sent: the owner sees "4 people asked for Saturday" and a locked "Offer the slot" button. Counter: `merchants.waitlist_fills_count` and `cancellations_count` per month for the report and the teasers (P6 owns the counters table; P2 writes the events).
- **Owner UI (desktop and phone).** Calendar: a cancelled slot shows a chip "Offered to Ayesha · 1 h 40 left" or on Free "4 waiting · On Pro they'd be offered this slot". A **Waitlist** page under Bookings: rows Name · Wants · When · Asked · Status, with "Offer a slot" opening the next free matching slots. The appointment sheet's cancel confirm says "Offer this slot to the waitlist (3 waiting)" with the switch on by default on Pro.
- **Client UI.** Booking page (`BookFlow`): a day with no openings shows "Full. Tell me if a spot opens" → a sheet with time preference and the window ("this week", "next 2 weeks") → "You're on the list. We'll message you if a spot opens." Offer message: "A spot opened at Priya Nails: Sat Nov 8, 2:00 pm, Gel fill. It's yours for 2 hours: [Take it]". The app's My appointments and the web pass show "Waiting for a spot" entries with Remove.
- **Tests.** Unit: matching by duration, staff, window and preference; offer order and the 3-offer cap; hold expiry hands to the next. API: cancel → offer → take within the hold books it and expires the others; take after expiry returns 410 with "That spot was taken"; Free shop records the entry and sends nothing. E2e: full day → join → owner cancels → client takes it, at 390 and 1440.
- **Accept.** A cancellation on a Pro shop with a matching waiting client produces an offer within one job tick (≤ 60 s), the client books it in one tap, the calendar shows the new booking, and the weekly report counts one fill. Reminder texts stay inside the plan's cap.

#### P3 · Regulars come back: rebooking and win-back, automatic

- **Data.** `services.rebookAfterDays` and `rebooking_nudges` exist (C). Add `merchants.rebooking_mode` ("off" | "review" | "auto", default "review" on Free, "auto" when the trial starts), `rebooking_nudges.channel` gains `email` and `web_push`, and `rebooking_nudges.booked_appointment_id` to count results. Win-back: the `win_back` automation gets an `appointment` body variant ("Hi Ayesha, it's been 6 weeks since your last set at Priya Nails. Your usual Saturday times are open: [book again]") chosen when the shop has `booking.appointments` with services.
- **API.** `rebookingCandidates` adds email and web push rungs through `notifications.ts`'s ladder (C); `sendDueNudges` runs daily in `auto` mode on Pro, Studio and trial, inside quiet hours and the text cap; the nudge's link is `/shops/<slug>/book?service=<id>&staff=<id>&rebook=<nudgeId>` (the deep link exists, C) and the booking writes `booked_appointment_id`. `GET /v1/merchants/:id/rebooking/results` returns sent, booked and revenue (sum of booked items) for the week and the month.
- **Owner UI.** Rebooking page: a mode switch "Remind them for me" (locked on Free with the plan line), the due list as today, and a results strip "This month: 31 reminded · 9 rebooked · $495". Customers page: the "Due for a visit" segment (exists, C) carries the same locked switch on Free. Service editor: the rebook interval shows a sentence "Clients are reminded 3 days before they're due".
- **Client UI.** Push, web push, email and text templates (≤ 160 GSM, STOP line); the booking page opens prefilled on the service and the stylist with "Welcome back, Ayesha".
- **Tests.** Unit: channel ladder picks email for a client with no app or pass; a client with STOP drops out; at most two unanswered nudges. API: auto mode sends on Pro and not on Free; the deep link's booking is attributed. E2e: results strip renders the numbers.
- **Accept.** With `auto` on, a client due today with only an email gets the email with a working book-again link; her booking shows under "rebooked" within the hour.

#### P4 · Google review request after every visit

- **Data.** `review_requests` exists with `orderId` reused for any completed thing (C). Add `merchants.google_review_url` (the shop's "write a review" link; the settings card explains how to copy it from Google Business Profile) and `merchants.review_requests_mode` ("off" | "on", default "on" when Pro or trial starts).
- **API.** `scheduleReviewRequest` accepts `kind: "appointment"` and is called when an appointment reaches `completed` (checkout or the status button); the same 2-hour delay, 14-day re-ask window and consent ladder; the public page `/r/<token>` keeps the policy-safe two options (private note, public Google review) at equal weight for every rating; a 1–3 rating notifies the owner in the inbox thread. Counter: `reviews_requested`, `reviews_clicked_google` per month for the report. Feature key `booking.review_requests` (plus).
- **Owner UI.** Settings → Reviews: the Google link field, the mode switch, "Last 30 days: 41 asked · 7 went to Google · 2 private notes". After a checkout on Free, one quiet line under the success state: "Ask Ayesha for a Google review? On Pro this goes out by itself two hours after every visit. [See Pro]".
- **Client UI.** The review message ("How was your visit to Priya Nails? Two taps: [1–5]") by their best channel; the page as today, restyled in the shop's trade colour.
- **Tests.** Unit: a completed appointment schedules once; a no-show never does; the re-ask window holds across an order and an appointment at the same shop. API: Free shop schedules nothing; Pro shop's request sends after the delay in the test clock. E2e: the settings card saves the link and the page renders both options.
- **Accept.** A Pro shop's completed visit produces a request two hours later by the client's best channel, the Google button opens the saved link, and the report counts it.

#### P5 · Add-ons at booking

- **Data.** `services.kind` gains `add_on` (column exists, C); new table `service_add_ons (merchant_id, service_id, add_on_id, sort)` so an add-on attaches to specific services or, with no rows, to all. Add-ons carry `priceCents`, `durationMin` (added to the appointment length) and `active`. `appointments.items` (jsonb, C) already holds several items; add-ons are items with `kind: "add_on"`.
- **API.** Public booking payload accepts `addOnIds[]` after the service step; availability computes the slot length as service + add-ons + buffer; deposit rules use the base service's deposit; checkout totals and tips include add-ons; `reports.overview` adds average ticket and add-on attach rate. Owner CRUD lives inside the existing services routes. Feature key `booking.add_ons` (plus): on Free, add-ons can be created and are shown with the plan line, but the booking page does not offer them.
- **Owner UI.** Services page: a second section "Add-ons" with name, price, extra minutes, "Offered with: All services / Pick"; the appointment sheet lists add-ons under the service with the total. Phone: the same list, add-on rows as chips.
- **Client UI.** Booking flow: after picking the service, "Add anything?" with the add-ons as toggles showing "+$10 · +15 min"; the summary and confirmation list them; the client's My appointments shows them.
- **Tests.** Unit: duration and price math; add-on restricted to a service does not show on another. API: a booking with two add-ons blocks the right length and charges the right checkout total. E2e: book with an add-on at 390.
- **Accept.** A Pro shop lists "Nail art +$10 +15 min"; a client books a fill with it; the calendar blocks 75 minutes and checkout shows $65; the report's average ticket moves.

#### P6 · Weekly money report, goal, best day, and the counters behind the upgrade moments

- **Data.** `merchants.weekly_goal_cents` (nullable), `merchants.weekly_report_at` (local weekday and hour, default Sunday 18:00), new table `merchant_signals (merchant_id, period_start date, key text, count int, amount_cents int)` with keys `cancellations`, `waitlist_asks`, `waitlist_fills`, `full_day_views`, `rebook_due`, `rebook_sent`, `rebook_booked`, `reviews_requested`, `reviews_google`, `addons_sold`, `promo_bookings`; written by P2–P5 through one helper `recordSignal(ctx, merchantId, key, {count, amountCents})` that P6 publishes on day one. `full_day_views` is written by the public availability endpoint when a client views a day with zero openings (no personal data).
- **API.** `GET /v1/merchants/:id/insights/week?start=` returns booked revenue, visits, new clients, the delta against the previous week and the 4-week average, each signal, the goal and progress, and the quietest weekday of the last 8 weeks from the heatmap (C) as `bestDayToPromote`. Job `weeklyReport` runs at the shop's hour: on Pro, Studio and trial it sends a push and an email ("Your week at Priya Nails: $1,480 booked, $240 ahead of last week"); on Free it sends nothing. The trial-end job (P1) calls the same builder for the 14-day receipt.
- **Owner UI.** Today: a "This week" tile under the greeting with revenue, the delta, goal progress as a thin bar, and one line ("3 cancelled slots filled · 9 rebooked · 7 reviews asked"); on Free the tile shows the delta and locked lines ("4 cancellations. Pro would have offered them to your waitlist."). Reports → Week: the same numbers over 12 weeks. Settings: the goal and the report hour. Phone: the tile is the second card on Today; the email is a single column.
- **Client UI.** None.
- **Tests.** Unit: week boundaries in the shop's timezone; the delta against a week with zero; `bestDayToPromote` ignores closed days. API: the report builder returns the signals written by a seeded cancel-and-fill; Free gets no send. E2e: Today tile on Free and Pro at 390.
- **Accept.** A Pro shop gets the Sunday push and email with the right totals; a Free shop's Today tile shows the locked lines with real counts from its own week.

---

## 4. Unit economics, updated

### 4.1 Per-account cost (unchanged items from `solo-pro-launch.md` §4.1, new items marked)

| Item | Monthly | Note |
| --- | --- | --- |
| Hosting, DB, monitoring | $0.60 | |
| App push, web push, in-app | $0 | |
| Email: reminders, rebooking, reviews, the weekly report | 220 × $0.0006 = $0.13 | New: about 60 more emails a month per paying shop |
| Texts on Pro: reminders 20% of 110 bookings, 10 rebooking texts, 8 review texts, 3 waitlist offers | 43 × $0.025 = **$1.08** | Cap 300 = $7.50 |
| Promos 4 × 100 regulars by push and email | $0.24 | |
| Stripe Billing on $29 (2.9% + $0.30 + 0.7%) | $1.34 | On $59: $2.42 |
| Domain and routing, annual only | $1.23 | |
| Site AI, annual only | $0.22 | |
| Support, 15 min at $25 an hour | $6.25 | Founder time at launch |

### 4.2 Contribution per plan

| Plan | Revenue a month | Stripe | Variable | Site | Support | **Contribution** | Before support |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pro monthly $29 | 29.00 | 1.34 | 2.05 | | 6.25 | **$19.36** (67%) | $25.61 |
| Pro annual $290 | 24.17 | 1.17 | 2.05 | 1.45 | 6.25 | **$13.25** (55%) | $19.50 |
| Pro annual founding $190 | 15.83 | 0.84 | 2.05 | 1.45 | 6.25 | **$5.24** (year one only) | $11.49 |
| Studio monthly $59 | 59.00 | 2.42 | 4.10 | | 9.00 | **$43.48** (74%) | $52.48 |
| Studio annual $590 | 49.17 | 2.07 | 4.10 | 1.45 | 9.00 | **$32.55** (66%) | $41.55 |
| Old Pro monthly $39 (for reference) | 39.00 | 1.70 | 1.86 | | 6.25 | $29.19 | |

**Mix (A):** payers are 80% Pro and 20% Studio; within each, 60% monthly and 40% annual; the first 200 annual Pro payers are founding. **Blended ARPA ≈ $32.50** (H: 0.8 × (0.6 × 29 + 0.4 × 24.17) + 0.2 × (0.6 × 59 + 0.4 × 49.17)); **blended contribution after support ≈ $22.30**, versus $26.20 in the v1 model. We give up about $4 a payer to be the cheapest serious option in CAD; the bet is that conversion and retention more than cover it.

### 4.3 Conversion, churn and CAC

| Assumption | v1 (Oct 28) | Now | Why |
| --- | --- | --- | --- |
| Free → paid within 6 months | 8% (bear 4, bull 15) | **12% (bear 6, bull 18)** | A reverse trial of real money features with no card; $29 instead of $39; the counters. Reverse-trial and freemium benchmarks cluster at 8–15% (`solo-pro-launch.md` §4.3 sources, W?); 12% is inside that band, not above it (A) |
| Paid monthly churn | 3.5% | **3.0%** | The weekly report is the receipt; Acuity-style "recurring money" features (waitlist, rebooking) are sticky because the list and the automations live with us (A) |
| Blended cost per free signup | $20 | $20 | Unchanged (30% ads at $60, 70% loop and organic at $3) |
| Contribution per payer | $26.20 | $22.30 | §4.2 |

**Per 1,000 free signups (H)**

| | v1 base | Now bear | **Now base** | Now bull |
| --- | --- | --- | --- | --- |
| Payers at month 6 | 80 | 60 | **120** | 180 |
| Monthly contribution | $2,096 | $1,338 | **$2,676** | $4,014 |
| CAC per payer at $20 a signup | $250 | $333 | **$167** | $111 |
| LTV (contribution ÷ churn) | $749 | $557 (4% churn) | **$743** (3%) | $892 (2.5%) |
| LTV : CAC | 3.0 | 1.7 | **4.4** | 8.0 |
| Payback on acquisition | 9.5 months | 15 months | **7.5 months** | 2.8 months |

### 4.4 Break-even sensitivity

Fixed overhead $340 a month (`unit-economics.md`); each payer carries about five active free users at roughly break-even (push-first costs against deposit fees), so net about $21 per payer. 250 free signups a month.

| Conversion → | 6% | 9% | **12%** | 15% | 18% |
| --- | --- | --- | --- | --- | --- |
| Payers needed to cover $340 | 17 | 17 | 17 | 17 | 17 |
| Free signups needed | 283 | 189 | **142** | 113 | 94 |
| Month overhead is covered | 2 | 1 | **1** | 1 | 1 |
| Overhead + $2,000 ads: 112 payers, signups needed | 1,870 | 1,245 | **935** | 745 | 620 |
| Month | 8 | 5 | **4** | 3 | 3 |
| Overhead + ads + $5,000 draw: 350 payers, signups needed | 5,830 | 3,890 | **2,920** | 2,330 | 1,940 |
| Month at 250 signups a month | 23 | 16 | **12** | 10 | 8 |

**ARPA sensitivity** at 12% conversion: if Studio never sells (100% Pro), ARPA is $27.07 and contribution $17.70, which pushes the founder-draw month from 12 to about 14. If the founder keeps the till-side features on Pro (no Studio), the storefront segment contributes about $19 a payer instead of $43; that is the cost of the simpler table.

**What would make this wrong.** (1) The trial converts at the freemium rate anyway (8%): the plan is then about as good as v1 in cash and better in positioning, since nothing here costs more than v1 to serve. (2) Churn does not fall: LTV drops to $637, LTV:CAC to 3.8, still workable. (3) Waitlist fill rates are near zero in practice: the feature stays a "seeing" feature and the report leans on rebooking and add-ons; the pricing holds because the price is set against competitors, not against the waitlist alone.

---

## 5. The upgrade moments and their copy

Voice: `docs/design/ux-copy.md` (sentence case, no "Upgrade" as a label, the quiet `PlanLine`, prices from `PLANS`, never typed). Every moment states a real number from `merchant_signals` when one exists and says nothing when the count is zero. No banners. One moment per screen. The link is always "See Pro" or "See Studio" and opens the billing page with the right plan preselected. Numbers in brackets are template values.

### 5.1 In context, on Free

| Where | Trigger | Copy |
| --- | --- | --- |
| Calendar, a cancelled slot | Any cancellation; waitlist entries > 0 | "{n} people asked for a spot this week. On Pro, this slot would have been offered to the first of them already. See Pro" |
| Calendar, a cancelled slot | No waitlist entries | "On Pro, cancelled slots go to a waitlist by themselves. See Pro" (shown once a week at most) |
| Waitlist page | Entries exist | "{n} waiting. Pro offers open slots to them automatically, with a two-hour hold. Until then, you can message them from here." |
| Booking page analytics on Today | `full_day_views` > 0 this week | "{day} was full. {n} people looked and left. Pro keeps them on a waitlist." |
| Customers, Due for a visit | Due count > 0 | "{n} clients are due. Pro reminds them for you, by app, email or text, with a link that already knows their usual service. See Pro" |
| Rebooking page, mode switch | Always | "Remind them for me · On Pro, {price} a month" |
| After checkout, success state | Appointment completed | "Ask {first name} for a Google review? On Pro this goes out by itself two hours after every visit. See Pro" |
| Services page, Add-ons section | Always | "Nail art, removal, a French tip. On Pro, clients add them when they book, and the time is blocked for you. See Pro" (trade words from the vertical) |
| Today, This week tile | Sunday; cancellations > 0 | "{n} cancellations this week. Pro would have offered them to your waitlist." and "Your week, in your inbox every Sunday, on Pro." |
| Promos picker | Always (exists) | "{n} of 4 this month" on Pro; on Free: "Valentine's nails, sent to your regulars in one tap. 4 a month on Pro. See Pro" |
| Booking page, badge | Always | The quiet "Powered by" line as today; on the shop page settings: "Remove the badge: on Pro." |
| Settings, Staff | A second bookable calendar on Free | "A second calendar is on Pro; a third and more on Studio, with no per-chair charge. See Pro" |

### 5.2 Trial start (the day the booking link goes live)

Push and in-app card on Today; email with the same words.

> **Your link is live. Pro is on for 14 days, free.**
> No card, nothing to cancel. For the next two weeks, cancelled slots go to a waitlist, clients who are due get a reminder with a book-again link, every visit is followed by a review request, and your week arrives on Sunday with the numbers. On {date} it goes back to Free unless you keep it. Your bookings and clients stay either way.
> [See what's on] [Set a weekly goal]

### 5.3 Day 11 (three days left)

> **Pro ends {weekday}.**
> So far: {fills} cancelled slots filled, {rebooked} clients rebooked from reminders, {reviews} review requests sent, {addons} add-ons booked. That's about {amount} you didn't have to chase. Pro is {price} a month, or {annual} a year with your website. [Keep Pro] [Let it end]

If every count is zero: "So far it's been quiet, which is normal in the first two weeks. Pro is {price} a month whenever you want it; your waitlist and reminders switch on the same day."

### 5.4 Trial end (the receipt)

Email and push, the Sunday report's layout.

> **Pro ended today. Here's what it did.**
> 14 days · {bookings} bookings · {amount} booked
> {fills} cancelled slots filled · {rebooked} rebooked from reminders · {reviews} review requests · {addons} add-ons
> Your waitlist, reminders and review requests are paused, not deleted. Add-ons stay in your services and come back to your booking page the day you turn Pro on. [Turn Pro on, {price} a month]

### 5.5 On Pro, the receipt every week

Sunday, the shop's hour.

> **Your week at {shop}: {amount} booked, {delta} vs last week.**
> {visits} visits · {new} new clients · goal {progress}
> Waitlist filled {fills} slots ({fill amount}) · {rebooked} came back from reminders ({rebook amount}) · {reviews} review requests, {google} went to Google · {addons} add-ons ({addon amount})
> Quietest day: {day}. A {day} promo would be a good use of one of your {promos left} this month. [Send a {day} promo]

### 5.6 Studio moments (shops)

| Where | Copy |
| --- | --- |
| Staff, third bookable calendar | "Three or more calendars are on Studio, {price} a month for the whole shop. No per-chair charge. See Studio" |
| Queue page on Pro | "The walk-in line is on Studio: clients join from their phone, see the wait, and get a text when they're next. See Studio" |
| Payouts on Pro | "Chair rent, commission and take-home per barber, every week, on Studio. See Studio" |

---

## 6. Decisions needed from the founder

1. Two tiers (Pro $29, Studio $59) and the plan id `studio`, or one tier at $29 with per-feature flags.
2. The till-side features (order-ahead, pickup, POS auto-award, webhooks, daycare, grocer counter) on Studio (default here) or kept on Pro.
3. Founding price $190 for year one of annual Pro (200 spots), replacing $290.
4. The trial for every vertical (default) or only `SOLO_VERTICALS`.
5. Texts: 300 on Pro and 1,000 on Studio (default), or keep 500 on Pro.
6. The weekly report's default hour (Sunday 18:00 shop time) and whether Free gets the push with locked lines (default: no push on Free; the tile only).

---

## Sources

All searched or read on Oct 29, 2026. Vendor pages were reached through search summaries and third-party guides; figures marked (W?) should be confirmed on the vendor's page before they appear in a comparison table.

GlossGenius: [Koalendar, GlossGenius pricing](https://koalendar.com/blog/gloss-genius-pricing) · [Pabau, GlossGenius pricing](https://pabau.com/blog/glossgenius-pricing/) · [Capterra, GlossGenius](https://www.capterra.com/p/174830/GlossGenius/)
Fresha: [PricingSaaS, Fresha plans and history (2026 Q2 diff: AI Concierge, Team Connect)](https://pricingsaas.com/companies/fresha) · [CostBench, Fresha hidden costs](https://www.costbench.com/software/salon-spa/fresha/hidden-costs/) · [Toolradar, Fresha pricing](https://toolradar.com/tools/fresha/pricing)
Booksy: [Booksy, No-Show Protection (vendor)](https://biz.booksy.com/en-gb/features/no-show-protection) · [Booksy, how reviews work (vendor)](https://biz.booksy.com/blog/how-booksy-reviews-work) · [Salon Today, Booksy no-show protection](https://www.salontoday.com/1082310/booksy-introduces-no-show-cancellation-protection-feature) · [Koalendar, Booksy pricing](https://koalendar.com/blog/booksy-pricing) · [SoftwareOne listing, Booksy no-show protection and waitlist](https://platform.softwareone.com/product/no-show-protection/PCP-2485-0742)
Vagaro: [Koalendar, Vagaro pricing](https://koalendar.com/blog/vagaro-pricing) · [StyleSeat vs Vagaro (competitor)](https://www.styleseat.com/blog/styleseat-vs-vagaro/) · [SchedulingKit, Vagaro pricing](https://schedulingkit.com/pricing-guides/vagaro-pricing) · [Pabau, Vagaro pricing](https://pabau.com/blog/vagaro-pricing/)
Square: [Square Appointments Canada, features](https://squareup.com/ca/en/appointments/features) · [Square Appointments FAQ, plan table](https://api.squareup.com/help/gb/en/article/6238) · [Square UK, waitlist software](https://square.com/gb/en/appointments/features/waitlist-software) · [Square AU, cancellation policy](https://square.com/au/en/appointments/features/cancellation-policy)
Boulevard: [Capterra, Boulevard pricing](https://www.capterra.com/p/180087/Boulevard/pricing/) · [Pabau, Boulevard pricing](https://pabau.com/blog/boulevard-pricing/) · [CostBench, Boulevard](https://costbench.com/software/salon-spa/boulevard/)
Squire: [PricingSaaS, Squire](https://pricingsaas.com/companies/squire) · [Capterra, Squire](https://www.capterra.com/p/153899/Squire-Barber-Appointment-App/) · [GetApp, Squire features](https://www.getapp.com/retail-consumer-services-software/a/squire/features/)
Acuity: [Koalendar, Acuity pricing](https://koalendar.com/blog/acuity-scheduling-pricing) · [Capterra, Acuity pricing](https://capterra.com/p/191978/Acuity-Scheduling/pricing/) · [Thewearify, Acuity review](https://thewearify.com/acuity-scheduling-review/)
Linktree and Shopify: [U2L, Linktree pricing 2026](https://u2l.ai/blog/linktree-pricing) · [UniLink, Linktree pricing explained](https://www.unilink.us/blog/linktree-pricing-2026) · [GrowthSuite, is it worth upgrading a Shopify plan](https://www.growthsuite.net/questions/is-it-worth-upgrading-my-shopify-plan-for-speed) · [Praella, how to upgrade a Shopify plan](https://praella.com/blogs/shopify-insights/how-to-upgrade-your-shopify-plan-a-comprehensive-guide)
Evidence on features: [SchedulingKit, salon scheduling statistics](https://schedulingkit.com/hub/industry-guides/salon-industry-scheduling-statistics) · [SchedulingKit, no-show statistics](https://schedulingkit.com/statistics/no-show-statistics) · [TRTC, no-show cost by industry](https://trtc.io/blog/details/no-show-statistics-cost-by-industry) · [Zenoti, no-show revenue calculator (vendor)](https://www.zenoti.com/thecheckin/no-show-revenue-calculator) · [Salon Geek, filling last-minute openings (forum)](https://www.salongeek.com/threads/cancellation-no-show-statistics-options-methods-to-fill-last-minute-openings.336645/) · [Bird, Aimy case: repeat bookings (vendor)](https://bird.com/en-gb/customers/aimy) · [Whito, salon rebooking](https://whito.co.uk/beauty-salons/guides/salon-instagram-vanity-rebooking/) · [Rework, rebooking strategies](https://resources.rework.com/vi/libraries/beauty-center-growth/rebooking-strategies-salons) · [WiserNotify, Google review statistics](https://wisernotify.com/blog/google-review-statistics/) · [Shapo, Google review statistics 2025](https://shapo.io/blog/google-review-statistics/) · [SingleInterface, automating review requests](https://blog.singleinterface.com/automating-google-review-requests-tools-and-techniques-for-local-business-owners) · [CTV News, Canadians sitting on unused gift cards (Square data)](https://toronto.ctvnews.ca/canadians-sitting-on-gift-cards-with-unused-balances-survey-finds-1.5368725) · [NCFA Canada, the economics of unused gift cards](https://ncfacanada.org/the-economics-of-unused-gift-cards/) · [SchedulingKit, gift card statistics](https://schedulingkit.com/fr/statistics/gift-card-industry-statistics)
Earlier in-house sources: `docs/business/solo-pro-launch.md` (unit costs, ad benchmarks, freemium conversion benchmarks, all cited there on Oct 28, 2026).
