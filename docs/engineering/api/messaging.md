# Messaging API (campaigns, automations, opt-outs)

Contract: `packages/shared/src/api/messaging.ts` (`messagingApi`).
Code: `apps/api/src/routes/messaging/index.ts`, `services/messaging.ts`, `jobs/messaging.ts`.

Auth: `manager` or `owner` of the merchant (admins / the merchant's rep pass as owner). Errors use the standard envelope.

## CASL (enforced server-side — clients never filter recipients)

- Recipients = members of this merchant with `marketingConsentAt` set **and** `muted = false` (and a live account).
- Every message gets a footer the client must **not** add itself:
  - SMS: `\n— <Merchant>. Reply STOP to opt out.`
  - Email: sender line + `Unsubscribe: <PUBLIC_API_URL>/v1/public/messaging/unsubscribe?m=<memberId>&t=<token>` (opens a confirm page; `List-Unsubscribe` / `List-Unsubscribe-Post` headers give mail apps the one-click POST)
  - Push: ` (<Merchant> · mute this shop in the app to stop offers)`
- Inbound `STOP` (also `STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, ARRET/ARRÊT, OPTOUT`) withdraws consent and mutes the
  sender at **every** merchant — see `handleInboundSms` below.

## Channels and gating

| Channel | Feature | Notes |
| --- | --- | --- |
| `email` | `marketing.email` (Plus since Pricing v2) | `subject` required; body ≤ 10,000 chars |
| `push` | `marketing.email` (Plus since Pricing v2) | to every app token (`push_tokens`) of consented members; body ≤ 180; title = subject or shop name |
| `sms` | `marketing.sms` (Plus) | body ≤ 320 chars before footer; 1 credit per recipient |

SMS credits: monthly allowance = `max(PLANS[plan].smsPerMonth, PLANS.plus.smsPerMonth)` (pilot overrides on a free plan get the
Plus allowance). Reserved atomically on send; over the allowance → `402 sms_credits_exhausted` `details { needed, remaining }`,
nothing is sent. Reset on the 1st of each month (America/Toronto) by job `messaging.sms-credit-reset`.

Placeholders, replaced per recipient: `{{first_name}} {{name}} {{balance}} {{terminology}} {{merchant}}`.

## Segments (`segment`)

| kind | params | members |
| --- | --- | --- |
| `all` | | everyone |
| `lapsed` | `days` (30) | last visit older than N days, or never visited and joined > N days ago |
| `vip` | `vipLevelId?` | any VIP level (or that level) |
| `reward_ready` | | balance ≥ cheapest active reward |
| `tag` | `tag` | members tagged (case-insensitive) |
| `new` | `days` (14) | joined in the last N days |

---

## Campaigns

### `POST /v1/merchants/:merchantId/messages/audience`
Body `{ channel, segment = {kind:"all"} }` → `AudiencePreview { matched, recipients, excludedNoConsent, excludedMuted, excludedNoContact, smsCreditsNeeded, smsCreditsRemaining }`.

### `POST /v1/merchants/:merchantId/messages`
Body `createMessageBody { channel, subject?, body, segment?, scheduledAt?, sendNow = false }`.
- `sendNow: true` → sends immediately; response `status: "sent"`.
- `scheduledAt` (future) → `status: "scheduled"`; job `messaging.send-scheduled` sends it (every minute).
- neither → `status: "draft"`.
→ `201 MessageDetail` (`Message` + `stats { queued, sent, delivered, failed }` + `preview` with footer).
Errors: `400` (no email subject, too long, past `scheduledAt`) · `402 feature_locked` (SMS not on plan / not rolled out) ·
`402 sms_credits_exhausted` · `409` shop paused.

### `GET /v1/merchants/:merchantId/messages?status=&limit=&cursor=`
Campaigns only (automations excluded), newest first → `{ items: Message[], nextCursor }`.

### `GET /v1/merchants/:merchantId/messages/:messageId` → `MessageDetail`
### `PATCH /v1/merchants/:merchantId/messages/:messageId`
Draft/scheduled only (`409` otherwise). Body: any of `channel, subject, body, segment, scheduledAt` (`null` → back to draft). → `MessageDetail`.
### `POST …/messages/:messageId/send` → `MessageDetail` (`409` if already sending/sent/cancelled)
### `POST …/messages/:messageId/test` (manager) → `TestSendResult { channel, sent, to[], smsCreditsUsed, testsRemainingToday }`
"Send test to me". No body. Sends the rendered message (personalized with **your** name and balance at this shop,
CASL footer included; subject prefixed `[Test]`) to the **requesting staff user's own** email / phone / push tokens
only — never to members. Transactional: no consent check, no audience, logged in `message_deliveries` with
`kind = "transactional"` and `messageId = null` (so it never shows in the campaign's `stats`). SMS uses exactly
**1** credit. Works for any campaign status (draft included). Rate limit: **10 per user per shop per rolling 24 h**
(counted from `audit_logs` `message.test_sent`). The email unsubscribe link points at your own membership (or a
placeholder when you aren't a member). Errors: `400` your account has no email / phone / push device for that channel,
`402` feature locked or `sms_credits_exhausted`, `404`, `429 rate_limited`.
### `POST …/messages/:messageId/cancel` → `MessageDetail` (draft/scheduled only)
### `DELETE …/messages/:messageId` → `204` (draft/cancelled only)
### `GET /v1/merchants/:merchantId/messages/sms-usage` → `SmsUsage { used, allowance, remaining, resetsOn }`

Message `status`: `draft | scheduled | sending | sent | failed | cancelled`. A failed interactive send of a draft returns it to `draft`.

---

## Automations (Plus: `marketing.automations`)

### `GET /v1/merchants/:merchantId/automations`
→ `{ items: Automation[] }` — always the 4 kinds, with suggested copy when not configured (`configured: false`).
`available: false` → show the upsell.

### `PUT /v1/merchants/:merchantId/automations/:kind`
`kind`: `win_back | reward_ready | birthday | welcome`. Body `{ enabled, channel = "email", subject?, body, days? }`.
Saving with `enabled: false` is always allowed; enabling needs `marketing.automations` (and `marketing.sms` for SMS) → else `402`.
→ `Automation`. `400` unknown kind.

| kind | who / when (job `messaging.automations`, every 15 min) | at most |
| --- | --- | --- |
| `win_back` | last visit older than `days` (default 30) | once per lapse (until they visit again) |
| `reward_ready` | balance ≥ cheapest active reward | once per visit |
| `birthday` | `users.birthday` is today (merchant timezone; Feb 29 → Feb 28) | once per year |
| `welcome` | joined after the automation was enabled, within 7 days | once |

All automations are promotional → CASL rules above apply.

**Birthday points are Plus** (`loyalty.birthday_bonus`, Pricing v2; shops without it are skipped and their program shows `birthdayBonus: 0` to customers): job `loyalty.birthday-bonus` (hourly) posts a ledger
`birthday_bonus` of `program.birthdayBonus` once per member per year (idempotency key `birthday:<memberId>:<year>`,
`merchant_members.last_birthday_bonus_year`), with no consent needed (it's points, not a message). Only the birthday
*message* is Plus.

---

## Opt-outs

### `GET /v1/public/messaging/unsubscribe?m=<memberId>&t=<token>` (no auth)
The link in every email. **A GET never changes anything**: mail scanners, link previews and prefetchers open every URL in a message, and an unsubscribe that fired on GET would be triggered by them. It checks the token and returns a small HTML **confirm page** ("Unsubscribe from {shop}?") whose button POSTs the same `m` and `t` back. The page is in the reader's language (`?lang=` or `Accept-Language`; en, hi, ur with RTL, pa), is `no-store` and `noindex`, sends no referrer, and its form can only post to our own origin. `400` bad token (it counts toward the per-address enumeration guard).
### `POST /v1/public/messaging/unsubscribe` (no auth)
Body (or query) `{ m, t }`. The only call that withdraws consent for that merchant (audit `consent.withdrawn_unsubscribe`).
- From the confirm page's button (a browser form post, `Accept: text/html`): the HTML "You're unsubscribed" page.
- Anything else (the web app, or an **RFC 8058 one-click** from a mail app: it POSTs `List-Unsubscribe=One-Click` as `application/x-www-form-urlencoded` to the URL in the `List-Unsubscribe` header and reads the status): `200 { ok: true, merchantName }`.

Campaign emails (and the test send) carry the headers `List-Unsubscribe: <…/v1/public/messaging/unsubscribe?m=…&t=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, so Gmail, Apple Mail and Outlook show their own Unsubscribe button; the footer link still opens the confirm page. The email provider accepts optional `headers` (Resend passes them through).

### Setup reminders to shop owners: `GET|POST /v1/public/onboarding/unsubscribe?m=<merchantId>&t=<token>` (no auth)
Same rule: the GET (the link in our reminder texts and emails) shows a confirm page ("Stop setup reminders for {shop}?"), the POST turns the reminders off (milestone `nudges_off`, audit `onboarding.nudges_unsubscribe_link`) and answers a page or `{ ok: true }` the same way. Reminder emails carry the same `List-Unsubscribe` headers. Reminders can be turned back on from the setup page.

### `handleInboundSms(ctx, fromPhone, body)` — service function for the Twilio webhook (integrations team)
In `services/messaging.ts`. `fromPhone` must be E.164. Returns `{ action: "opted_out" | "help" | "none", merchantsAffected, reply }`.
STOP keywords → every membership of that phone gets `muted = true`, `marketing_consent_at = null`, audited as
`consent.withdrawn_sms_stop`. `HELP/INFO/AIDE` → help text. Anything else → `none` (`reply: null`).

## Jobs (`jobs/messaging.ts`)
`messaging.send-scheduled` (1 min) · `messaging.automations` (15 min) · `loyalty.birthday-bonus` (1 h) ·
`messaging.sms-credit-reset` (1 h, idempotent per month via audit log) · `promos.lifecycle` (1 min).
