# Website builder API

Contract: `@ll/shared` `siteApi` (`packages/shared/src/api/site.ts`). How it works: `docs/engineering/site-builder.md`.

## Owner

The routes live under `/v1/merchants/:merchantId/site`. The owner and managers can read and build. Only the owner can publish, unpublish and manage the domain.

| Method and path | Role | Body | Returns |
| --- | --- | --- | --- |
| `GET /site` | manager+ | | `SiteBuilderResponse` (the site row is created on first read, with the trade's preset and template copy) |
| `PUT /site` | manager+ | `{ preset?, order?, hidden?, copy? }` (copy is partial, `{ hero: { headline } }`) | `SiteBuilderResponse`. A preset change keeps the words and takes the new preset's order. |
| `GET /site/preview` | manager+ | | `PublicSiteResponse` with the draft words and `mode: "preview"` |
| `POST /site/draft` | manager+ | `{ preset?, brief? }` | `SiteDraftResponse`: `outcome` is `ai` or `fallback`, plus `message`. `429 site_ai_cap` when the 10 drafts are used. |
| `POST /site/rewrite` | manager+ | `{ field: "hero.subhead", instruction? }` | `SiteRewriteResponse` (`text`, `outcome`, `usage`). `429 site_ai_cap` at 40. |
| `POST /site/reset` | manager+ | `{ preset? }` | the template copy, free |
| `POST /site/publish` | owner | | `SiteBuilderResponse`. `402 feature_locked` `{ feature: "site.builder", reason: "plan", offer: "annual" }` without the annual plan. |
| `POST /site/unpublish` | owner | | `SiteBuilderResponse` |
| `GET /site/domain/check?name=` | owner | | `DomainCheckResponse`. A bare name gets `.ca` added. `available` is null when it cannot be checked (flag off). |
| `POST /site/domain` | owner | `{ hostname, mode: "register" \| "connect" }` | `SiteBuilderResponse`. `register` is for `.ca` only (400 otherwise). Another shop's hostname is a 409. Needs the annual plan (402). |
| `DELETE /site/domain` | owner | | `SiteBuilderResponse` |

`SiteBuilderResponse` contains:

- `site`: status, draft, published, `unpublishedChanges`, `publishedAt`, `domain` and `path` (`/s/<slug>`)
- `entitlement`: `entitled`, `reason` (`annual`, `monthly`, `free` or `grant`) and `lapsed`, which is `{ since, graceEndsAt, domainRouted }` or null
- `usage`: drafts and edits used and allowed, `periodStart` and `periodEnd`
- `aiAvailable`: false with no API key
- `domainsAuto`: `SITE_DOMAINS_ENABLED`

## Admin

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET /v1/admin/site-domains` | | `{ items: AdminSiteDomainDto[] }`, requested first |
| `POST /v1/admin/site-domains/:domainId` | `{ status: "requested" \| "pending" \| "live" \| "failed", registrarRef?, note? }` | `AdminSiteDomainDto`. Status `live` routes the host. Status `pending` on the automatic path adds the Cloudflare custom hostname. |

## Public

| Method and path | Returns |
| --- | --- |
| `GET /v1/public/sites/:slug` | `PublicSiteResponse` for a published site. 404 when it is a draft, unpublished or closed. `lapseBannerUntil` is set during the 30-day grace. |
| `GET /v1/public/sites/by-host/:host` | The same, for a live custom domain (`www.` is stripped). 404 after the lapse grace. |

`PublicSiteResponse` contains:

- `content`: preset, order, hidden and copy
- `shop`
- `location`: `visibility`, `areaLabel`, `city`, `address` and `postalCode` (null unless the location is `exact`), `pin` (the offset pin for area and city shops) and `hours`
- `booking.enabled`
- `services` (live)
- `loyalty`: the program and up to 6 rewards
- `promos`: running now
- `reviews`: `{ count, average }` once there are 3 or more ratings
- `message`: the best channel and its `href`
- `canonicalHost`

Both public endpoints are cached for 30 seconds.

## Environment

| Variable | Default | |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Unset means no AI. The builder runs on presets and template copy. |
| `SITE_AI_MODEL` | `claude-opus-5-5` | drafts |
| `SITE_AI_EDIT_MODEL` | `claude-haiku-5-5` | one-line rewrites |
| `SITE_AI_EFFORT` | `low` | `low`, `medium` or `high` (drafts) |
| `SITE_AI_FALLBACKS` | on | `0` turns off server-side refusal fallbacks |
| `SITE_DOMAINS_ENABLED` | off | `1` turns on RDAP checks and Cloudflare custom hostnames |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_ACCOUNT_ID` | unset | used when the flag is on |
| `SITE_CNAME_TARGET` | `sites.localloyalty.ca` | the target in the DNS records the owner is shown |
| `SITE_DOMAIN_PRICE_CENTS` | `1500` | shown on the check, included on the annual plan |
| Web: `SITE_APP_HOSTS` | unset | extra hosts that are ours, comma separated |
| Web: `SITE_CUSTOM_HOSTS` | on | `0` turns off custom-host routing in the web app |
