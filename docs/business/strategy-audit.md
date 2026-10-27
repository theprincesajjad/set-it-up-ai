# Local Loyalty: strategy audit

Oct 22, 2026 · Strategy review for @Sajjad Pirani · All money in CAD · Model month 1 = Nov 2026

**The question:** "Understand and work the unit economics. Does it make sense to build this? How would it make sense? Is there something I'm missing?"

**How to read the numbers.** Every figure carries a tag:

- **(V)** verified against a cited source in the PRD or battlecards.
- **(M)** output of `docs/finance/model/model.py` as it stands.
- **(S)** output of this audit's strategy runs (new files `docs/finance/model/output/strategy_*.csv`; method in the appendix).
- **(A)** an assumption: the model's or this audit's.
- **(H)** hand math in this document.

Nothing in `model.py` or its existing outputs was changed. All 32 existing CSVs were checksummed before and after the strategy runs, and they are identical.

---

## 1. Verdict in five lines

1. **Build it, but as a bootstrapped vertical-SaaS business with free loyalty as the way in, not as a "network" business.** The code is mostly written and cash costs are tiny, so what you are really risking is your own time, not money.
2. **As modelled, the remote lean-ops plan breaks even in month 10, with a low point of −$23.5k (M).** That assumes 400 shops by month 3, 20% conversion and 1 support minute per shop. On this audit's assumptions it earns only **$7.5k a month by month 24** (S): 250 shops, 45% activation, 12% conversion, half the in-app volume and 4% paid churn. Pay yourself $4k a month and it needs **−$145k and breaks even in month 39** (S).
3. **It makes sense if three things are true, and you can test all three within 120 days:**
   - service shops pay for Pro before any network exists;
   - BIAs pay for campaigns;
   - phone and AI onboarding gets at least 45% of shops active, at no more than 1.5 founder hours per signed shop.
4. **The recommended version is a Pro-first service wedge inside BIA-anchored strips.** On the same audit assumptions it reaches **$19.0k a month in revenue by month 24**, with a low point of −$15.7k and break-even in month 9 (S). With a $4k founder draw that becomes −$65.9k and month 18 (S).
5. **The biggest thing you are missing: nobody pays for the network.**
   - Subscriptions, payments and BIA marketing budgets bring in almost all the revenue.
   - Revenue that needs an audience (feed ads and map pins) is under 12% of month-24 revenue even in your own plan (M).
   - The customer side earns about **1¢ per customer per month** (H).
   - The model assumes each customer uses only **1.4 shops** (A).

   You are building a SaaS company and calling it a network. Price it, sequence it and measure it as SaaS until data on customers who shop at several stores says otherwise.

---

## 2. Unit economics, worked from first principles

### 2.1 What is verified and what is assumed

| Input | Value | Status |
| --- | --- | --- |
| Toronto BIAs / businesses in BIAs | 85+ / 30,000+ | (V) City of Toronto, PRD |
| SoPoints pricing | Free + 5% fee, 1 location, 4,000 pts/mo cap, no rewards; Starter US$49; Pro US$79; Enterprise US$199 | (V) sopoints.com, checked by the lead on Oct 22, 2026. What the 5% applies to is unknown |
| Stripe Canada online card rate | 2.9% + $0.30 | (V) PRD via Xero |
| Ontario minimum wage | $17.95/hr from Oct 1, 2026 | (V) PRD |
| SMS cost | $0.022/segment incl. carrier fees | (V) Twilio rate, plus an estimate for carrier fees |
| No points on prescriptions | OCP policy; O. Reg. 264/16 s. 34 and O. Reg. 130/17 s. 6 (O. Reg. 681/93 was revoked in 2017) | (V) |
| Plus $39 / Pro $79, 0.75% platform fee | plans.ts | Decided (not market-tested) |
| 400 shops by month 3 (31 of 35 storefronts per area) | | (A) The finance team already calls this "not realistic as planned" |
| 60% activation (25+ active members) | | (A) PRD target, built for **in-person** setup |
| 20% of active shops upgrade within 6 months | 35.6% within 12, 57% within 24 | (A) The biggest single assumption |
| 75 members per active shop, 1.4 shops per customer | | (A) PRD target / model |
| In-app GMV: $2,500/mo per Plus payer, $6,000 per Pro payer, 60% adoption | | (A) Unvalidated. Ritual's experience argues against it (§3.8) |
| Paid churn 3%/mo, free churn 1.5%/mo | | (A) Low for micro-merchants |
| 1 human support minute per free shop per month | | (A) Requires AI support that does not exist yet (§3.11) |
| Stripe Connect cost 0.25% + $2/account | | (A) Marked VERIFY in the model |

**Bottom line: every number that drives the result is an assumption.** The verified numbers are mostly costs and competitor prices.

### 2.2 Revenue per paying shop

The model's mix: 72.7% of payers are on Plus and 27.3% on Pro (M).

| Line | As modelled (M) | Hand math (H) | Audit view (A) |
| --- | --- | --- | --- |
| Subscription | $49.92 | 0.727 × $39 + 0.273 × $79 = $28.35 + $21.57 | $49.92 on today's prices. With the service wedge (48% Pro at $99): **$67.78** (S) |
| Platform fee on payments (gross) | $15.55 | 60% × ($0.727 × 2,500 + 0.273 × 6,000) = 60% × $3,455 GMV × 0.75% | Half the GMV gives **$7.80**. A café doing $2,500 a month through a new app means about 300 orders a month, or 10 a day; Ritual couldn't hold that |
| Stripe Connect cost | −$6.38 | 60% × ($3,455 × 0.25% + $2) | −$3.79 |
| **Net payments margin** | **$9.17** | | **~$4** |
| **Revenue net of payments cost** | **~$59** | | **~$54** (plain plan) / **~$73** (wedge) |

**Payments are a rounding error.** The net margin is $4–9 per payer. For it to matter you would need about $250k a month of in-app GMV, at which point the payments line earns only about $1,250 a month net (H: $250k × 0.5%).

### 2.3 Contribution per paying shop (lean ops)

| Line | $/month | Basis |
| --- | --- | --- |
| Subscription | 49.92 | (M) |
| Net payments | 9.17 | (M) |
| SMS used (300 Plus / 900 Pro × $0.022) | −10.21 | (M). It eats 20% of ARPU; Pro alone costs $19.80 |
| Subscription billing (3.4% + $0.30) | −2.00 | (M) |
| Human support (5 min at $25/hr) | −2.08 | (M), lean ops |
| **Contribution** | **$44.80** | (M), hand-checked (H) |
| Audit view (half GMV, same costs) | **$39.81** | (S) |
| Wedge view (Pro $99, 48% Pro) | **$55.23** | (S) |

### 2.4 CAC under the remote plan: cash and founder time

| | Cash only (M) | Including founder time (H) |
| --- | --- | --- |
| Per signed shop | **$14.83**: kits $5, street day $220 ÷ 31 shops, AI $2 + tooling | $14.83 + 1.26 founder phone hours × $40/hr* = **~$65** |
| Per active shop (÷ 60% as modelled; ÷ 45% audit) | $24.71 | $108 (60%) / $144 (45%) |
| Per paying shop (÷ 24-month conversion: 57% as modelled; 39% audit) | **$43.10** | $190 (as modelled) / **$368** (audit) |

\*1.26 hours = 6.3 phone hours a day ÷ 5 signed a day, from `remote_operating_targets.csv` (M), month 1. $40/hr is roughly what a loaded inside-sales hire costs in Toronto (A).

**The model's 34.7x LTV/CAC (M) is not a real number.** It comes from pricing the founder's time at $0. The honest figure is in §2.5.

### 2.5 Payback, LTV, LTV/CAC

| | As modelled (M) | Audit, fully loaded (H) |
| --- | --- | --- |
| Contribution per payer | $44.80 | $39.81 |
| Paid lifetime | 33.3 months (3% churn) | 25 months (4% churn) |
| **LTV** | **$1,494** | **$995** |
| CAC per payer | $43 | $368 |
| Carrying the free shops that never pay (24 months)† | $29 | $60 |
| **LTV / fully loaded CAC** | 20.7x | **2.3x** |
| **Payback** | ~1 month | **~9 months** |

†(1 − conv24) ÷ conv24 × $1.62 a month × 24 months.

At 2.3x, a paying shop does pay back, and it is a respectable SMB SaaS number. It is not exceptional, and it is not 34x.

### 2.6 The cost of free shops

