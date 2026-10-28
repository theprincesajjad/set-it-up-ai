import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users, type Db } from "@ll/db";
import { createTestEnv, type TestEnv } from "./helpers.js";

/**
 * A JS Date written straight into a raw sql`` template skips drizzle's column mapper. PGlite accepts it; the postgres-js driver used in
 * production did not (ERR_INVALID_ARG_TYPE, a 500). createDb now serializes Dates for every database. Run with TEST_PG_URL to check
 * the real driver; this must stay green there.
 */
describe("Date parameters in raw sql templates", () => {
  let env: TestEnv;
  let db: Db;
  beforeAll(async () => {
    env = await createTestEnv();
    db = env.db;
  });
  afterAll(async () => {
    await env.close();
  });

  it("compares a column to a Date, coalesce included, and casts a Date", async () => {
    const d = new Date("2030-01-02T03:04:05.000Z");
    await db.insert(users).values({ email: "date-param@example.com", name: "Date Param" });
    const a = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`coalesce(${users.deletedAt}, ${users.createdAt}) < ${d}`);
    expect(a[0]!.n).toBeGreaterThanOrEqual(0);
    const b = await db.execute(sql`select ${d}::timestamptz as t`);
    const row = (Array.isArray(b) ? b[0] : (b as { rows: unknown[] }).rows[0]) as { t: Date | string };
    expect(new Date(row.t).toISOString()).toBe(d.toISOString());
  });
});
