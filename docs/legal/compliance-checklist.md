# Local Loyalty — Compliance checklist (Canada / Ontario)

Oct 21, 2026 · Business ops (legal/compliance) · **Not legal advice.**

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

Ontario has no general private-sector privacy statute, so **PIPEDA applies**. Bill C-27, which would have created the Consumer Privacy Protection Act, died when Parliament was prorogued in Jan 2025. Monitor for successor legislation (**VERIFY** current status).

The 10 fair information principles, and what each means for us:

| Principle | What we do |
| --- | --- |
| 1. Accountability | Appoint a Privacy Officer (the founder). Publish their contact. Contracts with processors: Stripe, Twilio, hosting, email, Apple/Google wallet |
| 2. Identifying purposes | The privacy policy lists purposes: loyalty ledger, network perks, messages the customer consented to, fraud prevention, aggregated BIA reports |
| 3. Consent | Meaningful consent at join, in plain language, with layered notices. Express consent for sensitive uses (precise location for nearby push). Separate consent for marketing (CASL) |
| 4. Limiting collection | Collect phone number, first name and optional birthday month/day (no year). **No health data from pharmacies**: front-store only, never prescription information |
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
- ☐ **Roles and data ownership.** The merchant owns its customer relationship and can export its member list (CSV export is Free in plans.ts). Local Loyalty owns the network account (one login across shops). Document in the merchant agreement who is responsible for what. When a merchant uses member data for its own marketing, the merchant is accountable for its CASL and PIPEDA compliance.
- ☐ **Data residency.** Host the primary database and backups in a Canadian region where practical (PRD non-functional requirement). Disclose the cross-border processors (Stripe, Twilio, Apple/Google, email and analytics providers, which may process data in the US). PIPEDA permits transfers with transparency and contractual safeguards.
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
- ☐ No **drip pricing**: show all mandatory fees up front. For payments, show Stripe's 2.9% + $0.30 plus our 0.75% together.
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
- ☐ **Retail Payment Activities Act** (Bank of Canada registration of payment service providers, in force 2024). Confirm whether our role in Stripe Connect flows (collecting the 0.75% platform fee, any holding of funds) requires registration or fits an exemption. **VERIFY with counsel before Phase 2.**
- ☐ Refunds, disputes and chargebacks: the merchant agreement allocates them to the merchant. The platform fee is not refunded on chargebacks unless counsel advises otherwise.
- ☐ Deposits on repair quotes must be clearly refundable or non-refundable, disclosed before payment.

## 10. Quebec (only if expanding)

- ☐ **Law 25** (the Act respecting the protection of personal information in the private sector):
  - a designated person in charge (by default the CEO);
  - **privacy impact assessments before transferring data outside Quebec**;
  - confidentiality incident register and reporting to the CAI;
  - privacy by default (highest privacy settings);
  - transparency about automated decisions;
  - a data-portability right.
- ☐ **Charter of the French language (Bill 96):** French versions of the app, contracts of adhesion (ToS, rewards terms, merchant agreement) and marketing; French must be at least equal.
- ☐ The Quebec *Consumer Protection Act* has its own rules on loyalty points and contracts. **VERIFY** before launch.
- ☐ Budget: $10–20k for French translation and legal review (assumption).

## 11. Platform policies

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
