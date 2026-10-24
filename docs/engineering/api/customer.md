# Customer API (`/v1/me/...`)

Contract: `packages/shared/src/api/customer.ts` (`customerApi`). Code: `apps/api/src/routes/customer`, `apps/api/src/services/customer.ts`.

Every endpoint needs a customer access token (`Authorization: Bearer ...`), from phone OTP (see [auth.md](auth.md)).
Without one: `401 unauthorized`. Callers only ever see their own data: someone else's membership id is a `404`.
A malformed id in the path is also a `404`.

## Shared shapes

`MembershipDto` (one shop in the wallet):

```json
{
  "id": "member-uuid",
  "merchant": { "id": "uuid", "slug": "roncy-cafe", "name": "Roncy Cafe", "vertical": "cafe", "logoUrl": null, "brandColor": null, "neighbourhoodId": "uuid" },
  "balance": 7, "lifetimePoints": 12, "visitCount": 9, "lastVisitAt": "2026-11-03T15:00:00.000Z", "joinedAt": "...",
  "terminology": "stamps",
  "program": { "name": "...", "earnType": "stamps", "terminology": "stamps", "pointsPerDollar": 0, "pointsPerVisit": 1,
               "minSpendCents": 0, "stampGoal": 10, "welcomeBonus": 1, "birthdayBonus": 0, "referralBonus": 2,
               "expiryMonths": null, "expiryDisclosure": "Stamps never expire.", "termsText": null },
  "expiryDisclosure": "Stamps never expire.",
  "nextReward": { "rewardId": "uuid", "name": "Free drink", "pointsCost": 10, "pointsNeeded": 3, "progressPct": 70 },
  "rewardsAvailableCount": 0,
  "vip": null,
  "muted": false,
  "marketingConsent": { "granted": true, "grantedAt": "...", "text": "Yes, Roncy Cafe may send me ...", "source": "customer_app" }
}
```

- **Always show `expiryDisclosure` next to a balance** (business rule 6). It reads "Points never expire." unless the merchant enabled expiry.
- `nextReward` is the cheapest active reward not yet affordable; `null` once every reward is affordable (or there are none).
- `program` is `null` when the merchant's program is inactive.

`LedgerTxDto`: `{ id, type, source, points (signed), description, amountCents, breakdown: string[], locationId, reversed, createdAt }`.
`type` is one of `earn, redeem, adjust, welcome_bonus, birthday_bonus, referral_bonus, promo_bonus, network_bonus, campaign_bonus, reversal, expire, import`.

`RedemptionDto`: `{ id, rewardId, rewardName, code, status: "issued"|"used"|"void", discountCents, usedAt, createdAt }`.

## Consent (CASL)

Marketing consent is **per shop**. The server stores the exact text the customer agreed to, the time and the source, and logs every grant/withdrawal to `audit_logs`.
Use `customerApi.marketingConsentText(merchantName)` for the wording (or the `consentText` returned by the public join endpoints), show it next to an **unticked** checkbox, and send exactly that string back as `consent.text`. Never pre-tick.
Muting a shop stops all promos from it but the customer keeps earning.

## Profile

### GET /v1/me
`200` → `ProfileDto` `{ id, name, email, phone, memberCode, birthday (YYYY-MM-DD|null), postalCode, homeNeighbourhood: {id,slug,name}|null, locale, phoneVerified, emailVerified, createdAt }`.

### PATCH /v1/me
Body (all optional; `null` clears): `{ name, email, birthday: "YYYY-MM-DD", postalCode: "M6R 2K3", homeNeighbourhoodId, locale: "en"|"hi"|"ur"|"pa" ("en-CA" is the legacy default) }`. The locale is the shopper's language: pushes, inbox text, SMS fallbacks, the wallet pass (Apple and Google, re-issued on change), the lock-screen relevance text and the referral invite text are written in it. Apps save it from Settings and right after sign-in.
Postal codes are normalised to `A1A 1A1`. Changing email clears `emailVerified`.
`200` → `ProfileDto`. Errors: `400` (validation, unknown neighbourhood), `409` (email used by another account).

### DELETE /v1/me (PIPEDA deletion)
Body `{ "confirm": "DELETE" }`. `204`.
Scrubs name, phone, email, password, birthday, postal code and home neighbourhood; replaces the member code (old QR/pass stop working);
withdraws every marketing consent and mutes every shop; deletes sessions, push tokens, wallet passes and pending OTP codes; blanks message bodies sent to the user.
Points history stays (anonymous) so merchants' ledgers still balance. The phone number can sign up again as a brand-new customer.
All tokens stop working immediately. Errors: `400` (missing confirm).

### GET /v1/me/export (PIPEDA access request)
`200` → `DataExportResponse` with `content-disposition: attachment`. Contains profile, memberships (+ transactions + redemptions), visits, referrals, push token platforms, sessions (user agent + dates), orders, service tickets, invoices (without pay tokens) and messages received.

## Wallet

### GET /v1/me/memberships
`200` → `{ items: (MembershipDto & { features: CustomerFeaturesDto })[], totals: { shops, rewardsAvailable } }`, most recently visited first. Closed shops are excluded.
`features { orderAhead, pickupSlots, serviceTickets, inAppPayments, promos, discountCards, referrals, vipLevels, birthdayBonus }`: customer-facing entry points enabled at that shop.
Pricing v2: when a paid loyalty extra is off, the API already hides it. `vip` is `null`, `program.birthdayBonus` and
`program.referralBonus` are `0`, and membership detail returns `discountCards: []`. Apps hide "Invite a friend" when
`referralBonus` is 0.
(same rule as `GET /v1/public/shops/:slug`, see [network.md](network.md)).

