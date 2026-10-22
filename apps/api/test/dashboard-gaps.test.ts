/** Gaps found by the dashboard team: SMS receipts toggle, BIA neighbourhoods, customer filters + privacy, test sends, points liability, admin names. */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, featureOverrides, merchantMembers, merchantStaff, merchants, messageDeliveries, neighbourhoodManagers, pushTokens, rewards, users } from "@ll/db";
import { awardPurchase } from "../src/services/ledger.js";
import { flushReceipts } from "../src/services/staff.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv, grantFeatures } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await flushReceipts();
  await env.close();
});

type Method = "GET" | "POST" | "PATCH" | "PUT";
const call = (method: Method, url: string, token?: string, payload?: unknown) =>
  env.app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function shop(opts: Parameters<typeof createMerchant>[1] = {}) {
  const m = await createMerchant(env, opts);
  // Pricing v2: email/push campaigns and CSV export are Plus; these shops are pilots (admin overrides).
  await grantFeatures(env, m.merchant.id, ["marketing.email", "customers.csv_export"]);
  const staffUser = await createUser(env.db, { name: "Jo Staff" });
  await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: staffUser.id, role: "staff" });
  const manager = await createUser(env.db, { name: "Max Manager", email: `max${Date.now()}${Math.random()}@example.com` });
  await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: manager.id, role: "manager" });
  return { ...m, manager, base: `/v1/merchants/${m.merchant.id}`, staffToken: await tokenFor(env, staffUser), managerToken: await tokenFor(env, manager) };
}

const consent = { text: "Yes, send me offers", source: "counter" };

describe("PATCH /merchants/:id smsReceiptsEnabled", () => {
  it("owner/manager can toggle it, it is returned on the profile, staff cannot", async () => {
    const s = await shop();
    expect((await call("GET", s.base, s.staffToken)).json().merchant.smsReceiptsEnabled).toBe(false);
    const on = await call("PATCH", s.base, s.managerToken, { smsReceiptsEnabled: true });
    expect(on.statusCode).toBe(200);
    expect(on.json().merchant.smsReceiptsEnabled).toBe(true);
    const [row] = await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    expect(row!.smsReceiptsEnabled).toBe(true);
    expect((await call("PATCH", s.base, s.ownerToken, { smsReceiptsEnabled: false })).json().merchant.smsReceiptsEnabled).toBe(false);
    expect((await call("PATCH", s.base, s.staffToken, { smsReceiptsEnabled: true })).statusCode).toBe(403);
    expect((await call("PATCH", s.base, s.ownerToken, { smsReceiptsEnabled: "yes" })).statusCode).toBe(400);
  });
});

describe("BIA neighbourhoods", () => {
  it("GET /me/neighbourhoods-managed returns managed hoods (admins: all)", async () => {
    const a = await createNeighbourhood(env.db, "aaa-hood");
    await createNeighbourhood(env.db, "bbb-hood");
    const bia = await createUser(env.db, { name: "Bia" });
    await env.db.insert(neighbourhoodManagers).values({ neighbourhoodId: a.id, userId: bia.id });
    const admin = await createUser(env.db, { platformRole: "admin" });
    const nobody = await createUser(env.db);

    const mine = await call("GET", "/v1/me/neighbourhoods-managed", await tokenFor(env, bia));
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items.map((h: { slug: string }) => h.slug)).toEqual(["aaa-hood"]);
    expect(mine.json().items[0]).toMatchObject({ id: a.id, name: "aaa-hood", shopCount: 0 });
    expect((await call("GET", "/v1/me/neighbourhoods-managed", await tokenFor(env, admin))).json().items.map((h: { slug: string }) => h.slug)).toEqual(["aaa-hood", "bbb-hood"]);
    expect((await call("GET", "/v1/me/neighbourhoods-managed", await tokenFor(env, nobody))).json().items).toEqual([]);
    expect((await call("GET", "/v1/me/neighbourhoods-managed")).statusCode).toBe(401);
  });

  it("GET /admin/neighbourhoods/:id/merchants lists every shop on the strip for admins and that hood's manager", async () => {
    const hood = await createNeighbourhood(env.db);
    const other = await createNeighbourhood(env.db);
    const a = await createMerchant(env, { neighbourhoodId: hood.id });
    await env.db.update(merchants).set({ name: "Zed Cafe", activatedAt: env.clock.now }).where(eq(merchants.id, a.merchant.id));
    const b = await createMerchant(env, { neighbourhoodId: hood.id });
    await env.db.update(merchants).set({ name: "Abe Books", status: "onboarding" }).where(eq(merchants.id, b.merchant.id));
    await createMerchant(env, { neighbourhoodId: other.id });
    const bia = await createUser(env.db);
    await env.db.insert(neighbourhoodManagers).values({ neighbourhoodId: hood.id, userId: bia.id });
    const biaToken = await tokenFor(env, bia);
    const admin = await createUser(env.db, { platformRole: "admin" });

    const r = await call("GET", `/v1/admin/neighbourhoods/${hood.id}/merchants`, biaToken);
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toEqual([
      { id: b.merchant.id, name: "Abe Books", slug: b.merchant.slug, vertical: "pharmacy", status: "onboarding", activated: false, activatedAt: null, logoUrl: null },
      { id: a.merchant.id, name: "Zed Cafe", slug: a.merchant.slug, vertical: "pharmacy", status: "active", activated: true, activatedAt: env.clock.now.toISOString(), logoUrl: null },
    ]);
    expect((await call("GET", `/v1/admin/neighbourhoods/${other.id}/merchants`, biaToken)).statusCode).toBe(403);
    expect((await call("GET", `/v1/admin/neighbourhoods/${other.id}/merchants`, await tokenFor(env, admin))).json().items).toHaveLength(1);
    expect((await call("GET", `/v1/admin/neighbourhoods/00000000-0000-4000-8000-000000000000/merchants`, await tokenFor(env, admin))).statusCode).toBe(404);
    expect((await call("GET", `/v1/admin/neighbourhoods/${hood.id}/merchants`, a.ownerToken)).statusCode).toBe(403);
    expect((await call("GET", `/v1/admin/neighbourhoods/${hood.id}/merchants`)).statusCode).toBe(401);
  });
});

