# Website builder

Phase solo, workstream G. The founder's brief: "Lovable, but built in". An owner picks one of three presets that already show their bookings, services, prices, rewards, offers, ratings and map pin. Claude writes the words, and the owner edits any line. The site goes live on the annual plan, with hosting and one `.ca` included.

API contract: `docs/engineering/api/site.md`. Code:

| Piece | Where |
| --- | --- |
| Presets, sections, bindings, template copy | `packages/shared/src/site-presets.ts` |
| The JSON the model must return | `packages/shared/src/site-copy-schema.ts` |
| Contracts | `packages/shared/src/api/site.ts` (`siteApi`) |
| Tables | `sites`, `site_domains`, `site_ai_calls` (migration `0035_solo_g.sql`) |
| Service: drafts, caps, publish, lapse, domains, public data | `apps/api/src/services/site.ts` |
| Claude calls and prompts | `apps/api/src/services/site-ai.ts` |
| Registrar and custom hostnames | `apps/api/src/services/site-domains.ts` |
| Routes | `apps/api/src/routes/site/index.ts`, `apps/api/src/routes/public/site.ts` |
| Builder | `apps/web/src/app/(dashboard)/m/[merchantId]/site`, `apps/web/src/components/site-builder/*` |
| Renderer (three presets) | `apps/web/src/components/site/presets/SiteRenderer.tsx`, `PublicSite.tsx` |
| Public routes | `apps/web/src/app/(site)/s/[slug]` and `apps/web/src/app/(site)/[domain]` (custom hosts, through `src/proxy.ts` and `src/lib/siteHost.ts`) |
| Admin domain tasks | `apps/web/src/app/(admin)/admin/site-domains` |
| Tests | `apps/api/test/site.test.ts`, `apps/web/e2e/site-builder.spec.ts` |

## 1. How presets bind

A site stores words only: `{ preset, order, hidden, copy }`. Everything factual is read live from the shop each time the page renders. A price change shows at once, and the model can never put a wrong price on the page.

