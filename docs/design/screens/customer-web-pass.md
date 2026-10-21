# Customer web pass and public pages (web, no download)

Next.js, server-rendered, **< 100 KB JS** on first load, works on a 3-year-old Android over shop
Wi-Fi. Single column, max width 480, paper canvas, 16 px gutters. The shop is the hero; our
brand appears only in the footer ("Part of {BRAND.name} · One card for every shop on your
street"). API: `/v1/public/...` + `auth` (OTP) + `wallet`.

Routes:

| Route | Page |
| --- | --- |
| `/j/<code>` | Join from the counter QR (location-specific code) |
| `/s/<slug>` | Public shop page |
| `/q/<token>` | Quote approval (Phase 2, Pro) |
| `/i/<token>` | Invoice pay (Phase 2, Pro) |
| `/card` | Web pass: my card (signed-in, cookie session) |

---

## 1. Join flow `/j/<code>` (target < 30 s, zero downloads)

The customer scanned the stand with their camera; staff are waiting.

### Step 1: Number (above the fold, no scrolling)

- Header: shop logo 56 + shop name `h2` + street `fgMuted` ("Roncesvalles").
- Offer line in an `accentSubtle` pill: "Join and get 1 free stamp" (welcome bonus) or "Earn 1 point
  per $1 here and at 30 shops nearby".
- `h1` "Join in 30 seconds". PhoneField autofocus (on iOS, autofocus doesn't raise the keyboard;
  place the field where the thumb lands).
- Primary lg "Text me a code". Caption: "No app needed. Free. We'll text you a 6-digit code."
- Footer: Terms · Privacy.

### Step 2: Code

Same page (no navigation; keep state), OtpField with Web OTP autofill. Returning members skip
straight to Step 4 after the code.

### Step 3: Name and consent

- TextField "First name" (one field only).
- ConsentCheckbox (unchecked): "Send me offers and news from {Shop} by text and email. I can
  unsubscribe anytime." Caption with sender identity per CASL (see ux-copy).
- Primary "Join {Shop}".

### Step 4: Joined (show the counter)

- Success: StampCard/PointsRing with the welcome bonus animating in (`stamp-pop`), `h2` "You're in,
  Alex." and "Show this to staff" caption.
- **Member QR** (MemberQr, 240 px) + member number, so staff can award the current purchase right
  now. "Turn your brightness up" hint on first view.
- Primary: "Add to Apple Wallet" / "Add to Google Wallet" (detect platform; show both on desktop).
- Secondary: "Get the app" (only after wallet; small).
- Below: "Also on Roncesvalles" carousel of 6 nearby network shops (ShopTile compact), to sell the
  network.

States and errors: invalid code `/j/<bad>` → "This QR code isn't active. Ask staff for help." +
generic join (pick shop from list nearby). Shop paused → "{Shop} has paused its program for now."
SMS not received after 30 s → "Didn't get it? Resend" and "Ask staff to add your number" (staff can
award by phone; customer completes later via the SMS link). Rate limits → warning Banner.

Performance: inline critical CSS, system font fallback first (Figtree swaps in), no map, no images
above the fold except the shop logo (48 KB max, served WebP/AVIF).

## 2. Public shop page `/s/<slug>`

SEO-friendly, shareable, linked from Google Business. Same content as the app's Shop detail,
read-only:

- Hero (cover, logo, name, vertical, neighbourhood, open status), action buttons Call / Directions /
  Website.
- "How you earn here" card + rewards list (RewardCards in `locked` presentation without balances) +
  live promos + discount card teaser.
- Primary sticky bottom: "Join {Shop}" → same join flow as `/j/` (join source `web`).
- Hours, map (static image, lazy), "More shops on {Street}" list.
- Meta: Open Graph image = shop cover with logo + "Earn rewards at {Shop}". `schema.org/LocalBusiness`.
- Signed-in visitor: shows their balance at the top instead of the Join button.

## 3. Quote approval `/q/<token>` (Phase 2)

Reached from SMS/push "Your quote from Fix-It Phones is ready". The token authenticates for this
quote only; approving asks for a one-time code to the phone on the ticket if the customer isn't
signed in (protects against forwarded links).

- Header: shop logo + name, ticket "Ticket #1042 · iPhone 13", status Badge "Needs your approval".
- QuoteApproval card (system.md) full width: items, HST, total, deposit, technician note, photos.
- Primary "Approve and pay $40 deposit" → Stripe Payment Element (Apple Pay / Google Pay first) →
  success "Approved. Fix-It Phones will start now." + Timeline below.
- Secondary "Decline" → optional reason (Select: Too expensive, Getting it fixed elsewhere, Not
  worth fixing, Other) → "Declined. {Shop} will let you know when to pick up your device."
- Ghost "Call {Shop}". Points line: "You'll earn about 182 pts when you pay the final bill."
- States: expired, superseded, already approved/declined (show final state and timestamp, no
  actions), invalid token ("This link doesn't work anymore. Contact {Shop}.").

## 4. Invoice pay `/i/<token>` (Phase 2)

- Header shop identity; invoice number, date, status Badge (open/paid/void).
- Line items, deposit already paid (negative line, leaf text), HST, **Amount due** `h1` tabular.
- Primary "Pay $142.40" → Stripe (wallets first). Success: receipt view + "You earned 182 pts at
  {Shop}" with PointsRing animation + "Add to Wallet" if not a member ("Join to keep your points").
- Paid: receipt with "Download PDF". Void: neutral Banner "This invoice was cancelled by {Shop}."
- Footer: "Payments processed securely by Stripe. {Shop}'s HST number: 12345 6789 RT0001".

## 5. Web pass `/card`

For members who never install the app: My card (MemberQr + member number), My shops list with
balances, Rewards (with redeem flow and RedeemCode), Settings (consent per shop, mute, data export,
delete). Same specs as the app (customer-mobile.md sections 5, 6 and 10), single column. Sign in by
phone + OTP; session cookie 90 days.

## Shared states

- Loading: server-rendered, so mostly none; skeletons only for balance fetches.
- Offline (PWA cache for `/card` only): "You're offline. Your card still works." with the cached QR.
- 404: "We couldn't find that page." + "Find shops near you".
