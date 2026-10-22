# Polish audit (v2) — pixel pass

Scope: every screenshot in `apps/mobile/e2e/screenshots/` (65), `apps/web/e2e/screenshots/v2/` (66) and
`apps/web/e2e/screenshots/v2/dashboard/` (100), reviewed against `docs/design/foundations.md` and its anti-slop
checklist. Measurements are in pt/px at 1x (screenshots are @2x unless noted). "Expected" is what the spec or the
rest of the product does; "actual" is what the screen did before this pass.

Status key: **closed** = fixed and re-shot · **closed (n/a)** = verified not a defect after re-shoot, with the reason.
Each item names the file(s) where the fix lives.

---

## 0. System-level defects (affect many screens)

| # | Defect | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| S1 | Tabular figures applied to every text style | Tabular only where numbers change (balances, timers, keypad, codes) | `typo()` set `fontVariant: tabular-nums` on all UI styles; Inter's tabular set widens hyphens and punctuation: "Dog‑Eared", "drop‑in", "555‑7030", "‑10" render with gaps (mobile 06, 07, 10, 13, 17, 30, 32b; web PhoneField) | closed — `packages/design-tokens/src/typography.ts` (`tabular` only on number styles), `Text tabular` / `Num` for amounts |
| S2 | Two left edges on every pushed screen | One left edge at 16 | Back button and nav bar at 12, content at 16 (mobile 02, 03, 09, 14, 18, 20*, 30, 38) | closed — `ui/Screen.tsx` bar padding 16 |
| S3 | Sheet gutter differs from page gutter | 16 everywhere on phones | Sheets 20 (`Sheet`, Explore shop sheet, card sheet), pages 16 (mobile 05, 06b, 07b, 12b, 13, 15, 35) | closed — `ui/Sheet.tsx`, `map.tsx`, `card.tsx` |
| S4 | Sheet titles use two different faces | One sheet title style: system 22/600 | Location prompt = system 22/600; push prompt and `Sheet` = Bricolage 20 (mobile 06b vs 05) | closed — `Sheet` title = `title`, push prompt uses the `Sheet` title |
| S5 | Nav bar titles in Bricolage | Bricolage only for display, numbers, map labels; nav titles are system 17/600 | Centered bar titles ("edit profile", "notifications", "today") set in Bricolage 17 (mobile 20, 20b, 20c, 20d, 38, 40a) | closed — `Screen` bar title = `headline` |
| S6 | Negative numbers use hyphen-minus | U+2212 minus, muted, tabular | "-10", "-250" with hyphen (and S1 spacing) (mobile 10, 17, 38; dashboard 01) | closed — `lib/format.ts signed()` mobile, `lib/format.ts formatSigned()` web |
| S7 | Switches off-brand on web/QA and Android | iOS: system green; Android: black track; web preview mimics iOS | RN-web default teal `#009688` track (mobile 20b), grey (20c, 31, 40a) | closed — `ui/Switch.tsx` |
| S8 | Skeletons are grey slabs, not the final layout | Skeleton rows = avatar + two lines + trailing value, same heights as the real row | `SkeletonList` = 56–88 pt grey boxes (wallet, activity, explore list, shop sheet) | closed — `ui/Skeleton.tsx SkeletonRows`, `SkeletonShop` |
| S9 | Errors are generic and two-line | One sentence + "Try again" | "Couldn't load this" header + body; some screens show only a banner with no retry | closed — `ErrorState` = one sentence + retry, used on wallet / activity / shop / explore / notifications |
| S10 | Empty states with two actions | One sentence + one action | Wallet empty: header + sentence + "Show my card" + "Find shops nearby" (05b) | closed — `wallet.tsx` |
| S11 | Balances stacked, not baseline-aligned | Balance and unit on one baseline, the baseline aligned with the row title | Number on one line and unit under it, number top ≠ name baseline (mobile 06, 06c, 08, 14b; web wallet) | closed — `ui/ShopTile.tsx` balance row, web `ShopTile` |
| S12 | Accent on zero balances | Accent means points you have; a 0 balance is muted | "0 stamps" in accent (06c) | closed — `ShopTile` |
| S13 | No count-up when a balance changes | Number counts up over ≤ 400 ms, off with reduce motion | Numbers jump | closed — `ui/CountUp.tsx` (mobile), `components/ui/CountUp.tsx` (web); wallet hero, shop balance, counter success |
| S14 | Press states inconsistent | Rows: bg-subtle fill; buttons/capsules: scale 0.98; chrome circles: opacity | Rows/tiles fill but chips, rail and action capsules have no press state; web rows none | closed — `Chip`, `ShopBody Action`, `IconButton`, web `pressable` utility |
| S15 | Reduce motion read ad hoc | One hook, respected by sheets, skeletons, count-up, success check | Each component calls `isReduceMotionEnabled()` once and never listens | closed — `ui/motion.ts useReducedMotion()` |
| S16 | Capitalisation drift | Page titles lowercase (the voice), sentence case for controls; reward names keep their own case only as titles | "Redeemed Free drink", "60 pts to Free drop-in class", "9 more for a Free drink", "Welcome bonus: 1 stamps" (mobile 06, 10, 17; web shop, home) | closed — `rewardInSentence()` mobile `lib/format.ts`, web `lib/format.ts` |
| S17 | Neighbourhood name case drifts | lowercase in map chrome / italic place line; Title Case in prose | "Roncesvalles Village" in the place line on web shop, "roncesvalles village" on mobile; passport card shows Title Case where mobile pin line is lowercase | closed — web `ShopHeader` place line lowercase like mobile |
| S18 | Masking dots drift | One mask: "(647) ••• 1009" | "***-1009" (profile, counter), "•••-••09" (card), "...1009" (today, recent) | closed — `lib/phone.ts maskPhone()` used everywhere on mobile |

