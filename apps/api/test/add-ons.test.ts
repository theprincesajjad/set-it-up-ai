/**
 * phase-pro P5: add-ons at booking (docs/business/pro-value.md §3.2 P5). Owner CRUD, the public payload (Pro only), the booking
 * length and price, reschedule, checkout totals and the addons_sold signal, and the overview's average ticket and attach rate.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, merchantSignals, merchants, users } from "@ll/db";
import { zonedToUtc } from "../src/services/bookings.js";
import { call, customer, deliver, fake, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") }); // Tue 10:00 in Toronto
});
afterEach(async () => env.close());

const at = (local: string) => {
  const [d, t] = local.split(" ") as [string, string];
  const [h, m] = t.split(":").map(Number) as [number, number];
  return zonedToUtc(d, h * 60 + m, "America/Toronto").toISOString();
};
const plusMin = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000).toISOString();
const MON_SAT = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "09:00", endsLocal: "17:00" }));

/** A nail studio with one tech, three services and two add-ons: nail art with everything, removal with gel fills only. */
async function studio(plan: "free" | "plus" = "plus") {
  const m = await paidMerchant(env, { plan, vertical: "nails" });
  await env.db.update(merchants).set({ taxRegistered: true }).where(eq(merchants.id, m.merchant.id));
  const base = `/v1/merchants/${m.merchant.id}`;
  const tech = await staffMember(env, m.merchant.id, "staff");
  const desk = await staffMember(env, m.merchant.id, "manager");
  await env.db.update(users).set({ name: "Priya Nail" }).where(eq(users.id, tech.user.id));
  const owner = m.ownerToken;
  const mk = async (body: Record<string, unknown>) => (await call(env, owner, "POST", `${base}/services`, body)).body;
  const gel = await mk({ name: "Gel fill", durationMin: 60, priceCents: 5500, depositCents: 2000, bufferMin: 10 });
  const mani = await mk({ name: "Classic manicure", durationMin: 30, priceCents: 3000 });
  const pedi = await mk({ name: "Pedicure", durationMin: 45, priceCents: 4500 });
  expect((await call(env, owner, "PUT", `${base}/staff/${tech.user.id}/hours`, { days: MON_SAT })).status).toBe(200);
  const art = await call(env, owner, "POST", `${base}/add-ons`, { name: "Nail art", priceCents: 1000, durationMin: 15 });
  expect(art.status).toBe(201);
  const removal = await call(env, owner, "POST", `${base}/add-ons`, { name: "Removal", priceCents: 1500, durationMin: 20, offeredWith: [gel.id], taxable: false, sort: 1 });
  expect(removal.status).toBe(201);
  return { ...m, base, tech, desk, gel, mani, pedi, art: art.body, removal: removal.body };
}
type Studio = Awaited<ReturnType<typeof studio>>;

