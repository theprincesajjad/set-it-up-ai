# Network monetization: sponsored placements and BIA campaigns

Owner: Network Monetization · Status: built, hidden (Phase 3) · Engineering: `docs/engineering/api/ads.md`, `docs/engineering/api/campaigns.md`

The business is the network. Loyalty (and reporting on it) stays free forever; everything else is paid since Pricing v2 ([pricing.md](pricing.md)); once a strip has enough shops and customers on one app, we
sell attention on that network to the shops on it (sponsored placements) and to the BIA that represents them
(neighbourhood campaigns). Both only work if customers trust the app, so every rule below is biased toward
"never feels spammy" over short-term revenue.

## 1. Rollout gates

All four feature keys ship `hidden`. An admin flips them (`hidden → beta → ga`) when the gates are met.
Nothing is sold, shown or billed before that; merchant endpoints return `402 feature_locked`.

| Feature key | Network gate (`unlockAtMerchants` in plans.ts) | Per-neighbourhood gate (ops check before selling on a strip) |
| --- | --- | --- |
| `campaigns.neighbourhood` | 100 active merchants (finance recommends 0, gated per strip only) | Strip live ≥ 6 months, ≥ 20 active merchants, ≥ 1,500 active customers, ≥ 25% multi-shop customers |
| `ads.sponsored_listing`, `ads.sponsored_promo`, `ads.map_pin` | 300 active merchants | ≥ 20,000 app sessions/month on the strip, ≥ 30% multi-shop customers, ≥ 25 active merchants |

Source: `docs/finance/unit-economics.md` §4. Move `beta → ga` after 30 days of beta with organic engagement (feed opens
per user) not down vs. the prior 30 days and a sponsored-push opt-out rate under 2%.

The per-neighbourhood gates are an ops check today (admins approve every campaign in the review queue). Finance proposes
an optional `unlockPerNeighbourhood` on `FeatureDef`; when it lands, `selectSponsored` and campaign creation should
enforce it.

Platform admins can run pilot BIA campaigns while `campaigns.neighbourhood` is hidden; pilot shops still need a
per-merchant feature override to opt in themselves (or the admin adds them).

## 2. Sponsored placements

| Placement | Where it shows | Feature | Daily flat | CPM | Inventory |
| --- | --- | --- | --- | --- | --- |
| `feed_top` | Neighbourhood feed (interleaved) | sponsored_listing | $5/day per strip | $12 | 1 per 5 organic |
| `search_top` | Search results (interleaved) | sponsored_listing | $5/day per strip | $12 | 1 per 5 organic |
| `map_pin` | Highlighted pin on the network map | map_pin | $2.50/day | (daily only) | **max 3 live per neighbourhood** |
| `promo_boost` | Boosts an existing network promo in the feed | sponsored_promo | (CPM only) | $15, $25 minimum | 1 per 5 organic |
| `nearby_push` | Push to the shop's own consenting members nearby | sponsored_promo | (CPM only) | $25 per 1,000 = "$25 per boost" | 1 sponsored push per customer per 7 days |

Prices follow `docs/finance/unit-economics.md` §6. Source of truth in code: `AD_RATE_CARD` / `AD_RULES` in
`packages/shared/src/api/ads.ts`. All CAD, pre-tax. Finance's reality check applies: impression inventory is small at
Toronto scale, so reps lead with map pins and push boosts (priced per merchant), not CPM.

### Pricing logic: flat rate now, auction later

- **Today: fixed rate card.** Merchants pick *daily flat* (a day's slot, budget = rate × flight days, accrued once per
  flight day that begins while the campaign is active; paused days aren't billed) or *CPM* (billed per counted impression,
  minimum budget $25, the campaign ends the moment the budget is spent). The server sets the rate; merchants can't bid.
- **Why no auction yet:** a strip has tens of advertisers at most. An auction with thin demand produces volatile prices
  and confuses owners. A rate card is also easy for reps to sell on the counter.
- **When demand exceeds inventory** (eligible campaigns regularly exceed slots on a strip for 2+ weeks), switch the CPM
  model to a second-price auction with the rate card as the reserve price, ranked by `bid × relevance`. Daily flat stays
  as a "guaranteed" product capped at 1 advertiser per placement per strip per day.

### Serving rules

1. **Labelled.** Every sponsored item carries `sponsored: true` and `label: "Sponsored"`; clients must render it.
2. **Ratio.** Never more than 1 sponsored item per 5 organic items. The first sponsored item is at position 2, the
   next after 5 more organic items. Lists with fewer than 5 organic items get no ads.
3. **Relevance by distance.** An ad serves only if it targets the viewer's neighbourhood (explicit, from their location,
   or their home neighbourhood) or the viewer is inside its radius of one of the advertiser's locations. Closer shops rank
   first. No location signal = no ad.
4. **Frequency cap.** Max 3 impressions per customer per campaign per rolling 24 hours. Impressions past the cap aren't
   counted or billed.
5. **Muted shops.** A customer who muted a shop never sees its ads.
6. **Even pacing.** CPM campaigns may only have spent `budget × (elapsed share of flight + 1 hour)` at any moment, so
   budget spreads across the flight instead of burning in the first morning.