### POST /v1/me/memberships (join a shop)
Body: exactly one of `merchantId` or `locationQrCode`, plus optional `consent: { text }` and `referralCode`.

```json
{ "locationQrCode": "RONCY01", "consent": { "text": "Yes, Roncy Cafe may send me ..." }, "referralCode": "K7QX2M9P" }
```

Idempotent: joining a shop you're already in returns `200` with `created: false` (and records consent if you hadn't given it).
New members get the welcome bonus once. `201` (new) / `200` (existing) → `JoinResponse`

```json
{ "membership": { "...": "MembershipDto" }, "created": true, "bonusPoints": 35,
  "referral": { "applied": true } }
```

`referral` is `null` when no code was sent; otherwise `{ applied: false, reason }` with reason
`invalid` (unknown code or other shop), `own_code`, `already_member` (only new members can use a code), `already_used`,
`unavailable` (the shop doesn't have referrals enabled, Plus since Pricing v2: no bonuses, the join still succeeds).
A bad referral code never blocks the join.

Joinable shops: status `onboarding` or `active`. Errors: `400` (both/neither of merchantId/locationQrCode), `404` (unknown/inactive QR or shop), `409 conflict` (this membership was merged into another member by the shop).

### GET /v1/me/memberships/:memberId
Query: `historyLimit` (1-100, default 30), `historyCursor` (from the previous page).
`200` → `MembershipDetailResponse`:
`{ membership, rewards: MemberRewardDto[] (cheapest first, each with affordable + pointsNeeded), discountCards: DiscountCardDto[], openRedemptions: RedemptionDto[], history: { items: LedgerTxDto[], nextCursor } }`.
Discount cards with eligibility `vip` only appear for VIP members. Errors: `400` (bad cursor), `404`.

### PATCH /v1/me/memberships/:memberId
Body `{ "muted": true }`. `200` → `MembershipDto`. Errors: `404`.

### POST /v1/me/memberships/:memberId/consent
Body `{ "text": "<exact consent text>" }` (10-2000 chars). Grants marketing consent for this shop. `200` → `MembershipDto`.

### DELETE /v1/me/memberships/:memberId/consent
Withdraws marketing consent. `200` → `MembershipDto` (`marketingConsent.granted: false`). The withdrawal and the previously agreed text are kept in `audit_logs`.

## Rewards from the app

### POST /v1/me/memberships/:memberId/redeem
Body `{ "rewardId": "uuid", "idempotencyKey"?: "..." }` (or `Idempotency-Key` header; generate one per tap).
Deducts the points now and issues a 6-character code (`status: "issued"`) the customer shows at the counter; staff confirm it with
`POST /v1/merchants/:merchantId/counter/redemptions/verify` (see [staff.md](staff.md)).
`201` (new) / `200` (retry, `duplicate: true`) → `{ redemption: RedemptionDto, balance, duplicate }`.
**Expiry:** app-issued codes expire 10 minutes after `createdAt` (`redemption.expiresAt`; `null` for codes that don't expire).
Show a countdown. After `expiresAt` the counter rejects the code (`409 redemption_expired`) and a background job
(`redemptions.expire`, every minute) voids it (`status: "void"`) and refunds the points through the ledger.
Errors: `404` (membership/reward), `409 insufficient_points`, `409 conflict` (shop paused).

### DELETE /v1/me/redemptions/:redemptionId
Cancels an `issued` code and returns the points (reversal through the ledger). `200 { "balance": 60 }`.
Errors: `404`, `409` (already used or cancelled).

## Card & QR

### GET /v1/me/card
`200` → `{ memberCode: "K7QX2M9P", qrPayload: "LL:K7QX2M9P", qrSvg: "<svg ...>", name }`.
Encode `qrPayload` in the QR (or render `qrSvg`). Staff scanners at **any** shop accept it. Show `memberCode` under the QR for manual entry.

## Push tokens

### POST /v1/me/push-tokens
Body `{ "token": "ExponentPushToken[...]", "platform": "ios"|"android"|"web" }`. `204`. If the token was registered to another account (shared device), it moves to this one.

### DELETE /v1/me/push-tokens/:token
URL-encode the token. `204` (also when it wasn't registered). Call on sign-out.

## Referrals

### GET /v1/me/memberships/:memberId/referral
Returns your current unused referral code for this shop (creates one if needed). `402 feature_locked` when the shop
doesn't have `loyalty.referrals` (Plus, Pricing v2). The same applies to POST.
### POST /v1/me/memberships/:memberId/referral
Mints a fresh code (`201`).

`ReferralResponse`:

```json
{ "code": "K7QX2M9P", "shareUrl": "https://<web>/shops/roncy-cafe?ref=K7QX2M9P",
  "shareText": "Join me at Roncy Cafe on Local Loyalty and we both get 25 points: ...",
  "bonusPoints": 25, "stats": { "invited": 3, "rewarded": 3 } }
```

Codes are **single-use**: the first new member who joins with it consumes it, and the next GET returns a new code.
Both people get the merchant's `referralBonus` as `referral_bonus` ledger transactions (idempotent per referral).
`bonusPoints: 0` means the shop has no referral bonus; the link still works as an invite.
Web: the `/shops/:slug?ref=CODE` page should pass `ref` through to `POST /v1/me/memberships` as `referralCode`.
