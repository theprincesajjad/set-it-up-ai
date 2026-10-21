# Auth API

Contract: `packages/shared/src/api/auth.ts` (`authApi`). Code: `apps/api/src/routes/auth`, `apps/api/src/services/auth.ts`.

All errors use the standard envelope `{ "error": { "code", "message", "details?" } }`.
Validation failures are `400 bad_request` with `details: [{ path, message }]`.

## Tokens

| Token | Lifetime | Where | Notes |
| --- | --- | --- | --- |
| Access token (JWT, HS256) | 1 hour | `Authorization: Bearer <accessToken>` | `sub` = user id, `role` = platform role |
| Refresh token (opaque, 256-bit) | 90 days | `POST /v1/auth/refresh` body | Single use. Every refresh returns a **new pair**; store the new refresh token and discard the old one. Replaying a used refresh token revokes **all** of that user's sessions (theft detection). |

Every sign-in endpoint returns `AuthResponse`:

```json
{
  "accessToken": "eyJ...",
  "accessTokenExpiresAt": "2026-11-03T16:00:00.000Z",
  "refreshToken": "q3Z...",
  "refreshTokenExpiresAt": "2027-02-01T15:00:00.000Z",
  "created": false,
  "user": {
    "id": "uuid", "name": "Sam Lee", "email": null, "phone": "+14165550101",
    "platformRole": "none", "memberCode": "K7QX2M9P",
    "phoneVerified": true, "emailVerified": false,
    "birthday": null, "postalCode": null, "homeNeighbourhoodId": null,
    "locale": "en-CA", "createdAt": "2026-11-03T15:00:00.000Z"
  }
}
```

Client recipe: on a `401` from any endpoint, call `/v1/auth/refresh` once; if that is also `401`, send the user to sign-in.

## Phone OTP (customers)

Rules: 6-digit code, stored as HMAC-SHA256 only, valid 10 minutes, 5 wrong attempts then the code is burned,
max 5 codes per phone per rolling hour. Requesting a new code invalidates the previous one.
Phone numbers are normalised to E.164 (`416-555-0101` → `+14165550101`); North American numbers without `+1` are accepted.

### POST /v1/auth/otp/start

Auth: none. Body `{ "phone": "416-555-0101" }`.

`200` → `OtpStartResponse`

```json
{ "sent": true, "expiresInSeconds": 600, "devCode": "123456" }
```

`devCode` is present **only when the API is not running in production**, so dev builds and simulators can auto-fill. Never rely on it in release builds.

Errors: `400 bad_request` (invalid phone), `429 rate_limited` (5 codes this hour).

### POST /v1/auth/otp/verify

Auth: none. Body `{ "phone": "416-555-0101", "code": "123456", "name": "Sam Lee"? }`.
Creates the network customer on first sign-in (one identity per phone), sets `phoneVerified`, fills `name` if the account had none.

`200` → `AuthResponse` (`created: true` on first sign-in).

Errors:
- `400 invalid_code`: wrong code (`details.attemptsLeft`), expired, or already used. Expired/used: ask for a new code.
- `429 rate_limited`: the 5th wrong attempt, or any attempt after it. Ask for a new code.

## Email + password (merchants, reps, admins)

### POST /v1/auth/register

Auth: none. Body `{ "email", "password" (8-200 chars), "name" }`. Email is stored lower-cased.
`201` → `AuthResponse` (`created: true`). Errors: `400`, `409 conflict` (email already registered).

### POST /v1/auth/login

Auth: none. Body `{ "email", "password" }`. Email is case-insensitive.
`200` → `AuthResponse`. Errors: `401 unauthorized` "Email or password is incorrect" (same message whether or not the email exists).

### POST /v1/auth/email-otp/start

Auth: none. Body `{ "email" }`. Sends a 6-digit sign-in code by email. Same limits as phone OTP.
Always `200` `OtpStartResponse` (does not reveal whether the account exists). Errors: `400`, `429`.

### POST /v1/auth/email-otp/verify

Auth: none. Body `{ "email", "code", "name"? }`. Signs in, creating a password-less account if none exists; sets `emailVerified`.
`200` → `AuthResponse`. Errors as `/otp/verify`.

## Sessions

### POST /v1/auth/refresh

Auth: none. Body `{ "refreshToken" }`. `200` → `AuthResponse` with a new pair (`created: false`).
Errors: `401 unauthorized` (unknown, expired, revoked or replayed token; deleted account).

### POST /v1/auth/logout

Auth: none. Body `{ "refreshToken" }`. Revokes that session. Always `200 { "ok": true }`. The access token stays valid until it expires (max 1 hour); discard it client-side.

### GET /v1/auth/me

Auth: any signed-in user. `200` → `MeResponse`

```json
{
  "user": { "...": "AuthUserDto" },
  "platformRole": "none",
  "merchants": [
    { "merchantId": "uuid", "name": "Roncy Cafe", "slug": "roncy-cafe", "role": "owner",
      "status": "active", "logoUrl": null, "hasPin": true }
  ]
}
```

`merchants` lists every shop where the user is staff (`owner` | `manager` | `staff`), sorted by name. Web uses it to pick a dashboard; the staff app to pick a counter. Errors: `401`.

## Staff PINs (shared counter device)

A shop's counter tablet stays signed in as one staff account. Other staff switch in with a 4-6 digit PIN instead of a full sign-in.
PINs are bcrypt-hashed in `merchant_staff.pin_hash`, unique within a merchant.

### PUT /v1/merchants/:merchantId/staff-pin

Auth: staff of the merchant (any role). Sets **your own** PIN for this merchant. Body `{ "pin": "4821" }`.
`200 { "ok": true }`. Errors: `400` (not 4-6 digits), `401`, `403` (not staff here; admins/reps without a staff row too), `404` (merchant), `409 conflict` (another staff member already uses that PIN).

### POST /v1/merchants/:merchantId/staff-pin/verify

Auth: the device's staff token (any role at this merchant). Body `{ "pin": "4821", "userId"?: "uuid" }`.
Send `userId` when the UI shows a staff picker (faster; avoids comparing against every PIN).

`200` → `StaffPinVerifyResponse`

```json
{ "accessToken": "eyJ...", "accessTokenExpiresAt": "...", "staff": { "userId": "uuid", "name": "Jo", "role": "staff" } }
```

Use the returned access token for counter calls so awards are attributed to that staff member. No refresh token is issued: when it expires, the device asks for the PIN again.

Lockout: after 5 wrong PINs from the same device account within 15 minutes, the endpoint returns `429` until the window passes. Failed and successful attempts are written to `audit_logs` (`staff_pin.failed`, `staff_pin.verified`).

Errors: `401 invalid_pin`, `401 unauthorized` (no token), `403` (device token not staff here), `404` (merchant), `429 rate_limited`.

## For other teams

- Setting or clearing **another** staff member's PIN (owner/manager screens) belongs to the merchant/staff-management area: hash with bcrypt and keep PINs unique per merchant (see `setStaffPin` in `services/auth.ts`).
- `issueTokens(ctx, user)` and `revokeAllSessions(ctx, userId)` in `services/auth.ts` are exported for reuse (e.g. admin "sign out everywhere").
