# Restaurant pack endpoints

All under `/v1`. `:m` = `/merchants/:merchantId`. Merchant routes return 402 without the feature.

## Catering (restaurant.catering, Growth)
Staff: `GET :m/catering?status&from&to` (pipeline + counts) · `GET :m/catering/calendar?from&to` ·
`POST :m/catering` (inquiry by phone) · `GET|PATCH :m/catering/:eventId` ·
`PUT :m/catering/:eventId/menu` `{items[{catalogItemId|name, pricing:"per_head"|"tray", perHeadCents?, quantity?, unitPriceCents?}], extras[], depositBps?}` ·
`POST :m/catering/:eventId/tasting {tastingAt}` · `POST .../send-quote {channels}` · `POST .../deposit/mark-paid {method, amountCents?, receivedOn?, bankReference?, note?, sendReceipt?}` (writes a `manual_payments` ledger row, keeps `depositMethod` / `depositReceivedOn`, confirms once the deposit is covered; a bare `{}` still works) · `POST .../balance/record-payment {method, amountCents, receivedOn, bankReference?, note?, sendReceipt?}` (balance after the deposit; marks the open balance invoice paid when covered) ·
`POST .../invoice {send}` · `POST .../complete` · `POST .../cancel {reason?, refund?: "full"|"none"|{amountCents}}` (default `none`; refunds a deposit paid in the app, 409 for one recorded by hand; DTO shows `depositRefundCents` / `depositRefundedAt`) · `POST .../hall-booking {hallBookingId}`.
Customer: `POST|GET /me/catering`, `GET /me/catering/:eventId`.
Public: `POST /public/shops/:slug/catering/inquiries` · `GET /public/catering/:token` ({merchant, event (with `tax` label), canApprove, depositDue, manual:{email,amountCents,referenceCode,instructions}|null, pay:{card,etransfer}, cancellationTiers}; the first load stamps `quoteOpenedAt`) ·
`POST /public/catering/:token/approve {signatureName, payWith?: "card"|"etransfer"}` → `{event, deposit:{clientSecret,...}|null, manual|null}` (`etransfer` never creates a card payment).
Staff list also returns `summary` (open quotes, deposits to collect, balances due in 14 days, booked next 8 weeks, 8-week strip). `PUT .../menu` takes `serviceChargeBps` (taxed). Events carry `referenceCode`, `serviceChargeBps`, `depositMethod`, `payments[]` (ledger), `dateClashes` (staff).
Web approval page lives at **`/e/<token>`** (not `/c`, which is campaigns). Balance invoice pays at existing `/i/<payToken>`.
Statuses: inquiry → tasting → quoted → confirmed (deposit paid) → completed | cancelled.

