# Solo-pro landing pages

Pages: `/for-nail-techs` (with `?trade=brows|lashes|makeup`), `/for-barbers`, `/for-groomers`. Code: `apps/web/src/app/(landing)/for-*/`, blocks in `apps/web/src/components/marketing/solo/` (`SoloLanding` composes them). Strategy and metrics: `docs/business/solo-pro-launch.md` §5.3 and §5.4. Ads: `docs/marketing/ads/`.

## The nine blocks (landing v3, product-led and few words; Oct 29, 2026)

Founder direction, Oct 29: "Too many words. Think like a SaaS owner wowing side hustlers: promos, booking in one place, how your week's been against last week." Word budget on every block: headlines 2 to 6 words, a subhead of one line (12 words at most), card and feature lines of 8 words at most, no paragraphs (the FAQ and legal pages excepted). The product visuals do the explaining. `test/marketing-solo.test.tsx` enforces the budget on the copy.

Code: `apps/web/src/app/(landing)/` (its own layout: the glass nav, no client header or sales chat), the composer `components/marketing/SoloLanding.tsx`, the blocks in `components/marketing/solo/`, the styles in `components/marketing/solo/solo.css` (Clear tokens only), the view model in `lib/marketing/solo-view.ts`. Copy: `copy.solo` in `apps/web/src/copy/en-CA.ts` (English only).

| # | Block | Component | Notes |
| --- | --- | --- | --- |
| 1 | Hero | `solo/Hero.tsx` | The hook (two lines, the second in the trade colour), a one-line lede, one black button (`data-cta="hero"`) and the price as a plain link. A big phone runs the client's booking flow in CSS (pick, time, details, booked); deposits are optional and the default story has none. Beside it: the work photo, the DM, the new booking and the reminder, none ever over the phone's screen. |
| 2 | Facts | `Facts` | One strip: $0 to start, 0% cut, 2 reminders, 3 min (barbers: 1 price for every chair). |
| 3 | Your week | `Week` | The wow block: a sample owner dashboard. This week against last week (+23%), four numbers that count up in CSS (bookings, visits, regulars back, rewards given), seven bars that grow with the best day in the trade colour, and the next two clients. Mirrors the real Today screen (counts and "vs last" chips) and Reports (this period against the previous one); labelled as sample numbers. |
| 4 | Every booking, one calendar | `Bookings` | The week filling from three doors, colour-coded: the link, an Instagram DM, added by the owner. Under it the DM that becomes a booking ("Create booking", then "Booked · Sat 11:30 am"). |
| 5 | A promo in one tap | `Promos` | Three steps: pick a seasonal template (Valentine's nails, back-to-school cuts), send to the regulars who opted in (112), +9 bookings by morning. The allowance line reads `PROMOS_PER_MONTH_PLUS`. |
| 6 | They come back | `Regulars` | The stamp card over a photo of the work, and who came back this month. |
| 7 | The boring part, done | `Jobs` | The variant's three job cards (order per variant), compact: a 2 to 6 word title, one line of 8 words, a live demo. |
| 8 | Price | `PriceBlock` | Free, Pro monthly, Pro yearly, one line each, from `PLANS`. The footnote links to the comparison on `/pricing#booking-apps`. |
| 9 | Start | `solo/Start.tsx` | Name, trade (native radios) and email or mobile: a GET form to `/signup` (`data-cta="start"` on the button), which `signupPrefill` turns into the wizard's starting values. |

Motion is CSS only (opacity, transform and a registered `--sl-count` integer for the count-up), scroll-driven where the browser has `animation-timeline: view()`, and off under reduced motion, where every demo shows its finished frame. Sections below the fold use `content-visibility: auto`, so the browser skips their style and layout work until they are near the viewport.

**A/B variants.** `LANDING_VARIANTS` in `copy/en-CA.ts` holds, per look (nails, brows, lashes, makeup, barber, groom) and variant id, the eyebrow, the headline, the subhead, the button label and the order of the three job cards; "control" is the default. Types and the resolver: `lib/marketing/landing-variants.ts`. `<SoloLanding variant="…">` renders a variant; the page root carries `data-variant`. Assignment and tracking: the proxy rewrites a counted visitor to the prerendered `[variant]` route, which renders `<SoloLanding variant>` and then `<LandingMeasure>` (the inline beacon; `docs/engineering/api/experiments.md`). Preview a variant with `?v=yours`. The beacon counts clicks on the elements with `data-cta` (hero, nav, start). Which variants exist, the copy per trade and the test order: `docs/marketing/value-props.md`.

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
