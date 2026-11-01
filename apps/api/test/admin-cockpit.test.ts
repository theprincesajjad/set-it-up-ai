/**
 * The founder's cockpit (wave N, team admin): every metric from a fixed fixture with exact numbers, the businesses list (filters,
 * sort, CSV), the business detail (audited), health flags, the landing funnel by page / source / device, signup attribution with UTM,
 * the latency recorder (no PII) and 403 for everyone who is not an admin, including a demoted admin with a live token.
 *
 * Clock: 2026-11-03T15:00:00Z (N). Shops (days before N):
 *   A Alpha Nails   50d  active  Pro monthly, active      Toronto      /for-nail-techs · ig · phone
 *   B Beta Barber   20d  active  in-app trial ends N+3d   (no city)    /for-barbers · tiktok · phone   no activity
 *   C Gamma Cafe   100d  active  Studio monthly, past_due Mississauga  usage 10 → 2 week over week
 *   D Delta Deli     5d  onboarding, free                              no attribution
 *   E Echo Closed  200d  closed, Pro cancelled
 *   F Foxtrot       45d  active  trial N-40d..N-26d, then Pro yearly active (N-25d)
 *   G Golf Groom     9d  onboarding, free                              "/" · utm google · desktop
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiMetrics, appointments, auditLogs, classCharges, invoices, landingEvents, ledgerTransactions, locations, merchantMembers, merchantStaff, merchants, orders, sessions, subscriptions, users, visits } from "@ll/db";
import { bucketOf, LATENCY_BUCKETS_MS, percentileMs, routeGroup } from "../src/lib/metrics.js";
import { classify, filterBusinesses, healthFlags } from "../src/services/admin-cockpit.js";
import { summarize } from "../src/services/admin-performance.js";
import { utmOf } from "../src/services/landing-events.js";
import { call } from "./commerce-fixtures.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

const N = new Date("2026-11-03T15:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(N.getTime() - d * DAY);
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

let env: TestEnv;
let adminToken: string;
let adminId: string;
const id: Record<string, string> = {};
let seq = 0;

async function shop(key: string, name: string, days: number, extra: Partial<typeof merchants.$inferInsert> = {}) {
  const [m] = await env.db.insert(merchants).values({ slug: `${key.toLowerCase()}-shop`, name, vertical: "retail", createdAt: ago(days), ...extra }).returning();
  id[key] = m!.id;
  return m!;
}
async function location(merchantId: string, city: string) {
  const [l] = await env.db.insert(locations).values({ merchantId, name: "Main", address: "1 Main St", city, qrCode: `qr-${seq++}` }).returning();
  return l!;
}
async function member(merchantId: string, userId: string, createdAt: Date) {
  const [mm] = await env.db.insert(merchantMembers).values({ merchantId, userId, createdAt }).returning();
  return mm!;
}
async function earn(merchantId: string, memberId: string, at: Date, n = 1, extra: Partial<typeof ledgerTransactions.$inferInsert> = {}) {
  for (let i = 0; i < n; i++) await env.db.insert(ledgerTransactions).values({ merchantId, memberId, type: "earn", source: "staff_app", points: 1, createdAt: at, ...extra });
}
async function staffLogin(merchantId: string, at: Date) {
  const u = await createUser(env.db, { email: `staff${seq++}@example.com` });
  await env.db.insert(merchantStaff).values({ merchantId, userId: u.id, role: "owner" });
  await env.db.insert(sessions).values({ userId: u.id, refreshTokenHash: `h${seq++}`, expiresAt: new Date(N.getTime() + 30 * DAY), createdAt: at });
}

beforeAll(async () => {
  env = await createTestEnv({ now: N });
  const admin = await createUser(env.db, { platformRole: "admin", email: "founder@example.com" });
  adminId = admin.id;
  adminToken = await tokenFor(env, admin);
  const [u1, u2, u3] = [await createUser(env.db), await createUser(env.db), await createUser(env.db)];

  // ---- shops ----
  const A = await shop("A", "Alpha Nails", 50, { status: "active", plan: "plus", vertical: "nails", signupAnonId: "aidAaidAaidAaidAaidA00", signupPage: "/for-nail-techs", signupVariant: "control", signupSrc: "ig", signupDevice: "phone" });
  const B = await shop("B", "Beta Barber", 20, { status: "active", vertical: "barber", trialPlan: "plus", trialStartedAt: ago(20), trialEndsAt: new Date(N.getTime() + 3 * DAY), trialUsed: true, signupAnonId: "aidBaidBaidBaidBaidB00", signupPage: "/for-barbers", signupVariant: "control", signupSrc: "tiktok", signupDevice: "phone" });
  const C = await shop("C", "Gamma Cafe", 100, { status: "active", plan: "studio", vertical: "cafe" });
  await shop("D", "Delta Deli", 5, { status: "onboarding", vertical: "grocery" });
  const E = await shop("E", "Echo Closed", 200, { status: "closed", vertical: "retail" });
  const F = await shop("F", "Foxtrot Florist", 45, { status: "active", plan: "plus", vertical: "retail", trialPlan: "plus", trialStartedAt: ago(40), trialEndsAt: ago(26), trialUsed: true });
  await shop("G", "Golf Groom", 9, { status: "onboarding", vertical: "pet", signupAnonId: "aidGaidGaidGaidGaidG00", signupPage: "/", signupVariant: "control", signupUtmSource: "google", signupUtmMedium: "cpc", signupDevice: "desktop" });

  // ---- billing ----
  await env.db.insert(subscriptions).values([
    { merchantId: A.id, plan: "plus", status: "active", interval: "month", createdAt: ago(48) },
    { merchantId: C.id, plan: "studio", status: "past_due", interval: "month", createdAt: ago(95) },
    { merchantId: E.id, plan: "plus", status: "canceled", interval: "month", createdAt: ago(190) },
    { merchantId: F.id, plan: "plus", status: "active", interval: "year", createdAt: ago(25) },
  ]);

  // ---- activity ----
  const locA = await location(A.id, "Toronto");
  await location(C.id, "Mississauga");
  const a1 = await member(A.id, u1.id, ago(49));
  const a2 = await member(A.id, u2.id, ago(30));
  const c3 = await member(C.id, u3.id, ago(90));
  await earn(A.id, a1.id, ago(1), 3);
  await earn(A.id, a2.id, ago(4), 1, { source: "square", amountCents: 4500 });
  await earn(C.id, c3.id, ago(1), 2);
  await earn(C.id, c3.id, ago(10), 10);
  await earn(C.id, c3.id, ago(40), 5);
  // Reversed earns never count.
  await earn(C.id, c3.id, ago(1), 1, { reversedAt: ago(1) });
  await env.db.insert(visits).values([
    { merchantId: A.id, memberId: a1.id, userId: u1.id, source: "staff_app", createdAt: ago(1) },
    { merchantId: A.id, memberId: a2.id, userId: u2.id, source: "staff_app", createdAt: ago(1) },
    { merchantId: A.id, memberId: a1.id, userId: u1.id, source: "staff_app", createdAt: ago(1) },
    { merchantId: C.id, memberId: c3.id, userId: u3.id, source: "staff_app", createdAt: ago(35) },
  ]);
  const appt = (createdAt: Date, extra: Partial<typeof appointments.$inferInsert> = {}) => ({ merchantId: A.id, locationId: locA.id, userId: u1.id, startsAt: createdAt, endsAt: new Date(createdAt.getTime() + 3_600_000), createdAt, ...extra });
  await env.db.insert(appointments).values([
    appt(ago(2), { status: "completed", completedAt: ago(2), depositCents: 2000, depositPaidAt: ago(2) }),
    appt(ago(45), { status: "cancelled", cancelReason: "hold_expired" }),
    appt(ago(50), { status: "booked" }),
  ]);
  await env.db.insert(orders).values({ merchantId: A.id, userId: u2.id, number: 1, subtotalCents: 1500, totalCents: 1500, paidAt: ago(3) });
  await env.db.insert(invoices).values({ merchantId: A.id, userId: u1.id, number: 1, lineItems: [], subtotalCents: 10000, totalCents: 10000, amountDueCents: 0, payToken: "tok-1", status: "paid", paidAt: ago(40) });
  await env.db.insert(classCharges).values({ merchantId: C.id, userId: u3.id, kind: "drop_in", amountCents: 3000, status: "paid", paidAt: ago(6) });
  await staffLogin(A.id, ago(1));
  await staffLogin(F.id, ago(3));

  // ---- landing events ----
  const ev = (anonId: string, kind: string, page: string, at: Date, extra: Partial<typeof landingEvents.$inferInsert> = {}) => ({ anonId, kind, page, trade: page === "home" ? "home" : page, variant: "control", device: "phone", createdAt: at, ...extra });
  await env.db.insert(landingEvents).values([
    ev("aidBaidBaidBaidBaidB00", "view", "barber", ago(21), { src: "tiktok" }),
    ev("aidBaidBaidBaidBaidB00", "cta_click", "barber", ago(21), { src: "tiktok", data: "hero" }),
    ev("aidBaidBaidBaidBaidB00", "start_submit", "barber", ago(21), { src: "tiktok" }),
    ev("aidXaidXaidXaidXaidX00", "view", "barber", ago(3), { device: "desktop" }),
    ev("aidGaidGaidGaidGaidG00", "view", "home", ago(10), { device: "desktop", utmSource: "google", utmMedium: "cpc" }),
    ev("aidGaidGaidGaidGaidG00", "cta_click", "home", ago(10), { device: "desktop", utmSource: "google", data: "hero" }),
    ev("aidGaidGaidGaidGaidG00", "signup_start", "home", ago(10), { device: "desktop", utmSource: "google" }),
    ev("aidYaidYaidYaidYaidY00", "view", "home", ago(2)),
    ev("aidYaidYaidYaidYaidY00", "cta_click", "home", ago(2), { data: "pricing" }),
    ev("aidOaidOaidOaidOaidO00", "view", "barber", ago(40)),
  ]);
});
afterAll(async () => env.close());

const get = (url: string, token = adminToken) => call(env, token, "GET", url);

describe("GET /v1/admin/cockpit", () => {
  it("computes every overview number exactly", async () => {
    const r = await get("/v1/admin/cockpit?days=30");
    expect(r.status).toBe(200);
    const d = r.body;
    expect(d.signupsWeek).toEqual({ current: 1, previous: 1, deltaPct: 0 });
    expect(d.shops).toEqual({ total: 6, live: 4, activated: 2, paying: 3, trialing: 1, churned: 1, payingByPlan: { plus: 2, studio: 1, pro: 0, restaurant: 0 } });
    // 2900 (A) + 5900 (C, past due still counts until it lapses) + 29000/12 rounded (F).
    expect(d.money).toEqual({ mrrCents: 11217, arrCents: 134604, trialToPaid: { ended: 1, converted: 1, rate: 1 } });
    expect(d.period.signups).toEqual({ current: 3, previous: 2, deltaPct: 50 });
    expect(d.period.gmvSplit).toEqual({ ordersCents: 1500, invoicesCents: 0, depositsCents: 2000, tiffinCents: 0, classesCents: 3000, posCents: 4500 });
    expect(d.period.gmvCents).toEqual({ current: 11000, previous: 10000, deltaPct: 10 });
    expect(d.period.stamps).toEqual({ current: 16, previous: 5, deltaPct: 220 });
    expect(d.period.bookings).toEqual({ current: 1, previous: 1, deltaPct: 0 });
    expect(d.period.activeCustomers).toEqual({ current: 2, previous: 1, deltaPct: 100 });
    expect(d.weekly).toHaveLength(12);
    expect(d.weekly[11]).toEqual({ weekStart: "2026-10-27", signups: 1, gmvCents: 11000, stamps: 6, bookings: 1, activeCustomers: 2 });
    expect(d.weekly[10]).toEqual({ weekStart: "2026-10-20", signups: 1, gmvCents: 0, stamps: 10, bookings: 0, activeCustomers: 0 });
  });

  it("a 7-day window compares with the 7 days before", async () => {
    const d = (await get("/v1/admin/cockpit?days=7")).body;
    expect(d.period.stamps).toEqual({ current: 6, previous: 10, deltaPct: -40 });
    expect(d.period.gmvCents).toEqual({ current: 11000, previous: 0, deltaPct: null });
    expect((await get("/v1/admin/cockpit?days=12")).status).toBe(400);
  });
});

describe("businesses", () => {
  it("lists every shop with status, plan, city, MRR and 30-day usage, newest first", async () => {
    const r = (await get("/v1/admin/businesses")).body;
    expect(r.total).toBe(7);
    expect(r.items.map((x: { name: string }) => x.name)).toEqual(["Delta Deli", "Golf Groom", "Beta Barber", "Foxtrot Florist", "Alpha Nails", "Gamma Cafe", "Echo Closed"]);
    expect(r.counts).toEqual({ trial: 1, paying: 3, churned: 1, free: 2, at_risk: 2 });
    const a = r.items.find((x: { name: string }) => x.name === "Alpha Nails");
    expect(a).toMatchObject({ trade: "nails", plan: "plus", city: "Toronto", status: "paying", flags: [], mrrCents: 2900, gmv30dCents: 8000, stamps30d: 4, bookings30d: 1, activeCustomers30d: 2, landingPage: "/for-nail-techs", source: "ig", lastActiveAt: ago(1).toISOString() });
    const b = r.items.find((x: { name: string }) => x.name === "Beta Barber");
    expect(b).toMatchObject({ status: "trial", plan: "plus", city: null, flags: ["trial_ending_not_activated", "no_activity_14d"], lastActiveAt: null });
    expect(r.facets).toEqual({ trades: ["barber", "cafe", "grocery", "nails", "pet", "retail"], cities: ["Mississauga", "Toronto"] });
  });

  it("filters by status, at risk, trade, plan, city, signup date and last active; sorts by MRR", async () => {
    const names = async (qs: string) => ((await get(`/v1/admin/businesses?${qs}`)).body.items as { name: string }[]).map((x) => x.name);
    expect(await names("status=paying&sort=mrrCents&dir=desc")).toEqual(["Gamma Cafe", "Alpha Nails", "Foxtrot Florist"]);
    expect(await names("status=at_risk&sort=name&dir=asc")).toEqual(["Beta Barber", "Gamma Cafe"]);
    expect(await names("status=churned")).toEqual(["Echo Closed"]);
    expect(await names("trade=retail&sort=name&dir=asc")).toEqual(["Echo Closed", "Foxtrot Florist"]);
    expect(await names("plan=studio")).toEqual(["Gamma Cafe"]);
    expect(await names("city=mississauga")).toEqual(["Gamma Cafe"]);
    expect(await names("signedFrom=2026-10-01&signedTo=2026-10-30&sort=name&dir=asc")).toEqual(["Beta Barber", "Delta Deli", "Golf Groom"]);
    expect(await names("activeWithin=2&sort=name&dir=asc")).toEqual(["Alpha Nails", "Gamma Cafe"]);
    expect(await names("activeWithin=-14&sort=name&dir=asc")).toEqual(["Beta Barber", "Delta Deli", "Echo Closed", "Golf Groom"]);
    expect(await names("q=ALPHA")).toEqual(["Alpha Nails"]);
    const page = (await get("/v1/admin/businesses?limit=2&offset=2")).body;
    expect([page.total, page.items.map((x: { name: string }) => x.name)]).toEqual([7, ["Beta Barber", "Foxtrot Florist"]]);
    expect((await get("/v1/admin/businesses?sort=email")).status).toBe(400);
  });

  it("exports the filtered list as CSV, no customer data in it", async () => {
    const r = await env.app.inject({ method: "GET", url: "/v1/admin/businesses?format=csv&status=paying&sort=name&dir=asc", headers: { authorization: `Bearer ${adminToken}` } });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.headers["content-disposition"]).toBe('attachment; filename="businesses-2026-11-03.csv"');
    const lines = r.body.trim().split("\r\n");
    expect(lines[0]).toBe("id,name,trade,plan,city,status,flags,signed_up_at,last_active_at,mrr_cents,gmv_30d_cents,stamps_30d,bookings_30d,active_customers_30d,landing_page,source");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("Gamma Cafe,cafe,studio,Mississauga,paying,payment_failed usage_drop,");
    expect(r.body).not.toMatch(/@example\.com|\+1416/);
  });

  it("the detail shows funnel, usage, GMV, billing, attribution and health, and is written to the audit log", async () => {
    const r = await get(`/v1/admin/businesses/${id.C}`);
    expect(r.status).toBe(200);
    const d = r.body;
    expect(d.funnel).toEqual([
      { key: "signed_up", at: ago(100).toISOString() },
      { key: "booking_link_live", at: null },
      { key: "first_customer", at: ago(90).toISOString() },
      { key: "first_stamp", at: ago(40).toISOString() },
      { key: "paid", at: ago(95).toISOString() },
    ]);
    expect(d.usage).toHaveLength(12);
    expect(d.usage[11]).toEqual({ weekStart: "2026-10-27", stamps: 2, bookings: 0, logins: 0, gmvCents: 3000, activeCustomers: 0 });
    expect(d.usage[10]).toMatchObject({ stamps: 10 });
    expect(d.gmv).toEqual({ last30: { ordersCents: 0, invoicesCents: 0, depositsCents: 0, tiffinCents: 0, classesCents: 3000, posCents: 0, totalCents: 3000 }, allTimeCents: 3000 });
    expect(d.billing.plan).toBe("studio");
    expect(d.billing.subscriptions).toEqual([expect.objectContaining({ plan: "studio", status: "past_due", interval: "month", mrrCents: 5900 })]);
    expect(d.health).toEqual({ flags: ["payment_failed", "usage_drop"], detail: ["The last subscription payment failed.", "Usage dropped 80% week over week (10 → 2)."], usageThisWeek: 2, usageLastWeek: 10, changePct: -80 });
    expect(JSON.stringify(d)).not.toMatch(/@example\.com|\+1416/);
    const g = (await get(`/v1/admin/businesses/${id.G}`)).body;
    expect(g.attribution).toEqual({ landingPage: "/", variant: "control", experimentId: null, source: null, utmSource: "google", utmMedium: "cpc", utmCampaign: null, device: "desktop", matchedVisit: true });
    const audit = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "admin.business_viewed"));
    expect(audit.map((a) => [a.actorUserId, a.merchantId])).toEqual([[adminId, id.C], [adminId, id.G]]);
    expect((await get("/v1/admin/businesses/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("the older merchant page view is audited too", async () => {
    expect((await get(`/v1/admin/merchants/${id.A}`)).status).toBe(200);
    const rows = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "admin.merchant_viewed"));
    expect(rows.map((a) => a.merchantId)).toEqual([id.A]);
  });
});

describe("GET /v1/admin/health", () => {
  it("flags payment failed, trial ending not activated, usage drop and no activity, most urgent first", async () => {
    const r = (await get("/v1/admin/health")).body;
    expect(r.counts).toEqual({ payment_failed: 1, trial_ending_not_activated: 1, usage_drop: 1, no_activity_14d: 1 });
    expect(r.atRisk.map((x: { name: string; flags: string[] }) => [x.name, x.flags])).toEqual([
      ["Gamma Cafe", ["payment_failed", "usage_drop"]],
      ["Beta Barber", ["trial_ending_not_activated", "no_activity_14d"]],
    ]);
    expect(r.atRisk[0]).toMatchObject({ mrrCents: 5900, trend: [0, 0, 5, 0, 0, 0, 10, 2], changePct: -80 });
    expect(r.atRisk[1].reasons).toEqual(["Trial ends in 3 days and no stamp or booking yet.", "No stamp, booking or login since signing up."]);
  });

  it("healthFlags: the 40% line and the minimum week", () => {
    const base = { m: { status: "active" as const, createdAt: ago(60), trialEndsAt: null }, subs: [], activated: true, lastActiveAt: ago(1) };
    expect(healthFlags({ ...base, usageThisWeek: 6, usageLastWeek: 10 }, N).flags).toEqual([]);
    expect(healthFlags({ ...base, usageThisWeek: 5, usageLastWeek: 10 }, N).flags).toEqual(["usage_drop"]);
    expect(healthFlags({ ...base, usageThisWeek: 0, usageLastWeek: 4 }, N).flags).toEqual([]);
    expect(healthFlags({ ...base, usageThisWeek: 0, usageLastWeek: 0, lastActiveAt: ago(14) }, N).flags).toEqual(["no_activity_14d"]);
    expect(healthFlags({ ...base, m: { ...base.m, status: "paused" }, subs: [{ status: "past_due" }], usageThisWeek: 0, usageLastWeek: 0 }, N).flags).toEqual([]);
  });

  it("classify: status and plan rules", () => {
    const m = { status: "active" as const, plan: "free" as const, trialPlan: null, trialEndsAt: null, foundingOffer: false };
    const sub = (status: "active" | "trialing" | "canceled" | "past_due", plan: "plus" | "studio" = "plus") => ({ id: "s", merchantId: "m", plan, restaurantTier: null, status, interval: "month", stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, createdAt: ago(10), updatedAt: ago(10) });
    expect(classify(m, [], 0, N)).toMatchObject({ status: "free", plan: "free", mrrCents: 0 });
    expect(classify(m, [sub("trialing", "studio")], 0, N)).toMatchObject({ status: "trial", plan: "studio", mrrCents: 0 });
    expect(classify(m, [sub("active")], 4900, N)).toMatchObject({ status: "paying", plan: "plus", mrrCents: 7800 });
    expect(classify(m, [sub("canceled")], 0, N)).toMatchObject({ status: "churned", everPaidAt: ago(10) });
    expect(classify({ ...m, status: "closed" }, [sub("active")], 0, N)).toMatchObject({ status: "churned", mrrCents: 0 });
  });
});

describe("GET /v1/admin/funnel", () => {
  type Row = { key: string; views: number; ctaClicks: number; signupStarted: number; signupCompleted: number; wentLive: number; paid: number };
  const pick = (rows: Row[]) => Object.fromEntries(rows.map(({ key, ...r }) => [key, Object.values(r)]));
  it("by page: views → CTA → started → completed → live → paid", async () => {
    const r = (await get("/v1/admin/funnel?days=30&by=page")).body;
    expect(r.total).toEqual({ views: 4, ctaClicks: 3, signupStarted: 2, signupCompleted: 3, wentLive: 1, paid: 0 });
    expect(pick(r.rows)).toEqual({ "/": [2, 2, 1, 1, 0, 0], "/for-barbers": [2, 1, 1, 1, 1, 0], unattributed: [0, 0, 0, 1, 0, 0] });
  });
  it("by source, device and variant", async () => {
    expect(pick((await get("/v1/admin/funnel?days=30&by=source")).body.rows)).toEqual({ direct: [2, 1, 0, 0, 0, 0], google: [1, 1, 1, 1, 0, 0], tiktok: [1, 1, 1, 1, 1, 0], unattributed: [0, 0, 0, 1, 0, 0] });
    expect(pick((await get("/v1/admin/funnel?days=30&by=device")).body.rows)).toEqual({ desktop: [2, 1, 1, 1, 0, 0], phone: [2, 2, 1, 1, 1, 0], unattributed: [0, 0, 0, 1, 0, 0] });
    expect(Object.keys(pick((await get("/v1/admin/funnel?days=30&by=variant")).body.rows))).toEqual(["/ · control", "/for-barbers · control", "unattributed"]);
    // The 90-day window takes in A's and F's signups and the 40-day-old view.
    const r90 = (await get("/v1/admin/funnel?days=90&by=page")).body;
    expect(r90.total).toMatchObject({ views: 5, signupCompleted: 5, paid: 2 });
  });
});

describe("attribution from the landing page into signup", () => {
  it("home page: UTM, refresh dedupe, signup_start and the shop's stored attribution", async () => {
    const aid = "HomeHomeHomeHomeHome01";
    const beacon = (body: unknown, ua = DESKTOP_UA) => env.app.inject({ method: "POST", url: "/v1/public/landing-events", headers: { "content-type": "application/json", "user-agent": ua }, remoteAddress: "198.51.100.9", payload: JSON.stringify(body) });
    expect((await beacon({ aid, p: "/", tr: "home", q: "?utm_source=Google&utm_medium=cpc&utm_campaign=fall-24&email=x@y.z", ev: [{ k: "view" }, { k: "cta_click", d: "hero" }] })).statusCode).toBe(204);
    await beacon({ aid, p: "/", tr: "home", ev: [{ k: "view" }] });
    await beacon({ aid, p: "/signup", ev: [{ k: "signup_start" }] });
    await beacon({ aid, p: "/signup", ev: [{ k: "signup_start" }] });
    await beacon({ aid: "NoViewNoViewNoViewNo01", p: "/signup", ev: [{ k: "signup_start" }] });
    const rows = await env.db.select().from(landingEvents).where(eq(landingEvents.anonId, aid));
    expect(rows.map((r) => r.kind).sort()).toEqual(["cta_click", "signup_start", "view"]);
    expect(rows.find((r) => r.kind === "view")).toMatchObject({ page: "home", src: "google", utmSource: "google", utmMedium: "cpc", utmCampaign: "fall-24", device: "desktop", experimentId: null });
    expect(await env.db.select().from(landingEvents).where(eq(landingEvents.anonId, "NoViewNoViewNoViewNo01"))).toHaveLength(0);

    const owner = await createUser(env.db, { email: "newowner@example.com" });
    const res = await call(env, await tokenFor(env, owner), "POST", "/v1/merchants", { name: "Home Lead Nails", vertical: "nails", workSetting: "home", postalCode: "m6s2k1", phone: "(416) 555-0199", anonId: aid });
    expect(res.status).toBe(201);
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, res.body.merchant.id));
    expect(m).toMatchObject({ signupAnonId: aid, signupPage: "/", signupVariant: "control", signupSrc: "google", signupUtmSource: "google", signupUtmMedium: "cpc", signupUtmCampaign: "fall-24", signupDevice: "desktop" });

    // No anonymous id (GPC or counting off: the wizard sends none) → nothing but the signup's own src is stored.
    const o2 = await createUser(env.db, { email: "gpc@example.com" });
    const r2 = await call(env, await tokenFor(env, o2), "POST", "/v1/merchants", { name: "Private Nails", vertical: "nails", workSetting: "home", postalCode: "m6s2k1", phone: "(416) 555-0198" });
    const [m2] = await env.db.select().from(merchants).where(eq(merchants.id, r2.body.merchant.id));
    expect([m2!.signupAnonId, m2!.signupPage, m2!.signupSrc]).toEqual([null, null, null]);
  });

  it("utmOf keeps only safe values", () => {
    expect(utmOf("?utm_source=IG&utm_medium=paid social&utm_campaign=x")).toEqual({ utmSource: "ig", utmMedium: null, utmCampaign: "x" });
    expect(utmOf(null)).toEqual({ utmSource: null, utmMedium: null, utmCampaign: null });
  });
});

describe("performance", () => {
  it("percentiles, buckets and route groups", () => {
    expect([bucketOf(0), bucketOf(5), bucketOf(6), bucketOf(10_001)]).toEqual([0, 0, 1, LATENCY_BUCKETS_MS.length]);
    const hist = new Array(LATENCY_BUCKETS_MS.length + 1).fill(0);
    hist[3] = 8;
    hist[7] = 2;
    expect([percentileMs(hist, 0.5), percentileMs(hist, 0.95), percentileMs([], 0.5)]).toEqual([50, 400, 0]);
    expect(routeGroup("/v1/merchants/:merchantId/appointments/:id")).toBe("merchants:appointments");
    expect(routeGroup("/v1/admin/overview")).toBe("admin");
    expect(routeGroup("/v1/public/landing-events")).toBe("public");
    expect(routeGroup(undefined)).toBe("unmatched");
  });

  it("summarize: totals, groups, slowest routes and the hourly trend", () => {
    const h = (pairs: [number, number][]) => {
      const a = new Array(LATENCY_BUCKETS_MS.length + 1).fill(0);
      for (const [i, n] of pairs) a[i] = n;
      return a;
    };
    const r = summarize(
      [
        { bucketStart: new Date(N.getTime() - 30 * 60_000), routeGroup: "a", route: "GET /v1/a", count: 10, errors: 1, maxMs: 380, hist: h([[3, 8], [7, 2]]) },
        { bucketStart: new Date(N.getTime() - 90 * 60_000), routeGroup: "b", route: "GET /v1/b", count: 4, errors: 0, maxMs: 4, hist: h([[0, 4]]) },
      ],
      N,
      3,
    );
    expect(r.total).toEqual({ key: "all", count: 14, errors: 1, errorRate: 0.0714, p50Ms: 50, p95Ms: 400, maxMs: 380 });
    expect(r.groups.map((g) => [g.key, g.count, g.p95Ms])).toEqual([["a", 10, 400], ["b", 4, 5]]);
    expect(r.slowest.map((s) => s.key)).toEqual(["GET /v1/a"]);
    expect(r.trend.map((t) => [t.hourStart, t.count])).toEqual([["2026-11-03T12:00:00.000Z", 0], ["2026-11-03T13:00:00.000Z", 4], ["2026-11-03T14:00:00.000Z", 10], ["2026-11-03T15:00:00.000Z", 0]]);
  });

  it("the recorder keeps route templates only and the report reads them", async () => {
    await env.app.metrics.flush(env.db);
    await env.db.delete(apiMetrics);
    await get(`/v1/admin/merchants/${id.D}`);
    await get(`/v1/admin/merchants/${id.D}`);
    await env.app.inject({ method: "GET", url: "/v1/no/such/route?phone=4165550100" });
    expect(await env.app.metrics.flush(env.db)).toBe(2);
    const rows = await env.db.select().from(apiMetrics);
    expect(rows.map((r) => [r.route, r.routeGroup, r.count]).sort()).toEqual([["GET /v1/admin/merchants/:merchantId", "admin", 2], ["unmatched", "unmatched", 1]]);
    expect(JSON.stringify(rows)).not.toContain(id.D!);
    expect(JSON.stringify(rows)).not.toContain("4165550100");
    const rep = (await get("/v1/admin/performance?hours=24")).body;
    // The report also holds this request's own window (the performance call itself is recorded after it answers).
    expect(rep.groups.find((g: { key: string }) => g.key === "admin").count).toBe(2);
    expect(rep.trend).toHaveLength(25);
  });
});

describe("only admins", () => {
  const ROUTES = ["/v1/admin/cockpit", "/v1/admin/businesses", "/v1/admin/businesses?format=csv", "/v1/admin/funnel", "/v1/admin/health", "/v1/admin/performance"];
  it("403 for a customer, an owner and a rep; 401 without a token", async () => {
    const customer = await createUser(env.db);
    const rep = await createUser(env.db, { platformRole: "rep", email: "rep9@example.com" });
    const tokens = [await tokenFor(env, customer), await tokenFor(env, rep)];
    for (const url of [...ROUTES, `/v1/admin/businesses/${id.A}`]) {
      for (const t of tokens) expect((await get(url, t)).status, url).toBe(403);
      expect((await env.app.inject({ method: "GET", url })).statusCode, url).toBe(401);
    }
  });
  it("403 for an admin demoted after the token was issued", async () => {
    const was = await createUser(env.db, { platformRole: "admin", email: "former@example.com" });
    const token = await tokenFor(env, was);
    await env.db.update(users).set({ platformRole: "none" }).where(eq(users.id, was.id));
    for (const url of ROUTES) expect((await get(url, token)).status, url).toBe(403);
  });
});

describe("pure list filter", () => {
  it("nulls sort last ascending", () => {
    const row = (name: string, lastActiveAt: string | null) => ({ id: name, name, slug: name, trade: "x", plan: "free", city: null, status: "free" as const, flags: [], signedUpAt: N.toISOString(), lastActiveAt, mrrCents: 0, gmv30dCents: 0, stamps30d: 0, bookings30d: 0, activeCustomers30d: 0, landingPage: null, source: null });
    const r = filterBusinesses([row("b", null), row("a", ago(2).toISOString()), row("c", ago(1).toISOString())], { sort: "lastActiveAt", dir: "asc", limit: 50, offset: 0 }, N);
    expect(r.items.map((x) => x.name)).toEqual(["a", "c", "b"]);
  });
});
