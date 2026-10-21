# Merchant API (dashboard: setup, program, customers)

Contract: `packages/shared/src/api/merchant.ts` (`merchantApi`).
Code: `apps/api/src/routes/merchant/` (`index.ts`, `team.ts`, `program.ts`, `customers.ts`),
`services/merchant.ts`, `merchant-program.ts`, `merchant-staff.ts`, `merchant-customers.ts`, `csv.ts`.

Conventions: JSON in/out, errors `{ error: { code, message, details? } }`, lists `{ items, nextCursor }`
(`nextCursor` is opaque; pass it back as `?cursor=`). Money = integer cents, points = integers, times = ISO 8601.
Malformed ids in the path return `404`.

## Roles

Every `/v1/merchants/:merchantId/...` call authorizes with `requireStaff`. Platform admins and the merchant's
own rep (`merchants.repUserId`) act as `owner`.

| Action | Min role |
| --- | --- |
| Read merchant, onboarding, features, locations, program, rewards, categories, promos, customers, activity, QR kit | `staff` |
| Notes/tags on a customer, set *own* PIN | `staff` |
| Profile, locations, program, rewards, VIP levels, categories, discount cards, promos, manual adjust, reverse, CSV export/import, team list | `manager` |
| Team invite/role/remove, someone else's PIN, API key, beta opt-in | `owner` |

`401` no/expired token · `403` not staff here / role too low · `404` resource not in this merchant.

## Feature gating

All of these are free forever; they are still checked server-side (`402 feature_locked`) so admin overrides behave
consistently: `customers.directory`, `customers.csv_export`, `customers.csv_import`, `loyalty.manual_adjust`,
`loyalty.vip_levels`, `loyalty.rewards_catalog`, `discount_cards`, `promos.basic`, `promos.double_points`
(multiplier / bonus_points promos), `loyalty.stamps` / `loyalty.visits` (switching earn type).

---

## Signup + profile

### `POST /v1/merchants`
Self-serve signup wizard. Auth: any signed-in user (becomes `owner`). Body `createMerchantBody`:
`name, vertical (VERTICALS), address, phone, city?, postalCode?, email?, neighbourhoodId? | neighbourhoodSlug?, lat?, lng?, hours?`.
Creates the merchant (`status: onboarding`, `plan: free`, unique `slug`), the owner staff row, the first location
with a unique 7-char `qrCode`, and applies `VERTICAL_TEMPLATES[vertical]` via `applyVerticalTemplate`
(program, rewards, categories incl. no-earn ones like Prescriptions, discount card that excludes them).
→ `201 MerchantDetail { merchant, role, locations, program }`.
Errors: `400` validation / invalid phone / unknown neighbourhood · `401` · `429` more than 10 shops for one account.

### `GET /v1/merchants`
Merchants the caller is staff at. → `{ items: MyMerchant[], nextCursor: null }`.

### `GET /v1/merchants/:merchantId` (staff)
→ `MerchantDetail`. `merchant.hours` mirrors the primary (first) location. `merchant.hasApiKey` boolean.

### `PATCH /v1/merchants/:merchantId` (manager)
Body `updateProfileBody` (all optional): `name, description, logoUrl, coverUrl, brandColor (#RRGGBB), email, phone,
website, instagram (leading @ stripped), hours (applied to the primary location), neighbourhoodId`. → `MerchantDetail`.

### `GET /v1/merchants/:merchantId/onboarding` (staff)
→ `OnboardingChecklist { steps[], currentStep, percentComplete, activeMembers, activationTarget, activatedAt }`.
Steps (in order) and when they're done:

| key | done when |
| --- | --- |
| `profile` | description **and** logo set, or ticked |
| `program` | program exists and is active (template does this) |
| `rewards` | ≥ 1 active reward (template does this) |
| `staff` | ≥ 2 team members, or ticked (solo owners) |
| `qr_kit` | ticked (after printing the kit) |
| `first_members` | ≥ `ACTIVATION_THRESHOLD` (25) members with a visit, or merchant activated |

