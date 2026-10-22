# Admin API

Contract: `packages/shared/src/api/admin.ts` (`adminApi`). Code: `apps/api/src/routes/admin/index.ts`, `services/admin.ts`,
`services/admin-audit.ts` (`writeAudit`, used by every area in this scope).

Auth: platform role `admin` on every route (`401` / `403`). Lists return `{ items, nextCursor }`.

## Network dashboard
### `GET /v1/admin/dashboard`
→ `NetworkDashboard { merchants { total, byStatus, byVertical[], byNeighbourhood[{ neighbourhoodId, name, merchants, activated }], byPlan },
activatedMerchants, activationRate, customers, multiShopCustomers, multiShopPct, memberships, weeklyVisits[8 × { weekStart, visits, activeCustomers }] }`.
`customers` = users with ≥ 1 membership; `multiShop*` = holding 2+ shops (PRD target 30%); weeks start Monday, America/Toronto.

## Feature rollout control
### `GET /v1/admin/features`
→ `{ items: AdminFeature[] }` — every `FEATURE_KEYS` entry: `stage` (DB, else default), `defaultStage`, `freeForever`,
`minPlan`, `phase`, `unlockAtMerchants`, `activeMerchants` (merchants with status `active`), `readyToUnlock`,
`overrides { enabled, disabled }`, `interestCount` (merchants that tapped "Notify me", see
`POST /v1/merchants/:merchantId/features/:key/notify` in [merchant.md](merchant.md)), `note`, `updatedBy` (user id), `updatedByName` (that user's name, else email; `null` if unknown), `updatedAt`.

### `PUT /v1/admin/features/:key/stage`
Body `{ stage: "hidden"|"beta"|"ga", note? }` → `AdminFeature`. Audit-logged as `feature.stage_changed` (`{ from, to, note }`).
**Rule:** free-forever features (`FREE_FOREVER`) can only be `ga` → `422 free_forever`. Unknown key → `404`.

### Per-merchant overrides (pilot shops)
- `GET /v1/admin/features/:key/overrides` → `{ items: FeatureOverride[] }`
- `PUT /v1/admin/features/:key/overrides` body `{ merchantId, enabled, reason? }` → `{ items }` (upsert).
  `enabled: false` on a free-forever feature → `422 free_forever`. Unknown merchant → `404`.
- `DELETE /v1/admin/features/:key/overrides/:merchantId` → `204`
An override wins over stage and plan (`isFeatureEnabled`). Audit: `feature.override_set` / `feature.override_removed`.

### `GET /v1/admin/plans`
→ `{ items: PlanAvailability[] }` — `available` = `isPlanAvailable(plan, stages)` (a paid plan is purchasable once any of its features leaves `hidden`), plus each plan's features and stages.

## Neighbourhoods (BIA info)
- `GET /v1/admin/neighbourhoods` → `{ items: AdminNeighbourhood[] }` (incl. `merchants`, `activatedMerchants`)
- `POST /v1/admin/neighbourhoods` body `{ slug (a-z0-9-), name, city?, province?, status (scouting|pilot|live)?, centerLat?, centerLng?, radiusMetres?, biaName?, biaContactName?, biaContactEmail?, biaContactPhone?, storefrontEstimate?, notes? }` → `201` · `409` slug taken
- `PATCH /v1/admin/neighbourhoods/:neighbourhoodId` partial → `AdminNeighbourhood`
- `DELETE /v1/admin/neighbourhoods/:neighbourhoodId` → `204` · `409` if it still has merchants

## Network perks
- `GET /v1/admin/perks?neighbourhoodId=` → `{ items: NetworkPerk[] }` (incl. `awards`)
- `POST /v1/admin/perks` body `{ name, neighbourhoodId? (null = network-wide), description?, ruleType = "distinct_merchants", threshold = 3, windowDays = 30, bonusPoints = 50, active = true }` → `201`
- `PATCH /v1/admin/perks/:perkId` partial
- `DELETE /v1/admin/perks/:perkId` → `{ deleted, deactivated }` (perks already awarded are deactivated, keeping history)
Perks are applied by the ledger on each visit (network-funded `network_bonus`).

## Merchants
- `GET /v1/admin/merchants?q&status&neighbourhoodId&vertical&plan&repUserId&limit&cursor` → `{ items: AdminMerchant[] }` (incl. `members`, `activeMembers`)
- `GET /v1/admin/merchants/:merchantId` → `AdminMerchantDetail` (+ staff, location count, overrides, sms usage, onboarding step)
- `POST /v1/admin/merchants/:merchantId/status` body `{ status: onboarding|active|paused|closed, reason }` → `AdminMerchantDetail`.
  Paused/closed shops can't award points or send messages. Audit: `merchant.status_changed`.

## Users
- `GET /v1/admin/users?q&platformRole&limit&cursor` — `q` matches name, email, ≥3 phone digits or member code → `{ items: AdminUser[] }`
- `PUT /v1/admin/users/:userId/role` body `{ platformRole: none|rep|admin }` → `{ id, platformRole }`.
  `400` removing your own admin role. Audit: `user.platform_role_changed`. (Role changes apply to newly issued tokens.)

## Audit log
### `GET /v1/admin/audit?merchantId&actorUserId&action&entity&from&to&limit&cursor`
`action` exact, or a prefix ending in `.` (e.g. `feature.`). Newest first → `{ items: AuditEntry[] }` (`actorName` = name or email).
