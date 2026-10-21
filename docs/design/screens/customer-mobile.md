# Customer app (Expo, iOS + Android)

Components: [system.md](../system.md). Copy keys: [ux-copy.md](../ux-copy.md). The same flows
exist in the no-download web pass ([customer-web-pass.md](./customer-web-pass.md)); keep them
visually identical so a web-pass member who installs the app feels at home.

API areas: `auth` (OTP), `customer` (`/v1/me/...`), `network` (feed, map), `wallet`, `campaigns`,
`commerce` + `service` (Phase 2). Build only against `packages/shared/src/api/*`.

## Navigation

```
Onboarding stack (until signed in)
  Welcome → Phone → Code → Name & consent → (Notifications prompt) → Home

Tabs
  Home      wallet ("My shops") + nearby feed
  Map       map/list of network shops
  Card      my member QR (centre, raised)
  Rewards   rewards I can redeem across shops + campaigns/passport
  You       activity, orders & tickets (Phase 2), settings

Stacks pushed from anywhere: Shop detail, Reward → Redeem, Promo detail, Campaign detail,
Order detail, Ticket detail, Quote approval, Invoice, Settings sub-pages.
```

Deep links: `ll://shop/<slug>`, `ll://card`, `ll://rewards/<rewardId>`, `ll://ticket/<id>`,
`ll://quote/<token>`, `ll://order/<id>`. Universal links mirror the web paths (`/s/<slug>`,
`/q/<token>`, `/i/<token>`, `/j/<code>`).

