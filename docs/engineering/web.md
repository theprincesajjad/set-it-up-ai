# Web app (`apps/web`)

Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind v4 with `@ll/design-tokens`.
One app serves the marketing site, the customer web pass, public transactional pages and (built by the
dashboard team inside the same app) the merchant dashboard, rep console and admin.

> Next 16 differs from older versions: `middleware.ts` is now `src/proxy.ts`, `params`/`searchParams`/`cookies()`
> are async, `next lint` is gone (we run `eslint .`). Version-matched docs live in `apps/web/node_modules/next/dist/docs/`.

## Run it

```bash
pnpm install
pnpm --filter @ll/api seed                      # demo data (PGlite)
pnpm --filter @ll/api dev                       # API on :4000
pnpm --filter @ll/web dev                       # web on :3000 (PORT=3100 to change)
```

Quality gates: `pnpm --filter @ll/web typecheck | lint | test | build`.

E2E (Playwright, Chromium from `PLAYWRIGHT_BROWSERS_PATH`; `@playwright/test` is pinned to 1.56.1 to match it,
never run `playwright install`):

```bash
mkdir -p apps/api/.pglite
DATABASE_URL=pglite://./.pglite/e2e PORT=4100 pnpm --filter @ll/api seed
# NODE_ENV=test: the API's global rate limit (300/min per socket IP) would otherwise trip, because every
# SSR + BFF request reaches the API from the web server's one IP.
NODE_ENV=test DATABASE_URL=pglite://./.pglite/e2e PORT=4100 PUBLIC_WEB_URL=http://localhost:3100 pnpm --filter @ll/api start
pnpm --filter @ll/web build
cd apps/web && API_INTERNAL_URL=http://localhost:4100 OTP_AUTOFILL=1 npx next start --port 3100
cd apps/web && E2E_WEB_URL=http://localhost:3100 E2E_API_URL=http://localhost:4100 npx playwright test
```

Specs: `web-pass.spec.ts` (customer pass), `dashboard.spec.ts` (merchant dashboard, web counter, rep, admin rollout,
BIA; screenshots → `e2e/screenshots/dashboard/`), `map.spec.ts` (vector map; routes tiles through `HTTPS_PROXY`
when set, falls back to the list otherwise). The dashboard spec resets the rollout stage/override it changes.

`e2e/fixtures.ts` logs in with the seed's demo credentials, enables the Pro features for Fix-It Phone Lab through an
admin override, finishes fake Stripe Connect onboarding and creates a sent quote with a 25% deposit.

## Environment

| Var | Where | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | build + runtime | `http://localhost:4000` | Public API base URL |
| `API_INTERNAL_URL` | server runtime | `NEXT_PUBLIC_API_URL` | Server-side API base (private network / localhost). Server code always prefers it |
| `NEXT_PUBLIC_SITE_URL` | build + runtime | `http://localhost:3000` | Canonical URL: metadataBase, sitemap, robots, JSON-LD |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | build | empty | Enables Stripe Payment Element. Empty → dev "Test payment" button that calls `POST /v1/payments/fake/simulate` |
| `NEXT_PUBLIC_APP_STORE_URL`, `NEXT_PUBLIC_PLAY_STORE_URL` | build | store home pages | "Get the app" links |
| `OTP_AUTOFILL` | server runtime | off in production | `1` fills OTP boxes with the API's `devCode` (dev APIs only return it) |
| `NEXT_PUBLIC_MAP_STYLE_URL` | build | OpenFreeMap positron | MapLibre style for `/map` (free vector tiles, no key). Muted to the paper palette at load |

`NEXT_PUBLIC_*` values are inlined at build time; set them before `next build`.
The API must set `PUBLIC_WEB_URL` to this site so SMS/QR links (`/j/<code>`, `/q/<token>`, `/i/<token>`) point here.

## Structure

```
apps/web/
  next.config.ts            transpilePackages (@ll/shared, @ll/design-tokens), Turbopack loader, redirects, noindex headers
  loaders/ts-js-extension.cjs  rewrites "./x.js" → "./x" in workspace TS sources (Turbopack has no extensionAlias)
  src/proxy.ts              refreshes stale sessions before pages render (server components can't set cookies)
  src/app/
    layout.tsx, globals.css Figtree + Fraunces via next/font, tokens theme, ToastProvider
    (marketing)/            /, /for-shoppers, /for-bias, /pricing, /neighbourhoods(/[slug]), /signup, /login,
                            /legal/[terms|privacy|rewards] (SSG from docs/legal/*.md, DRAFT banner), /accessibility
    (pass)/                 single column (480): /j/[code] + /join/[code], /me, /shops/[slug], /map,
                            /q/[token], /i/[token], /o/[id], /c/[id]
    api/auth/[...action]    session handlers: otp/verify, email-otp/verify, login, register, logout, session
    api/ll/[...path]        BFF proxy to the API with the bearer cookie + refresh rotation
    robots.ts, sitemap.ts, opengraph-image.tsx, (pass)/shops/[slug]/opengraph-image.tsx, icon.svg, not-found, error
  src/lib/
    api/client.ts           createApiClient(): typed fetch, error envelope → ApiError, 401 → refresh once, idempotency keys
    api/endpoints.ts        llApi(client): typed wrappers over @ll/shared contracts (auth, network, public, me, dev)
    api/server.ts           getServerApi() (cookie token), publicServerApi() (anonymous, cacheable)
    api/browser.ts          browserApi (via /api/ll) and sessionApi (via /api/auth)
    auth/                   cookies, refresh (deduped), handlers (BFF + sign-in logic), session (getMe, requireMe)
    phone.ts, format.ts, hours.ts, program.ts, legal.ts, routes.ts, env.ts
  src/copy/en-CA.ts         ux-copy.md strings (stable keys for fr-CA later)
  src/components/ui/        shared component library (docs/design/system.md names and props)
  src/components/site|marketing|pass|auth/   page-level building blocks
  test/                     vitest + Testing Library
  e2e/                      Playwright spec, fixtures, screenshots
```

