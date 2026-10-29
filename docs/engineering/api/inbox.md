# Inbox, client profile, web push and Instagram (phase solo, workstream D)

Contract: `@ll/shared` `inboxApi` (`packages/shared/src/api/inbox.ts`), connector types in `packages/shared/src/inbox.ts`.
Services: `apps/api/src/services/inbox.ts`, `inbox-connectors/*`, `web-push.ts`, `notifications.ts` (`deliverByLadder`),
`merchant-customers.ts` (profile and list). Routes: `routes/inbox`, `routes/instagram` (registered from `routes/messaging`).
Tables (migration `0034_solo_d.sql`): `conversations`, `conversation_messages`, `web_push_subscriptions`, `promo_templates`,
`instagram_connections`; `appointments.visit_note|visit_photo_url|intake_answer|conversation_id`, `services.intake_question`,
`merchant_members.channel_pref|locale`.

## The channel ladder
Reminders, confirmations and shop messages go the cheapest way that reaches the person and stop at the first that works:
**app push → web push → email → text**. The in-app row (`notifications`) is written first, always. A text is the last rung and
comes out of the shop's monthly texts (`text-allowance.reserveTransactionalText`: Free stops at `FREE_REMINDER_SMS_PER_MONTH`, paid plans go on as overage); when Free's are used
up nothing is texted (`textCapReached`). The customer's preference at the shop (`merchant_members.channel_pref`: `best`, `app`,
`email`, `text`) picks the rungs (`rungsFor`). English reminder texts are one segment (`oneSegmentText`: shop, service, time, the
address when it fits, a short `/me` link, `STOP to opt out`); a text in Hindi, Urdu or Punjabi script keeps the full sentence.
Promos never use a text.

## Shop side
| Call | Who | What |
| --- | --- | --- |
| `GET /v1/merchants/:id/inbox?channel=&unread=&q=` | staff+ (not a private renter) | `InboxResponse`: threads with a message, newest first, unread counts, Instagram status |
| `POST /v1/merchants/:id/inbox` `{ memberId } \| { userId }` | staff+ | Open or start the customer's thread (`ConversationDto`) |
| `GET /v1/merchants/:id/inbox/:conversationId` | staff+ | `ThreadResponse`: messages, the next visit, the rung the next reply would use; marks it read |
| `POST /v1/merchants/:id/inbox/:conversationId/messages` `{ body }` | staff+ | `201 SendInboxMessageResponse { message, deliveredBy, textCapReached }`. Instagram threads: `409 read_only` |
| `GET /v1/merchants/:id/inbox/:conversationId/booking-prefill` | staff+ | `BookingPrefill`: name, handle, the last incoming message as the client note, links back, `source` |
| `GET /v1/merchants/:id/customers/:memberId/people` | staff+ | `ClientProfileResponse`: next visit, timeline (appointments, stamps, rewards with visit note, photo, intake), book again, channel and language, reachable rungs |
| `PATCH /v1/merchants/:id/customers/:memberId/preferences` `{ channelPref?, locale? }` | staff+ | Audit `customer.preferences_updated` |
| `GET /v1/merchants/:id/clients?segment=&staffId=&q=&cursor=` | staff+ | `ListClientsResponse`: the appointment-led list (segments all, upcoming, due, no_show_twice, new). A renter with `own_clients_only` always gets their own (`staffLocked`) |
| `PUT /v1/merchants/:id/appointments/:appointmentId/visit-note` `{ visitNote, visitPhotoUrl? }` | staff+ | The checkout note, internal only |
| `GET /v1/merchants/:id/intake-questions`, `PUT /v1/merchants/:id/services/:serviceId/intake-question` `{ question }` | staff+ / manager+ | One optional question per service, asked at booking (`createMyAppointmentBody.intakeAnswer`) |

"Create booking from message": the dashboard opens the new-appointment sheet with the prefill and posts
`POST /v1/merchants/:id/appointments` with `source: "instagram"` (or `staff`), `conversationId` and `clientNote`.

Inbound texts: `messaging.handleInboundSms` attaches anything that is not STOP, START or HELP to the sender's thread with the shop
that last texted them.

## Customer side
| Call | What |
| --- | --- |
| `GET /v1/me/inbox` | `MyThreadsResponse`: my threads with shops, unread counts |
| `GET /v1/me/inbox/:conversationId` | `MyThreadResponse`; marks the shop's messages read |
| `POST /v1/me/inbox/:conversationId/messages` `{ body }` | My reply (lands in the shop's inbox as unread) |
| `GET /v1/public/web-push/key` | `{ publicKey }` (VAPID, base64url) or null |
| `GET/POST/DELETE /v1/me/web-push` | Status, subscribe `{ endpoint, keys: { p256dh, auth }, userAgent? }`, unsubscribe `{ endpoint }` |
| `GET/PUT /v1/me/channel-pref` `{ channelPref }` | How every shop reaches me |

Web push: `services/web-push.ts` (VAPID RFC 8292, aes128gcm RFC 8291, node:crypto). Env `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; without keys a non-production process makes an in-memory pair. 404/410 deletes the
subscription. The web app registers `public/sw.js`; on iPhone the page must be added to the home screen first (`app/manifest.ts`).

## Instagram (read-only)
`INSTAGRAM_DM_ENABLED`: unset = off (the Settings card reads "Coming soon"), `stub` = sample threads (dev, tests, e2e), `live` =
Meta OAuth and webhooks (after App Review and Business Verification). Connector interface (`inbox-connectors/index.ts`):
`connect`, `completeOAuth`, `importRecent` (the last 20 messages per thread), `handleWebhook`, `disconnect`; `purge` is
`inbox.purgeInstagram`. Only the person's Instagram id, handle, display name, the text and the time are stored; the token is
encrypted. **There is no sending path.**

| Call | What |
| --- | --- |
| `GET /v1/merchants/:id/instagram` | `InstagramStatus { mode, connected, username, connectedAt }` |
| `POST /v1/merchants/:id/instagram/connect` (manager+) | stub: connects and imports now; live: `{ authorizeUrl }` (signed state). `409 instagram_off` when off |
| `POST /v1/merchants/:id/instagram/disconnect` (manager+) | Deletes the token and every Instagram thread (audit `instagram.disconnected`) |
| `GET /v1/public/instagram/callback?code&state` | live only: stores the token, imports, redirects to the inbox |
| `GET /v1/public/instagram/webhook` | Meta's verification (`INSTAGRAM_VERIFY_TOKEN`) |
| `POST /v1/public/instagram/webhook` | Messages webhook, `X-Hub-Signature-256` with `INSTAGRAM_APP_SECRET` (the stub takes `{ account, threads }`) |
| `POST /v1/public/instagram/data-deletion` `signed_request` | Meta's data-deletion callback: deletes that person's threads at every shop, returns `{ url, confirmation_code }` |
