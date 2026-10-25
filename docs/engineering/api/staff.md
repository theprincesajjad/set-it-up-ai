# Staff counter API (`/v1/merchants/:merchantId/counter/...`)

Contract: `packages/shared/src/api/staff.ts` (`staffApi`). Code: `apps/api/src/routes/staff`, `apps/api/src/services/staff.ts`.

Used by the staff app's counter mode and the customer-facing kiosk tablet. Target: award round trip ≤ 5 s on poor Wi-Fi.

**Auth**: a staff access token for this merchant (any role unless noted). Admins and the merchant's own rep also pass.
`401` without a token, `403` for staff of other merchants and for customers, `404` for an unknown/malformed merchant id.
For a shared device, switch staff with `POST /v1/merchants/:merchantId/staff-pin/verify` ([auth.md](auth.md)) and use the returned token.

**Isolation**: everything is scoped to `:merchantId`. A phone, member code or member id that belongs only to another merchant resolves to "no match" / `404`. Phones are always masked: `(416) ***-1234`.

**Idempotency**: `award` and `redeem` **require** an idempotency key: the `idempotencyKey` body field or the `Idempotency-Key` header (8-128 chars).
Generate one UUID per tap and reuse it for every retry, including when the tap is later replayed from the offline queue: the same key online and in `/sync` is the same award.

## MemberSummaryDto

```json
{
  "memberId": "uuid", "name": "Pat Q", "maskedPhone": "(416) ***-7788", "memberCode": "K7QX2M9P",
  "balance": 60, "terminology": "points", "visitCount": 4, "lastVisitAt": "...", "joinedAt": "...",
  "vip": { "id": "uuid", "name": "Gold", "multiplierPct": 150, "perks": null },
  "rewardsAffordable": [{ "id": "uuid", "name": "$5 off", "pointsCost": 50 }],
  "nextReward": { "rewardId": "uuid", "name": "$20 off", "pointsCost": 200, "pointsNeeded": 140, "progressPct": 30 },
  "discountCards": [{ "id": "uuid", "name": "Seniors 10%", "percentOff": 10, "amountOffCents": 0, "terms": "Front store only", "eligibility": "seniors" }],
  "openRedemptionCount": 1,
  "marketingConsent": true,
  "expiryDisclosure": "Points never expire."
}
```

`openRedemptionCount > 0` means the customer has an app-issued reward code waiting: ask for it and call `redemptions/verify`.

Pricing v2: `vip` is `null` and `discountCards` is `[]` when the shop doesn't have `loyalty.vip_levels` / `discount_cards` (Plus). Earn at the counter also skips promo boosts and VIP multipliers then.

## GET .../counter/lookup?q=

`q` is detected automatically:

| Input | Matched by | Result |
| --- | --- | --- |
| `LL:K7QX2M9P` (scanned QR) or `K7QX2M9P` (8-char code, any case) | `member_code` | 0-1 member |
| `4165557788`, `(416) 555-7788`, `+14165557788` | `phone` | 0-1 member |
| `7788` (exactly 4 digits) | `last4` | up to 10 members, most recent visit first |

`200` → `{ matchedBy, items: MemberSummaryDto[], normalizedPhone }`. `normalizedPhone` is set only for a phone lookup with no member, so the UI can offer "Award & join" for a new customer.
Errors: `400` (anything else).

## POST .../counter/award

Body: exactly one of `phone`, `memberCode` (or scanned `LL:` payload), `memberId`; plus

| Field | Type | Notes |
| --- | --- | --- |
| `amountCents` | int ≥ 0 | Purchase total. Omit for visit/stamp programs. Ignored when `lines` given. |
| `lines` | `[{ amountCents, categoryId?, itemId?, quantity? }]` | Itemised so no-earn categories (prescriptions, alcohol, tobacco, lottery, gift cards) are excluded. |
| `locationId` | uuid | The counter's location (recommended). |
| `customerName` | string | Used only when the phone is new to the network. |
| `consent` | `{ text }` | Customer said yes to marketing at the counter. Staff must show/read the exact text. Stored with source `counter_staff`. |
| `quantity` | int 1-10 | Visit/stamp programs only: items in this visit (two coffees = 2). Awards `quantity × pointsPerVisit` as **one** transaction and **one** visit; the cooldown is checked once. Ignored for `per_dollar`. Default 1. |
| `idempotencyKey` | string | Required (or header). |

