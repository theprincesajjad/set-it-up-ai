# Local Loyalty — Bootstrap budget, grants and when to raise

Oct 21, 2026 · Finance & business ops · CAD

All figures come from `docs/finance/model/` (see `unit-economics.md`) unless they are marked as a source.

> **Program availability changes often.** Every grant or loan below is marked **Verified** (checked against the source on Oct 21, 2026) or **VERIFY** (from general knowledge; confirm the amount, eligibility and intake dates before planning around it). None of them is included in the financial model.

---

## 1. First 12 months: bootstrap budget (Nov 2026 – Oct 2027)

The months cover the MVP build (months 1–4), the pilot strip (launching month 5, Mar 2027) and the first expansion strips.

| Line | Base case | Lean plan (recommended) | Basis |
| --- | --- | --- | --- |
| Part-time developer | $48,000 | $24,000 | PRD: ~$4,000/mo. Lean assumes a co-founder on equity, or the founder builds with AI-assisted tooling and buys about $2,000/mo of contract help |
| Fixed overhead: hosting base $250, SaaS $250, insurance $150, bookkeeping $250, app stores $15, phone $100, marketing $300, legal reserve $150 | $17,580 | $17,580 | Assumptions (`fixed_*`). The PRD said ~$1,500/mo |
| One-time: incorporation + employment-lawyer call ($3,500), trademark/domain ($1,500), lawyer review of ToS/privacy/merchant agreement ($3,000) | $8,000 | $8,000 | Assumptions |
| Merchant acquisition: rep wages, activation bonuses, kits, strip launches | $9,238 (4 strips, ~78 signed) | $11,938 (5 strips, ~100 signed) | Rep wage $17.95/hr from Oct 1, 2026 (PRD); see unit-economics.md §2 |
| Variable costs: free-merchant infra and support, SMS, perks | $1,531 | $1,950 | Assumptions |
| Revenue | $0 | $117 (Pro beta from month 11) | |
| **Net cash out, year 1** | **$84,349** | **$63,351** | `output/monthly_projection.csv`, `output/monthly_lean_plan.csv` |
| Contingency, 20% (recommended) | $16,900 | $12,700 | |
| **Cash to have committed for year 1** | **~$101k** | **~$76k** | |

How the cash need builds up over time:

| Point in time | Base case (cumulative) | Lean plan (cumulative) | Lean, with 20% buffer |
| --- | --- | --- | --- |
| End of year 1 | $84k | $63k | |
| End of year 2 | $197k | $146k | |
| End of year 3 | $323k | $197k | |
| Peak need to break-even | ~$421k (month 60) | ~$199k (month 39) | **~$240k** |

The founder takes no salary in either plan.

**Monthly shape (lean plan).** Months 1–4 cost about $4.4k–7.4k/mo: developer, overhead and one-time legal costs. From the pilot launch (month 5) to month 12, add about $0.5k–2.5k/mo of rep wages and bonuses.

**Spending rules:**

1. No strip N+1 until strip N passes its gate: ≥ 60% activation, ≥ 50 members per active merchant and ≥ 20% multi-shop customers within 60 days.
2. Rep hours are capped at 2.5 per signed merchant.
3. The developer budget is fixed. Scope gets cut before spend increases.
4. Keep runway of 9 months or more. Below 6 months, pause strip launches and focus on BIA sales and Pro conversions.

---

## 2. Non-dilutive money and programs (Ontario / Toronto)

