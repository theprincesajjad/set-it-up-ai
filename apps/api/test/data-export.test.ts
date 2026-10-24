import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { customerApi } from "@ll/shared";
import { seedEverything } from "./privacy-fixtures.js";
import { call } from "./commerce-fixtures.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => env.close());

describe("GET /v1/me/export: the shopper's data download covers every module", () => {
  it("returns the customer's own rows from every module as a JSON attachment", async () => {
    const s = await seedEverything(env);
    const token = await tokenFor(env, s.user);
    const res = await env.app.inject({ method: "GET", url: "/v1/me/export", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-type"]).toContain("json");
    const d: customerApi.DataExportResponse = res.json();

    // loyalty half
    expect(d.profile).toMatchObject({ id: s.user.id, name: "Sam Secret" });
    expect(d.memberships).toHaveLength(1);
    expect(d.consents).toEqual([expect.objectContaining({ merchantId: s.merchant.id, text: "I agree", source: "app", muted: false })]);

    // every module
    const row = <T extends Record<string, unknown>>(rows: unknown[]) => rows[0] as T;
    expect(d.orders).toHaveLength(1);
    expect(row(d.orders)).toMatchObject({ allergyNote: "SECRET shellfish", notes: "SECRET order note", merchantName: "Test Shop" });
    expect(row<{ splits: unknown[] }>(d.orders).splits).toHaveLength(1);
    expect(row(d.appointments)).toMatchObject({ customerName: "Sam Secret", notes: "SECRET appt note", clientNote: "SECRET client note" });
    const sub = row<{ skips: unknown[]; deliveries: unknown[]; charges: unknown[] }>(d.tiffinSubscriptions);
    expect(sub).toMatchObject({ address: "SECRET 5 Elm St", addressNotes: "SECRET side door", dietaryNotes: "SECRET no onions", postalCode: "L4T 1A1" });
    expect([sub.skips.length, sub.deliveries.length, sub.charges.length]).toEqual([1, 1, 1]);
    expect(row(d.cateringEvents)).toMatchObject({ venueName: "SECRET Hall", venueAddress: "SECRET 9 Venue Rd", dietaryNotes: "SECRET nuts", signatureName: "Sam Secret", signatureIp: "203.0.113.9" });
    expect(row(d.hallBookings)).toMatchObject({ notes: "SECRET hall note" });
    expect(d.manualPayments).toHaveLength(2);
    expect(d.whatsapp.sessions).toHaveLength(1);
    expect(d.whatsapp.messages).toEqual([expect.objectContaining({ body: "SECRET hello I am Sam", direction: "in" })]);
    expect(row(d.phoneCalls)).toMatchObject({ transcript: "SECRET transcript" });
    expect(row(d.reviews)).toMatchObject({ feedback: "SECRET rude waiter", replyBody: "SECRET sorry Sam", rating: 2 });
    const ticket = row<{ photos: string[]; timeline: { note: string }[]; quotes: { signatureName: string; authorizedBy: { name: string } }[] }>(d.serviceTickets);
    expect(ticket).toMatchObject({ issue: "SECRET cracked screen", itemDetails: { imei: "SECRET123" }, intakeNotes: "SECRET passcode" });
    expect(ticket.photos).toHaveLength(1);
    expect(ticket.photos[0]).toMatch(/^http.*\/v1\/public\/uploads\//);
    expect(ticket.timeline[0]!.note).toBe("SECRET called Sam");
    expect(ticket.quotes[0]).toMatchObject({ signatureName: "Sam Secret", authorizedBy: { name: "Sam Secret" } });
    expect(d.invoices).toHaveLength(1);
    expect(d.waitlist).toHaveLength(1);
    expect(row(d.waitlist)).toMatchObject({ name: "Sam Secret" });
    expect(d.referrals.map((r) => r.role).sort()).toEqual(["referee", "referrer"]);
    expect(d.notificationPrefs).toHaveLength(1);
    expect(d.notifications).toHaveLength(1);
    expect(d.walletPasses).toEqual([expect.objectContaining({ platform: "apple" })]);
    expect(d.pushTokens).toHaveLength(1);
    expect(d.doNotContact).toEqual([expect.objectContaining({ channel: "sms", source: "sms_reply" })]);
  });

  it("never includes links or secrets that would let someone else act as the customer", async () => {
    const s = await seedEverything(env);
    const text = JSON.stringify((await call(env, await tokenFor(env, s.user), "GET", "/v1/me/export")).body);
    for (const secret of ["tok-cat", "st-tok", "q-tok", "inv-tok", "split-tok", "rev-tok", '"auth"', "ExponentPushToken"]) expect(text, secret).not.toContain(secret);
    for (const key of ["approvalToken", "statusToken", "payToken", "authToken"]) expect(text, key).not.toContain(`"${key}"`);
  });

  it("is scoped to the signed-in customer only", async () => {
    const s = await seedEverything(env);
    const stranger = await createUser(env.db, { name: "Stranger" });
    const d: customerApi.DataExportResponse = (await call(env, await tokenFor(env, stranger), "GET", "/v1/me/export")).body;
    expect(JSON.stringify(d)).not.toMatch(/SECRET|Sam Secret/);
    for (const k of ["orders", "appointments", "tiffinSubscriptions", "cateringEvents", "hallBookings", "phoneCalls", "reviews", "serviceTickets", "waitlist"] as const) expect(d[k], k).toEqual([]);
    expect(d.whatsapp).toEqual({ sessions: [], messages: [] });
    void s;
  });

  it("requires sign-in", async () => {
    expect((await env.app.inject({ method: "GET", url: "/v1/me/export" })).statusCode).toBe(401);
  });
});
