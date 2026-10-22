import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogItems, cateringEvents, invoices, merchants } from "@ll/db";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { customer, deliver, fake, paidMerchant, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

async function api(token: string | null, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}) {
  const res = await env.app.inject({ method, url, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.statusCode, body: (res.body ? JSON.parse(res.body) : null) as any };
}

async function restaurant(tier: "starter" | "growth" | "pro" | null = "growth", opts: { connect?: boolean } = {}) {
  const m = await paidMerchant(env, { plan: "free", connect: opts.connect });
  await env.db.update(merchants).set({ restaurantTier: tier }).where(eq(merchants.id, m.merchant.id));
  const [merchant] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
  return { ...m, merchant: merchant!, base: `/v1/merchants/${m.merchant.id}` };
}

const inquiry = {
  name: "Ayesha Khan",
  phone: "(416) 555-0142",
  email: "ayesha@example.com",
  eventType: "walima",
  eventDate: "2026-12-12",
  startTime: "18:00",
  headcount: 100,
  service: "delivery",
  venueName: "Masjid Hall",
  dietaryNotes: "Zabihah only. 6 guests vegetarian.",
};

async function seedMenu(merchantId: string) {
  const [biryani] = await env.db.insert(catalogItems).values({ merchantId, name: "Chicken biryani (degh)", priceCents: 12000, serves: 20 }).returning();
  const [haleem] = await env.db.insert(catalogItems).values({ merchantId, name: "Haleem tray", priceCents: 9000, serves: 25 }).returning();
  return { biryani: biryani!, haleem: haleem! };
}

// 100 guests: biryani 12000/20 = 600 per head, mithai 150 per head, haleem ceil(100/25) = 4 trays.
// subtotal 60000 + 15000 + 36000 + 20000 (staff) = 131000; HST 13% = 17030; total 148030; 30% deposit = 44409.
const menuBody = (items: { biryani: { id: string }; haleem: { id: string } }) => ({
  items: [
    { catalogItemId: items.biryani.id, pricing: "per_head" },
    { name: "Mithai box", pricing: "per_head", perHeadCents: 150 },
    { catalogItemId: items.haleem.id, pricing: "tray" },
  ],
  extras: [{ description: "Service staff (2)", quantity: 1, unitPriceCents: 20000 }],
});

describe("catering gating", () => {
  it("needs the Growth restaurant tier (staff and public inquiry)", async () => {
    const none = await restaurant(null);
    expect((await api(none.ownerToken, "GET", `${none.base}/catering`)).status).toBe(402);
    expect((await api(null, "POST", `/v1/public/shops/${none.merchant.slug}/catering/inquiries`, inquiry)).status).toBe(402);
    const starter = await restaurant("starter");
    expect((await api(starter.ownerToken, "GET", `${starter.base}/catering`)).status).toBe(402);
    const growth = await restaurant("growth");
    expect((await api(growth.ownerToken, "GET", `${growth.base}/catering`)).status).toBe(200);
    expect((await api(null, "POST", `/v1/public/shops/${growth.merchant.slug}/catering/inquiries`, inquiry)).status).toBe(201);
  });
});

describe("numbering and inquiries", () => {
  it("numbers events per merchant, from 1", async () => {
    const a = await restaurant("growth");
    const b = await restaurant("growth");
    const post = (m: typeof a) => api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, inquiry);
    expect((await post(a)).body.number).toBe(1);
    expect((await post(a)).body.number).toBe(2);
    const third = await api(a.ownerToken, "POST", `${a.base}/catering`, inquiry);
    expect(third.body.number).toBe(3);
    expect((await post(b)).body.number).toBe(1);
  });

  it("signed-in customers can inquire and see only their own events; past dates are refused", async () => {
    const m = await restaurant("growth");
    const c = await customer(env);
    const other = await customer(env);
    const { name: _n, phone: _p, email: _e, ...body } = inquiry;
    const r = await api(c.token, "POST", "/v1/me/catering", { ...body, merchantId: m.merchant.id });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ number: 1, status: "inquiry", eventType: "walima", headcount: 100, depositBps: 3000, approvalUrl: null });
    expect((await api(c.token, "GET", "/v1/me/catering")).body.items).toHaveLength(1);
    expect((await api(other.token, "GET", "/v1/me/catering")).body.items).toHaveLength(0);
    expect((await api(other.token, "GET", `/v1/me/catering/${r.body.id}`)).status).toBe(404);
    expect((await api(c.token, "POST", "/v1/me/catering", { ...body, merchantId: m.merchant.id, eventDate: "2026-11-01" })).status).toBe(400);
    expect((await api(c.token, "POST", "/v1/me/catering", { ...body, merchantId: m.merchant.id, eventType: "bbq" })).status).toBe(400);
  });

  it("pipeline lists by status and date with counts", async () => {
    const m = await restaurant("growth");
    const mk = (eventDate: string) => api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, { ...inquiry, eventDate });
    await mk("2026-12-20");
    const second = await mk("2026-12-05");
    await api(m.ownerToken, "POST", `${m.base}/catering/${second.body.id}/tasting`, { tastingAt: "2026-11-10T20:00:00Z" });
    const all = await api(m.ownerToken, "GET", `${m.base}/catering`);
    expect(all.body.items.map((e: { eventDate: string }) => e.eventDate)).toEqual(["2026-12-05", "2026-12-20"]);
    expect(all.body.counts).toEqual({ inquiry: 1, tasting: 1 });
    expect(all.body.items[0].customer).toMatchObject({ name: "Ayesha Khan", phone: "+14165550142" });
    const tasting = await api(m.ownerToken, "GET", `${m.base}/catering?status=tasting`);
    expect(tasting.body.items).toHaveLength(1);
    expect((await api(m.ownerToken, "GET", `${m.base}/catering?from=2026-12-10&to=2026-12-31`)).body.items).toHaveLength(1);
  });
});

