/**
 * phase-pro P3: regulars come back. The channel ladder (app push, web push, email, text), automatic mode on Pro and not on Free, the
 * book-again link and the booking it counts, results, the public welcome, and win-back in appointment words.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, invoices, merchantMembers, merchants, pushTokens, rebookingNudges, services, webPushSubscriptions } from "@ll/db";
import { handleInboundSms, runAutomations, winBackDefaults } from "../src/services/messaging.js";
import { attributeBooking, rebookingResults, runRebookNudges } from "../src/services/rebooking.js";
import { createTestEnv, createUser, grantFeatures, tokenFor, type TestEnv } from "./helpers.js";
import { call, paidMerchant, setStage } from "./commerce-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

type M = Awaited<ReturnType<typeof paidMerchant>>;
const base = (m: M) => `/v1/merchants/${m.merchant.id}`;
const DAY = 86_400_000;

/** A shop with a $60 cut due every 28 days; one client who paid for it `daysAgo` days ago, with the contact details given. */
async function setup(opts: { daysAgo?: number; plan?: "free" | "plus" | "pro"; client?: { phone?: string | null; email?: string | null; name?: string } } = {}) {
  const m = await paidMerchant(env, { plan: opts.plan ?? "plus" });
  if ((opts.plan ?? "plus") !== "free") await grantFeatures(env, m.merchant.id, ["service.rebooking"]);
  const [svc] = await env.db.insert(services).values({ merchantId: m.merchant.id, kind: "appointment", name: "Gel set", durationMin: 60, priceCents: 6000, rebookAfterDays: 28 }).returning();
  const cust = await createUser(env.db, { name: opts.client?.name ?? "Ayesha Khan", ...(opts.client && "phone" in opts.client ? { phone: opts.client.phone } : {}), email: opts.client?.email ?? null });
  const [member] = await env.db.insert(merchantMembers).values({ merchantId: m.merchant.id, userId: cust.id, marketingConsentAt: new Date(), marketingConsentSource: "test" }).returning();
  const paidAt = new Date(env.clock.now.getTime() - (opts.daysAgo ?? 30) * DAY);
  await env.db.insert(invoices).values({ merchantId: m.merchant.id, userId: cust.id, number: 1, lineItems: [{ description: "Gel set", quantity: 1, unitPriceCents: 6000, serviceId: svc!.id }], subtotalCents: 6000, totalCents: 6000, amountDueCents: 0, status: "paid", payToken: `tok-${Math.random().toString(36).slice(2)}-xxxxxxxxxx`, paidAt, createdAt: paidAt });
  return { m, svc: svc!, cust, member: member! };
}
const rowFor = async (m: M) => (await call(env, m.ownerToken, "GET", `${base(m)}/rebooking?state=due`)).body.items[0];
const send = (m: M, userId: string, serviceId: string) => call(env, m.ownerToken, "POST", `${base(m)}/rebooking/${userId}/${serviceId}/send`);

describe("the channel ladder", () => {
  it("picks email for a client with no app, no web pass and no phone, and the email carries a working book-again link and an unsubscribe", async () => {
    const { m, svc, cust } = await setup({ client: { phone: null, email: "ayesha@example.com" } });
    expect(await rowFor(m)).toMatchObject({ channel: "email", canSend: true });
    const r = await send(m, cust.id, svc.id);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ channel: "email" });
    const mail = env.ctx.providers.outbox.email.at(-1)!;
    expect(mail.to).toBe("ayesha@example.com");
    expect(mail.text).toContain("Gel set");
    expect(mail.text).toContain("Unsubscribe:");
    const [nudge] = await env.db.select().from(rebookingNudges);
    expect(nudge).toMatchObject({ action: "sent", channel: "email", userId: cust.id });
    expect(mail.text).toContain(`/shops/${m.merchant.slug}/book?service=${svc.id}&rebook=${nudge!.id}`);
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);
  });

  it("goes app push, then web push, then email, then text, cheapest first", async () => {
    const withText = await setup({ client: { email: "a@example.com" } });
    expect((await rowFor(withText.m)).channel).toBe("email");
    await env.db.insert(webPushSubscriptions).values({ userId: withText.cust.id, endpoint: "https://push.example/1", keys: { p256dh: "x", auth: "y" } });
    expect((await rowFor(withText.m)).channel).toBe("web_push");
    await env.db.insert(pushTokens).values({ userId: withText.cust.id, token: "ExponentPushToken[ayesha]", platform: "ios" });
    expect((await rowFor(withText.m)).channel).toBe("push");
    const sent = await send(withText.m, withText.cust.id, withText.svc.id);
    expect(sent.body).toEqual({ channel: "push" });
    expect(env.ctx.providers.outbox.push.at(-1)!.data).toMatchObject({ type: "rebook", serviceId: withText.svc.id });
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);

    const phoneOnly = await setup({ client: { email: null } });
    expect((await rowFor(phoneOnly.m)).channel).toBe("sms");
  });

  it("a client who replied STOP drops out, and a client who has not agreed to messages cannot be sent anything", async () => {
    const { m, svc, cust } = await setup({ client: { email: "stop@example.com" } });
    expect((await rowFor(m)).canSend).toBe(true);
    await handleInboundSms(env.ctx, cust.phone!, "STOP");
    expect((await rowFor(m)).canSend).toBe(false);
    expect((await send(m, cust.id, svc.id)).status).toBe(409);
    expect(env.ctx.providers.outbox.email).toHaveLength(0);
  });

  it("sends at most two reminders without a visit in between", async () => {
    const { m, svc, cust } = await setup({ client: { email: "twice@example.com" } });
    expect((await send(m, cust.id, svc.id)).status).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 29 * DAY);
    m.ownerToken = await tokenFor(env, m.owner);
    expect((await send(m, cust.id, svc.id)).status).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 60 * DAY);
    m.ownerToken = await tokenFor(env, m.owner);
    expect(await rowFor(m)).toBeUndefined();
    expect((await send(m, cust.id, svc.id)).status).toBe(409);
    expect(env.ctx.providers.outbox.email).toHaveLength(2);
  });
});

