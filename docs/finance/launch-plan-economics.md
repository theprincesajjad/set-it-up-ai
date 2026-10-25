# Launch plan economics

> **Not used (Oct 2026).** The founder decided there are no paid sales reps: onboarding is done by the founder and remote onboarding agents, and the product has no rep commission, bonus or earnings. Rep wage, commission and activation-bonus figures below are kept only as history and for a possible later change of plan; do not use them in the live plan.

Oct 22, 2026 · Finance · All money in CAD · Model month 1 = Nov 2026

**The founder's question:** "If we spend 3 months with no revenue, just non-stop onboarding (bootstrapped), and then switch on the subscription plans for all the other features so revenue starts then, what happens?"

**Short answer (computed).** Two operating models are costed here.

- **Founder's plan (Part A): remote onboarding.** The founder sells by phone and AI agents handle shop setup. There are no paid reps. The plan opens 5 areas a month and aims for 400 shops by month 3, with paid plans from month 4.
  - **If the targets are hit, it is the stronger business.** About 1,670 shops by month 12 and MRR of about $7,900 at month 12 and $25,500 at month 24. Break-even in month 21 (Jul 2028), with a cash low point of about −$113k in month 20.
  - **Hitting 400 by month 3 is not realistic as planned.** It needs 31 of every 35 storefronts in each area to sign (89%, against 60% assumed for in-person selling) and 5–7 signed shops every working day by phone.
  - **About 250 by month 3 is a stretch but credible.** That is 56% of storefronts and 3–4.5 signed shops a day. It needs about −$70k at the low point and breaks even in month 23. With 3 areas a month after month 3, it needs about −$50k and breaks even in month 19.
- **Alternative (Part B): in-person blitz with student reps.** Founder + 2 reps reach 314 shops by month 12 and break even in month 29, needing about −$61k.

How the two compare (computed, conversion 20%):

| | Remote, 400 by m3 | Remote, 250 by m3 | Reps, founder + 2 |
| --- | --- | --- | --- |
| Shops at month 12 | ~1,670 | ~1,040 | 314 |
| Cash low point | −$113k | −$70k | −$61k |
| Break-even | Month 21 | Month 23 | Month 29 |

In both models, **launching paid plans in month 4 is right**. The result turns on **how many free shops upgrade in the first 6 months**.

How to read the numbers: **(A)** marks an assumption and **(C)** marks a number computed by the model. Every assumption sits in `LAUNCH_ASSUMPTIONS`, `LAUNCH_BASE`, `REMOTE_BASE` and `ONBOARDING_OPTIONS` in `docs/finance/model/model.py`, with a note on where it comes from. Re-run with `python3 docs/finance/model/model.py`.

---

# Part A — Founder's plan: remote onboarding, 5 areas a month, paid plans in month 4

## A1. The operating model (as modelled)

