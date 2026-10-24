import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPgliteDb } from "../src/index.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };

describe("migrations", () => {
  it("the journal lists every SQL file, in order, with a snapshot each", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    expect(journal.entries.map((e) => `${e.tag}.sql`)).toEqual(files);
    journal.entries.forEach((e, i) => expect(e.idx).toBe(i));
    for (const e of journal.entries) expect(readdirSync(join(dir, "meta"))).toContain(`${String(e.idx).padStart(4, "0")}_snapshot.json`);
  });

  it("a fresh database migrates from 0000 to the latest cleanly", async () => {
    const db = await createPgliteDb();
    const applied = (await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)) as unknown as { rows?: { n: number }[] } | { n: number }[];
    const n = Array.isArray(applied) ? applied[0]!.n : applied.rows![0]!.n;
    expect(n).toBe(journal.entries.length);
    // Spot checks from the latest migrations (0010 to 0014).
    for (const table of ["merchant_occasions"]) {
      const r = (await db.execute(sql`select to_regclass(${`public.${table}`}) as t`)) as unknown as { rows?: { t: string | null }[] } | { t: string | null }[];
      expect((Array.isArray(r) ? r[0]! : r.rows![0]!).t).toBe(table);
    }
    await db.$close();
  }, 120_000);
});