describe("automatic mode", () => {
  const tenAm = () => {
    env.clock.now = new Date("2026-11-03T15:00:00Z"); // 10:00 in Toronto
  };

  it("sends the daily reminders on Pro, three days ahead at most, and not on Free", async () => {
    const pro = await setup({ daysAgo: 25, client: { email: "pro@example.com" } }); // due in 3 days
    tenAm();
    await env.db.update(invoices).set({ paidAt: new Date(env.clock.now.getTime() - 25 * DAY) }).where(eq(invoices.merchantId, pro.m.merchant.id));
    const mode = await call(env, pro.m.ownerToken, "PUT", `${base(pro.m)}/rebooking/settings`, { mode: "auto" });
    expect(mode.status).toBe(200);
    expect(mode.body).toMatchObject({ auto: true, mode: "auto", canAuto: true });
    expect((await env.db.select().from(merchants).where(eq(merchants.id, pro.m.merchant.id)))[0]).toMatchObject({ rebookingMode: "auto", rebookAuto: true });
    expect(await runRebookNudges(env.ctx)).toBe(1);
    expect(env.ctx.providers.outbox.email).toHaveLength(1);
    expect(await runRebookNudges(env.ctx)).toBe(0); // once per cycle

    // Due in six days: on the list, but too early for the automatic send.
    const early = await setup({ daysAgo: 22, client: { email: "early@example.com", name: "Early Bird" } });
    await env.db.update(merchants).set({ rebookingMode: "auto" }).where(eq(merchants.id, early.m.merchant.id));
    await env.db.update(invoices).set({ paidAt: new Date(env.clock.now.getTime() - 22 * DAY) }).where(eq(invoices.merchantId, early.m.merchant.id));
    expect(await runRebookNudges(env.ctx)).toBe(0);
  });

  it("a Free shop cannot turn it on, and a shop that falls back to Free is not sent for", async () => {
    const free = await setup({ plan: "free", client: { email: "free@example.com" } });
    await setStage(env, ["service.rebooking"], "ga");
    const refused = await call(env, free.m.ownerToken, "PUT", `${base(free.m)}/rebooking/settings`, { mode: "auto" });
    expect(refused.status).toBe(402);
    // A stale "auto" on a shop whose plan no longer includes it (a trial that ended) sends nothing.
    await env.db.update(merchants).set({ rebookingMode: "auto", rebookAuto: true }).where(eq(merchants.id, free.m.merchant.id));
    tenAm();
    await env.db.update(invoices).set({ paidAt: new Date(env.clock.now.getTime() - 30 * DAY) }).where(eq(invoices.merchantId, free.m.merchant.id));
    expect(await runRebookNudges(env.ctx)).toBe(0);
    expect(env.ctx.providers.outbox.email).toHaveLength(0);
  });

  it("review and off are kept, and the old on/off call still works", async () => {
    const { m } = await setup();
    expect((await call(env, m.ownerToken, "PUT", `${base(m)}/rebooking/settings`, { mode: "off" })).body).toMatchObject({ mode: "off", auto: false });
    expect((await call(env, m.ownerToken, "PUT", `${base(m)}/rebooking/settings`, { auto: true })).body).toEqual({ auto: true });
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/rebooking`)).body.settings).toMatchObject({ mode: "auto", auto: true, canAuto: true });
    expect((await call(env, m.ownerToken, "PUT", `${base(m)}/rebooking/settings`, {})).status).toBe(400);
  });
});

describe("the book-again link and the results", () => {
  it("counts the booking a link leads to, with its value, and shows it in the results", async () => {
    const { m, svc, cust } = await setup({ client: { email: "link@example.com" } });
    await send(m, cust.id, svc.id);
    const [nudge] = await env.db.select().from(rebookingNudges);
    const [appt] = await env.db
      .insert(appointments)
      .values({ merchantId: m.merchant.id, locationId: m.location.id, userId: cust.id, items: [{ serviceId: svc.id, name: "Gel set", durationMin: 60, priceCents: 6000 }], startsAt: new Date(env.clock.now.getTime() + 2 * DAY), endsAt: new Date(env.clock.now.getTime() + 2 * DAY + 3600_000), status: "booked" })
      .returning();
    await attributeBooking(env.ctx, appt!, nudge!.id);
    expect((await env.db.select().from(rebookingNudges))[0]!.bookedAppointmentId).toBe(appt!.id);
    const r = await call(env, m.ownerToken, "GET", `${base(m)}/rebooking/results`);
    expect(r.status).toBe(200);
    expect(r.body.month).toEqual({ sent: 1, booked: 1, amountCents: 6000 });
    expect(r.body.week).toEqual({ sent: 1, booked: 1, amountCents: 6000 });
    // The reminders and the booking are in the overview's stats too.
    expect((await call(env, m.ownerToken, "GET", `${base(m)}/rebooking`)).body.stats).toMatchObject({ sentLast30: 1, sentEmail: 1, bookedWithin7Days: 1 });
    // A cancelled booking is not a win.
    await env.db.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, appt!.id));
    expect((await rebookingResults(env.ctx, m.merchant)).month).toEqual({ sent: 1, booked: 0, amountCents: 0 });
  });

  it("counts a booking made without the link when it follows a reminder within a week, and one reminder only once", async () => {
    const { m, svc, cust } = await setup({ client: { email: "nolink@example.com" } });
    await send(m, cust.id, svc.id);
    const mk = async () =>
      (await env.db.insert(appointments).values({ merchantId: m.merchant.id, locationId: m.location.id, userId: cust.id, items: [{ serviceId: svc.id, name: "Gel set", durationMin: 60, priceCents: 6000 }], startsAt: new Date(env.clock.now.getTime() + 2 * DAY), endsAt: new Date(env.clock.now.getTime() + 2 * DAY + 3600_000), status: "booked" }).returning())[0]!;
    await attributeBooking(env.ctx, await mk(), "not-a-real-id");
    await attributeBooking(env.ctx, await mk(), null);
    expect((await rebookingResults(env.ctx, m.merchant)).month).toEqual({ sent: 1, booked: 1, amountCents: 6000 });
  });

  it("opens the book-again welcome with the first name and the service, and nothing for a made-up id", async () => {
    const { m, svc, cust } = await setup({ client: { email: "welcome@example.com", name: "Ayesha Khan" } });
    await send(m, cust.id, svc.id);
    const [nudge] = await env.db.select().from(rebookingNudges);
    const ok = await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/rebook/${nudge!.id}`);
    expect(ok.body).toEqual({ firstName: "Ayesha", serviceId: svc.id, staffId: null });
    const wrongShop = await call(env, null, "GET", `/v1/public/shops/not-this-shop/rebook/${nudge!.id}`);
    expect(wrongShop.body).toEqual({ firstName: null, serviceId: null, staffId: null });
    expect((await call(env, null, "GET", `/v1/public/shops/${m.merchant.slug}/rebook/00000000-0000-0000-0000-000000000001`)).body.firstName).toBeNull();
  });
});