describe("menu totals and deposit", () => {
  it("per-head + tray lines, tax, and the default 30% deposit", async () => {
    const m = await restaurant("growth");
    const items = await seedMenu(m.merchant.id);
    const ev = (await api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, inquiry)).body;
    const r = await api(m.ownerToken, "PUT", `${m.base}/catering/${ev.id}/menu`, menuBody(items));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ perHeadCents: 750, subtotalCents: 131000, taxCents: 17030, totalCents: 148030, depositBps: 3000, depositCents: 44409, balanceCents: 148030 });
    expect(r.body.lineItems).toEqual([
      expect.objectContaining({ description: "Chicken biryani (degh) (per guest)", quantity: 100, unitPriceCents: 600, totalCents: 60000 }),
      expect.objectContaining({ description: "Mithai box (per guest)", quantity: 100, unitPriceCents: 150 }),
      expect.objectContaining({ description: "Haleem tray (tray)", quantity: 4, unitPriceCents: 9000, totalCents: 36000 }),
      expect.objectContaining({ description: "Service staff (2)", quantity: 1, unitPriceCents: 20000 }),
    ]);
    // Custom deposit: 50%.
    const half = await api(m.ownerToken, "PUT", `${m.base}/catering/${ev.id}/menu`, { ...menuBody(items), depositBps: 5000 });
    expect(half.body).toMatchObject({ depositBps: 5000, depositCents: 74015 });
    // Changing the headcount re-prices the per-head lines but keeps trays and extras.
    const upd = await api(m.ownerToken, "PATCH", `${m.base}/catering/${ev.id}`, { headcount: 120 });
    // 120 * 750 = 90000 + trays 36000 + staff 20000 = 146000; tax 18980; total 164980
    expect(upd.body).toMatchObject({ headcount: 120, subtotalCents: 146000, taxCents: 18980, totalCents: 164980, depositCents: 82490 });
    // Unknown catalog item / no price are rejected.
    expect((await api(m.ownerToken, "PUT", `${m.base}/catering/${ev.id}/menu`, { items: [{ catalogItemId: "11111111-1111-4111-8111-111111111111", pricing: "tray" }] })).status).toBe(400);
    expect((await api(m.ownerToken, "PUT", `${m.base}/catering/${ev.id}/menu`, { items: [{ name: "Raita", pricing: "per_head" }] })).status).toBe(400);
  });

  it("can't send a quote with no menu, or schedule a tasting in the past", async () => {
    const m = await restaurant("growth");
    const ev = (await api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, inquiry)).body;
    expect((await api(m.ownerToken, "POST", `${m.base}/catering/${ev.id}/send-quote`, {})).status).toBe(400);
    expect((await api(m.ownerToken, "POST", `${m.base}/catering/${ev.id}/tasting`, { tastingAt: "2026-11-01T20:00:00Z" })).status).toBe(400);
  });
});

