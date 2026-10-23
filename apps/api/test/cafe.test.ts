/**
 * Café & retail build (docs/research/cafes-retail.md section 7): home today report, heatmap, rewards owed,
 * joiner return, promo results, customer segments and rhythm fields, Stamp on scan setting, cameIn7d,
 * quiet hours, and the "Free drink ready" wallet automation. Every number is checked against data the
 * test inserted by hand.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditLogs,
  ledgerTransactions,
  loyaltyPrograms,
  merchantMembers,
  merchants,
  messageDeliveries,
  messages,
  promos,
  redemptions,
  users,
} from "@ll/db";
import { awardPurchase } from "../src/services/ledger.js";
import { runAutomations, sendScheduledCampaigns } from "../src/services/messaging.js";
import { createMerchant as createBaseMerchant, createTestEnv, createUser, grantFeatures, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const consent = { text: "Text me offers from Test Shop. Optional.", source: "counter" };

/** Toronto is UTC-4 (EDT) until Nov 1, 2026. Local "YYYY-MM-DD HH:MM" to a Date. */
const at = (local: string) => new Date(`${local.replace(" ", "T")}:00-04:00`);

async function cafe(opts: { goal?: number } = {}) {
  const m = await createBaseMerchant(env, { earnType: "stamps" });
  await env.db.update(merchants).set({ vertical: "cafe" }).where(eq(merchants.id, m.merchant.id));
  await env.db.update(loyaltyPrograms).set({ stampGoal: opts.goal ?? 50, pointsPerVisit: 1, counterAutoStamp: true }).where(eq(loyaltyPrograms.merchantId, m.merchant.id));
  return m;
}

/** One visit at a local time by a given phone (new phone = new member). */
async function visit(merchantId: string, local: string, o: { phone?: string; name?: string; staffUserId?: string; consent?: boolean; joinedVia?: "qr" | "phone" } = {}) {
  env.clock.now = at(local);
  return awardPurchase(env.ctx, {
    merchantId,
    phone: o.phone ?? nextPhone(),
    customerName: o.name ?? null,
    source: "staff_app",
    ignoreCooldown: true,
    staffUserId: o.staffUserId,
    joinedVia: o.joinedVia,
    consent: o.consent ? consent : null,
  });
}