describe("win-back in appointment words", () => {
  it("starts from the appointment wording when the shop takes bookings with services, and from the loyalty wording otherwise", async () => {
    const withServices = await setup();
    const appt = await winBackDefaults(env.db, withServices.m.merchant);
    expect(appt.variant).toBe("appointment");
    expect(appt.body).toContain("{{weeks}} weeks since your last {{service}} at {{merchant}}");
    expect(appt.body).toContain("Your usual times are open: {{link}}");

    const bare = await paidMerchant(env, { plan: "plus" });
    const loyalty = await winBackDefaults(env.db, bare.merchant);
    expect(loyalty.variant).toBe("loyalty");
    expect(loyalty.body).toContain("{{balance}}");
  });

  it("the automation fills in each client's weeks, last service and a book-again link", async () => {
    const { m, svc, cust, member } = await setup({ client: { email: "lapsed@example.com" } });
    const ago = new Date(env.clock.now.getTime() - 63 * DAY);
    await env.db.update(merchantMembers).set({ lastVisitAt: ago }).where(eq(merchantMembers.id, member.id));
    await env.db.insert(appointments).values({ merchantId: m.merchant.id, locationId: m.location.id, userId: cust.id, items: [{ serviceId: svc.id, name: "Gel set", durationMin: 60, priceCents: 6000 }], startsAt: ago, endsAt: new Date(ago.getTime() + 3600_000), status: "completed", completedAt: ago });
    const list = await call(env, m.ownerToken, "GET", `${base(m)}/automations`);
    const winBack = list.body.items.find((a: { kind: string }) => a.kind === "win_back");
    expect(winBack.body).toContain("{{service}}");
    const put = await call(env, m.ownerToken, "PUT", `${base(m)}/automations/win_back`, { enabled: true, channel: "email", subject: winBack.subject, body: winBack.body });
    expect(put.status).toBe(200);
    expect(await runAutomations(env.ctx)).toBe(1);
    const mail = env.ctx.providers.outbox.email.at(-1)!;
    expect(mail.text).toContain("it's been 9 weeks since your last Gel set at Test Shop");
    expect(mail.text).toContain(`/shops/${m.merchant.slug}/book?service=${svc.id}`);
    expect(mail.text).not.toContain("{{");
  });
});
