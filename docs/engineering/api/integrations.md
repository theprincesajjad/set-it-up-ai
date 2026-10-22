# Integrations API (POS auto-award, webhooks, merchant REST API, SMS)

Contract: `packages/shared/src/api/integrations.ts` (`integrationsApi`). Provider setup: `docs/engineering/connectors.md`.
Code: `apps/api/src/routes/integrations/`, `src/connectors/<provider>/`, `services/integrations*.ts`, `services/webhooks-out.ts`, `jobs/connectors.ts`.

**Pricing v2: integrations are Plus** (hidden at launch; pilot shops get them by admin override). Google Business and
Twilio (managed SMS) stay free. Feature per provider (`integrationFeature()` in `services/integrations.ts`):

- POS (square, clover, shopify, lightspeed, toast) → `integrations.pos_auto_award`
- mailchimp → `marketing.email`
- zapier, make, webhooks, api → `integrations.webhooks`

What happens when the feature is off:

- `POST …/integrations/:provider/connect` → `402 feature_locked`.
- An existing POS connection stays `connected`, but webhook events are stored as `ignored` with
  `error: "POS auto-award is paused: it's a Plus feature that isn't enabled for this business"`.
  The daily sync skips it, and `POST /v1/me/purchases/claim` → `402`.
- Outbound webhooks aren't queued. `POST`/`PATCH` webhooks and `…/test` → `402`.
- The merchant REST API (`/v1/api/*`) answers `402 feature_locked` for a key issued earlier.

Nothing is deleted, and switching the feature back on resumes everything. Points only change through
`services/ledger.ts`. Errors use the standard envelope `{ error: { code, message, details? } }`.

## Objects

**`IntegrationSummary`** — `provider, name, category (pos|ecommerce|marketing|messaging|automation), description,
auth (oauth|credentials|link|api_key|webhook|managed), available, status (not_connected|pending|connected|error|disconnected),
free (false for paid ones), feature (paid feature key | null), locked (feature off for this merchant),
pausedReason (string when an existing connection is paused by the lock, else null), connectFields[{key,label,required}], externalAccountId, lastSyncAt, lastError, settings, webhookUrl,
setup {events, scopes, envVars}`.
`available: false` = the server lacks the platform app credentials (show "coming soon", not an error).
`settings` include `autoAward` (default true), `autoEnroll` (default true: POS customers with a phone become members),
`externalLocations[{id,name,detail}]`, `externalCategories[{id,name}]` (after sync), Mailchimp `audiences`/`audienceId`,
Google `placeId`/`listingUrl`, `connectedAt`, `lastSyncStats`.

**`IntegrationDetail`** = summary + `mapping { locationMap: {externalLocationId: locationId}, categoryMap: {externalCategoryId: categoryId} }`.
Mapping a POS category to a no-earn category (e.g. Prescriptions, Alcohol) makes those lines earn nothing.

**`UnmatchedPurchase`** — `id, provider, status (unmatched|claimed|refunded), purchaseRef, receiptCode, totalCents (pre-tax),
occurredAt, locationId, customerName, memberId, claimedAt, createdAt`.

---

## Merchant dashboard (Bearer; manager+ unless noted)

### `GET /v1/merchants/:merchantId/integrations`
→ `{ items: IntegrationSummary[] }` — every connector plus `zapier`, `make`, `webhooks`, `api`, `twilio`.
Errors: `401`, `403` (staff role), `404` merchant.

### `GET /v1/merchants/:merchantId/integrations/:provider`
→ `IntegrationDetail`. Errors: `404` unknown provider.

### `POST /v1/merchants/:merchantId/integrations/:provider/connect`
Body (`connectBody`): `shop` (Shopify, required), `restaurantGuid` (Toast, required), `placeId` / `listingUrl` (Google Business).
→ `ConnectResponse`:
- OAuth providers (square, clover, shopify, lightspeed, mailchimp): `{ authUrl, integration: null }` — send the browser to `authUrl`.
- Toast / Google Business: `{ authUrl: null, integration }` (connected immediately).
Errors: `400` invalid field, `402 feature_locked`, `409 already_linked` (POS account linked to another business),
`503 not_configured` (`details.envVars`).

