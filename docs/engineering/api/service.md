# Service API (Pro: tickets, quote approval, deposits, invoices)

Contract: `packages/shared/src/api/service.ts` (`serviceApi`). Code: `apps/api/src/routes/service/`,
`services/tickets.ts`, `services/quotes.ts`, `services/invoices.ts`. Public approve/pay pages: `public.md`.

Appointments for salons (calendar, services, online booking) are a separate Café & Retail feature: see `appointments.md`. The price list (`services` table, `kind = repair_line`) is shared.

Money is integer cents (CAD); tax per province (`services/tax.ts`, default ON HST 13%). Errors use the standard
envelope. Lists return `{ items, nextCursor }`.

## The repair approval flow (PRD)

1. Drop-off: staff `POST /tickets` (customer found/created by phone).
2. Tech adds diagnosis + quote: `POST /tickets/:id/quotes` (line items, deposit %).
3. `POST /quotes/:id/send` → customer gets push + SMS with `${PUBLIC_WEB_URL}/q/<approvalToken>`.
4. Customer approves (public page or app) with a typed-name e-signature → deposit PaymentIntent returned.
5. Deposit paid (webhook) → timeline event.
6. Status updates (`in_progress`, `waiting_parts`, `ready`) notify the customer.
7. `POST /tickets/:id/invoices` → pay link `${PUBLIC_WEB_URL}/i/<payToken>`; on payment the customer earns points.
8. Staff confirms pickup: status `picked_up`.

## Gating

| Endpoints | Feature key |
| --- | --- |
| tickets, timeline, status | `service.tickets` |
| quotes, approve/decline | `service.quote_approval` (+ `service.tickets` for staff routes) |
| quote with `depositPercent/depositCents > 0`, deposit payments | `service.deposits` (+ `payments.in_app` and Connect charges enabled to take the payment) |
| invoices, invoice payment | `service.invoices` (+ `payments.in_app` to pay in-app) |

Locked → `402 feature_locked` with `reason: "rollout"` (hidden, even on Pro) or `"plan"`. Permissions: see `commerce.md`
(`tickets.manage`, `quotes.send`, `invoices.manage`, `invoices.void` = manager+).

## Objects

- `Ticket`: `id, merchantId, merchantName, locationId, userId, number, itemKind (device|vehicle|garment|other), itemDetails { make, model, serial, imei, vin, plate, mileage, colour, ... }, issue, intakeNotes (null for customers), photos[url], status, assignedStaffId, promisedAt, createdAt, updatedAt, customer?{name, phone}` (staff only)
- Ticket `status`: `intake, diagnosing, quote_sent, approved, declined, in_progress, waiting_parts, ready, picked_up, cancelled`
- `TicketEvent`: `id, status|null, note, visibleToCustomer, actorUserId (null for customers), createdAt`
- `LineItem`: `description, quantity, unitPriceCents, kind (labour|part|fee|other), categoryId|null, totalCents`
- `Quote`: `id, ticketId, merchantId, lineItems, diagnosis, subtotalCents, taxCents, totalCents, depositCents, status (draft|sent|approved|declined|expired|superseded), approvalUrl (null while draft), expiresAt, sentAt, respondedAt, signatureName, signatureIp + signatureUserAgent (staff only), declineReason, depositPaidAt, createdAt`
- `Invoice`: `id, merchantId, userId, ticketId, number, lineItems, subtotalCents, taxCents, depositAppliedCents, totalCents, amountDueCents, platformFeeCents, status (draft|open|paid|void), payUrl (open only), paidAt, pointsEarned, createdAt`
- `TicketDetail`: `{ ticket, events, quotes, invoices }` — customers see only `visibleToCustomer` events and no drafts.

---

## Tickets (merchant)

### `POST /v1/merchants/:merchantId/tickets`
Staff+, `tickets.manage`. Body:

```json
{
  "customer": { "phone": "416-555-0199", "name": "Riley Tester" },
  "locationId": "uuid", "itemKind": "device",
  "itemDetails": { "make": "Apple", "model": "iPhone 13", "imei": "356938035643809" },
  "issue": "Cracked screen", "intakeNotes": "Internal only", "photos": ["https://..."],
  "promisedAt": "2026-11-05T21:00:00Z", "assignedStaffId": "uuid"
}
```

