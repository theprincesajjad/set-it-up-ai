/**
 * Auto care (docs/research/auto-care.md): vehicles under the owner, service reminders by km or months, tire season capacity
 * and storage, wash check-in on the membership engine, and the vehicle estimate rules (written estimate before work, the 10%
 * cap, the estimate on the invoice).
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classMemberships, classPasses, merchantMembers, quotes, tireSets, tireSwaps, users, vehicleNudges, vehicleReadings, vehicles, washVisits } from "@ll/db";
import { call, customer, paidMerchant } from "./commerce-fixtures.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";
import { ensureMember } from "../src/services/ledger.js";
import { runServiceReminders } from "../src/services/auto-vehicles.js";
import { runTirePickupReminders } from "../src/services/auto-tires.js";
import { deleteAccount } from "../src/services/customer.js";

let env: TestEnv;
let tracked: { user: { id: string; platformRole: "none" | "rep" | "admin" }; token: string }[] = [];
let shops: { ownerUser: { id: string; platformRole: "none" | "rep" | "admin" }; owner: string }[] = [];
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-04T15:00:00Z") }); // Wed 10:00 Toronto, inside the fall tire window
  tracked = [];
  shops = [];
});
afterEach(async () => env.close());
async function jump(to: Date) {
  env.clock.now = to;
  for (const t of tracked) t.token = await tokenFor(env, t.user);
  for (const s of shops) s.owner = await tokenFor(env, s.ownerUser);
}
const sms = () => env.ctx.providers.outbox.sms;
const DAY = 86_400_000;
const ymd = (n: number) => new Date(env.clock.now.getTime() + n * DAY).toISOString().slice(0, 10);

async function shop(opts: { plan?: "free" | "plus" | "pro"; vertical?: string } = {}) {
  const m = await paidMerchant(env, { plan: opts.plan ?? "plus", vertical: opts.vertical ?? "repair_auto" });
  const out = { ...m, base: `/v1/merchants/${m.merchant.id}`, ownerUser: m.owner, owner: m.ownerToken };
  shops.push(out);
  return out;
}
type Shop = Awaited<ReturnType<typeof shop>>;

async function member(s: Shop, opts: { consent?: boolean; name?: string; locale?: string } = {}) {
  const c = await customer(env, { name: opts.name ?? "Maya Chen" });
  if (opts.locale) await env.db.update(users).set({ locale: opts.locale }).where(eq(users.id, c.user.id));
  const { member: m } = await env.db.transaction((tx) => ensureMember(env.ctx, tx, { merchantId: s.merchant.id, userId: c.user.id, joinedVia: "phone", consent: opts.consent === false ? null : { text: "Yes, text me.", source: "test" } }));
  const out = { ...c, memberId: m.id };
  tracked.push(out);
  return out;
}
const addCar = async (token: string, body: Record<string, unknown> = {}) => {
  const r = await call(env, token, "POST", "/v1/me/vehicles", { year: 2019, make: "Honda", model: "Civic", plate: "ABC 123", ...body });
  expect(r.status).toBe(201);
  return r.body as { id: string };
};
async function logOil(s: Shop, vehicleId: string, doneOn: string, km: number) {
  const r = await call(env, s.owner, "POST", `${s.base}/auto/vehicles/${vehicleId}/services`, { serviceKey: "oil", doneOn, km });
  expect(r.status).toBe(201);
  return r.body;
}

describe("gating", () => {
  it("needs the feature, the plan and the right trade", async () => {
    const free = await shop({ plan: "free" });
    expect((await call(env, free.owner, "GET", `${free.base}/auto/vehicles`)).status).toBe(402);
    const cafe = await shop({ vertical: "cafe" });
    expect((await call(env, cafe.owner, "GET", `${cafe.base}/auto/vehicles`)).status).toBe(402);
    const garage = await shop();
    expect((await call(env, garage.owner, "GET", `${garage.base}/auto/vehicles`)).status).toBe(200);
    expect((await call(env, garage.owner, "GET", `${garage.base}/auto/tires/plan`)).status).toBe(200);
    // The wash check-in belongs to car washes; a garage does not get it, and a wash does not get tire season.
    expect((await call(env, garage.owner, "GET", `${garage.base}/auto/wash/summary`)).status).toBe(402);
    const wash = await shop({ vertical: "car_wash" });
    expect((await call(env, wash.owner, "GET", `${wash.base}/auto/wash/summary`)).status).toBe(200);
    expect((await call(env, wash.owner, "GET", `${wash.base}/auto/vehicles`)).status).toBe(200);
    expect((await call(env, wash.owner, "GET", `${wash.base}/auto/tires/plan`)).status).toBe(402);
    expect((await call(env, null, "GET", `${garage.base}/auto/vehicles`)).status).toBe(401);
  });
});

describe("settings", () => {
  it("starts with the default intervals and capacity, and validates what a manager saves", async () => {
    const s = await shop();
    const d = (await call(env, s.owner, "GET", `${s.base}/auto/settings`)).body;
    expect(d).toMatchObject({ autoReminders: false, bays: 2, hoursPerDay: 8, minutesPerSwap: 45, swapsPerDay: 21, fallStart: "10-15", fallEnd: "11-30", washMaxPerDay: 1 });
    expect(d.services.find((x: { key: string }) => x.key === "oil")).toMatchObject({ everyKm: 8000, everyMonths: 6, active: true });
    const saved = await call(env, s.owner, "PUT", `${s.base}/auto/settings`, { bays: 3, minutesPerSwap: 30, services: [{ key: "oil", label: "Oil change", everyKm: 6000, everyMonths: 6, active: true }] });
    expect(saved.body).toMatchObject({ bays: 3, swapsPerDay: 48 });
    expect(saved.body.services).toHaveLength(1);
    expect((await call(env, s.owner, "PUT", `${s.base}/auto/settings`, { services: [{ key: "x", label: "X", everyKm: null, everyMonths: null, active: true }] })).status).toBe(400);
    expect((await call(env, s.owner, "PUT", `${s.base}/auto/settings`, { fallStart: "11-30", fallEnd: "10-15" })).status).toBe(400);
    const staff = await call(env, (await member(s)).token, "GET", `${s.base}/auto/settings`);
    expect([401, 403]).toContain(staff.status);
  });
});

describe("vehicles under the owner", () => {
  it("an owner adds a car; the plate is normalised, optional and limited to six cars", async () => {
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/vehicles", { year: 2019, make: "Honda", model: "Civic", plate: "abc-123", use: "rideshare" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ label: "2019 Honda Civic", plate: "ABC-123", use: "rideshare" });
    const [row] = await env.db.select().from(vehicles).where(eq(vehicles.id, r.body.id));
    expect(row!.plateNorm).toBe("ABC123");
    expect((await call(env, c.token, "POST", "/v1/me/vehicles", { make: "Kia", model: "Soul" })).body.plate).toBeNull();
    expect((await call(env, c.token, "POST", "/v1/me/vehicles", { make: "Kia", model: "Rio", plate: "!" })).status).toBe(400);
    for (let i = 0; i < 4; i++) await call(env, c.token, "POST", "/v1/me/vehicles", { make: "Ford", model: `F${i}` });
    expect((await call(env, c.token, "POST", "/v1/me/vehicles", { make: "Ford", model: "F9" })).status).toBe(409);
    const mine = await call(env, c.token, "GET", "/v1/me/vehicles");
    expect(mine.body.vehicles).toHaveLength(6);
  });
  it("only the owner can change, read a reading onto or delete a car", async () => {
    const a = await customer(env);
    const b = await customer(env);
    const car = await addCar(a.token);
    expect((await call(env, b.token, "PATCH", `/v1/me/vehicles/${car.id}`, { model: "Accord" })).status).toBe(404);
    expect((await call(env, b.token, "POST", `/v1/me/vehicles/${car.id}/readings`, { km: 5 })).status).toBe(404);
    expect((await call(env, b.token, "DELETE", `/v1/me/vehicles/${car.id}`)).status).toBe(404);
    expect((await call(env, a.token, "PATCH", `/v1/me/vehicles/${car.id}`, { model: "Accord", plate: null })).status).toBe(200);
    const r = await call(env, a.token, "POST", `/v1/me/vehicles/${car.id}/readings`, { km: 84210 });
    expect(r.body).toMatchObject({ km: 84210, day: "2026-11-04", source: "owner" });
    expect((await call(env, a.token, "POST", `/v1/me/vehicles/${car.id}/readings`, { km: 84300, day: "2026-12-01" })).status).toBe(400);
    expect((await call(env, a.token, "DELETE", `/v1/me/vehicles/${car.id}`)).status).toBe(204);
    expect((await call(env, a.token, "GET", "/v1/me/vehicles")).body.vehicles).toHaveLength(0);
  });
  it("a shop sees only the cars of its own members, with the plate; another shop sees nothing", async () => {
    const s1 = await shop();
    const s2 = await shop();
    const c = await member(s1);
    const car = await addCar(c.token);
    expect((await call(env, s1.owner, "GET", `${s1.base}/auto/vehicles`)).body.items.map((v: { id: string }) => v.id)).toEqual([car.id]);
    expect((await call(env, s1.owner, "GET", `${s1.base}/auto/vehicles/${car.id}`)).body.plate).toBe("ABC 123");
    expect((await call(env, s2.owner, "GET", `${s2.base}/auto/vehicles`)).body.items).toEqual([]);
    expect((await call(env, s2.owner, "GET", `${s2.base}/auto/vehicles/${car.id}`)).status).toBe(404);
    expect((await call(env, s1.owner, "GET", `${s1.base}/auto/vehicles?q=abc123`)).body.items).toHaveLength(1);
    expect((await call(env, s1.owner, "GET", `${s1.base}/auto/vehicles?q=zzz`)).body.items).toHaveLength(0);
  });
  it("staff add a car for a member with an odometer reading, and cannot use another shop's member", async () => {
    const s1 = await shop();
    const s2 = await shop();
    const c = await member(s1);
    const made = await call(env, s1.owner, "POST", `${s1.base}/auto/vehicles`, { memberId: c.memberId, year: 2016, make: "Toyota", model: "Camry", use: "rideshare", odometerKm: 120000 });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ label: "2016 Toyota Camry", use: "rideshare", odometerKm: 120000, ownerName: "Maya Chen" });
    expect((await call(env, s2.owner, "POST", `${s2.base}/auto/vehicles`, { memberId: c.memberId, make: "Toyota", model: "Camry" })).status).toBe(404);
  });
});

describe("service reminders by km or months", () => {
  it("counts from the logged service, estimates km a day from readings and picks the earlier date", async () => {
    const s = await shop();
    const c = await member(s);
    const car = await addCar(c.token);
    // Two staff readings 28 days apart at 100 km a day.
    await call(env, s.owner, "POST", `${s.base}/auto/vehicles/${car.id}/readings`, { km: 80000, day: ymd(-28) });
    await call(env, s.owner, "POST", `${s.base}/auto/vehicles/${car.id}/readings`, { km: 82800, day: ymd(0) });
    const d = await logOil(s, car.id, ymd(0), 82800);
    expect(d).toMatchObject({ kmPerDay: 100, kmPerDayBasis: "readings", odometerKm: 82800 });
    const oil = d.reminders.find((r: { serviceKey: string }) => r.serviceKey === "oil");
    expect(oil).toMatchObject({ basis: "km", dueAtKm: 90800, status: "ok", every: "8,000 km or 6 months" });
    expect(oil.dueOn).toBe(ymd(80));
    // Brake inspection has never been logged: nothing is due until the shop logs one.
    expect(d.reminders.find((r: { serviceKey: string }) => r.serviceKey === "brakes").status).toBe("unknown");
    // A rideshare car uses the severe interval.
    await call(env, c.token, "PATCH", `/v1/me/vehicles/${car.id}`, { use: "rideshare" });
    const r2 = (await call(env, s.owner, "GET", `${s.base}/auto/vehicles/${car.id}`)).body.reminders.find((r: { serviceKey: string }) => r.serviceKey === "oil");
    expect(r2.dueAtKm).toBe(87800);
    expect(r2.dueOn).toBe(ymd(50));
  });
  it("the owner can override km a day, and a log refuses a service the shop does not list or a future day", async () => {
    const s = await shop();
    const c = await member(s);
    const car = await addCar(c.token);
    await logOil(s, car.id, ymd(-10), 50000);
    const o = await call(env, s.owner, "PATCH", `${s.base}/auto/vehicles/${car.id}`, { kmPerDayOverride: 25, note: "Delivery driver" });
    expect(o.body).toMatchObject({ kmPerDay: 25, kmPerDayBasis: "override", note: "Delivery driver" });
    expect((await call(env, s.owner, "POST", `${s.base}/auto/vehicles/${car.id}/services`, { serviceKey: "nope" })).status).toBe(400);
    expect((await call(env, s.owner, "POST", `${s.base}/auto/vehicles/${car.id}/services`, { serviceKey: "oil", doneOn: ymd(3) })).status).toBe(400);
  });
  it("the owner sees each shop's reminders on /me/vehicles", async () => {
    const s = await shop();
    const c = await member(s);
    const car = await addCar(c.token);
    await logOil(s, car.id, ymd(-200), 70000);
    const mine = (await call(env, c.token, "GET", "/v1/me/vehicles")).body;
    expect(mine.vehicles[0].shops[0]).toMatchObject({ shopName: s.merchant.name });
    expect(mine.vehicles[0].shops[0].reminders.find((r: { serviceKey: string }) => r.serviceKey === "oil").status).toBe("overdue");
  });

  it("lists due and overdue cars, texts once with consent and never the plate, and a skip counts as done", async () => {
    const s = await shop();
    const a = await member(s, { name: "Maya Chen" });
    const b = await member(s, { name: "Dev Patel", consent: false });
    const carA = await addCar(a.token, { plate: "ZZZ 999" });
    const carB = await addCar(b.token, { make: "Toyota", model: "Camry", plate: null, year: 2016 });
    await logOil(s, carA.id, ymd(-200), 70000); // 6 months is up: overdue
    await logOil(s, carB.id, ymd(-200), 70000);
    const list = (await call(env, s.owner, "GET", `${s.base}/auto/reminders`)).body;
    const oilRows = list.items.filter((r: { serviceKey: string }) => r.serviceKey === "oil");
    expect(oilRows).toHaveLength(2);
    expect(oilRows.find((r: { vehicleId: string }) => r.vehicleId === carB.id)).toMatchObject({ canSend: false, cannotWhy: "No text consent" });
    expect(oilRows.find((r: { vehicleId: string }) => r.vehicleId === carA.id)).toMatchObject({ canSend: true, status: "overdue", basis: "months" });
    expect(list.counts.overdue).toBeGreaterThanOrEqual(2);
    const sent = await call(env, s.owner, "POST", `${s.base}/auto/reminders/send`, { items: [{ vehicleId: carA.id, serviceKey: "oil" }] });
    expect(sent.body).toEqual({ sent: 1, skipped: 0 });
    expect(sms()).toHaveLength(1);
    expect(sms()[0]!.body).toContain("2019 Honda Civic");
    expect(sms()[0]!.body).toContain("oil and filter");
    expect(sms()[0]!.body).toContain("STOP");
    expect(sms()[0]!.body).not.toMatch(/ZZZ ?999/);
    // Once per car, service and due date.
    expect((await call(env, s.owner, "POST", `${s.base}/auto/reminders/send`, { items: [{ vehicleId: carA.id, serviceKey: "oil" }] })).status).toBe(409);
    const again = (await call(env, s.owner, "GET", `${s.base}/auto/reminders`)).body.items.filter((r: { vehicleId: string; serviceKey: string }) => r.vehicleId === carA.id && r.serviceKey === "oil");
    expect(again).toHaveLength(0);
    // Everyone else: the consent-less owner is skipped, not texted.
    const all = await call(env, s.owner, "POST", `${s.base}/auto/reminders/send`, {});
    expect(all.body.sent).toBe(0);
    expect(sms()).toHaveLength(1);
    const skip = await call(env, s.owner, "POST", `${s.base}/auto/reminders/send`, { skip: true });
    expect(skip.body.skipped).toBeGreaterThanOrEqual(1);
    const rows = await env.db.select().from(vehicleNudges).where(eq(vehicleNudges.vehicleId, carB.id));
    expect(rows.every((r) => r.action === "skipped")).toBe(true);
  });
  it("does not text a number that said STOP, at night, or in someone else's language", async () => {
    const s = await shop();
    const a = await member(s, { locale: "hi" });
    const car = await addCar(a.token);
    await logOil(s, car.id, ymd(-200), 70000);
    await jump(new Date("2026-11-05T03:00:00Z")); // 22:00 Toronto
    expect((await call(env, s.owner, "POST", `${s.base}/auto/reminders/send`, {})).body).toMatchObject({ sent: 0 });
    expect(sms()).toHaveLength(0);
    await jump(new Date("2026-11-05T15:00:00Z"));
    expect((await call(env, s.owner, "POST", `${s.base}/auto/reminders/send`, {})).body.sent).toBe(1);
    expect(sms()[0]!.body).toContain("STOP");
    expect(sms()[0]!.body).toContain("Civic");
    expect(sms()[0]!.body).toMatch(/[ऀ-ॿ]/); // Hindi
  });
  it("the hourly job sends only at 10:00 shop time and only for shops that turned it on", async () => {
    const on = await shop();
    const off = await shop();
    for (const s of [on, off]) {
      const c = await member(s);
      const car = await addCar(c.token);
      await logOil(s, car.id, ymd(-200), 70000);
    }
    await call(env, on.owner, "PUT", `${on.base}/auto/settings`, { autoReminders: true });
    await jump(new Date("2026-11-04T17:00:00Z")); // 12:00 Toronto
    expect(await runServiceReminders(env.ctx)).toBe(0);
    await jump(new Date("2026-11-04T15:00:00Z")); // 10:00 Toronto
    expect(await runServiceReminders(env.ctx)).toBeGreaterThanOrEqual(1);
    expect(sms().every((m) => m.body.includes(on.merchant.name))).toBe(true);
    const n = sms().length;
    expect(await runServiceReminders(env.ctx)).toBe(0);
    expect(sms()).toHaveLength(n);
  });
});

describe("tire season", () => {
  it("the plan shows capacity by day from bays, hours and minutes a swap, and counts booked swaps", async () => {
    const s = await shop();
    await call(env, s.owner, "PUT", `${s.base}/auto/settings`, { bays: 1, hoursPerDay: 2, minutesPerSwap: 60 }); // 2 a day
    const c = await member(s);
    const day = ymd(3);
    expect((await call(env, s.owner, "POST", `${s.base}/auto/tires/swaps`, { memberId: c.memberId, day })).status).toBe(201);
    const plan = (await call(env, s.owner, "GET", `${s.base}/auto/tires/plan?days=7`)).body;
    expect(plan.window).toMatchObject({ name: "fall", open: true, end: "2026-11-30" });
    expect(plan.days).toHaveLength(7);
    expect(plan.days.find((d: { day: string }) => d.day === day)).toMatchObject({ capacity: 2, booked: 1, free: 1, full: false, window: "fall" });
    expect(plan.swaps[0]).toMatchObject({ day, ownerName: "Maya Chen", status: "booked" });
  });
  it("refuses a full day, a duplicate, a past day and a day outside the window for customers", async () => {
    const s = await shop();
    await call(env, s.owner, "PUT", `${s.base}/auto/settings`, { bays: 1, hoursPerDay: 1, minutesPerSwap: 60 }); // 1 a day
    const a = await member(s, { name: "Aisha" });
    const b = await member(s, { name: "Tom" });
    const car = await addCar(a.token);
    const day = ymd(2);
    const ok = await call(env, a.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, vehicleId: car.id, day });
    expect(ok.status).toBe(201);
    const full = await call(env, b.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("day_full");
    expect((await call(env, a.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day: ymd(3) })).status).toBe(201);
    expect((await call(env, a.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day: ymd(3) })).status).toBe(409);
    expect((await call(env, a.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day: ymd(-1) })).status).toBe(400);
    expect((await call(env, a.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day: "2026-12-10" })).status).toBe(400); // after Nov 30, before spring
    // Staff may book outside the window (a regular who phones in).
    expect((await call(env, s.owner, "POST", `${s.base}/auto/tires/swaps`, { memberId: b.memberId, day: "2026-12-10" })).status).toBe(201);
    // A cancel frees the place.
    const mine = (await call(env, a.token, "GET", "/v1/me/vehicles")).body.tireShops[0];
    expect(mine.swaps).toHaveLength(2);
    expect((await call(env, a.token, "DELETE", `/v1/me/tire-swaps/${ok.body.id}`)).status).toBe(204);
    expect((await call(env, b.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day })).status).toBe(201);
  });
  it("two customers racing for the last place: exactly one gets it", async () => {
    const s = await shop();
    await call(env, s.owner, "PUT", `${s.base}/auto/settings`, { bays: 1, hoursPerDay: 1, minutesPerSwap: 60 });
    const people = await Promise.all([member(s), member(s), member(s), member(s)]);
    const day = ymd(4);
    const res = await Promise.all(people.map((p) => call(env, p.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day })));
    expect(res.filter((r) => r.status === 201)).toHaveLength(1);
    expect(res.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await env.db.select().from(tireSwaps).where(eq(tireSwaps.merchantId, s.merchant.id))).toHaveLength(1);
  });
  it("a non-member cannot book, and a shop without the feature is not found", async () => {
    const s = await shop();
    const stranger = await customer(env);
    expect((await call(env, stranger.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day: ymd(2) })).status).toBe(404);
    const cafe = await shop({ vertical: "cafe" });
    const c = await member(cafe);
    expect((await call(env, c.token, "POST", "/v1/me/tire-swaps", { merchantId: cafe.merchant.id, day: ymd(2) })).status).toBe(404);
  });
  it("stores a set with rack, season and tread, flags thin tread, and a set is picked up once", async () => {
    const s = await shop();
    const c = await member(s);
    const car = await addCar(c.token);
    const made = await call(env, s.owner, "POST", `${s.base}/auto/tires/sets`, { memberId: c.memberId, vehicleId: car.id, rack: "b-14", season: "summer", label: "Michelin 205/55R16", treadMm: 6.5 });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ rack: "B-14", treadMm: 6.5, treadStatus: "ok", vehicleLabel: "2019 Honda Civic", status: "stored", pickupWindow: { name: "spring", start: "2027-03-25" }, pickupTextOn: "2027-03-11" });
    const thin = await call(env, s.owner, "POST", `${s.base}/auto/tires/sets`, { memberId: c.memberId, rack: "A-03", season: "winter", treadMm: 3.0 });
    expect(thin.body).toMatchObject({ treadStatus: "replace_soon", pickupWindow: { name: "fall", start: "2026-10-15" } });
    const list = (await call(env, s.owner, "GET", `${s.base}/auto/tires/sets`)).body;
    expect(list.counts).toEqual({ stored: 2, racks: 2, replaceSoon: 1 });
    const upd = await call(env, s.owner, "PATCH", `${s.base}/auto/tires/sets/${thin.body.id}`, { treadMm: 1.4 });
    expect(upd.body.treadStatus).toBe("wear_bar");
    expect((await call(env, s.owner, "POST", `${s.base}/auto/tires/sets/${thin.body.id}/pickup`)).body).toMatchObject({ status: "picked_up", pickedUpOn: "2026-11-04" });
    expect((await call(env, s.owner, "POST", `${s.base}/auto/tires/sets/${thin.body.id}/pickup`)).status).toBe(409);
    expect((await call(env, s.owner, "PATCH", `${s.base}/auto/tires/sets/${thin.body.id}`, { rack: "Z" })).status).toBe(409);
    expect((await call(env, s.owner, "GET", `${s.base}/auto/tires/sets`)).body.counts.stored).toBe(1);
    // A set cannot be put on another customer's car.
    const other = await customer(env);
    const otherCar = await addCar(other.token);
    expect((await call(env, s.owner, "POST", `${s.base}/auto/tires/sets`, { memberId: c.memberId, vehicleId: otherCar.id, rack: "Q", season: "winter" })).status).toBe(400);
    // The owner sees the set and its rack.
    expect((await call(env, c.token, "GET", "/v1/me/vehicles")).body.tireShops[0].sets[0]).toMatchObject({ rack: "B-14" });
  });
  it("texts the owners of stored sets once per window, from the lead day, with consent, never at night", async () => {
    const s = await shop();
    const yes = await member(s, { name: "Yes" });
    const no = await member(s, { name: "No", consent: false });
    for (const [c, rack] of [[yes, "A-01"], [no, "A-02"]] as const) await call(env, s.owner, "POST", `${s.base}/auto/tires/sets`, { memberId: c.memberId, rack, season: "winter" });
    await call(env, s.owner, "POST", `${s.base}/auto/tires/sets`, { memberId: yes.memberId, rack: "A-09", season: "summer" });
    // Today (Nov 4) the fall window is open and past its lead day: the winter sets are wanted, the summer one is not.
    expect(await runTirePickupReminders(env.ctx)).toBe(1);
    expect(sms()).toHaveLength(1);
    expect(sms()[0]!.body).toContain("A-01");
    expect(sms()[0]!.body).toContain("winter");
    expect(sms()[0]!.body).toContain("STOP");
    expect(await runTirePickupReminders(env.ctx)).toBe(0);
    // Spring: the summer set is texted two weeks before Mar 25, once.
    await jump(new Date("2027-03-12T15:00:00Z"));
    expect(await runTirePickupReminders(env.ctx)).toBe(1);
    expect(sms().at(-1)!.body).toContain("A-09");
    expect(await runTirePickupReminders(env.ctx)).toBe(0);
    const [row] = await env.db.select().from(tireSets).where(and(eq(tireSets.merchantId, s.merchant.id), eq(tireSets.rack, "A-09")));
    expect(row!.pickupNudgedFor).toBe("2027-03-25");
  });
});

describe("wash check-in on the membership engine", () => {
  async function planFor(s: Shop, userId: string, status = "active", startDate = "2026-09-01") {
    const [m] = await env.db.insert(classMemberships).values({ merchantId: s.merchant.id, userId, name: "Shine", status, priceCents: 2999, startDate, agreementText: "Test agreement" }).returning();
    return m!;
  }
  async function punchFor(s: Shop, userId: string, left = 2) {
    const [p] = await env.db.insert(classPasses).values({ merchantId: s.merchant.id, userId, name: "10 washes", creditsTotal: 10, creditsLeft: left, expiresAt: new Date(env.clock.now.getTime() + 300 * DAY), status: "active" }).returning();
    return p!;
  }
  it("lets an active member in once a day, by member, plate, phone or code, and counts it", async () => {
    const s = await shop({ vertical: "car_wash" });
    const c = await member(s, { name: "Maya Chen" });
    await addCar(c.token, { plate: "ABC 123" });
    const plan = await planFor(s, c.user.id);
    const look = (await call(env, s.owner, "GET", `${s.base}/auto/wash/lookup?q=abc123`)).body;
    expect(look.items[0]).toMatchObject({ name: "Maya Chen", vehicleLabel: "2019 Honda Civic", plan: { name: "Shine", state: "active" }, washedToday: false });
    const r = await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { plate: "abc-123", source: "plate" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, kind: "member", member: { washesThisMonth: 1, washedToday: true } });
    const again = await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId });
    expect(again.body).toMatchObject({ ok: false, reason: "already_washed", message: "Already washed today." });
    const [v] = await env.db.select().from(washVisits).where(eq(washVisits.merchantId, s.merchant.id));
    expect(v).toMatchObject({ kind: "member", membershipId: plan.id, source: "plate" });
    // The next day is fine; the daily cap is the shop's to change.
    await jump(new Date("2026-11-05T15:00:00Z"));
    expect((await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { phone: (await env.db.select().from(users).where(eq(users.id, c.user.id)))[0]!.phone! })).body.ok).toBe(true);
    await call(env, s.owner, "PUT", `${s.base}/auto/settings`, { washMaxPerDay: 2 });
    expect((await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId })).body.ok).toBe(true);
    expect((await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId })).body.reason).toBe("already_washed");
  });
  it("refuses a plan that is frozen, past due or ended, with the reason in words", async () => {
    const s = await shop({ vertical: "car_wash" });
    for (const [status, reason, text] of [["frozen", "frozen", "paused"], ["past_due", "past_due", "payment failed"], ["cancelled", "cancelled", "cancelled"], ["expired", "expired", "ended"]] as const) {
      const c = await member(s);
      await planFor(s, c.user.id, status);
      const r = await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId });
      expect(r.body).toMatchObject({ ok: false, reason });
      expect(r.body.message).toContain(text);
    }
    expect(await env.db.select().from(washVisits)).toHaveLength(0);
  });
  it("a punch card takes a credit when there is no plan and is used up at zero", async () => {
    const s = await shop({ vertical: "car_wash" });
    const c = await member(s);
    expect((await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId })).body).toMatchObject({ ok: false, reason: "no_plan" });
    const pass = await punchFor(s, c.user.id, 2);
    const r1 = await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId });
    expect(r1.body).toMatchObject({ ok: true, kind: "punch", member: { punch: { left: 1 } } });
    await jump(new Date("2026-11-05T15:00:00Z"));
    const r2 = await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId });
    expect(r2.body).toMatchObject({ ok: true, kind: "punch" });
    const [row] = await env.db.select().from(classPasses).where(eq(classPasses.id, pass.id));
    expect(row).toMatchObject({ creditsLeft: 0, status: "used_up" });
    await jump(new Date("2026-11-06T15:00:00Z"));
    expect((await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId })).body.reason).toBe("no_plan");
  });
  it("two taps at once take one wash", async () => {
    const s = await shop({ vertical: "car_wash" });
    const c = await member(s);
    await planFor(s, c.user.id);
    const res = await Promise.all([1, 2, 3].map(() => call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { memberId: c.memberId })));
    expect(res.filter((r) => r.body.ok)).toHaveLength(1);
    expect(await env.db.select().from(washVisits)).toHaveLength(1);
  });
  it("two members with the same plate are not guessed between; an unknown plate is not found", async () => {
    const s = await shop({ vertical: "car_wash" });
    const a = await member(s);
    const b = await member(s);
    await addCar(a.token, { plate: "SAME 111" });
    await addCar(b.token, { plate: "SAME 111" });
    expect((await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { plate: "SAME111" })).status).toBe(409);
    expect((await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, { plate: "NOPE000" })).status).toBe(404);
    expect((await call(env, s.owner, "POST", `${s.base}/auto/wash/check-in`, {})).status).toBe(400);
  });
  it("the summary lists plan members who came fewer than three times in 30 days (not new ones)", async () => {
    const s = await shop({ vertical: "car_wash" });
    const keen = await member(s, { name: "Keen" });
    const lapsed = await member(s, { name: "Lapsed" });
    const fresh = await member(s, { name: "Fresh" });
    await planFor(s, keen.user.id);
    await planFor(s, lapsed.user.id);
    await planFor(s, fresh.user.id, "active", ymd(-3));
    for (let i = 0; i < 4; i++) {
      await env.db.insert(washVisits).values({ merchantId: s.merchant.id, userId: keen.user.id, kind: "member", day: ymd(-i * 3 - 1) });
    }
    await env.db.insert(washVisits).values({ merchantId: s.merchant.id, userId: lapsed.user.id, kind: "member", day: ymd(-5) });
    const sum = (await call(env, s.owner, "GET", `${s.base}/auto/wash/summary`)).body;
    expect(sum).toMatchObject({ members: 3, washes30d: 5, avgPerMember30d: 1.7 });
    expect(sum.atRisk.map((r: { name: string; washes30d: number }) => [r.name, r.washes30d])).toEqual([["Lapsed", 1]]);
  });
});

describe("the vehicle estimate rules", () => {
  const ticketBody = (phone: string, extra: Record<string, unknown> = {}) => ({ customer: { phone, name: "Maya Chen" }, itemKind: "vehicle", itemDetails: { make: "Honda", model: "Civic", year: "2019" }, issue: "Oil change and brakes", ...extra });
  async function garage() {
    const s = await shop({ plan: "pro" });
    return s;
  }
  const lines = (condition?: string) => [
    { description: "Oil and filter", quantity: 1, unitPriceCents: 7400, kind: "part", ...(condition ? { condition } : {}) },
    { description: "Labour", quantity: 1, unitPriceCents: 6500, kind: "labour" },
  ];

  it("an estimate cannot be sent without the odometer, the completion date and each part's condition", async () => {
    const s = await garage();
    const t = (await call(env, s.owner, "POST", `${s.base}/tickets`, ticketBody("(416) 555-0188"))).body;
    const q = (await call(env, s.owner, "POST", `${s.base}/tickets/${t.ticket.id}/quotes`, { lineItems: lines() })).body;
    const bad = await call(env, s.owner, "POST", `${s.base}/quotes/${q.id}/send`);
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe("estimate_incomplete");
    expect(bad.body.error.details.missing).toEqual(["the odometer reading", "when the work will be done", "new, used or reconditioned on the part"]);
    await call(env, s.owner, "PATCH", `${s.base}/tickets/${t.ticket.id}`, { itemDetails: { make: "Honda", model: "Civic", year: "2019", mileage: "84210" }, promisedAt: new Date(env.clock.now.getTime() + 2 * DAY).toISOString() });
    const q2 = (await call(env, s.owner, "POST", `${s.base}/tickets/${t.ticket.id}/quotes`, { lineItems: lines("new") })).body;
    expect(q2.lineItems[0].condition).toBe("new");
    const ok = await call(env, s.owner, "POST", `${s.base}/quotes/${q2.id}/send`);
    expect(ok.status).toBe(200);
    // A garment or a phone is not held to the vehicle fields.
    const g = (await call(env, s.owner, "POST", `${s.base}/tickets`, { customer: { phone: "(416) 555-0189" }, itemKind: "garment", itemDetails: {}, issue: "Hem" })).body;
    const gq = (await call(env, s.owner, "POST", `${s.base}/tickets/${g.ticket.id}/quotes`, { lineItems: [{ description: "Hem", quantity: 1, unitPriceCents: 2000, kind: "labour" }] })).body;
    expect((await call(env, s.owner, "POST", `${s.base}/quotes/${gq.id}/send`)).status).toBe(200);
  });

  it("no work and no invoice on a vehicle until the estimate is approved; then the invoice shows the estimate and the 10% rule holds", async () => {
    const s = await garage();
    const t = (await call(env, s.owner, "POST", `${s.base}/tickets`, ticketBody("(416) 555-0190", { itemDetails: { make: "Honda", model: "Civic", year: "2019", mileage: "84210" }, promisedAt: new Date(env.clock.now.getTime() + 2 * DAY).toISOString() }))).body;
    const id = t.ticket.id as string;
    expect((await call(env, s.owner, "POST", `${s.base}/tickets/${id}/status`, { status: "in_progress" })).body.error.code).toBe("estimate_required");
    expect((await call(env, s.owner, "POST", `${s.base}/tickets/${id}/invoices`, { fromQuote: false, extraLineItems: [{ description: "Work", quantity: 1, unitPriceCents: 1000 }], send: false })).body.error.code).toBe("estimate_required");
    const q = (await call(env, s.owner, "POST", `${s.base}/tickets/${id}/quotes`, { lineItems: lines("new"), send: true })).body;
    // Sent but not approved yet: still no work.
    expect((await call(env, s.owner, "POST", `${s.base}/tickets/${id}/status`, { status: "in_progress" })).status).toBe(409);
    const [row] = await env.db.select().from(quotes).where(eq(quotes.id, q.id));
    expect((await call(env, null, "POST", `/v1/public/quotes/${row!.approvalToken}/approve`, { signatureName: "Maya Chen" })).status).toBe(200);
    expect((await call(env, s.owner, "POST", `${s.base}/tickets/${id}/status`, { status: "in_progress" })).status).toBe(200);
    // Odometer out and the replaced parts, then the invoice.
    const dets = { make: "Honda", model: "Civic", year: "2019", mileage: "84210", mileageOut: "84216", partsReturn: "offered" };
    expect((await call(env, s.owner, "PATCH", `${s.base}/tickets/${id}`, { itemDetails: dets })).status).toBe(200);
    // $139.00 + 13% = $157.07 estimate. A $20 extra part is 14.9% over: refused. A $10 extra is within the cap.
    const over = await call(env, s.owner, "POST", `${s.base}/tickets/${id}/invoices`, { extraLineItems: [{ description: "Wiper blades", quantity: 1, unitPriceCents: 2000, kind: "part", condition: "new" }], send: false });
    expect(over.body.error.code).toBe("over_estimate");
    const inv = await call(env, s.owner, "POST", `${s.base}/tickets/${id}/invoices`, { extraLineItems: [{ description: "Wiper blades", quantity: 1, unitPriceCents: 1000, kind: "part", condition: "new" }], send: true });
    expect(inv.status).toBe(201);
    const token = inv.body.payUrl.split("/").pop();
    const pub = (await call(env, null, "GET", `/v1/public/invoices/${token}`)).body;
    expect(pub.estimate).toMatchObject({ totalCents: 15707, method: "link", approvedBy: "Maya Chen", maxAuthorizedCents: 17277 });
    expect(pub.estimate.percentOver).toBe(7.2); // $149.00 + HST against $139.00 + HST
    expect(pub.vehicle).toMatchObject({ label: "2019 Honda Civic", odometerIn: "84210", odometerOut: "84216", partsReturn: "offered", warrantyDays: 90, warrantyKm: 5000 });
    expect(pub.invoice.lineItems[0].condition).toBe("new");
    expect(pub.invoice.lineItems.find((l: { description: string }) => l.description === "Wiper blades").condition).toBe("new");
  });

  it("a revised estimate the customer approves resets the cap; a phone approval keeps who, the number and the time", async () => {
    const s = await garage();
    const t = (await call(env, s.owner, "POST", `${s.base}/tickets`, ticketBody("(416) 555-0191", { itemDetails: { make: "Honda", model: "Civic", mileage: "50000" }, promisedAt: new Date(env.clock.now.getTime() + DAY).toISOString() }))).body;
    const id = t.ticket.id as string;
    const q = (await call(env, s.owner, "POST", `${s.base}/tickets/${id}/quotes`, { lineItems: lines("new"), send: true })).body;
    const ph = await call(env, s.owner, "POST", `${s.base}/quotes/${q.id}/authorize-by-phone`, { name: "Maya Chen", phone: "416-555-0191" });
    expect(ph.status).toBe(200);
    expect(ph.body.quote.authorizedBy).toMatchObject({ method: "phone", name: "Maya Chen", phone: "416-555-0191" });
    // Brake pads found: $598 of parts is far over the cap; a revised estimate is needed, and once approved the invoice can carry it.
    const extra = [...lines("new"), { description: "Front brake pads and rotors", quantity: 1, unitPriceCents: 38000, kind: "part", condition: "new" }];
    expect((await call(env, s.owner, "POST", `${s.base}/tickets/${id}/invoices`, { extraLineItems: [extra[2]!], send: false })).body.error.code).toBe("over_estimate");
    env.clock.now = new Date(env.clock.now.getTime() + 1000); // the revised approval is the newer one
    const q2 = (await call(env, s.owner, "POST", `${s.base}/tickets/${id}/quotes`, { lineItems: extra, send: true })).body;
    expect((await call(env, s.owner, "POST", `${s.base}/quotes/${q2.id}/authorize-by-phone`, { name: "Maya Chen", phone: "416-555-0191" })).status).toBe(200);
    const inv = await call(env, s.owner, "POST", `${s.base}/tickets/${id}/invoices`, { send: true });
    expect(inv.status).toBe(201);
    expect(inv.body.totalCents).toBe(Math.round(((7400 + 6500 + 38000) * 113) / 100));
  });

  it("a vehicle on a ticket must be the customer's, and its odometer becomes a reading", async () => {
    const s = await garage();
    const cust = await member(s);
    const phone = (await env.db.select().from(users).where(eq(users.id, cust.user.id)))[0]!.phone!;
    const car = await addCar(cust.token);
    const other = await customer(env);
    const otherCar = await addCar(other.token, { plate: null });
    const bad = await call(env, s.owner, "POST", `${s.base}/tickets`, ticketBody(phone, { itemDetails: { make: "Honda", model: "Civic", mileage: "84210", vehicleId: otherCar.id } }));
    expect(bad.status).toBe(400);
    const ok = await call(env, s.owner, "POST", `${s.base}/tickets`, ticketBody(phone, { itemDetails: { make: "Honda", model: "Civic", mileage: "84,210 km", vehicleId: car.id } }));
    expect(ok.status).toBe(201);
    const readings = await env.db.select().from(vehicleReadings).where(eq(vehicleReadings.vehicleId, car.id));
    expect(readings.map((r) => [r.km, r.source])).toEqual([[84210, "ticket"]]);
    const det = (await call(env, s.owner, "GET", `${s.base}/auto/vehicles/${car.id}`)).body;
    expect(det.visits[0]).toMatchObject({ number: 1, mileageIn: "84,210 km", estimateCents: null, percentOver: null });
  });
});

describe("privacy", () => {
  it("deleting the account removes the cars, plates, readings, tire sets, swaps and wash visits, and the export lists them", async () => {
    const s = await shop();
    const c = await member(s);
    const car = await addCar(c.token, { plate: "KEEP 000" });
    await logOil(s, car.id, ymd(-5), 60000);
    await call(env, s.owner, "POST", `${s.base}/auto/tires/sets`, { memberId: c.memberId, vehicleId: car.id, rack: "C-22", season: "summer" });
    await call(env, c.token, "POST", "/v1/me/tire-swaps", { merchantId: s.merchant.id, day: ymd(2) });
    const exp = (await call(env, c.token, "GET", "/v1/me/export")).body;
    expect(exp.vehicles[0]).toMatchObject({ make: "Honda", plate: "KEEP 000" });
    expect(exp.vehicles[0].services).toHaveLength(1);
    expect(exp.tireSets).toHaveLength(1);
    await deleteAccount(env.ctx, c.user.id);
    expect(await env.db.select().from(vehicles).where(eq(vehicles.userId, c.user.id))).toHaveLength(0);
    expect(await env.db.select().from(tireSets).where(eq(tireSets.userId, c.user.id))).toHaveLength(0);
    expect(await env.db.select().from(tireSwaps).where(eq(tireSwaps.userId, c.user.id))).toHaveLength(0);
    expect(await env.db.select().from(vehicleReadings)).toHaveLength(0);
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, c.memberId));
    expect(m).toBeTruthy();
  });
});
