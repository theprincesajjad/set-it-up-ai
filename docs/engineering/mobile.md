# Mobile app (`apps/mobile`, `@ll/mobile`)

One Expo app with two modes:

- **Customer app**: onboarding (phone OTP), Explore map (the home tab), Wallet, My card (sheet), Activity, Profile, shop sheet / page, rewards and redeem, passport campaigns, referrals, Wallet passes, push, settings (consent, mute, export, delete), and Phase 2 order-ahead and repair tickets.
- **Staff counter mode**: staff sign-in (email + password or email code), merchant + location picker, optional shared-device PIN switcher, keypad / QR / last-4 lookup, award in ≤ 2 taps with a 10-second undo, redeem, redeem-code verification, Today, offline queue, and a customer-facing kiosk.

Look and feel: **`docs/design/foundations.md` (v2, built from Corner) wins over everything else**; see "Design system v2" below. Specs: `docs/design/screens/customer-mobile.md`, `docs/design/screens/staff-counter.md`, `docs/design/references.md` (look and feel), `docs/design/system.md` (components), `docs/design/ux-copy.md` (copy). API contract: `packages/shared/src/api/*` and `docs/engineering/api/*.md`.

## Stack

| | |
| --- | --- |
| Expo SDK | 58 (`expo@~58.0.17`, React Native 0.88, React 19.3, TypeScript 6, strict + `noUncheckedIndexedAccess`) |
| Navigation | expo-router (file routes in `src/app`), JS tabs with a custom frosted capsule tab bar (map · discover · wallet · avatar → activity) and a separate round black 60 pt card button to its right, native-stack sheets |
| Server state | TanStack Query, persisted to AsyncStorage so screens show cached data offline |
| Tokens | `@ll/design-tokens` v2 (colours, type, radii, `shadows.float`, blur, springs, map style, category PNGs). Body = system font; display = Bricolage Grotesque 700/800 via `@expo-google-fonts/bricolage-grotesque` |
| Icons | `lucide-react-native`, imported one file per icon in `src/ui/icons.ts` |
| Web (QA preview) | react-native-web + react-dom + @expo/metro-runtime (`web.output: "single"`); maplibre-gl map on web only |
| Native modules | expo-blur (tab bar), expo-secure-store, expo-camera, expo-brightness, expo-keep-awake, expo-notifications, expo-location, expo-haptics, expo-file-system, expo-sharing, react-native-maps, @react-native-community/netinfo, @react-native-async-storage/async-storage |

## Layout

```
apps/mobile
  app.config.ts        Expo config (name from packages/shared/src/brand.ts, ids, permissions, plugins)
  eas.json             EAS build profiles
  metro.config.js      monorepo + .js→.ts resolution for @ll/* packages
  src/app/             routes: (auth)/ (tabs)/ counter/ shop/ orders/ tickets/ ... card.tsx (sheet)
  src/api/             client.ts (fetch, tokens, refresh rotation, errors), endpoints.ts (one function per endpoint)
  src/lib/             pure logic, unit tested: phone, award flow, offline queue, explore, perks, cart, feed, activity
  src/state/           session, counter (queue + PIN staff), storage, query client, network status
  src/features/        screen helpers (customer queries/sheets/map, counter components, push, brightness)
  src/ui/              component library; names and props follow docs/design/system.md
  src/copy/en-CA.ts    copy keys from ux-copy.md (fr-CA can be added with the same shape)
```

`system.md` names `apps/mobile/src/components/ui/` for components; this app keeps them in `src/ui/` (same component names and props).

## Run it against the local API

```bash
pnpm install                           # from the repo root
pnpm dev:api                           # API on http://localhost:4000 (another terminal)
pnpm --filter @ll/mobile start         # Expo dev server; press i (iOS simulator) or a (Android emulator)
```

`EXPO_PUBLIC_API_URL` sets the API base URL. The default is `http://localhost:4000`.

