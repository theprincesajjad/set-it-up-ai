# Connectors: setup guide

How to register our app with each provider, which scopes/webhooks to configure, and which env vars turn it on.
Every connector is **free** for merchants. With no env vars set, the dashboard shows the connector as unavailable and
everything else keeps working (console providers, zero credentials).

`PUBLIC_API_URL` (e.g. `https://api.example.com`) is the base of every redirect and webhook URL below and **must match exactly**
what you register with the provider (Square and Twilio sign the full URL).

- OAuth redirect URI (all OAuth providers): `${PUBLIC_API_URL}/v1/integrations/<provider>/callback`
- After OAuth we redirect to `${PUBLIC_WEB_URL}/dashboard/integrations?provider=<p>&status=connected|error`.
- Credentials are AES-256-GCM encrypted at rest with `ENCRYPTION_KEY` (`lib/crypto.ts`). Rotating that key requires reconnecting.

## How it works (all POS connectors)

```
provider webhook ─► verify signature (raw body) ─► parse (connectors/<p>/index.ts) ─► webhook_events (unique provider+event id)
   ─► resolve: fetch order/customer/catalog via REST if the webhook is thin ─► PurchaseEvent
   ─► location: locations.external_ids[<p>] ; categories: merchant_categories.external_ids["<p>:<extCategoryId>"]
   ─► member by phone (normalizePhone) — or an existing customer's email — ─► ledger.awardPurchase(source=<p>,
      idempotencyKey "<p>:<saleId>", ignoreCooldown)  ─► emit points.earned / member.joined ─► notifyPassUpdate
refunds ─► reverseTransaction (full) or proportional reversal (partial, capped at what was earned)
no phone/email ─► webhook_events.status = "unmatched" with receiptCode ─► staff attach phone / customer claims code (30 days)
```

Each connector isolates provider-specific parsing in one exported function (`parseSquareWebhook`, `squareOrderToPurchase`,
`parseCloverWebhook`, `cloverOrderToPurchase`, `parseShopifyWebhook`, `shopifyOrderToPurchase`, `lightspeedSaleToPurchase`,
`toastOrderToEvents`...) so a payload change is a one-function fix. Tests use recorded fixtures in
`apps/api/test/integrations-support.ts`; no test makes a network call (HTTP is injected via `setHttp(ctx, fetch)`).

Mapping: the first sync auto-maps by name (and a single POS location to a single location). Merchants adjust it with
`PATCH /v1/merchants/:id/integrations/:provider` (`locationMap`, `categoryMap`). **Map pharmacy/alcohol/tobacco/lottery/gift-card
POS categories to the matching no-earn category** — unmapped lines earn normally.

Settings: `autoAward` (default on), `autoEnroll` (default on: a POS customer with a phone number becomes a member, joinedVia `pos`;
off = only existing members earn, others go to unmatched).

---

## Square (POS)

1. https://developer.squareup.com/apps → create app → **OAuth**: add redirect URL `${PUBLIC_API_URL}/v1/integrations/square/callback`.
2. Scopes requested: `MERCHANT_PROFILE_READ PAYMENTS_READ ORDERS_READ CUSTOMERS_READ ITEMS_READ`.
3. **Webhooks** → add subscription, URL `${PUBLIC_API_URL}/v1/webhooks/square`, API version `2025-01-23`, events
   `payment.updated`, `order.updated`, `refund.updated`, `oauth.authorization.revoked`. Copy the **signature key**.
