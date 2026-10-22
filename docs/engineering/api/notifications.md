# Notifications API (customer inbox + preferences)

Contract: `packages/shared/src/api/customer.ts` (`customerApi`: `NOTIFICATION_TYPES`, `NOTIFICATION_CATALOG`,
`ANDROID_CHANNELS`, `NotificationDto`, `NotificationsResponse`, `NotificationPrefsResponse`, `updateNotificationPrefsBody`,
`notificationsQuery`, `NotificationData`). Code: `apps/api/src/services/notifications.ts`, `apps/api/src/routes/notifications/`,
jobs in `apps/api/src/jobs/notifications.ts`. Tables: `notifications`, `user_notification_prefs` (migration `0005_notifications`).

## How a customer hears about something

Every notification we decide to send is stored in the inbox (`notifications`) first, then delivered:

1. **Push** (Expo → the app) if the customer has a device token and the type's `push` pref is on. Every push carries
   `channelId` (Android channel) and `data` (deep link, below).
2. **Wallet pass** for points-type notifications when the customer has a pass: the pass updates itself on every balance
   change (Apple lock-screen `changeMessage`, Google object PATCH); `reward_ready` / `reward_expiring` also add a Google Wallet
   message. Inbox `channels` shows `"wallet"`.
3. **SMS** only when: no app push reached them, no wallet pass covers it, the customer hasn't muted the shop, the type supports SMS and the pref is on, the
   customer has a phone, and the **shop has paid SMS** (`marketing.sms`). Logged in `message_deliveries`.
   (Commerce notifications from paid features keep their existing SMS behaviour, gated by the customer's SMS pref.)
4. **Email** for types that support it (`reward_expiring`, `quote_sent`) when nothing else reached them and the pref is on.

| Type | Kind | Android channel | Channels (default) | Trigger |
| --- | --- | --- | --- | --- |
| `points_earned` | transactional | `points` | push ✓ | ledger award (any source). **Collapsed per shop per 10 min**: one push; the inbox row's title accumulates ("+15 points at Pinecone") |
| `reward_ready` | transactional | `points` | push ✓, sms ✓ | award whose new balance crosses a reward's cost (replaces `points_earned` for that award) |
| `reward_expiring` | transactional | `points` | push ✓, sms ✓, email ✓ | hourly job: 30 days before expiry, only shops with `expiryMonths`, once per inactivity period, daytime only |
| `redeem_confirmed` | transactional | `points` | push ✓ | staff/POS/API redemption (not in-app codes, which show on screen) |
| `order_ready` | transactional | `orders` | push ✓, sms ✓ | order accepted / ready / cancelled (paid order-ahead) |
| `ticket_updated` | transactional | `orders` | push ✓, sms ✓ | ticket status, invoice sent/paid, deposit paid (paid service features) |
| `quote_sent` | transactional | `orders` | push ✓, sms ✓, email ✓ | quote to approve (paid) |
| `booking_reminder` | transactional | `orders` | push ✓, sms ✓ | pickup / drop-off reminder |
| `passport_progress` | transactional | `points` | push ✓ | neighbourhood campaign / network perk messages from an award |
| `promo_nearby` | **marketing** | `offers` | push ✓ | paid (`promos.push_nearby`); needs CASL consent for that shop and not muted; **max 1 per customer per 24 h**; never during quiet hours 21:00–08:00 (shop's timezone) |

Adjustments and reversals update the wallet pass but send no message.

Senders (API code): `sendNotification(ctx, { userId, merchantId, type, title, body, data?, smsBody?, passMessage? })` returns
`{ notificationId, skipped?, channels, push }` and never throws. `skipped` ∈ `no_consent | muted | feature_off | quiet_hours |
daily_limit | collapsed | user_missing`. Commerce code keeps calling `commerceShared.notifyCustomer` (mapped by `data.type`:
`order_status → order_ready`, `ticket_status|invoice_sent|invoice_paid|deposit_paid → ticket_updated`, `quote_sent`,
`booking_reminder`).

Expo receipts: the `notifications.receipts` job (every 15 min) fetches receipts for tickets older than 15 min (younger than
24 h) and deletes push tokens whose receipt is `DeviceNotRegistered`. Immediate `DeviceNotRegistered` tickets are pruned at send time.

## Deep-link payload (`data`, in the push and in inbox items)

```ts
{
  type: "points_earned",            // NotificationType (commerce pushes keep their own type, e.g. "order_status", plus notificationType)
  notificationId: "uuid",           // mark read with POST /v1/me/notifications/:id/read
  screen: "shop",                   // "shop" | "order" | "ticket" | "quote" | "campaign" | "rewards" | "card" | "inbox"
  url: "ll://shop/pinecone",        // open this first: ll://shop/<slug>, ll://order/<id>, ll://ticket/<id>, ll://campaign/<id>, or a web /q/<token> link
  merchantId: "uuid", slug: "pinecone",
  orderId?, ticketId?, quoteId?, campaignId?, rewardId?, delta?, balance?
}
```

The app routes taps with `features/customer/notifications.ts` (`useNotificationTaps`, `openNotificationData`).

## Endpoints (customer, `Authorization: Bearer`)

### `GET /v1/me/notifications?limit=30&cursor=&unread=1`
Newest first. `limit` 1–100 (default 30); `cursor` = previous `nextCursor`; `unread=1|true` only unread.
→ `200 NotificationsResponse`
```json
{
  "items": [{
    "id": "uuid", "type": "reward_ready", "title": "Reward ready at Pinecone",
    "body": "You have 55 points: enough for $5 off. Show your card at the counter to redeem.",
    "merchant": { "id": "uuid", "name": "Pinecone", "slug": "pinecone", "logoUrl": null, "brandColor": "#..." },
    "data": { "type": "reward_ready", "screen": "shop", "url": "ll://shop/pinecone", "merchantId": "uuid", "slug": "pinecone", "notificationId": "uuid" },
    "read": false, "readAt": null, "createdAt": "2026-11-03T15:00:00.000Z"
  }],
  "nextCursor": "base64url" ,
  "unreadCount": 3
}
```
Errors: `401`, `400` invalid cursor/limit.

### `POST /v1/me/notifications/:id/read`
→ `200 { unreadCount }`. Idempotent. Errors: `401`, `404` (not yours / unknown).

### `POST /v1/me/notifications/read-all`
→ `200 { unreadCount: 0 }`. Errors: `401`.

### `GET /v1/me/notification-prefs`
→ `200 NotificationPrefsResponse`: one item per type, in settings order, with only the channels that type supports.
```json
{
  "items": [
    { "type": "points_earned", "kind": "transactional", "label": "Points earned", "description": "After a visit or purchase (at most one per shop every 10 minutes).", "channels": { "push": true } },
    { "type": "reward_ready", "kind": "transactional", "label": "Reward ready", "description": "When you have enough for a reward.", "channels": { "push": true, "sms": true } },
    { "type": "promo_nearby", "kind": "marketing", "label": "Offers nearby", "description": "…", "channels": { "push": true } }
  ],
  "quietHours": { "start": "21:00", "end": "08:00", "appliesTo": "marketing" }
}
```
Group in the UI by `customerApi.NOTIFICATION_CATALOG[*].androidChannel` (points / orders / offers). Errors: `401`.

### `PUT /v1/me/notification-prefs`
Body `{ prefs: [{ type, channel: "push" | "sms" | "email", enabled }] }` (1–30 entries; partial — only listed pairs change).
→ `200 NotificationPrefsResponse` (the full, updated matrix). Errors: `401`, `400 bad_request` (unknown type/channel, or a
channel the type doesn't support — `details.supported`).

Notes:
- Prefs are per customer, not per shop. Per-shop opt-out of promos stays `PATCH /v1/me/memberships/:id { muted }` and CASL
  consent (`/consent`); both are enforced for `promo_nearby`.
- The OS permission and the Expo token are still registered with `POST /v1/me/push-tokens` (customer.md).
