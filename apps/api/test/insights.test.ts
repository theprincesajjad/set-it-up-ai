import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, createUser, type TestEnv } from "./helpers.js";
import { call, paidMerchant, setPlan } from "./commerce-fixtures.js";
import { appointments, merchantMembers, merchantSignals, merchants, pushTokens, staffHours, visits } from "@ll/db";
import { runWeeklyReports } from "../src/jobs/weekly-report.js";
import { zonedToUtc } from "../src/services/bookings.js";
import { bestDayToPromote, trialReceipt, weekReport } from "../src/services/insights.js";
import { noteFullDays, recordSignal, weekBounds, weekStartOf } from "../src/services/signals.js";

const TZ = "America/Toronto";
let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") }); // Tue 10:00 in Toronto (EST), the week of Mon Nov 2
});
afterEach(async () => env.close());

const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedToUtc(date, h * 60 + m, TZ);
};

async function shop(plan: "free" | "plus" = "plus") {
  const m = await paidMerchant(env, { plan, connect: false });
  await env.db.update(merchants).set({ vertical: "nails", name: "Priya Nails" }).where(eq(merchants.id, m.merchant.id));
  await env.db.insert(pushTokens).values({ userId: m.owner.id, token: `ExponentPushToken[${m.owner.id.slice(0, 8)}]`, platform: "ios" });
  const merchant = (await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id)))[0]!;
  return { ...m, merchant, base: `/v1/merchants/${m.merchant.id}` };
}
type Shop = Awaited<ReturnType<typeof shop>>;

/** One appointment of `cents` starting at a Toronto wall-clock time. */
async function appt(s: Shop, date: string, hhmm: string, cents: number, status = "completed") {
  const startsAt = at(date, hhmm);
  await env.db.insert(appointments).values({
    merchantId: s.merchant.id,
    locationId: s.location.id,
    customerName: "Walk-in",
    items: [{ serviceId: null, name: "Fill", durationMin: 60, priceCents: cents }],
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3_600_000),
    status,
  });
}