4. Env: `SQUARE_APP_ID`, `SQUARE_APP_SECRET`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_ENV=sandbox|production`
   (sandbox uses `connect.squareupsandbox.com`).

Behaviour: payment `COMPLETED` or order `COMPLETED` (or OPEN with nothing due) → `GET /v2/orders/{id}`,
`POST /v2/catalog/batch-retrieve` (variation → item → category), `GET /v2/customers/{id}` for the phone. Earn is on line
`total_money − total_tax_money` (tips excluded). Refunds → `GET /v2/payments/{payment_id}` to find the original order; ratio is
refund amount / payment `amount_money`. Access tokens expire after 30 days; `jobs/connectors.ts` refreshes them daily.
Receipt code = payment `receipt_number`.

## Clover (POS)

1. https://www.clover.com/developers (sandbox: sandbox.dev.clover.com) → create app.
2. **Permissions**: Merchant R, Customers R, Orders R, Payments R, Inventory R.
3. **App settings → Site URL / Alternate launch path**: `${PUBLIC_API_URL}/v1/integrations/clover/callback`.
4. **Webhooks**: URL `${PUBLIC_API_URL}/v1/webhooks/clover`. Clover POSTs `{ "verificationCode": "…" }` — we log it
   (`[clover] webhook verification code: …`); paste it into the dashboard. Subscribe to **Payments** and **App** events.
   Copy the **auth code** shown afterwards.
5. Env: `CLOVER_APP_ID`, `CLOVER_APP_SECRET`, `CLOVER_WEBHOOK_AUTH_CODE`, `CLOVER_ENV=sandbox|production`.

Behaviour: `P:<id>` CREATE → `GET /v3/merchants/{mId}/payments/{id}?expand=order,refunds`, order `?expand=lineItems,customers`,
items `?expand=categories`, customer `?expand=phoneNumbers,emailAddresses`. Line prices are per unit (cents, `unitQty` in
thousandths); lines are scaled to the pre-tax payment amount (order-level discounts). Uses OAuth v2 expiring tokens
(`/oauth/v2/token`, `/oauth/v2/refresh`).
*Uncertain:* refunds are detected from `P:` UPDATE notifications by reading `payment.refunds`; if Clover delivers refunds under a
different object prefix in your region, add it to `parseCloverWebhook`.

## Shopify (online store + Shopify POS)

1. Partners dashboard → create app → **App URL** + **Allowed redirection URL** `${PUBLIC_API_URL}/v1/integrations/shopify/callback`.
2. Scopes: `read_orders,read_customers,read_products,read_locations`.
3. Mandatory compliance webhooks (app config): `customers/data_request`, `customers/redact`, `shop/redact` →
   `${PUBLIC_API_URL}/v1/webhooks/shopify` (acknowledged; we store no Shopify customer data beyond the award).
4. Env: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`.

Behaviour: merchant enters `yourshop.myshopify.com` on connect. Callback `hmac` is verified, then we register `orders/paid`,
`refunds/create`, `app/uninstalled` webhooks (API `2025-01`). Lines = `price × qty − discount allocations`; category = product
`product_type` (map e.g. "Gift card" to a no-earn category). Refunds use pre-tax `refund_line_items[].subtotal`.
`app/uninstalled` marks the integration disconnected. Customer phone: `customer.phone`, `phone`, then billing/shipping phone.

## Lightspeed Retail (X-Series)

1. https://developers.lightspeedhq.com (X-Series) → register app, redirect URI `${PUBLIC_API_URL}/v1/integrations/lightspeed/callback`.
2. Env: `LIGHTSPEED_CLIENT_ID`, `LIGHTSPEED_CLIENT_SECRET` (the client secret also signs webhooks).

Behaviour: OAuth via `secure.retail.lightspeed.app/connect`, token at `https://{domain_prefix}.retail.lightspeed.app/api/1.0/token`.
After connect we register a `sale.update` webhook (`POST /api/webhooks`, form field `data`). Webhooks arrive form-encoded
(`type`, `domain_prefix`, `payload` = JSON sale) with `X-Signature: signature=<hex>, algorithm=HMAC-SHA256`.
Sales with status `CLOSED` / `ONACCOUNT_CLOSED` / `LAYBY_CLOSED` award on `price_total` (tax-exclusive); categories =
`product_type_id` (fetched from `/api/2.0/products/{id}` if the line lacks it). Outlets map to locations.
*Uncertain (isolated in `parseLightspeedWebhook` / `lightspeedSaleToPurchase`):* the webhook-registration call shape, and that
returns arrive as sales with a negative `total_price` and a `return_for` link to the original sale. Returns without that link
are ignored (staff can reverse manually).

## Toast (restaurants)

Toast has no merchant-facing OAuth: we are a Toast **partner integration** (client credentials).
1. Apply via the Toast partner program; get `clientId`/`clientSecret` (scopes `orders:read`, `config:read`, `restaurants:read`).
2. Ask Toast to configure the **orders** webhook to `${PUBLIC_API_URL}/v1/webhooks/toast` and give you the webhook secret.
3. Env: `TOAST_CLIENT_ID`, `TOAST_CLIENT_SECRET`, `TOAST_WEBHOOK_SECRET`, `TOAST_API_HOST`
   (`https://ws-sandbox-api.eng.toasttab.com` sandbox, `https://ws-api.toasttab.com` production).