describe("reports/today", () => {
  it("answers 7 am and close questions with hand-checked numbers", async () => {
    const { merchant, owner, ownerToken } = await cafe();
    await grantFeatures(env, merchant.id, ["promos.basic", "promos.double_points"]);
    await env.db.update(users).set({ name: "Sam Barista" }).where(eq(users.id, owner.id));
    const staff = owner.id;

    // Same Thursdays before today (Oct 22): 3, 3, 4, 5 visits, hours 8 (and one at 3 pm on Oct 15).
    const thursdays: [string, number][] = [["2026-10-15", 2], ["2026-10-08", 3], ["2026-10-01", 4], ["2026-09-24", 5]];
    for (const [d, n] of thursdays) for (let i = 0; i < n; i++) await visit(merchant.id, `${d} 08:${10 + i}`);
    await visit(merchant.id, "2026-10-15 15:10");
    // Wednesdays before yesterday (Oct 14, 7, Sep 30, 23): 1, 1, 2, 0 visits.
    await visit(merchant.id, "2026-10-14 09:00");
    await visit(merchant.id, "2026-10-07 09:00");
    await visit(merchant.id, "2026-09-30 09:00");
    await visit(merchant.id, "2026-09-30 10:00");
    // Yesterday (Wed Oct 21): two new members, one from the counter QR.
    await visit(merchant.id, "2026-10-21 08:30", { joinedVia: "qr" });
    await visit(merchant.id, "2026-10-21 09:30", { joinedVia: "phone" });

    // Regulars: R1 seen today, R2 not. Neither visited on a Wednesday or Thursday above.
    const r1 = nextPhone();
    const r2 = nextPhone();
    for (const d of ["2026-10-12 08:00", "2026-10-18 08:00", "2026-10-20 08:00"]) await visit(merchant.id, d, { phone: r1, name: "Rae Regular" });
    for (const d of ["2026-10-12 09:00", "2026-10-17 09:00", "2026-10-19 09:00"]) await visit(merchant.id, d, { phone: r2, name: "Rob Regular" });

    // Slipping: weekly Fridays at 10 am, last seen Oct 2 (20 days ago). S1 agreed to texts, S2 did not.
    const s1 = nextPhone();
    const s2 = nextPhone();
    for (const d of ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"]) {
      await visit(merchant.id, `${d} 10:00`, { phone: s1, name: "Sue Slipping", consent: true });
      await visit(merchant.id, `${d} 10:05`, { phone: s2, name: "Sol Slipping" });
    }

    // Today (Thu Oct 22): three at 8 am by staff, plus Rae at 3 pm inside the double-stamps window; one stamp undone.
    await visit(merchant.id, "2026-10-22 08:00", { staffUserId: staff });
    await visit(merchant.id, "2026-10-22 08:20", { staffUserId: staff });
    await visit(merchant.id, "2026-10-22 08:40", { staffUserId: staff });
    await env.db.insert(promos).values({
      merchantId: merchant.id,
      title: "Double stamps on slow afternoons",
      kind: "multiplier",
      multiplierPct: 200,
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "14:00",
      endTime: "16:00",
      startsAt: at("2026-10-01 00:00"),
      status: "live",
    });
    await visit(merchant.id, "2026-10-22 15:00", { phone: r1, staffUserId: staff });
    const wrong = await visit(merchant.id, "2026-10-22 09:00", { staffUserId: staff });

    // Rewards waiting: three members at or above the 50-stamp goal.
    await env.db.update(merchantMembers).set({ balance: 55 }).where(eq(merchantMembers.userId, (await env.db.select().from(users).where(eq(users.phone, r2)))[0]!.id));
    const [sueUser] = await env.db.select().from(users).where(eq(users.phone, s1));
    await env.db.update(merchantMembers).set({ balance: 61 }).where(eq(merchantMembers.userId, sueUser!.id));
    await env.db.update(merchantMembers).set({ balance: 50 }).where(eq(merchantMembers.id, wrong.member.id));

    // Counter signed in at 6:52 am.
    await env.db.insert(auditLogs).values({ actorUserId: owner.id, merchantId: merchant.id, action: "staff_pin.verified", entity: "merchant_staff", entityId: owner.id, createdAt: at("2026-10-22 06:52") });

    env.clock.now = at("2026-10-22 18:00");
    // Undo the wrong stamp through the counter endpoint (owner may undo any).
    const undo = await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/counter/transactions/${wrong.transaction!.id}/undo`, headers: auth(ownerToken), payload: {} });
    expect(undo.statusCode).toBe(200);

    const res = await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/today`, headers: auth(ownerToken) });
    expect(res.statusCode).toBe(200);
    const t = res.json();

    expect(t.timezone).toBe("America/Toronto");
    expect(t.yesterday).toEqual({ visits: 2, typicalVisits: 1, newMembers: 2, newViaQr: 1 });
    // Today: 3 + Rae at 3 pm = 4 visits (the undone one is gone). Typical Thursday: (3 + 3 + 4 + 5) / 4 = 3.75, rounded 4.
    expect(t.today.visits).toBe(4);
    expect(t.today.typicalVisitsFullDay).toBe(4);
    expect(t.today.newMembers).toBe(4); // three at 8 am and the member whose stamp was undone (the member stays)
    expect(t.today.newViaQr).toBe(0);
    const earned = await env.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.merchantId, merchant.id));
    const todayStamps = earned.filter((x) => x.createdAt >= at("2026-10-22 00:00") && x.points > 0 && x.type === "earn" && !x.reversedAt).reduce((a, x) => a + x.points, 0);
    expect(todayStamps).toBe(5); // 1 + 1 + 1 + (double stamps at 3 pm = 2)
    expect(t.today.stampsGiven).toBe(todayStamps);
    expect(t.today.redemptions).toBe(0);
    // Rae (4 visits in 30 days incl. today) and Rob are regulars; only Rae came in today.
    expect(t.today.regularsTotal).toBe(2);
    expect(t.today.regularsSeen).toBe(1);

    expect(t.hourly.hours).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(t.hourly.today[1]).toBe(3); // 8 am
    expect(t.hourly.today[8]).toBe(1); // 3 pm
    expect(t.hourly.typical[1]).toBe(3.5); // (2 + 3 + 4 + 5) / 4
    expect(t.hourly.typical[8]).toBe(0.3); // 1 visit in four Thursdays

    expect(t.rewardsWaiting.count).toBe(2); // Rob 55, Sue 61 (the undone stamp's member is not counted: 50 stays but below after reversal)
    expect(t.rewardsWaiting.members.map((m: { name: string }) => m.name).sort()).toEqual(["Rob Regular", "Sue Slipping"]);
    expect(t.rewardsWaiting.goal).toBe(50);

    expect(t.slipping.count).toBe(2);
    expect(t.slipping.canText).toBe(1);
    const sue = t.slipping.members.find((m: { name: string }) => m.name === "Sue Slipping");
    expect(sue).toMatchObject({ canText: true, usually: "Weekdays 10 am" });
    expect(t.slipping.members.find((m: { name: string }) => m.name === "Sol Slipping").canText).toBe(false);

    expect(t.staff).toHaveLength(1);
    expect(t.staff[0]).toMatchObject({ name: "Sam Barista", visits: 4, stamps: 5, undone: 1 });
    expect(t.staff[0].shift).toBe("8 am to 4 pm");

    // Double stamps 2 to 4 pm: Rae's 3 pm visit is the only one in the window; four Thursdays had 1 visit in it (0.25 a day).
    expect(t.promoWindow).toMatchObject({ title: "Double stamps on slow afternoons", windowVisits: 1, typicalVisits: 0, extraVisits: 1 });
    expect(t.counter).toMatchObject({ online: true, staffName: "Sam Barista" });
    expect(t.counter.signedInAt).toBe(at("2026-10-22 06:52").toISOString());
  });

  it("is manager and above, scoped to the shop, and hides the promo card without promos.basic", async () => {
    const a = await cafe();
    const b = await cafe();
    const staffUser = await createUser(env.db, { name: "Floor" });
    const { merchantStaff } = await import("@ll/db");
    await env.db.insert(merchantStaff).values({ merchantId: a.merchant.id, userId: staffUser.id, role: "staff" });
    const staffToken = await tokenFor(env, staffUser);
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${a.merchant.id}/reports/today`, headers: auth(staffToken) })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${a.merchant.id}/reports/today`, headers: auth(b.ownerToken) })).statusCode).toBe(403);
    await env.db.insert(promos).values({ merchantId: a.merchant.id, title: "Slow", kind: "multiplier", multiplierPct: 200, startTime: "14:00", endTime: "16:00", startsAt: at("2026-10-01 00:00"), status: "live" });
    env.clock.now = at("2026-10-22 18:00");
    const today = (await env.app.inject({ method: "GET", url: `/v1/merchants/${a.merchant.id}/reports/today`, headers: auth(a.ownerToken) })).json();
    expect(today.promoWindow).toBeNull();
    expect(today.today.visits).toBe(0);
    expect(today.counter.online).toBe(false);
  });
});

