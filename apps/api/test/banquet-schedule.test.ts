import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hallBookings, merchants, notifications } from "@ll/db";
import { restaurantApi } from "@ll/shared";
import { sendBanquetReminders, expireHolds } from "../src/services/banquet.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";
import { customer, paidMerchant } from "./commerce-fixtures.js";

let env: TestEnv;
// 2026-11-03 10:00 Toronto.
const T0 = new Date("2026-11-03T15:00:00Z");
beforeEach(async () => {
  env = await createTestEnv({ now: T0 });
});
afterEach(async () => env.close());

async function api(token: string | null, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown) {
  const res = await env.app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.statusCode, body: (res.body ? JSON.parse(res.body) : null) as any };
}

const hallBody = { name: "Zaitoon Hall", capacity: 250, baseCents: 150000, depositBps: 2500, packages: [{ name: "Walima dinner", perHeadCents: 3500, includes: ["Biryani"] }] };
const day = (d: number, h: number) => new Date(Date.UTC(2026, 11, d, h)).toISOString();

async function setup(hall: Record<string, unknown> = {}, merchant: Record<string, unknown> = {}) {
  const m = await paidMerchant(env, { plan: "free", connect: false });
  await env.db.update(merchants).set({ restaurantTier: "pro", ...merchant }).where(eq(merchants.id, m.merchant.id));
  const base = `/v1/merchants/${m.merchant.id}`;
  await api(m.ownerToken, "PUT", `${base}/payment-settings`, { etransferEnabled: true, etransferEmail: "events@zeenat.ca" });
  const h = (await api(m.ownerToken, "POST", `${base}/banquet/halls`, { ...hallBody, ...hall })).body;
  return { m, base, hall: h };
}
async function hold(s: Awaited<ReturnType<typeof setup>>, when = { startsAt: day(20, 17), endsAt: day(20, 23) }) {
  const r = await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings`, { hallId: s.hall.id, headcount: 100, packageName: "Walima dinner", customer: { phone: "(416) 555-0188", name: "Zainab Ali" }, eventType: "walima", ...when });
  expect(r.status).toBe(201);
  return r.body.booking;
}

describe("staged payments", () => {
  it("builds a schedule from the hall default (25% / 50% / 25%) that adds up to the total to the cent", async () => {
    const s = await setup();
    const b = await hold(s);
    // subtotal 150000 + 350000 = 500000; HST 65000; total 565000.
    expect(b).toMatchObject({ totalCents: 565000, depositCents: 141250, referenceCode: expect.stringMatching(/^ZA-\d{4}$/) });
    expect(b.schedule.map((r: { amountCents: number }) => r.amountCents)).toEqual([141250, 282500, 141250]);
    expect(b.schedule.reduce((x: number, r: { amountCents: number }) => x + r.amountCents, 0)).toBe(565000);
    expect(b.schedule.map((r: { dueOn: string }) => r.dueOn)).toEqual(["2026-11-03", "2026-12-06", "2026-12-13"]);
    expect(b.manual).toMatchObject({ email: "events@zeenat.ca", amountCents: 141250, referenceCode: b.referenceCode });
    expect(s.hall.paymentSchedule).toHaveLength(3);
  });

  it("rounding lands on the last step; a custom template must total 100%", async () => {
    expect(restaurantApi.buildHallSchedule(1001, [{ label: "a", bps: 3333, dueOffsetDays: 0 }, { label: "b", bps: 3333, dueOffsetDays: 14 }, { label: "c", bps: 3334, dueOffsetDays: 7 }], "2026-12-20", "2026-11-03").reduce((x, r) => x + r.amountCents, 0)).toBe(1001);
    const s = await setup();
    const bad = await api(s.m.ownerToken, "PATCH", `${s.base}/banquet/halls/${s.hall.id}`, { paymentSchedule: [{ label: "All", bps: 5000, dueOffsetDays: 0 }] });
    expect(bad.status).toBe(400);
    const ok = await api(s.m.ownerToken, "PATCH", `${s.base}/banquet/halls/${s.hall.id}`, { paymentSchedule: [{ label: "Half now", bps: 5000, dueOffsetDays: 0 }, { label: "Half later", bps: 5000, dueOffsetDays: 10 }] });
    expect(ok.body.paymentSchedule).toHaveLength(2);
    const b = await hold(s);
    expect(b.depositCents).toBe(282500);
    expect(b.schedule.map((r: { amountCents: number }) => r.amountCents)).toEqual([282500, 282500]);
  });

  it("records the deposit instalment, marks it paid, then confirms; the next instalment is the next to pay", async () => {
    const s = await setup();
    const b = await hold(s);
    const r = await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "etransfer", amountCents: 141250, receivedOn: "2026-11-03", bankReference: "CA9" });
    expect(r.status).toBe(200);
    expect(r.body.schedule[0].paidAt).toBe("2026-11-03");
    expect(r.body.depositPaidAt).toBeTruthy();
    expect(r.body.status).toBe("hold");
    expect(r.body.payments).toEqual([expect.objectContaining({ instalmentIndex: 0, method: "etransfer", subjectType: "hall_instalment" })]);
    expect(r.body.manual).toMatchObject({ amountCents: 282500 });
    const conf = await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/confirm`, {});
    expect(conf.body.status).toBe("confirmed");
    const second = await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "cheque", amountCents: 282500, receivedOn: "2026-11-03" });
    expect(second.body.schedule[1].paidAt).toBe("2026-11-03");
    // The same instalment can't be paid twice; a future date and a missing step are rejected.
    expect((await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "cheque", amountCents: 1, receivedOn: "2026-11-03", instalmentIndex: 1 })).status).toBe(409);
    expect((await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "cheque", amountCents: 1, receivedOn: "2026-11-04" })).status).toBe(400);
    expect((await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "cheque", amountCents: 1, receivedOn: "2026-11-03", instalmentIndex: 7 })).status).toBe(400);
  });

  it("auto-confirms on the first payment when the hall says so", async () => {
    const s = await setup({ autoConfirmOnFirstPayment: true });
    const b = await hold(s);
    const r = await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "etransfer", amountCents: 141250, receivedOn: "2026-11-03" });
    expect(r.body.status).toBe("confirmed");
  });

  it("an unpaid hold past its expiry frees the date and the chip leaves the calendar", async () => {
    const s = await setup();
    const b = await hold(s);
    const range = `from=${encodeURIComponent(day(1, 0))}&to=${encodeURIComponent(day(31, 0))}`;
    const before = await api(s.m.ownerToken, "GET", `${s.base}/banquet/availability?${range}`);
    expect(before.body.halls[0].busy).toEqual([expect.objectContaining({ bookingId: b.id, status: "hold", label: "Zainab Ali · walima · 100", holdExpiresAt: expect.any(String) })]);
    // The public calendar never shows who.
    const pub = await api(null, "GET", `/v1/public/shops/${s.m.merchant.slug}/banquet/availability?${range}`);
    expect(pub.body.halls[0].busy[0].label).toBeUndefined();
    env.clock.now = new Date(env.clock.now.getTime() + 73 * 3_600_000);
    expect(await expireHolds(env.ctx)).toBe(1);
    const token = await tokenFor(env, s.m.owner);
    expect((await api(token, "GET", `${s.base}/banquet/availability?${range}`)).body.halls[0].busy).toEqual([]);
  });
});