const avail = (s: Studio, serviceIds: string[], addOnIds: string[] = [], day = "2026-11-04") =>
  call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/availability?serviceIds=${serviceIds.join(",")}&staffId=any&from=${day}&to=${day}${addOnIds.length ? `&addOnIds=${addOnIds.join(",")}` : ""}`);

describe("owner CRUD", () => {
  it("creates, lists, restricts, edits and deletes add-ons; managers only; services must be the shop's own", async () => {
    const s = await studio();
    expect(s.art).toMatchObject({ name: "Nail art", priceCents: 1000, durationMin: 15, active: true, taxable: true, offeredWith: [] });
    expect(s.removal).toMatchObject({ offeredWith: [s.gel.id], taxable: false });
    const list = await call(env, s.tech.token, "GET", `${s.base}/add-ons`);
    expect(list.status).toBe(200);
    expect(list.body.offered).toBe(true);
    expect(list.body.items.map((a: { name: string }) => a.name)).toEqual(["Nail art", "Removal"]);
    // Add-ons are not services: the price list and the public service list leave them out.
    expect((await call(env, s.ownerToken, "GET", `${s.base}/services`)).body.items.map((x: { name: string }) => x.name)).not.toContain("Nail art");

    expect((await call(env, s.tech.token, "POST", `${s.base}/add-ons`, { name: "French tip", priceCents: 800 })).status).toBe(403);
    const other = await studio();
    expect((await call(env, s.ownerToken, "POST", `${s.base}/add-ons`, { name: "French tip", priceCents: 800, offeredWith: [other.gel.id] })).status).toBe(400);
    expect((await call(env, s.ownerToken, "PATCH", `${s.base}/add-ons/${other.art.id}`, { priceCents: 1 })).status).toBe(404);

    const edited = await call(env, s.desk.token, "PATCH", `${s.base}/add-ons/${s.art.id}`, { priceCents: 1200, offeredWith: [s.gel.id, s.mani.id] });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ priceCents: 1200, durationMin: 15, offeredWith: [s.gel.id, s.mani.id] });
    // A change that leaves the list alone keeps it.
    expect((await call(env, s.desk.token, "PATCH", `${s.base}/add-ons/${s.art.id}`, { active: false })).body).toMatchObject({ active: false, offeredWith: [s.gel.id, s.mani.id] });
    expect((await call(env, s.desk.token, "DELETE", `${s.base}/add-ons/${s.art.id}`)).status).toBe(204);
    expect((await call(env, s.desk.token, "GET", `${s.base}/add-ons`)).body.items).toHaveLength(1);
  });

  it("lets a Free shop set them up, but its booking page offers none and a booking naming one is refused", async () => {
    const s = await studio("free");
    expect((await call(env, s.ownerToken, "GET", `${s.base}/add-ons`)).body).toMatchObject({ offered: false, items: [{ name: "Nail art" }, { name: "Removal" }] });
    const pub = await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/services`);
    expect(pub.status).toBe(200);
    for (const svc of pub.body.services) expect(svc).not.toHaveProperty("addOns");
    expect((await avail(s, [s.gel.id], [s.art.id])).status).toBe(402);
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.mani.id], startsAt: at("2026-11-04 10:00"), addOnIds: [s.art.id] });
    expect(r.status).toBe(402);
    // Without add-ons the Free calendar books as before.
    expect((await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.mani.id], startsAt: at("2026-11-04 10:00") })).status).toBe(201);
  });
});