| | $/active free shop/month | Basis |
| --- | --- | --- |
| Infra | 0.60 | (A) |
| Human support, 1 min at $25/hr | 0.42 | (A), lean ops |
| Its ~54 customers: hosting $0.01 each + re-join texts | 0.61 | (M) |
| **Total** | **$1.62** | (M) |

At month 24 the current plan carries 3,118 shops for about $3,170 a month (M). **Cash is not where free shops cost you.** They cost you three other ways:

1. **Support minutes.** At 5 human minutes a month instead of 1, the cash low point goes from −$23.5k to −$43.5k (S, `strategy_stress_tests.csv`). At 3,118 shops, 1 minute each is still 52 hours a month.
2. **Your attention.** Every free shop is a relationship you have promised to keep forever.
3. **Brand risk when a free shop closes and its customers' points disappear** (§3.12).

### 2.7 Network value per shop

All-stream revenue per shop per month:

| | Per active shop | Per shop on network |
| --- | --- | --- |
| Current plan, month 24 (M) | $23.60 ($41,950 ÷ 1,777) | $13.45 |
| Audit re-base, month 24 (S) | $15.47 | $6.61 |
| Recommended (wedge + BIA), month 24 (S) | $32.30 | $16.85 |

**What the network itself produces for a shop** (H, order of magnitude):

- A strip of 27 shops × 75 members ÷ 1.4 shops per customer ≈ **1,446 unique customers**.
- About 35% use the app (A), so **~506 app users**.
- If each app user tries one new shop on the strip every 6 months, that is ~84 new-to-shop visits a month across the strip, or **~3 per shop per month**.
- To a café with 300 regulars, that is noise.

The network becomes valuable to a merchant only when customers use the app weekly *for something other than points*. That means multi-shop share has to rise well above 1.4 shops per customer.

### 2.8 What the customer side is worth

| Item | Per customer | Basis |
| --- | --- | --- |
| Impression ads | **$0.010/month** | (H) 35% app users × 6 sessions × 2 slots × 20% fill × $12 CPM ÷ 1,000 |
| Hosting | −$0.010/month | (A) |
| Join verification text | −$0.033 once | (H) 1.5 × $0.022 |
| Visits | 75 members × visit rate: unmodelled | The model never counts visits; it counts members |
| Data | Only as aggregates sold to BIAs ($2,250 per campaign) | (A) |

**A customer is worth about $0 directly.** Customers have value only through the merchant (activation and conversion) and the BIA (campaign reports). This matters for the Musk question in §4: PayPal could pay $10–20 per user because each user carried float and fee revenue. You can't pay customers anything, so any growth incentive has to be funded by merchants.

### 2.9 What breaks the model

These are one-way stress tests on the current lean-ops plan (S, `strategy_stress_tests.csv`):

| Case | Sub MRR m12 | Sub MRR m24 | Cash low | Break-even |
| --- | --- | --- | --- | --- |
| As modelled | $7,864 | $25,540 | −$23,504 | m10 |
| Conversion 10% (6 months) | $3,971 | $13,817 | −$39,809 | m17 |
| Conversion 5% | $1,995 | $7,191 | −$63,658 | m20 |
| Activation 45% | $5,898 | $19,155 | −$26,888 | m12 |
| Activation 30% | $3,932 | $12,770 | −$36,964 | m17 |
| Paid churn 5%/mo | $7,437 | $22,825 | −$23,832 | m10 |
| Free churn 3%/mo | $7,452 | $22,725 | −$23,781 | m10 |
| In-app GMV zero | $7,864 | $25,540 | −$26,643 | m12 |
| 250 by m3, 3 areas/mo | $3,749 | $10,739 | −$17,326 | m10 |
| 150 by m3, 2 areas/mo | $1,899 | $4,877 | −$16,027 | m17 |
| Human support 5 min / 15 min | $7,864 | $25,540 | −$43,496 | m16 |
| Founder draw $4k/mo | $7,864 | $25,540 | −$70,572 | m15 |
| **All audit assumptions** | **$1,591** | **$4,468** | **−$35,365** | **m21** |
| **All audit assumptions + $4k draw** | | | **−$145,339** | **m39** |

**What this shows:**

- **You won't run out of cash. You'll run out of founder.** Every case breaks even eventually, because cash costs are tiny. What collapses is *scale*. On audit assumptions, month-36 revenue is $11.4k a month and EBITDA $3.6k a month (S). That is three years of full-time work for about $43k a year.
- **Conversion and the number of shops drive revenue.** Churn barely matters inside 24 months; activation matters some.
- **The plan is sensitive to two costs it doesn't price.** One is founder time. The other is support minutes, which depend on AI support that hasn't been built.

---

## 3. The hard questions: what's missing

### 3.1 Two-sided cold start: why would customers keep a network app instead of a wallet pass?

They won't, and the plan half-knows it: the PRD makes the app optional. The wallet pass and the phone number are the product. So the "network" a customer experiences is:

- a pass per shop, or a shared pass listing shops;
- plus an app that 35% of customers open 6 times a month (A).

A coffee and a free tenth visit is not a reason to open an app.

**The cold start isn't solved; it's sidestepped.** That's fine for the merchant side, which pays, but it means the moat in the PRD ("a block where 30 shops share one app is hard to copy") is not a moat. A wallet stamp card on 30 shops is easy to copy. SoPoints already does it.

