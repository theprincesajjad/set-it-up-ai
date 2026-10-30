# Value propositions for the solo pro launch, and how we test them

Oct 29, 2026 · For @Sajjad Pirani · Follows `docs/business/solo-pro-launch.md` (packaging and economics), `docs/marketing/landing-pages.md` (the seven blocks of landing v2) and `docs/marketing/ads/*.md`. The build spec for the test lives in `scratchpad/landing-v2/ab-spec.md`.

**Founder direction, Oct 29.** The paid plan is called **Pro** ($39 a month; plan id stays `plus`). **Deposits are no longer the lead message**: many techs do not want to take deposits, and many have clients who will not pay one. Deposits stay as an optional feature. Find a unique value to lead with, and A/B test the candidates.

**Tags.** (W) read on the web on Oct 29, 2026, source at the end · (W?) third-party, undated, or a vendor with a stake · (C) read from our code · (A) assumption · (H) hand math · (U) could not verify.

**What I could not reach.** Reddit blocks our crawler, so r/Nails, r/NailTechs, r/lashextensions, r/Barber and r/Esthetics were not read directly (U). Where a third-party page summarises Reddit threads it is marked (W?). The App Store and Trustpilot pages were reached only through review roundups. Treat every "pain" score below as a reading of review sites, educator blogs and vendor pages, and let the test settle it.

---

## 1. What the evidence says

### 1.1 What techs and barbers complain about

| Theme | What was found | Strength |
| --- | --- | --- |
| **Marketplace fees on clients they already had** | Fresha: 20% of a new client's first visit, $6 minimum; reviewers say existing clients who searched the pro's name on the marketplace were counted as "new" and charged ("Do NOT have your clients book online. You HAVE to book them manually at first or you will lose any profit"), Capterra and Pabau, Aug 2026 (W, W?). Booksy Boost: 30% of a first visit; a UK comparison calls it "the most complained-about feature in Booksy's UK review history"; reviewers describe "being charged twice for the same customer" and "$30 a month and still $10 for a new client"; Booksy sits at 3.0 on Trustpilot against 4.5 on the App Store (W?, competitor and roundup sources). Comparison sites add "you don't own the client relationship" about Booksy (W?, competitors) | **Strong, and the most specific anger in any review set.** Felt by people who have used an app, not by DM-only techs |
| **Prices that climb** | GlossGenius: "continuously raising the prices and making different tiers", "can feel high for a solo lash artist just starting out" (G2, Capterra, 2026, W). Vagaro: add-ons "increase the pricing exponentially" (Software Advice, W). Square: text reminders and no-show protection sit on paid tiers; the Free plan has no no-show fees (vendor page, W). Fresha dropped its free plan in 2025 and reviewers report "little charges came in" (Capterra, W) | Strong |
| **Booking in DMs** | Every educator and vendor page says the same thing: DM-only booking is "the most common setup and the weakest performer" (nailtech-img.app, Jul 2026, W?); "lash techs lose significant time each day to DMs and confirmation messages" (loop.fans, W?); squeezing people in by DM "blurs the rules, leading to double bookings and boundary issues" (Katie Barnes Academy, W?). A Toronto tech's public profile reads "BOOK BY WEBSITE ONLY NOT DM" (W). No independent study of the hours lost (U) | **Broad and real, but every booking app already says it.** The entry pain, not a unique one |
| **No-shows** | Salon no-show rate about 20% without reminders; reminders cut it by 29–60% (all vendor statistics, W?). Deposits are the standard advice, and the same guides list the objection every tech hears: "I've never had to pay a deposit before" (Katie Barnes, Nextro, 2026, W?). One Booksy reviewer "moved to deposits without solving the no-show problem" (App Store via roundup, W?). A viral dispute in Sep 2026 turned on whether a nail tech had asked for a deposit at all (Complex, W) | Pain is strong. **Deposits as the fix is contested**, which supports the founder |
| **Home address and safety** | Guides for home-based businesses are about hiding the address on Google Business Profile; the Australian Beauty Association advises home salons to "provide appointment details to confirmed clients" rather than publish the address (W?). Mobile techs see "higher booking anxiety" from clients (W?, vendor). Nothing from a Toronto tech directly (U) | Medium. Specific to home studios; nobody in the comparison set offers it |
| **Regulars and rebooking** | A "healthy" rebooking rate is "above 40%" (Nail Pro quoting Timely, W?); salon retention "around 30 to 35% for two decades" (blog, W?). Every competitor claims retention: GlossGenius leads with "more repeat visits" (W) | Pain is real, the claim is generic |
| **Currency and country** | GlossGenius prices in US$ and lists no Canadian page; Fresha's pricing page states no currency; Booksy's Canadian page says "features are based on the US feature set and may differ in Canada"; Square has a CA page (vendor pages, W). No review complaining about USD billing was found (U) | A fact we can state; weak as a headline on its own |
| **A website** | Square Free includes "a custom booking website"; GlossGenius includes a booking site; Vagaro sells one as an add-on (vendor pages, W) | Not unique. Our edge is a site that knows the bookings, prices, loyalty and reviews, which is an annual-plan story, not a signup story |

