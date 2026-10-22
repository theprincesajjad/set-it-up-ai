# Expo web screenshot tour

Renders the app with react-native-web and drives it with Playwright (Chromium from `PLAYWRIGHT_BROWSERS_PATH`; never run `playwright install`) at an iPhone-sized viewport (390x844 @2x). Screenshots go to `e2e/screenshots/` (`01-…` onboarding, `06-…` home … `21-…` dark mode, `30-…` counter mode, `40-…` kiosk).

Rerun (from the repo root, fresh seed so the OTP limit of 5 codes per phone per hour starts at zero):

```bash
DATABASE_URL=pglite://./.pglite-mobile-e2e PORT=4300 pnpm --filter @ll/api seed
DATABASE_URL=pglite://./.pglite-mobile-e2e PORT=4300 pnpm --filter @ll/api start     # other terminal
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:4300 pnpm export:web && pnpm e2e:web   # or: node e2e/tour.mjs counter  (steps starting with "counter")
```

- `tour.mjs` serves `dist-web/` itself (`e2e/serve.mjs`, port `E2E_WEB_PORT`, default 8300). `E2E_API_URL` (default `http://localhost:4300`) and `E2E_CUSTOMER_PHONE` (default `+16475551009`, a seeded customer with four shops) are optional.
- Setup through the API: an admin override turns on order-ahead for Pinecone Coffee (shows the `features` entry point), and a live Roncesvalles Passport is created with two visits.
- Map tiles (OpenFreeMap) are fetched with `curl` (machine proxy + CA bundle) and handed to Chromium via `page.route`, cached in the OS temp dir. The "explore-list" step blocks tiles to show the list fallback.
- The tour mutates the database (awards, a redemption, a kiosk check-in). Reseed before rerunning.