## 1. Mobile — customer (`apps/mobile`)

| # | Screen | Defect (expected vs actual) | Status |
| --- | --- | --- | --- |
| M1 | 01 welcome | Wordmark set in system bold next to the mark; expected Bricolage 800 lowercase like web header | closed — `welcome.tsx` |
| M2 | 01 welcome | Subtitle widow "expire." on its own line; expected balanced two lines | closed — copy "Earn at local shops. Free, and points never expire." |
| M3 | 02 phone | Title 32 pt line height on a 28 pt style (overflows 4-grid) and wraps 2 lines with a widow "number?" | closed — title "your mobile number" / Screen large title |
| M4 | 03 code | OTP boxes centred (x=31) while everything else starts at 16; expected a full-width row on the left edge | closed — `ui/OtpField.tsx` stretches to the gutter |
| M5 | 03 code | "Resend in 0:29" not tabular, centred under a left-aligned screen | closed — left-aligned, tabular |
| M6 | 04 name | No top bar / back; title sits 16 pt from the top while 02/03 sit under a 44 pt bar | closed — `name.tsx` uses the same `Screen` frame |
| M7 | 04 name | Birthday "Month / Day" are full capsules (radius full) while inputs are radius 10 | closed — picker fields radius 10, 52 tall like inputs |
| M8 | 04 name | Consent copy 17 pt body inside a tinted block; expected 15 pt body, no tinted card | closed — 15 pt, hairline group |
| M9 | 05 / 07a explore | Location sheet in Title Case "See shops near you" but every other sheet title lowercase or sentence-case drift; body 3 lines with widow | closed — "see shops near you" → sentence case kept, copy shortened to 2 lines |
| M10 | 07 explore | Pin labels collide with basemap road labels ("bakery" over "Westminster Avenue") — no halo | closed — `ui/PlaceBubble.tsx` text halo (bg, 3 px) + map label opacity |
| M11 | 07 explore | Count bubble "2" is 22 pt — hit target < 44 | closed — 32 pt capsule with 44 pt hit slop |
| M12 | 07 explore | Top-right capsule is location + list only; Corner (and the spec) put the bell there; no notifications entry | closed — bell with unread dot in the capsule → `/notifications` |
| M13 | 07b sheet | Shop sheet title Bricolage 22/700 — spec says ≤ 22, never heavy, calm | closed — system 22/600, name wraps to 2 lines max |
| M14 | 07b sheet | "Swipe up for rewards and hours" hint clipped by the peek height (y = 1688) | closed — removed; grabber is the affordance (tap cycles detents) |
| M15 | 07b sheet | Selected pin ring overlaps the blue location dot | closed — user dot drawn under pins (z-order) on web; native marker order unchanged |
| M16 | 07c sheet | Action capsules overflow the screen edge with no fade ("Share" cut) | closed — four actions fit; Mute moved to the overflow row |
| M17 | 07c / 09 | Offer card repeats the shop's own name and logo inside the shop sheet/page | closed — `PromoCard` `hideShop` on shop pages |
| M18 | 09 shop | "2× points" chip on a stamp program ("Two-stamp Tuesdays") — wrong unit | closed — `PromoCard` uses the program's terminology |
| M19 | 09 shop | "See all" right edge at 370 while every right-aligned value ends at 374 | closed — `Section` action has no extra padding |
| M20 | 09b / 11 / 18b | Tour duplicates: "scrolled" and "about" shots identical to the base shot | closed — tour scrolls the real scroll view; 11 shows About |
| M21 | 10 shop points | "10 points per $1 · Points never expire." mixes "pts"/"points" and Title Case mid-line | closed — "10 pts per $1 · points never expire" |
| M22 | 12 shop | Instagram row chevron sits 6 pt below the text centre | closed — `ListRow` chevron centred |
| M23 | 12b join sheet | Consent text and caption say the same thing twice (STOP, unsubscribe, Settings) | closed — caption trimmed to the sender line |
| M24 | 12b join sheet | After join the sheet closes with a toast; no "you're in" moment, no Wallet | closed — success state with check, balance, Wallet button, Done |
| M25 | 13 my card | No "Add to Apple Wallet" button in the web preview and copy was lowercase ("add to apple wallet") — Apple requires the exact phrase | closed — `features/customer/WalletPassButton.tsx`, "Add to Apple Wallet" / "Save to Google Wallet" |
| M26 | 13 my card | Number masked with "•••-••09"; expected "(647) ••• 1009" (S18) | closed |
| M27 | 14 rewards | Segmented control Title Case vs page title lowercase is fine; but Redeem buttons 34 pt tall with no hit slop on web | closed — `Button sm` hit slop applies on web too |
| M28 | 14b rewards | "You need 91 more points" here vs "91 pts to $5 off" in wallet | closed — one phrase: "91 pts to $5 off" |
| M29 | 14c passport | "2 of 5" here vs "2 / 5" in wallet; neighbourhood Title Case | closed — "2 / 5", lowercase place line |
| M30 | 16 redeem code | Status dot uses accent for "waiting" (accent = points only) and the screen has no top close | closed — neutral pulsing dot; close button top-left |
| M31 | 17 activity | Large title 15 pt higher than wallet's (wallet has an empty banner wrapper adding 8 pt) | closed — `Screen` banner wrapper only when the banner renders |
| M32 | 17 activity | Filter chips 34 pt tall, no hit slop | closed — chips 36 pt + 4 pt slop each side |
| M33 | 18 campaign | Trophy icon above the title is decoration (icon-in-space); italic used on a non-place line | closed — icon removed; meta line upright |
| M34 | 19 profile | Phone masked "***-1009" (S18); "Edit" is 15/600 grey, looks disabled | closed — "Edit" in fg |
| M35 | 20 edit profile | Birthday and phone as grey prose under the fields | closed — read-only rows (label + value) |
| M36 | 20b notifications | Not grouped by type, switches teal, "Shops & messages" centred inside a card, "Turn on notifications" grey with no context, "Saved on this device" leaks implementation | closed — rebuilt: grouped native switches on `GET/PUT /v1/me/notification-prefs` |
| M37 | 20c shops & messages | Every row repeats "Offers by text and email: On" | closed — "offers on" / "offers off" / "muted" |
| M38 | 20d privacy | Section hairline touches the paragraph (0 pt gap); delete box tinted; input and button touch (0 gap) | closed — 12 pt rhythm, hairline group, 12 gap |
| M39 | 21 dark explore | Dark pins: bubble bg #161618 on a #0B0B0C map — bubble edge invisible | closed — dark bubble gets a 1 px `line` ring |
| M40 | 21c dark card | No Wallet button (M25) | closed |
| M41 | — | No notifications inbox | closed — `app/notifications.tsx` (new) |

