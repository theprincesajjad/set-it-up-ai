import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, catalogItems, cateringEvents, hallBookings, invoices, merchants, notifications } from "@ll/db";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";
import { paidMerchant, staffMember } from "./commerce-fixtures.js";

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

async function caterer(opts: { taxRegistered?: boolean | null; etransfer?: boolean } = {}) {
  const m = await paidMerchant(env, { plan: "free", connect: false });
  await env.db.update(merchants).set({ restaurantTier: "pro", ...(opts.taxRegistered !== undefined ? { taxRegistered: opts.taxRegistered, taxNumber: opts.taxRegistered ? "123456789RT0001" : null } : {}) }).where(eq(merchants.id, m.merchant.id));
  const base = `/v1/merchants/${m.merchant.id}`;
  if (opts.etransfer !== false) await api(m.ownerToken, "PUT", `${base}/payment-settings`, { etransferEnabled: true, etransferEmail: "events@zeenat.ca", instructions: "Auto-deposit is on." });
  return { ...m, base, slug: m.merchant.slug };
}
type C = Awaited<ReturnType<typeof caterer>>;

const inquiry = { name: "Ayesha Khan", phone: "(416) 555-0142", email: "ayesha@example.com", eventType: "walima", eventDate: "2026-12-12", startTime: "18:00", headcount: 100, service: "delivery" };
const menu = (extra: Record<string, unknown> = {}) => ({ items: [{ name: "Chicken biryani", pricing: "per_head", perHeadCents: 1000 }], extras: [], ...extra });

/** A quoted, approved event (deposit due). */
async function quoted(c: C, body: Record<string, unknown> = {}, payWith?: "card" | "etransfer") {
  const ev = (await api(null, "POST", `/v1/public/shops/${c.slug}/catering/inquiries`, inquiry)).body;
  const set = await api(c.ownerToken, "PUT", `${c.base}/catering/${ev.id}/menu`, menu(body));
  expect(set.status).toBe(200);
  await api(c.ownerToken, "POST", `${c.base}/catering/${ev.id}/send-quote`, { channels: ["sms"] });
  const [row] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, ev.id));
  const approved = await api(null, "POST", `/v1/public/catering/${row!.approvalToken}/approve`, { signatureName: "Ayesha Khan", ...(payWith ? { payWith } : {}) });
  return { id: ev.id as string, token: row!.approvalToken, approved, base: `${c.base}/catering/${ev.id}` };
}

describe("catering deposit recorded by hand", () => {
  it("shows e-transfer instructions with a reference code, records method, date and reference, confirms, and logs it", async () => {
    const c = await caterer({ taxRegistered: true });
    const q = await quoted(c, {}, "etransfer");
    // 100 x $10 = 100000 + 13% = 113000; 30% deposit = 33900.
    expect(q.approved.body.event).toMatchObject({ status: "quoted", depositCents: 33900, referenceCode: expect.stringMatching(/^AK-\d{4}$/) });
    expect(q.approved.body.deposit).toBeNull();
    expect(q.approved.body.manual).toEqual({ email: "events@zeenat.ca", amountCents: 33900, referenceCode: q.approved.body.event.referenceCode, instructions: "Auto-deposit is on." });
    const pub = await api(null, "GET", `/v1/public/catering/${q.token}`);
    expect(pub.body.manual).toMatchObject({ email: "events@zeenat.ca", amountCents: 33900 });
    expect(pub.body.event.tax.label).toContain("123456789RT0001");

    const paid = await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "etransfer", receivedOn: "2026-11-02", bankReference: "CA7Q1", note: "auto-deposit" });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ status: "confirmed", depositMethod: "etransfer", depositReceivedOn: "2026-11-02" });
    expect(paid.body.payments).toEqual([expect.objectContaining({ method: "etransfer", amountCents: 33900, receivedOn: "2026-11-02", bankReference: "CA7Q1", subjectType: "catering_deposit" })]);
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "payment.record"))).toHaveLength(1);
    // Confirmed and listed in the pipeline with the method.
    const list = await api(c.ownerToken, "GET", `${c.base}/catering`);
    expect(list.body.items[0]).toMatchObject({ depositMethod: "etransfer", status: "confirmed" });
    // Refund of a hand-recorded deposit is still refused.
    expect((await api(c.ownerToken, "POST", `${q.base}/cancel`, { refund: "full" })).status).toBe(409);
  });

  it("defaults (other, deposit amount, today), keeps the old call working, and rejects a future date", async () => {
    const c = await caterer();
    const q = await quoted(c);
    expect((await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "cash", receivedOn: "2026-11-09" })).status).toBe(400);
    const paid = await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, {});
    expect(paid.body).toMatchObject({ status: "confirmed", depositMethod: "other", depositReceivedOn: "2026-11-03" });
    expect(paid.body.payments[0]).toMatchObject({ amountCents: 33900, receivedOn: "2026-11-03" });
  });

  it("a part payment keeps the event quoted until the deposit is covered", async () => {
    const c = await caterer();
    const q = await quoted(c);
    const part = await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "etransfer", amountCents: 10000 });
    expect(part.body.status).toBe("quoted");
    const rest = await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "etransfer", amountCents: 23900 });
    expect(rest.body.status).toBe("confirmed");
    expect(rest.body.payments).toHaveLength(2);
  });

  it("only staff can record", async () => {
    const c = await caterer();
    const q = await quoted(c);
    expect((await api(null, "POST", `${q.base}/deposit/mark-paid`, { method: "cash" })).status).toBe(401);
  });

  it("records the balance and marks the open invoice paid", async () => {
    const c = await caterer();
    const q = await quoted(c);
    await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "etransfer" });
    const inv = await api(c.ownerToken, "POST", `${q.base}/invoice`, { send: true });
    expect(inv.status).toBe(201);
    expect(inv.body.invoice.amountDueCents).toBe(79100);
    const half = await api(c.ownerToken, "POST", `${q.base}/balance/record-payment`, { method: "cheque", amountCents: 30000, receivedOn: "2026-11-03" });
    expect(half.body.balanceCents).toBe(49100);
    const done = await api(c.ownerToken, "POST", `${q.base}/balance/record-payment`, { method: "etransfer", amountCents: 49100, receivedOn: "2026-11-03" });
    expect(done.body.balanceCents).toBe(0);
    expect(done.body.payments.filter((p: { subjectType: string }) => p.subjectType === "catering_balance")).toHaveLength(2);
    const again = await api(c.ownerToken, "POST", `${q.base}/balance/record-payment`, { method: "etransfer", amountCents: 100, receivedOn: "2026-11-03" });
    expect(again.status).toBe(409);
    const [inv0] = await env.db.select().from(invoices).where(eq(invoices.cateringEventId, q.id));
    expect(inv0!.status).toBe("paid");
  });
});

