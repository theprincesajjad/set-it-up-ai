# Campaigns API (BIA neighbourhood campaigns, Phase 3)

Contract: `packages/shared/src/api/campaigns.ts` (`campaignsApi`). Product rules: `docs/business/network-monetization.md`.
Code: `apps/api/src/routes/campaigns/`, `services/campaigns.ts` (also registers the ledger visit hook).

## Who can do what

| Actor | How it's recognised | Can |
| --- | --- | --- |
| Platform admin | `platformRole = admin` | Everything, in every neighbourhood; set prices; mark paid; schedule unpaid pilots; prize draw; manage BIA managers. Not blocked by the rollout stage. |
| BIA manager | row in `neighbourhood_managers` | Create/edit/schedule/cancel campaigns, add/remove shops and read reports **for their neighbourhood only**. Gets `402 feature_locked` while `campaigns.neighbourhood` is hidden. |
| Merchant owner/manager | `merchant_staff` | See campaigns on their strip, opt in / out. Gated by `requireFeature(..., "campaigns.neighbourhood")` → `402`. |
| Customer | signed in | See live/upcoming campaigns near them and their progress. |
| Anyone | none | Public campaign page. |

## Object: `Campaign`

`id, neighbourhoodId, name, description, kind (passport|points_weekend|multiplier), status (draft|scheduled|live|ended|cancelled),
startsAt, endsAt, goalVisits, bonusPoints, multiplierPct, prize, priceCents, paid, paidAt, merchants[{id,name,slug,logoUrl}], drawnAt, createdAt`

`PublicCampaign` drops price/payment fields and adds `neighbourhood {id,name,slug}`.

---

## BIA manager / admin

### `GET /v1/me/neighbourhoods-managed`
Any signed-in user. → `{ items: ManagedNeighbourhood[], nextCursor: null }` — the neighbourhoods the caller manages
through `neighbourhood_managers` (platform admins: every neighbourhood, any status), sorted by name.
`ManagedNeighbourhood` has the same shape as `NeighbourhoodDto` (`id, slug, name, city, province, status, centerLat,
centerLng, radiusMetres, biaName, shopCount`). Empty list = not a BIA manager. Not rollout-gated. Errors: `401`.

