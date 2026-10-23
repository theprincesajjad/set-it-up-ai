import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notifications, tiffinDeliveries, tiffinDriverLinks } from "@ll/db";
import { generateDeliveries } from "../src/services/tiffin.js";
import { call, customer, paidMerchant } from "./commerce-fixtures.js";
import { createTestEnv, grantFeatures, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
// 2026-11-03 10:00 Toronto, a Tuesday.
const T0 = new Date("2026-11-03T15:00:00Z");
beforeEach(async () => {
  env = await createTestEnv({ now: T0 });
});
afterEach(async () => env.close());

async function setup() {
  const m = await paidMerchant(env, { plan: "free", connect: false });
  await grantFeatures(env, m.merchant.id, ["restaurant.tiffin"]);
  const base = `/v1/merchants/${m.merchant.id}/tiffin`;
  await call(env, m.ownerToken, "PUT", `/v1/merchants/${m.merchant.id}/payment-settings`, { etransferEnabled: true, etransferEmail: "pay@shree.ca", startOnTrust: true });
  const plan = (await call(env, m.ownerToken, "POST", `${base}/plans`, { name: "Veg thali", priceCents: 12000, daysOfWeek: [1, 2, 3, 4, 5, 6, 0] })).body;
  const north = (await call(env, m.ownerToken, "POST", `${base}/routes`, { name: "North run", driverName: "Raj", driverPhone: "(416) 555-0199", areas: ["L4T"] })).body;
  const south = (await call(env, m.ownerToken, "POST", `${base}/routes`, { name: "South run", areas: ["M9W"] })).body;
  const subs: { c: Awaited<ReturnType<typeof customer>>; id: string }[] = [];
  for (const [i, postal] of ["L4T 1A1", "L4T 2B2", "M9W 3C3"].entries()) {
    const c = await customer(env, { name: `Cust ${i + 1}` });
    const r = await call(env, c.token, "POST", "/v1/me/tiffin/subscriptions", { planId: plan.id, fulfilment: "delivery", address: `${i + 1} Main St`, postalCode: postal, startDate: "2026-11-03", paymentMethod: "etransfer", addressNotes: "Side door" });
    expect(r.status).toBe(201);
    subs.push({ c, id: r.body.subscription.id });
  }
  await generateDeliveries(env.ctx, "2026-11-03");
  return { m, base, plan, north, south, subs };
}
type S = Awaited<ReturnType<typeof setup>>;
const link = async (s: S, routeId: string, date?: string) => (await call(env, s.m.ownerToken, "POST", `${s.base}/routes/${routeId}/driver-link`, date ? { date } : {})).body;
const tokenOf = (url: string) => url.split("/d/")[1]!;

describe("driver link", () => {
  it("creates one link per route and day that expires 23:59 Toronto, and the page shows only that route's stops", async () => {
    const s = await setup();
    const l = await link(s, s.north.id);
    expect(l.url).toMatch(/\/d\/[A-Za-z0-9_-]{20,}$/);
    // 23:59:59 on Nov 3 Toronto (EST) = Nov 4 04:59:59Z.
    expect(l.expiresAt).toBe("2026-11-04T04:59:59.000Z");
    expect((await link(s, s.north.id)).token).toBe(l.token);

    const run = await call(env, null, "GET", `/v1/public/tiffin/driver/${l.token}`);
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ route: { name: "North run", driverName: "Raj" }, date: "2026-11-03", progress: { done: 0, total: 2 } });
    expect(run.body.stops).toHaveLength(2);
    expect(run.body.stops[0]).toMatchObject({ customerName: expect.stringMatching(/^Cust/), addressNotes: "Side door", status: "scheduled", servings: 1 });
    // No email, no subscriber ids, no payment info.
    expect(JSON.stringify(run.body)).not.toMatch(/email|subscriptionId|amount|paymentMethod/i);
    const [row] = await env.db.select().from(tiffinDriverLinks).where(eq(tiffinDriverLinks.token, l.token));
    expect(row!.lastOpenedAt).toBeTruthy();
  });

  it("marks stops delivered or missed (not for another route), and the Deliveries tab and customer hear about it", async () => {
    const s = await setup();
    const l = await link(s, s.north.id);
    const other = await link(s, s.south.id);
    const run = (await call(env, null, "GET", `/v1/public/tiffin/driver/${l.token}`)).body;
    const [a, b] = run.stops;
    const done = await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/stops/${a.deliveryId}`, { status: "delivered" });
    expect(done.status).toBe(200);
    expect(done.body.progress).toEqual({ done: 1, total: 2 });
    const missed = await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/stops/${b.deliveryId}`, { status: "missed", note: "No answer" });
    expect(missed.body.progress.done).toBe(2);
    // Final stops are ignored on a repeat; the other route's token can't touch these stops.
    expect((await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/stops/${a.deliveryId}`, { status: "missed" })).body.stops.find((x: { deliveryId: string }) => x.deliveryId === a.deliveryId).status).toBe("delivered");
    expect((await call(env, null, "POST", `/v1/public/tiffin/driver/${other.token}/stops/${a.deliveryId}`, { status: "delivered" })).status).toBe(404);
    // Merchant side sees it.
    const manifest = await call(env, s.m.ownerToken, "GET", `${s.base}/manifest?date=2026-11-03`);
    const north = manifest.body.routes.find((r: { route: { name: string } }) => r.route?.name === "North run");
    expect(north.stops.map((x: { status: string }) => x.status).sort()).toEqual(["delivered", "missed"]);
    const kitchen = await call(env, s.m.ownerToken, "GET", `${s.base}/kitchen?date=2026-11-03`);
    expect(kitchen.body).toMatchObject({ delivered: 1, outForDelivery: 0 });
    expect(kitchen.body.routes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "North run", done: 1, total: 2, driver: "Raj" }), expect.objectContaining({ name: "South run", done: 0, total: 1 })]));
    const notes = await env.db.select().from(notifications).where(eq(notifications.type, "tiffin_update"));
    expect(notes.some((n) => (n.data as { event?: string }).event === "delivered")).toBe(true);
  });

  it("rejects another day's token, expired tokens (410), unknown tokens and bad bodies", async () => {
    const s = await setup();
    const l = await link(s, s.north.id);
    expect((await call(env, null, "GET", `/v1/public/tiffin/driver/${"x".repeat(32)}`)).status).toBe(404);
    expect((await call(env, null, "GET", `/v1/public/tiffin/driver/short`)).status).toBe(404);
    const run = (await call(env, null, "GET", `/v1/public/tiffin/driver/${l.token}`)).body;
    expect((await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/stops/${run.stops[0].deliveryId}`, { status: "bogus" })).status).toBe(400);
    // A link for tomorrow can't see today's stops: it is bound to its date.
    const tomorrow = await link(s, s.north.id, "2026-11-04");
    const t = await call(env, null, "GET", `/v1/public/tiffin/driver/${tomorrow.token}`);
    expect(t.body.date).toBe("2026-11-04");
    expect((await call(env, null, "POST", `/v1/public/tiffin/driver/${tomorrow.token}/stops/${run.stops[0].deliveryId}`, { status: "delivered" })).status).toBe(404);
    // Past the end of the day: 410.
    env.clock.now = new Date("2026-11-04T05:30:00Z");
    const gone = await call(env, null, "GET", `/v1/public/tiffin/driver/${l.token}`);
    expect(gone.status).toBe(410);
    expect(gone.body.error.code).toBe("link_expired");
    // Yesterday can't be linked.
    const token = await tokenFor(env, s.m.owner);
    expect((await call(env, token, "POST", `${s.base}/routes/${s.north.id}/driver-link`, { date: "2026-11-02" })).status).toBe(400);
  });

  it("running late tells the stops still to come, at most once every 15 minutes", async () => {
    const s = await setup();
    const l = await link(s, s.north.id);
    const run = (await call(env, null, "GET", `/v1/public/tiffin/driver/${l.token}`)).body;
    await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/stops/${run.stops[0].deliveryId}`, { status: "delivered" });
    const late = await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/late`, { minutes: 20 });
    expect(late.status).toBe(200);
    expect(late.body.notified).toBe(1);
    expect((await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/late`, { minutes: 20 })).status).toBe(429);
    expect((await call(env, null, "GET", `/v1/public/tiffin/driver/${l.token}`)).body.lateAvailableAt).toBeTruthy();
    env.clock.now = new Date(env.clock.now.getTime() + 16 * 60_000);
    expect((await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/late`, { minutes: 10 })).status).toBe(200);
    expect((await call(env, null, "POST", `/v1/public/tiffin/driver/${l.token}/late`, { minutes: 1 })).status).toBe(400);
  });
});