### Auth model

Tokens never reach browser JavaScript. Sign-in posts to `/api/auth/*`, which calls the API and stores the access JWT
(`ll_at`) and refresh token (`ll_rt`) in httpOnly, SameSite=Lax cookies (Secure in production) plus a readable
`ll_session=1` hint. Browser calls go through `/api/ll/v1/...` (same origin, no CORS), which adds the bearer and, on a
401, rotates the refresh token once and retries. Server components read the access cookie directly; `src/proxy.ts`
rotates before render when the access token is missing or expires within 60 s. Refresh tokens are single-use and a
replay revokes every session, so concurrent refreshes share one in-flight call per process. On multi-instance hosts,
keep the proxy refreshing early (it does) so 401 races stay rare. `/api/ll` refuses the token-returning auth endpoints.

### Customer web pass notes

- Join: `GET /v1/public/join/:qr` (server) → `POST /v1/public/join/:qr` → `/api/auth/otp/verify` → `PATCH /v1/me` (name)
  → `POST /v1/me/memberships { locationQrCode, consent?, referralCode? }`. The shop page joins with `/v1/auth/otp/start`
  + `{ merchantId }`. `?ref=` is passed through as `referralCode`.
- CASL: the checkbox shows `consent.merchant.v1` from ux-copy.md, unticked, and that exact string is sent as
  `consent.text` (also used when re-granting in Settings). Note the API's suggested `consentText` differs; the web uses
  the ux-copy wording on purpose.
- Pages that need the API are dynamic or ISR with graceful fallbacks, so `next build` works with the API down.
- `/map` is map-first: `components/pass/ShopMap.tsx` lazy-loads `NetworkMap.tsx` (maplibre-gl, client only, its CSS
  ships with that chunk). Pins (`MapPin.tsx`) are React portals into maplibre markers: round logo or coloured
  initials with a white ring, marigold balance badge on my shops, pine dot for live promos, selected pin enlarged;
  labels show on the selected pin and at zoom ≥ 17. Floating category chips + peek card sit over the map.
  No WebGL, a style/tile error or a 12 s timeout → `onFail` → the list with a notice. Keep it out of the join path.
- `ShopLogo` always falls back to coloured initials (no logo, or `onError`); same in `ShopTile` hero/list and pins.
- Marketing "Book a visit" / BIA forms post to `POST /v1/public/leads`; `/pricing` reads `GET /v1/public/plans`
  (real availability + active merchants); shop pages show `memberCount` ("N neighbours are members") and
  `features` pills; the redeem code sheet counts down `RedemptionDto.expiresAt`.

## Merchant dashboard, rep console, admin, BIA

Routes (all dynamic, `noindex`):

| Area | Routes |
| --- | --- |
| Merchant `/m/[merchantId]` | `/` Home (KPIs, daily chart, checklist, activation, today, network overlap, live promos, one LockedFeature) · `/setup` guide · `/counter` web counter · `/customers` (+ `/[memberId]`, `/import`) · `/program` (earn, rewards, bonuses + VIP, categories, expiry, live preview) · `/promos` (+ `/new`, `/[promoId]`) · `/discount-cards` · `/messages` (+ `/new`, `/[messageId]`, `/automations`) · `/reports` · `/locations` (+ `/kit` print page) · `/staff` · `/integrations` (+ `/[provider]`, `/developers` webhooks + API key) · `/billing` (plans, Stripe Connect) · `/settings` · Phase 2: `/orders`, `/catalog`, `/tickets` (+ `/new`, `/[ticketId]`), `/slots` · Phase 3: `/ads` (+ `/new`, `/[adId]` with card payment), `/campaigns` |
| Rep `/rep` | Today · `/leads` (board + list, `/[leadId]`) · `/new` (done-for-you wizard) · `/merchants` (+ `/[id]`, `/[id]/kit`) · `/earnings` |
| Admin `/admin` | Network · `/rollout` · `/merchants` (+ `/[id]`) · `/neighbourhoods` (+ perks) · `/users` · `/campaigns` (+ `/[id]`) · `/ads` · `/audit` |
| BIA `/bia` | campaigns list + `/[campaignId]` (shops, visit-lift report, CSV/print) |
| Dev | `/dev/checkout/[id]`, `/dev/stripe-onboarding`, `/dev/billing-portal`: FakePayments stand-ins |