**What would make the customer side real:** a reason to open the app weekly that the shops supply for free. That could be live neighbourhood content (today's specials, new stock, events, "ready for pickup"), status on *your* repair or alteration ticket, and street-wide perks. Repair and alteration status is the strongest of these: it is the one notification a customer actually wants.

### 3.2 Does a loyalty-only free tier give merchants enough to stay?

Weakly. Since Pricing v2, Free has no promos, no messaging and **no POS auto-award**. For a Square or Clover shop, that means staff type phone numbers into a separate counter app during the rush. That is double entry, which the PRD's own risk table lists. It is the activation killer.

A loyalty program with no way to message members mostly gives discounts to regulars who would have come anyway. With nothing incremental to show, merchants drift away. The model's 1.5% monthly free churn assumes they don't.

**Fix:**

- Move **POS auto-award for Square and Clover back to Free.** Moving a feature from paid to free is always allowed under your invariant, and it costs only webhook processing.
- Keep messaging, which costs real SMS money, on Plus.

This lowers the friction exactly where the "free beats paid" pitch is weakest: against Square Loyalty, which needs zero staff effort.

### 3.3 Defensibility against Square and Clover bundling

Square sells loyalty at about $60 a month per location (A, PRD; verify). Square also offers its own online ordering with pickup, appointments, invoices and estimates, mostly bundled into processing (verify the Canadian plans).

That means:

- your **Plus order-ahead** competes with something Square gives away;
- your **Pro deposits and invoices** compete with Square Invoices;
- salons have Square Appointments' free tier.

Square has no reason to build a multi-merchant network. Its moat is the processor relationship. Your defensible ground is therefore narrow:

- the shared street layer;
- the BIA relationship and reporting;
- workflows Square does poorly: multi-step quote approval with photos, status timelines and vehicle or device records.

Integrate with Square. Never position against it.

### 3.4 SoPoints

SoPoints is the same thesis in the same city, with field agents, already running.

**What their existence tells you:** if a shared GTA loyalty card had strong network effects, someone with a head start would be winning visibly. The fact that they aren't suggests the network effect at street scale is weak (Thiel: §4.2).

**Your real differentiators:**

- 0% fee and a more generous Free plan (V);
- repair and service workflows;
- done-for-you setup.

Only the second one is hard to copy. SoPoints can drop its 5% fee in an afternoon.

**Options:** pick strips where they are thin, as the PRD says. Or treat them as a possible acquirer or partner rather than an enemy. Their shops are your Plus and Pro prospects.

### 3.5 Google and Apple wallet passes

Wallet passes are the right way in, and they are a commodity: Loopy and others charge $0–50 a month (A). Google Wallet and Apple Wallet already show location-based pass reminders. The pass is your YouTube "embed" (§4.9). Treat it as distribution, not as the product.

### 3.6 Is consumer CAC really $0?

In cash, yes: about $0.03 per join (H). In practice the cost is **staff compliance at the counter.** The counter prompt is the only consumer-acquisition channel. Staff stop asking after week one unless:

- the POS does it (§3.2); or
- the merchant sees a reason, such as a live member count or a street leaderboard.

The 75 members per active shop is a PRD *target*. Treat phone-onboarded shops as unproven until they reach it.

### 3.7 BIA dependence

In the older lean plan, BIA campaigns are 55% of month-36 revenue (M, unit-economics §6). In this audit's recommended run, they are 30% of month-24 revenue (S). That means about one paid campaign per area every two years, or roughly 48 campaigns a year by year 3 across Toronto's ~85 BIAs.

BIAs are:

- run by part-time managers;
- governed by boards;
- budgeted once a year, with spring campaigns approved in the fall.

That is a slow, lumpy and politically exposed revenue line.

**What makes it work:** use BIAs first as **distribution** (warm intros raise sign rates and activation). Take their money second. Look for one door into many BIAs: the Toronto Association of BIAs (TABIA), and programs like Digital Main Street that already fund main-street digitization (verify current programs). Without BIA revenue, the recommended plan still breaks even in month 14 (S, `strategy_recommended_sensitivity.csv`).

### 3.8 Payments and order-ahead against Ritual's decline

Ritual was a well-funded Toronto order-ahead app. The PRD cites reviews saying fewer restaurants use it now. Order-ahead at independent cafés peaked with pandemic demand.

For the merchant, your in-app payment costs 2.9% + $0.30 + 0.75%. That is about 4.5% on a $35 ticket (M), against the 1.5–2.7% they pay on their own terminal for card-present payments (A). Merchants will route only what they must through you: deposits and remote invoices.

**Don't plan on order-ahead GMV.** Deposits on approved quotes are the one payments flow with a natural reason to exist, because the customer isn't in the shop. In the stress tests, GMV at zero costs only $3k of cash (S).

### 3.9 Regulatory

| Area | Issue | Action |
| --- | --- | --- |
| **CASL** | Implied consent from a purchase lasts 2 years and covers that merchant's own messages. **Promoting *other* shops** (nearby push, network feed pushes, sponsored push) needs express consent to the network itself. Organizations face penalties of up to $10M per violation | A separate "Local Loyalty network offers" opt-in, never pre-checked; log it. Get a legal view on whether CASL covers app push |
| **Pharmacy (OCP)** | No points or inducements on prescriptions or pharmacy services (V). Banner pharmacies often have their own programs | Deprioritize pharmacies. The model already gives them 5–10% conversion |
| **Retail Payment Activities Act** | Holding funds, offering stored value or a "street dollar" can make you a payment service provider that must register with the Bank of Canada (verify scope with counsel) | Stay merchant-of-record-free: use Stripe Connect destination charges, and don't hold balances |
| **Points** | Merchant-issued points are the merchant's liability (rewards terms). Network-funded points are yours | Keep network perks BIA-funded, as lean ops already does |
| **Competition Act** | "Free" claims and drip pricing (the 2022 amendments) | Never say "free" without "loyalty program"; show the 0.75% plainly, as finance already advises |
| **Contests** | Passport-week prize draws need a skill-testing question (already handled) | Keep |

### 3.10 Founder bandwidth

The remote plan asks one person to do all of this at once:

- 75–107 dials a day (M);
- 156 new shops a month from month 4;
- selling upgrades;
- supporting 1,000–3,000 shops;
- running BIA relationships;
- maintaining a codebase with 5 POS connectors, Apple and Google wallet passes, payments, tickets, quotes, invoices, ads and campaigns, with no developer budget in year 1 (A).

That is four full-time jobs. **The model is cash-positive because the founder works for free on four jobs at once.** Rabois would say you have one barrel and no ammunition (§4.6).

### 3.11 Is AI-agent onboarding realistic?

The repo has a signup wizard and an import wizard. **There is no AI onboarding or support agent in the code today** (checked `apps/`). The lean-ops plan needs agents that can:

1. set up earn rules from a phone call;
2. get a QR stand placed and staff trained remotely;
3. answer 4 of every 5 support questions.

Item 1 is realistic now. Item 3 is plausible for "how do I…" questions. **Item 2 is the weak point:** a shop that never met anyone in person, with a $5 sticker and untrained staff, will activate far below 60%.

Assume 45% until a cohort proves otherwise. Spend in-person time where it matters most: one street day per area, as the plan already prices it.

### 3.12 Points liability on the free tier

You carry no balance-sheet liability for merchant points. You do carry the **brand** liability.

Independent restaurants and cafés close often. When a free shop closes, its customers' points vanish inside *your* app. Drop's class action was over points that were hard to redeem (V, PRD).

**Policy:**

- shops agree to give 30 days' notice of closure and keep redemptions open during that time;
- you show "this shop has left the network" plainly;
- never let the network fund points you can't cover.

### 3.13 Data and ads at Toronto scale

The finance team's own check says impression ads add under $500 a month at 20,000 customers. My math gives $0.01 per customer per month. Map pins and push boosts are really merchant SaaS priced per day. Pushes to a shop's *own* members are messaging, not network inventory.

**Don't build or sell an ad business in Toronto.** Selling local ads takes a sales team (Yelp's lesson, §4.8), and the inventory isn't there.

### 3.14 Market ceiling

**Toronto as modelled** (H):

- Saturation is 120 areas. At ~20 signed shops each, that is about 2,400 shops.
- On audit assumptions there are 145 payers at month 36 (S); the recommended plan has about 217.

The ceiling for Toronto alone is about **$0.3–0.5M a year in revenue** (S: recommended run, $29.5k a month at month 36). At 60%+ margins, that is a very good one-person business and not a venture business.

**Getting bigger** needs a repeatable city playbook (Mississauga, Ottawa, Calgary, and so on). Each city is then a fresh fight against Square's bundle, because network effects here are local (Hoffman, §4.4).

### 3.15 Is the real business something else?

| Candidate | Why it's tempting | Why it is or isn't the business | Verdict |
| --- | --- | --- | --- |
| **Repair/auto quote-approval SaaS** (Pro) | Real pain (phone tag on quotes), high tickets, value doesn't depend on density, already built | Competes with vertical shop software (auto shop management suites, repair POS) and Square Invoices. But "approve by text link, pay deposit, earn points" is a narrow, sellable job | **The revenue engine. Lead with it** |
| **BIA analytics / white-label "shop local" platform** | One buyer for 30–40 shops, existing marketing budgets, measurable reports | Small market (~85 BIAs in Toronto; Ontario has a few hundred, verify), slow buyers. Strong as distribution | **Second engine and the distribution channel.** Not a standalone business |
| **Payments rail** | Payments businesses compound | 0.5% net on GMV no one routes through you. Card-present belongs to Square, Clover and Moneris. RPAA obligations if you hold funds | **No** |
| **Consumer neighbourhood app with ads** | "Your street's Scene+" | $0.01 per customer per month; customers don't open it; Yelp-style ad sales cost | **No** |
| **Merchant-funded cashback / performance network** (Upside, Rakuten, Drop, Fluz) | Monetizes the network directly, aligned with merchant ROI, charges *every* active shop, not just 20% | Needs proof of incrementality, which needs POS data (another reason auto-award belongs on Free). Drop shows the consumer-side failure mode | **Test as a pilot at month 6–9**, only if multi-shop data supports it |
| **White-label for cities and municipalities** | COVID-era "shop local" programs show cities will pay | Procurement is slow; one-off grants | Opportunistic, not a plan |

**My answer:** the real business is **"the operating system for a main street's service shops, sold through the BIA."** Free loyalty is the reason every shop on the street says yes. Pro is what the 15–25% of shops with workflow pain pay for. The BIA pays for the street-level layer. The network is a long-dated option, not the base case.

---

## 4. The PayPal mafia audit

Each section covers how that person would think about *this* business, what they'd change, the metric they'd obsess over, and the one experiment they'd run in the next 30 days.

### 4.1 Elon Musk: first principles, delete the part, then automate

**How he'd think about it.** Musk would start from the physics of the business: what is the irreducible cost and value of one transaction?

- The cost of a loyalty "visit" is close to $0.
- Its value to the merchant is an *incremental* visit. Nothing in the plan measures that.

Then he'd apply his five-step algorithm, in order:

1. **Question the requirements.** Does a customer need an app? No: a pass and a text are enough.
2. **Delete parts.**
   - The CPM ad server, sponsored listings, the auction design and order-ahead marketing go.
   - Of the 5 POS connectors, keep Square and Clover and stop maintaining the others until a merchant asks.
3. **Simplify** the free tier to "earn, redeem, auto-award".
4. **Speed up the cycle.** One strip a week of learning, not 5 areas a month of guessing.
5. **Automate last.** AI onboarding comes *after* the manual onboarding script works. The plan has this backwards.

