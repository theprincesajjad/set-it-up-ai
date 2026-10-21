# Commerce API (Plus: catalog, order-ahead, pickup slots, bookings)

Contract: `packages/shared/src/api/commerce.ts` (`commerceApi`). Code: `apps/api/src/routes/commerce/`,
`services/catalog.ts`, `services/orders.ts`, `services/bookings.ts`, `services/tax.ts`, `services/counters.ts`,
`services/commerceShared.ts`, `jobs/commerce.ts`. Public menu/slots: see `public.md`. Payments: see `payments.md`.

Money is integer cents (CAD). Timestamps are ISO-8601. Errors use `{ error: { code, message, details? } }`;
validation failures are `400 bad_request` with `details: [{ path, message }]`. Lists return `{ items, nextCursor }`
(pass `cursor=<nextCursor>`; `null` = last page).

## Feature gating

Every merchant endpoint is gated server-side with `requireFeature`. Locked → `402 feature_locked`,
`details: { feature, reason }` where `reason` is `"rollout"` (feature still `hidden`, or `beta` and the merchant
hasn't opted in; applies **even on Pro**) or `"plan"` (plan too low; Free never gets paid features).

| Endpoints | Feature key | Plan |
| --- | --- | --- |
| catalog, orders, public menu, `POST /v1/me/orders` | `orders.order_ahead` | Plus |
| "ready" / "accepted" notifications | `orders.pickup_status` (if off, the status still changes but nothing is sent) | Plus |
| `paymentMethod: "in_app"` | `payments.in_app` + a Connect account with charges enabled | Plus |
| pickup slots/bookings (`kind=pickup`), `slotId` on orders | `booking.pickup_slots` | Plus |
| drop-off / appointment slots (`kind=dropoff|appointment`) | `booking.dropoff_scheduling` | Pro |
| custom staff permission lists | `staff.permissions` | Pro |

## Roles and permissions

`requireStaff(minRole)` first, then a granular permission. Owners, platform admins and the merchant's rep always pass.
Role defaults: **staff** = `orders.manage, bookings.manage, tickets.manage, quotes.send, invoices.manage`;
**manager/owner** = everything (`catalog.manage, orders.refund, invoices.void` too). When `staff.permissions` is
enabled and `merchant_staff.permissions` is set, that list replaces the role defaults. Missing → `403 forbidden`
(`"Missing permission: <perm>"`).

## Objects

- `CatalogItem`: `id, merchantId, categoryId, name, description, priceCents, imageUrl, modifiers[{ name, options[{ name, priceCents }] }], available, orderable, sortOrder, createdAt`
- `CatalogCategory`: `id, name, earnEligible, discountEligible` (`earnEligible=false` = no-earn category: never earns, never discounted)
- `Order`: `id, merchantId, merchantName, locationId, userId, number, status, pickupAt, notes, subtotalCents, discountCents, taxCents, tipCents, totalCents, platformFeeCents, paymentMethod (in_app|at_pickup), paymentStatus (unpaid|requires_action|paid|refunded|failed), redemptionId, pointsEarned, readyAt, pickedUpAt, paidAt, cancelReason, createdAt, items[OrderItem], customer?{name, phone}` (customer only on merchant endpoints)
- `OrderItem`: `id, catalogItemId, name, quantity, unitPriceCents (base + modifiers), modifiers[{ name, option, priceCents }], categoryId, lineTotalCents`
- `Slot`: `id, merchantId, locationId, kind (pickup|dropoff|appointment), startsAt, endsAt, capacity, booked, remaining`
- `Booking`: `id, slotId, merchantId, merchantName, userId, orderId, ticketId, status (booked|cancelled|completed|no_show), kind, startsAt, endsAt, locationId, notes, reminderSentAt, createdAt`

## Pricing rules (server-side only)

The client sends item ids, quantities and modifier names. **Prices sent by the client are ignored.**

1. `unitPriceCents = item.priceCents + Σ selected option priceCents`; one option per modifier group (matched case-insensitively).
2. `subtotal = Σ unit × quantity`.
3. Reward (`redeemRewardId`): the points are redeemed through the ledger immediately. Discount applies only to lines whose category is discount- and earn-eligible: `amount_off` = min(value, eligible subtotal); `percent_off` = round(eligible × pct); `free_item` = unit price of the reward's item (must be in the order); `custom` rewards → `400` (counter only). Capped by `maxDiscountCents`.
4. Tax on `subtotal − discount` by province (`services/tax.ts`; from the merchant's neighbourhood, default **ON HST 13%**), rounded half-up per component. Tips are not taxed.
5. `total = subtotal − discount + tax + tip`.
6. `platformFeeCents = round(total × 75 / 10000)` for `in_app` orders (Stripe `application_fee_amount`); `0` for `at_pickup`.

Example: 2 × Latte Large (525 + 75) + Croissant 375 + Lotto 300 (no-earn) with a $5-off reward and $2 tip →
subtotal 1875, discount 500, HST 179, total 1754, platform fee 13.

## Order lifecycle

`pending → accepted → preparing → ready → picked_up`; `accepted → ready` allowed; `cancelled` from any open status;
`picked_up → refunded` via the refund endpoint. In-app orders can't move past `pending` until paid
(`409 awaiting_payment`) and are hidden from the default queue until paid.

- **ready**: sets `readyAt`; push to every device + SMS (transactional, no marketing consent needed): `Your order #12 is ready for pickup at <Shop>`.
- **picked_up**: sets `pickedUpAt`; `at_pickup` orders become `paid`. Points are awarded once via `ledger.awardPurchase` with one line per item (post-discount, with category so no-earn categories apply) and idempotency key `order:<id>`. `pointsEarned` is set.
- **cancelled**: reason required (shown to the customer). Paid in-app orders are refunded; redeemed reward points are returned (ledger reversal); slot booking cancelled; customer notified.
- **refunded**: money back (in-app), earned points reversed, redeemed points returned.

---

## Catalog (merchant)

### `GET /v1/merchants/:merchantId/catalog`
Staff+. → `{ categories: CatalogCategory[], items: CatalogItem[] }` (all items, including archived).

### `POST /v1/merchants/:merchantId/catalog/items`
Manager+, `catalog.manage`. Body: `name, priceCents, description?, categoryId?, imageUrl?, modifiers? ([] default), available? (true), orderable? (true), sortOrder? (0)`.
→ `201 CatalogItem`. Errors: `400` (unknown category, duplicate modifier group/option), `402`, `403`.

### `PATCH /v1/merchants/:merchantId/catalog/items/:itemId`
Manager+. Any subset of the create fields. → `CatalogItem`. Errors: `400`, `404`.

### `DELETE /v1/merchants/:merchantId/catalog/items/:itemId`
Manager+. Archives (`available=false, orderable=false`; kept for past receipts). → `CatalogItem`.

### `POST /v1/merchants/:merchantId/catalog/categories` · `PATCH .../catalog/categories/:categoryId`
Manager+. Body: `name, earnEligible? (true), discountEligible? (true)`. → `201 CatalogCategory` / `CatalogCategory`.

## Orders (merchant)

### `GET /v1/merchants/:merchantId/orders`
Staff+. Query: `status` (comma-separated; default `pending,accepted,preparing,ready`), `locationId?`,
`includeUnpaid` (`true` to include in-app orders awaiting payment), `limit` (≤200, default 50), `cursor`.
Newest first. → `{ items: Order[], nextCursor }`.

### `GET /v1/merchants/:merchantId/orders/:orderId`
Staff+. → `Order`. `404` for other merchants' orders.

### `POST /v1/merchants/:merchantId/orders/:orderId/status`
Staff+, `orders.manage`. Body: `{ status: "accepted"|"preparing"|"ready"|"picked_up"|"cancelled", reason? }` (`reason` required for cancelled).
→ `Order`. Errors: `400` (no reason), `409` (`conflict` invalid transition / concurrent update, `awaiting_payment`).

### `POST /v1/merchants/:merchantId/orders/:orderId/refund`
Manager+, `orders.refund`. Body: `{ reason }`. Only `picked_up` orders. → `Order` (`status: "refunded"`). Errors: `409`.

## Orders (customer)

### `POST /v1/me/orders`
Signed in. Body (`placeOrderBody`):

```json
{
  "merchantId": "uuid", "locationId": "uuid",
  "items": [{ "catalogItemId": "uuid", "quantity": 2, "modifiers": [{ "name": "Size", "option": "Large" }] }],
  "pickupAt": "2026-11-03T16:30:00Z", "slotId": null,
  "tipCents": 200, "redeemRewardId": "uuid", "notes": "Oat milk please",
  "paymentMethod": "in_app", "idempotencyKey": "client-generated-uuid"
}
```

`idempotencyKey` (8–100 chars) is required; the `Idempotency-Key` header works too. Retrying with the same key returns
the same order (`200`, `duplicate: true`) and the same payment client secret. `pickupAt` must be within 14 days; with
`slotId` the slot's start becomes `pickupAt` and a booking is created.

→ `201 { order: Order, payment: { paymentIntentId, clientSecret, amountCents } | null, duplicate }`.
For `in_app`, confirm `clientSecret` with Stripe (Payment Element); the order becomes `paid` when the
`payment_intent.succeeded` webhook arrives (poll `GET /v1/me/orders/:id`).

Errors: `400` (unknown item/modifier/location, reward not applicable, pickup time, total < $0.50 by card),
`402` (feature locked), `404` (merchant, reward), `409` (`item_unavailable`, `payments_not_set_up`, `insufficient_points`,
`slot_full`, shop paused), `502 payment_error`.

### `GET /v1/me/orders` · `GET /v1/me/orders/:orderId`
Signed in. Query: `limit`, `cursor`. → `{ items: Order[], nextCursor }` / `Order`. Only the caller's orders (`404` otherwise).

### `POST /v1/me/orders/:orderId/cancel`
Body: `{ reason? }`. Only while `pending` (refund + points returned). → `Order`. Errors: `409` once accepted.

## Slots & bookings

### `POST /v1/merchants/:merchantId/slots/generate`
Manager+, `bookings.manage`. Body: `locationId, kind ("pickup"), startDate (YYYY-MM-DD, merchant local), days (1–31, 7), slotMinutes (5–240, 15), capacity (1–100, 4)`.
Slots come from `locations.hours` (`{ mon: [["09:00","17:00"]], ... }`) in the merchant's timezone (DST-safe); past
slots are skipped; existing slots are kept (idempotent). → `201 { created, skipped, slots: Slot[] }`.
Errors: `400` (no hours, > 3000 slots), `402`, `404` location.

### `GET /v1/merchants/:merchantId/slots`
Staff+. Query: `kind?, locationId?, from? (default now), to?`. → `{ items: Slot[], nextCursor: null }`.

### `DELETE /v1/merchants/:merchantId/slots/:slotId`
Manager+. `204`. Errors: `409` if it has bookings.

### `GET /v1/merchants/:merchantId/bookings`
Staff+. Query: `kind?, from? (default 24h ago), to?`. → `{ items: Booking[], nextCursor: null }`.

### `PATCH /v1/merchants/:merchantId/bookings/:bookingId`
Staff+, `bookings.manage`. Body: `{ status: "completed"|"no_show"|"cancelled" }`. → `Booking`.

### `POST /v1/me/bookings`
Signed in. Body: `slotId, orderId?, ticketId?, notes?` (order/ticket must be the caller's at the same merchant).
→ `201 Booking`. Errors: `402`, `404`, `409` (`slot_full`, already booked, time passed).

### `GET /v1/me/bookings`
Query: `past=true` to include finished ones. → `{ items: Booking[], nextCursor: null }`.

### `POST /v1/me/bookings/:bookingId/cancel`
→ `Booking`. Errors: `404`, `409` (not booked).

## Jobs (`jobs/commerce.ts`)

| Job | Every | Does |
| --- | --- | --- |
| `commerce.booking_reminders` | 5 min | Push + SMS reminder ~2h before a booked slot (`Reminder: your pickup at <Shop> is today at 3:30 p.m.`), once per booking (`reminderSentAt`). |
| `service.expire_quotes` | 15 min | Sent quotes past `expiresAt` → `expired` (see `service.md`). |

## Notifications

All commerce notifications are **transactional** (no CASL marketing consent needed): push to every
`push_tokens` row for the customer + SMS to their phone, each logged in `message_deliveries` with `kind = "transactional"`.
A failed send never rolls back the status change.
