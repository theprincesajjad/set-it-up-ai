# Public API (no login): menu, slots, quote approval, invoice pay

Code: `apps/api/src/routes/public/`. Contracts: `commerceApi.PublicMenuResponse`, `commerceApi.SlotDto`,
`serviceApi.PublicQuoteResponse`, `serviceApi.ApproveQuoteResponse`, `serviceApi.PublicInvoiceResponse`,
`serviceApi.PayInvoiceResponse`.

Tokens in links are 192-bit random (`quotes.approval_token`, `invoices.pay_token`); anyone holding the link can act,
so the web pages should not be indexed (`noindex`). Paid features are still gated: a locked merchant returns
`402 feature_locked`. Unknown tokens/slugs → `404`. Drafts are never public.

Other `/v1/public/...` routes are documented by their owning area: `GET /v1/public/shops/:slug`, `GET /v1/public/plans`,
`GET /v1/public/restaurants/founding` and the QR join in [network.md](network.md) (`networkApi`); `POST /v1/public/leads` in [rep.md](rep.md) (`repApi.publicLeadBody`).

## Link lifetimes, rate limits and unsubscribe

- **Expiry.** Ticket status links (`/t/<token>`) stop 30 days after the ticket closes (`410 link_expired`, details `{ shopName, shopPhone }`); review links 90 days after the request; driver links at the end of the run day; catering quotes after the event date. Details in [service-ops.md](service-ops.md) and `docs/engineering/security-review.md`.
- **Enumeration guard.** On the secret-link pages, 40 requests in 10 minutes from one address for links that do not exist (404/410, or 400/403 where the credential is in the query) earn `429 rate_limited` for the rest of the window. Plus the 300 requests a minute blanket cap (per user, or per address when signed out).
- **Rate-limit counters are per API process by default.** Behind a load balancer with N instances the real limits are up to N times higher, because each instance counts only what it saw. Set `RATE_LIMIT_STORE=postgres` to keep the guard counters and the blanket cap in the `rate_limit_counters` table (one fixed window per key, started by its first hit; expired rows are removed by the `ratelimit.sweep` job). It costs one indexed upsert per check, and one per request for the blanket cap, so leave it on `memory` for a single instance.
- **Unsubscribe links never act on GET.** `GET /v1/public/messaging/unsubscribe` and `GET /v1/public/onboarding/unsubscribe` show a confirm page; the button (and RFC 8058 one-click from mail apps) POSTs. See [messaging.md](messaging.md#opt-outs).

Web routes the SMS links point to: `${PUBLIC_WEB_URL}/q/<approvalToken>` and `${PUBLIC_WEB_URL}/i/<payToken>`.

## `GET /v1/public/shops/:slug/menu`
`orders.order_ahead`. → `PublicMenuResponse`:
`{ merchant { id, slug, name, logoUrl, brandColor, timezone }, locations[{ id, name, address, hours }], categories[{ id, name, earnEligible, discountEligible, items[] }], uncategorized[], tax { province, label ("HST 13%"), ratePpm }, payInApp, pickupSlots }`.
Only `available && orderable` items; empty categories omitted. Order with `POST /v1/me/orders` (`commerce.md`).

## `GET /v1/public/shops/:slug/slots`
Query: `kind` (`pickup` default; `dropoff|appointment` need Pro), `locationId?`, `from?` (≥ now), `to?` (default from + 7 days).
→ `{ items: Slot[] }` — only slots with `remaining > 0`. Book with `POST /v1/me/bookings`.

## `GET /v1/public/quotes/:token`
`service.quote_approval`. → `PublicQuoteResponse`:
`{ merchant { name, slug, logoUrl, phone }, ticket { number, itemKind, itemDetails, issue, status }, quote: Quote, expired, canRespond, depositDue }`.
`quote.status` reads `expired` once past `expiresAt`. No e-signature log fields.

## `POST /v1/public/quotes/:token/approve`
Body: `{ signatureName }` (typed full name, 2–120 chars). Records the **e-signature log**: name, IP (`X-Forwarded-For`
aware), user agent, timestamp (`respondedAt`). Ticket → `approved`.
→ `ApproveQuoteResponse { quote, ticketStatus, deposit: { paymentIntentId, clientSecret, amountCents } | null }`.
`deposit` is present when the quote has a deposit and the shop takes in-app payments: confirm it with Stripe.
Approving again returns the same deposit intent.
Errors: `400` (signature), `402`, `404`, `409` (`quote_expired`, superseded by a newer quote, already declined).

## `POST /v1/public/quotes/:token/decline`
Body: `{ reason? }`. Ticket → `declined`. → `ApproveQuoteResponse` (`deposit: null`). Errors as above.

## `POST /v1/public/quotes/:token/deposit`
`service.deposits`. Resume an unpaid deposit after approval. → `{ deposit | null }` (`null` when paid or none due).

## `GET /v1/public/invoices/:token`
`service.invoices`. → `PublicInvoiceResponse { merchant, ticket { number, itemKind, itemDetails } | null, invoice: Invoice, canPay }`.
`canPay` = open, balance ≥ $0.50 and in-app payments set up (otherwise show "pay at the counter").

## `POST /v1/public/invoices/:token/pay`
→ `PayInvoiceResponse { invoice, payment: { paymentIntentId, clientSecret, amountCents } | null }` (`null` if already paid).
Amount = `amountDueCents` (deposit already applied). The invoice becomes `paid` and the customer earns points when
the `payment_intent.succeeded` webhook arrives.
Errors: `400` (balance too small), `402`, `404`, `409` (`payments_not_set_up`, void).
