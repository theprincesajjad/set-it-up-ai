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
 * In-process Postgres (PGlite, WASM) with all migrations applied. Used by the
 * test suites and by `DATABASE_URL=pglite://memory` local dev so nobody needs a
 * running Postgres server to work on the app.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dataDir);
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
