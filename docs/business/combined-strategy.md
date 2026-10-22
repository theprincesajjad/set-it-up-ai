# Combined strategy: Local Loyalty + the Desi restaurant SaaS

Oct 22, 2026 · Strategy review for @Sajjad Pirani · CAD unless marked US$ · Model month 1 = Nov 2026

**What this builds on:**

- [strategy-audit.md](strategy-audit.md): free loyalty is the way in; nobody pays for the network yet.
- [strategy-audit-2.md](strategy-audit-2.md): the platform fee on orders, and the quote-to-pay rail for service shops as the primary thesis.

This document folds in the founder's second idea, a vertical SaaS for South Asian (Desi) restaurants. His working name is "Desi Chowbus"; his brief is dated Sept 29–30, 2026. Treat the brief's figures as his claims, except where they are verified below.

**Tags.** Every number carries one:

| Tag | Meaning |
| --- | --- |
| (W) | Verified on the web on Oct 22, 2026; source at the end |
| (W?) | Found, but secondary, self-reported or conflicting |
| (U) | Not verified |
| (F) | The founder's brief, unchecked |
| (C) | Output of `docs/finance/model/combined_strategy.py` → `output/combined_*.csv` |
| (A) | Assumption |
| (H) | Hand math |

`model.py`, `strategy_audit_2.py` and all existing outputs are unchanged; checksums match before and after.

---

## 0. Verdict

**Combine the two ideas, on one codebase, under one customer-facing network, sold as a free core plus paid vertical packs. Make the Desi Restaurant pack the first paid wedge, but only after a 30-day validation gate.**

**Why it beats either idea alone:**

- Restaurants pay from day one at about $180 a month list price, against $39–99 for a shop on Local Loyalty. Revenue per restaurant is about $281 a month once add-ons and fees are counted (C).
- The corridors are exactly the "strips" the network needs.
- About half the Desi modules already exist in this codebase as ordering, slots, quotes and deposits, campaigns, loyalty and messaging (§1).

| Plan | Revenue/mo m12 / m24 / m36 | Cash low · break-even | With $4k/mo founder draw | $1M annual revenue run-rate |
| --- | --- | --- | --- | --- |
| **Combined (C)** | **$19.4k / $56.7k / $92.8k** | −$42.8k · m7 | −$71.1k · m10 | **m33** |
| Audit-2 quote-to-pay rail, Toronto (C) | $17.1k / $36.8k / $52.3k | −$14.7k · m7 | −$46.9k · m10 | Never within 60 months |
| Desi-only, realistic (C) | $13.0k / $32.0k / $50.9k | −$40.1k · m6 | −$68.1k · m10 | Never within 60 months ($877k at m60) |

**The founder's $1M path doesn't hold on GTA restaurants alone at 3% monthly churn.** Ten new restaurants a month plateaus at about 333 paying (H). Holding 400 needs 12 new a month just to replace churn (H). And 400 is 27–67% of the founder's unverified 600–1,500 GTA estimate.

**The biggest risks:**

1. **Two wedges at once with one founder.**
2. **Restaurants are the hardest SMB segment.** Owner.com sells in Canada at $349 + 5% or $699 flat (W), and Toast and Chowbus are here.
3. **Zero owner interviews so far.**

**One-sentence scope:** *We are the operating and payments platform for a neighbourhood's independent businesses, starting with South Asian restaurants, that runs their tiffin, catering, ordering and loyalty commission-free, and joins every shop on the corridor into one customer network.*

---

## 1. Where the two ideas meet

### 1.1 Shared customers

The Desi corridors are strips:

- **Ridgeway Plaza** (Mississauga): a dense Pakistani food hub, a private plaza (F).
- **Gerrard India Bazaar** (Toronto): a BIA strip (verify the BIA's current status).
- **Queen St E** (Brampton): plazas.

Each mixes restaurants and sweet shops with grocers, salons, tailors, jewellers, travel agents and phone repair. **The restaurants pay; their neighbours join the free core and become the network.** The service shops among them (tailors, phone repair, auto) are buyers for the audit-2 service pack, which is already built.

### 1.2 Module map

I read `packages/shared/src/plans.ts`, `docs/engineering/api/*.md`, `packages/db/src/schema.ts` and `apps/api/src/providers/payments*.ts`. Size: S ≈ 1–2 weeks, M ≈ 3–6 weeks, L ≈ 2–3+ months for one developer working with AI tooling (A).

| Desi module | What exists in this code | How close | What's new | Size | Plan or pack |
| --- | --- | --- | --- | --- | --- |
| **Tiffin subscription engine** (the wedge) | Catalog (`catalog_items`), orders, pickup slots, Stripe Connect accounts. Merchant subscriptions exist only for *our* billing (`subscriptions`, Checkout) | 25% | Customer plans (weekly/monthly), skip a week, pause, family plans, per-route driver sheets, recurring billing **on the restaurant's Stripe account** (Billing on the connected account), **pre-authorized debit** alongside cards | **L** | Restaurant Growth |
| **Halal / zabihah badge + filter** | `catalog_items` has no attribute field | 10% | `attributes` (halal, zabihah, veg, Jain, spice level) on items; filters on the public menu and network feed | **S** | Free core (trust helps the whole network) |
| **Festival calendar marketing** (Ramadan, Eid, Diwali, Vaisakhi, Navratri) | Messaging campaigns with segments and CASL enforcement (`messaging.md`); promos with recurring windows; BIA campaigns (`campaigns`) | 60% | Yearly calendar of festival dates; one-tap templates in 4 languages; WhatsApp as a channel (below) | **S** | Restaurant Growth; corridor festival campaigns for BIAs |
| **Biryani pot / degh pre-orders by slot** | `booking_slots` (pickup, with capacity), `orders.pickupAt` and slot ID (`booking.pickup_slots`) | 70% | Per-item capacity (deghs per slot), order cut-off times, deposit on pre-orders | **S–M** | Restaurant Growth |
| **Multilingual** (Hindi, Urdu with right-to-left script, Punjabi, English) | No localization framework in web or mobile | 0% | Translation framework; translated menus (item translations); kitchen tickets and staff UI. Right-to-left Urdu layout | **L** (menus + kitchen tickets first: **M**) | Menus: Restaurant Starter. Staff UI: Restaurant Pro |
| **Catering & events** (quotes, deposits, per-head pricing, tastings) | Service flow: tickets → quotes with line items → e-signed approval → deposit → invoice → pay link (`service.md`); appointment slots for tastings | 65% | "Event" ticket kind (today: device/vehicle/garment/other), per-head line items, menu packages, wedding-season calendar | **M** | Restaurant Growth (same engine as the service pack) |
| **Commission-free online ordering + branded site** | Orders, public menu, pickup status, in-app payments (`commerce.md`) | 60% | Branded mini-site with custom domain and theme; delivery handled outside us | **M** | Restaurant Starter |
| **WhatsApp ordering, notifications, marketing** | Twilio provider (SMS), messaging service, public pay pages for invoices (`/i/<token>`) | 20% | WhatsApp sender and approved templates; inbound conversation → cart → **payment link** → confirmation; consent per channel | **M–L** | Notifications: Starter. Marketing: Growth + paid packs |
| **Loyalty** ("every 10th chai free") | Full loyalty ledger, wallet passes, network | 95% | Nothing | — | Free core |
| **Google review management** | None | 0% | Business Profile connection, review requests after orders | **M** | Restaurant Starter (later) |
| **Banquet / party hall booking with deposits** | Appointment slots, deposits on quotes | 40% | Resource calendar (halls), multi-hour holds, contracts, staged deposits | **M** | Banquet add-on |
| **Phone-order AI** (Urdu/Hindi/Punjabi) | None | 0% | Telephony + speech + an AI model; accuracy risk in mixed-language speech | **L** | Pro / add-on, **year 2** |
| **Dual pricing / cash discount; cheap Interac routing** | No point-of-sale terminal | 0% | Needs a terminal and point-of-sale stack. Stripe lists Interac in person only (W) | **L** | **Out for 12 months** |
| **Split bills, tip pooling** | No dine-in point of sale | 0% | Point of sale | **L** | **Out** |
| **Kitchen display screen** | Orders API; the counter app (`CounterApp.tsx`) | 50% | Kitchen view, ticket printing, language per screen | **S–M** | Restaurant Pro |
| *Service pack* (quote-to-pay) | Built: `service.*` | 90% | Fee-by-category setting (audit 2) | **S** | Service pack |

**Summary:** of the six "Tier 1" Desi modules, three are mostly built (degh slots, festival campaigns, catering). Three are genuinely new and large: the **tiffin engine**, **WhatsApp** and **multilingual**. Point-of-sale features stay out.

---

## 2. The combined company

### 2.1 Thesis

**A horizontal free core** gives every shop on a corridor loyalty, reports, a wallet pass, the network listing and pickup ordering. **Paid vertical packs** run the workflow each kind of business actually pays for:

- restaurants: tiffin, catering, degh slots, festival marketing, WhatsApp, menus in four languages;
- service shops: quote-to-pay;
- cafés and retail: marketing and promos.

Payments for all of it run on the merchant's own Stripe account, with the merchant as merchant of record.

This is how vertical-SaaS winners expand: land with one painful workflow, then add verticals on the same rails. Chowbus reports more than US$120M in annual recurring revenue, with its delivery arm sold in January 2024 (W?, self-reported). The free core and the street network are what make it one company rather than two products.

### 2.2 Pricing

**Principles:**

1. **Loyalty is free forever.**
2. **Pack subscribers pay 0% merchant commission on orders.** This is the Desi pitch against DoorDash's 15–30% (F); DoorDash Canada is 20–29% for delivery and 8–10% for pickup (W). Non-subscribers pay 1.5% (audit 2).
3. **Online orders carry a $0.49 customer service fee** by default. The merchant can absorb it or switch it off. Toast does the same with a US$0.99 guest fee (W?).
4. **A 1% platform fee on deposits, invoices and recurring (tiffin) billing.** These workflows replace phone and e-transfer chasing. Disclose it up front.

| Plan / pack | Monthly (annual = 10×) | For | Fees on payments |
| --- | --- | --- | --- |
| **Free core** | $0 | Every shop on the corridor | Orders: 1.5% + $0.49 customer fee. Deposits and invoices: 1% |
| **Café & Retail pack** ("Grow") | $39 | Cafés, bakeries, grocers, florists | 0% merchant on orders (+ $0.49 customer) |
| **Service pack** ("Run") | $99 | Repair, auto, tailors, salons | 1% on deposits and invoices |
| **Restaurant Starter** | $99 | Commission-free ordering, branded site, WhatsApp notifications, halal badges, menus in 4 languages, review requests | 0% merchant on orders (+ $0.49 customer) |
| **Restaurant Growth** (core) | **$199** | + tiffin engine, catering and events, degh slots, festival marketing, WhatsApp marketing credits | + 1% on tiffin and catering payments |
| **Restaurant Pro** | $349 | + kitchen display, staff UI in four languages, multi-location reports, banquet module included; phone AI when ready | Same |
| **Add-ons** | WhatsApp marketing pack $49 per 1,000 messages; SMS overage $0.04; extra location $49; banquet $99; phone AI $79 (year 2) | | |
| **Founding offer, first corridor** | First 20 restaurants: free onboarding and photography ($150, F), **50% off for 12 months, then 25% off for life** | | |

**Why I changed the founder's offer** (lifetime 50% for the founding 20, F):

- Lifetime 50% costs about $1.8k a month forever (H: 20 × $90).
- It also anchors the corridor's word-of-mouth price at $99 for the Growth plan.
- A 12-month 50%, then a 25% lock, still recruits evangelists.

**Why 1% on tiffin, and the real catch:**

- Moving tiffin from Interac e-Transfer, which is free to the restaurant (A), to cards costs about **3.0% of a $250 plan**: 2.9% + $0.30 (W), or $7.55.
- **Pre-authorized debit** reportedly costs 1% + C$0.40, capped at C$5 (W?), or $2.90.
- With our 1% added, a $250 card payment costs the restaurant $10.05 and a debit payment $5.40, against $0 and hours of chasing today.
- **Lead tiffin with pre-authorized debit.**
- If interviews reject the 1%, drop it. The model loses only about $2–3k a month at month 36 (C: $92.8k → $89.6k).

**What the merchant pays all-in** on a $40 restaurant order with 0% commission: Stripe's 3.65% only, with the $0.49 paid by the customer. DoorDash is 8–29% (W).

### 2.3 Unit economics of the Desi pack

These are steady-state figures from `combined_desi_unit_economics.csv` (C, on assumptions):

| Line | Per paying restaurant/mo |
| --- | --- |
| Subscription (40% Starter / 45% Growth / 15% Pro, list prices) | $181.50 |
| Add-ons (WhatsApp 50% × $49, location, banquet, phone AI) | $42.25 |
| Customer fee (60% take online orders × 150 orders × 0.9 × $0.49) | $39.69 |
| 1% on tiffin + catering (60% Growth/Pro × (35% × $5,000 + 40% × $3,000)) | $17.70 |
| **Revenue** | **$281.14** |
| Variable costs: WhatsApp at ~C$0.035/message (F, U), support 30 min at $25/hr, infrastructure, our billing 3.6% | −$49.36 |
| **Contribution** | **$231.79 (82% margin)** |
| Cash cost to win a restaurant: photos $150 + kit $20 + rep commission $100 + rep base ÷ 5 signings | $770 |
| **Payback / LTV / LTV:CAC** (3% monthly churn, 33-month life) | 3.3 months / $7,726 / 10x |

Founder time isn't in the $770. Even loaded at $100 per signing, the pack's economics are far better than café loyalty's (audit 1: LTV/CAC 2.3x fully loaded).

---

## 3. Conflicts and what to do about each

| Conflict | Facts | Recommendation |
| --- | --- | --- |
| **Payment flow: who holds the money** | Our code uses **Express accounts with destination charges** (`transfer_data.destination`, `on_behalf_of`, `application_fee_amount`). Refunds reverse the transfer (`paymentsStripe.ts`). With destination charges, the *platform* bears Stripe fees, refunds and chargebacks. With **direct charges, the connected account bears them** (W, Stripe docs). The Desi brief wants the restaurant as merchant of record and no custody (F) | **Switch to direct charges with an application fee, with Stripe collecting its fees from the connected account. Use Standard accounts, or keep Express if Stripe confirms direct charges on it.** That makes the merchant the merchant of record, puts disputes and refunds on them, removes Connect platform fees under "Stripe handles pricing" (W, audit 2: about +11 points of payments margin), and keeps funds out of our balance. Size **M**: provider, refund logic, onboarding, webhooks for connected-account events. **Get the payments and RPAA legal opinion before building it.** A Dec 2024 law-firm note says an *agent* of a registered payment provider need not register, but third-party arrangements need care (W?). Registration under the RPAA has been required since Sept 8, 2025 (W?) |
| **Our own subscriptions: Stripe Billing or a merchant of record (Paddle, Whop, Creem)** | The code already uses Stripe Checkout in subscription mode plus the Customer Portal (`billing.md`). Paddle is about 5% + 50¢ (W?) against Stripe's 2.9% + 30¢ + 0.7% for Billing (W/W?). On $199 that is about $10.45 against $7.46 (H). A merchant-of-record service earns its fee on multi-country sales tax. We sell business-to-business in Canada | **Keep Stripe Billing.** Register for GST/HST once over the small-supplier threshold (verify the threshold and Ontario HST treatment with an accountant). Add Stripe Tax only if needed. Revisit a merchant of record when selling into US states. **Whop is a creator platform: not a fit** |
| **Pricing ladders** ($99/$199/$349 against Free/$39/$99) | §2.2 | **One ladder:** Free / $39 / $99 / $199 / $349 as plan families (packs). Needs a plans.ts change from three plans to packs (engineering) |
| **Fees** ("commission-free, optional small fee" against audit 2's 1.5% + $0.49 and 1%) | DoorDash Canada pickup is 8–10%, delivery 20–29% (W) | **0% merchant commission for pack subscribers; 1.5% only for free shops; $0.49 customer fee; 1% on deposits, invoices and recurring billing.** "Commission-free ordering" stays literally true |
| **Brand** | One customer network is the point | **One brand and one customer app or pass.** A restaurant-facing product name and sales material in Hindi, Urdu and Punjabi, e.g. "[Brand] for Restaurants". A separate consumer brand would split the network |
| **Go-to-market** (BIA street launches against Desi corridor door-to-door with WhatsApp) | Both are corridor-by-corridor; the BIA playbook is founder-led in English; the Desi one needs native speakers | **Desi corridor motion first.** The rep who speaks Hindi, Urdu or Punjabi is the *first hire*, a second "barrel" (someone who can run a whole motion end to end), not "ammunition" (support). The BIA motion starts with corridors that are BIAs (Gerrard India Bazaar) and resumes for cafés from month 7 |
| **Focus** (two wedges at once) | Founder time is the binding constraint (audit 1 §3.10) | **One wedge to build: the Desi Restaurant pack.** The service pack is already built; sell it only to service shops in the same corridor, with no new build. Café strips wait until month 7+. If the Desi gate fails, fall back to audit 2 |

---

## 4. Go-to-market

**First corridor: Ridgeway Plaza (Mississauga), if the interviews confirm it.**

- It has the densest restaurant cluster for the paying wedge (F), with owners on site, and the founder knows it.
- It is a private plaza, so there is no BIA partner. Ask the property manager for a lobby/notice-board slot and a festival co-promotion.
- **Corridor 2: Gerrard India Bazaar** (Toronto, BIA). This tests the full combined thesis: restaurants + BIA + mixed shops.
- **Corridor 3: Queen St E, Brampton.** Brampton is 52.4% South Asian (W?, 2021, secondary source).
- Run interviews in both corridor 1 and corridor 2 in month 1, and **choose by deposits, not by preference.**

**Founding-restaurant offer:** free menu digitization and photography (F, ~$150). 50% off for 12 months, then 25% off for life. A one-page "your DoorDash commissions against $199" statement made from their own payout reports. Tiffin migration done for them: subscriber list, plans, debit mandates.

**How the corridor seeds the network.** Each restaurant's counter, tiffin customers and WhatsApp list carries the free pass. The neighbours join the free core at no cost: sweet shops, grocers, salons, tailors, travel agents and phone repair. Corridor festival campaigns (Eid, Diwali) are the BIA-style campaign, sold to the plaza or BIA.

| Month | Do | Gate |
| --- | --- | --- |
| 1 (Nov 2026) | **Validation sprint (§6):** 20 owner interviews in Urdu/Hindi/Punjabi; clickable tiffin demo; ask for $100 refundable deposits; payments legal opinion; Stripe call on direct charges and pre-authorized debit; recruit the rep | **≥ 6 deposits, ≥ 2 tiffin operators with ≥ 20 subscribers each committed** |
| 2 | Build: item attributes (S), degh slot capacity (S–M), direct-charges migration (M). Sell Starter (ordering + halal + translated menus) to founding restaurants | |
| 3 | Build: tiffin engine v1 (L, through month 4) with debit + card on the restaurant's account. Catering quote mode (M). First 15 restaurants live (C: 15) | ≥ 10 paying |
| 4 | WhatsApp notifications and pay links (M). Festival templates (S). Add-ons on. Free core to 20+ corridor neighbours | |
| 5 | Tiffin GA with 2 pilot operators. Corridor 2 interviews | Tiffin billing ≥ 40 subscribers through us |
| 6 | Corridor 2 launch. Sell the service pack to corridor tailors and phone repair | ≥ 25 paying restaurants (C: 28) |
| 7–8 | Kitchen display (S–M). Translated staff UI v1. First corridor festival campaign (Diwali or Eid, depending on the calendar) | |
| 9 | Corridor 3 (Brampton). Second rep if 2 corridors are at ≥ 50% restaurant coverage | ≥ 40 paying (C: 40) |
| 10–12 | Café/BIA strips resume around the corridors (audit-2 motion). Banquet module (M) if ≥ 5 hall owners ask | **Month 12: ≥ 45 paying restaurants, churn ≤ 3%/mo, monthly revenue ≥ $15k (C: $19.4k)** |

---

## 5. Economics

### 5.1 The plans compared

Source: `combined_comparison.csv` (C). "Revenue" = subscriptions + add-ons + platform and customer fees + BIA. "Recurring" = subscriptions + add-ons only.

| Plan | Revenue/mo m12 / m24 / m36 | Recurring m12 / m24 / m36 | Paying restaurants m12 / m24 / m36 | Cash low · break-even | With $4k/mo founder draw | First month at $1M annual run-rate |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Audit-2 rail, Toronto** | $17.1k / $36.8k / $52.3k | $3.5k / $9.3k / $14.8k | — | −$14.7k · m7 | −$46.9k · m10 | Never (peak $52k/mo) |
| **B. Desi-only, realistic** | $13.0k / $32.0k / $50.9k | $10.1k / $25.2k / $40.4k | 51 / 117 / 183 | −$40.1k · m6 | −$68.1k · m10 | Never ($73k/mo at m60) |
| B. Desi-only, founder's claims (10–15 new/mo, 2% churn, $199 average) | $28.3k / $70.4k / $103.5k | $22.6k / $56.7k / $83.4k | 100 / 240 / 350 | −$32.9k · m5 | −$56.1k · m7 | m29 |
| **C. Combined, Desi first** | **$19.4k / $56.7k / $92.8k** | $11.2k / $30.7k / $51.5k | 51 / 117 / 183 | **−$42.8k · m7** | **−$71.1k · m10** | **m33** |
| C, founder builds instead of a $4k/mo contractor (months 1–6) | same | same | same | −$19.1k · m6 | −$47.1k · m10 | m33 |
| C, restaurant churn 2%/mo | $20.1k / $59.7k / $99.6k | | 54 / 128 / 208 | −$42.6k · m7 | −$70.4k · m9 | m31 |
| C, no 1% on tiffin/catering | $18.5k / $54.7k / $89.6k | | | −$44.0k · m7 | −$74.3k · m10 | m34 |
| **C, half the restaurant signings** | $12.2k / $40.2k / $67.0k | | 26 / 59 / 92 | −$49.0k · m10 | −$94.4k · m16 | m45 |

**Assumptions behind B and C (all A unless marked):**

- **Restaurant signings:** 5 a month to month 12, then 8, then 10; at most 360 restaurants (900 × 40%; the 900 is the midpoint of the founder's unverified 600–1,500).
- **Churn and mix:** 3% a month; tiers 40/45/15 at the founder's prices (F).
- **Payment flows per restaurant:** online orders 150 a month at $40 (60% of restaurants); tiffin 20 subscribers × $250 (35% of Growth/Pro); catering $3,000 a month (40%).
- **Costs:**
  - reps at $2,500 a month each, from months 2, 13 and 25;
  - photography $150 + kit $20 + commission $100 per signing;
  - contract development $4k a month in months 1–6;
  - a $3k legal opinion;
  - WhatsApp at C$0.035 per marketing message (F; Meta prices Canada in its North America region, W, but the rate wasn't retrieved, U).
- **In C, the network layer** is the audit-2 rail with corridor-areas opening more slowly (1 a month to month 6, then 2, then 3) because the founder's time is split. One overhead base.

**Hand check (C, month 24):**

- Desi: 117 restaurants × about $273 = $31,963 (C). The difference from $281 is the founding discount and the ramps.
- Network: $24,776 (C).
- **Total $56,739** (C).

### 5.2 Checking the founder's $1M path

The founder's claim: "~$199 × 100 locations ≈ $240k ARR; $1M ARR ≈ 350–400 locations" (F).

**Arithmetic:**

- $199 × 12 × 100 = **$238.8k** ✓.
- At $199 flat, $1M needs **419 locations** (H).
- At this audit's full revenue per restaurant ($281 including add-ons and fees), it needs **296** (C).

**Why GTA restaurants alone don't get there:**

- At 3% monthly churn, steady state = new signings ÷ churn. Ten a month plateaus at **333**; holding 400 needs **12 new a month forever**, with three reps (H).
- 400 is **27–67% of all GTA Desi restaurants** (F's 600–1,500, unverified). That is beyond the 80%-of-corridor domination the brief cites for Chowbus (F), applied to an entire metro.

**Verdict on the claim:**

- On realistic inputs, Desi-only reaches about $877k a year by month 60 (C).
- On the founder's own inputs it reaches $1M in month 29, which needs 15 new restaurants a month and 2% churn.
- **The combined plan gets there in month 33** because the network and service layer add about $42k a month by month 36 (C).
- **Getting past $1M needs a second metro** (Surrey/Vancouver or a US hub, F), or the network layer, or both.

---

## 6. PayPal mafia (briefly), the validation plan and kill criteria

| Person | Would back | Why, in one line |
| --- | --- | --- |
| **Thiel** | Desi first, narrow | A monopoly in a small market with a secret: Toast and Owner.com don't see the tiffin, degh and catering economy |
| **Musk** | Combined stack, half the Desi tier-2 list deleted | First principles: e-transfer to pre-authorized debit is the 10x; phone AI, point of sale and split bills are parts to delete |
| **Levchin** | Desi (tiffin) | Recurring payments compound, but failed debits, disputes and the RPAA mean direct charges from day one |
| **Hoffman** | Combined | The diaspora community, spread through WhatsApp groups, is a stronger network than the street; let it seed the street |
| **Sacks** | Combined architecture | Free core + vertical packs + usage add-ons is classic land-and-expand, with net revenue retention from add-ons. But one sales motion at a time |
| **Rabois** | Desi first, only | One barrel, one wedge. The first hire is a Hindi/Urdu/Punjabi-speaking barrel |
| **Botha** | Combined | Desi unit economics are the best in the company (82% margin, ~3-month payback, C), and the packs widen the market beyond one vertical |
| **Stoppelman** | Corridor go-to-market | Win corridor by corridor; keep review tools honest, or the merchant backlash comes |
| **Hurley, Chen, Karim** | Desi | WhatsApp is the embed: order and tiffin links forwarded in family groups |
| **Nosek** | Desi | Contrarian: the cultural network beats the geographic one |
| **McClure** | Whichever passes the 30-day test | Interviews, demo, deposits: cheap and measurable |

**30-day validation plan (gate 1).** The brief's biggest gap is zero owner interviews (F).

| Week | Do |
| --- | --- |
| 1 | 20 owner interviews, 10 at Ridgeway Plaza and 10 at Gerrard India Bazaar or Brampton, in the owner's language. Ask about: tiffin billing pain, DoorDash statements, catering deposits, degh rush, WhatsApp use, current software (Toast, Owner.com, Chowbus) |
| 2 | Clickable tiffin demo: plans, skip/pause, debit mandate, route sheet. Show the fees plainly |
| 3 | Ask for $100 refundable founding deposits. Ask 3 tiffin operators to commit their subscriber list to a pilot |
| 4 | Payments/RPAA legal opinion; written answer from Stripe on direct charges, pre-authorized debit and Billing on connected accounts; rep hired |

**Gate:**

- ≥ 12 of 20 owners confirm tiffin or catering payment pain;
- **≥ 6 deposits**;
- **≥ 2 tiffin operators with ≥ 20 subscribers each committed**;
- a rep found.

If the gate fails, don't build the Desi pack. Run the audit-2 plan.

**Kill criteria after the gate:**

| By | Number | If missed |
| --- | --- | --- |
| Day 90 | ≥ 10 paying restaurants; 1 tiffin operator billing ≥ 20 subscribers through us; ≤ 1 founding restaurant lost | Stop the Desi build after the tiffin engine; sell what exists |
| Day 180 | ≥ 25 paying restaurants (C: 28); monthly revenue ≥ $5k (C: $6.6k); losses and disputes on tiffin ≤ 50 bps | Halve the rep budget; no corridor 3 |
| Month 12 | ≥ 45 paying restaurants (C: 51), churn ≤ 3%/mo, ≥ 30 free corridor neighbours active | Stop the Desi expansion; keep serving corridor 1 |
| Month 18 | Net new restaurants ≥ 6/month with 2 reps | The $1M path is off without a second metro. Decide whether to raise or stay small |

---

## 7. Recommendation

**Combine: one platform, one customer network, one brand.**

**First wedge: the Desi Restaurant pack in one corridor**, behind the 30-day gate. Sell the already-built service pack to service shops in the same corridor. Café and BIA strips wait until month 7+.

**What to build next in this codebase, ranked:**

| # | Build | Size | Why first |
| --- | --- | --- | --- |
| 1 | **Direct charges + pre-authorized debit** (`providers/paymentsStripe.ts`, `services/payments.ts`, refunds, webhooks), behind the legal opinion | M | Keeps us out of fund custody; restaurant is merchant of record; cheaper tiffin billing; about +11 points of payments margin |
| 2 | **Item attributes** (halal/zabihah/veg/spice) + filters | S | Cheap trust signal; benefits the whole network |
| 3 | **Packs in plans.ts** (plan families, add-ons, per-category platform fee, customer service fee) + billing | M | Every price decision above depends on it |
| 4 | **Tiffin engine** (plans, skip/pause/family, routes, recurring billing on the connected account) | L | The wedge |
| 5 | **Degh slot capacity + order deposits and cut-offs** | S–M | Friday/Sunday rush; mostly built |
| 6 | **Catering quote mode** (event ticket kind, per-head lines, tasting slots) on `service.*` | M | Wedding season; mostly built |
| 7 | **WhatsApp channel** via Twilio (notifications, pay links, consented marketing, packs) | M–L | The community's channel; add-on revenue |
| 8 | **Translation framework**: menus and kitchen tickets first, then the staff UI | M → L | Required to sell, and Urdu needs right-to-left layout |
| 9 | Festival calendar templates | S | Uses existing messaging |
| 10 | Kitchen display view | S–M | Pro tier |

**Later:** branded site with custom domain (M), Google reviews (M), banquet module (M), phone AI (L, year 2).

**Out:** point of sale, dual pricing, split bills and tip pooling.

---

## Appendix

### Files

`docs/finance/model/combined_strategy.py` imports `strategy_audit_2.py`, and through it `model.py`, read-only.

| File | Contents |
| --- | --- |
| `combined_comparison.csv` | Every plan in §5.1 |
| `combined_monthly_<plan>.csv` | 60-month detail per plan |
| `combined_desi_unit_economics.csv` | §2.3 and the $1M arithmetic |

### Limits

- The Desi layer is a standalone cohort model; corridor neighbours are represented by the network layer's slower area schedule, not tracked per corridor.
- The network layer stops signing once its areas are exhausted (month ~45). That is why C's network revenue falls in year 5.
- Payment-flow volumes per restaurant are guesses.
- The founder's draw and contractor spend are shown as sensitivities.

### What I verified, and what I couldn't

| Claim | Status |
| --- | --- |
| Chowbus: >US$120M annual recurring revenue; delivery business sold to Fantuan, Jan 2024 | (W?) self-reported. Merchant count: ">10,000" in a job post against the brief's 9,000+ |
| Brampton 52.4% South Asian, 2021 | (W?) secondary source |
| GTA 1,182,485 South Asians, ~19% | (W?) Wikipedia, GTA not CMA. The CMA figure conflicts (one source: 812,830) |
| Mississauga 25.4% | (U) |
| 600–1,500 GTA South Asian restaurants; US ~5,000 Indian restaurants and $4.9B; "no Desi restaurant SaaS exists" | (U) not checked |
| Owner.com Canada: C$349/mo + 5% restaurant fee, or C$699 flat | (W) owner.com/ca/pricing via search |
| DoorDash Canada: pickup 8–10%, delivery 20–29% | (W) audit 2 |
| Stripe Canada online 2.9% + C$0.30; Interac listed in person only | (W) |
| Pre-authorized debit 1% + C$0.40, capped at C$5 | (W?) third-party |
| Stripe Billing 0.7% | (W?) Stripe support page, US |
| Direct charges: the connected account bears fees, refunds and chargebacks | (W) Stripe docs |
| Paddle 5% + 50¢ | (W?) |
| WhatsApp: per-message pricing from July 2025; Canada priced in the North America region; rate not retrieved | (W) / (U) |
| Card surcharging allowed in Canada since Oct 6, 2022, but not in Quebec; drip pricing is illegal under the Competition Act | (W?) BLG, CTV |
| "Dual pricing legal everywhere incl. Quebec" | (U) |
| TiffinStash: ~40 tiffin services listed, "more sellers than customers", $12–16 trial day | (W?) press. The brief's "60+ sellers" and "75% repeat" are (U) |
| Toast Canada $69/mo + 2.49% + 15¢ | (U) |
| RPAA: an agent of a registered payment provider need not register; registration required since Sept 8, 2025 | (W?) law-firm and commercial summaries. **Get counsel** |

### Sources

All searched or fetched Oct 22, 2026.

- [Chowbus pivot (Chubby Cattle / Chowbus blog)](https://www.chubbycattle.com/chowbus-surpasses-4b-in-volume-after-bold-pivot-from-delivery-app-to-full-stack-restaurant-tech-company/) · [Chowbus profile](https://multiples.vc/private-comps/chowbus)
- [South Asian Canadians in the GTA](https://en.wikipedia.org/wiki/South_Asian_Canadians_in_the_Greater_Toronto_Area) · [CIC News, where South Asians live](https://www.cicnews.com/2024/03/where-do-most-south-asians-live-in-canada-0343352.html)
- [Owner.com Canada pricing](https://www.owner.com/ca/pricing) · [Owner.com pricing, vendor blog](https://www.getsauce.com/post/owner-com-pricing-fees)
- [WhatsApp Business Platform pricing (Meta)](https://developers.facebook.com/docs/whatsapp/pricing)
- [Stripe Canada pricing](https://stripe.com/en-ca/pricing) · [Stripe Connect pricing (CA)](https://stripe.com/en-ca/connect/pricing) · [Stripe: fee behaviour on connected accounts](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior.md) · [Stripe: subscriptions with Connect](https://docs.stripe.com/connect/subscriptions) · [Stripe pre-authorized debit (ACSS) docs](https://docs.stripe.com/payments/acss-debit) · [Venn: Stripe fees in Canada](https://www.venn.ca/resources/how-to-save-on-your-stripe-payments-for-canadian-businesses) · [Stripe Billing July 2024 change](https://support.stripe.com/questions/july-2024-changes-to-stripe-billing)
- [Paddle fees (competitor blog)](https://dodopayments.com/blogs/paddle-fees-explained)
- [Bennett Jones: RPAA registration (Dec 2024)](https://www.bennettjones.com/Insights/Blogs/2024/12/Retail-Payment-Activities-Act-A-Deeper-Dive-Into-When-Registration-is-Required) · [RPAA registration summary](https://faisalkhan.com/solutions/licensing/country/canada/rpaa)
- [BLG: credit card surcharges in Canada](https://www.blg.com/en/insights/2022/11/credit-card-surcharges-in-canada-what-you-need-to-know) · [CTV: Quebec exempt from surcharge rule](https://montreal.ctvnews.ca/quebec-exempt-from-rule-allowing-businesses-to-charge-credit-card-fees-1.6096912)
- [CBC: tiffin in the GTA](https://amp.cbc.ca/news/canada/toronto/tiffin-gta-south-asian-food-delivery-1.7080093) · [CTV/Globe: tiffin lunch boxes](https://ctvnews.ca/business/taste-of-home-tiffin-lunch-boxes-bring-comfort-affordability-to-immigrants-1.7063883)
- [Toast $0.99 guest fee, Restaurant Dive (2023)](https://www.restaurantdive.com/news/toast-adds-99-cent-customer-online-ordering-fee/653707/) · [DoorDash Canada pricing](https://merchants.doordash.com/en-ca/pricing)