| Input | Value | |
| --- | --- | --- |
| Selling | Founder on the phone all day. AI onboarding agents (in-product setup wizard + automated follow-ups) do the setup. No paid reps | Founder |
| Areas opened | 5 per month in months 1–3, then 5 per month (variants: 3 and 8). An area is a street or community with lots of stores | Founder |
| Saturation | Stops at 120 areas: Toronto's 85+ BIAs plus ~35 other commercial streets and plazas. At 5 a month this is reached in month 24; GTA expansion is not modelled | (A) |
| Storefronts per area | 35 (founder: ~30–40 repeat-visit shops) | (A) |
| How fast an area signs | 70% of its eventual signers in the month it opens, 20% the next month, 10% the month after | (A) |
| Shops signed per area | **Solved by the model to hit the month-3 target.** 400 by month 3 needs **31.2 per area (89% of 35)**. 250 needs 19.5 (56%); 550 needs 42.9, more storefronts than an area has | (C) |
| Activation (25+ active members) | 60% headline. Sensitivity at 45% and 70%, because shops onboarded by phone may engage less. A shop counts as active from the month after it signs | (A) |
| Paid plans | Plus and Pro switch on in month 4, regardless of network density. Plus $39 (or $49), Pro $79 (or $99) | Founder |
| Conversion | 20% of active free shops upgrade within 6 months of launch, weighted by vertical (low 10%, high 35%). Same per-vertical rates and price response as Part B | (A) |
| Counter kit (QR stand) | $15 per shop | (A), PRD |
| Street day | One person visits all ~30 shops in an area in one day to check the dashboard and counter: $200 + ~$20 transit per area. $0 if the founder does it | (A) |
| AI onboarding agents | $100/mo tooling (range $50–150) + $2 per shop onboarded (range $1–3) for LLM tokens, call minutes and SMS | (A) |
| Rep wages, activation bonuses, upsell bonuses, strip events | $0 (no reps) | Founder |
| Cost base | Bootstrap (same as Part B): no developer in year 1, $1,000/mo in year 2, $1,500/mo in year 3. $340/mo overhead, $4,000 one-time | (A) |
| Running costs | Scale with shops and their customers: infra $0.60/shop and $0.01/customer, SMS $0.022/segment (verification texts + Plus/Pro allowances), network perks, Stripe. One part-time account manager ($4,200/mo) per 1,000 active shops; the first is hired in month 14 | (A) |
| Support | 5 min per free shop and 15 min per paying shop each month at $25/hr. Also shown unpaid (founder) | (A) |

## A2. Headline results

| Case | Revenue starts | MRR m4 | MRR m6 | MRR m12 | MRR m18 | MRR m24 | Shops m3 / m6 / m12 | Paying m6 / m12 / m24 | Cash low point | Break-even month |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Founder's plan**: 400 by m3, 5 areas/mo, 60% activate, $39 / $79, 20% conversion, street days and support paid | 4 | $441 | $1,712 | $7,864 | $16,193 | $25,540 | 400 / 843 / 1,671 | 34 / 156 / 509 | **−$112,684 (m20)** | **21** |
| Same, Pro $99 | 4 | $470 | $1,825 | $8,415 | $17,375 | $27,467 | 400 / 843 / 1,671 | 33 / 152 / 497 | −$102,967 (m19) | 20 |
| Same, Plus $49 / Pro $99 | 4 | $474 | $1,848 | $8,591 | $17,856 | $28,388 | 400 / 843 / 1,671 | 29 / 135 / 448 | −$97,930 (m19) | 20 |
| Street days done by founder ($0) | 4 | $441 | $1,712 | $7,864 | $16,193 | $25,540 | 400 / 843 / 1,671 | 34 / 156 / 509 | −$91,370 (m19) | 20 |
| Support done by founder, unpaid | 4 | $441 | $1,712 | $7,864 | $16,193 | $25,540 | 400 / 843 / 1,671 | 34 / 156 / 509 | −$50,416 (m16) | 17 |
| Founder covers only the first 40 support hours/month | 4 | $441 | $1,712 | $7,864 | $16,193 | $25,540 | 400 / 843 / 1,671 | 34 / 156 / 509 | −$94,693 (m19) | 20 |
| Founder does street days + first 40 support hours/month | 4 | $441 | $1,712 | $7,864 | $16,193 | $25,540 | 400 / 843 / 1,671 | 34 / 156 / 509 | −$73,793 (m19) | 20 |
| Both street days and support by founder | 4 | $441 | $1,712 | $7,864 | $16,193 | $25,540 | 400 / 843 / 1,671 | 34 / 156 / 509 | −$33,192 (m15) | 16 |

All values are computed (C). Sources: `output/remote_options.csv`, `output/remote_sensitivity.csv` and `output/monthly_remote_founder_plan.csv`.

**Read the "founder does support" rows with care.** At 1,671 shops, support is about 5 min × 1,671 ≈ 140 hours a month on top of a full phone day. That is not possible for one person. The credible version is the 40-hours row: **−$94,693, break-even month 20**.