describe("reports/heatmap, rewards-owed and joiner return", () => {
  it("counts visits by weekday and hour in shop time", async () => {
    const { merchant, ownerToken } = await cafe();
    await visit(merchant.id, "2026-10-22 08:10"); // Thu
    await visit(merchant.id, "2026-10-22 08:50"); // Thu
    await visit(merchant.id, "2026-10-15 08:05"); // Thu
    // 11:30 pm Friday local is already Saturday in UTC: it must land on Friday 23.
    await visit(merchant.id, "2026-10-16 23:30");
    await visit(merchant.id, "2026-10-19 07:00"); // Mon
    // Older than 4 weeks: excluded.
    await visit(merchant.id, "2026-09-10 08:00");
    env.clock.now = at("2026-10-22 18:00");
    const hm = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/heatmap?weeks=4`, headers: auth(ownerToken) })).json();
    expect(hm.weeks).toBe(4);
    expect(hm.matrix).toHaveLength(7);
    expect(hm.matrix[0]).toHaveLength(24);
    expect(hm.matrix[3][8]).toBe(3);
    expect(hm.matrix[4][23]).toBe(1);
    expect(hm.matrix[0][7]).toBe(1);
    expect(hm.max).toBe(3);
    expect(hm.matrix.flat().reduce((a: number, b: number) => a + b, 0)).toBe(5);
    const wide = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/heatmap?weeks=12`, headers: auth(ownerToken) })).json();
    expect(wide.matrix.flat().reduce((a: number, b: number) => a + b, 0)).toBe(6);
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/heatmap?weeks=0`, headers: auth(ownerToken) })).statusCode).toBe(400);
  });

  it("estimates rewards owed from stamps held and the shop's own cost per reward", async () => {
    const { merchant, ownerToken, reward } = await cafe();
    await env.db.update(merchantMembers).set({ balance: 0 }).where(eq(merchantMembers.merchantId, merchant.id));
    expect(reward.pointsCost).toBe(50);
    const mk = async (balance: number) => {
      const r = await visit(merchant.id, "2026-10-20 09:00");
      await env.db.update(merchantMembers).set({ balance }).where(eq(merchantMembers.id, r.member.id));
    };
    await mk(120); // two rewards
    await mk(50); // one
    await mk(49); // none, but 49 stamps held
    await mk(0);
    env.clock.now = at("2026-10-22 18:00");
    const url = `/v1/merchants/${merchant.id}/reports/rewards-owed`;
    const noCost = (await env.app.inject({ method: "GET", url, headers: auth(ownerToken) })).json();
    expect(noCost).toEqual({ rewardsOwed: 3, stampsOutstanding: 219, members: 3, rewardCostCents: null, estCostCents: null, estimate: true });
    const patch = await env.app.inject({ method: "PATCH", url: `/v1/merchants/${merchant.id}/program`, headers: auth(ownerToken), payload: { rewardCostCents: 400 } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().rewardCostCents).toBe(400);
    const withCost = (await env.app.inject({ method: "GET", url, headers: auth(ownerToken) })).json();
    expect(withCost).toMatchObject({ rewardsOwed: 3, rewardCostCents: 400, estCostCents: 1200, estimate: true });
  });

  it("reports joiners who came back within 7, 14 and 30 days (retention endpoint)", async () => {
    const { merchant, ownerToken } = await cafe();
    await grantFeatures(env, merchant.id, ["reports.advanced"]);
    const joinedOn = "2026-09-08";
    const person = async (secondVisit: string | null) => {
      const phone = nextPhone();
      const first = await visit(merchant.id, `${joinedOn} 10:00`, { phone });
      await env.db.update(merchantMembers).set({ createdAt: at(`${joinedOn} 10:00`) }).where(eq(merchantMembers.id, first.member.id));
      if (secondVisit) await visit(merchant.id, secondVisit, { phone });
    };
    await person("2026-09-11 10:00"); // 3 days
    await person("2026-09-18 10:00"); // 10 days
    await person("2026-10-03 10:00"); // 25 days
    await person(null);
    // Joined too recently to be in the cohort (inside the last 30 days).
    await visit(merchant.id, "2026-10-10 10:00");
    env.clock.now = at("2026-10-22 18:00");
    const r = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/retention`, headers: auth(ownerToken) })).json();
    expect(r.joinerReturn.joined).toBe(4);
    expect(r.joinerReturn.windows).toEqual([
      { days: 7, cameBack: 1 },
      { days: 14, cameBack: 2 },
      { days: 30, cameBack: 3 },
    ]);
    expect(r.cohorts).toBeDefined();
  });
});

