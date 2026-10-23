# Rep console API

Contract: `packages/shared/src/api/rep.ts` (`repApi`). Code: `apps/api/src/routes/rep/index.ts`, `services/rep.ts`
(merchant creation and templates reuse `services/merchant.ts`: `createMerchantWithTemplate`, `applyVerticalTemplate`, `buildQrKit`).

Auth: platform role `rep` (admins pass). Others → `403`; no token → `401`.
Reps act as `owner` on merchants they signed (`merchants.repUserId`), so all `/v1/merchants/:merchantId/...` endpoints
(profile, program, rewards, team, QR kit, import...) work for done-for-you setup.

## Constants
- `REP_COMMISSION = { signedCents: 5000, activationBonusCents: 2500, activationWindowDays: 30 }` (PRD: $50 + $25 30-day bonus).
- `CHECK_IN_DAYS = [7, 30]`.
- `LEAD_STAGES = new → contacted → visit_booked → signed → activated | lost`. `LEAD_ACTIVITY_KINDS = call | email | visit | note`.

## Leads
Visibility: reps see leads assigned to them **and** unassigned leads; touching an unassigned lead (update or activity)
claims it. Admins see all (`?mine=true` to filter). A lead of another rep → `404`.

### `GET /v1/rep/leads?stage&neighbourhoodId&q&mine&due&limit&cursor`
`due=true` → `nextActionAt <= now`. Sorted by next action (soonest first). → `{ items: Lead[], nextCursor }`.
Signed leads whose merchant has activated are moved to `activated` automatically.

### `POST /v1/rep/leads`
Body `createLeadBody { businessName, vertical?, address?, contactName?, phone?, email?, neighbourhoodId?, currentLoyalty?, notes?, nextActionAt?, assignedRepId? }`.
Reps' leads are assigned to themselves; assigning to another rep → `403` (admins can). → `201 LeadDetail`.

### `GET /v1/rep/leads/:leadId` → `LeadDetail` (`Lead` + `activities[]`, newest first)
### `PATCH /v1/rep/leads/:leadId`
Any lead field plus `stage`. → `LeadDetail`. Stage changes are audit-logged.
### `POST /v1/rep/leads/:leadId/activities`
Body `{ kind, outcome?, notes?, stage?, nextActionAt? }` → `201 LeadDetail`. A call/email/visit on a `new` lead moves it to `contacted`.

### `POST /v1/public/leads` (no auth) — marketing-site lead forms
Body `publicLeadBody { businessName, contactName?, email?, phone?, vertical?, neighbourhoodSlug?, message?, kind, language?, role?, eventDate?, boardMeetingAt?, memberCount? }`,
`kind: "book_visit" | "talk_to_us" | "bia" | "restaurant"` (`PUBLIC_LEAD_KINDS`). At least one of `email` / `phone` is required;
a `restaurant` lead needs a `phone` (restaurants are reached by call, text or WhatsApp). `language` is one of `en | hi | ur | pa`
(the restaurant's preferred language; stored on `leads.language`); `role`, `eventDate` (YYYY-MM-DD), `boardMeetingAt` (YYYY-MM-DD)
and `memberCount` are for BIA enquiries and stored on `leads.contactRole / eventDate / boardMeetingAt / memberCount`. All of them
come back on `Lead`; the rep inbox shows the language and board date and flags a board meeting within
`BOARD_MEETING_SOON_DAYS` (30) days. A `restaurant` lead defaults `vertical` to `restaurant`.
Creates an **unassigned** lead in stage `new` (shows up for every rep; the first rep to touch it claims it).
`neighbourhoodSlug` is resolved to `neighbourhoodId` (unknown slugs are kept in `notes`); `kind` and `message` are stored
in `notes` (prefixed `[website: <kind>]`). Emails `BRAND.supportEmail` via the email provider (a mail failure doesn't fail the form).
Audit: `lead.public_created`. → `201 PublicLeadResponse { id, received: true }` (no lead details are echoed back).
Errors: `400` (validation, no email/phone, bad phone), `429 rate_limited` (more than `PUBLIC_LEAD_RATE_LIMIT_PER_HOUR` = 5
submissions per IP per rolling hour; in-memory per API instance).

## Done-for-you merchants

### `POST /v1/rep/merchants`
Body `repCreateMerchantBody` = merchant signup fields (`name, vertical, address, phone, …` — see merchant.md) +
`owner { name?, email?, phone? }` (email or phone required) + `leadId?`.
Creates the merchant with `repUserId = rep`, applies the vertical template, makes the owner (found or created by
email/phone) the `owner`, and sends them a transactional invite (email preferred, else SMS). With `leadId`: the lead
becomes `signed` and links `merchantId` (`400` if it already has one).
→ `201 MerchantDetail` (same shape as `POST /v1/merchants`).

### `GET /v1/rep/merchants` (admins: `?repUserId=`)
Activation tracking → `{ items: RepMerchant[] }`: `activeMembers` (members with ≥ 1 visit) vs `target` (25),
`progressPct`, `daysSinceSignup`, `onboardingStep`, `checkIns: [{ day: 7|30, dueAt, due, doneAt }]`
(`due` = date reached and not logged).

### `GET /v1/rep/merchants/:merchantId/qr-kit`
→ `QrKit` (merchant, program headline, every active location with `qrCode`, `joinUrl = ${PUBLIC_WEB_URL}/j/<qrCode>`,
print-ready `qrSvg`, staff script). Not your merchant → `404`.

### `POST /v1/rep/merchants/:merchantId/check-ins`
Body `{ day: 7 | 30, outcome?, notes? }` → `201 RepMerchant` (updated check-in state). Stored in the audit log (`rep.check_in`).

## Commission

### `GET /v1/rep/commission` (admins: `?repUserId=`)
→ `CommissionSummary { rates, merchantsSigned, merchantsActivated, signedEarnedCents, activationEarnedCents, totalEarnedCents, pendingBonusCents, items[] }`.
Per merchant: `signedCents` always; `activationBonusCents` only if `activatedAt` is within `activationWindowDays` of signup.
`bonusStatus`: `activated` (earned) · `pending` (window open) · `missed`.
