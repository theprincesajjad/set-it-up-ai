# Merchant dashboard (web, responsive)

Next.js app at `/m/[merchantId]/...` (e.g. `/m/abc/customers`). Owners check it on their **phone
between customers**, so every page must work at 360 px first; desktop is the bonus.
API: `merchant`, `reports`, `messaging`, `integrations`, `billing`, `staff`, `wallet` areas.
Roles: owner (all), manager (all but billing, staff removal, delete), staff (counter + Today only;
dashboard shows only "Today" and "Counter" for staff).

## Shell

- **lg+ (>= 1024):** sidebar 248 px, `canvasSubtle` bg: wordmark, merchant switcher (if user has
  several) + location Select ("All locations" / each), nav, then bottom: Help, account menu.
- **md (768-1023):** 72 px icon rail with tooltips; expands on hover/focus.
- **< md:** top app bar (merchant name + avatar menu) + bottom nav: Home · Customers · Promos ·
  Counter · More (Sheet with the rest).
- Content: max 1200, gutters 24 (16 on mobile), page header = `h1` title + optional description
  `fgMuted` + primary action right (on mobile, primary action becomes a sticky bottom Button).
- Nav order: Home, Customers, Program & rewards, Promos, Discount cards, Messages, Reports,
  Locations & QR kit, Staff, Integrations, Billing & plans, Settings. **Locked/paid features never
  appear in nav** until enabled.
- "Open counter" button in the sidebar header → opens counter mode web view (same spec as the app,
  for tablets with a browser) or deep links the app.

---

## 1. Onboarding checklist (self-serve wizard + rep follow-up)

First run after sign-up (or after a rep creates the merchant and sends the invite link).

**Wizard** (full-screen, progress "Step 2 of 5" + ProgressBar, back/next, saves each step):

1. **Your shop:** business name, vertical (grid of 20 vertical tiles: icon + label, 2 cols mobile / 4
   desktop), address (Google Places autocomplete → lat/lng, neighbourhood auto-detected and shown as
   "You're on Roncesvalles"), phone, logo upload (square crop, optional, placeholder preview using the
   vertical icon).
2. **Your program:** pre-filled from `VERTICAL_TEMPLATES[vertical]` with a live preview phone on the
   right (desktop) / below (mobile) showing the customer's StampCard or PointsRing. Plain-language
   summary: "Customers get 1 stamp per visit. 10 stamps = Free drink." "Change" expands the program
   editor (section 5) inline. Pharmacy shows the locked "Prescriptions don't earn" row with lucide:lock
   and "Required by Ontario pharmacy rules".
3. **Welcome bonus:** toggle + amount (template default).
4. **Staff:** add staff by phone (name + phone + role). Skip-able: "I'll do it later".
5. **Print your QR stand:** preview of the A6 stand with their name; "Download PDF" + "We'll mail you
   one" (if rep visit not scheduled). Done → Home with confetti-free success Banner "You're live.
   Your first customer can join right now."

**Checklist card** on Home until complete (dismiss only when 100%):

- [ ] Shop details · [ ] Program set · [ ] QR stand printed · [ ] Staff added · [ ] First customer
  joined · [ ] 25 active members (the activation goal). Each item: check circle, label, action link.
  Progress "4 of 6". Completed items show a leaf check and normal text (no line-through; it hurts
  readability) and move below incomplete ones.

## 2. Home overview

Header: "Good morning, Maria" `h1` + date `fgMuted`; location Select on mobile.

