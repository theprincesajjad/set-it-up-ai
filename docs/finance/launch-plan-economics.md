# Launch plan: 3-month free blitz, then paid plans

Oct 22, 2026 · Finance · All money in CAD · Model month 1 = Nov 2026

**The founder's question:** "If we spend 3 months with no revenue, just non-stop onboarding (bootstrapped), and then switch on the subscription plans for all the other features so revenue starts then, what happens?"

**Short answer (computed):** it works if you bring in two student reps. With the founder alone it doesn't. Founder + 2 reps, with paid plans switched on in **month 4 (Feb 2027)**, gets about **130 shops in 3 months** and **314 by month 12**. Subscription MRR reaches **~$1,900 at month 12** and **~$4,800 at month 24**. The cash low point is **about −$61k in month 28**, and the plan breaks even in **month 29 (Mar 2029)**. Year 1 needs about **$37k**. The founder alone never gets enough shops to cover costs: there is no break-even within 60 months at 20% conversion. Launching in month 4 rather than waiting until month 7 is better in every case we ran. The one number that decides everything is **how many free shops upgrade in the first 6 months**.

How to read the numbers: **(A)** marks an assumption and **(C)** marks a number computed by the model. Every assumption sits in `LAUNCH_ASSUMPTIONS`, `LAUNCH_BASE` and `ONBOARDING_OPTIONS` in `docs/finance/model/model.py`, with a note on where it comes from. Re-run with `python3 docs/finance/model/model.py`.

---

## 1. Recommended option

**Founder + 2 student reps · paid launch in month 4 · Plus $39 / Pro $99 · one BIA campaign in month 5**

| | Value | |
| --- | --- | --- |
| Revenue starts | Month 4 (Feb 2027) | (C) |
| Subscription MRR, months 6 / 12 / 18 / 24 | $531 / $1,866 / $3,320 / $4,795 | (C) |
| Shops on the network, months 3 / 6 / 12 | 132 / 208 / 314 | (C) |
| Paying shops, months 6 / 12 / 24 | 10 / 34 / 87 | (C) |
| Spend in months 1–3 (blitz) | $16,860 | (C) |
| Cash needed by month 12 | $36,571 | (C) |
| **Cash low point (max cash needed)** | **−$60,909 in month 28** | (C) |
| **Break-even (EBITDA ≥ 0 from then on)** | **Month 29 (Mar 2029)** | (C) |
| Acquisition cost per signed shop | $72 | (C) |
| LTV/CAC (per paying shop) | 5.8x | (C) |

The cash low point comes in year 3, not during the blitz. Two things push it there. Spending keeps growing with the network: support, SMS, onboarding of about 21 new shops a month. And the bootstrap cost base adds occasional developer help in years 2–3 ($1,000/mo, then $1,500/mo) (A). If the founder does all merchant support personally and it is not counted as cash, the low point falls to **−$38,012 (month 21)** and break-even moves to **month 22** (C).

### Months 1–12 (recommended option)

| Month | Calendar | Signed this month | Strips open | Shops on network | Active shops | Paying shops | Subscription MRR | Total revenue | Acquisition spend | All costs | Net | Cash, cumulative |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Nov 2026 | 32 | 3.0 | 32 | 0 | 0 | $0 | $0 | $3,111 | $5,035 | −$5,035 | −$5,035 |
| 2 | Dec 2026 | 47 | 6.0 | 78 | 19 | 0 | $0 | $0 | $3,579 | $4,239 | −$4,239 | −$9,274 |
| 3 | Jan 2027 | 55 | 9.0 | 132 | 46 | 0 | $0 | $0 | $4,150 | $7,586 | −$7,586 | −$16,860 |
| 4 | Feb 2027 | 32 | 9.5 | 163 | 78 | 3 | $155 | $199 | $2,262 | $3,471 | −$3,272 | −$20,132 |
| 5 | Mar 2027 | 27 | 10.5 | 187 | 96 | 6 | $335 | $2,680 | $2,032 | $4,074 | −$1,395 | −$21,527 |
| 6 | Apr 2027 | 24 | 11.5 | 208 | 111 | 10 | $531 | $681 | $1,843 | $3,349 | −$2,668 | −$24,195 |
| 7 | May 2027 | 22 | 12.5 | 227 | 123 | 13 | $738 | $946 | $1,754 | $3,396 | −$2,450 | −$26,645 |
| 8 | Jun 2027 | 22 | 13.5 | 246 | 134 | 17 | $953 | $1,221 | $1,715 | $3,496 | −$2,275 | −$28,920 |
| 9 | Jul 2027 | 21 | 14.5 | 263 | 145 | 21 | $1,175 | $1,504 | $1,701 | $3,625 | −$2,121 | −$31,041 |
| 10 | Aug 2027 | 21 | 15.5 | 281 | 156 | 25 | $1,401 | $1,795 | $1,699 | $3,772 | −$1,977 | −$33,019 |
| 11 | Sep 2027 | 21 | 16.5 | 297 | 166 | 30 | $1,632 | $2,090 | $1,703 | $3,928 | −$1,838 | −$34,856 |
| 12 | Oct 2027 | 21 | 17.5 | 314 | 176 | 34 | $1,866 | $2,390 | $1,724 | $4,104 | −$1,714 | −$36,571 |

