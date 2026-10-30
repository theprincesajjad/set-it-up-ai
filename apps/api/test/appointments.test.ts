import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, invoices, ledgerTransactions, merchantCategories, merchantMembers, merchants, rewards, users } from "@ll/db";
import { FEATURES, FREE_FOREVER, PLANS, smsSegments } from "@ll/shared";
import { appointmentJobs } from "../src/jobs/appointments.js";
import { computeFees } from "../src/services/fees.js";
import { zonedToUtc } from "../src/services/bookings.js";
import { expireHolds } from "../src/services/appointments.js";
import { sendReminders } from "../src/services/appointments-booking.js";
import { FAKE_PM } from "../src/providers/paymentsFake.js";
import { call, customer, deliver, fake, paidMerchant, setPlan, staffMember } from "./commerce-fixtures.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") }); // Tue 10:00 in Toronto (EST)
});
afterEach(async () => env.close());

/** Local Toronto wall-clock ("2026-11-04 10:00") to an ISO instant. */
const at = (local: string) => {
  const [d, t] = local.split(" ") as [string, string];
  const [h, m] = t.split(":").map(Number) as [number, number];
  return zonedToUtc(d, h * 60 + m, "America/Toronto").toISOString();
};
const plusMin = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000).toISOString();

const MON_SAT = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "09:00", endsLocal: "17:00" }));

/** A salon with two stylists (Simran, Aisha), a front desk manager and a small price list, all through the API. */
async function salon(opts: { plan?: "free" | "plus" | "pro"; connect?: boolean; feeCents?: number; windowHours?: number; taxRegistered?: boolean | null } = {}) {
  const m = await paidMerchant(env, { plan: opts.plan ?? "plus", connect: opts.connect });
  // A salon registered for GST/HST unless a test says otherwise: appointments only charge tax for a registered shop.
  await env.db.update(merchants).set({ taxRegistered: opts.taxRegistered === undefined ? true : opts.taxRegistered }).where(eq(merchants.id, m.merchant.id));
  const base = `/v1/merchants/${m.merchant.id}`;
  const simran = await staffMember(env, m.merchant.id, "staff");
  const aisha = await staffMember(env, m.merchant.id, "staff");
  const desk = await staffMember(env, m.merchant.id, "manager");
  await env.db.update(users).set({ name: "Simran Kaur" }).where(eq(users.id, simran.user.id));
  await env.db.update(users).set({ name: "Aisha Khan" }).where(eq(users.id, aisha.user.id));
  const owner = m.ownerToken;
  const [hair] = await env.db.insert(merchantCategories).values({ merchantId: m.merchant.id, name: "Hair" }).returning();
  const mk = async (body: Record<string, unknown>) => (await call(env, owner, "POST", `${base}/services`, body)).body;
  const cut = await mk({ name: "Cut and blow-dry", durationMin: 45, priceCents: 6500, categoryId: hair!.id });
  const highlights = await mk({ name: "Highlights, half head", durationMin: 120, priceCents: 14500, depositCents: 4000, categoryId: hair!.id, priceFrom: true });
  const toner = await mk({ name: "Toner", durationMin: 30, priceCents: 3500, bufferMin: 10, depositCents: 0, categoryId: hair!.id });
  const threading = await mk({ name: "Threading, brows", durationMin: 15, priceCents: 1500 });
  for (const s of [simran, aisha]) {
    const r = await call(env, owner, "PUT", `${base}/staff/${s.user.id}/hours`, { days: MON_SAT });
    // Free has one bookable calendar (FREE_BOOKABLE_CALENDARS): Simran gets hers, Aisha is refused with the plan offer.
    expect(r.status).toBe(opts.plan === "free" && s === aisha ? 402 : 200);
  }
  if (opts.plan !== "free" && (opts.feeCents !== undefined || opts.windowHours !== undefined)) {
    const r = await call(env, owner, "PUT", `${base}/appointments/settings`, { noShowFeeCents: opts.feeCents, cancelWindowHours: opts.windowHours });
    expect(r.status).toBe(200);
  }
  const merchant = (await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id)))[0]!;
  return { ...m, merchant, base, simran, aisha, desk, cut, highlights, toner, threading, hair: hair! };
}
type Salon = Awaited<ReturnType<typeof salon>>;

const book = (s: Salon, token: string, body: Record<string, unknown>) => call(env, token, "POST", `${s.base}/appointments`, body);
const staffBooking = (s: Salon, staffId: string, start: string, services: string[], extra: Record<string, unknown> = {}) =>
  book(s, s.desk.token, { staffId, serviceIds: services, startsAt: at(start), customer: { phone: "+14165550123", name: "Neha Sharma" }, ...extra });

describe("gating and price list", () => {
  it("is free for one calendar, the second is offered on Pro; repair price list rides service.tickets", async () => {
    const free = await salon({ plan: "free" });
    // A Free shop creates services and gets one bookable calendar; the second is refused with the Pro offer.
    expect(free.cut.id).toBeTruthy();
    expect((await call(env, free.ownerToken, "GET", `${free.base}/services`)).body.items).toHaveLength(4);
    expect((await call(env, null, "GET", `/v1/public/shops/${free.merchant.slug}/services`)).status).toBe(200);
    const second = await call(env, free.ownerToken, "PUT", `${free.base}/staff/${free.aisha.user.id}/hours`, { days: MON_SAT });
    expect(second.status).toBe(402);
    expect(second.body.error).toMatchObject({ code: "plan_limit", details: { limit: "bookable_calendars", max: 1, offer: { kind: "plan", plan: "plus", priceCents: PLANS.plus.priceCents } } });
    // Also refused through a service list or the service's staff list.
    expect((await call(env, free.ownerToken, "PUT", `${free.base}/staff/${free.aisha.user.id}/services`, { services: [{ serviceId: free.cut.id }] })).status).toBe(402);
    expect((await call(env, free.ownerToken, "PATCH", `${free.base}/services/${free.cut.id}`, { staffIds: [free.simran.user.id, free.aisha.user.id] })).status).toBe(402);
    // Simran can still change her own hours and services.
    expect((await call(env, free.ownerToken, "PUT", `${free.base}/staff/${free.simran.user.id}/hours`, { days: MON_SAT.slice(0, 3) })).status).toBe(200);
    const cal = await call(env, free.desk.token, "GET", `${free.base}/appointments/staff`);
    expect(cal.status).toBe(200);
    expect(cal.body.items.map((x: { userId: string }) => x.userId)).toEqual([free.simran.user.id]);

    const s = await salon();
    const list = await call(env, s.desk.token, "GET", `${s.base}/services`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((x: { name: string }) => x.name)).toEqual(["Cut and blow-dry", "Highlights, half head", "Threading, brows", "Toner"]);
    expect(list.body.items[0]).toMatchObject({ kind: "appointment", durationMin: 45, priceCents: 6500, categoryName: "Hair", staffIds: [] });

    // Only managers change the price list.
    expect((await call(env, s.simran.token, "POST", `${s.base}/services`, { name: "Facial", durationMin: 30, priceCents: 5000 })).status).toBe(403);
    expect((await call(env, s.desk.token, "POST", `${s.base}/services`, { name: "Facial", durationMin: 3, priceCents: 5000 })).status).toBe(400);
    expect((await call(env, s.desk.token, "POST", `${s.base}/services`, { name: "Facial", durationMin: 30, priceCents: 1000, depositCents: 5000 })).status).toBe(400);
    const patched = await call(env, s.desk.token, "PATCH", `${s.base}/services/${s.cut.id}`, { priceCents: 7000, staffIds: [s.simran.user.id], rebookAfterDays: 35 });
    expect(patched.body).toMatchObject({ priceCents: 7000, staffIds: [s.simran.user.id], rebookAfterDays: 35 });

    // The repair price list uses the same table under another kind and another feature.
    const line = await call(env, s.desk.token, "POST", `${s.base}/services`, { kind: "repair_line", name: "Screen protector", durationMin: 0, priceCents: 2499 });
    expect(line.status).toBe(402); // plus, not pro: no service.tickets
    await setPlan(env, s.merchant.id, "pro");
    const line2 = await call(env, s.desk.token, "POST", `${s.base}/services`, { kind: "repair_line", name: "Screen protector", durationMin: 0, priceCents: 2499 });
    expect(line2.status).toBe(201);
    expect((await call(env, s.desk.token, "GET", `${s.base}/services?kind=repair_line`)).body.items).toHaveLength(1);
    expect((await call(env, s.desk.token, "GET", `${s.base}/services`)).body.items).toHaveLength(4);

    expect((await call(env, s.desk.token, "DELETE", `${s.base}/services/${s.threading.id}`)).status).toBe(204);
    expect((await call(env, s.desk.token, "DELETE", `${s.base}/services/${s.threading.id}`)).status).toBe(404);
  });

  it("keeps the new keys off the free-forever list and prices checkout at 0%", () => {
    expect(FREE_FOREVER).not.toContain("booking.appointments");
    expect(FEATURES["booking.appointments"]).toMatchObject({ minPlan: "free", defaultStage: "ga", freeForVerticals: ["pharmacy"] });
    expect(computeFees({ kind: "appointment_checkout", amountCents: 14_500, plan: "plus" })).toMatchObject({ platformFeeBps: 0, platformFeeCents: 0, merchantNetCents: 14_500 });
    expect(computeFees({ kind: "appointment_checkout", amountCents: 14_500, plan: "free" }).platformFeeCents).toBe(0);
    // Online deposits stay at 1%.
    expect(computeFees({ kind: "deposit", amountCents: 4000, plan: "plus" }).platformFeeCents).toBe(40);
  });
});

