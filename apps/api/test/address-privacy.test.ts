/**
 * Home-based privacy end to end in the API (solo-pro-launch.md §2.3; phase-solo B). A home studio's street address is absent
 * from every public response (shop page, map list, booking page, the pass, promo footers) and released to a booking only once it
 * is confirmed, after the deposit: on the booking, in the confirmation text and in the day-before reminder.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, merchantMembers, merchants } from "@ll/db";
// ledger first: it owns the balance listeners the other services register on import.
import "../src/services/ledger.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";
import { call, customer, deliver, fake } from "./commerce-fixtures.js";
import { sendReminders } from "../src/services/appointments-booking.js";
import { merchantAddress } from "../src/services/messaging.js";
import { passLocations } from "../src/services/wallet.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => env.close());

const STREET = "12 Willard Ave";

async function homeStudio() {
  const { neighbourhoods } = await import("@ll/db");
  await env.db.insert(neighbourhoods).values({ slug: "bloor-west-v", name: "Bloor West", status: "live", centerLat: 43.6505, centerLng: -79.4757, radiusMetres: 1500 });
  env.ctx.providers.geocoder = { name: "test", geocode: async () => ({ lat: 43.6512, lng: -79.4801 }) };
  const owner = await createUser(env.db, { email: `o${Math.random().toString(36).slice(2)}@example.com` });
  const token = await tokenFor(env, owner);
  const r = await call(env, token, "POST", "/v1/merchants", { name: "Nails by Mo", vertical: "nails", workSetting: "home", postalCode: "M6S 2K1", phone: "(416) 555-0134" });
  expect(r.status).toBe(201);
  const id = r.body.merchant.id as string;
  const base = `/v1/merchants/${id}/onboarding/solo`;
  await call(env, token, "POST", `${base}/privacy`, { visibility: "area", address: STREET });
  await call(env, token, "POST", `${base}/services`, { items: [{ name: "Gel manicure", durationMin: 60, priceCents: 5500, depositCents: 1500 }] });
  await call(env, token, "POST", `${base}/hours`, { days: [{ weekday: 3, startsLocal: "10:00", endsLocal: "18:00" }] });
  // Deposits need the shop's Stripe account.
  const payments = fake(env);
  const { accountId } = await payments.createConnectedAccount({ merchantId: id, businessName: "Nails by Mo" });
  payments.completeOnboarding(accountId);
  await env.db.update(merchants).set({ status: "active", stripeAccountId: accountId, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true }).where(eq(merchants.id, id));
  const [m] = await env.db.select().from(merchants).where(eq(merchants.id, id));
  return { id, token, owner, slug: m!.slug };
}

const leaks = (body: unknown) => JSON.stringify(body).includes("Willard") || JSON.stringify(body).includes("M6S 2K1");

describe("before booking, the address is nowhere", () => {
  it("shop page, map list and booking page show the area line and the offset pin only", async () => {
    const s = await homeStudio();
    const shop = await call(env, null, "GET", `/v1/public/shops/${s.slug}`);
    expect(shop.status).toBe(200);
    expect(leaks(shop.body)).toBe(false);
    expect(shop.body.locations[0]).toMatchObject({ address: "Bloor West area", addressVisibility: "area", areaLabel: "Bloor West", postalCode: null });
    expect(shop.body.locations[0].lat).not.toBeCloseTo(43.6512, 4);

    const list = await call(env, null, "GET", "/v1/network/shops?lat=43.6512&lng=-79.4801&limit=50");
    const item = list.body.items.find((x: { merchant: { id: string } }) => x.merchant.id === s.id);
    expect(item).toBeTruthy();
    expect(leaks(list.body)).toBe(false);
    // Distance is to the public pin, never the real one (no triangulation from the distance).
    expect(item.distanceMetres).toBeGreaterThan(50);

    const book = await call(env, null, "GET", `/v1/public/shops/${s.slug}/services`);
    expect(leaks(book.body)).toBe(false);
    expect(book.body.shop).toMatchObject({ address: null, addressVisibility: "area", placeLine: "Bloor West area" });

    // Final audit: the order-ahead menu and the class schedule carried the raw street before; both show the area line now.
    const { featureOverrides } = await import("@ll/db");
    await env.db.insert(featureOverrides).values([{ merchantId: s.id, key: "orders.order_ahead", enabled: true }, { merchantId: s.id, key: "booking.classes", enabled: true }]);
    const menu = await call(env, null, "GET", `/v1/public/shops/${s.slug}/menu`);
    expect(menu.status).toBe(200);
    expect(leaks(menu.body)).toBe(false);
    expect(menu.body.locations[0].address).toBe("Bloor West area");
    const classes = await call(env, null, "GET", `/v1/public/shops/${s.slug}/classes`);
    expect(classes.status).toBe(200);
    expect(leaks(classes.body)).toBe(false);
  });

  it("is not on the wallet pass and not in a promo footer", async () => {
    const s = await homeStudio();
    const c = await customer(env);
    await env.db.insert(merchantMembers).values({ merchantId: s.id, userId: c.user.id, balance: 1, visitCount: 1 });
    expect(await passLocations(env.ctx, c.user.id)).toEqual([]);
    expect(await merchantAddress(env.db, s.id)).toBe("Bloor West area");
  });
});

describe("after booking", () => {
  it("is held back during the deposit step and released once the deposit is paid, in the booking, the text and the reminder", async () => {
    const s = await homeStudio();
    const svc = (await call(env, null, "GET", `/v1/public/shops/${s.slug}/services`)).body.services[0];
    // No app: the confirmation and the reminder go by text, so the outbox shows them.
    const c = await customer(env, { pushToken: false });
    const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [svc.id], startsAt: "2026-11-04T16:00:00.000Z" });
    expect(r.status).toBe(201);
    expect(r.body.appointment.pending).toBe(true);
    expect(r.body.appointment.merchant).toMatchObject({ address: null, addressPrivate: true, placeLine: "Bloor West area" });
    expect(leaks((await call(env, c.token, "GET", `/v1/me/appointments/${r.body.appointment.id}`)).body)).toBe(false);

    await deliver(env, fake(env).succeedPaymentIntent(r.body.deposit.paymentIntentId));
    const after = await call(env, c.token, "GET", `/v1/me/appointments/${r.body.appointment.id}`);
    expect(after.body.appointment).toMatchObject({ pending: false, merchant: { address: STREET, addressPrivate: true } });
    const text = env.ctx.providers.outbox.sms.filter((m: { to: string }) => m.to === c.user.phone).at(-1)!;
    expect(text.body).toContain(STREET);

    // Another client, who has not booked, still sees nothing.
    const other = await customer(env);
    expect(leaks((await call(env, other.token, "GET", "/v1/me/appointments")).body)).toBe(false);

    // The day-before reminder repeats it.
    env.clock.now = new Date("2026-11-03T17:00:00Z");
    await sendReminders(env.ctx);
    expect(env.ctx.providers.outbox.sms.filter((m: { to: string }) => m.to === c.user.phone).at(-1)!.body).toContain(STREET);

    // A cancellation does not keep it (a fresh token: the clock moved past the access-token lifetime).
    c.token = await tokenFor(env, c.user);
    await env.db.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, r.body.appointment.id));
    const gone = await call(env, c.token, "GET", `/v1/me/appointments/${r.body.appointment.id}`);
    expect(gone.body.appointment).toMatchObject({ status: "cancelled", merchant: { address: null } });
  });

  it("a storefront keeps its address public", async () => {
    const owner = await createUser(env.db, {});
    const token = await tokenFor(env, owner);
    const r = await call(env, token, "POST", "/v1/merchants", { name: "Corner Café", vertical: "cafe", address: "2210 Danforth Ave", phone: "(416) 555-0134" });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, r.body.merchant.id));
    const shop = await call(env, null, "GET", `/v1/public/shops/${m!.slug}`);
    expect(shop.body.locations[0]).toMatchObject({ address: "2210 Danforth Ave", addressVisibility: "exact" });
  });
});
