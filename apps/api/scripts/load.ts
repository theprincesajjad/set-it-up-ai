/**
 * Quick load check, no k6: 50 concurrent users against the PGlite API.
 *
 *   pnpm --filter @ll/api load                       # fresh seeded PGlite, in-process API, ~15 s per scenario
 *   pnpm --filter @ll/api load -- --users 1,50 --seconds 20 --customers 1500 --label before
 *   pnpm --filter @ll/api load -- --label x --customers 600 --trace   # every statement of one lookup, award (request) and the outbox delivery
 *
 * Scenarios
 *   stamp  the counter path a café runs all day: look the customer up by code, then award a stamp (two requests).
 *   menu   the public menu page data: GET /v1/public/shops/:slug/menu.
 *
 * Seeding 600 customers takes minutes. `--seed-only <dir>` seeds once and exits; `--from <dir>` copies that database to a temporary
 * directory and runs against the copy, so every run (and a before/after comparison) starts from identical data.
 *
 * `--pg postgres://user@host:port/db` runs against a real PostgreSQL (postgres-js, a pool of 10: the production driver) instead of
 * PGlite, which is the honest place to read latency. Seed one database (`--seed-only pg`), copy it per run with
 * `CREATE DATABASE x TEMPLATE seeded`, and run with `--from pg` so the run does not seed again. The index check is PGlite-only.
 *
 * `--users` takes a list ("1,50"): each level runs against the same seeded database. The stamp scenario runs twice per level when
 * the API has the after-commit outbox: "request only" (next-tick delivery off, so the numbers are the request's own; the backlog is
 * drained afterwards and reported separately) and "with fast path" (production behaviour: delivery runs right behind each request,
 * so its queries and its contention are in the numbers).
 *
 * Reports p50 / p95 / p99 and error count per scenario, plus what the database did: queries per request, the
 * statements repeated most often per request (an N+1 shows up as a statement run once per row) and any query
 * that cannot use an index (re-planned with sequential scans disabled; a Seq Scan left in the plan has no index).
 * PGlite runs one query at a time, so the p95 under 50 users is mostly queueing: every query we remove shortens it.
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createDb, createPgliteDb, migrateDb } from "@ll/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createProviders } from "../src/providers/index.js";
import { seedDemo, DEMO_CREDENTIALS } from "../src/seed/demo.js";
import { loyaltyPrograms, merchantMembers, merchants, users } from "@ll/db";
import { eq } from "drizzle-orm";

const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const USER_LEVELS = arg("users", "1,50").split(",").map(Number);
let USERS = USER_LEVELS[0]!;
const SECONDS = Number(arg("seconds", "15"));
const CUSTOMERS = Number(arg("customers", "1500"));
const LABEL = arg("label", "run");
const SEED_ONLY = arg("seed-only", "");
/** A real PostgreSQL (postgres-js, the production driver and pool) instead of PGlite: --pg postgres://user@host:port/dbname */
const PG = arg("pg", "");
const FROM = arg("from", "");

type Stmt = { text: string; ms: number };
const log: Stmt[] = [];
let counting = false;