describe("staff hours, time off and the calendar", () => {
  it("reports first-run state, lists bookable staff and stores hours, time off and services", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    const base = `/v1/merchants/${m.merchant.id}`;
    const first = await call(env, m.ownerToken, "GET", `${base}/appointments/staff`);
    expect(first.body).toMatchObject({ items: [], setup: { services: 0, staffWithHours: 0, ready: false }, timezone: "America/Toronto" });

    const s = await salon();
    const cal = await call(env, s.desk.token, "GET", `${s.base}/appointments/staff`);
    expect(cal.body.setup).toMatchObject({ services: 4, staffWithHours: 2, ready: true });
    expect(cal.body.items.map((x: { name: string; initials: string }) => [x.name, x.initials])).toEqual([["Simran Kaur", "SK"], ["Aisha Khan", "AK"]]);
    expect(cal.body.items[0].hours).toHaveLength(6);
    expect(cal.body.items[0].hours[0]).toMatchObject({ weekday: 1, startsLocal: "09:00", endsLocal: "17:00" });

    // Hours: overlapping shifts and bad shape are refused; a split shift is fine.
    const put = (days: unknown[]) => call(env, s.desk.token, "PUT", `${s.base}/staff/${s.simran.user.id}/hours`, { days });
    expect((await put([{ weekday: 1, startsLocal: "09:00", endsLocal: "13:00" }, { weekday: 1, startsLocal: "12:00", endsLocal: "17:00" }])).status).toBe(400);
    expect((await put([{ weekday: 1, startsLocal: "13:00", endsLocal: "09:00" }])).status).toBe(400);
    expect((await put([{ weekday: 1, startsLocal: "09:00", endsLocal: "12:00" }, { weekday: 1, startsLocal: "13:00", endsLocal: "17:00" }])).body.items).toHaveLength(2);
    expect((await call(env, s.simran.token, "PUT", `${s.base}/staff/${s.simran.user.id}/hours`, { days: [] })).status).toBe(403);

    const off = await call(env, s.simran.token, "POST", `${s.base}/staff/${s.simran.user.id}/time-off`, { startsAt: at("2026-11-05 09:00"), endsAt: at("2026-11-05 17:00"), reason: "Dentist" });
    expect(off.status).toBe(201);
    expect((await call(env, s.simran.token, "POST", `${s.base}/staff/${s.simran.user.id}/time-off`, { startsAt: at("2026-11-05 17:00"), endsAt: at("2026-11-05 09:00") })).status).toBe(400);
    const cal2 = await call(env, s.desk.token, "GET", `${s.base}/appointments/staff`);
    expect(cal2.body.items[0].timeOff).toHaveLength(1);
    expect((await call(env, s.simran.token, "DELETE", `${s.base}/staff/time-off/${off.body.id}`)).status).toBe(204);

    const svc = await call(env, s.desk.token, "PUT", `${s.base}/staff/${s.aisha.user.id}/services`, { services: [{ serviceId: s.cut.id, durationMin: 60, priceCents: 8000 }] });
    expect(svc.body.items).toEqual([{ serviceId: s.cut.id, durationMin: 60, priceCents: 8000 }]);
    expect((await call(env, s.desk.token, "PUT", `${s.base}/staff/${s.aisha.user.id}/services`, { services: [{ serviceId: "00000000-0000-4000-8000-000000000000" }] })).status).toBe(400);
  });

  it("creates, moves, resizes and blocks appointments, with walk-ins and hour checks", async () => {
    const s = await salon();
    const a = await staffBooking(s, s.simran.user.id, "2026-11-04 10:00", [s.cut.id]);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ status: "booked", source: "staff", staffName: "Simran Kaur", customer: { name: "Neha Sharma", phone: "+14165550123", language: "en" }, totalCents: 6500 });
    expect(a.body.endsAt).toBe(plusMin(at("2026-11-04 10:00"), 45));

    const day = await call(env, s.desk.token, "GET", `${s.base}/appointments?from=${encodeURIComponent(at("2026-11-04 00:00"))}&to=${encodeURIComponent(at("2026-11-05 00:00"))}`);
    expect(day.body.items.map((x: { id: string }) => x.id)).toEqual([a.body.id]);

    // Outside working hours: 409 outside_hours; a front-desk manager may force it, plain staff may not.
    const early = await staffBooking(s, s.simran.user.id, "2026-11-04 08:00", [s.cut.id]);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("outside_hours");
    expect((await staffBooking(s, s.simran.user.id, "2026-11-04 08:00", [s.cut.id], { force: true })).status).toBe(201);
    expect((await book(s, s.aisha.token, { staffId: s.aisha.user.id, serviceIds: [s.cut.id], startsAt: at("2026-11-04 07:00"), customer: { name: "X" }, force: true })).status).toBe(403);
    // Sunday has no hours.
    expect((await staffBooking(s, s.aisha.user.id, "2026-11-08 10:00", [s.cut.id])).body.error.code).toBe("outside_hours");

    // Move to another time, then to another column.
    const moved = await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${a.body.id}`, { startsAt: at("2026-11-04 11:00") });
    expect(moved.body).toMatchObject({ startsAt: at("2026-11-04 11:00"), endsAt: plusMin(at("2026-11-04 11:00"), 45) });
    const toAisha = await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${a.body.id}`, { staffId: s.aisha.user.id });
    expect(toAisha.body).toMatchObject({ staffId: s.aisha.user.id, staffName: "Aisha Khan" });
    // Resize: drag the bottom edge.
    const resized = await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${a.body.id}`, { endsAt: at("2026-11-04 12:15") });
    expect(resized.body.endsAt).toBe(at("2026-11-04 12:15"));
    expect((await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${a.body.id}`, { endsAt: at("2026-11-04 10:00") })).status).toBe(400);
    // Dropping on a busy time snaps back with 409 slot_taken.
    const b = await staffBooking(s, s.aisha.user.id, "2026-11-04 14:00", [s.cut.id], { customer: { phone: "+14165550124", name: "Anita Joshi" } });
    const clash = await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${b.body.id}`, { startsAt: at("2026-11-04 12:00") });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("slot_taken");
    // Changing the services recomputes the block.
    const swapped = await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${b.body.id}`, { serviceIds: [s.cut.id, s.toner.id] });
    expect(swapped.body.endsAt).toBe(plusMin(at("2026-11-04 14:00"), 45 + 30 + 10));
    expect(swapped.body.items.map((i: { name: string }) => i.name)).toEqual(["Cut and blow-dry", "Toner"]);

    // A client who asked for a stylist by name needs a confirmation before moving to someone else.
    const req = await staffBooking(s, s.simran.user.id, "2026-11-04 16:00", [s.threading.id], { requestedStaff: true, customer: { phone: "+14165550125", name: "Kiran" } });
    const ask = await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${req.body.id}`, { staffId: s.aisha.user.id });
    expect(ask.body.error.code).toBe("requested_staff");
    const okay = await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${req.body.id}`, { staffId: s.aisha.user.id, confirmStaffChange: true });
    expect(okay.body).toMatchObject({ staffId: s.aisha.user.id, requestedStaff: false });

    // Time off blocks bookings.
    await call(env, s.desk.token, "POST", `${s.base}/staff/${s.simran.user.id}/time-off`, { startsAt: at("2026-11-06 09:00"), endsAt: at("2026-11-06 13:00"), reason: "Lunch and errands" });
    const blocked = await staffBooking(s, s.simran.user.id, "2026-11-06 12:00", [s.cut.id]);
    expect(blocked.body.error).toMatchObject({ code: "outside_hours", message: expect.stringContaining("time off") });
    expect((await staffBooking(s, s.simran.user.id, "2026-11-06 13:00", [s.cut.id])).status).toBe(201);
  });

  it("walk-ins start now, arrive at once and can be unassigned", async () => {
    const s = await salon();
    const w = await book(s, s.desk.token, { source: "walk_in", staffId: s.simran.user.id, serviceIds: [s.threading.id], customer: { name: "Zane" } });
    expect(w.status).toBe(201);
    expect(w.body).toMatchObject({ source: "walk_in", status: "arrived", startsAt: env.clock.now.toISOString(), customer: { name: "Zane", id: null }, arrivedAt: env.clock.now.toISOString() });
    // Same stylist, overlapping the walk-in: refused.
    expect((await book(s, s.desk.token, { source: "walk_in", staffId: s.simran.user.id, serviceIds: [s.threading.id] })).status).toBe(409);
    // Nobody picked yet: no chair to clash with.
    expect((await book(s, s.desk.token, { source: "walk_in", serviceIds: [s.threading.id] })).status).toBe(201);
  });
});

