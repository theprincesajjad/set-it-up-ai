import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commerceJobs } from "../src/jobs/commerce.js";
import { sendBookingReminders, zonedToUtc } from "../src/services/bookings.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";
import { call, customer, paidMerchant } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") }); // Tue 10:00 in Toronto (EST)
});
afterEach(async () => env.close());

describe("time zones", () => {
  it("converts merchant wall-clock to UTC across DST", () => {
    expect(zonedToUtc("2026-07-01", 9 * 60, "America/Toronto").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-11-04", 9 * 60, "America/Toronto").toISOString()).toBe("2026-11-04T14:00:00.000Z");
    expect(zonedToUtc("2026-03-08", 3 * 60, "America/Toronto").toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });
});

describe("pickup slots", () => {
  it("generates slots from opening hours, books with capacity, cancels, and reminds 2h ahead", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    const url = `/v1/merchants/${m.merchant.id}/slots`;
    const gen = await call(env, m.ownerToken, "POST", `${url}/generate`, { locationId: m.location.id, kind: "pickup", startDate: "2026-11-03", days: 2, slotMinutes: 60, capacity: 1 });
    expect(gen.status).toBe(201);
    // Tue: 10:00 has started? No — 10:00 local == now, so it's skipped; 11..16 = 6. Wed: 9..16 = 8.
    expect(gen.body.created).toBe(14);
    expect(gen.body.slots[0].startsAt).toBe("2026-11-03T16:00:00.000Z");
    const again = await call(env, m.ownerToken, "POST", `${url}/generate`, { locationId: m.location.id, kind: "pickup", startDate: "2026-11-03", days: 2, slotMinutes: 60, capacity: 1 });
    expect(again.body).toMatchObject({ created: 0, skipped: 14 });

    // Plus doesn't include drop-off scheduling (Pro).
    expect((await call(env, m.ownerToken, "POST", `${url}/generate`, { locationId: m.location.id, kind: "dropoff", startDate: "2026-11-04" })).status).toBe(402);

    const pub = await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/slots?kind=pickup`);
    expect(pub.body.items).toHaveLength(14);
    const wed9 = pub.body.items.find((s: { startsAt: string }) => s.startsAt === "2026-11-04T14:00:00.000Z");

    const a = await customer(env);
    const b = await customer(env);
    const booked = await call(env, a.token, "POST", "/v1/me/bookings", { slotId: wed9.id });
    expect(booked.status).toBe(201);
    expect(booked.body).toMatchObject({ status: "booked", kind: "pickup", merchantName: "Test Shop" });
    const full = await call(env, b.token, "POST", "/v1/me/bookings", { slotId: wed9.id });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("slot_full");
    expect((await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/slots?kind=pickup`)).body.items).toHaveLength(13);

    const list = await call(env, m.ownerToken, "GET", `/v1/merchants/${m.merchant.id}/bookings`);
    expect(list.body.items).toHaveLength(1);
    expect((await call(env, m.ownerToken, "DELETE", `${url}/${wed9.id}`)).status).toBe(409);

    // Reminder 2h before (job), once.
    env.clock.now = new Date("2026-11-04T12:30:00Z");
    const sms0 = env.ctx.providers.outbox.sms.length;
    expect(await sendBookingReminders(env.ctx)).toBe(1);
    expect(env.ctx.providers.outbox.sms.slice(sms0)).toEqual([expect.objectContaining({ to: a.user.phone, body: expect.stringContaining("Reminder: your pickup at Test Shop is today at 9:00") })]);
    expect(await sendBookingReminders(env.ctx)).toBe(0);
    expect(commerceJobs.map((j) => j.name)).toContain("commerce.booking_reminders");

    // Cancel frees the place (fresh tokens: the clock moved past the 1h access TTL).
    a.token = await tokenFor(env, a.user);
    b.token = await tokenFor(env, b.user);
    const cancelled = await call(env, a.token, "POST", `/v1/me/bookings/${booked.body.id}/cancel`);
    expect(cancelled.body).toMatchObject({ status: "cancelled" });
    expect((await call(env, b.token, "POST", "/v1/me/bookings", { slotId: wed9.id })).status).toBe(201);
    expect((await call(env, a.token, "POST", `/v1/me/bookings/${booked.body.id}/cancel`)).status).toBe(409);
  });

  it("an order can book a pickup slot; pickupAt comes from the slot", async () => {
    const m = await paidMerchant(env, { plan: "plus" });
    await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/slots/generate`, { locationId: m.location.id, startDate: "2026-11-04", days: 1, slotMinutes: 30, capacity: 2 });
    const slots = (await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/slots`)).body.items;
    const item = (await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/catalog/items`, { name: "Muffin", priceCents: 300 })).body;
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: m.merchant.id, locationId: m.location.id, items: [{ catalogItemId: item.id, quantity: 1 }], slotId: slots[0].id, paymentMethod: "at_pickup", idempotencyKey: "slot-order-0001" });
    expect(r.status).toBe(201);
    expect(r.body.order.pickupAt).toBe(slots[0].startsAt);
    const mine = await call(env, c.token, "GET", "/v1/me/bookings");
    expect(mine.body.items[0]).toMatchObject({ orderId: r.body.order.id, slotId: slots[0].id });
  });
});
