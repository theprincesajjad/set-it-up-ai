# Staff counter mode (Expo app, phone + tablet)

The PRD's hardest number: **award points in under 5 seconds during a rush.** Every decision here
serves that. Counter mode lives in the same Expo app as the customer app; a user who is staff at
any merchant gets "Counter mode" in the You tab, and a device can be **locked to counter mode**
for a location (shared shop phone/tablet).

API: `staff` area (lookup, award, redeem, undo via `reverseTransaction`), idempotency keys on
every award/redeem. Components: Keypad, Button `counter` size, OfflineBanner, Avatar.

## Principles

1. **One decision per screen.** No marketing, no tips, no promos on counter screens.
2. **Thumb zone:** primary actions in the bottom 40% of the screen, full width, 64 px tall.
3. **Big and bright:** light theme by default (bright shops), body 18, numbers 32-72, no text
   below 14 px. Manual dark toggle in counter settings.
4. **Never block on the network.** Awards queue offline. Only redeem needs a connection.
5. **Forgiving:** 10-second Undo on every award, no confirm dialogs for normal awards.
6. **Same layout every time** so muscle memory forms: keypad left/bottom, result right/top.

## Tap budget

| Flow | Taps after the customer is identified | Total time target |
| --- | --- | --- |
| Stamp / visit program, scan QR | Scan (1) → auto-identify → **"Add stamp" (1)** → done | <= 3 s |
| Stamp / visit program, phone | Type 10 digits (or last 4 + pick) → **"Add stamp" (1)** | <= 5 s |
| Points per dollar | Identify → type amount → **"Award 12 pts" (1)** | <= 5 s |
| Redeem | Identify → tap reward (1) → **"Confirm redeem" (1)** | <= 6 s |
| Customer shows redeem code | Type/scan code → **"Confirm" (1)** | <= 4 s |

Two taps max after identification for any award.

## Layout

**Phone (portrait):**

```
┌───────────────────────────────┐
│ Roncesvalles Café   [SC Sam ▾]│  header 56: location, staff chip, ⋯
│ ▒ Offline · 2 waiting to send ▒│  OfflineBanner (only when relevant)
├───────────────────────────────┤
│   (416) 555-01__              │  entered number, keypad style 32/600
│   [ Scan card ]  [ Code ]     │  secondary row: scanner, redeem code
├───────────────────────────────┤
│   1     2     3               │
│   4     5     6               │  Keypad 72 px keys
│   7     8     9               │
│   ✕     0     ⌫               │
├───────────────────────────────┤
│ [        Find customer       ]│  counter Button, full width (auto on 10th digit)
└───────────────────────────────┘
```

**Tablet (landscape, >= 768 wide):** two panes. Left 40%: number display + keypad + Scan/Code
buttons. Right 60%: customer panel (empty state "Enter a number or scan a card" with a phone
illustration, then the customer card + award controls). Recent activity strip at the bottom of
the right pane (last 5 awards with Undo on the latest).

## 1. Sign in and PIN switcher

- **Device setup** (owner/manager, once): sign in with OTP → pick location → "Use this device as
  the shop's counter" Switch (locks to counter mode; customer app hidden; exit requires manager PIN).
- **Staff PIN screen** (on open, and after 15 min idle on a shared device): grid of staff Avatars
  (initials + first name, 88 px tiles, up to 12, then search) → 4-digit PIN with Keypad. Wrong PIN:
  shake + "Wrong PIN. Try again." 5 wrong → 2 min lockout for that staff member.
- **Switcher:** header staff chip (Avatar 32 + first name + chevron) → Sheet with staff tiles → PIN.
  The active staff member is recorded on every transaction.
