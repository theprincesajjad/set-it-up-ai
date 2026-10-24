# Repair and drop-off operations API

Contract: `packages/shared/src/api/service.ts` (`serviceApi`) and `commerce.ts` (drop-off settings). Rules in `packages/shared/src/service-rules.ts`.
Code: `routes/service`, `routes/public`, `routes/commerce`, `services/{tickets,quotes,invoices,pickup,rebooking,dropoff,service-settings}.ts`, `jobs/service.ts`, `providers/storage.ts`.

Legal unknowns, shown conservatively in the UI and to verify with counsel: the 10% cap outside vehicle repair (we apply it to every ticket as shop policy), the 60-day
point under the Repair and Storage Liens Act (we flag and record, never sell or send a notice for the shop), CASL treatment of rebooking nudges (we only send to members
with marketing consent), and HST on tips (tips are never taxed here).

## Merchant (staff, feature `service.tickets` unless noted)
- `POST /merchants/:id/uploads` raw image body (jpeg, png, webp, heic), 5 MB, header sniffed. Returns `{ url }`. Storage provider: memory in tests, disk in dev (`GET /v1/public/uploads/:merchantId/:file`); plug an object store in through `providers.storage`.
- `GET /tickets/summary`, `GET /tickets?assignedTo&dueState&hasPhotos`, ticket DTO adds quote, invoice, `dueState`, assignee, `statusUrl`, `lienEligible`.
- `POST /tickets` adds `intakeChecklist`, `termsAccepted` (required when the shop has terms, else 400 `terms_required`), `shelfLocation`, `items`, `bookingId` (check-in completes the booking).
- `POST /tickets/:id/quotes/preview` server totals, tax for the shop's province and tax registration, deposit and `maxAuthorizedCents`.
- `POST /quotes/:id/authorize-by-phone` (`quotes.send`) name, phone, note; idempotent; texts the customer.
- Invoice creation: 409 `over_estimate` (details carry the cap) when the total is more than 10% above the approved quote; a newer approved quote resets the cap, `quoteId` names one.
- `GET /invoices?filter=overdue&q=`, `GET /invoices/summary`, mark-paid, void.
- `GET /uncollected`, `POST /tickets/:id/lien-notice` (manager; only after 60 days; records the shop's own notice).
- `GET|PUT /service-settings` terms, warranty days, tips on/off and presets.
- Rebooking (`service.rebooking`): `GET /rebooking?state=`, `POST /rebooking/:userId/:serviceId/send|skip|snooze`, `POST /rebooking/send-all`, `PUT /rebooking/settings`, `GET|PUT /rebooking/rules[/:serviceId]`.
- Drop-off (`booking.dropoff_scheduling`): `GET|PUT /dropoff-settings`, `POST /dropoff-settings/block`, `DELETE /dropoff-settings/block/:date`.

## Public
- `GET /public/tickets/:token` status page. `GET /public/quotes/:token` stamps `firstViewedAt` once; `?preview=1` does not. Payloads add `merchant.vertical`, `maxAuthorizedCents`, event facts, `terms`, `taxLabel`.
- `POST /public/invoices/:token/pay { tipCents }` 0 to 100% of the pre-tax subtotal, only where tips are on; tips are not taxed and never earn points.

## Jobs
`service.pickup_reminders` (hourly: day 3 and 7 texts need `service.rebooking`; day 30 task and day 60 flag need only tickets), `service.rebook_nudges` (10:00 shop time, auto shops), `commerce.generate_slots_rolling`.