1. **Activation progress** (first 30 days, or until 25 active members): Card with ProgressBar
   accent "18 of 25 active members", "12 days left in your first 30", tip line ("Ask every customer
   for their number this week. Launch-week double points is on."). After activation → success
   Banner once: "You hit 25 members. Nice work." then the card disappears.
2. **KPI row** (StatTiles, 2 cols mobile / 4 desktop), default range Last 30 days (SegmentedControl:
   Today / 7 days / 30 days / 90 days): Active members, Visits, Rewards redeemed, New members. Each
   with delta vs previous period and sparkline.
3. **Today** card: visits so far, points/stamps awarded, last 5 transactions (ListRow with staff
   initials), "See all".
4. **Network** card: "Your customers also shop at" top 3 network shops (logo + name + overlap %),
   and "62 of your members found you through the network" (join source network/campaign). Reinforces
   the shared-network value.
5. **Live promos** (max 2) + "New promo" tonal button.
6. **One LockedFeature** card (the vertical's `upsellPlan` hero feature, e.g. Service tickets for
   repair shops): see system.md; dismissible 30 days.

States: loading skeletons per card; zero data (new shop): KPI tiles show "0" with caption "Your
first visits will show up here", Today card EmptyState "No visits yet today. Your QR stand is the
fastest way to start."

## 3. Customers

- Header "Customers" + count `fgMuted` ("1,204 members") + actions "Import" (secondary), "Export CSV"
  (secondary). No "Add customer" primary: customers join at the counter; manual add lives in the
  overflow ("Add a customer").
- Toolbar: search (name, phone last 4, email), filter Chips: All, Reward ready, VIP level, New (30
  days), At risk (no visit 60+ days), Opted in to messages, Muted.
- DataTable columns: Name (Avatar + name), Phone (masked `(416) •••-0123`, reveal on click with
  audit log), Balance (tabular, right), Visits, Last visit (relative "3 days ago"), Joined, Messages
  (Badge: "Opted in" success / "No consent" neutral / "Muted" neutral), VIP.
- Mobile: ListRows (name, "Last visit 3 days ago · 12 visits", balance trailing).
- Empty: "No customers yet", "Customers join when they scan your QR stand or give their number at
  the counter.", primary "Print your QR stand", ghost "Import from another app".
- Import flow: CSV upload → column mapping (phone required) → preview 5 rows → consent question
  "Did these customers agree to get marketing messages from you?" (No / Yes, I have records) → if No
  they're imported without marketing consent (CASL) → summary "1,120 imported, 14 skipped (invalid
  numbers). Download skipped rows."

## 4. Customer detail

`/m/[id]/customers/[memberId]`. Header: Avatar 56, name `h2`, masked phone, joined date + source
("Joined Sep 12 at the counter"), Badges (VIP Gold, Opted in, Muted).

- **Balance card:** big balance `stat`, StampCard/PointsRing mini, next reward, "Adjust points"
  secondary (manager+) → Sheet: +/- amount, reason Select, note, preview "New balance: 310 pts".
- **Activity table:** date, type, amount, purchase $, staff, location, source (Counter, Square,
  Dashboard...). Reversal action on recent rows (owner/manager, with reason) → confirm dialog.
- **Rewards redeemed** list. **Messages**: consent status per channel with timestamps and wording
  version ("SMS opt-in Sep 12, 2026 at the counter, text v3"), last messages received.
- **Notes** (internal, staff-visible): TextField textarea, saved with author.
- **Phase 2:** orders and tickets for this customer.
- Overflow: "Block from earning" (fraud), "Remove from my shop" (deletes merchant-member link,
  keeps ledger history anonymised). Customers' network identity is never exposed: no other shops'
  balances, no other shops' names.

## 5. Program and rewards editor (live preview)

Two-column on lg (editor left 60%, sticky **phone preview** right 40%); single column with a
"Preview" floating button → Sheet on mobile.

**Preview** renders the real customer components (ShopTile wallet, StampCard/PointsRing,
RewardCards, PromoCard) with the draft values and the shop's logo, inside a 320 x 640 phone frame
(radius 40, 8 px `fg` bezel). Toggle above it: "Wallet" / "Shop page" / "Counter success".
Updates as you type (debounce 150 ms).

Editor sections (Cards):

1. **How customers earn:** SegmentedControl Points per dollar / Points per visit / Stamps. Fields:
   points per $1 (number), points per visit, stamp goal (6-12 stepper). Terminology Select (points,
   stamps, stars). Live sentence: "Customers earn 1 point for every $1."
2. **Rewards** (rewards catalogue): list of rewards (drag handle to reorder, name, cost, type Badge,
   Active Switch, edit/delete). "Add reward" → Sheet: name, type (Free item / $ off / % off / Custom),
   value, cost, terms. Guardrail hints: "Most cafés set a free drink at 8-10 stamps."
3. **Bonuses:** welcome bonus, birthday reward, referral (both get N pts), VIP levels (table: name,
   threshold visits/spend, multiplier).
4. **Categories that don't earn:** list of categories with "Earns points" and "Discounts apply"
   switches. Regulated ones (Prescriptions, Pharmacy services, Alcohol, Tobacco & lottery, Gift cards)
   are locked off with lucide:lock and a "Why?" link (Ontario rules). Info Banner for pharmacies.
5. **Expiry:** default "Points never expire" (recommended Badge). Option "Expire after N months
   without a visit" (min 12) with warning Banner: "Customers will see this rule next to their
   balance everywhere."

