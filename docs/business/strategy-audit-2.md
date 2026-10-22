# Local Loyalty: strategy audit 2 — the ordering fee, and how this gets big

Oct 22, 2026 · Strategy review for @Sajjad Pirani · All money in CAD unless marked US$ · Model month 1 = Nov 2026

Follows [strategy-audit.md](strategy-audit.md), which stays as written. That audit's recommended plan (**S12**: Pro-first service wedge inside BIA-anchored strips, on its realistic inputs) is the yardstick here, called **R0**.

**The founder's follow-up, in brief:** there will always be a platform fee on ordering payments, much cheaper than DoorDash, Uber Eats or Ritual. The network is community-wide, across every kind of shop, so no shop needs its own app. Ritual failed partly because it was only restaurants. Fees are charged *on top of* the subscription, and the subscription pays for the other features. Then: how do we make this a **massive** SaaS company?

**Tags.** Every number carries one:

| Tag | Meaning |
| --- | --- |
| (W) | Verified on the web on Oct 22, 2026; source linked at the end |
| (W?) | Found on the web but secondary, dated or conflicting |
| (U) | Could not be verified |
| (S2) | Output of the new runs, `docs/finance/model/strategy_audit_2.py` → `output/strategy2_*.csv` |
| (S) | Output of the first audit's runs |
| (A) | Assumption |
| (H) | Hand math |

`model.py` and every existing output are unchanged; checksums match before and after.

---

## 1. The answer in brief

1. **The fee is right, but cheap pickup is not where the money is.**
   - Card processing alone is about 4.8% of a $15 café order (Stripe 2.9% + C$0.30, W).
   - DoorDash Canada's pickup commission is 8% (Plus/Premier) or 10% (Basic), including processing (W).
   - So anything above about a 2% fee on small tickets is **not** "much cheaper than DoorDash". At 8% you are *more* expensive (12.9% all-in on a $15 order).
   - Square Online charges no commission at all (2.9% + 30¢, W). For a Square shop, our fee is a premium over free.
2. **On realistic inputs, the founder's structure adds about $2–8k a month at month 24 over the first audit's plan** (S2): $21.0–26.7k against $19.0k, depending on the fee and whether ordering is open to every shop. It adds nothing if order volumes are half what is assumed.
   - Even then, **54% of all take-rate revenue comes from repair and auto deposits and invoices.** Café pickup is 28% (S2, 3.5% case).
   - The money follows ticket size, not shop count.
3. **The big business is a quote-to-pay payments network for independent service shops, distributed through main streets and BIAs.** Free loyalty and low-fee pickup for every shop on the street are the reason the whole street joins, and the network layer. The ordering fee belongs on top, priced so the "cheaper than DoorDash" claim is true.
4. **On that thesis, Toronto alone reaches $36.8k a month in revenue by month 24 and $52.3k by month 36** (S2), against R0's $19.0k and $29.5k. Low point −$14.7k, break-even month 7; with a $4k founder draw, −$46.9k and month 10.
   - With an Ontario rollout and a five-person team, it passes **$10k a month in month 10, $50k in month 24 and $100k in month 37** (S2). The low point is −$45k, including a $5k a month founder salary from month 13.
5. **"Massive" means owning the payment flow of service shops**, eventually including card-present payments and financing, at hundreds of dollars a month per location. Toast's benchmark is about US$1,000 per location per month (H, from W).
   - A loyalty-and-pickup network earning $25–35 per shop is a nice small company at any scale you can reach.
   - Getting past Ontario needs outside capital; bootstrapping gets you to roughly $100k a month on these assumptions.

**Scope in one sentence:** *We are the quote-to-pay and pickup network for a neighbourhood's independent shops that gets service jobs approved and paid by text, and lets every shop on the street take orders and share regulars at a fraction of DoorDash's cost.*

---

## 2. Revenue re-modelled with the founder's structure

### 2.1 What the alternatives charge today

| Who | Merchant fee for pickup / online orders | Status |
| --- | --- | --- |
| **DoorDash Canada** | Pickup commission **8% (Plus, Premier) / 10% (Basic)**. Delivery 20% / 25% (27% DashPass) / 29%. Page says no separate processing fee on partnership plans. Tablet C$3/week | (W) merchants.doordash.com/en-ca/pricing, fetched Oct 22, 2026. Page undated. DoorDash's blog says pickup was cut from 15% |
| **Uber Eats Canada** | Feb 2022: 3% for in-restaurant/pickup-style orders, 2.9% for direct web orders, delivery from 20%. 2025 vendor blog: pickup 7%, delivery 20/25/30% | (W?) Canadian Press 2022; vendor blog 2025. **Current official rate unverified** |
| **Ritual** (Toronto) | 2020: "typically 15% commission and $49.99/month". Pandemic-era ShopHERE partners got lifetime exemptions | (W?) 2020–22 articles. **Current pricing unverified (U)** |
| **Square Online (CA)** | No commission. Online card payments **2.9% + 30¢** (fees page). An Oct 2024 press release says 2.8% + 30¢ | (W) / (W?) conflict |
| **Toast** | No commission on its own online ordering. Module about US$75/mo (third-party). **US$0.99 guest fee** on orders ≥ $10 (2023). Canada pricing not found | (W?) US only; Canada (U) |
| **Shopify (CA)** | Online card rate 2.9% + 30¢ (2024 guides) or 2.8% + 30¢ (newer source) | (W?) conflict |
| **Stripe Canada** | Card-not-present **2.9% + C$0.30**. In person 2.7% + C$0.05. Interac in person C$0.15 | (W) stripe.com/en-ca/pricing |
| **Stripe Connect (CA), "you handle pricing"** | **C$2 per monthly active account**, **0.25% + C$0.25 per payout**. "Stripe handles pricing": no platform fees | (W) stripe.com/en-ca/connect/pricing |

