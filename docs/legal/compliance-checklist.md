# Local Loyalty — Compliance checklist (Canada / Ontario)

Oct 24, 2026 (federal status and new modules updated; first written Oct 21) · Business ops (legal/compliance) · **Not legal advice.**

This is a working checklist for a founder and a lawyer. Laws, regulator guidance and thresholds change. Items marked **VERIFY** must be confirmed with counsel or the regulator before launch. The draft customer-facing documents in this folder are all marked **DRAFT — have a lawyer review**.

**Owner:** founder, until a fractional general counsel is retained. **Budget:** about $3,000 for lawyer review of the drafts in month 3, plus about $3,500 for incorporation and the employment-lawyer call in month 1. Both are in the financial model as `one_time_costs`.

**Status legend:** ☐ to do · ◐ in progress · ☑ done

---

## 0. Corporate basics

- ☐ Incorporate federally (CBCA) or in Ontario (OBCA) **as a Canadian-controlled private corporation (CCPC)**, which the refundable SR&ED rate requires. Keep the register of individuals with significant control.
- ☐ Founder IP assignment to the company, covering code, brand and pre-incorporation work. Contractor IP and moral-rights waivers for every developer and designer.
- ☐ Trademark search and filing with CIPO for the final name. Domain and social handles.
- ☐ Register for HST when taxable supplies exceed **$30,000 over four consecutive calendar quarters** (the small-supplier threshold), or voluntarily from day 1 so you can claim input tax credits. **VERIFY** treatment of BIA campaign sales and ads.
- ☐ Insurance: commercial general liability, **cyber/privacy liability** and errors & omissions (tech professional liability).
- ☐ Each merchant signs the Merchant Agreement (`merchant-agreement.md`) before going live.

---

## 1. CASL: Canada's Anti-Spam Legislation

Promotional email, SMS and other "commercial electronic messages" (CEMs) need consent, sender identification and an unsubscribe mechanism. Penalties go up to **$10M per violation for a business**. The burden of proving consent is on the sender.

- ☐ **Consent is per sender.** Each merchant is a separate sender for its own promos; Local Loyalty is the sender for network messages such as "new shop on your street" or network perks. Collect consent separately: one checkbox per merchant at join, plus one network checkbox. **Never pre-check.** The PRD already requires per-merchant opt-in and mute.
- ☐ **Express consent wording** must state the purpose, the sender's name and contact details, and that the customer can withdraw at any time. Store the timestamp, wording version, channel, IP or device, and the staff member, for counter joins.
- ☐ **Implied consent** (an existing business relationship: a purchase within 2 years, or an inquiry within 6 months) may cover a merchant emailing its own customers. Track expiry dates and convert to express consent. **Do not rely on implied consent for network messages.**
- ☐ **Transactional messages** are exempt from the consent requirement *only if they carry no promotional content*. Examples: the phone-verification code, "your reward is ready", "your order is ready", quote approval. Keep promo copy out of them.
- ☐ Every CEM must include sender identification, a mailing address plus a phone, email or web contact, and **an unsubscribe mechanism that is free, easy and works for 60 days after sending**. Honour unsubscribes **within 10 business days** (build for instant). SMS: support STOP/ARRET.
- ☐ Asking for consent by email or SMS is itself a CEM. Ask at the counter or in the app instead.
- ☐ **Push notifications:** treat promotional push as CEM-equivalent. Get an in-app opt-in per category (orders, rewards, promos, nearby boosts) and keep a mute per shop. **VERIFY** the CRTC position.
- ☐ Nearby push boosts are paid ads. Send them only to customers who opted into nearby promos, at most 1 per customer per week (see the rate card).
- ☐ Keep consent records for at least 3 years after the relationship ends (a recommended practice). **VERIFY**
- ☐ Write a CASL compliance policy, train reps and merchants (counter script), and keep an audit log. A documented compliance program supports a due-diligence defence.

## 2. PIPEDA: privacy (Ontario private sector)

Ontario has no general private-sector privacy statute, so **PIPEDA applies**. **Federal reform status (checked Oct 24, 2026).**