| Where the app runs | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| iOS simulator on the same Mac | `http://localhost:4000` (default) |
| Android emulator | `http://10.0.2.2:4000` |
| Physical phone on the same Wi-Fi | `http://<your computer's LAN IP>:4000` |

Put it in `apps/mobile/.env.local` (see `.env.example`), or prefix the command: `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000 pnpm --filter @ll/mobile android`. Restart with `--clear` after changing it.

**Expo Go vs a development build.** Every native module the app uses ships in Expo Go, so `start` + Expo Go works for most flows. Push tokens need an EAS project id, and Android maps need a Google Maps key, so for those use a dev build: `npx expo run:ios` / `npx expo run:android`, or `eas build --profile development`.

**Dev sign-in.** The non-production API returns `devCode` from `POST /v1/auth/otp/start` and `/email-otp/start`. Dev builds (`__DEV__`) auto-fill and submit it, so you can sign in on a simulator without SMS. Release builds never read `devCode`.

**Counter mode.** On Welcome, tap "I'm a shop owner or staff". Sign in with a seeded staff email, pick the shop and location, and optionally turn on "Use this device as the shop's counter" (PIN switcher). Signed-in customers who are also staff get "Counter mode" in Profile.

### Optional env vars

| Var | Used by | Effect |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | bundle | API base URL |
| `EXPO_PUBLIC_DISABLE_MAPS=1` | bundle | Force the Explore list view |
| `APP_VARIANT` | app.config.ts | `development` / `preview` / `production`: app name suffix and bundle id suffix. Set by eas.json. |
| `EAS_PROJECT_ID` | app.config.ts | Written to `extra.eas.projectId`; needed for Expo push tokens |
| `GOOGLE_MAPS_API_KEY` | app.config.ts | Android Google Maps key. Without it, Explore uses the list on Android. iOS uses Apple Maps and needs no key. |

## App identifiers (placeholders)

| Variant | iOS bundle id / Android package | Name |
| --- | --- | --- |
| production | `ca.localloyalty.app` | `BRAND.name` |
| preview | `ca.localloyalty.app.preview` | `BRAND.name (Preview)` |
| development | `ca.localloyalty.app.dev` | `BRAND.name (Dev)` |

URL scheme `ll://` (deep links `ll://shop/<slug>`, `ll://card`, `ll://ticket/<id>`, `ll://quote/<token>`, `ll://order/<id>`). Universal links are configured for the placeholder host `local.example` (`/s/`, `/q/`, `/i/`, `/j/`). Replace it with the real web domain and host the AASA / assetlinks files before launch.

## EAS builds (`eas.json`)

| Profile | Distribution | Notes |
| --- | --- | --- |
| `development` | internal; iOS simulator build, Android APK | `APP_VARIANT=development`, API `http://10.0.2.2:4000` |
| `preview` | internal APK / ad-hoc | `APP_VARIANT=preview`, staging API URL placeholder, channel `preview` |
| `production` | store | `APP_VARIANT=production`, auto-increment, channel `production` |

```bash
npx eas-cli@latest init                # once: creates the EAS project; export EAS_PROJECT_ID
npx eas-cli@latest build --profile preview --platform android
```

EAS builds from the monorepo root with pnpm 10 (pinned in `eas.json`). Set `GOOGLE_MAPS_API_KEY` and `EAS_PROJECT_ID` as EAS environment variables. Replace `submit.production.ios.ascAppId` before submitting.

## pnpm workspaces and Metro

- pnpm's default isolated `node_modules` works with SDK 58, so no `nodeLinker: hoisted` is needed, and the shared `pnpm-workspace.yaml` is unchanged. If a future native library breaks under isolated installs, switching the root to `nodeLinker: hoisted` is the documented fallback. It affects every package, so coordinate before you change it.
- `expo/metro-config` detects the workspace. `metro.config.js` also checks that the monorepo root is in `watchFolders` and that both `node_modules` folders are in `nodeModulesPaths`.
- `@ll/shared` and `@ll/design-tokens` publish TypeScript source with ESM `./x.js` specifiers. `metro.config.js` retries those imports without the `.js` extension, so Metro resolves `x.ts`.
- `react-dom` is pinned to `19.3.0` in the app so pnpm doesn't auto-install a mismatched peer.
- The app uses AsyncStorage rather than `expo-sqlite`. drizzle-orm (used by `apps/api` and `packages/db`) has an optional peer on `expo-sqlite`, and installing it would have pulled React Native into the API's dependency graph.