7. **Diversity.** One campaign per advertiser per response.
8. **Scarce pins.** An admin can't approve a 4th featured map pin overlapping the same dates in a neighbourhood.
9. **Boosted promos** stop serving when the promo ends.
10. **Nearby push** (CASL): only to the advertiser's own members with marketing consent for that shop who haven't muted
   it; at most one push per customer per campaign, ever, and one sponsored push per customer per 7 days across all
   campaigns. The push names the shop, says "Sponsored", and tells the customer how to stop them.

### Review

Every campaign starts `pending_review`. An admin approves it or rejects it with a reason the merchant sees.
Review checklist: honest claims, no no-earn-category products (prescriptions, alcohol, tobacco, lottery, gift cards),
image legible on a phone, the advertiser is an active shop in good standing. Rejected paid campaigns are refunded in full.

### Payment

Ad spend is paid by the merchant to us. The current payments provider only supports destination charges into a
merchant's own Stripe account (for their customers' orders), so ad spend is invoiced: campaigns are created with
`paymentStatus: "pending"` and an admin marks them `paid` or `invoiced`. Approval doesn't wait for payment, so reps can
close on the counter. When the payments team adds a platform charge (card on file or one-off checkout), creation will
collect payment up front for CPM and the first week for daily flat.

### Attribution

- **Method:** last touch, click beats impression, 7-day window. A visit (any recorded loyalty visit) by customer U at
  shop M is attributed to M's campaign that U clicked most recently in the previous 7 days, else the one U saw most
  recently.
- **No double counting:** each ad interaction can earn at most one attributed visit. A regular who saw one ad and comes
  in every morning counts once, not seven times.
- **Report:** impressions, clicks, CTR, attributed visits, spend, cost per attributed visit, unique customers reached,
  and a daily series. Aggregates only.
- **Honest caveat for sales:** attributed visits include customers who would have come anyway. Reps quote cost per
  attributed visit, not "new customers".

## 3. BIA neighbourhood campaigns

A street-wide event run through the app, sold to the BIA (one invoice instead of 40 owner conversations).
Bonus points are funded by the network (`network_issued` ledger account), so shops never pay for the points they hand out.
We price the campaign so the bonus liability is covered by the fee.

| Package | Kind | Mechanic | Default length | Default goal | Price |
| --- | --- | --- | --- | --- | --- |
| **Bronze: points weekend** | `points_weekend` | Street-wide multiplier (e.g. double points) at every participating shop, optional per-shop bonus | 3 days | 3 shops | $1,500 |
| **Silver: passport week** | `passport` | Visit 5 different participating shops → entered in a prize draw (basket donated by shops); optional per-shop bonus | 7 days | 5 shops | $2,250 |
| **Gold: street multiplier** | `multiplier` | Two-week multiplier event (e.g. triple points) | 14 days | 5 shops | $3,000 |

Prices follow `docs/finance/unit-economics.md` §6 (sell as a spring + holiday pair at 10% off; that discount is applied
by an admin setting `priceCents`). Source of truth in code: `CAMPAIGN_PACKAGES` in `packages/shared/src/api/campaigns.ts`.
BIA managers always get the package price; only admins set custom prices.

### Rules

- **Participation:** the BIA (or our admin) adds shops on the strip; owners/managers can also opt in themselves and can
  leave until the campaign starts. Shops must be in the campaign's neighbourhood.
- **Progress:** distinct participating shops visited during the window. Repeat visits to the same shop don't advance it.
- **Bonus:** per-shop bonus is awarded once per customer per shop per campaign; multiplier extra is
  `base points × (multiplier − 1)` on every visit, after the shop's own promos. Both idempotent.
- **No-earn categories never earn** (the multiplier applies to earned points only).
- **Completion:** reaching the goal enters the customer in the prize draw.
- **Prize draw:** run as a skill-testing contest (Canadian contest law): the winner must answer a skill-testing
  question before the prize is released; we administer that offline. After the campaign ends, an admin draws a uniformly random completed participant. The API returns only
  first name and masked phone; we contact the winner, the BIA never gets the customer list.
- **Payment:** BIA managers can't schedule a campaign until it's paid (admins can run unpaid pilots).

### The BIA report ("proof that street events drive visits")

Visits during the campaign vs. the same-length window immediately before it, at the same participating shops; unique
customers; new members; per-shop breakdown; participants and completions; bonus points issued. Aggregates only: no names,
phones or customer IDs leave the platform. This report is the renewal pitch for the next campaign.

Finance's Silver package also mentions lift "versus the prior 4 weeks"; the report uses a same-length baseline (a 7-day
campaign vs. the 7 days before it) so weekday mix matches. A 4-week weekly average is a candidate addition.

## 4. Roles

- **Platform admin:** everything, all neighbourhoods.
- **BIA manager:** assigned per neighbourhood (`neighbourhood_managers`); can run campaigns and read reports for that
  neighbourhood only.
- **Merchant owner/manager:** buys ads for their shop; opts in/out of campaigns.
