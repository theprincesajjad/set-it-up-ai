# Expo web screenshot tour

Renders the app with react-native-web and drives it with Playwright (Chromium from `PLAYWRIGHT_BROWSERS_PATH`; never run `playwright install`) at an iPhone-sized viewport (390x844 @2x). Screenshots go to `e2e/screenshots/` (`01-…` onboarding, `05-…` first explore / empty wallet, `06-…` wallet, `06d`/`06e` discover, `07-…` explore map + shop sheet (`07b` member sheet, `07f` join sheet), `08-…` list, `09-…`/`10-…`/`11-…` shop page, `13` my card, `17` activity, `17b` points history … `21-…` dark mode, `22` the bell's inbox, `30-…` counter mode (`33`/`33b` member found, +2), `40-…` kiosk). Compare them with the design canvas artboards in `docs/design/canvas/` (`E2E_OUT=<dir>` writes elsewhere while iterating).

Rerun (from the repo root, fresh seed so the OTP limit of 5 codes per phone per hour starts at zero):

```bash
mkdir -p apps/api/.pglite && rm -rf apps/api/.pglite/mobile-e2e
DATABASE_URL=pglite://./.pglite/mobile-e2e PORT=4300 pnpm --filter @ll/api seed
DATABASE_URL=pglite://./.pglite/mobile-e2e PORT=4300 pnpm --filter @ll/api start     # other terminal
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:4300 pnpm export:web && pnpm e2e:web   # or: node e2e/tour.mjs counter  (steps starting with "counter")
```

- `tour.mjs` serves `dist-web/` itself (`e2e/serve.mjs`, port `E2E_WEB_PORT`, default 8300). `E2E_API_URL` (default `http://localhost:4300`) and `E2E_CUSTOMER_PHONE` (default `+16475551009`, a seeded customer with four shops) are optional.
- Setup through the API: an admin override turns on order-ahead for Pinecone Coffee (shows the `features` entry point), and a live Roncesvalles Passport is created with two visits. Pinecone's stamp cooldown is set to 0 and the customer's card is topped up to two free drinks (one redeemed in the app, one at the counter), because the seed's balances are relative to today.
- `node e2e/tour.mjs customer-sign-in,explore` runs several steps (comma-separated prefixes). If another API already holds port 4300, use another port for both the API and `EXPO_PUBLIC_API_URL` / `E2E_API_URL` (and `E2E_WEB_PORT`).
- `06c-wallet-progress` signs in the first seeded customer (from `+16475551000`) with shops but no reward ready, to show the closest-reward hero.
- Map tiles (OpenFreeMap) are fetched with `curl` (machine proxy + CA bundle) and handed to Chromium via `page.route`, cached in the OS temp dir. The "explore-list" step blocks tiles to show the list fallback.
- The tour mutates the database (awards, a redemption, a kiosk check-in). Reseed before rerunning.
