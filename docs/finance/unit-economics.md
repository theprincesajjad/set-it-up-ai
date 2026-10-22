# Local Loyalty — Unit economics, rollout gates and pricing

Oct 21, 2026 (Pricing v2 update Oct 22, 2026) · Finance & business ops · All money in CAD

This document explains the numbers in the financial model and turns them into decisions. The model is `docs/finance/model/model.py`. It uses the Python standard library only, and every assumption sits in one `ASSUMPTIONS` dict. The workbook is `docs/finance/model/local-loyalty-model.xlsx`, with live formulas checked against `model.py` to within 1e-13. Generated CSVs are in `docs/finance/model/output/`.

```bash
python3 docs/finance/model/model.py          # regenerates every CSV in output/
python3 docs/finance/model/build_xlsx.py     # rebuilds the workbook (needs openpyxl)
# recalculate in Excel/LibreOffice, then:
python3 docs/finance/model/build_xlsx.py --verify
```

**How to read the numbers.** A number tagged *(plans.ts)* or *(PRD)* comes from `packages/shared/src/plans.ts` or `docs/business/prd.md`. A number tagged *(source)* links to its source. **Every other number is an assumption.** Replace assumptions with pilot data as soon as you have it.

**The founder's model** (it overrides the PRD where they differ):

- Loyalty **and reporting on it** are free forever, with no transaction fee, unlimited locations and unlimited staff. Since **Pricing v2** (Oct 22, 2026) that is *all* that is free: promos, VIP/birthday/referrals, discount cards, email/SMS, CSV, POS auto-award and webhooks are Plus. See `docs/business/pricing.md`.
- Paid Plus ($39/mo) and Pro ($79/mo) plans, plus a 0.75% platform fee on in-app payments, start only after the network has density.
- Network monetization comes after that: BIA campaigns, sponsored placements, map pins and push boosts.

---

## 0. Pricing v2 (Oct 22, 2026): what the new free/paid split does to the numbers

**Decision.** Only the loyalty program and reporting on it stay free (see `docs/business/pricing.md`). Everything else moves to Plus/Pro and stays hidden until its rollout gate.

**What changed in `model.py`** (all assumptions; the old values are kept in `PRICING_V1` so `output/pricing_v2_comparison.csv` reproduces the before case exactly):

| Input | Pricing v1 | Pricing v2 | Why |
| --- | --- | --- | --- |
| Free-merchant infra (`infra_per_merchant`) | $1.00/mo | $0.60/mo | No email campaigns or POS sync on Free |
| Transactional SMS on Free (`txn_sms_per_customer`) | 0.3/customer/mo | 0 | No SMS on Free (reward-ready texts become a Plus automation) |
| Blended 12-month free→paid conversion after GA | 20% | **35%** base, 20% bear, 45% bull | Promos, marketing and POS auto-award are now behind the paywall. Per vertical (base): café 20→43%, retail 12→26%, repair 40→45%, personal services 15→32%, pharmacy 5→10% |
| Merchant acquisition (`strip_potential_merchants`) | 32 / strip | 27.2 (–15%) | Adoption risk: a thinner free tier signs fewer shops (bear 24→20.4, bull 38→32.3) |

The founder's brief described the old conversion as 25%. The model's actual v1 figure was 20% blended over 12 months (35% over 24 months). v2 targets 35% over 12 months.

**Before → after** (source: `output/pricing_v2_comparison.csv`):