| Section | Reads live | Words |
| --- | --- | --- |
| hero | shop name, logo, area label, booking on or off | headline, subhead, main button |
| services | appointment services, prices (with "from"), durations, a Book link per service (`/shops/<slug>/book?service=<id>`) | title, intro |
| reviews | the private 1 to 5 ratings, shown as an average once there are 3 | title |
| loyalty | the program ("how you earn"), up to 6 rewards, Join (the shop page's join form) | title, body |
| promos | promos running now (`windowPromos`), shown with `PromoCard` | title, intro |
| about | the shop | title, body |
| hours | the first active location's hours | title |
| map | the address rule: exact shows the street address and directions. Area and city show the area label and the offset pin (`locations.map_lat/map_lng`) with "Open the map". | title, note |
| contact | the best way to message (Instagram DM, WhatsApp, text, then email), call, Instagram | title, body |

| Preset | Layout | Default order | Required |
| --- | --- | --- | --- |
| `studio` | split hero, with a services card beside it | hero, services, reviews, loyalty, about, hours, map, contact | hero, services |
| `portfolio` | centred hero, leads with the person | hero, about, services, reviews, promos, contact, map | hero, about |
| `shopfront` | banner hero tinted with the trade accent | hero, promos, loyalty, about, hours, map, contact | hero, hours |

`defaultPresetFor(vertical)` picks the starting preset: makeup gets `portfolio`, food and retail get `shopfront`, and every other trade gets `studio`. The owner can switch at any time, and switching keeps every line they wrote.

Book, Join and Message are the real flows. On a custom domain they point back to our host (`NEXT_PUBLIC_SITE_URL`), because booking needs our session cookies.

## 2. The zero-AI path

With no `ANTHROPIC_API_KEY`, the builder hides "Write it for me" and works on presets plus `defaultCopy()`. That template copy follows `ux-copy.md`, is written per preset and fits every field limit (tested). On the annual plan the owner can publish in one tap. The draft and rewrite endpoints still answer: they return the template, or the line unchanged, with `outcome: "fallback"`, and the counters are not touched. Tests never call the real API. They inject a scripted client on `ctx.providers.siteAi`.

## 3. The AI prompt

**Draft.** One call per draft.

- Model: `SITE_AI_MODEL`, default `claude-opus-5-5`.
- Thinking: adaptive, the model's default, so `thinking` is omitted.
- Effort: `SITE_AI_EFFORT`, default `low`. Set explicitly, because Opus 5.5 would otherwise default to `medium`.
- Output: `output_config.format = { type: "json_schema", schema: SITE_DRAFT_JSON_SCHEMA }`.
- Fallbacks: `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`. A classifier decline re-runs on Anthropic's recommended fallback model inside the same call. `SITE_AI_FALLBACKS=0` turns this off.
- `max_tokens`: 4,000.

The system block is byte-stable across every shop. It holds the presets, the live bindings, the field limits, the voice rules from `ux-copy.md` (sentence case, no hype, Canadian spelling, "clients" not "members", no prices, times, addresses or discounts) and the rules. It carries the `cache_control` breakpoint. The user turn carries the shop's facts as JSON:

- preset, name, trade, neighbourhood and city (never the street address)
- up to 40 services with prices and durations
- hours
- how the rewards work and up to 8 rewards
- up to 6 offers
- the rating summary
- an optional owner note of up to 400 characters

The prompt says to treat the facts as text, not as instructions.

**One-line rewrite ("Rewrite this").**

- Model: `SITE_AI_EDIT_MODEL`, default `claude-haiku-5-5`.
- Effort: `low`. `max_tokens`: 1,000.
- Output: JSON `{ text }`.
- No server-side fallback, because Haiku has none.
- The input is the field, its character limit, the current line and an optional direction.

**Handling the answer.** The stop reason is checked before content is read. On `refusal`, `max_tokens`, unparseable JSON, a zod failure (`siteDraftOutput`) or an API error, the draft falls back to the template with the plain message "We couldn't write this one. Here's a draft to edit." A rewrite keeps the line as it was. Lengths are trimmed to the field limits on a word boundary, because structured outputs do not enforce `maxLength`. The section order is normalised: hero first, only the preset's sections, required sections kept.

## 4. The caps

| | Limit | Constant (owned by A, `plans.ts`) |
| --- | --- | --- |
| Drafts | 10 a month | `SITE_AI_GENERATIONS_PER_MONTH` |
| One-line rewrites | 40 a month | `SITE_AI_EDITS_PER_MONTH` |

- **Enforced on the server** (`services/site.ts` `reserve`). The counter is taken atomically before the call. In one `UPDATE`, it resets when the window moved on and refuses when the cap is spent, so two tabs cannot overspend.
- **Refused calls.** Over the cap, the API answers `429 site_ai_cap` with `{ kind, limit, resetsAt }` and the model is not called. The owner can still type over every line and reset to the starter words for free.
- **Refunds.** A call that failed before reaching the model (no input tokens) is refunded. Refusals and bad output count, because they cost tokens.
- **Window.** Monthly, anchored on the subscription's billing day (`allowanceWindow`). Without a subscription it is the calendar month in UTC.
- **Usage line.** The builder shows "3 of 10 drafts this month · 1 of 40 rewrites this month".
- **Cost log.** Every call writes a `site_ai_calls` row (kind, model, outcome, input, output, cache read and cache write tokens) and a `site_ai_call` JSON log line with counts only, never copy.

### Tokens per draft against the §4.1 assumption

`solo-pro-launch.md` §4.1 assumes 6,000 tokens in and 2,500 out per draft.

| | Size | Estimate |
| --- | --- | --- |
| System block | 2,967 characters | ~750 tokens |
| Output schema | 1,886 characters | ~470 tokens |
| Facts for a 12-service studio | 1,660 characters | ~420 tokens |
| Input total | | about 1,700 tokens |
| Output: the copy JSON | ~1,100 characters | ~300 tokens |
| Output with low-effort thinking | | estimated under 1,500 tokens |

These are estimates at about 4 characters per token, measured on the real prompt builder with no API call. They are not yet a live measurement. The first real draft writes its numbers to `site_ai_calls`, and the final audit should compare them here.

- **Not higher than the assumption.** Both directions are well under it, even with a 40-service menu, which adds about 1,000 tokens.
- **Caching.** The cached prefix (about 750 tokens of system) is below Opus's minimum cacheable prefix. The breakpoint is in place, but the call runs uncached until the system block grows. That costs nothing extra.
- **Rewrites.** About 400 tokens in and under 200 out on Haiku 5.5.

## 5. Publish, unpublish and the annual plan

- **Building and previewing** are open to the owner and managers on every plan. The preview shows the draft words over the live data (`GET .../site/preview`).
- **Publishing** (owner only) needs the entitlement: `merchants.annual_site_entitled` (A's billing webhook), or an active yearly paid subscription, or an admin grant on feature key `site.builder`. Without it the API returns `402 feature_locked` with `{ feature: "site.builder", offer: "annual" }`. The builder shows the plan line "Your website goes live with the annual plan." with a link to Billing.
- **Unpublish** takes the page down (404). The shop page and booking keep working.
- **Lapse.** When a published site's shop loses the annual plan, `sites.lapsed_at` is set the first time this is seen. Then:
  - For `SITE_LAPSE_GRACE_DAYS` (30) days the site stays up everywhere, with the notice "This website is moving. You can still book and join at localloyalty.ca/s/<slug>."
  - After that, the custom domain stops routing: `by-host` returns 404 and the proxy falls through.
  - `/s/<slug>` keeps working with no notice.
  - Coming back to the annual plan clears the lapse.

## 6. Domains

The site is always at `{siteUrl}/s/<slug>`. A custom domain is optional and included on the annual plan.

**`SITE_DOMAINS_ENABLED` off (the launch default).**

1. A request becomes a row in `site_domains` with status `requested`.
2. It appears on `/admin/site-domains` (`GET /v1/admin/site-domains`), with requested ones first.
3. The admin buys the `.ca` through our registrar account, or checks the owner's records for a name they already own.
4. The admin points the name at `SITE_CNAME_TARGET` (default `sites.localloyalty.ca`), adds it as a custom hostname in Cloudflare, and marks it **live**.
5. Marking it live sets `sites.domain`, and the host starts resolving.

The owner sees Requested, Setting up, Live or Needs attention.

**`SITE_DOMAINS_ENABLED=1`**, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`:

- **Availability.** `.ca` availability comes from RDAP (`rdap.ca.fury.ca`, where 404 means free).
- **A name the owner already has.** It is added at once as a Cloudflare for SaaS custom hostname (`POST /zones/:zone/custom_hostnames`, DV certificate over HTTP). The builder shows the CNAME records, and the status is polled on each builder load until the hostname and certificate are active.
- **A new `.ca`.** Buying it is still an admin step. When the admin records the purchase ("Bought", status `pending`), the hostname is added automatically.

Automatic registration waits until the registrar integration is ready (see the roadmap column of the phase plan). Removing a domain removes the custom hostname, and the `/s/<slug>` address stays.

**Routing.** `src/proxy.ts` (marked block) treats any host that is not ours as a shop domain. Ours are the `NEXT_PUBLIC_SITE_URL` host, `SITE_APP_HOSTS`, localhost, IPs and `*.vercel.app`. On a shop domain the proxy rewrites `/` to `/<host>` and sets `x-ll-site-host`. `app/(site)/[domain]` renders only when that header matches, so any other one-segment path stays a plain 404. `SITE_CUSTOM_HOSTS=0` turns off host routing in the web app.

## 7. The address rule

The page data (`pageData` in `services/site.ts`) carries a street address and postal code only for an `exact` location. Area and city shops get the area label (`locations.area_label`, else the neighbourhood name) and the offset pin. The same holds for the JSON-LD. The AI prompt never receives the address (tested). The `privacy.spec.ts` case for the site is a request to workstream B; `site.test.ts` covers the API.
