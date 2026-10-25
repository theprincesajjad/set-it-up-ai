/**
 * Repair and service operations: photo upload, intake (checklist, terms, items, booking check-in), the board summary, phone
 * approval, the "opened" signal, the 10% invoice cap, tips, the public status page, invoice list and summary, pickup reminders
 * and the 60-day record, rebooking nudges, and rolling drop-off slots.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, bookingSlots, bookings, invoices, merchantMembers, merchants, pushTokens, quotes, rebookingNudges, serviceTickets, services, ticketEvents, users } from "@ll/db";
import { FREE_FOREVER, dueSteps, earnableAmounts, maxAuthorizedCents, tipChoices, tipsEnabledFor } from "@ll/shared";
import { MemoryStorage } from "../src/providers/storage.js";
import { runRollingDropoffSlots } from "../src/services/dropoff.js";
import { runPickupReminders } from "../src/services/pickup.js";
import { handleInboundSms } from "../src/services/messaging.js";
import { runRebookNudges } from "../src/services/rebooking.js";
import { merchantTax } from "../src/services/tax.js";
import { createTestEnv, createNeighbourhood, createUser, grantFeatures, tokenFor, type TestEnv } from "./helpers.js";
import { call, customer, fake, paidMerchant, setStage, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

type M = Awaited<ReturnType<typeof paidMerchant>>;
const base = (m: M) => `/v1/merchants/${m.merchant.id}`;
const lastSms = () => env.ctx.providers.outbox.sms.at(-1)!;
const DAY = 86_400_000;

/** Move the test clock forward and re-sign the owner's token (access tokens expire against the same clock). */
async function later(m: M, ms: number) {
  env.clock.now = new Date(env.clock.now.getTime() + ms);
  m.ownerToken = await tokenFor(env, m.owner);
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

async function raw(token: string | null, url: string, body: Buffer, type: string) {
  const res = await env.app.inject({ method: "POST", url, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": type }, payload: body });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

async function newTicket(m: M, token: string, extra: Record<string, unknown> = {}) {
  const r = await call(env, token, "POST", `${base(m)}/tickets`, {
    customer: { phone: "(416) 555-0199", name: "Riley Tester" },
    locationId: m.location.id,
    itemKind: "device",
    itemDetails: { make: "Apple", model: "iPhone 13" },
    issue: "Cracked screen",
    ...extra,
  });
  expect(r.status).toBe(201);
  return r.body as { ticket: { id: string; userId: string; statusUrl: string }; events: unknown[] };
}

/** Quote of one $100 line (+ 13% HST = $113.00), sent and approved by the customer link. */
async function approvedQuote(m: M, token: string, ticketId: string, unitPriceCents = 10000, extra: Record<string, unknown> = {}) {
  const q = await call(env, token, "POST", `${base(m)}/tickets/${ticketId}/quotes`, { lineItems: [{ description: "Repair", quantity: 1, unitPriceCents, kind: "labour" }], ...extra });
  expect(q.status).toBe(201);
  await call(env, token, "POST", `${base(m)}/quotes/${q.body.id}/send`);
  const [row] = await env.db.select().from(quotes).where(eq(quotes.id, q.body.id));
  const ok = await call(env, null, "POST", `/v1/public/quotes/${row!.approvalToken}/approve`, { signatureName: "Riley Tester" });
  expect(ok.status).toBe(200);
  // A revised quote approved later is the newer one; keep the frozen test clock from tying.
  env.clock.now = new Date(env.clock.now.getTime() + 1000);
  return { id: q.body.id as string, token: row!.approvalToken };
}

describe("photo upload", () => {
  it("stores a photo through the storage provider and refuses anything that is not an image", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const store = new MemoryStorage();
    env.ctx.providers.storage = store;
    const ok = await raw(m.ownerToken, `${base(m)}/uploads`, PNG, "image/png");
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ contentType: "image/png", bytes: PNG.length });
    expect(ok.body.url).toMatch(new RegExp(`^${env.ctx.config.publicApiUrl}/v1/public/uploads/${m.merchant.id}/[0-9a-f]{32}\\.png\\?exp=\\d+&sig=[0-9a-f]{64}$`));
    expect(store.objects.size).toBe(1);

    expect((await raw(m.ownerToken, `${base(m)}/uploads`, Buffer.from("<script>alert(1)</script>"), "text/html")).status).toBe(415);
    // Claims to be a PNG but is not.
    expect((await raw(m.ownerToken, `${base(m)}/uploads`, Buffer.from("not an image at all, really"), "image/png")).status).toBe(400);
    expect((await raw(m.ownerToken, `${base(m)}/uploads`, Buffer.alloc(5 * 1024 * 1024 + 1, 1), "image/png")).status).toBe(413);
    // Anonymous and customers cannot upload to a shop.
    expect((await raw(null, `${base(m)}/uploads`, PNG, "image/png")).status).toBe(401);
    const c = await customer(env);
    expect((await raw(c.token, `${base(m)}/uploads`, PNG, "image/png")).status).toBe(403);
    expect(store.objects.size).toBe(1);
  });

  it("serves disk-stored photos publicly with safe headers (dev storage)", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const store = new MemoryStorage();
    env.ctx.providers.storage = store;
    const up = await raw(m.ownerToken, `${base(m)}/uploads`, PNG, "image/png");
    const signed = new URL(up.body.url);
    const key = signed.pathname.replace("/v1/public/uploads/", "");
    const res = await env.app.inject({ method: "GET", url: `${signed.pathname}${signed.search}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    // the bare permanent path is not served at all (see uploads-signed.test.ts for expiry and tampering)
    expect((await env.app.inject({ method: "GET", url: `/v1/public/uploads/${key}` })).statusCode).toBe(403);
  });
});

describe("intake: checklist, terms, items, check-in from a booking", () => {
  it("keeps the checklist, shelf spot and terms; refuses a ticket without accepted terms when the shop has terms", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const noTerms = await newTicket(m, m.ownerToken, { intakeChecklist: ["Cracked screen", "Data-loss notice given"], shelfLocation: "B3", photos: ["https://example.com/a.jpg", "https://example.com/b.jpg"] });
    const d = await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${noTerms.ticket.id}`);
    expect(d.body.ticket).toMatchObject({ intakeChecklist: ["Cracked screen", "Data-loss notice given"], shelfLocation: "B3", termsAcceptedAt: null });
    expect(d.body.ticket.statusUrl).toMatch(/\/t\/[A-Za-z0-9_-]{16,}$/);
    expect(d.body.events[0].note).toBe("Checked in. 2 photos");

    await env.db.update(merchants).set({ intakeTerms: "We are not responsible for data loss." }).where(eq(merchants.id, m.merchant.id));
    const refused = await call(env, m.ownerToken, "POST", `${base(m)}/tickets`, { customer: { phone: "4165550111" }, issue: "No power" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("terms_required");
    const ok = await newTicket(m, m.ownerToken, { customer: { phone: "4165550111" }, termsAccepted: true });
    const d2 = await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${ok.ticket.id}`);
    expect(d2.body.ticket.termsAcceptedAt).toBe(env.clock.now.toISOString());
    expect(d2.body.events[0].note).toBe("Checked in. Terms signed");
  });

  it("stores several items on one ticket and labels it by count", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const t = await newTicket(m, m.ownerToken, { itemKind: "garment", itemDetails: {}, issue: "Hem and take in", items: [{ description: "Navy trousers", tag: "A1" }, { description: "Blue shirt" }, { description: "Grey jacket" }] });
    const d = await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${t.ticket.id}`);
    expect(JSON.parse(d.body.ticket.itemDetails.items)).toEqual([{ description: "Navy trousers", tag: "A1" }, { description: "Blue shirt" }, { description: "Grey jacket" }]);
    await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/status`, { status: "ready" });
    expect(lastSms().body).toContain("3 items is ready");
  });

  it("checking in from a drop-off booking completes the booking and links the ticket", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const c = await customer(env);
    await call(env, m.ownerToken, "PUT", `${base(m)}/dropoff-settings`, { slotMinutes: 30, capacity: 2, daysAhead: 3 });
    const slots = await call(env, m.ownerToken, "GET", `${base(m)}/slots?kind=dropoff`);
    const slot = slots.body.items[0];
    const b = await call(env, c.token, "POST", `/v1/me/bookings`, { slotId: slot.id, notes: "Pixel 7, battery" });
    expect(b.status).toBe(201);
    const list = await call(env, m.ownerToken, "GET", `${base(m)}/bookings?kind=dropoff`);
    expect(list.body.items[0]).toMatchObject({ id: b.body.id, customerPhone: c.user.phone, notes: "Pixel 7, battery" });
    const t = await newTicket(m, m.ownerToken, { customer: { phone: c.user.phone! }, bookingId: b.body.id });
    const after = await call(env, m.ownerToken, "GET", `${base(m)}/bookings?kind=dropoff`);
    expect(after.body.items[0]).toMatchObject({ status: "completed", ticketId: t.ticket.id });
    // The same booking cannot be checked in twice.
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/tickets`, { customer: { phone: c.user.phone! }, issue: "Again", bookingId: b.body.id })).status).toBe(409);
  });
});