### `GET /v1/admin/neighbourhoods/:id/merchants`
Platform admin or a manager of that neighbourhood. Every shop with `neighbourhood_id = :id` (any status, listed on the
map or not), sorted by name — for campaign shop pickers. → `{ items: NeighbourhoodMerchant[], nextCursor: null }`,
`NeighbourhoodMerchant { id, name, slug, vertical, status (onboarding|active|paused|closed), activated, activatedAt, logoUrl }`.
Errors: `400` malformed id, `401`, `403` (not that neighbourhood's manager), `404` neighbourhood.

### `GET /v1/campaigns`
BIA managers get `402 feature_locked` while `campaigns.neighbourhood` is hidden (admins always pass). The BIA console probes this list to show its "coming soon" state.
Query: `neighbourhoodId?`, `status?`, `limit`, `cursor`. → `{ items: Campaign[], nextCursor }`.
Managers see only their neighbourhoods. Errors: `401`, `403` (not a manager / other neighbourhood).

### `POST /v1/campaigns`
Body: `neighbourhoodId, name, kind, startsAt, endsAt, description?, goalVisits?, bonusPoints (default 0), multiplierPct?, prize?, priceCents?`.
`multiplierPct` (hundredths, 101–1000) is required for `multiplier`. Max 31 days. `goalVisits` and the price default
from `CAMPAIGN_PACKAGES[kind]`; only admins may set `priceCents`. → `201 Campaign` (`status: "draft"`).
Errors: `400`, `401`, `402` (hidden, non-admin), `403`, `404` neighbourhood.

### `GET /v1/campaigns/:id` · `PATCH /v1/campaigns/:id`
PATCH body: any of `name, description, startsAt, endsAt, goalVisits, bonusPoints, multiplierPct, prize, priceCents (admin)`.
Only while draft/scheduled. Errors: `403`, `404`, `409`.

### `POST /v1/campaigns/:id/schedule`
draft → scheduled (or live if already started). Managers need the campaign paid (or price 0):
otherwise `402 payment_required`. Admins can schedule unpaid pilots. Errors: `402`, `409`.

### `POST /v1/campaigns/:id/cancel`
→ cancelled. Errors: `409` already closed.

### `POST /v1/campaigns/:id/merchants`
Body `{ merchantId }`. The shop must be in the campaign's neighbourhood (`400` otherwise). Idempotent.
→ `Campaign`.

### `DELETE /v1/campaigns/:id/merchants/:merchantId`
Before the start (admins any time). → `Campaign`. Errors: `409`.

### `GET /v1/campaigns/:id/report`
→ `CampaignReport` (aggregates only, no customer PII):

| Field | Meaning |
| --- | --- |
| `window` | `startsAt` → `min(endsAt, now)` |
| `baselineWindow` | same length immediately before the start |
| `visits` / `baselineVisits` | visits at participating shops in each window |
| `visitLiftPct` | `(visits − baseline) / baseline × 100`, 1 decimal; `null` if baseline is 0 |
| `uniqueCustomers` / `baselineUniqueCustomers` | distinct customers visiting participating shops |
| `newMembers` / `baselineNewMembers` | new memberships at participating shops |
| `participants` / `completions` | customers with progress / who reached `goalVisits` |
| `bonusPointsIssued` | network-funded campaign bonus points |
| `returnedWithin30d` / `returnedWithin30dPct` | **Came back within 30 days** (below). `null` until `returnWindowEndsAt` has passed |
| `returnWindowEndsAt` | `campaign.endsAt` + 30 days; the UI shows "Available {date}" until then |
| `baselineReturnedWithin30d` / `baselineReturnedWithin30dPct` | the same measure for the same-length window before the campaign, for context |
| `perMerchant[]` | `merchantId, name, visits, baselineVisits, uniqueCustomers, newMembers` |

**Came back within 30 days (definition).** Unique customers with at least one recorded visit at a participating shop in
the campaign window (`startsAt` to `endsAt`) who have another recorded visit at **any shop in the neighbourhood** in the
30 days after `endsAt`. The percentage is that count over `uniqueCustomers`, one decimal. The baseline runs the same
measure on the window of the same length before the campaign (its 30 days overlap the event, which makes the baseline
generous and the lift conservative). It is the first measure of the OBIAA / TABIA study's "conversion rate" indicator
(event visitors converted to regular visitors), which the study found no data source for. The count is computed inside
the query; no customer id leaves the database and none is in any response. The report footer and `/for-bias` state it.

---

## Admin only

### `POST /v1/admin/campaigns/:id/mark-paid`
Body `{ paid: boolean }` (default true). → `Campaign`.

### `POST /v1/admin/campaigns/:id/draw`
Body `{ redraw?: boolean }`. After `endsAt` only. Picks a uniformly random customer who completed the campaign
(excluding the previous winner on redraw). → `DrawResult { campaignId, eligibleCount, drawnAt, winner: { firstName, maskedPhone } }`
— first name and masked phone (`(416) ***-1234`) only. Errors: `409` not ended / already drawn / nobody eligible.

### `GET /v1/admin/campaign-managers?neighbourhoodId=` · `POST /v1/admin/campaign-managers` · `DELETE /v1/admin/campaign-managers/:neighbourhoodId/:userId`
POST body `{ neighbourhoodId, userId? | email? | phone? }` → `201 { items: NeighbourhoodManager[] }`. DELETE → `204`.

---

## Merchant (owner / manager)

### `GET /v1/merchants/:merchantId/campaigns`
→ `{ items: MerchantCampaign[] }` — scheduled/live campaigns on the shop's strip (and ones ended in the last 30 days),
with `joined` and `canChange` (before start). Errors: `402`, `403`.

### `POST /v1/merchants/:merchantId/campaigns/:campaignId/join` · `DELETE .../join`
Opt in (scheduled or live, before the end) / out (before start). → `MerchantCampaign`.
Errors: `402`, `403`, `404` (not on this strip), `409`.

---

## Customers

### `GET /v1/me/campaigns`
Auth: customer. Query `lat?`, `lng?`. Scheduled/live campaigns in the customer's home neighbourhood, neighbourhoods of
shops they're a member of, near the given point, or ones they already have progress in.
→ `{ items: MyCampaign[] }` with `progress { visitedMerchantIds, visited, goal, completedAt, enteredInDraw }`.

### `GET /v1/public/campaigns/:id`
No auth. Scheduled/live/ended campaigns only (`404` for draft/cancelled). → `PublicCampaign`.

---

## Visit hook (no endpoint)

Every recorded visit (`ledger.awardPurchase`) at a participating shop during a scheduled/live campaign window:

1. Adds the shop to the customer's `campaign_progress.merchant_ids` (distinct shops).
2. If `bonusPoints > 0` and it's the first visit to that shop: posts `campaign_bonus` (`counterAccount: "network_issued"`,
   `campaignId`, idempotency key `campaign:<campaign>:<user>:<merchant>`).