describe("week boundaries in the shop's timezone", () => {
  it("runs Monday to Monday and is 169 hours when the clocks go back (Nov 1, 2026)", () => {
    expect(weekStartOf(new Date("2026-11-03T15:00:00Z"), TZ)).toBe("2026-11-02");
    // Sunday 23:30 Toronto (DST already ended) is still the week of Oct 26; Monday 00:30 starts the next.
    expect(weekStartOf(at("2026-11-01", "23:30"), TZ)).toBe("2026-10-26");
    expect(weekStartOf(at("2026-11-02", "00:30"), TZ)).toBe("2026-11-02");
    const fall = weekBounds("2026-10-26", TZ);
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(169);
    expect(fall.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    const spring = weekBounds("2026-03-02", TZ); // DST began Mar 8, 2026
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(167);
  });

  it("puts an appointment on each side of the DST Sunday in the right week", async () => {
    const s = await shop();
    await appt(s, "2026-11-01", "23:30", 5000);
    await appt(s, "2026-11-02", "00:30", 7000);
    env.clock.now = new Date("2026-11-03T15:00:00Z");
    const r = await weekReport(env.ctx, s.merchant);
    expect(r.weekStart).toBe("2026-11-02");
    expect(r.revenueCents).toBe(7000);
    expect(r.previous.revenueCents).toBe(5000);
    expect(r.deltaCents).toBe(2000);
  });
});

describe("the week report", () => {
  it("sums booked and completed items, leaves out cancelled and no-shows, and compares with last week and the 4-week average", async () => {
    const s = await shop();
    await appt(s, "2026-11-03", "10:00", 5500);
    await appt(s, "2026-11-04", "11:00", 6500, "booked");
    await appt(s, "2026-11-04", "13:00", 9900, "cancelled");
    await appt(s, "2026-11-05", "13:00", 9900, "no_show");
    await appt(s, "2026-10-27", "10:00", 8000);
    await appt(s, "2026-10-20", "10:00", 4000);
    const r = await weekReport(env.ctx, s.merchant);
    expect(r).toMatchObject({ revenueCents: 12000, visits: 2, previous: { revenueCents: 8000, visits: 1 }, deltaCents: 4000, deltaPct: 50, source: "appointments", inProgress: true, paid: true });
    expect(r.fourWeekAvgCents).toBe(3000); // (8000 + 4000 + 0 + 0) / 4
    expect(r.bestWeekOfEight).toBe(true);
    expect(r.trend).toHaveLength(8);
    expect(r.trend.at(-1)).toEqual({ weekStart: "2026-11-02", revenueCents: 12000 });
  });

  it("measures the change against a week with nothing in it", async () => {
    const s = await shop();
    await appt(s, "2026-11-03", "10:00", 5500);
    const r = await weekReport(env.ctx, s.merchant);
    expect(r).toMatchObject({ revenueCents: 5500, deltaCents: 5500, deltaPct: null, bestWeekOfEight: false });
    const empty = await weekReport(env.ctx, s.merchant, { start: "2026-09-14" });
    expect(empty).toMatchObject({ revenueCents: 0, deltaCents: 0, deltaPct: null, inProgress: false });
  });

  it("counts loyalty visits for a shop with no appointments, and new clients", async () => {
    const s = await shop();
    const u = await createUser(env.db);
    const [member] = await env.db.insert(merchantMembers).values({ merchantId: s.merchant.id, userId: u.id, createdAt: new Date("2026-11-03T14:00:00Z") }).returning();
    await env.db.insert(visits).values({ merchantId: s.merchant.id, memberId: member!.id, userId: u.id, source: "staff_app", amountCents: 1800, createdAt: new Date("2026-11-03T14:00:00Z") });
    const r = await weekReport(env.ctx, s.merchant);
    expect(r).toMatchObject({ source: "visits", revenueCents: 1800, visits: 1, newClients: 1 });
  });

  it("tracks the goal", async () => {
    const s = await shop();
    await appt(s, "2026-11-03", "10:00", 6000);
    expect((await call(env, s.ownerToken, "PUT", `${s.base}/insights/settings`, { weeklyGoalCents: 10000 })).status).toBe(200);
    let r = (await call(env, s.ownerToken, "GET", `${s.base}/insights/week`)).body;
    expect(r.goal).toEqual({ cents: 10000, progress: 0.6, reached: false });
    await appt(s, "2026-11-04", "10:00", 4000);
    r = (await call(env, s.ownerToken, "GET", `${s.base}/insights/week`)).body;
    expect(r.goal.reached).toBe(true);
    expect((await call(env, s.ownerToken, "PUT", `${s.base}/insights/settings`, { weeklyGoalCents: 0 })).body.weeklyGoalCents).toBeNull();
  });
});

describe("bestDayToPromote", () => {
  it("is the quietest open weekday and skips days the shop is closed", async () => {
    const s = await shop();
    // Open Tuesday to Saturday; Sunday and Monday have no hours (and so no bookings, the quietest of all).
    for (const weekday of [2, 3, 4, 5, 6]) await env.db.insert(staffHours).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: s.owner.id, weekday, startsLocal: "09:00", endsLocal: "17:00" });
    // Four weeks of bookings: Tuesday x3, Wednesday x1, Thursday x3, Friday x3, Saturday x3 (Wednesday is the quiet open day).
    for (const tue of ["2026-10-06", "2026-10-13", "2026-10-20"]) {
      for (const d of [0, 2, 3, 4]) {
        const [y, m, day] = tue.split("-").map(Number) as [number, number, number];
        await appt(s, new Date(Date.UTC(y, m - 1, day + d)).toISOString().slice(0, 10), "10:00", 5000);
      }
    }
    await appt(s, "2026-10-14", "10:00", 5000); // one Wednesday
    const best = await bestDayToPromote(env.ctx, s.merchant);
    expect(best?.weekday).toBe(3);
    const r = await weekReport(env.ctx, s.merchant);
    expect(r.bestDayToPromote?.weekday).toBe(3);
    expect([0, 1]).not.toContain(r.bestDayToPromote?.weekday);
  });

  it("is null with too little history", async () => {
    const s = await shop();
    await appt(s, "2026-10-14", "10:00", 5000);
    expect(await bestDayToPromote(env.ctx, s.merchant)).toBeNull();
  });
});