describe("dashboard: send links, mark all out, late notice", () => {
  it("sends links to routes with a driver phone (skips those without), and not in quiet hours", async () => {
    const s = await setup();
    const sent = await call(env, s.m.ownerToken, "POST", `${s.base}/driver-links/send`, { routeIds: [s.north.id, s.south.id], channel: "sms" });
    expect(sent.status).toBe(200);
    expect(sent.body.sent).toEqual([{ routeId: s.north.id, to: expect.stringMatching(/^\+1/), channel: "sms" }]);
    expect(sent.body.skipped).toEqual([{ routeId: s.south.id, reason: "no_phone" }]);
    const sms = (env.ctx.providers as unknown as { sms: { sent?: { to: string; body: string }[] } }).sms;
    if (sms.sent) expect(sms.sent.at(-1)!.body).toMatch(/\/d\//);
    // WhatsApp with no sender falls back to SMS.
    const wa = await call(env, s.m.ownerToken, "POST", `${s.base}/driver-links/send`, { routeIds: [s.north.id], channel: "whatsapp" });
    expect(wa.body.sent[0].channel).toBe("sms");
    env.clock.now = new Date("2026-11-04T03:30:00Z"); // 22:30 Toronto
    const token = await tokenFor(env, s.m.owner);
    const quiet = await call(env, token, "POST", `${s.base}/driver-links/send`, { routeIds: [s.north.id] });
    expect(quiet.body.skipped).toEqual([{ routeId: s.north.id, reason: "quiet_hours" }]);
  });

  it("marks all scheduled deliveries out (one route or the day) and sends a late notice", async () => {
    const s = await setup();
    const out = await call(env, s.m.ownerToken, "POST", `${s.base}/deliveries/mark-all-out`, { routeId: s.north.id });
    expect(out.body).toEqual({ updated: 2 });
    expect((await call(env, s.m.ownerToken, "POST", `${s.base}/deliveries/mark-all-out`, { routeId: s.north.id })).body).toEqual({ updated: 0 });
    const rows = await env.db.select().from(tiffinDeliveries).where(and(eq(tiffinDeliveries.date, "2026-11-03"), eq(tiffinDeliveries.status, "out_for_delivery")));
    expect(rows).toHaveLength(2);
    const all = await call(env, s.m.ownerToken, "POST", `${s.base}/deliveries/mark-all-out`, {});
    expect(all.body).toEqual({ updated: 1 });
    const late = await call(env, s.m.ownerToken, "POST", `${s.base}/deliveries/late-notice`, { routeId: s.north.id, minutes: 15 });
    expect(late.body).toEqual({ notified: 2 });
    expect((await call(env, s.m.ownerToken, "POST", `${s.base}/deliveries/late-notice`, { minutes: 15 })).body.notified).toBe(3);
    expect((await call(env, s.subs[0]!.c.token, "POST", `${s.base}/deliveries/mark-all-out`, {})).status).toBe(403);
  });
});

describe("kitchen: Today numbers", () => {
  it("adds prep totals from the (4) convention, money to confirm, needs-you counts and the next cutoff", async () => {
    const s = await setup();
    await call(env, s.m.ownerToken, "PUT", `${s.base}/menus`, { menus: [{ planId: s.plan.id, date: "2026-11-03", items: [{ name: "Rotli (4)" }, { name: "Dal tadka" }, { name: "Bhindi", perServing: 1 }] }] });
    const saved = await call(env, s.m.ownerToken, "GET", `${s.base}/menus?from=2026-11-03&to=2026-11-03`);
    expect(saved.body.items[0].items[0]).toMatchObject({ name: "Rotli (4)", perServing: 4 });
    const k = await call(env, s.m.ownerToken, "GET", `${s.base}/kitchen?date=2026-11-03`);
    expect(k.body.totals.servings).toBe(3);
    expect(k.body.prep).toEqual([
      { dish: "Bhindi", packs: 3, pieces: 3 },
      { dish: "Dal tadka", packs: 3, pieces: null },
      { dish: "Rotli", packs: 3, pieces: 12 },
    ]);
    // The three trust-started subscribers' first charges are awaiting.
    expect(k.body.awaiting).toEqual({ count: 3, cents: 36000 });
    expect(k.body.unrouted).toBe(0);
    // Plan cutoff 24h before 8:00 Toronto: today is Tue 10:00 so Wed's cutoff (Tue 8:00) has passed; Thu's is Wed 8:00.
    expect(k.body).toMatchObject({ nextMealDate: "2026-11-05", nextCutoffAt: "2026-11-04T13:00:00.000Z" });
  });
});