## Expo web (QA preview and screenshots)

The app also renders in a browser through react-native-web. This is a QA target for screenshots and design review, not a product: customers without the app use the web pass in `apps/web`.

```bash
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:4300 pnpm export:web   # → dist-web/ (gitignored)
pnpm e2e:web                                                                  # Playwright tour → e2e/screenshots/
```

`e2e/README.md` has the full recipe (fresh PGlite seed on port 4300, the setup the tour does through the API, and how map tiles reach the sandboxed browser).

Native-only modules have `.web` twins that Metro picks for web, so native bundles are unchanged:

| Module | Web twin | Behaviour on web |
| --- | --- | --- |
| `state/secureStore.ts` (expo-secure-store) | `secureStore.web.ts` | Tokens in localStorage |
| `features/customer/MapView.tsx` (react-native-maps) | `MapView.web.tsx` | maplibre-gl on OpenFreeMap Positron restyled with `cornerMapStyle(base, scheme)` from @ll/design-tokens; the same `<ShopPin>` views portalled into DOM markers; style load failure → list fallback |
| `features/customer/brightness.ts` (expo-brightness, keep-awake) | `brightness.web.ts` | No-op |
| `features/push.ts` (expo-notifications) | `push.web.ts` | `registerForPush()` → `"unavailable"`; deep links shared via `features/deepLinks.ts` |
| `state/network.ts` (NetInfo) | `network.web.ts` | Browser `online` / `offline` events |
| `theme/webStyles.ts` | `webStyles.web.ts` | Drops browser focus outlines (fields draw their own; modal/canvas rings in screenshots) |

