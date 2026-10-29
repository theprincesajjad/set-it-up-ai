# Landing-page A/B tests (experiments)

Pre-registration: `packages/shared/src/experiments.ts` (`EXPERIMENTS`). Contract: `packages/shared/src/api/experiments.ts` (`experimentsApi`). Plan: `docs/marketing/value-props.md` §3.

## How it fits together

1. **Assignment** (web, `apps/web/src/proxy.ts` → `lib/marketing/landing-assign.ts`). On `/for-nail-techs`, `/for-barbers`, `/for-groomers` the proxy picks a variant (`?v=` arm → `ll_v` cookie → a weighted draw from `ll_aid` → control), writes `ll_aid` / `ll_v` (30 days, first-party, `SameSite=Lax`, `Secure` in production) and rewrites to the prerendered `/for-nail-techs/[trade]/[variant]`, `/for-barbers/[variant]` or `/for-groomers/[variant]`. The public URL never changes. `Sec-GPC: 1`, `ll_aid=off` and admin/rep sessions are not rewritten: they get the plain page (control), no cookie, no beacon. The `?trade=` look rewrite stays in `next.config.ts` `beforeFiles` and only serves those excluded visitors. Variant paths fetched directly answer `X-Robots-Tag: noindex`; their canonical is the bare URL; the sitemap lists bare URLs only.
2. **Counting** (web → API). The variant routes render `components/marketing/landing-ab/LandingMeasure.tsx`: a one-line notice with "Turn it off" (`GET /api/public/landing-off?next=…` sets `ll_aid=off` for 365 days) and an inline beacon script (< 1 KB) that posts to `/api/public/landing-events`, relayed to the API below. It also adds a hidden `v` field to the start form.
3. **Conversion**. `/signup?…&v=<experimentId>:<variant>` (or the `ll_v` cookie) and `ll_aid` go into `POST /v1/merchants` as `variant`, `experimentId`, `anonId`, and from there into the `signed_up` milestone's `data`. That row is the only link between a landing visit and a shop.
4. **Report**: `/admin/experiments` (web) on the admin endpoints below.

Starting a test: set `startedAt` in `EXPERIMENTS` (before the start; arms, weights, horizon and alphas never change while it runs). Stopping: `endedAt` there, or **End experiment** on the admin page (stored in `experiment_ends`; the proxy re-reads the list at most once a minute).

Test clock (e2e only): `EXPERIMENTS_NOW` pins the schedule and the `x-ll-experiments-now` header moves it per request; the API honours both outside production, the web proxy only with `EXPERIMENTS_TEST_CLOCK=1`. `e2e/run-all.sh` pins it to 2026-01-01 so the other landing specs always see control.

## POST /v1/public/landing-events

No auth. Body (JSON, or JSON sent as `text/plain` by `sendBeacon`), at most 2 KB (413 above):

| Field | |
| --- | --- |
| `aid` | `ll_aid`, `^[A-Za-z0-9_-]{22}$` (400 otherwise) |
| `v` | `ll_v`: `<experimentId>:<variant>`, `none:<variant>` or null |
| `rv` | optional: the rendered variant, used when `v` does not name a running test |
| `p` | `location.pathname`; only the three public landing paths are counted |
| `tr` | the look: `nails`, `brows`, `lashes`, `makeup`, `barber`, `groom` |
| `src` or `q` | the page's `?src`, or `location.search` (only its `src` is read) |
| `ev` | 1–10 of `{ k, t?, d? }`; `k` in `view`, `scroll_50`, `scroll_90`, `cta_click`, `start_submit` (others dropped); `d` the CTA id |

204 always (also for bots, unknown pages and kinds, which are dropped). 429 after 60 calls a minute per client address; the address is the limiter's key only and is never stored. The user agent is reduced to `phone` / `desktop`. The test is recorded only while it runs on that page and the variant is one of its arms; otherwise `experimentId` is null. `view` and `start_submit` are kept once per (`aid`, test). Rows are deleted after `RETENTION.landingEventDays` (90).

## GET /v1/public/experiments

No auth. `{ ended: string[] }`: tests ended from the admin page. Read by the web proxy.

## Admin (platform role admin; every write is audited)

| Method, path | Body | Response |
| --- | --- | --- |
| `GET /v1/admin/experiments` | | `{ items: ExperimentSummary[] }` |
| `GET /v1/admin/experiments/:id` | | `ExperimentReport` (404 for an unknown id) |
| `POST /v1/admin/experiments/:id/looks` | `{ look: "interim" }` | the report; 409 unless the interim look is open |
| `POST /v1/admin/experiments/:id/guardrails` | `{ variant, costPerSignupCents }` | the report; 400 for a variant that is not an arm |
| `POST /v1/admin/experiments/:id/end` | `{ reason }` (3–500 chars) | the report; 409 when already ended |

`ExperimentReport` per arm: exposures (distinct `aid` with a `view`), start submits, signed up, link live (`booking_link_live` ≤ 7 days after signup), first booking (`first_online_booking` ≤ 7 days after link live), paid (a `plus` subscription ≤ 30 days after signup), unmatched signups (no `view` for their `aid`), Wilson 95% intervals over exposures, guardrails (latest weekly cost per signup, link-live share of control, Lighthouse from `EXPERIMENTS_LIGHTHOUSE_JSON`; `red` on two weekly costs over the bar, a share under the minimum or Lighthouse < 90). `look` is `interim` from `interimAt × horizon` until it is recorded, `final` at the horizon, else `none`; **`lift` (relative change and two-sided two-proportion z-test p-value against control, verdict at the open look's alpha) is only in the response while a look is open.** Breakdowns `byTrade` and `bySrc` are counts only.