describe("promo results", () => {
  it("matches a hand-computed window, typical weekday baseline and extra visits", async () => {
    const { merchant, ownerToken } = await cafe();
    await grantFeatures(env, merchant.id, ["promos.basic"]);
    // Baseline: Sep 3 to Sep 30 (4 whole weeks = 20 weekdays), 10 weekday visits in 2 to 4 pm. Noise outside the window or on Saturdays.
    const weekdays = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];
    for (const d of weekdays) await visit(merchant.id, `${d} 14:30`);
    await visit(merchant.id, "2026-09-08 09:00");
    await visit(merchant.id, "2026-09-12 15:00"); // Saturday
    await visit(merchant.id, "2026-08-20 09:00"); // history starts well before the baseline
    // Window: Oct 1 to Oct 22 18:00, 12 weekday visits 2 to 4 pm, 3 at 9 am, 1 on Saturday.
    const inWindow = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
    for (const d of inWindow) await visit(merchant.id, `${d} 15:00`);
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) await visit(merchant.id, `${d} 09:00`);
    await visit(merchant.id, "2026-10-10 15:00");
    const [promo] = await env.db
      .insert(promos)
      .values({
        merchantId: merchant.id,
        title: "Double stamps on slow afternoons",
        kind: "multiplier",
        multiplierPct: 200,
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: "14:00",
        endTime: "16:00",
        startsAt: at("2026-10-01 00:00"),
        status: "live",
      })
      .returning();
    // Free drinks given in the window: two in the 2 to 4 pm hours, one at 9 am, one voided.
    const [member] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, merchant.id)).limit(1);
    const { rewards } = await import("@ll/db");
    const [rw] = await env.db.select().from(rewards).where(eq(rewards.merchantId, merchant.id));
    const red = (code: string, local: string, status = "used") => env.db.insert(redemptions).values({ merchantId: merchant.id, memberId: member!.id, rewardId: rw!.id, code, status, createdAt: at(local) });
    await red("A1", "2026-10-06 14:40");
    await red("A2", "2026-10-13 15:10");
    await red("A3", "2026-10-13 09:10");
    await red("A4", "2026-10-14 15:10", "void");

    env.clock.now = at("2026-10-22 18:00");
    const out = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/promos`, headers: auth(ownerToken) })).json();
    const row = out.items.find((i: { promoId: string }) => i.promoId === promo!.id);
    // Weekdays Oct 1 to Oct 22 = 16 days. Baseline 10 visits / 20 weekdays = 0.5 a day, so typical 8 and extra 4.
    expect(row).toMatchObject({ windowVisits: 12, windowDays: 16, typicalPerDay: 0.5, typicalVisits: 8, extraVisits: 4, freeItemsGiven: 2 });
  });

  it('shows "not enough history" (null typical) with fewer than 2 weeks of baseline', async () => {
    const { merchant, ownerToken } = await cafe();
    await grantFeatures(env, merchant.id, ["promos.basic"]);
    await visit(merchant.id, "2026-10-10 15:00");
    await visit(merchant.id, "2026-10-16 15:00");
    const [promo] = await env.db
      .insert(promos)
      .values({ merchantId: merchant.id, title: "Quiet Mondays", kind: "multiplier", multiplierPct: 200, daysOfWeek: [1], startsAt: at("2026-10-15 00:00"), status: "live" })
      .returning();
    env.clock.now = at("2026-10-22 18:00");
    const out = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/reports/promos`, headers: auth(ownerToken) })).json();
    const row = out.items.find((i: { promoId: string }) => i.promoId === promo!.id);
    expect(row.typicalVisits).toBeNull();
    expect(row.typicalPerDay).toBeNull();
    expect(row.extraVisits).toBeNull();
    expect(row.windowVisits).toBe(0); // Oct 16 is a Friday, the promo runs Mondays
    expect(row.freeItemsGiven).toBe(0);
  });
});

