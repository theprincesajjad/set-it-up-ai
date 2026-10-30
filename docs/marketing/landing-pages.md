# Solo-pro landing pages

Pages: `/for-nail-techs` (with `?trade=brows|lashes|makeup`), `/for-barbers`, `/for-groomers`. Code: `apps/web/src/app/(landing)/for-*/`, blocks in `apps/web/src/components/marketing/solo/` (`SoloLanding` composes them). Strategy and metrics: `docs/business/solo-pro-launch.md` §5.3 and §5.4. Ads: `docs/marketing/ads/`.

## The blocks (landing v4, professional voice; Oct 29, 2026)

Founder direction, Oct 29: no pill eyebrows above headings (type does the hierarchy), a confident professional SaaS voice (no slang, no jokes), more calls to action, and the paid packaging (Free, Pro for one person, Studio for teams, a 14-day Pro trial, Pro's first-year price on annual) described from one place. Word budget: headlines of 2 to 7 words, one-line subheads, card lines of 8 words at most. `test/marketing-solo.test.tsx` enforces it, the CTA names and the absence of slang.

**Prices on the page (phase "pro value", Oct 29):** the price block and the hero line read Free, Pro (`PLANS.plus`, with the trial from `TRIAL_DAYS` and the struck-through first-year price from `FIRST_YEAR_PRICE`) and Studio (`PLANS.studio`); Service and the restaurant plans are on `/pricing` only. The Regulars block and the Pro section say which half is paid: seeing who is due and who asked is free, the waitlist offers, automatic rebooking, review requests and the weekly report are Pro. No number is typed on a page.

**One source for the plans:** `apps/web/src/lib/marketing/plan-copy.ts` (`PLAN_COPY` words, `PLAN_MARKETING` trial and first-year numbers, list prices from `PLANS`). The plan cards, the hero price line, the trial buttons, the "with Pro" promo line and the Pro section all read it; the home page uses the same module.

| # | Block | Component | Notes |
| --- | --- | --- | --- |
| 1 | Hero | `solo/Hero.tsx` | Two-line headline, a one-line subhead, the primary button (`data-cta="hero"`), "See how it works" (`how`), the price and trial line linking to the plans, the trust row and the audience line as plain text. The phone is the shared iPhone frame (`components/marketing/device/IPhone.tsx`). |
| 2 | Facts | `Facts` | Four numbers and a button (`afterhero`). |
| 3 | Your week | `Week` | The owner dashboard demo, then a button and "See pricing" (`week`, `seepricing`). |
| 4 | Every booking in one calendar | `Bookings` | |
| 5 | Promos | `Promos` | Then a button row (`promos`). |
| 6 | Regulars | `Regulars` | |
| 7 | Built for how you work | `Jobs` | The variant's three tool cards. |
| 8 | Pro features | `ProFeatures` | Waitlist, rebooking, reviews, weekly report, each with an illustrative sample (captioned as such), the trial button (`pro`). |
| 9 | Call-to-action band | `CtaBand` | The trial as the button (`prepricing`). |
| 10 | Pricing | `PriceBlock` | Free, Pro (with the struck annual price and the first-year price), Studio (`plans`). |
| 11 | Start | `solo/Start.tsx` | Name, trade, email or mobile (`start`). |
| — | Sticky bar, phones | `StickyCta` | Primary button and "See pricing" (`sticky`, `seepricing`), hidden over the hero and at the form where the browser has scroll-driven animation. |

`data-cta` values are lower-case letters, 10 at most: the API keeps nothing else.

Motion is CSS only (opacity, transform and a registered `--sl-count` integer for the count-up), scroll-driven where the browser has `animation-timeline: view()`, and off under reduced motion, where every demo shows its finished frame. Sections below the fold use `content-visibility: auto`, so the browser skips their style and layout work until they are near the viewport.

**A/B variants.** `LANDING_VARIANTS` in `copy/en-CA.ts` holds, per look (nails, brows, lashes, makeup, barber, groom) and variant id, the eyebrow, the headline, the subhead, the button label and the order of the three job cards; "control" is the default. Types and the resolver: `lib/marketing/landing-variants.ts`. `<SoloLanding variant="…">` renders a variant; the page root carries `data-variant`. Assignment and tracking: the proxy rewrites a counted visitor to the prerendered `[variant]` route, which renders `<SoloLanding variant>` and then `<LandingMeasure>` (the inline beacon; `docs/engineering/api/experiments.md`). Preview a variant with `?v=yours`. The beacon counts clicks on every element with `data-cta` (the CTA names above). Which variants exist, the copy per trade and the test order: `docs/marketing/value-props.md`.

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
| Free to paid within 90 days | 6% or more | Under 3%: test the first-year annual price at signup |

How to read them: `src` on a signup says which page it came from (`nail-techs`, `barbers`, `groomers`, `client` for the loop). The loop share is signups with `src=client` over all signups. `variant` on the same milestone says which copy the signup saw.

## Checks before a campaign

- Re-read the three competitor pages and update `competitors-solo.ts` (dates older than 90 days fail the unit test).
- Run `e2e/marketing-solo.spec.ts`.
- Lighthouse performance 90 or more at 390 px on a production build (targets: LCP under 1.8 s, TBT under 200 ms, CLS under 0.05).
