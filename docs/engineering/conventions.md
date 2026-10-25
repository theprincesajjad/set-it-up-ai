# Engineering conventions

Read this before writing code. It is the contract between the teams building
this repo in parallel.

## Product in one paragraph

Local Loyalty is a shared loyalty network for independent neighbourhood
businesses (Toronto first). Customers carry **one** identity (phone number /
wallet pass / app) across every shop on the street. **Loyalty and reporting on it
are free forever for merchants: no transaction fees, unlimited locations, unlimited
staff, unlimited members.** Everything else (promos, VIP, marketing, CSV,
integrations, ...) is paid (Pricing v2, `docs/business/pricing.md`). Money comes later from paid add-ons (Plus $39, Pro $79),
a 0.75% platform fee on in-app payments, sponsored placements/ads, and paid
BIA neighbourhood campaigns. Paid features are **hidden** until the network is
big enough; an admin flips their rollout stage (`hidden → beta → ga`).
Full plan: `docs/business/prd.md`.

## Repo layout

```
apps/api        Fastify + Drizzle API (Node 22, TypeScript, ESM)
apps/web        Next.js: marketing site, merchant dashboard, rep console, admin, customer web pass, public quote/invoice pages
apps/mobile     Expo (React Native): customer app + staff "counter mode"
packages/shared Domain logic shared by everything: plans/features, verticals, points math, API contract (zod)
packages/db     Drizzle schema, migrations, DB client (Postgres in prod, PGlite in tests/dev)
docs/           business, engineering, design, finance, sales
```

## Non-negotiable rules

1. **Points only change through `apps/api/src/services/ledger.ts`** (`postTransaction`,
   `awardPurchase`, `redeemReward`, `adjustPoints`, `reverseTransaction`, `ensureMember`).
   Never `update merchant_members set balance`. Double-entry, idempotent.
2. **Every merchant-scoped query filters by `merchant_id`.** Authorize with
   `requireStaff(ctx, req, merchantId, minRole)` from `src/lib/auth.ts`.
   Platform roles: `requirePlatformRole(req, "rep" | "admin")`.
3. **Paid / unreleased features are gated server-side** with
   `requireFeature(db, merchant, "feature.key")` from `src/services/features.ts`.
   Feature keys live in `packages/shared/src/plans.ts`. A `FREE_FOREVER` feature is never
   gated. Customer-facing reads hide paid content when the merchant lacks the feature
   (batched: `enabledFeaturesFor` / `customerFeaturesFor`); existing data is kept.
4. **CASL**: promotional messages only go to members with `marketing_consent_at`
   set and `muted = false`. Transactional messages (order ready, quote to approve,
   OTP) are allowed without marketing consent. Every promo message includes the
   merchant name and an opt-out ("Reply STOP" / unsubscribe link).
5. **No-earn categories** (prescriptions, pharmacy services, alcohol, tobacco,
   lottery, gift cards) never earn points and never get discounts.
6. **Points never expire by default.** If a merchant enables expiry it's ≥ 12 months
   of inactivity and disclosed everywhere a balance is shown.
7. Money is integer cents (CAD). Points are integers. Timestamps are `timestamptz`.
8. Third-party services are behind provider interfaces with console/fake
   implementations, so **everything runs and tests with zero credentials**.
   Real implementations activate when env vars are present (`src/config.ts`).
9. No secrets in code. Add new env vars to `src/config.ts` **and** `apps/api/.env.example`.

## API conventions

- Base path `/v1`. JSON in/out. Errors: `{ error: { code, message, details? } }`
  (`src/lib/errors.ts`). Validation: `parse(zodSchema, req.body)` from `src/lib/validate.ts`.
- Auth: `Authorization: Bearer <access JWT>`; `req.authUser` is set by a global hook.
- Merchant-scoped routes: `/v1/merchants/:merchantId/...`.
- Customer-scoped routes: `/v1/me/...`.
- Public (no auth) routes: `/v1/public/...` (merchant pages, quote approval by token, invoice pay by token, join by QR).
- Admin routes: `/v1/admin/...`; rep console: `/v1/rep/...`.
- Webhooks: `/v1/webhooks/<provider>`. Verify signatures with `req.rawBody`.
- Lists return `{ items, nextCursor }`.
- Writes that can be retried (award, redeem, orders, payments) accept an
  `Idempotency-Key` header or `idempotencyKey` body field.
- Each route area lives in `apps/api/src/routes/<area>/` and exports
  `default async function register(app, ctx)` (already wired in `routes/index.ts`).
  Put area-specific business logic in `apps/api/src/services/<area>*.ts`.
- **Contract**: request zod schemas and response TypeScript types for your area
  go in `packages/shared/src/api/<area>.ts` (exported as `<area>Api`). Document
  every endpoint in `docs/engineering/api/<area>.md` (method, path, auth, body,
  response, errors). The web and mobile teams build only against these.
- Background work: add `Job`s to `apps/api/src/jobs/<area>.ts`.

## Database

- Schema: `packages/db/src/schema.ts`. If you need a schema change, edit the
  schema and regenerate the migration: `cd packages/db && npx drizzle-kit generate --name <change>`.
  Coordinate: other teams are working at the same time; prefer additive changes
  (new tables/columns), never rename/drop existing ones.
- `DATABASE_URL=pglite://memory` (tests) or `pglite://./.pglite/dev` (local dev default)
  runs an in-process Postgres. Production uses a real Postgres URL.

## Testing

- `vitest`. API tests use `apps/api/test/helpers.ts` → `createTestEnv()` (fresh
  PGlite DB per test, controllable clock, console providers with an `outbox` you
  can assert on). Use `env.app.inject({ method, url, headers, payload })` for HTTP tests.
  `TEST_PG_URL=postgres://user@host:port/postgres` runs the same tests on a real PostgreSQL (a fresh
  database per test env, dropped on close): use it for anything that touches raw SQL or driver parameters,
  where postgres-js is stricter than PGlite (it refuses a `Date` inside a raw `sql` template: pass an ISO string and cast).
- Every route area ships with tests covering the happy path, auth failures and
  the business rules above. Run `pnpm --filter @ll/api test` and
  `pnpm --filter @ll/api typecheck` before declaring done.

## Working in parallel

- Several teams edit this repo at the same time. **Stay inside the folders you
  own.** If you must touch a shared file (schema, shared index, config, package.json),
  make a minimal additive edit and re-read the file right before editing.
- **Do not run `git commit`, `git push`, `git stash`, `git checkout` or `git reset`.**
  The lead integrates and commits.
- Adding a dependency: `pnpm --filter <pkg> add <dep>`. If pnpm reports a lock
  conflict, wait a few seconds and retry.
- Don't reference anything outside this repository's purpose. The repository
  name is a placeholder; the product name comes from `packages/shared/src/brand.ts`.