- **Bill C-27** (the Consumer Privacy Protection Act) is dead: it lapsed when Parliament was prorogued in January 2025.
- **Bill C-36, the *Protecting Privacy and Consumer Data Act*,** was introduced and had **first reading on June 15, 2026**, in the 45th Parliament, 1st session. It has had no further stage that we could find. **It is not law and not in force.** If enacted it would replace Part 1 of PIPEDA, and the reported coming-into-force depends on another bill (C-34). Sources: [Parliament of Canada, LegisInfo, C-36](https://www.parl.ca/LegisInfo/en/bill/45-1/C-36) (its "current status" label says "At second reading", but its stage list shows no activity past first reading, so treat the label with caution), [text as introduced](https://www.parl.ca/DocumentViewer/en/45-1/bill/C-36/first-reading), [Gowling WLG](https://gowlingwlg.com/en/insights-resources/articles/2026/understanding-bill-c36), [Osler](https://www.osler.com/en/insights/reports/the-protecting-privacy-and-consumer-data-act-bill-c-36-key-obligations-and-enforcement-overview/), and `docs/business/data-strategy.md`. **PIPEDA remains the law that applies** (plus Law 25 in Quebec).
- ☐ Re-check LegisInfo before every release of the privacy policy and before any new data feature. Build to C-36 where it is cheap: treat de-identified data as personal information, rely on aggregation rather than pseudonymisation, and do not sell or license personal data (the founder has not decided anything about data sales; this policy keeps every current promise).

The 10 fair information principles, and what each means for us:

| Principle | What we do |
| --- | --- |
| 1. Accountability | Appoint a Privacy Officer (the founder). Publish their contact. Contracts with processors: Stripe, Twilio, Cloudflare (R2 file storage), hosting, email, Apple/Google wallet |
| 2. Identifying purposes | The privacy policy lists purposes: loyalty ledger, network perks, messages the customer consented to, fraud prevention, aggregated BIA reports |
| 3. Consent | Meaningful consent at join, in plain language, with layered notices. Express consent for sensitive uses (precise location for nearby push). Separate consent for marketing (CASL) |
| 4. Limiting collection | Collect phone number, first name and optional birthday month/day (no year: the database now stores only "MM-DD" and refuses a year). **No health data from pharmacies**: front-store only, never prescription information |
| 5. Limiting use, disclosure, retention | A merchant sees only its own members and their activity at that merchant (PRD). BIA reports are **aggregated** (minimum group of 10 or more). Delete inactive accounts after 3 years of inactivity, while keeping points balances honourable (see rewards terms) |
| 6. Accuracy | Customers can edit their profile |
| 7. Safeguards | Encryption in transit and at rest, role-based access (PRD), MFA for staff and admins, audit logs, least privilege for reps |
| 8. Openness | Publish the privacy policy (`privacy-policy.md`) |
| 9. Individual access | Respond to access requests within **30 days**. Provide a self-serve export and account deletion in the app |
| 10. Challenging compliance | Complaint process; escalation to the Office of the Privacy Commissioner (OPC) |

- ☐ **Breach reporting:**
  - Report to the OPC any breach of security safeguards that creates a **real risk of significant harm**, as soon as feasible.
  - Notify affected individuals, and other organizations that can reduce the harm.
  - **Keep records of *all* breaches for 24 months.**
  - Write a 1-page incident-response plan now.
- ☐ **Roles and data ownership.** The merchant owns its customer relationship and can export all of its customer data (CSV for every kind of record and one ZIP, on a paid plan and free for 90 days after leaving: `apps/api/src/services/merchant-export.ts`, tests in `apps/api/test/merchant-export.test.ts`). Local Loyalty owns the network account (one login across shops). Document in the merchant agreement who is responsible for what. When a merchant uses member data for its own marketing, the merchant is accountable for its CASL and PIPEDA compliance.
- ☐ **Data residency.** Host the primary database and backups in a Canadian region where practical (PRD non-functional requirement). Disclose the cross-border processors (Stripe, Twilio, Meta WhatsApp Cloud API, Resend, Expo, Apple/Google, Cloudflare R2 (the photo store), map tiles, analytics providers, which may process data in the US). PIPEDA permits transfers with transparency and contractual safeguards.
- ☐ **File storage (Cloudflare R2).** Photos and exports live in one private R2 bucket (`docs/engineering/storage-go-live.md`). R2 has no Canada jurisdiction: a location hint (`enam`/`wnam`) is best effort, so state "North America", not "Canada", in the privacy policy and do not promise Canadian residency for files. Accept Cloudflare's DPA, confirm the lifecycle backstop matches `packages/shared/src/retention.ts`, and keep the bucket private (no public domain). **VERIFY** the current location options before launch.
- ☐ **Location.** Use coarse or approximate location by default. Get precise location only with opt-in for nearby features; do not store location history beyond 30 days.
- ☐ **Minors.** Accounts are 16+ unless counsel approves otherwise (**VERIFY** with counsel). No targeted promos to known minors.
- ☐ **Privacy impact assessment** before launching nearby push, ads targeting and BIA data reports.

## 3. Pharmacies: Ontario College of Pharmacists and O. Reg. 681/93

Ontario prohibits loyalty points, bonuses or inducements tied to **prescriptions and pharmacy services** ([OCP policy](https://ocpinfo.com/pharmacy-professionals/rules-and-standards-of-the-profession/practice-policies-guidelines/loyalty-points-program/), [O. Reg. 681/93](https://www.ontario.ca/laws/regulation/930681/v1), cited in the PRD).

- ☐ Pharmacy onboarding template: **`loyalty.no_earn_categories` is ON by default**, with Rx, dispensing fees and professional services (vaccinations, medication reviews and other pharmacy services) set to no-earn. This feature already exists in plans.ts.
- ☐ **No redemption against prescriptions or pharmacy services**, including network points earned elsewhere. **No network perk** may be triggered by a pharmacy visit that involves a prescription. Count only front-store purchases.
- ☐ Digital discount cards at pharmacies must exclude Rx and pharmacy services. The PRD already requires the excluded category.
- ☐ Pharmacist-owner signs a pharmacy addendum confirming the setup. Rep checklist: verify the excluded categories at install.
- ☐ Never collect, store or display prescription data, which is health information. Pharmacies award points only on the front-store subtotal.
- ☐ **VERIFY** with OCP or counsel whether bonuses for pharmacy *visits* (as opposed to purchases) are permitted. Default: not permitted.

## 4. Alcohol (AGCO) and other restricted products

- ☐ Licensed venues (restaurants, bars, breweries, wineries, bottle shops) are subject to the *Liquor Licence and Control Act, 2019*, its regulations and AGCO Registrar's Standards:
  - pricing rules, including minimum prices;
  - advertising rules: no promoting excessive or rapid consumption, no appeal to minors;
  - **inducement / tied-house rules** between manufacturers and licensees.
- ☐ **Default: alcohol is a no-earn category** at licensed venues, with **no alcohol-specific promos or boosts**, until counsel confirms what loyalty and promotion is allowed. **VERIFY** with AGCO guidance.
- ☐ **No manufacturer-sponsored promos for licensees.** For example, a brewery may not pay for a bar's sponsored promo. Ads policy: a supplier must not fund placements for a licensee.
- ☐ Ads policy: no alcohol ads to users under the legal drinking age (19 in Ontario). Responsible-use wording.
- ☐ **Cannabis retailers, tobacco and vape shops: do not onboard.** Federal and Ontario rules sharply restrict promotion and inducements. **VERIFY** before ever reconsidering.
- ☐ Lottery products, firearms, adult content and payday lenders: excluded from ads.

## 5. Employment: student reps (Ontario *Employment Standards Act, 2000*)

> **Not used (decided Oct 2026).** There are no paid sales reps: the founder and remote onboarding agents do onboarding, and the product has no rep commission, bonus or earnings screen. This section applies only if the plan changes and paid reps are hired later.

The PRD's original idea of **commission-only student interns is not allowed.** Most interns are employees owed minimum wage. Unpaid placements are lawful only inside qualifying school programs ([McMillan](https://mcmillan.ca/insights/internal-affairs-managing-unpaid-internships-in-ontario/), cited in the PRD).

- ☐ Reps are **hourly employees at or above minimum wage: $17.95/hr from Oct 1, 2026** ([Hicks Morley](https://hicksmorley.com/2026/04/01/ontario-minimum-wage-to-increase-october-1-2026/), cited in the PRD). It is indexed each Oct 1. Add the activation bonus ($25) on top; it is wages, so include it in vacation pay and payroll deductions.
- ☐ Pay for **all hours worked**: visits, travel *between* merchants, training, day-7 and day-30 check-in calls, and admin. Reimburse transit and mileage.
- ☐ 4% vacation pay (6% after 5 years), public holiday pay, the 3-hour rule, eating periods, overtime after 44 hrs per week, and written wage statements.
- ☐ Payroll deductions (CPP, EI, income tax), a CRA payroll account, ROEs, T4s. **WSIB:** confirm whether registration is mandatory for our industry classification (**VERIFY**).
- ☐ Give each new employee the ESA poster and the required written information about the job before the first shift. **VERIFY** current "Working for Workers" disclosure requirements, which vary by employer size.
- ☐ Use **co-op placements** only through accredited school programs, with a placement agreement.
- ☐ Before engaging anyone as an **independent contractor**, get a lawyer to check misclassification risk (see `rep-contractor-agreement-notes.md`).
- ☐ Health & safety: a lone-worker and visit-safety policy; training under the *Occupational Health and Safety Act*. Also a workplace harassment policy and program, which is required.

## 6. Consumer protection: points, gift cards, repairs, contests

- ☐ **Points expiry.** Ontario's *Consumer Protection Act, 2002* (amended by the Protecting Rewards Points Act, 2016) **prohibits expiring reward points solely because time has passed.** Our policy is stricter: **points never expire**. **VERIFY** the interaction with the new *Consumer Protection Act, 2023* when it comes into force, and any inactivity-based exceptions. We will not use them anyway.
- ☐ **Gift cards** (if ever sold): Ontario gift-card rules prohibit expiry dates and most fees. Treat any stored value as a gift card. **Not in scope for MVP.** Do not let customers buy points.
- ☐ **Drop lesson** (PRD: complaints and a class action over hard-to-redeem points): show balances and redemption options at every shop; do not change earn or redeem values retroactively; give 30 days' notice of program changes; publish the rewards terms (`rewards-terms.md`).
- ☐ **Merchant exit.** A leaving merchant must honour its outstanding points for at least 60 days, and customers are notified. Platform-funded network points remain redeemable network-wide.
- ☐ **Repairs to motor vehicles and other goods** (CPA 2002, Part VI). This applies to Pro quote approval for auto and other repair shops:
  - written estimates on request;
  - no charge more than **10% above the estimate** without the customer's authorization;
  - authorization records;
  - the statutory warranty on vehicle repairs.
  - Product requirement: the quote-approval flow stores the estimate, the approval timestamp and the approver, and blocks invoices more than 10% over an approved estimate unless re-approved. **VERIFY** the details with counsel.
- ☐ **Electronic signatures** for quote approval: Ontario's *Electronic Commerce Act, 2000* generally recognizes e-signatures. Keep the audit log (PRD).
- ☐ **Internet agreements.** Disclose the total price, cancellation terms and renewal for subscription merchants. Merchant subscriptions are B2B, but treat sole proprietors carefully.
- ☐ **Contests** (passport-week prize baskets, BIA draws): include a **skill-testing question**, no purchase necessary (or an equal free entry method), and published rules disclosing the number, value and odds of prizes and the closing date (*Competition Act* s.74.06; *Criminal Code* s.206). Template the rules.

## 7. Competition Act: deceptive marketing

- ☐ "**Free forever**" must be literally true for everything on the Free plan. Rule 3 in plans.ts guarantees features never move to paid; the Merchant Agreement must say the same. Publish "what's free" and "what's paid" in plain terms.
- ☐ No **drip pricing**: show all mandatory fees up front. For payments, show Stripe's processing fee plus our platform fee together (the fee table in the merchant agreement is generated from `FEES` in plans.ts and a test checks it against `fees.ts`). Keep the Free-plan promise exact: "no subscription fee and no fee on the loyalty program" is true; "no transaction fees" is not, because Free shops pay 1.5% on online orders. Fix the Free-plan blurb in `PLANS.free.blurb` and any marketing copy that still says "no transaction fees". **VERIFY**
- ☐ Competitor comparisons (such as SoPoints' 5% fee) must be accurate, current and substantiated. Keep screenshots with dates; **VERIFY** before publishing.
- ☐ Clearly label **sponsored listings, promos, pins and boosts as "Sponsored"**. No fake reviews or testimonials; disclose any incentive behind a merchant testimonial.
- ☐ Performance claims made to BIAs and merchants (such as "+20% visits") need adequate and proper testing before they are made.
- ☐ Note: since June 2025, private parties can bring deceptive-marketing cases to the Competition Tribunal with leave. **VERIFY**

## 8. Accessibility (AODA)

- ☐ Comply with the Customer Service Standard and the Integrated Accessibility Standards (O. Reg. 191/11) as headcount grows. For example, organizations with 50+ employees must meet **WCAG 2.0 AA** for websites, and organizations with 20+ file compliance reports. **VERIFY** current thresholds.
- ☐ Build to **WCAG 2.1 AA** from day 1 regardless of size: the customer app, wallet pass, merchant dashboard and counter flow. It is cheaper now than retrofitting, and BIAs and larger merchants may require it. Run the design team's accessibility review before launch.
- ☐ Accessible formats for policies on request; an accessibility feedback contact.

## 9. Payments: PCI DSS, Stripe and the Retail Payment Activities Act

- ☐ Use Stripe-hosted fields only (Checkout, Elements, Payment Element) so card data never touches our servers. That keeps PCI scope at **SAQ A**, with an annual self-assessment. Never log card numbers.
- ☐ Stripe Connect: merchants complete Stripe's identity verification (KYC). Choose the account type (Standard, Express or Custom) with counsel and finance; it determines who pays processing and Connect fees. The model assumes platform-paid Connect costs of 0.25% + $2 per account (**VERIFY**).
- ☐ **Retail Payment Activities Act** (Bank of Canada registration of payment service providers, in force 2024). Confirm whether our role in Stripe Connect flows (collecting the platform fee of 1% on deposits and invoices and 1.5% on Free-plan orders, any holding of funds) requires registration or fits an exemption. **VERIFY with counsel before Phase 2.**
- ☐ Refunds, disputes and chargebacks: the merchant agreement allocates them to the merchant. The platform fee is not refunded on chargebacks unless counsel advises otherwise.
- ☐ Deposits on repair quotes must be clearly refundable or non-refundable, disclosed before payment.

### 9.1 GST/HST and food safety (tiffin, catering, banquet)

- ☐ Each restaurant says whether it is registered for GST/HST (Settings, How you get paid). Registered shops charge tax on prepared meals, including a mandatory service charge (tips are not taxed and are not on quotes) and print their number; small suppliers under $30,000 in sales over four quarters in a row may charge none, and the quote says "No HST charged (small supplier)". We check the number's format only and never verify it with the CRA. **VERIFY meal taxability and the small supplier rules with an accountant** (CRA RC4022).
- ☐ Interac e-transfer is recorded by the shop by hand: there is no Interac API. The record panel says to check the bank first, the ledger is append-only (a mistake is voided with a reason, never edited), and every record and void is in the audit trail. We never ask an owner to click a link in an email. Fake "e-transfer received" emails are a known scam.
- ☐ Food handler certification and the public health unit notice are the shop's own responsibility. We keep optional reminder dates, never block selling, never say a kitchen is approved, and show a "Certified food handler" badge only when the owner turns it on. Peel no longer runs its own course; point owners to a Ministry-approved provider.
- ☐ Reminders for a late hand payment follow the quiet rule (nothing from 21:00 to 08:00) and are transactional about a subscription the customer chose.

## 10. Quebec (only if expanding)

- ☐ **Law 25** (the Act respecting the protection of personal information in the private sector):
  - a designated person in charge (by default the CEO);
  - **privacy impact assessments before transferring data outside Quebec**;
  - confidentiality incident register and reporting to the CAI;
  - privacy by default (highest privacy settings);
  - transparency about automated decisions;
  - a data-portability right.
- ☐ **Charter of the French language (Bill 96):** French versions of the app, contracts of adhesion (ToS, rewards terms, merchant agreement) and marketing; French must be at least equal.
- ◐ **The sales assistant serves Quebec visitors in French** (disclosure, fixed notices, widget and replies; see section 12 and `counsel-notes.md`). The marketing pages, the app and the English-only contracts are still not in French.
- ☐ The Quebec *Consumer Protection Act* has its own rules on loyalty points and contracts. **VERIFY** before launch.
- ☐ Budget: $10–20k for French translation and legal review (assumption).

## 11. New modules (appointments, tiffin, catering, WhatsApp, phone AI, repairs, reviews)

Added Oct 24, 2026 after `docs/business/data-strategy.md`. Status shows what the code does today, so the work left is visible.

**CASL**

- ☑ **Onboarding nudges to shop owners** (`services/onboarding.ts`): every text names us, says "Reply STOP to stop" and carries a one-step unsubscribe link (`/v1/public/onboarding/unsubscribe`, no sign-in; email carries the same link). STOP replies are honoured (`comm_opt_outs`); tests in `apps/api/test/opt-out.test.ts`. ☐ Still open: capture express consent wording at sign-up, or confirm the implied-consent route with counsel (**VERIFY** the 2-year rule).
- ☐ **Rebooking and pickup-reminder nudges to shoppers** (`services/rebooking.ts`) are CEMs: they go only to members with marketing consent for that shop who have not muted it, name the shop, and carry "Reply STOP" on SMS. Keep the cap of one nudge per service per cycle and two without a visit. Pickup reminders for a finished repair are service messages: keep every promotional line out of them.
- ☐ **Appointment confirmations and reminders** are transactional (they confirm a booking the customer made). Keep them free of offers.
- ☑ **STOP handling**: SMS (Twilio webhook) and WhatsApp STOP, ARRET, UNSUBSCRIBE, END, CANCEL, QUIT (plus STOPALL, REVOKE, OPTOUT) record an opt-out per number (`comm_opt_outs`, `services/opt-out.ts`); START resubscribes. Honoured by campaigns and automations, onboarding nudges, rebooking nudges, review requests, tiffin, catering and pickup reminders, wait-list texts, driver links and WhatsApp sends. Email unsubscribe stays per shop. One list of words in `packages/shared/src/opt-out.ts`.
- ☐ **WhatsApp:** marketing only inside Meta's template rules, only to opted-in customers; the 24-hour window for free-form replies is enforced in `services/whatsapp.ts`.
- ☐ **Quiet hours:** nothing promotional from 21:00 to 08:00 local (recommended; some flows already enforce it).

**Phone AI (restaurant.phone_ai)**

- ☑ The greeting says the call is turned into text and the text is saved, in English, French, Hindi, Urdu and Punjabi, before the order prompt (`TRANSCRIPT_NOTICE` in `services/phone.ts`; test in `apps/api/test/phone.test.ts`). ☐ Have a native speaker of each language check the wording.
- ☐ If we ever store or record call **audio**, change the notice (recording), and add audio to the privacy policy and the retention schedule. Today only the speech-to-text result is stored (`phone_calls.transcript`).
- ☐ Provider settings: turn off provider-side call recording and transcription retention (Twilio) unless the notice covers it. **VERIFY**
- ☐ A person confirms every phone order before it becomes an order (`confirmCall`); keep it that way, since that is what lets us say no automated decision is made about the caller. Law 25 requires telling people when a decision is based exclusively on automated processing.
- ☐ Transcripts are never sold, licensed or used to train models (data-strategy section on transcripts; OPC joint findings on OpenAI, May 6, 2026).
- ☐ Merchants may also run their own recording; the merchant agreement (4.5) puts that on them.

**Retention (nothing is deleted automatically yet; decide the periods, then build the jobs)**

- ☑ **Phone transcripts and WhatsApp messages**: deleted by the `privacy.retention` job after the period in `packages/shared/src/retention.ts` (`services/retention.ts`).
- ☑ **Uploaded repair photos**: files deleted from the object store (`StorageProvider.delete`) then the links, 24 months after the ticket closes. ☑ Photos are served only through short-lived HMAC-signed URLs, made at read time (15 minutes; `providers/storage.ts`, tests in `apps/api/test/uploads-signed.test.ts`); the database keeps only the storage path, and the privacy policy says so (section 4). ☐ Before launch with a hosted object store: implement `signedUrl` (presigned GET) on that provider.
- ☑ **Review feedback** (`review_requests.feedback`, `reply_body`): deleted after the period in `retention.ts`.
- ☑ **Tiffin addresses** and notes: cleared after the period for cancelled subscriptions; driver link rows deleted after the period (links expire the same night).
- ☑ **Allergy notes** on orders cleared after the period once the order is done; WhatsApp allergy notes with the chat. Free text a customer chose to give a shop: do not use it for marketing or analytics.
- ☑ **Account deletion** (`deleteAccount` in `services/customer.ts`, `services/privacy-scrub.ts`) now reaches appointments, tiffin, catering, hall bookings, WhatsApp, calls, reviews, tickets, quote signatures, orders, wait lists, referrals, consents, wallet passes and push tokens; money records stay with amounts only. Tests: `apps/api/test/privacy-deletion.test.ts`. The do-not-contact entry is kept on purpose (counsel to confirm).
- ☑ The retention schedule is written once, in `packages/shared/src/retention.ts`; the privacy policy prints it through `{{retention.*}}` tokens and a test checks the page (`apps/web/test/legal-pages.test.ts`).

**Other**

- ☐ **Halal and dietary tags** are menu data entered by the shop, not data about the customer. Do not infer or store a customer's religion or diet from what they order or filter. The shop owns the claim (`halalCertifier`, certification file); do not make our own halal claims. Keep "Zabihah" wording as the shop states it. **VERIFY** advertising rules on halal claims (Competition Act, misleading representations).
- ☐ **Birthday** is stored as month and day only (done Oct 24, 2026). Keep every import, export and message free of a year.
- ☐ **Driver links** show a customer's name, phone and address for one route and one day: keep the token unguessable, expiry the same night, rate limit (120 a minute) and no search-engine indexing.
- ☐ **E-signature and approval records** for quotes and catering keep the signer's IP and device: list them in the privacy policy (done) and keep them as long as the dispute period.
- ☐ **Privacy impact assessment** for the new modules and for the phone assistant (voice, transcripts, a third-party speech-to-text) before launch; required before transfers outside Quebec if we serve Quebec.
- ◐ **French:** the phone notice now includes French (fr-CA) and the privacy policy and rewards terms have French versions at `/legal/privacy?lang=fr` and `/legal/rewards?lang=fr`. ☐ Have a Quebec lawyer or certified translator review all three (see `counsel-notes.md`). ☐ Decide whether the Terms of Service and Merchant Agreement need French versions.

## 12. Platform policies

- ☐ Apple App Store and Google Play: loyalty programs and in-app purchases. Points cannot be bought with real money via the app without in-app purchase rules applying, so don't sell points. Wallet pass guidelines.
- ☐ Twilio and carrier rules for Canadian SMS: register sender numbers (toll-free verification or 10-digit long code registration as required); carrier content rules; quiet hours (recommend 9 pm–8 am local).
- ☐ An Acceptable Use Policy for merchants: no prohibited products (section 4), no misleading promos.

---

## Launch gate: legal must-haves before the pilot strip (month 5)

1. Incorporation, IP assignment, insurance.
2. Lawyer-reviewed ToS, privacy policy, rewards terms and merchant agreement.
3. CASL consent capture per merchant, plus network consent, with audit logs and unsubscribe.
4. Pharmacy no-earn template locked on.
5. Reps on payroll at ≥ $17.95/hr plus bonus.
6. Contest rules template.
7. A breach-response plan.
8. Canadian-region hosting.

## 12. Sales and support AI assistant (website chat and our own WhatsApp number)

Added Oct 25, 2026. Code: `apps/api/src/services/sales-agent/*`, `packages/shared/src/sales-agent.ts`. Research and sources: `docs/research/sales-agent.md`. Status shows what the code does today.

**WhatsApp Business policy (Meta)**

- ☑ **Automation is allowed for a business's own customer conversations**, with prompt, clear and direct escalation paths: "HUMAN" (in en, hi, ur, pa) and the `escalate_to_human` tool hand the chat to a person in the console. Meta's January 15, 2026 change bans AI providers whose assistant is the product itself (general-purpose chatbots); ours answers questions about our own service, which is the permitted use. ☐ **VERIFY** the current text of the WhatsApp Business Solution Terms and Messaging Policy when the number is registered, and that the display name and business category describe us, not an AI product.
- ☑ **Opt-in:** a person who messages our number first is in the customer-service window; we only reply to them. We send nothing business-initiated from this number (no templates, no broadcasts), so no template approval or marketing opt-in is needed. ☐ If we ever send a follow-up outside the window it needs an approved template and an opt-in captured in the flow; decide before building it.
- ☑ **24-hour window:** a person's reply from the console is refused outside 24 hours after the contact's last message (`sendWhatsAppText`; test in `apps/api/test/sales-agent.test.ts`).
- ☑ **STOP / START:** the same word list and the same `comm_opt_outs` table as every other sender. After STOP nothing is sent except the one confirmation; START resumes (`handleInbound`).
- ☐ Register the number as its own WhatsApp Business account (not a merchant's); set `SALES_AGENT_WHATSAPP_NUMBER` and `SALES_AGENT_WHATSAPP_PHONE_NUMBER_ID`; point the existing webhook at it.

**Disclosure, consent and privacy**

- ☑ The first message of every chat says it is an AI assistant, in the person's language, how to reach a person and (WhatsApp) how to stop. Fixed text in code, not model output (`AGENT_TEXTS`, packages/shared/src/sales-agent.ts). ☐ Have a native speaker of Hindi, Urdu and Punjabi check the wording.
- ☑ Privacy policy (English and French) covers the assistant, names **Anthropic** as a service provider that processes the chat text (possibly in the US), says it does not train on it, and prints the retention period from `RETENTION.salesAgentDays` (90 days). ☐ **VERIFY** the data-processing and no-training terms of the Anthropic account we use (commercial API terms; zero-data-retention is not required for this assistant) and that the account's region and retention settings match the policy.
- ☑ Retention: `purgeSalesAgentChats` (job `privacy.retention`) deletes conversations, messages and tool records 90 days after the last message. Account deletion deletes the chats tied to that number or verified owner (`privacy-scrub.ts`).
- ☑ Log minimisation: tool-call records and audit rows carry masked numbers and emails; the server never logs message text; error logs carry the error class only; the SMS code is checked in code and never stored or sent to the model.
- ☑ No automated decision about a person: the assistant cannot approve, refuse or price anything outside `plans.ts`; anything uncertain goes to a person (Law 25 transparency about automated processing).
- ◐ **Quebec visitors are served in French by the assistant.** `fr` (fr-CA) is in `AGENT_TEXTS` and `WIDGET_TEXTS`: the AI disclosure, STOP / START / HUMAN, hand-off, offline, text-only, rate-limit and SMS-code texts and the widget are French, the language is picked when the person writes French, the French widget shows for a French browser or `?lang=fr`, and the model replies in French from the same English knowledge, with the price and fee guard reading French number formats ("39 $", "1,5 %", "avant TPS/TVH"). The rest of the marketing site is English only (see section 10). ☐ Have a Quebec translator or lawyer review the French wording (`counsel-notes.md`, "Traduction — à faire réviser: assistant de vente et de soutien").

**CASL**

- ☑ The assistant sends nothing unsolicited and no marketing. A lead it saves is created only after the person confirmed, with the contact details they gave, and says what the team will do with them; replies to an inquiry are covered by the implied-consent period for inquiries (6 months, CASL s. 10(10)), and every follow-up still names us and gives an unsubscribe. ☐ **VERIFY** with counsel how reps follow up on leads created this way.
- ☐ Sender identification on the platform WhatsApp number: the business profile shows our name, a mailing address and a contact method.

**Competition Act and what it may promise**

- ☑ The assistant states only figures that appear in `plans.ts` (plans, annual prices, add-ons, fees, founding offer and its derived prices), in a tool result this turn, or in the person's own message; otherwise the reply is held back, retried once, and handed to a person (`guard.ts`). Prices are always "before HST"; the fee table includes the 1% on deposits and the pass-through card fees, so there is no drip pricing in the chat.
- ☑ It will not promise results, guarantees, risk-free or money-back terms, a free trial, refunds or dates. Unknowns ("how will HST appear on invoices", custom deals, integrations, refunds) are "I'll check with the team" plus a hand-off.
- ☑ Legal text is quoted as a draft until counsel signs it off.

**Operations**

- ☑ Owner look-ups and checkout links need an SMS code to the owner's number; the code is sent only to a number that belongs to an owner, the answer is the same either way (no probing), and tools take no merchant or user id from the chat.
- ☐ Decide who watches the hand-off queue and in what hours; the queue is `/admin/sales-agent` and each hand-off emails `SALES_AGENT_ADMIN_EMAIL` (default `BRAND.supportEmail`).
- ☐ Cost ceiling: `SALES_AGENT` limits are 30 messages per conversation per hour, 40 per contact per hour, 3,000 per day in total (`SALES_AGENT_LIMITS`). Set an Anthropic spend limit on the key as a second ceiling.
