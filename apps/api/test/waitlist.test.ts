/**
 * phase-pro P2: the waitlist that fills cancelled slots (docs/business/pro-value.md §3.2 P2). Join from a full day, the offer on a
 * cancellation (Pro: a two-hour hold and a message; Free: nothing sent), take within the hold, 410 after it, the next match after a
 * lapse with the 3-offer cap, the owner's switch, manual offers, texts inside the plan's allowance, and the counters.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointmentWaitlist, appointments, merchantSignals, merchants, messageDeliveries, notifications, users, waitlistFreedSlots } from "@ll/db";
import { smsSegments, waitlistApi } from "@ll/shared";
import { zonedToUtc } from "../src/services/bookings.js";
import { offerTexts, runWaitlist } from "../src/services/waitlist.js";
import { call, customer, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") }); // Tue 10:00 in Toronto
});
afterEach(async () => env.close());

const DAY = "2026-11-04"; // Wednesday
const at = (local: string) => {
  const [d, t] = local.split(" ") as [string, string];
  const [h, m] = t.split(":").map(Number) as [number, number];
  return zonedToUtc(d, h * 60 + m, "America/Toronto").toISOString();
};
const later = (min: number) => {
  env.clock.now = new Date(env.clock.now.getTime() + min * 60_000);
};

/**
 * A nail tech who works Wednesday 9 to 11 only, with a 60-minute gel fill and a 10-minute buffer: one booking at 9:00 fills the day.
 */
async function studio(plan: "free" | "plus" = "plus") {
  const m = await paidMerchant(env, { plan, vertical: "nails", connect: false });
  const base = `/v1/merchants/${m.merchant.id}`;
  const tech = await staffMember(env, m.merchant.id, "staff");
  await env.db.update(users).set({ name: "Priya Nail" }).where(eq(users.id, tech.user.id));
  const owner = m.ownerToken;
  const gel = (await call(env, owner, "POST", `${base}/services`, { name: "Gel fill", durationMin: 60, priceCents: 5500, bufferMin: 10 })).body;
  expect((await call(env, owner, "PUT", `${base}/staff/${tech.user.id}/hours`, { days: [{ weekday: 3, startsLocal: "09:00", endsLocal: "11:00" }] })).status).toBe(200);
  const first = await customer(env, { name: "Ayesha Khan" });
  const booked = await call(env, owner, "POST", `${base}/appointments`, { serviceIds: [gel.id], staffId: tech.user.id, startsAt: at(`${DAY} 09:00`), customer: { userId: first.user.id } });
  expect(booked.status).toBe(201);
  return { ...m, base, owner, tech, gel, first, appt: booked.body };
}
type Studio = Awaited<ReturnType<typeof studio>>;