Global states:
- **Offline:** OfflineBanner (neutral variant for customers: "You're offline. Your card still
  works."). Card tab works fully offline (cached token); everything else shows cached data with
  "Updated 3 min ago" caption.
- **Session expired:** silent refresh; if it fails, a Sheet "Sign in again" → Phone step with
  number pre-filled.
- **Force update:** full screen, mark + "Time for a quick update" + "Update" button (store link).

---

## 1. Onboarding

Goal: signed-in member in under 30 s. Three inputs max: phone, code, first name.

### 1.1 Welcome

- Layout: canvas paper. Top 55%: illustration of a street of four shopfronts with awnings
  (marigold, brick, pine, lake). Below: `display` (Fraunces 40) "One card for every shop on your
  street." (`h1` Figtree on screens < 360 pt wide). Body `fgMuted`: "Earn points at local shops.
  Free, and your points never expire."
- Actions: primary lg full width "Get started". Ghost "I'm a shop owner or staff" → staff sign-in
  (same OTP flow, then counter mode).
- Footer caption: "By continuing you agree to the Terms and Privacy Policy." (links).
- If opened from a join link with a shop context, replace illustration with the shop's logo
  (ShopTile hero) and title "Join {Shop} on {BRAND.name}".

### 1.2 Phone

- App bar with back. Title `h2` "What's your mobile number?" Sub `fgMuted` "We'll text you a code.
  This is also how shops find your card."
- PhoneField autofocused, "+1" prefix chip. Primary "Send code" pinned above keyboard, disabled
  until 10 valid digits (this is the one place we disable, because the field explains why).
- Caption under field: "Standard message rates may apply."
- States: sending (button loading); error invalid number (inline); rate limited (Banner warning
  "Too many tries. Try again in 10 minutes."); network error (Banner danger + Retry).

### 1.3 Code (OTP)

- Title `h2` "Enter the code", sub "Sent to (416) 555-0123. **Change**" (link back).
- OtpField autofocused, SMS autofill. Auto-submits. Resend with 30 s countdown.
- Success → if existing user with name: straight to Home with toast "Welcome back, Alex." Else → 1.4.
- Errors: wrong code (shake, "That code didn't match. Try again."), expired ("That code expired.
  We sent a new one." auto-resend once), 5 failures (lock 10 min).

### 1.4 Name and consent

- Title `h2` "What should shops call you?"
- TextField "First name" (autocomplete `given-name`), TextField "Last name (optional)".
- TextField "Birthday (optional)" month + day only (two Selects), hint "For a birthday treat at
  shops that offer one. We never ask for the year."
- **Consent block** (Card, `surfaceSunken`): ConsentCheckbox, unchecked:
  "Send me offers and news from shops I join, by text and email. I can unsubscribe anytime."
  Caption below: "Each shop is named in every message. You can turn this off for any shop in
  Settings." Second ConsentCheckbox: "Send me {BRAND.name} news and neighbourhood events."
  Exact text in [ux-copy.md](../ux-copy.md#7-casl-consent). Consent is per shop at join time: this
  global choice pre-fills the per-shop consent when they join a shop in the app, and is recorded
  per merchant with the text version.
- Primary "Done". Then: if the user came from a shop join, show the **Joined** success (shop logo,
  stamp pop, "You're in. {Welcome bonus} added at {Shop}.") for 1.5 s → Home.

### 1.5 Notifications prompt

Pre-permission Sheet (never the OS prompt cold): lucide:bell in brandSubtle circle, "Know when
you've earned a reward", body "We'll only notify you about your points, rewards and orders. Offers
are off unless you turn them on." Buttons "Turn on" (→ OS prompt) / "Not now". Show once after
first earn, not during onboarding if the user arrived from a counter QR (keep join to 30 s).

### 1.6 Location prompt

Only when the user opens Map or taps "Nearby" for the first time. Pre-permission: "See shops near
you" / "Allow while using" / "Not now" (fallback: neighbourhood picker list).

---

## 2. Home (wallet + nearby feed)

Large title "Hi Alex" (`h1`), sub caption = neighbourhood ("Roncesvalles") with lucide:map-pin 14,
tap to change. Trailing IconButton bell (notifications inbox, badge dot if unread).

Sections, in order:

1. **Ready for you** (only if any): horizontal carousel of RewardCards in `available` state, accent
   left edge. Title "Rewards ready" + count badge.
2. **In progress** (Phase 2, only if any): compact OrderTracker / ticket status rows ("iPhone 13
   screen · Needs your approval" with warning Badge). Quote-needed items sort first.
3. **My shops**: vertical list of ShopTile `wallet`, sorted: reward ready → most recent visit.
   Shows up to 6, then "See all 9 shops". Pull-to-refresh refreshes balances.
4. **Passport / campaign** banner (if a campaign is live in the neighbourhood): Card with campaign
   art, "Roncesvalles Passport · 3 of 5 shops" ProgressBar accent, "Ends Sun".
5. **Nearby**: feed of PromoCards (organic + max 1 sponsored per 5), sorted by distance then recency,
   filter Chips row (All, Food & drink, Services, Health, Shops; maps to verticals). Infinite scroll
   with 10-item pages. Shops you haven't joined show a "Join" tonal sm button in the card footer.

States:
- **Loading:** skeleton for title, 3 wallet tiles, 2 feed cards.
- **Empty wallet (new user with no shops):** EmptyState: storefront illustration, "Your shops will
  live here", "Show your card at any shop on the map to start earning.", primary "Show my card",
  ghost "Find shops nearby".
- **No shops nearby (outside a launched neighbourhood):** "We're not on your street yet", "We
  launch one neighbourhood at a time. Want us in yours?", primary "Suggest my street" (form:
  street + shop names), ghost "See where we are".
- **Error:** cached content + Banner danger "Couldn't refresh. Pull to try again."

## 3. Shop detail

Pushed screen; header collapses on scroll.

- **Hero:** ShopTile `hero` (cover, logo, name `h2`), vertical label + neighbourhood + distance
  (`bodySm fgMuted`), open status line, action row of IconButtons with labels: Call, Directions,
  Website, Share. "Mute" in overflow menu.
- **Your card at this shop** (member): Card with StampCard or PointsRing (120), balance, next reward
  line, "How you earn here": "1 point per $1 · Prescriptions don't earn points" (no-earn categories
  always listed). Expiry rule if enabled: "Points expire after 12 months without a visit."
- **Not a member:** Card "Earn here" with earn rule + welcome bonus ("Get 50 pts when you join"),
  primary "Join {Shop}" → consent Sheet (per-shop CASL checkbox, unchecked) → joined state with
  stamp pop.
- **Rewards:** list of RewardCards for this shop.
- **Offers:** live PromoCards; **Discount card** (if any) as a DiscountCard teaser → full screen.
- **About:** hours (today bold), address with mini map, description.
- **Phase 2 rows** (only if enabled for this shop): "Order ahead" primary block, "Book a drop-off",
  "My tickets here".
- **Activity here:** last 3 transactions + "See all".

States: loading skeleton matching hero + 3 cards; shop paused ("This shop has paused its program.
Your 230 pts are safe."); shop closed (balance read-only + "Contact the shop to use your points by
{date}" if they provided a wind-down date).

## 4. Map

- Full-bleed map, search field floating top (radius full, `shadow.md`): "Search shops or
  streets". Filter Chips row under it (horizontal scroll). "List" SegmentedControl toggle top right.
- MapPins per shop (vertical accent + icon). Clusters below zoom 15.
- Bottom sheet (snap 96 px peek / 50% / 90%) with nearby list (ShopTile `list`). Selecting a pin
  scrolls/highlights its row; peek shows the selected shop with "Directions" and "View shop".
- Locate-me FAB 48 bottom-right above sheet.
- States: no location permission → map centred on the selected neighbourhood + Banner info "Turn on
  location to see what's closest" (action "Turn on"). No results for search → in-sheet EmptyState
  "No shops match "tire". Try another word." Old phones: if map fails or device is low-memory,
  default to List view.

## 5. My card

The screen staff see most. Must render instantly, offline.

- Canvas `canvas`; centred white card radius `xl` `shadow.md`: member first name `h3`, MemberQr
  260 px, member number `code` grouped, caption "Show this at the counter".
- On focus: brightness to 100%, keep awake; restore on blur/background. Tap QR → full-screen QR
  (bigger, landscape allowed).
- Below card: "Add to Apple Wallet" / "Add to Google Wallet" official badges (platform-appropriate;
  hidden if already added → "In your Wallet" caption with check).
- Below: segmented "Card / Discount cards" if the member holds any DiscountCards; discount list shows
  DiscountCard thumbnails → full screen with live clock.
- Phone fallback line: "Or give your number: (416) 555-0123" (masked middle digits toggle: tap to reveal).
- States: offline (works; caption "Offline · your card still works"); token refresh failed > 7 days
  offline (still show last QR + member number; staff can always look up by phone).

## 6. Rewards and redeem

### 6.1 Rewards tab

- Title "Rewards". Segmented: "Ready" / "All shops" / "Passport".
- **Ready:** RewardCards available now, grouped by shop with shop row header.
- **All shops:** per shop: ShopTile compact + horizontal list of RewardCards (locked ones show
  progress).
- **Passport:** campaigns (see section 8).
- Empty Ready: "No rewards yet", "Keep visiting your shops. We'll tell you the moment one's ready.",
  button "See how close you are" (switches to All shops).

### 6.2 Redeem flow

1. Tap "Redeem" on a RewardCard → confirm Sheet: reward name `h3`, shop, cost, "Your balance after:
   140 pts", terms. Primary accent "Show code to staff". Secondary "Not now". Copy note: "Only tap
   this at the counter. The code lasts 10 minutes."
2. RedeemCode full screen (brightness up): code `K7 4Q`, QR, countdown, "Waiting for staff..." with a
   subtle pulsing dot. Polls / listens for confirmation.
3. Confirmed → success state (leaf fill, check draw, haptic success, "Enjoy your free coffee.
   Confirmed by Sam."). Balance updates. Auto-close 4 s → Shop detail.
4. Expired → "This code expired. Your points weren't used." + "Get a new code".
5. Cancel → "Cancel this code?" → points untouched.
- Offline: "Redeem" button shows "You're offline. Reconnect to redeem." (redemptions need a live
  balance check).

## 7. Activity

You → Activity. Grouped by day ("Today", "Yesterday", "Mon, Oct 19").
- Row: ShopTile compact logo, title by type: earn "Earned 12 pts", stamp "Got a stamp", redeem
  "Redeemed Free drink", welcome_bonus "Welcome bonus", birthday_bonus "Birthday treat",
  referral_bonus "Referral bonus", promo_bonus "Double points bonus", network_bonus "Neighbourhood
  bonus", campaign_bonus "Passport bonus", adjust "Adjusted by {Shop}", reversal "Reversed",
  expire "Expired". Amount trailing: `+12` in `onSuccessSubtle` (leaf text), `-400` in `fg`.
  Subtitle: shop name · time · purchase amount if any ("$11.80").
- Filter: Chips by shop. Tap row → detail sheet with transaction id (for disputes) and "Something
  wrong? Contact {Shop}".
- Empty: "Nothing here yet", "Your points and rewards will show up here after your first visit."

## 8. Campaigns / passport progress

- Campaign detail: hero art (BIA campaign image or illustration), name `h2` ("Roncesvalles
  Passport"), dates, prize ("Win a basket from 12 shops"), rules link.
- Progress: big ring or a "passport page" grid of participating shops: each shop is a 64 px stamp
  slot with the shop logo; visited = full colour + rotated marigold "visited" stamp overlay; not
  visited = logo at 40% opacity with dashed ring. Caption "3 of 5 shops visited · 2 to go".
- List of participating shops (ShopTile list, unvisited first, sorted by distance) with "Directions".
- Completed: success card "You did it. You're entered in the draw." + share.
- Network perks (e.g. "visit 3 shops on the strip, get 50 bonus pts") use the same pattern, compact.
- Ended campaign: summary ("You visited 4 shops") with no actions.

## 9. Orders and tickets (Phase 2)

Hidden entirely until any shop the member follows has `orders.*` or `service.*` enabled.
You → "Orders & tickets"; Home "In progress" section.

- **List:** segmented "Active" / "Past". Rows: shop logo, title ("Pickup order #A42", "Honda Civic ·
  brakes"), status Badge (mapping in system.md), time.
- **Order detail:** OrderTracker, items, total, pickup time, shop address, "Call shop". Ready push
  opens here.
- **Ticket detail:** header (item, ticket number, drop-off date), Timeline, QuoteApproval inline when
  `quote_sent`, invoice card when ready ("Pay $182.40" primary → Stripe payment sheet), points to be
  earned line ("You'll earn 182 pts when you pay").
- **Quote approval:** see system.md QuoteApproval. After approve with deposit: payment sheet →
  success "Approved. We've let {Shop} know." Timeline advances.
- Empty: "No orders or repairs yet". If customers ever see a teaser: LockedFeature "Order ahead at
  {Shop}" with "Notify me" only when that shop has opted into beta.

## 10. You and settings

You tab: header with Avatar 56 + name + phone (masked), "Edit profile". Rows:
Activity · Orders & tickets (Phase 2) · Wallet pass · Notifications · Shops & messages · Invite a
friend (referrals, if any shop offers it) · Help · Privacy & data · About · Sign out.

### 10.1 Shops & messages (mute shops, consent)

- Explainer at top: "You choose who can send you offers. Your points keep working either way."
- One ListRow per joined shop: logo, name, sub "Offers by text and email: On" / "Off", trailing
  Switch "Offers". Tap row → shop detail sheet with separate switches: "Text messages", "Email",
  "Push notifications", and **"Mute this shop"** (hides its promos from your feed and stops all
  promotional messages; transactional messages like "order ready" still arrive). Muted shops show
  lucide:bell-off in lists.
- Global: "{BRAND.name} news and neighbourhood events" Switch.
- Turning a switch off = immediate withdrawal of consent (API call), toast "Done. {Shop} won't send
  you offers." Turning on shows the full consent sentence in a confirm Sheet (records new consent).

### 10.2 Notifications

Switches: Rewards & points (on), Orders & repairs (on, Phase 2), Offers from shops (off by default,
needs per-shop consent), Nearby offers (Phase 2, off). Link to OS settings if OS permission denied.

### 10.3 Privacy & data

- **Download my data:** "We'll email a file with your profile, shops, points and messages within 24
  hours." Primary "Request my data" → requires OTP re-verify → success "Requested. Check {email}
  or we'll text you a link." If no email on file, ask for one (TextField) or deliver an in-app
  download link (expires 7 days).
- **Delete my account:** danger row → screen explaining consequences in plain words: "Your card
  stops working at every shop. Your points at 6 shops (1,240 pts total) will be lost. Shops keep
  records of past purchases as the law requires, without your name." Type "DELETE" TextField, OTP
  re-verify, danger Button "Delete my account". Then sign-out and a confirmation screen. If the
  member has open orders/tickets/unpaid invoices: block with "Finish or cancel your open repair at
  {Shop} first."
- Links: Privacy Policy, Terms, "How shops use your data" plain-language page.

### 10.4 Edit profile

First name, last name, birthday (month/day), email (optional, for receipts and data export), phone
change (OTP to new number; old number gets a notice SMS).

---

## Motion and haptics summary

| Moment | Motion | Haptic |
| --- | --- | --- |
| Stamp earned (push opens app) | `stamp-pop` 600 ms on the new slot | success |
| Points earned | PointsRing sweep + count-up 600 ms | success |
| Reward ready | Card accent edge slides in 220 ms | none |
| Redeem confirmed | Leaf fill + check draw 600 ms | success |
| Error | Shake 220 ms (fade if reduced motion) | error |
| Pull to refresh | Native | none |