Behaviour: the restaurant enables our integration in Toast, then the merchant enters their **restaurant GUID** on connect
(we log in with `/authentication/v1/authentication/login` and check `/restaurants/v1/restaurants/{guid}`). Every request carries
`Toast-Restaurant-External-ID`. A sale = all checks `PAID`/`CLOSED`; lines = selections (`price`, decimal dollars) with
`salesCategory.guid` as the category (map "Alcohol" to a no-earn category). Customer = check `customer.phone/email`.
*Uncertain (isolated in `parseToastWebhook` / `toastOrderToEvents`):* whether the webhook body embeds the full order
(`details.order`) — if not we fetch `/orders/v2/orders/{guid}`; and refunds are read from `payments[].refund.refundAmount`,
treated as the running total per order (we reverse only the increase).

## Google Business Profile

No OAuth. Merchant pastes their **place ID** or Google Maps link; we store it (`settings.placeId`, `listingUrl`).
Optional `GOOGLE_PLACES_API_KEY` (Places API (New), field mask `id,displayName,formattedAddress,googleMapsUri`) fills in name/address.
`GET .../integrations/google_business/links` returns the "Join our rewards" URL (`${PUBLIC_WEB_URL}/join/<slug>?utm_source=google…`)
to add as the profile's website/offer link or in a Google post, plus the review link. The web team owns the `/join/<slug>` page.

## Mailchimp

1. https://admin.mailchimp.com/account/oauth2/ → register app, redirect URI `${PUBLIC_API_URL}/v1/integrations/mailchimp/callback`.
2. Env: `MAILCHIMP_CLIENT_ID`, `MAILCHIMP_CLIENT_SECRET`.

Behaviour: after OAuth we read `/oauth2/metadata` for the data-centre `api_endpoint`. Sync lists audiences (auto-selects if there
is exactly one; otherwise set `audienceId` via PATCH), then batch-subscribes (`POST /3.0/lists/{id}`, 500 per call) only members with
an email **and CASL express consent (`marketing_consent_at`) and not muted**, with the consent timestamp as `timestamp_opt`.
Members we previously synced who withdrew consent (STOP, unsubscribe, mute) are PATCHed to `unsubscribed`. We keep only MD5
subscriber hashes, never extra PII. Runs on demand and daily.

## Outbound webhooks, Zapier, Make

No env vars. Merchants add URLs in the dashboard, or Zapier/Make subscribe via REST hooks with the merchant API key
(`POST /v1/api/hooks`, `DELETE /v1/api/hooks/:id`, `GET /v1/api/me` for auth test, `GET /v1/api/samples/:event` for sample data).
Signature `X-LL-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`. Retries with backoff for 8 attempts;
`410` disables the hook. In production, URLs must be https and public (no loopback/private IPs).
For a Zapier app: authentication = API key (header `X-LL-Api-Key`), triggers = REST hooks per event.

## Merchant REST API (custom POS)

Merchant creates a key in the dashboard (`POST /v1/merchants/:id/api-key`, `llk_…`, stored as sha256). The POS calls
`POST /v1/api/award` with the customer phone or scanned member QR (`LL:<code>`) and its sale id as `externalId`, and
`POST /v1/api/refund` on refunds. To apply no-earn categories from a custom POS either send our `categoryId` per line or map your
category ids under the `api` provider key (`merchant_categories.external_ids["api:<yourCategoryId>"]`).

## Twilio (SMS, platform-managed)

1. Twilio console → Messaging Service (recommended; enables Advanced Opt-Out and A2P/Canadian sender pools) or a phone number.
2. Inbound webhook (Messaging Service → Integration → "Send a webhook"): `${PUBLIC_API_URL}/v1/webhooks/twilio/sms` (HTTP POST).
3. Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM`.

Inbound requests are verified with `X-Twilio-Signature` against the exact public URL. STOP/START/HELP handling is in
`services/integrations-sms.ts` (STOP: `muted=true` + clear `marketing_consent_at` on every membership of that phone).

## Resend (email) / Expo (push)

`RESEND_API_KEY` (+ `EMAIL_FROM`, a verified domain) enables Resend. `EXPO_ACCESS_TOKEN` (or `EXPO_PUSH=1`) enables Expo push
(`https://exp.host/--/api/v2/push/send`, 100 per request; `DeviceNotRegistered` tickets are pruned immediately when the DB is
passed to `createRealProviders`, and the `notifications.receipts` job checks receipts ~15 min later
(`/--/api/v2/push/getReceipts`) and deletes tokens whose receipt says `DeviceNotRegistered`). Wired in `providers/real.ts`;
anything unconfigured stays on the console provider.

