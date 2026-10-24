# Data strategy: should we go free-for-all and sell data?

Oct 24, 2026 · Joint review for @Sajjad Pirani by a Canadian privacy lawyer, a data-products executive and a SaaS finance lead · CAD · **Not legal advice: every legal conclusion needs written sign-off from Canadian privacy counsel before launch.**

**The proposal.** Keep most features free, skip paid plans for now, and make data the main business: collect across the network, sell to automation and market-research firms.

**Tags used on every number or claim**

| Tag | Meaning |
| --- | --- |
| (repo) | Read in this repository this session (file named) |
| (W) | Found on the web this session, source linked |
| (W?) | Found, but secondary, self-reported or conflicting |
| (R) | From the team's memory of the law or market; **link not opened this session, verify** |
| (U) | Looked for, could not verify |
| (A) | Assumption |
| (C) | Output of `docs/finance/model/data_strategy.py` (run Oct 24, 2026; CSVs in `docs/finance/model/output/data_strategy_*.csv`) |

---

## 0. Verdict

**No to "free for all, data as the main business". Yes to a small, consent-based, aggregated-insights product (a "Main Street Index") added on top of the current paid packs, launched only after coverage gates are met, and only after the promises we make today are rewritten honestly.**

Why, in five numbers (all (C) on the same base the finance team already published as `C_combined_desi_first`):

1. **Free-for-all plus data needs about $147k of cash and breaks even in month 29. The current plan needs about $43k and breaks even in month 7.** Even the founder's best case for data (twice our price curve, no consent haircut) still needs $146k and month 22.
2. **Data is worth about $5.5k a month at month 36 in the base case (about $66k a year), against about $51k a month of subscriptions and add-ons it would replace.** To replace them at month 36 the Insights product would need about **$618k a year**, which on our curve takes about **2,640 contributing merchants**. The base case has about **690**.
3. **The data business itself only breaks even at about 700 contributing merchants (about 1,000 active).** Below that it costs more than it earns (staff, legal, audit: about $60k a year (A)).
4. **Per merchant, data is worth about $5 a month at 400 merchants, $18 at 2,000 and $29 at 10,000 (A)** (section 2.4). A paid Restaurant Growth shop is worth about $281 a month (repo, `combined-strategy.md` §2.3). Data is a margin on top of the network, not a replacement for it.
5. **The largest single revenue line is payments, not subscriptions or data.** At month 36 the current plan earns about $31.5k a month from payment fees, $43.8k from subscriptions and $7.7k from add-ons (C). Payments are the revenue we keep in every scenario.

**What we recommend instead (scenario a2 below):** keep the current paid packs, keep payments and usage fees, and build the Insights product behind gates. It adds about $50k a year of revenue at month 36 for about $60k a year of cost, so it is a strategic option (BIA, City and CRE relationships; a defensible benchmark nobody else has for independent strips), not a profit centre, until coverage passes about 1,000 active merchants.

**Free-for-more is a separate, testable question.** Moving near-zero-cost Plus features to Free (scenario d) only matches the current plan on cash if it raises shop sign-ups by about **50%**; we assumed 15% (C, section 4.3). Nobody has measured that. Test it on pilot strips before changing `plans.ts`.

---

## 1. What we can legally sell or license in Canada, and how

### 1.1 The law today (Oct 24, 2026)

