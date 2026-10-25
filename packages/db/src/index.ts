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
  return Object.assign(db, { $close: () => client.end() });
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

/**
 * A freshly migrated throw-away database on a real PostgreSQL server (same driver and pool as production), dropped by `$close`.
 * `adminUrl` points at any database on the server the caller may CREATE DATABASE on. Used by the API test suite when
 * TEST_PG_URL is set, to check what PGlite cannot (driver parameter handling, pooled connections).
 */
export async function createDisposablePgDb(adminUrl: string): Promise<Db> {
  const name = `ll_t_${Math.random().toString(16).slice(2, 14)}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const url = adminUrl.replace(/\/[^/?]*(\?.*)?$/, `/${name}$1`);
  await migrateDb(url);
  const db = createDb(url, { max: 5 });
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
