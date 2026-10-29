# Solo-pro landing pages

Pages: `/for-nail-techs` (with `?trade=brows|lashes|makeup`), `/for-barbers`, `/for-groomers`. Code: `apps/web/src/app/(landing)/for-*/`, blocks in `apps/web/src/components/marketing/solo/` (`SoloLanding` composes them). Strategy and metrics: `docs/business/solo-pro-launch.md` §5.3 and §5.4. Ads: `docs/marketing/ads/`.

## The seven blocks (landing v2, direction B, product-led; Oct 29, 2026)

Code: `apps/web/src/app/(landing)/` (its own layout: the glass nav, no client header or sales chat), the composer `components/marketing/SoloLanding.tsx`, the blocks in `components/marketing/solo/`, the styles in `components/marketing/solo/solo.css` (Clear tokens only), the view model in `lib/marketing/solo-view.ts`. Copy: `copy.solo` in `apps/web/src/copy/en-CA.ts` (English only).

| # | Block | Component | Notes |
| --- | --- | --- | --- |
| 1 | Hero | `solo/Hero.tsx` | The hook, the subhead, one black button and the price as a plain link to the price block. A big phone runs the client's booking flow in CSS (pick, time, details, booked); deposits are optional and the default story has none. Beside it: the work photo (where the mock had a decorative disc), the DM, the new booking and the reminder, none ever over the phone's screen. |
| 2 | Facts | `Facts` | $0 to start, 0% cut, 2 reminders, 3 minutes (barbers: one price for the shop). |
| 3 | Three jobs | `Jobs` | Clients book themselves (a week filling), reminders send themselves (lock-screen notifications), regulars come back (who came back this month). Order per variant. |
| 4 | The DM moment | `DmToBooking` | The inbox next to the prefilled new booking ("Create booking from message"). |
| 5 | Regulars | `Regulars` | The stamp card over a photo of the work, and the promo composer. |
| 6 | Price | `PriceBlock` | Free, Pro monthly, Pro yearly, from `PLANS`. Deposits are "optional, if you want them". The footnote links to the full comparison on `/pricing#booking-apps` (`CompetitorTableSolo` moved there). |
| 7 | Start | `solo/Start.tsx` | Name, trade (native radios) and email or mobile: a GET form to `/signup`, which `signupPrefill` turns into the wizard's starting values (`?shop`, `?trade`, `?contact`). The twelve-field wizard lives on `/signup` only. |

**A/B variants.** `LANDING_VARIANTS` in `copy/en-CA.ts` holds, per look (nails, brows, lashes, makeup, barber, groom) and variant id, the eyebrow, the headline, the subhead, the button label and the order of the three job cards; "control" is the default. Types and the resolver: `lib/marketing/landing-variants.ts`. `<SoloLanding variant="…">` renders a variant; the page root carries `data-variant`. Assignment and tracking are not built yet: the spec is `scratchpad/landing-v2/ab-spec.md` (assignment by middleware rewrite to a prerendered variant path, `?v=` and the `ll_v` cookie, five first-party events by `sendBeacon`, the variant carried into the `signed_up` milestone beside `src`, and `/admin/experiments`). Which variants exist, the copy per trade and the test order: `docs/marketing/value-props.md`.

**Rendering.** All six looks are prerendered: `/for-nail-techs?trade=brows|lashes|makeup` is rewritten (next.config.ts, `beforeFiles`) to the static `/for-nail-techs/[trade]`. The only script of the page's own is the start form's source field (`?src=`, else the page's source, into the form and the `ll_src` cookie). Motion is CSS only and stops under reduced motion. Photos: `public/marketing/`, AVIF with WebP fallback, licences in `docs/marketing/photo-credits.md`.

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

How to read them: `src` on a signup says which page it came from (`nail-techs`, `barbers`, `groomers`, `client` for the loop). The loop share is signups with `src=client` over all signups. `variant` on the same milestone says which copy the signup saw.

## Checks before a campaign

- Re-read the three competitor pages and update `competitors-solo.ts` (dates older than 90 days fail the unit test).
- Run `e2e/marketing-solo.spec.ts`.
- Lighthouse performance 90 or more at 390 px on a production build (targets: LCP under 1.8 s, TBT under 200 ms, CLS under 0.05).
