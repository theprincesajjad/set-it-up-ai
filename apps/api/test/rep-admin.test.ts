import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, invoices, leadActivities, leads, merchants, neighbourhoods, orders, subscriptions, supportSessions } from "@ll/db";
import { atRiskShops, subscriptionMrrCents } from "../src/services/admin-ops.js";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ activationThreshold: 2 });
});
afterEach(async () => env.close());
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const DAY = 86400000;
async function person(role: "rep" | "admin", name: string) {
  const u = await createUser(env.db, { name, email: `${name.toLowerCase().replace(/\s/g, "")}${Math.random().toString(36).slice(2, 6)}@example.com`, platformRole: role });
  return { user: u, token: await tokenFor(env, u) };
}
const call = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, token: string, payload?: unknown) => env.app.inject({ method, url, headers: auth(token), payload: payload as never });

async function streetOf(hoodId: string, addresses: string[]) {
  const ids: string[] = [];
  for (const [i, a] of addresses.entries()) {
    const [l] = await env.db.insert(leads).values({ businessName: `Shop ${i}`, address: a, neighbourhoodId: hoodId, stage: "new", source: "street" }).returning({ id: leads.id });
    ids.push(l!.id);
  }
  return ids;
}

describe("rep street day", () => {
  it("lists one area's open shops in walking order and tracks today's outcomes", async () => {
    const rep = await person("rep", "Rita Rep");
    const hood = await createNeighbourhood(env.db, "gerrard");
    await env.db.update(neighbourhoods).set({ streetDayOn: "2026-11-03", streetDayRepId: rep.user.id, targetShops: 30 }).where(eq(neighbourhoods.id, hood.id));
    const ids = await streetOf(hood.id, ["1440 Gerrard St E", "1431 Gerrard St E", "1436 Gerrard St E", "1433 Gerrard St E"]);
    // A lead in another area and a signed one never show up.
    const other = await createNeighbourhood(env.db, "elsewhere");
    await streetOf(other.id, ["9 Other St"]);
    await env.db.insert(leads).values({ businessName: "Already signed", address: "1442 Gerrard St E", neighbourhoodId: hood.id, stage: "signed" });

    const day = (await call("GET", "/v1/rep/street-day", rep.token)).json();
    expect(day.area).toMatchObject({ name: "gerrard", streetDayOn: "2026-11-03", targetShops: 30 });
    expect(day.stops.map((s: { address: string }) => s.address)).toEqual(["1431 Gerrard St E", "1433 Gerrard St E", "1440 Gerrard St E", "1436 Gerrard St E"]);
    expect(day.stops.map((s: { order: number }) => s.order)).toEqual([1, 2, 3, 4]);
    expect(day.counts).toMatchObject({ total: 4, visited: 0, left: 4 });

    const first = day.stops[0].id;
    const r = await call("POST", `/v1/rep/leads/${first}/outcome`, rep.token, { outcome: "not_in", clientId: "dev1-0001-aaaa" });
    expect(r.statusCode).toBe(201);
    expect(r.json().lead).toMatchObject({ stage: "contacted", assignedRepId: rep.user.id });
    const after = (await call("GET", "/v1/rep/street-day", rep.token)).json();
    expect(after.counts).toMatchObject({ total: 4, visited: 1, notIn: 1, left: 3 });
    expect(after.stops.at(-1)).toMatchObject({ id: first, todayOutcome: "not_in", order: null });
    expect(ids).toHaveLength(4);
  });

  it("records each outcome with its stage and next action, and replays are idempotent", async () => {
    const rep = await person("rep", "Rita Rep");
    const hood = await createNeighbourhood(env.db);
    const [a, b, c, d] = await streetOf(hood.id, ["1 A St", "3 A St", "5 A St", "7 A St"]);
    const out = (id: string, body: object) => call("POST", `/v1/rep/leads/${id}/outcome`, rep.token, body);

    const come = (await out(a!, { outcome: "come_back", clientId: "client-come-0001" })).json().lead;
    expect(come.stage).toBe("contacted");
    expect(new Date(come.nextActionAt).getTime()).toBe(env.clock.now.getTime() + 2 * DAY);

    const when = new Date(env.clock.now.getTime() + 3 * DAY).toISOString();
    const setup = (await out(b!, { outcome: "setup_call", clientId: "client-setup-001", setupAt: when, setupChannel: "whatsapp" })).json().lead;
    expect(setup).toMatchObject({ stage: "visit_booked", setupChannel: "whatsapp" });
    expect(new Date(setup.setupAt).toISOString()).toBe(when);

    const lost = (await out(c!, { outcome: "not_interested", clientId: "client-lost-0001" })).json().lead;
    expect(lost).toMatchObject({ stage: "lost", nextActionAt: null });
    const audits = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "lead.stage_changed"));
    expect(audits.some((x) => x.entityId === c)).toBe(true);

    const signed = (await out(d!, { outcome: "signed_up", clientId: "client-sign-0001", lat: 43.67, lng: -79.35 })).json().lead;
    expect(signed).toMatchObject({ stage: "contacted", lat: 43.67, lng: -79.35 });

    // Replaying the same client id records nothing new.
    const again = await out(a!, { outcome: "come_back", clientId: "client-come-0001" });
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe("duplicate");
    const acts = await env.db.select().from(leadActivities).where(eq(leadActivities.leadId, a!));
    expect(acts).toHaveLength(1);
    expect((await out(a!, { outcome: "dance", clientId: "client-bad-00001" })).statusCode).toBe(400);
    expect((await out(a!, { outcome: "not_in", clientId: "short" })).statusCode).toBe(400);
  });

  it("syncs a queue recorded offline, in order, with one row per client id", async () => {
    const rep = await person("rep", "Rita Rep");
    const other = await person("rep", "Sam Other");
    const hood = await createNeighbourhood(env.db);
    const [a, b] = await streetOf(hood.id, ["1 A St", "3 A St"]);
    const mine = await env.db.insert(leads).values({ businessName: "Sam's", stage: "new", assignedRepId: other.user.id }).returning({ id: leads.id });
    const items = [
      { leadId: a!, outcome: "not_in", clientId: "offline-0001-aaa", at: new Date(env.clock.now.getTime() - 3600000).toISOString() },
      { leadId: b!, outcome: "come_back", clientId: "offline-0002-aaa" },
      { leadId: mine[0]!.id, outcome: "not_in", clientId: "offline-0003-aaa" },
    ];
    const first = (await call("POST", "/v1/rep/outcomes/sync", rep.token, { items })).json();
    expect(first.results.map((r: { status: string }) => r.status)).toEqual(["recorded", "recorded", "not_found"]);
    const second = (await call("POST", "/v1/rep/outcomes/sync", rep.token, { items: items.slice(0, 2) })).json();
    expect(second.results.map((r: { status: string }) => r.status)).toEqual(["duplicate", "duplicate"]);
    const [act] = await env.db.select().from(leadActivities).where(eq(leadActivities.leadId, a!));
    expect(act!.createdAt.toISOString()).toBe(items[0]!.at);
    expect((await call("POST", "/v1/rep/outcomes/sync", rep.token, { items: [] })).statusCode).toBe(400);
  });

  it("builds Today: due calls, setup sessions, website leads, street day, and live proof", async () => {
    const rep = await person("rep", "Rita Rep");
    const hood = await createNeighbourhood(env.db, "roncy");
    await env.db.update(neighbourhoods).set({ streetDayOn: "2026-11-03", streetDayRepId: rep.user.id }).where(eq(neighbourhoods.id, hood.id));
    await streetOf(hood.id, ["1 A St", "3 A St"]);
    await env.db.insert(leads).values({ businessName: "Biryani Hub", stage: "new", source: "website", language: "ur", phone: "+14165550123" });
    await env.db.insert(leads).values({ businessName: "Setup Cafe", stage: "visit_booked", assignedRepId: rep.user.id, setupAt: new Date(env.clock.now.getTime() + 3600000), setupChannel: "video", nextActionAt: new Date(env.clock.now.getTime() - 1000) });
    const shop = await createMerchant(env, { neighbourhoodId: hood.id });
    await env.db.update(merchants).set({ repUserId: rep.user.id, createdAt: new Date(env.clock.now.getTime() - 9 * DAY) }).where(eq(merchants.id, shop.merchant.id));
    await awardPurchase(env.ctx, { merchantId: shop.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1000 });

    const t = (await call("GET", "/v1/rep/today", rep.token)).json();
    expect(t.streetDay).toMatchObject({ areaName: "roncy", visited: 0, total: 2, isToday: true });
    expect(t.checkInsDue).toEqual([expect.objectContaining({ merchantId: shop.merchant.id, day: 7, activeMembers: 1, target: 2 })]);
    expect(t.setupSessions.map((s: { businessName: string }) => s.businessName)).toEqual(["Setup Cafe"]);
    expect(t.websiteLeads.map((l: { businessName: string }) => l.businessName)).toEqual(["Biryani Hub"]);
    expect(t.leadsDue.map((l: { businessName: string }) => l.businessName)).toEqual(["Setup Cafe"]);

    const p = (await call("GET", `/v1/rep/proof?neighbourhoodId=${hood.id}`, rep.token)).json();
    expect(p).toMatchObject({ area: { name: "roncy" }, shopsLive: 1, customers: 1, visitsLast7Days: 1, network: { shopsLive: 1, customers: 1 } });
    expect(p.topShops[0]).toMatchObject({ members: 1 });
    expect((await call("GET", "/v1/rep/proof", (await person("rep", "X")).token)).json().shopsLive).toBe(1);
    const nobody = await createUser(env.db);
    expect((await call("GET", "/v1/rep/today", await tokenFor(env, nobody))).statusCode).toBe(403);
  });

  it("stores the source of a lead: street for reps, website for the public form", async () => {
    const rep = await person("rep", "Rita Rep");
    const created = (await call("POST", "/v1/rep/leads", rep.token, { businessName: "Walk-in", lat: 43.7, lng: -79.4 })).json();
    expect(created).toMatchObject({ source: "street", lat: 43.7, lng: -79.4 });
    const pub = await env.app.inject({ method: "POST", url: "/v1/public/leads", payload: { businessName: "Web Cafe", email: "a@b.example", kind: "talk_to_us" } });
    expect(pub.statusCode).toBe(201);
    const [row] = await env.db.select().from(leads).where(eq(leads.id, pub.json().id));
    expect(row!.source).toBe("website");
  });
});

