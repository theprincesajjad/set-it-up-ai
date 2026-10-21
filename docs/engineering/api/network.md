# Network & public API

Contract: `packages/shared/src/api/network.ts` (`networkApi`). Code: `apps/api/src/routes/network`, `apps/api/src/services/network.ts`.

No auth required. If a valid customer bearer token is sent, results are personalised (balances, members-only promos, muted shops hidden).

Visibility rules:
- Map, list and feed show merchants with status `active` that have not had `network.listing` switched off by an admin override.
- The public shop page and QR join also work for `onboarding` merchants (shops seed their first 25 members while onboarding). `paused`/`closed` → `404`.

Lists return `{ items, nextCursor }`; pass `cursor=<nextCursor>` for the next page (`null` = last page).

## Shared shapes

`LocationDto`: `{ id, name, address, city, postalCode, lat, lng, phone, hours, openNow }`.
`hours` is `{ "mon": [["09:00","17:00"]], ... }` with keys `sun mon tue wed thu fri sat` in the merchant's timezone; an interval whose close is earlier than its open runs past midnight (`["20:00","02:00"]`).
`openNow` is `null` when hours aren't set.

`PromoDto`: `{ id, title, body, imageUrl, kind: offer|multiplier|bonus_points|discount|event, multiplierPct, bonusPoints, percentOff, daysOfWeek (0=Sun), startTime, endTime, startsAt, endsAt, audience: network|members|vip, activeNow }`.
`activeNow` includes the day-of-week/time window (e.g. "Tuesday double points" is `false` on Monday).

## GET /v1/network/neighbourhoods
`200` → `{ items: NeighbourhoodDto[] }`, neighbourhoods in `pilot` or `live`, by name:
`{ id, slug, name, city, province, status, centerLat, centerLng, radiusMetres, biaName, shopCount }` (`shopCount` = listed active shops).

## GET /v1/network/neighbourhoods/:slug
`200` → `{ neighbourhood, perks: NetworkPerkDto[], liveCampaigns: CampaignBriefDto[], livePromoCount }`.
`perks` include city-wide perks (no neighbourhood). `liveCampaigns` are status `live` with now inside `startsAt..endsAt`. Errors: `404`.

## GET /v1/network/shops
Query: `lat`, `lng` (both or neither), `neighbourhood` (slug), `vertical` (e.g. `cafe`), `q` (name/description search), `radiusMetres` (100-50000, needs lat/lng), `limit` (default 50, max 200), `cursor`.

`200` → `ShopsResponse` items (`ShopListItemDto`):

```json
{
  "merchant": { "id": "uuid", "slug": "roncy-cafe", "name": "Roncy Cafe", "vertical": "cafe", "logoUrl": null, "brandColor": null, "neighbourhoodId": "uuid", "description": "..." },
  "location": { "...": "LocationDto (nearest active location)" },
  "locationCount": 1, "distanceMetres": 42, "openNow": true, "hasPromo": true,
  "terminology": "stamps", "earnType": "stamps",
  "myBalance": 7, "isMember": true
}
```

Sorted by distance when `lat/lng` are given (shops without coordinates last), otherwise by name. `hasPromo` = a `network`-audience promo applies right now.
`myBalance`/`isMember` are filled only for signed-in callers. Errors: `400` (only one of lat/lng, radius without a point, bad cursor), `404` (unknown neighbourhood).

## GET /v1/network/feed
Query: `lat`, `lng`, `neighbourhood`, `limit` (default 30, max 100), `cursor`.

Promos from listed active merchants with status `live`/`scheduled` that apply now (`promoAppliesAt`: date window, days of week, time of day).
Sorted by distance (then newest). Audience `members` only for members of that shop, `vip` only for VIP members. Shops the caller muted are excluded.

`200` → `{ items: FeedEntry[], nextCursor }`. Discriminate on `sponsored`:
- `sponsored: false` → `FeedItemDto { promo, merchant, location, distanceMetres, isMember }`
- `sponsored: true` → `adsApi.SponsoredItem` (ads team; always show the "Sponsored" label)

Sponsored injection happens in `injectSponsored(items, ctx, opts)` in `services/network.ts` (the extension point, delegating to the ads team's `services/sponsored.ts`). It receives the caller's muted shops as `excludeMerchantIds`.

## POST /v1/network/promos/:promoId/view · POST /v1/network/promos/:promoId/claim
Increment the promo's `viewCount` / `claimCount`. Call `view` when a promo card is shown (once per session), `claim` when the customer taps "Use"/"Save".
`200` → `{ ok: true, viewCount, claimCount }`. Errors: `404` (unknown, draft/ended promo, or merchant not live).

## GET /v1/public/shops/:slug
The public merchant page (web pass / app shop screen). `200` → `PublicShopResponse`:
`{ merchant: { ...brief, description, phone, email, website, instagram, coverUrl, timezone, neighbourhood }, locations: LocationDto[], program: ProgramSummaryDto|null, rewards: RewardDto[], promos: PromoDto[] (network audience, in date window, with activeNow), discountCards: DiscountCardDto[] (VIP-only cards excluded), consentText }`.
Errors: `404`.

## No-download join from the counter QR (< 30 seconds)

The counter stand QR encodes `https://<web>/join/<qrCode>` (`locations.qr_code`). The web page does four calls:

1. `GET /v1/public/join/:qrCode` → `JoinInfoResponse { qrCode, merchant, location, program, rewards (cheapest 3), consentText }`. Render shop name, the welcome bonus (`program.welcomeBonus`), the phone field, an **unticked** consent checkbox with `consentText`.
2. `POST /v1/public/join/:qrCode` body `{ phone, name?, consent? }` → sends the SMS code ("123456 is your code to join Roncy Cafe on Local Loyalty...").
   `200` → `{ sent: true, expiresInSeconds: 600, devCode? (non-prod), next: { verify, join, locationQrCode } }`. Same OTP limits as `/v1/auth/otp/start`.
3. `POST /v1/auth/otp/verify` `{ phone, code, name }` → tokens (see [auth.md](auth.md)). Use `autocomplete="one-time-code"` so phones auto-fill the SMS code.
4. `POST /v1/me/memberships` `{ locationQrCode, consent? }` with the access token → membership + welcome bonus ([customer.md](customer.md)). Send `consent` only if the box was ticked, with the exact `consentText`.

Step 2 does not store consent: consent is recorded at step 4, once the phone is verified.
Errors: `404` (unknown/inactive QR or shop not joinable), `400` (bad phone), `429` (too many codes).