describe("customers: segments and rhythm fields", () => {
  async function seedPeople() {
    const m = await cafe();
    const phones = { regular: nextPhone(), slipping: nextPhone(), casual: nextPhone() };
    for (const d of ["2026-10-12 08:00", "2026-10-15 08:00", "2026-10-19 08:10", "2026-10-21 08:05"]) await visit(m.merchant.id, d, { phone: phones.regular, name: "Rae Regular", consent: true });
    for (const d of ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"]) await visit(m.merchant.id, `${d} 10:00`, { phone: phones.slipping, name: "Sue Slipping" });
    await visit(m.merchant.id, "2026-10-20 12:00", { phone: phones.casual, name: "Cam Casual" });
    env.clock.now = at("2026-10-22 18:00");
    return { ...m, phones };
  }
  const list = async (m: { merchant: { id: string }; ownerToken: string }, q = "") => (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/customers${q}`, headers: auth(m.ownerToken) })).json();

  it("adds visits30d, usually, isRegular and isSlipping to every member", async () => {
    const m = await seedPeople();
    const body = await list(m);
    const by = (n: string) => body.items.find((i: { name: string }) => i.name === n);
    expect(by("Rae Regular")).toMatchObject({ visits30d: 4, isRegular: true, isSlipping: false, usually: "Weekdays 8 am" });
    expect(by("Sue Slipping")).toMatchObject({ visits30d: 2, isRegular: false, isSlipping: true, usually: "Weekdays 10 am" });
    expect(by("Cam Casual")).toMatchObject({ visits30d: 1, isRegular: false, isSlipping: false, usually: null });
  });

  it("filters segment=slipping to exactly the members isSlipping marks", async () => {
    const m = await seedPeople();
    const all = await list(m);
    const marked = all.items.filter((i: { isSlipping: boolean }) => i.isSlipping).map((i: { memberId: string }) => i.memberId).sort();
    const slipping = await list(m, "?segment=slipping");
    expect(slipping.items.map((i: { memberId: string }) => i.memberId).sort()).toEqual(marked);
    expect(slipping.total).toBe(1);
    const regulars = await list(m, "?segment=regulars");
    expect(regulars.items.map((i: { name: string }) => i.name)).toEqual(["Rae Regular"]);
  });

  it("filters can_text and birthday_month, and counts every chip", async () => {
    const m = await seedPeople();
    const [rae] = await env.db.select().from(users).where(eq(users.phone, m.phones.regular));
    await env.db.update(users).set({ birthday: "1990-10-05" }).where(eq(users.id, rae!.id));
    const [cam] = await env.db.select().from(users).where(eq(users.phone, m.phones.casual));
    await env.db.update(users).set({ birthday: "1985-03-05" }).where(eq(users.id, cam!.id));
    expect((await list(m, "?segment=can_text")).items.map((i: { name: string }) => i.name)).toEqual(["Rae Regular"]);
    expect((await list(m, "?segment=birthday_month")).items.map((i: { name: string }) => i.name)).toEqual(["Rae Regular"]);
    const counts = (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/customers/segment-counts`, headers: auth(m.ownerToken) })).json();
    expect(counts).toEqual({ all: 3, regulars: 1, slipping: 1, rewardReady: 0, newThisMonth: 2, birthdayMonth: 1, canText: 1 });
  });

  it("returns the recorded consent wording in the detail panel only when it exists", async () => {
    const m = await seedPeople();
    const items = (await list(m)).items;
    const rae = items.find((i: { name: string }) => i.name === "Rae Regular");
    const cam = items.find((i: { name: string }) => i.name === "Cam Casual");
    const raeDetail = (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/customers/${rae.memberId}`, headers: auth(m.ownerToken) })).json();
    expect(raeDetail.customer.marketingConsentText).toBe(consent.text);
    expect(raeDetail.customer.marketingConsentSource).toBe("counter");
    expect(raeDetail.customer.marketingConsentAt).not.toBeNull();
    expect(raeDetail.customer.visits30d).toBe(4);
    const camDetail = (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/customers/${cam.memberId}`, headers: auth(m.ownerToken) })).json();
    expect(camDetail.customer.marketingConsentAt).toBeNull();
    expect(camDetail.customer.marketingConsentText).toBeNull();
  });
});

