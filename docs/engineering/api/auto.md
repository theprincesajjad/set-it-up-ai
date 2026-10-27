# Auto care API

Research and design: `docs/research/auto-care.md`. Contract: `packages/shared/src/api/auto.ts` (`autoApi`) and the pure rules in `packages/shared/src/auto.ts`. Code: `apps/api/src/routes/auto`, `apps/api/src/services/auto-vehicles.ts`, `auto-tires.ts`, `auto-wash.ts`, `auto-estimate.ts`, jobs `apps/api/src/jobs/auto.ts`, seed `apps/api/src/seed/auto.ts`. Tests: `apps/api/test/auto.test.ts`, `packages/shared/test/auto.test.ts`, `apps/web/e2e/auto-care.spec.ts`.

Three features, all Plus, phase 2, hidden until an admin turns them on (the seed does it for the two demo shops): `auto.vehicles` (vehicles and service reminders; shops of vertical `repair_auto` or `car_wash`), `auto.tires` (tire season and storage; `repair_auto`), `auto.wash` (wash check-in; `car_wash`). `FeatureDef.vertical` accepts a list for this. A shop of another vertical gets 402 even on Plus. The vehicle estimate rules need no new feature: they apply to `itemKind: "vehicle"` tickets of any shop that has service tickets (Pro).

## What is stored, and what is not