### A0. The same plan with lean operations (lead's check, Oct 22, 2026)

The −$112,684 low point in the founder's plan is driven by running costs priced
for human operations, not by acquisition. Over months 1–20 the biggest lines are:
free-shop support at 5 human minutes per shop per month × $25/hr ($77k), $15
counter kits ($46k), SMS included in paid plans ($33k), an account manager from
month 14 ($29k), platform-funded network perks ($26k) and street days ($22k).

With AI agents handling onboarding, most support can be handled the same way.
`remote_lean_ops` keeps everything else identical and changes only:

| Line | Founder's plan | Lean ops |
| --- | --- | --- |
| Human support per free shop | 5 min/mo | 1 min/mo (AI answers the rest) |
| Human support per paying shop | 15 min/mo | 5 min/mo |
| Counter kit | $15 | $5 (printed QR stand / sticker) |
| Network perks | platform-funded from month 1 | off until a BIA funds them |
| First account manager | at 1,000 active shops | at 2,500 active shops |

| | Founder's plan | Lean ops | Lean ops, founder does street days |
| --- | --- | --- | --- |
| Shops at months 3 / 12 | 400 / 1,671 | 400 / 1,671 | 400 / 1,671 |
| Subscription MRR months 6 / 12 / 24 | $1,712 / $7,864 / $25,540 | same | same |
| Cash low point | −$112,684 | **−$23,504** | **−$14,301** |
| Break-even | month 21 | **month 10 (Aug 2027)** | **month 9** |

The 250-shops / 3-areas-a-month path with lean ops needs about $17k and also
breaks even in month 10. Revenue is unchanged in every row: only costs move.
The open question is the support assumption: 1 human minute per free shop per
month holds only if the setup wizard, the AI agent and the counter app are good
enough that shops rarely need a person.


### Months 1–12, founder's plan

| Month | Calendar | Areas open | Signed this month | Shops on network | Active | Paying | Subscription MRR | Total revenue | Acquisition | Running costs | All costs | Net | Cash, cumulative |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Nov 2026 | 5 | 109 | 109 | 0 | 0 | $0 | $0 | $3,055 | $293 | $5,188 | −$5,188 | −$5,188 |
| 2 | Dec 2026 | 10 | 140 | 248 | 64 | 0 | $0 | $0 | $3,585 | $1,043 | $4,969 | −$4,969 | −$10,157 |
| 3 | Jan 2027 | 15 | 156 | 400 | 146 | 0 | $0 | $0 | $3,850 | $1,827 | $8,518 | −$8,518 | −$18,674 |
| 4 | Feb 2027 | 20 | 156 | 550 | 236 | 9 | $441 | $579 | $3,850 | $2,774 | $6,964 | −$6,385 | −$25,059 |
| 5 | Mar 2027 | 25 | 156 | 698 | 325 | 20 | $1,016 | $1,333 | $3,850 | $3,696 | $7,887 | −$6,553 | −$31,612 |
| 6 | Apr 2027 | 30 | 156 | 843 | 412 | 34 | $1,712 | $2,247 | $3,850 | $4,618 | $8,808 | −$6,562 | −$38,174 |
| 7 | May 2027 | 35 | 156 | 986 | 498 | 50 | $2,518 | $3,305 | $3,850 | $5,552 | $9,743 | −$6,438 | −$44,612 |
| 8 | Jun 2027 | 40 | 156 | 1,127 | 583 | 68 | $3,424 | $4,493 | $3,850 | $6,506 | $10,697 | −$6,204 | −$50,816 |
| 9 | Jul 2027 | 45 | 156 | 1,266 | 666 | 88 | $4,420 | $5,800 | $3,850 | $7,484 | $11,674 | −$5,874 | −$56,690 |
| 10 | Aug 2027 | 50 | 156 | 1,403 | 748 | 109 | $5,497 | $7,214 | $3,850 | $8,485 | $12,675 | −$5,461 | −$62,151 |
| 11 | Sep 2027 | 55 | 156 | 1,538 | 829 | 132 | $6,648 | $8,724 | $3,850 | $9,510 | $13,700 | −$4,976 | −$67,128 |
| 12 | Oct 2027 | 60 | 156 | 1,671 | 909 | 156 | $7,864 | $10,320 | $3,850 | $10,557 | $14,747 | −$4,427 | −$71,555 |

