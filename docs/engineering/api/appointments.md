# Appointments API (Café & Retail: `booking.appointments`)

Contract: `packages/shared/src/api/appointments.ts` (`appointmentsApi`). Code: `apps/api/src/routes/appointments/`,
`services/appointments.ts` (price list, staff, availability, calendar writes), `services/appointments-booking.ts`
(online booking, deposit and card, cancel and reschedule, no-show fee, status, reminders), `services/appointments-checkout.ts`
(checkout). Jobs: `jobs/appointments.ts`. Spec: `docs/research/service-businesses.md` (sections 4.3 and 7).

Money is integer cents (CAD). Times are ISO instants; wall-clock hours (`"09:00"`) are in the shop's time zone
(`merchants.timezone`, default America/Toronto). Errors use the standard envelope.

## Pricing and gating

`booking.appointments` is a **Café & Retail** feature (`minPlan: "plus"`, ships hidden, `unlockAtMerchants` 100; pilot
salons get an admin override). Everything below needs it, except the repair price list (`kind=repair_line`), which needs
`service.tickets`. Locked: `402 feature_locked`.

Fees (`FEES`, `computeFees` in `services/fees.ts`): checkout taken through the calendar (counter or pay link) has **0%
platform fee** (`appointment_checkout`, card processing at cost; `payInvoice` in `services/invoices.ts` applies it to invoices that have an `appointment_id`). Online deposits and the no-show fee use the usual 1%
(`deposit`). See `docs/business/pricing.md`.

Permissions: `bookings.manage` (staff default includes it). Staff can run the day, add time off, and use walk-ins and
checkout. **Managers** edit the price list, weekly hours, staff services and settings, and may book outside working
hours with `force: true` (a staff role gets 403).

## Tables

`services`, `staff_services`, `staff_hours`, `staff_time_off`, `appointments` (migration `0011_appts`). Additive columns:
`merchants.cancel_window_hours`, `merchants.no_show_fee_cents`, `invoices.appointment_id`. `services` is generic (name,
duration, price, category, active, ...) and the repair price list uses it with `kind = "repair_line"`.

**Overlap guard.** `appointments` has `EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
WHERE (staff_id IS NOT NULL AND status IN ('booked','arrived','in_service'))` (`btree_gist`; PGlite loads it through
`createPgliteDb`). A violation (`23P01`) is returned as `409 slot_taken`. Adjacent visits (end = start) are fine; a
cancelled, completed or no-show visit frees the time. Unconfirmed online holds past `hold_expires_at` stop blocking in
availability at once and are cancelled by the job.

## Price list and staff (merchant)

| Endpoint | Notes |
| --- | --- |
| `GET /v1/merchants/:id/services?kind=appointment\|repair_line&active=` | default `appointment` |
| `POST /services`, `PATCH /services/:serviceId`, `DELETE /services/:serviceId` | manager. `staffIds` limits who does it (empty = anyone) |
| `GET /appointments/staff` | bookable staff (hours or a service list) with hours, time off and services, plus `setup { services, staffWithHours, ready }` for the first-run state |
| `PUT /staff/:userId/hours` | replaces one person's weekly hours at a location; several rows per day are split shifts; overlapping shifts 400 |
| `POST /staff/:userId/time-off`, `DELETE /staff/time-off/:timeOffId` | |
| `PUT /staff/:userId/services` | `{ services: [{ serviceId, durationMin?, priceCents? }] }` own length and price |
| `GET/PUT /appointments/settings` | `cancelWindowHours` (default 24), `noShowFeeCents`, `tipsEnabled` (null = by vertical), `tipPresets` |

## Calendar (merchant)

- `GET /appointments?from&to&staffId&locationId&status` returns `{ items: AppointmentDto[] }` (cancelled hidden unless asked;
  expired holds hidden). Each item includes `customer { id, name, phone, language }`.
- `GET /appointments/:id` returns `{ appointment, lastVisits[], member }`.
- `POST /appointments` books for a client (found or created by phone). `source: "walk_in"` starts now with status `arrived`.
  Walk-ins skip the hours check but not the overlap guard. Errors: `409 slot_taken`, `409 outside_hours` (hours, time off or
  midnight; `force` for managers).
- `PATCH /appointments/:id` moves, resizes, reassigns or edits lines. Changing the stylist of a `requestedStaff` visit
  needs `confirmStaffChange: true`, else `409 requested_staff`. A finished or cancelled visit is `409`.
- `POST /appointments/:id/status` `{ status, chargeFee?, reason? }`. Allowed: booked to arrived, in_service, completed,
  no_show, cancelled; arrived to in_service, completed, no_show, cancelled; in_service to completed. `no_show` before the
  start is `409 not_started`. `chargeFee` charges the fee to the card on file (below). Cancelling refunds a paid deposit.