| Program | What it is | Realistic value for us | Fit and timing | Status |
| --- | --- | --- | --- | --- |
| **SR&ED** (federal) | Refundable 35% investment tax credit for Canadian-controlled private corporations (CCPCs) on qualifying R&D. The enhanced expenditure limit rises to **$6M** under Budget 2025, for tax years starting on or after Dec 16, 2024 ([Mintz](https://www.mintz.com/insights-center/viewpoints/2906/2025-11-12-innovate-baby-innovate-key-enhancements-canadas-sred), [Leyton](https://leyton.com/ca/en/insights/articles/navigating-federal-sred-and-innovation-incentives-in-2026)) | Only work with genuine technological uncertainty qualifies: for example offline-first ledger sync on 3-year-old phones, POS auto-award matching, fraud detection. Routine app building does not. Perhaps **$5–15k/yr** on $40–60k of developer spend | File after the first fiscal year end. Keep contemporaneous notes such as git logs and experiment notes. Contractor costs are only partly eligible | Limit reported as confirmed in 2026 secondary sources; **VERIFY** enacted status with the CRA |
| **Ontario Innovation Tax Credit** | Refundable Ontario credit stacked on SR&ED | A few $k/yr | Filed with SR&ED | **VERIFY** rate and eligibility |
| **NRC IRAP** | Advisory services, plus funding for innovation projects at small and medium-sized businesses, usually as a share of eligible *employee* salaries | Typically meaningful only once you have payroll employees (for example a salaried developer). It can also fund youth hires | Contact an Industrial Technology Advisor (ITA) early, around month 3–6, even before you qualify; the relationship matters | **VERIFY** current intake and terms |
| **Futurpreneur** (with BDC) | Collateral-free startup loans **up to $75,000**, plus a mentor. Founders aged 18–39; business up to 24 months old ([Futurpreneur, Sept 2024](https://futurpreneur.ca/en/?p=10931)) | Up to $75k of *debt*. It covers about 1 year of the lean plan, but must be repaid | Apply around month 3–6 with the pilot plan. Other 2026 guides cite a lower $60k structure ([example](https://welcomeaide.com/am/blog/business-grants-funding-programs-newcomers-canada-2026)) | **VERIFY** current limits on futurpreneur.ca |
| **Starter Company Plus** (City of Toronto / Ontario) | **$5,000 micro-grant**, up to 15 hrs of training and up to 6 months of mentoring. You must have invested 25% ($1,250) yourself, work 35+ hrs/week on the business and not be employed elsewhere ([City of Toronto](https://www.toronto.ca/business-economy/business-operation-growth/business-incentives/starter-company-plus-grant/), [BetaKit](https://betakit.com/ontario-govt-giving-entrepreneurs-up-to-5000-access-to-mentorship-to-help-companies-scale)) | $5,000 | **Intake currently closed** per the City page. Subscribe to the BusinessTO newsletter for the next round | Verified (closed as of the search) |
| **Canada Digital Adoption Program (CDAP)** | Small-business digital adoption grants | **None.** The Boost Your Business Technology stream closed to new applications on **Feb 19, 2024** ([BDC](https://www.bdc.ca/en/canada-digital-adoption-program)). It is not available to us or to merchants | Use it as a sales line instead: "CDAP is gone; we're free" | Verified closed |
| **Canada Summer Jobs** | Wage subsidy for employers hiring youth aged 15–30 in summer. Private-sector employers have historically received up to ~50% of minimum wage | Could subsidise summer student reps (May–Aug 2027): perhaps $3–6k | **Applications usually open in Nov–Jan**, so check *now* for the summer 2027 intake | **VERIFY** |
| **Co-op and work-integrated learning subsidies** (Student Work Placement Program via sector partners; university and college co-op offices) | Wage subsidies for hiring students in accredited co-op placements; historically 50–70% of wages up to a cap | A co-op student rep or developer at partial cost. This is also the lawful route the PRD recommends for credit placements | Talk to TMU, George Brown, Humber, Seneca and UofT co-op offices about Jan or May 2027 terms | **VERIFY** (program funding has changed since 2024) |
| **Mitacs Business Strategy Internship / Accelerate** | Subsidised graduate or undergraduate interns on a research project, such as measuring network-effect lift for BIAs | One intern for 4–6 months at partial cost | Useful for BIA visit-lift studies in year 2 | **VERIFY** |
| **BDC startup financing / LIFT** | BDC loans, plus a newer LIFT offer for adopting digital tools ([BDC](https://www.bdc.ca/en/canada-digital-adoption-program)) | Debt; only after there is revenue | Later | **VERIFY** |
| **Digital Main Street** (Toronto Association of BIAs program, historically government-funded) | Helps main-street businesses go digital using "digital service squads" | **A channel more than money.** Partner to get warm intros to BIA merchants, or listed as a recommended tool | Approach in month 2–3 | **VERIFY** whether it is still running |
| **BIA partnerships** (TABIA and individual BIAs) | BIAs fund marketing and events from their levy | Revenue rather than a grant: $1,500–3,000 per campaign. Some BIAs may co-fund the pilot strip's launch event and passport prizes | Pitch 3 BIAs in the next 30 days (PRD) | Not a program; negotiate |
| **Incubators** (DMZ at TMU, ICUBE at UofT, YSpace at York, Founder Institute) | Mentors, perks and investor access; some take equity | Hosting and SaaS credits worth $5–25k (AWS/Stripe/Twilio startup credits) cut fixed costs | Apply in months 1–3. Pick a program that takes no equity, or a small amount | **VERIFY** current cohorts |

**Plan of record.** Planned non-dilutive cash in the first 24 months is roughly **$15–40k**:

| Source | Amount |
| --- | --- |
| Hosting/SaaS credits | $10–20k |
| SR&ED | ~$5–10k |
| Canada Summer Jobs or co-op subsidies | $3–6k |
| Starter Company Plus, if it reopens and you qualify | $5k |

Futurpreneur is a $75k **loan**, not income.

---

## 3. When raising makes sense

Do **not** raise before the pilot strip proves activation. A pre-revenue loyalty app with no density is the hardest kind of company to price, and it would cost you too much equity.

| Stage | Trigger (all must be true) | Raise | Use of funds |
| --- | --- | --- | --- |
| **Stay bootstrapped** | Pilot strip live but not yet past its gate | $0. Use savings, Futurpreneur and credits | Fix onboarding |
| **Pre-seed**, around months 10–14 (late 2027) | 1) Pilot strip passes its gate: ≥ 60% activation, ≥ 50 members per merchant, ≥ 20% multi-shop. 2) Strips 2–3 replicate it at ≤ $110 CAC per signed merchant. 3) **≥ 10 Pro deposits**, with ≥ 5 converted to paid. 4) **≥ 1 BIA campaign sold** (a letter of intent counts) | **$250–400k** on a post-money SAFE (Simple Agreement for Future Equity) from angels or a pre-seed fund | Fund the lean plan to break-even (~$200k) plus a 12-month buffer. Hire a full-time developer if the founder is not technical; keep paying hourly reps |
| **Seed**, around months 24–30 | ≥ 150 active merchants; ≥ 10 strips; ≥ 50 paying merchants and growing ≥ 10% month on month; BIA repeat purchase ≥ 50%; strip-level payback ≤ 18 months | $1.5–3M | GTA expansion (Mississauga, Brampton, Markham, Vaughan), city-launch playbooks, payments and order processing |
| **Never raise to** | | | Pay for customer acquisition before activation works, or to subsidise a transaction-fee price war with SoPoints |

---

## 4. What a seed investor will ask for

Have these on one page, by cohort and by strip:

1. **Density.**
   - Active merchants per strip.
   - Active customers per strip.
   - The share of a strip's eligible storefronts signed (target ≥ 35%).
2. **Network effects.**
   - Multi-shop customers %.
   - Cross-shop visits per customer per month.
   - How customers-per-merchant grows as the strip adds merchants. This is the moat proof: the 20th merchant should get more members faster than the 5th.
3. **Activation and retention.**
   - The 30-day activation rate.
   - Merchant retention, free and paid, by monthly cohort.
   - Customer 90-day retention.
4. **Monetization.**
   - Free→paid conversion by vertical.
   - Plus/Pro mix.
   - Net revenue retention of paying merchants.
   - In-app GMV and take rate.
   - BIA revenue per mature strip.
5. **Unit economics.**
   - CAC per signed, activated and paying merchant.
   - Contribution per paying merchant.
   - LTV/CAC (base model 2.6x, so investors will want ≥ 3x).
   - **Strip-level payback**: months for one strip's cumulative contribution to repay its launch and rep cost.
6. **Efficiency.**
   - Burn multiple (net burn ÷ net new annual recurring revenue).
   - Months of runway.
   - Revenue per rep hour.
7. **Competition.**
   - Strip-by-strip overlap with SoPoints and win rate in head-to-head deals.
   - Merchants migrated from other loyalty apps.
8. **Risk controls.** Investors will ask about the Drop class action (PRD). Show:
   - Points liability, broken down by merchant-issued versus platform-funded.
   - The redemption rate.
   - That points do not expire.
   - The CASL consent rate.
   - The legal review status (`docs/legal/`).

---

## 5. Founder checklist for the next 90 days (finance)

- [ ] Decide on the developer question first: co-founder on equity, the founder building, or a contractor. It moves the cash need by about $90k (base) or about $45k (lean).
- [ ] Incorporate as a CCPC; this is required for the refundable SR&ED rate. Open a business account. Set up bookkeeping from day 1 and track developer time by project for SR&ED.
- [ ] Apply for cloud, Stripe and Twilio startup credits.
- [ ] Check this winter's Canada Summer Jobs intake; contact 2 co-op offices.
- [ ] Book an IRAP ITA intro call. Ask Futurpreneur about eligibility.
- [ ] Pre-sell 1 BIA campaign at $1,500–2,250 for the pilot strip's 6-month mark. It is the most important assumption in the model.
- [ ] Collect 10 refundable $100 Pro pilot deposits from repair and auto shops.