| Instrument | Status | What matters for us |
| --- | --- | --- |
| **PIPEDA** (federal, applies in Ontario because Ontario has no general private-sector privacy statute) | In force | Consent, appropriate purposes, accountability for service providers. Personal information includes pseudonymous data if there is a "serious possibility" an individual could be identified (Gordon v. Canada (Health), 2008 FC 258 (R)). Aggregate statistics that meet that test fall outside it. Sources: [PIPEDA](https://laws-lois.justice.gc.ca/eng/acts/p-8.6/) (R), [OPC consent guidelines](https://www.priv.gc.ca/en/privacy-topics/collecting-personal-information/consent/gl_omc_201805/) (R) |
| **Bill C-27 / CPPA** | **Dead.** It lapsed when Parliament was prorogued in January 2025 (W: [IAPP](https://iapp.org/news/a/what-2026-may-bring-for-canadas-privacy-reform-efforts), (repo) `docs/legal/compliance-checklist.md` §2) | Do not plan around it |
| **Bill C-36, Protecting Privacy and Consumer Data Act** | **Introduced June 15, 2026, first reading only. Not law. Not in force.** Coming into force depends on enactment and on another bill (C-34) (W: [DLA Piper](https://www.dlapiper.com/insights/publications/2026/06/canada-tables-bill-c36-the-protecting-privacy-and-consumer-data-act), [Gowling](https://gowlingwlg.com/en/insights-resources/articles/2026/ottawa-tables-long-awaited-federal-privacy-reform-legislation), [Mondaq](https://www.mondaq.com/canada/privacy-protection/1806036/bill-c-36-and-the-future-of-canadas-federal-private-sector-privacy-law-what-has-changed-what-it-means-and-what-to-do-now)) | If passed it would replace Part 1 of PIPEDA. Reported terms: de-identified data stays personal information and re-identifying it is prohibited (with testing exceptions); a higher standard for children's data; assessment before transfers outside Canada; penalties up to the greater of $10M and 3% of global revenue (administrative) and up to $25M and 5% (criminal); a private right of action only after a regulator finding (W). **Check Parliament's site for the current stage before relying on any of this.** We should build to C-36 now because it costs little: treat de-identified data as personal data and rely on aggregation, not on pseudonymisation |
| **Quebec Law 25** (Act respecting the protection of personal information in the private sector) | In force | Consent that is manifest, free, informed, specific and given for each purpose; privacy impact assessment (PIA) for any project involving personal information systems and for transfers outside Quebec; profiling features off by default; confidentiality by default; incident register; penalties up to about $25M or 4% of worldwide turnover for the most serious offences (W?: [Mondaq summary](https://mondaq.co.uk/canada/privacy-protection/1476924/new-québec-regulation-governing-how-personal-information-can-be-anonymized-in-compliance-with-privacy-law)). Statute: [P-39.1](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1) (R) |
| **Quebec anonymization regulation** | In force since May 30, 2024; register since Jan 1, 2025 (W: [McCarthy](https://www.mccarthy.ca/en/insights/blogs/techlex/quebec-adopts-regulation-anonymization-personal-information), [Miller Thomson](https://www.millerthomson.com/en/insights/cybersecurity/government-quebec-regulation-anonymization-personal-information/)) | Information is anonymized only if it is, at all times, reasonably foreseeable that it **irreversibly** no longer identifies anyone, directly or indirectly, and only for **serious and legitimate** purposes. Process: set the purpose; a qualified person supervises; remove direct identifiers; assess individualization, correlation and inference risk; apply techniques; test that residual risk is **very low**; review periodically; keep a register. It is written for end-of-life anonymization, and the CAI itself says its application earlier in the lifecycle is unclear (W). De-identified is **not** anonymized: it is still personal information (W) |
| **CASL** | In force | Not triggered by selling aggregates. It **is** triggered if we ever hand a buyer a contact list or let a buyer message shoppers: consent is per sender and not transferable (repo checklist §1) |
| **Competition Act** deceptive marketing | In force | Our own promises are the exposure (section 1.6). Penalties for corporations are the greater of a fixed amount, a multiple of the benefit, or a percentage of worldwide revenue, and private parties can bring cases with leave since June 2025 (R, repo checklist §7 says VERIFY) |
| **MFIPPA** (Ontario municipal freedom of information) | In force | Toronto BIAs are local boards (R, VERIFY). Anything we hand a BIA or the City may be requested under freedom of information. This is another reason never to hand them record-level data |

### 1.2 What we can sell, tier by tier

| Tier | What it is | Personal information? | Can we sell it? | Condition |
| --- | --- | --- | --- | --- |
| **0. Individual-level** | Names, phones, emails, member codes, per-person visit histories, addresses | Yes | **Never.** Not for money, not "for research", not to AI firms | None. Also never to merchants other than the shop the person joined |
| **1. Pseudonymous row-level** | Hashed IDs, one row per visit or order, "panel" feeds | **Yes** (PIPEDA serious-possibility test; Law 25 says de-identified is still personal; C-36 same) | **Not in the first 24 months.** If ever, as a separate opt-in research panel the shopper joins knowingly and is paid for, with express consent per buyer category | Express consent, buyer contract with no re-identification and no linkage, audit rights, PIA, Quebec carve-out. This is Numerator's model (it pays panelists) and not ours |
| **2. De-identified aggregates** | Counts, medians and indexes by strip, week and category, with thresholds | **No**, if the thresholds in §5.4 hold and counsel signs off | **Yes. This is the product.** | Shopper opt-in (our choice, stricter than the law needs for true aggregates), merchant opt-in, release rules, register, annual re-identification test |
| **3. Merchant-contributed benchmarks** | A shop's own sales and visit metrics blended into peer benchmarks | Business information, not personal (but sole proprietors blur this) | **Yes**, with the merchant's contract consent | Opt-in addendum, at least 5 merchants per cell, no merchant above 40% of a cell |
| **4. Public or merchant-published listing data** | Hours, menus, halal certificate text the merchant published | No | Low value, and our merchant licence only covers displaying listings, so selling needs a new licence | Do not bother in v1 |

**Aggregated is not automatically anonymous.** The Quebec regulation requires the full process even for aggregate-looking releases that could be linked back; Placer, SafeGraph and X-Mode all learned that location-derived "aggregates" built from sensitive places are regulated as sensitive (section 1.5).

### 1.3 Consent

| Use | PIPEDA | Law 25 | What we do |
| --- | --- | --- | --- |
| Run the loyalty program, network perks, fraud, service messages | Implied or inherent in joining | Same | No change |
| Aggregate statistics **to the shops and BIAs** (already disclosed in our draft privacy policy §3 and merchant agreement §2.3) | Covered by the existing notice once the policy is published | Covered if anonymized per the regulation | Keep |
| **Selling or licensing aggregates to third parties beyond shops and BIAs** (City, CRE, CPG, lenders, research) | If truly aggregate, not personal information; but it is a new use we have not disclosed, and the policy currently says "for shops and BIAs" and "we do not sell personal information" | Needs the anonymization process and a serious, legitimate purpose; the CAI has not said whether commercial resale qualifies (U) | **New notice and an unchecked opt-in toggle** ("Neighbourhood insights"), plus merchant opt-in. Not a condition of using the app |
| Pseudonymous panel | Express, meaningful consent (sensitive-adjacent: location, spend) | Express, per purpose | Not offered |
| Sensitive categories (§1.5) | Express consent and still **no** | Express and still **no** | Excluded from all products |
| Phone transcripts, WhatsApp text, review text, voice | Personal and often sensitive; AI training on it needs valid consent (W: [OPC joint findings on OpenAI, May 6, 2026](https://www.priv.gc.ca/en/opc-news/news-and-announcements/2026/bg-info_openai_260506/)) | Same, stricter | **Never sold, never licensed for training** |

**No retroactive repurposing.** The rule we adopt: data collected before the new terms take effect is used only for the purposes it was collected for. The Insights product uses only data from shoppers and merchants who opt in **after** the new notice is live. We are pre-launch (pilot strip planned for month 5), so the cleanest moment to do this is **now**, before the first shopper joins. Nothing needs to be retrofitted if we fix the copy first.

### 1.4 Our role and the merchant's role

| Data | Who decides purposes | Our role | Consequence |
| --- | --- | --- | --- |
| A shopper's account (phone, name, member code, wallet pass, network perks, push) | Us | **Controller** (the organization accountable under PIPEDA principle 4.1; the "person in charge" under Law 25) | We need our own consent for network-level uses |
| A shopper's activity **at one shop** (visits, spend, points, orders, notes) | The shop, for its program | **Service provider (processor)** to the shop. Our draft merchant agreement §2.6 says so but Schedule B is `[To draft with counsel]` (repo) | A service provider may not use the shop's data for its own products unless the contract allows it and consent covers it |
| The shop's own business numbers (sales, visits per day) | The shop (confidential business information) | Licensee | Needs the shop's contract consent before we blend it into a benchmark someone else buys |

Today the merchant agreement (§2.1) says "you own Merchant Customer Data" and §2.3 lets us create "aggregated, de-identified statistics" only "to provide the Service, prevent fraud, improve the Service" and for BIA reports (repo). That does **not** clearly cover selling statistics to a CPG brand or a landlord. Sections 11.1 and 2.1 also say changes "never reduce your ownership of your data". So:

**What the merchant terms must say** (new Schedule B and an opt-in Schedule D, "Insights contribution"):

1. Roles: we are controller of network accounts and processor of shop-level data; shops remain responsible for their own notices (the counter script) and CASL.
2. Shop data stays the shop's. The shop **licenses** us to create de-identified aggregates from it, only if it opts in to Schedule D, revocable on 30 days' notice, with no effect on any free feature.
3. What is released: only the metrics, geography, cell thresholds and buyer categories listed in the data-sharing schedule (§5.4). Never lists, never per-shop figures, never anything that identifies the shop to a competitor.
4. Merchant benefit: a share of Insights revenue, as a credit pool split pro rata (a recommended 20% (A)), and free access to its own strip's benchmark.
5. Competition law: aggregates are lagged and thresholded so shops cannot read each other's sales (information exchange between competitors is a Competition Act risk (R)).
6. Warranty: the shop confirms it told its customers at the counter; our counter script and the app notice do that work.

**What the shopper terms and privacy policy must say:** an "Insights" section naming the buyer categories, the thresholds, what is never included, how to opt out, and how long published aggregates persist (past releases cannot be recalled, and we say that plainly). The Rewards Terms and ToS 30-day change-notice rules apply (repo).

### 1.5 What we must never sell, mapped to the schema

Mapped from `packages/db/src/schema.ts` (repo). "Never" means not in any product, at any tier, whatever the consent.

| Category | Where it lives in the schema | Why | Rule |
| --- | --- | --- | --- |
| **Religion-inferring** | `catalogItems.dietary` (halal, zabihah, jain), `merchants.halalCertification`, `merchants.cuisines`, `festivalSends`, `merchantOccasions` (Eid, Diwali, Vaisakhi, Navratri campaigns), `whatsappSessions.marketingOptInAt`, `tiffinPlans.dietary`, `tiffinSubscriptions.dietaryNotes`, `users.locale` and `merchants.languages` (Hindi, Urdu, Punjabi as ethnicity proxies) | Orders for halal or Jain food plus a postal code reveal religion; the FTC treated visits to places of worship as sensitive location data (W: [EFF on X-Mode](https://www.eff.org/deeplinks/2024/01/ftc-bans-x-mode-selling-sensitive-location-data), [WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20240209-recent-enforcement-actions-signal-ftc-focus-on-protecting-location-data)) | **No shopper-level dietary, festival or language dimension in any output.** Merchant-level facts the merchant published (a restaurant is halal-certified) are not personal, but we do not sell them in v1 |
| **Health** | `orders.allergyNote`, `whatsappSessions.allergyNote`, `catalogItems.dietary.allergens`, `tiffinSubscriptions.dietaryNotes`, `cateringEvents.dietaryNotes`, pharmacy merchants (`vertical`) | Allergies are health information; front-store pharmacy purchases are health-adjacent (repo checklist §3) | **Never.** Pharmacies are excluded from every data product |
| **Precise home addresses and location trails** | `tiffinSubscriptions.address`, `lat`, `lng`, `postalCode`, `routeId`, `stopOrder`; `tiffinDeliveries`; `cateringEvents.venueAddress`; `hallBookings`; `users.postalCode`; `visits` (user, location, time) | A tiffin address is a home. A full postal code is about 15 households. A visit trail is a movement history | **Never.** Geography in outputs is the strip or the first three characters of a postal code at most, and only inside an aggregate |
| **Minors** | `users.birthday` (a full date, optional); no age check at join | We cannot prove a shopper is an adult. The age floor in our draft policy is `[16]`, and C-36 raises the standard for children (W) | Shopper opt-in requires an age attestation. Anyone under 18, or of unknown age without attestation, is excluded from contribution |
| **Phone transcripts and messages** | `phoneCalls.transcript`, `phoneCalls.fromPhone`, `whatsappMessages.body`, `whatsappSessions.cart`, `reviewRequests.feedback`, `reviewRequests.replyBody` | Personal, often sensitive (voice, names, allergies), made in confidence to a shop. Canadian regulators found training on user interactions needs valid consent (W: OPC backgrounder) | **Never sold or licensed, including to AI firms** |
| **Payments and identifiers** | Stripe ids, `paymentMethodLast4`, `quotes.signatureIp`, `pushTokens`, `users.email`, `users.phone`, `memberCode`, `tipStaffId` | Identifiers; staff are individuals too | **Never** |

**Adjacent finding on our own copy:** `users.birthday` is stored as a full date, while the draft privacy policy promises "birthday (day and month only)" and the checklist says "no year" (repo). Fix the schema or the promise before launch.

### 1.6 Trust and brand risk: the promises we have made

| Where | Promise (repo) | Conflict with a data business | Honest rewrite |
| --- | --- | --- | --- |
| `apps/web/src/copy/en-CA.ts` line 203, merchant FAQ | "Whose customer data is it? **Yours.** Other shops never see your members, and customers only get offers if they opt in (CASL)." | A network-wide dataset sold to third parties is not "yours" | "Your customers are yours. You can export them, and no other shop ever sees them. If you choose to join Neighbourhood Insights, we also publish anonymous street-level statistics that combine your numbers with other shops'. Nothing that identifies you or a customer leaves us." |
| `en-CA.ts` lines 387 and 396, BIA pages | "You get **aggregates only**. No names, phone numbers or customer lists leave the platform." and "Do we get the customer list? No." | Still true for BIAs, and must stay true | Keep, and add "Aggregates follow our published release rules (minimum group sizes, small-cell suppression)" |
| `docs/legal/privacy-policy.md` §1, §4 | "**We do not sell your personal information**, and we do not share it with data brokers." | True for aggregates only if they are not personal information. A buyer reading "we sell data" will not make that distinction, and neither will the press | "We never sell personal information. If you opt in, we include your visits in anonymous neighbourhood statistics that we license to organizations such as BIAs, the City, property and market-research firms." Name the categories |
| `privacy-policy.md` §3 | Statistics are "for shops and BIAs", groups of "[10] or more" | Third-party buyers are outside that list | Update the list, and replace "[10]" with the release rules in §5.4 |
| `docs/legal/merchant-agreement.md` §2.1, §2.3, §11.1 | You own your data; we may make aggregates only to provide and improve the Service; changes never reduce your data ownership | Schedule D is a new use | Opt-in addendum, not a unilateral change |
| "Free forever" (pricing, merchant agreement, `plans.ts` rule 3) | Free features never move to paid | A data business changes why the product is free, and "free" statements must be literally true (repo checklist §7) | Say plainly how we make money, including "some shops and shoppers choose to contribute anonymous statistics". Do not say "free because we never use your data" |

**Adjacent findings (not data-specific, but they raise the legal temperature of any new promise).** (1) The merchant agreement summary still lists promos, the discount card, POS auto-award and email as free forever, while `plans.ts` and `pricing.md` (Pricing v2, Oct 22) moved them to Plus. A merchant who signs the current draft is promised something the product no longer gives (Competition Act exposure; fix before anyone signs). (2) The merchant agreement says 0.75% platform fee and Plus $39/Pro $79, while `plans.ts` has Service at $99 and 0%/1% fees. (3) The compliance checklist says only that C-27 died and to "VERIFY current status": add C-36. (4) The legal pages render from drafts and carry a "DRAFT: not in effect" banner (repo, `apps/web/src/lib/legal.ts`), so the marketing copy is currently the only live promise. Fix the copy first.

---

## 2. Who buys this data, and what they pay

### 2.1 Comparable companies

| Company | What it sells | Scale and price evidence | Why it matters to us |
| --- | --- | --- | --- |
| **Placer.ai** | Foot-traffic analytics from a mobile-device panel; BID/BIA "civic" product | Reported >US$100M annual run-rate and more than 4,300 customers; raised US$75M at about US$1.5B in July 2024 (W?: [DevX](https://www.devx.com/news/placer-ai-raises-75m-boosts-valuation-to-1-5b/), [Calcalist](https://www.calcalistech.com/ctech/articles/0,7340,L-3927078,00.html)). That implies about **US$23k per customer a year (C, arithmetic on W?)**. No public price list (W: [PricingSaaS](https://pricingsaas.com/companies/placer)). For BIDs, an attendee reports tiered pricing by district revenue with monthly PDF reports and platform access (W?: [blog](https://isaackremer.com/placer-discover-2024-bringing-data-to-where-we-cannot-go/), single source) | The incumbent for CRE, retail and BIDs. It covers every store with device data. We cover only our members at our merchants. We cannot win on breadth |
| **Advan Research (took over SafeGraph Patterns, Nov 2022)** | Weekly and monthly foot-traffic for investors, researchers, real estate, governments | Customers named, price not found (W: [Advan](https://advanresearch.com/insights/advan-acquires-safegraphs-patterns-business-expanding-leadership-in-location-intelligence-and-foot-traffic-analytics); price (U)) | Same: a commodity foot-traffic feed already exists |
| **Bloomberg Second Measure** | Anonymized card-transaction analytics for investors | Bloomberg bought it in Dec 2020, terms undisclosed (W: [Bloomberg](https://www.bloomberg.com/company/press/second-measure)). Funding about US$20 to 25M (W?) | Buyers are investors and need panel scale of millions |
| **Earnest Analytics** | Transaction data for investors | **(U) not verified this session** | Same buyer type |
| **Numerator** | Purchase panel and receipts for CPG brands and market research | Acquired by Kantar for about US$1.5B in 2021 (W?: [Kantar](https://www.kantar.com/press-center/kantar-enters-definitive-agreement-to-acquire-numerator)); US panel 200,000 households (W: [Numerator](https://www.globenewswire.com/news-release/2025/04/10/3059280/0/en/NUMERATOR-LAUNCHES-200-000-U-S-HOUSEHOLD-STATIC-PANEL-SETTING-NEW-STANDARD-FOR-DATA-QUALITY.html)); **Canadian purchase panel 18,000** (W: [Yahoo Finance headline](https://hk.finance.yahoo.com/news/numerator-expands-canadian-consumer-purchase-130000916.html)) | The CPG buyer wants **item-level, all-retailer** baskets. Our loyalty ledger holds spend per visit, not baskets, except for in-app orders (`order_items`). 22,000 customers at 400 merchants (C) is comparable to Numerator's Canadian panel in count but single-shop, single-channel and not representative |
| **Moneris Data Services** | Anonymized and aggregated payment data to public and private clients; powers the Signal49 Index of Consumer Spending | More than 3.5 billion transactions across more than 325,000 merchant locations (W: [Moneris](https://dataservices.moneris.com/en/about), [Signal49](https://www.signal49.ca/focus-areas/canadian-economics/index-of-consumer-spending/)) | **The Canadian incumbent for spend indexes.** At 10,000 merchants we would be about 3% of its locations. Our edge is loyalty (repeat visits, multi-shop overlap) on named independent strips, not spend totals |
| **Interac / Visa to Finance Canada** | Highly aggregated card data under NDA during COVID | Provincial and national level only (W?: [The Logic](https://thelogic.co/?p=128740)) | Public buyers want national or provincial series, not one street |
| **Statistics Canada partnerships; Square market data; Yelp / OpenTable data** | | **(U) no verifiable pricing or agreement found this session.** Yelp reports a "data licensing" line of about US$47M that is not AI-specific (W?: [Monda](https://www.monda.ai/blog/ultimate-list-of-data-licensing-deals-for-ai)) | Treat as unproven buyers until a call confirms |
| **AI training-data buyers** | Text, image, voice at scale | Reddit to Google reported about US$60M a year; Photobucket pitched US$0.05 to US$1 per image (W?: [Monda](https://www.monda.ai/blog/ultimate-list-of-data-licensing-deals-for-ai)) | They pay for **billions** of items and clean rights. Ours is thousands of private messages and calls: low value, high risk (section 2.3) |

### 2.2 Who our buyers could realistically be

| Buyer | What they would pay for | Price we model (A) | Evidence of demand | Blocker |
| --- | --- | --- | --- | --- |
| **BIAs** (Toronto has over 80, W: City of Toronto documents) | Strip visit index, repeat and multi-shop rates, event lift, **benchmark against other strips** | $3k to $5k a year (A). The 2020 operating budgets of 24 BIAs averaged about $417k, raised partly by a $6.49M levy (repo `docs/research/landing-and-network.md`), so $3 to 5k is about 1% of a budget. Campaigns already sell at $1,500 to 3,000 (repo) | Only 38% of BIAs collect any customer-experience data, and the OBIAA/TABIA return-on-investment study named loyalty programs that share analytics as a fix (repo `en-CA.ts` line 353) | Small budgets; the free BIA report already covers one strip. Value is the cross-strip benchmark |
| **City of Toronto economic development, agencies** | Main-street health index, vacancy and recovery tracking | $15k to $50k a year (A) | Main Street Innovation Fund up to $25k (repo, W per source) shows grant-sized appetite | Procurement cycles of 6 to 12 months; need city-wide coverage |
| **CRE brokers and landlords** | Corridor traffic and repeat-visit trends for leasing | $20k to $30k (A), anchored on Placer's implied ~US$23k (W?, C) | Placer's growth shows demand for foot traffic | We cover a sample of independents only; Placer is cheaper per store |
| **CPG brands (e.g. South Asian food brands)** | Category sell-through, new-store and festival-season demand | $25k to $40k (A) | **(U) none found.** | Needs SKU-level data we mostly do not collect, and the festival and halal dimensions are exactly what we must not sell (§1.5). Pilot only |
| **Lenders and insurers** | Merchant health scores | $15k to $60k (A) | (U) | **Credit or insurance decisions about individual merchants are a different legal product (consumer-reporting and fairness issues). Out of scope** |
| **Market-research and AI firms** | Row-level panels, text, voice | Not offered | Section 2.3 | Not legally sellable at our consent level |

### 2.3 The AI-training and "automation firms" question

The founder's description ("firms doing automation and market research") is the buyer type with the highest legal risk and the lowest willingness to pay for our data.

- **Legal risk is current, not hypothetical.** On May 6, 2026 the federal Commissioner and the Quebec, B.C. and Alberta regulators jointly found that OpenAI's early model training did not comply with Canadian privacy law, mainly for lack of valid consent, especially for scraped personal information and for using user interactions to fine-tune models (W: [OPC backgrounder](https://www.priv.gc.ca/en/opc-news/news-and-announcements/2026/bg-info_openai_260506/), [IAPP](https://iapp.org/news/a/probe-finds-chatgpts-model-training-violated-canada-s-federal-provincial-privacy-laws)). Selling our transcripts or WhatsApp messages for training would be that fact pattern with a smaller company and a named seller.
- **In the US, regulators ban the sale of sensitive location data**: X-Mode (Jan 2024) had no process to strip sensitive places before selling; InMarket was barred from selling precise location data (W: [WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20240209-recent-enforcement-actions-signal-ftc-focus-on-protecting-location-data)). A halal-restaurant corridor visit trail is sensitive by the FTC's logic.
- **Buyers cannot be policed.** Once a buyer holds row-level data we cannot enforce deletion or no-re-identification. We remain accountable under PIPEDA principle 4.1.3 (R).
- **Low value.** AI deals are priced on billions of items (W?). Our corpus is small, multilingual, private and under merchant confidentiality.

**Verdict: no row-level data and no text or voice to any buyer, AI or otherwise.** If an automation or research firm wants insight, the product is the aggregated Index through a data-sharing agreement that bans re-identification, linkage and use for decisions about individuals.

### 2.4 What coverage buyers need before data is worth anything, and realistic revenue

Our own gates (the same shape as the campaign gates already in `docs/business/network-monetization.md`):

| Product | Minimum before we sell | Why |
| --- | --- | --- |
| Strip (BIA) index | Strip live at least 6 months; at least 20 active contributing merchants; at least 1,000 contributing shoppers; at least 25% multi-shop (repo gate for campaigns: 20 merchants, 1,500 customers) | Below that, cells fail the §5.4 thresholds |
| Cross-strip benchmark and city index | At least 400 contributing merchants across at least 10 strips; at least 12 months of history | Buyers need seasonality and a peer set |
| CRE corridor report | At least 25% of a corridor's storefronts contributing and 18 months of history (A) | Representativeness; we must disclose coverage (Competition Act) |
| CPG category report | At least 200 contributing merchants in the category and item-level data | We lack item-level data (§2.1), so not before year 3 |

Contributing merchants = active merchants times about 70% consent coverage (A: merchant opt-in times shopper non-objection). On the base case that is **about 140 at month 12, 380 at month 24 and 580 at month 36** under the current plan (C), so the 400 gate is reached around **month 25**.

**Annual Insights revenue at 400 / 2,000 / 10,000 contributing merchants (A: prices from §2.2; buyer counts are our estimates; "low" is 0.4x, "high" is 2x):**

| Contributing merchants | Strips (about 27 a strip) | Active customers (about 54 a merchant) | History | BIAs | CRE | City / agencies | CPG | Lenders / research | **Base total** | Low to high | Per merchant per month |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 400 | 15 | 22,000 | 12 mo | 8 x $3k = $24k | 0 | 0 | 0 | 0 | **$24k** | $10k to $48k | $5 |
| 2,000 | 74 | 110,000 | 24 mo | 30 x $4k = $120k | 6 x $20k = $120k | 2 x $30k = $60k | 4 x $25k = $100k | 2 x $15k = $30k | **$430k** | $172k to $860k | $18 |
| 10,000 | 370 | 540,000 | 36 mo+ | 150 x $5k = $750k | 25 x $30k = $750k | 8 x $50k = $400k | 25 x $40k = $1.0M | 10 x $60k = $600k | **$3.5M** | $1.4M to $7.0M | $29 |

(C, `static_data_revenue()`.) Costs of the data business (A): about $60k a year at 400, $150k at 2,000, $500k at 10,000 (analyst or engineer, privacy officer time, annual audit and legal retainer, 10% sales commission). Contribution is therefore about **-$38k, +$280k and +$3.0M** a year. Note that 10,000 merchants is 370 strips and needs most of Ontario or national coverage; the current plan reaches about 830 active merchants at month 36 (C). The 2,000 and 10,000 rows are a ceiling for planning, not a forecast.

---

## 3. The cost side of "free for most features"

### 3.1 Marginal cost per merchant per month (CAD)

Sources: `docs/finance/model/model.py` assumptions (repo) unless noted; all (A) except pass-through card processing.

| Cost line | $ per merchant per month | Basis |
| --- | --- | --- |
| Hosting, database, API | 0.60 | model.py `infra_per_merchant` |
| Customers' hosting and push (about 54 unique customers at $0.01) | 0.54 | model.py `infra_per_customer` |
| Apple and Google Wallet passes | 0.05 | Issuing and updating passes is free from the platforms; cost is our API calls |
| Push (APNs and FCM) | 0.02 | Platforms free; our workers |
| Storage (photos, files) | 0.02 (service shops with intake photos about 0.10) | About 0.5 GB at roughly US$0.015 a GB-month |
| Email, 1,000 sends | 0.40 | Roughly US$0.0003 a send |
| Support, Free merchant (5 min at $25/hr) | 2.08 | model.py |
| Support, paid merchant (15 min); restaurant (30 min) | 6.25; 12.50 | model.py; `combined_strategy.py` |
| Stripe Connect platform cost | about 2.00 plus about 0.25% of GMV | model.py assumption, **verify Canadian pricing** |
| Join OTP SMS (about 4 new customers a month x 1.5) | 0.13 | $0.022 per segment (Twilio CA plus carrier fees, model.py) |
| **SMS campaigns, 300 a month used** | **6.60** | $0.022 each |
| **WhatsApp marketing, 600 a month used** | **21.00** | About C$0.035 each (founder's brief, unverified) |
| WhatsApp utility (order updates, review requests), 300 a month | 3.60 | About C$0.012 each |
| **Phone ordering assistant, about 250 min a month** | **30.00** | About C$0.12 a minute for telephony, speech and model |
| Card processing | pass-through | Stripe 2.9% plus $0.30, paid by the merchant |

### 3.2 Which features can be free, which cannot

| Feature group (from `plans.ts`) | Marginal cost | Verdict |
| --- | --- | --- |
| Loyalty (points, visits, stamps, items, rewards, welcome, adjust, no-earn), network listing, wallet pass, directory, basic reports, unlimited staff and locations | $1 to 3 (infra plus 5 min support) | **Free, already** |
| Promos, double points, VIP, birthday, referrals, discount cards, advanced reports, CSV import and export, webhooks and API (the Plus "software" features) | +$0 to 1 infra, but support rises to 10 to 15 min ($4 to 6) | **Near-zero and could be free**, but they are the conversion drivers (Pricing v2 assumes 35% conversion because of them, repo `pricing.md`). Moving them to Free needs about +50% sign-ups to pay back (§4.3) |
| Order-ahead, pickup status and slots, in-app payments, appointments | Software near-zero; pickup SMS usage-priced | **Free software, earn on the payment fee** (1.5% on Free orders, 1% on deposits, repo `FEES`) |
| Service tickets, quotes, deposits, invoices, staff permissions | Software near-zero; photos storage; 15 to 30 min support | **Value-priced workflow** ($99 Service). The 1% fee also applies |
| Restaurant pack: tiffin engine, catering, banquet, degh pre-orders, KDS, dietary tags, multilingual menus | Software near-zero; support 30 min ($12.50) and onboarding ($770 cash CAC, repo `combined-strategy.md`) | **Keep paid.** These are the highest-value workflows ($281 a month revenue and 82% contribution margin per restaurant, repo) |
| **SMS** | $0.022 a segment | **Usage-priced or pass-through.** `plans.ts` still includes 500 (Plus) and 1,500 (Service) SMS a month; `unit-economics.md` recommends cutting to 300 and 750 with $0.04 overage and says not yet done (repo) |
| **WhatsApp** | $0.012 to 0.035 a message | **Usage-priced.** The $49 per 1,000 pack leaves about $14 (29%) if cost is $0.035 (A). Reprice once Meta's rate is confirmed |
| **Phone ordering assistant** | about $30 a month at 250 min | **Priced:** $79 gives about 62% margin (A) |
| **Card processing** | 2.9% plus $0.30 | **Pass-through at cost** |

### 3.3 Revenue we keep in every scenario

| Revenue | Where it is set (repo) | Month-36 size in the current plan (C) |
| --- | --- | --- |
| Payment platform fees: 1.5% on Free-plan orders, 0% on paid-plan orders, 1% on deposits, invoices, tiffin and online appointment deposits, optional $0.49 customer fee | `FEES` in `plans.ts`, `computeFees()` | about $31.5k a month |
| Usage and add-ons: WhatsApp packs, phone AI, SMS overage, extra locations, banquet | `ADD_ONS` | about $7.7k a month (restaurants only) |
| BIA campaigns | `CAMPAIGN_PACKAGES` ($1,500 to $3,000) | about $6.8k a month |
| Sponsored placements (hidden until 300 merchants) | `AD_RATE_CARD` | not modelled in the combined plan |
| Subscriptions (what free-for-all would give up) | Plus $39, Service $99, restaurant $99 to $349 | about $43.8k a month |

Note the payment fee is **not** a subscription. A "no paid plans" company still earns it, which is why scenarios b and c keep it.

---

## 4. Finance model

### 4.1 What was run

`docs/finance/model/data_strategy.py` imports the finance team's existing `combined_strategy.py` (same network rows and restaurant rows as the "Combined, Desi first" case in `combined-strategy.md`, which break even in month 7) and changes only what each scenario changes. Existing scripts and outputs are untouched.

**Caveat on the base.** The current plan's absolute results (break-even in month 7; $700k cumulative cash at month 36) inherit the published combined case: 304 signed shops by month 12 through remote sales and restaurants paying from month 1 with 51 paying by month 12. We do not endorse those as forecasts. Use the **differences** between scenarios, and the stress case in §4.4.

| Scenario | What changes |
| --- | --- |
| **a** Current plan | Paid Plus/Service/restaurant packs, add-ons, payment fees, BIA campaigns. No data |
| **a2** Current plan + Insights | a, plus the Insights product launched when contributing merchants reach 400 and 12 months of history exist |
| **b** Free for all + data only | No subscriptions, add-ons or usage fees; we absorb SMS, WhatsApp and phone AI. Orders pay 1.5%, deposits and recurring 1%. +25% shop adoption (A). Insights at the gates |
| **b+** Founder's best case | b with data at **2x** our price curve and **no** consent haircut (everything sellable) |
| **c** Hybrid | Free software for near-zero-cost features; usage sold (WhatsApp packs, phone AI, SMS overage); payments fees; +25% adoption; Insights at the gates. No subscriptions |
| **d** Recommended mix tested | Restaurant and Service packs stay paid; Plus subscription revenue x0.65 as near-zero features go free; +15% adoption; usage and payment fees; Insights at the gates |

Data business assumptions (A): 70% consent coverage; ARR curve through ($25k at 400, $430k at 2,000, $3.5M at 10,000 contributing merchants, log-interpolated, zero below 150); 9-month sales ramp after launch; $5k a month fixed cost from three months before launch; 10% commission; $12k one-time legal and consent build in month 6; $15k one-time de-identification pipeline six months before launch.

### 4.2 Results (60-month run, CAD, model month 1 = Nov 2026; (C))

| | Break-even (stays profitable) | First 3 profitable months | **Peak cash needed** | With $4k/mo founder draw | Cumulative cash m36 | Cumulative cash m60 | Revenue per month m36 / m60 | Insights launch | Insights per month m60 | Data share of revenue m60 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **a** Current plan | **month 7** | 7 | **$42.8k** | $71.1k (BE m10) | $700.5k | $2.378M | $89.8k / $120.2k | n/a | 0 | 0% |
| **a2** a + Insights | month 7 | 7 | $54.8k | $83.1k (BE m10) | $622.6k | $2.287M | $93.8k / $124.3k | month 25 | $4.2k | 3% |
| **b** Free for all + data | **month 29** | 29 | **$146.7k** | $265.8k (BE m33) | **-$115.5k** | $199.5k | $59.6k / $70.9k | month 22 | $5.5k | 8% |
| **b+** Founder best case | month 22 | 22 | $146.2k | $233.1k (BE m24) | $16.5k | $733.5k | $74.9k / $86.1k | month 17 | $20.7k | 24% |
| **c** Hybrid, no subscriptions | month 20 | 20 | $82.4k | $158.8k (BE m26) | $66.1k | $682.3k | $65.6k / $79.3k | month 22 | $5.5k | 7% |
| **d** Packs stay, near-zero features free | month 18 (one-time launch spend in month 17; profitable from month 7 otherwise) | 7 | $56.7k | $86.5k (BE m18) | $561.1k | $2.121M | $94.9k / $123.7k | month 23 | $4.9k | 4% |

Active merchants (network plus restaurants) in the current plan: 197 at month 12, 545 at month 24, 830 at month 36, 844 at month 60 (C).

### 4.3 What would have to be true

- **Data to replace subscriptions and add-ons at month 36:** $618k a year. On our curve that needs about 2,640 contributing merchants. Scenario b has about 690 at month 36 (C).
- **Free-tier adoption uplift needed for d to match a2's cash at month 60:** about +50% more network shops (we assumed +15%). For c: more than 4x. For b: not reached even at 4x (C). Evidence for any uplift is nil today; Pricing v2 assumed a thinner free tier costs 15% of sign-ups (repo `pricing.md`), and that is a guess too.
- **The data business on its own** reaches break-even at about 700 contributing merchants (about 1,000 active), around month 36 in scenario b (C, approximate).

### 4.4 Sensitivity: data revenue is zero for 18 months, or forever

(C, `data_strategy_sensitivity.csv`. "Zero for 18 months" means no data revenue for 18 months after the planned launch, with all data costs still paid. "Zero forever" means costs paid and nothing earned.)

| Scenario | Data as planned: BE · cash needed · cumulative m60 | Zero for 18 months after launch | At 50% | Zero forever |
| --- | --- | --- | --- | --- |
| **a2** | m7 · $54.8k · $2.287M | m7 · $54.8k · $2.218M | m7 · $54.8k · $2.221M | m7 · $54.8k · $2.156M |
| **b** | m29 · $146.7k · $199.5k | **m33 · $161.2k · $116.2k** | m30 · $152.0k · $105.6k | **m33 · $161.2k · $11.7k** |
| **c** | m20 · $82.4k · $682.3k | m20 · $82.4k · $598.9k | m20 · $82.4k · $588.4k | m20 · $82.4k · $494.4k |
| **d** | m18 · $56.7k · $2.121M | m18 · $56.7k · $2.044M | m18 · $56.7k · $2.039M | m18 · $56.7k · $1.956M |

Reading: **the paid scenarios barely notice if data never pays**, because data is 3 to 4% of revenue. **Scenario b is the only one that depends on data, and with zero data revenue it earns about $12k in 60 months.** That is the definition of a bet-the-company dependency on an unproven buyer.

**Stress case:** half the network shops and the slower restaurant adds (`C_combined_half_desi_adds`), (A), (C):

| Scenario | Break-even | First 3 profitable | Peak cash needed | Cumulative cash m60 | Insights launch |
| --- | --- | --- | --- | --- | --- |
| a | month 14 | 10 | $45.5k | $962.7k | n/a |
| a2 | month 14 | 10 | $57.5k | $950.7k | **never** (about 290 contributing at m36; the 400 gate is not met) |
| b | **never in 60 months** | never | **$187.7k** | **-$187.7k** | month 43 |
| b+ | month 37 | 37 | $192.4k | -$102.1k | month 29 |
| c | month 38 | 20 | $82.9k | $53.6k | month 43 |
| d | month 14 | 10 | $59.4k | $854.5k | never |

If the network grows slower than the plan, there is **no data business at all** (the coverage gate is never met) and a free-for-all company never breaks even.

---

## 5. Recommendation

### 5.1 Decision

1. **Do not drop paid plans.** Keep the restaurant pack, Service and Plus as published. Keep payments and usage fees. Do not move more features to Free until pilot strips show a sign-up uplift near +50% (or conversion data shows Plus is not paying).
2. **Build the Main Street Index** as a gated, opt-in, aggregated product, launched when the gates in §2.4 are met (about month 25 on the base case), priced as a benchmark for BIAs, the City and CRE.
3. **Fix the promises now, before the pilot strip opens** (§5.3). That costs about $12k of legal and design work (A) and is required whether or not we ever sell a number.
4. Do **not** pursue AI-training data, row-level panels, or lender scores.

### 5.2 The product

**Main Street Index** (working name), three tiers, all aggregated, all lagged at least 30 days:

| Tier | For | Content | Price (A) |
| --- | --- | --- | --- |
| **Strip Pulse** | One BIA | Monthly visit index, repeat rate, multi-shop rate, ticket-size band, new vs returning, day-part; event lift (already in the BIA campaign report) | $2,400 to $4,800 a year; included free for the BIA's first campaign |
| **City Benchmark** | BIAs, City, agencies | Strip against peer strips and the city series; recovery and seasonality | $15k to $50k a year |
| **Corridor Report** | CRE and landlords | Corridor visit trend, repeat share, coverage statement | $20k to $30k a year per corridor |

Out of scope in v1: baskets, demographics, origin-destination flows, dietary, halal, Jain, festival or language cuts, any pharmacy, any Quebec data.

### 5.3 Exact consent and terms changes

| # | Change | Where | Owner |
| --- | --- | --- | --- |
| 1 | Rewrite the five promises in §1.6 (merchant FAQ, BIA trust block, privacy policy §1, §3, §4) | `en-CA.ts` lines 203, 387, 396; `docs/legal/privacy-policy.md` | Founder plus counsel |
| 2 | Add an "Insights" section to the privacy policy and ToS: buyer categories, thresholds, exclusions, opt-out, permanence of past releases | `docs/legal/` | Counsel |
| 3 | Shopper opt-in: one **unchecked** toggle "Include my visits in anonymous neighbourhood statistics", separate from marketing consent (CASL) and from any app function, with age attestation (18+) and an optional small points bonus that is not a condition of use | Join flow in app and wallet pass; store consent text, version, time, channel like `merchantMembers.marketingConsent*` | Product |
| 4 | **Shopper data-use dashboard**: "Your data" screen showing the toggle, what buyers receive, the last release date, export and delete. Linked from every receipt and wallet pass | App | Product |
| 5 | Merchant Schedule B (processor terms, roles) and opt-in Schedule D (Insights contribution, revenue-share credit, 30-day withdrawal) | `docs/legal/merchant-agreement.md` | Counsel |
| 6 | **Merchant data-use dashboard**: see what the shop contributes, preview its strip's released cells, toggle contribution, see credit earned | Merchant app | Product |
| 7 | Buyer data-sharing agreement: aggregates only; no re-identification, linkage, onward sale, or use for decisions about individuals; MFIPPA clause for public buyers; audit right; deletion at term; breach notice | New template | Counsel |
| 8 | Fix `users.birthday` (day and month only, as promised) or change the promise | Schema or policy | Engineering |
| 9 | Quebec: exclude Quebec postal codes from contribution until a French version, a Law 25 annex, a PIA and a qualified-person anonymization process exist | Policy and pipeline | Counsel |
| 10 | Update `docs/legal/compliance-checklist.md` §2: C-27 died; **C-36 tabled June 15, 2026, not in force** | Docs | Founder |
| 11 | Fix the merchant agreement summary so it matches `plans.ts` (promos, POS, email are Plus) before anyone signs | `merchant-agreement.md` | Counsel |

### 5.4 De-identification pipeline (specification)

All rules are enforced in code with automated tests; a release that fails any rule is not published.

1. **Population:** only shoppers with the Insights opt-in, aged 18+ by attestation, at merchants with Schedule D, excluding pharmacies, Quebec, tiffin and delivery, and anything from phone, WhatsApp, reviews or notes.
2. **Fields allowed:** visit counts, distinct-shopper counts, spend bands and medians, repeat and multi-shop flags, time-of-day bands. **No** identifiers, no free text, no dietary, language or festival flags, no addresses.
3. **Unit of release:** strip (BIA polygon) or city, by category and by month (week only for Strip Pulse after 12 months of data). Geography never finer than the strip or the first three characters of a postal code.
4. **k-anonymity floor:** a cell is published only if it covers **at least 10 distinct shoppers** (the "[10]" in the draft policy) **and at least 5 contributing merchants**, and no merchant is more than 40% of the cell's value (top two not more than 70%).
5. **Small-cell suppression:** cells below the floor are suppressed or merged (adjacent category or period), with complementary suppression so a suppressed cell cannot be recovered by subtraction from totals.
6. **Rounding and noise:** counts rounded to the nearest 5; spend to two significant figures; for any dashboard that buyers can query repeatedly, add calibrated noise (a differential-privacy budget (R) set by the qualified person) and cap queries.
7. **No differencing:** fixed reporting grid, releases lagged at least 30 days, no on-demand custom slices, no rolling windows that overlap by more than a period.
8. **Contract:** buyers receive files or a read-only dashboard, never row-level, never a key that could join to their own data.
9. **Governance:** a named qualified person signs off the method (this is the Quebec regulation's model, W); a **register of releases** (purpose, method, risk assessment date) kept for every release, mirroring the Quebec register even outside Quebec; a re-identification red-team test once a year; PIA completed **before launch**; an annual third-party audit.
10. **Withdrawals:** an opt-out removes the person or shop from all **future** releases within one release cycle. Past published aggregates are not recalled, and the notice says so.

### 5.5 Gates and sequence

| When | Do | Gate to pass |
| --- | --- | --- |
| **Now, before the pilot opens** | Items 1, 2, 5, 8, 10, 11 in §5.3; counsel's written view on aggregation under PIPEDA and on Quebec exclusion | Counsel sign-off in writing |
| **Months 5 to 12** | Collect with the new notice. Build the opt-in toggles and both dashboards. Pre-sell to **3 BIAs** (already the plan, repo) with a Strip Pulse letter of intent | At least 3 BIA letters of intent at $2.4k or more |
| **Contributing merchants at about 300** | Build the pipeline; do the PIA; engage the qualified person | PIA complete; k-anonymity tests green in CI |
| **400 contributing merchants, 12 months of history, 10 strips** | Launch City Benchmark; pitch the City and 3 CRE brokers | At least 1 non-BIA buyer at $15k or more |
| **About 1,000 active merchants** | The data business now covers its cost; consider a CPG pilot once item-level data exists | Positive contribution for 3 months |
| **2,000 or more contributing** | Only now could data be a main line of business (about $430k a year on our curve, section 2.4) | Not before |

### 5.6 What would make us say no

Stop or shelve the data product if any of these happens:

1. **Counsel will not sign in writing** that released cells are not personal information under PIPEDA's serious-possibility test (and, for Quebec data, that the anonymization regulation is met).
2. **Opt-in is too low.** Shopper opt-in below 30% or merchant opt-in below 50% (combined coverage under about 15% instead of 70%): the 400 gate is not reached before month 36.
3. **No one pays.** Fewer than 3 BIA letters of intent by the time we have 300 contributing merchants, or no non-BIA buyer at $15k or more by 400.
4. **Any buyer asks for** row-level, individual-level, sensitive, transcript or training data, or refuses the no-re-identification and no-linkage terms.
5. **Trust damage.** More than 10% of shoppers who see the notice object, or merchant churn or complaints traced to the change.
6. **The plan needs data to cover core burn.** If scenario b-style dependence appears (data above 25% of revenue before 2,000 contributing merchants), we have drifted into the failure case in §4.4.
7. **Law shifts.** C-36 passes with a de-identification or anonymization standard we cannot meet, or the CAI or OPC says commercial resale of anonymized data is not a serious and legitimate purpose.
8. **Anyone proposes using data already collected under the current promises** for a new purpose. The answer is no; cohort-forward only.

---

## 6. Sources

**Legal and regulatory**
- Bill C-36: [DLA Piper, June 17, 2026](https://www.dlapiper.com/insights/publications/2026/06/canada-tables-bill-c36-the-protecting-privacy-and-consumer-data-act) (W); [Gowling](https://gowlingwlg.com/en/insights-resources/articles/2026/ottawa-tables-long-awaited-federal-privacy-reform-legislation) (W); [Mondaq](https://www.mondaq.com/canada/privacy-protection/1806036/bill-c-36-and-the-future-of-canadas-federal-private-sector-privacy-law-what-has-changed-what-it-means-and-what-to-do-now) (W); [IAPP on 2026 reform](https://iapp.org/news/a/what-2026-may-bring-for-canadas-privacy-reform-efforts) (W)
- Quebec anonymization regulation: [McCarthy](https://www.mccarthy.ca/en/insights/blogs/techlex/quebec-adopts-regulation-anonymization-personal-information), [Miller Thomson](https://www.millerthomson.com/en/insights/cybersecurity/government-quebec-regulation-anonymization-personal-information/), [Lavery](https://www.lavery.ca/en/publications/our-publications/5424-data-anonymization-not-as-simple-as-it-seems.html) (W)
- OPC joint findings on OpenAI, May 6, 2026: [OPC backgrounder](https://www.priv.gc.ca/en/opc-news/news-and-announcements/2026/bg-info_openai_260506/), [IAPP](https://iapp.org/news/a/probe-finds-chatgpts-model-training-violated-canada-s-federal-provincial-privacy-laws) (W)
- FTC location-data orders: [EFF on X-Mode](https://www.eff.org/deeplinks/2024/01/ftc-bars-x-mode-selling-sensitive-location-data), [WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20240209-recent-enforcement-actions-signal-ftc-focus-on-protecting-location-data) (W)
- (R, not opened this session) [PIPEDA](https://laws-lois.justice.gc.ca/eng/acts/p-8.6/); [OPC consent guidelines](https://www.priv.gc.ca/en/privacy-topics/collecting-personal-information/consent/gl_omc_201805/); [Quebec Private Sector Act](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1); [Competition Act](https://laws-lois.justice.gc.ca/eng/acts/c-34/); Gordon v. Canada (Health), 2008 FC 258; MFIPPA status of Toronto BIAs

**Market**
- Placer.ai: [DevX](https://www.devx.com/news/placer-ai-raises-75m-boosts-valuation-to-1-5b/), [Calcalist](https://www.calcalistech.com/ctech/articles/0,7340,L-3927078,00.html), [PricingSaaS](https://pricingsaas.com/companies/placer), [BID pricing blog](https://isaackremer.com/placer-discover-2024-bringing-data-to-where-we-cannot-go/) (W?)
- [Advan and SafeGraph Patterns](https://advanresearch.com/insights/advan-acquires-safegraphs-patterns-business-expanding-leadership-in-location-intelligence-and-foot-traffic-analytics) (W)
- [Bloomberg and Second Measure](https://www.bloomberg.com/company/press/second-measure) (W)
- Numerator: [Kantar deal](https://www.kantar.com/press-center/kantar-enters-definitive-agreement-to-acquire-numerator), [200k US panel](https://www.globenewswire.com/news-release/2025/04/10/3059280/0/en/NUMERATOR-LAUNCHES-200-000-U-S-HOUSEHOLD-STATIC-PANEL-SETTING-NEW-STANDARD-FOR-DATA-QUALITY.html), [Canadian panel](https://hk.finance.yahoo.com/news/numerator-expands-canadian-consumer-purchase-130000916.html) (W)
- Moneris and Signal49: [Moneris Data Services](https://dataservices.moneris.com/en/about), [Signal49 index](https://www.signal49.ca/focus-areas/canadian-economics/index-of-consumer-spending/) (W); [The Logic on Finance Canada](https://thelogic.co/?p=128740) (W?)
- AI data deals: [Monda compilation](https://www.monda.ai/blog/ultimate-list-of-data-licensing-deals-for-ai) (W?)
- **Not verified (U):** Earnest Analytics pricing, Statistics Canada partnerships, Square market data, Yelp and OpenTable data pricing, any CPG or lender purchase of independent-store data, any Toronto BIA's Placer.ai contract.

**Repository**
`docs/business/prd.md`, `combined-strategy.md`, `pricing.md`, `network-monetization.md`; `packages/shared/src/plans.ts`; `docs/finance/unit-economics.md`, `launch-plan-economics.md`, `model/model.py`, `model/combined_strategy.py`; `docs/legal/*`; `docs/research/landing-and-network.md`; `apps/web/src/copy/en-CA.ts`; `apps/web/src/lib/legal.ts`; `packages/db/src/schema.ts`.

**Reproduce the tables:** `python3 -I docs/finance/model/data_strategy.py`