### 1.2 How the competitors position themselves (Oct 29, 2026, vendor home pages, W)

| | Hero | Lead claim |
| --- | --- | --- |
| GlossGenius | "Scheduling, payments, and admin. Handled." | AI agents that "get you more clients, bigger tickets, and more repeat visits" |
| Fresha | "The #1 software for Salons and Spas" | Marketplace, payments, "no hidden costs" |
| Booksy (CA) | "Online scheduling software. All the tools you need to manage and grow your business, in one app." | $29.99 a month, Boost, no-show protection |
| Square Appointments (CA) | "The all-in-one point of sale for booking, payments and more." | Free plan, single location |

All four say "all in one" or "handled". **"Manage all your stuff in one place" is the founder's voice and it belongs on the page, but as the second sentence**: on its own it is the same sentence as everyone else's.

### 1.3 The ranking

Score 1–5 each: **Pain** (how often it shows up in what techs say, weighted for evidence quality), **Own** (can we say it and nobody in the comparison set can), **Ship** (is it live on the day the ads run; C).

| # | Angle | Pain | Own | Ship | Total | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Not a marketplace: your clients stay yours. No cut, no "new client" fee, no per-chair charge, prices in CAD** | 4 | 5 | 5 | **14** | **Lead.** The most specific complaint in the review sets, and the one thing Fresha, Booksy and Vagaro structurally cannot say. Square can say "no fee" but prices per location and keeps no-show tools on Plus |
| 2 | **Stop booking in your DMs; get your evenings back** | 5 | 2 | 5 | 12 | **Challenger A.** The pain every tech feels and the previous control (ad concept 1). Not ownable, but the best door-opener for DM-only techs. Keep it as the subhead of the lead and test it as a headline |
| 3 | **Clients see your area, not your door** (home-studio privacy) | 3 | 5 | 4 | 12 | **Challenger B** on the nail, brow, lash and makeup pages only. Unique and built (`locations.addressVisibility`, `bk.privacy.*`, C). Not for barbers or groomers |
| 4 | **No-shows handled without a deposit**: reminders by app and email, confirm-or-release, a waitlist; a deposit only if you want one | 5 | 3 | 3 | 11 | **Challenger C, gated.** Reminders ship. Confirm-or-release and the waitlist do not (people-side.md #9). The variant may only claim what is live on the day; see §3.3 |
| 5 | **One price for the whole shop** (barbers: no per-chair charge) | 4 | 4 | 5 | 13 | **Barber lead** (it is angle 1 in barber words). Booksy at four chairs is US$89.99 against our $39 (W) |
| 6 | CAD and local, built for GTA main streets | 2 | 4 | 5 | 11 | A proof line under every headline ("Prices in CAD. Made in Toronto."), not a headline |
| 7 | Clients come back (loyalty and regulars) | 3 | 2 | 4 | 9 | The regulars block stays; it is the upgrade story (promos to regulars), not the signup story |
| 8 | Instagram-first: DMs to calendar | 4 | 3 | 2 | 9 | The inbox connector waits on Meta review (solo-pro-launch §6). Do not promise it in a hero. The "This DM becomes this booking" block stays as a demonstration of the link, not of an integration |
| 9 | Look professional fast: a free website | 2 | 2 | 3 | 7 | Annual-plan story; day-7 email, not the hero |
| 10 | One app for all your local spots (for their clients) | 1 | 5 | 4 | 10 | Right audience is the client, not the pro. Stays in the regulars block as "why they'll install it" |

**Why the lead beats deposits.** Deposits were our differentiator on Free, and that stays true in the plan table. As a message it splits the audience: a tech who takes deposits nods, a tech whose clients refuse them scrolls past, and the loudest review complaints are not about no-shows at all but about platforms taking a cut of clients the tech already had. "Your clients stay yours" is a fact about us that cannot be copied by a marketplace, applies to every trade, and costs nothing to ship. Deposits become one line inside the no-show card: there if you want it.

---

## 2. The recommended control, and the variants

> **Packaging update, Oct 29, 2026 (phase "pro value", `docs/business/pro-value.md`).** The price strip on every landing page reads
> **Free, Pro, Studio**: Pro (`PLANS.plus`, one person, two bookable calendars) and Studio (`PLANS.studio`, a shop with chairs, no
> per-chair charge), with Service and the restaurant plans on `/pricing` only. Every new shop gets `TRIAL_DAYS` of Pro with no card,
> from the day its booking link goes live, and annual Pro shows its first-year price struck through (`FIRST_YEAR_PRICE`; never called
> "founding"). The regulars block names the paid half honestly: seeing who is due, who asked for a full day and what the week made is
> free; the **waitlist that fills cancelled slots**, **automatic rebooking**, **review requests** and the **weekly report** run
> themselves on Pro. No price, count or trial length is typed into a variant: they come from `PLANS`, `PROMOS_PER_MONTH_PLUS` and
> `TRIAL_DAYS` through `apps/web/src/lib/marketing/plan-copy.ts`. Where this section says "$39" or "the paid plan", read Pro and
> `PLANS.plus.priceCents`. The barber variant's "one price for the whole shop" is Studio's line now (`STUDIO_MO` per month, any number of chairs).

Voice: the founder's. "If you're a nail tech, put your bookings, your clients and your reminders in one place." Plain words, Canadian spelling, sentence case on anything a person taps, no "Upgrade", no "all-in-one". Rules from `docs/design/ux-copy.md` §13 apply (the address is never in a headline; say where a message goes).

**The code (C, Oct 29, 14:35).** The build agent shipped `apps/web/src/lib/marketing/landing-variants.ts` and `LANDING_VARIANTS` in `apps/web/src/copy/en-CA.ts`: per look (`nails`, `brows`, `lashes`, `makeup`, `barber`, `groom`), per variant id, `{ eyebrow, hook: [line1, line2], lede, cta, jobs: [JobId, JobId, JobId] }` with `JobId = "book" | "remind" | "regulars"`, `control` the default, and `landingVariant(key, id)` falling back to control. **Today's `control` is the DM hook** ("Stop booking / in your DMs.") for the tech pages, "One link for / the whole shop." for barbers, and a `price` variant exists for barbers. The tables below use those keys and add the ids the plan needs (`yours`, `dms` as an explicit alias of today's control copy, `private`, `noshows`, and the job ids `noshow`, `yours`, `private`, `line`). The recommended lead is `yours`; whether it becomes `control` before the test (one key swap) or wins its way there is the founder's call, and the test is the same either way.

