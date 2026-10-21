# Wallet API (Apple Wallet + Google Wallet network pass)

Contract: `packages/shared/src/api/wallet.ts` (`walletApi`). Code: `apps/api/src/routes/wallet/`, `services/wallet*.ts`.

One **network** pass per customer (free, `wallet.passes`): the member QR `LL:<memberCode>` (same as the app/web card), total
points across shops, shop count, the top two shop balances on the front and every shop on the back. Merchants with points
expiry enabled are disclosed on the pass ("expire after N months of inactivity"); otherwise "Your points never expire."

**For other teams:** call `notifyPassUpdate(ctx, userId)` (services/wallet.ts) after a balance changes. It never throws.
POS awards, refunds, claims and the merchant API already call it. It bumps `wallet_passes.last_updated_at`, sends an APNs push
to every registered device (Apple then re-fetches the pass) and PATCHes the Google Wallet object.

## Customer (Bearer)

### `GET /v1/me/wallet`
→ `WalletStatusResponse { summary: WalletSummary, apple: { available, downloadUrl, reason }, google: { available, saveUrl, reason } }`.
`downloadUrl` is a 10-minute signed link (open it directly in Safari for "Add to Apple Wallet").

### `GET /v1/me/wallet/apple`
→ `200 application/vnd.apple.pkpass` (signed .pkpass). Errors: `401`, `503 wallet_not_configured` (`details.missing` lists env vars).

### `GET /v1/me/wallet/apple/link` → `AppleLinkResponse { url, expiresAt }`. Errors: `503 wallet_not_configured`.

### `GET /v1/me/wallet/google` → `GoogleSaveResponse { saveUrl }` (`https://pay.google.com/gp/v/save/<RS256 JWT>`). Errors: `503`.

### `GET /v1/wallet/apple/download?token=…` (no auth; signed token) → pkpass. Errors: `401 link_expired`, `503`.

### `GET /v1/wallet/assets/logo.png` — public artwork used by the Google object.

## Apple PassKit web service (called by iOS; `Authorization: ApplePass <authenticationToken>`)

`webServiceURL` in pass.json is `${PUBLIC_API_URL}/v1/wallet/apple`, so Apple calls:

| Method + path | Response |
| --- | --- |
| `POST /v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber` body `{ pushToken }` | `201` new, `200` already registered, `401` bad token |
| `GET /v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier?passesUpdatedSince=<tag>` | `200 { serialNumbers, lastUpdated }` or `204` (no auth, per spec) |
| `DELETE /v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber` | `200`, `401` |
| `GET /v1/wallet/apple/v1/passes/:passTypeIdentifier/:serialNumber` (honours `If-Modified-Since`) | `200` pkpass with `Last-Modified`, `304`, `401` |
| `POST /v1/wallet/apple/v1/log` body `{ logs: string[] }` | `200` |

`lastUpdated` tags are epoch milliseconds.

## Configuration

Apple: `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_PEM`, `APPLE_PASS_KEY_PEM` (+ `APPLE_PASS_KEY_PASSPHRASE`),
`APPLE_WWDR_PEM` (PEM values may use `\n` escapes). The same certificate authenticates APNs (HTTP/2, `api.push.apple.com`,
topic = pass type id). Without them, pass endpoints return `503` and APNs pushes go to a console recorder.
Google: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` (raw JSON or base64; needs the Wallet Object Issuer role).
Generic class id `<issuer>.ll_network_member`, object id `<issuer>.ll_<userId without dashes>`. See connectors.md for setup.