describe("board summary and filters", () => {
  it("counts what needs the shop, what waits on the customer, due and overdue, and what is ready", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const tech = await staffMember(env, m.merchant.id, "staff");
    const now = env.clock.now; // Tue 10:00 Toronto
    const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
    const a = await newTicket(m, m.ownerToken, { customer: { phone: "4165550101" }, promisedAt: iso(-26 * 3600_000), assignedStaffId: tech.user.id }); // overdue, intake (needs you)
    const b = await newTicket(m, m.ownerToken, { customer: { phone: "4165550102" }, promisedAt: iso(5 * 3600_000), photos: ["https://example.com/p.jpg"] }); // due later today
    const c = await newTicket(m, m.ownerToken, { customer: { phone: "4165550103" }, promisedAt: iso(3 * DAY) });
    const d = await newTicket(m, m.ownerToken, { customer: { phone: "4165550104" } });
    // c: quote sent (waiting on customer, $113 open); d: ready for 6 days.
    const q = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${c.ticket.id}/quotes`, { lineItems: [{ description: "Repair", quantity: 1, unitPriceCents: 10000 }], send: true });
    expect(q.status).toBe(201);
    await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${d.ticket.id}/status`, { status: "ready", notify: false });
    await env.db.update(serviceTickets).set({ readyAt: new Date(now.getTime() - 6 * DAY) }).where(eq(serviceTickets.id, d.ticket.id));

    const s = await call(env, m.ownerToken, "GET", `${base(m)}/tickets/summary`);
    expect(s.body).toEqual({ needsYou: 2, waitingOnCustomer: 1, dueToday: 1, overdue: 1, readyUncollected: 1, oldestReadyDays: 6, openQuoteValueCents: 11300, openQuoteCount: 1, lienEligible: 0 });

    const list = await call(env, m.ownerToken, "GET", `${base(m)}/tickets`);
    const byId = new Map(list.body.items.map((t: { id: string }) => [t.id, t]));
    expect(byId.get(a.ticket.id)).toMatchObject({ dueState: "overdue", assignedStaff: { id: tech.user.id } });
    expect(byId.get(b.ticket.id)).toMatchObject({ dueState: "today" });
    expect(byId.get(c.ticket.id)).toMatchObject({ dueState: null, quote: { status: "sent", totalCents: 11300, firstViewedAt: null } });
    expect(byId.get(d.ticket.id)).toMatchObject({ readyAt: expect.any(String) });

    const ids = async (qs: string) => (await call(env, m.ownerToken, "GET", `${base(m)}/tickets?${qs}`)).body.items.map((t: { id: string }) => t.id);
    expect(await ids("dueState=overdue")).toEqual([a.ticket.id]);
    expect(await ids("dueState=today")).toEqual([b.ticket.id]);
    expect(await ids("hasPhotos=true")).toEqual([b.ticket.id]);
    expect(await ids(`assignedTo=${tech.user.id}`)).toEqual([a.ticket.id]);
  });
});

describe("quote preview, tax and credits", () => {
  it("previews with the server's tax for the shop's province and shows the 10% cap; credits are fee lines only", async () => {
    const hood = await createNeighbourhood(env.db);
    const m = await paidMerchant(env, { plan: "pro" });
    const t = await newTicket(m, m.ownerToken);
    const lines = [
      { description: "Charging port assembly", quantity: 1, unitPriceCents: 12900, kind: "part" },
      { description: "Labour", quantity: 1, unitPriceCents: 8000, kind: "labour" },
      { description: "Diagnostic fee (credited)", quantity: 1, unitPriceCents: -3000, kind: "fee" },
    ];
    const p = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes/preview`, { lineItems: lines, depositPercent: 25 });
    // Ontario by default: $179.00 + 13% HST = $23.27.
    expect(p.body).toMatchObject({ subtotalCents: 17900, taxCents: 2327, totalCents: 20227, taxLabel: "HST 13%", depositCents: 5057, maxAuthorizedCents: 22249 });

    await env.db.update((await import("@ll/db")).neighbourhoods).set({ province: "AB" }).where(eq((await import("@ll/db")).neighbourhoods.id, hood.id));
    await env.db.update(merchants).set({ neighbourhoodId: hood.id }).where(eq(merchants.id, m.merchant.id));
    const ab = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes/preview`, { lineItems: lines });
    expect(ab.body).toMatchObject({ subtotalCents: 17900, taxCents: 895, taxLabel: "GST 5%" });

    // A negative price on anything but a fee line is refused.
    const bad = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes/preview`, { lineItems: [{ description: "Discount", quantity: 1, unitPriceCents: -500, kind: "part" }] });
    expect(bad.status).toBe(400);
    // Credits cannot take the quote below zero.
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes`, { lineItems: [{ description: "Credit", quantity: 1, unitPriceCents: -500, kind: "fee" }] })).status).toBe(400);
    // Preview is staff only.
    expect((await call(env, null, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes/preview`, { lineItems: lines })).status).toBe(401);
  });

  it("a shop that says it is not registered for HST charges no tax", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const row = { neighbourhoodId: m.merchant.neighbourhoodId };
    expect((await merchantTax(env.db, { ...row, taxRegistered: false }, 10000)).taxCents).toBe(0);
    expect((await merchantTax(env.db, { ...row, taxRegistered: true }, 10000)).taxCents).toBe(1300);
    expect((await merchantTax(env.db, { ...row, taxRegistered: null }, 10000)).taxCents).toBe(1300);
  });
});

describe("quote opened signal", () => {
  it("is set once, by the customer's first view, never by staff reads or the preview link", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const t = await newTicket(m, m.ownerToken);
    const q = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes`, { lineItems: [{ description: "Repair", quantity: 1, unitPriceCents: 10000 }], send: true });
    const [row] = await env.db.select().from(quotes).where(eq(quotes.id, q.body.id));
    expect(q.body.firstViewedAt).toBeNull();
    await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${t.ticket.id}`);
    await call(env, null, "GET", `/v1/public/quotes/${row!.approvalToken}?preview=1`);
    expect((await env.db.select().from(quotes).where(eq(quotes.id, q.body.id)))[0]!.firstViewedAt).toBeNull();

    const opened = env.clock.now;
    await call(env, null, "GET", `/v1/public/quotes/${row!.approvalToken}`);
    await later(m, 3600_000);
    await call(env, null, "GET", `/v1/public/quotes/${row!.approvalToken}`);
    expect((await env.db.select().from(quotes).where(eq(quotes.id, q.body.id)))[0]!.firstViewedAt).toEqual(opened);

    const d = await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${t.ticket.id}`);
    expect(d.body.quotes[0].firstViewedAt).toBe(opened.toISOString());
    expect(d.body.events.filter((e: { note: string }) => e.note === "Quote opened by the customer")).toHaveLength(1);
    // The customer never sees that internal note.
    const [cust] = await env.db.select().from(users).where(eq(users.id, t.ticket.userId));
    const mine = await call(env, await tokenFor(env, cust!), "GET", `/v1/me/tickets/${t.ticket.id}`);
    expect(mine.body.events.some((e: { note: string }) => /opened/i.test(e.note ?? ""))).toBe(false);
  });
});

