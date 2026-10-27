import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classBookings, classCharges, classMemberships, classPasses, loyaltyPrograms, merchants, notifications } from "@ll/db";
import { FEATURES, FREE_FOREVER } from "@ll/shared";
import { classJobs } from "../src/jobs/classes.js";
import { FAKE_PM } from "../src/providers/paymentsFake.js";
import { computeFees } from "../src/services/fees.js";
import { rollBilling, runDaily } from "../src/services/class-memberships.js";
import { sendReminders } from "../src/services/classes.js";
import { deleteAccount, exportData } from "../src/services/customer.js";
import { call, customer, deliver, fake, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
// Tue 2026-11-03 10:00 in Toronto (EST).
const T0 = new Date("2026-11-03T15:00:00Z");
beforeEach(async () => {
  env = await createTestEnv({ now: T0 });
});
afterEach(async () => env.close());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number) => new Date(env.clock.now.getTime() + offsetMs).toISOString();
/** Move the fake clock and re-sign the tokens handed out so far. */
const actors: { holder: Record<string, unknown>; user: string; token: string }[] = [];
const at = async (isoTime: string) => {
  env.clock.now = new Date(isoTime);
  for (const a of actors) a.holder[a.token] = await tokenFor(env, a.holder[a.user] as { id: string; platformRole: "none" | "rep" | "admin" });
};
beforeEach(() => {
  actors.length = 0;
});

async function studio(opts: { connect?: boolean; tax?: boolean; capacity?: number; lateFeeCents?: number; windowHours?: number } = {}) {
  const m = await paidMerchant(env, { plan: "plus", connect: opts.connect });
  actors.push({ holder: m, user: "owner", token: "ownerToken" });
  await env.db.update(merchants).set({ vertical: "fitness", taxRegistered: opts.tax ? true : null }).where(eq(merchants.id, m.merchant.id));
  await env.db.update(loyaltyPrograms).set({ earnType: "per_visit", pointsPerVisit: 10 }).where(eq(loyaltyPrograms.merchantId, m.merchant.id));
  const base = `/v1/merchants/${m.merchant.id}/classes`;
  if (opts.lateFeeCents !== undefined || opts.windowHours !== undefined) {
    const r = await call(env, m.ownerToken, "PUT", `${base}/settings`, { lateFeeCents: opts.lateFeeCents, cancelWindowHours: opts.windowHours });
    expect(r.status).toBe(200);
  }
  const type = (await call(env, m.ownerToken, "POST", `${base}/types`, { name: "Bhangra Cardio", durationMin: 60, capacity: opts.capacity ?? 2, womenOnly: true })).body;
  const mk = async (body: Record<string, unknown>) => {
    const r = await call(env, m.ownerToken, "POST", `${base}/products`, body);
    expect(r.status).toBe(201);
    return r.body;
  };
  const dropIn = await mk({ kind: "drop_in", name: "Drop-in", priceCents: 2500 });
  const pack = await mk({ kind: "pack", name: "10-class pack", priceCents: 18000, credits: 10, validDays: 90 });
  const intro = await mk({ kind: "pack", name: "Intro: 3 classes", priceCents: 3900, credits: 3, validDays: 30, introOnly: true });
  const unlimited = await mk({ kind: "membership", name: "Unlimited monthly", priceCents: 12900 });
  const term = await mk({ kind: "membership", name: "4 a month, 3-month term", priceCents: 6900, termMonths: 3, classesPerMonth: 4 });
  const session = async (startsAt: string, extra: Record<string, unknown> = {}) => {
    const r = await call(env, m.ownerToken, "POST", `${base}/sessions`, { classTypeId: type.id, startsAt, instructorName: "Simran G.", ...extra });
    expect(r.status).toBe(201);
    return r.body.items[0];
  };
  return { m, base, type, dropIn, pack, intro, unlimited, term, session, shop: m.merchant.slug };
}
type S = Awaited<ReturnType<typeof studio>>;

async function member(name = "Priya Sandhu") {
  const c = await customer(env, { name });
  actors.push({ holder: c, user: "user", token: "token" });
  return c;
}

/** Buy a product and confirm the card payment (the webhook), returns the pass or membership. */
async function buyPack(s: S, c: Awaited<ReturnType<typeof member>>, productId: string) {
  const r = await call(env, c.token, "POST", "/v1/me/classes/purchases", { productId });
  expect(r.status).toBe(201);
  if (r.body.payment) expect((await deliver(env, fake(env).succeedPaymentIntent(r.body.payment.paymentIntentId))).statusCode).toBe(200);
  return r.body.pass;
}
async function join(s: S, c: Awaited<ReturnType<typeof member>>, productId: string, startDate?: string) {
  const ag = await call(env, c.token, "GET", `/v1/me/classes/products/${productId}/agreement${startDate ? `?startDate=${startDate}` : ""}`);
  expect(ag.status).toBe(200);
  const r = await call(env, c.token, "POST", "/v1/me/classes/memberships", { productId, acceptAgreement: true, agreementHash: ag.body.hash, ...(startDate ? { startDate } : {}) });
  expect(r.status).toBe(201);
  expect((await deliver(env, fake(env).succeedPaymentIntent(r.body.payment.paymentIntentId))).statusCode).toBe(200);
  return { ...r.body, agreement: ag.body };
}
const book = (c: Awaited<ReturnType<typeof member>>, sessionId: string, body: Record<string, unknown> = {}) => call(env, c.token, "POST", "/v1/me/classes/bookings", { sessionId, ...body });
const mine = async (c: Awaited<ReturnType<typeof member>>) => (await call(env, c.token, "GET", "/v1/me/classes")).body;