All values are computed (C). Source: `output/monthly_launch_reco.csv`. "Active" means the shop has 25+ members. A shop counts as active from the month after it signs, at a 60% activation rate (A, PRD). Total revenue = subscriptions + the 0.75% fee on in-app payments + the BIA campaign ($2,250 in month 5, A). "All costs" = acquisition + running costs (support, SMS, hosting per shop, network perks, Stripe) + overhead ($340/mo) + one-time costs ($1,500 in month 1, $2,500 in month 3) (A).

**The cost base** is the bootstrap scenario (A): no developer salary in year 1, $1,000/mo in year 2 and $1,500/mo in year 3. Overhead is $340/mo: hosting $60, software $60, insurance $100, bookkeeping $75, app stores $15, phone $30. The unit-economics page rounds this to ~$325 and leaves out the app-store fees. One-time costs are $4,000 and each strip launch costs $300. SMS is $0.022/segment and infra $0.60 per shop per month.

---

## 2. How the blitz is modelled

| Input | Founder alone | Founder + 2 reps | Founder + 4 reps | |
| --- | --- | --- | --- | --- |
| Founder's own signings, months 1–3 | 4/week | 3/week (also running the reps) | 2/week | (A), founder's 3–5/week |
| Reps × 6-hr shifts available, months 1–3 | – | 2 × 3/week | 4 × 3/week | (A) |
| Shops signed per rep shift | – | 3 | 3 | (A), PRD |
| New strips the team can open per month, months 1–3 | 1.5 | 3 | 4 | (A) |
| After month 3 | Founder 1.5/week, 0.5 new strips/month | + reps at 1 shift/week each, 1 strip/month | + reps at 1 shift/week, 1.5 strips/month | (A) |
| **Strips worked by month 3 / month 12** | **3.1 / 5.4** | **9 / 17.5** | **12 / 25.5** | (C) |
| **Shops signed by month 3** | **47** | **132** | **176** | (C) |

Each strip has 35 target shops (A). 60% of them eventually sign, about 21 per strip (A: 70% sign × the Pricing v2 adoption hit of −15%). In any month you can sign at most half of a strip's still-unsigned shops (A): owners need one to three visits, and holdouts wait to see the program working.

Rep cost is $17.95/hr (Ontario minimum wage from Oct 1, 2026, PRD) × 1.13 payroll burden (A). Reps are paid only for the shifts actually needed, plus 12 hours of paid training each (A). On top of that come a $25 activation bonus per activated shop (PRD), a $15 counter kit per shop (PRD) and $300 per strip launch (A). Month 1 runs at 75% of capacity while the pitch is tuned (A).

**What this shows (C):** the limit is how many strips you can open and walk each month, not rep hours. With 3 strips a month, the two reps work only about 1.25 shifts a week each during the blitz (33 shifts over the 3 months). The extra signings from 4 reps come from opening 4 strips a month. Plan the strip pipeline (BIA intro, kits, a target list per strip) before hiring more reps.

---

## 3. The option grid