describe("void a payment recorded by hand (owner only, audited)", () => {
  it("voids a balance payment and reopens the balance, keeping the row as voided with the reason", async () => {
    const c = await caterer();
    const q = await quoted(c);
    await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "etransfer" });
    await api(c.ownerToken, "POST", `${q.base}/balance/record-payment`, { method: "cheque", amountCents: 30000, receivedOn: "2026-11-03" });
    const r = await api(c.ownerToken, "POST", `${q.base}/void-payment`, { reason: "Wrong event" });
    expect(r.status).toBe(200);
    expect(r.body.balanceCents).toBe(79100);
    expect(r.body.payments.find((p: { subjectType: string }) => p.subjectType === "catering_balance")).toMatchObject({ voidReason: "Wrong event", voidedAt: expect.any(String) });
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "payment.void"))).toEqual([expect.objectContaining({ entity: "catering_balance", entityId: q.id, actorUserId: c.owner.id, data: expect.objectContaining({ reason: "Wrong event", amountCents: 30000 }) })]);
    // Nothing left to undo on the balance; the deposit is next in line, and a reason is required.
    expect((await api(c.ownerToken, "POST", `${q.base}/void-payment`, {})).status).toBe(400);
  });

  it("voids a deposit while nothing is built on it: the event goes back to quoted. Later payments block it", async () => {
    const c = await caterer();
    const q = await quoted(c);
    await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "etransfer" });
    const back = await api(c.ownerToken, "POST", `${q.base}/void-payment`, { reason: "Not received" });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ status: "quoted", depositPaidAt: null, depositMethod: null });
    // Paid again, then a balance payment sits on top: the deposit can't be voided under it.
    await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "etransfer" });
    const bal = await api(c.ownerToken, "POST", `${q.base}/balance/record-payment`, { method: "cheque", amountCents: 1000, receivedOn: "2026-11-03" });
    expect(bal.status).toBe(200);
    const deposit = bal.body.payments.find((p: { subjectType: string; voidedAt: string | null }) => p.subjectType === "catering_deposit" && !p.voidedAt);
    expect((await api(c.ownerToken, "POST", `${q.base}/void-payment`, { reason: "x", paymentId: deposit.id })).status).toBe(409);
  });

  it("will not void the payment that settled a paid invoice, and nothing but the owner can void", async () => {
    const c = await caterer();
    const q = await quoted(c);
    await api(c.ownerToken, "POST", `${q.base}/deposit/mark-paid`, { method: "etransfer" });
    await api(c.ownerToken, "POST", `${q.base}/invoice`, { send: true });
    await api(c.ownerToken, "POST", `${q.base}/balance/record-payment`, { method: "etransfer", amountCents: 79100, receivedOn: "2026-11-03" });
    const settled = await api(c.ownerToken, "POST", `${q.base}/void-payment`, { reason: "Oops" });
    expect(settled.status).toBe(409);
    expect(settled.body.error.message).toContain("settled the balance invoice");
    const manager = await staffMember(env, c.merchant.id, "manager");
    expect((await api(manager.token, "POST", `${q.base}/void-payment`, { reason: "Oops" })).status).toBe(403);
    expect((await api(null, "POST", `${q.base}/void-payment`, { reason: "Oops" })).status).toBe(401);
  });
});