describe("customers: total, filters, masked phones, reveal, export audit", () => {
  async function seed() {
    const s = await shop();
    const mk = async (name: string, opts: { consent?: boolean; muted?: boolean; joined?: Date } = {}) => {
      const phone = nextPhone();
      const r = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone, customerName: name, source: "staff_app", amountCents: 1000, consent: opts.consent ? consent : null });
      const set: Partial<typeof merchantMembers.$inferInsert> = {};
      if (opts.muted) set.muted = true;
      if (opts.joined) set.createdAt = opts.joined;
      if (Object.keys(set).length) await env.db.update(merchantMembers).set(set).where(eq(merchantMembers.id, r.member.id));
      return { ...r.member, phone };
    };
    const old = new Date("2026-01-01T00:00:00Z");
    const opted = await mk("Opted", { consent: true, joined: new Date("2026-10-30T12:00:00Z") });
    const mutedOpted = await mk("MutedOpted", { consent: true, muted: true, joined: old });
    const plain = await mk("Plain", { joined: old });
    return { s, opted, mutedOpted, plain };
  }

  it("returns total and applies joinedAfter / consent / muted server-side", async () => {
    const { s, opted, mutedOpted, plain } = await seed();
    const list = async (q: string) => (await call("GET", `${s.base}/customers?${q}`, s.staffToken)).json();
    const ids = (r: { items: { memberId: string }[] }) => r.items.map((i) => i.memberId).sort();

    const all = await list("limit=2");
    expect(all.total).toBe(3);
    expect(all.items).toHaveLength(2);
    expect(all.nextCursor).not.toBeNull();
    expect((await list(`limit=2&cursor=${all.nextCursor}`)).total).toBe(3);

    const recent = await list("joinedAfter=2026-10-01");
    expect(recent.total).toBe(1);
    expect(ids(recent)).toEqual([opted.id]);
    expect((await list(`joinedAfter=${encodeURIComponent("2026-10-30T13:00:00Z")}`)).total).toBe(0);
    expect(ids(await list("consent=opted_in"))).toEqual([opted.id]);
    expect(ids(await list("consent=not"))).toEqual([mutedOpted.id, plain.id].sort());
    expect(ids(await list("muted=true"))).toEqual([mutedOpted.id]);
    expect((await list("muted=false")).total).toBe(2);
    expect((await list("consent=not&muted=false")).total).toBe(1);
    expect((await call("GET", `${s.base}/customers?consent=maybe`, s.staffToken)).statusCode).toBe(400);
    expect((await call("GET", `${s.base}/customers?joinedAfter=yesterday`, s.staffToken)).statusCode).toBe(400);
  });

  it("masks phones in list and detail; reveal is manager+ and audit-logged; counter lookup stays masked", async () => {
    const { s, opted } = await seed();
    const d = opted.phone.replace(/\D/g, "");
    const masked = `(${d.slice(1, 4)}) ***-${d.slice(7)}`;
    const list = (await call("GET", `${s.base}/customers?q=Opted`, s.staffToken)).json();
    expect(list.items.find((i: { memberId: string }) => i.memberId === opted.id).phone).toBe(masked);
    expect(JSON.stringify(list)).not.toContain(opted.phone);
    // search by digits still works against the full number
    expect((await call("GET", `${s.base}/customers?phoneLast4=${d.slice(-4)}`, s.staffToken)).json().items[0].memberId).toBe(opted.id);
    const detail = await call("GET", `${s.base}/customers/${opted.id}`, s.staffToken);
    expect(detail.json().customer.phone).toBe(masked);
    expect(detail.body).not.toContain(opted.phone);

    expect((await call("POST", `${s.base}/customers/${opted.id}/reveal-phone`, s.staffToken)).statusCode).toBe(403);
    const rev = await call("POST", `${s.base}/customers/${opted.id}/reveal-phone`, s.managerToken);
    expect(rev.statusCode).toBe(200);
    expect(rev.json()).toEqual({ memberId: opted.id, phone: opted.phone });
    const logs = await env.db.select().from(auditLogs).where(and(eq(auditLogs.merchantId, s.merchant.id), eq(auditLogs.action, "customer.phone_revealed")));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorUserId: s.manager.id, entity: "member", entityId: opted.id });

    const other = await shop();
    expect((await call("POST", `${other.base}/customers/${opted.id}/reveal-phone`, other.managerToken)).statusCode).toBe(404);

    const look = await call("GET", `${s.base}/counter/lookup?q=${d.slice(-4)}`, s.staffToken);
    expect(look.statusCode).toBe(200);
    expect(look.body).not.toContain(opted.phone);
  });

  it("audit-logs customer and transaction CSV exports", async () => {
    const { s } = await seed();
    const csv = await call("GET", `${s.base}/customers/export.csv?consent=opted_in`, s.ownerToken);
    expect(csv.statusCode).toBe(200);
    const tx = await call("GET", `${s.base}/activity/export.csv`, s.managerToken);
    expect(tx.statusCode).toBe(200);
    const logs = await env.db.select().from(auditLogs).where(eq(auditLogs.merchantId, s.merchant.id));
    const exp = logs.find((l) => l.action === "customers.exported");
    expect(exp).toMatchObject({ actorUserId: s.owner.id, entityId: s.merchant.id });
    expect(exp!.data).toMatchObject({ filters: { consent: "opted_in" } });
    expect(logs.find((l) => l.action === "transactions.exported")).toMatchObject({ actorUserId: s.manager.id });
    expect((await call("GET", `${s.base}/customers/export.csv`, s.staffToken)).statusCode).toBe(403);
  });
});

