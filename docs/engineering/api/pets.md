# Pet care API

Research and design: `docs/research/pet-care.md`. Contract: `packages/shared/src/api/pets.ts` (`petApi`) and the pure rules in `packages/shared/src/pets.ts`. Code: `apps/api/src/routes/pets`, `apps/api/src/services/pets.ts`, `pet-daycare.ts`, `pet-food.ts`, `apps/api/src/jobs/pets.ts`. Migration `0027_pet`. Tests: `apps/api/test/pets.test.ts`.

Four features, all Plus, phase 2, **only for shops whose vertical is `pet`** (`FeatureDef.vertical`, like the grocery features; an admin override still wins), hidden until an admin turns them on (the seed does it for the three demo shops): `pets.profiles` (pets, vaccines, groom cadence and rebooking), `pets.daycare`, `pets.food_cards`, `pets.report_cards`. A pet belongs to its owner, so the owner's own routes (`/me/...`) are not gated by a shop feature.

## What is stored, and what is not

`pets` (owner, name, species, breed, size band, coat), `pet_vaccines` (one row per pet and kind: an expiry date and an optional stored upload path), `pet_shop` (per shop: cadence in weeks, a handling note, the temperament check), `pet_visits` (a groom or daycare day, and the report card for it), `pet_nudges` (one groom reminder per pet and cycle), `pet_settings` (per shop: capacity, dogs per staff, staff on, required shots, closing time, pack sizes, the automatic groom reminder switch), `daycare_packs`, `daycare_stays`, `food_programs`, `food_skus`, `food_cards`, `food_events`.

Never stored: vet records, diagnoses, medication, microchip numbers, door or gate codes, key locations, a house address. A shop sees only pets whose owner is a member of the shop. The handling note is the shop's own and is not in the owner's pet list. Deleting an account deletes the pets, the vaccine proof and report-card photos from storage, food cards and daycare packs (`privacy-scrub.ts`); the data export lists pets (with vaccines and a signed proof link) and food cards.

## Pets and vaccine proof

| Route | Who | Notes |
| --- | --- | --- |
| `GET /v1/me/pets` | owner | Pets with vaccines (status `current`, `expiring` within 30 days, `expired`; `proofUrl` is a short-lived signed link) and `nextGroom` per pet from the shop that groomed it last |
| `POST /v1/me/pets` `{ name, species, breed?, sizeBand, coat }` | owner | Up to 8 per owner (409) |
| `PATCH` / `DELETE /v1/me/pets/:id` | owner | Only the owner's own pet (404 otherwise). Delete removes the proof photos |
| `POST /v1/me/pets-uploads` | owner | Raw image bytes (`image/jpeg`, `png`, `webp`, `heic`), 5 MB, header sniffed. Stored under the owner's id. Returns a signed URL to send back as `proofUrl` |
| `PUT /v1/me/pets/:id/vaccines/:kind` `{ expiresOn, proofUrl? }` | owner | `kind` is `rabies`, `dhpp`, `bordetella` or `other`. `proofUrl` must be an upload under the owner's id (a pasted link or another account's key is 400). `null` clears the photo, leaving it out keeps it |
| `GET /v1/merchants/:id/pets?q=` | staff, `pets.profiles` | The shop's members' pets: worst vaccine status and next groom |
| `POST /v1/merchants/:id/pets` `{ memberId, ... }` | staff | Adds a pet for a member |
| `GET /v1/merchants/:id/pets/:petId` | staff | Pet, vaccines, the shop's cadence and note, temperament check, last and next groom, recent visits, the owner's other pets. 404 for a pet whose owner is not a member |
| `PUT /v1/merchants/:id/pets/:petId/shop` | staff | `groomEveryWeeks` (1 to 26 or null for the coat default), `handlingNote`, `assessment` (`none`, `passed`, `declined`, records who and when) |
| `PUT /v1/merchants/:id/pets/:petId/vaccines/:kind` | staff | A date and a photo uploaded with `POST /v1/merchants/:id/pets-uploads` (shop id namespace) or the owner's |

Default cadence by coat (`defaultGroomWeeks`): curly 5, long and silky 4, double 8, short 8, wire 8, hairless 8.

## Groom rebooking

`GET /v1/merchants/:id/pets/rebooking` lists pets whose last groom visit plus their cadence falls within 7 days or has passed (`due`, `late`), with `canSend` (marketing consent, not muted, a phone, not STOPped), counts and a preview of the text. A pet with a booked future appointment under its owner is left out. `POST .../pets/rebooking/send` `{ petIds?, skip? }` texts the listed pets (all due when no ids) or skips them for the cycle. **One text or skip per pet and cycle** (the cycle is the groom visit it follows, `pet_nudges.sinceVisitId`); never overnight (`inQuietHours`), a month's SMS credits apply, delivery is logged as `marketing`. With `pet_settings.autoGroomReminders` on, job `pets.groom_reminders` (hourly, only the 10:00 shop-time hour sends) does the same. Text keys `pet.msg.groomDue*` in en, hi, ur, pa.

