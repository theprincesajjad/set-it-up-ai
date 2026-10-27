/**
 * Barbershops, threading bars and beauty supply (docs/research/barbers-beauty.md): the walk-in line, estimate and skip rule, the text
 * when next, renter privacy, payouts, "my barber", family members and the beauty claims guard.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, familyMembers, queueEntries, services, staffPay, users } from "@ll/db";
import { FEATURES, FREE_FOREVER, checkBeautyClaims, estimateWaitMin, waitText } from "@ll/shared";
import { call, customer, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-04T15:00:00Z") }); // Wed 10:00 Toronto
});
afterEach(async () => env.close());

async function shop(opts: { vertical?: string } = {}) {
  const m = await paidMerchant(env, { plan: "plus", vertical: opts.vertical ?? "barber" });
  const base = `/v1/merchants/${m.merchant.id}`;
  const owner = m.ownerToken;
  const marcus = await staffMember(env, m.merchant.id, "staff");
  const ayo = await staffMember(env, m.merchant.id, "staff");
  const desk = await staffMember(env, m.merchant.id, "manager");
  await env.db.update(users).set({ name: "Marcus Bailey" }).where(eq(users.id, marcus.user.id));
  await env.db.update(users).set({ name: "Ayo Adeyemi" }).where(eq(users.id, ayo.user.id));
  const mk = async (b: Record<string, unknown>) => (await call(env, owner, "POST", `${base}/services`, b)).body;
  const cut = await mk({ name: "Cut", durationMin: 25, priceCents: 3000 });
  const kids = await mk({ name: "Kids' cut", durationMin: 20, priceCents: 2200 });
  expect((await call(env, owner, "PUT", `${base}/queue/settings`, { open: true })).status).toBe(200);
  return { ...m, base, owner, marcus, ayo, desk, cut, kids };
}
type Shop = Awaited<ReturnType<typeof shop>>;

const join = (s: Shop, body: Record<string, unknown>, token: string | null = null) => call(env, token, "POST", `/v1/public/shops/${s.merchant.slug}/queue`, { textConsent: false, ...body });
const sms = () => env.ctx.providers.outbox.sms;

describe("estimate maths", () => {
  it("spreads the work over the chairs and rounds up to 5 minutes", () => {
    const chairs = [{ staffId: "a", busyMin: 0 }, { staffId: "b", busyMin: 10 }];
    expect(estimateWaitMin([], chairs, null)).toBe(0);
    // 3 x 25 min over 2 chairs = 37.5, plus the 0 minutes the freest chair has left, rounded up to 40
    expect(estimateWaitMin([25, 25, 25].map((d) => ({ durationMin: d, requestedStaffId: null })), chairs, null)).toBe(40);
    // a named barber: their own line plus half of the "anyone" work, plus their chair
    expect(estimateWaitMin([{ durationMin: 30, requestedStaffId: "b" }, { durationMin: 20, requestedStaffId: null }], chairs, "b")).toBe(50);
    expect(estimateWaitMin([], [], null)).toBeNull();
    expect(waitText(25)).toBe("about 25 min");
    expect(waitText(70)).toBe("about 1 h 10 min");
    expect(waitText(0)).toBe("no wait");
  });
});

describe("joining the line", () => {
  it("is gated by the plan and by the open switch", async () => {
    const free = await paidMerchant(env, { plan: "free", vertical: "barber" });
    expect((await call(env, null, "GET", `/v1/public/shops/${free.merchant.slug}/queue`)).status).toBe(402);
    const s = await shop();
    await call(env, s.owner, "PUT", `${s.base}/queue/settings`, { open: false });
    const r = await join(s, { name: "Omar", phone: "416-555-0201" });
    expect(r.status).toBe(409);
    expect(r.body.error.code ?? r.body.code).toBe("queue_closed");
  });

  it("a guest joins by first name and phone, gets a place, an estimate and the status page", async () => {
    const s = await shop();
    const r = await join(s, { name: "Omar", phone: "416-555-0201", serviceId: s.cut.id, textConsent: true });
    expect(r.status).toBe(201);
    expect(r.body.status).toMatchObject({ state: "waiting", position: 1, name: "Omar", serviceName: "Cut" });
    const st = await call(env, null, "GET", `/v1/public/queue/${r.body.token}`);
    expect(st.body.position).toBe(1);
    // Joining again with the same phone returns the same place.
    const again = await join(s, { name: "Omar", phone: "416-555-0201" });
    expect(again.body.token).toBe(r.body.token);
    const board = await call(env, s.owner, "GET", `${s.base}/queue`);
    expect(board.body.stats.waiting).toBe(1);
    expect(board.body.waiting[0].name).toBe("Omar");
  });

  it("refuses the text without a phone, a full line, and an unknown barber", async () => {
    const s = await shop();
    expect((await join(s, { name: "Omar", textConsent: true })).status).toBe(400);
    await call(env, s.owner, "PUT", `${s.base}/queue/settings`, { maxWaiting: 1 });
    expect((await join(s, { name: "A", phone: "416-555-0202" })).status).toBe(201);
    const full = await join(s, { name: "B", phone: "416-555-0203" });
    expect(full.status).toBe(409);
    await call(env, s.owner, "PUT", `${s.base}/queue/settings`, { maxWaiting: 10 });
    expect((await join(s, { name: "C", phone: "416-555-0204", requestedStaffId: "00000000-0000-4000-8000-000000000000" })).status).toBe(400);
  });

  it("orders by join time and leaving takes the person off", async () => {
    const s = await shop();
    const a = await join(s, { name: "A", phone: "416-555-0211" });
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    const b = await join(s, { name: "B", phone: "416-555-0212" });
    expect(b.body.status.position).toBe(2);
    await call(env, null, "POST", `/v1/public/queue/${a.body.token}/leave`);
    const st = await call(env, null, "GET", `/v1/public/queue/${b.body.token}`);
    expect(st.body.position).toBe(1);
    const left = await call(env, null, "GET", `/v1/public/queue/${a.body.token}`);
    expect(left.body.state).toBe("left");
  });
});

describe("texts", () => {
  it("texts once when first in line, only with consent, and once more when called", async () => {
    const s = await shop();
    const n0 = sms().length;
    await join(s, { name: "Omar", phone: "416-555-0221", textConsent: true });
    const next = sms().slice(n0);
    expect(next).toHaveLength(1);
    expect(next[0]!.body).toContain("You're next at Test Shop");
    expect(next[0]!.body).toContain("STOP");
    // A second person behind gets nothing; a person without consent gets nothing.
    await join(s, { name: "Sam", phone: "416-555-0222", textConsent: false });
    expect(sms().length).toBe(n0 + 1);
    const board = await call(env, s.owner, "GET", `${s.base}/queue`);
    const first = board.body.waiting[0];
    const c = await call(env, s.marcus.token, "POST", `${s.base}/queue/${first.id}/call`, { staffId: s.marcus.user.id });
    expect(c.status).toBe(200);
    expect(sms().at(-1)!.body).toContain("Marcus Bailey is ready for you");
    // Sam is now first but did not ask for a text.
    expect(sms().length).toBe(n0 + 2);
  });
});

describe("order in line", () => {
  it("keeps join order when people join at the same instant", async () => {
    const s = await shop();
    for (const [i, name] of ["Ali", "Bea", "Cyd", "Dev"].entries()) await join(s, { name, phone: `416-555-03${10 + i}` });
    const board = await call(env, s.owner, "GET", `${s.base}/queue`);
    expect(board.body.waiting.map((w: { name: string }) => w.name)).toEqual(["Ali", "Bea", "Cyd", "Dev"]);
  });
});

describe("the barber picks, skip and the chair", () => {
  it("a barber calls anyone for their own chair, not for another barber's", async () => {
    const s = await shop();
    const r = await join(s, { name: "Omar", phone: "416-555-0231", serviceId: s.cut.id });
    const id = r.body.entries[0].id;
    expect((await call(env, s.marcus.token, "POST", `${s.base}/queue/${id}/call`, { staffId: s.ayo.user.id })).status).toBe(403);
    expect((await call(env, s.desk.token, "POST", `${s.base}/queue/${id}/call`, { staffId: s.ayo.user.id })).status).toBe(200);
    // One person on the way per barber.
    const r2 = await join(s, { name: "Sam", phone: "416-555-0232" });
    const busy = await call(env, s.ayo.token, "POST", `${s.base}/queue/${r2.body.entries[0].id}/call`, { staffId: s.ayo.user.id });
    expect(busy.status).toBe(409);
  });

  it("start makes a walk-in appointment in the chair; done completes it; checkout with a tip is the existing one", async () => {
    const s = await shop();
    const r = await join(s, { name: "Omar", phone: "416-555-0241", serviceId: s.cut.id });
    const id = r.body.entries[0].id;
    await call(env, s.marcus.token, "POST", `${s.base}/queue/${id}/call`, { staffId: s.marcus.user.id });
    const st = await call(env, s.marcus.token, "POST", `${s.base}/queue/${id}/start`);
    expect(st.status).toBe(200);
    const appt = (await env.db.select().from(appointments).where(eq(appointments.id, st.body.appointmentId)))[0]!;
    expect(appt).toMatchObject({ source: "walk_in", status: "in_service", staffId: s.marcus.user.id });
    const board = await call(env, s.owner, "GET", `${s.base}/queue`);
    const chair = board.body.chairs.find((c: { staffId: string }) => c.staffId === s.marcus.user.id);
    expect(chair.state).toBe("busy");
    const done = await call(env, s.marcus.token, "POST", `${s.base}/queue/${id}/done`);
    expect(done.body.entry.status).toBe("done");
    expect((await env.db.select().from(appointments).where(eq(appointments.id, appt.id)))[0]!.status).toBe("completed");
  });

  it("the first skip moves a person back two places, the second takes them off", async () => {
    const s = await shop();
    const toks: string[] = [];
    for (const [i, n] of ["A", "B", "C", "D"].entries()) {
      env.clock.now = new Date(env.clock.now.getTime() + 60_000);
      toks.push((await join(s, { name: n, phone: `416-555-025${i}` })).body.token);
    }
    const board = await call(env, s.owner, "GET", `${s.base}/queue`);
    const a = board.body.waiting[0];
    expect(a.name).toBe("A");
    const sk = await call(env, s.desk.token, "POST", `${s.base}/queue/${a.id}/skip`);
    expect(sk.body.entry).toMatchObject({ status: "waiting", skips: 1, position: 3 });
    const order = (await call(env, s.owner, "GET", `${s.base}/queue`)).body.waiting.map((w: { name: string }) => w.name);
    expect(order).toEqual(["B", "C", "A", "D"]);
    const sk2 = await call(env, s.desk.token, "POST", `${s.base}/queue/${a.id}/skip`);
    expect(sk2.body.entry.status).toBe("no_show");
    expect((await call(env, null, "GET", `/v1/public/queue/${toks[0]}`)).body.state).toBe("no_show");
  });

  it("a named barber's estimate counts only their own line and the anyone people", async () => {
    const s = await shop();
    await join(s, { name: "A", phone: "416-555-0261", serviceId: s.cut.id, requestedStaffId: s.marcus.user.id });
    const q = await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/queue`);
    const m = q.body.barbers.find((b: { id: string }) => b.id === s.marcus.user.id);
    const a = q.body.barbers.find((b: { id: string }) => b.id === s.ayo.user.id);
    expect(m.estimateMin).toBeGreaterThan(a.estimateMin);
    expect(q.body.waiting).toBe(1);
  });
});

describe("family members", () => {
  it("need consent, hold a first name only, join the line with the parent and are deleted on removal", async () => {
    const s = await shop();
    const p = await customer(env, { name: "Sajjad Parent" });
    expect((await call(env, p.token, "POST", "/v1/me/family", { firstName: "Aiden", consent: false })).status).toBe(400);
    const add = await call(env, p.token, "POST", "/v1/me/family", { firstName: "Aiden", consent: true });
    expect(add.status).toBe(201);
    const row = (await env.db.select().from(familyMembers).where(eq(familyMembers.id, add.body.id)))[0]!;
    expect(Object.keys(row).sort()).toEqual(["consentAt", "createdAt", "firstName", "id", "userId"]);
    const r = await join(s, { name: "Sajjad", serviceId: s.cut.id, familyMemberIds: [add.body.id] }, p.token);
    expect(r.status).toBe(201);
    expect(r.body.entries).toHaveLength(2);
    const entries = await env.db.select().from(queueEntries).where(eq(queueEntries.userId, p.user.id));
    const kid = entries.find((e) => e.familyMemberId === add.body.id)!;
    expect(kid).toMatchObject({ name: "Aiden", serviceName: "Kids' cut", durationMin: 20 });
    const board = await call(env, s.owner, "GET", `${s.base}/queue`);
    expect(board.body.waiting.find((w: { name: string }) => w.name === "Aiden").withName).toBe("Sajjad");
    // The parent's status page names the child; leaving takes both off.
    expect((await call(env, null, "GET", `/v1/public/queue/${r.body.token}`)).body.party[0].name).toBe("Aiden");
    await call(env, null, "POST", `/v1/public/queue/${r.body.token}/leave`);
    expect((await env.db.select().from(queueEntries).where(eq(queueEntries.userId, p.user.id))).every((e) => e.status === "left")).toBe(true);
    expect((await call(env, p.token, "DELETE", `/v1/me/family/${add.body.id}`)).status).toBe(204);
    expect(await env.db.select().from(familyMembers).where(eq(familyMembers.userId, p.user.id))).toHaveLength(0);
    expect((await env.db.select().from(queueEntries).where(eq(queueEntries.userId, p.user.id))).every((e) => e.name !== "Aiden")).toBe(true);
  });

  it("allows at most six and another parent's member is not usable", async () => {
    const p = await customer(env);
    for (let i = 0; i < 6; i++) expect((await call(env, p.token, "POST", "/v1/me/family", { firstName: `K${i}`, consent: true })).status).toBe(201);
    expect((await call(env, p.token, "POST", "/v1/me/family", { firstName: "K7", consent: true })).status).toBe(409);
    const s = await shop();
    const other = await customer(env);
    const m = (await env.db.select().from(familyMembers).where(eq(familyMembers.userId, p.user.id)))[0]!;
    expect((await join(s, { name: "X", familyMemberIds: [m.id] }, other.token)).status).toBe(404);
  });
});

describe("my barber", () => {
  it("follows the last visit until the customer picks", async () => {
    const s = await shop();
    const c = await customer(env);
    const r = await join(s, { name: "Omar", serviceId: s.cut.id }, c.token);
    const id = r.body.entries[0].id;
    await call(env, s.marcus.token, "POST", `${s.base}/queue/${id}/call`, { staffId: s.marcus.user.id });
    await call(env, s.marcus.token, "POST", `${s.base}/queue/${id}/start`);
    await call(env, s.marcus.token, "POST", `${s.base}/queue/${id}/done`);
    const mine = await call(env, c.token, "GET", `/v1/me/shops/${s.merchant.slug}/barber`);
    expect(mine.body).toMatchObject({ staffId: s.marcus.user.id, name: "Marcus Bailey", source: "auto", visitsWith: 1 });
    const pick = await call(env, c.token, "PUT", `/v1/me/shops/${s.merchant.slug}/barber`, { staffId: s.ayo.user.id });
    expect(pick.body).toMatchObject({ staffId: s.ayo.user.id, source: "chosen" });
    // A later visit with Marcus does not overwrite a chosen barber.
    const r2 = await join(s, { name: "Omar" }, c.token);
    await call(env, s.marcus.token, "POST", `${s.base}/queue/${r2.body.entries[0].id}/call`, { staffId: s.marcus.user.id });
    await call(env, s.marcus.token, "POST", `${s.base}/queue/${r2.body.entries[0].id}/start`);
    await call(env, s.marcus.token, "POST", `${s.base}/queue/${r2.body.entries[0].id}/done`);
    expect((await call(env, c.token, "GET", `/v1/me/shops/${s.merchant.slug}/barber`)).body.staffId).toBe(s.ayo.user.id);
    expect((await call(env, c.token, "PUT", `/v1/me/shops/${s.merchant.slug}/barber`, { staffId: c.user.id })).status).toBe(404);
  });
});

describe("pay, payouts and renter privacy", () => {
  async function week(s: Shop) {
    await call(env, s.owner, "PUT", `${s.base}/staff/${s.marcus.user.id}/pay`, { model: "chair_rent", rentCentsWeek: 18000, ownClientsOnly: true });
    await call(env, s.owner, "PUT", `${s.base}/staff/${s.ayo.user.id}/pay`, { model: "commission", shopShareBps: 4000 });
    // Marcus does 2 cuts ($30 each, $6 and $0 tips), Ayo one cut ($30, $5 tip), checked out at the counter.
    const visits: [Awaited<ReturnType<typeof staffMember>>, number][] = [[s.marcus, 600], [s.marcus, 0], [s.ayo, 500]];
    for (const [who, tip] of visits) {
      const c = await customer(env);
      const r = await join(s, { name: "C", serviceId: s.cut.id }, c.token);
      const id = r.body.entries[0].id;
      await call(env, who.token, "POST", `${s.base}/queue/${id}/call`, { staffId: who.user.id });
      const st = await call(env, who.token, "POST", `${s.base}/queue/${id}/start`);
      const co = await call(env, s.desk.token, "POST", `${s.base}/appointments/${st.body.appointmentId}/checkout`, { mode: "counter", counterMethod: "cash", tipCents: tip, tipStaffId: who.user.id });
      expect(co.status).toBe(200);
    }
  }

  it("shows services, tips, the shop's share and rent per barber, from paid visits only", async () => {
    const s = await shop();
    await week(s);
    const r = await call(env, s.desk.token, "GET", `${s.base}/payouts?from=2026-11-02&to=2026-11-08`);
    expect(r.status).toBe(200);
    const m = r.body.rows.find((x: { staffId: string }) => x.staffId === s.marcus.user.id);
    const a = r.body.rows.find((x: { staffId: string }) => x.staffId === s.ayo.user.id);
    expect(m).toMatchObject({ model: "chair_rent", visits: 2, servicesCents: 6000, tipsCents: 600, shopKeepsCents: 0, rentCents: 18000, takeHomeCents: 6000 - 18000 + 600 });
    expect(a).toMatchObject({ model: "commission", visits: 1, servicesCents: 3000, tipsCents: 500, shopKeepsCents: 1200, takeHomeCents: 3000 - 1200 + 500 });
    expect(r.body.totals.servicesCents).toBe(9000);
    expect(r.body.totals.tipsCents).toBe(1100);
    const csv = await env.app.inject({ method: "GET", url: `${s.base}/payouts.csv?from=2026-11-02&to=2026-11-08`, headers: { authorization: `Bearer ${s.owner}` } });
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("Marcus Bailey,Chair rental,2,60.00,6.00,0.00,180.00,-114.00");
  });

  it("a team member sees only their own row; a renter sees only their own clients", async () => {
    const s = await shop();
    await week(s);
    const mine = await call(env, s.marcus.token, "GET", `${s.base}/payouts?from=2026-11-02&to=2026-11-08`);
    expect(mine.body.mine).toBe(true);
    expect(mine.body.rows.map((x: { staffId: string }) => x.staffId)).toEqual([s.marcus.user.id]);
    // The renter's calendar is only their column, the customer directory is closed, and another barber's visit is not readable.
    const day = await call(env, s.marcus.token, "GET", `${s.base}/appointments?from=2026-11-04T00:00:00Z&to=2026-11-05T23:00:00Z`);
    expect(day.body.items.every((x: { staffId: string }) => x.staffId === s.marcus.user.id)).toBe(true);
    expect(day.body.items.length).toBe(2);
    const dir = await call(env, s.marcus.token, "GET", `${s.base}/customers`);
    expect(dir.status).toBe(403);
    expect(dir.body.error?.code ?? dir.body.code).toBe("own_clients_only");
    const theirs = (await env.db.select().from(appointments).where(eq(appointments.staffId, s.ayo.user.id)))[0]!;
    expect((await call(env, s.marcus.token, "GET", `${s.base}/appointments/${theirs.id}`)).status).toBe(403);
    // A commission barber without the privacy switch, and the front desk, see everything.
    expect((await call(env, s.ayo.token, "GET", `${s.base}/customers`)).status).toBe(200);
    expect((await call(env, s.desk.token, "GET", `${s.base}/appointments?from=2026-11-04T00:00:00Z&to=2026-11-05T23:00:00Z`)).body.items.length).toBe(3);
    // The line: a renter sees waiting people who asked for others as not theirs.
    await join(s, { name: "Z", phone: "416-555-0271", requestedStaffId: s.ayo.user.id });
    const board = await call(env, s.marcus.token, "GET", `${s.base}/queue`);
    expect(board.body.waiting).toHaveLength(0);
    expect(board.body.chairs).toHaveLength(1);
  });

  it("only a manager sets pay; a commission needs a share; pay is gated by the feature", async () => {
    const s = await shop();
    expect((await call(env, s.marcus.token, "PUT", `${s.base}/staff/${s.marcus.user.id}/pay`, { model: "chair_rent", rentCentsWeek: 100 })).status).toBe(403);
    expect((await call(env, s.owner, "PUT", `${s.base}/staff/${s.ayo.user.id}/pay`, { model: "commission", shopShareBps: 0 })).status).toBe(400);
    expect((await call(env, s.owner, "PUT", `${s.base}/staff/${s.ayo.user.id}/pay`, { model: "chair_rent", rentCentsWeek: 15000 })).body).toMatchObject({ model: "chair_rent", rentCentsWeek: 15000, shopShareBps: 0 });
    const list = await call(env, s.owner, "GET", `${s.base}/staff-pay`);
    expect(list.body.items.find((i: { userId: string }) => i.userId === s.ayo.user.id).rentCentsWeek).toBe(15000);
    expect((await env.db.select().from(staffPay).where(eq(staffPay.userId, s.ayo.user.id))).length).toBe(1);
    const free = await paidMerchant(env, { plan: "free", vertical: "barber" });
    expect((await call(env, free.ownerToken, "GET", `/v1/merchants/${free.merchant.id}/payouts?from=2026-11-02&to=2026-11-08`)).status).toBe(402);
  });
});

describe("beauty supply claims guard", () => {
  it("catches treatment claims and lets ordinary retail words through", () => {
    for (const t of ["Stops hair loss in 30 days", "Cures dandruff", "regrows your hair", "A treatment for eczema", "clinically proven to treat acne"]) expect(checkBeautyClaims(t).ok, t).toBe(false);
    for (const t of ["Treat yourself: 15% off colour", "New shades of permanent hair colour", "Shea butter shampoo, 355 ml", "Heat protectant spray", "Dandruff shampoo, in stock"]) expect(checkBeautyClaims(t).ok, t).toBe(true);
  });

  it("refuses a message, a promo title and a reward name with a claim, only for a beauty supply shop", async () => {
    const glow = await paidMerchant(env, { plan: "plus", vertical: "beauty_supply" });
    const other = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    const body = { channel: "email", subject: "New serum", body: "Our serum stops hair loss in 30 days.", segment: { kind: "all" } };
    const r = await call(env, glow.ownerToken, "POST", `/v1/merchants/${glow.merchant.id}/messages`, body);
    expect(r.status).toBe(422);
    expect(r.body.error?.code ?? r.body.code).toBe("beauty_claims");
    expect(JSON.stringify(r.body)).toContain("stops hair loss");
    const ok = await call(env, other.ownerToken, "POST", `/v1/merchants/${other.merchant.id}/messages`, body);
    expect(ok.status).not.toBe(422);
    const rw = await call(env, glow.ownerToken, "POST", `/v1/merchants/${glow.merchant.id}/rewards`, { name: "Free dandruff cure", pointsCost: 100, rewardType: "free_item" });
    expect(rw.status).toBe(422);
  });
});

describe("plans", () => {
  it("the new keys are paid features, not free forever", () => {
    for (const k of ["booking.walkin_queue", "staff.payouts"] as const) {
      expect(FEATURES[k].minPlan).toBe("plus");
      expect((FREE_FOREVER as readonly string[]).includes(k)).toBe(false);
    }
  });
});

void and;
void services;
void tokenFor;