describe("POST /messages/:id/test", () => {
  async function draft(s: Awaited<ReturnType<typeof shop>>, channel: "email" | "sms" | "push") {
    const r = await call("POST", `${s.base}/messages`, s.managerToken, { channel, subject: channel === "email" ? "Hi {{first_name}}" : undefined, body: "Hello {{first_name}}, you have {{balance}} points" });
    expect(r.statusCode).toBe(201);
    return r.json().id as string;
  }

  it("emails only the requesting staff user, with the footer, outside campaign stats", async () => {
    const s = await shop();
    // A consented member who must NOT get the test
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), customerName: "Member", source: "staff_app", amountCents: 1000, consent });
    const id = await draft(s, "email");
    const before = env.ctx.providers.outbox.email.length;
    const r = await call("POST", `${s.base}/messages/${id}/test`, s.managerToken);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ channel: "email", sent: 1, to: [s.manager.email], smsCreditsUsed: 0, testsRemainingToday: 9 });
    const sent = env.ctx.providers.outbox.email.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(s.manager.email);
    expect(sent[0]!.subject).toBe("[Test] Hi Max");
    expect(sent[0]!.text).toContain("Hello Max, you have 0 points");
    expect(sent[0]!.text).toContain("Sent by Test Shop");
    expect(sent[0]!.text).toContain("Unsubscribe:");
    const dels = await env.db.select().from(messageDeliveries).where(eq(messageDeliveries.merchantId, s.merchant.id));
    expect(dels).toHaveLength(1);
    expect(dels[0]).toMatchObject({ messageId: null, userId: s.manager.id, kind: "transactional" });
    const detail = (await call("GET", `${s.base}/messages/${id}`, s.managerToken)).json();
    expect(detail.status).toBe("draft");
    expect(detail.stats.sent).toBe(0);
    expect((await call("POST", `${s.base}/messages/${id}/test`, s.staffToken)).statusCode).toBe(403);
  });

  it("SMS test uses exactly one credit; push goes to my devices; 400 without an address", async () => {
    const s = await shop();
    await env.db.insert(featureOverrides).values({ merchantId: s.merchant.id, key: "marketing.sms", enabled: true, reason: "pilot" });
    const sms = await draft(s, "sms");
    const r = await call("POST", `${s.base}/messages/${sms}/test`, s.managerToken);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ channel: "sms", sent: 1, to: [s.manager.phone], smsCreditsUsed: 1 });
    const last = env.ctx.providers.outbox.sms.at(-1)!;
    expect(last.to).toBe(s.manager.phone);
    expect(last.body).toContain("Reply STOP to opt out");
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    expect(m!.smsCreditsUsed).toBe(1);

    const push = await draft(s, "push");
    expect((await call("POST", `${s.base}/messages/${push}/test`, s.managerToken)).statusCode).toBe(400);
    await env.db.insert(pushTokens).values([{ userId: s.manager.id, token: "ExponentPushToken[a]", platform: "ios" }, { userId: s.manager.id, token: "ExponentPushToken[b]", platform: "android" }]);
    const p = await call("POST", `${s.base}/messages/${push}/test`, s.managerToken);
    expect(p.json()).toMatchObject({ channel: "push", sent: 2 });

    await env.db.update(users).set({ email: null }).where(eq(users.id, s.manager.id));
    const email = await draft(s, "email");
    expect((await call("POST", `${s.base}/messages/${email}/test`, s.managerToken)).statusCode).toBe(400);
  });

  it("is rate-limited to 10 per user per day", async () => {
    const s = await shop();
    const id = await draft(s, "email");
    for (let i = 0; i < 10; i++) expect((await call("POST", `${s.base}/messages/${id}/test`, s.managerToken)).statusCode).toBe(200);
    const limited = await call("POST", `${s.base}/messages/${id}/test`, s.managerToken);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("rate_limited");
    // the owner has their own allowance
    await env.db.update(users).set({ email: "owner-test@example.com" }).where(eq(users.id, s.owner.id));
    expect((await call("POST", `${s.base}/messages/${id}/test`, s.ownerToken)).statusCode).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 25 * 3600_000);
    expect((await call("POST", `${s.base}/messages/${id}/test`, await tokenFor(env, s.manager))).statusCode).toBe(200);
  });
});

