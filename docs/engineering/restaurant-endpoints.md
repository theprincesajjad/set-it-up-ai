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

## Tiffin (restaurant.tiffin, Growth)
Merchant `/v1/merchants/:merchantId/tiffin`: `GET|POST /plans` · `PATCH|DELETE /plans/:planId` · `GET /menus?from&to&planId` · `PUT /menus` (≤31 days, planId null = shop-wide) · `DELETE /menus/:menuId` ·
`GET|POST /routes` · `PATCH|DELETE /routes/:routeId` · `PUT /routes/:routeId/stops {subscriptionIds}` · `POST /routes/auto-assign` ·
`GET /subscribers?status,planId,routeId,unrouted,fulfilment,q,cursor` · `GET|PATCH /subscribers/:subId` · `POST /subscribers/:subId/{pause,resume,cancel,skips}` ·
`GET /kitchen?date` (servings per plan, menu, delivery/pickup split, dietary notes) · `GET /manifest?date&routeId` · `POST /deliveries/status {ids,status,note}` · `GET /revenue?month=YYYY-MM`.
Public: `GET /v1/public/shops/:slug/tiffin/plans?lang&menuDays`.
Customer `/v1/me/tiffin`: `POST|GET /subscriptions` · `GET|PATCH /subscriptions/:subId` · `GET /upcoming?days&subscriptionId` (cutoffAt, canSkip, menu) ·
`POST /subscriptions/:subId/skips` · `DELETE /subscriptions/:subId/skips/:date` · `POST /subscriptions/:subId/{pause,resume,cancel,retry-payment}`.
Rules: meal day opens 08:00 Toronto, cutoff = cutoffHours before; skip credit only before cutoff; renewals create a PaymentIntent and send `renewal_due` (customer confirms).

## WhatsApp (restaurant.whatsapp_notifications Starter / ordering + marketing Growth)
Merchant `:m/whatsapp`: `GET|PUT /settings` (connection, approved templates, usage) · `DELETE /connection` · `GET /sessions` · `POST /opt-ins {phone|userId,source}` · `POST /opt-outs {phone}` ·
`POST /broadcasts {templateName, language, params[], segment, dryRun}` (402 `whatsapp_credits_exhausted`; 409 21:00–08:00).
Customer: `GET|PUT /me/merchants/:merchantId/whatsapp-consent {optIn, language?}`.
Public: `GET /public/whatsapp/pay/:orderId?t=token` → order summary + Stripe clientSecret. **Web page needed at `/pay/order/:orderId?t=`.**

## Festivals (restaurant.festival_campaigns, Growth)
`GET :m/festivals/upcoming?days=90` · `GET :m/festivals` · `POST :m/festivals/:festivalId/campaign-drafts {templateId, channel, year?, segment?, subject?, body?, scheduledAt?}`.
Calendar + templates also importable from `@ll/shared` (`festivals.ts`).

## Reviews (restaurant.reviews, Starter)
Public: `GET|POST /public/reviews/:token` (`{rating, feedback?}` → `{leadWithGoogle, googleReviewUrl, message}`). **Web page needed at `/r/<token>`** (check the review link path in services/reviews.ts).
Merchant: `GET :m/reviews?rating&status&cursor` · `GET :m/reviews/stats` · `PUT :m/reviews/settings {googleReviewUrl}` · `POST :m/reviews/requests {orderId}`.

## Phone orders (restaurant.phone_ai, Pro or add-on)
`GET :m/phone/calls?status&cursor` · `GET :m/phone/calls/:callId` · `POST .../confirm {items?, locationId?, pickupAt?, notes?, paymentMethod?, tipCents?}` · `POST .../discard`.

## Billing (restaurant pack)
`/billing/restaurant/*` checkout/change/cancel/resume · `GET /billing/add-ons` · `PUT|DELETE /billing/add-ons/:id` · `GET /billing/invoices` · admin `PUT /v1/admin/merchants/:merchantId/charge-mode`.
Fees: `computeFees({kind, amountCents, plan, restaurantTier, customerServiceFee})` in `apps/api/src/services/fees.ts`. Payments: use `createConnectPayment` / `refundConnectPayment` from `services/payments.ts`.

## Menu, dietary, languages, pre-orders, dual pricing (Starter/Growth/Pro)
Catalog items (existing `POST|PATCH :m/catalog/items[/:itemId]`, `GET :m/catalog`) now carry `dietary`, `translations`, `preorderOnly`, `leadTimeHours`, `serves`, `depositBps` (Growth), `station` (Pro).
Public: `GET /public/shops/:slug/menu?lang=hi|ur|pa&halal=1&veg=1&maxSpice=0-3` (adds `lang`, `languages`, `cashPriceCents`, `dualPricing`) · `GET /network/shops?halal=1|all` (items carry `halalMenu: "all"|"some"`).
`GET|PUT :m/menu/languages` · `GET|PUT :m/dual-pricing {cashDiscountBps 0–1000}` (Pro; 409 in QC).
Pre-orders: `POST /me/orders {kind:"preorder", pickupAt}` (409 `preorder_lead_time` / `preorder_full` / `preorder_only`) · `GET :m/preorders?from&to` (prep list, pots, cap, remaining) · `GET|PUT :m/preorders/settings {preorderDailyCap}`.
Counter orders: `POST :m/orders/counter {items, tender?, tipCents?, customerPhone?, notes?}`; `POST :m/orders/:orderId/status` accepts `tender` on picked_up.

## Kitchen display (restaurant.kds, Pro)
`GET :m/kitchen/tickets?station=&lang=` (defaults to staff station/locale; `all`) · `PATCH :m/kitchen/items/:itemId {status: cooking|ready}` · `POST :m/kitchen/orders/:orderId/{bump,recall,fire}`.

## Split bills (restaurant.split_bills, Pro)
`POST :m/orders/:orderId/splits` (`{mode:"even", ways, labels?}` | `{mode:"items", splits:[{label?, itemIds}]}`) · `GET|DELETE :m/orders/:orderId/splits`.
Public: `GET /public/splits/:token` · `POST /public/splits/:token/pay {tipCents}` → clientSecret. **Web page needed at `/pay/split/<token>`**.