Every variant keeps the same seven blocks of landing v2 (`landing-pages.md`). What changes: the hero eyebrow, headline, subhead and CTA; the order of the three job cards; which policy line the hero phone's booking flow shows; and the ad hook it pairs with. Prices and fees are never typed into copy; they come from `PLANS` and `FEES` as today (C, `solo-view.ts`).

### 2.1 The job cards (one set per trade, reordered per variant)

The second card changes everywhere: "A $20 deposit holds it" becomes "No-shows handled your way". This is the one copy change that applies to the control too.

| Id | Nails, brows, lashes, makeup | Barber | Groomer |
| --- | --- | --- | --- |
| `book` | **They pick a time.** Your services and your open times. They choose, you get a message. No more "what times do you have Saturday?" | **They book, or join the line.** Clients book a time or join the walk-in line from their phone and see the wait. You see who's next. No clipboard. | **They pick a time and the dog.** Owners pick their dog first, then see that dog's prices and your open times. Rabies and bordetella dates are on the profile. |
| `noshow` | **No-shows, handled your way.** Reminders go out by themselves. Want a card on file or a {deposit} deposit for the slots that matter? Turn it on per service. Don't? Leave it off. | **No-shows, handled your way.** Reminders go out by themselves, and a rebook nudge two weeks after the cut. A card on file for Saturday slots if you want it. | **No-shows, handled your way.** A reminder the day before with the vaccine check. A {deposit} deposit for the long grooms if you want one. |
| `remind` | **Reminders send themselves.** App and email reminders go out without you. Texts for the ones who need one. | **Reminders send themselves.** App and email reminders go out without you. Texts for the ones who need one. | **Rebooks remind themselves.** When Max is due again, the owner gets a link that already knows him. |
| `regulars` | (as shipped: the regulars card) | (as shipped) | (as shipped) |
| `yours` | **Your clients stay yours.** No marketplace. No cut of a booking. No "new client" fee. Their numbers, their history and their notes are in your list, and you can export it any time. | **Your clients stay yours.** No marketplace, no cut of a booking, no "new client" fee, no per-chair charge. Renters keep their own list. | **Your clients stay yours.** No marketplace, no cut, no "new client" fee. Every dog's record stays with you. |
| `private` | **Clients see your area, not your door.** The map shows "Bloor West area · by appointment". The address goes out after they book, and in the reminder the day before. | (not used) | (not used) |
| `line` | (not used) | **The walk-in line, on their phone.** "You're 3rd · about 40 min · we'll let you know." | (not used) |
| `family` | (not used) | **Dad books, kids' cuts on the same card.** One card, every haircut in the family. | (not used) |

CSV export is on the paid plan today (C, `merchant-export.ts`, people-side §2.1). The `yours` card says "you can export it any time": **either export moves to Free for the client list before the ads run, or the sentence becomes "and nobody else can see it".** Founder decision; the spec carries both strings.

### 2.2 The variants, per trade

`{deposit}` is the sample deposit from `SAMPLE_DEPOSIT_CENTS` ($20). Eyebrows carry the trade; the proof line "Prices in CAD. Made in Toronto." sits under every CTA. CTAs keep the start form's verb: the page scrolls to the form.

#### Nails (also brows, lashes, makeup with the trade word swapped: "If you're a brow tech…", "If you do lashes…", "If you're a makeup artist…")

Headlines are written as the two `hook` lines; the second line takes the trade colour.