3. If `multiplierPct > 100`: posts `campaign_bonus` of `floor(base × (multiplierPct/100 − 1))` where base is the visit's earn
   (idempotency key `campaign:<campaign>:visit:<visit>`).
4. Marks `completedAt` when distinct shops reach `goalVisits` (prize draw entry) and returns a message for the counter screen.


---

## Neighbourhood overview and period report (BIA console)

Auth: that neighbourhood's manager or an admin (same checks as `GET /v1/admin/neighbourhoods/:id/merchants`: `403` for anyone
else, `404` for an unknown neighbourhood). Aggregates only: no response carries a customer id, name, phone or email (tests
assert the JSON keys). `from` / `to` are ISO dates or datetimes, `to` exclusive; default is the 30 days to now; a period is
at most 366 days (`400` otherwise). The prior period is the same length immediately before.

### `GET /v1/neighbourhoods/:id/overview?from&to`
→ `NeighbourhoodOverview`:

| Field | Meaning |
| --- | --- |
| `period`, `prior` | `{ from, to }` ISO instants |
| `shops` | `live` = shops with status `active`, `members` = `neighbourhoods.biaMemberCount` (admin-entered, `null` until set), `joinedInPeriod` = shops created in the period |
| `activeMembers` | `value` = distinct shoppers with a visit at any non-closed shop on the street in the period, `delta` = change in people vs the prior period |
| `multiShopPct` | `value` = share (0 to 100, 1 decimal) of those shoppers who visited two or more shops in the period, `deltaPoints` vs prior |
| `visits` | `value` = visits at the shops in `shopsTable` (so it equals the sum of the table), `deltaPct` vs prior (`null` when prior is 0) |
| `weekly[]` | 12 weeks (Mondays, Toronto) ending with the week that holds the period end: `weekStart`, `visits`, `campaignIds` of scheduled/live/ended campaigns running that week |
| `shopsTable[]` | every non-closed shop: `id, name, status, activated, visits, newMembers` in the period |
| `gates` | `liveMonths` (whole months since the first shop activated), `activeShops` (status `active`), `activeCustomers` (visit in the last 30 days), `multiShopPct` (of those), and `thresholds` = `campaignsApi.UNLOCK_PER_NEIGHBOURHOOD` (6 months, 20 shops, 1,500 shoppers, 25%; docs/business/network-monetization.md) |

### `GET /v1/neighbourhoods/:id/report?from&to&format=json|csv`
The board report for a period. `json` (default) → `NeighbourhoodReport { neighbourhood, period, prior, generatedAt, overview,
campaigns[] }` where `campaigns` are scheduled/live/ended campaigns running in the period, each with its `CampaignReport`.
`csv` → `text/csv` attachment (`<street>-board-report-<from>-to-<to>.csv`): key numbers, one row per campaign, one row per
shop; cells that start with `= + @ -` are prefixed so a spreadsheet never runs a name as a formula. PDF is the browser's print
on `/bia/reports/print?n=<neighbourhoodId>&from&to&label` (print stylesheet, one Letter page); there is no PDF dependency.


## GET /v1/public/live-campaigns

Anonymous. Campaigns with `status = live` inside their window, soonest to end first (max 6), as `PublicCampaign[]` in `{ items }`. The `/for-shoppers` page shows the first as "on now".
