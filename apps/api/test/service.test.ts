import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invoices, merchantMembers, notifications, pushTokens, quotes, users } from "@ll/db";
import { onInvoicePayment } from "../src/services/invoices.js";
import { expireQuotes } from "../src/services/quotes.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";
import { call, customer, deliver, fake, paidMerchant, setStage, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const web = () => env.ctx.config.publicWebUrl;
const lastSms = () => env.ctx.providers.outbox.sms.at(-1)!;

async function intake(m: Awaited<ReturnType<typeof paidMerchant>>, token = m.ownerToken, phone = "(416) 555-0199") {
  const r = await call(env, token, "POST", `/v1/merchants/${m.merchant.id}/tickets`, {
    customer: { phone, name: "Riley Tester" },
    locationId: m.location.id,
    itemKind: "device",
    itemDetails: { make: "Apple", model: "iPhone 13", imei: "356938035643809" },
    issue: "Cracked screen, touch not working",
    intakeNotes: "Customer says it fell in the parking lot",
    photos: ["https://example.com/photos/front.jpg"],
    promisedAt: "2026-11-05T21:00:00Z",
  });
  expect(r.status).toBe(201);
  return r.body;
}

const quoteBody = {
  diagnosis: "Screen assembly needs replacing",
  lineItems: [
    { description: "OLED screen assembly", quantity: 1, unitPriceCents: 18000, kind: "part" },
    { description: "Labour", quantity: 1, unitPriceCents: 6000, kind: "labour" },
  ],
  depositPercent: 25,
};

describe("repair approval flow (Pro)", () => {
  it("intake → quote → e-signed approval → deposit → status updates → invoice → pay → points → picked up", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const tech = await staffMember(env, m.merchant.id, "staff");
    const detail = await intake(m, tech.token);
    const ticket = detail.ticket;
    expect(ticket).toMatchObject({ number: 1, status: "intake", itemKind: "device", customer: { name: "Riley Tester", phone: "+14165550199" } });
    expect(detail.events).toEqual([expect.objectContaining({ status: "intake", note: "Checked in", visibleToCustomer: true })]);
    const [cust] = await env.db.select().from(users).where(eq(users.phone, "+14165550199"));
    await env.db.insert(pushTokens).values({ userId: cust!.id, token: "ExponentPushToken[riley]", platform: "android" });
    const custToken = await tokenFor(env, cust!);
    const base = `/v1/merchants/${m.merchant.id}`;

    await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/events`, { note: "Battery swollen too, mention it" });

    // Quote: $240 + 13% HST = $271.20; 25% deposit = $67.80.
    const q = await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/quotes`, quoteBody);
    expect(q.status).toBe(201);
    expect(q.body).toMatchObject({ status: "draft", subtotalCents: 24000, taxCents: 3120, totalCents: 27120, depositCents: 6780, approvalUrl: null });
    const sent = await call(env, tech.token, "POST", `${base}/quotes/${q.body.id}/send`);
    expect(sent.body.status).toBe("sent");
    const [qRow] = await env.db.select().from(quotes).where(eq(quotes.id, q.body.id));
    const link = `${web()}/q/${qRow!.approvalToken}`;
    expect(sent.body.approvalUrl).toBe(link);
    expect(lastSms()).toMatchObject({ to: "+14165550199", body: expect.stringContaining(link) });
    expect(lastSms().body).toContain("$271.20");
    expect(env.ctx.providers.outbox.push.at(-1)).toMatchObject({ token: "ExponentPushToken[riley]", title: "Test Shop: quote ready" });

    // Public page (no login).
    const pub = await call(env, null, "GET", `/v1/public/quotes/${qRow!.approvalToken}`);
    expect(pub.body).toMatchObject({ canRespond: true, expired: false, merchant: { name: "Test Shop" }, ticket: { number: 1, status: "quote_sent" } });
    expect(pub.body.quote.signatureIp).toBeUndefined();
    expect((await call(env, null, "GET", `/v1/public/quotes/not-a-real-token-123456`)).status).toBe(404);

    // Approve with e-signature (name, IP, user agent, timestamp).
    expect((await call(env, null, "POST", `/v1/public/quotes/${qRow!.approvalToken}/approve`, { signatureName: "" })).status).toBe(400);
    const approved = await call(env, null, "POST", `/v1/public/quotes/${qRow!.approvalToken}/approve`, { signatureName: "Riley Tester" }, { "user-agent": "Mozilla/5.0 (iPhone) TestAgent" });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ ticketStatus: "approved", quote: { status: "approved", signatureName: "Riley Tester" }, deposit: { amountCents: 6780 } });
    const [signed] = await env.db.select().from(quotes).where(eq(quotes.id, q.body.id));
    expect(signed).toMatchObject({ signatureName: "Riley Tester", signatureIp: "127.0.0.1", signatureUserAgent: "Mozilla/5.0 (iPhone) TestAgent" });
    expect(signed!.respondedAt).toEqual(env.clock.now);
    const intent = fake(env).intents.get(approved.body.deposit.paymentIntentId)!;
    // Deposits are 1% (computeFees "deposit"): 6780 x 1% = 68. It was 51 under the old flat 0.75%.
    expect(intent).toMatchObject({ amountCents: 6780, applicationFeeCents: 68, metadata: { ll_kind: "deposit", ll_id: q.body.id } });
    // Re-approve is idempotent (same deposit intent); decline is refused.
    const again = await call(env, null, "POST", `/v1/public/quotes/${qRow!.approvalToken}/approve`, { signatureName: "Riley Tester" });
    expect(again.body.deposit.paymentIntentId).toBe(intent.id);
    expect((await call(env, null, "POST", `/v1/public/quotes/${qRow!.approvalToken}/decline`, {})).status).toBe(409);

    // Deposit debit in flight (PAD): not received yet, customer told once, then it bounces, goes in flight again and clears.
    await deliver(env, fake(env).processPaymentIntent(intent.id));
    await deliver(env, fake(env).processPaymentIntent(intent.id));
    const [flying] = await env.db.select().from(quotes).where(eq(quotes.id, q.body.id));
    expect(flying).toMatchObject({ depositPaidAt: null, depositProcessingAt: env.clock.now });
    const processingNotes = await env.db.select().from(notifications).where(eq(notifications.userId, cust!.id));
    expect(processingNotes.filter((n) => n.title.endsWith("deposit payment is processing"))).toHaveLength(1);
    await deliver(env, fake(env).failPaymentIntent(intent.id, { code: "account_closed" }));
    expect((await env.db.select().from(quotes).where(eq(quotes.id, q.body.id)))[0]).toMatchObject({ depositPaidAt: null, depositProcessingAt: null });
    await deliver(env, fake(env).processPaymentIntent(intent.id));
    expect((await env.db.select().from(quotes).where(eq(quotes.id, q.body.id)))[0]!.depositProcessingAt).toBeTruthy();

    // Deposit paid (webhook).
    await deliver(env, fake(env).succeedPaymentIntent(intent.id));
    const [paidQ] = await env.db.select().from(quotes).where(eq(quotes.id, q.body.id));
    expect(paidQ!.depositProcessingAt).toBeNull();
    expect(paidQ!.depositPaidAt).toBeTruthy();

    // Work progresses; customer is told.
    await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/status`, { status: "in_progress" });
    expect(lastSms().body).toContain("has started work on Apple iPhone 13 (ticket #1)");
    await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/status`, { status: "waiting_parts", note: "Part arrives Thursday." });
    expect(lastSms().body).toContain("waiting on parts");
    expect(lastSms().body).toContain("Part arrives Thursday.");

    // Invoice from approved quote + extras, deposit applied.
    const inv = await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/invoices`, { extraLineItems: [{ description: "Screen protector", quantity: 1, unitPriceCents: 2000, kind: "part" }] });
    expect(inv.status).toBe(201);
    expect(inv.body).toMatchObject({ number: 1, status: "open", subtotalCents: 26000, taxCents: 3380, totalCents: 29380, depositAppliedCents: 6780, amountDueCents: 22600, platformFeeCents: 294 }); // invoices are 1%: 29380 x 1% = 294 (was 220 at 0.75%)
    const [invRow] = await env.db.select().from(invoices).where(eq(invoices.id, inv.body.id));
    expect(inv.body.payUrl).toBe(`${web()}/i/${invRow!.payToken}`);
    expect(lastSms().body).toContain(`${web()}/i/${invRow!.payToken}`);
    expect((await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/invoices`, {})).status).toBe(409);

    await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/status`, { status: "ready" });
    expect(lastSms().body).toMatch(/ready for pickup at Test Shop.*Pay ahead: .*\/i\//);
    expect((await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/status`, { status: "picked_up" })).status).toBe(409);

    // Customer pays the balance on the public page.
    const page = await call(env, null, "GET", `/v1/public/invoices/${invRow!.payToken}`);
    expect(page.body).toMatchObject({ canPay: true, invoice: { amountDueCents: 22600 }, ticket: { number: 1 } });
    const pay = await call(env, null, "POST", `/v1/public/invoices/${invRow!.payToken}/pay`);
    expect(pay.body.payment.amountCents).toBe(22600);
    expect(fake(env).intents.get(pay.body.payment.paymentIntentId)!.applicationFeeCents).toBe(226); // 294 total fee - 68 already taken on the deposit (was 169 = 220 - 51)
    // Balance by bank debit: the invoice stays open and is marked processing (the same intent is handed back), a bounce clears it.
    await deliver(env, fake(env).processPaymentIntent(pay.body.payment.paymentIntentId));
    expect((await env.db.select().from(invoices).where(eq(invoices.id, inv.body.id)))[0]).toMatchObject({ status: "open", paymentProcessingAt: env.clock.now });
    const payAgain = await call(env, null, "POST", `/v1/public/invoices/${invRow!.payToken}/pay`);
    expect(payAgain.body.payment.paymentIntentId).toBe(pay.body.payment.paymentIntentId);
    await deliver(env, fake(env).failPaymentIntent(pay.body.payment.paymentIntentId, { code: "account_closed" }));
    expect((await env.db.select().from(invoices).where(eq(invoices.id, inv.body.id)))[0]).toMatchObject({ status: "open", paymentProcessingAt: null });
    await deliver(env, fake(env).processPaymentIntent(pay.body.payment.paymentIntentId));
    const ev = fake(env).succeedPaymentIntent(pay.body.payment.paymentIntentId);
    await deliver(env, ev);
    await deliver(env, ev);
    await onInvoicePayment(env.ctx, inv.body.id, pay.body.payment.paymentIntentId, "succeeded");
    const [paidInv] = await env.db.select().from(invoices).where(eq(invoices.id, inv.body.id));
    expect(paidInv).toMatchObject({ status: "paid", pointsEarned: 260 });
    const [member] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, cust!.id));
    expect(member!.balance).toBe(260); // awarded once
    expect(lastSms().body).toContain("You earned 260 points at Test Shop");

    const done = await call(env, tech.token, "POST", `${base}/tickets/${ticket.id}/status`, { status: "picked_up" });
    expect(done.body.ticket.status).toBe("picked_up");

    // Customer view: no internal notes, no intake notes, quote + paid invoice.
    const mine = await call(env, custToken, "GET", `/v1/me/tickets/${ticket.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.ticket.intakeNotes).toBeNull();
    expect(mine.body.events.map((e: { note: string }) => e.note)).not.toContain("Battery swollen too, mention it");
    expect(mine.body.events.every((e: { visibleToCustomer: boolean }) => e.visibleToCustomer)).toBe(true);
    expect(mine.body.invoices[0]).toMatchObject({ status: "paid", payUrl: null });
    expect((await call(env, custToken, "GET", "/v1/me/tickets")).body.items).toHaveLength(1);
    const stranger = await customer(env);
    expect((await call(env, stranger.token, "GET", `/v1/me/tickets/${ticket.id}`)).status).toBe(404);
    const staffView = await call(env, tech.token, "GET", `${base}/tickets/${ticket.id}`);
    expect(staffView.body.quotes[0].signatureIp).toBe("127.0.0.1");
    expect(staffView.body.events.some((e: { note: string }) => e.note === "Battery swollen too, mention it")).toBe(true);
  });

  it("re-quoting supersedes; the customer can decline in the app; sent quotes expire", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const { ticket } = await intake(m);
    const base = `/v1/merchants/${m.merchant.id}`;
    const a = await call(env, m.ownerToken, "POST", `${base}/tickets/${ticket.id}/quotes`, { ...quoteBody, send: true });
    const b = await call(env, m.ownerToken, "POST", `${base}/tickets/${ticket.id}/quotes`, { ...quoteBody, depositPercent: 0, send: true });
    const [aRow] = await env.db.select().from(quotes).where(eq(quotes.id, a.body.id));
    expect(aRow!.status).toBe("superseded");
    const stale = await call(env, null, "POST", `/v1/public/quotes/${aRow!.approvalToken}/approve`, { signatureName: "Riley Tester" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toContain("replaced");

    const [cust] = await env.db.select().from(users).where(eq(users.phone, "+14165550199"));
    const token = await tokenFor(env, cust!);
    const other = await customer(env);
    expect((await call(env, other.token, "POST", `/v1/me/quotes/${b.body.id}/decline`, { reason: "nope" })).status).toBe(404);
    const declined = await call(env, token, "POST", `/v1/me/quotes/${b.body.id}/decline`, { reason: "Too expensive, I'll buy a new phone" });
    expect(declined.body).toMatchObject({ ticketStatus: "declined", quote: { status: "declined", declineReason: "Too expensive, I'll buy a new phone" }, deposit: null });

    const c = await call(env, m.ownerToken, "POST", `${base}/tickets/${ticket.id}/quotes`, { lineItems: [{ description: "Diagnostic fee", quantity: 1, unitPriceCents: 4000 }], expiresInDays: 1, send: true });
    const [cRow] = await env.db.select().from(quotes).where(eq(quotes.id, c.body.id));
    env.clock.now = new Date(env.clock.now.getTime() + 2 * 86_400_000);
    expect(await expireQuotes(env.ctx)).toBe(1);
    const late = await call(env, null, "POST", `/v1/public/quotes/${cRow!.approvalToken}/approve`, { signatureName: "Riley Tester" });
    expect(late.body.error.code).toBe("quote_expired");
    expect((await call(env, null, "GET", `/v1/public/quotes/${cRow!.approvalToken}`)).body).toMatchObject({ expired: true, canRespond: false });
  });

  it("gates by plan and rollout; drafts aren't public; counter payment awards points; isolation", async () => {
    const plus = await paidMerchant(env, { plan: "plus" });
    expect((await call(env, plus.ownerToken, "POST", `/v1/merchants/${plus.merchant.id}/tickets`, { customer: { phone: "4165550100" }, issue: "x" })).status).toBe(402);

    const m = await paidMerchant(env, { plan: "pro", connect: false });
    await setStage(env, ["service.deposits"], "hidden");
    const { ticket } = await intake(m);
    const base = `/v1/merchants/${m.merchant.id}`;
    const withDeposit = await call(env, m.ownerToken, "POST", `${base}/tickets/${ticket.id}/quotes`, quoteBody);
    expect(withDeposit.status).toBe(402);
    const draft = await call(env, m.ownerToken, "POST", `${base}/tickets/${ticket.id}/quotes`, { ...quoteBody, depositPercent: undefined });
    const [dRow] = await env.db.select().from(quotes).where(eq(quotes.id, draft.body.id));
    expect((await call(env, null, "GET", `/v1/public/quotes/${dRow!.approvalToken}`)).status).toBe(404);

    // Invoice without a quote, paid at the counter: no in-app payment → no platform fee.
    const inv = await call(env, m.ownerToken, "POST", `${base}/tickets/${ticket.id}/invoices`, { fromQuote: false, extraLineItems: [{ description: "Diagnostic", quantity: 1, unitPriceCents: 5000, kind: "labour" }] });
    expect(inv.body).toMatchObject({ totalCents: 5650, platformFeeCents: 0, status: "open" });
    expect((await call(env, null, "POST", `/v1/public/invoices/${inv.body.payUrl.split("/i/")[1]}/pay`)).body.error.code).toBe("payments_not_set_up");
    const paid = await call(env, m.ownerToken, "POST", `${base}/invoices/${inv.body.id}/mark-paid`, { method: "cash" });
    expect(paid.body).toMatchObject({ status: "paid", pointsEarned: 50, platformFeeCents: 0 });
    expect((await call(env, m.ownerToken, "POST", `${base}/invoices/${inv.body.id}/void`)).status).toBe(409);

    // Another merchant can't see this ticket.
    expect((await call(env, plus.ownerToken, "GET", `${base}/tickets/${ticket.id}`)).status).toBe(403);
    const pro2 = await paidMerchant(env, { plan: "pro" });
    expect((await call(env, pro2.ownerToken, "GET", `/v1/merchants/${pro2.merchant.id}/tickets/${ticket.id}`)).status).toBe(404);
    expect((await call(env, pro2.ownerToken, "GET", `/v1/merchants/${pro2.merchant.id}/tickets`)).body.items).toHaveLength(0);

    // Search by phone / item.
    const found = await call(env, m.ownerToken, "GET", `${base}/tickets?q=iphone`);
    expect(found.body.items).toHaveLength(1);
    const byPhone = await call(env, m.ownerToken, "GET", `${base}/tickets?q=5550199`);
    expect(byPhone.body.items).toHaveLength(1);
  });
});