expo-camera, expo-location, expo-haptics and AsyncStorage have their own web implementations. Differences from a phone: no safe-area insets or status bar, the card "sheet" (`formSheet`) is a full page, no Wallet buttons, no camera scan in headless Chromium, and the `Date` header is hidden from cross-origin fetches (the redeem countdown falls back to the code's `createdAt`).

## Architecture notes

**API client** (`src/api/client.ts`)
- Sends the bearer token from secure storage. On a `401` it makes a single-flight `POST /v1/auth/refresh` and stores the rotated pair, because refresh tokens are single use and a replay revokes every session. It then retries once. If the refresh fails, it clears tokens and opens the "Sign in again" sheet with the phone pre-filled.
- Counter calls (`auth: "staff"`) use the staff PIN token when one is set. That token has no refresh, so a `401` means "ask for the PIN again".
- Every error becomes an `ApiError` with `{ status, code, message, details }` from the error envelope. Network failures and timeouts become `status 0`, `code "network"`.

**Offline queue** (`src/lib/offlineQueue.ts`)
- Awards made offline, or that fail with a retryable error, are stored in AsyncStorage. Each one keeps the idempotency key generated for the tap.
- `flush` replays due items per merchant, in tap order, in chunks of 100, through `POST /v1/merchants/:id/counter/sync`.
  - `ok` / `duplicate`: removed.
  - `internal`: retried with 2, 5, 15, 30 s backoff, then every 60 s.
  - Any other error is final and shown as "Needs attention".
- The queue flushes when the device comes back online, when the app returns to the foreground, and on "Retry now". The banner shows "Offline · N waiting to send" and "Back online · N sent", and turns danger when items are more than 24 h old or more than 50 are waiting.

**Award flow** (`src/lib/award.ts`)
- A reducer drives keypad → lookup → customer panel → success. Ten digits auto-search, and four digits offer "Search last 4". With one shop the location picker preselects it.
- Stamp / visit programs show `+2` / `+3` chips next to the main button: one tap awards `quantity` items as one visit (`POST .../counter/award` and offline `sync` events carry `quantity`, 1–10). Per-dollar programs have none.
- The success title is what staff added ("Added 2 stamps"); network / passport bonuses (`extraPoints`) are listed under it ("Plus 50 pts bonus"). Past a full stamp card the hero reads "14 stamps" instead of "14 / 10".
- Per-dollar programs use POS-style cents entry. The button label updates live ("Award 24 pts (2x today)"). A no-earn category shows "Record visit (0 pts)".
- Success appears immediately with the estimated balance and is replaced by the server's result. A 10-second Undo cancels a queued item or calls `/transactions/:id/undo`.

**Feature flags (Phase 2).** `features { orderAhead, pickupSlots, serviceTickets, inAppPayments }` on `GET /v1/public/shops/:slug` and on each `GET /v1/me/memberships` item decide the entry points, with no probing for `402`s.
- Shop detail shows "Order ahead" when `features.orderAhead`, and "My tickets here" when `features.serviceTickets` (or the member already has tickets there).
- `usePhase2()` fetches `/v1/me/orders` / `/v1/me/tickets` only when one of my shops has the matching flag; "Orders & tickets" (Profile) and Home "In progress" follow it.

**Wallet summary (was the Home hero).** Points and stamps are different units, so no screen adds balances together (`lib/hero.ts`). Under the large title "wallet" one number + line: rewards ready now ("3 rewards ready · across 2 shops"); with none ready the closest reward in that shop's unit ("2 stamps to a free pastry · at Hearth & Crumb Bakery") with a thin accent bar; with nothing to work toward the shop count. My card shows rewards ready (or the shop count). Shop rows keep their own unit.

**Kiosk on a phone.** Under 768 px wide the kiosk uses a compact header (56 px logo, title beside it) and sizes keys to the space left, between 72 px (the counter keypad minimum) and 88 px. The keypad and "Check in" fit on 390x844, and it scrolls only if even 72 px keys don't fit. The tablet layout is unchanged.

**Shop avatars.** Round. Logo if there is one; else lowercase initials in Bricolage on the merchant's `brandColor` (the only place a brand colour appears); else the category object (cup, croissant…) on `bgSubtle`. No cover heroes or colour washes.

**Social proof.** `memberCount` (null below 10) shows as "39 neighbours are members" in the shop's About tab and in the "Earn here" card for non-members.

**Redeem countdown.** The code screen counts down to `RedemptionDto.expiresAt` on the server's clock (`lib/serverClock.ts`: offset from each response's `Date` header, else from the just-issued code's `createdAt`). `expiresAt: null` = no countdown. When it hits zero the screen shows "This code expired. Your points weren't used." (the API's `redemptions.expire` job refunds).

**Consent (CASL).** Consent checkboxes are never pre-checked. The per-shop text the API supplies (`consentText`, or `customerApi.marketingConsentText`) is shown and sent back unchanged.

**Brightness.** My card, the redeem code, the full-screen QR and discount cards set brightness to max and keep the screen awake while focused. They restore the previous brightness on blur or backgrounding.

## Design system v2 (foundations.md)

The app was rebuilt (not recoloured) on `docs/design/foundations.md`. Rules the code follows:

- **Type.** `typo(name)` in `src/theme` returns the system font + `fontWeight` for UI/body styles (`familyForWeight` returns `undefined`), and a Bricolage family for display styles (`largeTitle`, `displayNumber`, `mapLabel`, `categoryLabel`). `placeSubtitle` is the only italic. Page titles are lowercase (`Screen` lowercases them; `titleCase="as-is"` for shop names).
- **Colour.** Monochrome; primary buttons are black (`fg`). `accent` / `accentText` only for points: balances, stamps, "reward ready", points awarded at the counter. Status = dot + word (`StatusDot`, `Badge`). No tinted cards, no icon-in-a-circle.
- **Depth.** Cards on white get a hairline (`Card`); `shadows.float` only for map chrome, sheets, toasts, the tab bar. Frosting (BlurView + `colors.chrome`) only on the tab bar (Android: near-opaque fill, no blur target).
- **Navigation.** Design canvas (`docs/design/canvas/*.dc.html`) is the source of truth. `(tabs)`: `map` (first tab, `/` redirects here), `discover`, `wallet`, `activity` (the avatar), and `you` (profile; in the stack but not in the bar, opened from Activity's top-left button). The tab bar (`app/(tabs)/_layout.tsx`) is a 60 pt frosted capsule 16 pt from each side and 26 pt above the bottom, with the black 60 pt "my card" circle beside it (Corner's separate "+"), which opens `/card`. `useHideTabBar()` (`features/tabBar.ts`) slides it away while the Explore shop sheet is up. `/home` redirects to `/wallet` for old links. The points ledger moved from the Activity tab to `/history` ("your visits · See all" on a shop, "Points history" under Activity).
- **Discover** (`app/(tabs)/discover.tsx`, `lib/discover.ts`): black 340 pt hero for the live neighbourhood campaign (`/v1/me/campaigns`) with floating category objects, lowercase Bricolage headline and an accent progress bar; chips (`for you ▾` = for you / nearest / my shops, then categories); a drawn "near you" card (the two nearest shops around the location dot) with an "open map" pill; horizontal rows per category ("coffee on roncesvalles": 168 × 184 tiles, "reward ready" pill from the wallet). Network shops + wallet only, no upgrade prompts.
- **Activity** (`features/customer/InboxScreen.tsx`): the notifications inbox as the canvas Inbox: lowercase title, "N new · Mark all read", today / this week / earlier, 40 pt shop avatars (the star object for the passport), accent unread dot. `/notifications` is the same screen pushed with a back button (the map bell).
- **Explore.** Full-bleed Corner map (`googleMapStyle` on Android, `mutedStandard` + no POIs on iOS, `cornerMapStyle` on web). Top-left 44 pt search circle; top-right grouped capsule (neighbourhood short name in Bricolage 800 ▾ → picker with "Show as a list", hairline divider, bell with an accent unread dot); 36 pt filter capsules `my shops ▾` (native action sheet: all / mine / new) · `● open now` · `rewards ready` (only when one is ready); category rail (46 pt white circles, 30 pt objects, 12 pt lowercase Bricolage, selected = 2 pt black ring) over a white fade; black 44 pt recenter circle. While a shop sheet is up the chrome is replaced by one round back button. Filters frame the remaining shops (`fit`). Pins: `PlaceBubble` (36 pt white bubble + 24 pt object or logo, lowercase name in Bricolage 700 13 with a white halo, one italic 11 pt subtitle from `pinSubtitle`: "5 / 8 stamps", "reward ready" in accentText upright semibold, or the lowercase kind of place; the selected pin is the bare 46 pt ringed bubble). Labels sit right of the bubble, or left when the right is taken (`labelPlanSides`); clusters are a black 24 pt count capsule. `pinPlan` (pure, tested) treats floating chrome as an obstacle for pins too (no bubble under the top controls, rail/tab bar, recenter button or sheet), folds bubbles closer than 44 pt into a black count capsule (tap = zoom to them), and places at most 8 non-overlapping labels by priority selected > reward ready > my shop > open now > nearest; the rest show the bare bubble. The camera keeps pins clear of chrome with map padding (top ≥ 150, bottom ≥ 200), and a soft bg→transparent fade sits behind the rail and tab bar. Long names wrap to two lines rather than cut mid-word.
- **Shop.** `features/customer/ShopBody.tsx` is one column used by the Explore sheet (`DetentSheet`, 592 pt peek → full height) and `/shop/[slug]`, as the canvas ShopSheet: 56 pt avatar, Bricolage 700 22 name, italic "kind · address", open dot + "until 6 pm · 140 m · N neighbours are members", a bordered stamp card ("10 / 10 stamps" in accent, a 10-column grid whose last slot is the black gift; points programs: balance + thin accent bar), four grey action tiles, rewards with hairlines ("ready" in accentText is the in-app redeem button, else "N to go"), then order/services and offers only when flags / API data say so, your visits, about. Members get a pinned black "show my card to redeem" (`ShopCardCta`).
- **Paid features.** Free = loyalty + reports. Promos, discount cards, referrals, VIP etc. render only when the API returns them or the shop's `features` flags are on (`features.promos`, `features.referrals`…). Customers never see upgrade prompts.
- **Native details.** `ui/haptics.ts`: selection on tabs, capsules and keypad; light impact on primary buttons; success on award / redeem / join / claim; warning on undo. iOS keeps the system switch; large titles collapse into the bar (`Screen largeTitle`); `ConfirmDialog` stacks like an action sheet. Dark mode follows the OS (counter/kiosk default light).
- **Brand assets.** `ui/Logo.tsx` = the four-corners mark (`apps/web/public/brand/logo-mark.svg`, inverse in dark). `assets/icon.png`, `adaptive-icon.png` (on `#0B0B0C`), `splash-icon.png` / `splash-icon-dark.png`, `notification-icon.png` are rendered from those SVGs with sharp.

## Quality gates

```bash
pnpm --filter @ll/mobile typecheck     # tsc --noEmit (also type-checks the @ll/shared and @ll/design-tokens sources the app imports)
pnpm --filter @ll/mobile test          # vitest: API client, offline queue, phone formatting, award flow, explore/perks, cart, feed, activity
cd apps/mobile && npx expo export --platform android   # JS bundle (also --platform ios)
cd apps/mobile && npx expo-doctor                       # @types/react-dom is excluded (pinned to 19.3.0 with react-dom)
```

Unit tests cover the pure modules in `src/lib` (incl. `explore.ts`: filters, pin subtitles, label collision) and `src/api` and run in plain Node. There is no simulator and no jest-expo. Screens are verified by the Expo web screenshot tour (`pnpm e2e:web`, see above) and by hand on a simulator.

## Known gaps

- **Web preview only.** Expo web is for QA; native-only behaviour (brightness, push, camera scan, Wallet, safe areas, sheets) is checked on a simulator.
- **In-app card payment.** Orders use "pay at pickup". Quote deposits and invoices open the web pay page (`approvalUrl` / `payUrl`). Native Stripe (`@stripe/stripe-react-native`) is not wired in yet.
- **No API yet.** Platform news consent (stored on the device only), the notifications inbox, notification category preferences (stored on the device only), and phone-number change.
- **Neighbourhood perk progress** is derived from the wallet (distinct shops visited inside the perk window), because the API exposes perk rules but not per-member progress.
- **Kiosk.** "Pending check-in → staff taps Add stamp" needs an API that doesn't exist yet, so per-dollar check-ins only enrol. The kiosk check-in body has no name field, so the kiosk doesn't ask for one.
- **Member cache.** The last 200 members seen on a counter device are cached in AsyncStorage (names and masked phones only), not encrypted. They are cleared on sign-out.
- **SMS autofill.** OTP autofill relies on iOS `oneTimeCode` and Android autofill. The Android SMS Retriever API is not integrated.

## Class studios

`apps/mobile/src/app/classes/` holds the customer class screens (fitness frames 05 to 08): `[slug].tsx` the schedule with the booking sheet, `passes.tsx` passes, membership, freeze, change card and cancel, `join/[productId].tsx` the agreement before the card. Pure logic is in `src/lib/classes.ts` (tests in `classes.test.ts`); data hooks in `src/features/classes/queries.ts`; the shop screen shows the entry row when `features.classes` is on. All strings are the `cl.ui.*` keys the web pages use plus `cl.app.*`.