All values are computed (C).

- **Acquisition** is about $3,850 a month: kits $2,339, street days $1,100, AI per-shop $312 and AI tooling $100.
- **Cost per signed shop** is $25, against $72 with reps.
- **Running costs** at month 12 total $10,557. The two largest lines are free-shop support and infra ($4,484) and SMS ($1,807). Then come network perks ($1,563), Stripe ($1,006) and customer hosting ($406, for 40,600 customers).
- **Running costs, not acquisition, are why the cash low point is deeper** than in the rep plan. A network five times bigger costs more to run before it pays.

### Sensitivities (all computed)

**Shops by month 3** (5 areas/month, 60% activation, $39 / $79, 20% conversion)

| Month-3 target | Shops signed per area needed | Shops m12 | MRR m12 / m24 | Cash low point | Break-even |
| --- | --- | --- | --- | --- | --- |
| 250 | 19.5 (56% of 35) | 1,044 | $4,915 / $15,962 | −$69,657 (m18) | 23 |
| **400** | **31.2 (89%)** | 1,671 | $7,864 / $25,540 | −$112,684 (m20) | 21 |
| 550 | 42.9 (122%: more than the area has) | 2,298 | $10,814 / $35,117 | −$148,866 (m20) | 21 |

**Areas per month after month 3**

| Pace | Shops m6 / m12 | MRR m12 / m24 | Cash low point | Break-even |
| --- | --- | --- | --- | --- |
| 3 / month | 683 / 1,164 | $5,998 / $17,183 | −$62,377 (m17) | 18 |
| **5 / month** | 843 / 1,671 | $7,864 / $25,540 | −$112,684 (m20) | 21 |
| 8 / month | 1,083 / 2,431 | $10,664 / $32,351 | −$157,134 (m17) | 18 |

**Activation × conversion** (cash low point · break-even month · MRR m12)

| | 45% activate | 60% activate | 70% activate |
| --- | --- | --- | --- |
| 10% conversion | −$194,093 · m28 · $2,978 | −$185,480 · m25 · $3,971 | −$183,904 · m25 · $4,633 |
| **20% conversion** | −$122,224 · m23 · $5,898 | **−$112,684 · m21 · $7,864** | −$108,587 · m20 · $9,175 |
| 35% conversion | −$62,247 · m19 · $10,178 | −$53,590 · m16 · $13,571 | −$51,756 · m15 · $15,833 |

