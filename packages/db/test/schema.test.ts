import { describe, expect, it } from "vitest";
import { createPgliteDb, merchants, users } from "../src/index.js";

describe("schema", () => {
  it("migrates and round-trips a merchant", async () => {
    const db = await createPgliteDb();
    const [u] = await db.insert(users).values({ phone: "+14165550100", memberCode: "ABC123" }).returning();
    const [m] = await db.insert(merchants).values({ slug: "test-cafe", name: "Test Café", vertical: "cafe", repUserId: u!.id }).returning();
    expect(m!.plan).toBe("free");
    expect(m!.status).toBe("onboarding");
    await db.$close();
  }, 60_000); // migrates a fresh PGlite database from 0000 (about 6 s alone, more under load), like migrations.test.ts
});