A new phone creates the network customer and joins them (welcome bonus applies). A scanned member code of a customer new to this shop joins them too.
Awards to a merged duplicate are forwarded to the member it was merged into.

`200` → `AwardResponse`

```json
{
  "member": { "...": "MemberSummaryDto" },
  "memberCreated": false, "duplicate": false, "transactionId": "uuid",
  "pointsEarned": 12, "extraPoints": 0, "balance": 48,
  "breakdown": ["1 pt/$ on $12.50", "$40.00 excluded (no-earn)"],
  "eligibleCents": 1250, "excludedCents": 4000,
  "rewardsAvailable": [{ "id": "uuid", "name": "$5 off", "pointsCost": 50 }],
  "messages": ["Strip explorer: +25 bonus points from the neighbourhood"],
  "receiptQueued": true
}
```

`duplicate: true` means this key was already processed: show the same success screen, nothing was awarded twice.
`messages` are network perk / campaign notes to show staff. `transactionId` is `null` when nothing was earned (e.g. a $0.50 purchase).

**What happens inside the request, and what does not.** The award is the ledger write plus what the response needs, in one DB transaction: the stamp (earn, visit, member counters, VIP level), neighbourhood perks and campaign bonuses (they add points, so they are part of the result), and one `outbox_events` row. A steady-state stamp is **18 statements** (down from 75; numbers below) and the counter's server time is tens of milliseconds. Everything the customer or the shop hears about afterwards is delivered from the after-commit **outbox** (`services/outbox.ts`), not in the request:

- notifications and the inbox row (`points_earned`, `reward_ready`, `passport_progress`) with their push / SMS / email fallbacks and the routine-push budget,
- the wallet pass update (APNs, Google object),
- onboarding milestones and shop activation, ad-visit attribution.

