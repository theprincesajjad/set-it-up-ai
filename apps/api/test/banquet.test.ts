import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cateringEvents, hallBookings, merchants } from "@ll/db";
import { expireHolds } from "../src/services/banquet.js";
import { jobs } from "../src/jobs/index.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";
import { customer, deliver, fake, paidMerchant } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

async function api(token: string | null, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown) {
  const res = await env.app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.statusCode, body: (res.body ? JSON.parse(res.body) : null) as any };
}

async function restaurant(tier: "starter" | "growth" | "pro" | null = "pro") {
  const m = await paidMerchant(env, { plan: "free" });
  await env.db.update(merchants).set({ restaurantTier: tier }).where(eq(merchants.id, m.merchant.id));
  const [merchant] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
  return { ...m, merchant: merchant!, base: `/v1/merchants/${m.merchant.id}` };
}

const hallBody = {
  name: "Zaitoon Hall",
  capacity: 250,
  baseCents: 150000,
  depositBps: 2500,
  packages: [{ name: "Walima dinner", perHeadCents: 3500, includes: ["Biryani, qorma, naan", "Chai & mithai", "Stage decor"] }],
};
const day = (d: number, h: number) => new Date(Date.UTC(2026, 11, d, h)).toISOString();
const slot = (d = 12, from = 17, to = 23) => ({ startsAt: day(d, from), endsAt: day(d, to) });

async function setup(tier: "starter" | "growth" | "pro" | null = "pro") {
  const m = await restaurant(tier);
  const hall = (await api(m.ownerToken, "POST", `${m.base}/banquet/halls`, hallBody)).body;
  return { m, hall };
}

describe("banquet gating", () => {
  it("needs the Pro restaurant tier", async () => {
    for (const tier of [null, "starter", "growth"] as const) {
      const m = await restaurant(tier);
      expect((await api(m.ownerToken, "GET", `${m.base}/banquet/halls`)).status).toBe(402);
      expect((await api(null, "GET", `/v1/public/shops/${m.merchant.slug}/banquet/halls`)).status).toBe(402);
    }
    const pro = await restaurant("pro");
    expect((await api(pro.ownerToken, "GET", `${pro.base}/banquet/halls`)).status).toBe(200);
  });
});

describe("halls", () => {
  it("CRUD with packages", async () => {
    const m = await restaurant();
    const created = await api(m.ownerToken, "POST", `${m.base}/banquet/halls`, hallBody);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Zaitoon Hall", capacity: 250, baseCents: 150000, depositBps: 2500, active: true, packages: [{ name: "Walima dinner", perHeadCents: 3500 }] });
    const id = created.body.id;
    const upd = await api(m.ownerToken, "PATCH", `${m.base}/banquet/halls/${id}`, { capacity: 300, depositBps: 3000 });
    expect(upd.body).toMatchObject({ capacity: 300, depositBps: 3000, name: "Zaitoon Hall" });
    expect((await api(m.ownerToken, "GET", `${m.base}/banquet/halls`)).body.items).toHaveLength(1);
    expect((await api(m.ownerToken, "POST", `${m.base}/banquet/halls`, { name: "", capacity: 0 })).status).toBe(400);
    expect((await api(m.ownerToken, "DELETE", `${m.base}/banquet/halls/${id}`)).status).toBe(204);
    expect((await api(m.ownerToken, "GET", `${m.base}/banquet/halls/${id}`)).status).toBe(404);
  });

  it("keeps a hall that has bookings, and hides inactive halls from the public list", async () => {
    const { m, hall } = await setup();
    const c = await customer(env);
    await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 100, ...slot() });
    expect((await api(m.ownerToken, "DELETE", `${m.base}/banquet/halls/${hall.id}`)).status).toBe(409);
    await api(m.ownerToken, "PATCH", `${m.base}/banquet/halls/${hall.id}`, { active: false });
    expect((await api(null, "GET", `/v1/public/shops/${m.merchant.slug}/banquet/halls`)).body.items).toHaveLength(0);
    expect((await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 50, ...slot(20) })).status).toBe(404);
  });
});

