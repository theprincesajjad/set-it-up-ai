# Mobile app (`apps/mobile`, `@ll/mobile`)

One Expo app with two modes:

- **Customer app**: onboarding (phone OTP), Home, Explore map, My card (sheet), Activity, Profile, shop detail, rewards and redeem, passport campaigns, referrals, Wallet passes, push, settings (consent, mute, export, delete), and Phase 2 order-ahead and repair tickets.
- **Staff counter mode**: staff sign-in (email + password or email code), merchant + location picker, optional shared-device PIN switcher, keypad / QR / last-4 lookup, award in ≤ 2 taps with a 10-second undo, redeem, redeem-code verification, Today, offline queue, and a customer-facing kiosk.

Specs: `docs/design/screens/customer-mobile.md`, `docs/design/screens/staff-counter.md`, `docs/design/references.md` (look and feel), `docs/design/system.md` (components), `docs/design/ux-copy.md` (copy). API contract: `packages/shared/src/api/*` and `docs/engineering/api/*.md`.

## Stack

| | |
| --- | --- |
| Expo SDK | 58 (`expo@~58.0.17`, React Native 0.88, React 19.3, TypeScript 6, strict + `noUncheckedIndexedAccess`) |
| Navigation | expo-router (file routes in `src/app`), JS bottom tabs with a raised centre "My card" button, native-stack sheets |
| Server state | TanStack Query, persisted to AsyncStorage so screens show cached data offline |
| Tokens | `@ll/design-tokens` (colours, type, spacing, touch targets). Figtree + Fraunces via `@expo-google-fonts/*` |
| Icons | `lucide-react-native`, imported one file per icon in `src/ui/icons.ts` |
| Native modules | expo-secure-store, expo-camera, expo-brightness, expo-keep-awake, expo-notifications, expo-location, expo-haptics, expo-file-system, expo-sharing, react-native-maps, @react-native-community/netinfo, @react-native-async-storage/async-storage |

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
- A reducer drives keypad → lookup → customer panel → success. Ten digits auto-search, and four digits offer "Search last 4".
- Per-dollar programs use POS-style cents entry. The button label updates live ("Award 24 pts (2x today)"). A no-earn category shows "Record visit (0 pts)".
- Success appears immediately with the estimated balance and is replaced by the server's result. A 10-second Undo cancels a queued item or calls `/transactions/:id/undo`.

**Feature flags (Phase 2).**
- There is no customer feature-flag endpoint, so the app shows a Phase 2 entry point only when its API answers.
  - "Order ahead" appears on a shop when `GET /v1/public/shops/:slug/menu` succeeds (a `402 feature_locked` hides it).
  - "Orders & tickets" appears when `/v1/me/orders` or `/v1/me/tickets` returns items.

**Consent (CASL).** Consent checkboxes are never pre-checked. The per-shop text the API supplies (`consentText`, or `customerApi.marketingConsentText`) is shown and sent back unchanged.

**Brightness.** My card, the redeem code, the full-screen QR and discount cards set brightness to max and keep the screen awake while focused. They restore the previous brightness on blur or backgrounding.

## Quality gates

```bash
pnpm --filter @ll/mobile typecheck     # tsc --noEmit (also type-checks the @ll/shared and @ll/design-tokens sources the app imports)
pnpm --filter @ll/mobile test          # vitest: API client, offline queue, phone formatting, award flow, explore/perks, cart, feed, activity
cd apps/mobile && npx expo export --platform android   # JS bundle (also --platform ios)
cd apps/mobile && npx expo-doctor
```

Unit tests cover the pure modules in `src/lib` and `src/api` and run in plain Node. There is no simulator and no jest-expo. Screens are verified by bundling and by hand on a simulator.

## Known gaps

- **In-app card payment.** Orders use "pay at pickup". Quote deposits and invoices open the web pay page (`approvalUrl` / `payUrl`). Native Stripe (`@stripe/stripe-react-native`) is not wired in yet.
- **No API yet.** Platform news consent (stored on the device only), the notifications inbox, notification category preferences (stored on the device only), and phone-number change.
- **Neighbourhood perk progress** is derived from the wallet (distinct shops visited inside the perk window), because the API exposes perk rules but not per-member progress.
- **Counter quantity chips (+2/+3)** are not shown. `/award` awards one visit per call, and repeat calls hit the visit cooldown.
- **Kiosk.** "Pending check-in → staff taps Add stamp" needs an API that doesn't exist yet, so per-dollar check-ins only enrol. The kiosk check-in body has no name field, so the kiosk doesn't ask for one.
- **Member cache.** The last 200 members seen on a counter device are cached in AsyncStorage (names and masked phones only), not encrypted. They are cleared on sign-out.
- **SMS autofill.** OTP autofill relies on iOS `oneTimeCode` and Android autofill. The Android SMS Retriever API is not integrated.
