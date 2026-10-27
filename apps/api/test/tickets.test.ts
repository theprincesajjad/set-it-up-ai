import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { call, paidMerchant, setStage, staffMember } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

describe("ticket staff permissions (Pro: staff.permissions)", () => {
  it("custom permission lists apply only while staff.permissions is enabled", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const intakeOnly = await staffMember(env, m.merchant.id, "staff", ["tickets.manage"]);
    const base = `/v1/merchants/${m.merchant.id}`;
    const t = await call(env, intakeOnly.token, "POST", `${base}/tickets`, { customer: { phone: "416-555-0142" }, itemKind: "device", itemDetails: { make: "Honda", model: "Civic", vin: "2HGFC2F59JH000000", plate: "CABC123", mileage: "84210" }, issue: "Brakes squeal" }); // a device ticket: vehicle tickets need an approved estimate before an invoice (auto.test.ts)
    expect(t.status).toBe(201);
    expect(t.body.ticket).toMatchObject({ itemKind: "device", itemDetails: { plate: "CABC123" } });
    const quote = { lineItems: [{ description: "Brake pads", quantity: 1, unitPriceCents: 12000, kind: "part" }] };
    const denied = await call(env, intakeOnly.token, "POST", `${base}/tickets/${t.body.ticket.id}/quotes`, quote);
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toContain("quotes.send");

    await setStage(env, ["staff.permissions"], "hidden");
    expect((await call(env, intakeOnly.token, "POST", `${base}/tickets/${t.body.ticket.id}/quotes`, quote)).status).toBe(201);
    // Voiding invoices needs manager+ regardless.
    const inv = await call(env, m.ownerToken, "POST", `${base}/tickets/${t.body.ticket.id}/invoices`, { fromQuote: false, extraLineItems: quote.lineItems, send: false });
    expect(inv.body.status).toBe("draft");
    expect((await call(env, intakeOnly.token, "POST", `${base}/invoices/${inv.body.id}/void`)).status).toBe(403);
    expect((await call(env, m.ownerToken, "POST", `${base}/invoices/${inv.body.id}/void`)).body.status).toBe("void");
  });

  it("validates status transitions and timeline", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const base = `/v1/merchants/${m.merchant.id}`;
    const t = await call(env, m.ownerToken, "POST", `${base}/tickets`, { customer: { phone: "4165550143" }, itemKind: "garment", itemDetails: { colour: "navy" }, issue: "Hem trousers" });
    const id = t.body.ticket.id;
    expect((await call(env, m.ownerToken, "POST", `${base}/tickets/${id}/status`, { status: "approved" })).status).toBe(400);
    expect((await call(env, m.ownerToken, "POST", `${base}/tickets/${id}/status`, { status: "in_progress", notify: false })).body.ticket.status).toBe("in_progress");
    expect((await call(env, m.ownerToken, "POST", `${base}/tickets/${id}/status`, { status: "in_progress" })).status).toBe(409);
    const sms0 = env.ctx.providers.outbox.sms.length;
    await call(env, m.ownerToken, "POST", `${base}/tickets/${id}/status`, { status: "ready" });
    expect(env.ctx.providers.outbox.sms[sms0]!.body).toContain("Your garment is ready for pickup at Test Shop (ticket #1)");
    await call(env, m.ownerToken, "POST", `${base}/tickets/${id}/status`, { status: "picked_up" });
    expect((await call(env, m.ownerToken, "POST", `${base}/tickets/${id}/status`, { status: "cancelled" })).status).toBe(409);
    const open = await call(env, m.ownerToken, "GET", `${base}/tickets`);
    expect(open.body.items).toHaveLength(0);
    const all = await call(env, m.ownerToken, "GET", `${base}/tickets?status=picked_up`);
    expect(all.body.items).toHaveLength(1);
    const detail = await call(env, m.ownerToken, "GET", `${base}/tickets/${id}`);
    expect(detail.body.events.map((e: { status: string | null }) => e.status)).toEqual(["intake", "in_progress", "ready", "picked_up"]);
  });
});