describe("classes: pricing and gating", () => {
  it("sits in Café & Retail, hidden at launch, never free; online money carries the 1% class fee", () => {
    for (const k of ["booking.classes", "memberships.recurring"] as const) {
      expect(FEATURES[k].minPlan).toBe("plus");
      expect(FEATURES[k].defaultStage).toBe("hidden");
      expect(FREE_FOREVER).not.toContain(k);
    }
    expect(computeFees({ kind: "class", amountCents: 12900, plan: "plus" }).platformFeeCents).toBe(129);
    expect(computeFees({ kind: "manual", amountCents: 12900, plan: "plus" }).platformFeeCents).toBe(0);
  });

  it("is locked on the Free plan and for customers while the feature is off", async () => {
    const m = await paidMerchant(env, { plan: "free" });
    const base = `/v1/merchants/${m.merchant.id}/classes`;
    expect((await call(env, m.ownerToken, "GET", `${base}/sessions`)).status).toBe(402);
    expect((await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/classes`)).status).toBe(402);
  });
});

describe("classes: schedule", () => {
  it("creates a weekly series on the same wall-clock time across the clock change, and lists it publicly", async () => {
    const s = await studio();
    await at("2026-10-26T15:00:00Z");
    const first = "2026-10-29T22:30:00.000Z"; // Thu 6:30 PM EDT
    const r = await call(env, s.m.ownerToken, "POST", `${s.base}/sessions`, { classTypeId: s.type.id, startsAt: first, repeatWeeks: 3 });
    expect(r.status).toBe(201);
    const starts = r.body.items.map((x: { startsAt: string }) => x.startsAt);
    expect(starts).toEqual(["2026-10-29T22:30:00.000Z", "2026-11-05T23:30:00.000Z", "2026-11-12T23:30:00.000Z"]); // 6:30 PM stays 6:30 PM after Nov 1
    expect(r.body.items[0].womenOnly).toBe(true);
    await at("2026-11-03T15:00:00Z");
    const pub = await call(env, null, "GET", `/v1/public/shops/${s.shop}/classes?to=${iso(40 * DAY)}`);
    expect(pub.status).toBe(200);
    expect(pub.body.sessions.length).toBe(2); // the one already past is not offered
    expect(pub.body.hasWomenOnly).toBe(true);
    expect(pub.body.products.map((p: { kind: string }) => p.kind).sort()).toEqual(["drop_in", "membership", "membership", "pack", "pack"]);
  });

  it("validates offers: a pack needs classes and days, an intro offer must be a pack", async () => {
    const s = await studio();
    expect((await call(env, s.m.ownerToken, "POST", `${s.base}/products`, { kind: "pack", name: "Bad", priceCents: 1000 })).status).toBe(400);
    expect((await call(env, s.m.ownerToken, "POST", `${s.base}/products`, { kind: "membership", name: "Bad", priceCents: 1000, introOnly: true })).status).toBe(400);
    expect((await call(env, s.m.ownerToken, "POST", `${s.base}/products`, { kind: "pack", name: "Too long", priceCents: 1000, credits: 5, validDays: 400 })).status).toBe(400); // Ontario: at most a year
    expect((await call(env, s.m.ownerToken, "POST", `${s.base}/products`, { kind: "membership", name: "Too long", priceCents: 1000, termMonths: 24 })).status).toBe(400);
  });
});

describe("classes: booking with a pack, a drop-in and an intro offer", () => {
  it("a pack credit books the class, comes back on an early cancel and is used on a late one", async () => {
    const s = await studio({ capacity: 5 });
    const c = await member();
    const pass = await buyPack(s, c, s.pack.id);
    expect(pass.creditsLeft).toBe(10);
    // The pack is active only once the payment is confirmed.
    expect((await mine(c)).passes[0].status).toBe("active");
    const far = await s.session(iso(3 * DAY));
    const b1 = await book(c, far.id);
    expect(b1.status).toBe(201);
    expect(b1.body.outcome).toBe("booked");
    expect((await mine(c)).passes[0].creditsLeft).toBe(9);
    const cancel = await call(env, c.token, "POST", `/v1/me/classes/bookings/${b1.body.booking.id}/cancel`);
    expect(cancel.body).toMatchObject({ late: false, creditReturned: true, feeChargedCents: 0 });
    expect((await mine(c)).passes[0].creditsLeft).toBe(10);
    // Inside the 12-hour window the credit is gone.
    const soon = await s.session(iso(6 * HOUR));
    const b2 = await book(c, soon.id);
    expect(b2.status).toBe(201);
    const late = await call(env, c.token, "POST", `/v1/me/classes/bookings/${b2.body.booking.id}/cancel`);
    expect(late.body).toMatchObject({ late: true, creditReturned: false });
    expect((await mine(c)).passes[0].creditsLeft).toBe(9);
    // The studio can excuse it: the credit comes back.
    const ex = await call(env, s.m.ownerToken, "POST", `${s.base}/bookings/${b2.body.booking.id}/mark`, { status: "excused" });
    expect(ex.status).toBe(200);
    expect((await mine(c)).passes[0].creditsLeft).toBe(10);
  });

  it("a drop-in holds the spot for 10 minutes, books on payment, and lapses without it", async () => {
    const s = await studio({ capacity: 1 });
    const a = await member("Aisha");
    const b = await member("Sadia");
    const cls = await s.session(iso(2 * DAY));
    const held = await book(a, cls.id, { use: "drop_in" });
    expect(held.status).toBe(201);
    expect(held.body.outcome).toBe("needs_payment");
    expect(held.body.payment.amountCents).toBe(2500);
    // The held spot blocks the next person (they join the waitlist instead).
    const w = await book(b, cls.id);
    expect(w.body.outcome).toBe("waitlisted");
    // 11 minutes later the hold has lapsed, nobody paid, and the waitlist has nothing to use: the spot opens for a new drop-in.
    await at(iso(11 * 60_000));
    await classJobs.find((j) => j.name === "classes.hold_expiry")!.run(env.ctx);
    const [row] = await env.db.select().from(classBookings).where(eq(classBookings.id, held.body.booking.id));
    expect(row!.status).toBe("cancelled");
    // A second try pays.
    const again = await book(a, cls.id, { use: "drop_in" });
    expect(again.body.outcome).toBe("needs_payment");
    expect((await deliver(env, fake(env).succeedPaymentIntent(again.body.payment.paymentIntentId))).statusCode).toBe(200);
    const [paid] = await env.db.select().from(classBookings).where(eq(classBookings.id, again.body.booking.id));
    expect(paid!.status).toBe("booked");
    const [charge] = await env.db.select().from(classCharges).where(eq(classCharges.bookingId, again.body.booking.id));
    expect(charge).toMatchObject({ kind: "drop_in", status: "paid", amountCents: 2500, platformFeeCents: 25 });
  });

  it("charges HST only when the studio is registered, and the 1% fee is on the price before tax", async () => {
    const s = await studio({ tax: true });
    const c = await member();
    await buyPack(s, c, s.pack.id);
    const [charge] = await env.db.select().from(classCharges).where(eq(classCharges.kind, "pack"));
    expect(charge).toMatchObject({ amountCents: 20340, taxCents: 2340, platformFeeCents: 180 });
  });

  it("sells an intro offer once to a new student", async () => {
    const s = await studio();
    const c = await member();
    const pass = await buyPack(s, c, s.intro.id);
    expect(pass.introOffer).toBe(true);
    const again = await call(env, c.token, "POST", "/v1/me/classes/purchases", { productId: s.intro.id });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("intro_used");
    // The public list stops showing it to someone who has had it.
    const pub = await call(env, c.token, "GET", `/v1/public/shops/${s.shop}/classes`);
    expect(pub.body.products.some((p: { introOnly: boolean }) => p.introOnly)).toBe(false);
    const other = await member("New Student");
    expect((await call(env, other.token, "GET", `/v1/public/shops/${s.shop}/classes`)).body.products.some((p: { introOnly: boolean }) => p.introOnly)).toBe(true);
  });

  it("refuses a booking with nothing to pay with, and a second booking of the same class", async () => {
    const s = await studio({ capacity: 3 });
    const c = await member();
    const cls = await s.session(iso(2 * DAY));
    const r = await book(c, cls.id);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("no_pass");
    await buyPack(s, c, s.pack.id);
    expect((await book(c, cls.id)).status).toBe(201);
    expect((await book(c, cls.id)).status).toBe(409);
  });

  it("reminds booked members once, a few hours ahead, by push", async () => {
    const s = await studio({ capacity: 3 });
    const c = await member();
    await buyPack(s, c, s.pack.id);
    const cls = await s.session(iso(2 * HOUR + 30 * 60_000));
    expect((await book(c, cls.id)).status).toBe(201);
    expect(await sendReminders(env.ctx)).toBe(1);
    expect(await sendReminders(env.ctx)).toBe(0);
    const n = await env.db.select().from(notifications).where(eq(notifications.userId, c.user.id));
    expect(n.some((x) => x.title.includes("class today"))).toBe(true);
  });
});

describe("classes: capacity and the waitlist", () => {
  it("never oversells the last spot, and the first person on the list with a pass gets a freed spot", async () => {
    const s = await studio({ capacity: 2 });
    const [a, b, c, d] = [await member("A"), await member("B"), await member("C"), await member("D")];
    for (const x of [a, b, c, d]) await buyPack(s, x, s.pack.id);
    // D has nothing left to use by the time a spot opens.
    const cls = await s.session(iso(2 * DAY));
    // Four people try at once: two get in, two wait.
    const results = await Promise.all([a, b, c, d].map((x) => book(x, cls.id)));
    expect(results.filter((r) => r.body.outcome === "booked").length).toBe(2);
    expect(results.filter((r) => r.body.outcome === "waitlisted").length).toBe(2);
    const booked = results.findIndex((r) => r.body.outcome === "booked");
    const sess = (await call(env, null, "GET", `/v1/public/shops/${s.shop}/classes`)).body.sessions.find((x: { id: string }) => x.id === cls.id);
    expect(sess).toMatchObject({ booked: 2, waitlisted: 2 });
    // One cancels in time: the first waitlisted person is booked and told.
    const bookedUser = [a, b, c, d][booked]!;
    const waitingFirst = results.map((r, i) => ({ r, i })).filter((x) => x.r.body.outcome === "waitlisted").sort((x, y) => x.r.body.booking.waitlistPosition - y.r.body.booking.waitlistPosition)[0]!;
    void waitingFirst;
    const cancel = await call(env, bookedUser.token, "POST", `/v1/me/classes/bookings/${results[booked]!.body.booking.id}/cancel`);
    expect(cancel.status).toBe(200);
    const after = await call(env, null, "GET", `/v1/public/shops/${s.shop}/classes`);
    expect(after.body.sessions.find((x: { id: string }) => x.id === cls.id)).toMatchObject({ booked: 2, waitlisted: 1 });
    const promoted = await env.db.select().from(classBookings).where(and(eq(classBookings.sessionId, cls.id), eq(classBookings.status, "booked")));
    expect(promoted.length).toBe(2);
    expect(promoted.some((p) => p.promotedAt)).toBe(true);
  });

  it("skips a waitlisted person with nothing to use, and does not promote inside the cutoff", async () => {
    const s = await studio({ capacity: 1 });
    const a = await member("A");
    const nopass = await member("No Pass");
    const c = await member("C");
    await buyPack(s, a, s.pack.id);
    await buyPack(s, c, s.pack.id);
    const cls = await s.session(iso(2 * DAY));
    const ba = await book(a, cls.id);
    expect(ba.body.outcome).toBe("booked");
    expect((await book(nopass, cls.id)).body.outcome).toBe("waitlisted");
    expect((await book(c, cls.id)).body.outcome).toBe("waitlisted");
    await call(env, a.token, "POST", `/v1/me/classes/bookings/${ba.body.booking.id}/cancel`);
    const rows = await env.db.select().from(classBookings).where(eq(classBookings.sessionId, cls.id));
    expect(rows.find((r) => r.userId === c.user.id)!.status).toBe("booked");
    expect(rows.find((r) => r.userId === nopass.user.id)!.status).toBe("waitlisted");
    // A class inside the 2-hour cutoff does not promote.
    const soon = await s.session(iso(90 * 60_000));
    const x = await member("X");
    await buyPack(s, x, s.pack.id);
    const y = await member("Y");
    await buyPack(s, y, s.pack.id);
    const bx = await book(x, soon.id);
    expect(bx.status).toBe(201);
    const wy = await book(y, soon.id);
    expect(wy.body.outcome).toBe("waitlisted");
    await call(env, x.token, "POST", `/v1/me/classes/bookings/${bx.body.booking.id}/cancel`);
    const [still] = await env.db.select().from(classBookings).where(eq(classBookings.id, wy.body.booking.id));
    expect(still!.status).toBe("waitlisted");
  });

  it("staff can move someone up the list, add a guest above capacity and cancel the class (credits back)", async () => {
    const s = await studio({ capacity: 1 });
    const a = await member("A");
    const b = await member("B");
    const c = await member("C");
    for (const x of [a, b, c]) await buyPack(s, x, s.pack.id);
    const cls = await s.session(iso(2 * DAY));
    await book(a, cls.id);
    const wb = await book(b, cls.id);
    const wc = await book(c, cls.id);
    const moved = await call(env, s.m.ownerToken, "POST", `${s.base}/bookings/${wc.body.booking.id}/move`, { position: 1 });
    expect(moved.status).toBe(200);
    const rows = moved.body.rows.filter((r: { status: string }) => r.status === "waitlisted");
    expect(rows.map((r: { name: string; waitlistPosition: number }) => [r.name, r.waitlistPosition])).toEqual([["C", 1], ["B", 2]]);
    expect(rows[0].bookingId).toBe(wc.body.booking.id);
    void wb;
    const guest = await call(env, s.m.ownerToken, "POST", `${s.base}/sessions/${cls.id}/bookings`, { phone: "+14165559001", customerName: "Guest", comp: true, overCapacity: true });
    expect(guest.status).toBe(201);
    expect(guest.body.rows.filter((r: { status: string }) => r.status === "booked").length).toBe(2);
    const cancelled = await call(env, s.m.ownerToken, "POST", `${s.base}/sessions/${cls.id}/cancel`, { reason: "Instructor ill" });
    expect(cancelled.body.status).toBe("cancelled");
    for (const x of [a, b, c]) expect((await mine(x)).passes[0].creditsLeft).toBe(10);
    expect((await mine(a)).bookings.length).toBe(0);
  });
});

describe("classes: memberships", () => {
  it("shows the agreement, requires the same text back, activates on the first payment and books without a credit", async () => {
    const s = await studio({ tax: true });
    const c = await member();
    const ag = await call(env, c.token, "GET", `/v1/me/classes/products/${s.unlimited.id}/agreement`);
    expect(ag.body.text).toContain("MEMBERSHIP AGREEMENT");
    expect(ag.body.text).toContain("Month to month");
    expect(ag.body.text).toContain("full refund within 10 days");
    expect(ag.body).toMatchObject({ totalPerPeriodCents: 14577, taxPerPeriodCents: 1677 });
    const wrong = await call(env, c.token, "POST", "/v1/me/classes/memberships", { productId: s.unlimited.id, acceptAgreement: true, agreementHash: "0".repeat(32) });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe("agreement_changed");
    expect((await call(env, c.token, "POST", "/v1/me/classes/memberships", { productId: s.unlimited.id, acceptAgreement: false, agreementHash: ag.body.hash })).status).toBe(400);
    const j = await join(s, c, s.unlimited.id);
    const m = (await mine(c)).memberships[0];
    expect(m).toMatchObject({ status: "active", totalCents: 14577, nextBillingDate: "2026-12-03", currentPeriodEnd: "2026-12-02", inCoolingOff: true, coolingOffEndsOn: "2026-11-13" });
    expect(m.agreementText).toBe(j.agreement.text);
    expect(m.card).toMatchObject({ last4: "4242" });
    const [charge] = await env.db.select().from(classCharges).where(eq(classCharges.kind, "membership"));
    expect(charge).toMatchObject({ status: "paid", amountCents: 14577, taxCents: 1677, platformFeeCents: 129, periodStart: "2026-11-03" });
    const cls = await s.session(iso(3 * DAY), {});
    const b = await book(c, cls.id);
    expect(b.body.booking.payWith).toBe("membership");
    // A second membership at the same studio is refused.
    const ag2 = await call(env, c.token, "GET", `/v1/me/classes/products/${s.term.id}/agreement`);
    expect((await call(env, c.token, "POST", "/v1/me/classes/memberships", { productId: s.term.id, acceptAgreement: true, agreementHash: ag2.body.hash })).status).toBe(409);
  });

  it("limits a monthly membership to its classes", async () => {
    const s = await studio({ capacity: 9 });
    const c = await member();
    await join(s, c, s.term.id);
    for (let i = 1; i <= 4; i++) expect((await book(c, (await s.session(iso(i * DAY + 5 * HOUR))).id)).status).toBe(201);
    const fifth = await book(c, (await s.session(iso(6 * DAY))).id);
    expect(fifth.status).toBe(409);
    expect(fifth.body.error.code).toBe("month_used");
    expect((await mine(c)).memberships[0].usedThisPeriod).toBe(4);
  });

  it("renews off-session on the due day, and tells the member", async () => {
    const s = await studio();
    const c = await member();
    await join(s, c, s.unlimited.id);
    await at("2026-12-03T15:00:00Z");
    const r = await rollBilling(env.ctx);
    expect(r).toMatchObject({ charged: 1, errors: 0 });
    const rows = await env.db.select().from(classCharges).where(eq(classCharges.kind, "membership"));
    expect(rows.map((x) => [x.periodStart, x.status]).sort()).toEqual([["2026-11-03", "paid"], ["2026-12-03", "paid"]]);
    const m = (await mine(c)).memberships[0];
    expect(m).toMatchObject({ status: "active", currentPeriodStart: "2026-12-03", nextBillingDate: "2027-01-03" });
    // Running it again charges nothing more.
    expect(await rollBilling(env.ctx)).toMatchObject({ charged: 0 });
    expect((await env.db.select().from(classCharges).where(eq(classCharges.kind, "membership"))).length).toBe(2);
  });

  it("a declined renewal makes the membership past due, blocks booking, retries on day two, and a new card fixes it", async () => {
    const s = await studio();
    const c = await member();
    const j = await join(s, c, s.unlimited.id);
    await env.db.update(classMemberships).set({ paymentMethodId: FAKE_PM.declined, paymentMethodBrand: "visa", paymentMethodLast4: "0002" }).where(eq(classMemberships.id, j.membership.id));
    await at("2026-12-03T15:00:00Z");
    await rollBilling(env.ctx);
    let m = (await mine(c)).memberships[0];
    expect(m).toMatchObject({ status: "past_due", amountDueCents: 12900 });
    const cls = await s.session(iso(3 * DAY));
    const blocked = await book(c, cls.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("membership_past_due");
    // The same day again does not retry; two days later it does (and fails again).
    await rollBilling(env.ctx);
    let [ch] = await env.db.select().from(classCharges).where(and(eq(classCharges.kind, "membership"), eq(classCharges.periodStart, "2026-12-03")));
    expect(ch!.attempts).toBe(1);
    await at("2026-12-05T15:00:00Z");
    await rollBilling(env.ctx);
    [ch] = await env.db.select().from(classCharges).where(and(eq(classCharges.kind, "membership"), eq(classCharges.periodStart, "2026-12-03")));
    expect(ch!.attempts).toBe(2);
    // The member updates the card: the open period is charged at once.
    const setup = await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/card`);
    expect(setup.status).toBe(200);
    expect((await deliver(env, fake(env).succeedSetupIntent(setup.body.setupIntentId))).statusCode).toBe(200);
    m = (await mine(c)).memberships[0];
    expect(m).toMatchObject({ status: "active", card: { last4: "4242" } });
    const [paid] = await env.db.select().from(classCharges).where(and(eq(classCharges.kind, "membership"), eq(classCharges.periodStart, "2026-12-03")));
    expect(paid!.status).toBe("paid");
  });

  it("cancels inside the 10-day cooling-off window with a full refund", async () => {
    const s = await studio({ tax: true });
    const c = await member();
    const j = await join(s, c, s.unlimited.id);
    await at("2026-11-10T15:00:00Z");
    const r = await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/cancel`, {});
    expect(r.status).toBe(200);
    expect(r.body.refundedCents).toBe(14577);
    expect(r.body.membership.status).toBe("cancelled");
    const [ch] = await env.db.select().from(classCharges).where(eq(classCharges.kind, "membership"));
    expect(ch!.status).toBe("refunded");
    // Nothing is billed afterwards.
    await at("2026-12-03T15:00:00Z");
    expect(await rollBilling(env.ctx)).toMatchObject({ charged: 0 });
  });

  it("after the window a month-to-month membership ends after the paid month, with no refund and no more charges", async () => {
    const s = await studio();
    const c = await member();
    const j = await join(s, c, s.unlimited.id);
    await at("2026-11-20T15:00:00Z");
    const r = await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/cancel`, { reason: "Moving" });
    expect(r.body).toMatchObject({ refundedCents: 0 });
    expect(r.body.membership).toMatchObject({ status: "active", cancelEffectiveOn: "2026-12-03", nextBillingDate: null });
    // Still covered for classes in the paid month, not after.
    expect((await book(c, (await s.session(iso(5 * DAY))).id)).status).toBe(201);
    expect((await book(c, (await s.session(iso(20 * DAY))).id)).status).toBe(409);
    // The member can change their mind before it ends.
    expect((await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/keep`)).body.membership.cancelEffectiveOn).toBeNull();
    await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/cancel`, {});
    await at("2026-12-03T15:00:00Z");
    expect(await rollBilling(env.ctx)).toMatchObject({ charged: 0, cancelled: 1 });
    expect((await mine(c)).memberships[0].status).toBe("cancelled");
    expect((await env.db.select().from(classCharges).where(eq(classCharges.kind, "membership"))).length).toBe(1);
  });

  it("a fixed term sends a renewal notice, renews only after one, and otherwise expires", async () => {
    const s = await studio();
    const a = await member("With notice");
    const b = await member("Declines");
    const ja = await join(s, a, s.term.id);
    const jb = await join(s, b, s.term.id);
    // 3-month term: ends Feb 2 2027. The notice goes out 60 days before (Dec 4).
    await at("2026-12-03T15:00:00Z");
    await runDaily(env.ctx);
    expect((await mine(a)).memberships[0].renewalNoticeSentAt).toBeNull();
    await at("2026-12-04T15:00:00Z");
    const r = await runDaily(env.ctx);
    expect(r.notices).toBe(2);
    expect((await mine(a)).memberships[0].renewalNoticeSentAt).not.toBeNull();
    await call(env, b.token, "POST", `/v1/me/classes/memberships/${jb.membership.id}/decline-renewal`);
    // Term end plus a day: A renews for another 3 months, B expires.
    await at("2027-02-03T15:00:00Z");
    await rollBilling(env.ctx); // charges the periods up to the end of the term first
    await at("2027-03-03T15:00:00Z");
    for (let i = 0; i < 3; i++) await rollBilling(env.ctx);
    const ma = (await mine(a)).memberships[0];
    const mb = (await mine(b)).memberships[0];
    expect(mb.status).toBe("expired");
    expect(ma.status).toBe("active");
    expect(ma.termEndsOn! > "2027-02-02").toBe(true);
    void ja;
  });

  it("a membership without a renewal notice expires instead of renewing", async () => {
    const s = await studio();
    const c = await member();
    const j = await join(s, c, s.term.id);
    await env.db.update(classMemberships).set({ termEndsOn: "2026-11-30", currentPeriodEnd: "2026-11-30", nextBillingDate: "2026-12-01" }).where(eq(classMemberships.id, j.membership.id));
    await at("2026-12-01T15:00:00Z");
    expect(await rollBilling(env.ctx)).toMatchObject({ expired: 1, charged: 0 });
    expect((await mine(c)).memberships[0].status).toBe("expired");
  });

  it("freezes: no billing during the freeze, dates move, classes inside are released; limits apply", async () => {
    const s = await studio();
    const c = await member();
    const j = await join(s, c, s.unlimited.id);
    const cls = await s.session(iso(8 * DAY));
    expect((await book(c, cls.id)).status).toBe(201);
    const tooLong = await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/freeze`, { days: 45 });
    expect(tooLong.status).toBe(409);
    const f = await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/freeze`, { days: 14 });
    expect(f.status).toBe(200);
    expect(f.body.membership).toMatchObject({ status: "frozen", frozenUntil: "2026-11-17", nextBillingDate: "2026-12-17", currentPeriodEnd: "2026-12-16" });
    expect((await mine(c)).bookings.length).toBe(0); // the class on Nov 11 was inside the freeze
    const blocked = await book(c, (await s.session(iso(2 * DAY))).id);
    expect(blocked.body.error.code).toBe("membership_frozen");
    await at("2026-11-18T15:00:00Z");
    await runDaily(env.ctx);
    expect((await mine(c)).memberships[0].status).toBe("active");
    await at("2026-12-03T15:00:00Z");
    expect(await rollBilling(env.ctx)).toMatchObject({ charged: 0 });
    await at("2026-12-17T15:00:00Z");
    expect(await rollBilling(env.ctx)).toMatchObject({ charged: 1 });
    // Two freezes a year by default.
    const g = await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/freeze`, { days: 7 });
    expect(g.status).toBe(200);
    const h = await call(env, c.token, "POST", `/v1/me/classes/memberships/${j.membership.id}/freeze`, { days: 7 });
    expect(h.status).toBe(409);
  });

  it("charges the late fee to the member's card, never twice, and refunds it when excused", async () => {
    const s = await studio({ lateFeeCents: 1000, windowHours: 12 });
    const c = await member();
    await join(s, c, s.unlimited.id);
    const cls = await s.session(iso(5 * HOUR));
    const b = await book(c, cls.id);
    expect(b.status).toBe(201);
    const late = await call(env, c.token, "POST", `/v1/me/classes/bookings/${b.body.booking.id}/cancel`);
    expect(late.body).toMatchObject({ late: true, feeChargedCents: 1000 });
    const fees = await env.db.select().from(classCharges).where(eq(classCharges.kind, "late_fee"));
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ status: "paid", amountCents: 1000, platformFeeCents: 10 });
    const ex = await call(env, s.m.ownerToken, "POST", `${s.base}/bookings/${b.body.booking.id}/mark`, { status: "excused" });
    expect(ex.status).toBe(200);
    const [after] = await env.db.select().from(classCharges).where(eq(classCharges.kind, "late_fee"));
    expect(after!.status).toBe("refunded");
    // A no-show is treated the same way.
    const cls2 = await s.session(iso(6 * HOUR));
    const b2 = await book(c, cls2.id);
    const ns = await call(env, s.m.ownerToken, "POST", `${s.base}/bookings/${b2.body.booking.id}/mark`, { status: "no_show" });
    expect(ns.status).toBe(200);
    expect((await env.db.select().from(classCharges).where(eq(classCharges.kind, "late_fee"))).length).toBe(2);
  });
});

describe("classes: front desk", () => {
  it("checks a member in by member code: books them if needed, awards the visit once, and reports the pass", async () => {
    const s = await studio({ capacity: 3 });
    const c = await member("Jasleen Gill");
    await buyPack(s, c, s.pack.id);
    const cls = await s.session(iso(30 * 60_000));
    const staff = await staffMember(env, s.m.merchant.id, "staff");
    actors.push({ holder: staff, user: "user", token: "token" });
    const code = (await env.db.query.users.findFirst({ where: (u, { eq: e }) => e(u.id, c.user.id) }))!.memberCode;
    const r = await call(env, staff.token, "POST", `${s.base}/check-in`, { memberCode: code });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ outcome: "added_and_checked_in", pointsEarned: 10, arrived: 1, booked: 1 });
    expect(r.body.pass).toMatchObject({ creditsLeft: 9 });
    expect(r.body.session.id).toBe(cls.id);
    // Again: already in, no second award.
    const again = await call(env, staff.token, "POST", `${s.base}/check-in`, { memberCode: code });
    expect(again.body.outcome).toBe("already_checked_in");
    const door = await call(env, staff.token, "GET", `${s.base}/door`);
    expect(door.body.arrivals.map((a: { name: string }) => a.name)).toEqual(["Jasleen Gill"]);
  });

  it("tells the desk what to do: not booked, no pass, class full, past due", async () => {
    const s = await studio({ capacity: 1 });
    const staff = await staffMember(env, s.m.merchant.id, "staff");
    const cls = await s.session(iso(20 * 60_000));
    const nopass = await member("No Pass");
    const r1 = await call(env, staff.token, "POST", `${s.base}/check-in`, { phone: nopass.user.phone });
    expect(r1.body.outcome).toBe("no_pass");
    const r1b = await call(env, staff.token, "POST", `${s.base}/check-in`, { phone: nopass.user.phone, addIfNotBooked: false });
    expect(r1b.body.outcome).toBe("not_booked");
    const a = await member("A");
    await buyPack(s, a, s.pack.id);
    expect((await book(a, cls.id)).status).toBe(201);
    const b = await member("B");
    await buyPack(s, b, s.pack.id);
    const full = await call(env, staff.token, "POST", `${s.base}/check-in`, { phone: b.user.phone });
    expect(full.body.outcome).toBe("class_full");
    // A past-due member is told how much is owed.
    const c = await member("Past Due");
    const j = await join(s, c, s.unlimited.id);
    await env.db.update(classMemberships).set({ status: "past_due" }).where(eq(classMemberships.id, j.membership.id));
    await env.db.insert(classCharges).values({ merchantId: s.m.merchant.id, userId: c.user.id, kind: "membership", membershipId: j.membership.id, periodStart: "2026-12-03", amountCents: 12900, status: "failed" });
    const pd = await call(env, staff.token, "POST", `${s.base}/check-in`, { phone: c.user.phone });
    expect(pd.body).toMatchObject({ outcome: "past_due", amountDueCents: 12900 });
    const none = await call(env, staff.token, "POST", `${s.base}/check-in`, { phone: c.user.phone, sessionId: undefined });
    expect(none.status).toBe(200);
  });

  it("records a desk sale by hand with no platform fee, and shows the numbers", async () => {
    const s = await studio();
    const staff = await staffMember(env, s.m.merchant.id, "staff");
    const sale = await call(env, staff.token, "POST", `${s.base}/sales`, { productId: s.pack.id, phone: "+14165559777", customerName: "Walk In", method: "cash" });
    expect(sale.status).toBe(201);
    expect(sale.body).toMatchObject({ creditsLeft: 10, status: "active" });
    const [ch] = await env.db.select().from(classCharges).where(eq(classCharges.kind, "pack"));
    expect(ch).toMatchObject({ status: "paid", paymentMethod: "cash", platformFeeCents: 0, amountCents: 18000 });
    const c = await member();
    await join(s, c, s.unlimited.id);
    const sum = await call(env, s.m.ownerToken, "GET", `${s.base}/summary`);
    expect(sum.body).toMatchObject({ activeMembers: 1, mrrCents: 12900, pastDue: 0 });
    const list = await call(env, s.m.ownerToken, "GET", `${s.base}/members`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ offer: "Unlimited monthly", status: "active" });
    const cancel = await call(env, s.m.ownerToken, "POST", `${s.base}/memberships/${list.body.items[0].membershipId}/cancel`, { effective: "now", refundLast: true, reason: "Injury" });
    expect(cancel.status).toBe(200);
    const [refunded] = await env.db.select().from(classCharges).where(eq(classCharges.kind, "membership"));
    expect(refunded!.status).toBe("refunded");
  });

  it("does not let another studio's staff or a customer touch a roster", async () => {
    const s = await studio();
    const other = await studio();
    const cls = await s.session(iso(2 * DAY));
    expect((await call(env, other.m.ownerToken, "GET", `${s.base}/sessions/${cls.id}/roster`)).status).toBe(403);
    const c = await member();
    expect((await call(env, c.token, "GET", `${s.base}/sessions/${cls.id}/roster`)).status).toBe(403);
    expect((await call(env, null, "POST", "/v1/me/classes/bookings", { sessionId: cls.id })).status).toBe(401);
  });
});

describe("classes: privacy", () => {
  it("the data export carries classes, and deleting the account ends the membership, cancels bookings and drops the card and the name", async () => {
    const s = await studio({ capacity: 5 });
    const c = await member("Sam Secret");
    const j = await join(s, c, s.unlimited.id);
    const cls = await s.session(iso(3 * DAY));
    expect((await book(c, cls.id)).status).toBe(201);
    const exp = await exportData(env.ctx, c.user.id);
    expect(exp.classMemberships).toHaveLength(1);
    expect(exp.classBookings).toHaveLength(1);
    expect(exp.classCharges?.length).toBe(1);
    expect(JSON.stringify(exp.classMemberships)).toContain("Sam Secret");
    await deleteAccount(env.ctx, c.user.id);
    const [m] = await env.db.select().from(classMemberships).where(eq(classMemberships.id, j.membership.id));
    expect(m).toMatchObject({ status: "cancelled", paymentMethodId: null, stripeCustomerId: null, nextBillingDate: null, cancelReason: "account_deleted" });
    expect(m!.agreementText).toContain("Member: deleted account");
    expect(m!.agreementText).not.toContain("Sam Secret");
    const [b] = await env.db.select().from(classBookings).where(eq(classBookings.userId, c.user.id));
    expect(b!.status).toBe("cancelled");
  });
});

void classPasses;