## Report cards

`POST /v1/merchants/:id/pets/:petId/report-card` (`pets.report_cards`) `{ kind: groom | daycare, mood?, did[], note?, photoUrl?, send }` writes a `pet_visits` row (a groom card is the "last groom" the cadence counts from) and, when `send` is true, texts the owner a short summary with a private link `/visit/<token>`. The text is a **transactional** service message: shop name, one per visit, STOP line, never overnight, never to a number that replied STOP. It returns `skipped` (`no_phone`, `quiet`, `opted_out`, `no_credits`) when it did not go, and still returns the link so the shop can hand it over. `photoUrl` must be an upload under the shop's id (`POST /v1/merchants/:id/pets-uploads`). `GET /v1/public/visits/:token` (no login, `no-store`) returns the page data; 404 for an unknown token, 410 after 30 days. The photo is a short-lived signed link.

## Daycare

`GET /v1/merchants/:id/daycare/day?day=` (`pets.daycare`): the day's stays, dogs in the room against `capacity`, the ratio against staff on, packs with one day left, and for each expected dog `blocks` (why it cannot check in). `POST .../daycare/stays` `{ petId, day? }` expects a dog (idempotent per pet and day). `POST .../stays/:id/check-in` is **409 `blocked`** (with `details.blocks`) when a required vaccine is missing or expired on the day, the temperament check is not `passed` (when required), or the room is full; a manager or owner may take one more dog over capacity with `{ overrideCapacity: reason }`, never over the vaccine or temperament rule. Check-in takes a day from the owner's pack that expires first (atomic: `daysUsed < daysTotal`); with no usable pack it is a drop-in. `POST .../stays/:id/check-out` records the minutes past closing plus grace as `lateMinutes` (nothing is charged) and logs a daycare visit. `no-show` and `cancel` close an expected stay and take no pack day. `GET/POST .../daycare/packs` list and record a pack sold by hand (no platform fee, `docs/business/pricing.md`). `GET/PUT .../pets/settings`: capacity, dogs per staff, staff on, required shots (rabies, dhpp, bordetella), temperament requirement, pack sizes, closing time, grace, the automatic groom reminder switch (manager to change).

## Food cards

`food_programs` is a brand with `buyCount` (default 12) and `expiryMonths` (default 12); `food_skus` are its products with a bag weight; `food_cards` is one customer and one product: `punches` (bags in this cycle), `given` (free bags handed out), `cycleStartedAt`. State comes from `foodCardState`: counted bags (none once the cycle is older than the window), free bags owed `floor(counted / N) - given`, bags to go.

| Route | Who | Notes |
| --- | --- | --- |
| `GET/POST /v1/merchants/:id/food/programs`, `PUT .../programs/:id`, `POST .../programs/:id/skus` | staff to read, manager to change | A brand name is unique per shop (409) |
| `GET /food/cards?memberId=` | staff, `orders.manage` | The member's cards |
| `POST /food/punch` `{ memberId, skuId, qty 1 to 6, dailyGrams?, petId?, remind? }` | staff | Adds bags. A card whose window has passed starts again. `remind: true` needs the member's marketing consent (else `needsMarketingConsent: true` and no reminder); the consent is recorded with who asked and where, like the pantry reminder |
| `POST /food/cards/:id/redeem` | staff | **409 `not_earned`** with "N more bags to go" unless a free bag is owed. Atomic (optimistic on `given` and `punches`). When the card is then empty it restarts |
| `POST /food/cards/:id/undo` | staff | Takes back the last bag tapped by the same person within 10 minutes |
| `GET /food/runout`, `POST /food/runout/send` | staff | Cards with a daily amount and a yes, the day the bag runs out (`bagGrams / dailyGrams` days after the last bag) and the text date (5 days before). One text per bag. Job `pets.runout_reminders` does it at 10:00 shop time |
| `GET /v1/me/food-cards`, `PUT /v1/me/food-cards/:id/remind` | owner | The owner's own switch is their yes to the run-out text (recorded with source `pass`, audit `consent.runout`); it needs a daily amount (400) and a shop they have not muted (409 `muted`). The counter cannot switch it on: `POST /food/punch` with `remind: true` returns `needsCustomerYes` |
| `GET /public/shops/:slug/pets` | none | The food card deal and daycare packs for the shop page (`PublicPetInfoResponse`) |

Free bags are not purchases and add nothing to the count. A free bag is the same product (and so the same size) as the card, so there is no "least valued" rule to police.

## Fees and plan

All four are in Café & Retail ($39) for `pet` shops (founder default, `docs/business/pricing.md`). Packs are recorded by hand (0% platform fee); the existing 1% on online appointment deposits is unchanged.