Save bar: sticky bottom on change: "You have unsaved changes" + "Discard" ghost + "Save program"
primary. Changes affecting existing balances (raising reward costs) show a confirm dialog:
"Customers close to a reward will need more points. 34 customers are affected." with option "Notify
them" (transactional, allowed).

## 6. Promos

- List with status tabs: Live · Scheduled · Drafts · Ended. Card list (PromoCard `preview` +
  status Badge, dates, results "212 views · 38 redemptions").
- **Promo editor:** kind picker (5 tiles: Offer, Bonus points / Double points, Discount, Event,
  Multiplier) → fields: title (60 chars, counter), description (280), image (16:9 optional, crop),
  start/end (date + time, Toronto tz; quick chips "Today only", "This weekend", "1 week"), items or
  categories (for bonus points), eligible locations. Preview on right shows the feed PromoCard and
  the shop page. "Also send to opted-in members" toggle → links to Messages with prefilled email
  (SMS only if Plus GA; otherwise LockedFeature row "SMS campaigns · Coming soon").
- Publish: "Schedule" / "Publish now". Ended promos are hidden from customers automatically.
- Phase 3 **Boost** (ads.sponsored_promo): "Boost this promo" LockedFeature row until GA; when GA,
  a Sheet with budget and radius, and a preview showing the "Sponsored" label exactly as customers
  will see it.
- Empty: "No promos yet", "A simple offer gets people through the door. Try double stamps on a slow
  afternoon.", primary "Create a promo".

## 7. Discount cards