### `POST /v1/merchants/:merchantId/onboarding/complete` (manager)
Body `{ step: "profile"|"program"|"rewards"|"staff"|"qr_kit" }`. → updated `OnboardingChecklist`.

### `GET /v1/merchants/:merchantId/features` (staff)
→ `MerchantFeaturesResponse { plan, betaOptIn, features: MerchantFeature[], plansAvailable }`.
Dashboard rule: `enabled` → show; `lockedReason: "plan"` → show locked with upsell; `lockedReason: "rollout"` with
`stage: "hidden"` → hide; `stage: "beta"` → "coming soon / join beta".

### `PUT /v1/merchants/:merchantId/beta` (owner)
Body `{ optIn: boolean }`. → `MerchantFeaturesResponse`.

### `GET /v1/merchants/:merchantId/qr-kit` (staff)
→ `QrKit { merchant, program { name, terminology, headline }, locations[{ id, name, address, qrCode, joinUrl, qrSvg }], staffScript }`.
`joinUrl = ${PUBLIC_WEB_URL}/j/<qrCode>`; `qrSvg` is a print-ready SVG string. Tick `qr_kit` after printing.

### API key (owner) — for the integrations team
- `GET /v1/merchants/:merchantId/api-key` → `{ configured: boolean }`
- `POST /v1/merchants/:merchantId/api-key` → `201 { apiKey }` (`llk_…`, shown **once**; rotating invalidates the old key)
- `DELETE /v1/merchants/:merchantId/api-key` → `204`

Only `sha256(apiKey)` is stored (`merchants.api_key_hash`). Server-side lookup: `verifyMerchantApiKey(db, key)` in
`services/merchant.ts`.

---

## Locations (unlimited, free)

- `GET /v1/merchants/:merchantId/locations` (staff) → `{ items: Location[] }`
- `POST …/locations` (manager) body `createLocationBody { name, address, city?, postalCode?, lat?, lng?, phone?, hours? }` → `201 Location` (new unique `qrCode`)
- `PATCH …/locations/:locationId` (manager) body: same fields + `active` → `Location`
- `DELETE …/locations/:locationId` (manager) → `204`. Deactivates (history references it). `409` if it's the last active location.
- `POST …/locations/:locationId/rotate-qr` (manager) → `Location` with a new `qrCode` (old stand stops working).

`hours`: `{ mon: [["09:00","17:00"]], sun: [] }` (days `sun..sat`, 24h `HH:MM`, missing day = closed).

## Team

- `GET /v1/merchants/:merchantId/team` (manager) → `{ items: StaffMember[] }` (`userId, name, email, phone, role, hasPin, createdAt`)
- `POST …/team` (owner) body `{ email? , phone?, name?, role = "staff" }` (email or phone required) → `201 StaffMember`.
  Finds or creates the user and sends a transactional invite (email, else SMS). `409` already on the team.
- `PATCH …/team/:userId` (owner) body `{ role }` → `StaffMember`. `409` demoting the last owner.
- `DELETE …/team/:userId` (owner) → `204`. `409` removing the last owner.
- `PUT …/team/:userId/pin` (owner for anyone; anyone for themselves) body `{ pin: "4–6 digits" }` → `204`.
  bcrypt-hashed; `409` if another team member already uses that PIN. (Same hashing as `PUT /merchants/:id/staff-pin` in auth.)

---

## Loyalty program

