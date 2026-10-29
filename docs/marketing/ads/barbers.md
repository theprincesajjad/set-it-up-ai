# Ads: barbershops and threading bars

Landing page: `/for-barbers`. Strategy: `docs/business/solo-pro-launch.md` §5.2. Voice: "If you're a barber, manage all your stuff in one place." Plain, short, no jargon. **Oct 29:** the plan is Pro; deposits are optional and never a hook; concepts name the landing variant they pair with (`?v=`, `docs/marketing/value-props.md` §2.2).

**Audience.** Owners and chair renters at barbershops and threading bars in the GTA, 24 to 50. Interests: barbering, men's grooming, shop ownership. Also owners of two to six chairs, where per-seat pricing hurts most.

**Formats and link.** 9:16 first, 1:1 second, real product on a real phone in the Clear theme, no stock photography, no gradient backdrops, hook on screen in the first second. Link `/for-barbers?src=ad-<n>&v=<variant>` (no `v=` for concepts without one); the page's sign-up carries `src=barbers`. During the T1 page test one neutral ad links to the bare URL.

## Concepts

| # | Hook | Visual | CTA | Page variant (`v=`) |
| --- | --- | --- | --- | --- |
| 1 | No per-chair charge. Ever. | "$29.99 + $20 per barber" struck through; "$39 for the whole shop"; "and nobody takes a cut of your clients" | Get your shop's link, free | `price` |
| 2 | Still booking in DMs? | The shop's DM thread against the booking page with the walk-in line beside it | Get your shop's link, free | `dms` (today's `control` is "One link for the whole shop") |
| 3 | How long's the wait? | The door tablet and a client's phone: "You're 3rd · about 40 min · we'll let you know" | Walk-in line, built in | `line` |
| 4 | Dad books, kids' cuts on the same card. | The family card screen | Family under one card | `line` |
| 5 | Chair renters keep their own clients. | The payouts page with a renter's private view | Payouts and chair rent, no spreadsheet | `price` |
| 6 | Back-to-school cuts, sent to every regular. | The promo template and the week's calendar filling | 4 promos a month on Pro | none |
| 7 | No-shows, without the deposit fight. | The reminder and the rebook nudge going out; the "Card on file: off" switch | Get your shop's link, free | `noshows` (T3) |

The $39 on screen is read from the plan price in `plans.ts` when the creative is made. The Booksy figures come from the comparison table on the page (read Oct 28, 2026; re-check before running).

## Copy

**9:16.** Hook, three short beats, CTA. Line: "One price for the whole shop, however many chairs. Nobody takes a cut of your clients."

**1:1.** Primary text: "Bookings, the walk-in line, family cards and chair renters. One price for the whole shop. Free to start, prices in CAD." Headline: the hook. Button: Learn more.

## Budget

About 40% of the media budget in the first eight weeks ($600 a month of the $1,500 media share), the rest on nail techs. During T1 one neutral ad carries the budget and the page splits; afterwards concepts 1 and 2 as paired ads get 60% until a winner shows by cost per live booking link. Same kill rule: stop above $90 per free signup for four weeks in a row; target $60 or less.
