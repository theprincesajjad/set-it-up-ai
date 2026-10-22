# Wallet API (Apple Wallet + Google Wallet network pass)

Contract: `packages/shared/src/api/wallet.ts` (`walletApi`). Code: `apps/api/src/routes/wallet/`, `services/wallet*.ts`.
Artwork: `apps/api/assets/wallet/*.png`, rendered from `apps/web/public/brand/*.svg` by `apps/api/scripts/render-wallet-assets.cjs`.

One **network** pass per customer (free, `wallet.passes`), v2 look (`docs/design/foundations.md`): near-black card
(`#0B0B0C`), white text (`#F5F5F4`), the dark-mode accent `#FF7A45` as the label colour, the "four corners" mark.
Balances are always per shop in the shop's own units ("130 points", "7 stamps"): points and stamps are **never summed**.

## What's on the pass

| Apple field | Content |
| --- | --- |
| logo + `logoText` | four-corners tile (`logo.png` 50/100/150 px) + "local loyalty" |
| header `ready` | rewards ready across all shops (number); `changeMessage` "Rewards ready: %@" |
| primary | "N rewards" / "ready at <Shop>" (or "ready across N shops"); with none ready: "N shops" / "member at" |
| secondary `shop1`, `shop2` | top two shops (rewards ready first, then most recent visit), value "130 points"; `shop1` has `changeMessage` "You now have %@ at <Shop>" — that's the lock-screen notification after a visit |
| auxiliary `member` | customer name (or member code) |
| barcode | QR `LL:<memberCode>`, `altText` = member code (same QR as the app and web card) |
| `locations` | up to 10 member-shop locations nearest the customer's home neighbourhood (else their last-visited shop), `relevantText` "Show this at <Shop> to earn", `maxDistance` 100 m |
| `relevantDate` | not set (relevance is by place only) |
| back | every membership with balance, rewards ready and its expiry disclosure; points-expiry summary; how to use; member code; updates note; terms link (`${PUBLIC_WEB_URL}/terms`); support email |

Google: one **loyalty class** per network (`<issuer>.ll_network_loyalty`: issuer name, program logo
`/v1/wallet/assets/logo.png` 660 px, `hexBackgroundColor` `#0B0B0C`, country CA) and one **loyalty object** per customer
(`<issuer>.ll_<userId without dashes>`): `loyaltyPoints` = rewards ready, `secondaryLoyaltyPoints` = shops, `accountId` =
member code, QR barcode, `textModulesData` (top 3 shops with balances, "N more shops", expiry, how to use),
`linksModuleData` (card, terms, support), `locations` (same 10).

## Updates (automatic)

Every ledger balance change — award, redeem, adjust, reversal, from the counter, the app, POS connectors, the merchant API,
orders and invoices — runs the ledger's `balanceListeners` after commit (`services/ledger.ts`). The wallet listener calls
`notifyPassUpdate(ctx, userId)`, which:

1. rebuilds the pass content and **skips** if it's identical to the last push for that customer (so duplicate calls are free);
2. bumps `wallet_passes.last_updated_at`;
3. Apple: APNs push (`POST /3/device/<pushToken>`, `apns-topic` = pass type id, body `{}`) to every registered device; the
   device calls `GET …/registrations…?passesUpdatedSince=` then `GET …/passes/…`, diffs the fields and shows the
   `changeMessage` on the lock screen. Tokens APNs answers 410 (or 400 `BadDeviceToken`) are deleted;
4. Google: OAuth (service-account JWT bearer) → `PATCH walletobjects/v1/loyaltyObject/<id>`; 404 (never saved) is ignored.

"Reward ready" and "points expiring" notifications also call `addPassMessage` → Google
`POST loyaltyObject/<id>/addMessage` (`TEXT_AND_NOTIFY`, shown for 7 days; Google limits notifying messages per pass per day).
Apple has no message API; the `changeMessage` covers it.

Other teams only need `notifyPassUpdate(ctx, userId)` when something **other than a balance** on the pass changes (e.g. the
customer's name, a shop's name or expiry setting). It never throws.