## 2. Mobile — counter and kiosk

| # | Screen | Defect (expected vs actual) | Status |
| --- | --- | --- | --- |
| C1 | 30 sign-in | Email shows "pinecone‑coffee" with widened hyphen (S1) | closed |
| C2 | 31 location picker | Selected shop row fill inset 34 pt from the card edge on the left and right | closed — `counter/select.tsx` row fill spans the card |
| C3 | 31 | Section hairline directly above a bordered card (double line) | closed — `Section rule={false}` for boxed groups |
| C4 | 32 keypad | Header shop name in Bricolage 18 (S5) | closed — system 17/600 |
| C5 | 33 member | "10/10" here, "10 / 10" everywhere else | closed |
| C6 | 33 member | Cooldown reads like a log line ("Nikos got a stamp 2 min ago.") with an alert icon | closed — "Nikos got a stamp 2 min ago. Add another only for a new visit." |
| C7 | 34 success | Static check; hero number jumps; no way to move on except waiting 4 s | closed — check draws in 320 ms, count-up, "Next customer" ghost button |
| C8 | 34 success | "Undo (10)" parenthesised counter | closed — "Undo · 10s" with a shrinking bar |
| C9 | 34b undone | Notice in a bordered card with centred text and a widow ("stamps.") | closed — same layout as success, icon + one line + Next customer |
| C10 | 35b confirm | Confirm line 17/600 headline; reads like a heading | closed — 15 body in fgMuted |
| C11 | 36 redeem success | Title widow "over."; no Next customer | closed |
| C12 | 37b recent | Recent row truncates mid-word ("Redeemed Fr…") | closed — two-line recent rows |
| C13 | 38 today | "Points given" on a stamp program; customer rows show the staff's avatar ("sb") for Nikos | closed — terminology label; leading = customer initials |
| C14 | 38 today | "-10" hyphen (S6), "...1009" mask (S18) | closed |
| C15 | 38a menu | Row heights uneven ("Switch location" no subtitle) | closed — subtitle added |
| C16 | 39 offline award | "Balance updates when you're back online" + "Saved. Will send when you're back online." say the same thing | closed — one line |
| C17 | 39a offline member | Avatar initials of "...1004" render "." | closed — phone glyph avatar |
| C18 | 39a | "Offline · 0 waiting to send" | closed — "Offline · awards save on this phone" |
| C19 | 39b | "Waiting" badge top-aligned against a single-line row | closed — two-line row, badge centred |
| C20 | 40 kiosk | "Bigger text" 13 pt link, 20 pt tall, not on the title baseline | closed — 44 pt capsule |
| C21 | 40a counter settings | "Start kiosk mode" 72 pt next to 44 pt buttons; hairline touches paragraph | closed — one button height, 12 pt rhythm |
| C22 | 40d kiosk result | "9 stamps to Free drink" no period, capital mid-sentence, whole line accent | closed — "9 more for a free drink." in fg, number in accent |
| C23 | tour | counter-today / offline / kiosk steps time out after redeem-code (More button covered by the success panel's recent list) | closed — tour taps Next customer first |

## 3. Web — customer pass (`apps/web/src/app/(pass)`)

| # | Screen | Defect | Status |
| --- | --- | --- | --- |
| W1 | wallet | "Wallet" Title Case; app says "wallet" (the voice is lowercase page titles) | closed — `Wallet.tsx` |
| W2 | wallet | Shop rows are bordered cards; app and spec use a plain list with hairlines | closed |
| W3 | wallet | Avatars "PC" uppercase Inter; app uses lowercase Bricolage initials | closed — `components/ui/ShopLogo.tsx` |
| W4 | wallet / settings / shop | Section labels at x=20 while cards start at x=16 (4 px off the edge) | closed — `components/ui/Section` label padding 0 |
| W5 | wallet | Balance stacked (S11) | closed |
| W6 | wallet card sheet | "My card" Title Case; name centred above a left-aligned sheet title | closed |
| W7 | wallet shop sheet | Italic kind on its own line under the avatar (x=20) instead of under the name (x=72) | closed |
| W8 | settings | No notification settings; "Save" is an outline button in a card while the rest of the product uses black primary | closed — Notifications section on `/me` Settings (prefs API), black Save |
| W9 | settings | "Get offers from Pinecone Coffee Co." widow "Co." | closed — label "Offers by text and email" under the shop header |
| W10 | join | "Join in 30 seconds" Title Case; accent dot used as a bullet | closed — lowercase display title, neutral check |
| W11 | join | +1 prefix 48 tall next to a 50 tall input | closed — both 48 |
| W12 | join details | Consent caption prints the raw "+14165553000" | closed — formatted phone |
| W13 | joined | "Show this to staff" grey box containing a white card (box in box) | closed — single hairline card |
| W14 | joined | "Also on your card nearby" cards have different heights and cut names mid-word | closed — fixed-height rows, two-line clamp |
| W15 | shop | Sticky join bar overlaps "No app needed…" at the bottom of the page | closed — page bottom padding = bar height |
| W16 | shop | "Closed" Title Case; app "closed" | closed |
| W17 | shop | Hours "7 am – 6 pm" (spaced en dash) vs app "7:30 am–5 pm" | closed — one format |
| W18 | map | Labels truncate mid-word ("Hearth & Crumb Bak…") | closed — wrap to 2 lines like the app |
| W19 | map | "open now" chip overlaps a pin | closed — chip row is a pin obstacle (padding) |
| W20 | me signed out | Two helper lines, one centred one left | closed — one left-aligned line |
| W21 | dark home | Phone mockup chips stay white while the search pill goes dark | closed — mockup is fixed light (a picture of the app) |

## 4. Web — marketing (`apps/web/src/app/(marketing)`)

| # | Screen | Defect | Status |
| --- | --- | --- | --- |
| K1 | home hero | Display tracking ≈ −0.04 em — letters touch ("regulars"); spec −0.01 em | closed — `.display` tracking −0.01 em, hero −0.02 em max |
| K2 | home hero | Back phone mockup is the v1 wallet (tabs, "Show my card", bordered cards, "PI"/"LL" uppercase avatars) | closed — mockup = v2 wallet list |
| K3 | home hero | "phone / computer r…" cut by the phone frame | closed — kind labels from `placeKind()` (short) |
| K4 | home hero | Toast floats below the phone, overlapping the frame at 390 | closed — toast docked inside the phone bottom |
| K5 | home stats | Columns 450 / 378 / 452 px — unequal | closed — `grid-cols-3` equal |
| K6 | home program | "Welcome bonus: 1 stamps." | closed — pluralised |
| K7 | home program | "10 stamps = Free drink" capital mid-phrase | closed |
| K8 | home POS | "Webhooks & API" 13 px while other tiles 17 px | closed |
| K9 | home compare (390) | Table cells wrap "$49–\n299", "Up to\n5%" | closed — stacked rows under 640 px |
| K10 | home | Counter mock "×" for clear vs product "Clear" | closed |
| K11 | pricing | H1 Title Case sentence; every other marketing H1 lowercase | closed |
| K12 | home / pricing | Section vertical rhythm 96–200 px | closed — sections 96 (desktop) / 64 (phone) |

## 5. Dashboard (`apps/web/src/app/(dashboard|rep|admin|bia)`)

| # | Screen | Defect | Status |
| --- | --- | --- | --- |
| D1 | home | "1 visits · 7 given · 2 new" — plural bug | closed |
| D2 | home | KPI "Rewards redeemed" has no delta line, so the four stats have different heights | closed — "—" placeholder line keeps the row height |
| D3 | home | "More with Plus — promos… · coming soon · Notify me" mixes an em dash and middots | closed — "Promos, marketing and POS sync are coming with Plus · Notify me" |
| D4 | home / counter | "-1 stamp" hyphen (S6) | closed |
| D5 | customer panel | "Reward ready" badge and "Reward ready" line both shown | closed — badge only |
| D6 | customer panel | Undo icon buttons 14 px with 20 px targets | closed — 32 px targets |
| D7 | counter | Recent numbers misaligned: rows with Undo end at x=1350, rows without at x=1407 | closed — fixed trailing column |
| D8 | counter | "Robin · Undone" still shows "+1" unstruck | closed — struck through, muted |
| D9 | counter | "Next customer" indented 16 px inside the card and looks like text | closed — secondary button, Esc hint |
| D10 | counter | No visible offline queue / retry on the web counter | closed — online/offline strip + queued awards retried with the same idempotency key |
| D11 | counter | Errors (cooldown, insufficient, expired code) use raw API messages | closed — `lib/dashboard/counter.ts counterErrorMessage()` |
| D12 | counter | No success animation or count-up | closed — check + count-up (≤ 400 ms, reduce-motion off) |
| D13 | program | Preview row "Customers get 1 stamp …" truncated | closed — preview shows progress line |
| D14 | reports | "Compare to previous period" checkbox 10 px | closed — 16 px checkbox |
| D15 | locked promos | Page header 34 px lower than every other page | closed — `FeatureTeaser` uses the page header |
| D16 | admin network | "2+ shop custom…" truncated, "70 / 30 %" spacing | closed |
| D17 | rep / admin shell | Role badges as coloured dots (red "Admin" reads as an error) | closed — neutral text badge |
| D18 | 390 dashboard | KPI deltas lose "vs previous" context on phones | closed — "+65% vs last 30 days" wraps under |

## 6. Brand assets

| # | Asset | Defect | Status |
| --- | --- | --- | --- |
| B1 | OG images | Rendered in the ImageResponse default sans, not Bricolage | closed — Bricolage 800 loaded from `packages/design-tokens/assets/fonts` |
| B2 | splash | Tile corner radius 19 % vs the mark's 25 % | closed — re-rendered from `logo-mark.svg` |
| B3 | app icon / adaptive / favicon / notification icon | Checked against `logo-mark.svg` | closed (n/a) — same geometry, iOS safe-zone scale |

---

## Before / after

Before: `/tmp` copies are not kept in the repo; the "before" column is the previous commit's screenshots
(`git show HEAD:apps/mobile/e2e/screenshots/<name>.png`). After: the files at the same paths now.

| Area | Look at first |
| --- | --- |
| Explore + bell + sheet | `apps/mobile/e2e/screenshots/07-explore-map.png`, `07b-explore-shop-sheet.png`, `22-notifications.png`, `22b-notification-settings.png` |
| Wallet balances | `apps/mobile/e2e/screenshots/06-wallet.png`, `06c-wallet-progress.png` |
| My card + Wallet button | `apps/mobile/e2e/screenshots/13-my-card.png`, `12c-join-success.png` |
| Counter | `apps/mobile/e2e/screenshots/33-counter-member-found.png`, `34-counter-award-success-undo.png`, `39a-counter-offline-member.png` |
| Web pass | `apps/web/e2e/screenshots/v2/wallet-390.png`, `wallet-settings-390.png`, `shop-390.png` |
| Marketing | `apps/web/e2e/screenshots/v2/home-1280.png`, `home-390.png` |
| Dashboard | `apps/web/e2e/screenshots/v2/dashboard/01-home-1440.png`, `06-counter-member-1440.png` |
