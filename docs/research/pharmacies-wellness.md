# Pharmacies and wellness retail (independent pharmacies, apothecaries, health food, optical)

Oct 26, 2026 · Phase 3 (research, Figma, build, verify) · CAD · **Not legal advice: the legal readings below need written sign-off from Ontario health-privacy counsel (list at the end of section 2).**

Figma: https://www.figma.com/design/uFAyyjksYaX6WYte3N0oRb (file "Local Loyalty — Pharmacies & Wellness", page "Pharmacies & Wellness"). PNG exports: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/pharmacies-wellness/`.

Tags: (W) read on the web this session, link given; (W-law) read on e-Laws this session (the regulation text itself); (repo) read in this repository; (E) estimate; (R) from memory, link not opened, verify.

## 1. Who this is for

- **Independent community pharmacies** in the GTA: one to a few locations, an owner-pharmacist who is also the designated manager, two to six staff, and a front store that carries most of the margin (vitamins, cosmetics, cold remedies, household goods, gifts). Many are South Asian-owned (Brampton, Mississauga, Scarborough, the Danforth, Thorncliffe, Rexdale) and serve seniors who speak Hindi, Urdu, Punjabi, Gujarati or Tamil and rely on the pharmacist for flu shots, blister packs and delivery. (E: no source counted them; the owner's own sales notes in `docs/sales/playbooks/pharmacies.md` agree.)
- **Banner and chain context.** Many independents belong to a banner (IDA/Guardian, Pharmasave, Remedy'sRx and others). Banners may have their own program, so the rep logs a "banner check" (repo: playbook). Shoppers Drug Mart and Rexall corporate stores are out of scope.
- **Tools they use today.** Pharmacy software for the dispensary (Kroll, Healthwatch, others: repo playbook), a front-store POS that is sometimes separate, paper "Seniors Day" cards, nothing else. The product has to leave the dispensary alone.
- **Wellness retail** (health food stores, apothecaries without a dispensary, optical shops): not regulated by the pharmacy rules, but they make health claims. They get the ordinary retail vertical plus the claim review in section 3. Optical shops that dispense eyeglasses are regulated by the College of Opticians; that was not researched (U) and they stay on the retail template.
- **Customers.** Seniors and families who visit often, pay with a health card for covered services, pick up blister packs on a schedule and want a text when the order is ready. A senior will not install an app.

## 2. Evidence

### 2.1 The rule on rewards, read from the source

The repo's checklist and the PRD cited **O. Reg. 681/93** as the rule. **That regulation was revoked on May 5, 2017** by O. Reg. 130/17 (W-law: [e-Laws page for O. Reg. 681/93](https://www.ontario.ca/laws/regulation/930681), "This Regulation was revoked on May 5, 2017. (See: O. Reg. 130/17, s. 8)"). The rule now lives in two places, and both were read in full on e-Laws on Oct 26, 2026:

| Source | What it says (quoted or closely paraphrased) |
| --- | --- |
| [O. Reg. 264/16 (General), under the *Drug and Pharmacies Regulation Act*](https://www.ontario.ca/laws/regulation/160264), s. 33 definition | "benefit" means "any incentive or inducement of more than nominal value, whether direct or indirect, and includes a rebate, credit or gift" |
| same, **s. 34 para 3** (conflict of interest, owner or designated manager) | It is a conflict of interest to "offer, make or confer a benefit to a patient in relation to the sale of a drug or the provision of pharmacy services other than, (i) an adjustment in the fee or amount that would otherwise be charged with regard to that patient for that drug or that pharmacy service, or (ii) the provision to a patient, at no charge, of an item of nominal value to be used in maintaining or promoting well-being or health" |
| same, **s. 34 para 2** | It is also a conflict of interest to "offer, make or confer a benefit to a person by reason of the referral of a patient to a pharmacy associated with the owner or designated manager" |
| [O. Reg. 130/17 (Professional Misconduct and Conflict of Interest), under the *Pharmacy Act, 1991*](https://www.ontario.ca/laws/regulation/170130), **s. 6(c) and 6(b)** | The same two rules, applied to each pharmacist (member) personally |
| O. Reg. 264/16 **s. 29** (advertising) | No advertising of a pharmacy or its services that is false, misleading or deceptive (including by omission), not dignified and in good taste, contains anything that cannot be verified, contains "testimonials, comparative statements or endorsements relating to the quality of drugs or services", or contains "representations as to the safety or effectiveness or an indication for use of a drug in Schedule I". Price advertising for Schedule I drugs has extra conditions (s. 29(2) and (3)) |
| [OCP loyalty points policy](https://ocpinfo.com/pharmacy-professionals/rules-and-standards-of-the-profession/practice-policies-guidelines/loyalty-points-program/) (W; published July 2004) | "Bonus points, loyalty points or air miles may not be awarded on prescriptions, prescription services" or other professional services; "Points may not be redeemed, or used as legal tender, for the purchase of prescriptions"; a rewards credit card may pay for prescriptions unless "a special gift, bonus, or other inducement is offered"; reimbursing parking is fine if not advertised. Incentives remain permitted on items that do not need a prescription (W: [Globe and Mail, July 2004](https://www.theglobeandmail.com/report-on-business/rewards-for-drug-purchases-nixed/article18268209/): the 2003 OCP decision took effect July 1, 2004 and was upheld by the Superior Court) |

**What this means precisely (my reading).**

1. The prohibition is on a *benefit in relation to* a drug or a pharmacy service. Loyalty points, a bonus, a gift or a rebate on a prescription, a vaccine, a medication review or a dispensing fee are all that. Front-store items (things that need no prescription) are outside it.
2. A **fee adjustment for that patient** is permitted (a dispensing-fee discount for a senior, say). A *loyalty program* is not a fee adjustment, so we offer none.
3. **Visit-based points are a risk.** A visit to a pharmacy may be a visit to collect a prescription. A point for coming in is therefore a benefit "in relation to" the dispensary. The older checklist defaulted to "not permitted" and asked for verification. We close the question by not building it: no points or stamps for a visit at a pharmacy.
4. **Referral rewards are a separate prohibition** (para 2): a benefit to a person for referring a patient to the pharmacy. The generic "refer a friend" feature of the product (`loyalty.referrals`) is therefore off for pharmacies. This was not in any earlier document.
5. **Redemption.** The OCP policy bars paying for prescriptions with points. A front-store reward (say $5 off front store) is fine, but must not be applied to Rx. The cashier confirms that at every redeem.
6. **What a "network perk" is.** The network gives a perk when someone visits several shops. A pharmacy visit counted toward a perk would be a visit-based benefit. The product records a pharmacy visit only when it has front-store dollars in it (see 4.3), so a prescription-only visit triggers nothing.
7. **Order-of-magnitude of the risk (E).** OCP can discipline the pharmacist and the owner; the case law above shows it enforces this rule. The cost to a shop is an accreditation problem, not a fine we could price.

### 2.2 How the chains handle it

- **Rexall Be Well** (W: [RBC/Rexall terms](https://www.rbcroyalbank.com/_assets-custom/pdf/rexall-terms-en.pdf), French version updated Jan 2025): points "cannot be collected on prescriptions or select products purchased through the dispensary or pharmacy service" in Ontario, Alberta, British Columbia, PEI and Newfoundland; in Ontario and BC they cannot be redeemed on prescriptions. Be Well pays 10 points per $1 and 25,000 points = $10 (W: Rexall).
- **Shoppers / PC Optimum** (W: [PC Health](https://www.pchealth.ca/en/rx-care-sdm)): earning on prescription drugs "varies by province and is governed by applicable provincial legislation". PC's own Ontario exclusion wording was not found (U); the Globe article says Shoppers outlets in Ontario "can no longer give Optimum Card points for prescription sales". PC offers 3,000 points for creating a digital pharmacy profile in several provinces including Ontario until Dec 31, 2026 (W). That is a benefit tied to a pharmacy account, which this product will not copy.
- **Alberta** is the contrast: points on prescriptions were ruled legal there (W: [CBC](https://amp.cbc.ca/news/canada/edmonton/pharmacy-loyalty-programs-ruled-legal-in-alberta-1.3554561)), BC prohibits them (W: [Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/5325be74/pharma-in-brief---pharmacy-customer-incentiveloyalty-programs-for-drugs-and-pharmacy-services---prohibited-in-bc-but-allowed-in-alberta)). We are Ontario only, so the Ontario rule is the product rule.
- **What an independent can do that a chain can't be asked to**: a seniors' day on the front store, a store-wide points card, texts about the front store.

### 2.3 Health privacy: PHIPA and PIPEDA

- PHIPA (W-law: [S.O. 2004, c. 3, Sch. A](https://www.ontario.ca/laws/statute/04p03), consolidation from Jan 1, 2026): a pharmacy is a health information custodian (s. 3(1)). "Personal health information" includes identifying information that "relates to the providing of health care to the individual, including the identification of a person as a provider of health care to the individual" (s. 4(1)(b)). A person's being a patient of a pharmacy, and having had a vaccine, is therefore personal health information.
- **s. 33 (marketing):** a custodian "shall not collect, use or disclose personal health information about an individual for the purpose of marketing anything or for the purpose of market research unless the individual expressly consents".
- **Agent exposure.** An "agent" is someone who acts for the custodian in respect of personal health information "for the purposes of the custodian". If Local Loyalty were fed dispensary data (an Rx pickup list, a patient's phone from the dispensary system) it would risk being the pharmacy's agent or service provider for PHI. The design rule that follows: **nothing from the dispensary system enters the product, and nothing the product holds says what care a person received.**
- **Front-store data** (phone number, first name, front-store purchases) is ordinary personal information under PIPEDA, with CASL consent for marketing. That is the product's current basis (repo: privacy policy, compliance checklist §1 and §2).
- **The weak points that remain** and what the build does about them are in section 4.4. Two are not fully solvable by design and go to counsel: whether a *fixed* "your order is ready" text from a pharmacy reveals that a person is a patient (the text never says it is an Rx, and a pharmacy has front-store orders too), and whether the in-product confirmation replaces a signed Schedule C.

### 2.4 Services the pharmacy offers that the product touches

- **Flu shots and vaccines.** Pharmacists give free, publicly funded flu shots to anyone aged 2 and over who lives, works or goes to school in Ontario (W: [Ontario: pharmacies](https://ontario.ca/page/pharmacies), [Universal Influenza Immunization Program](https://www.ontario.ca/page/universal-influenza-immunization-program); the 2026/27 criteria are effective Sept 28, 2026). The patient pays nothing, so there is no price, deposit or payment to take. A booking is a time slot.
- **MedsCheck** (annual medication review): anyone with an Ontario health card taking at least three medications is eligible (W: Ontario pharmacies page). The provincial program pays the pharmacy; again no payment from the customer.
- **Compliance packaging (blister packs).** Ontario limits dispensing fees for pill packs; the packaging has "never been funded" as a service and pharmacies recover the cost through fees or a separate charge (W: [Ontario Pharmacists Association town-hall document](https://www.opatoday.com/wp-content/uploads/Practice/Town-Hall-Questions_final.pdf), undated; CMAJ letter 2019). The product's job is only to tell the customer the pack is ready, without naming it.
- **Delivery.** Many independents deliver to seniors (W: single-pharmacy listings, e.g. Dufferin Drug Mart). Delivery of a prescription is a dispensary activity; we build nothing for it (section 5).

### 2.5 Competitors for the pharmacy owner's attention

| Option | What it gives a pharmacy | Gap for us to fill |
| --- | --- | --- |
| Banner programs (Guardian/IDA, Pharmasave) | A loyalty card run by the banner | The owner doesn't control it; many want their own local card (E) |
| PC Optimum, Be Well | Big chains' points and reach | Independents have nothing equivalent |
| Square Loyalty, Smile, generic loyalty apps | Points on any sale | No dispensary lock; the owner must remember to exclude Rx |
| Pharmacy software booking modules (Kroll and others) | Patient-record based reminders and booking | Not a front-store tool, and not our business |

Prices and feature lists of these were not re-checked this session (U); the sales team's battlecards have them (repo: docs/sales/battlecards.md).

### 2.6 Health claims in copy (Competition Act, Health Canada)

- The Competition Bureau says a Health Canada product licence does not protect a marketer from the Competition Act: it acts when the overall impression of an ad goes beyond what Health Canada approved, and performance or efficacy claims "must be based on adequate and proper testing" done *before* the claim is made (W: [Competition Bureau weight-loss release](https://www.canada.ca/en/competition-bureau/news/2019/02/weight-loss-claims-must-be-true-and-supported-by-testing-false-misleading-or-unsubstantiated-claims-are-illegal-under-the-competition-act.html) and a law firm summary, [Siskinds](https://www.siskinds.com/food-drug-and-natural-product-claims/)). Health Canada says the market authorization holder is responsible for its advertising and pre-clearance is voluntary (W: [Health Canada, Regulating Advertising of Health Products, 2011](https://www.canada.ca/en/health-canada/services/drugs-health-products/reports-publications/medeffect-canada/regulating-advertising-health-products-health-canada-2011.html); the document is old, check the current guidance (R)).
- For a pharmacy there is an additional specific rule (O. Reg. 264/16 s. 29(1)(d) and (f)): no testimonials about the quality of drugs or services and no safety or effectiveness claims for Schedule I drugs.
- **What it means for us.** We write no health claims. The pharmacy template, seed and sales copy name products ("vitamins, tissues and cold remedies") without saying what they do. The text check (4.2) blocks condition and drug names in shops' offers but cannot judge a claim, so the compliance checklist tells shops that a product's claim must be the one on its licence. We offer no public review requests to pharmacies (section 5).

## 3. Jobs to be done

Ranked by frequency times pain, for the pharmacist-owner, the front-store cashier and the customer.

| # | Job | Who | Why it hurts today |
| --- | --- | --- | --- |
| 1 | **Run a loyalty card without a prescription ever earning or being discounted** | Owner | One mistake is an OCP complaint; no loyalty tool excludes Rx by design |
| 2 | **Ring a sale without thinking about Rx** | Cashier | The till total often includes a prescription copay |
| 3 | **Fill the pharmacist's chair for flu shots and medication reviews** | Owner, customer | Phone tag; a fixed number of slots per day |
| 4 | **Tell someone their order is ready without a medication name on a lock screen** | Cashier, customer | Calls take staff time; a text that names the drug is a privacy problem |
| 5 | **Promote front-store items to people who said yes** | Owner | Seasonal offers (cold and flu season, Seniors Day) |
| 6 | **Show an inspector or a lawyer that the rules are on and who confirmed them** | Owner | Paper addenda get lost |
| 7 | **Keep seniors in their language** | Customer | Hindi, Urdu, Punjabi text for reminders and the order-ready notice |
| 8 | **Know whether the card works, without a report that could reveal who uses the dispensary** | Owner | Reports that mix in services |
| 9 | **Reduce no-shows for a vaccine slot** | Owner | A free service has no deposit; reminders do the work |

## 4. What we build and why

### 4.1 Audit of the current build (keep, change, cut)

Frame 09 in Figma shows this table. Evidence is the code read this session (repo).

| Item | Verdict | Why |
| --- | --- | --- |
| Category lock by name regex (`isRegulatedCategory`) for "Prescriptions" and "Pharmacy services": can't be turned on, renamed or deleted | **Keep, widen** | Job 1. The regex missed "dispensary", "medication", "vaccine", "blister pack" and the like, so a pharmacy that created such a category could make it earn. Now a stored `dispensary` flag set from a pharmacy-only name list; it survives a rename |
| Amount-only counter award earned on the whole total | **Change** | Job 2. A pharmacy with no itemised lines earned on every dollar, Rx included. Now the cashier confirms "no prescriptions or pharmacy services" and the server refuses without it |
| Visit and stamp programs allowed at any vertical | **Change** | Section 2.1 point 3. Blocked for pharmacies |
| A sale with nothing earnable still counted as a visit (`qualifiesAsVisit` is true when nothing is eligible and the minimum spend is 0), so it created a member, paid a welcome bonus, paid flat bonus-promo points and counted for network perks | **Change (a real hole)** | Job 1 and section 2.1 point 6. An Rx-only sale could therefore trigger a welcome bonus and a perk. Now refused and rolled back |
| The visit and lifetime spend recorded the whole sale including the Rx lines | **Change** | Job 8. Now the front-store amount only |
| Rewards, promos, discount cards, messages, automations, manual adjustments accepted any text | **Change** | Job 5 and rule 1. Text check on create, edit, send and each automation run; an exclusion sentence is allowed |
| Referral program available | **Cut for pharmacies** | Section 2.1 point 4 |
| Customer notes and tags | **Cut for pharmacies** | Free text next to a person at a pharmacy is how health information gets in |
| CSV import of opening point balances | **Cut for pharmacies** | We can't tell if another program earned them on Rx |
| Appointments module: price, deposit, no-show fee and card on file, notes, checkout invoice with points and reward, reminders naming the service, rebooking nudges | **Change** | Job 3 and 9, section 2.4. Locked to free-to-book; see 4.3 |
| Reminders and confirmations list the service name | **Change** | Job 4. They say "appointment" |
| POS pipeline stored the whole sale (every line, including Rx) | **Change** | Job 8. Only front-store lines are kept |
| Review requests, rebooking nudges | **Cut for pharmacies** | Section 2.1 (advertising s. 29) and PHIPA marketing; the review feature is restaurant-only already, now also guarded |
| Sponsored ads policy that rejects pharmacy services and prescriptions | **Keep** | Already right |
| Marketing consent per shop, quiet hours, STOP | **Keep** | Job 5. CASL |
| Compliance in a markdown checklist and a rep tick-box | **Change** | Job 6. A Pharmacy rules page with the owner's confirmation |
| Landing copy "Front-store points only. Prescriptions and pharmacy services don't earn points" | **Keep** | True, short |
| The test helper made every test shop a pharmacy | **Change** | It would have subjected every other area's tests to the new rules. Default is now a retail shop |

### 4.2 What we build, each mapped to a job

| Component | Job | Where |
| --- | --- | --- |
| **Locked dispensary categories** with "Locked by Ontario rules" tags, the reason, and an "Also blocked for this shop" list (Figma 01) | 1, 6 | `CategoriesEditor.tsx`, `services/merchant-program.ts`, `services/pharmacy-guard.ts`, `merchant_categories.dispensary` |
| **Front-store confirmation at the counter** (web: a tick that must be on before Add points or Redeem; mobile: the "Front store" chip is the confirmation) (Figma 02) | 2 | `CounterApp.tsx`, mobile `counter/index.tsx`, `ledger.awardPurchaseTx`, `staff.redeem` |
| **Ledger guard**: per-dollar only, amount-only needs the tick, uncategorised lines earn nothing, no front-store dollars means no visit, no member, no bonus, no perk, recorded amount is the front-store part | 1, 2, 8 | `services/ledger.ts`, `pharmacy-guard.ts` |
| **Text check** shared by server and the composer (live "This can't be sent", Figma 03) | 1, 5 | `packages/shared/src/pharmacy.ts`, `Composer.tsx`, rewards, promos, cards, campaigns, automations, adjustments, service names |
| **Pharmacist appointment types** (flu shot, vaccine appointment, medication review, pharmacist consultation) with no price, deposit, points, rebooking, tax or notes (Figma 04) | 3, 9 | `ServiceEditor.tsx`, `services/page.tsx`, `services/appointments*.ts` |
| **Shopper booking** without a notes field or a price, with the privacy line in four languages (Figma 05) | 3, 7 | `BookFlow.tsx`, i18n keys `rx.book.*` |
| **Reminders** that say "appointment" | 4, 9 | `appointments-booking.sendReminders`, key `rx.appt.word` |
| **Pickup ready**: one fixed text in four languages, sent only to a customer who asked, deleted after 30 days (Figma 06) | 4, 7 | `PickupReady.tsx`, `services/pharmacy.sendPickupReady`, keys `rx.pickup.*` |
| **Pharmacy rules page** with the pharmacist-owner confirmation, the rules, the retention periods and where the rules come from (Figma 07) | 6 | `pharmacy/page.tsx`, `routes/pharmacy`, `merchants.pharmacy_confirmed_*` |
| **Front-store-only reports** with a banner (Figma 08) | 8 | `reports.overview` scope, `reports/page.tsx` |
| **Retention**: appointment name, phone and type removed after 30 days; transactional texts and inbox copies deleted after 30 days | 4, 9 | `services/retention.ts`, `RETENTION.pharmacy*` |
| **Privacy policy, merchant agreement Schedule C, rewards terms, compliance checklist** updated; the revoked regulation corrected everywhere | 6 | `docs/legal/*`, PRD, playbook |
| **Demo pharmacy** (Village Apothecary): confirmation, locked categories, four appointment types, a pharmacist, five appointments, a front-store draft message | demo | `apps/api/src/seed/pharmacy.ts` |

### 4.3 Decisions that are not obvious

1. **"Only 'service booked'."** A booking stores the time, the length and the appointment *type the pharmacy named*, plus the customer's first name and phone so a reminder can go. After 30 days the customer link, the name and the type are removed and the row becomes a count. Types are chosen from presets or free text that is checked for conditions and drug names ("Diabetes review" is refused, "Medication review" is allowed). The alternative of storing no type at all was rejected: the pharmacist needs to know what to prepare for, and the shop's own software holds the clinical record. This is the part most in need of counsel review.
2. **No checkout for pharmacy appointments** (409): no invoice, no points, no reward on a vaccine. Completion goes through the status change.
3. **The mobile counter** uses the existing category chips: the "Front store" chip is the confirmation. Picking Rx disables the award.
4. **POS**: only lines in a front-store category that earns are kept; the rest, and any line with no mapped category, are dropped before the sale is stored. A sale with none is ignored.
5. **No review links.** Public Google reviews are testimonials about the quality of services (O. Reg. 264/16 s. 29(1)(d)). Not offered.
6. **The helper default.** `createMerchant` in the API test helper made a pharmacy. It now makes a retail shop and takes a `vertical`; two tests that asserted "pharmacy" now assert "retail".

### 4.4 Residual risk and what we do about it

| Risk | What reduces it | What remains |
| --- | --- | --- |
| A cashier lies on the tick | Saved with the sale; counts only front-store dollars | The tick is an attestation, not proof |
| A shop writes "10% off Rx" in other words or another language | Text check in English; exclusion wording only | The check is a word list: Hindi, Urdu, Punjabi and clever wording pass. The pharmacist-owner confirmation and the agreement carry that risk |
| A shop writes a health claim ("boosts immunity") | Template and seed are free of claims; checklist item | We can't judge a claim by machine |
| The order-ready text reveals a patient relationship | Fixed text, no order or name, customer asked, deleted at 30 days | Counsel to confirm (2.3) |
| Raw POS webhook payloads kept by the integration layer may still hold Rx lines | Only the purchase record is cleaned | **Open item**: the raw event store is not scrubbed for pharmacies; recommend not connecting the dispensary register |
| Reminders on the shopper's own app screen name the service to the shopper | It is their own data | None |

## 5. What we deliberately don't build

- **Anything that reads the dispensary system**: patient lists, refill dates, Rx pickup status, insurance. Not ours; PHIPA agent risk.
- **Refill reminders and "time for your flu shot" nudges.** A text that ties a person to a prescription or a vaccine is health information marketing (PHIPA s. 33). Blocked.
- **Delivery tracking, driver routes, signatures on delivery** for prescriptions: a dispensary activity with its own records.
- **Medication adherence, vaccine records, MedsCheck billing**, health-card capture: not stored.
- **Points on services of any kind**, including "free flu shot after 500 points".
- **Referral rewards**, welcome gifts tied to transferring a prescription, parking rebates (the OCP allows an unadvertised parking reimbursement; we do not track it).
- **Public review requests, testimonials and comparative claims** (s. 29).
- **A separate "wellness" template.** Health food, apothecary and optical shops use the retail template; a second template would add a decision and no new job.
- **Per-staff pharmacist scheduling beyond the existing calendar**; **ODB or insurance billing**; **a patient portal**.

## 6. Design

Figma: https://www.figma.com/design/uFAyyjksYaX6WYte3N0oRb. Frames (annotated with "Why this exists" notes beside them):

| Frame | Size | Job |
| --- | --- | --- |
| 01 Rewards: what earns points (locked rows, reason, also blocked) | 1440 | 1, 6 |
| 02 Counter: front-store subtotal and confirmation | 1440 | 2 |
| 03 Messages: pharmacy guard | 1440 | 1, 5 |
| 04 Services: pharmacist appointments | 1440 | 3, 9 |
| 05a, 05b Shopper: pick a time, booked (with the reminder text) | 390 | 3, 7 |
| 06 Counter: Pickup ready | 1440 | 4 |
| 07 Pharmacy rules: Schedule C, retention | 1440 | 6 |
| 08 Reports: front store only | 1440 | 8 |
| 09 Audit: keep, change, cut | 1100 | all |

Style follows `docs/design/foundations.md` (monochrome, hairlines, one accent, Bricolage Grotesque and Inter, pill buttons; one black primary per page). The only colour added is the negative red for a blocked message and the info blue for the rule banner.

Mobbin references (web and iOS), what each taught:

- [AirOps usage limits](https://mobbin.com/screens/05a6389d-ff2b-4639-9a87-f869d4dce247) (web): a table that tells a "Hard limit" from a "Soft limit" with a small tag in the row. We use a black "Locked" tag for rows nobody can change, so a locked row reads differently from an off switch.
- [Base44 security rules](https://mobbin.com/screens/5eaa299b-10fb-4978-a7ac-2a19085bf68a) (web): a rule list that states what is allowed and disallowed per row. Informed the "Rules we enforce for you" list with "Always on".
- [Square store hours form](https://mobbin.com/screens/6b2d38fe-14c7-4c70-9982-fb8aafab787c) (web): a compact form that is a table, not a stack of fields. We kept the existing dashboard table instead (our appointment types table).
- [Fresha booking confirmed](https://mobbin.com/screens/8b05efdb-3ca3-435f-b8d1-3de83f69f1b0) (iOS): a confirmed state, date and time first, then actions (calendar, directions). Our "You're booked" frame leads with the time and the reminder text.
- [Ro "what's next"](https://mobbin.com/screens/4f1b2a26-79ae-4154-b286-741e351ff7d9) (iOS): a health service that tells the person exactly what happens next and what it will and won't do. We borrowed the idea of showing the exact text the customer will get.
- Swiggy table booked ([link](https://mobbin.com/screens/ced90a3d-a220-4f7a-b25d-6d1c589e1a44)) was seen and not used (offers and cashback upsell on a confirmation is the opposite of the pharmacy rule).

## 7. Build spec (done unless marked)

Migration: `packages/db/migrations/0025_pharmacy.sql` (`merchant_categories.dispensary`, `merchants.pharmacy_confirmed_at`, `pharmacy_confirmed_by_name`, `pharmacy_confirmed_by_user_id`, and a backfill that locks existing pharmacy categories by name).

New files: `packages/shared/src/pharmacy.ts`, `packages/shared/src/api/pharmacy.ts`, `apps/api/src/services/pharmacy-guard.ts`, `apps/api/src/services/pharmacy.ts`, `apps/api/src/routes/pharmacy/index.ts`, `apps/api/src/seed/pharmacy.ts`, `apps/web/src/lib/api/pharmacy.ts`, `apps/web/src/components/dashboard/pharmacy/PickupReady.tsx`, `apps/web/src/app/(dashboard)/m/[merchantId]/pharmacy/page.tsx`.

Endpoints: `GET /v1/merchants/:id/pharmacy/rules` (staff), `POST .../pharmacy/confirm` (owner), `POST .../pharmacy/pickup-ready` (staff). Changed: counter `award` (`frontStoreOnly`), `redeem` and `redemptions/verify` (`frontStoreOnly`), `reports/overview` (`scope`), the public booking response (`shop.pharmacy`).

Error codes (422 unless noted): `front_store_confirmation_required`, `pharmacy_no_front_store`, `pharmacy_visit_earn`, `pharmacy_text`, `pharmacy_no_notes`, `pharmacy_no_referrals`, 409 `pharmacy_no_checkout`.

Acceptance checks: `apps/api/test/pharmacy.test.ts` (29 tests: earning, redeem, adjustments, referrals, categories, offers and messages, appointments, order-ready text, retention, rules page, reports, text checker), `packages/shared/test/pharmacy.test.ts`, `apps/web/test/nav.test.ts`, `apps/web/e2e/pharmacy.spec.ts`.

**Open items.** (1) Counsel sign-off (below). (2) Native review of the six new Hindi, Urdu and Punjabi strings (added to the translation log below). (3) Raw POS event payloads for pharmacies are not scrubbed. (4) The customer mobile app booking screen drops the notes field and shows the privacy line for a pharmacy, but still lists the (zero) price; web is complete. (5) The shopper "shop page" pharmacy line and the BIA reports were left as they are. (6) Quebec French for the new strings.

**Pricing (open question for the founder).** Nothing here changes `plans.ts`. The locks, the Pharmacy rules page, the front-store confirmation and the reports are free forever (they are compliance and part of the free loyalty program, `docs/business/pricing.md`). Pharmacist appointments ride `booking.appointments` and the order-ready text and campaigns ride Plus ($39/month), like every other shop. A pharmacy gets no deposits or checkout fees from appointments, so the platform earns nothing from them; whether flu-shot booking should be free for pharmacies is a pricing decision, not built.

**For counsel:** whether a fixed order-ready text is PHI; whether the in-product confirmation can stand in for a signed Schedule C; the 30-day period for appointment details; whether a front-store seniors card handed out at the dispensary counter is read as an inducement; the s. 29 advertising rule against testimonials as it bears on a shop's own Google reviews.