Expo / app-store steps for push (customer app):
1. expo.dev → project → **Credentials**: iOS push key (Apple Developer → Keys → "Apple Push Notifications service (APNs)",
   upload the .p8 to Expo) and Android FCM V1 service-account key (Firebase console → Project settings → Service accounts).
2. expo.dev → Account settings → **Access tokens** → create a token with push scope → `EXPO_ACCESS_TOKEN` (also enable
   "Enhanced push security" on the project so only token-bearing requests are accepted).
3. Mobile build needs `EAS_PROJECT_ID` (docs/engineering/mobile.md). Android channels `points`, `orders`, `offers` are created
   by the app (`features/customer/notifications.ts`). Notification types and rules: `docs/engineering/api/notifications.md`.

## Apple Wallet

1. Apple Developer → Certificates, Identifiers & Profiles → Identifiers → **Pass Type IDs** → create
   `pass.<your.domain>.loyalty`. Create its certificate (upload a CSR), download `pass.cer`, import into Keychain and export
   `pass.p12`, then `openssl pkcs12 -in pass.p12 -clcerts -nokeys -legacy > cert.pem` / `-nocerts -nodes > key.pem`.
2. Download the **Apple WWDR G4** intermediate certificate (apple.com/certificateauthority) and convert:
   `openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem`.
3. Env: `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID` (10-char Team ID, top right of the developer portal), `APPLE_PASS_CERT_PEM`,
   `APPLE_PASS_KEY_PEM`, `APPLE_PASS_KEY_PASSPHRASE` (if the key is encrypted), `APPLE_WWDR_PEM` (`\n` escapes are accepted).
4. **APNs token auth (recommended)**: Apple Developer → **Keys** → "+" → enable *Apple Push Notifications service (APNs)* →
   download `AuthKey_<KEYID>.p8` (once only). Env: `APPLE_APNS_KEY_ID` (the 10-char key id) and `APPLE_APNS_KEY_P8` (file
   contents). The API signs an ES256 provider JWT (`iss` = `APPLE_TEAM_ID`, `kid` = key id, refreshed every 50 min). If APNs
   rejects the token for the pass topic (403, e.g. `TopicDisallowed`), the push is retried with the pass certificate, so keep
   `APPLE_PASS_CERT_PEM`/`APPLE_PASS_KEY_PEM` set as the fallback (certificate-only also works). Pass pushes always go to
   production APNs (`api.push.apple.com`), topic = pass type id.
5. `PUBLIC_API_URL` must be https with a valid certificate in production (Wallet refuses http web services); the PassKit web
   service lives at `${PUBLIC_API_URL}/v1/wallet/apple/v1/...`. Pass artwork: `node apps/api/scripts/render-wallet-assets.cjs`.
See `docs/engineering/api/wallet.md`; the full founder checklist (costs, shop cards, testing on phones) is `docs/engineering/wallet.md`.

## Google Wallet

1. https://pay.google.com/business/console → **Google Wallet API** → sign up as an issuer → copy the **Issuer ID**.
2. Google Cloud console → enable **Google Wallet API** → IAM → Service accounts → create one → Keys → JSON key. In the Wallet
   console → Users, invite the service account email (role: Developer or Admin).
3. Wallet console → request **publishing access** (production) for the loyalty class `<issuer>.ll_network_loyalty`; until
   approved only test accounts added in the console can save the pass. Upload nothing: the class is created by the first save JWT.
4. Env: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` (raw JSON or base64). `PUBLIC_WEB_URL` is the JWT origin
   (the "Add to Google Wallet" button must be on that origin). The program logo is served from
   `${PUBLIC_API_URL}/v1/wallet/assets/logo.png`, so `PUBLIC_API_URL` must be publicly reachable over https.
