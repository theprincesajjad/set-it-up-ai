# Messaging API (campaigns, automations, opt-outs)

Contract: `packages/shared/src/api/messaging.ts` (`messagingApi`).
Code: `apps/api/src/routes/messaging/index.ts`, `services/messaging.ts`, `jobs/messaging.ts`.

Auth: `manager` or `owner` of the merchant (admins / the merchant's rep pass as owner). Errors use the standard envelope.

## CASL (enforced server-side — clients never filter recipients)

- Recipients = members of this merchant with `marketingConsentAt` set **and** `muted = false` (and a live account).
- Every message gets a footer the client must **not** add itself:
  - SMS: `\n— <Merchant>. Reply STOP to opt out.`
  - Email: sender line + `Unsubscribe: <PUBLIC_API_URL>/v1/public/messaging/unsubscribe?m=<memberId>&t=<token>`
  - Push: ` (<Merchant> · mute this shop in the app to stop offers)`
- Inbound `STOP` (also `STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, ARRET/ARRÊT, OPTOUT`) withdraws consent and mutes the
  sender at **every** merchant — see `handleInboundSms` below.

## Channels and gating

| Channel | Feature | Notes |
| --- | --- | --- |
| `email` | `marketing.email` (free) | `subject` required; body ≤ 10,000 chars |
| `push` | `marketing.email` (free) | to every app token (`push_tokens`) of consented members; body ≤ 180; title = subject or shop name |
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

**Birthday points are free** (`loyalty.birthday_bonus`): job `loyalty.birthday-bonus` (hourly) posts a ledger
`birthday_bonus` of `program.birthdayBonus` once per member per year (idempotency key `birthday:<memberId>:<year>`,
`merchant_members.last_birthday_bonus_year`), with no consent needed (it's points, not a message). Only the birthday
*message* is Plus.

---

## Opt-outs

### `GET /v1/public/messaging/unsubscribe?m=<memberId>&t=<token>` (no auth)
The link in every email. Withdraws consent for that one merchant and returns a small HTML confirmation. `400` bad token.
### `POST /v1/public/messaging/unsubscribe` (no auth)
Body (or query) `{ m, t }` → `{ ok: true, merchantName }` (for the web page / one-click `List-Unsubscribe-Post`).

### `handleInboundSms(ctx, fromPhone, body)` — service function for the Twilio webhook (integrations team)
In `services/messaging.ts`. `fromPhone` must be E.164. Returns `{ action: "opted_out" | "help" | "none", merchantsAffected, reply }`.
STOP keywords → every membership of that phone gets `muted = true`, `marketing_consent_at = null`, audited as
`consent.withdrawn_sms_stop`. `HELP/INFO/AIDE` → help text. Anything else → `none` (`reply: null`).

## Jobs (`jobs/messaging.ts`)
`messaging.send-scheduled` (1 min) · `messaging.automations` (15 min) · `loyalty.birthday-bonus` (1 h) ·
`messaging.sms-credit-reset` (1 h, idempotent per month via audit log) · `promos.lifecycle` (1 min).