| Variant | Eyebrow | Headline (hook) | Subhead (lede) | CTA | Job order | Hero policy card | Ad hook |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`yours` (recommended lead)** | For nail techs · not a marketplace | **Your clients** / **stay yours.** | If you're a nail tech, put your bookings, your clients and your reminders in one place. Clients book from your bio instead of your DMs. Nobody takes a cut, nobody charges you for a "new" client, and your list is yours. Free to start. | Get your booking link, free | `book`, `yours`, `noshow` | "Free change until 24 h before" (no deposit line) | "Booksy and Fresha take a cut of your clients. We don't." |
| `control` today = `dms` | For nail techs | **Stop booking** / **in your DMs.** | Put one link in your bio. Clients pick a time from your real openings, and the reminder sends itself. You get your evenings back. Free to start. | Get your booking link, free | `book`, `remind`, `noshow` | "Free change until 24 h before" | "Still booking in DMs?" |
| `private` | For home studios | **Clients see your area,** / **not your door.** | A booking link made for working from home. The map shows your area, the address goes out only after someone books, and reminders send themselves. Free to start. | Get your booking link, free | `private`, `book`, `noshow` | "Address: sent after you book" | "Your address stays private." |
| `noshows` | For nail techs | **Fewer no-shows.** / **Deposit optional.** | Reminders by app and email go out by themselves, a card on file for the slots that matter, and a deposit only if you want one. Your clients, your rules. Free to start. | Get your booking link, free | `noshow`, `book`, `yours` | "We'll remind them 24 h and 2 h before" | "No-shows, without the deposit fight." |

When confirm-or-release and the waitlist ship, `noshows` gets its full copy: "Reminders by app and email, a 'confirm or release' nudge the day before, and a waitlist that fills the gap. A deposit only if you want one." Until then the variant runs with the copy above or does not run (§3.3).

#### Barber

| Variant | Eyebrow | Headline | Subhead | CTA | Job order | Hero policy card | Ad hook |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`price` (recommended lead; shipped)** | For barbershops · prices in CAD | **No per-chair** / **charge. Ever.** | If you're a barber, manage all your stuff in one place: bookings, the walk-in line, family cards and chair renters. $39 a month however many chairs, and nobody takes a cut of your clients. Free to start. | Get your shop's link, free | `book`, `yours`, `line` | "Free change until 24 h before" | "No per-chair charge. Ever." |
| `control` today | For barbershops | **One link for** / **the whole shop.** | Bookings and the walk-in line in one link, free to start. Clients book themselves, reminders send themselves, and regulars come back. One price, however many chairs. | Get your shop's link, free | `book`, `remind`, `regulars` | "Free change until 24 h before" | "Still booking in DMs?" |
| `dms` | For barbershops | **Stop booking** / **in your DMs.** | One link for the shop. Clients book a time or join the line from their phone, and the reminder sends itself. Free to start. | Get your shop's link, free | `book`, `line`, `noshow` | "Free change until 24 h before" | "Still booking in DMs?" |
| `line` | For barbershops | **"How long's the wait?"** / **Answered.** | A walk-in line clients join from their phone, bookings beside it, and family cuts on one card. One price for the whole shop. Free to start. | Get your shop's link, free | `line`, `family`, `book` | (the queue card instead of a policy card) | "How long's the wait?" |
| `noshows` | For barbershops | **Fewer no-shows.** / **Deposit optional.** | Reminders go out by themselves, a rebook nudge two weeks after the cut, and a card on file for Saturday slots if you want it. Free to start. | Get your shop's link, free | `noshow`, `book`, `yours` | "We'll remind them 24 h and 2 h before" | "No-shows, without the deposit fight." |

#### Groomer (wave 2)

| Variant | Eyebrow | Headline | Subhead | CTA | Job order | Hero policy card | Ad hook |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`control` (shipped)** | For pet groomers · prices in CAD | **Vaccines checked.** / **Max rebooked.** | If you groom dogs, put the bookings, the vaccine dates and the rebook reminders in one place. Owners pick the dog, see that dog's prices, and get a nudge when Max is due. Nobody takes a cut. Free to start. | Get your booking link, free | `book`, `remind`, `yours` | "Free change until 24 h before" | "Vaccines checked before the groom." |
| `dms` | For pet groomers | **Stop booking** / **in your DMs.** | One link in your bio. Owners pick a time and the dog, and the reminder sends itself. Free to start. | Get your booking link, free | `book`, `remind`, `noshow` | "Free change until 24 h before" | "Still booking in DMs?" |
| `noshows` | For pet groomers | **Fewer empty tables.** / **Deposit optional.** | A reminder the day before with the vaccine check, a rebook link when the dog is due, and a deposit for long grooms only if you want one. Free to start. | Get your booking link, free | `noshow`, `book`, `remind` | "We'll remind them 24 h and 2 h before" | "The table isn't empty at 11:30." |

### 2.3 How deposits are presented now