describe("quote → signature → deposit → invoice", () => {
  it("runs the whole pipeline", async () => {
    const m = await restaurant("growth");
    const staff = await staffMember(env, m.merchant.id, "staff");
    const items = await seedMenu(m.merchant.id);
    const created = await api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, inquiry);
    const id = created.body.id as string;
    const base = `${m.base}/catering/${id}`;

    // Tasting.
    const t = await api(staff.token, "POST", `${base}/tasting`, { tastingAt: "2026-11-10T20:00:00Z" });
    expect(t.body).toMatchObject({ status: "tasting", tastingAt: "2026-11-10T20:00:00.000Z" });
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("tasting");

    // Menu, then send by SMS + email.
    await api(staff.token, "PUT", `${base}/menu`, menuBody(items));
    const sent = await api(staff.token, "POST", `${base}/send-quote`, {});
    expect(sent.body.status).toBe("quoted");
    const [row] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, id));
    const url = `${env.ctx.config.publicWebUrl}/e/${row!.approvalToken}`;
    expect(sent.body.approvalUrl).toBe(url);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain(url);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("$1480.30");
    expect(env.ctx.providers.outbox.email.at(-1)).toMatchObject({ to: "ayesha@example.com" });
    expect(env.ctx.providers.outbox.email.at(-1)!.text).toContain(url);

    // Public page by token; garbage tokens 404; menu is locked once approved.
    const page = await api(null, "GET", `/v1/public/catering/${row!.approvalToken}`);
    expect(page.body).toMatchObject({ canApprove: true, depositDue: false, merchant: { name: "Test Shop" }, event: { totalCents: 148030, depositCents: 44409 } });
    expect(page.body.event.signatureIp).toBeUndefined();
    expect((await api(null, "GET", "/v1/public/catering/not-a-real-token-0000000000")).status).toBe(404);
    expect((await api(null, "POST", `/v1/public/catering/${row!.approvalToken}/approve`, { signatureName: "A" })).status).toBe(400);

    const approved = await api(null, "POST", `/v1/public/catering/${row!.approvalToken}/approve`, { signatureName: "Ayesha Khan" }, { "user-agent": "Mozilla/5.0 (iPhone) TestAgent" });
    expect(approved.status).toBe(200);
    expect(approved.body.event).toMatchObject({ status: "quoted", signatureName: "Ayesha Khan", approvedAt: env.clock.now.toISOString() });
    expect(approved.body.deposit).toMatchObject({ amountCents: 44409 });
    const [signed] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, id));
    expect(signed).toMatchObject({ signatureName: "Ayesha Khan", signatureIp: "127.0.0.1", signatureUserAgent: "Mozilla/5.0 (iPhone) TestAgent" });
    // Staff see the signature log.
    expect((await api(staff.token, "GET", base)).body).toMatchObject({ signatureIp: "127.0.0.1", signatureUserAgent: "Mozilla/5.0 (iPhone) TestAgent" });

    const intent = fake(env).intents.get(approved.body.deposit.paymentIntentId)!;
    expect(intent).toMatchObject({ amountCents: 44409, metadata: { ll_kind: "catering_deposit", ll_id: id } });
    // Re-approve is idempotent (same PaymentIntent); the menu can't change any more.
    const again = await api(null, "POST", `/v1/public/catering/${row!.approvalToken}/approve`, { signatureName: "Someone Else" });
    expect(again.body.deposit.paymentIntentId).toBe(intent.id);
    expect((await api(null, "GET", `/v1/public/catering/${row!.approvalToken}`)).body).toMatchObject({ canApprove: false, depositDue: true });
    expect((await api(staff.token, "PUT", `${base}/menu`, menuBody(items))).status).toBe(409);
    expect((await api(staff.token, "POST", `${base}/invoice`, {})).status).toBe(409); // not confirmed yet
    expect((await api(staff.token, "GET", `${m.base}/catering/calendar?from=2026-12-01&to=2026-12-31`)).body.items).toHaveLength(0);

    // Deposit webhook (delivered twice) confirms the event.
    const ev = fake(env).succeedPaymentIntent(intent.id);
    await deliver(env, ev);
    await deliver(env, ev);
    const [confirmed] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, id));
    expect(confirmed).toMatchObject({ status: "confirmed", depositPaidAt: env.clock.now });

    // Capacity calendar lists confirmed events with guests per day.
    const cal = await api(staff.token, "GET", `${m.base}/catering/calendar?from=2026-12-01&to=2026-12-31`);
    expect(cal.body.items.map((e: { id: string }) => e.id)).toEqual([id]);
    expect(cal.body.days).toEqual([{ date: "2026-12-12", events: 1, headcount: 100 }]);
    expect((await api(staff.token, "GET", `${m.base}/catering/calendar?from=2027-01-01&to=2027-01-31`)).body.items).toHaveLength(0);

    // Balance invoice: total 148030, deposit 44409 applied, 103621 due.
    const inv = await api(staff.token, "POST", `${base}/invoice`, {});
    expect(inv.status).toBe(201);
    expect(inv.body.invoice).toMatchObject({ number: 1, status: "open", subtotalCents: 131000, taxCents: 17030, totalCents: 148030, depositAppliedCents: 44409, amountDueCents: 103621, cateringEventId: id });
    expect(inv.body.event.invoiceId).toBe(inv.body.invoice.id);
    const [invRow] = await env.db.select().from(invoices).where(eq(invoices.id, inv.body.invoice.id));
    expect(invRow).toMatchObject({ cateringEventId: id, userId: confirmed!.userId, ticketId: null });
    expect(invRow!.lineItems).toHaveLength(4);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain(`/i/${invRow!.payToken}`);
    expect((await api(staff.token, "POST", `${base}/invoice`, {})).status).toBe(409);
    // The public pay page works on the restaurant tier (no Pro service plan needed).
    const pay = await api(null, "POST", `/v1/public/invoices/${invRow!.payToken}/pay`);
    expect(pay.status).toBe(200);
    expect(pay.body.payment.amountCents).toBe(103621);

    expect((await api(staff.token, "POST", `${base}/complete`, {})).body.status).toBe("completed");
    expect((await api(staff.token, "POST", `${base}/cancel`, {})).status).toBe(409);
  });

  it("zero deposit confirms on approval; manual deposit confirms without Stripe; cancel voids the invoice", async () => {
    const m = await restaurant("growth", { connect: false });
    const items = await seedMenu(m.merchant.id);
    const mk = async () => {
      const ev = (await api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, inquiry)).body;
      await api(m.ownerToken, "PUT", `${m.base}/catering/${ev.id}/menu`, { ...menuBody(items), depositBps: 0 });
      await api(m.ownerToken, "POST", `${m.base}/catering/${ev.id}/send-quote`, { channels: ["sms"] });
      const [r] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, ev.id));
      return { id: ev.id as string, token: r!.approvalToken };
    };
    const a = await mk();
    const done = await api(null, "POST", `/v1/public/catering/${a.token}/approve`, { signatureName: "Ayesha Khan" });
    expect(done.body).toMatchObject({ event: { status: "confirmed" }, deposit: null });

    // 30% deposit but the shop has no Stripe: no payment intent; staff records the deposit.
    const b = await mk();
    await api(m.ownerToken, "PUT", `${m.base}/catering/${b.id}/menu`, { ...menuBody(items), depositBps: 3000 });
    await api(m.ownerToken, "POST", `${m.base}/catering/${b.id}/send-quote`, { channels: ["sms"] });
    const approved = await api(null, "POST", `/v1/public/catering/${b.token}/approve`, { signatureName: "Ayesha Khan" });
    expect(approved.body).toMatchObject({ event: { status: "quoted", depositCents: 44409 }, deposit: null });
    const paid = await api(m.ownerToken, "POST", `${m.base}/catering/${b.id}/deposit/mark-paid`, { method: "etransfer" });
    expect(paid.body).toMatchObject({ status: "confirmed", depositPaidAt: env.clock.now.toISOString(), balanceCents: 103621 });

    // Invoicing then cancelling voids the open invoice.
    const inv = await api(m.ownerToken, "POST", `${m.base}/catering/${b.id}/invoice`, { send: true });
    expect(inv.body.invoice).toMatchObject({ amountDueCents: 103621, status: "open" });
    await api(m.ownerToken, "POST", `${m.base}/catering/${b.id}/cancel`, {});
    const [row] = await env.db.select().from(invoices).where(eq(invoices.id, inv.body.invoice.id));
    expect(row!.status).toBe("void");
  });
});