describe("signals", () => {
  it("upserts into the week bucket and a seeded cancel-and-fill shows in the week", async () => {
    const s = await shop();
    await recordSignal(env.ctx, s.merchant.id, "cancellations");
    await recordSignal(env.ctx, s.merchant.id, "waitlist_fills", { amountCents: 5500 });
    await recordSignal(env.ctx, s.merchant.id, "waitlist_fills", { count: 2, amountCents: 9000 });
    await recordSignal(env.ctx, s.merchant.id, "reviews_requested", { count: 7 });
    const rows = await env.db.select().from(merchantSignals).where(eq(merchantSignals.merchantId, s.merchant.id));
    expect(rows.filter((r) => r.key === "waitlist_fills")).toHaveLength(1);
    const week = (await call(env, s.ownerToken, "GET", `${s.base}/insights/week`)).body;
    expect(week.signals.cancellations).toEqual({ count: 1, amountCents: 0 });
    expect(week.signals.waitlist_fills).toEqual({ count: 3, amountCents: 14500 });
    expect(week.signals.reviews_requested.count).toBe(7);
    expect(week.signals.addons_sold).toEqual({ count: 0, amountCents: 0 });
    // Last week's bucket is separate.
    env.clock.now = new Date("2026-11-10T15:00:00Z");
    expect((await weekReport(env.ctx, s.merchant)).signals.waitlist_fills.count).toBe(0);
  });

  it("never throws for an unknown shop", async () => {
    await expect(recordSignal(env.ctx, "00000000-0000-4000-8000-000000000000", "cancellations")).resolves.toBeUndefined();
  });

  it("counts a look at a full open day, and only on days the shop works", async () => {
    const s = await shop();
    await env.db.insert(staffHours).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: s.owner.id, weekday: 6, startsLocal: "09:00", endsLocal: "17:00" });
    // Saturday Nov 7 is full; Sunday Nov 8 has no openings because the shop is closed; Nov 9 is open with times.
    await noteFullDays(env.ctx, s.merchant, { days: [{ date: "2026-11-07", times: [] }, { date: "2026-11-08", times: [] }, { date: "2026-11-02", times: [] }] });
    await noteFullDays(env.ctx, s.merchant, { days: [{ date: "2026-11-07", times: [] }] });
    const week = await weekReport(env.ctx, s.merchant);
    expect(week.signals.full_day_views.count).toBe(2);
    expect(week.fullDay).toEqual({ date: "2026-11-07", weekday: 6, views: 2 });
  });
});

describe("who can read it", () => {
  it("lets a Free shop read the week but not the 12 weeks; Pro reads both", async () => {
    const free = await shop("free");
    expect((await call(env, free.ownerToken, "GET", `${free.base}/insights/week`)).body).toMatchObject({ paid: false });
    expect((await call(env, free.ownerToken, "GET", `${free.base}/insights/weeks`)).status).toBe(402);
    const pro = await shop("plus");
    const weeks = await call(env, pro.ownerToken, "GET", `${pro.base}/insights/weeks?weeks=12`);
    expect(weeks.status).toBe(200);
    expect(weeks.body.weeks).toHaveLength(12);
    expect(weeks.body.weeks.at(-1).weekStart).toBe("2026-11-02");
    expect((await call(env, null, "GET", `${pro.base}/insights/week`)).status).toBe(401);
  });

  it("is for managers: a staff login is refused", async () => {
    const s = await shop();
    const { staffMember } = await import("./commerce-fixtures.js");
    const staff = await staffMember(env, s.merchant.id, "staff");
    expect((await call(env, staff.token, "GET", `${s.base}/insights/week`)).status).toBe(403);
  });
});