APNs auth: token-based (`APPLE_APNS_KEY_ID` + `APPLE_APNS_KEY_P8` + `APPLE_TEAM_ID`, ES256 provider JWT) first; any token
rejected with 403 is retried with the pass certificate (`APPLE_PASS_CERT_PEM`/`APPLE_PASS_KEY_PEM`). Certificate-only works
too. Without either, pushes go to a console recorder (`consoleApns`); tests use a local HTTP/2 server.

## Customer (Bearer)

### `GET /v1/me/wallet`
→ `WalletStatusResponse { summary: WalletSummary, apple: { available, downloadUrl, reason }, google: { available, saveUrl, reason } }`.
`summary` adds (v2) `rewardsReady` and per shop `rewardsReady`, `slug`, `lastVisitAt`; shops are ordered rewards-ready first,
then most recent visit. `summary.totalPoints` is **deprecated** (it mixes units; never display it).
`downloadUrl` is a 10-minute signed link (open it directly in Safari for "Add to Apple Wallet").

### `GET /v1/me/wallet/apple`
→ `200 application/vnd.apple.pkpass` (signed .pkpass). Errors: `401`, `503 wallet_not_configured` (`details.missing` lists env vars).

### `GET /v1/me/wallet/apple/link` → `AppleLinkResponse { url, expiresAt }`. Errors: `503 wallet_not_configured`.

### `GET /v1/me/wallet/google` → `GoogleSaveResponse { saveUrl }` (`https://pay.google.com/gp/v/save/<RS256 JWT>` carrying
`loyaltyClasses` + `loyaltyObjects`). Errors: `503 wallet_not_configured` (`details.missing`).

### `GET /v1/wallet/apple/download?token=…` (no auth; signed token) → pkpass. Errors: `401 link_expired`, `503`.

### `GET /v1/wallet/assets/logo.png` — public 660×660 program logo used by the Google class.

## Apple PassKit web service (called by iOS; `Authorization: ApplePass <authenticationToken>`)

`webServiceURL` in pass.json is `${PUBLIC_API_URL}/v1/wallet/apple`, so Apple calls:

| Method + path | Response |
| --- | --- |
| `POST /v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber` body `{ pushToken }` | `201` new, `200` already registered (push token refreshed), `400` no pushToken, `401` bad token, `404` other pass type |
| `GET /v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier?passesUpdatedSince=<tag>` | `200 { serialNumbers, lastUpdated }` or `204` (no auth, per spec) |
| `DELETE /v1/wallet/apple/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber` | `200`, `401` |
| `GET /v1/wallet/apple/v1/passes/:passTypeIdentifier/:serialNumber` (honours `If-Modified-Since`) | `200` pkpass with `Last-Modified`, `304`, `401` |
| `POST /v1/wallet/apple/v1/log` body `{ logs: string[] }` | `200` |

`lastUpdated` tags are epoch milliseconds.

## Buttons (web + app)

Official wording only: `walletApi.WALLET_BUTTON_TEXT` = "Add to Apple Wallet" / "Add to Google Wallet". Web:
`apps/web/src/components/pass/WalletButtons.tsx` (`<WalletButtons os onApple onGoogle busy />`, black badges; drop the official
SVGs into `apps/web/public/wallet-badges/` and set `NEXT_PUBLIC_WALLET_BADGES=1` before launch). App:
`apps/mobile/src/features/customer/walletPass.ts` (`useAddToWallet()`).

## Configuration

Apple: `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_PEM`, `APPLE_PASS_KEY_PEM` (+ `APPLE_PASS_KEY_PASSPHRASE`),
`APPLE_WWDR_PEM`, and for APNs token auth `APPLE_APNS_KEY_ID`, `APPLE_APNS_KEY_P8` (PEM values may use `\n` escapes).
Without the pass certificate set, pass endpoints return `503`.
Google: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` (raw JSON or base64; the service account must be a
user in the Wallet console). Console steps: `docs/engineering/connectors.md`.

Migration note: the Google pass moved from a Generic class (`…ll_network_member`) to a Loyalty class
(`…ll_network_loyalty`) before launch; no Generic passes were issued in production.
