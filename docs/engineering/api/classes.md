# Classes and memberships API

Features: `booking.classes` (schedule, waitlist, packs, drop-ins, intro offers, late-cancel fees, door check-in) and `memberships.recurring` (recurring memberships). Both are Café & Retail (Plus), hidden until rolled out; an admin override unlocks a pilot studio. Contract: `packages/shared/src/api/classes.ts` (`classesApi`). Code: `apps/api/src/routes/classes`, `services/classes.ts`, `services/class-memberships.ts`, jobs `jobs/classes.ts`. Research and rules: `docs/research/fitness-studios.md`.

Money is integer cents (CAD). `startsAt` is an ISO instant; dates (`2026-12-03`) are the studio's local days (America/Toronto). Errors use the standard envelope `{ error: { code, message } }`.

## Rules in one place

- **Credit order.** A membership that covers the day (status `active`, the day inside the paid period or up to 14 days after it, before `cancelEffectiveOn`, inside a fixed term unless it will renew) and has classes left in its billing month; else the pack or intro pass that expires first; else the customer pays a drop-in (held 10 minutes). A `past_due` or `frozen` membership never books: `409 membership_past_due` or `membership_frozen`; `409 month_used` when a limited membership has no classes left; `409 no_pass` with nothing to use.
- **Capacity.** The class row is locked while a booking is made. A full class takes a waitlist (`outcome: "waitlisted"`). Nothing is used while waiting.
- **Promotion.** On a cancel, a bigger capacity, a lapsed drop-in hold or a freed membership booking, the first waitlisted person with a usable credit is booked and told (push and text). Someone with nothing to use is skipped. Nobody is promoted inside `waitlistCutoffMinutes` of the start (default 120).
- **Cancel.** Free until `cancelWindowHours` before the start (default 12): a pack credit returns, a drop-in is refunded. Inside the window the class counts as used (`late_cancelled`, credit not returned, drop-in not refunded) and a member with a saved card pays `lateFeeCents` (default 0), once per booking. A no-show is treated the same. Staff can excuse either: credit back, fee refunded.
- **Memberships** (billing follows tiffin): one `class_charges` row per period (unique per membership and period start); the period advances only when paid (webhook `ll_kind: "class"`). First payment keeps the card (`setup_future_usage`); renewals charge it off-session. Failed charges retry on day 2 and day 5, then wait for the member (`POST .../pay`) or a new card (`POST .../card`, which retries at once).
- **Ontario (verify with counsel).** The agreement text is stored on the membership; sign-up must echo its hash. 10-day cooling-off: cancelling inside it ends the membership now and refunds every paid period. Terms and pack validity are capped at a year. A fixed term gets a renewal notice `renewalNoticeDays` (30 to 90) before it ends and renews only if the notice went out at least 30 days before and the member did not decline; otherwise it expires.
- **Fees.** `computeFees` kind `class` (1% of the price before tax) on online packs, drop-ins, membership periods and late fees; desk sales recorded by hand use kind `manual` (0%). Tax is added only when the studio is registered (`merchants.taxRegistered`) and the offer is taxable.

## Merchant (staff; feature `booking.classes` unless noted; permission `bookings.manage`; writes marked manager+)