- **Never in a headline, eyebrow or ad hook**, except inside the `noshows` variant as "Deposit optional".
- **One sentence inside the `noshow` card**: "Want a card on file or a {deposit} deposit for the slots that matter? Turn it on per service. Don't? Leave it off."
- **The hero phone** shows the policy card without a deposit line by default ("Free change until 24 h before"). The booking demo's "{deposit} holds your spot" line appears only in the `noshows` variant.
- **The price block** keeps "Deposits: optional, if you want them. 1% on online deposits" with the word *optional* in it (as shipped in v2).
- **In the product**, the setup card for policies starts on "Reminders only"; "Card on file" and "Deposit" are two switches with the fee shown beside them. Nothing changes in what Free includes.
- **Under the start form** (v2 has no FAQ block), one line: "No deposits needed. Reminders go out either way; turn deposits on per service if you want them."
- **What we stop saying**: "A $20 deposit ends the Saturday no-show" as a hook, and "deposits on the free plan" as a CTA.

---

## 3. The A/B testing plan

Full build spec: `scratchpad/landing-v2/ab-spec.md`. This section is the plan a person reads.

### 3.1 What we test, in what order

| Test | Pages | Arms | Question | Starts |
| --- | --- | --- | --- | --- |
| **T1, the lead message** | `/for-nail-techs` (all four trades pooled), `/for-barbers` | `yours` vs `control` (the DM hook) on techs; `price` vs `control` on barbers | Is the unique claim better than the broad pain, or worse? | Day 1 of ads |
| **T2, privacy** | `/for-nail-techs` only | T1 winner vs `private` | Does the home-studio angle convert more home-based techs without losing the rest? | After T1 decides |
| **T3, no-shows** | all | T2 winner vs `noshows` | Does "deposit optional" beat the winner once confirm-or-release ships? | When confirm-or-release and the waitlist are live, else at T2's end with the reduced copy |
| **T4, card order** | winner only | three orders of the winner's cards | Small; run only if traffic allows (see §3.3) | Last |

**Two arms at a time.** With the traffic we can buy, a third arm adds 50% to the run (§3.3). Barber and nail tests run in parallel because they are separate pages and separate ad sets; they do not share a denominator.

### 3.2 Metrics

| | Definition | Source (C) |
| --- | --- | --- |
| **Exposure** | A landing page view with a variant assigned (one per anonymous id per test) | `landing_events` `view` (new) |
| **Primary** | **Booking link live**: of exposed visitors, the share whose shop reaches the `booking_link_live` milestone within 7 days of the exposure. The start-form submit is the first step of it and is reported beside it | `merchant_milestones` (`signed_up` with `data.variant`, `booking_link_live`) joined to the exposure by the anonymous id carried into signup |
| Secondary 1 | Start-form submit rate (the earliest read; used for the interim look) | `landing_events` `start_submit` |
| Secondary 2 | CTA click rate (hero CTA, nav CTA) and scroll depth (50%, 90%) | `landing_events` `cta_click`, `scroll_50`, `scroll_90` |
| Secondary 3 | First booking by someone else within 7 days of link live | `first_online_booking` milestone |
| Secondary 4 | Paid within 30 days of signup (Pro monthly or annual) | `subscriptions` or the billing milestone |
| **Guardrails** | Cost per free signup by variant (from the ads manager, by `?v=`): a variant above $90 for two weeks is paused. Signup → link live by variant: a variant below 50% of the control's rate loses even if it wins on submits (it is attracting the wrong people). Lighthouse performance ≥ 90 at 390 px for every variant. No variant changes a price, a fee, the consent text or the comparison table | ads manager; `onboarding-solo` funnel; `e2e/marketing-solo.spec.ts` |

Why "link live" and not "signup": the plan's activation story is the live link (`solo-pro-launch.md` §5.1); a message that brings people who sign up and never set hours is a worse message.

### 3.3 Sample size and run length, honestly

Baseline (A, H): Unbounce's median for paid landing pages is 6.6% (Q4 2024 dataset, W?); solo-pro-launch assumes 50% of starters finish signup and targets 70% of signups going live. So the baseline for the primary is about **6.6% × 50% × 70% ≈ 2.3%, carried as 2.5%**; the start-form submit baseline is carried as **5%** (A: a start form with three fields converts below a one-field lead form).

Traffic (A): $1,500 of the $2,000 monthly test budget is media; at CA$1.50–3.00 per landing click (beauty CPCs on Meta, W?, conflicting guides) that is **500–1,000 landing views a month**, about 60% on the nail page and 40% on the barber page, plus organic and client-loop visits (small at first). Carry **750 views a month per test** when both pages pool, **450 on nails and 300 on barbers** when they do not.

Two-sided test, α = 0.05, power 0.80, equal arms. Per-arm sample ≈ 15.7 × p̄(1 − p̄) / δ², where p̄ is the mean of the two rates and δ the absolute difference (H, normal approximation).

| Metric | Baseline | Minimum detectable effect | Per arm | Both arms | Months at 750 views | Months at 450 views (nails alone) |
| --- | --- | --- | --- | --- | --- | --- |
| Link live | 2.5% | +50% relative (to 3.75%) | 3,040 | 6,080 | 8.1 | 13.5 |
| Link live | 2.5% | **+100% relative (to 5%)** | 910 | 1,820 | **2.4** | 4.0 |
| Start submit | 5% | +50% relative (to 7.5%) | 1,470 | 2,940 | 3.9 | 6.5 |
| Start submit | 5% | **+100% relative (to 10%)** | 440 | 880 | **1.2** | 2.0 |
| Start submit | 5% | +30% relative (to 6.5%) | 3,780 | 7,560 | 10.1 | 16.8 |