- `POST /appointments/:id/check-in` is `status: "arrived"`.
- `POST /appointments/:id/checkout` `{ items?, tipCents?, tipStaffId?, rewardId?, mode: "counter" | "link", counterMethod?, note?, customer? }`.
  Builds an invoice (`services/invoices.ts`, `appointment_id` set) with the deposit credited; marks the appointment
  `completed`. `counter` marks it paid at once (`markInvoicePaid`) and stores the tip on the invoice (`tipCents`,
  `tipStaffId`, at most 100% of the services, never taxed). `link` texts the pay link; the desk can't pre-pay a tip, the
  client picks it on the pay page and `tipStaffId` (default the visit's stylist) is recorded. A reward is redeemed through
  `ledger.redeemReward` and shows as a credit line. Points go through `awardPurchase` from the invoice lines only (tax and
  tips never earn; a no-earn category earns nothing; a credit line reduces what the other lines earn). A walk-in with no
  phone needs `customer` (`409 customer_required`). A second checkout returns the paid invoice; an unpaid one is voided and
  rebuilt. Response `{ appointment, invoice, payUrl }`.

## Availability and customer booking

Availability is computed, never stored per slot: 15-minute starts where a stylist who can do all the chosen services has
working hours, no time off, no overlapping visit (holds count while live) and room for duration plus buffer. Stylist
overrides in `staff_services` change length and price. `any` picks, per start, the stylist with the least booked time that
day, then the lowest id. DST days are computed per local minute (a skipped hour is skipped, a repeated one is offered once).

- `GET /v1/public/shops/:slug/services` returns `{ shop, policy { cancelWindowHours, noShowFeeCents, takesCards }, services[], staff[] }`.
- `GET /v1/public/shops/:slug/availability?serviceIds=a,b&staffId=any|uuid&from=YYYY-MM-DD&to=` (31 days max, `Cache-Control: public, max-age=30`).
- `POST /v1/me/appointments { serviceIds, staffId|null, startsAt, notes?, groupId? }` re-checks the time (`409 slot_taken`),
  assigns a stylist for "any", and creates the booking. If the services carry a deposit and the shop's payments are ready it
  is a **hold** (`holdExpiresAt` = now + 10 minutes) and returns a deposit PaymentIntent (`ll_kind appointment_deposit`,
  saves the card for the fee). With a no-show fee and no deposit it returns a SetupIntent (`appointment_setup`). With
  neither, or without in-app payments, it is confirmed at once (`confirmed: true`) and the client is texted. A customer
  can hold at most 3 unpaid bookings (`429`).
- Webhooks confirm the hold (`payment_intent.succeeded`, `setup_intent.succeeded`; handlers `onDeposit` and `onCardSaved`).
  A deposit that lands just after the hold lapsed takes the chair back if it is still free, else it is refunded and the
  client is told. Processing bank debits keep the chair for 3 days; a failure re-opens a 10 minute hold.
- `GET /v1/me/appointments`, `GET /v1/me/appointments/:id` (a held booking also returns `deposit` or `setup` to finish).
- `POST /v1/me/appointments/:id/cancel` and `/reschedule { startsAt, staffId? }`.

### Policy

Free change or cancel until `cancelWindowHours` before the visit. Before it: deposit refunded, no fee. After it (or a
no-show): the shop's fee, less any deposit already paid (the deposit is kept and counts toward the fee), is charged
off-session to the saved card (`chargeFee`, idempotency key `appt_fee:<id>`, `feeChargedAt`). No saved card means no charge
(`409 no_card_on_file` from the desk). A declined card is `409 fee_charge_failed`; the no-show stands and staff can retry.
The fee is snapshotted on the appointment (`no_show_fee_cents`) when it is booked.

## Jobs

- `appointments.reminders` every 5 minutes: text and push 24 hours and 2 hours before, transactional (shop, time, address,
  change link `/shops/<slug>/book/<id>`, "Reply STOP to opt out"), in the client's language (en, hi, ur, pa; keys `bk.msg.*`).
  A booking made inside 24 hours gets only the 2 hour text. Held and cancelled visits get nothing. Claims each row first.
- `appointments.hold_expiry` every minute: cancels holds past `hold_expires_at` (`cancel_reason hold_expired`).

## Customer pages

Web `/shops/<slug>/book` (and `/shops/<slug>/book/<id>` to change or cancel), phone `book/<slug>` and `appointments/<id>`.
`?service=<id>&staff=<id>` opens the flow with those chosen (rebooking links).