describe("the trial receipt", () => {
  it("sums the 14 days before now", async () => {
    const s = await shop();
    await appt(s, "2026-10-21", "10:00", 4000); // 13 days ago
    await appt(s, "2026-10-10", "10:00", 9999); // before the window
    await appt(s, "2026-11-02", "10:00", 6000);
    await recordSignal(env.ctx, s.merchant.id, "waitlist_fills", { count: 3, amountCents: 16500 });
    await recordSignal(env.ctx, s.merchant.id, "rebook_booked", { count: 4, amountCents: 22000 });
    await recordSignal(env.ctx, s.merchant.id, "reviews_requested", { count: 9 });
    await recordSignal(env.ctx, s.merchant.id, "addons_sold", { count: 2, amountCents: 2000 });
    await recordSignal(env.ctx, s.merchant.id, "waitlist_fills", { count: 1, amountCents: 5500, at: new Date("2026-10-22T15:00:00Z") });
    const expected = { days: 14, bookings: 2, amountCents: 10000, fills: 4, rebooked: 4, reviews: 9, addons: 2, chasedCents: 16500 + 5500 + 22000 + 2000 };
    expect(await trialReceipt(env.ctx, s.merchant)).toEqual(expected);
    expect((await call(env, s.ownerToken, "GET", `${s.base}/insights/week?trial=1`)).body).toEqual(expected);
  });
});

describe("the Sunday report", () => {
  const sunday = new Date("2026-11-08T23:30:00Z"); // 18:30 Sunday in Toronto

  it("sends a push and an email on Pro with the week's numbers, once", async () => {
    const s = await shop("plus");
    await appt(s, "2026-11-03", "10:00", 148000 - 24000);
    await appt(s, "2026-10-28", "10:00", 100000);
    await recordSignal(env.ctx, s.merchant.id, "waitlist_fills", { count: 3, amountCents: 16500 });
    env.clock.now = sunday;
    const push0 = env.ctx.providers.outbox.push.length;
    expect((await runWeeklyReports(env.ctx)).sent).toBe(1);
    const push = env.ctx.providers.outbox.push.slice(push0);
    expect(push).toHaveLength(1);
    expect(push[0]!.title).toBe("Your week at Priya Nails");
    expect(push[0]!.body).toBe("$1,240 booked, $240 ahead of last week");
    const mail = env.ctx.providers.outbox.email.find((e) => e.subject.includes("Priya Nails"))!;
    expect(mail.subject).toBe("Your week at Priya Nails: $1,240 booked, $240 ahead of last week.");
    expect(mail.text).toContain("Waitlist filled 3 slots ($165)");
    expect(mail.text).toContain("/reports/week");
    // A second pass in the same window sends nothing.
    expect((await runWeeklyReports(env.ctx)).sent).toBe(0);
  });

  it("sends nothing to a Free shop, in the wrong hour, or for a quiet week", async () => {
    const free = await shop("free");
    await appt(free, "2026-11-03", "10:00", 5000);
    const quiet = await shop("plus");
    const pro = await shop("plus");
    await appt(pro, "2026-11-03", "10:00", 5000);
    env.clock.now = new Date("2026-11-08T15:00:00Z"); // 10:00 Sunday: before 18:00
    expect((await runWeeklyReports(env.ctx)).sent).toBe(0);
    env.clock.now = sunday;
    const before = env.ctx.providers.outbox.push.length;
    expect((await runWeeklyReports(env.ctx)).sent).toBe(1); // only `pro`
    const tokens = env.ctx.providers.outbox.push.slice(before).map((p) => p.token);
    expect(tokens).toEqual([`ExponentPushToken[${pro.owner.id.slice(0, 8)}]`]);
    void quiet;
    // The shop moves its report to Friday 09:00: Sunday is no longer its day.
    await setPlan(env, free.merchant.id, "plus");
    await env.db.update(merchants).set({ weeklyReportWeekday: 5, weeklyReportHour: 9 }).where(eq(merchants.id, free.merchant.id));
    expect((await runWeeklyReports(env.ctx)).sent).toBe(0);
  });
});
