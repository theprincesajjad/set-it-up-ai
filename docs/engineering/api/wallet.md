# Wallet API (Apple Wallet + Google Wallet: network pass and shop cards)

Founder setup checklist and costs: [`../wallet.md`](../wallet.md).

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
`linksModuleData` (card, terms, support), `merchantLocations` (same 10; `locations` is deprecated).

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

APNs auth: the pass certificate first (Apple: pass pushes use the certificate that signed the pass; `APPLE_PASS_P12_BASE64` or
`APPLE_PASS_CERT_PEM`/`APPLE_PASS_KEY_PEM`); a 403 is retried with the optional token (`APPLE_APNS_KEY_ID` + `APPLE_APNS_KEY_P8`,
ES256 provider JWT), which is also used alone when no certificate is set. Without either, pushes go to a console recorder (`consoleApns`); tests use a local HTTP/2 server.

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

## Shop cards (one per membership, in the shop's look)

Code: `services/wallet-shop.ts` (model, Apple pass.json, Google class/object, updates, removal), `services/wallet-strip.ts`
(stamp strip / progress bar PNG), `services/wallet-dev-fake.ts` (fake signer and Google key for dev, e2e and tests).

`wallet_passes.merchant_id` set = a shop card (null = the network pass); serial per (user, shop, platform). `added_at` /
`removed_at` track whether it is in a wallet (Apple: device registered / last device unregistered; Google: save / del callback).
Shop settings: `merchants.wallet_card` (`walletApi.walletCardSchema`).

| Apple field | Content |
| --- | --- |
| `organizationName`, `logoText`, `logo.png` | shop name; the shop's logo when it is a PNG (or sharp is installed), else the name alone |
| colours | `wallet_card.color` or the brand colour; text white or near-black for ≥ 4.5:1 contrast; label a 28% mix |
| header `balance` | "4 of 6" (stamps) or "120 points"; `changeMessage` "Stamps: %@" |
| `strip.png` @1x/2x/3x | 375×123 / 750×246 / 1125×369: stamp circles (≤ 12, two rows above 6, last one the reward) or a progress bar; omitted for the plain front |
| secondary `reward`, `member` | "Free coffee, 2 to go" / "ready now"; member name |
| auxiliary `visit` | next confirmed appointment (date field), `relevantDate` (1 h before) and `relevantDates` (2 h before → end) |
| barcode | QR `LL:<memberCode>` (the counter scans it as usual) |
| `locations` | the shop's storefront (`exact`) pins only, `maxDistance` 150 m; none for `area`/`city` shops |
| back | next visit, hours, booking link, where (public line only), shop page, how it works, terms, member code, updates, support |

Google: class `<issuer>.ll_shop_<merchant hex>` (issuer name = shop, `programLogo` = the shop's https logo or ours,
`hexBackgroundColor`, `merchantLocations` for storefronts, `callbackOptions.url` with an HMAC key), object
`<issuer>.ll_s_<merchant hex>_<user hex>` (`loyaltyPoints` "Stamps / 4 of 6", `secondaryLoyaltyPoints` rewards ready,
`heroImage` = `/v1/wallet/strip.png?...`, QR barcode, text modules reward / visit / hours / where / how / terms, links book / shop /
support). PATCHes carry `notifyPreference` NOTIFY (customer activity) or DO_NOT_NOTIFY (shop edits).

Updates: ledger listener `wallet_shop_pass`; `walletAppointmentChanged` from the appointment services (create, update, status,
confirm, cancel, reschedule); `walletShopChanged` after `PUT /wallet-card` and after any 2xx write to `/v1/merchants/:id`,
`/program`, `/rewards…` or `/locations…` (onResponse hook, coalesced per shop). Tests wait with `flushWalletWork()`.

### `GET /v1/wallet/availability` (public) → `{ apple, google }`
### `GET /v1/me/wallet/shops/:merchantId` → `ShopWalletResponse { apple: { available, url, added }, google: {…} }`
`404` unless a member, or a client with a confirmed upcoming booking (their card starts at 0). Apple `url` is a 10-minute signed
`/v1/wallet/apple/shop-download?token=` link; Google `url` the save link (dev-fake: `/v1/wallet/dev/google-save?jwt=`).
### `GET /v1/wallet/apple/shop-download?token=` → pkpass (`401 link_expired`)
### `GET /v1/wallet/strip.png?k=stamps|points&n=&g=&bg=&fg=` (public, counts and colours only) → 1125×369 PNG
### `POST /v1/wallet/google/callback?k=<key>` body `{ signedMessage: "{classId, objectId, eventType: save|del}" }` → `200`, `401` bad key
### `GET /v1/merchants/:id/wallet-card` (staff) → `WalletCardResponse { settings, preview, availability, cardsInWallets }`
### `POST /v1/merchants/:id/wallet-card/preview` (staff, body: draft settings) → `ShopPassModel` for a sample member
### `PUT /v1/merchants/:id/wallet-card` (manager+) → `WalletCardResponse`; refreshes every card of the shop