The event is written in the same transaction as the ledger rows (so a crash between "committed" and "notified" cannot lose it, and a refused or repeated stamp leaves none), then delivered right after the commit on the next tick of the same process (**fast path**, normally well under a second) and, for anything that failed or was left behind by a crash, by the `outbox.drain` job every 5 s. Delivery is at-least-once, one member at a time in order, and per step idempotent: a retry never repeats a notification that already went out. See [notifications.md](notifications.md#delivery-the-after-commit-outbox).

**Measured** (`pnpm --filter @ll/api load -- --label x --customers 600 --users 1,50`, the demo seed at the café; add `--pg postgres://...` for a real server and `--trace` to print every statement; the award latency is the `award` line, the lookup is reported separately):

| | before (listeners and bookkeeping in the request) | after (outbox) |
| --- | --- | --- |
| Statements per award | 75 | 18 for a regular; 26 for the first stamp of a live passport campaign (it also posts the network-funded bonus as a second ledger transaction) |
| Statements per lookup | 11 | 6 to 7 |
| Statements per award, moved to the outbox | n/a | 20 to 32 (notifications 2 x ~11, wallet pass, milestones, ad attribution, step bookkeeping) |
| PostgreSQL 16, 1 user: award p50 / p95 | 66 / 89 ms | 32 / 46 ms (25 / 35 ms with delivery running alongside) |
| PostgreSQL 16, 50 users: award p50 / p95 | 909 / 1301 ms | 442 / 562 ms (430 / 543 ms with delivery alongside) |
| PGlite, 1 user: award p50 / p95 | 88 / 109 ms | 48 / 68 ms |
| PGlite, 50 users: award p50 / p95 | 1330 / 7183 ms | 931 / 1255 ms (1695 / 8359 ms with delivery alongside) |

PostgreSQL here is a local 16 with a pool of 10 (the production driver), `fsync` off, on the same 4-core machine as the API and the load generator. PGlite runs one statement at a time, so its 50-user figures are queueing behind everyone else's statements, and the delivery the outbox moves out of the request still competes for that one connection (the last PGlite figure is the saturated worst case: the same work, delivered alongside). Use the PostgreSQL rows for latency; the PGlite rows are for counting statements. `test/award-latency.test.ts` runs one stamp for a single user and fails above 20 statements (28 for the campaign-bonus stamp, 8 for the lookup) or if the median server time passes 300 ms, and checks that no notification, wallet, milestone or ad-attribution statement is in the request.

**SMS receipt**: when the merchant enabled receipts (`merchants.sms_receipts_enabled`, default off) and the member has not muted the shop, a transactional SMS is sent after the award commits, outside the DB transaction, without delaying the response:
`You earned 12 points at Roncy Cafe. Balance 48. Reply STOP to opt out`. Each send is logged in `message_deliveries` (`kind: "transactional"`).

Errors: `400` (validation, missing key, bad phone, unknown location), `404` (member / member code), `409 cooldown` (visit/stamp program: same member within `visitCooldownMinutes`, message says how long to wait), `409 conflict` (program not set up, shop paused).

## POST .../counter/redeem

Body `{ memberId, rewardId, subtotalCents?, locationId?, idempotencyKey }`. `subtotalCents` (eligible subtotal) computes percent-off discounts.
`200` → `CounterRedemptionResponse` `{ redemption: { id, code, status: "used", discountCents, reward: { id, name, pointsCost, rewardType, value }, transactionId, createdAt, usedAt }, member, duplicate }`.
Errors: `404` (member/reward), `409 insufficient_points`.

## POST .../counter/redemptions/verify

For codes customers issued in the app (`POST /v1/me/memberships/:id/redeem`). Body `{ "code": "7KQ2XM" }` (case-insensitive).
Marks the code `used` exactly once. `200` → `CounterRedemptionResponse`.
Errors: `404` (no such code **at this merchant**), `409 already_used`, `409 void` (cancelled by the customer, reversed or expired and refunded),
`409 redemption_expired` (app-issued code past its `expiresAt`, 10 minutes after issue; the customer's points are refunded and they can redeem again).

## GET .../counter/today?locationId=

Merchant-local day (merchant timezone). `200` → `{ date: "2026-11-03", visitCount, newMembers, pointsIssued, redemptions, items: CounterVisitDto[] }`
with up to 200 most recent visits `{ visitId, memberId, name, maskedPhone, locationId, points, amountCents, source, createdAt }`.

## GET .../counter/activity?locationId=&limit=

Recent ledger activity (default 25, max 100). `200` → `{ items: ActivityItemDto[] }` with
`{ transactionId, memberId, name, maskedPhone, type, source, points, amountCents, description, staffUserId, staffName, locationId, reversed, canUndo, createdAt }`.
`canUndo` already applies the rules below for the caller: show the Undo button only when true.

## POST .../counter/transactions/:transactionId/undo

Body `{ "reason"?: "Wrong customer" }`. Undoes an `earn` or `redeem`:
- `staff` role: only their own transaction, within 15 minutes.
- `manager` / `owner`: any time.

The points are reversed with a `reversal` ledger transaction (never edited); for awards, the visit is removed so visit counts and cooldowns are correct; for redemptions, the code becomes `void`.
`200` → `{ reversalTransactionId, member: MemberSummaryDto }`.
Errors: `400` (not an earn/redeem), `403` (outside your window — ask a manager), `404`, `409` (already reversed).

## POST .../counter/sync (offline queue)

The counter app queues taps while offline and replays them here. Body `{ events: SyncEvent[] }` (1-100 events):

```json
{ "events": [
  { "type": "award", "idempotencyKey": "uuid-1", "occurredAt": "2026-11-03T14:41:00-05:00", "phone": "4165557788", "amountCents": 1500, "locationId": "uuid" },
  { "type": "redeem", "idempotencyKey": "uuid-2", "occurredAt": "2026-11-03T14:45:00Z", "memberId": "uuid", "rewardId": "uuid" }
] }
```

Award events take the same fields as `/award` (including `quantity`); redeem events the same as `/redeem`; both need `idempotencyKey` and `occurredAt` (ISO with offset).
Events are processed **in order**, each on its own; one failure never blocks the rest.

`200` → `SyncResponse`

```json
{ "results": [
    { "idempotencyKey": "uuid-1", "type": "award", "status": "ok", "result": { "...": "AwardResponse" } },
    { "idempotencyKey": "uuid-2", "type": "redeem", "status": "error", "error": { "code": "insufficient_points", "message": "..." } }
  ],
  "summary": { "ok": 1, "duplicate": 0, "error": 1 } }
```

- `duplicate`: already processed (online or by an earlier sync). Remove it from the queue.
- `error` with `code: "internal"`: retry later. Any other error code is final: remove it from the queue and show it to staff.
- Cooldown (visit/stamp programs) is judged on `occurredAt`, against the member's last visit and earlier events in the batch (`409 cooldown` result).
- Events with `occurredAt` more than 5 minutes in the future (`bad_request`) or older than 7 days (`too_old`) are rejected.

## POST .../counter/kiosk/check-in

Customer-facing tablet (Square-style): the customer types their phone. The tablet is signed in as staff.
Body `{ phone, locationId, consent?: { text }, idempotencyKey? }`.

- Visit and stamp programs (with no minimum spend): joins if needed and awards a visit. Cooldown applies → `409 cooldown`.
- Per-dollar programs: joins/recognises only (`outcome: "enrolled"`); points are earned at the till.

`200` → `KioskCheckInResponse`

```json
{ "memberCreated": false, "outcome": "visit", "pointsEarned": 1, "balance": 7, "terminology": "stamps",
  "firstName": "Sam", "maskedPhone": "(647) ***-0199",
  "nextReward": { "rewardId": "uuid", "name": "Free drink", "pointsCost": 10, "pointsNeeded": 3, "progressPct": 70 },
  "rewardsAvailable": [], "expiryDisclosure": "Stamps never expire.",
  "message": "Thanks Sam! +1. You have 7 stamps." }
```

Only the first name and a masked phone are returned (the screen faces customers). Consent is stored with source `kiosk`.
Errors: `400` (phone, location not at this merchant), `401`, `403`, `409 cooldown`, `409 conflict` (program not set up / paused).

## POST .../counter/members/merge (manager+)

Body `{ sourceMemberId, targetMemberId, reason }`. Folds the duplicate (`source`) into `target`.

How it works (ledger rule 1 — points only move through `ledger.ts`, history is never rewritten):
1. The source's balance `B` moves with two balanced `adjust` transactions posted with `postTransaction`:
   source `-B` and target `+B`, both against the merchant's `merchant_issued` account, which therefore nets to zero.
   Idempotency keys `merge:<sourceId>:out|in`.
2. The source's ledger history stays on the source for audit; its balance is now `0` and still equals the sum of its entries.
3. Visits are re-pointed to the target; visit count, spend and lifetime points are added to the target; VIP level is recomputed; marketing consent is copied only if the target had none.
4. The source is tagged `merged` and `merged_into:<targetId>`, muted, consent cleared, hidden from lookups and wallets. Future awards to its phone or QR are forwarded to the target.
5. `audit_logs` gets `member.merged`.

`200` → `{ target: MemberSummaryDto, movedPoints, movedVisits, transferTransactionIds }`.
Errors: `400` (same member twice), `403` (staff role), `404` (either member not at this merchant), `409` (already merged).

Limitation: this merges two **memberships at one shop**. It does not merge the two network identities (users) across shops; that is an admin operation.
App-issued codes still pending on the source keep working at the counter.