Phone is normalised to E.164; one network identity per phone (created if new). Per-merchant `number` (#1, #2…).
→ `201 TicketDetail` (event "Checked in"). Errors: `400` (phone, location, staff not at this merchant), `402`, `403`.

### `GET /v1/merchants/:merchantId/tickets`
Staff+. Query: `status` (comma-separated; default all open = not `picked_up`/`cancelled`), `q` (ticket number, customer
name/phone digits, issue, item details), `limit`, `cursor`. → `{ items: Ticket[], nextCursor }`.

### `GET /v1/merchants/:merchantId/tickets/:ticketId`
Staff+. → `TicketDetail` (all events incl. internal, quotes incl. drafts with e-signature log). `404` cross-merchant.

### `PATCH /v1/merchants/:merchantId/tickets/:ticketId`
Staff+, `tickets.manage`. Body: any of `locationId, itemKind, itemDetails, issue, intakeNotes, photos, promisedAt, assignedStaffId`. → `TicketDetail`.

### `POST /v1/merchants/:merchantId/tickets/:ticketId/status`
Staff+, `tickets.manage`. Body: `{ status: "diagnosing"|"in_progress"|"waiting_parts"|"ready"|"picked_up"|"cancelled", note?, notify? (true), allowUnpaid? (false) }`.
Quote statuses (`quote_sent/approved/declined`) are set by the quote flow only (`400` here).
`in_progress`, `waiting_parts`, `ready` push + SMS the customer (note appended; `ready` adds the pay link if an invoice is open).
→ `TicketDetail`. Errors: `409` (terminal status, same status, `picked_up` with an unpaid open invoice unless `allowUnpaid`).

### `POST /v1/merchants/:merchantId/tickets/:ticketId/events`
Staff+. Body: `{ note, visibleToCustomer? (false) }`. → `201 TicketEvent`.

## Quotes (merchant)

### `POST /v1/merchants/:merchantId/tickets/:ticketId/quotes`
Staff+, `quotes.send`. Body: `lineItems[] (1–100), diagnosis?, depositPercent? (0–100) | depositCents?, expiresInDays? (1–90, default 7), send? (false)`.
Totals computed server-side. Deposit = round(total × pct / 100), ≥ $0.50, ≤ total; needs `service.deposits`.
Any `draft`/`sent` quote on the ticket becomes `superseded` (its link stops working). A ticket in `intake` moves to `diagnosing`.
→ `201 Quote` (or the sent quote when `send: true`). Errors: `400`, `402`, `409` (ticket closed).

### `POST /v1/merchants/:merchantId/quotes/:quoteId/send`
Staff+, `quotes.send`. Draft → `sent`; the expiry window starts now. Ticket → `quote_sent`. Push + SMS:
`Your quote for Apple iPhone 13 (ticket #1) is $271.20 ($67.80 deposit on approval). Review and approve: <link>`.
Calling it on a `sent` quote re-sends the message. → `Quote`. Errors: `409` (`quote_expired`, other statuses).

## Invoices (merchant)

### `POST /v1/merchants/:merchantId/tickets/:ticketId/invoices`
Staff+, `invoices.manage`. Body: `fromQuote? (true), extraLineItems? ([]), send? (true)`.
Lines = latest approved quote's lines + extras. `depositAppliedCents` = the quote deposit if paid.
`amountDueCents = total − deposit`. `platformFeeCents = round(total × 75/10000)` when in-app payments are set up,
else the fee on the in-app deposit only (0 if none). Sending opens it and texts the pay link; if the deposit covers
everything it's marked paid immediately. → `201 Invoice`.
Errors: `400` (no lines), `402`, `409` (an open/draft invoice exists, no approved quote with `fromQuote`, ticket cancelled).

### `GET /v1/merchants/:merchantId/invoices` · `GET .../invoices/:invoiceId`
Staff+. Query: `status?, limit, cursor`. → `{ items: Invoice[], nextCursor }` / `Invoice`.

### `POST /v1/merchants/:merchantId/invoices/:invoiceId/send`
Draft → open + notify. → `Invoice`.

### `POST /v1/merchants/:merchantId/invoices/:invoiceId/mark-paid`
Staff+, `invoices.manage`. Paid at the counter. Body: `{ method: "cash"|"card_terminal"|"other", note? }`. No platform fee
on the counter portion. Awards points. → `Invoice`. Errors: `409` (not open).

### `POST /v1/merchants/:merchantId/invoices/:invoiceId/void`
Manager+, `invoices.void`. → `Invoice`. Errors: `409` (paid or already void).

## On payment (webhook or counter)

Invoice → `paid`, `paidAt`; points via `ledger.awardPurchase` with one line per line item (category-aware, so no-earn
categories never earn) and idempotency key `invoice:<id>` — retried webhooks never double-award; `pointsEarned` set;
ticket event "Invoice #N paid"; customer told `You earned N points at <Shop>`. Staff then sets the ticket to `picked_up`.

## Customer (signed in)

### `GET /v1/me/tickets` · `GET /v1/me/tickets/:ticketId`
→ `{ items: Ticket[], nextCursor }` / `TicketDetail` (customer view). Only the caller's tickets (`404` otherwise).
Readable even if the merchant later downgrades (history is the customer's).

### `POST /v1/me/quotes/:quoteId/approve`
Body: `{ signatureName }` (typed full name, 2–120 chars). IP + user agent + timestamp are logged.
→ `ApproveQuoteResponse { quote, ticketStatus, deposit: { paymentIntentId, clientSecret, amountCents } | null }`.
Re-approving an approved quote returns the same deposit intent. Errors: `402`, `404`, `409` (`quote_expired`, superseded, already declined).

### `POST /v1/me/quotes/:quoteId/decline`
Body: `{ reason? }`. → `ApproveQuoteResponse` (`deposit: null`, ticket `declined`).

### `POST /v1/me/quotes/:quoteId/deposit`
Resume a deposit payment. → `{ deposit | null }`.

### `POST /v1/me/invoices/:invoiceId/pay`
→ `PayInvoiceResponse { invoice, payment: { paymentIntentId, clientSecret, amountCents } | null }` (`null` if already paid).
Errors: `400` (balance < $0.50), `402`, `409` (`payments_not_set_up`, not open).

## Expiry

`service.expire_quotes` job: `sent` quotes past `expiresAt` become `expired` (timeline event). Responding to one is
`409 quote_expired`; the shop sends a new quote.

See also [service-ops.md](service-ops.md): photo upload, intake terms, phone approval, the 10% invoice cap, tips, the public status page, invoices list and summary, rebooking, pickup reminders and rolling drop-off slots.