describe("policy settings", () => {
  it("reads and saves the cancel window, no-show fee and tips; only managers change them", async () => {
    const s = await salon();
    const url = `${s.base}/appointments/settings`;
    expect((await call(env, s.simran.token, "GET", url)).body).toEqual({ cancelWindowHours: 24, noShowFeeCents: 0, tipsEnabled: null, tipsOn: false, tipPresets: [15, 20, 25], tax: { applies: true, name: "HST" }, taxStatus: "registered" });
    expect((await call(env, s.simran.token, "PUT", url, { noShowFeeCents: 2500 })).status).toBe(403);
    const saved = await call(env, s.desk.token, "PUT", url, { cancelWindowHours: 48, noShowFeeCents: 3000, tipsEnabled: true, tipPresets: [10, 15, 20, 25] });
    expect(saved.body).toEqual({ cancelWindowHours: 48, noShowFeeCents: 3000, tipsEnabled: true, tipsOn: true, tipPresets: [10, 15, 20, 25], tax: { applies: true, name: "HST" }, taxStatus: "registered" });
    expect((await call(env, s.desk.token, "PUT", url, { cancelWindowHours: -1 })).status).toBe(400);
    expect((await call(env, s.desk.token, "PUT", url, { tipPresets: [] })).status).toBe(400);
    // The public page shows the new policy; the fee is a snapshot taken when the booking is made.
    expect((await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/services`)).body.policy).toMatchObject({ cancelWindowHours: 48, noShowFeeCents: 3000 });
    const a = await staffBooking(s, s.simran.user.id, "2026-11-04 10:00", [s.cut.id]);
    expect(a.body.noShowFeeCents).toBe(3000);
    await call(env, s.desk.token, "PUT", url, { noShowFeeCents: 1000 });
    expect((await call(env, s.desk.token, "GET", `${s.base}/appointments/${a.body.id}`)).body.appointment.noShowFeeCents).toBe(3000);
  });

  it("lets the public availability page be cached for 30 seconds", async () => {
    const s = await salon();
    const res = await env.app.inject({ method: "GET", url: `/v1/public/shops/${s.merchant.slug}/availability?serviceIds=${s.cut.id}&from=2026-11-04&to=2026-11-04` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=30");
  });
});

describe("overlap guard", () => {
  it("refuses a one-minute overlap, allows back-to-back, and a cancelled booking frees the time", async () => {
    const s = await salon();
    const first = await staffBooking(s, s.simran.user.id, "2026-11-04 10:00", [s.cut.id]); // 10:00 to 10:45
    expect(first.status).toBe(201);
    const overlap = await staffBooking(s, s.simran.user.id, "2026-11-04 10:44", [s.threading.id]);
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe("slot_taken");
    expect(overlap.body.error.message).toBe("That time was just taken. Pick another.");
    // Adjacent (end equals start) is fine, before and after.
    expect((await staffBooking(s, s.simran.user.id, "2026-11-04 10:45", [s.threading.id])).status).toBe(201);
    expect((await staffBooking(s, s.simran.user.id, "2026-11-04 09:45", [s.threading.id])).status).toBe(201);
    // Another stylist at the same time is fine.
    expect((await staffBooking(s, s.aisha.user.id, "2026-11-04 10:00", [s.cut.id])).status).toBe(201);
    // Cancel frees it.
    expect((await call(env, s.desk.token, "POST", `${s.base}/appointments/${first.body.id}/status`, { status: "cancelled" })).status).toBe(200);
    expect((await staffBooking(s, s.simran.user.id, "2026-11-04 10:30", [s.threading.id])).status).toBe(201);
  });

  it("holds under a race: of several simultaneous bookings for one chair, exactly one wins", async () => {
    const s = await salon();
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((i) => staffBooking(s, s.simran.user.id, "2026-11-04 13:00", [s.cut.id], { customer: { phone: `+1416555020${i}`, name: `Client ${i}` } })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === "slot_taken")).toBe(true);
  });

  it("is enforced by the database itself, not only by the API", async () => {
    const s = await salon();
    const ok = await staffBooking(s, s.simran.user.id, "2026-11-04 10:00", [s.cut.id]);
    expect(ok.status).toBe(201);
    const [a] = await env.db.select().from(appointments).where(eq(appointments.id, ok.body.id));
    const row = { merchantId: a!.merchantId, locationId: a!.locationId, staffId: a!.staffId, startsAt: new Date(a!.startsAt.getTime() + 60_000), endsAt: new Date(a!.endsAt.getTime() + 60_000) };
    await expect(env.db.insert(appointments).values(row)).rejects.toMatchObject({ cause: { code: "23P01" } });
    // A completed or no-show visit no longer holds the chair.
    await env.db.update(appointments).set({ status: "completed" }).where(eq(appointments.id, a!.id));
    await expect(env.db.insert(appointments).values(row)).resolves.toBeDefined();
  });
});

describe("availability", () => {
  const avail = (s: Salon, q: string, token: string | null = null) => call(env, token, "GET", `/v1/public/shops/${s.merchant.slug}/availability?${q}`);

  it("respects hours, time off, duration plus buffer, and picks a stylist for 'any'", async () => {
    const s = await salon();
    const q = (ids: string[], staff: string, from = "2026-11-04", to = "2026-11-04") => `serviceIds=${ids.join(",")}&staffId=${staff}&from=${from}&to=${to}`;
    // 45-minute cut with Simran on Wednesday: 9:00 to 16:15 in 15-minute steps (last start leaves 45 minutes before 17:00).
    const r = await avail(s, q([s.cut.id], s.simran.user.id));
    expect(r.status).toBe(200);
    const times = r.body.days[0].times;
    expect(times[0]).toEqual({ startsAt: at("2026-11-04 09:00"), staffId: s.simran.user.id });
    expect(times.at(-1).startsAt).toBe(at("2026-11-04 16:15"));
    expect(times).toHaveLength(((16 * 60 + 15) - 9 * 60) / 15 + 1);
    expect(r.body.blockMin).toBe(45);

    // Toner carries a 10-minute buffer: 30 + 10.
    const t = await avail(s, q([s.toner.id], s.simran.user.id));
    expect(t.body.blockMin).toBe(40);
    expect(t.body.days[0].times.at(-1).startsAt).toBe(at("2026-11-04 16:15")); // 16:15 + 40 = 16:55

    // A booking removes its block, buffer and all.
    await staffBooking(s, s.simran.user.id, "2026-11-04 10:00", [s.toner.id]); // 10:00 to 10:40
    const after = (await avail(s, q([s.cut.id], s.simran.user.id))).body.days[0].times.map((x: { startsAt: string }) => x.startsAt);
    expect(after).not.toContain(at("2026-11-04 09:30")); // 9:30 + 45 overlaps 10:00
    expect(after).toContain(at("2026-11-04 09:15"));
    expect(after).not.toContain(at("2026-11-04 10:30"));
    expect(after).toContain(at("2026-11-04 10:45"));

    // Time off removes the day for her, not for Aisha; 'any' then offers Aisha.
    await call(env, s.desk.token, "POST", `${s.base}/staff/${s.simran.user.id}/time-off`, { startsAt: at("2026-11-05 00:00"), endsAt: at("2026-11-06 00:00") });
    expect((await avail(s, q([s.cut.id], s.simran.user.id, "2026-11-05", "2026-11-05"))).body.days[0].times).toEqual([]);
    const any = await avail(s, q([s.cut.id], "any", "2026-11-05", "2026-11-05"));
    expect(any.body.days[0].times[0]).toEqual({ startsAt: at("2026-11-05 09:00"), staffId: s.aisha.user.id });

    // 'Any' on a day where both are free picks the one with the least booked time (Aisha: Simran has the toner).
    const tie = await avail(s, q([s.cut.id], "any"));
    const at900 = tie.body.days[0].times.find((x: { startsAt: string }) => x.startsAt === at("2026-11-04 09:00"));
    expect(at900.staffId).toBe(s.aisha.user.id);
    // Ties go to the lower id.
    const sundayless = await avail(s, q([s.cut.id], "any", "2026-11-07", "2026-11-07"));
    expect(sundayless.body.days[0].times[0].staffId).toBe([s.simran.user.id, s.aisha.user.id].sort()[0]);

    // A day with no hours returns no times; a service only some staff do narrows the pool; a stylist's own duration applies.
    expect((await avail(s, q([s.cut.id], "any", "2026-11-08", "2026-11-08"))).body.days[0].times).toEqual([]);
    await call(env, s.desk.token, "PATCH", `${s.base}/services/${s.cut.id}`, { staffIds: [s.aisha.user.id] });
    expect((await avail(s, q([s.cut.id], s.simran.user.id))).body.days[0].times).toEqual([]);
    await call(env, s.desk.token, "PUT", `${s.base}/staff/${s.aisha.user.id}/services`, { services: [{ serviceId: s.cut.id, durationMin: 60 }] });
    expect((await avail(s, q([s.cut.id], s.aisha.user.id))).body.blockMin).toBe(60);

    // Past times are never offered: it is 10:00 on Tuesday.
    const today = await avail(s, q([s.threading.id], s.aisha.user.id, "2026-11-03", "2026-11-03"));
    expect(today.body.days[0].times[0].startsAt).toBe(at("2026-11-03 10:15"));
    // Bad input.
    expect((await avail(s, "serviceIds=nope&from=2026-11-04&to=2026-11-04")).status).toBe(400);
    expect((await avail(s, q([s.cut.id], "any", "2026-11-04", "2027-01-30"))).status).toBe(400);
  });

  it("gives the right local times across the March and November clock changes", async () => {
    const s = await salon();
    // Sunday shifts on the two change days (2026-03-08 spring forward, 2026-11-01 fall back).
    await call(env, s.desk.token, "PUT", `${s.base}/staff/${s.simran.user.id}/hours`, { days: [{ weekday: 0, startsLocal: "01:00", endsLocal: "04:00" }, { weekday: 0, startsLocal: "09:00", endsLocal: "11:00" }, ...MON_SAT] });
    const q = (d: string) => `serviceIds=${s.threading.id}&staffId=${s.simran.user.id}&from=${d}&to=${d}`;

    env.clock.now = new Date("2026-02-20T15:00:00Z");
    const spring = (await avail(s, q("2026-03-08"))).body.days[0].times.map((x: { startsAt: string }) => x.startsAt);
    // 09:00 EDT is 13:00Z; 01:00 EST is 06:00Z and there is no 02:00 local: the next start is 03:00 EDT (07:00Z).
    expect(spring).toContain("2026-03-08T13:00:00.000Z");
    expect(spring.slice(0, 5)).toEqual(["2026-03-08T06:00:00.000Z", "2026-03-08T06:15:00.000Z", "2026-03-08T06:30:00.000Z", "2026-03-08T06:45:00.000Z", "2026-03-08T07:00:00.000Z"]);
    expect(new Set(spring).size).toBe(spring.length);

    env.clock.now = new Date("2026-10-28T15:00:00Z");
    const fall = (await avail(s, q("2026-11-01"))).body.days[0].times.map((x: { startsAt: string }) => x.startsAt);
    // 09:00 EST is 14:00Z, a day that is 25 hours long.
    expect(fall).toContain("2026-11-01T14:00:00.000Z");
    expect(fall.filter((t: string) => t >= "2026-11-01T14:00:00.000Z")).toEqual(["2026-11-01T14:00:00.000Z", "2026-11-01T14:15:00.000Z", "2026-11-01T14:30:00.000Z", "2026-11-01T14:45:00.000Z", "2026-11-01T15:00:00.000Z", "2026-11-01T15:15:00.000Z", "2026-11-01T15:30:00.000Z", "2026-11-01T15:45:00.000Z"]);
    expect([...fall].sort()).toEqual(fall);
    expect(new Set(fall).size).toBe(fall.length);
  });

  it("lists the public shop: services, stylists, policy and the shop's address", async () => {
    const s = await salon({ feeCents: 2500, windowHours: 24 });
    const r = await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/services`);
    expect(r.status).toBe(200);
    expect(r.body.shop).toMatchObject({ name: "Test Shop", slug: s.merchant.slug, timezone: "America/Toronto", address: "123 Roncesvalles Ave", locationId: s.location.id });
    expect(r.body.policy).toEqual({ cancelWindowHours: 24, noShowFeeCents: 2500, takesCards: true });
    expect(r.body.services).toHaveLength(4);
    expect(r.body.services.find((x: { name: string }) => x.name.startsWith("Highlights"))).toMatchObject({ priceFrom: true, depositCents: 4000, categoryName: "Hair" });
    expect(r.body.staff.map((x: { name: string; initials: string }) => [x.name, x.initials])).toEqual([["Aisha Khan", "AK"], ["Simran Kaur", "SK"]]);
    expect((await call(env, null, "GET", `/v1/public/shops/nope/services`)).status).toBe(404);
    // An inactive service is hidden.
    await call(env, s.desk.token, "PATCH", `${s.base}/services/${s.toner.id}`, { active: false });
    expect((await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/services`)).body.services).toHaveLength(3);
    expect((await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/availability?serviceIds=${s.toner.id}&from=2026-11-04&to=2026-11-04`)).status).toBe(400);
  });
});