On PayPal's $20-then-$10 referral bonuses, he'd point out they were rational *because each PayPal account carried float and fee revenue*. Your customer is worth about $0 (§2.8), so you must not pay customers. **The merchant pays.** A two-sided referral ("bring a friend, you both get a free coffee") is funded by the shop at product cost, about $1–2 in coffee, and costs you nothing.

His X.com instinct would be the ambition: one balance, one ID, every shop on the street. He would hit RPAA reality. Park it.

**What he'd change:**

- Cut scope by half.
- Make every growth incentive merchant-funded.
- Put auto-award on Free.

**Metric:** cost per incremental visit delivered to a merchant.

**30-day experiment:** merchant-funded two-sided referrals on 2 strips. Measure the viral coefficient (invites per member × acceptance rate). A k of 0.3 or more means customer growth is self-funding; below 0.1, drop the idea.

### 4.2 Peter Thiel: monopoly in a small market, and what's the secret?

**How he'd think about it.** Thiel's four sources of monopoly are proprietary technology that is 10x better, network effects, economies of scale and brand. Today this plan scores **0 of 4**:

- loyalty software is a commodity;
- the network effect is unproven at 1.4 shops per customer;
- there are no scale economies beyond hosting;
- there is no brand.

SoPoints means you are in *competition*, which he'd call a sign you have the wrong market. He'd ask for the secret: "What important truth about Toronto's main streets do very few people agree with you on?"

A credible secret here is: **"Service shops (repair, auto, alterations) lose a large share of approved work to phone tag, will pay $99 a month to fix it, and their customers become the network's most valuable, notification-hungry members."** That is testable in 30 days.

PayPal started with eBay power sellers, a small market it could dominate. Your eBay power sellers are **one strip at 80%+ coverage** or **one vertical citywide**. Become the last mover on the asset that lasts: the street-level visit graph and the BIA reporting standard. Be definite: write the 10-year plan and the sequence. Distribution counts as much as product, and **the BIA is your distribution**.

**What he'd change:** stop spreading across 15 areas by phone. Own 3 strips completely, and own service-shop quote approval citywide.

**Metric:** share of storefronts on a strip that are live (aim for 80%+).

**30-day experiment:** sign 28 of 35 shops on one strip in 30 days, in person with the BIA's intro. If you can't own one street, you can't own a city.

### 4.3 Max Levchin: fraud, risk, and point-of-sale financing as a wedge

**How he'd think about it.** Fraud nearly killed PayPal. Levchin would audit the attack surface first:

1. **SMS-pumping fraud** on the phone-number join, which sends verification texts. This is a known abuse pattern that can run up thousands of dollars in a weekend.
2. **Staff awarding points to themselves or friends.** You have an audit trail; you need alerts.
3. **Referral abuse** if you add Musk's referrals: self-referral rings.
4. **Chargebacks on deposits** for repairs the customer disputes.
5. **Account takeover of point balances.**

Then he'd see the Affirm wedge. Auto and device repair quotes are large, unplanned bills. Affirm bought Toronto's PayBright in 2021, so point-of-sale financing is live in Canada. Adding "split this quote into 4 payments" to the quote-approval link raises approvals. The *merchant* pays for it, because a financed approval beats a declined quote. That makes Pro a revenue-lifting tool, not a cost.

**What he'd change:**

- Rate limits and caps on SMS cost per shop and per number from day 1.
- Anomaly alerts on staff awards.
- A financing option on quotes over $500 through an existing provider's merchant program (verify availability through Stripe or directly).

**Metric:** the quote approval rate and median time to approve. Second: fraud and SMS loss as a percentage of revenue.

**30-day experiment:** 5 auto or device-repair shops send their next 20 quotes as approval links (half with a pay-over-time option shown). Compare the approval rate and time-to-approval against their phone baseline.

### 4.4 Reid Hoffman: blitzscaling, network effects, and an embarrassing v1

**How he'd think about it.** Blitzscaling only pays when the market is winner-take-all. Hoffman would classify these network effects as **local**, like Uber's: each strip and each city is a separate fight, and an early lead in one doesn't carry to the next. SoPoints' head start not becoming dominance is the evidence. So **don't blitzscale**. The founder's "400 shops in 90 days" is blitzscaling without the winner-take-all payoff, and it burns your scarcest resource, your time.

LinkedIn's lesson is that the *using* side and the *paying* side were different: members used it free, recruiters paid. Here customers use it, merchants pay and BIAs pay. LinkedIn's growth came from public profiles indexed by search. Your analogue is a **public, indexed page for every shop's program and every street**: "Join Roncesvalles' card", "Pinecone Coffee rewards".

"If you're not embarrassed by v1, you launched too late": you have a well-built product and no live strip. Launch one.

**What he'd change:**

- Go live on one strip in November.
- Add public SEO pages for shops and streets.
- Measure network effects directly instead of assuming them.

**Metric:** multi-shop customers (share active at 2+ shops) and cross-shop discovery rate.

**30-day experiment:** launch public shop and street pages on the first strip and measure joins that *didn't* come from a staff prompt.

### 4.5 David Sacks: bottom-up SaaS and the metrics that matter

**How he'd think about it.** Yammer spread for free to employees, then IT paid for control. Sacks would map that: customers and staff adopt for free, and **the owner pays for growth (Plus) and operations (Pro)**.

He'd say the free product must be *self-propelling*: it has to spread and activate without you. That rules out double entry, so auto-award goes on Free (§3.2).

He'd look at packaging. Plus today mixes marketing (promos, SMS, email) with commerce (order-ahead, payments) and data (CSV, API). He'd rename the tiers by the job they do:

- **Plus = "Grow"**: messaging, promos, birthday;
- **Pro = "Run"**: tickets, quotes, deposits;
- messaging usage-based: a smaller allowance plus overage at $0.04, which finance already suggests;
- **annual prepay** with 2 months free, to lock in churn-prone micro-merchants.

He'd track the burn multiple (net burn ÷ net new ARR), which he popularized. Below 1x is excellent. The lean ops plan is fine on this because burn is tiny. He'd care more about **net revenue retention**: can a shop grow its spend through Plus to Pro, SMS overage and second locations?

**What he'd change:** tiers organized by job; usage-based messaging; annual plans; upgrade prompts at "aha" moments.

**Metric:** free-to-paid conversion within 90 days of activation, and net revenue retention.

**30-day experiment:** on pilot shops (admin overrides), trigger an in-product prompt at the 100th member: "send them a message: try Grow free for 14 days". Measure 30-day paid conversion against shops with no prompt.

### 4.6 Keith Rabois: barrels, editing, and what Square's COO knows

**How he'd think about it.** Rabois divides people into **barrels**, who can take an idea from start to shipped, and **ammunition**, who support them. Output scales with barrels. You are the only barrel, and the plan has four barrel jobs (§3.10). His first move: **find a second barrel**, a sales and ops partner or a technical co-founder. Do it before adding areas.

His second idea is the CEO as **editor**: simplify, cut, clarify. He'd edit the roadmap to one sentence: "Every service shop on 3 strips approves quotes and takes deposits through us, and the whole street runs loyalty on it for free."

From his time as Square's COO he'd know:

- Square merchants are reachable through Square's app marketplace and a one-tap integration;
- Square's loyalty is a margin add-on on top of payments;
- Square Appointments' free tier already serves salons, so a salon wedge is weak.

**Lead with repair, auto and alterations, where Square is thinnest.** Square's famous distribution trick was the free card reader. Your $5 QR stand is the same move. Make it beautiful.

**What he'd change:**

- Recruit a second barrel.
- Cut the vertical list to service shops plus cafés as traffic anchors.
- List on the Square App Marketplace (verify the Canadian listing process).

**Metric:** signed-and-active shops per founder-hour.

**30-day experiment:** a written kill list (§5.6), then 30 days spent *only* on Pro sales to service shops and one strip launch. Track hours by category.

### 4.7 Roelof Botha: market size, why now, unit economics discipline

**How he'd think about it.** As PayPal's CFO and a Square board member, Botha would put three questions first.

**(1) Market size.** Toronto caps at about $0.3–0.5M a year (§3.14). That is fine to bootstrap, too small to raise venture money on, unless the strip playbook repeats across Canadian cities at a known cost per strip.

**(2) Why now.** There is one real "why now": **AI makes the cost of onboarding and support for a micro-merchant close to zero.** That is what makes a $39 to $99 product viable for shops that sales-led SaaS could never afford to serve. The other reasons, wallet passes everywhere and frustration with coalition programs, are weaker. The why-now for *customers* is weak.