describe("approve by phone", () => {
  it("records name, phone, time and who, approves the ticket, texts the deposit link, and is idempotent", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const tech = await staffMember(env, m.merchant.id, "staff");
    const t = await newTicket(m, tech.token);
    const q = await call(env, tech.token, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes`, { lineItems: [{ description: "Repair", quantity: 1, unitPriceCents: 10000 }], depositPercent: 25 });
    expect(q.body.status).toBe("draft");
    expect((await call(env, tech.token, "POST", `${base(m)}/quotes/${q.body.id}/authorize-by-phone`, { name: "R" })).status).toBe(400);
    const r = await call(env, tech.token, "POST", `${base(m)}/quotes/${q.body.id}/authorize-by-phone`, { name: "Riley Tester", phone: "416-555-0199", note: "Said yes at 10:02" });
    expect(r.status).toBe(200);
    expect(r.body.ticketStatus).toBe("approved");
    expect(r.body.quote).toMatchObject({ status: "approved", signatureName: "Riley Tester", authorizedBy: { method: "phone", name: "Riley Tester", phone: "416-555-0199", note: "Said yes at 10:02", at: env.clock.now.toISOString(), staffId: tech.user.id } });
    const sms = lastSms();
    expect(sms.body).toContain("recorded your approval of ticket #1 by phone");
    expect(sms.body).toContain("$28.25 deposit");
    expect(sms.body).toContain(`/q/`);
    const d = await call(env, tech.token, "GET", `${base(m)}/tickets/${t.ticket.id}`);
    expect(d.body.events.at(-1).note).toMatch(/^Approved by phone, Riley Tester, .*416-555-0199.*Said yes at 10:02/);
    expect(d.body.events.at(-1).visibleToCustomer).toBe(true);
    // Second call: same quote back, no second text, no second event.
    const n = env.ctx.providers.outbox.sms.length;
    const again = await call(env, tech.token, "POST", `${base(m)}/quotes/${q.body.id}/authorize-by-phone`, { name: "Someone Else" });
    expect(again.status).toBe(200);
    expect(again.body.quote.authorizedBy.name).toBe("Riley Tester");
    expect(env.ctx.providers.outbox.sms.length).toBe(n);
    // The deposit is still paid from the customer's link.
    const [row] = await env.db.select().from(quotes).where(eq(quotes.id, q.body.id));
    const pub = await call(env, null, "GET", `/v1/public/quotes/${row!.approvalToken}`);
    expect(pub.body).toMatchObject({ depositDue: true, quote: { status: "approved" } });
  });

  it("needs quotes.send, and refuses declined or superseded quotes", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const intakeOnly = await staffMember(env, m.merchant.id, "staff", ["tickets.manage"]);
    const t = await newTicket(m, m.ownerToken);
    const q = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes`, { lineItems: [{ description: "Repair", quantity: 1, unitPriceCents: 10000 }], send: true });
    const denied = await call(env, intakeOnly.token, "POST", `${base(m)}/quotes/${q.body.id}/authorize-by-phone`, { name: "Riley Tester" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toContain("quotes.send");
    // A revised quote replaces the first one; the first can no longer be approved by phone.
    const q2 = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes`, { lineItems: [{ description: "Repair", quantity: 1, unitPriceCents: 12000 }], send: true });
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/quotes/${q.body.id}/authorize-by-phone`, { name: "Riley Tester" })).status).toBe(409);
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/quotes/${q2.body.id}/authorize-by-phone`, { name: "Riley Tester" })).status).toBe(200);
  });

  it("an expired quote can still be approved by phone", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const t = await newTicket(m, m.ownerToken);
    const q = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/quotes`, { lineItems: [{ description: "Repair", quantity: 1, unitPriceCents: 10000 }], send: true, expiresInDays: 1 });
    await later(m, 3 * DAY);
    await env.db.update(quotes).set({ status: "expired" }).where(eq(quotes.id, q.body.id));
    const r = await call(env, m.ownerToken, "POST", `${base(m)}/quotes/${q.body.id}/authorize-by-phone`, { name: "Riley Tester" });
    expect(r.status).toBe(200);
    expect(r.body.quote.status).toBe("approved");
  });
});