Show-to-save cards (seniors, students, staff of neighbouring shops).
- List of DiscountCards (live preview thumbnails) with active Switch, holders count.
- Editor: name, % off, eligibility (Anyone / Ask for proof: seniors 65+, students, custom), terms
  (prefilled for pharmacy: "Front-store items only. Not valid on prescriptions or pharmacy
  services."), excluded categories (auto-includes no-discount categories, locked).
- Empty: "Give your regulars a card to show", "Seniors' day? Student discount? Customers carry it in
  the app.", primary "Create a discount card".

## 8. Messages

Email campaigns (free). SMS and automations appear as LockedFeature until Plus is GA.

- **Audience header (always visible):** consent counts as StatTiles: "Can email: 642", "Can text:
  410", "No consent: 552". Caption: "Only customers who said yes get offers. That's the law (CASL)
  and it's good manners."
- List: messages with status Badges (draft, scheduled, sending, sent, failed, cancelled), sent
  date, audience size, opens/clicks.
- **Composer:** channel (Email; SMS locked), audience (All opted-in, VIP, At risk, Reward ready,
  custom filter) with live count "Will go to 642 people", subject, body (rich text, limited: bold,
  links, one image), live preview (desktop email + mobile), mandatory footer (non-editable, shown
  in preview): shop name, address, "Sent via {BRAND.name}", unsubscribe link. Send test to myself.
  Schedule or Send → confirm dialog "Send to 642 people now?".
- Transactional messages (order ready, quote) are not here; they're automatic.
- Empty: "Say hello to your regulars", "642 customers said yes to hearing from you.", primary
  "Write an email". If 0 consented: "No one can get messages yet. Customers opt in when they join."

## 9. Reports

Tabs: Overview · Visits · Members · Rewards · Promos · Network (· Advanced: LockedFeature until Plus).
Date range picker (presets + custom), location filter, "Compare to previous period" Switch,
"Export CSV" per chart.

- Overview: StatTiles + line chart visits/day (series 1), bar chart new members/week, redemption
  rate gauge.
- Visits: heatmap day x hour (sequential pine), by staff, by location.
- Members: active vs lapsed (stacked bars, series 1 + network stone), VIP distribution, join source
  breakdown (horizontal bars).
- Rewards: redemptions by reward, outstanding points liability ("Customers hold 48,200 pts ≈ $482
  in rewards").
- Promos: table per promo (views, redemptions, bonus points issued, visits during promo vs baseline).
- Network: overlap with other shops (anonymised: "38% of your members also visit a bakery on the
  strip"), campaign participation.
- Every chart: "View as table" toggle; skeleton charts while loading; empty "Not enough data yet.
  Check back after a week of visits."

## 10. Locations and QR kit

- Locations list (Cards): name, address, hours, counter devices count, QR code thumbnail, members
  joined via this QR. "Add location" (unlimited, free; caption "Unlimited locations, always free").
- Location editor: name, address, hours per day (with "Closed" toggle, holiday hours), phone, map pin
  confirmation.
- **QR kit** (per location): preview of `qr-stand-a6.svg` filled with shop name, street and join
  URL. Options: size (A6 stand, 4x6 card, A4 poster, window decal 120 mm round, staff script card),
  "Download PDF" primary, "Download PNG" secondary, "Order printed kit" (rep fulfils; free for first
  kit). QR is always black on white; no colour customisation (show a caption explaining why:
  "Black and white scans best under shop lights").
- Join link copy field `local.example/j/K7Q4` with Copy IconButton.

## 11. Staff

- List: Avatar, name, role Badge (Owner/Manager/Staff), phone masked, last active, PIN set (check).
- "Invite staff" primary → Sheet: name, phone, role (radio with one-line descriptions), location
  access. Sends an SMS invite (transactional). Caption: "Unlimited staff, always free."
- Staff detail: role change, reset PIN, deactivate (danger confirm "Priya can't award points after
  this. Their past activity stays in your reports.").
- Granular permissions (`staff.permissions`, Pro) appear as a LockedFeature row in the role
  section until enabled.

## 12. Integrations

- Grid of provider Cards (logo 40, name, one-line value, status Badge): **Square, Clover, Shopify,
  Lightspeed, Toast** (POS auto-award, free), Google Business (hours/sync), Mailchimp (export
  consented emails), Webhooks. Stripe and Twilio appear only when Plus/Pro features are enabled.
- Card states: not connected ("Connect" secondary) · pending ("Finishing setup..." info Badge) ·
  connected (success Badge "Connected", last sync "2 min ago", "Manage") · error (danger Badge
  "Needs attention" + Banner with fix: "Square disconnected. Reconnect to keep awarding points
  automatically.") · disconnected.
- Connect flow: OAuth redirect → back to a mapping screen: "Match Square locations to your
  locations", "Award points on: every paid transaction / only identified customers", category mapping
  for no-earn (e.g. Square category "Rx" → Prescriptions). Test transaction preview.
- Webhooks: endpoint list, add URL, event checkboxes, signing secret (reveal/copy), delivery log
  table with status Badges and "Resend".

## 13. Billing and plans (paid plans "coming soon")

The page that must feel like **good news coming**, not a paywall.

- Top Card: "You're on **Free**. Forever." Badge brand "Free plan". List with leaf checks: "No
  transaction fees", "Unlimited locations, staff and members", "Every loyalty feature", "Network
  listing and perks". No card on file required.
- Plans grid (3 columns lg, stacked mobile): Free (current, outlined `brand` 2 px), **Plus $39/mo**
  and **Pro $79/mo** each with: name, price (`h2` tabular) + "/month, CAD", blurb from `PLANS`,
  "Best for" chips, feature list (from `FEATURES` where `minPlan` matches), and:
  - If `isPlanAvailable` is false: Coming soon Badge, network progress ProgressBar "112 of 150 shops
    on the network. Paid features switch on at 150.", tonal "Notify me" (→ "We'll email you").
    Price shown in `fgMuted` with caption "Planned price".
  - If available: primary "Start Plus" → Stripe Checkout; annual toggle "Pay yearly: 2 months free".
- FAQ accordion: "Will loyalty ever cost money?" "No. Every loyalty feature stays free. That's a
  promise in our terms." / "What's the 0.75% fee?" "Only on payments you take in the app with
  Plus or Pro. The Free plan has no payments and no fees."
- Subscribed state (later): current plan Card, next invoice, payment method, invoices table, cancel
  (confirm, keeps loyalty untouched: "Your loyalty program keeps running on Free.").

## 14. Settings

Tabs: Shop profile (name, description, photos: logo + cover, vertical, contact, social links,
public page preview link) · Hours (per location shortcut) · Counter (default theme, sound, kiosk
auto-award, award cooldown, Undo window display) · Notifications for me (daily summary email,
integration errors, weekly report) · Privacy (data export of all members CSV, retention info) ·
Danger zone (pause program: "Customers keep their points and can still redeem"; close shop: wind-down
date + member notice; transfer ownership).

## Mobile-first notes

- Every table → ListRow on < md. Every multi-column editor → single column with preview Sheet.
- Sticky bottom primary action on forms; keep forms short (one Card per screen when possible).
- Use `inputMode` everywhere (numeric for points/money, tel for phones).
- Pages load with skeletons in < 1 s on 4G; KPI numbers arrive first, charts lazy-load.