describe("online booking: deposit, card on file and the 10-minute hold", () => {
  it("a payment-provider failure while starting the deposit releases the time instead of leaving a hold behind", async () => {
    const s = await salon({ feeCents: 2500 });
    const c = await customer(env);
    const start = at("2026-11-04 10:30");
    const pay = fake(env);
    const real = pay.createPaymentIntent.bind(pay);
    pay.createPaymentIntent = async () => {
      throw new Error("Unknown fake customer cus_fake_000014");
    };
    const failed = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.highlights.id], staffId: s.simran.user.id, startsAt: start });
    expect(failed.status).toBe(500);
    // Nothing is left holding Simran's time or counting against the customer's open bookings.
    expect((await env.db.select().from(appointments).where(and(eq(appointments.userId, c.user.id), eq(appointments.status, "booked")))).length).toBe(0);
    pay.createPaymentIntent = real;
    const retry = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.highlights.id], staffId: s.simran.user.id, startsAt: start });
    expect(retry.status).toBe(201);
    expect(retry.body.deposit).toMatchObject({ amountCents: 4000 });
  });

  it("holds the time, takes the deposit by webhook and confirms; the card is kept for a fee", async () => {
    const s = await salon({ feeCents: 2500 });
    const c = await customer(env, { name: "Neha Sharma" });
    const start = at("2026-11-04 10:30");
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.highlights.id, s.toner.id], staffId: s.simran.user.id, startsAt: start, notes: "Ammonia-free colour please" });
    expect(r.status).toBe(201);
    // 120 + 30 + 10 buffer = 160 minutes; deposit is the sum of service deposits ($40).
    expect(r.body.appointment).toMatchObject({ staffId: s.simran.user.id, staffName: "Simran Kaur", status: "booked", pending: true, depositCents: 4000, totalCents: 18000, policy: { cancelWindowHours: 24, noShowFeeCents: 2500 } });
    expect(r.body.appointment.endsAt).toBe(plusMin(start, 160));
    expect(r.body.appointment.holdExpiresAt).toBe(plusMin(env.clock.now.toISOString(), 10));
    expect(r.body.confirmed).toBe(false);
    // Only pharmacies carry the fixed reminder text; a salon's reminders name the service.
    expect(r.body.appointment.reminderText).toBeUndefined();
    expect(r.body.setup).toBeNull();
    expect(r.body.deposit).toMatchObject({ amountCents: 4000 });
    // Deposits carry the 1% online fee and keep the card on the customer for a late-cancel or no-show fee.
    const intent = fake(env).intents.get(r.body.deposit.paymentIntentId)!;
    expect(intent).toMatchObject({ amountCents: 4000, applicationFeeCents: 40, metadata: { ll_kind: "appointment_deposit", ll_id: r.body.appointment.id } });

    // The held time is gone for everyone else while the hold lasts.
    const other = await customer(env);
    const taken = await call(env, other.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: s.simran.user.id, startsAt: plusMin(start, 30) });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("slot_taken");
    const mine = await call(env, c.token, "GET", `/v1/me/appointments/${r.body.appointment.id}`);
    expect(mine.body.deposit.paymentIntentId).toBe(r.body.deposit.paymentIntentId);

    // Deposit paid (webhook; a replay changes nothing).
    const ev = fake(env).succeedPaymentIntent(r.body.deposit.paymentIntentId);
    await deliver(env, ev);
    await deliver(env, ev);
    const [row] = await env.db.select().from(appointments).where(eq(appointments.id, r.body.appointment.id));
    expect(row).toMatchObject({ holdExpiresAt: null, status: "booked", paymentMethodId: FAKE_PM.visa });
    expect(row!.depositPaidAt).toEqual(env.clock.now);
    expect(row!.stripeCustomerId).toBeTruthy();
    const after = await call(env, c.token, "GET", `/v1/me/appointments/${r.body.appointment.id}`);
    expect(after.body).toMatchObject({ appointment: { pending: false, hasCardOnFile: true }, deposit: null, setup: null });
    // Confirmation: the client has the app, so it goes by app push (phase-solo D ladder: app, web push, email, then a text).
    expect(env.ctx.providers.outbox.push.at(-1)).toMatchObject({ body: expect.stringContaining("You are booked at Test Shop") });
    // It shows on the shop's calendar with the card on file.
    const cal = await call(env, s.desk.token, "GET", `${s.base}/appointments?from=${encodeURIComponent(at("2026-11-04 00:00"))}&to=${encodeURIComponent(at("2026-11-05 00:00"))}`);
    expect(cal.body.items[0]).toMatchObject({ source: "online", hasCardOnFile: true, depositCents: 4000, clientNote: "Ammonia-free colour please" });
  });

  it("needs only a saved card when there is a no-show fee and no deposit; with neither it confirms at once", async () => {
    const s = await salon({ feeCents: 2500 });
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: null, startsAt: at("2026-11-04 09:00") });
    expect(r.body).toMatchObject({ confirmed: false, deposit: null, appointment: { depositCents: 0, pending: true } });
    expect(r.body.setup.setupIntentId).toBeTruthy();
    expect(r.body.appointment.staffId).toBeTruthy(); // 'any' picked a stylist
    await deliver(env, fake(env).succeedSetupIntent(r.body.setup.setupIntentId));
    const [row] = await env.db.select().from(appointments).where(eq(appointments.id, r.body.appointment.id));
    expect(row).toMatchObject({ holdExpiresAt: null, paymentMethodId: FAKE_PM.visa });

    // No fee, no deposit: confirmed immediately, texted, no payment step.
    const s2 = await salon();
    const c2 = await customer(env);
    const r2 = await call(env, c2.token, "POST", "/v1/me/appointments", { serviceIds: [s2.cut.id], staffId: s2.aisha.user.id, startsAt: at("2026-11-04 09:00") });
    expect(r2.body).toMatchObject({ confirmed: true, deposit: null, setup: null, appointment: { pending: false, holdExpiresAt: null } });
    expect(env.ctx.providers.outbox.push.at(-1)?.body).toContain("You are booked at Test Shop");
    // Without a Connect account there is no card step either: the shop collects at the chair.
    const s3 = await salon({ connect: false, feeCents: 2500 });
    const r3 = await call(env, c2.token, "POST", "/v1/me/appointments", { serviceIds: [s3.highlights.id], staffId: s3.simran.user.id, startsAt: at("2026-11-04 09:00") });
    expect(r3.body).toMatchObject({ confirmed: true, appointment: { depositCents: 0 } });
  });

  it("takes any stylist and refuses a taken or unavailable time", async () => {
    const s = await salon();
    const a = await customer(env);
    const b = await customer(env);
    const start = at("2026-11-04 11:00");
    const first = await call(env, a.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], startsAt: start });
    const second = await call(env, b.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], startsAt: start });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.appointment.staffId).not.toBe(first.body.appointment.staffId);
    // Both chairs are taken now.
    const third = await customer(env);
    expect((await call(env, third.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], startsAt: start })).body.error.code).toBe("slot_taken");
    // Not on the 15-minute grid, outside hours, and a past time are all refused as taken.
    expect((await call(env, third.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], startsAt: plusMin(start, 7) })).status).toBe(409);
    expect((await call(env, third.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], startsAt: at("2026-11-04 08:00") })).status).toBe(409);
    expect((await call(env, third.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], startsAt: at("2026-11-02 11:00") })).status).toBe(409);
    expect((await call(env, null, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], startsAt: start })).status).toBe(401);
    expect((await call(env, third.token, "POST", "/v1/me/appointments", { serviceIds: [], startsAt: start })).status).toBe(400);
    // Services from two shops can't be mixed.
    const other = await salon();
    expect((await call(env, third.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id, other.cut.id], startsAt: start })).status).toBe(400);
    // The customer's list.
    const mine = await call(env, a.token, "GET", "/v1/me/appointments");
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].merchant).toMatchObject({ name: "Test Shop", slug: s.merchant.slug, address: "123 Roncesvalles Ave" });
  });

  it("releases an unpaid hold after 10 minutes (job) and refuses to hoard holds", async () => {
    const s = await salon({ feeCents: 2500 });
    const c = await customer(env);
    const start = at("2026-11-04 10:00");
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: s.simran.user.id, startsAt: start });
    expect(r.body.appointment.pending).toBe(true);
    const q = `serviceIds=${s.cut.id}&staffId=${s.simran.user.id}&from=2026-11-04&to=2026-11-04`;
    const has = async () => (await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/availability?${q}`)).body.days[0].times.some((t: { startsAt: string }) => t.startsAt === start);
    expect(await has()).toBe(false);

    env.clock.now = new Date(env.clock.now.getTime() + 9 * 60_000);
    expect(await expireHolds(env.ctx)).toBe(0);
    expect(await has()).toBe(false);
    env.clock.now = new Date(env.clock.now.getTime() + 2 * 60_000); // 11 minutes in
    // The slot is free again even before the job runs ...
    expect(await has()).toBe(true);
    // ... and the job cancels the row.
    const job = appointmentJobs.find((j) => j.name === "appointments.hold_expiry")!;
    expect(job.everyMs).toBe(60_000);
    await job.run(env.ctx);
    const [row] = await env.db.select().from(appointments).where(eq(appointments.id, r.body.appointment.id));
    expect(row).toMatchObject({ status: "cancelled", cancelReason: "hold_expired", holdExpiresAt: null });
    expect(row!.cancelledAt).toEqual(env.clock.now);
    // Someone else books the freed chair.
    const d = await customer(env);
    expect((await call(env, d.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: s.simran.user.id, startsAt: start })).status).toBe(201);
    // The customer no longer sees the expired hold.
    expect((await call(env, c.token, "GET", "/v1/me/appointments")).body.items.filter((i: { status: string }) => i.status === "booked")).toHaveLength(0);

    // At most three open holds per customer.
    const h = await customer(env);
    const times = ["2026-11-05 09:00", "2026-11-05 10:00", "2026-11-05 11:00", "2026-11-05 12:00"].map(at);
    const codes: number[] = [];
    for (const t of times) codes.push((await call(env, h.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: s.aisha.user.id, startsAt: t })).status);
    expect(codes).toEqual([201, 201, 201, 429]);
  });

  it("takes the chair back when the deposit lands just after the hold lapsed, or refunds it if someone else booked", async () => {
    const s = await salon();
    const c = await customer(env);
    const start = at("2026-11-04 10:00");
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.highlights.id], staffId: s.simran.user.id, startsAt: start });
    env.clock.now = new Date(env.clock.now.getTime() + 11 * 60_000);
    await expireHolds(env.ctx);
    // Paid late, chair still free: revived and confirmed.
    await deliver(env, fake(env).succeedPaymentIntent(r.body.deposit.paymentIntentId));
    expect((await env.db.select().from(appointments).where(eq(appointments.id, r.body.appointment.id)))[0]).toMatchObject({ status: "booked", cancelReason: null, holdExpiresAt: null });

    // Same again, but this time somebody booked the chair in between: the deposit is refunded.
    const d = await customer(env);
    const start2 = at("2026-11-04 14:00");
    const r2 = await call(env, d.token, "POST", "/v1/me/appointments", { serviceIds: [s.highlights.id], staffId: s.aisha.user.id, startsAt: start2 });
    env.clock.now = new Date(env.clock.now.getTime() + 11 * 60_000);
    await expireHolds(env.ctx);
    expect((await staffBooking(s, s.aisha.user.id, "2026-11-04 14:00", [s.cut.id])).status).toBe(201);
    await deliver(env, fake(env).succeedPaymentIntent(r2.body.deposit.paymentIntentId));
    expect((await env.db.select().from(appointments).where(eq(appointments.id, r2.body.appointment.id)))[0]).toMatchObject({ status: "cancelled", cancelReason: "hold_expired" });
    expect(fake(env).intents.get(r2.body.deposit.paymentIntentId)!.refundedCents).toBe(4000);
  });
});

describe("cancel, reschedule, no-show and the fee", () => {
  /** A confirmed online booking with a deposit and a card on file, two days out (outside the 24 h window). */
  async function confirmed(s: Salon, start: string, services: string[] = [s.highlights.id], staffId = s.simran.user.id) {
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: services, staffId, startsAt: at(start) });
    expect(r.status).toBe(201);
    if (r.body.deposit) await deliver(env, fake(env).succeedPaymentIntent(r.body.deposit.paymentIntentId));
    else if (r.body.setup) await deliver(env, fake(env).succeedSetupIntent(r.body.setup.setupIntentId));
    return { c, id: r.body.appointment.id as string, deposit: r.body.deposit?.paymentIntentId as string | undefined };
  }

  it("cancels free before the window and refunds the deposit; inside it the fee goes to the card and the deposit counts", async () => {
    const s = await salon({ feeCents: 2500, windowHours: 24 });
    // Free: Thursday 10:00 is more than 24 hours away on Tuesday 10:00.
    const a = await confirmed(s, "2026-11-05 10:00");
    const freeCancel = await call(env, a.c.token, "POST", `/v1/me/appointments/${a.id}/cancel`);
    expect(freeCancel.status).toBe(200);
    expect(freeCancel.body).toMatchObject({ feeCharged: false, feeCents: 0, appointment: { status: "cancelled" } });
    expect(fake(env).intents.get(a.deposit!)!.refundedCents).toBe(4000);
    expect((await call(env, a.c.token, "POST", `/v1/me/appointments/${a.id}/cancel`)).status).toBe(409);

    // Inside the window (Wednesday 09:00 is 23 hours away): the $25 fee is covered by the $40 deposit, which is kept.
    const b = await confirmed(s, "2026-11-04 09:00");
    const late = await call(env, b.c.token, "POST", `/v1/me/appointments/${b.id}/cancel`);
    expect(late.body).toMatchObject({ feeCharged: false, feeCents: 0, appointment: { status: "cancelled" } });
    expect(fake(env).intents.get(b.deposit!)!.refundedCents).toBe(0);

    // No deposit, card on file: the fee is charged to the card, once.
    const s2 = await salon({ feeCents: 2500 });
    const c = await confirmed(s2, "2026-11-04 09:00", [s2.cut.id], s2.aisha.user.id);
    const charged = await call(env, c.c.token, "POST", `/v1/me/appointments/${c.id}/cancel`);
    expect(charged.body).toMatchObject({ feeCharged: true, feeCents: 2500, appointment: { status: "cancelled", feeChargedAt: env.clock.now.toISOString() } });
    const feeIntent = [...fake(env).intents.values()].find((i) => i.metadata.ll_kind === "appointment_fee")!;
    expect(feeIntent).toMatchObject({ amountCents: 2500, status: "succeeded" });
    expect(feeIntent.applicationFeeCents).toBe(25);

    // Before the window with no deposit, nothing is charged.
    const d = await confirmed(s2, "2026-11-06 12:00", [s2.cut.id], s2.aisha.user.id);
    expect((await call(env, d.c.token, "POST", `/v1/me/appointments/${d.id}/cancel`)).body).toMatchObject({ feeCharged: false });
    // Someone else's booking isn't yours to cancel.
    const e = await confirmed(s2, "2026-11-06 14:00", [s2.cut.id], s2.aisha.user.id);
    const stranger = await customer(env);
    expect((await call(env, stranger.token, "POST", `/v1/me/appointments/${e.id}/cancel`)).status).toBe(404);
  });

  it("reschedules free before the window, charges the fee inside it, and keeps the card and deposit", async () => {
    const s = await salon({ feeCents: 2500 });
    const a = await confirmed(s, "2026-11-06 10:00", [s.cut.id], s.simran.user.id);
    const moved = await call(env, a.c.token, "POST", `/v1/me/appointments/${a.id}/reschedule`, { startsAt: at("2026-11-06 14:00") });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ feeCharged: false, appointment: { startsAt: at("2026-11-06 14:00"), staffId: s.simran.user.id, status: "booked" } });
    // The same chair can't be taken twice; the old time is free again.
    expect((await call(env, a.c.token, "POST", `/v1/me/appointments/${a.id}/reschedule`, { startsAt: at("2026-11-06 04:00") })).body.error.code).toBe("slot_taken");
    const x = await customer(env);
    expect((await call(env, x.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: s.simran.user.id, startsAt: at("2026-11-06 10:00") })).status).toBe(201);

    // Inside the window (Wednesday 11:00, 25 hours before Thursday... use a booking for tomorrow morning).
    const b = await confirmed(s, "2026-11-04 09:00", [s.cut.id], s.aisha.user.id);
    const late = await call(env, b.c.token, "POST", `/v1/me/appointments/${b.id}/reschedule`, { startsAt: at("2026-11-04 15:00") });
    expect(late.body).toMatchObject({ feeCharged: true, feeCents: 2500, appointment: { startsAt: at("2026-11-04 15:00") } });
    expect(late.body.appointment.hasCardOnFile).toBe(true);
    // Asking for 'any' keeps the stylist the client picked only when they asked for one by name.
    expect((await call(env, b.c.token, "POST", `/v1/me/appointments/${b.id}/reschedule`, { startsAt: at("2026-11-05 15:00"), staffId: null })).body.appointment.staffId).toBeTruthy();
    // A cancelled booking can't be moved.
    await call(env, b.c.token, "POST", `/v1/me/appointments/${b.id}/cancel`);
    expect((await call(env, b.c.token, "POST", `/v1/me/appointments/${b.id}/reschedule`, { startsAt: at("2026-11-05 16:00") })).status).toBe(409);
  });

  it("charges the no-show fee only with a card on file, and only once", async () => {
    const s = await salon({ feeCents: 2500 });
    const status = (id: string, body: Record<string, unknown>, token = s.desk.token) => call(env, token, "POST", `${s.base}/appointments/${id}/status`, body);
    const feeIntents = () => [...fake(env).intents.values()].filter((i) => i.metadata.ll_kind === "appointment_fee");

    // A booking made at the desk has no card: the no-show stands, the fee can't be charged.
    const manual = await staffBooking(s, s.simran.user.id, "2026-11-03 10:00", [s.cut.id]);
    const noCard = await status(manual.body.id, { status: "no_show", chargeFee: true });
    expect(noCard.status).toBe(409);
    expect(noCard.body.error.code).toBe("no_card_on_file");
    expect((await call(env, s.desk.token, "GET", `${s.base}/appointments/${manual.body.id}`)).body.appointment.status).toBe("no_show");
    expect(feeIntents()).toHaveLength(0);
    // A no-show before the visit starts makes no sense.
    const later = await staffBooking(s, s.aisha.user.id, "2026-11-03 14:00", [s.cut.id]);
    expect((await status(later.body.id, { status: "no_show" })).body.error.code).toBe("not_started");

    // A client with a card on file (saved when booking) and no deposit.
    const a = await confirmed(s, "2026-11-03 11:00", [s.cut.id], s.simran.user.id);
    env.clock.now = new Date("2026-11-03T17:00:00Z"); // 12:00, an hour after the start
    const deskToken = await tokenFor(env, s.desk.user);
    const first = await status(a.id, { status: "no_show", chargeFee: true }, deskToken);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ feeCharged: true, feeCents: 2500, appointment: { status: "no_show", feeChargedAt: env.clock.now.toISOString() } });
    // A retry (double click, or the app resending) never charges twice.
    const again = await status(a.id, { status: "no_show", chargeFee: true }, deskToken);
    expect(again.body).toMatchObject({ feeCharged: true, feeCents: 2500 });
    expect(feeIntents()).toHaveLength(1);
    expect(feeIntents()[0]).toMatchObject({ amountCents: 2500, metadata: { ll_id: a.id } });

    // A declined card: the no-show stands, the fee isn't recorded as charged, staff can retry.
    const s2 = await salon({ feeCents: 2500 });
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s2.cut.id], staffId: s2.simran.user.id, startsAt: at("2026-11-03 13:00") });
    await deliver(env, fake(env).succeedSetupIntent(r.body.setup.setupIntentId, { paymentMethod: FAKE_PM.declined }));
    env.clock.now = new Date("2026-11-03T19:00:00Z");
    const declined = await call(env, await tokenFor(env, s2.desk.user), "POST", `${s2.base}/appointments/${r.body.appointment.id}/status`, { status: "no_show", chargeFee: true });
    expect(declined.status).toBe(409);
    expect(declined.body.error.code).toBe("fee_charge_failed");
    const [row] = await env.db.select().from(appointments).where(eq(appointments.id, r.body.appointment.id));
    expect(row).toMatchObject({ status: "no_show", feeChargedAt: null });

    // A paid deposit that covers the fee is simply kept.
    const s3 = await salon({ feeCents: 2500 });
    env.clock.now = new Date("2026-11-03T15:00:00Z");
    const d = await confirmed(s3, "2026-11-03 11:00", [s3.highlights.id], s3.simran.user.id);
    env.clock.now = new Date("2026-11-03T18:00:00Z");
    const kept = await call(env, await tokenFor(env, s3.desk.user), "POST", `${s3.base}/appointments/${d.id}/status`, { status: "no_show", chargeFee: true });
    expect(kept.body).toMatchObject({ feeCharged: false, feeCents: 0, appointment: { status: "no_show" } });

    // A shop with no fee says so.
    const s4 = await salon();
    const m = await staffBooking(s4, s4.simran.user.id, "2026-11-03 10:00", [s4.cut.id]);
    env.clock.now = new Date("2026-11-03T19:30:00Z");
    expect((await call(env, await tokenFor(env, s4.desk.user), "POST", `${s4.base}/appointments/${m.body.id}/status`, { status: "no_show", chargeFee: true })).body.error.code).toBe("no_fee");
  });
});

describe("front desk status", () => {
  it("checks in, starts, finishes and cancels (refunding the deposit), and refuses nonsense", async () => {
    const s = await salon();
    const a = await staffBooking(s, s.simran.user.id, "2026-11-04 10:00", [s.cut.id]);
    const st = (id: string, status: string, token = s.desk.token) => call(env, token, "POST", `${s.base}/appointments/${id}/status`, { status });
    const ci = await call(env, s.simran.token, "POST", `${s.base}/appointments/${a.body.id}/check-in`);
    expect(ci.body).toMatchObject({ appointment: { status: "arrived", arrivedAt: env.clock.now.toISOString() } });
    expect((await call(env, s.simran.token, "POST", `${s.base}/appointments/${a.body.id}/check-in`)).status).toBe(409);
    const chair = await st(a.body.id, "in_service");
    expect(chair.body.appointment).toMatchObject({ status: "in_service", startedAt: env.clock.now.toISOString() });
    expect((await st(a.body.id, "booked")).status).toBe(409);
    expect((await st(a.body.id, "cancelled")).status).toBe(409);
    expect((await st(a.body.id, "completed")).body.appointment).toMatchObject({ status: "completed", completedAt: env.clock.now.toISOString() });
    expect((await st(a.body.id, "arrived")).status).toBe(409);
    // A finished visit can't be moved.
    expect((await call(env, s.desk.token, "PATCH", `${s.base}/appointments/${a.body.id}`, { startsAt: at("2026-11-04 11:00") })).status).toBe(409);

    // Customers (not staff) can't use the desk.
    const c = await customer(env);
    expect((await st(a.body.id, "arrived", c.token)).status).toBe(403);
    expect((await call(env, c.token, "GET", `${s.base}/appointments?from=${encodeURIComponent(at("2026-11-04 00:00"))}&to=${encodeURIComponent(at("2026-11-05 00:00"))}`)).status).toBe(403);
    expect((await call(env, null, "GET", `${s.base}/appointments/staff`)).status).toBe(401);
    // Staff of another shop can't see this one.
    const other = await salon();
    expect((await call(env, other.desk.token, "GET", `${s.base}/appointments/${a.body.id}`)).status).toBe(403);
    expect((await call(env, s.desk.token, "GET", `${other.base}/appointments/${a.body.id}`)).status).toBe(403);

    // The shop cancelling a paid deposit gives it back.
    const dep = await call(env, (await customer(env)).token, "POST", "/v1/me/appointments", { serviceIds: [s.highlights.id], staffId: s.aisha.user.id, startsAt: at("2026-11-04 12:00") });
    await deliver(env, fake(env).succeedPaymentIntent(dep.body.deposit.paymentIntentId));
    const cancelled = await call(env, s.desk.token, "POST", `${s.base}/appointments/${dep.body.appointment.id}/status`, { status: "cancelled", reason: "Stylist is sick" });
    expect(cancelled.body.appointment).toMatchObject({ status: "cancelled", cancelReason: "Stylist is sick" });
    expect(fake(env).intents.get(dep.body.deposit.paymentIntentId)!.refundedCents).toBe(4000);
  });

  it("shows the client's last visits and reward balance in the detail", async () => {
    const s = await salon();
    const a = await staffBooking(s, s.simran.user.id, "2026-11-04 10:00", [s.cut.id]);
    const b = await staffBooking(s, s.simran.user.id, "2026-11-05 10:00", [s.cut.id, s.toner.id]);
    await call(env, s.desk.token, "POST", `${s.base}/appointments/${a.body.id}/status`, { status: "completed" });
    const d = await call(env, s.desk.token, "GET", `${s.base}/appointments/${b.body.id}`);
    expect(d.body.appointment.id).toBe(b.body.id);
    expect(d.body.lastVisits).toEqual([{ id: a.body.id, startsAt: a.body.startsAt, summary: "Cut and blow-dry" }]);
  });
});

describe("checkout", () => {
  /** An online booking with a $40 deposit for tomorrow 10:00; returns after the clock reaches the visit. */
  async function visit(s: Salon, opts: { start?: string; services?: string[] } = {}) {
    const c = await customer(env, { name: "Ritu Gill" });
    const start = opts.start ?? "2026-11-04 10:00";
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: opts.services ?? [s.highlights.id], staffId: s.simran.user.id, startsAt: at(start) });
    expect(r.status).toBe(201);
    if (r.body.deposit) await deliver(env, fake(env).succeedPaymentIntent(r.body.deposit.paymentIntentId));
    env.clock.now = new Date(at(start));
    const desk = await tokenFor(env, s.desk.user);
    return { c, id: r.body.appointment.id as string, desk };
  }
  const checkout = (s: Salon, v: { id: string; desk: string }, body: Record<string, unknown>) => call(env, v.desk, "POST", `${s.base}/appointments/${v.id}/checkout`, body);
  const earned = async (s: Salon, userId: string) => {
    const [m] = await env.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, s.merchant.id), eq(merchantMembers.userId, userId)));
    return m?.balance ?? 0;
  };

  it("bills at the counter with the deposit credited, the tip to the stylist, points on services only and no platform fee on the balance", async () => {
    const s = await salon();
    // A no-earn product (prescriptions-style category) alongside the colour service.
    const [kit] = await env.db.insert(merchantCategories).values({ merchantId: s.merchant.id, name: "Retail", earnEligible: false }).returning();
    const product = (await call(env, s.owner.id ? s.ownerToken : s.ownerToken, "POST", `${s.base}/services`, { name: "Colour-safe shampoo", durationMin: 5, priceCents: 3000, categoryId: kit!.id })).body;
    const v = await visit(s);
    await call(env, v.desk, "POST", `${s.base}/appointments/${v.id}/check-in`);

    expect((await checkout(s, v, { mode: "counter", tipCents: 14_501 })).status).toBe(400); // tip over 100% of the services
    const items = [
      { serviceId: s.highlights.id, name: "Highlights, half head", durationMin: 120, priceCents: 14_500 },
      { serviceId: product.id, name: "Colour-safe shampoo", durationMin: 0, priceCents: 3000 },
    ];
    const r = await checkout(s, v, { mode: "counter", counterMethod: "card_terminal", tipCents: 3000, items });
    expect(r.status).toBe(200);
    // $175 of services, 13% HST on that, the $40 deposit credited, the tip on top and outside tax.
    expect(r.body.invoice).toMatchObject({
      status: "paid",
      subtotalCents: 17_500,
      taxCents: 2275,
      totalCents: 19_775,
      depositAppliedCents: 4000,
      amountDueCents: 15_775,
      tipCents: 3000,
      tipStaffId: s.simran.user.id,
      discountCents: 0,
      payUrl: null,
    });
    // Points are on the colour service only: $145 (not the no-earn shampoo, tax or the tip).
    expect(r.body.invoice.pointsEarned).toBe(145);
    expect(await earned(s, (await env.db.select().from(appointments).where(eq(appointments.id, v.id)))[0]!.userId!)).toBe(145);
    // Platform fee: the online deposit paid 1% ($0.40); the balance taken through the calendar pays nothing.
    expect(r.body.invoice.platformFeeCents).toBe(40);
    expect(r.body.appointment).toMatchObject({ status: "completed", invoiceId: r.body.invoice.id, completedAt: env.clock.now.toISOString(), totalCents: 17_500 });
    const [inv] = await env.db.select().from(invoices).where(eq(invoices.id, r.body.invoice.id));
    expect(inv).toMatchObject({ appointmentId: v.id, tipCents: 3000, tipStaffId: s.simran.user.id, status: "paid" });
    expect(inv!.lineItems.map((l) => l.description)).toEqual(["Highlights, half head", "Colour-safe shampoo"]);

    // Checking out again is idempotent: the same paid invoice, no second charge or award.
    const again = await checkout(s, v, { mode: "counter", tipCents: 0 });
    expect(again.body.invoice.id).toBe(r.body.invoice.id);
    expect(await env.db.select().from(invoices).where(eq(invoices.merchantId, s.merchant.id))).toHaveLength(1);
    expect(await earned(s, v.c.user.id)).toBe(145);
  });

  it("charges tax only on taxable services, only for a shop registered for GST/HST", async () => {
    const s = await salon();
    // A gift card style line with "Charge tax" off, next to a taxable $65 cut.
    const gift = (await call(env, s.ownerToken, "POST", `${s.base}/services`, { name: "Gift card", durationMin: 5, priceCents: 5000, taxable: false })).body;
    expect(gift.taxable).toBe(false);
    const v = await visit(s, { services: [s.cut.id] });
    const r = await checkout(s, v, { mode: "counter", counterMethod: "cash", tipCents: 0, items: [{ serviceId: s.cut.id, name: "Cut and blow-dry", durationMin: 45, priceCents: 6500 }, { serviceId: gift.id, name: "Gift card", durationMin: 0, priceCents: 5000 }] });
    expect(r.status).toBe(200);
    // $115 of services, HST on the $65 only: 13% of 6500 = 845.
    expect(r.body.invoice).toMatchObject({ subtotalCents: 11_500, taxCents: 845, totalCents: 12_345 });
    const [inv] = await env.db.select().from(invoices).where(eq(invoices.id, r.body.invoice.id));
    expect(inv!.lineItems.map((l) => l.taxable)).toEqual([undefined, false]);

    // Not registered, and not answered yet: no tax at all.
    for (const status of [false, null]) {
      env.clock.now = new Date("2026-11-03T15:00:00Z");
      const plain = await salon({ taxRegistered: status });
      const pv = await visit(plain, { services: [plain.cut.id] });
      const pr = await checkout(plain, pv, { mode: "counter", counterMethod: "cash", tipCents: 0 });
      expect(pr.body.invoice, `taxRegistered ${status}`).toMatchObject({ subtotalCents: 6500, taxCents: 0, totalCents: 6500 });
    }
  });

  it("a reward discount comes off the taxable lines in proportion", async () => {
    const { taxableBase } = await import("../src/services/quotes.js");
    // $65 taxable + $50 not, with a $5 credit: the taxable share of the bill is 65/115.
    expect(taxableBase([{ quantity: 1, unitPriceCents: 6500 }, { quantity: 1, unitPriceCents: 5000, taxable: false }, { quantity: 1, unitPriceCents: -500 }])).toBe(Math.round((6500 * 11_000) / 11_500));
    expect(taxableBase([{ quantity: 1, unitPriceCents: 5000, taxable: false }])).toBe(0);
    expect(taxableBase([])).toBe(0);
  });

  it("tells the booking pages when to say plus HST: registered shop and a taxable service only", async () => {
    const s = await salon();
    const gift = (await call(env, s.ownerToken, "POST", `${s.base}/services`, { name: "Gift card", durationMin: 5, priceCents: 5000, taxable: false })).body;
    const pub = await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/services`);
    expect(pub.body.tax).toEqual({ applies: true, name: "HST" });
    expect(pub.body.services.find((x: { id: string }) => x.id === s.cut.id).taxable).toBe(true);
    expect(pub.body.services.find((x: { id: string }) => x.id === gift.id).taxable).toBe(false);
    const settings = await call(env, s.desk.token, "GET", `${s.base}/appointments/settings`);
    expect(settings.body.tax).toEqual({ applies: true, name: "HST" });

    const c = await customer(env);
    const taxed = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: s.simran.user.id, startsAt: at("2026-11-04 10:00") });
    expect(taxed.status).toBe(201);
    expect((await call(env, c.token, "GET", `/v1/me/appointments/${taxed.body.appointment.id}`)).body.appointment.tax).toEqual({ applies: true, name: "HST" });
    const free = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [gift.id], staffId: s.aisha.user.id, startsAt: at("2026-11-04 12:00") });
    expect((await call(env, c.token, "GET", `/v1/me/appointments/${free.body.appointment.id}`)).body.appointment.tax.applies).toBe(false);

    const small = await salon({ taxRegistered: false });
    expect((await call(env, null, "GET", `/v1/public/shops/${small.merchant.slug}/services`)).body.tax.applies).toBe(false);
    const unset = await salon({ taxRegistered: null });
    expect((await call(env, null, "GET", `/v1/public/shops/${unset.merchant.slug}/services`)).body.tax.applies).toBe(false);
  });

  it("applies a reward as a credit line and never earns points on it", async () => {
    const s = await salon();
    const v = await visit(s, { services: [s.cut.id] });
    // Give the client points to spend first (the shop's $5 off reward costs 50).
    const { awardPurchase } = await import("../src/services/ledger.js");
    await awardPurchase(env.ctx, { merchantId: s.merchant.id, userId: v.c.user.id, lines: [{ amountCents: 10_000 }], source: "dashboard", idempotencyKey: "seed-points", ignoreCooldown: true });
    expect(await earned(s, v.c.user.id)).toBe(100);
    const r = await checkout(s, v, { mode: "counter", rewardId: s.reward.id });
    expect(r.status).toBe(200);
    // $65 cut, $5 reward: $60 taxed at 13%.
    expect(r.body.invoice).toMatchObject({ subtotalCents: 6000, discountCents: 500, taxCents: 780, totalCents: 6780 });
    // The reward costs 50 points; points on the visit follow what the client actually pays for the work ($60).
    expect(await earned(s, v.c.user.id)).toBe(100 - 50 + 60);
    // A client who never joined the shop's rewards has no reward to apply.
    env.clock.now = new Date("2026-11-03T15:00:00Z");
    const s2 = await salon();
    const v2 = await visit(s2, { services: [s2.cut.id] });
    expect((await checkout(s2, v2, { mode: "counter", rewardId: s2.reward.id })).body.error.code).toBe("not_a_member");
  });

  it("sends a pay link (tip chosen by the client, stylist recorded) and never double-awards on a replayed webhook", async () => {
    const s = await salon();
    expect((await call(env, s.desk.token, "PUT", `${s.base}/appointments/settings`, { tipsEnabled: true })).status).toBe(200);
    const v = await visit(s, { services: [s.cut.id] });
    const sms0 = env.ctx.providers.outbox.sms.length;
    const r = await checkout(s, v, { mode: "link", tipCents: 999, tipStaffId: s.aisha.user.id });
    expect(r.status).toBe(200);
    // The desk can't pre-pay a tip on a link; who it goes to is recorded.
    expect(r.body.invoice).toMatchObject({ status: "open", tipCents: 0, tipStaffId: s.aisha.user.id, totalCents: 7345, amountDueCents: 7345 });
    expect(r.body.payUrl).toMatch(/\/i\//);
    expect(env.ctx.providers.outbox.sms.slice(sms0).at(-1)).toMatchObject({ to: v.c.user.phone, body: expect.stringContaining(r.body.payUrl) });
    expect(r.body.appointment.status).toBe("completed");

    const token = r.body.payUrl.split("/i/")[1];
    // The customer's pay page names the stylist the tip goes to ("Add a tip for Aisha"), not just the shop.
    const view = await call(env, null, "GET", `/v1/public/invoices/${token}`);
    expect(view.body.tip?.staff).toMatchObject({ id: s.aisha.user.id });
    const pay = await call(env, null, "POST", `/v1/public/invoices/${token}/pay`, {});
    expect(pay.status).toBe(200);
    // The balance through the pay link carries no platform fee either (the deposit already paid its 1%).
    expect(fake(env).intents.get(pay.body.payment.paymentIntentId)).toMatchObject({ amountCents: 7345, applicationFeeCents: 0 });
    const ev = fake(env).succeedPaymentIntent(pay.body.payment.paymentIntentId);
    await deliver(env, ev);
    await deliver(env, ev);
    await deliver(env, fake(env).succeedPaymentIntent(pay.body.payment.paymentIntentId));
    const [inv] = await env.db.select().from(invoices).where(eq(invoices.id, r.body.invoice.id));
    expect(inv).toMatchObject({ status: "paid", pointsEarned: 65 });
    const awards = await env.db.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.merchantId, s.merchant.id), eq(ledgerTransactions.idempotencyKey, `invoice:${inv!.id}`)));
    expect(awards).toHaveLength(1);
    expect(await earned(s, v.c.user.id)).toBe(65);
  });

  it("needs a phone for an anonymous walk-in, then attaches the client", async () => {
    const s = await salon();
    const w = await book(s, s.desk.token, { source: "walk_in", staffId: s.aisha.user.id, serviceIds: [s.threading.id], customer: { name: "Zane" } });
    expect(w.body.customer.id).toBeNull();
    const desk = s.desk.token;
    const noPhone = await call(env, desk, "POST", `${s.base}/appointments/${w.body.id}/checkout`, { mode: "counter" });
    expect(noPhone.status).toBe(409);
    expect(noPhone.body.error.code).toBe("customer_required");
    const ok = await call(env, desk, "POST", `${s.base}/appointments/${w.body.id}/checkout`, { mode: "counter", tipCents: 200, customer: { phone: "+14165550177", name: "Zane Ali" } });
    expect(ok.status).toBe(200);
    expect(ok.body.appointment.customer).toMatchObject({ name: "Zane Ali", phone: "+14165550177" });
    expect(ok.body.invoice).toMatchObject({ status: "paid", totalCents: 1695, tipCents: 200, tipStaffId: s.aisha.user.id, pointsEarned: 15 });
    // A cancelled or no-show appointment can't be billed.
    const x = await staffBooking(s, s.simran.user.id, "2026-11-04 10:00", [s.cut.id]);
    await call(env, desk, "POST", `${s.base}/appointments/${x.body.id}/status`, { status: "cancelled" });
    expect((await call(env, desk, "POST", `${s.base}/appointments/${x.body.id}/checkout`, { mode: "counter" })).status).toBe(409);
  });

  it("voids an unpaid pay link when the desk switches to the counter", async () => {
    const s = await salon();
    const v = await visit(s, { services: [s.cut.id] });
    const link = await checkout(s, v, { mode: "link" });
    const counter = await checkout(s, v, { mode: "counter", counterMethod: "cash", tipCents: 500 });
    expect(counter.body.invoice).toMatchObject({ status: "paid", tipCents: 500 });
    expect(counter.body.invoice.id).not.toBe(link.body.invoice.id);
    const [old] = await env.db.select().from(invoices).where(eq(invoices.id, link.body.invoice.id));
    expect(old!.status).toBe("void");
  });
});