**How the merchant sees it.**

- DoorDash's 8–10% buys *demand*: millions of app users who find the shop.
- Square Online's 0% commission buys nothing extra, but costs nothing extra.
- Our fee sits between the two. It is justified only by demand the network actually sends and by a customer who already holds the shop's pass.

That is why the network must be measured, not assumed (§6).

### 2.2 How the ordering layer is modelled

The model's built-in payments line (payers × GMV × 60% × 0.75%) is **removed** and replaced with the layer below. All inputs are (A).

| Vertical | Share of eligible shops adopting (at 2% fee) | Orders/payments per week | Average ticket | GMV per adopting shop/mo (H) |
| --- | --- | --- | --- | --- |
| Cafés, bakeries, restaurants | 30% | 20 | $15 | $1,299 |
| Retail: grocer, florist, pet, gift | 12% | 5 | $45 | $974 |
| Repair/auto (deposits + invoices) | 45% | 4 | $180 | $3,118 |
| Salons and services (booking deposits) | 30% | 8 | $50 | $1,732 |
| Pharmacy (front store) | 5% | 3 | $30 | $390 |
| **Quote-to-pay rail variant:** repair/auto runs *all* invoices | 35% | 12 | $300 | **$15,588** |
| **Rail variant:** services prepaid | 30% | 12 | $60 | $3,118 |

**Mechanics:**

