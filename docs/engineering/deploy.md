# Deploy

How to run Local Loyalty on one server with Docker Compose: Postgres 16, a one-shot migration, the API and the web app. Files: `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`, `.env.example` (all at the repo root except the Dockerfiles). The mobile app is out of scope here: an Expo build points at the API through `EXPO_PUBLIC_API_URL` (see `mobile.md`).

## What runs

| Service | Image | Port (host default) | Notes |
| --- | --- | --- | --- |
| `postgres` | `postgres:16` | `127.0.0.1:5432` | Data in the `pgdata` volume. Loopback only. |
| `migrate` | the API image | none | Runs `packages/db/src/migrate.ts` once and exits. `api` waits for it to finish successfully. |
| `api` | `apps/api/Dockerfile` | `4000` | Fastify under `tsx` (the repo ships TypeScript source; `pnpm --filter @ll/api start` does the same). Non-root user `node`. Uploads in the `uploads` volume (`/data/uploads`) when `STORAGE_PROVIDER=disk`. Healthcheck: `GET /health`, which does not touch the database. |
| `web` | `apps/web/Dockerfile` | `3000` | Next.js standalone server. Non-root. Healthcheck: `GET /`. |
| `seed` | the API image | none | Profile `seed`, optional demo data. |

Two settings are easy to get wrong:

- `NEXT_PUBLIC_*` values are **compiled into the web image**. Changing one means `docker compose build web`, not a restart. They are `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_STORE_URL`, `NEXT_PUBLIC_PLAY_STORE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_WALLET_BADGES`.
- `API_INTERNAL_URL` is read **at run time** by the web server (compose sets `http://api:4000`): server-side rendering reaches the API over the private network, while browsers use `NEXT_PUBLIC_API_URL`.

If Docker Hub rate-limits the base images, set `NODE_IMAGE` and `POSTGRES_IMAGE` in `.env` to a mirror (for example `mirror.gcr.io/library/node:22-slim`).

## Production refuses to start without

`NODE_ENV=production` (compose sets it) makes `apps/api/src/config.ts` throw at boot, so a bad configuration fails the deploy instead of serving traffic:

1. `JWT_SECRET` and `ENCRYPTION_KEY` (`Missing required env var ...`).
2. A real file store: `STORAGE_PROVIDER=disk` or `r2`. `memory` is refused, and `r2` needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.
3. Twilio SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and one of `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM`, because customers sign in with a texted code. A **staging** server that reads the codes from `docker compose logs api` sets `ALLOW_CONSOLE_SMS=1` instead. A public launch must not.

Compose itself also refuses to start without `POSTGRES_PASSWORD`.

## First deploy, step by step

### 1. Pick the hostnames and put TLS in front

Use two public hostnames, for example `app.example.com` (web) and `api.example.com` (API). Browsers call the API directly, so both need HTTPS: the web app's session cookies are `Secure` in production (they work over plain http only on `localhost`).

1. DNS: an `A`/`AAAA` record for each hostname pointing at the server.
2. A TLS-terminating reverse proxy on the server (Caddy, nginx, a cloud load balancer) forwarding `app.example.com` to `127.0.0.1:3000` and `api.example.com` to `127.0.0.1:4000`. Caddy needs only:

   ```
   app.example.com { reverse_proxy 127.0.0.1:3000 }
   api.example.com { reverse_proxy 127.0.0.1:4000 }
   ```

3. Close ports 3000 and 4000 to the internet at the firewall (compose publishes them on all interfaces; to bind them to loopback, edit the `ports:` entries to `127.0.0.1:...`). Port 5432 is already loopback only.

### 2. Generate the secrets

```bash
cp .env.example .env && chmod 600 .env
openssl rand -hex 24      # POSTGRES_PASSWORD (hex, so the DATABASE_URL needs no escaping)
openssl rand -base64 48   # JWT_SECRET (any 32+ random characters)
openssl rand -hex 32      # ENCRYPTION_KEY (exactly 64 hex characters)
```

Put each in `.env`. Keep a copy of all three in your secret manager. `ENCRYPTION_KEY` encrypts connector credentials at rest: **if it is lost or changed, every stored POS/connector token becomes unreadable** and shops must reconnect. Changing `JWT_SECRET` signs everyone out. Changing `POSTGRES_PASSWORD` in `.env` does not change the password inside an existing `pgdata` volume (use `ALTER USER` as well).

Never commit `.env` (it is in `.gitignore`).

### 3. Set the public URLs

In `.env` (no trailing slashes, exact scheme and host):

```
PUBLIC_API_URL=https://api.example.com
PUBLIC_WEB_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SITE_URL=https://app.example.com
```