### `GET /v1/integrations/:provider/callback` (public; OAuth redirect URI)
Query from the provider (`code`, `state`, plus `shop`+`hmac` for Shopify, `merchant_id` for Clover, `domain_prefix` for Lightspeed).
The `state` is HMAC-signed, bound to merchant + user + provider, expires in 15 min and is single use. The user must still be
manager/owner (or the merchant's rep / an admin). On success: token exchange, encrypted credential storage, webhook
registration (Shopify, Lightspeed) and a first sync with name-based auto-mapping.
→ `302` to `${PUBLIC_WEB_URL}/dashboard/integrations?provider=<p>&status=connected&merchantId=<id>` or
`?provider=<p>&status=error&error=<code>` (`invalid_state`, `forbidden`, `oauth_denied`, `oauth_exchange_failed`, `already_linked`).

### `PATCH /v1/merchants/:merchantId/integrations/:provider`
Body (`updateSettingsBody`): `autoAward?, autoEnroll?, locationMap?: {extId: locationId|null}, categoryMap?: {extId: categoryId|null},
audienceId?, placeId?, listingUrl?`. `null` removes a mapping. → `IntegrationDetail`. Errors: `400` unknown location/category, `404`.

### `DELETE /v1/merchants/:merchantId/integrations/:provider`
Revokes at the provider where supported (Square), drops credentials. → `IntegrationSummary` (`status: "disconnected"`).

### `POST /v1/merchants/:merchantId/integrations/:provider/sync`
POS: refresh external locations + categories and auto-map by name. Mailchimp: push consenting members (see connectors.md).
→ `SyncResponse { integration, mapping, stats }`. Errors: `409 not_connected`, `502 sync_failed`.

### `GET /v1/merchants/:merchantId/integrations/google_business/links` (staff+)
→ `GoogleBusinessLinks { joinUrl, reviewUrl, listingUrl, suggestedPost }`. `joinUrl` = `${PUBLIC_WEB_URL}/join/<slug>?utm_source=google...`.

### `GET /v1/merchants/:merchantId/integrations/unmatched` (staff+)
POS sales with no identifiable customer. Query: `status` (`unmatched` default | `claimed` | `refunded` | `all`), `limit`, `cursor`.
→ `{ items: UnmatchedPurchase[], nextCursor }`.

### `POST /v1/merchants/:merchantId/integrations/unmatched/:eventId/attach` (staff+)
Body `{ phone, name? }`. Awards the purchase to that phone (joins them if needed). One winner: atomic claim.
→ `ClaimResponse { purchase, memberId, pointsAwarded, balance }`.
Errors: `404`, `409 already_claimed | not_claimable`, `410 claim_expired` (30 days), `400` invalid phone.

## Customer

### `POST /v1/me/purchases/claim` (Bearer customer)
Body `{ merchantId, code }` — the receipt code printed by the POS (Square receipt number, Shopify order number, Clover order id,
Lightspeed invoice number, Toast check number). → `ClaimResponse`.
Errors: `401`, `404`, `409 already_claimed`, `410 claim_expired`, `429` (max 3 self-claims per shop per day).

---

## Outbound webhooks (Bearer, manager+)

Events (`OUTBOUND_EVENTS`): `member.joined, member.updated, points.earned, points.reversed, reward.redeemed, purchase.unmatched,
order.created, order.ready, order.completed, booking.created, ticket.updated, quote.approved, invoice.paid` (or `"*"`).

### `GET /v1/merchants/:merchantId/webhooks` → `{ items: OutboundWebhook[], events }`
### `POST /v1/merchants/:merchantId/webhooks`
Body `{ url, events[], description? }`. → `201 CreatedWebhook` (includes `secret` **once**; stored encrypted).
Errors: `400` (https required in production; private/loopback hosts rejected; unknown events; max 25), `402 feature_locked`.
### `PATCH /v1/merchants/:merchantId/webhooks/:webhookId` — body `{ url?, events?, active?, description? }` → `OutboundWebhook`.
### `DELETE /v1/merchants/:merchantId/webhooks/:webhookId` → `204`.
### `POST /v1/merchants/:merchantId/webhooks/:webhookId/test` → `{ status: "delivered"|"retrying"|"failed", statusCode }` (sends `ping`).
### `GET /v1/merchants/:merchantId/webhooks/:webhookId/deliveries` → `{ items: WebhookDelivery[], nextCursor: null }` (latest 50).

**Delivery format.** `POST <url>` with JSON `WebhookEnvelope { id: "evt_…", type, createdAt, merchantId, data }` and headers
`X-LL-Event`, `X-LL-Delivery`, `X-LL-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`.
Receivers: recompute v1 over the raw body, compare in constant time, reject if `|now - t| > 300s`.
Any 2xx = delivered. Otherwise retried at +30s, 2m, 10m, 30m, 2h, 6h, 12h (8 attempts total), then `failed`.
`410 Gone` disables the webhook. Redirects are not followed.

**For other teams:** `emitMerchantEvent(ctx, merchantId, "order.ready", data)` from `services/webhooks-out.ts` —
fire-and-forget, never throws; queue rows are delivered by `jobs/connectors.ts` (and immediately outside tests).

---

## Merchant REST API (`X-LL-Api-Key: llk_…`)

Keys are created in the merchant area (`POST /v1/merchants/:id/api-key`, services/merchant.ts). Missing/invalid key → `401`.
Writes accept an `Idempotency-Key` header (or `idempotencyKey` body field).

### `GET /v1/api/me` → `{ merchantId, name, slug }` (Zapier/Make connection test)
### `POST /v1/api/award`
Body (`apiAwardBody`): `phone | memberCode` (`LL:` prefix allowed), `amountCents | lines[{amountCents, categoryId? | externalCategoryId?, quantity?}]`,
`locationId?, customerName?, externalId?, idempotencyKey?`. `externalId` doubles as the idempotency key (`api:<externalId>`).
No-earn categories apply. Unknown phones become members (`joinedVia: pos`).
→ `ApiAwardResponse { memberId, memberCreated, pointsAwarded, balance, duplicate, transactionId, rewardsAvailable }`.
Errors: `400`, `409` (program paused / not set up).
### `POST /v1/api/redeem`
Body `{ phone | memberCode, rewardId, subtotalCents?, locationId?, idempotencyKey? }` → `ApiRedeemResponse { redemptionId, code, discountCents, balance, duplicate }`.
Errors: `404` member/reward, `409 insufficient_points`.
### `POST /v1/api/refund`
Body `{ externalId, refundId, amountCents? }` (omit amount = full). Proportional reversal for partial refunds.
→ `ApiRefundResponse { status: reversed|duplicate|not_found, pointsReversed, balance }`.
### `GET /v1/api/members/:phoneOrMemberCode` → `ApiMemberResponse`. Errors: `404`.
### `POST /v1/api/hooks` (Zapier/Make REST hooks)
Body `{ url, event, source: zapier|make|api }` → `201 CreatedWebhook`. `DELETE /v1/api/hooks/:webhookId` → `204`.
### `GET /v1/api/samples/:event` → `[WebhookEnvelope]` sample for field mapping.

---

## Inbound webhooks (provider → us; no bearer auth, signature verified over the raw body)

| Path | Verification | Notes |
| --- | --- | --- |
| `POST /v1/webhooks/square` | `x-square-hmacsha256-signature` = base64 HMAC-SHA256(`SQUARE_WEBHOOK_SIGNATURE_KEY`, `PUBLIC_API_URL + path + body`) | `payment.updated`, `order.updated`, `refund.updated`, `oauth.authorization.revoked` |
| `POST /v1/webhooks/clover` | `X-Clover-Auth` == `CLOVER_WEBHOOK_AUTH_CODE` (first `{verificationCode}` POST is logged + 200) | Payments `P:` CREATE/UPDATE, App `A:` DELETE |
| `POST /v1/webhooks/shopify` | `X-Shopify-Hmac-Sha256` = base64 HMAC-SHA256(`SHOPIFY_API_SECRET`, body) | `orders/paid`, `refunds/create`, `app/uninstalled`, GDPR topics (acknowledged) |
| `POST /v1/webhooks/lightspeed` | `X-Signature: signature=<hex HMAC-SHA256(LIGHTSPEED_CLIENT_SECRET, body)>` | form-encoded `sale.update` |
| `POST /v1/webhooks/toast` | `Toast-Signature` = base64 HMAC-SHA256(`TOAST_WEBHOOK_SECRET`, body) | `orders` |
| `POST /v1/webhooks/twilio/sms` | `X-Twilio-Signature` (HMAC-SHA1 over URL + sorted params, `TWILIO_AUTH_TOKEN`) | STOP/START/HELP → TwiML |

Responses: `401 invalid_signature` (Twilio: `403`); otherwise `200 { received, results: [{ eventId, status }] }` where status is
`processed | duplicate | unmatched | ignored | retry`. Each notification is stored once in `webhook_events`
(unique provider + event id); sales are awarded once (`<provider>:<saleId>` ledger idempotency key) even when the provider sends
both payment and order notifications. Transient provider/API errors are retried by the job (`retry` → up to 6 attempts).

**SMS keywords:** `STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, ARRET, REVOKE, OPTOUT` → every membership of that phone gets
`muted = true` and `marketing_consent_at = null` (Twilio Advanced Opt-Out sends the confirmation). `START, UNSTOP, YES` → un-mute
only (marketing consent must be given again). `HELP, INFO, AIDE` → brand + "Reply STOP" reply.