describe("invoice over the approved quote (10% rule, every item kind)", () => {
  for (const [kind, details] of [
    ["device", { make: "Apple", model: "iPhone 13" }],
    ["garment", { colour: "navy" }],
    ["vehicle", { make: "Honda", model: "Civic", plate: "CABC123" }],
  ] as const) {
    it(`${kind}: within 10% is fine, above is 409 over_estimate, a re-approved quote resets the cap`, async () => {
      const m = await paidMerchant(env, { plan: "pro" });
      const t = await newTicket(m, m.ownerToken, { itemKind: kind, itemDetails: details });
      const q = await approvedQuote(m, m.ownerToken, t.ticket.id, 10000); // total $113.00, cap floor(113.00 x 1.10) = $124.30
      expect(maxAuthorizedCents(11300)).toBe(12430);
      const over = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/invoices`, { extraLineItems: [{ description: "Extra", quantity: 1, unitPriceCents: 1100, kind: "part" }] });
      expect(over.status).toBe(409);
      expect(over.body.error.code).toBe("over_estimate");
      expect(over.body.error.details).toMatchObject({ quoteId: q.id, quoteTotalCents: 11300, maxAuthorizedCents: 12430, invoiceTotalCents: 12543 });
      // $10.00 extra: 110 + 12.43... total 12430 exactly = cap: allowed (not more than 10% above).
      const ok = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/invoices`, { extraLineItems: [{ description: "Extra", quantity: 1, unitPriceCents: 1000, kind: "part" }], send: false });
      expect(ok.status).toBe(201);
      expect(ok.body.totalCents).toBe(12430);
      await call(env, m.ownerToken, "POST", `${base(m)}/invoices/${ok.body.id}/void`);
      // The shop sends a revised quote of $150; once the customer approves, the cap follows the new quote.
      const q2 = await approvedQuote(m, m.ownerToken, t.ticket.id, 15000); // $169.50, cap $186.45
      const inv = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/invoices`, { extraLineItems: [{ description: "Extra", quantity: 1, unitPriceCents: 1500, kind: "part" }], send: false });
      expect(inv.status).toBe(201);
      expect(inv.body.totalCents).toBe(18645);
      await call(env, m.ownerToken, "POST", `${base(m)}/invoices/${inv.body.id}/void`);
      // Naming the earlier approved quote holds the invoice to that one.
      const old = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/invoices`, { quoteId: q.id, extraLineItems: [{ description: "Extra", quantity: 1, unitPriceCents: 5000, kind: "part" }], send: false });
      expect(old.status).toBe(409);
      expect(old.body.error.details.quoteId).toBe(q.id);
      expect(q2.id).not.toBe(q.id);
    });
  }

  it("a ticket with no approved quote is not capped", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const t = await newTicket(m, m.ownerToken);
    const inv = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/invoices`, { fromQuote: false, extraLineItems: [{ description: "Walk-in fix", quantity: 1, unitPriceCents: 99900 }], send: false });
    expect(inv.status).toBe(201);
  });
});

describe("tips on invoices: not taxed, never earn points", () => {
  async function openInvoice(m: M, vertical?: string) {
    if (vertical) await env.db.update(merchants).set({ vertical }).where(eq(merchants.id, m.merchant.id));
    const tech = await staffMember(env, m.merchant.id, "staff");
    await env.db.update(users).set({ name: "Simran Kaur" }).where(eq(users.id, tech.user.id));
    const t = await newTicket(m, m.ownerToken, { assignedStaffId: tech.user.id });
    await approvedQuote(m, m.ownerToken, t.ticket.id, 14500);
    const inv = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/invoices`, {});
    const [row] = await env.db.select().from(invoices).where(eq(invoices.id, inv.body.id));
    return { inv: inv.body, token: row!.payToken, tech, ticketId: t.ticket.id };
  }

  it("shows the picker for salon-type shops with the stylist, and hides it for repair", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const salon = await openInvoice(m, "salon");
    const page = await call(env, null, "GET", `/v1/public/invoices/${salon.token}`);
    expect(page.body.tip).toEqual({ enabled: true, presets: [15, 20, 25], baseCents: 14500, staff: { id: salon.tech.user.id, name: "Simran Kaur" } });
    expect(page.body.merchant.vertical).toBe("salon");
    expect(page.body.pointsPreview).toBe(145); // 1 point per dollar on the $145.00 service line: tax and tips do not earn

    const m2 = await paidMerchant(env, { plan: "pro" });
    const repair = await openInvoice(m2, "repair_electronics");
    expect((await call(env, null, "GET", `/v1/public/invoices/${repair.token}`)).body.tip.enabled).toBe(false);
    expect(tipsEnabledFor("repair_electronics", null)).toBe(false);
    expect(tipsEnabledFor("repair_electronics", true)).toBe(true);
    expect(tipsEnabledFor("barber", null)).toBe(true);
    expect(tipChoices(18000)).toEqual([{ percent: 15, cents: 2700 }, { percent: 20, cents: 3600 }, { percent: 25, cents: 4500 }]);
  });

  it("charges balance plus tip, records the tip and the stylist, and the points ignore it", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const { inv, token, tech } = await openInvoice(m, "salon");
    // $145.00 + 13% = $163.85 due. 20% tip on the pre-tax $145.00 = $29.00.
    expect(inv.amountDueCents).toBe(16385);
    const pay = await call(env, null, "POST", `/v1/public/invoices/${token}/pay`, { tipCents: 2900 });
    expect(pay.status).toBe(200);
    expect(pay.body.payment.amountCents).toBe(16385 + 2900);
    expect(pay.body.invoice.tipCents).toBe(2900);
    expect((await env.db.select().from(invoices).where(eq(invoices.id, inv.id)))[0]).toMatchObject({ tipCents: 2900, tipStaffId: tech.user.id });
    // Same tip: the same intent. A different tip: a new intent for the new amount; the old one is ignored.
    expect((await call(env, null, "POST", `/v1/public/invoices/${token}/pay`, { tipCents: 2900 })).body.payment.paymentIntentId).toBe(pay.body.payment.paymentIntentId);
    const noTip = await call(env, null, "POST", `/v1/public/invoices/${token}/pay`, { tipCents: 0 });
    expect(noTip.body.payment.amountCents).toBe(16385);
    expect(noTip.body.payment.paymentIntentId).not.toBe(pay.body.payment.paymentIntentId);
    expect(noTip.body.invoice.tipCents).toBe(0);
    const withTip = await call(env, null, "POST", `/v1/public/invoices/${token}/pay`, { tipCents: 1000 });
    await (await import("./commerce-fixtures.js")).deliver(env, fake(env).succeedPaymentIntent(withTip.body.payment.paymentIntentId));
    const [paid] = await env.db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(paid).toMatchObject({ status: "paid", tipCents: 1000, pointsEarned: 145 });
  });

  it("refuses tips over 100% of the pre-tax subtotal, and tips at shops that do not offer them", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const { token } = await openInvoice(m, "salon");
    expect((await call(env, null, "POST", `/v1/public/invoices/${token}/pay`, { tipCents: 14501 })).status).toBe(400);
    expect((await call(env, null, "POST", `/v1/public/invoices/${token}/pay`, { tipCents: 14500 })).status).toBe(200);
    expect((await call(env, null, "POST", `/v1/public/invoices/${token}/pay`, { tipCents: -5 })).status).toBe(400);
    const m2 = await paidMerchant(env, { plan: "pro" });
    const r = await openInvoice(m2, "repair_electronics");
    const refused = await call(env, null, "POST", `/v1/public/invoices/${r.token}/pay`, { tipCents: 500 });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain("tips");
    expect((await call(env, null, "POST", `/v1/public/invoices/${r.token}/pay`, {})).status).toBe(200);
  });

  it("a credit line (diagnostic fee) reduces the points in proportion; tips and tax are never in the lines", () => {
    expect(earnableAmounts([{ amountCents: 12900 }, { amountCents: 8000 }, { amountCents: -3000 }])).toEqual([Math.floor((12900 * 17900) / 20900), Math.floor((8000 * 17900) / 20900), 0]);
    expect(earnableAmounts([{ amountCents: 1000 }, { amountCents: -2000 }])).toEqual([0, 0]);
    expect(earnableAmounts([{ amountCents: 1000 }])).toEqual([1000]);
  });
});