Full grid: `output/launch_options.csv`. It has 324 rows: 3 onboarding options × 3 launch timings × 6 price pairs × 3 conversion levels × with or without the BIA campaign. Every number in the tables below is computed (C). The baseline settings are Plus $39 / Pro $79, base conversion and no BIA campaign, unless a row says otherwise.

**Conversion (A)** is the share of active free shops that upgrade within 6 months of launch, weighted by vertical, at $39/$79:

| Level | Overall | Cafés | Retail | Repair/auto | Salons etc. | Pharmacy |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 10% | | | | | |
| **Base** | **20%** | 25% | 14% | 26% | 18% | 5% |
| High | 35% | | | | | |

Low and high scale every vertical's rate by the same factor. Repair/auto mostly buys Pro (85%). The model's monthly upgrade rates apply to every shop already on the network from the launch month, and to new shops once they become active. Paying shops churn at 3%/month and drop back to Free (A, PRD).

**Price response (A):** conversion falls by 0.8% for every 1% the Plus price rises above $39, and by 0.5% for every 1% Pro rises above $79. Without this, a higher price would always win. The robustness check is in the sensitivity table further down.

### 3a. Onboarding × paid launch timing ($39 / $79, base conversion)

| Onboarding · paid launch | Revenue starts (month) | MRR m6 | MRR m12 | MRR m18 | MRR m24 | Cash low point | Break-even month | Shops m3 / m6 / m12 | Paying m12 / m24 | LTV/CAC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Founder alone · month 4 | 4 | $163 | $540 | $951 | $1,369 | −$59,366, still falling at m60 | not by m60 | 47 / 64 / 96 | 11 / 27 | 9.9x |
| Founder alone · month 7 | 7 | $0 | $436 | $884 | $1,326 | −$61,251, still falling | not by m60 | 47 / 64 / 96 | 9 / 26 | 9.9x |
| Founder alone · density gates | 8 | $0 | $147 | $320 | $483 | −$81,184, still falling | not by m60 | 47 / 64 / 96 | 2 / 7 | 9.9x |
| **Founder + 2 reps · month 4** | 4 | $498 | $1,743 | $3,091 | $4,454 | −$67,952 (m29) | **30** | 132 / 208 / 314 | 35 / 89 | 5.2x |
| Founder + 2 reps · month 7 | 7 | $0 | $1,425 | $2,887 | $4,323 | −$72,756 (m29) | 30 | 132 / 208 / 314 | 28 / 86 | 5.2x |
| Founder + 2 reps · density gates | 3 | $344 | $1,640 | $3,022 | $4,409 | −$69,486 (m29) | 30 | 132 / 208 / 314 | 32 / 88 | 5.2x |
| Founder + 4 reps · month 4 | 4 | $691 | $2,505 | $4,500 | $6,534 | −$80,397 (m23) | **26** | 176 / 298 / 459 | 50 / 130 | 4.9x |
| Founder + 4 reps · month 7 | 7 | $0 | $2,064 | $4,218 | $6,352 | −$86,388 (m25) | 26 | 176 / 298 / 459 | 41 / 127 | 4.9x |
| Founder + 4 reps · density gates | 3 | $726 | $2,526 | $4,513 | $6,542 | −$80,025 (m23) | 26 | 176 / 298 / 459 | 50 / 130 | 4.9x |

"Density gates" are the plans.ts gates (Plus at 100 active shops, Pro at 40), with the features treated as ready from month 1 because the product is built. With reps, the network passes 40 active shops in month 3, so Pro would unlock *before* the founder's month 4 anyway. With the founder alone, Pro unlocks in month 8 and Plus in month 30.

What this shows:

1. **Month 4 beats month 7 every time.** Waiting 3 more months costs $2–6k of cash and gains nothing: the network is the same size, because launch timing doesn't change signings unless the paywall scares shops off (section 4).
2. **The founder alone never breaks even** at 20% conversion. The unit economics are excellent (LTV/CAC 9.9x, $30 per signed shop), but 96 shops by month 12 can't carry the costs. It only works at 35% conversion (break-even month 38).
3. **4 reps break even 4 months sooner than 2, but need about $12k more cash.** They also mean more people for the founder to manage, more strips and more support at once. Treat it as the upgrade if month 1 hits target.

### 3b. Price (founder + 2 reps, month 4, base conversion)