**Other risks** (founder's plan; cash low point · break-even month · shops m12)

| Case | Result |
| --- | --- |
| Signups −10% after the paid launch | −$104,013 · m21 · 1,539 |
| Signups −20% after the paid launch | −$95,342 · m21 · 1,407 |
| 5% of free shops leave at launch | −$113,364 · m21 · 1,653 |
| AI cost high ($150/mo + $3/shop) | −$116,740 · m21 |
| AI cost low ($50/mo + $1/shop) | −$108,629 · m21 |

What the sensitivities show:

- **Every one of the 1,296 remote options breaks even within 60 months.** The bigger network always gets there in the end. The question is how much cash it takes.
- **Fewer signups after launch need less cash, not more.** Each shop is cheap to sign but costs money every month until it pays.
- **The pace after month 3 is a cash choice.** 3 areas a month needs about $50k less than 5 and breaks even sooner, in month 18. 8 a month needs about $157k.
- **Conversion matters far more than activation.** At 10% conversion, cash need rises to about $185k.

**Best and worst of the remote grid (C):**

- **Best:** 3 areas/month after month 3, 250 by month 3, 70% activation, 35% conversion, Pro $99, founder doing street days and support. Low point −$14.4k, break-even month 7.
- **Worst:** 8 areas/month, 550 by month 3, 10% conversion. Low point −$326k, break-even month 22.

## A3. Is 400 shops in 90 days realistic by phone?

**Plainly: not as planned.** The model points to two separate problems (C).

**1. The areas aren't big enough.** 15 areas of ~35 storefronts, opened 5 a month, can only reach 400 by month 3 if **about 89% of every area signs**. Areas opened in month 3 have had just one month of calls. Part B assumes about 60% eventually sign in person. At 60% (21 shops per area), 400 by month 3 needs **about 22 areas in 3 months, i.e. 7–8 areas a month**.

**2. The phone hours don't fit in one person's day.** The targets below assume 35% of dials reach the owner, 25% of owner conversations sign, 15 minutes per conversation and 2 minutes per missed dial (A). Street days come out of the week at about 1.15 per week.

| 400 by month 3 | Month 1 | Month 2 | Month 3 |
| --- | --- | --- | --- |
| Signed shops per month | 109 | 140 | 156 |
| Signed per working day (5-day week) | 5.0 | 6.5 | 7.2 |
| Areas opened / street days per week | 1.15 | 1.15 | 1.15 |
| If someone else does street days: owner conversations / dials / phone hours per day | 20 / 58 / 6.3 h | 26 / 74 / 8.1 h | 29 / 82 / 9.0 h |
| If the founder does street days (3.85 phone days/week): signed per phone day | 6.5 | 8.4 | 9.3 |
| Owner conversations / dials / phone hours per phone day | 26 / 75 / 8.2 h | 34 / 96 / 10.5 h | 37 / 107 / 11.7 h |

The lead's "~4.4 shops a day" is 400 ÷ 90 *calendar* days. Over 65 working days it is **6.2 signed per working day**. Add the founder's own street days and it becomes **about 8 per phone day**. On top of that the founder has to:

- keep signing about 156 shops a month after month 3, because the plan continues at 5 areas a month;
- answer support for 500–1,700 shops;
- sell the paid upgrades from month 4.

**For one person that is not realistic.** If only 15% of owner conversations sign, dials rise to about 140–180 a day.

| 250 by month 3 | Month 1 | Month 2 | Month 3 |
| --- | --- | --- | --- |
| Signed per working day | 3.1 | 4.0 | 4.5 |
| Owner conversations / dials / phone hours per day (someone else does street days) | 13 / 36 / 3.9 h | 16 / 46 / 5.0 h | 18 / 51 / 5.6 h |
| Same, founder does street days | 16 / 47 / 5.1 h | 21 / 60 / 6.5 h | 23 / 67 / 7.3 h |

This is hard but doable, and it needs only 56% of each area to sign. Source: `output/remote_operating_targets.csv` (C).

### What has to be true for the founder's plan

1. **Areas are bigger or more numerous than assumed.** Either about 89% of 35 storefronts sign within weeks, by phone, or you open 7–8 areas a month (C).
2. **The founder sustains 6–7 signed shops a day for 13 weeks**: about 26–37 owner conversations and 75–107 dials a day, at a 35% reach rate and 25% close rate (A). Someone else (a $200 day hire, A) does the street days, or the founder gives up ~1 phone day a week.
3. **Phone-onboarded shops activate at ≥ 60%** (A). At 45%, the cash low point is about $10k worse and break-even comes about 2 months later.
4. **≥ 20% of active free shops upgrade within 6 months of the month-4 launch** (A). At 10%, cash need rises to about $185k.
5. **Support scales with no one hired until month 14.** That means 1,000+ shops supported by the founder and the AI agents. Budget it at $25/hr, or plan for the founder's time.
6. **Cash:** about $19k for months 1–3, $72k by month 12 and $113k at the low point (month 20) (C). If the founder does the street days and the first 40 support hours a month, the low point is −$73,793 (C). **Arrange about $120k before committing to 5 areas a month.** The smaller alternative is 250 by month 3, then 3 areas a month: 728 shops at month 12, MRR $3,749 at month 12, low point −$50,485 (−$23,102 with street days and the first 40 support hours done by the founder), break-even in month 19 (C).

### Weekly operating targets (founder's plan: 400 by day 90)

| Metric | Target | Red flag |
| --- | --- | --- |
| Dials / owner conversations per working day | 60–80 / 20–29 (rising month by month) | < 40 dials |
| **Signed shops per working day** | **5 in month 1, 6.5 in month 2, 7 in month 3** (≈ 25 / 32 / 36 a week) | < 3.5 a day. You are on the 250 path; slow the area pace to 3 a month |
| Areas opened per week / street days per week | 1.15 / 1.15 (5 areas a month) | Areas below 60% signed after 4 weeks |
| Close rate on owner conversations | ≥ 25% | < 15% |
| Activation within 30 days (25+ members) | ≥ 60% | < 45% |
| Paid intent before launch (Founding offer or pilot override accepted) | ≥ 20% of active shops by week 12 | < 10% |

## A4. Hand check (founder's plan)

**Shops at month 3:**

- Areas opened in month 1 have had all three ramp months (100% of their signers).
- Areas opened in month 2 have had two (90%).
- Areas opened in month 3 have had one (70%).
- So 5 × 31.2 × (1.0 + 0.9 + 0.7) = **405.6**. After 1.5% monthly churn, that is ≈ 400. The model says **400**.

**MRR at month 12:**

- The model has 156 payers: 111.7 on Plus and 44.4 on Pro.
- 111.7 × $39 + 44.4 × $79 = $4,357 + $3,508 = **$7,865**. The model says **$7,864**.

**Acquisition at month 12:**

| Line | Calculation | Amount |
| --- | --- | --- |
| Kits | 156 × $15 | $2,339 |
| Street days | 5 × $220 | $1,100 |
| AI per shop | 156 × $2 | $312 |
| AI tooling | | $100 |
| **Total** | | **$3,851** |

The model says **$3,850**.

---

# Part B — Alternative: in-person blitz with student reps

These options were costed before the remote model. They use the same cost base and the same paid-launch logic. Section numbers below are Part B's own.

## 1. Recommended option (in-person)

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

- Model: `docs/finance/model/model.py`. The launch-plan code is `LAUNCH_ASSUMPTIONS`, `REMOTE_BASE`, `remote_values`, `remote_operating_targets`, `blitz_step`, `launch_values`, `launch_summary` and `launch_grid`. The original scenarios produce exactly the same numbers as before: every existing CSV was regenerated and is byte-identical.
- Monthly detail: `output/monthly_launch_reco.csv`, `monthly_launch_founder_m4.csv`, `monthly_launch_reps2_m4.csv`, `monthly_launch_reps4_m4.csv`, `monthly_launch_reps2_m7.csv` and `monthly_launch_reps2_gated.csv`. All except the recommended file use $39 / $79, base conversion and no BIA campaign.
- Remote (Part A): `output/monthly_remote_founder_plan.csv`, `monthly_remote_plan_pro99.csv`, `monthly_remote_act45.csv`, `monthly_remote_target250.csv`, `monthly_remote_pace3.csv` and `monthly_remote_pace8.csv`. Grid: `output/remote_options.csv` (1,296 options). Sensitivity: `output/remote_sensitivity.csv`. Phone workload: `output/remote_operating_targets.csv`.
- In-person grid (Part B): `output/launch_options.csv` (324 options). Risk and price sensitivity: `output/launch_risk_sensitivity.csv`. Inputs: `output/launch_assumptions.csv`.
- **The Excel workbook (`local-loyalty-model.xlsx`) has not been updated** with the launch-plan mechanics. It still matches the original scenarios.