describe("founder's console", () => {
  it("computes pace, MRR, fee revenue, activation, costs, funnel and at-risk from real rows", async () => {
    const admin = await person("admin", "Ada Admin");
    const rep = await person("rep", "Rita Rep");
    const hood = await createNeighbourhood(env.db, "gerrard");
    await env.db.update(neighbourhoods).set({ opensOn: "2026-11-02", streetDayOn: "2026-11-05", targetShops: 10 }).where(eq(neighbourhoods.id, hood.id));
    const plus = await createMerchant(env, { neighbourhoodId: hood.id });
    const pro = await createMerchant(env, { neighbourhoodId: hood.id });
    const stalled = await createMerchant(env, { neighbourhoodId: hood.id });
    await env.db.update(merchants).set({ plan: "plus", repUserId: rep.user.id, smsCreditsUsed: 100, whatsappCreditsUsed: 200 }).where(eq(merchants.id, plus.merchant.id));
    await env.db.update(merchants).set({ plan: "pro" }).where(eq(merchants.id, pro.merchant.id));
    await env.db.update(merchants).set({ createdAt: new Date(env.clock.now.getTime() - 10 * DAY) }).where(eq(merchants.id, stalled.merchant.id));
    await env.db.insert(subscriptions).values([
      { merchantId: plus.merchant.id, plan: "plus", status: "active", interval: "month" },
      { merchantId: pro.merchant.id, plan: "pro", status: "past_due", interval: "month" },
    ]);
    // Members: the plus shop is activated (threshold 2).
    await awardPurchase(env.ctx, { merchantId: plus.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1000 });
    await awardPurchase(env.ctx, { merchantId: plus.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1000 });
    // Fee revenue: a paid order with a 1.5% fee and a customer fee, and an old one outside 30 days.
    const base = { merchantId: plus.merchant.id, userId: plus.owner.id, number: 1, subtotalCents: 10000, totalCents: 10000, status: "picked_up" as const };
    await env.db.insert(orders).values([
      { ...base, platformFeeCents: 150, customerFeeCents: 49, paymentStatus: "paid", paidAt: new Date(env.clock.now.getTime() - 2 * DAY) },
      { ...base, number: 2, platformFeeCents: 999, paymentStatus: "paid", paidAt: new Date(env.clock.now.getTime() - 45 * DAY) },
    ] as never);
    await env.db.insert(leads).values([
      { businessName: "L1", neighbourhoodId: hood.id, stage: "contacted" },
      { businessName: "L2", neighbourhoodId: hood.id, stage: "lost" },
      { businessName: "L3", neighbourhoodId: hood.id, stage: "new" },
    ]);

    const o = (await call("GET", "/v1/admin/overview", admin.token)).json();
    expect(o.pace).toMatchObject({ month: 1, plannedEndOfMonth: 109, actual: 3, areasOpened: 1 });
    expect(o.pace.delta).toBe(3 - o.pace.plannedToday);
    // Plus $39 counts; the past-due Pro shop is still paying.
    expect(o.money).toMatchObject({ mrrCents: 3900 + 9900, payingShops: 2, byPlan: { plus: 1, pro: 1, restaurant: 0 }, feeRevenue30dCents: 199, volume30dCents: 10000 });
    expect(o.activation).toMatchObject({ signed: 3, activated: 1, goal: 0.6 });
    expect(o.activation.rate).toBeCloseTo(0.333, 3);
    // 3 shops x $0.60 infra + 100 SMS x 2.2c + 200 WhatsApp x 0.5c = 180 + 220 + 100.
    expect(o.costs).toMatchObject({ monthCents: 500, perShopCents: 167, shops: 3 });
    const area = o.funnel.find((f: { name: string }) => f.name === "gerrard");
    expect(area).toMatchObject({ leads: 2, contacted: 1, signed: 3, activated: 1, targetShops: 10, signedPct: 0.3, opensOn: "2026-11-02", streetDayOn: "2026-11-05" });
    expect(o.atRisk.items.map((r: { reason: string; name: string }) => r.reason)).toEqual(["payment_failed", "stalled_setup"]);
    expect(o.atRisk.total).toBe(2);
    expect((await call("GET", "/v1/admin/at-risk", admin.token)).json().items).toHaveLength(2);
    expect((await call("GET", "/v1/admin/overview", rep.token)).statusCode).toBe(403);
  });

  it("costs per shop with revenue and margin", async () => {
    const admin = await person("admin", "Ada Admin");
    const a = await createMerchant(env);
    await env.db.update(merchants).set({ plan: "plus", smsCreditsUsed: 50 }).where(eq(merchants.id, a.merchant.id));
    await env.db.insert(subscriptions).values({ merchantId: a.merchant.id, plan: "plus", status: "active", interval: "month" });
    const c = (await call("GET", "/v1/admin/costs", admin.token)).json();
    expect(c.assumptions).toMatchObject({ smsSegmentCents: 2.2, infraPerShopCents: 60 });
    expect(c.shops[0]).toMatchObject({ merchantId: a.merchant.id, smsCredits: 50, messagingCents: 110, costCents: 170, subscriptionCents: 3900, marginCents: 3730 });
    expect(c.totals).toMatchObject({ shops: 1, costCents: 170, subscriptionCents: 3900 });
  });

  it("charge mode: reason is recorded in the audit log and the money view shows it", async () => {
    const admin = await person("admin", "Ada Admin");
    const m = await createMerchant(env);
    const url = `/v1/admin/merchants/${m.merchant.id}/charge-mode`;
    expect((await call("PUT", url, admin.token, { chargeMode: "direct", reason: "ok" })).statusCode).toBe(400);
    expect((await call("PUT", url, admin.token, { chargeMode: "direct", reason: "Merchant of record per owner" })).statusCode).toBe(409);
    await env.db.update(merchants).set({ stripeAccountId: "acct_test", stripeChargesEnabled: true }).where(eq(merchants.id, m.merchant.id));
    expect((await call("PUT", url, admin.token, { chargeMode: "direct", reason: "Merchant of record per owner" })).statusCode).toBe(200);
    const [row] = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "billing.charge_mode_changed"));
    expect(row).toMatchObject({ actorUserId: admin.user.id, merchantId: m.merchant.id, data: { from: "destination", to: "direct", reason: "Merchant of record per owner" } });
    expect((await call("PUT", url, m.ownerToken, { chargeMode: "destination", reason: "I am the owner" })).statusCode).toBe(403);
    const money = (await call("GET", `/v1/admin/merchants/${m.merchant.id}/money`, admin.token)).json();
    expect(money).toMatchObject({ chargeMode: "direct", mrrCents: 0, fees30dCents: 0, stripe: { connected: true, chargesEnabled: true } });
  });

  it("support sessions need a reason, expire, and every write inside a shop is audited", async () => {
    const admin = await person("admin", "Ada Admin");
    const m = await createMerchant(env);
    const url = `/v1/admin/merchants/${m.merchant.id}/support-sessions`;
    expect((await call("POST", url, admin.token, { reason: "x" })).statusCode).toBe(400);
    const s = await call("POST", url, admin.token, { reason: "Fix opening hours" });
    expect(s.statusCode).toBe(201);
    expect(s.json()).toMatchObject({ active: true, adminName: "Ada Admin", reason: "Fix opening hours" });
    expect(new Date(s.json().expiresAt).getTime() - env.clock.now.getTime()).toBe(30 * 60000);
    expect((await call("POST", url, m.ownerToken, { reason: "Not an admin" })).statusCode).toBe(403);

    // A write through the shop's own API as admin is audited; a read is not.
    await call("GET", `/v1/merchants/${m.merchant.id}`, admin.token);
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "support.write"))).toHaveLength(0);
    const patch = await call("PATCH", `/v1/merchants/${m.merchant.id}/program`, admin.token, { welcomeBonus: 10 });
    expect(patch.statusCode).toBe(200);
    const writes = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "support.write"));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ actorUserId: admin.user.id, merchantId: m.merchant.id, data: { method: "PATCH", path: `/v1/merchants/${m.merchant.id}/program` } });
    // The owner's own writes are not "support".
    await call("PATCH", `/v1/merchants/${m.merchant.id}/program`, m.ownerToken, { welcomeBonus: 20 });
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "support.write"))).toHaveLength(1);

    env.clock.now = new Date(env.clock.now.getTime() + 31 * 60000);
    let list = (await call("GET", `/v1/admin/support-sessions?merchantId=${m.merchant.id}`, admin.token)).json();
    expect(list.items[0].active).toBe(false);
    const s2 = (await call("POST", url, admin.token, { reason: "Second look" })).json();
    const end = await call("POST", `/v1/admin/support-sessions/${s2.id}/end`, admin.token);
    expect(end.json()).toMatchObject({ active: false });
    list = (await call("GET", "/v1/admin/support-sessions", admin.token)).json();
    expect(list.items).toHaveLength(2);
    const acts = (await env.db.select().from(auditLogs)).map((a) => a.action);
    expect(acts).toEqual(expect.arrayContaining(["support.session_started", "support.session_ended"]));
    expect(await env.db.select().from(supportSessions).where(eq(supportSessions.merchantId, m.merchant.id))).toHaveLength(2);
  });

  it("follow-up calls: any shop shows day 7 and day 30, and the founder can log one when no rep owns the shop", async () => {
    const admin = await person("admin", "Ada Admin");
    const m = await createMerchant(env);
    await env.db.update(merchants).set({ createdAt: new Date(env.clock.now.getTime() - 8 * DAY) }).where(eq(merchants.id, m.merchant.id));
    const before = (await call("GET", `/v1/admin/merchants/${m.merchant.id}`, admin.token)).json();
    expect(before.checkIns).toEqual([expect.objectContaining({ day: 7, due: true, doneAt: null }), expect.objectContaining({ day: 30, due: false, doneAt: null })]);
    const logged = await call("POST", `/v1/rep/merchants/${m.merchant.id}/check-ins`, admin.token, { day: 7, outcome: "Reached owner: going well" });
    expect(logged.statusCode).toBe(201);
    const after = (await call("GET", `/v1/admin/merchants/${m.merchant.id}`, admin.token)).json();
    expect(after.checkIns[0]).toMatchObject({ day: 7, due: false });
    expect(after.checkIns[0].doneAt).not.toBeNull();
  });

  it("area plan: street-day rep must be a rep, and fields round trip", async () => {
    const admin = await person("admin", "Ada Admin");
    const rep = await person("rep", "Rita Rep");
    const nobody = await createUser(env.db);
    const hood = await createNeighbourhood(env.db, "plan-me");
    const url = `/v1/admin/neighbourhoods/${hood.id}`;
    expect((await call("PATCH", url, admin.token, { streetDayRepId: nobody.id })).statusCode).toBe(400);
    const ok = await call("PATCH", url, admin.token, { streetDayRepId: rep.user.id, streetDayOn: "2026-11-12", opensOn: "2026-11-09", targetShops: 28 });
    expect(ok.json()).toMatchObject({ streetDayRepId: rep.user.id, streetDayRepName: "Rita Rep", streetDayOn: "2026-11-12", opensOn: "2026-11-09", targetShops: 28 });
    expect((await call("PATCH", url, admin.token, { targetShops: 0 })).statusCode).toBe(400);
  });

  it("every sensitive admin action leaves an audit row", async () => {
    const admin = await person("admin", "Ada Admin");
    const rep = await person("rep", "Rita Rep");
    const m = await createMerchant(env);
    const hood = await createNeighbourhood(env.db, "audit-hood");
    await env.db.update(merchants).set({ stripeAccountId: "acct_x" }).where(eq(merchants.id, m.merchant.id));
    const steps: [string, () => Promise<{ statusCode: number }>][] = [
      ["feature.stage_changed", () => call("PUT", "/v1/admin/features/promos.basic/stage", admin.token, { stage: "beta", note: "test" })],
      ["merchant.status_changed", () => call("POST", `/v1/admin/merchants/${m.merchant.id}/status`, admin.token, { status: "paused", reason: "test" })],
      ["billing.charge_mode_changed", () => call("PUT", `/v1/admin/merchants/${m.merchant.id}/charge-mode`, admin.token, { chargeMode: "direct", reason: "test reason" })],
      ["support.session_started", () => call("POST", `/v1/admin/merchants/${m.merchant.id}/support-sessions`, admin.token, { reason: "test reason" })],
      ["neighbourhood.updated", () => call("PATCH", `/v1/admin/neighbourhoods/${hood.id}`, admin.token, { notes: "x" })],
      ["perk.created", () => call("POST", "/v1/admin/perks", admin.token, { neighbourhoodId: null, name: "Perk", ruleType: "distinct_merchants", threshold: 2, windowDays: 30, bonusPoints: 10, active: true })],
      ["user.platform_role_changed", () => call("PUT", `/v1/admin/users/${rep.user.id}/role`, admin.token, { platformRole: "none" })],
    ];
    for (const [action, run] of steps) {
      const before = (await env.db.select().from(auditLogs).where(eq(auditLogs.action, action))).length;
      const r = await run();
      expect(r.statusCode, action).toBeLessThan(300);
      expect((await env.db.select().from(auditLogs).where(eq(auditLogs.action, action))).length, action).toBe(before + 1);
    }
  });
});