| Scenario | Break-even month (60-month run) | Cash needed, months 1–36 | Cash needed to reach break-even | LTV/CAC (fully loaded) | Payback | Paying merchants, M36 |
| --- | --- | --- | --- | --- | --- | --- |
| **Base** | Month 60 (Oct 2031) → **month 51 (Jan 2031)** | $322,991 → **$302,028** | $420,715 → **$357,308** | 2.65x (1.93x) → **3.63x (3.05x)** | 12.6 → **9.2 mo** | 58 of 399 → 82 of 339 |
| Lean plan | Month 39 (Jan 2030) → **month 35 (Sep 2029)**, inside 36 months | $197,411 → **$167,965** | $199,398 → **$167,965** | 2.65x → 3.63x | 12.6 → 9.2 mo | 87 of 546 → 126 of 464 |
| Bull | Month 46 (Aug 2030) → **month 36 (Oct 2029)** | $297,223 → $250,864 | $315,811 → $250,864 | 5.52x → 7.40x | 8.1 → 6.0 mo | 162 of 797 → 241 of 678 |
| Bear | Not within 60 → not within 60 | $305,900 → $297,613 | $545,418 → $516,375 | 0.78x → 1.03x | 28.5 → 21.6 mo | 2 of 156 → **0 of 132** |

Per merchant (base): a free active merchant now costs **$3.87/mo** (was $4.62). CAC per paying merchant falls from $553 to **$373**, because more of the merchants we pay to sign end up paying. Contribution per payer falls slightly, from $43.90 to $40.65, because the new converts are mostly Plus (Pro share 36% → 27%, ARPU $53.56 → $49.93).

**Sensitivity of the base case:**

| Case | Break-even (60m) | Cash to break-even | LTV/CAC |
| --- | --- | --- | --- |
| v2 as modelled (35%, –15% acquisition) | Month 51 | $357,308 | 3.63x |
| No acquisition hit (35%, 32/strip) | Month 51 | $354,931 | 3.75x |
| –25% acquisition (35%, 24/strip) | Month 54 | $360,422 | 3.53x |
| Conversion only ~26% (–15% acquisition) | Month 57 | $385,875 | 2.91x |
| **Conversion doesn't move (~21%) but acquisition still –15%** | Month 60 | $405,603 | 2.47x |

Even the worst row is no worse than v1 ($420,715, month 60), because Free is cheaper to serve. **The upside depends almost entirely on conversion actually rising.** Measure it first.

**Risks:**

1. **Network density comes first.** Fewer free sign-ups mean the network reaches the gates later. In the base case Plus/Pro unlock at **month 24 instead of 22**. In bear the network never reaches 150 active merchants, so there is **no subscription revenue in 36 months**. Fewer shops per strip also weakens the customer side ("one card for the whole street"). Track signed shops per strip against the 27 assumed. If a strip stalls below about 20, sell harder on wallet pass + network listing (still free) before discounting Plus.
2. **Free must still win the counter.** The pitch is now "your loyalty program is free forever", not "everything is free". Sales copy, the website and the battlecards must not promise promos, email or POS auto-award on Free.
3. **SoPoints comparison: our Free is still more generous.** The lead checked sopoints.com/pricing on Oct 22, 2026. SoPoints Free is $0 + a 5% transaction fee, 1 location, a 4,000 points/month cap, no active rewards, no campaigns and basic analytics only. Starter is US$49/mo (2.5% fee, 2 locations, 10 rewards); Pro is US$79/mo (0% fee, 10 locations, unlimited rewards, 10 campaigns, birthday rewards, multiple staff); Enterprise is US$199/mo. Our Free (0% fee, unlimited rewards, locations and staff, reports) beats SoPoints Free and Starter on loyalty. Our Plus (C$39) covers what SoPoints charges US$79 for (campaigns, birthday rewards). The page doesn't say what the 5% applies to.
4. **Conversion is the whole bet.** Validate it on pilot shops with admin overrides before GA. Kill criterion: if blended conversion stays below about 25% after 6 months of GA, v2 is roughly break-even against v1 on cash but costs us network density.
5. **Free churn may rise** for merchants who used promos/email. The model keeps free churn at 1.5%/mo, and nothing is live yet, so no merchant loses anything today.
6. **Open engineering item.** SMS receipts (`smsReceiptsEnabled`, sent from `apps/api/src/services/staff.ts`) are still sent on Free. Gate them or the "no SMS on Free" cost assumption is optimistic (v1 put this at about $0.36 per free merchant per month).