describe("tax and service charge on quotes", () => {
  it("unregistered merchants charge no tax; registered ones tax food and the service charge; unset still computes", async () => {
    const non = await caterer({ taxRegistered: false });
    const a = await quoted(non);
    expect(a.approved.body.event).toMatchObject({ subtotalCents: 100000, taxCents: 0, totalCents: 100000 });
    expect((await api(null, "GET", `/v1/public/catering/${a.token}`)).body.event.tax.label).toBe("No HST charged (small supplier)");

    const reg = await caterer({ taxRegistered: true });
    const b = await quoted(reg, { serviceChargeBps: 1000 });
    // 100000 + 10% service charge 10000 = 110000; HST 13% on 110000 = 14300.
    expect(b.approved.body.event).toMatchObject({ subtotalCents: 110000, taxCents: 14300, totalCents: 124300, serviceChargeBps: 1000, serviceChargeCents: 10000 });
    const [row] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, b.id));
    expect(row!.lineItems.map((l) => l.description)).toContain("Service charge 10% (tax applies)");

    // Changing headcount keeps the service charge.
    const reopened = await api(reg.ownerToken, "PATCH", `${reg.base}/catering/${(await quoted(reg, { serviceChargeBps: 1000 })).id}`, {});
    expect(reopened.status).toBe(409);

    const unset = await caterer();
    const c = await quoted(unset);
    expect(c.approved.body.event).toMatchObject({ taxCents: 13000 });
    expect((await api(null, "GET", `/v1/public/catering/${c.token}`)).body.event.tax.label).toContain("tax status not set");
  });
});

describe("pipeline: money tiles, quote opened, date clash", () => {
  it("summarises money, notes when a quote was first opened, and flags a clash with another confirmed event", async () => {
    const c = await caterer();
    const a = await quoted(c);
    const sum1 = (await api(c.ownerToken, "GET", `${c.base}/catering`)).body.summary;
    expect(sum1).toMatchObject({ openQuotesCents: 113000, depositsToCollectCents: 33900, bookedNext8wEvents: 0 });
    expect(sum1.weeks).toHaveLength(8);

    // Not opened until the customer loads the link; then stamped once.
    expect((await api(c.ownerToken, "GET", `${a.base}`)).body.quoteOpenedAt).toBeNull();
    await api(null, "GET", `/v1/public/catering/${a.token}`);
    const opened = (await api(c.ownerToken, "GET", `${a.base}`)).body.quoteOpenedAt;
    expect(opened).toBeTruthy();
    env.clock.now = new Date(env.clock.now.getTime() + 3600_000);
    c.ownerToken = await tokenFor(env, c.owner); // access tokens expire on the fake clock
    await api(null, "GET", `/v1/public/catering/${a.token}`);
    expect((await api(c.ownerToken, "GET", `${a.base}`)).body.quoteOpenedAt).toBe(opened);

    // Confirm A, then a second event the same day: the second sees a clash.
    await api(c.ownerToken, "POST", `${a.base}/deposit/mark-paid`, { method: "etransfer" });
    const b = await quoted(c);
    expect((await api(c.ownerToken, "GET", `${b.base}`)).body.dateClashes).toBe(1);
    const sum2 = (await api(c.ownerToken, "GET", `${c.base}/catering`)).body.summary;
    expect(sum2).toMatchObject({ bookedNext8wEvents: 1, bookedNext8wCents: 113000, depositsToCollectCents: 33900 });
    expect(sum2.weeks.reduce((s: number, w: { confirmed: number }) => s + w.confirmed, 0)).toBe(1);
    expect(await env.db.select().from(hallBookings)).toHaveLength(0);
    expect(await env.db.select().from(catalogItems)).toHaveLength(0);
    expect((await env.db.select().from(notifications).where(and(eq(notifications.type, "tiffin_update")))).length).toBe(0);
  });
});