- **Guards.** `(dashboard)/m/[merchantId]/layout.tsx` runs `requireMe`, fetches `detail` + `features` server-side and
  renders `MerchantProvider` + `MerchantShell`. Staff of the shop get their role; platform admins and the shop's rep
  pass the API's `requireStaff` and see a sticky danger "Viewing as … Changes are logged." banner. Staff role sees only
  Today + Counter (`lib/dashboard/nav.ts` `canOpen`); billing is owner-only. Rep/admin layouts check `platformRole`;
  BIA access is decided by `GET /v1/campaigns` (403 → "This area is for BIA managers").
- **Feature gating.** Nav is built from `GET /features` (`buildMerchantNav`): locked features never appear. Phase 2/3
  pages wrap in `FeatureGate` (renders the `FeatureTeaser` card when locked). `FeatureTeaser` maps state → LockedFeature:
  hidden → Coming soon + Notify me (`POST /features/:key/notify`), beta → Try the beta (owner opt-in), plan → See plans.
- **Data.** Pages are client components: `useMerchant()` gives `api = browserApi.merchant(id)` (all groups in
  `lib/api/endpoints.ts`: `merchant(id)`, `rep`, `admin`, `campaigns`, `merchants`, `ads`). `useApi(fn, deps, { pollMs })`
  handles loading/error/reload (orders poll 10 s, tickets/today 30 s); `useAction` wraps writes.
- **Logic modules (unit-tested in `test/`).** `lib/dashboard/program.ts` (validation mirroring the API, sentence, preview
  model, PATCH diff, "raises the bar" confirm), `csv.ts` (parse, column guess, preview, canonical CSV; consent columns
  dropped unless the merchant answers "Yes, and I have records"), `rollout.ts` (free-forever locked to GA, typed key
  for GA, plain-words effect, gauge status), `counter.ts` (till-style keypad, lookup hints, award labels), `promos.ts`,
  `customers.ts` (consent column rules, masking), `time.ts` (Toronto ranges, datetime-local ↔ ISO).
- **Counter.** `components/dashboard/counter/CounterApp.tsx`: lookup (phone / last 4 / member code), new customer
  with unticked CASL checkbox (exact `consent.merchant.v1` text), per-dollar amount keypad (hardware digits too) or
  +1/+2/+3 stamp `quantity`, redeem, verify code, undo (timer + recent list `canUndo`). One idempotency key per tap,
  kept across network-error retries. Keys: `/` search, Enter award, Esc next customer.
- **QR kit.** `QrKitPrint` renders `public/brand/qr-stand-a6.svg` as JSX with the shop name/street/join URL and the
  real `QrCode` in the 50 mm slot; `@page` is set per artifact (A6 / A4 / staff script) and `AppShell` hides itself
  in print. `afterprint` ticks the `qr_kit` setup step.
- **Components added** to `components/ui` (additive): `DensityGauge`, `Keypad`, `Select hideLabel`, TextField
  `datetime-local|time|color`, `print:` classes in `AppShell`, `ShopLogo` initials fallback. Dashboard-only pieces live
  in `components/dashboard/` (shells, charts with "View as table", phone-frame `ProgramPreview`, import wizard, promo
  editor, campaign views, admin StageDialog/OverridesSheet).
- **Return URLs.** `next.config.ts` redirects the API's `/dashboard/integrations?merchantId=`, `/dashboard/billing?merchant=`
  and `/dashboard/payments?merchant=` to `/m/:id/...`. (`/bia` is now the BIA tool; the marketing page is `/for-bias`.)
- **Known API gaps** (UI degrades gracefully): no way to set `smsReceiptsEnabled` from PATCH /merchants (toggle explains);
  no "my neighbourhoods" for BIA managers (derived from visible campaigns); no customer-list total / joined-after /
  consent filters (count from reports overview, New/Opted-in/Muted chips filter loaded rows); phone reveal isn't
  audit-logged; no "send test to myself" for messages; `AdminFeature.updatedBy` is a user id, not a name.

## Deploy

Any Node 22 host or Vercel. Vercel: root `apps/web`, install `pnpm install` at the repo root, build `pnpm --filter
@ll/web build`; set the env vars above (`API_INTERNAL_URL` only if the API is reachable privately). Node host:
`pnpm --filter @ll/web build && PORT=3000 pnpm --filter @ll/web start` behind TLS (cookies are `Secure` in
production). Legal pages are built from `docs/legal/` at build time, so `docs/` must be present during the build.