describe("reports overview: points liability", () => {
  it("sums outstanding balances and values them at the cheapest amount_off reward's cents-per-point", async () => {
    const s = await shop();
    // createMerchant's reward: $5 off for 50 points (10 c/pt). Cheaper reward: $1 off for 20 points (5 c/pt).
    await env.db.insert(rewards).values({ merchantId: s.merchant.id, name: "$1 off", pointsCost: 20, rewardType: "amount_off", value: 100 });
    await env.db.insert(rewards).values({ merchantId: s.merchant.id, name: "Free coffee", pointsCost: 10, rewardType: "free_item", value: 0 });
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 3000 });
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1500 });
    const u = await createUser(env.db);
    await env.db.insert(merchantMembers).values({ merchantId: s.merchant.id, userId: u.id });

    const r = await call("GET", `${s.base}/reports/overview`, s.managerToken);
    expect(r.statusCode).toBe(200);
    expect(r.json().pointsLiability).toEqual({
      outstandingPoints: 45,
      membersWithBalance: 2,
      centsPerPoint: 5,
      estimatedValueCents: 225,
      basisReward: { id: expect.any(String), name: "$1 off", pointsCost: 20, valueCents: 100 },
    });
  });

  it("has no dollar estimate without an amount_off reward", async () => {
    const s = await shop();
    await env.db.update(rewards).set({ active: false }).where(eq(rewards.merchantId, s.merchant.id));
    const r = (await call("GET", `${s.base}/reports/overview`, s.ownerToken)).json();
    expect(r.pointsLiability).toEqual({ outstandingPoints: 0, membersWithBalance: 0, centsPerPoint: null, estimatedValueCents: null, basisReward: null });
  });
});

describe("admin features updatedByName", () => {
  it("returns the admin's name next to updatedBy", async () => {
    const admin = await createUser(env.db, { platformRole: "admin", name: "Ada Admin" });
    const token = await tokenFor(env, admin);
    const before = (await call("GET", "/v1/admin/features", token)).json().items.find((f: { key: string }) => f.key === "campaigns.neighbourhood");
    expect(before.updatedByName).toBeNull();
    const r = await call("PUT", "/v1/admin/features/campaigns.neighbourhood/stage", token, { stage: "beta" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ updatedBy: admin.id, updatedByName: "Ada Admin" });
  });
});
