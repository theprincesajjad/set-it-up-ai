# Solo-pro landing pages

Pages: `/for-nail-techs` (with `?trade=brows|lashes|makeup`), `/for-barbers`, `/for-groomers`. Code: `apps/web/src/app/(marketing)/for-*/`, blocks in `apps/web/src/components/marketing/` (`SoloLanding` composes them). Strategy and metrics: `docs/business/solo-pro-launch.md` §5.3 and §5.4. Ads: `docs/marketing/ads/`.

## The eight blocks

| # | Block | Component | Notes |
| --- | --- | --- | --- |
| 1 | Hero | `SoloHero` | The hook, one phone mock in the Clear theme in the trade colour on a flat sand stage, two 3D objects, "Start free" scrolling to the inline form. `?trade=` swaps the hero copy and the sample services (nail page). |
| 2 | Three jobs | `JobsRow` | Book, deposit, remind (nail); line, family, payouts (barber); vaccines, rebook, prices by size (groomer). |
| 3 | Your regulars | `RegularsBand` | Stamps, promos to regulars, the shared pass, and the "Powered by" line as a client sees it. |
| 4 | Privacy | `PrivacyBand` | Nail page only. Area pin, address after booking. No licensing or inspection content. |
| 5 | Plans | `PlanStrip` | Free, monthly and annual with the site, all prices from `PLANS`. "Prices in CAD. No per-chair charge. No cut of your clients." |
| 6 | Comparison | `CompetitorTableSolo` | Fresha, Booksy, Square Appointments; data in `lib/marketing/competitors-solo.ts`. Every cell shows the date read and a currency or source note. Barber page adds a four-chair row. |
| 7 | The site | `PresetsBand` | Three presets with a sample pro's data. Preset names are placeholders until the site builder (G) lands. |
| 8 | FAQ and sign-up | `Faq`, `SoloSignup` | The inline wizard starts with the page's `vertical` picked; `src` is kept in the `ll_src` cookie for 30 days. |

Hero, section headings and the plan and comparison labels are `mkt.solo.*` keys (four languages). Job, regulars, privacy and FAQ bodies live in `copy.solo` in `apps/web/src/copy/en-CA.ts` (English), like the restaurant page.

## The client loop

`components/pass/PoweredBy.tsx`: "Powered by Local Loyalty · Are you a nail tech or a barber? Get your own booking link, free". It links to `/for-nail-techs?src=client`, `/for-barbers?src=client` or `/for-groomers?src=client` by the shop's trade, and is hidden on paid plans (it takes a `plan` prop; the public shop response does not carry the plan yet, so it shows for everyone until it does). Placed under the booking flow (which includes the confirmation step), on the manage-appointment page, and at the foot of the shop page and pass for booking trades.

## Metrics (from §5.4)

| Metric | Target by week 8 | Kill or change if |
| --- | --- | --- |
| Cost per free signup from ads | $60 or less | Above $90 for four weeks: stop the campaign, keep the page for organic |
| Signup to booking link live | 70% or more | Under 50%: fix onboarding first |
| Activation: first booking by someone else within 14 days | 40% or more | Under 25%: the share step is failing |
| Share of signups from the client loop and organic | 50% or more by week 8 | Under 30%: the loop line is not visible enough |
| Free to paid within 90 days | 6% or more | Under 3%: test the founding annual price at signup |

How to read them: `src` on a signup says which page it came from (`nail-techs`, `barbers`, `groomers`, `client` for the loop). The loop share is signups with `src=client` over all signups.

## Checks before a campaign

- Re-read the three competitor pages and update `competitors-solo.ts` (dates older than 90 days fail the unit test).
- Run `e2e/marketing-solo.spec.ts`.
- Lighthouse performance 90 or more at 390 px on a production build.