`vehicles` (owner, year, make, model, use `personal | rideshare`, an optional plate and its normalised form), `vehicle_shop` (a shop's km a day override and note), `vehicle_readings` (odometer: from staff, from a ticket or from the owner), `vehicle_services` (a service done on a car at a shop: what a reminder counts from), `vehicle_nudges` (one row per text or skip for a car, service and due date), `auto_settings` (per shop: service intervals as JSON, automatic reminders, default km a day, bays, hours, minutes a swap, the fall and spring windows, pickup lead days, washes a day), `tire_sets`, `tire_swaps`, `wash_visits`. Migration `0028_auto`.

Never stored: a VIN (a ticket's free-text details may carry one, as before), a driver's licence, a photo of a plate, camera reads. A vehicle belongs to its owner and follows them to other shops; a shop sees only vehicles of its own members. The plate is shown to the shop's staff and the owner, never in a text, a notification or a public page. Account deletion removes vehicles (and with them readings, service log and nudges), tire sets, swaps and wash visits; `GET /v1/me/export` lists them.

## Vehicles and reminders (`auto.vehicles`)

| Route | Who | Notes |
| --- | --- | --- |
| `GET /v1/me/vehicles` | owner | Cars with the odometer, each shop's reminders (shops that logged a service on the car) and `tireShops` (below) |
| `POST /v1/me/vehicles` `{ year?, make, model, use, plate? }` | owner | Up to 6 per owner (409). A plate is 2 to 8 letters and numbers (400) |
| `PATCH` / `DELETE /v1/me/vehicles/:id` | owner | Only the owner's car (404 otherwise) |
| `POST /v1/me/vehicles/:id/readings` `{ km, day? }` | owner | A reading cannot be from a future day |
| `GET /v1/merchants/:id/auto/vehicles?q=` | staff | The members' cars with the worst reminder status and the next due; `q` matches the car, the owner or a plate |
| `POST /v1/merchants/:id/auto/vehicles` `{ memberId, ..., odometerKm? }` | staff | |
| `GET/PATCH /v1/merchants/:id/auto/vehicles/:id` | staff | Detail: km a day and its basis (`override`, `readings`, `default`), reminders, the last readings, visits (tickets that name the car, the estimate beside the invoice and the percent over), stored tire sets, `ownerPhone`, `canText`. 404 for a car whose owner is not a member. PATCH takes the car's fields plus `kmPerDayOverride` and `note` |
| `POST .../vehicles/:id/readings`, `POST .../vehicles/:id/services` `{ serviceKey, doneOn?, km? }` | staff | A service must be on the shop's list (400) and not in the future |
| `GET /v1/merchants/:id/auto/reminders` | staff | Due soon and overdue cars with `canSend` and `cannotWhy` (No phone number, No text consent, Said STOP), counts and a preview of the text |
| `POST .../auto/reminders/send` `{ items?, skip }` | staff | Texts the listed (or all) rows, or skips them. 409 when a listed row has nothing to send. One text per car, service and due date |
| `GET/PUT .../auto/settings` | staff to read, manager to change | Intervals (`services`), `autoReminders`, `defaultKmPerDay`, tire and wash settings |

**The rule.** Due on the earlier of `last done + every km` at the estimated km a day, and `last done + every months`. `kmPerDay` takes the last four readings, drops one that goes backwards, needs two at least 14 days apart, and clamps to 5 to 400; otherwise the shop default (40), or the owner's override. A rideshare car uses `severeKm` and `severeMonths` where the shop set them. Status: `overdue`, `due_soon` (within 14 days or 1,000 km), `ok`, `unknown` (nothing logged yet). Defaults (an estimate, not a manufacturer's number): oil 8,000 km or 6 months (severe 5,000 or 4), rotation 10,000 km, brake inspection 12 months, cabin air filter and safety certificate off.

**The text.** Marketing consent at the shop, not muted, a phone, no STOP; 09:00 to 20:00 shop time; it names the service and the car's year, make and model, never the plate; four languages (`auto.msg.due`). Job `auto.service_reminders` (hourly, only the 10:00 hour sends, only for shops with `autoReminders` on).

## Tires (`auto.tires`)

| Route | Who | Notes |
| --- | --- | --- |
| `GET .../auto/tires/plan?from&days` | staff | The open or next window (`fall` Oct 15 to Nov 30, `spring` Mar 25 to Apr 30 by default), capacity by day (`bays x hoursPerDay x 60 / minutesPerSwap`, rounded down), booked, free, full, and the swaps |
| `POST .../auto/tires/swaps` `{ memberId, vehicleId?, day }` | staff | Any day from today (a regular who phones in) |
| `POST .../auto/tires/swaps/:id/status` `{ status: done | no_show | cancelled }` | staff | |
| `GET/POST .../auto/tires/sets`, `PATCH .../sets/:id`, `POST .../sets/:id/pickup` | staff | Rack (upper-cased), season `winter | summer | all_weather`, brand and size, tread in mm (stored as tenths): under 3.2 mm `replace_soon`, under 1.6 mm `wear_bar`. A set cannot be picked up twice (409). The car must be the owner's (400) |
| `POST .../auto/tires/pickup-texts` | manager | Runs the pickup texts now |
| `GET /v1/me/vehicles` (`tireShops`) | owner | For each shop the owner belongs to: the window, the days with room, the owner's stored sets and booked swaps |
| `POST /v1/me/tire-swaps` `{ merchantId, vehicleId?, day }` | owner | Inside a window only (400), not in the past (400), one swap per customer per day (409), **409 `day_full`** when the day has no room. The capacity check runs under a per-day lock: concurrent bookings cannot take the last place twice |
| `DELETE /v1/me/tire-swaps/:id` | owner | Frees the place |

Pickup texts (`auto.msg.tirePickup`): stored sets wanted in the next window (winter in fall, summer in spring; all-weather never), once per window, from `pickupLeadDays` (14) before it opens until it closes, with consent, in the daytime. Job `auto.tire_pickup`.

## Wash check-in (`auto.wash`)

Plans are `class_products` of kind `membership` with no class limit, billed, frozen, cancelled and refunded by the existing membership routes (`docs/engineering/api/classes.md`, which carry the Ontario 10-day refund and the agreement text); the punch card is a `pack` product (credits, valid up to a year). This feature only counts a wash.

| Route | Who | Notes |
| --- | --- | --- |
| `GET .../auto/wash/lookup?q=` | staff | Members by plate (exact), phone digits, name or member code, with the plan state, the punch card, washes this month and whether washed today |
| `POST .../auto/wash/check-in` `{ memberId | memberCode | phone | plate, source }` | staff | 200 with `ok`. Refused (`ok: false`, with a `reason` and a message in words): `frozen`, `past_due`, `pending`, `cancelled`, `expired`, `already_washed` (a plan allows `washMaxPerDay`, default 1), `no_plan`. An active plan is let in (`kind: member`); with no plan a punch card takes a credit (`kind: punch`) and is `used_up` at zero. A plate shared by two members is 409, an unknown plate 404. Serialised per member and day. A visit or stamp loyalty program earns the visit; a per-dollar program earns on the payment |
| `GET .../auto/wash/summary` | staff | Active plans, washes today and in 30 days, the average per plan member, open punch cards, and plan members with fewer than 3 washes in 30 days (plans under two weeks old are left out) |

## The vehicle estimate (tickets, quotes and invoices)

No new routes. For a ticket with `itemKind: "vehicle"` (rules in `docs/research/auto-care.md` 2.4, from the Ontario guide for auto repair businesses):

- A quote line of kind `part` may carry `condition: new | used | reconditioned`.
- `POST /quotes/:id/send` is **409 `estimate_incomplete`** (with `details.missing`) unless the ticket names the car, has an odometer reading (`itemDetails.mileage`), a promised time (when the work will be done) and every part has its condition; the quote's expiry is always set.
- `POST /tickets/:id/status` to `in_progress`, `waiting_parts` or `ready`, and `POST /tickets/:id/invoices`, are **409 `estimate_required`** until a quote on the ticket is approved (by link, by phone with the name, number and time, or at the counter).
- The 10% cap (`409 over_estimate`) and the revised-estimate approval are unchanged (`service-businesses.md`).
- `itemDetails.vehicleId` links the ticket to a vehicle under the customer (it must be that customer's, 400). The odometer in and out (`mileage`, `mileageOut`) become readings. `itemDetails.partsReturn` is `offered`, `declined` or `not_applicable`.
- `GET /v1/public/invoices/:token` returns `estimate` (the approved estimate, who approved it and how, the percent over, the highest allowed) for any ticket with an approved quote, and `vehicle` (label, odometer in and out, replaced parts, the 90 day or 5,000 km warranty on new or reconditioned parts and labour; fluids, filters, lights, tires and batteries excluded) for vehicle tickets. The statutory notice text is not printed (counsel, V).

## Fees and plan

All three features are in Café & Retail ($39) for their trade (founder default, `docs/business/pricing.md`); a garage that uses the estimate flow also needs the Service plan ($99) for tickets, quotes and invoices. Wash plan billing carries the existing 1% class fee; stored tires and swaps carry no fee (the shop bills them on a ticket).