- Ordering goes live in month 4 and ramps linearly over 9 months.
- **Price sensitivity:** adoption scales with (merchant's all-in cost ÷ all-in cost at a 2% fee)^−1, where all-in = Stripe 2.9% + $0.30 + our fee.
- Card processing is passed through at Stripe cost: neither our revenue nor our cost.
- **Our costs:**
  - Connect 0.25% of volume, C$2 per active account and C$0.25 per weekly payout (W);
  - losses (refunds, chargebacks, fraud) 0.15% of GMV;
  - 0.5 order-ready texts per order at $0.022;
  - 5 extra support minutes per adopting shop.
- **"Paid" structure** (plans.ts today: ordering is a Plus feature): only paying shops can take orders, at twice the adoption rate (capped at 90%).
- **"All" structure** (the founder's words: "the subscription is for the other features"): every active shop can take orders for the fee alone. Cafés lose one reason to buy Plus, so café conversion falls 20%.
- Café adoption and the take rate both assume pickup where the customer pays in the app; no delivery is modelled.

### 2.3 The merchant's all-in cost against DoorDash

Source: `strategy2_ordering_unit_economics.csv` (H/S2). Fee (our take) on GMV per adopting shop, then the merchant's all-in cost per order (processing + our fee):

| Vertical (ticket) | 2% | 3.5% | 5% | 8% | 1.5% + $0.49 customer fee |
| --- | --- | --- | --- | --- | --- |
| Café ($15) | $26/mo · **6.9%** | $45 · **8.4%** | $65 · 9.9% | $104 · **12.9%** | **6.4%** to the merchant |
| Retail ($45) | $19 · 5.6% | $34 · 7.1% | $49 · 8.6% | $78 · 11.6% | 5.1% |
| Repair ($180) | $62 · 5.1% | $109 · 6.6% | $156 · 8.1% | $249 · 11.1% | 4.6% (rail: 1%, no customer fee: 4.1%) |
| Services ($50) | $35 · 5.5% | $61 · 7.0% | $87 · 8.5% | $139 · 11.5% | 5.0% |

Compare: DoorDash Canada pickup 8–10% all-in (W); Uber Eats pickup reportedly about 7% (W?); Square Online 2.9% + 30¢, or 4.9% on $15 (W).

**On a café ticket, 3.5% already matches DoorDash's 8% pickup rate, and 5–8% is above it.** The only way to be clearly cheaper on small tickets is a low merchant fee plus a small, visible **customer** service fee. Toast charges guests US$0.99 (W?).

### 2.4 Results by take rate, on realistic inputs (Toronto)

Source: `strategy2_comparison.csv` (S2). Monthly figures; the cash low point and break-even come from 60-month runs. Payments gross margin is net of Connect costs and losses.

| Case | GMV/mo m24 | Subscription MRR m12 / m24 / m36 | Fee revenue m12 / m24 / m36 | **Total revenue/mo m12 / m24 / m36** | Gross margin m24 | Cash low · break-even | With $4k draw |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **R0: first audit's plan** (0.75% on payers) | (in model) | $3,505 / $9,307 / $14,802 | — | **$6,241 / $19,024 / $29,511** | 66% | −$15,712 · m9 | −$65,906 · m18 |
| F: ordering on Plus/Pro, 2% on top | $239k | same as R0 | $1,813 / $4,780 / $7,563 | $7,568 / $22,514 / $35,021 | 67% | −$15,857 · m9 | −$58,946 · m16 |
| **F: ordering on Plus/Pro, 3.5% on top** | $186k | same | $2,468 / $6,510 / $10,303 | $8,223 / $24,244 / $37,761 | 71% | −$15,716 · m8 | −$55,122 · m14 |
| F: 5% | $152k | same | $2,887 / $7,616 / $12,054 | $8,642 / $25,349 / $39,511 | 73% | −$15,647 · m8 | −$53,503 · m12 |
| F: 8% | $112k | same | $3,391 / $8,948 / $14,164 | $9,146 / $26,681 / $41,622 | 75% | −$15,563 · m8 | −$52,453 · m12 |
| N: ordering for every shop, 2% | $300k | $2,443 / $6,565 / $10,539 | $3,556 / $6,007 / $7,815 | $8,249 / $20,998 / $31,009 | 65% | −$16,743 · m9 | −$59,351 · m16 |
| **N: every shop, 3.5%** | $237k | same | $4,902 / $8,279 / $10,772 | $9,594 / $23,271 / $33,966 | 71% | −$16,162 · m8 | −$53,192 · m12 |
| N: every shop, 5% | $195k | same | $5,781 / $9,764 / $12,703 | $10,473 / $24,755 / $35,897 | 73% | −$15,907 · m8 | −$51,178 · m11 |
| N: every shop, 8% | $145k | same | $6,862 / $11,590 / $15,080 | $11,555 / $26,582 / $38,274 | 77% | −$15,592 · m8 | −$49,411 · m11 |
| **N: every shop, 1.5% + $0.49 customer fee** | $297k | same | $4,741 / $8,008 / $10,418 | $9,433 / $22,999 / $33,613 | 68% | −$16,320 · m8 | −$54,269 · m12 |
| N 3.5%, half the orders | $118k | same | $2,451 / $4,140 / $5,386 | $7,143 / $19,131 / $28,580 | 67% | −$16,928 · m9 | −$63,070 · m17 |
| N 3.5%, merchants twice as price-sensitive | $186k | same | $3,864 / $6,526 / $8,490 | $8,556 / $21,518 / $31,685 | 70% | −$16,314 · m8 | −$55,194 · m14 |
| N 3.5%, optimistic volumes | $609k | same | $12,619 / $21,314 / $27,730 | $17,312 / $36,306 / $50,925 | 76% | −$14,960 · m7 | −$45,710 · m10 |
| **V: quote-to-pay rail** (service shops run all invoices: 1% on services, 1.5% + $0.49 on pickup) | **$1.64M** | $3,505 / $9,307 / $14,802 | $11,308 / $19,100 / $24,850 | **$17,063 / $36,834 / $52,308** | 63% | **−$14,719 · m7** | **−$46,892 · m10** |
| V with half the service invoices | $846k | same | $6,340 / $10,708 / $13,932 | $12,095 / $28,442 / $41,390 | 64% | −$15,378 · m8 | −$50,764 · m12 |

**Where the fee revenue comes from at month 24** (`strategy2_take_by_vertical_m24.csv`, S2):

| Case | Food | Retail | Repair/auto | Services | Total |
| --- | --- | --- | --- | --- | --- |
| N 3.5% | $2,309 (28%) | $474 | **$4,461 (54%)** | $1,010 | $8,279 |
| N 1.5% + $0.49 | $3,714 (46%) | $441 | $2,923 (37%) | $901 | $8,008 |
| V rail | $2,122 | $176 | **$14,053 (74%)** | $2,731 | $19,100 |

**What this shows:**

1. **The founder is right that a fee on top of the subscription is better than the model's 0.75%-on-payers line.** It adds $2–8k a month at month 24 (about $0.1k if order volumes are half), and the cash low point barely moves, because costs scale with GMV.
2. **A higher fee looks better in the model than it would in real life.** The 1.0 price sensitivity can't see the cliff above DoorDash's 8%. A café owner who compares 12.9% with DoorDash's 8% won't switch, and DoorDash at least brings new customers. **Don't price above about 2% of merchant fee on tickets under $25.**
3. **1.5% + a $0.49 customer fee earns the same as a 3.5% flat fee** ($23.0k against $23.3k at month 24), and it keeps the "cheaper than DoorDash" claim honest: 6.4% against 8–10%.
4. **The fee base that matters is service invoices**, not café pickup. Repair and auto produce the majority of fee revenue in every structure. In the rail case, monthly revenue doubles R0's.
5. **"Ordering for every shop" against "ordering on Plus/Pro" is nearly a wash on revenue** ($23.3k against $24.2k at 3.5%). But "every shop" puts 63% more shops on ordering at month 24 (124 against 76). That is what gives customers a reason to open the app, which is the founder's community thesis. **Choose "every shop" for the network, not for the revenue.**
6. **Gross margin on the rail is only 63%,** because Connect's 0.25% plus 0.15% losses eat about 40% of a 1% fee (H: $1.64M × 0.4% ≈ $6.6k of $19.1k).
   - Switching to Stripe's "Stripe handles pricing" model (direct charges with an application fee, no platform fees, W) recovers about **$4k a month at month 24, roughly +11 points of margin** (H: $1.64M × 0.25%).
   - Check this with Stripe before building on it; the repo uses destination charges today.

**Cannibalization, plainly.**

- Most pickup orders come from customers who would have walked in anyway (A). The merchant pays 4.8–6.4% on sales they used to take at a 1.5–2.7% card-present rate (W). That is a cost to them, not new revenue.
- Only network-sourced first orders are a real gain for the merchant.
- The model's adoption rates already assume many shops decline. If the share of pickup orders from customers new to the shop stays under about 10%, expect café adoption at the low end of the table.

---

## 3. The "massive" question

### 3.1 Market sizes

**Base counts:**

- **Canada:**
  - retail: 134,970 employer establishments (W, ISED/StatCan, 2025);
  - food services and drinking places: 75,407 (W);
  - personal, repair and auto services: about 60,000 (A);
  - **total about 270k**, of which about **200k are independents** (A, less about 25% chains).
- **US:** 36.2M small businesses (W, SBA 2025), mostly with no employees. About **2.5M storefront independents** in these categories (A).
- **Service shops alone:** about 70k in Canada and 800k in the US (A).
- **BIAs:** Toronto 84 (W, 2022); Ontario 300+ (W?, OBIAA about 2020); US 1,002 business improvement districts (W, 2011 census).
- **Benchmarks:** Toast has about 164,000 locations and US$2.0B in annualized recurring revenue (W, Q4 2025), so **about US$12.2k per location per year** (H). Square volume was about US$67B in Q3 2025 (W?).

| Thesis | Revenue per shop per year (basis) | TAM Canada | TAM North America | SOM: 5 years, Ontario |
| --- | --- | --- | --- | --- |
| **(a) Community commerce network**: loyalty + low-fee pickup, all verticals | $281 (S2: N 3.5% at m36, $33,966 ÷ 1,452 shops incl. BIA) | ~$56M (200k × $281) | ~$760M (2.7M × $281) | ~$1.4M/yr (S2 3.5% scale path, m60 $114k/mo) |
| **(b) Payments-first** (Square-style) | ~$2,000 (A: $400k card volume × 0.5% net) | ~$400M | ~$5.4B | Not reachable bootstrapped: hardware, risk, licensing |
| **(c) Vertical quote-to-pay for service shops, expanding across the street** | ~$3,060 per *adopting* service shop ($99 + $156 fee per month, S2/H); ~$470 per average street shop | ~$210M (service shops) + street layer | ~$2.4B + street layer | **~$2.1M/yr** (S2 rail scale path, m60 $172k/mo) |
| **(d) BIA / municipal platform** | ~$10k per BIA (A) | ~$4M (~400 Canadian BIAs, A) | ~$15–20M (~1,500–2,000 orgs, A) | ~$0.4M/yr in campaigns (S2: BIA line at m60 $33k/mo, inside the rail path) |
| **(e) Merchant-funded customer acquisition** (pay per new customer) | ~$72 ($2 × 3 per month, S/A); far more if incrementality is proven and the price rises toward $10–20 | ~$14M at $2 | ~$190M at $2 | Probe only |

All TAM rows are hand math on labelled inputs (H), not research figures.

### 3.2 The five theses, PayPal-style

**(a) Community commerce network** (the founder's v2)

| | |
| --- | --- |
| Real problem, and who has it | Shops pay 8–30% to DoorDash and Uber; customers juggle passes and apps. But for *pickup*, the problem is mild: Square Online is free, and walk-in customers don't need an app |
| Why now | Wallet passes are everywhere; AI onboarding |
| Moat | Network density on a strip. Weak at 1.4 shops per customer (A); Ritual shows how this fails |
| Unit economics | $25–45 a month per shop (S2) |
| Capital | Low |
| **Killer risk** | Customers order weekly from 0–1 shops, not 3. Then the "network" never forms and the fee is a premium over free |

**(b) Payments-first**

| | |
| --- | --- |
| Real problem | Shops overpay for processing. They mostly don't: Square, Clover and Moneris are cheap and bundled |
| Why now | None specific to us |
| Moat | Scale and risk models, which belong to Square |
| Unit economics | Highest per shop |
| Capital | Very high: hardware, underwriting, RPAA registration with the Bank of Canada if you hold funds (verify with counsel) |
| **Killer risk** | You lose a head-on fight with Square on its home ground |

**(c) Vertical quote-to-pay wedge, expanding across the street**

| | |
| --- | --- |
| Real problem | Repair, auto and alteration shops lose time and approvals to phone tag. They chase deposits and invoices by phone and in person, on tickets of $150–2,000. Clear pain, clear payer (A, needs the 10-deposit test) |
| Why now | Customers approve by text link and pay with Apple/Google Pay (Interac included, W); AI can write the quote message; wallet passes carry status |
| Moat | **Switching costs** (system of record for tickets, vehicles and devices) plus **payment flow**, plus the street network as distribution and retention |
| Unit economics | $255 a month per adopting shop (H); Toast's ~US$1,000 a month shows how high this can go |
| Capital | Low to start; venture capital to go national |
| **Killer risk** | Established shop-management software for auto (US: Shopmonkey, Tekmetric; Canada: Mitchell 1, Protractor; verify) and device-repair software. Mitigation: start with the long tail they don't serve, and integrate rather than replace |

**(d) BIA / municipal platform**

| | |
| --- | --- |
| Real problem | BIAs can't prove their events drive visits |
| Why now | Post-COVID main-street programs; data expectations |
| Moat | Relationships and the reporting standard |
| Unit economics | Lumpy; $1,500–3,000 a campaign (A) |
| Capital | Low |
| **Killer risk** | A tiny pool of buyers with annual budgets. **Superb as distribution** (one yes = 30–300 shops) and **poor as a business on its own** |

**(e) Merchant-funded acquisition network**

| | |
| --- | --- |
| Real problem | Shops want new customers and pay heavily for them (DoorDash's 8–30% is partly this) |
| Why now | POS data (Square/Clover auto-award) makes incrementality measurable |
| Moat | Data plus density |
| Unit economics | Could become the best line *if* proven |
| Capital | Medium |
| **Killer risk** | You can't prove incrementality at street scale. Drop shows the consumer side can go sour |

### 3.3 The pick and the sequence

**Primary thesis: (c), with (a) as the network layer and (d) as the channel.** Become the **quote-to-pay system and payments rail for independent service shops.** Make it the street's shared loyalty-and-pickup network so every shop on the street joins, and sell it street by street through BIAs.

**Why this and not (a) alone:**

- Under every structure tested, most fee revenue already comes from service invoices (§2.4).
- Every massive SMB software company of the last decade (Toast, ServiceTitan, Mindbody, Square) owns a *workflow plus its payments* in a vertical first, then expands.
- Horizontal local networks without a workflow anchor (Groupon, Ritual, Drop) have struggled.

**Sequence:**

| Stage | When | What |
| --- | --- | --- |
| 1. Wedge | Months 1–12 | Quote approval, deposits and invoices for repair, auto and alteration shops (Pro $99 + 1%). Free loyalty and pickup for every shop on 3–15 BIA strips (1.5% + $0.49). Prove: service GMV per shop and the share of pickup orders from customers new to the shop |
| 2. Street | Months 12–24 | Every vertical on the strip: booking deposits for salons and barbers, click-and-collect for grocers and florists. BIA campaigns. Ontario's larger BIA cities (Ottawa 19, Hamilton 13, W 2020) |
| 3. Rail | Months 24–48 | Card-present payments for service shops through Stripe Terminal (2.7% + C$0.05, W), then negotiated processing at volume. Financing on large quotes with a partner. This is where revenue per location moves from about $250 to $500+ a month |
| 4. Scale | Year 3+ | Repeat the BIA playbook across Canada and into US business improvement districts (1,000+, W 2011). Needs venture capital and a sales and risk team |

**What makes it big rather than small:**

| | Small (where the founder's v2 lands on its own) | Big |
| --- | --- | --- |
| Revenue per location | $25–45/mo | $250–1,000/mo |
| Locations | A few thousand | 50k+ |
| Annual revenue | $1–2M | $150–600M (H) |
| What you own | Loyalty plus pickup convenience | Service shops' payment flow (online and in person), the job record, and the customer relationship across the street |
| Moat | Network density, which is weak | Switching costs |
| Growth | Every city is a fresh founder-led grind | A repeatable BIA playbook, then a sales team |

**Honest caveat:** stage 3 is a different, harder company (risk, underwriting, hardware, compliance). You don't have to decide on it until stage 1 proves service GMV.

---

## 4. The PayPal mafia on this version (ordering fee + community network)

**Elon Musk**

- **First-principles view:** processing alone is about 4.8% of a $15 order (W). A percentage fee on tiny tickets fights physics. Put the percentage where tickets are big, and charge small tickets per order, visibly to the customer.
- **In:** per-order customer fee; 1% on service invoices.
- **Out:** a percentage fee over 2% on café tickets; stored value for now (RPAA).
- **Metric:** our fee as a share of the merchant's all-in cost.
- **30-day experiment:** 10 cafés show a $0.49 customer fee against no fee (alternating weeks). Measure the drop in orders.

**Peter Thiel**

- **View:** "Anti-DoorDash for pickup" competes with free (Square Online) and with DoorDash's demand. That is not a monopoly.
- **The secret:** service invoices are the biggest local payment flow nobody networks. Own quote-to-pay for independent auto and device repair in one city.
- **In:** service rail.
- **Out:** citywide pickup marketing.
- **Metric:** share of target service shops in one area running quotes through us.
- **30-day experiment:** sign 20 auto and device shops within 3 km of strip 1.

**Max Levchin**

- **View:** payments are risk.
  - Deposits on repairs lead to disputes.
  - Pickup orders draw stolen-card fraud.
  - Refunds on no-shows.
  - RPAA applies the moment you hold funds.

  And the Affirm lesson: financing on large quotes lifts approvals, and the merchant funds it.
- **In:** dispute flow, velocity limits, pay-over-time on quotes over $500.
- **Metric:** loss plus dispute rate in basis points of GMV (model: 15).
- **30-day experiment:** a financing partner on 5 shops' quotes over $500. Compare approval rates.

**Reid Hoffman**

- **View:** Ritual didn't fail only for being restaurant-only. It lacked a weekly *multi-shop* habit. Being cross-vertical helps only if the same customer orders from 3+ shops a month. Local network effects, so fight strip by strip.
- **In:** one strip at depth.
- **Out:** spreading thin.
- **Metric:** paid orders per active customer per month, across shops.
- **30-day experiment:** an "order ahead from any shop" week on strip 1.

**David Sacks**

- **View:** free ordering plus a fee is usage-based pricing on the free tier: product-led and aligned with value. Net revenue retention rises as shop GMV grows. Publish one simple fee per category and no hidden fees.
- **In:** fee shown on the pricing page.
- **Out:** custom deals.
- **Metric:** net revenue retention, and burn multiple.
- **30-day experiment:** test the pricing page on visitors: "1.5% + $0.49 paid by your customer" against "3.5% flat". Measure ordering opt-ins.

**Keith Rabois**

- **View:** v2 adds scope back (order-ahead for every vertical). Edit it: pickup for the strip's food anchors, plus quote-to-pay. To a Square shop, our fee is "Square Online plus a fee", so only the network justifies it.
- **In:** two flows.
- **Out:** catalogue sync for every vertical in year 1.
- **Metric:** share of pickup orders from customers new to the shop.
- **30-day experiment:** measure that on strip 1.

**Roelof Botha**

- **View:** why does a fee work now when Ritual's 15% didn't? Because ours is a third of DoorDash's, and service invoices give it a real base. Margin discipline: Connect eats about 40% of a 1% fee.
- **In:** move to direct charges with application fees ("Stripe handles pricing").
- **Metric:** payments gross margin (fee minus Connect costs and losses, over fee).
- **30-day experiment:** get Stripe's Canadian platform pricing in writing for both models.

**Jeremy Stoppelman**

- **View:** Toronto restaurants have boycotted delivery apps over commissions (W?). Merchants hate anything that feels like a tax, so the fee must feel like a tool. Keep the ordering list neutral, never pay-to-rank.
- **In:** neutral listing, a public fee policy.
- **Out:** sponsored ordering slots.
- **Metric:** merchants' rating of the fee (fee NPS).
- **30-day experiment:** 20 owner interviews: "What would you pay us against DoorDash for pickup?"

**Hurley, Chen and Karim (YouTube)**

- **View:** the founder is right that shops don't need their own app. The embed is the "Order pickup" and "Approve quote" link on the shop's Google profile, Instagram and texts.
- **In:** links that work without the app.
- **Metric:** orders from links outside the app.
- **30-day experiment:** an "Order pickup" link on 30 shops' Google Business Profiles.

**Luke Nosek**

- **View:** be contrarian about who pays. "0% to the merchant, $0.69 to the customer" on small tickets is a pitch DoorDash can't match.
- **Metric:** merchant opt-in rate for ordering.
- **30-day experiment:** offer 5 cafés the customer-fee-only version.

**Dave McClure**

- **View:** set up the ordering funnel: shop adopts → first order → orders per week → repeat orderers → orderers new to the shop.
- **Metric:** weekly orders per adopting café (model: 20).
- **30-day experiment:** 10 cafés for 30 days; count them.

**Premal Shah** (optional)

- **View:** prepaid service bundles, such as a "winter tire swap" prepay, are community capital and GMV at once.
- **30-day experiment:** one prepaid bundle at one auto shop.

**Consensus scope:** *We are the quote-to-pay and pickup network for a neighbourhood's independent shops that gets service jobs approved and paid by text, and lets every shop on the street take orders and share regulars at a fraction of DoorDash's cost.*

---

## 5. Scope for the next 12 months

### 5.1 Product in and out, by plans.ts key

| Plan | Keys | Change from today |
| --- | --- | --- |
| **Free** (forever) | `loyalty.*`, `network.listing`, `wallet.passes`, `customers.directory`, `reports.basic`, `staff.unlimited`, `locations.unlimited` | Unchanged |
| **Free + fee** (new) | `orders.order_ahead`, `orders.pickup_status`, `payments.in_app` | **Move from Plus to Free, with the platform fee** (paid → free is allowed by the invariant). Messaging must say "no fee on loyalty", not "no fees" (Competition Act) |
| **Free** (moved) | `integrations.pos_auto_award` (Square and Clover only) | Plus → Free (first audit §3.2) |
| **Plus "Grow"** $39 | `promos.basic`, `promos.double_points`, `loyalty.vip_levels`, `loyalty.birthday_bonus`, `loyalty.referrals`, `discount_cards`, `marketing.email`, `marketing.sms`, `marketing.automations`, `customers.csv_export`, `customers.csv_import`, `integrations.webhooks`, `reports.advanced`, `booking.pickup_slots` | Loses order-ahead and payments to Free + fee. SMS allowance 300 plus overage |
| **Pro "Run"** $99 | `service.tickets`, `service.quote_approval`, `service.deposits`, `service.invoices`, `booking.dropoff_scheduling`, `staff.permissions` | Price $79 → $99 (founding $79 for the first 50). SMS 750 plus overage |
| **Admin / BIA-run** | `campaigns.neighbourhood`, `network.perks` (BIA-funded only) | Sold by hand, gated per strip |
| **Hidden for 12 months** | `ads.sponsored_listing`, `ads.sponsored_promo`, `ads.map_pin`, `promos.push_nearby` | Not sold. Ad inventory isn't there; CASL risk on promoting other shops |
| **Not marketed** | Shopify, Lightspeed and Toast connectors; promoting the native customer app | Keep the code; links and passes come first |

**New engineering requests** (finance doesn't edit code):

1. Fee by category: `PLATFORM_PAYMENT_FEE_BPS` per transaction type (pickup 150, service 100).
2. An optional per-order customer service fee, shown at checkout.
3. Evaluate direct charges with application fees ("Stripe handles pricing").
4. Fraud controls: velocity limits on pickup orders, a dispute workflow for deposits.
5. "Order" and "Approve" deep links for Google Business Profile and Instagram.
6. A pay-over-time partner hook on quotes over $500.

### 5.2 Pricing recommendation

| Item | Price | Rationale |
| --- | --- | --- |
| Loyalty | $0, no fee, forever | The reason the whole street says yes |
| **Pickup / online orders** (all verticals) | **1.5% platform fee + $0.49 customer service fee per order**, plus card processing at Stripe cost (2.9% + C$0.30, W) | Merchant all-in 6.4% on a $15 order against DoorDash pickup 8–10% (W): a claim that's true. Earns the same as a 3.5% flat fee (S2: $23.0k against $23.3k at m24). Merchants can absorb the $0.49 if they want |
| **Service deposits and invoices** | **1.0% platform fee**, no customer fee, plus processing | All-in 4.0% on a $300 invoice against Square Invoices at about 3.0% (W): +1 point for the approval workflow, loyalty and the street. The largest fee base (§2.4) |
| Plus "Grow" | $39/mo ($390/yr) | $29 loses money per payer (M, launch-plan-economics) |
| Pro "Run" | $99/mo ($990/yr); founding $79 for life, first 50 | $99 wins under every price response tested (M) |
| BIA campaigns | $1,500 / $2,250 / $3,000 | Unchanged |
| **Don't** | A 5–8% fee on small tickets | Above DoorDash's pickup rate once processing is added (§2.3) |

### 5.3 Go-to-market by month

| Month | Calendar | Do |
| --- | --- | --- |
| 1 | Nov 2026 | Pricing changes above. TABIA and 3 BIA meetings. **10 refundable $100 Pro deposits** from service shops. Strip 1 in person with the BIA intro. Apply to Square's app marketplace (verify the Canadian process) |
| 2 | Dec | Pro billing on (founding price). Quote-to-pay live at 10 shops. Strip 1 at 80% coverage. Holiday: no café pitching during rushes |
| 3 | Jan 2027 | Strips 2–3. Order and Approve links on every shop's Google and Instagram |
| 4 | Feb | Ordering fee live on all strips. Plus GA. Sell the spring BIA campaign |
| 5–6 | Mar–Apr | First BIA campaign. Financing pilot on quotes. Measure multi-shop customers and orders new to the shop |
| 7–9 | May–Jul | 3 areas a month. Citywide phone and AI outreach to service shops |
| 10–12 | Aug–Oct | Gate: **$10k a month in revenue** (model: month 10) and 3 strips passing. Then plan Ottawa and Hamilton; line up hires for month 13 (engineer, launcher) |

---

## 6. The path to profit

### 6.1 Milestones

**Path: quote-to-pay rail with an Ontario rollout** (`strategy2_profit_path.csv`, `strategy2_monthly_ontario_scale_rail_team.csv`, S2).

Assumptions (A):

- **Pace:** 5 areas a month in months 1–3, 3 a month to month 12, 6 a month to month 24, then 8; up to 420 areas (Toronto plus Ontario BIA towns).
- **Team** (on top of the model's costs):

  | From month | Hire | Cost/mo |
  | --- | --- | --- |
  | 13 | Engineer | $9,000 |
  | 13 | Launcher | $5,500 |
  | 25 | Second launcher | $5,500 |
  | 25 | Second engineer | $9,000 |
  | 37 | Sales lead | $11,000 |

- **Founder:** $5k a month from month 13.

"Monthly revenue" here = subscriptions + platform fees + BIA. It is labelled as revenue, not subscription MRR.

| Milestone | Month | Areas / shops / active / paying | Shops on ordering · GMV/mo | Revenue split | What has to be true |
| --- | --- | --- | --- | --- | --- |
| **$10k a month** | **m10** (Aug 2027) | 36 / 606 / 301 / 38 | 78 · $507k | subs $2.6k · fees $5.9k · BIA $1.7k | ≥ 30 service shops running invoices through us at ~$15k/mo each; 1 BIA campaign a season |
| **$50k a month** | **m24** (Oct 2028) | 114 / 1,730 / 886 / 176 | 295 · $2.47M | subs $12.1k · fees $28.8k · BIA $7.3k | Ontario playbook works outside Toronto; 2 launchers each adding 3 areas a month; losses ≤ 15 bps |
| **$100k a month** | **m37** (Nov 2029) | 218 / 2,997 / 1,562 / 383 | 520 · $4.35M | subs $26.1k · fees $50.7k · BIA $15.9k | About 500 service shops on the rail; BIA buying at ~0.5 campaigns per area per year across Ontario. **This BIA rate is the weakest assumption** |
| Cash | Low −$45,145 (m19) after the month-13 hires; sustained break-even m27 | | | | About $60k arranged before month 13, or delay the hires |

**Subscription MRR alone reaches only $26k at month 37 and $51k at month 60** (S2). **$100k of pure subscription MRR is not reachable within 5 years.** The payments rail is what makes $100k a month possible. Say that plainly to any investor.

**Comparison paths** (S2):

| Path | $10k | $50k | $100k | Cash low |
| --- | --- | --- | --- | --- |
| Community network at 3.5%, same Ontario rollout and team | m13 | m32 | m53 | **−$186k** |
| Toronto only, network pricing | m13 | never | never | |
| Toronto only, rail | m10 | m35 | never | |

Revenue peaks at about $34–36k a month on Toronto-only network pricing; the model stops signing new shops once areas run out, so the decline after month 40 is overstated.

**So the founder's community network without the service rail needs four times the cash and an extra 16 months to reach $100k.**

### 6.2 Kill and pivot criteria

| By | Number | If missed |
| --- | --- | --- |
| **Day 60** | ≥ 10 service shops paying Pro (or deposits), and ≥ 5 putting deposits or invoices through us | The rail thesis fails. Fall back to the first audit's S12 at best ($19k/mo at m24), or stop |
| **Day 120** | Service shops on the rail average ≥ $5k a month of GMV each (model: $15.6k) | Below $5k: the "massive" path is off. Run as a small, profitable Toronto business |
| **Day 120** | Café pickup ≥ 10 orders a week per adopting shop on strip 1 (model: 20) | Stop marketing pickup; keep it as a feature for anchors |
| **Day 180** | ≥ 15% of pickup orders come from customers new to that shop; ≥ 20% of customers active at 2+ shops | No network effect. Stop calling it a network; drop the ads, performance-fee and app roadmap |
| **Day 180** | Monthly revenue ≥ $2k (model: $1.8k at m6), losses plus disputes ≤ 20 bps of GMV | Fix risk before scaling volume |
| **Month 12** | Monthly revenue ≥ $10k with 3 strips passing their gates | No hires, no Ontario. Stay a Toronto business |
| **Month 24** | Monthly revenue ≥ $40k on the Ontario path | Don't raise to go national; optimise for profit |

---

## Appendix

### Method and files

`docs/finance/model/strategy_audit_2.py` imports `model.py` read-only and writes only `output/strategy2_*.csv`. It re-points `model.remote_launches` *inside the script at runtime* to support a pace schedule; it falls back to the original when no schedule is set. `model.py` and all existing outputs are byte-identical.

| File | Contents |
| --- | --- |
| `strategy2_comparison.csv` | Every case in §2.4 (+ founder-draw columns) |
| `strategy2_ordering_unit_economics.csv` | Per-vertical GMV and merchant all-in cost (§2.3) |
| `strategy2_take_by_vertical_m24.csv` | Fee revenue by vertical at month 24 |
| `strategy2_profit_path.csv` | Milestone months for each path (§6.1) |
| `strategy2_monthly_<path>.csv` | 60-month detail for each path |

### Limits

- Pickup volumes, adoption and price sensitivity are guesses until strip 1 reports.
- The Ontario path assumes Toronto-sized areas (35 storefronts); smaller towns' BIAs are smaller.
- BIA revenue is booked smoothly; in practice it arrives in lumps.
- Once all areas are open, no new shops sign (an artefact that understates late years).
- Team costs are a sketch.
- Customer-fee volume loss (10%) is an assumption.

### Sources

All fetched or searched Oct 22, 2026.

- [DoorDash Canada pricing](https://merchants.doordash.com/en-ca/pricing) · [DoorDash CA partnership plans blog](https://merchants.doordash.com/en-ca/blog/new-partnership-plans-ca)
- [Uber Eats Canada pricing, Canadian Press via Burnaby Now (Feb 2022)](https://www.burnabynow.com/national-business/uber-eats-launches-new-services-changes-price-structure-for-deliveries-5061015) · [Uber Eats fees, vendor blog 2025](https://www.getsauce.com/post/uber-eats-fees-for-restaurants) · [Toronto restaurants boycotting Uber Eats, Vice](https://www.vice.com/en/article/toronto-restaurants-are-boycotting-uber-eats-saying-it-costs-too-much/)
- [Ritual ONE, Streets of Toronto (2020)](https://streetsoftoronto.com/food/ritual-one-service-toronto-restaurants/) · [City of Toronto + Ritual partnership](https://www.toronto.ca/news/city-of-toronto-partnership-with-ritual-open-for-business-supports-more-than-1000-local-businesses-with-free-delivery-until-november-8/)
- [Square Canada fees](https://www.square.com/ca/en/payments/our-fees) · [Square CA lower fees press release (Oct 2024)](https://squareup.com/ca/en/press/lower-processing-fees-canada)
- [Toast $0.99 guest fee, Restaurant Dive (2023)](https://www.restaurantdive.com/news/toast-adds-99-cent-customer-online-ordering-fee/653707/) · [Toast online ordering pricing, vendor blog](https://www.getsauce.com/post/toast-online-ordering-pricing-fees) · [Toast Q4/FY2025 results](https://www.businesswire.com/news/home/20260212058106/en/Toast-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results)
- [Shopify pricing Canada (2024 guide)](https://ecommerce-platforms.com/articles/shopify-pricing-canada)
- [Stripe Canada pricing](https://stripe.com/en-ca/pricing) · [Stripe Connect pricing (CA)](https://stripe.com/en-ca/connect/pricing)
- [ISED Canadian Industry Statistics: retail (44-45)](https://ised-isde.canada.ca/app/ixb/cis/businesses-entreprises/44-45) · [food services (722)](https://ised-isde.canada.ca/app/ixb/cis/businesses-entreprises/722)
- [SBA Advocacy: 36.2M small businesses (2025)](https://advocacy.sba.gov/?p=30239)
- [OBIAA 300+ Ontario BIAs, Retail Insider (2020)](https://retail-insider.com/retail-insider/2020/09/bias-50-year-anniversary-in-toronto-canada/) · [City of Toronto BIA count (2023 report)](https://www.toronto.ca/legdocs/mmis/2023/au/bgrd/backgroundfile-237677.pdf) · [US BIDs (2011 census)](https://en.wikipedia.org/wiki/Business_improvement_districts_in_the_United_States)
- [Block Q3 2025, Zacks (secondary)](https://www.zacks.com/stock/news/2788033/block-s-q3-earnings-revenues-miss-estimates-2025-guidance-raised)