**(3) Unit economics with founder time included.**

| Measure | Value | Benchmark |
| --- | --- | --- |
| Fully loaded LTV/CAC | 2.3x (H) | |
| Payback | ~9 months (H) | Under 12 months is good |
| Gross margin, current plan m24 | 62.5% (M) | Too low for SaaS, because of SMS |
| Gross margin, audit re-base | 56% (S) | |
| Gross margin, recommended | 66% (S) | |

He'd push SMS allowances down (Plus 300, Pro 750) to reach 70%+.

From the Square board he'd ask: **"Is this a feature Square ships for free next year?"** The parts that survive that question are the BIA layer, quote approval and the street network.

**What he'd change:** manage the business on fully loaded CAC payback and gross margin; cut SMS allowances; write down the cost of launching a strip.

**Metric:** fully loaded CAC payback (target under 12 months) and gross margin (target 70% or more).

**30-day experiment:** run the identical playbook on 2 strips. Record the founder hours, cash and days needed to reach 20 active shops on each. The gap between the two strips tells you whether the playbook is repeatable.

### 4.8 Jeremy Stoppelman: local, city by city, and merchant backlash

**How he'd think about it.** Yelp came out of Levchin's incubator and launched in San Francisco, city by city, with paid community managers and "Elite" events. The consumer side was built on content that people wanted to read. Points aren't content.

Yelp makes its money from **local ad sales**. That needs a large inside-sales team, a high cost of sales and constant advertiser churn. It also brought years of merchant backlash, with accusations of pay-to-play in rankings. Stoppelman would warn you:

- the moment you sell sponsored placements to the same merchants on a shared free network, every ranking looks bought;
- keep organic order clean and visibly separate;
- never build a sales team to sell $75 map pins.

**What he'd change:**

- Hire one part-time community manager per city before any salesperson.
- Make the feed content-first: specials, events, ready-for-pickup.
- Push ads to "maybe never" in Toronto.

**Metric:** weekly active customers per strip as a share of members.

**30-day experiment:** one "Locals night" on the first strip, a members-only crawl with shop-funded perks. Measure how many attendees make a second-shop visit within 30 days.

### 4.9 Chad Hurley, Steve Chen, Jawed Karim (YouTube): remove friction, ride the embed

**How they'd think about it.** YouTube won through two things:

- **no friction**: no download, no format conversion, it played in the browser;
- **the embed**: the player spread across MySpace pages, so other sites became YouTube's distribution.

Your embed is the **wallet pass plus a one-tap join link**. It should live everywhere the shop already has an audience:

- the Instagram link in bio;
- the Google Business Profile website or menu link;
- printed receipts;
- the shop's email footer;
- the BIA's site.

Joining should take under 10 seconds with no staff involved. A customer who joins from Instagram before ever visiting is a *new* customer, the only kind the merchant truly values.

**What they'd change:** treat join links and passes as the distribution product. Give every shop a one-tap link and QR in its first week, and track join source.

**Metric:** the share of joins that don't come from staff prompts, and the pass-install rate.

**30-day experiment:** put join links into 50 shops' Instagram bios and Google profiles. Measure joins per shop per week by source, and how many of those joins visit within 14 days.

### 4.10 Luke Nosek: the contrarian bet

**How he'd think about it.** Nosek backs things most people think are wrong. He'd challenge the assumption that **customers never pay**:

- Merchant-funded coupon books like the Entertainment Book sold for decades, with customers paying for discounts that merchants funded.
- Toronto ran its own community currency, the Toronto Dollar, from the late 1990s (verify the dates).

The contrarian version: a **"Street Pass" at $3.99 a month.** Members get one perk a month at each participating shop, funded by the shops as a customer-acquisition cost. Then the customer side earns money and merchants get *new* visits.

His other contrarian move: **give it all to the BIA.** A white-label "Roncesvalles Card" makes the BIA the hero, and you become the infrastructure.

**What he'd change:** test whether customers will pay before assuming they won't.

**Metric:** customer pre-orders per 1,000 members.

**30-day experiment:** offer a Street Pass as a "fake door" (a pre-order page for a product not yet built) to the members of the first strip. A 2% pre-order rate or better is a signal; under 0.5% kills the idea.

### 4.11 Premal Shah (Kiva), optional: community capital

**How he'd think about it.** Kiva showed that communities lend to people they know. Kiva US makes 0% loans to small businesses, backed by social underwriting. The analogue is **community prepay**: regulars buy $100 of credit for $90 to fund a beloved shop's new oven or renovation, redeemable only at that shop.

That is a closed-loop gift card. Under Ontario rules it must not expire, which your terms already promise. It is also a story the local press loves.

**Metric:** prepay dollars per campaign and redemption pace.

**30-day experiment:** run one community-prepay campaign for one well-loved shop. Have the merchant be merchant of record through Stripe Connect, so no funds touch you.

### 4.12 Dave McClure: pirate metrics and cheap experiments

**How he'd think about it.** AARRR stands for Acquisition, Activation, Retention, Referral, Revenue. McClure would point out that **you have no measured number at any stage, for either side.** He'd write both funnels on one page:

| Stage | Merchant funnel (target) | Customer funnel (target) |
| --- | --- | --- |
| Acquisition | dials → owner conversations → signed (35% / 25%, A) | counter prompt / link → join |
| Activation | 25 active members in 30 days (45–60%) | 2nd visit in 30 days |
| Retention | still active at day 90 | active at 60 days; 2+ shops |
| Referral | shop refers a shop on the strip | invite accepted (k) |
| Revenue | paid within 90 days of activation | (none today) |

He'd run 10 experiments at about $100 each in a month rather than one big launch.

**Metric:** activation, because it is where the bucket leaks.

**30-day experiment:** a weekly AARRR dashboard from the admin data, plus 10 cheap tests: counter scripts, stand designs, join links, upgrade prompts, the price page.

### 4.13 Synthesis

| Person | Biggest change | Metric | 30-day experiment |
| --- | --- | --- | --- |
| **Musk** | Delete half the scope. Merchants fund all incentives. Automate last | Cost per incremental visit | Merchant-funded two-sided referral on 2 strips; k ≥ 0.3 |
| **Thiel** | Own 3 strips at 80% plus one vertical citywide; find the secret | Storefront share per strip | 28 of 35 shops on one strip in 30 days, in person |
| **Levchin** | SMS-fraud caps; financing on large quotes | Quote approval rate and time | 5 repair/auto shops × 20 quotes by link, with and without pay-over-time |
| **Hoffman** | Don't blitzscale local networks; public SEO pages; launch v1 now | Multi-shop share, cross-shop discovery | Public shop and street pages; joins not from staff prompts |
| **Sacks** | Tiers by job (Grow / Run), usage-based SMS, annual prepay, auto-award free | 90-day free-to-paid conversion, NRR | Upgrade prompt at the 100th member against a control group |
| **Rabois** | Second barrel; edit to one sentence; lead with service shops; Square marketplace | Active shops per founder-hour | Kill list, then 30 days of Pro sales plus one strip |
| **Botha** | Fully loaded CAC, gross margin ≥ 70%, AI as the why-now | CAC payback < 12 months, gross margin | Same playbook on 2 strips, measure cost per strip |
| **Stoppelman** | Community manager before sales; content feed; no ad sales | Weekly active customers ÷ members | One members-only crawl on the first strip |
| **YouTube founders** | Join links and passes as the distribution product | Joins not from staff prompts | Join links on 50 shops' Instagram and Google profiles |
| **Nosek** | Test whether customers will pay; white-label for the BIA | Pre-orders per 1,000 members | Fake-door "Street Pass" at $3.99 |
| **Shah** | Community prepay for shops | Prepay dollars per campaign | One community-prepay campaign |
| **McClure** | Two AARRR funnels, cheap experiments | Activation | Weekly dashboard plus 10 × $100 tests |

**Where they agree:**

- Shrink the footprint.
- Lead with the service workflow people pay for.
- Make merchants fund growth.
- Put auto-award and join links on Free.
- Measure the network before betting on it.
- Get a second barrel.

---

## 5. What it would take: the revised plan

### 5.1 The thesis

**Local Loyalty is the operating layer for a main street, sold through its BIA.** Every shop gets free loyalty that runs itself, with auto-award from Square or Clover and a join link. Service shops pay for quote approval and deposits. The BIA pays for street campaigns and the report. The network is measured from day 1 and monetized only once multi-shop data proves it.