Base `/v1/merchants/:merchantId/classes`.

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET /settings`, `PUT /settings` (manager+) | `ClassSettingsBody` | `ClassSettingsDto` |
| `GET /types`, `POST /types` (manager+), `PATCH /types/:id` (manager+) | `createClassTypeBody` | `ClassTypeDto` |
| `GET /sessions?from&to&locationId` | | `{ items: ClassSessionDto[] }` with `booked`, `waitlisted` |
| `POST /sessions` (manager+) | `classTypeId, startsAt, instructorName?, room?, capacity?, womenOnly?, repeatWeeks 1..26` | `201 { items }`. Repeats keep the same wall-clock time across the clock change |
| `PATCH /sessions/:id` (manager+) | move, capacity, instructor, women-only | `ClassSessionDto`; capacity below the number booked is `409`; a bigger capacity promotes the waitlist; a move tells everyone booked |
| `POST /sessions/:id/cancel` (manager+) | `{ reason? }` | everyone booked or waiting is cancelled, told, credited or refunded |
| `GET /sessions/:id/roster` | | `RosterResponse` (rows with `payLabel`, status, waitlist position) |
| `POST /sessions/:id/bookings` | `phone` or `memberCode` or `memberId`, `comp`, `overCapacity` | `201 RosterResponse`; staff add a member (uses their credit) or a guest |
| `POST /bookings/:id/check-in` | | `RosterResponse`; marks attended and awards the visit once |
| `POST /bookings/:id/mark` | `{ status: "no_show" \| "excused" }` | `RosterResponse` |
| `POST /bookings/:id/move` | `{ position }` | `RosterResponse`; waitlist order |
| `POST /check-in` | `phone` or `memberCode` or `memberId`, `sessionId?`, `addIfNotBooked` | `CheckInResponse` with `outcome`: `checked_in`, `already_checked_in`, `added_and_checked_in`, `not_booked`, `class_full`, `no_pass`, `past_due`, `no_class`, plus `message`, `pass`, `pointsEarned`, `balance`, `visitsThisMonth`, `arrived`, `booked`. Default class: the one open now or starting in the next 2 hours (the one the member is booked into first) |
| `GET /door?sessionId` | | `{ session, arrivals }` |
| `GET /products`, `POST /products` (manager+), `PATCH /products/:id` (manager+) | `createProductBody` | `ProductDto` (`activeCount`, `soldLast30`) |
| `POST /sales` | `productId` (a pack), `phone`/`memberCode`/`memberId`, `method: cash \| etransfer \| card_reader` | `201 MyPassDto`; paid by hand, no platform fee |
| `GET /summary` | | `StudioSummaryResponse` (active members, MRR, cancels in 30 days, fill, waitlist, late cancels) |
| `GET /members?q&status` (`memberships.recurring`, manager+) | | `{ items: StudioMemberDto[] }` with an `issue` line |
| `POST /memberships/:id/cancel` (manager+) | `effective: now \| period_end`, `refundLast`, `reason` | members list |
| `POST /memberships/:id/freeze` (manager+) | `{ days, startDate? }` (no limits for the studio) | members list |

## Public

`GET /v1/public/shops/:slug/classes?from&to` returns `PublicClassesResponse`: the shop, the policy (window, late fee, cutoff, studio terms), sessions in the next 14 days (cancelled ones hidden) with spots, the active offers (memberships only when `memberships.recurring` is on; intro offers hidden from someone who has had one), the tax label and `hasWomenOnly`. A signed-in caller also gets `mine` on each session. `402` when the studio does not have the feature.

## Customer (signed in)

| Method and path | Notes |
| --- | --- |
| `GET /v1/me/classes?merchantId` | passes (active or pending), memberships (live, or ended in the last 30 days, with the agreement text, card, next payment, cooling-off state), upcoming bookings, `introEligible` |
| `POST /v1/me/classes/bookings` `{ sessionId, use: auto \| drop_in, waitlist }` | `201 { booking, payment, outcome: booked \| needs_payment \| waitlisted }`. `payment` is a PaymentIntent to confirm in the browser; the webhook books the held spot |
| `POST /v1/me/classes/bookings/:id/cancel` | `{ booking, late, creditReturned, feeChargedCents }` |
| `POST /v1/me/classes/purchases` `{ productId }` | buy a pack or intro offer: `{ pass, payment }`. A free offer activates at once. `409 intro_used` for a second intro offer |
| `GET /v1/me/classes/products/:id/agreement?startDate` | `{ text, hash, totalPerPeriodCents, taxPerPeriodCents }` |
| `POST /v1/me/classes/memberships` `{ productId, acceptAgreement: true, agreementHash, startDate? }` | `201 { membership, payment }`; `409 agreement_changed` if the text changed since it was read; `409` if the member already has one here |
| `POST /v1/me/classes/memberships/:id/freeze` `{ days }` | limited by `freezeMaxDays` and `freezesPerYear`; dates move; classes inside the freeze are released |
| `POST /v1/me/classes/memberships/:id/cancel` | inside the 10 days: ends now with a full refund (`refundedCents`); else `cancelEffectiveOn` set (end of the paid month, or the term's last day) |
| `POST /v1/me/classes/memberships/:id/keep` | undo a scheduled cancel |
| `POST /v1/me/classes/memberships/:id/decline-renewal` | fixed term only |
| `POST /v1/me/classes/memberships/:id/pay` | pay a failed or open period: `{ payment }` |
| `POST /v1/me/classes/memberships/:id/card` | a SetupIntent to change the card; the webhook saves it and retries a past-due period |

## Jobs

- `classes.reminders` every 5 minutes: a push to people booked into a class starting in the next 3 hours, once each.
- `classes.hold_expiry` every minute: a drop-in not paid within 10 minutes frees its spot and offers it to the waitlist.
- `classes.memberships` every 10 minutes: start and end freezes, send fixed-term renewal notices, expire packs, finish cancellations that reached their date, renew or expire fixed terms, and charge each period that is due. Idempotent.

## Webhooks

`payment_intent.*` with `ll_kind: "class"` and `ll_id` the `class_charges.id` (pack: activates the pass; drop-in: books the held spot, or refunds it if the class filled; membership: advances the period, saves the card, sends the agreement copy or the receipt; late fee: marks paid). `setup_intent.succeeded` with `ll_kind: "class_setup"` and `ll_id` the membership id.

## Privacy

Account deletion cancels live memberships and upcoming bookings, drops saved-card references and removes the member's name from the stored agreement (`services/privacy-scrub.ts`). The customer data export includes `classBookings`, `classPasses`, `classMemberships` (with the agreement) and `classCharges`.