### `GET /v1/merchants/:merchantId/program` (staff) → `LoyaltyProgram`
### `PATCH /v1/merchants/:merchantId/program` (manager)
Body `updateProgramBody` (all optional): `name, earnType (per_dollar|per_visit|stamps), pointsPerDollar, pointsPerVisit,
minSpendCents, stampGoal, terminology (points|stamps|stars), welcomeBonus, birthdayBonus, referralBonus,
expiryMonths (null = never, else ≥ 12), visitCooldownMinutes, termsText, active`.
→ `LoyaltyProgram` incl. `expiryDisclosure` (show next to every balance).
Errors: `400` expiry < 12 months, per_dollar with 0 pts/$, visit/stamps with 0 pts/visit, stamps with `stampGoal` 0 · `403` staff.

### Rewards catalog
- `GET …/rewards` (staff) → `{ items: Reward[] }` sorted by `sortOrder`, cost
- `POST …/rewards` (manager) body `{ name, pointsCost, rewardType (amount_off|percent_off|free_item|custom), value, maxDiscountCents?, description?, catalogItemId?, imageUrl?, active?, sortOrder? }` → `201 Reward`.
  `value` = cents for `amount_off`, 1–100 for `percent_off`.
- `PATCH …/rewards/:rewardId` (manager) partial → `Reward`
- `DELETE …/rewards/:rewardId` (manager) → `{ deleted, archived }` (rewards with redemptions are deactivated instead)

### VIP levels
- `GET …/vip-levels` (staff) → `{ items: VipLevel[] }` (incl. `memberCount`)
- `POST …/vip-levels` (manager) `{ name, thresholdPoints (lifetime), multiplierPct = 100 (100–500), perks? }` → `201 VipLevel`
- `PATCH …/vip-levels/:levelId`, `DELETE …/vip-levels/:levelId` (manager). Members are re-levelled on every change (no points change).

### Categories (no-earn rules)
- `GET …/categories` (staff) → `{ items: Category[] }` (`earnEligible, discountEligible, protected`)
- `POST …/categories` (manager) `{ name, earnEligible?, discountEligible?, externalIds? }` → `201`
- `PATCH …/categories/:categoryId`, `DELETE …/categories/:categoryId` (manager)

**Regulated categories** (`protected: true`): names matching prescriptions / Rx / pharmacy services / dispensing /
tobacco / vape / lottery / gift cards. They default to no-earn/no-discount and:
- can't be made `earnEligible` or `discountEligible` → `422 no_earn_category` (Ontario: no inducements on prescriptions or pharmacy services)
- can't be renamed to an unregulated name or deleted → `422 no_earn_category`
- can't be targeted by multiplier/bonus promos (or discount promos) → `422 no_earn_category`

Delete also `409` if catalog items or promos use the category.

### Discount cards
- `GET …/discount-cards` (staff), `POST` (manager) `{ name, percentOff?, amountOffCents?, terms?, eligibility (everyone|seniors|students|members_only|vip), excludedCategoryIds?, active? }`, `PATCH …/:cardId`, `DELETE …/:cardId`.
- Categories with `discountEligible: false` are **always** added to `excludedCategoryIds`. `400` if neither percent nor amount set.

### Promos
- `GET …/promos?status=` (staff) → `{ items: Promo[] }`; `GET …/promos/:promoId`
- `POST …/promos` (manager) body `createPromoBody`: `title, body?, imageUrl?, kind (offer|multiplier|bonus_points|discount|event),
  multiplierPct? (>100), bonusPoints?, percentOff?, itemId?, categoryId?, daysOfWeek? (0=Sun), startTime?/endTime? (HH:MM local),
  startsAt, endsAt?, audience (network|members|vip), publish = false` → `201 Promo`
  (`publish: true` → `live` if started, else `scheduled`; otherwise `draft`).
- `PATCH …/promos/:promoId` (manager): draft/scheduled → any field; live → only `title, body, imageUrl, endsAt` (`409` otherwise); ended/archived → `409`.
- `POST …/promos/:promoId/status` (manager) `{ status }`. Allowed (`PROMO_TRANSITIONS`):
  `draft → scheduled|live|archived`, `scheduled → draft|live|ended|archived`, `live → ended`, `ended → archived`.
  Else `409 invalid_transition` (`details.allowed`). Going `live` early sets `startsAt = now`; `ended` sets `endsAt = now`;
  `scheduled` with a past start becomes `live`.