- `PUBLIC_API_URL`: webhook URLs, OAuth redirects, signed upload links, and what Twilio signs against. A wrong value breaks webhook signature checks.
- `PUBLIC_WEB_URL`: links in emails, SMS and wallet passes, and Stripe return URLs.
- `CORS_ORIGINS`: comma-separated browser origins the API accepts in production. Add the mobile-web origin if you serve one. Anything not listed is blocked by the browser.
- `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` are baked into the web image (see above).

### 4. Proxy hops and the rate limit

`TRUST_PROXY_HOPS` is the number of proxies between the internet and the API, used to read the client address from `X-Forwarded-For`. The production default is `1`, which is right for one reverse proxy. Set `0` if the API is exposed with no proxy, `2` for a CDN plus a load balancer. Too low and every visitor shares one rate-limit bucket; too high and a caller can forge an address. Do not use `true`.

The API rate limit is kept in process memory (300 requests a minute per signed-in user or per address, plus per-endpoint limits). That is correct for a **single** API container. Before running more than one replica set `RATE_LIMIT_STORE=postgres`, which moves the counters into the `rate_limit_counters` table so the limit is shared (see "Running more than one API instance").

### 5. Storage

- **Single host:** `STORAGE_PROVIDER=disk`. Uploads go to the `uploads` volume. Back that volume up (see Backups).
- **Recommended for production:** `STORAGE_PROVIDER=r2`. Create the bucket, the scoped API token, the CORS policy and the lifecycle rules as described in [storage-go-live.md](./storage-go-live.md), then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Keep the bucket private and leave `R2_PUBLIC_BASE` unset: photos are served through presigned links that expire. Allow your `PUBLIC_WEB_URL` origin in the bucket's CORS policy.

### 6. SMS, email, push

Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM`). In Twilio, point the number or messaging service's inbound webhook at `POST {PUBLIC_API_URL}/v1/webhooks/twilio/sms` (STOP/START handling; the signature is checked against that exact URL, so `PUBLIC_API_URL` must match). Set `RESEND_API_KEY` and `EMAIL_FROM` for email and `EXPO_ACCESS_TOKEN` for push; without them the API only logs the message. Details: [connectors.md](./connectors.md).

### 7. Stripe

Follow [stripe-go-live.md](./stripe-go-live.md): products and prices, Connect, the two webhook endpoints at `POST {PUBLIC_API_URL}/v1/webhooks/stripe`, then set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (both endpoint secrets, comma-separated), the four `STRIPE_PRICE_*` ids and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Do test mode first.

### 8. Build, migrate, start

```bash
docker compose build
docker compose up -d
docker compose ps          # postgres, api and web healthy; migrate "Exited (0)"
```

`up` starts Postgres, runs `migrate` to completion, then starts the API, then the web app. If the migration fails the API does not start: read `docker compose logs migrate`. (Postgres prints `NOTICE ... identifier ... will be truncated` lines during the migration; they are harmless.)

Optional demo data, only on a staging or demo server (it creates demo shops with publicly known passwords, see the README's demo logins):

```bash
docker compose --profile seed run --rm seed
```

It skips itself if the demo neighbourhood already exists. Never seed the production database. Create the first real admin by another route.

### 9. Smoke-test

Use the checklist at the end of this page.

## Migrations on each release

Migrations are plain SQL in `packages/db/migrations`, applied in order and recorded by Drizzle, so re-running is safe.

```bash
git pull
docker compose build            # rebuilds api (and web if the web or shared code changed)
docker compose run --rm migrate # apply new migrations first, while the old API still serves
docker compose up -d            # recreate api/web on the new images
```

`up -d` runs `migrate` again as a dependency (a no-op after the explicit run). Migrations in this repo are additive; read the new files in `packages/db/migrations` before a release and take a backup first if one drops or rewrites data. A migration that fails stops the release: the old containers keep running.

Rebuild `web` with a new `.env` whenever a `NEXT_PUBLIC_*` value changes.

## Running the jobs

The API runs its background jobs (scheduled messages, reminders, the `outbox.drain` retry job every 5 seconds, ad pacing, retention, `ratelimit.sweep`, and the rest in `apps/api/src/jobs`) with timers inside the server process. **They are on unless `JOBS=0`**; any other value, including unset, means on. They are always off in `NODE_ENV=test`.

Exactly one API instance should run them, otherwise every job runs once per instance. With the single `api` service in this compose file, leave `JOBS` unset. If you scale out:

- one instance (or a dedicated worker container running the same image and command) has `JOBS` unset;
- every other instance has `JOBS=0`.

The job instance does not need to be reachable from the internet. The notification outbox's fast path works on every instance, but anything that fails is only retried by the job instance, so keep it running.

## Running more than one API instance

1. Set `RATE_LIMIT_STORE=postgres` on every instance (one shared limit; one extra upsert per request).
2. `JOBS=0` on all but one.
3. Use `STORAGE_PROVIDER=r2`: the `disk` volume is local to one host.
4. Put the instances behind the load balancer and set `TRUST_PROXY_HOPS` to the number of proxies in front of them.

## Backups

Two things hold state: the `pgdata` volume (everything) and, when `STORAGE_PROVIDER=disk`, the `uploads` volume. R2 is backed up on the Cloudflare side (enable object versioning if you want undelete).

Postgres, nightly from cron on the host:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/ll-$(date +%F).dump"
```

