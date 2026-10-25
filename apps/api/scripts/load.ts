/**
 * Quick load check, no k6: 50 concurrent users against the PGlite API.
 *
 *   pnpm --filter @ll/api load                       # fresh seeded PGlite, in-process API, ~15 s per scenario
 *   pnpm --filter @ll/api load -- --users 50 --seconds 20 --customers 1500 --label before
 *
 * Scenarios
 *   stamp  the counter path a café runs all day: look the customer up by code, then award a stamp (two requests).
 *   menu   the public menu page data: GET /v1/public/shops/:slug/menu.
 *
 * Reports p50 / p95 / p99 and error count per scenario, plus what the database did: queries per request, the
 * statements repeated most often per request (an N+1 shows up as a statement run once per row) and any query
 * that cannot use an index (re-planned with sequential scans disabled; a Seq Scan left in the plan has no index).
 * PGlite runs one query at a time, so the p95 under 50 users is mostly queueing: every query we remove shortens it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createPgliteDb } from "@ll/db";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createProviders } from "../src/providers/index.js";
import { seedDemo, DEMO_CREDENTIALS } from "../src/seed/demo.js";
import { merchantMembers, merchants, users } from "@ll/db";
import { eq } from "drizzle-orm";

const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const USERS = Number(arg("users", "50"));
const SECONDS = Number(arg("seconds", "15"));
const CUSTOMERS = Number(arg("customers", "1500"));
const LABEL = arg("label", "run");

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

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};
const ms = (n: number) => `${n.toFixed(0)} ms`;

/** Which statements cannot use an index at all? Re-plan each one with sequential scans off; a Seq Scan left in the plan has no index to use. */
async function findUnindexed(db: unknown, statements: string[]) {
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
  const dir = mkdtempSync(join(tmpdir(), "ll-load-"));
  const db = await createPgliteDb(dir);
  const config = { ...loadConfig({ NODE_ENV: "test" }) };
  const ctx = { db, config, providers: createProviders(config), now: () => new Date() };
  console.log(`seeding ${CUSTOMERS} customers ...`);
  await seedDemo(db, { config, customers: CUSTOMERS, log: () => {} });
  const app = await buildApp(ctx as never);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  instrument((db as unknown as { $client: never }).$client);

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
    for (const [name, run] of steps) {
      log.length = 0;
      counting = true;
      await run();
      counting = false;
      seen.push(...log.map((q) => q.text.replace(/\s+/g, " ")));
      console.log(`\n-- ${name}: ${log.length} queries`);
      for (const q of log) console.log(`  ${q.ms.toFixed(1).padStart(5)} ms  ${q.text.replace(/\s+/g, " ").slice(0, 170)}`);
    }
    const un = await findUnindexed(db, seen);
    console.log(`\n== no usable index (${un.explained} statements planned, ${un.skipped} skipped): ${un.size ? "" : "none"}`);
    for (const [t, q] of un.tables) console.log(`  ${t}: ${q}`);
    await app.close();
    await db.$close();
    rmSync(dir, { recursive: true, force: true });
    return;
  }

  async function scenario(name: string, once: (user: number, n: number) => Promise<{ status: number; ms: number }[]>) {
    log.length = 0;
    counting = true;
    const lat: number[] = [];
    let errors = 0;
    let requests = 0;
    const end = performance.now() + SECONDS * 1000;
    await Promise.all(
      Array.from({ length: USERS }, async (_, u) => {
        for (let n = 0; performance.now() < end; n++) {
          for (const r of await once(u, n)) {
            requests++;
            lat.push(r.ms);
            if (r.status >= 400 && r.status !== 409) errors++;
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
    console.log(`requests ${requests}  errors ${errors}  throughput ${(requests / SECONDS).toFixed(1)}/s`);
    console.log(`latency  p50 ${ms(pct(lat, 50))}  p95 ${ms(pct(lat, 95))}  p99 ${ms(pct(lat, 99))}  max ${ms(Math.max(...lat))}`);
    console.log(`database ${queries} queries = ${(queries / requests).toFixed(1)} per request, ${(log.reduce((a, q) => a + q.ms, 0) / Math.max(1, queries)).toFixed(2)} ms each`);
    for (const [text, v] of top) console.log(`  ${(v.n / requests).toFixed(2)}/req  ${text.slice(0, 150)}`);
    return { p95: pct(lat, 95), perRequest: queries / requests, statements: [...byText.keys()] };
  }

  const stamp = await scenario("stamp (lookup + award)", async (u, n) => {
    const code = codes[(u * 7 + n) % codes.length]!;
    const a = await http("GET", `/v1/merchants/${merchantId}/counter/lookup?q=${encodeURIComponent(`LL:${code}`)}`, token);
    const b = await http("POST", `/v1/merchants/${merchantId}/counter/award`, token, { memberCode: code, amountCents: 450, idempotencyKey: `load-${LABEL}-${u}-${n}-${Math.random().toString(36).slice(2)}` });
    return [a, b];
  });
  const menu = await scenario("public menu", async () => [await http("GET", `/v1/public/shops/${m!.slug}/menu`)]);

  const unindexed = await findUnindexed(db, [...stamp.statements, ...menu.statements]);
  console.log(`\n== tables read without a usable index in these paths: ${unindexed.size ? "" : "none"}  (${unindexed.explained} statements planned, ${unindexed.skipped} skipped)`);
  for (const [t, q] of unindexed.tables) console.log(`  ${t}: ${q}`);

  console.log(`\nSUMMARY ${LABEL}: stamp p95 ${ms(stamp.p95)} (${stamp.perRequest.toFixed(1)} queries/req), menu p95 ${ms(menu.p95)} (${menu.perRequest.toFixed(1)} queries/req)`);
  await app.close();
  await db.$close();
  rmSync(dir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