describe("pure rules", () => {
  it("prices subscriptions: trialing pays nothing, annual is a twelfth, founding restaurants pay half in year one", () => {
    expect(subscriptionMrrCents({ plan: "plus", restaurantTier: null, interval: "month", status: "active" })).toBe(3900);
    expect(subscriptionMrrCents({ plan: "plus", restaurantTier: null, interval: "month", status: "trialing" })).toBe(0);
    expect(subscriptionMrrCents({ plan: "plus", restaurantTier: null, interval: "year", status: "active" })).toBe(3250);
    expect(subscriptionMrrCents({ plan: "free", restaurantTier: "starter", interval: "month", status: "active" }, true)).toBe(4950);
  });
  it("gives each shop one reason, most urgent first, skipping paused and closed", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const mk = (over: Record<string, unknown>) => ({ id: "m", name: "S", status: "active", plan: "free", neighbourhoodId: null, createdAt: new Date(now.getTime() - 30 * DAY), activatedAt: null, smsCreditsUsed: 0, ...over }) as never;
    const members = new Map([
      ["quiet", { total: 30, active: 30, lastVisit: new Date(now.getTime() - 20 * DAY) }],
      ["slow", { total: 5, active: 5, lastVisit: new Date(now.getTime() - 1 * DAY) }],
      ["fine", { total: 30, active: 30, lastVisit: new Date(now.getTime() - 1 * DAY) }],
    ]);
    const out = atRiskShops(
      { now: () => now },
      [mk({ id: "stalled" }), mk({ id: "quiet", activatedAt: new Date(now.getTime() - 5 * DAY) }), mk({ id: "slow" }), mk({ id: "fine", activatedAt: new Date(now.getTime() - 9 * DAY) }), mk({ id: "paused", status: "paused" }), mk({ id: "pay", activatedAt: new Date() })],
      [{ merchantId: "pay", status: "past_due" }],
      members,
      [],
      25,
    );
    expect(out.map((r) => [r.merchantId, r.reason])).toEqual([["pay", "payment_failed"], ["stalled", "stalled_setup"], ["quiet", "quiet"], ["slow", "slow_activation"]]);
  });
});
