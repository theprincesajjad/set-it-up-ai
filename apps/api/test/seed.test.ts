import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ledgerEntries, leads, merchantCategories, merchantMembers, merchants, neighbourhoods, networkPerks, promos, users, visits } from "@ll/db";
import { DEMO_CREDENTIALS, seedDemo } from "../src/seed.js";
import { ledgerBalance } from "../src/services/ledger.js";
import { createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
let result: Awaited<ReturnType<typeof seedDemo>>;
// One seeded DB for the whole file (seeding is the slow part); tests only read.
beforeAll(async () => {
  env = await createTestEnv({ now: new Date() });
  result = await seedDemo(env.db, { customers: 30, days: 45, config: env.ctx.config });
}, 120_000);
afterAll(async () => env.close());

describe("seedDemo", () => {
  it("creates the Toronto demo network", async () => {
    expect(result.skipped).toBe(false);
    const hoods = await env.db.select().from(neighbourhoods);
    expect(hoods.map((h) => h.slug).sort()).toEqual(["leslieville", "roncesvalles", "the-danforth"]);
    expect(hoods.find((h) => h.slug === "roncesvalles")!.status).toBe("pilot");
    const ms = await env.db.select().from(merchants);
    expect(ms.length).toBeGreaterThanOrEqual(15);
    const verticals = new Set(ms.map((m) => m.vertical));
    for (const v of ["cafe", "bakery", "pharmacy", "repair_electronics", "repair_auto", "salon", "barber", "florist", "bookstore", "pet", "restaurant", "dry_cleaning"]) expect(verticals).toContain(v);
    expect(ms.every((m) => m.slug && m.description)).toBe(true);
    expect(ms.filter((m) => m.repUserId).length).toBeGreaterThan(5);
    const [perk] = await env.db.select().from(networkPerks);
    expect(perk).toMatchObject({ threshold: 3, bonusPoints: 50 });
    expect((await env.db.select().from(promos)).length).toBeGreaterThanOrEqual(5);
    expect((await env.db.select().from(leads)).length).toBe(result.leads);
    expect(result.visits).toBeGreaterThan(30);
  });

  it("Pricing v2: pilot shops show promos via admin overrides; other shops' promos stay hidden", async () => {
    expect(result.pilotOverrides.map((p) => p.slug)).toEqual(["pinecone-coffee", "hearth-and-crumb", "village-apothecary"]);
    const page = (slug: string) => env.app.inject({ method: "GET", url: `/v1/public/shops/${slug}` }).then((r) => r.json());
    const cafe = await page("pinecone-coffee");
    expect(cafe.features).toMatchObject({ promos: true, discountCards: true });
    expect(cafe.promos.map((p: { title: string }) => p.title)).toContain("Two-stamp Tuesdays");
    // Nonna's has a scheduled event promo in the DB, but it isn't a pilot: hidden.
    const nonnas = await page("nonnas-table");
    expect(nonnas.features.promos).toBe(false);
    expect(nonnas.promos).toEqual([]);
  });

  it("pharmacy prescriptions are no-earn", async () => {
    const [pharmacy] = await env.db.select().from(merchants).where(eq(merchants.slug, "village-apothecary"));
    const cats = await env.db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, pharmacy!.id));
    expect(cats.find((c) => c.name === "Prescriptions")).toMatchObject({ earnEligible: false, discountEligible: false });
  });

  it("keeps the ledger valid: entries sum to zero and cached balances match", async () => {
    const [sum] = await env.db.select({ s: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` }).from(ledgerEntries);
    expect(Number(sum!.s)).toBe(0);
    const members = await env.db.select().from(merchantMembers);
    expect(members.length).toBeGreaterThan(20);
    for (const m of members) expect(await ledgerBalance(env.db, m.id)).toBe(m.balance);
    // Some members hold 2+ shops (network effect).
    const [multi] = await env.db.select({ n: sql<number>`count(*)::int` }).from(sql`(select user_id from merchant_members group by user_id having count(*) >= 2) t`);
    expect(Number(multi!.n)).toBeGreaterThan(0);
  });

  it("back-dates history across the window", async () => {
    const [range] = await env.db.select({ min: sql<Date>`min(${visits.createdAt})`, max: sql<Date>`max(${visits.createdAt})` }).from(visits);
    const spanDays = (new Date(range!.max).getTime() - new Date(range!.min).getTime()) / 86400000;
    expect(spanDays).toBeGreaterThan(20);
  });

  it("demo admin can sign in and is an admin", async () => {
    const [admin] = await env.db.select().from(users).where(eq(users.email, DEMO_CREDENTIALS.admin.email));
    expect(admin!.platformRole).toBe("admin");
    const r = await env.app.inject({ method: "POST", url: "/v1/auth/login", payload: DEMO_CREDENTIALS.admin });
    expect(r.statusCode).toBe(200);
    const owner = await env.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: DEMO_CREDENTIALS.ownerEmail("pinecone-coffee"), password: DEMO_CREDENTIALS.ownerPassword } });
    expect(owner.statusCode).toBe(200);
    expect(result.credentials.find((c) => c.role === "rep")!.email).toBe(DEMO_CREDENTIALS.rep.email);
  });

  it("is idempotent (second run skips)", async () => {
    const before = await env.db.select({ n: sql<number>`count(*)::int` }).from(merchants);
    const again = await seedDemo(env.db, { customers: 5 });
    expect(again.skipped).toBe(true);
    const after = await env.db.select({ n: sql<number>`count(*)::int` }).from(merchants);
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});
