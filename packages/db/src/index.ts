import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { schema };

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

/** Postgres connection for production / local dev against a real server. */
export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, { max: opts.max ?? 10, prepare: false });
  const db = drizzlePg(client, { schema });
  acceptDateParams(client);
  return Object.assign(db, { $close: () => client.end() });
}

/**
 * drizzle-orm's postgres-js driver replaces the date/time serializers with a pass-through, because column mappers already turn a
 * Date into a string. A Date written straight into a raw sql`` template (sql`${col} < ${date}`) never goes through a column mapper,
 * so postgres-js then fails with ERR_INVALID_ARG_TYPE (PGlite accepts it, which hides the bug). Serialize Dates to ISO strings
 * here, after drizzle has installed its serializers, so a Date is a valid parameter on every database.
 */
function acceptDateParams(client: postgres.Sql) {
  const serializers = client.options.serializers as Record<number, (x: unknown) => unknown>;
  for (const oid of [1082, 1114, 1184]) {
    const prev = serializers[oid];
    serializers[oid] = (x) => (x instanceof Date ? x.toISOString() : prev ? prev(x) : x);
  }
}

export type Db = ReturnType<typeof createDb>;
/** Either a Db or a transaction handle; services accept both. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export async function migrateDb(url: string) {
  const client = postgres(url, { max: 1 });
  try {
    await migratePg(drizzlePg(client), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}

/** A key for the current set of migrations: a changed or added migration gets a new template database. */
function migrationsKey(): string {
  const hash = createHash("sha1");
  for (const name of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort()) hash.update(name).update(readFileSync(join(MIGRATIONS_DIR, name)));
  hash.update(readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json")));
  return hash.digest("hex").slice(0, 12);
}

/**
 * A freshly migrated throw-away database on a real PostgreSQL server (same driver and pool as production), dropped by `$close`.
 * `adminUrl` points at any database on the server the caller may CREATE DATABASE on. Used by the API test suite when
 * TEST_PG_URL is set, to check what PGlite cannot (driver parameter handling, pooled connections).
 *
 * Migrating 30-odd files for every test file is slow and, with several workers at once, slow enough to time out the setup hook.
 * So the migrations run once into a template database (named after a hash of the migrations, kept between runs) and each throw-away
 * database is a copy of it, which takes a fraction of a second. Postgres refuses to copy a template two sessions are using, and two
 * workers must not build it twice, so both steps run under one advisory lock.
 */
export async function createDisposablePgDb(adminUrl: string): Promise<Db> {
  const name = `ll_t_${Math.random().toString(16).slice(2, 14)}`;
  const template = `ll_tpl_${migrationsKey()}`;
  const withDb = (db: string) => adminUrl.replace(/\/[^/?]*(\?.*)?$/, `/${db}$1`);
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  const LOCK = 727_001;
  await admin`select pg_advisory_lock(${LOCK})`;
  try {
    const [have] = await admin`select 1 as one from pg_database where datname = ${template}`;
    if (!have) {
      const building = `${template}_b${Math.random().toString(16).slice(2, 8)}`;
      await admin.unsafe(`create database ${building}`);
      await migrateDb(withDb(building));
      await admin.unsafe(`alter database ${building} rename to ${template}`);
    }
    await admin.unsafe(`create database ${name} template ${template}`);
  } finally {
    await admin`select pg_advisory_unlock(${LOCK})`;
  }
  const db = createDb(withDb(name), { max: 5 });
  const close = db.$close;
  db.$close = async () => {
    await close();
    await admin.unsafe(`drop database if exists ${name} with (force)`);
    await admin.end();
  };
  return db;
}

/**
 * In-process Postgres (PGlite, WASM) with all migrations applied. Used by the
 * test suites and by `DATABASE_URL=pglite://memory` local dev so nobody needs a
 * running Postgres server to work on the app.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  // btree_gist backs the appointments overlap guard (an exclusion constraint on staff_id + time range).
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const client = await PGlite.create({ ...(dataDir ? { dataDir } : {}), extensions: { btree_gist } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  // The pglite and postgres-js drizzle instances share the same query API.
  return Object.assign(db, { $close: () => client.close() }) as unknown as Db;
}

/** Resolve DATABASE_URL: postgres://... or pglite://memory or pglite://./path */
export async function connect(url: string | undefined): Promise<Db> {
  if (!url || url.startsWith("pglite://")) {
    const dir = url?.slice("pglite://".length);
    return createPgliteDb(!dir || dir === "memory" ? undefined : dir);
  }
  return createDb(url);
}