describe("program: Stamp on scan and reward cost", () => {
  it("is on for new café and bakery programs, off elsewhere, and never on for per_dollar", async () => {
    const { merchant, ownerToken } = await createBaseMerchant(env, { earnType: "stamps" });
    const url = `/v1/merchants/${merchant.id}/program`;
    // The test helper makes a program with the DB default (off).
    expect((await env.app.inject({ method: "GET", url, headers: auth(ownerToken) })).json().counterAutoStamp).toBe(false);
    const on = await env.app.inject({ method: "PATCH", url, headers: auth(ownerToken), payload: { stampGoal: 10, counterAutoStamp: true } });
    expect(on.json().counterAutoStamp).toBe(true);
    const dollar = await env.app.inject({ method: "PATCH", url, headers: auth(ownerToken), payload: { earnType: "per_dollar", counterAutoStamp: true } });
    expect(dollar.statusCode).toBe(200);
    expect(dollar.json().counterAutoStamp).toBe(false);
    // Switching back does not resurrect it.
    const back = await env.app.inject({ method: "PATCH", url, headers: auth(ownerToken), payload: { earnType: "stamps", stampGoal: 10 } });
    expect(back.json().counterAutoStamp).toBe(false);
    const cost = await env.app.inject({ method: "PATCH", url, headers: auth(ownerToken), payload: { rewardCostCents: 425 } });
    expect(cost.json().rewardCostCents).toBe(425);
    expect((await env.app.inject({ method: "PATCH", url, headers: auth(ownerToken), payload: { rewardCostCents: -5 } })).statusCode).toBe(400);
    const cleared = await env.app.inject({ method: "PATCH", url, headers: auth(ownerToken), payload: { rewardCostCents: null } });
    expect(cleared.json().rewardCostCents).toBeNull();
  });

  it("applies the vertical template with Stamp on scan for cafés and bakeries only", async () => {
    const { applyVerticalTemplate } = await import("../src/services/merchant.js");
    for (const [vertical, expected] of [["cafe", true], ["bakery", true], ["retail", false], ["pharmacy", false], ["restaurant", false]] as const) {
      const { merchant } = await createBaseMerchant(env);
      await env.db.transaction(async (tx) => {
        await applyVerticalTemplate(tx, merchant.id, vertical);
      });
      const [p] = await env.db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchant.id));
      expect([vertical, p!.counterAutoStamp]).toEqual([vertical, expected]);
    }
  });

  it("counter award returns visitsThisMonth for the stamped screen", async () => {
    const { merchant, ownerToken } = await cafe();
    const phone = nextPhone();
    await visit(merchant.id, "2026-10-03 08:00", { phone });
    await visit(merchant.id, "2026-09-28 08:00", { phone });
    env.clock.now = at("2026-10-22 09:00");
    const res = await env.app.inject({
      method: "POST",
      url: `/v1/merchants/${merchant.id}/counter/award`,
      headers: auth(ownerToken),
      payload: { phone, quantity: 1, idempotencyKey: "cafe-test-key-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().visitsThisMonth).toBe(2);
  });
});

describe("messages: segments, cameIn7d and quiet hours", () => {
  async function setupMessaging() {
    const m = await cafe();
    await grantFeatures(env, m.merchant.id, ["marketing.email", "marketing.automations"]);
    return m;
  }

  it("counts only people who agreed for regulars and slipping audiences, per channel", async () => {
    const m = await setupMessaging();
    const reg = nextPhone();
    for (const d of ["2026-10-12 08:00", "2026-10-15 08:00", "2026-10-19 08:10"]) await visit(m.merchant.id, d, { phone: reg, name: "Rae", consent: true });
    const noConsent = nextPhone();
    for (const d of ["2026-10-13 08:00", "2026-10-16 08:00", "2026-10-20 08:10"]) await visit(m.merchant.id, d, { phone: noConsent, name: "Nora" });
    const slip = nextPhone();
    for (const d of ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"]) await visit(m.merchant.id, `${d} 10:00`, { phone: slip, name: "Sue", consent: true });
    const slipNo = nextPhone();
    for (const d of ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26", "2026-10-03"]) await visit(m.merchant.id, `${d} 10:00`, { phone: slipNo, name: "Sol" });
    for (const p of [reg, noConsent, slip, slipNo]) await env.db.update(users).set({ email: `${p.slice(-4)}@example.com` }).where(eq(users.phone, p));
    env.clock.now = at("2026-10-22 18:00");
    const audience = async (segment: object, channel = "email") =>
      (await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/messages/audience`, headers: auth(m.ownerToken), payload: { channel, segment } })).json();
    expect(await audience({ kind: "regulars" })).toMatchObject({ matched: 2, recipients: 1, excludedNoConsent: 1 });
    expect(await audience({ kind: "slipping" })).toMatchObject({ matched: 2, recipients: 1, excludedNoConsent: 1 });
    expect(await audience({ kind: "all" })).toMatchObject({ matched: 4, recipients: 2, excludedNoConsent: 2 });
    // Lapsed defaults to 21 days: Sue and Sol last came 20 and 19 days ago, so nobody yet.
    expect((await audience({ kind: "lapsed" })).matched).toBe(0);
    expect((await audience({ kind: "lapsed", days: 18 })).matched).toBe(2);
  });

  it("adds cameIn7d to each sent message: distinct recipients who visited within 7 days", async () => {
    const m = await setupMessaging();
    const phones = [nextPhone(), nextPhone(), nextPhone(), nextPhone()];
    for (const [i, p] of phones.entries()) {
      await visit(m.merchant.id, `2026-10-01 ${String(8 + i).padStart(2, "0")}:00`, { phone: p, name: `P${i}`, consent: i < 3 });
      await env.db.update(users).set({ email: `p${i}-${p.slice(-4)}@example.com` }).where(eq(users.phone, p));
    }
    env.clock.now = at("2026-10-10 10:00");
    const sent = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/messages`, headers: auth(m.ownerToken), payload: { channel: "email", subject: "We miss you", body: "Come in", sendNow: true } });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().recipientCount).toBe(3);
    // P0 returns twice (counts once), P1 returns on day 8 (too late), P2 never, P3 never agreed so was not sent to and does not count.
    await visit(m.merchant.id, "2026-10-11 09:00", { phone: phones[0] });
    await visit(m.merchant.id, "2026-10-12 09:00", { phone: phones[0] });
    await visit(m.merchant.id, "2026-10-18 11:00", { phone: phones[1] });
    await visit(m.merchant.id, "2026-10-11 09:30", { phone: phones[3] });
    // A visit before the send does not count.
    await visit(m.merchant.id, "2026-10-09 09:00", { phone: phones[2] });

    env.clock.now = at("2026-10-12 12:00");
    const early = (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/messages`, headers: auth(m.ownerToken) })).json();
    expect(early.items[0]).toMatchObject({ status: "sent", cameIn7d: 1, cameIn7dFinal: false });
    env.clock.now = at("2026-10-23 12:00");
    const late = (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/messages`, headers: auth(m.ownerToken) })).json();
    expect(late.items[0]).toMatchObject({ cameIn7d: 1, cameIn7dFinal: true });
    const detail = (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/messages/${late.items[0].id}`, headers: auth(m.ownerToken) })).json();
    expect(detail.cameIn7d).toBe(1);
  });

  it("queues texts sent in quiet hours until 8 am and never sends them early", async () => {
    const m = await setupMessaging();
    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, m.merchant.id));
    await grantFeatures(env, m.merchant.id, ["marketing.sms"]);
    await visit(m.merchant.id, "2026-10-20 09:00", { name: "Rae", consent: true });
    env.clock.now = at("2026-10-22 22:15"); // 10:15 pm Toronto
    const res = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/messages`, headers: auth(m.ownerToken), payload: { channel: "sms", body: "Fresh scones", sendNow: true } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: "scheduled", recipientCount: 0 });
    expect(res.json().scheduledAt).toBe(at("2026-10-23 08:00").toISOString());
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);
    // The job at 7:59 still waits; at 8:00 it goes out.
    env.clock.now = at("2026-10-23 07:59");
    expect(await sendScheduledCampaigns(env.ctx)).toBe(0);
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);
    env.clock.now = at("2026-10-23 08:00");
    expect(await sendScheduledCampaigns(env.ctx)).toBe(1);
    expect(env.ctx.providers.outbox.sms).toHaveLength(1);
    expect(env.ctx.providers.outbox.sms[0]!.body).toContain("Reply STOP to unsubscribe.");
    // Outside quiet hours it sends immediately.
    env.clock.now = at("2026-10-23 11:00");
    const now = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/messages`, headers: auth(m.ownerToken), payload: { channel: "sms", body: "Lunch special", sendNow: true } });
    expect(now.json()).toMatchObject({ status: "sent", recipientCount: 1 });
  });

  it("win-back automation defaults to 21 days and reports who came back", async () => {
    const m = await setupMessaging();
    const list = (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/automations`, headers: auth(m.ownerToken) })).json().items;
    const winBack = list.find((a: { kind: string }) => a.kind === "win_back");
    expect(winBack.days).toBe(21);
    expect(winBack.last30Days).toEqual({ messaged: 0, cameIn7d: 0 });
  });

  it("delivers Free drink ready as a wallet pass update, with no consent and no SMS", async () => {
    const m = await setupMessaging();
    const phone = nextPhone();
    const first = await visit(m.merchant.id, "2026-10-20 09:00", { phone, name: "Fatima" }); // no marketing consent
    await env.db.update(merchantMembers).set({ balance: 60 }).where(eq(merchantMembers.id, first.member.id));
    const { walletPasses } = await import("@ll/db");
    await env.db.insert(walletPasses).values({ userId: first.member.userId, platform: "apple", serialNumber: "ser-1", authToken: "tok-1" } as never);
    const put = await env.app.inject({
      method: "PUT",
      url: `/v1/merchants/${m.merchant.id}/automations/reward_ready`,
      headers: auth(m.ownerToken),
      payload: { enabled: true, channel: "push", subject: "Free drink ready", body: "{{first_name}}, your free drink is ready at {{merchant}}." },
    });
    expect(put.statusCode).toBe(200);
    env.clock.now = at("2026-10-22 18:00");
    expect(await runAutomations(env.ctx)).toBe(1);
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);
    const rows = await env.db.select().from(messageDeliveries).where(and(eq(messageDeliveries.merchantId, m.merchant.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "push", kind: "transactional", to: "wallet pass", status: "sent" });
    // Once per visit: a second pass does nothing.
    expect(await runAutomations(env.ctx)).toBe(0);
    const [msg] = await env.db.select().from(messages).where(eq(messages.merchantId, m.merchant.id));
    expect(msg!.automation).toBe("reward_ready");
  });
});
