# Barbershops, threading bars and beauty supply API

Research and design: `docs/research/barbers-beauty.md`. Contract: `packages/shared/src/api/barber.ts` (`barberApi`). Code: `apps/api/src/routes/barber`, `apps/api/src/services/barber.ts`, `preferred-staff.ts`, `beauty-guard.ts`. Migration `0026_barb`.

Features (both Plus, phase 2, unlock at 100 merchants; pilot shops get overrides in the seed): `booking.walkin_queue` (the walk-in line) and `staff.payouts` (the payouts report and how people are paid). "My barber", family members and the beauty claims guard are not gated: the first two belong to the customer, the third is a rule for the `beauty_supply` vertical.

## The walk-in line

A walk-in joins the line (`queue_entries`), a barber calls them, and starting them creates a **walk-in appointment** (`source = walk_in`, `in_service`) for that barber. Checkout, the tip to that barber, points and rebooking are the existing appointment ones (`appointments.md`). The queue never takes money.

| Route | Who | Notes |
| --- | --- | --- |
| `GET/PUT /v1/merchants/:id/queue/settings` | staff (PUT needs `bookings.manage`) | `open`, `minutesPerCut`, `textNext`, `maxWaiting` (default 30), `callHoldMinutes` (default 5). Closing the line only stops new joins |
| `GET /v1/merchants/:id/queue` | staff | The board: waiting, called, in service, chairs (free, busy, called, away), stats, the services. A staff member with "own clients only" sees only their own chair and the people who asked for them or for anyone |
| `POST /v1/merchants/:id/queue` | staff | Add someone (front desk or the door tablet, `source: tablet`). First name, optional phone, `textConsent` |
| `POST /queue/:entryId/call` `{ staffId }` | staff | A barber calls for their own chair (403 otherwise); a manager for anyone. 409 `already_called` when that barber already has someone on the way. Texts "your turn" if the person asked |
| `POST /queue/:entryId/start` | staff | Creates the walk-in appointment, `in_service`. Family members: the parent's customer record with the child's first name on the visit |
| `POST /queue/:entryId/skip` | staff | First skip: back two places, status `waiting`, `skips = 1`, one text. Second skip: `no_show`. No fee, no card |
| `POST /queue/:entryId/done` | staff | Completes the appointment (no invoice: check out in the calendar) |
| `POST /queue/:entryId/remove` | staff | `left` |
| `GET /v1/public/shops/:slug/queue` | anyone | Open or closed, how many wait, the estimate, each barber's estimate, the services. `no-store` |
| `POST /v1/public/shops/:slug/queue` | anyone; signed in for family | `{ name, phone?, serviceId?, requestedStaffId?, textConsent, familyMemberIds[] }`. A guest's phone becomes a customer record by phone (like the counter). One place per customer: joining again returns the first. 409 `queue_closed`, `queue_full` |
| `GET /v1/public/queue/:token` | the link | Position, people ahead, estimate, barber, party. The token is the only key |
| `POST /v1/public/queue/:token/leave` | the link | Takes the person and the family members who joined with them off the line |

**Estimate** (`estimateWaitMin`, shared): the work ahead spread over the chairs taking walk-ins plus the least time any chair has left, rounded up to 5 minutes; for a named barber their own line plus the "anyone" work over all chairs plus their chair. A chair's busy time comes from the arrived or in-service appointment on it. The shop's own median service time replaces `minutesPerCut` after 8 finished entries when a person has no service.

**Texts** (one per event, only when the person ticked the box, with STOP): "you're next" to the first person waiting (once, `notifiedNextAt`), "your turn" on call, "moved back" on a first skip. Strings `q.msg.*` in en, hi, ur, pa. Job `queue.sweep` (every minute) sends a missed "you're next" and clears entries older than 14 hours.

## Pay, payouts and renter privacy

`staff_pay`: `model` (`employee`, `commission`, `chair_rent`), `shopShareBps`, `rentCentsWeek`, `ownClientsOnly`, `takesWalkIns`.

| Route | Who | Notes |
| --- | --- | --- |
| `GET /v1/merchants/:id/staff-pay`, `PUT /staff/:userId/pay` | manager | A commission needs a share above 0. Setting chair rent in the UI turns on "own clients only" |
| `GET /v1/merchants/:id/payouts?from&to` | staff | Manager and owner: every barber. Staff: their own row only (`mine: true`). Up to 93 days |
| `GET /payouts/mine`, `GET /payouts.csv` | staff | Own row; the CSV of the report |

Per barber: **services** = subtotal of paid invoices on that barber's appointments (before tax and tip, net of a reward credit); **tips** = `invoices.tipCents` by `tipStaffId` (the appointment's barber when none), cash tips as recorded at the counter; **shop keeps** = services times the commission share (an employee: all services); **rent** = weekly rent times days over 7 (shown, never collected); **takes home** = services minus shop keeps minus rent plus tips (an employee: tips). The report is not payroll, not a classification of anyone as employee or contractor, and moves no money.

**Own clients only** (`staff_pay.ownClientsOnly`, applies to role `staff` only): the calendar list is forced to their column, another barber's appointment detail returns 403 `own_clients_only`, and the customer directory routes (`customers`, `customers/:id`, `segment-counts`, patch) return 403 `own_clients_only`. The counter still works.

## My barber and family

- `GET/PUT /v1/me/shops/:slug/barber`: `preferred_staff`. `source = auto` follows the last completed visit (set on checkout and on completion, never over a `chosen` pick); the customer's pick is `chosen`. `null` clears it.
- `GET/POST /v1/me/family`, `DELETE /v1/me/family/:id`: `family_members` (first name and `consentAt` only). The POST body must carry `consent: true` (the parent's tick). At most 6. Removing deletes the name and clears it from queue entries and visits. The data export lists them (`familyMembers`, `myBarber`); account deletion deletes them, their places in lines and "my barber".
- A family member on the line is a second entry under the parent's `userId` with `familyMemberId`, the shop's kids' service when it has one (name matches kid, child or junior) and the parent's stamps.

## Beauty supply claims guard

`checkBeautyClaims` (shared `beauty.ts`): for shops with vertical `beauty_supply`, reward names and descriptions, discount card names and terms, promo titles and bodies, and message subjects and bodies that contain a treatment claim are refused with 422 `beauty_claims` and the phrase. Health Canada treats a cosmetic with a treatment claim as a drug (research doc 2.6). It is a conservative word list, not legal advice, and is a no-op for other verticals.

## Seed

`apps/api/src/seed/barbers.ts`: Crown & Fade Barbershop (5 barbers: three renters with own-clients-only, a commission barber, the owner at the desk; an open line with five waiting and one in the chair; a week of paid visits with tips; the demo customer +16475551000 has Marcus as "my barber" and Aiden and Zayn on her card), Arch & Thread Brow Bar (threading, commission, a line of three), Glow Beauty Supply (beauty supply template, stylist pro card, a draft message). Logins are printed by `pnpm --filter @ll/api seed`.