| Plus / Pro | MRR m12 | MRR m24 | Cash low point | Break-even month | Paying m12 / m24 | LTV/CAC |
| --- | --- | --- | --- | --- | --- | --- |
| $29 / $79 | $1,692 | $4,238 | −$73,783 | 31 | 40 / 101 | 4.6x |
| $39 / $79 (plans.ts today) | $1,743 | $4,454 | −$67,952 | 30 | 35 / 89 | 5.2x |
| $49 / $79 | $1,797 | $4,656 | −$63,486 | 29 | 31 / 80 | 5.8x |
| $29 / $99 | $1,833 | $4,618 | −$67,176 | 30 | 39 / 99 | 5.2x |
| **$39 / $99** | $1,866 | $4,795 | −$62,484 | 29 | 34 / 87 | 5.8x |
| $49 / $99 | $1,908 | $4,968 | −$58,807 | 28 | 30 / 78 | 6.3x |

**$29 is the worst option.** It adds payers, but each payer costs the same at any price: about $14/month of SMS ($6.60), support ($6.25) and billing (~$1.30), plus a $50 one-off upsell cost (A). At $29 the extra payers don't make up for the lower price. **Pro $99 wins under every price response we tried** (table below). We recommend **$39 / $99** rather than $49 / $99. Plus $49 only wins if conversion barely reacts to price. If it reacts strongly, $49 cuts payers by about a quarter and is no better on cash. Plus is also the paywall most free shops see, so losing payers there costs the most network goodwill.

| Price response (Plus / Pro elasticity) | $39 / $79 | $39 / $99 | $49 / $99 |
| --- | --- | --- | --- |
| None (0 / 0) | −$66,377 · break-even m30 | −$58,944 · m29 | −$50,686 · m27 |
| Base (0.8 / 0.5) | −$66,377 · m30 | −$60,909 · m29 | −$57,232 · m28 |
| Strong (1.5 / 1.0) | −$66,377 · m30 | −$62,739 · m29 | −$63,219 · m29, 26 payers at m12 vs 33 |

Cash low point · break-even month (C); founder + 2 reps, month 4, with the BIA campaign. Source: `output/launch_risk_sensitivity.csv`.

The $39 / $79 cells are identical in every row because those are the reference prices, where price response has no effect. The base-response $49 / $99 cell is not in the CSV. It equals the matching grid row (−$58,807) plus the $1,575 net from the BIA campaign.

Pro at $99 is a change to `plans.ts` (`PLANS.pro.priceCents` 7900 → 9900) and to `docs/business/pricing.md`. Engineering must make it; finance does not edit it. Run the $79/$99 cohort test from `unit-economics.md` §5 first. The "Founding" Pro price of $59 for the first 3 strips (§5) is not modelled.

### 3c. Conversion is the whole bet (month 4, $39 / $99)

| Onboarding · 6-month conversion | MRR m12 | MRR m24 | Cash low point | Break-even month | Paying m12 / m24 |
| --- | --- | --- | --- | --- | --- |
| Founder alone · 10% | $294 | $804 | −$87,821, still falling | not by m60 | 5 / 15 |
| Founder alone · 20% | $578 | $1,474 | −$50,737 (m58) | 59 | 10 / 27 |
| Founder alone · 35% | $987 | $2,272 | −$25,288 (m37) | 38 | 18 / 41 |
| Founder + 2 reps · 10% | $947 | $2,615 | −$97,093 (m41) | 42 | 17 / 47 |
| **Founder + 2 reps · 20%** | **$1,866** | **$4,795** | **−$62,484 (m28)** | **29** | **34 / 87** |
| Founder + 2 reps · 35% | $3,193 | $7,396 | −$39,522 (m19) | 20 | 58 / 135 |
| Founder + 4 reps · 10% | $1,359 | $3,831 | −$113,678 (m37) | 38 | 25 / 69 |
| Founder + 4 reps · 20% | $2,682 | $7,033 | −$76,113 (m22) | 23 | 48 / 127 |
| Founder + 4 reps · 35% | $4,595 | $10,867 | −$55,377 (m17) | 18 | 83 / 198 |

