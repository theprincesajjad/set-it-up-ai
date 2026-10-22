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
DATABASE_URL=pglite://./.pglite/e2e PORT=4100 pnpm --filter @ll/api seed
DATABASE_URL=pglite://./.pglite/e2e PORT=4100 PUBLIC_WEB_URL=http://localhost:3100 pnpm --filter @ll/api start
pnpm --filter @ll/web build
cd apps/web && API_INTERNAL_URL=http://localhost:4100 OTP_AUTOFILL=1 npx next start --port 3100
cd apps/web && npx playwright test             # screenshots → apps/web/e2e/screenshots/
```

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
- `/map` is a list plus a dependency-free "map" (pins projected from lat/lng onto a decorative background, peek card).
  Swap in a real tile map later if needed; keep it out of the join path.

## For the dashboard / rep / admin engineer

- Routes: `src/app/(dashboard)/m/[merchantId]/...` (merchant-dashboard.md uses `/m/...`; `routes.dashboard(id)` in
  `src/lib/routes.ts` already points there and staff sign-in redirects to it), `src/app/(rep)/rep/...`,
  `src/app/(admin)/admin/...`. Each group gets its own `layout.tsx` using `AppShell`; guard with
  `await requireMe(pathname)` from `src/lib/auth/session.ts` and check `me.merchants` / `me.platformRole`.
- Shell + layout: `AppShell` (sidebar 248 / rail 72 / bottom nav + More sheet, `env="rep"|"admin"` strip),
  `PageHeader`, `Section`, `Container`.
- Data: `getServerApi()` in server components; `browserApi` / `browserClient` in client components. Add
  `merchant`/`rep`/`admin` groups to `src/lib/api/endpoints.ts` (or call `browserClient.get<merchantApi.X>(...)`).
- Components: `DataTable` (sortable, mobile list rows, cursor "Load more"), `StatTile`, `Tabs`, `SegmentedControl`,
  `Modal`/`Sheet`, `useToast`, `Banner`, `EmptyState`/`ErrorState`, `Skeleton*`, `Badge`/`StatusBadge` (all status
  domains mapped), `LockedFeature`, `ProgressBar`, `TextField`/`Select`/`Switch`/`Checkbox`/`PhoneField`, `Avatar`,
  `ShopTile`/`ShopLogo`, `StampCard`/`PointsRing`/`RewardCard`/`PromoCard` (program-editor preview), `QrCode`
  (server-side SVG, for the QR kit).
- Lint enforces semantic token classes (no raw palette / Tailwind default colours) in `src/components/ui`.
- Payments in dashboard flows: reuse `components/pass/PaymentBox.tsx` (Stripe Element or the dev simulator).

## Deploy

Any Node 22 host or Vercel. Vercel: root `apps/web`, install `pnpm install` at the repo root, build `pnpm --filter
@ll/web build`; set the env vars above (`API_INTERNAL_URL` only if the API is reachable privately). Node host:
`pnpm --filter @ll/web build && PORT=3000 pnpm --filter @ll/web start` behind TLS (cookies are `Secure` in
production). Legal pages are built from `docs/legal/` at build time, so `docs/` must be present during the build.