describe("reminders", () => {
  const sms = () => env.ctx.providers.outbox.sms;
  // No app: the reminders reach these clients by text, the last rung of the ladder (phase-solo D).
  async function booked(s: Salon, start: string, locale?: string, stylist = s.simran.user.id) {
    const c = await customer(env, { pushToken: false });
    if (locale) await env.db.update(users).set({ locale }).where(eq(users.id, c.user.id));
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: stylist, startsAt: at(start) });
    expect(r.body.confirmed).toBe(true);
    return { c, id: r.body.appointment.id as string };
  }

  it("texts 24 hours and 2 hours before, once each, in one segment with shop, service, time, address, link and STOP", async () => {
    const s = await salon();
    const a = await booked(s, "2026-11-05 10:00");
    const n0 = sms().length;
    env.clock.now = new Date(at("2026-11-04 09:00")); // 25 hours before
    expect(await sendReminders(env.ctx)).toBe(0);
    env.clock.now = new Date(at("2026-11-04 10:30")); // 23.5 hours before
    expect(await sendReminders(env.ctx)).toBe(1);
    const day = sms().slice(n0).at(-1)!;
    expect(day.to).toBe(a.c.user.phone);
    expect(day.body).toContain("Test Shop: Cut and blow-dry");
    expect(day.body).toContain("123 Roncesvalles Ave");
    expect(day.body).toContain("/me");
    expect(day.body).toContain("Thu, Nov 5");
    expect(day.body).toContain("STOP to opt out");
    expect(smsSegments(day.body)).toBe(1);
    expect(await sendReminders(env.ctx)).toBe(0);

    env.clock.now = new Date(at("2026-11-05 08:30")); // 1.5 hours before
    expect(await sendReminders(env.ctx)).toBe(1);
    expect(sms().at(-1)!.body).toContain("Test Shop: see you at 10:00");
    expect(smsSegments(sms().at(-1)!.body)).toBe(1);
    expect(await sendReminders(env.ctx)).toBe(0);
    const [row] = await env.db.select().from(appointments).where(eq(appointments.id, a.id));
    expect(row!.reminder24SentAt).toBeTruthy();
    expect(row!.reminder2SentAt).toBeTruthy();
    expect(appointmentJobs.map((j) => j.name)).toEqual(["appointments.reminders", "appointments.hold_expiry"]);
  });

  it("skips the day-before text for a booking made inside 24 hours, and ignores cancelled or held bookings", async () => {
    const s = await salon({ feeCents: 2500 });
    env.clock.now = new Date(at("2026-11-04 09:00"));
    const late = await customer(env, { pushToken: false });
    const r = await call(env, late.token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: s.aisha.user.id, startsAt: at("2026-11-04 15:00") });
    await deliver(env, fake(env).succeedSetupIntent(r.body.setup.setupIntentId));
    const n0 = sms().length;
    env.clock.now = new Date(at("2026-11-04 09:05"));
    expect(await sendReminders(env.ctx)).toBe(0);
    env.clock.now = new Date(at("2026-11-04 13:30"));
    expect(await sendReminders(env.ctx)).toBe(1);
    expect(sms().slice(n0).filter((m) => m.body.includes("see you at"))).toHaveLength(1);
    expect(sms().slice(n0).filter((m) => m.body.startsWith("Test Shop: Cut"))).toHaveLength(0);

    // A held booking and a cancelled one get nothing.
    const held = await call(env, (await customer(env)).token, "POST", "/v1/me/appointments", { serviceIds: [s.cut.id], staffId: s.simran.user.id, startsAt: at("2026-11-04 14:00") });
    expect(held.body.appointment.pending).toBe(true);
    const gone = await staffBooking(s, s.simran.user.id, "2026-11-04 16:00", [s.threading.id]);
    await call(env, await tokenFor(env, s.desk.user), "POST", `${s.base}/appointments/${gone.body.id}/status`, { status: "cancelled" });
    expect(await sendReminders(env.ctx)).toBe(0);
  });

  it("writes the reminder in the client's language", async () => {
    const s = await salon();
    const a = await booked(s, "2026-11-05 09:00", "hi-IN");
    const p = await booked(s, "2026-11-05 09:00", "pa-IN", s.aisha.user.id);
    const u = await booked(s, "2026-11-05 10:00", "ur-PK");
    env.clock.now = new Date(at("2026-11-04 10:30"));
    const n0 = sms().length;
    expect(await sendReminders(env.ctx)).toBe(3);
    const to = (id: string) => sms().slice(n0).find((m) => m.to === id)!.body;
    expect(to(a.c.user.phone!)).toMatch(/याद दिलाना: Test Shop में Cut and blow-dry/);
    expect(to(a.c.user.phone!)).toContain("STOP");
    expect(to(p.c.user.phone!)).toMatch(/ਯਾਦ ਦਿਵਾਉਣਾ/);
    expect(to(u.c.user.phone!)).toMatch(/یاد دہانی/);
    expect(await env.db.select({ id: rewards.id }).from(rewards).limit(1)).toHaveLength(1);
  });
});