- `DELETE …/promos/:promoId` (manager) → `204` drafts only (`409` otherwise — archive instead).
- Job `promos.lifecycle` moves scheduled → live at `startsAt` and → ended after `endsAt`.
Validation (`400`): multiplier needs `multiplierPct`, bonus_points needs `bonusPoints`, discount needs `percentOff`, end after start.

---

## Customers directory

### `GET /v1/merchants/:merchantId/customers` (staff)
Query `listCustomersQuery`: `q` (name / email / ≥3 phone digits / member code), `phoneLast4`, `tag`, `vipLevelId`,
`vip=true|false`, `lapsedDays` (no visit in N days, incl. never), `rewardAvailable=true|false`,
`sort = recent|joined|balance|visits|spend|name`, `limit` (≤ 200), `cursor`.
→ `{ items: CustomerSummary[], nextCursor }`. `marketingConsent` = consent given **and** not muted.

### `GET …/customers/:memberId` (staff)
→ `CustomerDetail { customer (+ birthday, notes, marketingConsentAt, marketingConsentSource), transactions (last 100), visits (last 50), redemptions (last 50) }`.

### `PATCH …/customers/:memberId` (staff)
Body `{ notes?, tags? }` (tags lower-cased, de-duplicated). → `CustomerDetail`.

### `POST …/customers/:memberId/adjust` (manager)
Body `{ points (≠ 0, signed), reason (required), idempotencyKey? }` or header `Idempotency-Key`.
→ `{ transaction, balance, duplicate }`. Goes through `ledger.adjustPoints`. `409 insufficient_points` if it would go negative.

### `GET /v1/merchants/:merchantId/activity` (staff)
Ledger feed. Query `from?, to?, type?, memberId?, limit, cursor` → `{ items: ActivityItem[], nextCursor }`.

### `POST …/activity/:transactionId/reverse` (manager)
Body `{ reason }` → `{ transaction (the reversal), balance }`. `409` already reversed · `400` reversing a reversal.

### CSV export (manager)
- `GET …/customers/export.csv` (same filters as the list) → `text/csv` attachment. Columns:
  `member_id,name,phone,email,member_code,balance,lifetime_points,visits,total_spend,last_visit_at,joined_at,joined_via,vip_level,tags,birthday,marketing_consent_at,muted,notes`
- `GET …/activity/export.csv?from&to&type&memberId` → `transaction_id,created_at,member_id,customer_name,phone,type,source,points,amount,eligible_amount,description,location_id,staff_user_id,reverses_transaction_id,reversed_at,external_ref`

Money columns are dollars with 2 decimals. Text cells starting with `= + - @` are prefixed with `'` (formula injection).

### `POST …/customers/import` (manager) — migrate from another loyalty app
Body `{ csv: string, dryRun = false, sourceName? }`. Header row required; columns (case-insensitive):
`phone` (required), `name`, `email`, `points`, `visits`, `birthday` (YYYY-MM-DD), `consent`, `consent_date`.
Per row: one network identity per phone (`findOrCreateCustomerByPhone`), membership via `ensureMember`
(`joinedVia: import`, **no welcome bonus**), opening balance via a ledger `import` transaction with idempotency key
`import:<E.164 phone>` — re-running a file never doubles balances. `visits` is recorded in the transaction breakdown
only (imported visits don't count toward activation).
**CASL:** marketing consent is imported only when `consent` is truthy **and** `consent_date` is a valid past date;
otherwise the row imports without consent and gets a warning.
→ `ImportCustomersResult { dryRun, rows, membersCreated, membersExisting, pointsImported, duplicates, consentRecorded, errors[{row,message}], warnings[] }`
(`row` is 1-based, header excluded). `400` no phone column / > 20,000 rows.
