#!/usr/bin/env bash
# Whole Playwright suite in one command, against a fresh seed and a production build:
#
#   pnpm --filter web e2e:full            (from the repo root)
#
# What it does: seeds a fresh PGlite database, starts the API (NODE_ENV=test: relaxed rate limit), builds the web app
# for production, starts `next start`, runs EVERY spec in e2e/ in one Playwright run, then stops both servers.
# A fresh database every run is what makes the suite repeatable: some specs use one-time tokens (review links) and
# change shared state (plans, overrides), so a second run on the same database is not supported.
#
# Overrides (all optional):
#   API_PORT=4100  WEB_PORT=3100  NEXT_DIST_DIR=.next-e2e  E2E_DB_DIR=<dir for the throw-away database>
#   E2E_DATABASE_URL=postgres://...  run against real Postgres instead (the database is dropped and recreated, then migrated)
#   PW_ARGS="e2e/web-pass.spec.ts"   run only some specs (still against the fresh stack)
#   PW_RETRIES=0                     Playwright retries (default 0: a flaky test fails the run; PW_ARGS="--retries=N" also works, it comes later)
#   E2E_CLOCK_WEEKDAY=wed            weekday the shops' promos think it is (mon..sun, default wed; "real" = real time).
#                                    Pinecone's double-stamp promos run Tuesdays and weekdays 2-4 pm; the default keeps
#                                    stamp/point deltas the same on every day the suite runs.
#   SKIP_BUILD=1                     reuse the existing production build in NEXT_DIST_DIR (built against the same API port)
#
# Specs write screenshots under e2e/screenshots (tracked). Restore them afterwards with
# `git checkout -- apps/web/e2e/screenshots && git clean -fd apps/web/e2e/screenshots` unless you meant to update them.
set -euo pipefail

cd "$(dirname "$0")/../../.."
ROOT="$PWD"
API_PORT="${API_PORT:-4100}"
WEB_PORT="${WEB_PORT:-3100}"
DIST="${NEXT_DIST_DIR:-.next-e2e}"
DB_DIR="${E2E_DB_DIR:-$(mktemp -d -t ll-e2e-XXXXXX)}"
LOG_DIR="${E2E_LOG_DIR:-$DB_DIR}"
API_URL="http://localhost:$API_PORT"
WEB_URL="http://localhost:$WEB_PORT"
PIDS=()

kill_tree() { # pid: stop it and everything it started (pnpm/npx wrap the real server)
  local kid
  for kid in $(ps -eo pid=,ppid= | awk -v p="$1" '$2 == p { print $1 }'); do kill_tree "$kid"; done
  kill "$1" 2>/dev/null || true
}

# next build/start add a custom dist dir to these two files; put them back afterwards.
WEB_CONFIG_BACKUP="$(mktemp -d)"
cp apps/web/tsconfig.json apps/web/next-env.d.ts "$WEB_CONFIG_BACKUP/"

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill_tree "$pid"
  done
  cp "$WEB_CONFIG_BACKUP/tsconfig.json" "$WEB_CONFIG_BACKUP/next-env.d.ts" "$ROOT/apps/web/" 2>/dev/null || true
  rm -rf "$WEB_CONFIG_BACKUP"
  # The throw-away database (~60 MB) goes; the logs next to it stay.
  [ -z "${E2E_DB_DIR:-}" ] && rm -rf "$DB_DIR/pg"
  return 0
}
trap cleanup EXIT INT TERM

wait_for() { # url, label, seconds
  for _ in $(seq 1 "$3"); do
    if curl -fsS -o /dev/null "$1" 2>/dev/null; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for $2 ($1); see $LOG_DIR" >&2
  exit 1
}

for port in "$API_PORT" "$WEB_PORT"; do
  if curl -s -o /dev/null "http://localhost:$port/" 2>/dev/null; then
    echo "port $port is already in use; set API_PORT / WEB_PORT" >&2
    exit 1
  fi
done