Copy the dumps off the server and prune old ones. Test a restore on a scratch database:

```bash
docker compose exec -T postgres createdb -U ll ll_restore_test
docker compose exec -T postgres pg_restore -U ll -d ll_restore_test --no-owner < backups/ll-2026-01-01.dump
docker compose exec -T postgres dropdb -U ll ll_restore_test
```

To restore into the live database: stop `api` and `web`, drop and recreate the database, `pg_restore`, start them again. Disk uploads:

```bash
docker run --rm -v local-loyalty_uploads:/data -v "$PWD/backups:/out" alpine tar czf /out/uploads-$(date +%F).tgz -C /data .
```

Also back up `.env` (or at least the three secrets) separately from the database dumps: a restored database is useless without `ENCRYPTION_KEY`. If you move to a managed Postgres, drop the `postgres` service and replace the `DATABASE_URL` line in `docker-compose.yml` (it is built from the `POSTGRES_*` variables) with the managed connection string, and use the provider's backups.

## Logs and restarts

`docker compose logs -f api` (JSON lines; the healthcheck request appears every 15 seconds). Containers use `restart: unless-stopped`, so they come back after a crash or a reboot once Docker starts. `docker compose stop` / `down` shuts the API down cleanly (SIGTERM stops the jobs and closes the pool). Data lives in the named volumes, so `down` keeps it; `down -v` deletes it.

## Smoke-test checklist

Run after the first deploy and after each release, replacing the hosts.

Command line:

- [ ] `curl -fsS https://api.example.com/health` returns `{"ok":true,...}`.
- [ ] `curl -fsS https://api.example.com/v1/public/plans` returns plans (this reads the database).
- [ ] `curl -sI https://app.example.com/` is `200` and has `x-content-type-options: nosniff`, `x-frame-options` and `strict-transport-security`; `curl -sI https://api.example.com/health` has the same three.
- [ ] `curl -s -X POST https://api.example.com/v1/auth/otp/start -H 'content-type: application/json' -d '{"phone":"+14165550100"}'` returns `{"sent":true,...}` with **no `devCode`** field (it must never appear in production).
- [ ] A CORS preflight from the web origin returns `access-control-allow-origin: https://app.example.com`, and from any other origin returns no `access-control-allow-origin` header: `curl -si -X OPTIONS https://api.example.com/v1/public/plans -H 'origin: https://app.example.com' -H 'access-control-request-method: GET'`.
- [ ] `docker compose ps`: `postgres`, `api` and `web` are `healthy`; `migrate` exited 0.

Browser:

- [ ] The home page loads with styling and no console errors; `/pricing` and a shop page such as `/shops/<slug>` render.
- [ ] Sign in with a real owner account at `/login` (email and password): you land on the dashboard `/m/<id>` and it shows the shop.
- [ ] A customer phone sign-in: the code arrives by SMS (Twilio), and the sign-in box is **not** pre-filled.
- [ ] Open a repair ticket photo or any upload: it loads (storage works). On R2 the link carries `X-Amz-Signature`.
- [ ] Send a test event from Stripe (Developers, Webhooks) and confirm a 200 (see the Stripe checklist).
- [ ] Wait a minute and check `docker compose logs api` for `[job ...]` errors, which would mean jobs are failing.

Resilience:

- [ ] `docker compose restart` brings everything back healthy and you are still signed in.
- [ ] `docker compose down && docker compose up -d` keeps the data (same shops, members and uploads).
- [ ] Break a required secret in a copy of `.env` (remove `JWT_SECRET`): the API exits with `Missing required env var JWT_SECRET` instead of starting.

## Known limits

- No Content-Security-Policy yet; the web app sends `nosniff`, `X-Frame-Options: SAMEORIGIN`, a referrer policy and HSTS, the API `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and HSTS.
- The web server's server-side calls to the API arrive from one address. Signed-in calls are limited per user, but anonymous server-side renders share one per-address bucket of 300 a minute; the home and marketing pages are cached for 5 minutes, which keeps this far below the limit at launch scale. Watch for 429s in `docker compose logs web` as traffic grows.
- The API runs from TypeScript source under `tsx`; start-up takes a few seconds longer than compiled JavaScript.