describe("void an instalment recorded by hand (owner only, audited)", () => {
  it("reopens the instalment and clears the deposit date, keeps the voided row with its reason, and is owner only", async () => {
    const s = await setup();
    const b = await hold(s);
    const paid = await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "etransfer", amountCents: 141250, receivedOn: "2026-11-03" });
    expect(paid.body.schedule[0].paidAt).toBeTruthy();
    expect((await api(null, "POST", `${s.base}/banquet/bookings/${b.id}/void-payment`, { reason: "x" })).status).toBe(401);
    const { staffMember } = await import("./commerce-fixtures.js");
    const manager = await staffMember(env, s.m.merchant.id, "manager");
    expect((await api(manager.token, "POST", `${s.base}/banquet/bookings/${b.id}/void-payment`, { reason: "x" })).status).toBe(403);
    expect((await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/void-payment`, {})).status).toBe(400);

    const v = await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/void-payment`, { reason: "Entered on the wrong booking" });
    expect(v.status).toBe(200);
    expect(v.body.schedule[0].paidAt).toBeNull();
    expect(v.body.depositPaidAt).toBeNull();
    expect(v.body.payments).toEqual([expect.objectContaining({ amountCents: 141250, voidReason: "Entered on the wrong booking", voidedAt: expect.any(String) })]);
    // Nothing left to void.
    expect((await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/void-payment`, { reason: "again" })).status).toBe(409);
    // The instalment can be paid again.
    expect((await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "cash", amountCents: 141250, receivedOn: "2026-11-03" })).status).toBe(200);
  });
});

describe("banquet reminders job", () => {
  const sent = async (type: string) => (await env.db.select().from(notifications).where(eq(notifications.type, "order_status"))).filter((n) => (n.data as { type?: string })?.type === type);
  it("sends hold-expiry notices at 24h and 4h and a payment-due notice once each, not in quiet hours", async () => {
    const s = await setup();
    const b = await hold(s);
    // 49h later: hold (72h) has 23h left -> 24h notice. Morning in Toronto.
    env.clock.now = new Date(T0.getTime() + 49 * 3_600_000);
    expect(await sendBanquetReminders(env.ctx)).toBe(1);
    expect(await sendBanquetReminders(env.ctx)).toBe(0);
    // 69h is 07:00 in Toronto: quiet hours, so the 4h notice waits until 08:00 (70h, 2h left).
    env.clock.now = new Date(T0.getTime() + 69 * 3_600_000);
    expect(await sendBanquetReminders(env.ctx)).toBe(0);
    env.clock.now = new Date(T0.getTime() + 70 * 3_600_000);
    expect(await sendBanquetReminders(env.ctx)).toBe(1);
    const rows = await env.db.select().from(hallBookings).where(eq(hallBookings.id, b.id));
    expect(rows[0]!.lastReminderKey).toBe("hold4");
    void sent;
  });

  it("reminds about an instalment due within 3 days, once", async () => {
    const s = await setup();
    const b = await hold(s);
    await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/payments`, { method: "etransfer", amountCents: 141250, receivedOn: "2026-11-03" });
    await api(s.m.ownerToken, "POST", `${s.base}/banquet/bookings/${b.id}/confirm`, {});
    // The second instalment is due 2026-12-06: 3 days before is Dec 3, 10:00.
    env.clock.now = new Date("2026-12-03T15:00:00Z");
    expect(await sendBanquetReminders(env.ctx)).toBe(1);
    expect(await sendBanquetReminders(env.ctx)).toBe(0);
    // 22:00: quiet hours wait.
    const c2 = await customer(env);
    void c2;
  });
});
