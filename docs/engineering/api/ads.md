# Ads API (network advertising, Phase 3)

Contract: `packages/shared/src/api/ads.ts` (`adsApi`). Product rules: `docs/business/network-monetization.md`.
Code: `apps/api/src/routes/ads/`, `services/ads.ts`, `services/sponsored.ts`, `services/attribution.ts`, `services/adsPush.ts`, `jobs/ads.ts`.

All money is integer cents (CAD). Errors use the standard envelope `{ error: { code, message, details? } }`.

## Feature gating

Every merchant endpoint is gated server-side. While a feature is `hidden` (the default) the response is
`402 feature_locked` with `details: { feature, reason: "rollout" }`.

| Placement | Feature key |
| --- | --- |
| `feed_top`, `search_top` | `ads.sponsored_listing` |
| `map_pin` | `ads.map_pin` |
| `promo_boost`, `nearby_push` | `ads.sponsored_promo` |

List / detail / report / pause / resume / cancel need at least one of the three keys enabled.

## Object: `AdCampaign`

`id, merchantId, placement, status (draft|pending_review|active|paused|ended|rejected), promoId, headline, body, imageUrl,
neighbourhoodIds, radiusMetres, pricingModel (daily|cpm), rateCents, budgetCents, spentCents, startsAt, endsAt,
impressions, clicks, attributedVisits, paymentStatus (pending|paid|invoiced|refunded|failed), reviewNote, reviewedAt,
endedReason (completed|budget_exhausted|cancelled|null), createdAt`

Admin rows (`AdminAdCampaign`) add `merchant: { id, name, slug }`.

---

## Public / customer

### `GET /v1/ads/rate-card`
No auth. → `{ rateCard, rules }` (`AD_RATE_CARD`, `AD_RULES`).

### `GET /v1/ads/sponsored`
Auth optional. Query: `placement` (required), `lat`, `lng`, `neighbourhoodId`, `limit` (1–10, default 1).
Signed-in viewers get frequency caps and muted shops applied. With no location signal (no lat/lng, no
neighbourhood, no home neighbourhood) nothing is served.
→ `{ items: SponsoredItem[] }` where each item has `sponsored: true`, `label: "Sponsored"`, `adCampaignId`,
`placement`, `headline`, `body`, `imageUrl`, `merchant {id,name,slug,logoUrl}`, `promo | null`, `location {lat,lng} | null`,
`distanceMetres | null`. Clients must render the "Sponsored" label.
Errors: `400` invalid query.

### `POST /v1/ads/:id/impression`
Auth: customer. Call when the item is actually shown. → `{ counted: boolean }`.
`counted: false` when the campaign isn't serving or the user is over the cap (3 per campaign per rolling 24h).
CPM campaigns are billed per counted impression and end when the budget is exhausted.
Errors: `401`, `404`.

### `POST /v1/ads/:id/click`
Auth: customer. → `{ counted: boolean }`. One counted click per user per campaign per 24h. Errors: `401`, `404`.

Visits are attributed automatically (no endpoint): see "Attribution" in the product spec.

---

## Merchant self-serve (owner / manager)

### `GET /v1/merchants/:merchantId/ads`
Query: `status?`, `limit` (≤200, default 50), `cursor?`. → `{ items: AdCampaign[], nextCursor }` newest first.
Errors: `401`, `402`, `403`.

### `POST /v1/merchants/:merchantId/ads`
Body (`createAdCampaignBody`):

| Field | Notes |
| --- | --- |
| `placement` | `feed_top`, `search_top`, `map_pin`, `promo_boost`, `nearby_push` |
| `pricingModel` | `daily` (flat, rate × flight days) or `cpm`. `nearby_push` is CPM-only. |
| `promoId?` | Boost one of your own live, network-audience promos. Required for `promo_boost`. Its title/body/image fill in missing creative. |
| `headline?` `body?` `imageUrl?` | Headline 3–80 chars (required unless `promoId`), body ≤280. |
| `neighbourhoodIds[]` / `radiusMetres?` | At least one. Radius (200–10,000 m) is measured from your locations and needs a location with coordinates. |
| `startsAt`, `endsAt` | ISO timestamps; start not in the past; flight ≤ 90 days. |
| `budgetCents?` | Required for CPM (min 2,500). Ignored for daily (computed). |

The server sets `rateCents` from the rate card. → `201 AdCampaign` with `status: "pending_review"`,
`paymentStatus: "pending"` (ad spend is invoiced; see the spec).
Errors: `400` validation, `402` feature locked, `403`, `404` promo, `409` promo ended / shop not active.

### `GET /v1/merchants/:merchantId/ads/:adId`
→ `AdCampaign`. Errors: `402`, `403`, `404`.

### `GET /v1/merchants/:merchantId/ads/:adId/report`
→ `AdReport`: `impressions, clicks, ctr (0..1), attributedVisits, spentCents, budgetCents, costPerVisitCents | null,
uniqueUsersReached, daily: [{ date (merchant time zone), impressions, clicks, visits }]`. Aggregates only.

### `POST /v1/merchants/:merchantId/ads/:adId/pause` · `/resume` · `/cancel`
→ `AdCampaign`. Pause: active → paused (paused days aren't billed). Resume: paused → active (before endsAt).
Cancel: → ended (`endedReason: "cancelled"`). Errors: `409` invalid transition.

---

## Admin review queue (`platformRole = admin`)

### `GET /v1/admin/ads`
Query: `status` (default `pending_review`), `limit`, `cursor`. → `{ items: AdminAdCampaign[], nextCursor }`, oldest first.

### `GET /v1/admin/ads/:id` · `GET /v1/admin/ads/:id/report`
→ `AdminAdCampaign` / `AdReport`.

### `POST /v1/admin/ads/:id/approve`
Body `{ note? }`. pending_review → active (serves from `startsAt`). Errors: `409` not pending / flight over.

### `POST /v1/admin/ads/:id/reject`
Body `{ reason }` (3–500 chars, shown to the merchant as `reviewNote`). pending_review → rejected.
If the campaign was already paid by card it is refunded through the payments provider. Errors: `400`, `409`.

### `POST /v1/admin/ads/:id/mark-paid`
Body `{ paymentStatus: "paid" | "invoiced" }` (default `paid`). Errors: `409` refunded.

All admin endpoints: `401` signed out, `403` not admin, `404` unknown id. Review actions are written to `audit_logs`.

---

## For other teams

- **Feed / search / map (network.ts):** call `injectSponsored(items, ctx, { placement, lat, lng, neighbourhoodId, userId })`
  from `apps/api/src/services/sponsored.ts`. It returns organic items with sponsored items interleaved
  (max 1 per 5 organic, first at position 2, `sponsored: true`). For map pins, call `selectSponsored(ctx, { placement: "map_pin", ... })`.
- **Jobs:** `ads.lifecycle` (5 min), `ads.nearby_push` (15 min), `campaigns.lifecycle` (5 min) in `jobs/ads.ts`.