describe("public ticket status page", () => {
  it("is reachable by its own token without signing in and shows only what the customer may see", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const t = await newTicket(m, m.ownerToken, { intakeNotes: "Internal: customer is difficult", promisedAt: "2026-11-05T21:00:00Z" });
    const token = t.ticket.statusUrl.split("/t/")[1]!;
    await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/events`, { note: "Internal note", visibleToCustomer: false });
    await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/status`, { status: "in_progress", note: "Started now" });
    const page = await call(env, null, "GET", `/v1/public/tickets/${token}`);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({
      merchant: { name: "Test Shop", address: "123 Roncesvalles Ave" },
      ticket: { number: 1, status: "in_progress", itemLabel: "Apple iPhone 13", promisedAt: "2026-11-05T21:00:00.000Z" },
      invoice: null,
      quote: null,
    });
    expect(page.body.merchant.mapUrl).toContain("google.com/maps");
    const text = JSON.stringify(page.body);
    expect(text).not.toContain("Internal");
    expect(text).not.toContain("difficult");
    expect(page.body.events.map((e: { status: string | null }) => e.status)).toEqual(["intake", "in_progress"]);
    expect((await call(env, null, "GET", `/v1/public/tickets/not-a-token-1234567890`)).status).toBe(404);
    // The status text carries the link, and a ready ticket with an open invoice shows the pay link.
    expect(lastSms().body).toContain(`/t/${token}`);
    await approvedQuote(m, m.ownerToken, t.ticket.id);
    await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/invoices`, {});
    await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/status`, { status: "ready" });
    const ready = await call(env, null, "GET", `/v1/public/tickets/${token}`);
    expect(ready.body.ticket.status).toBe("ready");
    expect(ready.body.invoice).toMatchObject({ amountDueCents: 11300, status: "open", payUrl: expect.stringContaining("/i/") });
  });

  it("expires 30 days after the ticket closes (410 with the shop's name and phone); an open ticket never expires", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const closed = await newTicket(m, m.ownerToken);
    const open = await newTicket(m, m.ownerToken, { customer: { phone: "4165550177", name: "Open Job" } });
    const closedToken = closed.ticket.statusUrl.split("/t/")[1]!;
    const openToken = open.ticket.statusUrl.split("/t/")[1]!;
    // Timeline rows take created_at from the database clock; this test moves the injected clock, so stamp the closing on it.
    const close = async (id: string, status: "picked_up" | "cancelled") => {
      await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${id}/status`, { status });
      await env.db.update(ticketEvents).set({ createdAt: env.clock.now }).where(and(eq(ticketEvents.ticketId, id), eq(ticketEvents.status, status)));
    };
    await close(closed.ticket.id, "picked_up");
    const page = (token: string) => call(env, null, "GET", `/v1/public/tickets/${token}`);
    expect((await page(closedToken)).status).toBe(200);
    await later(m, 29 * DAY);
    expect((await page(closedToken)).status).toBe(200);
    await later(m, 2 * DAY); // 31 days after closing
    const gone = await page(closedToken);
    expect(gone.status).toBe(410);
    expect(gone.body.error).toMatchObject({ code: "link_expired", details: { shopName: "Test Shop" } });
    // The expired body carries the shop's contact and nothing about the job or the customer.
    expect(Object.keys(gone.body.error.details).sort()).toEqual(["shopName", "shopPhone"]);
    expect(JSON.stringify(gone.body)).not.toContain("Apple");
    // Still open after 100 days: no expiry until it closes.
    await later(m, 69 * DAY);
    expect((await page(openToken)).status).toBe(200);
    // A cancelled ticket expires the same way, counted from the cancellation.
    await close(open.ticket.id, "cancelled");
    expect((await page(openToken)).status).toBe(200);
    await later(m, 31 * DAY);
    expect((await page(openToken)).status).toBe(410);
  });

  it("gives older tickets a token the first time staff open them", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const t = await newTicket(m, m.ownerToken);
    await env.db.update(serviceTickets).set({ statusToken: null }).where(eq(serviceTickets.id, t.ticket.id));
    const d = await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${t.ticket.id}`);
    expect(d.body.ticket.statusUrl).toMatch(/\/t\//);
    const again = await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${t.ticket.id}`);
    expect(again.body.ticket.statusUrl).toBe(d.body.ticket.statusUrl);
  });
});

describe("invoice list and summary", () => {
  it("lists with the customer and ticket, searches, flags overdue, and sums open, overdue, paid this month and deposits held", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const a = await newTicket(m, m.ownerToken, { customer: { phone: "4165550201", name: "Liam Kim" } });
    await approvedQuote(m, m.ownerToken, a.ticket.id, 10000, { depositPercent: 25 });
    const invA = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${a.ticket.id}/invoices`, {});
    const b = await newTicket(m, m.ownerToken, { customer: { phone: "4165550202", name: "Aisha Rahman" } });
    await approvedQuote(m, m.ownerToken, b.ticket.id, 20000);
    const invB = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${b.ticket.id}/invoices`, {});
    // Customer C approved with a paid deposit and has no invoice yet: deposit held.
    const c = await newTicket(m, m.ownerToken, { customer: { phone: "4165550203", name: "Dev Patel" } });
    const qc = await approvedQuote(m, m.ownerToken, c.ticket.id, 10000, { depositPercent: 50 });
    await env.db.update(quotes).set({ depositPaidAt: env.clock.now }).where(eq(quotes.id, qc.id));

    // Invoice A is 9 days old (overdue); B was just sent. Pay B at the counter 2 days after it was created.
    await env.db.update(invoices).set({ createdAt: new Date(env.clock.now.getTime() - 9 * DAY) }).where(eq(invoices.id, invA.body.id));
    await call(env, m.ownerToken, "POST", `${base(m)}/invoices/${invB.body.id}/mark-paid`, { method: "cash" });
    await env.db.update(invoices).set({ createdAt: new Date(env.clock.now.getTime() - 2 * DAY) }).where(eq(invoices.id, invB.body.id));

    const list = await call(env, m.ownerToken, "GET", `${base(m)}/invoices`);
    const rows = Object.fromEntries(list.body.items.map((r: { customerName: string }) => [r.customerName, r]));
    expect(rows["Liam Kim"]).toMatchObject({ ticketNumber: 1, itemLabel: "Apple iPhone 13", status: "open", overdue: true, lastActivity: "Texted day 0" });
    expect(rows["Aisha Rahman"]).toMatchObject({ status: "paid", overdue: false, lastActivity: expect.stringMatching(/^Paid /) });
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/invoices?filter=overdue`)).body.items).toHaveLength(1);
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/invoices?q=aisha`)).body.items.map((r: { customerName: string }) => r.customerName)).toEqual(["Aisha Rahman"]);
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/invoices?q=%232`)).body.items).toHaveLength(1);
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/invoices?q=5550201`)).body.items).toHaveLength(1);
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/invoices?status=paid`)).body.items).toHaveLength(1);

    const s = await call(env, m.ownerToken, "GET", `${base(m)}/invoices/summary`);
    expect(s.body).toMatchObject({
      openCount: 1,
      openCents: invA.body.amountDueCents,
      overdueCount: 1,
      overdueCents: invA.body.amountDueCents,
      oldestOverdueDays: 9,
      paidThisMonthCount: 1,
      paidThisMonthCents: invB.body.totalCents,
      avgDaysToPay: 2,
    });
    // Deposits held: C (paid) only; A's deposit was never paid, and B's ticket has a paid invoice.
    expect(s.body.depositsHeldQuotes).toBe(1);
    expect(s.body.depositsHeldCents).toBe(5650);
  });

  it("is gated by service.invoices", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    await setStage(env, ["service.invoices"], "ga");
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/invoices/summary`)).status).toBe(402);
  });
});

describe("pickup reminders and the 60-day record", () => {
  async function readyTicket(m: M, daysAgo: number, phone = "4165550301", invoiceOpen = false) {
    const t = await newTicket(m, m.ownerToken, { customer: { phone } });
    if (invoiceOpen) {
      await approvedQuote(m, m.ownerToken, t.ticket.id);
      await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/invoices`, {});
    }
    await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${t.ticket.id}/status`, { status: "ready", notify: false });
    await env.db.update(serviceTickets).set({ readyAt: new Date(env.clock.now.getTime() - daysAgo * DAY) }).where(eq(serviceTickets.id, t.ticket.id));
    return t.ticket.id;
  }
  const step = async (id: string) => (await env.db.select().from(serviceTickets).where(eq(serviceTickets.id, id)))[0]!;

  it("texts at day 3 and day 7 (with the pay link when money is due), tasks at 30, flags at 60 and sends nothing at 60", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    await grantFeatures(env, m.merchant.id, ["service.rebooking"]);
    const id = await readyTicket(m, 3, "4165550301", true);
    const before = env.ctx.providers.outbox.sms.length;
    expect(await runPickupReminders(env.ctx)).toMatchObject({ texts: 1 });
    expect(env.ctx.providers.outbox.sms.length).toBe(before + 1);
    expect(lastSms().body).toContain("ready and waiting for you");
    expect(lastSms().body).toContain(`/t/`);
    // Same day again: nothing new.
    expect(await runPickupReminders(env.ctx)).toMatchObject({ texts: 0 });

    await later(m, 4 * DAY); // day 7
    expect(await runPickupReminders(env.ctx)).toMatchObject({ texts: 1 });
    expect(lastSms().body).toMatch(/\$113\.00 is due.*\/i\//);

    await later(m, 23 * DAY); // day 30
    const smsAt30 = env.ctx.providers.outbox.sms.length;
    expect(await runPickupReminders(env.ctx)).toMatchObject({ texts: 0, tasks: 1, flagged: 0 });
    expect(env.ctx.providers.outbox.sms.length).toBe(smsAt30);
    const d = await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${id}`);
    expect(d.body.events.some((e: { note: string }) => /^Task: call .+\. Ready for 30 days/.test(e.note ?? ""))).toBe(true);
    expect(d.body.ticket.lienEligible).toBe(false);

    await later(m, 30 * DAY); // day 60
    expect(await runPickupReminders(env.ctx)).toMatchObject({ texts: 0, tasks: 0, flagged: 1 });
    expect(env.ctx.providers.outbox.sms.length).toBe(smsAt30);
    expect((await step(id)).lienEligibleAt).toEqual(env.clock.now);
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/tickets/summary`)).body).toMatchObject({ readyUncollected: 1, lienEligible: 1 });
    expect(dueSteps(60, 30)).toEqual([{ day: 60, action: "lien_flag" }]);
  });

  it("a late job sends only the latest text, only for ready tickets, and the texts need service.rebooking", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    await grantFeatures(env, m.merchant.id, ["service.rebooking"], false);
    const id = await readyTicket(m, 8);
    // No service.rebooking: nothing is texted, but the step is still recorded so it never fires stale later.
    const before = env.ctx.providers.outbox.sms.length;
    expect(await runPickupReminders(env.ctx)).toMatchObject({ texts: 0 });
    expect(env.ctx.providers.outbox.sms.length).toBe(before);
    expect((await step(id)).pickupReminderDay).toBe(7);

    await grantFeatures(env, m.merchant.id, ["service.rebooking"], true);
    const late = await readyTicket(m, 8, "4165550302");
    await readyTicket(m, 8, "4165550303");
    const picked = await newTicket(m, m.ownerToken, { customer: { phone: "4165550304" } }); // not ready: never texted
    expect(await runPickupReminders(env.ctx)).toMatchObject({ texts: 2 });
    expect((await step(late)).pickupReminderDay).toBe(7);
    expect((await step(picked.ticket.id)).pickupReminderDay).toBe(0);
  });

  it("lists uncollected items, and records a notice only after 60 days and only when staff say so", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const id = await readyTicket(m, 20);
    const list = await call(env, m.ownerToken, "GET", `${base(m)}/uncollected`);
    expect(list.body.items).toEqual([expect.objectContaining({ ticketId: id, readyDays: 20, lienEligible: false, lienNoticeSentAt: null })]);
    expect(list.body.ladder.map((l: { day: number }) => l.day)).toEqual([3, 7, 30, 60]);
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${id}/lien-notice`, { note: "x" })).status).toBe(409);
    await env.db.update(serviceTickets).set({ readyAt: new Date(env.clock.now.getTime() - 61 * DAY) }).where(eq(serviceTickets.id, id));
    const staff = await staffMember(env, m.merchant.id, "staff");
    expect((await call(env, staff.token, "POST", `${base(m)}/tickets/${id}/lien-notice`, {})).status).toBe(403);
    const r = await call(env, m.ownerToken, "POST", `${base(m)}/tickets/${id}/lien-notice`, { note: "Registered mail sent" });
    expect(r.status).toBe(200);
    expect(r.body.ticket).toMatchObject({ lienEligible: true, lienNoticeSentAt: env.clock.now.toISOString() });
    expect(r.body.events.at(-1)).toMatchObject({ visibleToCustomer: false, note: expect.stringContaining("Registered mail sent") });
    // Nothing was sent to the customer by this record.
    expect(env.ctx.providers.outbox.sms.some((s) => /lien|sale/i.test(s.body))).toBe(false);
  });
});