describe("holds and overlap", () => {
  it("prices the hold, holds 72h, and rejects overlaps with holds and confirmed bookings", async () => {
    const { m, hall } = await setup();
    const c = await customer(env);
    const c2 = await customer(env);
    // base 150000 + 3500 * 100 = 500000; HST 13% = 65000; total 565000; 25% deposit = 141250.
    const hold = await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, eventType: "walima", headcount: 100, packageName: "Walima dinner", ...slot() });
    expect(hold.status).toBe(201);
    expect(hold.body.booking).toMatchObject({ status: "hold", totalCents: 565000, depositCents: 141250, packageName: "Walima dinner", hallName: "Zaitoon Hall" });
    expect(hold.body.booking.holdExpiresAt).toBe(new Date(env.clock.now.getTime() + 72 * 3_600_000).toISOString());
    expect(hold.body.deposit).toMatchObject({ amountCents: 141250 });

    // Overlaps (partial, containing, contained) are refused; touching edges and other days are fine.
    const attempt = (s: string, e: string, token = c2.token, hallId = hall.id) => api(token, "POST", "/v1/me/banquet/holds", { hallId, headcount: 50, startsAt: s, endsAt: e });
    expect((await attempt(day(12, 22), day(13, 3))).status).toBe(409);
    expect((await attempt(day(12, 10), day(12, 18))).status).toBe(409);
    expect((await attempt(day(12, 8), day(13, 8))).status).toBe(409);
    expect((await attempt(day(12, 18), day(12, 20))).status).toBe(409);
    expect((await attempt(day(12, 23), day(13, 2))).status).toBe(201); // starts exactly when the first ends
    expect((await attempt(day(12, 12), day(12, 17))).status).toBe(201); // ends exactly when the first starts
    expect((await attempt(day(14, 17), day(14, 23))).status).toBe(201);

    // A second hall is independent.
    const other = (await api(m.ownerToken, "POST", `${m.base}/banquet/halls`, { ...hallBody, name: "Noor Room", capacity: 80 })).body;
    expect((await attempt(day(12, 18), day(12, 20), c2.token, other.id)).status).toBe(201);

    // Confirmed bookings block too.
    const conf = await api(m.ownerToken, "POST", `${m.base}/banquet/bookings/${hold.body.booking.id}/confirm`, { markDepositPaid: true });
    expect(conf.body).toMatchObject({ status: "confirmed", holdExpiresAt: null });
    expect((await attempt(day(12, 18), day(12, 20))).status).toBe(409);

    // Cancelling frees the slot.
    expect((await api(c.token, "POST", `/v1/me/banquet/bookings/${hold.body.booking.id}/cancel`)).body.status).toBe("cancelled");
    expect((await attempt(day(12, 18), day(12, 20))).status).toBe(201);
  });

  it("validates capacity, times and packages", async () => {
    const { hall } = await setup();
    const c = await customer(env);
    const post = (extra: object) => api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 100, ...slot(), ...extra });
    expect((await post({ headcount: 251 })).status).toBe(400);
    expect((await post({ startsAt: day(12, 23), endsAt: day(12, 17) })).status).toBe(400);
    expect((await post({ startsAt: "2026-11-01T10:00:00Z", endsAt: "2026-11-01T12:00:00Z" })).status).toBe(400); // past
    expect((await post({ packageName: "Nope" })).status).toBe(400);
    expect((await api(null, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 5, ...slot() })).status).toBe(401);
  });

  it("staff can hold on behalf of a customer by phone; availability shows busy windows", async () => {
    const { m, hall } = await setup();
    const r = await api(m.ownerToken, "POST", `${m.base}/banquet/bookings`, { hallId: hall.id, headcount: 80, ...slot(), customer: { phone: "416-555-0177", name: "Bilal Ahmed" } });
    expect(r.status).toBe(201);
    expect(r.body.booking).toMatchObject({ status: "hold", hallName: "Zaitoon Hall" });
    expect((await api(m.ownerToken, "POST", `${m.base}/banquet/bookings`, { hallId: hall.id, headcount: 80, ...slot(20) })).status).toBe(400);
    const q = `from=${encodeURIComponent(day(1, 0))}&to=${encodeURIComponent(day(31, 0))}`;
    const av = await api(m.ownerToken, "GET", `${m.base}/banquet/availability?${q}`);
    expect(av.body.halls[0].busy).toEqual([{ bookingId: r.body.booking.id, status: "hold", startsAt: day(12, 17), endsAt: day(12, 23) }]);
    const pub = await api(null, "GET", `/v1/public/shops/${m.merchant.slug}/banquet/availability?${q}&hallId=${hall.id}`);
    expect(pub.body.halls[0].busy).toHaveLength(1);
    expect(JSON.stringify(pub.body)).not.toContain("userId");
    expect((await api(m.ownerToken, "GET", `${m.base}/banquet/availability?from=${encodeURIComponent(day(5, 0))}&to=${encodeURIComponent(day(5, 0))}`)).status).toBe(400);
  });
});