### 5.2 Sequence

| When | Do | Gate to move on |
| --- | --- | --- |
| **Weeks 1–4** (Nov 2026) | Move Square and Clover auto-award to Free. Add join links and SMS caps. Sell **10 refundable $100 Pro deposits** to repair, auto and alteration shops, citywide by phone (Pro doesn't need density). Meet TABIA and 3 BIAs. Pick 3 strips | ≥ 10 deposits, ≥ 1 BIA intro |
| **Months 1–3** | **Two motions.** (a) Phone and AI motion for Pro service shops citywide. (b) In-person, BIA-introduced launches on 3 strips toward 80% coverage, then 3 areas a month, each with one street day | ≥ 45% activation; ≥ 150 signed; ≤ 1.5 founder hours per shop |
| **Months 2–6** | Pro paid from month 2 (founding price). Plus ("Grow") sold from month 4 with a 14-day trial at the 100th-member moment. First BIA campaign sold for spring | ≥ 15 paying shops and ≥ $1,000 MRR by day 180; 1 paid BIA |
| **Months 6–12** | Pay-over-time financing on quotes over $500. Second barrel hired or partnered. Measure multi-shop share and network-sourced new visits | Multi-shop ≥ 20%; ≥ 1 network-sourced new customer per shop per month |
| **Months 9–18** | *Only if the network gate passes:* pilot a performance fee ($2 per verified new-to-shop customer, opt-in, capped). *Otherwise:* deepen the vertical SaaS (vehicle and device records, reminders, financing) | — |

### 5.3 Wedge

The wedge is **service shops for revenue**: repair, auto, alterations, dry cleaning, print and, selectively, barbers. Mix **cafés and bakeries in as traffic anchors** on each strip. Deprioritize pharmacies (OCP, banners) and fashion retail (low conversion).

### 5.4 Order of monetization

1. Pro subscriptions.
2. BIA campaigns.
3. Plus ("Grow") with usage-based SMS.
4. Payments on deposits and invoices only.
5. Performance fee, if the network proves out.
6. Never in Toronto: CPM ads and sponsored listings.

### 5.5 Pricing changes

| Item | Today | Change | Why |
| --- | --- | --- | --- |
| Pro | $79 | **$99**; founding price **$79 locked** for the first 50 shops (not $59) | Finance's grid shows $99 wins under every price response tested (M) |
| Plus | $39 | Keep $39; rename by job ("Grow") | $29 loses money per payer (M) |
| SMS included | 500 / 1,500 | **300 / 750** plus $0.04 overage | Gross margin to 70%+ |
| POS auto-award | Plus | **Free** (Square and Clover) | Activation; free must run itself |
| Annual | 10× monthly | Keep, and push it at founding | Churn |
| Payments fee | 0.75% | Keep; don't plan on it | Rounding error |
| Performance fee | — | Pilot later at $2 per verified new customer | Only network-derived revenue that charges every active shop |

### 5.6 Cut and double down

**Cut or freeze:**

- the CPM ad server and auction work;
- sponsored listings;
- order-ahead *marketing* (keep the code);
- Toast, Lightspeed and Shopify connector promises until asked;
- the pharmacy vertical;
- the 5-areas-a-month pace;
- promoting the native customer app (the pass comes first);
- platform-funded network perks.

**Double down on:**

- quote approval and deposits;
- Square and Clover auto-award;
- join links and passes;
- the BIA report;
- SMS cost controls and fraud controls;
- a second barrel.

### 5.7 The model runs

All alternatives use this audit's realistic assumptions (`S0r`) as their base. They are compared with the current plan as modelled (`S0`). Source: `output/strategy_comparison.csv` (S). The cash low point and break-even come from a 60-month run.

| Strategy | Shops m12 | Payers m12 / m24 | Sub MRR m12 | Sub MRR m24 | Total revenue/mo m12 | Total revenue/mo m24 | Cash low (month) | Break-even | With $4k/mo founder draw: low · break-even |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S0 Current plan, as modelled** | 1,671 | 156 / 509 | $7,864 | $25,540 | $10,320 | $41,950 | −$23,504 (m9) | **m10** | −$70,572 · m15 |
| **S0r Same plan, audit assumptions** | 693 | 32 / 89 | $1,591 | $4,468 | $1,840 | $7,458 | −$35,365 (m20) | **m21** | −$145,339 · m39 |
| S1 Pro-first service wedge | 693 | 42 / 111 | $2,868 | $7,615 | $3,265 | $10,963 | −$20,761 (m16) | m17 | −$98,389 · m24 |
| S2 BIA-anchored strips (0.5 campaigns/area/yr) | 693 | 39 / 109 | $1,945 | $5,461 | $4,499 | $14,740 | −$18,769 (m10) | m11 | −$84,885 · m21 |
| S2b BIA-anchored (1.0/area/yr) | 693 | 39 / 109 | $1,945 | $5,461 | $6,749 | $20,365 | −$17,416 (m8) | m9 | −$65,057 · m17 |
| S3 Performance fee ($2 × 3 per active shop) | 676 | 31 / 85 | $1,561 | $4,291 | $3,470 | $9,873 | −$17,306 (m9) | m15 | −$93,242 · m26 |
| **S12 Recommended: wedge + BIA** | 693 | 51 / 136 | **$3,505** | **$9,307** | **$6,241** | **$19,024** | **−$15,712 (m8)** | **m9** | **−$65,906 · m18** |
| S123 Recommended + performance fee | 676 | 50 / 131 | $3,439 | $8,935 | $8,201 | $21,803 | −$13,992 (m6) | m7 | −$49,138 · m14 |

**What each strategy changes, relative to S0r (all assumptions):**

- **S0r** (relative to S0):
  - 250 shops by month 3, then 3 areas a month; 19.7 of 35 storefronts per area;
  - 45% activation;
  - 12% six-month conversion;
  - paid churn 4%, free churn 2.5%;
  - in-app GMV halved;
  - lean-ops costs unchanged.
- **S1:**
  - mix 35% repair/auto, 30% personal services, 20% food, 10% retail, 5% pharmacy;
  - deposit-qualified 12-month base rates: repair/auto 60% (was 45%), personal services 40% (was 32%), with the same realism multiplier (0.58);
  - Pro $99, paid from month 2.
  - Blended 6-month conversion comes out at 15.4% (S).
- **S2:**
  - activation 55% (BIA intro plus a street day);
  - 0.5 Silver campaigns ($2,250, 30% delivery cost) per area per year, starting once an area has been live 6 months;
  - gated per strip, not network-wide.
- **S3:**
  - $2 per network-sourced new-to-shop customer, 3 per active shop per month, ramped over 6 months from month 4;
  - 3.4% collection cost;
  - free churn +0.5 point for the new bill.
- **S12** = S1 + S2.

**Hand check (S12, month 12):**

- **Subscriptions:** 25.51 Plus payers × $39 = $994.89. 25.35 Pro payers × $99 = $2,509.65. Total **$3,504.54**; the run says $3,505.02.
- **BIA:** areas live 6 months by month 12 = 15 (months 1–3) + 3 × 3 (months 4–6) = 24. 24 × 0.5 ÷ 12 × $2,250 = **$2,250 a month**; the run says $2,250.
- **Revenue mix:** $3,505 subscriptions + $486 payments + $2,250 BIA = **$6,241**; the run says $6,240.80.

**What the runs show:**

1. **On realistic assumptions, the founder's plan is the weakest option.** It makes the least revenue per shop and needs the most founder time per dollar.
2. **The wedge raises revenue per payer.** ARPU goes from $50 to $68 and contribution from $40 to $55 (S). It does so without needing density, which de-risks the first 6 months.
3. **BIA campaigns are the cheapest money in the plan**, but they are lumpy and political. That is why S12 is tested without them below.
4. **The performance fee is worth testing as a probe, not planning around.** At 3 network-sourced customers per shop per month it brings break-even forward 6 months (S3 against S0r). At 1 per month it is worth only about 2 months (`strategy_perf_fee_grid.csv`). Its real value is that it tells you, in money, whether the network exists.
5. **Even the best realistic strategy reaches $19–22k a month by month 24, not $42k.** The founder's plan isn't impossible. But it needs its 400-shop, 60%-activation and 20%-conversion assumptions all to come true at once.

### 5.8 How robust is the recommended plan?

Source: `output/strategy_recommended_sensitivity.csv` (S).

| Case | Sub MRR m12 / m24 | Revenue/mo m24 | Cash low | Break-even |
| --- | --- | --- | --- | --- |
| S12 as modelled | $3,505 / $9,307 | $19,024 | −$15,712 | m9 |
| BIA 0.25 campaigns/area/yr | $3,505 / $9,307 | $16,212 | −$16,204 | m9 |
| **No BIA revenue at all** | $3,505 / $9,307 | $13,399 | −$17,347 | m14 |
| Conversion halved | $1,852 / $5,175 | $14,319 | −$18,408 | m14 |
| Paid churn 6%/mo | $3,284 / $8,245 | $17,815 | −$15,850 | m9 |
| Activation 40% | $2,549 / $6,769 | $15,370 | −$16,800 | m9 |
| Founder draw $4k/mo | $3,505 / $9,307 | $19,024 | −$65,906 | m18 |
| **No BIA + founder draw $4k/mo** | $3,505 / $9,307 | $13,399 | **−$87,346** | **m21** |

**Cash to arrange:** about **$20k** if you take no salary. About **$90k** if you need $4k a month to live on and BIA revenue fails. That second figure is the honest one.

### 5.9 The performance-fee grid

| New network-sourced customers per active shop per month | $1 each | $2 each | $3 each |
| --- | --- | --- | --- |
| 0.5 | −$33.6k · m21 | −$31.7k · m20 | −$29.9k · m20 |
| 1 | −$31.7k · m20 | −$28.1k · m19 | −$24.8k · m18 |
| 3 | −$24.8k · m18 | −$17.3k · m15 | −$15.9k · m9 |
| 5 | −$19.1k · m16 | −$15.5k · m8 | −$14.3k · m7 |

Each cell is the cash low point and break-even month, on top of S0r (S). My street-level estimate is about 3 per shop per month (§2.7).

---

## 6. Kill criteria

If any of these is missed by its date, stop or pivot as stated. Don't negotiate with them after the fact.

| # | By | Number | If missed |
| --- | --- | --- | --- |
| 1 | **Day 60** | **≥ 10 service shops have paid a $100 refundable Pro deposit** (or ≥ 5 founding annual prepayments) | The Pro wedge is dead. Without it, the realistic plan earns $7.5k/mo at month 24 (S0r). Stop, or run it part-time on one strip |
| 2 | **Day 90** | **Activation ≥ 45%** (25 active members within 30 days) on phone/AI-onboarded shops, at **≤ 1.5 founder hours per signed shop** | Below 30%: remote onboarding doesn't work. Switch to in-person on 3 strips only (the rep plan's economics) or stop |
| 3 | **Day 120** | **≥ 1 BIA has paid ≥ $1,500**, plus 2 written commitments for the next cycle (or a TABIA agreement) | Drop BIA revenue from the plan. S12 without BIA breaks even in m14 but needs ~$87k with a founder draw. Decide if you can fund that |
| 4 | **Day 180** | **≥ 15 paying shops and ≥ $1,000 subscription MRR**, with paid churn ≤ 5%/mo | You are below even the conversion-halved case. Stop adding areas; fix conversion or stop |
| 5 | **Day 180** | **Multi-shop customers ≥ 20%** on the 3 oldest strips, and **≥ 1 network-sourced new-to-shop visit per active shop per month** | The network thesis fails. Stop selling "the network"; drop ads, the performance fee and the consumer app roadmap; run as vertical SaaS plus the BIA layer |