const times = async (s: Studio) => (await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/availability?serviceIds=${s.gel.id}&staffId=any&from=${DAY}&to=${DAY}`)).body.days[0].times as { startsAt: string }[];
const join = (s: Studio, token: string | null, body: Record<string, unknown> = {}) => call(env, token, "POST", `/v1/public/shops/${s.merchant.slug}/waitlist`, { serviceId: s.gel.id, windowStart: DAY, windowEnd: DAY, timePref: "morning", ...body });
const entry = async (id: string) => (await env.db.select().from(appointmentWaitlist).where(eq(appointmentWaitlist.id, id)))[0]!;
const cancel = (s: Studio) => call(env, s.owner, "POST", `${s.base}/appointments/${s.appt.id}/status`, { status: "cancelled", chargeFee: false });
const signal = async (merchantId: string, key: string) => (await env.db.select().from(merchantSignals).where(and(eq(merchantSignals.merchantId, merchantId), eq(merchantSignals.key, key))))[0];

describe("matching rules", { timeout: 120_000 }, () => {
  it("parts of the day", () => {
    expect(waitlistApi.fitsTimePref("morning", 9 * 60)).toBe(true);
    expect(waitlistApi.fitsTimePref("morning", 12 * 60)).toBe(false);
    expect(waitlistApi.fitsTimePref("afternoon", 12 * 60)).toBe(true);
    expect(waitlistApi.fitsTimePref("afternoon", 17 * 60)).toBe(false);
    expect(waitlistApi.fitsTimePref("evening", 17 * 60 + 30)).toBe(true);
    expect(waitlistApi.fitsTimePref("any", 3 * 60)).toBe(true);
  });

  it("the offer text is one segment with the link and STOP; the push stays under the push limit", () => {
    const now = new Date("2026-11-03T15:00:00Z");
    const m = { name: "Priya Nails & Beauty Studio", timezone: "America/Toronto" };
    const msg = offerTexts(env.ctx, m, { token: "abcdefghijklmnop", startsAt: new Date(at("2026-11-08 14:00")), offeredAt: now, expiresAt: new Date(now.getTime() + 120 * 60_000), service: "Gel fill with nail art and removal" }, "en");
    expect(smsSegments(msg.text)).toBe(1);
    expect(msg.text).toContain("/w/abcdefghijklmnop");
    expect(msg.text).toMatch(/STOP/);
    expect(msg.body.length).toBeLessThanOrEqual(180);
    expect(msg.body).toContain("It's yours for 2 hours");
    // A slot that starts within two hours is held until a quarter of an hour before it.
    const soon = offerTexts(env.ctx, m, { token: "abcdefghijklmnop", startsAt: new Date(now.getTime() + 60 * 60_000), offeredAt: now, expiresAt: new Date(now.getTime() + 45 * 60_000), service: "Gel fill" }, "en");
    expect(soon.body).toContain("It's yours until");
  });
});

describe("Pro: full day, join, cancel, offer, take", { timeout: 120_000 }, () => {
  it("offers the freed slot to the first match within a job tick, holds it two hours, and books it in one tap", async () => {
    const s = await studio();
    expect(await times(s)).toEqual([]);
    const info = await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/waitlist?from=${DAY}&to=2026-11-05`);
    expect(info.body).toEqual({ open: true, workDays: [DAY] });

    const b = await customer(env, { name: "Bina Patel" });
    const c = await customer(env, { name: "Chandni Rao" });
    const jb = await join(s, b.token);
    expect(jb.status).toBe(201);
    expect(jb.body).toMatchObject({ status: "waiting", serviceName: "Gel fill", windowStart: DAY, windowEnd: DAY, timePref: "morning", offer: null, merchant: { slug: s.merchant.slug } });
    later(1);
    const jc = await join(s, c.token);
    expect(jc.status).toBe(201);
    // Asking again for the same service widens the ask instead of a second place in the line.
    expect((await join(s, b.token, { windowEnd: "2026-11-05", timePref: "any" })).body.id).toBe(jb.body.id);
    expect((await signal(s.merchant.id, "waitlist_asks"))?.count).toBe(2);

    const list = await call(env, s.owner, "GET", `${s.base}/waitlist`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ waiting: 2, autoOffer: true });
    expect(list.body.items.map((e: { customer: { name: string } }) => e.customer.name)).toEqual(["Bina Patel", "Chandni Rao"]);

    // The cancel confirm's preview: two waiting, both can take 9:00.
    expect((await call(env, s.owner, "GET", `${s.base}/waitlist/slots/${s.appt.id}`)).body).toEqual({ waiting: 2, matching: 2, autoOffer: true, offer: true });

    expect((await cancel(s)).status).toBe(200);
    await runWaitlist(env.ctx);
    const eb = await entry(jb.body.id);
    expect(eb.status).toBe("offered");
    expect(eb.offerExpiresAt!.getTime() - env.clock.now.getTime()).toBe(120 * 60_000);
    expect((await entry(jc.body.id)).status).toBe("waiting");
    const [hold] = await env.db.select().from(appointments).where(eq(appointments.id, eb.offeredAppointmentHoldId!));
    expect(hold).toMatchObject({ source: "waitlist", userId: null, status: "booked", customerName: "Bina Patel", startsAt: new Date(at(`${DAY} 09:00`)) });
    // The hold blocks the chair for everyone else.
    expect(await times(s)).toEqual([]);
    // Bina was told by push, with the Take-it link.
    const [n] = await env.db.select().from(notifications).where(eq(notifications.userId, b.user.id));
    expect(n!.title).toBe(`A spot opened at ${s.merchant.name}`);
    expect(n!.body).toContain("Gel fill");
    expect((n!.data as { url: string }).url).toBe(`/w/${eb.offerToken}`);
    expect((await signal(s.merchant.id, "cancellations"))?.count).toBe(1);

    // The calendar chip.
    const day = await call(env, s.owner, "GET", `${s.base}/waitlist?day=${DAY}`);
    expect(day.body.slots).toHaveLength(1);
    expect(day.body.slots[0]).toMatchObject({ status: "offered", offers: 1, offer: { name: "Bina" } });

    // Her list on the pass and in the app shows the open offer.
    const mine = await call(env, b.token, "GET", "/v1/me/waitlist");
    expect(mine.body.items[0]).toMatchObject({ status: "offered", offer: { token: eb.offerToken, startsAt: at(`${DAY} 09:00`) } });

    // Take it.
    const page = await call(env, null, "GET", `/v1/public/w/${eb.offerToken}`);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ state: "open", serviceName: "Gel fill", staffName: "Priya", priceCents: 5500, merchant: { slug: s.merchant.slug } });
    later(30);
    const took = await call(env, null, "POST", `/v1/public/w/${eb.offerToken}/take`);
    expect(took.status).toBe(200);
    const [booked] = await env.db.select().from(appointments).where(eq(appointments.id, took.body.appointmentId));
    expect(booked).toMatchObject({ userId: b.user.id, holdExpiresAt: null, status: "booked" });
    expect((await entry(jb.body.id)).status).toBe("booked");
    expect((await entry(jc.body.id)).status).toBe("waiting");
    expect((await env.db.select().from(waitlistFreedSlots).where(eq(waitlistFreedSlots.merchantId, s.merchant.id)))[0]).toMatchObject({ status: "filled", filledAppointmentId: booked!.id });
    expect(await signal(s.merchant.id, "waitlist_fills")).toMatchObject({ count: 1, amountCents: 5500 });
    // It is her booking now: the calendar and her own list show it.
    expect((await call(env, b.token, "GET", "/v1/me/appointments")).body.items.map((a: { id: string }) => a.id)).toContain(booked!.id);
    expect((await call(env, s.owner, "GET", `${s.base}/appointments?from=${at(`${DAY} 00:00`)}&to=${at("2026-11-05 00:00")}`)).body.items.map((a: { id: string }) => a.id)).toContain(booked!.id);
    // The link now shows the booking; tapping it again is harmless.
    expect((await call(env, null, "GET", `/v1/public/w/${eb.offerToken}`)).body).toMatchObject({ state: "booked", appointmentId: booked!.id });
    expect((await call(env, null, "POST", `/v1/public/w/${eb.offerToken}/take`)).body.appointmentId).toBe(booked!.id);
  });

  it("a lapsed hold goes to the next match, three offers at most; a late tap gets 410 That spot was taken", async () => {
    const s = await studio();
    const people = [];
    for (const name of ["Bina", "Chandni", "Dia", "Esha"]) {
      const p = await customer(env, { name });
      people.push({ ...p, id: (await join(s, p.token)).body.id as string });
      later(1);
    }
    await cancel(s);
    const first = await entry(people[0]!.id);
    expect(first.status).toBe("offered");
    const lateToken = first.offerToken!;

    later(121);
    await runWaitlist(env.ctx);
    expect((await entry(people[0]!.id)).status).toBe("expired");
    expect((await entry(people[1]!.id)).status).toBe("offered");
    const lateTake = await call(env, null, "POST", `/v1/public/w/${lateToken}/take`);
    expect(lateTake.status).toBe(410);
    expect(lateTake.body.error).toMatchObject({ code: "offer_gone", message: "That spot was taken." });

    // Dia removes herself before her turn; Esha is next.
    expect((await call(env, await tokenFor(env, people[2]!.user), "DELETE", `/v1/me/waitlist/${people[2]!.id}`)).status).toBe(204);
    later(121);
    await runWaitlist(env.ctx);
    expect((await entry(people[1]!.id)).status).toBe("expired");
    expect((await entry(people[3]!.id)).status).toBe("offered");

    // Third offer lapses: the slot is left open for anyone to book.
    later(121);
    await runWaitlist(env.ctx);
    const [slot] = await env.db.select().from(waitlistFreedSlots).where(eq(waitlistFreedSlots.merchantId, s.merchant.id));
    expect(slot).toMatchObject({ status: "unfilled", offers: 3 });
  });

  it("a client who cancels their own booking frees the slot too", async () => {
    const s = await studio();
    const b = await customer(env, { name: "Bina" });
    const jb = await join(s, b.token);
    const r = await call(env, s.first.token, "POST", `/v1/me/appointments/${s.appt.id}/cancel`);
    expect(r.status).toBe(200);
    expect((await entry(jb.body.id)).status).toBe("offered");
  });

  it("the owner's switch off keeps the slot from the waitlist", async () => {
    const s = await studio();
    const b = await customer(env, { name: "Bina" });
    const jb = await join(s, b.token);
    expect((await call(env, s.owner, "PUT", `${s.base}/waitlist/slots/${s.appt.id}`, { offer: false })).body).toMatchObject({ offer: false });
    await cancel(s);
    await runWaitlist(env.ctx);
    expect((await entry(jb.body.id)).status).toBe("waiting");
    expect((await env.db.select().from(waitlistFreedSlots).where(eq(waitlistFreedSlots.merchantId, s.merchant.id)))[0]!.status).toBe("skipped");
    expect((await times(s)).map((x) => x.startsAt)).toContain(at(`${DAY} 09:00`));
  });

  it("a client with no app and no email gets a text inside the shop's monthly texts", async () => {
    const s = await studio();
    const phoneOnly = await customer(env, { name: "Farah", pushToken: false });
    await env.db.update(users).set({ email: null }).where(eq(users.id, phoneOnly.user.id));
    await join(s, phoneOnly.token);
    const before = (await env.db.select({ used: merchants.smsCreditsUsed }).from(merchants).where(eq(merchants.id, s.merchant.id)))[0]!.used;
    await cancel(s);
    const [text] = await env.db.select().from(messageDeliveries).where(and(eq(messageDeliveries.userId, phoneOnly.user.id), eq(messageDeliveries.channel, "sms")));
    expect(text).toMatchObject({ status: "sent", kind: "transactional" });
    expect(text!.body).toContain("/w/");
    expect(smsSegments(text!.body)).toBe(1);
    const after = (await env.db.select({ used: merchants.smsCreditsUsed }).from(merchants).where(eq(merchants.id, s.merchant.id)))[0]!.used;
    expect(after).toBe(before + 1);
  });

  it("the owner adds a client by hand and offers one of the next openings", async () => {
    const s = await studio();
    const add = await call(env, s.owner, "POST", `${s.base}/waitlist`, { serviceId: s.gel.id, windowStart: DAY, windowEnd: DAY, timePref: "any", name: "Gita Sharma", phone: "416-555-0199" });
    expect(add.status).toBe(201);
    expect(add.body).toMatchObject({ status: "waiting", source: "staff", customer: { name: "Gita Sharma", phone: "+14165550199" } });
    // The day is full: no openings to offer.
    expect((await call(env, s.owner, "GET", `${s.base}/waitlist/${add.body.id}/openings`)).body.items).toEqual([]);
    // Owner moves Ayesha out by hand (cancel with the switch off), then offers 9:00 to Gita herself.
    await call(env, s.owner, "PUT", `${s.base}/waitlist/slots/${s.appt.id}`, { offer: false });
    await cancel(s);
    const open = await call(env, s.owner, "GET", `${s.base}/waitlist/${add.body.id}/openings`);
    expect(open.body.items[0]).toMatchObject({ startsAt: at(`${DAY} 09:00`), staffId: s.tech.user.id, staffName: "Priya Nail" });
    const offered = await call(env, s.owner, "POST", `${s.base}/waitlist/${add.body.id}/offer`, { startsAt: open.body.items[0].startsAt, staffId: s.tech.user.id });
    expect(offered.status).toBe(200);
    expect(offered.body).toMatchObject({ status: "offered", offeredSlot: { startsAt: at(`${DAY} 09:00`) } });
    // Remove from the list: the hold is released.
    expect((await call(env, s.owner, "DELETE", `${s.base}/waitlist/${add.body.id}`)).status).toBe(204);
    expect((await times(s)).map((x) => x.startsAt)).toContain(at(`${DAY} 09:00`));
  });

  it("signed out: a name and a phone or email are needed; asks are capped per client", async () => {
    const s = await studio();
    expect((await join(s, null)).status).toBe(400);
    expect((await join(s, null, { name: "Hina" })).status).toBe(400);
    const ok = await join(s, null, { name: "Hina", phone: "(416) 555-0142" });
    expect(ok.status).toBe(201);
    const [row] = await env.db.select().from(appointmentWaitlist).where(eq(appointmentWaitlist.id, ok.body.id));
    expect(row).toMatchObject({ customerName: "Hina", customerPhone: "+14165550142", source: "online" });
    expect(row!.userId).toBeTruthy();
    // A service from another shop is refused.
    const other = await studio();
    expect((await join(s, null, { name: "Hina", phone: "4165550142", serviceId: other.gel.id })).status).toBe(400);
  });
});

