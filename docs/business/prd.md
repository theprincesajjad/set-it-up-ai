# Local Loyalty Toronto — Business Plan, PRD & Launch

Oct 21, 2026 · @Sajjad Pirani

## Executive summary

Build a free, done-for-you loyalty network for Toronto independents, win one neighbourhood at a time, then monetize with a paid operations add-on (order-ahead, repair approvals, invoicing, pickup status, payments).

- **The wedge:** a shared customer app (iOS + Android) where shoppers earn points, see promos, and carry digital versions of the discount cards pharmacies and shops already hand out. Merchants pay nothing and we set everything up for them.
- **The money:** once a neighbourhood has density, sell an add-on subscription plus a small cut of payments processed in-app. Repair shops, auto shops and restaurants feel the most pain and pay first.
- **The moat:** density, not software. Loyalty apps are easy to build; a block where 30 shops share one app is hard to copy.
- **The bootstrap thesis:** onboarding is a phone call, an email and a 20-minute visit. Low-cost reps plus a self-serve setup wizard keep acquisition cost under roughly $150 per merchant.
- **The biggest risk:** customers won't download one more app unless enough of *their* shops are on it. The plan below solves that with a no-download web pass and hyper-local launches, not citywide spread.

Working name in this doc: *Local Loyalty*. Rename freely.

## Market analysis

Toronto has the density this needs: roughly 30,000+ businesses sit inside 85+ walkable BIA strips, and Canadians already live in loyalty programs but are tired of juggling them.