**One overall check at day 180:** project month-24 revenue from the real numbers. If it is under **$10k a month**, the business can't pay you within two years. Your time is worth more elsewhere, unless you are deliberately running it as a side business.

---

## Appendix: how the strategy runs were produced

**Method:**

- A standalone script imports `docs/finance/model/model.py` read-only.
- It calls `remote_values()` and `run()` with the overrides in §5.7.
- It writes only `docs/finance/model/output/strategy_*.csv`.
- Two things are post-processed, not changed in `model.py`: the performance fee and the founder draw. Both are added to EBITDA after `run()`.
- Break-even is the first month from which EBITDA stays ≥ 0 through month 60, the same rule as `sustained_breakeven`.
- All 32 existing output CSVs were checksummed before and after, and are byte-identical.

**Files produced:**

| File | Contents |
| --- | --- |
| `strategy_comparison.csv` | One row per strategy (S0, S0r, S1, S2, S2b, S3, S12, S123) |
| `strategy_monthly_<key>.csv` | 36-month detail for each alternative |
| `strategy_stress_tests.csv` | One-way stress tests on the current plan (§2.9) |
| `strategy_recommended_sensitivity.csv` | Robustness of S12 (§5.8) |
| `strategy_perf_fee_grid.csv` | Performance-fee grid (§5.9) |

**Limits:**

- In S1, the wedge still converts only "active" shops (25+ members). Real deposit shops would pay before activation, so S1 understates early revenue.
- BIA revenue is booked smoothly each month. In practice it arrives in lumps in spring and at the holidays.
- The remote area mechanics stand in for the two-motion plan (citywide Pro by phone plus 3 dense strips).

To reproduce, save the script below as `strategy_audit.py` outside the repo and run `python3 -I strategy_audit.py <repo>/docs/finance/model`.

<details>
<summary>strategy_audit.py</summary>