# Promo clock (apps/api/src/lib/testClock.ts): demo promos run on Tuesdays and weekday afternoons, so the API reads the
# weekday and hour of promos from a fixed instant (11:00 Toronto on E2E_CLOCK_WEEKDAY, default Wednesday) in every run.
# Everything else (seeds, tokens, the browser) stays on real time.
case "${E2E_CLOCK_WEEKDAY:-wed}" in
  mon) PROMO_DAY=05 ;; tue) PROMO_DAY=06 ;; wed) PROMO_DAY=07 ;; thu) PROMO_DAY=08 ;;
  fri) PROMO_DAY=09 ;; sat) PROMO_DAY=10 ;; sun) PROMO_DAY=11 ;;
  real) PROMO_DAY="" ;;
  *) echo "E2E_CLOCK_WEEKDAY must be mon..sun or real" >&2; exit 1 ;;
esac
if [ -n "$PROMO_DAY" ] && [ -z "${TEST_PROMO_NOW:-}" ]; then TEST_PROMO_NOW="2026-01-${PROMO_DAY}T16:00:00Z"; fi # 11:00 EST
[ -n "${TEST_PROMO_NOW:-}" ] && export TEST_PROMO_NOW
echo "==> promo clock: ${TEST_PROMO_NOW:-real time}"

if [ -n "${E2E_DATABASE_URL:-}" ]; then
  # Recreate the named database from the server's maintenance database, then migrate it.
  DB_NAME="${E2E_DATABASE_URL##*/}"; DB_NAME="${DB_NAME%%\?*}"
  ADMIN_URL="${E2E_DATABASE_URL%/*}/postgres"
  psql "$ADMIN_URL" -qc "drop database if exists \"$DB_NAME\" with (force)" -c "create database \"$DB_NAME\""
  export DATABASE_URL="$E2E_DATABASE_URL"
  echo "==> migrating $DB_NAME"
  pnpm --filter @ll/db migrate > "$LOG_DIR/migrate.log" 2>&1
else
  rm -rf "$DB_DIR/pg"
  export DATABASE_URL="pglite://$DB_DIR/pg"
fi
export PUBLIC_API_URL="$API_URL" PUBLIC_WEB_URL="$WEB_URL"

echo "==> seeding a fresh database ($DATABASE_URL)"
pnpm --filter @ll/api seed > "$LOG_DIR/seed.log" 2>&1

echo "==> starting the API on $API_URL"
NODE_ENV=test PORT="$API_PORT" pnpm --filter @ll/api start > "$LOG_DIR/api.log" 2>&1 &
PIDS+=("$!")
wait_for "$API_URL/v1/public/plans" "the API" 120

if [ -z "${SKIP_BUILD:-}" ]; then
  echo "==> building the web app for production ($DIST)"
  NEXT_DIST_DIR="$DIST" NEXT_PUBLIC_API_URL="$API_URL" API_INTERNAL_URL="$API_URL" NEXT_PUBLIC_SITE_URL="$WEB_URL" pnpm --filter web build > "$LOG_DIR/build.log" 2>&1
fi

echo "==> starting the web app on $WEB_URL"
(cd apps/web && NEXT_DIST_DIR="$DIST" NEXT_PUBLIC_API_URL="$API_URL" API_INTERNAL_URL="$API_URL" NEXT_PUBLIC_SITE_URL="$WEB_URL" OTP_AUTOFILL=1 PORT="$WEB_PORT" npx next start --port "$WEB_PORT" > "$LOG_DIR/web.log" 2>&1 & echo $! > "$LOG_DIR/web.pid")
PIDS+=("$(cat "$LOG_DIR/web.pid")")
wait_for "$WEB_URL/" "the web app" 120

echo "==> running every spec in apps/web/e2e"
cd apps/web
set +e
# shellcheck disable=SC2086
E2E_WEB_URL="$WEB_URL" E2E_API_URL="$API_URL" npx playwright test --retries="${PW_RETRIES:-0}" ${PW_ARGS:-}
status=$?
set -e
echo "==> done (exit $status); logs in $LOG_DIR"
exit $status