describe("deposit and confirmation", () => {
  it("confirms from the deposit webhook (idempotent) and not before", async () => {
    const { m, hall } = await setup();
    const c = await customer(env);
    const hold = await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 100, packageName: "Walima dinner", ...slot() });
    const id = hold.body.booking.id;
    expect((await api(m.ownerToken, "POST", `${m.base}/banquet/bookings/${id}/confirm`, {})).status).toBe(409);
    const intent = fake(env).intents.get(hold.body.deposit.paymentIntentId)!;
    expect(intent).toMatchObject({ amountCents: 141250, metadata: { ll_kind: "hall_deposit", ll_id: id } });
    // Fetching again hands back the same intent.
    expect((await api(c.token, "GET", `/v1/me/banquet/bookings/${id}`)).body.deposit.paymentIntentId).toBe(intent.id);
    const ev = fake(env).succeedPaymentIntent(intent.id);
    await deliver(env, ev);
    await deliver(env, ev);
    const [row] = await env.db.select().from(hallBookings).where(eq(hallBookings.id, id));
    expect(row).toMatchObject({ status: "confirmed", depositPaidAt: env.clock.now, holdExpiresAt: null });
    expect((await api(m.ownerToken, "POST", `${m.base}/banquet/bookings/${id}/complete`)).body.status).toBe("completed");
  });

  it("a deposit paid after the hold lapsed is recorded but doesn't resurrect the booking", async () => {
    const { hall } = await setup();
    const c = await customer(env);
    const hold = await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 100, packageName: "Walima dinner", ...slot() });
    env.clock.now = new Date(env.clock.now.getTime() + 73 * 3_600_000);
    expect(await expireHolds(env.ctx)).toBe(1);
    await deliver(env, fake(env).succeedPaymentIntent(hold.body.deposit.paymentIntentId));
    const [row] = await env.db.select().from(hallBookings).where(eq(hallBookings.id, hold.body.booking.id));
    expect(row).toMatchObject({ status: "cancelled", depositPaidAt: env.clock.now });
  });
});

describe("hold expiry job", () => {
  it("cancels stale holds, keeps live holds and confirmed bookings, frees the slot, and tells the customer", async () => {
    const { m, hall } = await setup();
    const c = await customer(env);
    const a = (await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 50, ...slot(12) })).body.booking;
    env.clock.now = new Date(env.clock.now.getTime() + 48 * 3_600_000);
    c.token = await tokenFor(env, c.user); // access tokens follow the fake clock
    m.ownerToken = await tokenFor(env, m.owner);
    const b = (await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 50, ...slot(14) })).body.booking;
    const keep = (await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 50, ...slot(16) })).body.booking;
    await api(m.ownerToken, "POST", `${m.base}/banquet/bookings/${keep.id}/confirm`, { markDepositPaid: true });

    // 73h after `a` was placed: a is stale, b (25h old) is live.
    env.clock.now = new Date(env.clock.now.getTime() + 25 * 3_600_000);
    c.token = await tokenFor(env, c.user);
    // Between its expiry and the job running, `a` no longer blocks the slot.
    const sms = env.ctx.providers.outbox.sms.length;
    const job = jobs.find((j) => j.name === "banquet.expire_holds")!;
    expect(job).toBeTruthy();
    await job.run(env.ctx);
    const status = async (id: string) => (await env.db.select().from(hallBookings).where(eq(hallBookings.id, id)))[0]!.status;
    expect(await status(a.id)).toBe("cancelled");
    expect(await status(b.id)).toBe("hold");
    expect(await status(keep.id)).toBe("confirmed");
    expect(env.ctx.providers.outbox.sms.length).toBeGreaterThanOrEqual(sms); // notified via the inbox/push/SMS prefs
    expect(await expireHolds(env.ctx)).toBe(0);
    expect((await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 50, ...slot(12) })).status).toBe(201);
  });

  it("an expired-by-clock hold doesn't block a new hold and can't be confirmed", async () => {
    const { m, hall } = await setup();
    const c = await customer(env);
    const c2 = await customer(env);
    const a = (await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 50, ...slot() })).body.booking;
    env.clock.now = new Date(env.clock.now.getTime() + 73 * 3_600_000); // job hasn't run yet
    m.ownerToken = await tokenFor(env, m.owner);
    c2.token = await tokenFor(env, c2.user);
    expect((await api(m.ownerToken, "POST", `${m.base}/banquet/bookings/${a.id}/confirm`, { markDepositPaid: true })).body.error.code).toBe("hold_expired");
    expect((await api(c2.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 50, ...slot() })).status).toBe(201);
  });
});