**What this means.** At this budget we can only see a message that roughly **doubles** the conversion rate inside a quarter. A 20–30% lift, which is what most headline tests produce, is invisible to us for a year. So:

1. **Only test messages that could plausibly double something.** T1 and T2 qualify (a different pain, a different audience). Card order (T4) does not, unless traffic grows; it waits.
2. **Decide T1 on start-form submits at the planned horizon (880 exposures pooled, about 5–6 weeks), with link live as a guardrail**, not the reverse. Link live is the primary in the sense that a variant must not lose on it; it is too slow to be the deciding number at this volume.
3. **Pool the four nail trades** in T1 and T2. Splitting by trade would quadruple the run.
4. **If the ads are killed** (cost per free signup above $90 for four weeks, solo-pro-launch §5.4), the test continues on organic and client-loop traffic with the same horizon; it just takes longer. Do not shorten the horizon because the money stopped.
5. If the founder raises the budget, the table scales linearly: $6,000 a month makes a +50% lift on submits visible in about five weeks.

### 3.4 Traffic split and sticky assignment

- **Random 50/50 at the first view**, decided on the server from a random anonymous id (`ll_aid`, a random 16-byte value in a first-party cookie, 30 days, `SameSite=Lax`, no personal information). The variant is stored in `ll_v` (`<test>:<variant>`, 30 days) and the page renders that variant on every later visit.
- **`?v=<variant>` on the ad URL wins over the cookie** and is written to it, so a paired ad always lands on its page (§3.5). `?v=` with an unknown id falls back to the cookie or the coin.
- **Ad URLs** carry `?src=ad-<n>&v=<variant>`; the existing `src` flow (`ll_src` cookie → start form → signup → `signed_up` milestone `data.source`, C) is extended by one field, `variant`, through the same path, so the conversion joins to the exposure without a third-party tool.
- **One assignment per test, not per page**: a nail tech who sees `control` on the nails page sees `control` on the brows page too.
- Staff and admin users, and any request with a `Sec-GPC: 1` header (Global Privacy Control), get the control and are **not counted** (`view` is not recorded), so they neither bias nor are tracked.

### 3.5 How ad creative and landing variants are paired

Two ways to run an ad test, and we run them in order:

1. **Page test (T1, T2 as designed).** One neutral ad per page ("A booking link for nail techs, free. Prices in CAD. Made in Toronto.") links to the bare URL; the page splits visitors. This measures the page message alone. The ad's own hook is deliberately bland so it does not pre-sell either variant.
2. **Message test (after T1).** Each of the two messages gets its own ad whose hook says the same thing as the page headline ("message match"): the `yours` ad says "Booksy and Fresha take a cut of your clients. We don't." and links to `?v=yours`; the DM ad says "Still booking in DMs?" and links to `?v=control` (or `?v=dms` once the alias exists). The ads manager reports cost per landing click and cost per free signup by ad; our report shows link live by variant. **The winner is the pair with the lowest cost per live link**, which is the number the business runs on. This is a campaign test, not a page test, and the ads manager's split is the randomiser.

Each ad concept in `docs/marketing/ads/*.md` now names the variant it links to. Concepts that match no variant (the site, promos) link to the bare URL and take whatever the cookie says.

### 3.6 Privacy: PIPEDA, CASL, Quebec, and the Meta pixel later

What the law says, in the plain terms the build must follow:

- **PIPEDA** treats cookies and identifiers used for tracking as personal information. The OPC's guidance on online behavioural advertising (page modified 2025-08-11, W) accepts opt-out consent when the purpose is explained in plain terms at or before collection, not buried in a policy; opting out is easy and immediate; the data is non-sensitive and destroyed or de-identified as soon as possible; and nothing is used that a person cannot decline (no fingerprinting, no super cookies). That guidance is about advertising across sites; first-party measurement on our own page is lighter, and we hold it to the same bar anyway.
- **CASL** governs commercial electronic messages and installing programs without consent (ISED page, modified 2024-07-15, W). Our measurement sends no message and installs nothing; CASL's express-consent rules for messages still apply to anything we send a signup later (unchanged; `ux-copy.md` §7). CASL's deemed-consent rule for cookies (s. 10(8)) is from memory (U); the lawyer confirms the wording before the Meta pixel ships.
- **Quebec's Law 25** requires opt-in before a technology that identifies, locates or profiles a person is used (W?, vendor summaries; the CAI's text not read, U). We do not sell in Quebec at launch; the beacon still honours Global Privacy Control everywhere and sets nothing when it is on.

What we build:

- **Cookie-light, first-party only.** Three cookies: `ll_src` (exists), `ll_v`, `ll_aid`. No third-party scripts on the landing pages by default. Events go to our own API by `navigator.sendBeacon` with the variant, the event kind, the page, the trade and the anonymous id. **No IP stored** (the API drops it), no user agent beyond a coarse device class (phone, desktop), no geolocation, no cross-site anything.
- **A one-line notice** in the page footer and in the privacy policy: "We count visits to this page ourselves to see which words work. No ad trackers. [Turn it off]". "Turn it off" sets `ll_aid=off` and stops the beacon; the page still works and still shows the control. Immediate, as the OPC asks.
- **Retention:** raw `landing_events` rows are deleted after 90 days; the per-test summary is kept. Exposures are never joined to a name, email or phone; the join to a merchant happens only through the milestone row the signup itself wrote.
- **The Meta pixel or Conversions API, later, behind consent.** When the founder wants Meta's optimisation on real conversions: (1) the pixel loads only after a visitor taps "Allow" on a consent card that names Meta and the purpose ("so Meta can show our ads to people like you"), unticked by default, with "No thanks" as easy as "Allow"; (2) the choice is stored in `ll_consent` with a timestamp and version; (3) the Conversions API sends the `Lead` and `CompleteRegistration` events **server-side only for anonymous ids with recorded consent**, with the same consent state as the browser, so the server path never bypasses the choice; (4) the ads docs stop reporting cost per signup from UTM maths alone once CAPI is on. Until then the ads manager optimises on landing views and we do the conversion maths from our own table, which is enough for the volumes in §3.3.

### 3.7 The reporting view

`/admin/experiments` (admin role, read-only), built like the activation funnel page (C, `apps/web/src/app/(admin)/admin/onboarding/page.tsx`):

1. A list of tests: name, pages, arms, started, planned horizon (exposures), exposures so far as a bar, status (running, interim look available, horizon reached, decided).
2. One test: a table with one row per variant and the columns **Exposures · Start submits · Signed up · Link live · First booking (7 d) · Paid (30 d)**, each as a count and a rate with a 95% Wilson interval, plus **lift against control** on the submit rate and the link-live rate.
3. **Confidence**: a two-proportion z-test p-value and a plain-English line ("At this point the difference could be chance" / "The difference is unlikely to be chance (p = 0.03)"). **The p-value and the lift are hidden until the planned interim look (50% of the horizon) and the horizon itself**; before that the page shows counts only and the banner "Not time to decide yet: 412 of 880 exposures."
4. Breakdowns by trade and by `src` (ads, organic, client loop) as counts, no p-values (they are too small to test).
5. Guardrails as traffic lights: cost per free signup by variant (typed in from the ads manager weekly, a small form), link-live share of signups by variant, and the Lighthouse number from the last e2e run.
6. An export of the per-variant counts as CSV.

### 3.8 Stop rules, and how we avoid peeking errors