describe("Free", { timeout: 120_000 }, () => {
  it("stores the ask and the slot, shows them, and sends nothing; the manual offer is a paid feature", async () => {
    const s = await studio("free");
    const b = await customer(env, { name: "Bina" });
    const jb = await join(s, b.token);
    expect(jb.status).toBe(201);
    await cancel(s);
    await runWaitlist(env.ctx);
    expect((await entry(jb.body.id)).status).toBe("waiting");
    expect(await env.db.select().from(notifications).where(eq(notifications.userId, b.user.id))).toEqual([]);
    expect(await env.db.select().from(messageDeliveries).where(eq(messageDeliveries.userId, b.user.id))).toEqual([]);
    const day = await call(env, s.owner, "GET", `${s.base}/waitlist?day=${DAY}`);
    expect(day.body).toMatchObject({ autoOffer: false, waiting: 1 });
    expect(day.body.slots[0]).toMatchObject({ status: "locked", matching: 1 });
    expect((await call(env, s.owner, "GET", `${s.base}/waitlist/slots/${s.appt.id}`)).body).toMatchObject({ autoOffer: false, waiting: 1 });
    expect((await signal(s.merchant.id, "cancellations"))?.count).toBe(1);
    expect((await call(env, s.owner, "POST", `${s.base}/waitlist/${jb.body.id}/offer`, { startsAt: at(`${DAY} 09:00`), staffId: s.tech.user.id })).status).toBe(402);
    // The slot is simply free again for anyone to book.
    expect((await times(s)).map((x) => x.startsAt)).toContain(at(`${DAY} 09:00`));
  });
});

describe("access", { timeout: 120_000 }, () => {
  it("another shop's staff and other clients can't see or change it", async () => {
    const s = await studio();
    const b = await customer(env, { name: "Bina" });
    const jb = await join(s, b.token);
    const stranger = await createUser(env.db);
    const strangerToken = await tokenFor(env, stranger);
    expect((await call(env, strangerToken, "GET", `${s.base}/waitlist`)).status).toBe(403);
    expect((await call(env, strangerToken, "DELETE", `/v1/me/waitlist/${jb.body.id}`)).status).toBe(404);
    expect((await call(env, null, "POST", "/v1/public/w/not-a-real-token/take")).status).toBe(410);
  });
});