The tables in sections 1–9 below now show **Pricing v2** where they come straight from the model outputs (section 1). The per-merchant breakdowns in sections 2–3 are the **v1** detail for reference; use the deltas above.

---

## 1. Headline results

| Scenario | Break-even inside 36 months? | Break-even month (60-month run) | Cash needed, months 1–36 | Cash needed to reach break-even | LTV/CAC | Payback |
| --- | --- | --- | --- | --- | --- | --- |
| Bear | No | Not within 60 | $297,613 | > $516,000 | 1.0x | 21.6 mo |
| **Base** (plans.ts gates as written) | **No** | **Month 51 (Jan 2031)** | **$302,028** | **$357,308** | **3.6x** (3.1x fully loaded) | **9.2 mo** |
| Base + recommended gates | No | Month 51 | $291,059 | $334,997 | 3.6x | 9.2 mo |
| **Lean plan** (recommended) | **Yes: month 35 (Sep 2029)** | Month 35 | **$167,965** | **$167,965** | 3.6x | 9.2 mo |
| Bull | Yes: month 36 (Oct 2029) | Month 36 | $250,864 | $250,864 | 7.4x | 6.0 mo |

Pricing v2 figures (Oct 22, 2026); the v1 figures are in section 0. Source: `output/scenarios.csv`. The scenario definitions are `SCENARIOS` in `model.py`. The **lean plan** is the base case with four changes:

1. Recommended rollout gates (section 4).
2. Half the contract-developer spend: a technical co-founder on equity, or a founder who builds with AI-assisted tooling.
3. Two BIA campaigns per mature strip per year instead of one.
4. A faster strip pace after the pilot passes its gate: 40 strips by month 36 instead of 29.

**What this means.** A free-forever loyalty network with $39/$79 add-ons is a slow-revenue business:

- In the base case there is **no revenue at all in year 1**. Paid features do not unlock until **month 24 (Oct 2028)** under Pricing v2 (month 22 under v1), because the model waits for 150 *active* merchants. At 60% activation that means about 250 signed merchants.
- The founder needs roughly **$300k to get through 36 months** and about **$357k to reach break-even** (v1: $323k and $421k). That is still too much to bootstrap from savings.

Acquisition is not what makes this expensive (Pricing v1 figures; v2 year-1 burn is $83,053, of which $8,302 is acquisition):

- Year-1 spend in the base case is $84,349.
- $48,000 of that is the developer, $17,580 is overhead and $8,000 is one-time legal and trademark costs.
- Only **$9,238 is merchant acquisition**.

Onboarding merchants is cheap. Product payroll is what burns cash while you wait for density.

---

## 2. Per-merchant economics (base case, steady state, per month)

Pricing v1 detail, kept for reference. Pricing v2 changes: free merchant $4.62 → $3.87, CAC per paying $553 → $373, contribution $43.90 → $40.65, LTV/CAC 2.6x → 3.6x (section 0). Current values: `output/unit_economics.csv` and the *Unit Economics* sheet.

### 2.1 What a free merchant costs

| Line | $/mo | Basis |
| --- | --- | --- |
| Infra (DB, storage, wallet-pass updates, email) | $1.00 | Assumption |
| Support (5 min at $25/hr) | $2.08 | Assumption |
| Its customers: about 54 unique (75 members ÷ 1.4 shops each) × (hosting $0.01 + 0.3 texts × $0.022 + re-join SMS and network perks) | $1.54 | Members per merchant from PRD; the rest are assumptions |
| **Cost of a free active merchant** | **$4.62** | |

**Free forever is affordable.** 1,000 free merchants cost about $4,600/mo, less than one part-time developer.

The real cost of the free tier is the one-time acquisition cost:

| Acquisition line | Cost per signed merchant | Basis |
| --- | --- | --- |
| Rep wages: 2.5 hrs × $17.95 × 1.13 payroll burden | $50.71 | Minimum wage from Oct 1, 2026 (PRD, citing [Hicks Morley](https://hicksmorley.com/2026/04/01/ontario-minimum-wage-to-increase-october-1-2026/)) |
| Activation bonus: $25 × 1.13 burden × 60% activation | $16.95 | PRD |
| Counter kit | $15.00 | PRD |
| Strip launch event: $750 ÷ 32 merchants | $23.44 | Assumption |
| **CAC per signed merchant** | **$106** | |
| **CAC per activated merchant** | **$177** | |

### 2.2 What a paying merchant contributes

| Line | $/mo | Basis |
| --- | --- | --- |
| Subscription ARPU (64% Plus at $39, 36% Pro at $79) | $53.56 | plans.ts prices; mix is driven by vertical conversion |
| Payments margin: 60% use payments × GMV ~$3,775 × (0.75% fee – 0.25% Stripe Connect) – $2 per account | $10.12 | Fee from plans.ts; Connect cost is an assumption to **verify** |
| SMS cost: 60% of the included allowance used (300 of 500 on Plus, 900 of 1,500 on Pro) × $0.022 | –$11.40 | [Twilio CA](https://www.twilio.com/en-us/sms/pricing/ca) US$0.0079–0.0083 per segment + carrier fees ([estimate](https://aesthetixcrm.com/sms-calculator/)) |
| Subscription billing fees (3.4% + $0.30) | –$2.12 | Assumption |
| Extra support (15 min) | –$6.25 | Assumption |
| **Contribution per paying merchant** | **$43.90** | |

| Lifetime metric | Value | How it is calculated |
| --- | --- | --- |
| CAC per paying merchant | **$553** | $106 ÷ (60% activation × 35% blended 24-month conversion) + $50 upsell |
| Lifetime | 33 months | 3% monthly churn (PRD) |
| **LTV** | **$1,463** | $43.90 × 33.3 |
| **LTV/CAC** | **2.6x** | Below the usual 3x bar |
| Fully loaded LTV/CAC | **1.9x** | Adds 24 months of free-tier carry cost for the merchants who never convert, $205 per payer |
| **Payback** | **12.6 months** | |

**Why this is lower than the PRD's 5.8x:**

1. The PRD's $30/mo payments margin assumed $4,000/mo GMV for every payer, with no Stripe Connect platform cost. The model assumes 60% adoption and nets out 0.25% Connect cost, which leaves about $10.
2. Real Canadian SMS cost is about $0.022 per segment once carrier fees are included. The included SMS allowances eat 21% of ARPU.
3. CAC is loaded with 60% activation, as well as 35% conversion.

**Two fixes in plans.ts lift contribution by about $5 (to ~$49).** First, cut the included SMS:

- Plus from 500 to 300 per month.
- Pro from 1,500 to 750 per month.

Second, add overage billing at $0.04 per segment. Most merchants never use their full allowance, so a smaller allowance plus overage protects margin without changing the headline price.

### 2.3 Conversion by vertical (assumptions to test first)

| Vertical | Share of merchants | Converts within 12 months of GA | Share choosing Pro | Why |
| --- | --- | --- | --- | --- |
| Cafés, restaurants, bakeries | 35% | 20% | 5% | Order-ahead and pickup |
| Independent retail | 25% | 12% | 5% | SMS and push only |
| **Repair, auto, alterations, print** | 20% | **40%** | 85% | Quote approval and deposits replace phone tag |
| Salons, barbers, fitness, pets | 12% | 15% | 30% | Drop-off scheduling |
| Pharmacies (front store only) | 8% | 5% | 0% | Limited by Ontario College of Pharmacists (OCP) inducement rules |

Repair and auto are 20% of merchants but **about 40% of paying merchants and about 53% of subscription revenue** (base, month 36). Validate them first: the PRD's $100 refundable pilot deposits are the test.

---

## 3. Network-effect economics: why no transaction fee beats SoPoints' 5%

SoPoints' free plan carries a **5% transaction fee** ([SoPoints pricing](https://sopoints.com/pricing), verified by the lead Oct 22, 2026: Free = $0 + 5%, 1 location, 4,000 points/month cap, no active rewards, no campaigns, basic analytics; the page doesn't say what base the 5% applies to). The comparison below assumes the fee applies to loyalty-member sales.

| Example café | SoPoints free plan | Local Loyalty Free |
| --- | --- | --- |
| Monthly sales | $25,000 | $25,000 |
| Share from loyalty members (assumption) | 30% → $7,500 | 30% → $7,500 |
| Platform fee | 5% → **$375/mo** ($4,500/yr) | **$0** |
| Our cost to serve them | Not applicable | $4.62/mo |

A 5% fee taxes exactly the behaviour you want: more members and more visits. It makes merchants ration the program, for example by not prompting at the counter. It also makes the program the first thing they cut. Free with no fee means the counter prompt never stops, and the counter is our only customer-acquisition channel. In the model each active merchant brings about 54 unique customers at $0 customer-acquisition cost.

The network then pays back in three layers. Revenue per **active** merchant, all streams combined:

| Point in time | Revenue per active merchant | Main sources |
| --- | --- | --- |
| Base, month 36 | **$20/mo** | Subscriptions $8, payments $2.50, BIA $10 |
| Base, month 60 | **$34/mo** | |
| Lean plan, month 48 | **$41/mo** | |

The cost to serve a free merchant is about $4.62, so **every active merchant is margin-positive once the network monetizes**. The problem is timing, not unit cost.

When pitching merchants, compare like with like. When a merchant takes in-app payments, their all-in cost is 4.51% of an average $35 ticket: Stripe's 2.9% + $0.30 ([Stripe via Xero](https://www.xero.com/pricing-plans/pricing-and-fees-for-stripe/), cited in the PRD) plus our 0.75%. That fee is on order-ahead and invoice payments, which replace card-terminal fees the merchant pays anyway. It is not a fee on loyalty. Say this plainly in sales and on the pricing page; the Competition Act section of the compliance checklist explains why.

---

## 4. When to flip each paid feature: recommended rollout gates

plans.ts uses one network-wide `unlockAtMerchants` number per feature:

| Features | unlockAtMerchants today |
| --- | --- |
| Plus and Pro features | 150 |
| `ads.*` | 400 |
| `campaigns.neighbourhood` | 100 |

The model shows that the 150 gate on **Pro** is the single most expensive line in the plan: it delays all revenue to month 22. Pro features (tickets, quotes, deposits, invoices) are single-merchant tools, and their value does not depend on network density. Gate each feature on what its value actually depends on.

| Feature group (plans.ts keys) | Value depends on | Network gate (active merchants) | Per-neighbourhood gate | Recommended `unlockAtMerchants` |
| --- | --- | --- | --- | --- |
| **Pro service**: `service.tickets`, `service.quote_approval`, `service.deposits`, `service.invoices`, `booking.dropoff_scheduling`, `staff.permissions` | The merchant alone | **Beta at 40** (pilot strip + 1) for merchants with a $100 pilot deposit; GA at 75 | None | **150 → 40**, starting as `beta` |
| **Plus ops**: `orders.order_ahead`, `orders.pickup_status`, `booking.pickup_slots`, `payments.in_app`, `reports.advanced` | App users on that strip | 100 | Strip has ≥ 20 active merchants and ≥ 1,000 active customers, with ≥ 25% app users | **150 → 100**, plus the per-neighbourhood check |
| **Messaging**: `marketing.sms`, `marketing.automations` | Nothing network-related; cost-sensitive | 100 (same release as Plus) | None | **150 → 100** |
| **Nearby push**: `promos.push_nearby` | Opted-in customers near the shop | 150 | ≥ 2,000 active customers on the strip, ≥ 500 with push enabled; multi-shop customers ≥ 30% | Keep **150**, plus the per-neighbourhood check |
| **Neighbourhood campaigns**: `campaigns.neighbourhood` | Density on **one** strip | Not meaningful | Strip live ≥ 6 months, ≥ 20 active merchants, ≥ 1,500 active customers, multi-shop ≥ 25% | **100 → 0**, gated per neighbourhood |
| **Ads**: `ads.sponsored_listing`, `ads.sponsored_promo`, `ads.map_pin` | Monthly app sessions (inventory) | 300 | ≥ 20,000 app sessions per month on the strip, ≥ 30% multi-shop customers, ≥ 25 active merchants | **400 → 300**, plus the per-neighbourhood check |

**Code changes to request from engineering.** Do not edit them from finance.

1. Add an optional per-neighbourhood gate to `FeatureDef`, for example `unlockPerNeighbourhood?: { activeMerchants: number; activeCustomers: number; multiShopPct: number; minMonthsLive?: number }`.
2. Add a `betaAtMerchants` field, so "beta at 40, GA at 75" can be encoded. The existing `override` field can carry pilot shops until then.
3. Cut `smsPerMonth` to 300 for Plus and 750 for Pro, and add overage billing.

Free-forever rule 3 in plans.ts is untouched: nothing moves from Free to paid.

**Where "active" is defined.** An active merchant has 25 or more active members (PRD). An active customer has visited in the last 60 days (assumption). A multi-shop customer is active at 2 or more shops.

**What the gates are worth.** Modelled alone (`base_reco_gates`), they cut cash to break-even by about $19k and bring the first revenue forward to month 12. Their bigger value is learning: you get real conversion data 10 months earlier.

---

## 5. Pricing strategy and tests

**Keep:**

- Free forever, as above.
- **Plus $39 and Pro $79** (plans.ts). Both are well under Square Loyalty's $60/location (PRD) and SoPoints' US$49–199 (PRD).
- Annual plans at 10× monthly (plans.ts).

**Tests, in order:**

1. **Pro pilot deposit (month 4–8).** Ask 10 repair or auto shops for a $100 refundable deposit for 3 months of Pro beta.
   - Success: 5 or more of 10 convert to paid at $79.
   - Price ladder: test $59, $79 and $99 with three cohorts of shops on *different strips*, so they don't compare notes.
   - Only the first two are needed to decide.
2. **Anchoring.** Show Pro with "replaces your phone-tag on quotes: about 3 hrs/week". Measure conversion from the pricing page.
3. **Plus entry offer.** First month free for Plus once order-ahead is GA, versus no trial. Watch 90-day retention, not just conversion.
4. **Payments.** Keep 0.75% (plans.ts). Do not lower it until in-app GMV exceeds $250k/month; it is a small share of revenue.
5. **SMS overage.** $0.04 per segment, with alerts at 80% of the allowance.
6. **Founding-merchant lock.** Merchants on the first 3 strips get "Founding" pricing: Pro at $59 for life while subscribed. It costs little and recruits evangelists.
7. **Never test**:
   - Charging for anything currently on Free.
   - A transaction fee on loyalty.
   - Points expiry.

---

## 6. Ad and campaign rate card (Phase 3)

All of these are proposals and assumptions. Model values are in brackets.

| Placement (plans.ts key) | Unit | Launch price | Inventory limits | Notes |
| --- | --- | --- | --- | --- |
| Sponsored listing (`ads.sponsored_listing`): top of neighbourhood feed and search | CPM, or a daily flat rate per strip | **$12 CPM** [model `ad_cpm` = 12], or **$5/day per strip** ($120/mo) | 1 sponsored slot per 5 organic results | Always labelled "Sponsored" |
| Sponsored promo (`ads.sponsored_promo`): boost a promo across the neighbourhood or network | CPM | **$15 CPM**, $25 minimum | Frequency cap of 3 per customer per day | Self-serve, prepaid |
| Featured map pin (`ads.map_pin`) | Per day | **$2.50/day, $75/mo** [model] | **Max 3 per strip** | Scarcity keeps value |
| Nearby push boost (sold under Phase 3; uses `promos.push_nearby`) | Per boost | **$25 per boost** to up to 1,000 opted-in customers within 1 km [model] | **Max 1 boosted push per customer per week** across the network | Requires push opt-in and CASL-compliant wording |

**Expected demand at launch** (assumptions; fill and adoption grow slowly):

| Placement | Model assumption |
| --- | --- |
| Feed and search inventory | 20% fill [model] |
| Map pins | 3% of active merchants buy each month [model] |
| Push boosts | 4% of active merchants buy, about 2 boosts each [model] |

**Reality check from the model.** CPM inventory is tiny at Toronto-only scale. In the base case only 35% of customers use the app (the rest use a wallet pass or phone number), at 6 sessions a month. Even at 30% fill, impression ads add under $500/mo at 20,000 customers. Moving ad fill from 5% to 40% changes cash to break-even by only about $10k (`output/sensitivity.csv`). Map pins and push boosts are worth 5–10× more than impressions because they are priced per merchant. **Do not build an ad server; sell pins and boosts first.**

### BIA neighbourhood campaigns (`campaigns.neighbourhood`)

| Package | Price | What's included |
| --- | --- | --- |
| **Bronze** | **$1,500** | 1 weekend points event; feed takeover; 1 push to opted-in members; results report covering visits, new members, multi-shop visits and redemptions |
| **Silver** | **$2,250** (model price) | 1-week passport ("visit 5 shops") with prize-draw administration, done as a skill-testing contest (see compliance checklist); 2 pushes; co-branded counter cards; report with visit lift versus the prior 4 weeks |
| **Gold** | **$3,000** | 2-week campaign; everything in Silver; a post-campaign customer survey; a board-ready deck; one data workshop with the BIA |
| **Points pool** (add-on) | Pass-through at cost | The BIA funds bonus points; unredeemed value is reported back to the BIA, never kept as breakage |

Sell campaigns as an **annual pair**, spring and holiday, at a 10% discount. The lean plan assumes 2 campaigns per mature strip per year. BIA campaigns are the most powerful lever in the model:

| Campaigns per strip per year | Base: cash to break-even | Base: break-even month | Lean: cash to break-even | Lean: break-even month |
| --- | --- | --- | --- | --- |
| 0 | $567k | Never (within 60 months) | $466k | Never |
| 1 | $421k | Month 60 | $270k | Month 57 |
| 2 | $325k | Month 48 | **$199k** | **Month 39** |
| 3 | $274k | Month 42 | $162k | Month 33 |

Two caveats:

- **Concentration risk.** In the lean plan, BIA revenue is about 55% of month-36 revenue. A BIA budget cut is a real risk; diversify through paid features.
- The model counts campaigns per *strip*. Large BIAs may hold several strips, while small BIAs may buy only one campaign per year. Pre-sell to 3 BIAs (PRD, next 30 days) before trusting the lean plan.

---

## 7. What to watch weekly

Review every Monday. Targets are assumptions taken from the PRD and the model.

| KPI | Definition | Target | Red flag |
| --- | --- | --- | --- |
| New merchants signed | Signed agreements this week | ~8/week per strip during the first 2 months of a blitz | < 4/week |
| **Activation rate** (30-day cohort) | Signed merchants reaching 25 active members within 30 days | **≥ 60%** (PRD) | < 45% |
| Active members per active merchant | Members visiting in the last 60 days | 75 by month 6 of the strip (PRD) | < 40 |
| **Multi-shop customers** | Active customers active at ≥ 2 shops | **≥ 30%** (PRD) | < 15% |
| Counter join time | Median seconds from prompt to member | < 30s (PRD) | > 60s |
| Weekly redemptions ÷ active members | | ≥ 5% (≈ 20% monthly, PRD) | < 2% |
| Rep hours per signed merchant | Paid rep hours ÷ signed | ≤ 2.5 [model] | > 3.5 (the bear value) |
| CAC per activated merchant | All acquisition spend ÷ activated | ≤ $177 [model] | > $260 |
| Free-merchant churn (monthly, trailing) | | ≤ 1.5% [model] | > 2.5% |
| Pro pilot deposits | Cumulative $100 deposits | 10 by month 8 | < 5 |
| Free → paid conversion (after GA) | Monthly upgrades ÷ eligible active merchants | ≥ 1.8%/mo blended (≈ 20% per year) | < 1% |
| Paid churn (monthly) | | ≤ 3% (PRD) | > 4.5% |
| SMS cost ÷ subscription revenue | | ≤ 15% | > 25% |
| BIA pipeline | Signed and verbal campaigns over the next 2 quarters | 1 per mature strip | 0 |
| **Cash runway** | Cash ÷ trailing 3-month net burn | ≥ 9 months | < 6 months |

Gate reviews are monthly. These are the PRD's go/no-go gates, quantified. **Do not launch strip N+1** until strip N reaches all three of the following within 60 days of launch:

- ≥ 60% activation;
- ≥ 50 active members per active merchant;
- ≥ 20% multi-shop customers.

---

## 8. Default alive or default dead (bootstrapped founder)

"Default alive" asks one question. If spending and growth continue as planned, do you reach profitability before the money runs out, without raising?

| Plan | Monthly net burn, year 1 | Monthly net burn, year 3 | Money needed to break-even | Break-even | Verdict |
| --- | --- | --- | --- | --- | --- |
| Base (plans.ts gates, $4–6k/mo contract dev) | ~$7.0k | ~$10.5k | **~$421k** | Month 60 (Oct 2031); EBITDA only +$493 that month | **Default dead** unless the founder has ~$450k |
| Lean plan | ~$5.3k | ~$4.3k (falling) | **~$199k** | Month 39 (Jan 2030) | **Default alive with ~$240k** (peak need + 20% buffer) |
| Lean plan + Pro at $59 for everyone | Similar | Similar | ~$208k | Month 41 | Still alive |
| Lean plan with no contract dev (technical co-founder) | ~$3.3k | Positive | ~$110k | Month 33 | Comfortably alive |

What has to be true for "default alive" with about $200–240k:

1. **Developer spend at $2–3k/mo or less.** This is the biggest single lever. In the lean plan, each $1k/mo of developer spend adds about $45k to the cash need.
2. **Two BIA campaigns per mature strip per year at about $2,250.** Without them no plan breaks even within 60 months.
3. **Pro beta at 40 active merchants**, not 150.
4. **CAC per signed merchant at about $106 or less.** At 1.5× CAC the lean plan needs $280k; at 0.5× it breaks even in month 33.
5. **Conversion multiplier ≥ 0.75**, meaning repair and auto convert at 30% or more within 12 months.

If the founder has much less than about $200k, there are three choices:

- Keep a day job and run the pilot strip only.
- Take a technical co-founder on equity.
- Raise a small pre-seed once the pilot-strip gate is met (see `fundraising-and-bootstrap.md`).

Grants and SR&ED could offset roughly 10–25% of the cash need, but they are excluded from the model because none is guaranteed.

---

## 9. Model limits

- It is an expected-value model, so merchants can be fractional.
- There is no seasonality. Winter strip launches will be slower.
- Income tax is ignored, because losses carry forward. HST is treated as pass-through.
- There is no working capital: we assume subscriptions are paid monthly in advance and BIAs pay on delivery.
- Order processing (later Phase 3) and GTA expansion are upside and not modelled. Extension months 37–60 continue at the last quarter's strip pace; the lean plan reaches 88 strips by month 60, more than Toronto's 85+ BIAs (PRD), which implies GTA expansion.
- Sensitivities: `output/sensitivity.csv` (one-way, base and lean) and `output/sensitivity_conversion_x_churn.csv` (grid).