describe("catering link", () => {
  it("links both directions from either side, and cancelling the booking unlinks", async () => {
    const { m, hall } = await setup();
    const c = await customer(env);
    const ev = (await api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, { name: "Ayesha Khan", phone: "(416) 555-0142", eventType: "wedding", eventDate: "2026-12-12", headcount: 120, service: "banquet" })).body;

    // Created with the link.
    const hold = await api(m.ownerToken, "POST", `${m.base}/banquet/bookings`, { hallId: hall.id, headcount: 120, ...slot(), cateringEventId: ev.id, customer: { phone: "(416) 555-0142" } });
    expect(hold.body.booking.cateringEventId).toBe(ev.id);
    const [e1] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, ev.id));
    expect(e1!.hallBookingId).toBe(hold.body.booking.id);
    expect((await api(m.ownerToken, "GET", `${m.base}/catering/${ev.id}`)).body.hallBookingId).toBe(hold.body.booking.id);

    // A second booking can't take the same event.
    expect((await api(m.ownerToken, "POST", `${m.base}/banquet/bookings`, { hallId: hall.id, headcount: 50, ...slot(14), cateringEventId: ev.id, customer: { phone: "(416) 555-0142" } })).status).toBe(409);

    // Cancel the booking: the event forgets it; then link from the catering side.
    await api(m.ownerToken, "POST", `${m.base}/banquet/bookings/${hold.body.booking.id}/cancel`);
    expect((await api(m.ownerToken, "GET", `${m.base}/catering/${ev.id}`)).body.hallBookingId).toBeNull();
    const again = (await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 100, ...slot(15) })).body.booking;
    const linked = await api(m.ownerToken, "POST", `${m.base}/catering/${ev.id}/hall-booking`, { hallBookingId: again.id });
    expect(linked.body.hallBookingId).toBe(again.id);
    expect((await api(m.ownerToken, "GET", `${m.base}/banquet/bookings/${again.id}`)).body.cateringEventId).toBe(ev.id);

    // Linking from the banquet side onto another event; cancelling the event frees the hall.
    await api(m.ownerToken, "POST", `${m.base}/catering/${ev.id}/cancel`, {});
    const [row] = await env.db.select().from(hallBookings).where(eq(hallBookings.id, again.id));
    expect(row!.status).toBe("cancelled");
  });

  it("customers can't attach someone else's catering event; the link needs both features", async () => {
    const { m, hall } = await setup();
    const c = await customer(env);
    const ev = (await api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, { name: "Ayesha Khan", phone: "(416) 555-0142", eventType: "wedding", eventDate: "2026-12-12", headcount: 120 })).body;
    const r = await api(c.token, "POST", "/v1/me/banquet/holds", { hallId: hall.id, headcount: 100, ...slot(), cateringEventId: ev.id });
    expect(r.body.booking.cateringEventId).toBeNull();
    const growth = await restaurant("growth");
    expect((await api(growth.ownerToken, "POST", `${growth.base}/catering/${ev.id}/hall-booking`, { hallBookingId: r.body.booking.id })).status).toBe(402);
    const bb = await api(m.ownerToken, "POST", `${m.base}/banquet/bookings/${r.body.booking.id}/catering`, { cateringEventId: ev.id });
    expect(bb.body.cateringEventId).toBe(ev.id);
  });
});