- Personal phone (staff's own device): no PIN; staff is the signed-in user.

## 2. Lookup

### By phone keypad

- Number field shows formatted digits as typed `(416) 555-0123`, `keypad` 32 style, centred.
  Placeholder: "Customer's phone number" in `fgMuted` 18.
- **Last-4 search:** after 4 digits, a "Search last 4" chip appears; tapping it shows matches from
  this merchant's members (max 5, "Alex C. · ...0123 · visited Tue"), each a 64 px row. Full 10
  digits auto-searches (no extra tap).
- Results:
  - **Found:** go to Customer panel (section 3).
  - **Not a member yet:** panel shows "New customer" with the formatted number and counter Button
    "Add and award" (one tap creates the member via `ensureMember` with `join_source: "phone"`
    AND applies the award; the welcome SMS with the consent request goes to the customer). Secondary
    "Ask for their name" (optional TextField, skip-able).
  - **Invalid number:** inline error under field: "Check the number. It needs 10 digits."

### By QR scan

- "Scan card" opens a full-screen camera (`expo-camera`, barcode only) with a 260 px viewfinder
  frame (white corners), torch toggle (IconButton lucide:flashlight, bottom), "Type number
  instead" ghost. Auto-closes on read, haptic `success`. Reads member QR, wallet pass barcode, and
  redeem code QR (routes to section 5).
- Tablet with a front camera facing the customer: "Scanner faces customer" option in settings
  mirrors the preview.
- Camera permission denied: EmptyState "Camera is off" + "Open settings" + "Type number instead".

## 3. Customer panel and award

```
┌───────────────────────────────┐
│ (AC) Alex C.        ...0123   │  avatar initials, first name + last initial, masked phone
│ 8 of 10 stamps · VIP Gold     │  StampCard mini (or balance 270 pts)
│ ★ Reward ready: Free drink    │  accent Banner if a reward is ready → tap = redeem
├───────────────────────────────┤
│ [          + Add stamp       ]│  counter Button primary (stamps / per-visit)
│  - or -                       │
│  $ [ 11.80 ]   Award 12 pts   │  per-dollar: amount field + keypad; button label live-updates
├───────────────────────────────┤
│ More: [+2] [+3] [Adjust] [Redeem]│ secondary chips
└───────────────────────────────┘
```

- **Stamps / per visit:** one big primary "Add stamp" / "Add visit (+10 pts)". Quantity chips
  `+2`, `+3` for multiple items (e.g. two coffees) in the More row. A cooldown warning if the same
  customer was awarded < 2 min ago: inline warning text "Alex got a stamp 1 min ago." (not blocking).
- **Per dollar:** keypad switches to amount entry (`$` prefix, cents entered right-to-left like a
  POS: typing `1180` shows `$11.80`). Button label updates live: "Award 12 pts". Category
  selector chip row appears only if the merchant has no-earn categories: default "Front store";
  choosing "Prescriptions" shows "Prescriptions don't earn points" and the button becomes
  "Record visit (0 pts)". Promo multipliers show in the label: "Award 24 pts (2x today)".
- **Manual adjust** (manager+): Sheet with +/- amount, reason Select (Missed purchase, Correction,
  Goodwill, Other + note), requires PIN if the device is shared. Audit trail shown in dashboard.
- **Not allowed** state: if the staff role can't do it, the chip is hidden (not disabled).

## 4. Success state

Full-panel success card, appears in <= 150 ms after tap (optimistic; confirmed in background).

- Background `success` fill (full colour, readable across the room), `onSuccess` text.
- lucide:circle-check 48 with check-draw animation 600 ms; haptic `success`; optional sound (off by
  default, toggle in counter settings).
- Line 1 `h2`: "Added 1 stamp" / "Awarded 12 pts".
- Line 2 `counterHero` 72 tabular: new balance "9 / 10" or "282 pts"; under it `title`: "1 more for
  a free drink" or "Reward ready: Free drink" (then a marigold "Redeem now" Button `counter`).
- **Undo** secondary Button (on `success` bg: white fill, `fg` text) with a 10 s countdown ring:
  "Undo (8)". Tapping reverses via the API (`reverseTransaction`), shows neutral card "Undone. Alex
  is back to 8 stamps."
- Auto-return to the keypad after 4 s (or immediately on any keypad press), keeping the Undo
  available in the recent-activity strip for the remaining 10 s window.
- Offline: same success card but line 3 caption "Saved. Will send when you're back online." and
  balance shown as "~9 / 10" with a lucide:clock-3 16 icon.
- Server rejects later (e.g. duplicate, member blocked): the queued item turns into an alert in the
  queue sheet: "Couldn't add stamp for ...0123: already added." No modal mid-rush.

## 5. Redeem

Two entry points:

**A. Staff-initiated** (customer says "I'd like my free drink"): tap the "Reward ready" banner or
"Redeem" chip → list of rewards with affordable ones enabled (RewardCard compact, 64 px rows,
locked ones show "130 pts to go") → tap one → confirm panel: reward name `h2`, "Uses 10 stamps ·
Alex will have 0", primary accent `counter` "Confirm redeem", secondary "Back". → success card
(same as section 4, `accent` fill + `onAccent` text: "Free drink redeemed. Hand it over.").

**B. Customer shows a code**: "Code" button → keypad switches to letters+digits Grid (4 chars from
the safe alphabet; on phones use the system keyboard with `autoCapitalize="characters"`) or scan
the code's QR → panel shows customer + reward → "Confirm" → success.

- Errors: code expired ("This code expired. Ask Alex to tap Redeem again."), wrong shop ("This
  code is for Rosie's Bakery."), already used ("Already redeemed at 2:14 pm by Priya.").
- Offline: Redeem disabled with inline warning "Redeem needs internet. Awards still work."
- Undo for redeem: 10 s, same pattern ("Undo redeem").
- No-discount categories: reward screen shows "Not valid on prescriptions" when relevant.

## 6. Offline banner and queue

- Detect via NetInfo + failed requests. OfflineBanner sticky under header: `warning` fill,
  lucide:wifi-off, "Offline · 3 waiting to send". Tap → Queue Sheet: list of queued awards (time,
  masked phone/name, amount, status: Waiting / Sending / Sent / Needs attention), "Retry now" button.
- Queue persisted to device storage (SQLite/MMKV), each item has an idempotency key, retried with
  backoff (2, 5, 15, 30 s, then every 60 s). Survives app restarts.
- Back online: banner turns `success` "Back online · 3 sent" for 2 s and collapses.
- Lookup while offline: by phone always works (queued with phone; balance unknown → "Balance
  updates when you're back online"); by QR works (member id in token). Last 200 members seen on
  this device are cached for name/balance display (encrypted at rest, cleared on sign-out).
- Queue > 50 items or > 24 h old: banner turns `danger` "3 awards haven't sent for 24 h. Check the
  connection." and owner gets an email.

## 7. Kiosk mode (customer-facing check-in)

A tablet on the counter, facing the customer. Turned on in counter settings by a manager; exit
requires manager PIN (triple-tap the logo top-left → PIN).

- Layout (landscape tablet): left 45%: shop logo 96, `display` 40 "Check in and earn", body 20
  "Type your mobile number". Right 55%: number display `counterHero`-ish 48 and Keypad at
  `touchTargets.kiosk` 88 px keys, "Check in" primary `kiosk` height 88.
- New number: consent screen on the kiosk (customer is the one consenting): name TextField
  (optional, with large on-screen keyboard), ConsentCheckbox unchecked, "Join and check in".
- Result: full-screen success "You're checked in, Alex." with the balance and next reward line.
  - Per-visit/stamp programs with **auto-award on check-in** (merchant setting, default off):
    award immediately with a 4-hour per-member cooldown.
  - Otherwise: creates a **pending check-in** that appears on the staff device as a top card
    "Alex is at the counter · Add stamp" (1 tap). The kiosk says "Staff will add your stamp."
- Auto-reset to the start screen after 6 s or on tap; clears all input; never shows the full phone
  number of a previous customer. Idle attract screen after 60 s: shop name + "Check in and earn"
  + current promo title (the one exception to "no promos", since this screen faces customers).
- Accessibility: 88 px targets, high-contrast light theme, VoiceOver/TalkBack support, "Bigger
  text" toggle (scales to 1.4x).

## 8. Today and recent activity

- Header overflow ⋯ → "Today": count of visits, stamps/points awarded, redemptions, new members
  (StatTiles 2x2), and a list of today's transactions with the staff initials. Manager can Undo
  within 10 min from here (requires PIN on shared devices); later corrections go through Adjust.
- Overflow also has: Counter settings (theme, sound, kiosk, scanner camera, auto-award), Switch
  location (multi-location merchants), Lock device, Help ("How to award points" 30 s video).

## 9. States summary

| State | Treatment |
| --- | --- |
| Loading lookup | Customer panel skeleton (avatar circle, 2 lines, button block) after 150 ms |
| Not found | "New customer" panel with "Add and award" |
| Member muted/blocked by merchant | Warning panel "This member can't earn here. Ask a manager." |
| Program paused | Full-width neutral Banner "Your program is paused. Ask the owner to resume it." Awards disabled. |
| Feature not allowed for role | Control hidden |
| Server error on award | Item stays queued, warning toast "Saved. We'll retry." |
| App update required | Non-blocking banner for 7 days, then blocking screen (outside rush hours: 10 pm-6 am) |