describe("edits and cancellation", () => {
  it("editing a sent quote pulls it back; cancelling frees everything", async () => {
    const m = await restaurant("growth");
    const items = await seedMenu(m.merchant.id);
    const ev = (await api(null, "POST", `/v1/public/shops/${m.merchant.slug}/catering/inquiries`, inquiry)).body;
    const base = `${m.base}/catering/${ev.id}`;
    await api(m.ownerToken, "PUT", `${base}/menu`, menuBody(items));
    await api(m.ownerToken, "POST", `${base}/send-quote`, {});
    const [r] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.id, ev.id));
    const edited = await api(m.ownerToken, "PATCH", `${base}`, { headcount: 80 });
    expect(edited.body).toMatchObject({ status: "inquiry", approvalUrl: null });
    expect((await api(null, "GET", `/v1/public/catering/${r!.approvalToken}`)).status).toBe(404);
    expect((await api(null, "POST", `/v1/public/catering/${r!.approvalToken}/approve`, { signatureName: "Ayesha Khan" })).status).toBe(404);
    const cancelled = await api(m.ownerToken, "POST", `${base}/cancel`, { reason: "Venue changed" });
    expect(cancelled.body).toMatchObject({ status: "cancelled", notes: "Cancelled: Venue changed" });
    expect((await api(m.ownerToken, "PATCH", `${base}`, { headcount: 90 })).status).toBe(409);
  });

  it("staff of another shop can't touch the event", async () => {
    const a = await restaurant("growth");
    const b = await restaurant("growth");
    const ev = (await api(null, "POST", `/v1/public/shops/${a.merchant.slug}/catering/inquiries`, inquiry)).body;
    expect((await api(b.ownerToken, "GET", `${a.base}/catering/${ev.id}`)).status).toBe(403);
    expect((await api(b.ownerToken, "GET", `${b.base}/catering/${ev.id}`)).status).toBe(404);
  });
});