## Banquet (restaurant.banquet, Pro or add-on)
Staff: `GET|POST :m/banquet/halls` · `GET|PATCH|DELETE :m/banquet/halls/:hallId` · `GET :m/banquet/availability?from&to&hallId` ·
`GET :m/banquet/bookings?status&hallId&from&to` · `POST :m/banquet/bookings` (hold + customer{phone,name}) ·
`GET :m/banquet/bookings/:id` · `POST .../payments {instalmentIndex?, method, amountCents, receivedOn, ...}` (records an instalment by hand; the first one sets `depositPaidAt` and confirms when the hall says so) · `POST .../confirm {markDepositPaid?}` · `.../cancel {refund?: "full"|"none"|{amountCents}}` (same rules as catering; also refunds a deposit that landed after a cancel) · `.../complete` · `.../deposit` · `.../catering {cateringEventId}`.
Halls carry `refundPolicy: {tiers: [{minDaysBefore, refundBps}]}` (default 100% from 30 days, 50% from 14, none after) and `paymentSchedule` (template of `{label, bps, dueOffsetDays}`, must total 100%, default 25% at hold / 50% 14 days before / 25% 7 days before) with `autoConfirmOnFirstPayment`. A booking copies it into dated `schedule[]` rows that sum to the total to the cent, plus a `referenceCode`. Staff availability rows carry `label` and `holdExpiresAt`; the public ones do not. Job `banquet.reminders` sends payment-due notices and hold-expiry notices (24 h and 4 h before).
Customer: `POST /me/banquet/holds` · `GET /me/banquet/bookings[/:id]` · `POST /me/banquet/bookings/:id/cancel` (once the deposit is paid in the app, the hall's `refundPolicy` is applied automatically; bookings show `depositRefundCents`, `depositRefundedAt`, `refundPolicy`).
Public: `GET /public/shops/:slug/banquet/halls` · `GET /public/shops/:slug/banquet/availability`.

## Tiffin (restaurant.tiffin, Growth)
Merchant `/v1/merchants/:merchantId/tiffin`: `GET|POST /plans` · `PATCH|DELETE /plans/:planId` · `GET /menus?from&to&planId` · `PUT /menus` (≤31 days, planId null = shop-wide) · `DELETE /menus/:menuId` ·
`GET|POST /routes` · `PATCH|DELETE /routes/:routeId` · `PUT /routes/:routeId/stops {subscriptionIds}` · `POST /routes/auto-assign` ·
`GET /subscribers?status,planId,routeId,unrouted,fulfilment,q,cursor` · `GET|PATCH /subscribers/:subId` · `POST /subscribers/:subId/{pause,resume,cancel,skips}` ·
`GET /kitchen?date` (servings per plan, menu, delivery/pickup split, dietary notes, plus `delivered`, `outForDelivery`, `routes[]` progress, `prep[]` (dish totals; "(4)" in a dish name means 4 pieces a serving), `awaiting{count,cents}`, `unrouted`, `pastDue`, `nextCutoffAt`) · `GET /manifest?date&routeId` · `POST /deliveries/status {ids,status,note}` · `GET /revenue?month=YYYY-MM` (adds `collectedByMethod[]`, `awaitingCents/Count`, `pastDueCents`, `inFlightCents`).
Hand-recorded payments (no platform fee): `GET /awaiting` · `POST /charges/:chargeId/record-payment {method: etransfer|cash|cheque|other, amountCents, receivedOn (not future), bankReference?, note?, sendReceipt?}` (409 + the existing record when already paid; less than due keeps it `awaiting` with `remainingCents`; more is stored and flagged `overpaidCents`) · `POST /charges/:chargeId/void-payment {reason}` · subscribers take `?payment=etransfer|card|pad|cash` and `?awaiting=true` and carry `awaitingCents`, `awaitingSince`. `subscribe` accepts `paymentMethod: etransfer|cash` (no Stripe account needed) and returns `manual:{email,amountCents,referenceCode,instructions}` with `payment: null`. Job `tiffin.remind_manual` reminds on day 1 and day 3 (not 21:00 to 08:00) and marks past due after the shop's grace days.
Driver link: `POST /routes/:routeId/driver-link {date?}` → `{url, token, expiresAt}` (23:59 Toronto that day; same URL when asked again) · `POST /driver-links/send {routeIds, channel: sms|whatsapp}` · `POST /deliveries/mark-all-out {routeId?, date?}` · `POST /deliveries/late-notice {routeId?, minutes}`. Public, token only, 120 requests a minute: `GET /v1/public/tiffin/driver/:token` (stops, progress; 404 unknown, 410 expired) · `POST /v1/public/tiffin/driver/:token/stops/:deliveryId {status: delivered|missed, note?}` · `POST /v1/public/tiffin/driver/:token/late {minutes}` (429 inside 15 minutes). Page: **`/d/<token>`**.

## Shop payment settings (tiffin, catering, banquet)
`GET|PUT /v1/merchants/:merchantId/payment-settings` (owner to change: e-transfer email and words, cash, grace days 0 to 14, start on trust, card / PAD switches) · `GET|PUT .../tax-settings` (GST/HST registered or not, number checked as 9 digits + RT0001; not verified with the CRA) · `GET|PUT .../food-safety` (food handler expiry, health unit, optional badge; never blocks selling). Quote and charge tax uses `salesTaxBps({province, taxRegistered})` from `@ll/shared`: not registered = 0; unset still quotes at the provincial rate and says so; tiffin charges add tax only when the shop says it is registered and the plan is taxable.
Public: `GET /v1/public/shops/:slug/tiffin/plans?lang&menuDays`.
Customer `/v1/me/tiffin`: `POST|GET /subscriptions` · `GET|PATCH /subscriptions/:subId` · `GET /upcoming?days&subscriptionId` (cutoffAt, canSkip, menu) ·
`POST /subscriptions/:subId/skips` · `DELETE /subscriptions/:subId/skips/:date` · `POST /subscriptions/:subId/{pause,resume,cancel,retry-payment}`.
`POST /me/tiffin/subscriptions/:subId/payment-method` → `{setupIntentId, clientSecret, methods}` (change the card on file; confirm with Stripe.js or at web page **`/pay/setup/<setupIntentId>?cs=<clientSecret>`**; public status `GET /public/payments/setup/:setupIntentId?cs=`). Customer subscription DTOs carry `cardOnFile: {type, brand, last4} | null`.
Rules: meal day opens 08:00 Toronto, cutoff = cutoffHours before; skip credit only before cutoff. The first payment saves the card (or PAD mandate); renewals then charge it off-session automatically and send `renewal_paid`. If the bank needs the customer (authentication required) the charge stays pending and `renewal_due` is sent (customer confirms at `/pay/intent`); a decline marks it failed, the subscription `past_due`, and sends `payment_failed`.

## WhatsApp (restaurant.whatsapp_notifications Starter / ordering + marketing Growth)
Merchant `:m/whatsapp`: `GET|PUT /settings` (connection, approved templates, usage) · `DELETE /connection` · `GET /sessions` · `POST /opt-ins {phone|userId,source}` · `POST /opt-outs {phone}` ·
`POST /broadcasts {templateName, language, params[], segment, dryRun}` (402 `whatsapp_credits_exhausted`; 409 21:00–08:00).
Customer: `GET|PUT /me/merchants/:merchantId/whatsapp-consent {optIn, language?}`.
Public: `GET /public/whatsapp/pay/:orderId?t=token` → order summary + Stripe clientSecret. **Web page needed at `/pay/order/:orderId?t=`.**

## Festivals (restaurant.festival_campaigns, Growth)
`GET :m/festivals/upcoming?days=90` · `GET :m/festivals` · `POST :m/festivals/:festivalId/campaign-drafts {templateId, channel, year?, segment?, subject?, body?, scheduledAt?}`.
Calendar + templates also importable from `@ll/shared` (`festivals.ts`).

## Reviews (restaurant.reviews, Starter)
Public: `GET|POST /public/reviews/:token` (`{rating, feedback?}` → `{rating, leadWithGoogle (deprecated, always true), googleReviewUrl, message}`; the answer is identical for every rating but `rating`, so nobody is screened: Google's policy) · `POST /public/reviews/:token/google-opened` (counted once). Web page at `/r/<token>`: both options (private note, public Google review) at every rating.
Merchant: `GET :m/reviews?rating&maxRating&handled=0|1&status&cursor` (adds order number and channel, guest language and phone, `handledAt`, `reply`) · `GET :m/reviews/stats` (adds `googleOpened`, `privateToRead`) · `PUT :m/reviews/settings {googleReviewUrl}` · `POST :m/reviews/requests {orderId}` · `POST :m/reviews/:id/handled` · `POST :m/reviews/:id/reply {channel: whatsapp|sms|email, body}` (409 `window_closed` / `no_credits` / `no_contact`) · `POST :m/reviews/:id/offer-chai` (one-use 30 day code).

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
Web ordering and halal block (desi1): `catalog_items.options` = `{groups:[{id,name,type:"single|multi",required,priceMode:"delta|absolute",options:[{id,name,priceCents,serves?,note?,default?}]}]}` (an "absolute" single group sets the dish price: size); `POST /me/orders` items take `optionIds[]` and `channel:"web"`; the server prices from the options (a required group with no pick uses its default, so older clients pay the listed price). Pre-order deposit is a share of the bill with tax. `GET /public/shops/:slug/restaurant` (halal block, weekend pots, most ordered, wait, features) · `GET /public/shops/:slug/preorders/availability?itemId&from&to` · `GET|PUT|DELETE :m/menu/halal-certification` (owner only; `{certifier, certificateNo?, scope: all_meat|some_dishes, slaughter: zabihah|machine|unspecified, validUntil?, fileUrl?}`; the public menu returns `halalCertification` and keeps a dish's `halalCertifier` only when it differs; past `validUntil` the certifier is withheld) · `GET /public/shops/:slug/menu?without=peanut,tree_nut` · `GET|PUT :m/preorders/cancel-rule {cancelCutoffHours|null}`; `POST /me/orders/:id/cancel` on a pre-order is free until that cutoff (409 `cancel_cutoff` after; the shop can still cancel and refund). Job `halal.expiry-reminders` emails (or WhatsApps, when the owner has opted in and the 24 hour window is open) 60 and 30 days before expiry.
Counter orders: `POST :m/orders/counter {items, tender?, tipCents?, customerPhone?, notes?}`; `POST :m/orders/:orderId/status` accepts `tender` on picked_up.

## Kitchen display (restaurant.kds, Pro)
`GET :m/kitchen/tickets?station=&lang=` (defaults to staff station/locale; `all`) · `PATCH :m/kitchen/items/:itemId {status: cooking|ready}` · `POST :m/kitchen/orders/:orderId/{bump,recall,fire}`.

## Split bills (restaurant.split_bills, Pro)
`POST :m/orders/:orderId/splits` (`{mode:"even", ways, labels?}` | `{mode:"items", splits:[{label?, itemIds}]}`) · `GET|DELETE :m/orders/:orderId/splits`.
Public: `GET /public/splits/:token` · `POST /public/splits/:token/pay {tipCents}` → clientSecret. **Web page needed at `/pay/split/<token>`**.