```python
"""Strategy-audit scenarios for Local Loyalty. Imports docs/finance/model/model.py read-only and
writes only docs/finance/model/output/strategy_*.csv. Existing model outputs are not touched.

Run:  python3 -I strategy_audit.py /home/user/set-it-up-ai/docs/finance/model
"""
import csv
import os
import sys

MODEL_DIR = sys.argv[1]
sys.path.insert(0, MODEL_DIR)
import model as M  # noqa: E402

OUT = os.path.join(MODEL_DIR, "output")
LEAN = dict(support_min_free=1, support_min_paid=5, kit_cost=5.0, perk_value=0.0, merchants_per_cs=2500)

# ---------------------------------------------------------------- scenario inputs
# S0: the founder's remote lean-ops plan exactly as in model.py (REMOTE_KEY["remote_lean_ops"]).
S0 = dict(M.REMOTE_KEY["remote_lean_ops"])

# S0r: the same operating model with audit (realistic) assumptions. Every change is an assumption.
REALISTIC = dict(S0, target=250, pace=3,          # 56% of storefronts by phone, 3 areas/month after m3
                 activation=0.45,                 # phone-onboarded shops, no in-person counter training
                 conv=0.12,                       # 12% of active free shops upgrade within 6 months (not 20%)
                 paid_churn=0.04,                 # micro-merchant SaaS churn 4%/mo (not 3%)
                 free_merchant_churn=0.025,       # free shops leave/close 2.5%/mo (not 1.5%)
                 gmv_plus=1250.0, gmv_pro=3000.0)  # half the in-app GMV (order-ahead demand is unproven)


def base_multiplier(**o):
    return M.remote_values(**o)["conversion_multiplier"]


# Multiplier that gives 12% 6-month conversion at the ORIGINAL vertical mix; reused when the mix changes
# so that a wedge's higher blended conversion comes from the mix, not from a re-solve.
REAL_MULT = base_multiplier(**REALISTIC)

WEDGE_MIX = dict(mix_repair_auto=0.35, mix_personal_services=0.30, mix_food_bev=0.20, mix_retail=0.10,
                 mix_pharmacy=0.05)
# Wedge shops are pre-qualified by a $100 refundable Pro deposit, so their 12-month base rates rise
# (repair/auto 45% -> 60%, personal services 32% -> 40%) before the same realistic multiplier is applied.
S1 = dict(REALISTIC, conv=None, conversion_multiplier=REAL_MULT, pro=99.0, paid_launch_month=2,
          conv12_repair_auto=0.60, conv12_personal_services=0.40, **WEDGE_MIX)

S2 = dict(REALISTIC, activation=0.55,             # BIA intro + one in-person street day per area
          bia_campaigns_per_strip_year=0.5,       # blended: 1 in 4 areas buys a spring + holiday pair
          unlock_bia_active_merchants=0)          # gated per strip (6 months live), not network-wide
S2b = dict(S2, bia_campaigns_per_strip_year=1.0)

S12 = dict(S1, activation=0.55, bia_campaigns_per_strip_year=0.5, unlock_bia_active_merchants=0)

# Performance fee (S3): $2 per verified new-to-shop customer sourced by the network, billed to every
# ACTIVE shop (free included) from month 4; 3 such customers per active shop per month at full ramp
# (6-month linear ramp). 3.4% collection cost. Free churn +0.5 pt for the new bill.
PERF = dict(fee=2.0, per_shop=3.0, start=4, ramp=6, collect=0.034)
S3 = dict(REALISTIC, free_merchant_churn=0.03)
S123 = dict(S12, free_merchant_churn=0.03)

SCEN = [
    ("S0_current_remote_lean_ops", "Current plan: remote lean ops (as modelled)", S0, None),
    ("S0r_realistic_rebase", "Same plan, audit assumptions", REALISTIC, None),
    ("S1_service_pro_wedge", "Pro-first service wedge", S1, None),
    ("S2_bia_anchored", "BIA-anchored strips", S2, None),
    ("S2b_bia_anchored_high", "BIA-anchored, 1 campaign/area/yr", S2b, None),
    ("S3_performance_fee", "Performance fee on every active shop", S3, PERF),
    ("S12_wedge_plus_bia", "Recommended: wedge + BIA", S12, None),
    ("S123_wedge_bia_perf", "Recommended + performance fee", S123, PERF),
]


def run_strategy(o, perf, months=60, founder_draw=0.0):
    v = M.remote_values(**o)
    rows = M.run(v, months=months)
    cash = 0.0
    for r in rows:
        fee = 0.0
        if perf and r["month"] >= perf["start"]:
            ramp = min(1.0, (r["month"] - perf["start"] + 1) / perf["ramp"])
            fee = r["active_merchants"] * perf["per_shop"] * perf["fee"] * ramp
        r["rev_perf_fee"] = fee
        r["rev_total"] += fee
        r["ebitda"] += fee * (1 - perf["collect"]) if perf else 0.0
        r["ebitda"] -= founder_draw
        cash += r["ebitda"]
        r["cum_cash"] = cash
    return v, rows


def summary(v, rows):
    at = lambda m, k: rows[m - 1][k]
    cash = [r["cum_cash"] for r in rows]
    low = min(cash)
    e = [r["ebitda"] for r in rows]
    be = next((rows[i]["month"] for i in range(len(rows)) if all(x >= 0 for x in e[i:])), None)
    return {
        "shops_per_area": v["remote_shops_per_area"],
        "network_m3": at(3, "network_merchants"), "network_m12": at(12, "network_merchants"),
        "active_m12": at(12, "active_merchants"), "active_customers_m12": at(12, "active_customers"),
        "paying_m12": at(12, "paid_total"), "paying_m24": at(24, "paid_total"),
        "sub_mrr_m12": at(12, "mrr_subscriptions"), "sub_mrr_m24": at(24, "mrr_subscriptions"),
        "revenue_m12": at(12, "rev_total"), "revenue_m24": at(24, "rev_total"),
        "revenue_m36": at(36, "rev_total"), "ebitda_m36": at(36, "ebitda"),
        "cash_low": min(0.0, low), "cash_low_month": rows[cash.index(low)]["month"],
        "breakeven_month": be if be else "none in 60",
        "conv6_blended": M.conv_blended_n(v, 6),
    }


def main():
    hdr = None
    out = []
    for key, label, o, perf in SCEN:
        v, rows = run_strategy(o, perf)
        s = summary(v, rows)
        _, rows_d = run_strategy(o, perf, founder_draw=4000.0)
        sd = summary(v, rows_d)
        s["cash_low_with_4k_founder_draw"] = sd["cash_low"]
        s["breakeven_with_4k_founder_draw"] = sd["breakeven_month"]
        if hdr is None:
            hdr = ["key", "label"] + list(s.keys())
        out.append([key, label] + [s[k] for k in hdr[2:]])
        cols = ["month", "calendar", "signups", "network_merchants", "active_merchants", "active_customers",
                "paid_total", "plus_merchants", "pro_merchants", "mrr_subscriptions", "rev_payments", "rev_bia",
                "rev_perf_fee", "rev_total", "variable_total", "cac_total", "opex_total", "ebitda", "cum_cash"]
        if key != "S0_current_remote_lean_ops":
            M.write_csv(os.path.join(OUT, f"strategy_monthly_{key}.csv"), cols,
                        [[r.get(c, 0.0) for c in cols] for r in rows[:36]])
    M.write_csv(os.path.join(OUT, "strategy_comparison.csv"), hdr, out)
    print("REAL_MULT", REAL_MULT)
    for row in out:
        print(dict(zip(hdr, row)))

    # What breaks the plan: one-way stress tests on the current lean-ops plan (S0).
    tests = [
        ("as modelled", {}),
        ("conversion 10% (6 months)", {"conv": 0.10}),
        ("conversion 5% (6 months)", {"conv": 0.05}),
        ("activation 45%", {"activation": 0.45}),
        ("activation 30%", {"activation": 0.30}),
        ("paid churn 5%/mo", {"paid_churn": 0.05}),
        ("free churn 3%/mo", {"free_merchant_churn": 0.03}),
        ("in-app GMV halved", {"gmv_plus": 1250.0, "gmv_pro": 3000.0}),
        ("in-app GMV zero", {"payments_adoption": 0.0}),
        ("250 by m3, 3 areas/mo", {"target": 250, "pace": 3}),
        ("150 by m3, 2 areas/mo", {"target": 150, "pace": 2}),
        ("support 3 min free / 10 min paid", {"support_min_free": 3, "support_min_paid": 10}),
        ("support 5 / 15 min (human ops)", {"support_min_free": 5, "support_min_paid": 15}),
        ("founder draw $4k/mo", "draw"),
        ("all audit assumptions (S0r)", "real"),
    ]
    st = []
    for name, ex in tests:
        if ex == "draw":
            v, rows = run_strategy(S0, None, founder_draw=4000.0)
        elif ex == "real":
            v, rows = run_strategy(REALISTIC, None)
        else:
            v, rows = run_strategy(dict(S0, **ex), None)
        s = summary(v, rows)
        st.append([name, s["sub_mrr_m12"], s["sub_mrr_m24"], s["revenue_m24"], s["paying_m24"], s["cash_low"],
                   s["cash_low_month"], s["breakeven_month"]])
    M.write_csv(os.path.join(OUT, "strategy_stress_tests.csv"),
                ["case", "sub_mrr_m12", "sub_mrr_m24", "revenue_m24", "paying_m24", "cash_low", "cash_low_month",
                 "breakeven_month"], st)
    for r in st:
        print(r)

    # How robust is the recommended plan (S12)?
    rs = []
    for name, ex, draw in [("S12 as modelled", {}, 0.0),
                           ("BIA 0.25 campaigns/area/yr", {"bia_campaigns_per_strip_year": 0.25}, 0.0),
                           ("no BIA revenue at all", {"bia_campaigns_per_strip_year": 0.0}, 0.0),
                           ("conversion halved", {"conversion_multiplier": REAL_MULT / 2}, 0.0),
                           ("paid churn 6%/mo", {"paid_churn": 0.06}, 0.0),
                           ("activation 40%", {"activation": 0.40}, 0.0),
                           ("founder draw $4k/mo", {}, 4000.0),
                           ("no BIA + founder draw $4k/mo", {"bia_campaigns_per_strip_year": 0.0}, 4000.0)]:
        v, rows = run_strategy(dict(S12, **ex), None, founder_draw=draw)
        s = summary(v, rows)
        rs.append([name, s["sub_mrr_m12"], s["sub_mrr_m24"], s["revenue_m12"], s["revenue_m24"], s["cash_low"],
                   s["breakeven_month"]])
    M.write_csv(os.path.join(OUT, "strategy_recommended_sensitivity.csv"),
                ["case", "sub_mrr_m12", "sub_mrr_m24", "revenue_m12", "revenue_m24", "cash_low", "breakeven_month"], rs)
    for r in rs:
        print(r)

    # Performance-fee break-even: network-sourced new customers per active shop per month needed.
    pf = []
    for per in (0.5, 1, 2, 3, 5):
        for fee in (1.0, 2.0, 3.0):
            v, rows = run_strategy(S3, dict(PERF, per_shop=per, fee=fee))
            s = summary(v, rows)
            pf.append([per, fee, s["revenue_m12"], s["revenue_m24"], s["cash_low"], s["breakeven_month"]])
    M.write_csv(os.path.join(OUT, "strategy_perf_fee_grid.csv"),
                ["new_customers_per_active_shop_month", "fee_per_customer", "revenue_m12", "revenue_m24",
                 "cash_low", "breakeven_month"], pf)
    for r in pf:
        print(r)


if __name__ == "__main__":
    main()
```

</details>