function instrument(client: { query: (...a: never[]) => Promise<unknown>; transaction: (fn: (tx: never) => Promise<unknown>) => Promise<unknown> }) {
  const wrap = (obj: { query: (...a: never[]) => Promise<unknown> }) => {
    const orig = obj.query.bind(obj);
    obj.query = (async (...a: never[]) => {
      const t0 = performance.now();
      try {
        return await orig(...a);
      } finally {
        if (counting) {
          log.push({ text: String((a as unknown[])[0]), ms: performance.now() - t0 });
          if (process.env.LOAD_STACK && String((a as unknown[])[0]).includes(process.env.LOAD_STACK)) console.log("STACK", new Error().stack?.split("\n").filter((l) => l.includes("apps/api/src")).slice(0, 5).map((l) => l.trim().replace(/.*apps\/api\/src\//, "")).join(" <- "));
        }
      }
    }) as never;
  };
  wrap(client);
  const tx = client.transaction.bind(client);
  client.transaction = ((fn: (t: never) => Promise<unknown>) =>
    tx(async (t: never) => {
      wrap(t as never);
      return fn(t);
    })) as never;
}

/** Same counting for a real server (postgres-js): drizzle sends every statement through `unsafe`, in a transaction through the handle `begin` gives it. */
function instrumentPg(client: { unsafe: (...a: never[]) => unknown; begin: (...a: never[]) => Promise<unknown> }) {
  const wrap = (obj: { unsafe: (...a: never[]) => unknown }) => {
    const orig = obj.unsafe.bind(obj);
    obj.unsafe = ((...a: never[]) => {
      if (counting) {
        const t0 = performance.now();
        const text = String((a as unknown[])[0]);
        const q = orig(...a) as { then: (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => unknown };
        void Promise.resolve(q).then(
          () => log.push({ text, ms: performance.now() - t0 }),
          () => log.push({ text, ms: performance.now() - t0 }),
        );
        return q;
      }
      return orig(...a);
    }) as never;
  };
  wrap(client);
  const begin = client.begin.bind(client);
  client.begin = ((...a: unknown[]) => {
    const fn = a[a.length - 1] as (t: never) => Promise<unknown>;
    a[a.length - 1] = (t: never) => {
      wrap(t as never);
      return fn(t);
    };
    return (begin as (...x: unknown[]) => Promise<unknown>)(...a);
  }) as never;
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};
const ms = (n: number) => `${n.toFixed(0)} ms`;

/** Which statements cannot use an index at all? Re-plan each one with sequential scans off; a Seq Scan left in the plan has no index to use. */
async function findUnindexed(db: unknown, statements: string[]) {
  if (PG) return { tables: new Map<string, string>(), explained: 0, skipped: 0, size: 0 }; // the index check re-plans through PGlite
  const client = (db as { $client: { query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, string>[] }>; exec: (s: string) => Promise<{ rows: Record<string, string>[] }[]> } }).$client;
  await client.exec("SET enable_seqscan = off");
  const tables = new Map<string, string>();
  let explained = 0;
  let skipped = 0;
  for (const sql of new Set(statements)) {
    if (!/^\s*(select|update|delete)/i.test(sql)) continue;
    try {
      // The simple-query protocol accepts $n placeholders in a GENERIC_PLAN explain.
      const r = await client.exec(`EXPLAIN (GENERIC_PLAN) ${sql}`);
      explained++;
      const plan = r.flatMap((x) => x.rows).map((x) => Object.values(x)[0]).join("\n");
      for (const line of plan.split("\n")) {
        const mm = /Seq Scan on (\w+)/.exec(line);
        if (mm) tables.set(mm[1]!, sql.slice(0, 220));
      }
    } catch (e) {
      skipped++;
      if (process.env.LOAD_DEBUG) console.log(`skip: ${(e as Error).message} :: ${sql.slice(0, 120)}`);
    }
  }
  await client.exec("RESET enable_seqscan");
  return { tables, explained, skipped, size: tables.size };
}

async function main() {
  const dir = SEED_ONLY || mkdtempSync(join(tmpdir(), "ll-load-"));
  if (FROM && !PG) {
    if (!existsSync(FROM)) throw new Error(`--from ${FROM}: no such directory (create it with --seed-only)`);
    cpSync(FROM, dir, { recursive: true });
  }
  let db: Awaited<ReturnType<typeof createPgliteDb>>;
  if (PG) {
    await migrateDb(PG);
    db = createDb(PG, { max: 10 });
  } else db = await createPgliteDb(dir);
  // Seeding delivers the outbox inline (the test default); the runs below switch to production behaviour (the request does
  // not wait for the side effects). Older builds have no outbox and ignore all of this.
  const config = { ...loadConfig({ NODE_ENV: "test" }) };
  const outboxApi = await import("../src/services/outbox.js").catch(() => null);
  const hasOutbox = !!outboxApi && !!(config as { outbox?: unknown }).outbox;
  const setFastPath = (on: boolean) => {
    if (hasOutbox) (config as unknown as { outbox: { inline: boolean; fastPath: boolean } }).outbox = { inline: false, fastPath: on };
  };
  const ctx = { db, config, providers: createProviders(config), now: () => new Date() };
  if (!FROM) {
    console.log(`seeding ${CUSTOMERS} customers ...`);
    await seedDemo(db, { config, customers: CUSTOMERS, log: () => {} });
  }
  if (SEED_ONLY) {
    await db.$close();
    console.log(`seeded ${SEED_ONLY}`);
    return;
  }
  setFastPath(false);
  const app = await buildApp(ctx as never);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  if (PG) instrumentPg((db as unknown as { $client: never }).$client);
  else instrument((db as unknown as { $client: never }).$client);

  const http = async (method: string, path: string, token?: string, body?: unknown) => {
    const t0 = performance.now();
    const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, ms: performance.now() - t0, json: text ? JSON.parse(text) : null };
  };

  const login = await http("POST", "/v1/auth/login", undefined, { email: DEMO_CREDENTIALS.ownerEmail("pinecone-coffee"), password: DEMO_CREDENTIALS.ownerPassword });
  const token = login.json.accessToken as string;
  const mine = await http("GET", "/v1/merchants", token);
  const merchantId = mine.json.items[0].id as string;
  const [m] = await db.select({ slug: merchants.slug }).from(merchants).where(eq(merchants.id, merchantId));
  const members = await db.select({ code: users.memberCode }).from(merchantMembers).innerJoin(users, eq(users.id, merchantMembers.userId)).where(eq(merchantMembers.merchantId, merchantId)).limit(500);
  const codes = members.map((r) => r.code).filter((c): c is string => !!c);
  // The visit cooldown would turn every repeat stamp into a fast 409 and flatter the numbers (members are re-used once they run out).
  await db.update(loyaltyPrograms).set({ visitCooldownMinutes: 0 }).where(eq(loyaltyPrograms.merchantId, merchantId));
  if (!codes.length) throw new Error("no members to stamp");

  // --trace: print every statement one lookup, one award and one menu read run, to see where the queries come from.
  if (process.argv.includes("--trace")) {
    const code = codes[0]!;
    const steps: [string, () => Promise<unknown>][] = [
      ["lookup", () => http("GET", `/v1/merchants/${merchantId}/counter/lookup?q=${encodeURIComponent(`LL:${code}`)}`, token)],
      ["award", () => http("POST", `/v1/merchants/${merchantId}/counter/award`, token, { memberCode: code, amountCents: 450, idempotencyKey: `trace-${Math.random().toString(36).slice(2)}` })],
      ["menu", () => http("GET", `/v1/public/shops/${m!.slug}/menu`)],
    ];
    const seen: string[] = [];
    setFastPath(false);
    if (hasOutbox) steps.splice(2, 0, ["outbox delivery (after commit, one award)", async () => outboxApi!.drainOutbox(ctx as never)]);
    for (const [name, run] of steps) {
      log.length = 0;
      counting = true;
      const res = (await run()) as { status?: number; json?: unknown } | undefined;
      counting = false;
      if (res?.status && res.status >= 400) console.log(`!! ${name} answered ${res.status}: ${JSON.stringify(res.json)}`);
      seen.push(...log.map((q) => q.text.replace(/\s+/g, " ")));
      console.log(`\n-- ${name}: ${log.length} queries`);
      for (const q of log) console.log(`  ${q.ms.toFixed(1).padStart(5)} ms  ${q.text.replace(/\s+/g, " ").slice(0, 170)}`);
    }
    const un = await findUnindexed(db, seen);
    console.log(`\n== no usable index (${un.explained} statements planned, ${un.skipped} skipped): ${un.size ? "" : "none"}`);
    for (const [t, q] of un.tables) console.log(`  ${t}: ${q}`);
    await app.close();
    await db.$close();
    if (!PG) rmSync(dir, { recursive: true, force: true });
    return;
  }

  type Result = { status: number; ms: number; tag?: string };
  async function scenario(name: string, once: (user: number, n: number) => Promise<Result[]>) {
    log.length = 0;
    counting = true;
    const lat: number[] = [];
    const byTag = new Map<string, number[]>();
    let errors = 0;
    let conflicts = 0;
    let requests = 0;
    const end = performance.now() + SECONDS * 1000;
    await Promise.all(
      Array.from({ length: USERS }, async (_, u) => {
        for (let n = 0; performance.now() < end; n++) {
          for (const r of await once(u, n)) {
            requests++;
            lat.push(r.ms);
            if (r.tag) byTag.set(r.tag, [...(byTag.get(r.tag) ?? []), r.ms]);
            if (r.status === 409) conflicts++;
            else if (r.status >= 400) errors++;
          }
        }
      }),
    );
    counting = false;
    const queries = log.length;
    const byText = new Map<string, { n: number; ms: number }>();
    for (const q of log) {
      const k = q.text.replace(/\s+/g, " ");
      const cur = byText.get(k) ?? { n: 0, ms: 0 };
      cur.n++;
      cur.ms += q.ms;
      byText.set(k, cur);
    }
    const top = [...byText.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
    console.log(`\n== ${name} [${LABEL}] ${USERS} users, ${SECONDS}s`);
    console.log(`requests ${requests}  errors ${errors}  409s ${conflicts}  throughput ${(requests / SECONDS).toFixed(1)}/s`);
    console.log(`latency  p50 ${ms(pct(lat, 50))}  p95 ${ms(pct(lat, 95))}  p99 ${ms(pct(lat, 99))}  max ${ms(Math.max(...lat))}`);
    for (const [tag, xs] of byTag) console.log(`  ${tag.padEnd(7)} p50 ${ms(pct(xs, 50))}  p95 ${ms(pct(xs, 95))}  (${xs.length} requests)`);
    console.log(`database ${queries} queries = ${(queries / requests).toFixed(1)} per request, ${(log.reduce((a, q) => a + q.ms, 0) / Math.max(1, queries)).toFixed(2)} ms each`);
    for (const [text, v] of top) console.log(`  ${(v.n / requests).toFixed(2)}/req  ${text.slice(0, 150)}`);
    return { lat, byTag, perRequest: queries / requests, requests, statements: [...byText.keys()] };
  }

  let awardSeq = 0;
  const stampOnce = async (u: number, n: number): Promise<Result[]> => {
    const code = codes[awardSeq++ % codes.length]!;
    const a = await http("GET", `/v1/merchants/${merchantId}/counter/lookup?q=${encodeURIComponent(`LL:${code}`)}`, token);
    const b = await http("POST", `/v1/merchants/${merchantId}/counter/award`, token, { memberCode: code, amountCents: 450, idempotencyKey: `load-${LABEL}-${u}-${n}-${Math.random().toString(36).slice(2)}` });
    return [{ ...a, tag: "lookup" }, { ...b, tag: "award" }];
  };

  const summary: string[] = [];
  const statements: string[] = [];
  for (const level of USER_LEVELS) {
    USERS = level;
    // Request only: the side effects are queued (durably) but not delivered while the clock runs; then drained and measured.
    // Without an outbox (older builds) this is simply the stamp scenario, with the side effects inside the request.
    setFastPath(false);
    const req = await scenario(hasOutbox ? "stamp (lookup + award), request only" : "stamp (lookup + award)", stampOnce);
    statements.push(...req.statements);
    let drainNote = "";
    if (hasOutbox) {
      log.length = 0;
      counting = true;
      const t0 = performance.now();
      const r = await outboxApi!.drainOutbox(ctx as never);
      const took = performance.now() - t0;
      counting = false;
      const events = r.done + r.retried + r.dead;
      console.log(`outbox   backlog drained afterwards: ${events} events (${r.dead} dead, ${r.retried} retried) in ${(took / 1000).toFixed(1)} s, ${log.length} queries = ${(log.length / Math.max(1, events)).toFixed(1)} per event`);
      statements.push(...log.map((q) => q.text.replace(/\s+/g, " ")));
      drainNote = `, side effects ${(log.length / Math.max(1, events)).toFixed(1)} queries/award in the outbox`;
    }
    const awards = req.byTag.get("award") ?? [];
    summary.push(`${level} user${level > 1 ? "s" : ""}: award p50 ${ms(pct(awards, 50))} p95 ${ms(pct(awards, 95))}, stamp request ${req.perRequest.toFixed(1)} queries/request avg over lookup+award${drainNote}`);
    if (hasOutbox) {
      setFastPath(true);
      const fast = await scenario("stamp (lookup + award), with outbox fast path (production)", stampOnce);
      await new Promise((r) => setTimeout(r, 500));
      await outboxApi!.drainOutbox(ctx as never);
      const fa = fast.byTag.get("award") ?? [];
      summary.push(`${level} user${level > 1 ? "s" : ""} with fast path: award p50 ${ms(pct(fa, 50))} p95 ${ms(pct(fa, 95))}, ${fast.perRequest.toFixed(1)} queries/request incl. the delivery running alongside`);
      statements.push(...fast.statements);
    }
  }
  USERS = USER_LEVELS[USER_LEVELS.length - 1]!;
  const menu = await scenario("public menu", async () => [await http("GET", `/v1/public/shops/${m!.slug}/menu`)]);
  statements.push(...menu.statements);

  const unindexed = await findUnindexed(db, statements);
  console.log(`\n== tables read without a usable index in these paths: ${unindexed.size ? "" : "none"}  (${unindexed.explained} statements planned, ${unindexed.skipped} skipped)`);
  for (const [t, q] of unindexed.tables) console.log(`  ${t}: ${q}`);

  console.log(`\nSUMMARY ${LABEL}:`);
  for (const line of summary) console.log(`  ${line}`);
  console.log(`  public menu: p95 ${ms(pct(menu.lat, 95))} (${menu.perRequest.toFixed(1)} queries/req) at ${USERS} users`);
  await app.close();
  await db.$close();
  if (!PG) rmSync(dir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