- **Pre-register** each test in `packages/shared/src/experiments.ts`: arms, weights, baseline, minimum detectable effect, horizon (exposures, not days), the one interim look, the deciding metric and the guardrails. The admin page reads those; nobody changes them while the test runs.
- **Two looks only.** One interim at 50% of the horizon with α = 0.01 (stop only if a variant is clearly worse or clearly better at that bar), and the final look at the horizon with α = 0.045. Together these keep the overall false-positive rate near 5%. The page enforces it by hiding p-values at every other time.
- **No stopping on a good week.** A variant that is ahead at 30% of the horizon is not a winner. The banner says so.
- **Guardrail stops are allowed at any time** (cost per free signup above $90 for two weeks in a variant; link-live share below half the control's; a bug in one variant). A guardrail stop ends the test without a winner, and the control stays.
- **Decision**: a variant wins if, at the horizon, its deciding metric is higher with p < 0.045, no guardrail is red, and link live is not lower than the control's by more than the interval allows. Otherwise the control stays and the next test starts.
- **Do not run overlapping tests on the same page.** T2 starts after T1 decides. Nail and barber tests may overlap because they share no visitors.
- **Record the decision** in this document's log below, with the counts, so the next person does not re-run a settled question.

### 3.9 Decision log

| Date | Test | Result | Counts | Decision |
| --- | --- | --- | --- | --- |
| | | | | |

---

## 4. What changes in the other documents

- `docs/business/solo-pro-launch.md`: plan renamed Pro; deposits optional and out of the lead; the lead angle is "your clients stay yours"; ad concepts updated to name variants.
- `docs/marketing/ads/nail-techs.md`, `barbers.md`, `groomers.md`: concept 2 (the deposit hook) rewritten as the no-show hook; a `v=` column; the Pro name.
- `docs/marketing/landing-pages.md`: the jobs row is now book, no-shows your way, remind (or yours), per variant; the variant mechanism.
- `docs/design/ux-copy.md` §0 still lists "Café & Retail" as the plan's name and "Pro" as a word never to say; the build agent renaming the plan owns that table and should update it with the strings.

---

## Sources

All read Oct 29, 2026.

Competitor positioning (vendor home pages): [GlossGenius](https://glossgenius.com/) · [Fresha for business](https://www.fresha.com/for-business) · [Booksy Canada](https://booksy.com/biz/en-ca) · [Square Appointments Canada](https://squareup.com/ca/en/appointments)

Reviews and fees: [Fresha reviews, Capterra](https://www.capterra.com/p/142138/Shedul-com/reviews/) · [Fresha pricing, Pabau (competitor, Aug 2026)](https://pabau.com/blog/fresha-pricing/) · [Fresha review, Pabau](https://pabau.com/blog/fresha-review/) · [GlossGenius reviews, G2](https://www.g2.com/products/glossgenius/reviews) · [GlossGenius reviews, Capterra](https://www.capterra.com/p/174830/GlossGenius/reviews/) · [GlossGenius pricing, Koalendar (competitor)](https://koalendar.com/blog/gloss-genius-pricing) · [Booksy Biz reviews, Capterra](https://www.capterra.com/p/142741/Booksy/reviews/) · [Booksy Biz reviews, Software Advice](https://www.softwareadvice.com/barbershop/booksy-profile/reviews/) · [Booksy on Trustpilot](https://www.trustpilot.com/review/booksy.com) · [Booksy fees, Trimcheck](https://trimcheck.com/for-barbers/booksy-fees/) · [Booksy vs Setora (competitor)](https://www.setora.co.uk/blog/setora-vs-booksy-barbershop-booking-software) · [Booksy review, Beauty Playbook](https://www.beautyplaybook.com/blog/booksy-review) · [Barber booking apps, GetBarbr (competitor)](https://www.getbarbr.com/blog/best-barber-booking-apps-us) · [Square Appointments reviews, Capterra](https://www.capterra.com/p/170263/Square-Appointments/reviews/) · [Square Appointments review, The Salon Business](https://thesalonbusiness.com/square-appointments-review/) · [Vagaro reviews, Capterra](https://www.capterra.com/p/153752/Vagaro/reviews/) · [Vagaro reviews, Software Advice](https://www.softwareadvice.com/medical/vagaro-profile/reviews/) · [Vagaro pricing, Koalendar (competitor)](https://koalendar.com/blog/vagaro-pricing) · [StyleSeat reviews, Capterra](https://capterra.com/p/176521/StyleSeat/reviews/)

DMs, deposits and no-shows (educators and vendors): [Katie Barnes Academy, booking systems](https://www.katiebarnesacademy.com/en-us/blogs/business-blogs/the-ultimate-guide-to-booking-systems-for-nail-technicians) · [Katie Barnes Academy, deposit policy](https://www.katiebarnesacademy.com/en-us/blogs/business-blogs/why-every-nail-tech-needs-a-deposit-policy-and-how-to-actually-stick-to-it) · [Nextro, deposits without losing clients](https://nextroapp.com/blog/how-to-take-deposits-as-a-nail-tech) · [Young Nails, cancellation and deposit policies](https://www.youngnails.com/blogs/news/how-to-handle-cancellation-deposit-policies-as-a-nail-tech) · [F-vex, no-shows](https://f-vex.com/blogs/hub/how-to-handle-no-shows-nail-tech) · [nailtech-img.app, bookings from Instagram](https://nailtech-img.app/blog/how-to-get-nail-bookings-from-instagram) · [loop.fans, lash tech booking](https://loop.fans/blog/lash-tech-booking-loyalty-repeat-clients) · [SuiteCal, lash deposits](https://suitecal.com/blog/take-deposits-lash-appointments) · [Complex, the Duke Dennis no-show dispute (Sep 2026)](https://www.complex.com/pop-culture/a/jaelaniturnerwilliams/duke-dennis-nail-tech-houston-spa-response) · [No-show statistics, SchedulingKit (vendor)](https://schedulingkit.com/hub/scheduling/appointment-no-show-statistics) · [Nail Pro, rebooking](https://www.nailpro.com/business/article/21158047/expert-advice-on-how-to-rebook-clients) · [Toronto nail tech profile, "book by website only"](https://www.instagram.com/nailsbyvaehh_/)

Privacy and home studios: [Australian Beauty Association, home salons](https://australianbeautyassociation.org/setting-up-a-beauty-clinic-at-home/) · [Google Business Profile, hiding an address](https://arcminutemarketing.com/how-to-hide-your-business-address-on-google/)

Law and measurement: [OPC, guidelines on privacy and online behavioural advertising (modified 2025-08-11)](https://www.priv.gc.ca/en/privacy-topics/technology/online-privacy-tracking-cookies/tracking-and-ads/gl_ba_1112/) · [OPC, policy position on OBA](https://www.priv.gc.ca/en/privacy-topics/technology/online-privacy-tracking-cookies/tracking-and-ads/bg_ba_1206/) · [ISED, Canada's anti-spam legislation (modified 2024-07-15)](https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en/canadas-anti-spam-legislation) · [Consent banners in Canada, CookieChimp (vendor)](https://cookiechimp.com/blog/the-complete-guide-to-consent-banners-in-canada) · [Meta pixel data processing options (US only)](https://developers.facebook.com/docs/meta-pixel/implementation/data-processing-options) · [Meta consent mode, Secure Privacy (vendor)](https://support.secureprivacy.ai/article/implementing-meta-consent-mode-with-secure-privacy) · [Landing page benchmarks, ClickMinded (Unbounce Q4 2024 figure)](https://www.clickminded.com/landing-page-statistics/)
