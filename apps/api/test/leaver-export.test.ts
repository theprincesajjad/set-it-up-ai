import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, merchants } from "@ll/db";
import { RETENTION } from "@ll/shared";
import { setMerchantStatus } from "../src/services/admin.js";
import { recomputePlan } from "../src/services/billing.js";
import { exportWindow } from "../src/services/leaver-export.js";
import { call, paidMerchant, setPlan } from "./commerce-fixtures.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
const DAY = 86_400_000;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => env.close());

type Shop = { merchant: { id: string }; ownerToken: string; owner: { id: string; platformRole: "none" | "rep" | "admin" } };
/** The clock moves past the access-token lifetime in these tests: mint a fresh owner token. */
const fresh = async (m: Shop): Promise<Shop> => ({ ...m, ownerToken: await tokenFor(env, m.owner) });
/** CSV responses are not JSON, so these go straight to inject. */
const csv = async (m: Shop, path: string, token = m.ownerToken) => {
  const r = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/${path}`, headers: { authorization: `Bearer ${token}` } });
  return { status: r.statusCode, headers: r.headers };
};
const members = (m: Shop) => csv(m, "customers/export.csv");
const visits = (m: Shop) => csv(m, "activity/export.csv");
const window = (m: { merchant: { id: string }; ownerToken: string }) => call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/customers/export-window`);

describe("CSV export after leaving (merchant agreement 2.1)", () => {
  it("a Free shop that has not left still needs Café & Retail for the CSV", async () => {
    const m = await paidMerchant(env, { plan: "free", connect: false });
    expect((await members(m)).status).toBe(402);
    expect((await visits(m)).status).toBe(402);
    expect((await window(m)).body).toEqual({ leftAt: null, until: null });
  });

  it("a paid shop exports as before", async () => {
    const m = await paidMerchant(env, { plan: "plus", connect: false });
    expect((await members(m)).status).toBe(200);
    expect((await visits(m)).status).toBe(200);
  });

  it("after a downgrade to Free the owner can export members and visits for 90 days, then not", async () => {
    const m = await paidMerchant(env, { plan: "plus", connect: false });
    expect((await members(m)).status).toBe(200);
    await setPlan(env, m.merchant.id, "free");
    expect((await members(m)).status).toBe(402); // moved to Free with no record of leaving yet: no window
    await setPlan(env, m.merchant.id, "plus");
    await recomputePlan(env.ctx, m.merchant.id); // no live subscription: falls back to Free and writes billing.plan_changed
    const [mm] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
    expect(mm!.plan).toBe("free");
    // audit rows are stamped by the database clock; line them up with the test clock
    await env.db.update(auditLogs).set({ createdAt: env.clock.now }).where(eq(auditLogs.action, "billing.plan_changed"));

    const open = await members(m);
    expect(open.status).toBe(200);
    expect(open.headers["content-type"]).toContain("text/csv");
    expect((await visits(m)).status).toBe(200);
    const w = (await window(m)).body;
    expect(new Date(w.until).getTime() - new Date(w.leftAt).getTime()).toBe(RETENTION.leaverExportDays * DAY);

    env.clock.now = new Date(env.clock.now.getTime() + (RETENTION.leaverExportDays - 1) * DAY);
    expect((await members(await fresh(m))).status).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 2 * DAY);
    const late = await fresh(m);
    expect((await members(late)).status).toBe(402);
    expect((await visits(late)).status).toBe(402);
    expect((await window(late)).body.until).toBeNull();
  });

  it("after the shop closes the owner can export for 90 days, whatever the plan was", async () => {
    const m = await paidMerchant(env, { plan: "free", connect: false });
    const admin = await createUser(env.db, { platformRole: "admin" });
    await setMerchantStatus(env.ctx, admin.id, m.merchant.id, "closed", "owner asked");
    await env.db.update(auditLogs).set({ createdAt: env.clock.now }).where(eq(auditLogs.action, "merchant.status_changed"));
    expect((await members(m)).status).toBe(200);
    expect((await visits(m)).status).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 91 * DAY);
    expect((await members(await fresh(m))).status).toBe(402);
  });

  it("only a manager or owner can use the window, and only for their own shop", async () => {
    const m = await paidMerchant(env, { plan: "plus", connect: false });
    const other = await paidMerchant(env, { plan: "free", connect: false });
    await setPlan(env, m.merchant.id, "free");
    await env.db.insert(auditLogs).values({ merchantId: m.merchant.id, action: "billing.plan_changed", entity: "subscription", data: { from: "plus", to: "free" }, createdAt: env.clock.now });
    expect((await members(m)).status).toBe(200);
    expect((await csv(m, "customers/export.csv", other.ownerToken)).status).toBe(403);
    expect((await members(other)).status).toBe(402);
  });

  it("exportWindow reads the latest leaving event", async () => {
    const m = await paidMerchant(env, { plan: "free", connect: false });
    const at = new Date(env.clock.now.getTime() - 10 * DAY);
    await env.db.insert(auditLogs).values([
      { merchantId: m.merchant.id, action: "billing.plan_changed", entity: "subscription", data: { from: "free", to: "plus" }, createdAt: new Date(at.getTime() - 30 * DAY) },
      { merchantId: m.merchant.id, action: "billing.plan_changed", entity: "subscription", data: { from: "plus", to: "free" }, createdAt: at },
    ]);
    const w = await exportWindow(env.db, m.merchant);
    expect(w.leftAt?.getTime()).toBe(at.getTime());
  });
});