| Signal | Figure | Why it matters |
| --- | --- | --- |
| Business establishments, City of Toronto | 74,560 in 2025 ([City of Toronto](https://www.toronto.ca/wp-content/uploads/2025/11/97af-CityPlanning-Toronto-Employment-Survey-Two-Pager-Summary-2025.pdf)) | Total universe; retail is \~9% and service \~11% of jobs |
| Business Improvement Areas | 85+ BIAs, 30,000+ businesses ([City of Toronto](https://www.toronto.ca/business-economy/business-operation-growth/business-improvement-areas/start-or-expand-a-bia/)) | Ready-made neighbourhood clusters with a board to pitch |
| Loyalty programs per Canadian | 15 on average, many unused ([Bond / Scene+, May 2026](https://www.bnnbloomberg.ca/press-releases/2026/05/19/canadians-are-rethinking-loyalty-as-everyday-rewards-take-priority/)) | Fatigue is real; "one app for the whole street" is the pitch |
| Preference for small, frequent rewards | 60% ([The Wise Marketer](https://thewisemarketer.com/2026-bond-loyalty-report-shows-canadians-are-sitting-on-13-15-billion-in-unredeemed-loyalty-points/)) | Fits local shops: a free coffee beats a flight |
| Programs held vs. used regularly | 22 held, 9 used ([LoyalT 2025](https://dmn.ca/announcing-the-2025-edition-of-loyalt-the-most-comprehensive-study-of-canadian-retail-loyalty-program-performance/)) | Restaurants were the only category above average on all three indexes |
| Shift to Canadian programs | 42% use Canadian programs more ([LoyalT 2025](https://dmn.ca/announcing-the-2025-edition-of-loyalt-the-most-comprehensive-study-of-canadian-retail-loyalty-program-performance/)) | "Buy local" sentiment is a tailwind |

**Coalitions are consolidating at the top.** Shell left Air Miles for Scene+ in 2026, Scene+ has 15M+ members, and Triangle is linking with RBC Avion ([Shell](https://www.shell.ca/en_ca/media/news-and-media-releases/news-releases-2026/shell-canada-joins-scene-plus-loyalty-program.html), [strategy](https://strategyonline.ca/2025/04/02/ctc-rbc-triangle-avion)). Independents are locked out of these networks. That is the gap.

**Sizing (our estimates, not sourced):**

- **Addressable in Toronto:** \~30,000 BIA-area businesses; assume 40% are repeat-visit retail, food, personal service, repair or auto → \~12,000 targets.
- **Realistic 3-year capture:** 5% → \~600 merchants on the free tier, \~25% converting to paid → \~150 paying.
- **GTA expansion** (Mississauga, Brampton, Markham, Vaughan) roughly doubles the target pool.

## Competitive landscape

The closest competitor is already in Toronto: SoPoints runs a free, multi-merchant loyalty card for GTA independents, with a field-agent program. You can't win on "free shared loyalty" alone; you win on done-for-you setup, neighbourhood density and the operations add-on.

| Player | Model | Price to merchant | Threat | Our angle |
| --- | --- | --- | --- | --- |
| [SoPoints](https://sopoints.com/about) (Toronto) | One card across local shops, each shop keeps its own points; field agents | Free plan with 5% transaction fee; paid US$49–199/mo ([pricing](https://sopoints.com/pricing)) | **High**: same thesis, same city | Fully done-for-you; repair/auto workflows they don't have; street-by-street density |
| [Square Loyalty](https://square.com/ca/en/software/loyalty) | Single-merchant, POS-native | From $60/mo per location (CAD) | Medium: owns the counter for Square shops | Integrate with Square rather than fight it; shared network Square doesn't offer |
| Wallet stamp cards (Loopy, CHCKN, BonusQR) | Apple/Google Wallet card, no app | Free to \~$50/mo ([CHCKN](<https://chckn.app/magazine/best-digital-loyalty-programs-for-small-businesses-(2026-guide)>)) | Medium: no-download is customer-friendly | Copy the no-download entry point; add the network on top |
| TapMango, Kangaroo Rewards | Branded single-merchant apps | \~$59–299/mo or custom quote | Low–medium | Cheaper, shared, no merchant app to promote |
| [Ritual](https://appshunter.io/ios/app/938467045) (Toronto) | Order-ahead for restaurants | Commission per order | Low: reviews say fewer restaurants use it now | Order-ahead as an add-on, not a marketplace tax |
| Scene+, PC Optimum, Triangle | National coalitions | Not open to independents | Indirect: they set customer expectations | "Your street's Scene+" |
| Vertical tools (repair, auto shop software) | Ticketing, invoices, approvals | Typically paid monthly SaaS | Medium for the add-on | Bundle approvals + payments + loyalty in one customer app |

**Lessons from failures.** Toronto's Drop raised venture money for a coalition rewards app and later drew complaints and a class action over hard-to-redeem points ([Wikipedia](<https://en.wikipedia.org/wiki/Drop_(loyalty_program)>)). Points must always be redeemable at the shop that issued them, with no expiry games.

**Do this first:** download SoPoints, sign up as a test merchant, and visit three of their Toronto shops. Their weak spots become your sales script.

## Business model and pricing

Loyalty stays free forever; money comes from three later streams: an operations subscription, a small payments margin, and paid neighbourhood campaigns. Prices below are proposals to test, in CAD.

> **Superseded by Pricing v2 (Oct 22, 2026): see [pricing.md](pricing.md).** Only the loyalty program and its reports are free. Promos, discount cards, VIP/birthday/referrals, email/SMS, CSV and integrations moved to Plus. The table below is updated to match.

| Tier | Price | Who it's for | What's included |
| --- | --- | --- | --- |
| **Free** | $0, no transaction fee | Every merchant | Points, stamps and rewards, welcome bonus, network listing, wallet pass, customer directory, basic reports, phone + web dashboard, done-for-you setup, QR counter stand |
| **Plus** | $39/mo | Cafés, restaurants, bakeries, retail | Promos and bonus-point days, VIP/birthday/referrals, discount cards, email + SMS + automations, CSV, POS auto-award, webhooks/API, advanced reports, order-ahead and pickup, push promos to nearby network members, 500 SMS/mo |
| **Pro** | $79/mo | Repair, auto, alterations, print shops | Everything in Plus + service tickets, quote approval, deposits, invoices, pickup/drop-off scheduling, multi-staff |
| **Payments** | Stripe cost (2.9% + C$0.30 online) + 0.75% platform fee | Plus and Pro | In-app checkout, deposits, invoice pay |
| **Neighbourhood campaigns** | $1,500–3,000 per campaign | BIAs | A street-wide "shop local" points event run through the app |

Stripe's Canadian headline rate for domestic cards online is 2.9% + C$0.30 ([Xero/Stripe](https://www.xero.com/pricing-plans/pricing-and-fees-for-stripe/)). Undercut SoPoints by charging **no** transaction fee on the free tier; that is your cleanest differentiator.

**Why BIAs pay:** each BIA already spends on marketing and festivals. A measurable "points weekend" with redemption data is an easier sell to a BIA board than to 40 individual owners.

## Unit economics

At these assumptions a paying merchant is worth about $2,400 over its life and costs about $410 to win, a 5.8× LTV/CAC with roughly 6-month payback. Every number is an assumption to replace with pilot data.

**Per merchant (CAD, monthly unless noted)**

| Line | Free merchant | Paying merchant | Basis |
| --- | --- | --- | --- |
| Subscription revenue | $0 | $55 | Blend of 60% Plus ($39) and 40% Pro ($79) |
| Payments margin | $0 | $30 | $4,000/mo processed × 0.75% |
| Infra + SMS + support | $4 | $13 | Hosting share, Twilio, \~10 min support |
| **Contribution** | **–$4** | **$72** |  |
| One-time acquisition | $90 | +$50 upsell | $50 rep commission + $25 30-day bonus + $15 kit |
| Free → paid conversion |  | 25% within 12 months | Assumption; Pro-type verticals likely higher |
| Effective CAC per paying merchant |  | **$410** | $90 ÷ 25% + $50 |
| Monthly churn |  | 3% | \~33-month average life |
| **Lifetime value** |  | **\~$2,380** | $72 × 33 |

**What the free tier costs you:** 600 free merchants × $4 = $2,400/mo. That burden is why conversion rate, not merchant count, is the number to watch.

**Fixed costs, bootstrapped:** \~$1,500/mo before any salaries (hosting, app store accounts, insurance, tools, accounting). Break-even on fixed costs alone needs about 21 paying merchants; add a part-time contract developer at \~$4,000/mo and it moves to about 76.

**Sensitivity:** the model breaks if conversion falls under \~10% or churn rises above \~6%. Both push LTV/CAC below 2×.

## Feasibility and risks

The product is buildable by one or two people in about four months; the hard parts are customer adoption, a direct Toronto competitor, and two legal traps in your current plan (commission-only student reps and pharmacy points).

**Technical: feasible.** Loyalty ledger, QR/phone-number check-in, promos and a merchant dashboard are standard. Use React Native or Flutter for one codebase, Stripe Connect for payments, and Apple/Google Wallet passes so customers can join without downloading anything. The Pro add-on (tickets, approvals, invoices) is a CRUD app plus notifications.

**Legal: two changes needed.**

- **Student reps can't be commission-only interns.** Ontario's ESA treats most interns as employees owed minimum wage; unpaid placements are legal only inside approved school programs ([McMillan](https://mcmillan.ca/insights/internal-affairs-managing-unpaid-internships-in-ontario/)). Minimum wage is $17.95/hr from Oct 1, 2026 ([Hicks Morley](https://hicksmorley.com/2026/04/01/ontario-minimum-wage-to-increase-october-1-2026/)). Options: pay hourly plus a per-activation bonus; partner with college/university co-op programs for credit placements; or engage genuinely independent contractors (get a lawyer to check the agreement). At \~3 activations per 6-hour shift, wages work out to \~$36 per merchant, inside the $90 CAC budget.
- **Pharmacies can't give points on prescriptions.** Ontario bars loyalty points, bonuses or inducements on prescriptions and pharmacy services ([OCP policy](https://ocpinfo.com/pharmacy-professionals/rules-and-standards-of-the-profession/practice-policies-guidelines/loyalty-points-program/), [O. Reg. 264/16 s. 34](https://www.ontario.ca/laws/regulation/160264) and [O. Reg. 130/17 s. 6](https://www.ontario.ca/laws/regulation/170130); O. Reg. 681/93, cited in earlier drafts, was revoked on May 5, 2017). Points on front-store items are fine; build a "no-earn" product category from day one.
- **Also:** CASL requires opt-in consent before promotional messages; PIPEDA governs customer data; points need clear terms (no surprise expiry) to avoid a Drop-style dispute.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Customers won't download another app | High | High | Wallet-pass and SMS sign-up at the counter; app optional until order-ahead |
| SoPoints locks up neighbourhoods first | Medium | High | Pick strips where they are thin; offer free migration and done-for-you setup |
| Merchants sign up but never use it | High | Medium | Counter stand + staff script; 30-day activation bonus tied to 25 active members |
| Free tier never converts | Medium | High | Lead with verticals that need Pro (repair, auto); test pricing in pilot |
| POS double-entry annoys staff | Medium | Medium | Square/Clover integrations by month 6; phone-number entry under 5 seconds |
| Founder time is the bottleneck | High | Medium | Self-serve setup wizard; templates per business type |

## PRD

MVP goal: a merchant earns their first 25 active members within 30 days of a 20-minute setup, and a customer joins at the counter in under 30 seconds without downloading an app.

### Users

- **Merchant owner:** runs a café, repair shop or salon; checks things on their phone between customers; zero patience for setup.
- **Counter staff:** needs to award points in under 5 seconds during a rush.
- **Customer:** lives or works nearby; wants small, frequent rewards and one place for every local shop.
- **BIA manager:** wants proof that street events drive visits.
- **Internal onboarding rep:** sets up merchants on-site or by phone.

### MVP (Phase 1, free tier) — target launch in 4 months

| Area | Requirement | Priority |
| --- | --- | --- |
| Customer join | Join by phone number or QR scan; Apple/Google Wallet pass; app optional | P0 |
| Earn and redeem | Points per dollar, per visit or stamp-style; merchant-specific balances; redeem at counter | P0 |
| Digital discount card | Show-to-save cards (e.g. 10% off front-store), with an excluded category for prescriptions | P0 |
| Promos | Merchant posts offers with start/end dates; network feed sorted by distance | P0 |
| Merchant app | Award points by phone number or scan; view today's visits; post promo | P0 |
| Web dashboard | Members, visits, redemptions, top customers, promo results; CSV export | P0 |
| Rep console | Create merchant, set rules from templates, print QR kit, track activation | P0 |
| Consent | CASL-compliant opt-in per merchant; customer can mute any shop | P0 |
| Customer app | Map/list of shops, balances, promos, wallet | P1 |
| Network perks | Welcome bonus when a customer visits a 3rd shop on the strip | P1 |
| Referrals | Customer invites friend; both get points at the shop where it happened | P2 |

### Phase 2 (paid add-on) — months 7–12

| Area | Requirement | Tier |
| --- | --- | --- |
| Order-ahead | Menu/catalog, pickup time, pay in app, "ready" push/SMS | Plus |
| Service tickets | Intake, device/vehicle details, photos, status timeline | Pro |
| Quote approval | Merchant sends quote; customer approves or declines in app; e-signature log | Pro |
| Deposits and invoices | Collect deposit on approval; final invoice; pay in app | Pro |
| Pickup and drop-off | Scheduling slots; reminders; "ready for pickup" status | Plus/Pro |
| POS integrations | Auto-award points from Square and Clover transactions | Plus/Pro |

**Repair approval flow (Pro):** 1. Customer drops off device, staff creates ticket. 2. Tech adds diagnosis and quote. 3. Customer gets a push/SMS and approves. 4. Deposit is charged. 5. Status updates as work progresses. 6. "Ready" alert. 7. Customer pays balance and earns points.

### Non-functional

- Award points in ≤ 5 seconds; app works on 3-year-old phones; offline queue for spotty Wi-Fi.
- Canadian data residency where practical; role-based access; merchants see only their own customers.
- Double-entry points ledger so balances are auditable.

### Success metrics

| Metric | Target by month 6 |
| --- | --- |
| Merchants activated (≥25 active members) | 60% of signed |
| Active members per merchant | 75 |
| Customers holding 2+ shops | 30% |
| Monthly redemption rate | 20% of active members |
| Merchant NPS | 40+ |

## Go-to-market and launch plan

Launch on one BIA strip, not across Toronto: 30–40 shops within a 10-minute walk, so a customer who joins at the café sees the bakery and the repair shop on day one.

**Picking the first strip.** Score candidate BIAs on: density of independents (aim for 80+ storefronts), mix of daily-visit shops (cafés, bakeries) and high-ticket service shops (repair, auto, alterations), a BIA manager who returns calls, and thin SoPoints coverage. Good candidates to scout: Roncesvalles, the Danforth, Leslieville, Junction, Bloor West Village. Visit before deciding.

**Onboarding playbook (per merchant)**

1. Warm intro via the BIA newsletter or manager.
2. Call or email: one-minute pitch — "free, we set it up, your regulars already walk this street."
3. 20-minute visit by a rep: set earn rules from a template, print the counter stand, train one staff member.
4. Seed members: staff ask every customer for a phone number for one week; launch-week double points.
5. Day 7 and day 30 check-ins by phone; rep earns the activation bonus at 25 active members.

**Customer acquisition (near-zero cost)**

- The counter is the channel: every participating shop signs up its own regulars.
- "Passport" week with the BIA: visit 5 shops, win a prize basket donated by merchants.
- Local press, neighbourhood Instagram and Reddit, and the BIA's own channels.

**Team, bootstrapped**

- You: sales, BIA relationships, product.
- One technical co-founder or contract developer (equity or part-time).
- 2–4 paid student reps per strip, hourly + activation bonus, or co-op placements.

**Phased roadmap**

&#91;embedded content: launch roadmap · 4 phases, 3 gates\]

Each gate is a go/no-go: if the pilot strip misses its activation numbers, fix onboarding before adding strips.

## Next 30 days and open questions

Spend the first month validating, not building: 20 merchant conversations and 3 BIA meetings will tell you more than any prototype.

- [ ] Test SoPoints as a merchant and as a customer; visit 3 of their shops
- [ ] Shortlist 3 BIAs; walk each strip and count storefronts by type
- [ ] Call 3 BIA managers; ask what they spend on events and what they'd pay for visit data
- [ ] Interview 20 owners (10 cafés/retail, 10 repair/auto): "what do you use for regulars today, and what would you pay to stop chasing repair approvals by phone?"
- [ ] Ask 5 repair or auto shops for a $100 refundable pilot deposit on the Pro add-on — real money is the only real signal
- [ ] Clickable prototype (Figma) of counter check-in and the repair approval screen
- [ ] Incorporate federally or in Ontario; one-hour call with an employment lawyer on rep pay
- [ ] Pick a name and check the trademark and domain

**Open questions**

- Do you have a technical co-founder, or will you contract the build?
- Are you starting with food/retail (faster adoption) or repair/auto (faster revenue)?
- How much of your own cash and time can you commit for 12 months?

## Sources

Opened for this plan: [Toronto Employment Survey 2025](https://www.toronto.ca/wp-content/uploads/2025/11/97af-CityPlanning-Toronto-Employment-Survey-Two-Pager-Summary-2025.pdf) · [City of Toronto BIAs](https://www.toronto.ca/business-economy/business-operation-growth/business-improvement-areas/start-or-expand-a-bia/) · [Bond / Scene+ 2026](https://www.bnnbloomberg.ca/press-releases/2026/05/19/canadians-are-rethinking-loyalty-as-everyday-rewards-take-priority/) · [LoyalT 2025](https://dmn.ca/announcing-the-2025-edition-of-loyalt-the-most-comprehensive-study-of-canadian-retail-loyalty-program-performance/) · [Shell joins Scene+](https://www.shell.ca/en_ca/media/news-and-media-releases/news-releases-2026/shell-canada-joins-scene-plus-loyalty-program.html) · [SoPoints about](https://sopoints.com/about) · [SoPoints pricing](https://sopoints.com/pricing) · [Square Loyalty Canada](https://square.com/ca/en/software/loyalty) · [Stripe fees via Xero](https://www.xero.com/pricing-plans/pricing-and-fees-for-stripe/) · [Ontario unpaid internships](https://mcmillan.ca/insights/internal-affairs-managing-unpaid-internships-in-ontario/) · [Ontario minimum wage 2026](https://hicksmorley.com/2026/04/01/ontario-minimum-wage-to-increase-october-1-2026/) · [OCP loyalty points policy](https://ocpinfo.com/pharmacy-professionals/rules-and-standards-of-the-profession/practice-policies-guidelines/loyalty-points-program/). Market sizing, pricing and unit economics are our estimates.
