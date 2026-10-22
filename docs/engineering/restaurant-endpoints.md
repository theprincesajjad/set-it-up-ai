# Restaurant pack endpoints

All under `/v1`. `:m` = `/merchants/:merchantId`. Merchant routes return 402 without the feature.

## Catering (restaurant.catering, Growth)
Staff: `GET :m/catering?status&from&to` (pipeline + counts) · `GET :m/catering/calendar?from&to` ·
`POST :m/catering` (inquiry by phone) · `GET|PATCH :m/catering/:eventId` ·
`PUT :m/catering/:eventId/menu` `{items[{catalogItemId|name, pricing:"per_head"|"tray", perHeadCents?, quantity?, unitPriceCents?}], extras[], depositBps?}` ·
`POST :m/catering/:eventId/tasting {tastingAt}` · `POST .../send-quote {channels}` · `POST .../deposit/mark-paid` ·
`POST .../invoice {send}` · `POST .../complete` · `POST .../cancel {reason?}` · `POST .../hall-booking {hallBookingId}`.
Customer: `POST|GET /me/catering`, `GET /me/catering/:eventId`.
Public: `POST /public/shops/:slug/catering/inquiries` · `GET /public/catering/:token` ({merchant, event, canApprove, depositDue}) ·
`POST /public/catering/:token/approve {signatureName}` → `{event, deposit:{clientSecret,...}|null}`.
Web approval page lives at **`/e/<token>`** (not `/c`, which is campaigns). Balance invoice pays at existing `/i/<payToken>`.
Statuses: inquiry → tasting → quoted → confirmed (deposit paid) → completed | cancelled.

## Banquet (restaurant.banquet, Pro or add-on)
Staff: `GET|POST :m/banquet/halls` · `GET|PATCH|DELETE :m/banquet/halls/:hallId` · `GET :m/banquet/availability?from&to&hallId` ·
`GET :m/banquet/bookings?status&hallId&from&to` · `POST :m/banquet/bookings` (hold + customer{phone,name}) ·
`GET :m/banquet/bookings/:id` · `POST .../confirm {markDepositPaid?}` · `.../cancel` · `.../complete` · `.../deposit` · `.../catering {cateringEventId}`.
Customer: `POST /me/banquet/holds` · `GET /me/banquet/bookings[/:id]` · `POST /me/banquet/bookings/:id/cancel`.
Public: `GET /public/shops/:slug/banquet/halls` · `GET /public/shops/:slug/banquet/availability`.