describe("booking", () => {
  it("offers each service its add-ons; a restricted add-on stays off other services", async () => {
    const s = await studio();
    const pub = (await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/services`)).body;
    const of = (id: string) => pub.services.find((x: { id: string }) => x.id === id).addOns.map((a: { name: string }) => a.name);
    expect(of(s.gel.id)).toEqual(["Nail art", "Removal"]);
    expect(of(s.mani.id)).toEqual(["Nail art"]);
    expect(pub.services.find((x: { id: string }) => x.id === s.gel.id).addOns[1]).toEqual({ id: s.removal.id, name: "Removal", description: null, priceCents: 1500, durationMin: 20, translations: {} });
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.mani.id], startsAt: at("2026-11-04 10:00"), addOnIds: [s.removal.id] });
    expect(r.status).toBe(400);
    expect((await avail(s, [s.mani.id], [s.removal.id])).status).toBe(400);
  });

  it("blocks service + add-ons + buffer, prices them, keeps the deposit on the service and moves them on reschedule", async () => {
    const s = await studio();
    // 60 + 10 buffer + 15 + 20 = 105 minutes.
    const av = await avail(s, [s.gel.id], [s.art.id, s.removal.id]);
    expect(av.status).toBe(200);
    expect(av.body.blockMin).toBe(105);
    const times = (r: { body: { days: { times: { startsAt: string }[] }[] } }) => r.body.days[0]!.times.map((x) => x.startsAt);
    // 15:30 fits 70 minutes before 17:00, not 105.
    expect(times(await avail(s, [s.gel.id]))).toContain(at("2026-11-04 15:30"));
    expect(times(av)).not.toContain(at("2026-11-04 15:30"));
    expect(times(av)).toContain(at("2026-11-04 15:15"));

    const c = await customer(env, { name: "Neha Sharma" });
    const start = at("2026-11-04 10:00");
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.gel.id], staffId: s.tech.user.id, startsAt: start, addOnIds: [s.art.id, s.removal.id] });
    expect(r.status).toBe(201);
    expect(r.body.appointment.endsAt).toBe(plusMin(start, 105));
    expect(r.body.appointment).toMatchObject({ totalCents: 5500 + 1000 + 1500, depositCents: 2000 });
    expect(r.body.appointment.items).toEqual([
      { serviceId: s.gel.id, name: "Gel fill", durationMin: 60, priceCents: 5500 },
      { serviceId: null, addOnId: s.art.id, kind: "add_on", name: "Nail art", durationMin: 15, priceCents: 1000 },
      { serviceId: null, addOnId: s.removal.id, kind: "add_on", name: "Removal", durationMin: 20, priceCents: 1500 },
    ]);
    // The held time covers the add-ons (10:00 to 11:45): a manicure at 11:30 is refused.
    const other = await customer(env);
    expect((await call(env, other.token, "POST", "/v1/me/appointments", { serviceIds: [s.mani.id], startsAt: at("2026-11-04 11:30") })).status).toBe(409);
    await deliver(env, fake(env).succeedPaymentIntent(r.body.deposit.paymentIntentId));

    const moved = await call(env, c.token, "POST", `/v1/me/appointments/${r.body.appointment.id}/reschedule`, { startsAt: at("2026-11-05 13:00") });
    expect(moved.status).toBe(200);
    expect(moved.body.appointment.endsAt).toBe(plusMin(at("2026-11-05 13:00"), 105));
    expect(moved.body.appointment.items.filter((i: { kind?: string }) => i.kind === "add_on")).toHaveLength(2);
    // Reminders name them.
    expect(moved.body.appointment.items.map((i: { name: string }) => i.name).join(", ")).toBe("Gel fill, Nail art, Removal");
  });
});

describe("checkout and reports", () => {
  it("bills the add-ons with their tax flag, records addons_sold once and reports the average ticket and attach rate", async () => {
    const s = await studio();
    const c = await customer(env, { name: "Ritu Gill" });
    const start = at("2026-11-04 10:00");
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.gel.id], staffId: s.tech.user.id, startsAt: start, addOnIds: [s.art.id, s.removal.id] });
    await deliver(env, fake(env).succeedPaymentIntent(r.body.deposit.paymentIntentId));
    // A second visit with no add-on, for the attach rate.
    const c2 = await customer(env);
    const plain = await call(env, c2.token, "POST", "/v1/me/appointments", { serviceIds: [s.mani.id], staffId: s.tech.user.id, startsAt: at("2026-11-04 13:00") });
    expect(plain.status).toBe(201);
    env.clock.now = new Date(at("2026-11-04 14:00"));
    const desk = await tokenFor(env, s.desk.user);

    const out = await call(env, desk, "POST", `${s.base}/appointments/${r.body.appointment.id}/checkout`, { mode: "counter", counterMethod: "card_terminal", tipCents: 1600 });
    expect(out.status).toBe(200);
    // $80 of services and add-ons; HST on the gel fill and the nail art only (removal is "no tax"): 13% of 6500 = 845.
    expect(out.body.invoice).toMatchObject({ subtotalCents: 8000, taxCents: 845, totalCents: 8845, depositAppliedCents: 2000, amountDueCents: 6845, tipCents: 1600 });
    expect(out.body.appointment.totalCents).toBe(8000);
    // A tip is limited by services plus add-ons (100% of $80).
    const signal = async () => (await env.db.select().from(merchantSignals).where(and(eq(merchantSignals.merchantId, s.merchant.id), eq(merchantSignals.key, "addons_sold"))))[0];
    expect(await signal()).toMatchObject({ count: 2, amountCents: 2500 });
    // Checking out again changes nothing.
    await call(env, desk, "POST", `${s.base}/appointments/${r.body.appointment.id}/checkout`, { mode: "counter", tipCents: 0 });
    expect(await signal()).toMatchObject({ count: 2, amountCents: 2500 });

    const p = await call(env, desk, "POST", `${s.base}/appointments/${plain.body.appointment.id}/checkout`, { mode: "counter", counterMethod: "cash", tipCents: 0 });
    expect(p.status).toBe(200);
    const rep = await call(env, await tokenFor(env, s.owner), "GET", `${s.base}/reports/overview?from=${encodeURIComponent(at("2026-11-01 00:00"))}&to=${encodeURIComponent(at("2026-11-06 00:00"))}`);
    expect(rep.status).toBe(200);
    // (8000 + 3000) / 2 visits; one of two had an add-on.
    expect(rep.body).toMatchObject({ avgTicketCents: 5500, addOnAttachRate: 0.5, addOnsSold: 2, addOnsAmountCents: 2500 });
    const [row] = await env.db.select().from(appointments).where(eq(appointments.id, r.body.appointment.id));
    expect(row!.status).toBe("completed");
  });
});