**The BIA campaign** (one Silver package, $2,250 in month 5, 30% delivery cost, A) adds $1,575 of cash in every option. That does not change break-even. It matters as proof that BIAs will pay, not as cash. A $1,500–3,000 price range moves the cash figure by ±$525 (C).

**Best and worst of the whole grid (C):**

- **Cheapest that still breaks even:** founder alone, month 4, $49 / $99, 35% conversion, with the BIA campaign. Cash low point −$19,900, break-even month 34. But this works only if conversion is high. At 20%, the same setup doesn't break even until month 53.
- **Fastest break-even:** founder + 2 reps, month 4, $49 / $99, 35% conversion. Break-even in month 18, cash low point −$35,330 with the BIA campaign. Founder + 4 reps at $49 / $79 and 35% also breaks even in month 18, but needs −$55,875.
- **Worst:** founder + 4 reps, month 7, $29 / $79, 10% conversion. Cash low point −$135,698, break-even month 46.
- 58 of the 324 options don't break even within 60 months. Every one of them is founder alone.

---

## 4. Risk of launching paid early: fewer shops join, and some free shops leave

These cases use founder + 2 reps, $39 / $99 and the BIA campaign. The haircut applies to every signup from the paid launch onward, to the shops still unsigned on open strips, and to rep yield, so cost per shop rises. A "leave" case removes that share of free shops once, in the launch month. Source: `output/launch_risk_sensitivity.csv` (C).

| Case | Month 4 launch: cash low · break-even · shops m12 | Month 7 launch: cash low · break-even · shops m12 |
| --- | --- | --- |
| No effect | −$60,909 · m29 · 314 | −$66,137 · m29 · 314 |
| Signups −10% after launch | −$62,892 · m32 · 294 | −$67,906 · m32 · 302 |
| Signups −20% | −$64,577 · m36 · 274 | −$68,778 · m35 · 289 |
| 5% of free shops leave at launch | −$62,164 · m30 · 308 | −$67,600 · m30 · 304 |
| Signups −20% and 5% leave | −$65,419 · m36 · 268 | −$69,813 · m35 · 280 |
| Signups −20% and 10% leave | −$66,477 · m37 · 263 | −$71,159 · m36 · 270 |

**What this shows (C):** in the bad cases, break-even moves out by about 7 months. The cash low point gets only $4–6k worse, because fewer shops also means less spending on reps, kits and support. A later launch delays the damage but doesn't avoid it, and it costs more cash in every row. The bigger risk is not a smaller network but weaker strips. At −20%, a strip ends with about 17 shops instead of 21, which weakens the "one card for the whole street" pitch to customers. The mitigation is the same one the unit-economics doc gives: sell Free (loyalty, wallet pass, network listing) on its own merits and never pitch the paid features at the counter during the first visit.

---

## 5. Hand check (one option, by hand)

Option: founder + 2 reps, month 4, $39 / $79, base conversion. Check: subscription MRR at **month 9**, after 6 months of paid plans (months 4–9).

1. **Shops already active at launch (month 4): 78** (C). 20% of them upgrade within 6 months (A) = 15.6. Paid churn of 3%/month over an average of about 2.5 paid months keeps about 93% of them, so about **14.5 payers**.
2. **Shops that become active after launch:** 145 active at month 9 − 78 = 67 (C). On average they have been eligible for about 3 months, and 3-month conversion is 10.6% (C, from the same monthly upgrade rates). That gives about **7.1 payers**.
3. **Payers:** 14.5 + 7.1 ≈ **21.6**. The model says **21.8**.
4. **Blended price per payer:** 28.5% of upgrades are Pro. The vertical mix × 6-month conversion × Pro share works out to 0.056 ÷ 0.198. So 0.715 × $39 + 0.285 × $79 = **$50.4**.
5. **MRR by hand:** 21.6 × $50.4 ≈ **$1,089**. **The model says $1,099**, 1% apart.

In the founder's rule-of-thumb form: steps 1–2 are the same as about 108 shops eligible for the full 6 months. So 108 × 20% × ~$50 blended ≈ $1,080 MRR, against the model's $1,099.

