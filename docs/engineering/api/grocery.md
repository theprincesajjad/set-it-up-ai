# Grocer and butcher API

Features (Café & Retail / Plus, hidden until rolled out; an admin override unlocks a pilot shop; only shops whose vertical is `grocery` ever see them): `grocery.flyer`, `grocery.counter_preorders`, `grocery.pantry_reminders`, `grocery.whatsapp_orders`. Contract: `packages/shared/src/api/grocery.ts` (`groceryApi`) and the pure logic in `packages/shared/src/grocery.ts`. Code: `apps/api/src/routes/grocery`, `services/grocery.ts`, job `jobs/grocery.ts`. Research and rules: `docs/research/grocers.md`.

Money is integer cents (CAD). Weights are whole grams. Dates (`2026-11-02`) are the shop's local days (America/Toronto). Errors use the standard envelope `{ error: { code, message } }`.

## Rules in one place

- **Feature gating.** `FeatureDef.vertical` limits a feature to one trade: `isFeatureEnabled` is false for any other vertical, even with the plan and the stage right (a per-merchant admin override still wins). Pre-orders, the WhatsApp inbox, the pre-order planning rules, the cancel rule and the kitchen board accept either the restaurant feature or the grocery one (`requireAnyFeature`, `isAnyFeatureOn`, `PREORDER_FEATURES`, `WHATSAPP_INBOX_FEATURES`).
- **Weighed items.** A catalog item can be priced per `kg` or `lb` (`weightUnit`, `unitPriceCents`, `nominalWeightG`). The shelf price is the portion price (`portionPriceCents`), shown as an estimate. The final price is set at the scale: `POST .../orders/:id/weigh` stores `weighedCents` per line (`weighedLineCents`, rounded to the cent) and the order total, tax and balance follow. The customer is told by text. A line total is `weighedCents ?? unitPriceCents * quantity`. The scale must be legal for trade (Measurement Canada); this is the shop's responsibility.
- **Tax.** Basic groceries are zero-rated: an item with `taxable: false` adds nothing to the tax base (`taxableBaseCents`); prepared food (a samosa tray) is taxable.
- **Deposits.** A weighed pre-order takes a deposit on the estimate (`depositBps`). A weigh-in below the deposit leaves the excess on the order; refunding it is manual (open item).
- **Eid plan.** Animals per pick-up day are stored as date overrides on the pre-order caps, labelled "Eid al-Adha day N". Moon sighting moves the whole plan (`festivalOverrides`). Bookings open eight weeks before; a full day gets the pre-order wait list.
- **Pantry cadence.** Two gaps are needed to learn a household's rhythm; until then the shop's default. After that, the median of the last five gaps, between 7 and 180 days. The text goes out 5 days before the household runs out, at 10:00 shop time, never between 9 pm and 8 am, once per purchase, and not after two cycles past the date. It needs consent recorded at the counter or on the pass, honours STOP/CASL, uses SMS credits and writes a `messageDeliveries` row.
- **Counter, not counted.** `notCountedCents` on `POST /counter/award` splits the till total: the part that does not count (tobacco, vapes, lottery, gift cards, bill payments, alcohol if the shop wishes) is recorded as a line in the "Not counted" no-earn category (created on demand). More than the total is `400`.
- **What a reward costs.** `rewardBackPct` is shown on the rewards page: $5 off at 1,000 points and 1 point per dollar is 0.5% of spend.

## Merchant (staff; permission `orders.manage` unless noted; writes manager+)

Base `/v1/merchants/:merchantId`.

| Method and path | Feature | Body or query | Returns |
| --- | --- | --- | --- |
| `GET /grocery/home` | any grocery feature | | `GroceryHomeResponse`: next season, butcher orders today, pantry due, flyer |
| `GET /grocery/deals` | `grocery.flyer` | | `DealsResponse`: `deals` with `state`, `seasons` with flyer dates and ideas |
| `POST /grocery/deals`, `PATCH /grocery/deals/:id`, `DELETE /grocery/deals/:id` | `grocery.flyer` | `dealBody` / `updateDealBody` | `201 DealDto`; a deal that ends before it starts, or an old price at or below the deal price, is `400` |
| `POST /grocery/flyer/text` | `grocery.flyer` | | `201 FlyerDraftResponse`: a draft SMS campaign the owner sends from Messages (to opted-in members only) |
| `POST /orders/:orderId/weigh` | `grocery.counter_preorders` | `weighBody` `{ lines: [{ orderItemId, actualWeightG }] }` | `WeighResponse` |
| `GET /grocery/butcher/eid?year` | `grocery.counter_preorders` | | `EidPlanResponse` |
| `PUT /grocery/butcher/eid` | `grocery.counter_preorders` | `eidPlanBody` (animals per day, lead hours) | `EidPlanResponse` |
| `PUT /grocery/butcher/eid/moved` | `grocery.counter_preorders` | `eidMovedBody` `{ year, start }` | `EidPlanResponse` |
| `GET /grocery/pantry` | `grocery.pantry_reminders` | | `PantryOverviewResponse` |
| `POST /grocery/pantry/items`, `PATCH /grocery/pantry/items/:id` | `grocery.pantry_reminders` | `pantryItemBody` | `201 PantryItemDto` |
| `POST /grocery/pantry/send` | `grocery.pantry_reminders` | `{ entryIds? }` | `PantrySendResponse`; same checks as the job |
| `GET /grocery/counter/pantry-items` | `grocery.pantry_reminders`; any staff | | active items for the counter chips |
| `POST /grocery/counter/pantry` | `grocery.pantry_reminders`; any staff | `pantryLogBody` `{ memberId, pantryItemId, remind? }` | logs a purchase; `remind: true` records consent as given at the counter |

Catalog (`/catalog/items`) accepts `weightUnit`, `unitPriceCents`, `nominalWeightG`, `taxable` for grocery shops; the price is derived from them. WhatsApp routes (`/whatsapp/*`) open for `grocery.whatsapp_orders`.

## Public and shopper

| Method and path | Auth | Returns |
| --- | --- | --- |
| `GET /v1/public/shops/:slug/flyer` | none | `PublicFlyerResponse`: only live deals; closed shops are `404` |
| `GET /v1/me/pantry` | user | `MyPantryResponse`: the shopper's bulk items with the next reminder date and the switch |
| `PUT /v1/me/pantry/:entryId` | user | `myPantryBody` `{ remind }`; switching on needs the shop's text consent, otherwise `409` |

## Job

`grocery.pantry_reminders` runs hourly; only the 10 o'clock hour in the shop's zone sends (`runPantryReminders`).

## Tests

`apps/api/test/grocery.test.ts` (gating by vertical, deals and flyer, weighed catalog and pre-orders, weigh-in, Eid plan, pantry job and consent, counter not-counted, WhatsApp inbox), `seed.test.ts` (the demo shops), `packages/shared/test/grocery.test.ts`, `apps/web/test/grocery.test.ts`, `apps/web/test/counter-grocery.test.tsx`, `apps/web/e2e/grocers.spec.ts`.
