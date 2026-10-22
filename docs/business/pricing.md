# Pricing (v2)

Oct 22, 2026 · Founder decision · Prices in CAD

**What changed:** only the loyalty program and the reports on it are free. Every other feature moves to Plus or Pro, and paid features roll out later as the network grows. This replaces the earlier "every loyalty feature, promos and integrations free" split.

The source of truth is `packages/shared/src/plans.ts` (`FEATURES`, `FREE_FOREVER`). The server enforces it with `requireFeature`. The financial effect is in `docs/finance/unit-economics.md` §0.

## Free, forever ($0, no transaction fee)

| Feature | Why it is free |
| --- | --- |
| Points per dollar, per visit, stamp cards, points per item | This is the loyalty program |
| Rewards catalog, welcome bonus, manual adjustments | Same |
| No-earn categories (prescriptions, alcohol, tobacco, lottery, gift cards) | Compliance: it has to be on for everyone |
| Network listing (map and feed) | Shops must be findable or there is no network |
| Apple / Google Wallet pass | How customers join without downloading an app |
| Customer directory | You need to see your members to run a program |
| Basic reports (visits, members, rewards, redemptions, activation) | Reporting on the free program |
| Unlimited staff, unlimited locations, unlimited members | Kept free per the founder's earlier instruction. **Open question**: staff and locations may be revisited |

The invariant still holds: a free-forever feature can never be gated. Admins can't hide it, and a test fails if it moves to a paid plan. Before launch we moved the features listed below once. After launch, what is free stays free.

## Plus: $39/mo ($390/yr), 500 SMS/mo included

- **Promos:** offers, double-points days, bonus points on items, nearby push promos.
- **Loyalty extras:** VIP levels, birthday reward, referrals, digital discount cards.
- **Marketing:** email and push campaigns, SMS campaigns, automations (win-back, reward-ready).
- **Data:** CSV export, CSV import and migration from another app.
- **Integrations:** POS auto-award (Square, Clover, Shopify, Lightspeed, Toast), Mailchimp, outgoing webhooks, Zapier/Make and the merchant REST API.
- **Reports:** advanced reports (retention cohorts, network overlap, promo results).
- **Commerce:** order-ahead, pickup status, pickup slots, in-app payments (Stripe fee + 0.75% platform fee).

## Pro: $79/mo ($790/yr), 1,500 SMS/mo included

Everything in Plus, plus:

- Service tickets
- Quote approval
- Deposits
- Invoices
- Drop-off scheduling
- Staff permissions

## Not plan features

- **Network perks** ("visit 3 shops on the strip" bonuses) are a platform/BIA lever. Admins configure them, the network funds them, and they run for every shop whatever its plan.
- **Phase 3:** sponsored listings, sponsored promos, map pins and BIA neighbourhood campaigns are paid per campaign. Unchanged.

## Rollout

Every paid feature ships **hidden**. An admin moves it hidden → beta → GA once the network gate is met: `unlockAtMerchants` is 100 active merchants for Plus features and 40 for Pro features. Until then:

- **Pilot shops** get paid features through admin per-merchant overrides (Admin → Rollout → Overrides). The demo seed does this for Pinecone Coffee, Hearth & Crumb and Village Apothecary.
- **Existing data stays** when a shop doesn't have a feature: promos, VIP levels, discount cards, webhooks and POS connections are kept but stop applying. Customers don't see that shop's promos or discount cards. VIP multipliers and promo boosts don't apply to earn. POS events are logged as "paused" and webhooks stop sending. Merchants can still read and delete their data.

## Why

1. **Free has to win the counter, not give away the business.** A complete loyalty program with no fee and unlimited rewards and locations is still more generous than SoPoints Free (5% fee, 1 location, no active rewards) and Starter (US$49, 2.5% fee).
2. **The features that drive conversion were free.** Promos, email/SMS and POS auto-award are what merchants upgrade for. With them on Free, the model's blended 12-month conversion was 20%. Pricing v2 assumes 35% (bear 20%, bull 45%), and that is the main thing to validate on pilot shops.
3. **Free gets cheaper to serve.** No email, SMS or POS sync on Free: $3.87 per free merchant per month instead of $4.62.
4. **The cost is adoption.** A thinner free tier may sign fewer shops. The model takes 15% fewer sign-ups, which delays the paid unlock by about 2 months and weakens network density on each strip.

Base-case result: break-even moves from month 60 to **month 51**. Cash needed to reach break-even falls from $420,715 to **$357,308**. LTV/CAC rises from 2.6x to **3.6x**. The figures and risks are in `docs/finance/unit-economics.md` §0.