describe("rebooking (service.rebooking)", () => {
  /** A shop with a $60 cut that is due every 28 days, and a customer who paid for one `daysAgo` days ago. */
  async function setup(opts: { daysAgo?: number; consent?: boolean; locale?: string; plan?: "plus" | "pro" } = {}) {
    const m = await paidMerchant(env, { plan: opts.plan ?? "plus" });
    await grantFeatures(env, m.merchant.id, ["service.rebooking"]);
    const [svc] = await env.db.insert(services).values({ merchantId: m.merchant.id, kind: "appointment", name: "Cut and style", durationMin: 45, priceCents: 6000, rebookAfterDays: 28 }).returning();
    const cust = await createUser(env.db, { name: "Ritu Gill", locale: opts.locale ?? "en-CA" });
    if (opts.consent !== false) await env.db.insert(merchantMembers).values({ merchantId: m.merchant.id, userId: cust.id, marketingConsentAt: new Date(), marketingConsentSource: "test" });
    else await env.db.insert(merchantMembers).values({ merchantId: m.merchant.id, userId: cust.id });
    const paidAt = new Date(env.clock.now.getTime() - (opts.daysAgo ?? 30) * DAY);
    const [inv] = await env.db
      .insert(invoices)
      .values({ merchantId: m.merchant.id, userId: cust.id, number: 1, lineItems: [{ description: "Cut and style", quantity: 1, unitPriceCents: 6000, serviceId: svc!.id }], subtotalCents: 6000, taxCents: 780, totalCents: 6780, amountDueCents: 0, status: "paid", payToken: `tok-${Math.random().toString(36).slice(2)}-xxxxxxxxxx`, paidAt, createdAt: paidAt })
      .returning();
    return { m, svc: svc!, cust, inv: inv! };
  }
  const get = async (m: M, state = "due") => (await call(env, m.ownerToken, "GET", `${base(m)}/rebooking?state=${state}`)).body;

  it("lists who is due (late and this week) from paid invoices and completed appointments, with the language and channel", async () => {
    const { m, svc, cust } = await setup({ daysAgo: 30, locale: "pa-IN" });
    const r = await get(m);
    expect(r.counts).toEqual({ due: 1, late: 1, snoozed: 0 });
    expect(r.items).toEqual([expect.objectContaining({ userId: cust.id, serviceId: svc.id, serviceName: "Cut and style", rebookAfterDays: 28, daysLate: 2, channel: "sms", language: "pa", state: "late", canSend: true })]);
    expect(r.stats).toMatchObject({ dueThisWeek: 1, sentLast30: 0 });
    expect((await get(m, "late")).items).toHaveLength(1);
    expect((await get(m, "snoozed")).items).toHaveLength(0);

    // A completed appointment counts as a visit too, and a more recent one moves the due date out.
    await env.db.insert(appointments).values({ merchantId: m.merchant.id, locationId: m.location.id, userId: cust.id, staffId: null, items: [{ serviceId: svc.id, name: "Cut and style", durationMin: 45, priceCents: 6000 }], startsAt: new Date(env.clock.now.getTime() - 2 * DAY), endsAt: new Date(env.clock.now.getTime() - 2 * DAY + 45 * 60_000), status: "completed", completedAt: new Date(env.clock.now.getTime() - 2 * DAY) });
    expect((await get(m)).items).toHaveLength(0);
  });

  it("is not due early, skips customers with a future appointment, and honours the rule off switch", async () => {
    const { m, svc, cust } = await setup({ daysAgo: 10 });
    expect((await get(m)).items).toHaveLength(0);
    await env.db.update(invoices).set({ paidAt: new Date(env.clock.now.getTime() - 24 * DAY) }).where(eq(invoices.merchantId, m.merchant.id)); // due in 4 days: this week
    expect((await get(m)).items).toHaveLength(1);
    await env.db.insert(appointments).values({ merchantId: m.merchant.id, locationId: m.location.id, userId: cust.id, items: [], startsAt: new Date(env.clock.now.getTime() + 2 * DAY), endsAt: new Date(env.clock.now.getTime() + 2 * DAY + 3600_000), status: "booked" });
    expect((await get(m)).items).toHaveLength(0);
    await env.db.delete(appointments);
    expect((await get(m)).items).toHaveLength(1);
    const off = await call(env, m.ownerToken, "PUT", `${base(m)}/rebooking/rules/${svc.id}`, { rebookAfterDays: null });
    expect(off.body).toMatchObject({ serviceId: svc.id, rebookAfterDays: null });
    expect((await get(m)).items).toHaveLength(0);
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/rebooking/rules`)).body.items).toEqual([{ serviceId: svc.id, name: "Cut and style", rebookAfterDays: null }]);
  });

  it("sends one nudge per cycle in the customer's language with the shop name, a booking link and STOP; never twice in a cycle; stops after two", async () => {
    const { m, svc, cust } = await setup({ daysAgo: 30, locale: "hi-IN" });
    const r = await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/send`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ channel: "sms" });
    const sms = lastSms();
    expect(sms.to).toBe(cust.phone);
    expect(sms.body).toContain("Test Shop");
    expect(sms.body).toContain("Cut and style");
    expect(sms.body).toContain("STOP");
    expect(sms.body).toContain(`/shops/${m.merchant.slug}/book?service=${svc.id}`);
    expect(sms.body).toMatch(/[ऀ-ॿ]/); // Hindi
    expect((await env.db.select().from(rebookingNudges))[0]).toMatchObject({ action: "sent", channel: "sms", userId: cust.id });
    // Counts against the shop's SMS credits.
    expect((await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id)))[0]!.smsCreditsUsed).toBe(1);
    // Not due again this cycle.
    expect((await get(m)).items).toHaveLength(0);
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/send`)).status).toBe(409);
    // A cycle later with no visit: one more nudge, then never again until they visit.
    await later(m, 29 * DAY);
    expect((await get(m)).items).toHaveLength(1);
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/send`)).status).toBe(200);
    await later(m, 60 * DAY);
    expect((await get(m)).items).toHaveLength(0);
    expect((await get(m)).stats).toMatchObject({ sentLast30: 0 });
  });

  it("needs marketing consent, honours STOP, and is gated by the feature", async () => {
    const { m, svc, cust } = await setup({ daysAgo: 30, consent: false });
    const row = (await get(m)).items[0];
    expect(row.canSend).toBe(false);
    const refused = await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/send`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("no_consent");

    await env.db.update(merchantMembers).set({ marketingConsentAt: new Date() }).where(eq(merchantMembers.userId, cust.id));
    expect((await get(m)).items[0].canSend).toBe(true);
    // The customer replies STOP: consent is withdrawn network-wide, so the nudge cannot go out.
    const stop = await handleInboundSms(env.ctx, cust.phone!, "STOP");
    expect(stop.action).toBe("opted_out");
    expect((await get(m)).items[0].canSend).toBe(false);
    expect((await get(m)).stats.optedOut).toBe(1);
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/send`)).status).toBe(409);

    // A shop without service.rebooking gets 402.
    const locked = await paidMerchant(env, { plan: "free", connect: false });
    await setStage(env, ["service.rebooking"], "ga");
    const lockedRes = await call(env, locked.ownerToken, "GET", `${base(locked)}/rebooking`);
    expect(lockedRes.status).toBe(402);
    expect(lockedRes.body.error.code).toBe("feature_locked");
  });

  it("sends by push when the customer has the app, skips and snoozes", async () => {
    const { m, svc, cust } = await setup({ daysAgo: 30 });
    await env.db.insert(pushTokens).values({ userId: cust.id, token: "ExponentPushToken[ritu]", platform: "ios" });
    const pushBefore = env.ctx.providers.outbox.push.length;
    expect((await get(m)).items[0].channel).toBe("push");
    await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/snooze`, { snoozeDays: 10 });
    expect((await get(m)).counts).toEqual({ due: 0, late: 0, snoozed: 1 });
    expect((await get(m, "snoozed")).items).toHaveLength(1);
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/snooze`, {})).status).toBe(204);
    await later(m, 15 * DAY); // both snoozes (10 and 14 days) have ended
    expect((await get(m)).counts).toMatchObject({ snoozed: 0, due: 1 });
    expect((await get(m)).items).toHaveLength(1);
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/send`)).body).toEqual({ channel: "push" });
    expect(env.ctx.providers.outbox.push.length).toBe(pushBefore + 1);
    expect(env.ctx.providers.outbox.push.at(-1)!.body).toContain("mute this shop");
  });

  it("skip drops the customer for this cycle", async () => {
    const { m, svc, cust } = await setup({ daysAgo: 30 });
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/skip`)).status).toBe(204);
    expect((await get(m)).items).toHaveLength(0);
    expect((await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${cust.id}/${svc.id}/skip`)).status).toBe(409);
  });

  it("the daily job sends at 10:00 shop time for shops with auto on, and only to consented customers", async () => {
    const { m, svc } = await setup({ daysAgo: 30 });
    await env.db.update(merchants).set({ rebookAuto: true }).where(eq(merchants.id, m.merchant.id));
    // Test clock is 10:00 in Toronto (15:00Z). At 09:00 local nothing is sent.
    env.clock.now = new Date("2026-11-03T14:00:00Z");
    await env.db.update(invoices).set({ paidAt: new Date(env.clock.now.getTime() - 30 * DAY) }).where(eq(invoices.merchantId, m.merchant.id));
    expect(await runRebookNudges(env.ctx)).toBe(0);
    env.clock.now = new Date("2026-11-03T15:00:00Z");
    expect(await runRebookNudges(env.ctx)).toBe(1);
    expect(await runRebookNudges(env.ctx)).toBe(0); // already nudged this cycle
    // A second customer without consent is never texted.
    const other = await createUser(env.db, { name: "No Consent" });
    await env.db.insert(invoices).values({ merchantId: m.merchant.id, userId: other.id, number: 2, lineItems: [{ description: "Cut", quantity: 1, unitPriceCents: 6000, serviceId: svc.id }], subtotalCents: 6000, taxCents: 0, totalCents: 6000, amountDueCents: 0, status: "paid", payToken: "tok-other-xxxxxxxxxxxxxx", paidAt: new Date(env.clock.now.getTime() - 40 * DAY) });
    expect(await runRebookNudges(env.ctx)).toBe(0);
    // Auto off: nothing.
    await env.db.update(merchants).set({ rebookAuto: false }).where(eq(merchants.id, m.merchant.id));
    expect(await runRebookNudges(env.ctx)).toBe(0);
    const set = await call(env, m.ownerToken, "PUT", `${base(m)}/rebooking/settings`, { auto: true });
    expect(set.body).toEqual({ auto: true });
  });

  it("send-all texts everyone due who can be texted", async () => {
    const { m, svc } = await setup({ daysAgo: 30 });
    const noConsent = await createUser(env.db, { name: "Quiet" });
    await env.db.insert(invoices).values({ merchantId: m.merchant.id, userId: noConsent.id, number: 2, lineItems: [{ description: "Cut", quantity: 1, unitPriceCents: 6000, serviceId: svc.id }], subtotalCents: 6000, taxCents: 0, totalCents: 6000, amountDueCents: 0, status: "paid", payToken: "tok-quiet-xxxxxxxxxxxxxx", paidAt: new Date(env.clock.now.getTime() - 33 * DAY) });
    const r = await call(env, m.ownerToken, "POST", `${base(m)}/rebooking/send-all`);
    expect(r.body).toEqual({ sent: 1, skipped: 1 });
  });

  it("service.rebooking is a paid key, never free forever", () => {
    expect(FREE_FOREVER).not.toContain("service.rebooking");
  });
});

describe("rolling drop-off slots", () => {
  it("opens the next days from Locations hours, honours slot length and capacity, and a blocked day stays closed", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const s0 = await call(env, m.ownerToken, "GET", `${base(m)}/dropoff-settings`);
    expect(s0.body).toEqual({ slotMinutes: 30, capacity: 3, daysAhead: 14, blockedDates: [] });
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/slots?kind=dropoff`)).body.items).toHaveLength(0);
    const opened = await call(env, m.ownerToken, "PUT", `${base(m)}/dropoff-settings`, { daysAhead: 7 });
    expect(opened.body.daysAhead).toBe(7);
    const slots = (await call(env, m.ownerToken, "GET", `${base(m)}/slots?kind=dropoff&to=${new Date(env.clock.now.getTime() + 30 * DAY).toISOString()}`)).body.items;
    // Tue Nov 3 10:30 onwards to Mon Nov 9: Tue-Fri 09:00-17:00 (16 slots), Sat 10:00-14:00 (8), Mon 16: today is partly gone (10:00 passed).
    expect(slots.length).toBeGreaterThan(50);
    expect(slots.every((x: { capacity: number }) => x.capacity === 3)).toBe(true);
    expect(slots.every((x: { kind: string }) => x.kind === "dropoff")).toBe(true);
    // Sunday has no hours: no slot starts on Sun Nov 8 local.
    const local = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short" }).format(new Date(iso));
    expect(slots.some((x: { startsAt: string }) => local(x.startsAt) === "Sun")).toBe(false);

    // A longer slot applies to days with no bookings; a block removes the day and survives the job.
    await call(env, m.ownerToken, "PUT", `${base(m)}/dropoff-settings`, { slotMinutes: 60, capacity: 2 });
    const hourly = (await call(env, m.ownerToken, "GET", `${base(m)}/slots?kind=dropoff&to=${new Date(env.clock.now.getTime() + 30 * DAY).toISOString()}`)).body.items;
    expect(hourly.length).toBeLessThan(slots.length);
    expect(hourly.every((x: { capacity: number }) => x.capacity === 2)).toBe(true);
    const blocked = await call(env, m.ownerToken, "POST", `${base(m)}/dropoff-settings/block`, { date: "2026-11-05" });
    expect(blocked.body.settings.blockedDates).toEqual(["2026-11-05"]);
    expect(blocked.body.removed).toBeGreaterThan(0);
    await runRollingDropoffSlots(env.ctx);
    const after = (await call(env, m.ownerToken, "GET", `${base(m)}/slots?kind=dropoff&to=${new Date(env.clock.now.getTime() + 30 * DAY).toISOString()}`)).body.items;
    const thursday = after.filter((x: { startsAt: string }) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(x.startsAt)) === "2026-11-05");
    expect(thursday).toHaveLength(0);
    const unblocked = await call(env, m.ownerToken, "DELETE", `${base(m)}/dropoff-settings/block/2026-11-05`);
    expect(unblocked.body.blockedDates).toEqual([]);
    const back = (await call(env, m.ownerToken, "GET", `${base(m)}/slots?kind=dropoff&to=${new Date(env.clock.now.getTime() + 30 * DAY).toISOString()}`)).body.items;
    expect(back.length).toBeGreaterThan(after.length);
    // The job keeps the window rolling: a day later it opens one more day.
    await later(m, DAY);
    expect(await runRollingDropoffSlots(env.ctx)).toBeGreaterThan(0);
  });

  it("a block on a day with bookings keeps those bookings and reports them", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const c = await customer(env);
    await call(env, m.ownerToken, "PUT", `${base(m)}/dropoff-settings`, { daysAhead: 5 });
    const slots = (await call(env, m.ownerToken, "GET", `${base(m)}/slots?kind=dropoff`)).body.items;
    const target = slots.find((x: { startsAt: string }) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(x.startsAt)) === "2026-11-04");
    const bk = await call(env, c.token, "POST", `/v1/me/bookings`, { slotId: target.id });
    expect(bk.status).toBe(201);
    const r = await call(env, m.ownerToken, "POST", `${base(m)}/dropoff-settings/block`, { date: "2026-11-04" });
    expect(r.body.withBookings).toBe(1);
    expect((await env.db.select().from(bookings).where(eq(bookings.id, bk.body.id)))[0]!.status).toBe("booked");
    expect(await env.db.select().from(bookingSlots).where(and(eq(bookingSlots.id, target.id)))).toHaveLength(1);
  });

  it("needs a manager, and drop-off scheduling", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const staff = await staffMember(env, m.merchant.id, "staff");
    expect((await call(env, staff.token, "PUT", `${base(m)}/dropoff-settings`, { capacity: 4 })).status).toBe(403);
    expect((await call(env, staff.token, "GET", `${base(m)}/dropoff-settings`)).status).toBe(200);
    expect((await call(env, m.ownerToken, "PUT", `${base(m)}/dropoff-settings`, { capacity: 0 })).status).toBe(400);
    const free = await paidMerchant(env, { plan: "free", connect: false });
    expect((await call(env, free.ownerToken, "GET", `${base(free)}/dropoff-settings`)).status).toBe(402);
  });
});
