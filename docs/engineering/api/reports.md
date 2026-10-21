# Reports API

Contract: `packages/shared/src/api/reports.ts` (`reportsApi`). Code: `apps/api/src/routes/reports/index.ts`, `services/reports.ts`.

Auth: `manager` or `owner` of the merchant (staff → `403`). Feature: `reports.basic` (free) for everything except
retention, which needs `reports.advanced` (Plus) → `402 feature_locked`.

Range query (`rangeQuery`): `from`, `to` ISO datetimes; default last 30 days ending now; max 366 days; `400` if `from >= to`.
Ranges are half-open `[from, to)`. Money in cents. Ratios are 0–1 with 3 decimals.

### `GET /v1/merchants/:merchantId/reports/overview?from&to`
→ `OverviewReport { range, current, previous, activeMembers30d }`. `previous` is the same-length period just before `from`.
`OverviewMetrics`: `totalMembers` (as of `to`), `newMembers`, `activeMembers` (≥ 1 visit in range), `visits`,
`pointsIssued` (earn-type, not reversed), `pointsRedeemed`, `redemptions`, `redemptionRate` (redeemers ÷ active),
`revenueFromMembersCents` (purchase amounts on member visits), `avgSpendPerVisitCents`, `repeatRate` (active with 2+ visits ÷ active).

### `GET …/reports/daily?from&to`
→ `DailyReport { range, timezone, series: [{ date (local YYYY-MM-DD), visits, newMembers, pointsIssued, pointsRedeemed, revenueCents }] }`,
zero-filled for every local day in the range (chart-ready).

### `GET …/reports/top-customers?from&to&by=spend|visits|points&limit=10`
→ `{ range, by, items: TopCustomer[] }` — `memberId, name, phoneLast4, visits, spendCents, pointsEarned, balance, lastVisitAt`.
Only the last 4 phone digits are returned.

### `GET …/reports/rewards?from&to`
→ `{ range, items: RewardPerformance[] }` — every reward with `redemptions, uniqueMembers, pointsSpent, discountCents`
(void redemptions excluded), most redeemed first.

### `GET …/reports/promos`
Non-draft promos (latest 100) → `{ items: PromoResult[] }`: `views, claims` (counters on the promo),
`attributedVisits` (visits at this shop in the promo window — and its weekdays/hours if recurring),
`boostedTransactions` (ledger transactions that used the promo's boost), `liftPct` (avg daily visits during the window vs.
the 14 days before; `null` without a baseline).

### `GET …/reports/network-overlap`
"How many of my members also shop elsewhere on my strip" (last 90 days). **Aggregates only — never identities.**
→ `NetworkOverlapReport { neighbourhood, windowDays, myMembers, sharedMembers, sharedPct, avgOtherShops, shops[{ merchantId, name, vertical, sharedMembers }], suppressedShops }`.
Shops with fewer than `OVERLAP_MIN_COHORT` (5) shared members are not listed (counted in `suppressedShops`).
Merchants without a neighbourhood get zeros and `neighbourhood: null`. Free (`reports.basic`) — see the note on
`reports.advanced` below.

### `GET …/reports/activation`
→ `ActivationReport { activeMembers (≥1 visit, all time), target (ACTIVATION_THRESHOLD, 25), remaining, progressPct, activatedAt, daysSinceSignup, last30Days[{ date, newActive }] }`.

### `GET …/reports/retention?months=6` (Plus: `reports.advanced`)
→ `RetentionReport { months, cohorts: [{ cohort: "YYYY-MM", size, retention: number[] }] }` — `retention[i]` = share of the
join-month cohort with a visit `i` months later (oldest cohort first; later cohorts have shorter arrays).

Note: `FEATURES["reports.advanced"].description` mentions "network overlap"; the overlap summary is deliberately served
under the free `reports.basic` (it sells the network). Product should confirm, or move it behind `reports.advanced`.