**Rep cost check:** a 6-hour shift costs 6 × $17.95 × 1.13 = $121.70 and signs 3 shops, so $40.57 per shop. Add the activation bonus (0.6 × $25 × 1.13 = $16.95) and the kit ($15), and a rep-signed shop costs **$72.52**. The founder's own signings cost only the $15 kit. Adding strip launches and training, the model's blended figure for this option is **$72 per signed shop** (C).

---

## 6. What has to be true

1. **The blitz signs about 130 shops in 3 months.** That means 9 strips, about 15 shops per strip on the first pass, and 3 new strips prepared every month (A). Strip prep, not rep hours, is the constraint.
2. **60% of signed shops reach 25 members within about a month** (A, PRD). The paid plans convert *active* shops only.
3. **At least 20% of active free shops upgrade within 6 months of launch** (A). At 10%, the recommended option needs about $97k and breaks even in month 42. At 35%, it needs about $40k and breaks even in month 20. Nothing else in the plan moves the result as much.
4. **The paywall costs no more than about 20% of signups** (A). Beyond that, strips get too thin to sell the network to customers.
5. **Costs stay at bootstrap size** (A): $340/mo overhead, no paid developer in year 1, and the founder doing support. Support is costed at $25/hr in the model; done unpaid by the founder, it saves about $23k at the low point.
6. **Cash:** about $17k for the blitz, $37k by month 12 and $61k at the low point in month 28 (C). Have **about $45k available before starting**; that lasts to about month 15. Arrange another ~$20k (savings, a grant or a small raise) by then. That plan matters most if the month-6 conversion check is below 20%.
7. **The blitz runs Nov–Jan** (calendar months 1–3). That covers the holiday rush, when cafés and retail are least willing to take a sales visit. The model has no seasonality. If December signings come in below about 8 a week, slip the blitz to Jan–Mar and keep "launch 3 months after the blitz starts".

---

## 7. The 4 numbers to watch every week during the blitz

| Metric | Definition | Target (from the model) | Red flag | Why |
| --- | --- | --- | --- | --- |
| **Shops signed per week** (and per strip) | Signed merchant agreements | Week 1–4: ~7/wk; weeks 5–8: ~11/wk; weeks 9–13: ~13/wk. ≥ 12 of 35 per strip on the first pass | < 5/wk, or a strip stuck below 8 | Network size drives everything (§3a) |
| **Activation within 30 days** | Share of signed shops with 25+ active members | ≥ 60%. Leading signal: ≥ 12 members per shop by day 14 | < 45% | Only active shops can upgrade |
| **Paid intent** | Share of active shops that agree to a Founding offer or pilot deposit for Plus or Pro (admin override) before launch | ≥ 20% of active shops by week 12 | < 10% | The only early read on the 20% conversion assumption (§3c) |
| **Cost per signed shop** | Rep wages + bonuses + kits + strip costs ÷ shops signed | ≤ $75 (model: $72) and ≥ 3 shops per rep shift | > $110 (1.5× plan), or < 2 per shift | At 1.5× acquisition cost the recommended option needs −$89,891 instead of −$60,909 (C) |

Review them every Monday. On the first Monday of month 4, decide whether to go ahead with the month-4 launch. If the paid-intent number is below 10%, launch anyway: the risk table shows waiting doesn't help. But stop hiring and keep the reps at one shift a week until real conversion data comes in.

---

## Files

- Model: `docs/finance/model/model.py`. The launch-plan code is `LAUNCH_ASSUMPTIONS`, `blitz_step`, `launch_values`, `launch_summary` and `launch_grid`. The original scenarios produce exactly the same numbers as before: every existing CSV was regenerated and is byte-identical.
- Monthly detail: `output/monthly_launch_reco.csv`, `monthly_launch_founder_m4.csv`, `monthly_launch_reps2_m4.csv`, `monthly_launch_reps4_m4.csv`, `monthly_launch_reps2_m7.csv` and `monthly_launch_reps2_gated.csv`. All except the recommended file use $39 / $79, base conversion and no BIA campaign.
- Grid: `output/launch_options.csv` (324 options). Risk and price sensitivity: `output/launch_risk_sensitivity.csv`. Inputs: `output/launch_assumptions.csv`.
- **The Excel workbook (`local-loyalty-model.xlsx`) has not been updated** with the launch-plan mechanics. It still matches the original scenarios.
