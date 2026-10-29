/**
 * Phase solo, workstream D: the people side. The channel ladder and the text cap, one-segment reminders, promos and their
 * allowance, inbound texts into threads, the Instagram stub and "create booking from message", the client profile and list.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { appointments, conversationMessages, conversations, instagramConnections, locations, merchantMembers, merchants, staffPay, users, webPushSubscriptions } from "@ll/db";
import { smsSegments } from "@ll/shared";
import { createMerchant, createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";
import { call, customer } from "./commerce-fixtures.js";
import { deliverByLadder } from "../src/services/notifications.js";
import { smsAllowance, handleInboundSms } from "../src/services/messaging.js";
import { sendReminders, oneSegmentText } from "../src/services/appointments-booking.js";
import { encryptPayload, webPushOutbox } from "../src/services/web-push.js";
import { parseInstagramWebhook, verifyMetaSignature } from "../src/services/inbox-connectors/instagram.js";
import { translator } from "@ll/shared";
import { createECDH, createHmac } from "node:crypto";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => env.close());
afterEach(() => {
  delete process.env.INSTAGRAM_DM_ENABLED;
});

async function shop(opts: { plan?: "free" | "plus"; vertical?: string } = {}) {
  const m = await createMerchant(env, { vertical: opts.vertical ?? "salon" });
  if (opts.plan) await env.db.update(merchants).set({ plan: opts.plan }).where(eq(merchants.id, m.merchant.id));
  const [loc] = await env.db.insert(locations).values({ merchantId: m.merchant.id, name: "Studio", address: "12 Main St", qrCode: `qr-${m.merchant.id.slice(0, 8)}` }).returning();
  const [fresh] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
  return { ...m, merchant: fresh!, location: loc!, base: `/v1/merchants/${m.merchant.id}` };
}

async function join(merchantId: string, userId: string) {
  const [m] = await env.db.insert(merchantMembers).values({ merchantId, userId, joinedVia: "phone" }).returning();
  return m!;
}

async function member(merchantId: string, data: Partial<typeof users.$inferInsert> = {}, opts: { push?: boolean; consent?: boolean } = {}) {
  const c = await customer(env, { pushToken: opts.push ?? false });
  if (Object.keys(data).length) await env.db.update(users).set(data).where(eq(users.id, c.user.id));
  const mem = await join(merchantId, c.user.id);
  if (opts.consent) await env.db.update(merchantMembers).set({ marketingConsentAt: env.clock.now, marketingConsentSource: "test" }).where(eq(merchantMembers.id, mem.id));
  return { ...c, memberId: mem.id };
}

const ladder = (userId: string, merchantId: string) =>
  deliverByLadder(env.ctx, { userId, merchantId, type: "booking_reminder", title: "Test Shop: reminder", body: "Cut tomorrow at 10:00", textBody: "Test Shop: Cut, Thu 10:00. Change: x/me STOP to opt out" });

describe("the channel ladder", () => {
  it("picks app push, then web push, then email, then a text, and stops at the first that works", async () => {
    const s = await shop();
    const smsBefore = env.ctx.providers.outbox.sms.length;
    const app = await member(s.merchant.id, { email: "a@example.com" }, { push: true });
    expect((await ladder(app.user.id, s.merchant.id)).rung).toBe("push");

    const web = await member(s.merchant.id, { email: "w@example.com" });
    await env.db.insert(webPushSubscriptions).values({ userId: web.user.id, endpoint: `https://push.example.com/${web.user.id}`, keys: { p256dh: "x".repeat(20), auth: "y".repeat(10) } });
    const w0 = webPushOutbox.length;
    expect((await ladder(web.user.id, s.merchant.id)).rung).toBe("web_push");
    expect(webPushOutbox.slice(w0).at(-1)).toMatchObject({ userId: web.user.id, payload: { title: "Test Shop: reminder" } });

    const mail = await member(s.merchant.id, { email: "m@example.com" });
    expect((await ladder(mail.user.id, s.merchant.id)).rung).toBe("email");
    expect(env.ctx.providers.outbox.email.at(-1)).toMatchObject({ to: "m@example.com", subject: "Test Shop: reminder" });

    // None of the above sent a text.
    expect(env.ctx.providers.outbox.sms.length).toBe(smsBefore);

    const phoneOnly = await member(s.merchant.id);
    const before = (await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id)))[0]!.smsCreditsUsed;
    const r = await ladder(phoneOnly.user.id, s.merchant.id);
    expect(r.rung).toBe("sms");
    expect(env.ctx.providers.outbox.sms.at(-1)).toMatchObject({ to: phoneOnly.user.phone });
    const after = (await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id)))[0]!.smsCreditsUsed;
    expect(after).toBe(before + 1);
    // Every send leaves an in-app row.
    expect(r.notificationId).toBeTruthy();
  });

  it("respects the text cap: once the month's texts are used, nothing is texted and the shop's count stays put", async () => {
    const s = await shop({ plan: "free" });
    await env.db.update(merchants).set({ smsCreditsUsed: smsAllowance(s.merchant) }).where(eq(merchants.id, s.merchant.id));
    const phoneOnly = await member(s.merchant.id);
    const n0 = env.ctx.providers.outbox.sms.length;
    const r = await ladder(phoneOnly.user.id, s.merchant.id);
    expect(r).toMatchObject({ rung: "in_app", textCapReached: true });
    expect(env.ctx.providers.outbox.sms.length).toBe(n0);
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    expect(m!.smsCreditsUsed).toBe(smsAllowance(s.merchant));
  });

  it("follows the customer's channel preference", async () => {
    const s = await shop();
    const c = await member(s.merchant.id, { email: "pref@example.com" }, { push: true });
    await env.db.update(merchantMembers).set({ channelPref: "email" }).where(eq(merchantMembers.id, c.memberId));
    expect((await ladder(c.user.id, s.merchant.id)).rung).toBe("email");
    await env.db.update(merchantMembers).set({ channelPref: "text" }).where(eq(merchantMembers.id, c.memberId));
    expect((await ladder(c.user.id, s.merchant.id)).rung).toBe("sms");
  });
});

describe("reminders", () => {
  it("are one text segment, and go by app push when the client has the app", async () => {
    const t = translator("en");
    const long = await oneSegmentText(env.ctx, t, "bk.msg.text24", { shop: "The Very Long Name Lash and Brow Studio", service: "Classic full set, lower lash add-on, brow tint", when: "Thu, Nov 5, 10:00 a.m.", address: "1234 Bloor Street West, Unit 5", link: "localloyalty.ca/me" });
    expect(smsSegments(long)).toBe(1);
    expect(long).toContain("STOP");
    expect(long).toContain("localloyalty.ca/me");

    const s = await shop();
    const app = await member(s.merchant.id, {}, { push: true });
    const textOnly = await member(s.merchant.id);
    const start = new Date(env.clock.now.getTime() + 20 * 3600_000);
    for (const u of [app, textOnly])
      await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: u.user.id, items: [{ serviceId: null, name: "Lash fill", durationMin: 60, priceCents: 6500 }], startsAt: start, endsAt: new Date(start.getTime() + 3600_000), status: "booked", source: "online", createdAt: new Date(env.clock.now.getTime() - 3 * 86_400_000) });
    const sms0 = env.ctx.providers.outbox.sms.length;
    const push0 = env.ctx.providers.outbox.push.length;
    expect(await sendReminders(env.ctx)).toBeGreaterThanOrEqual(2);
    const texts = env.ctx.providers.outbox.sms.slice(sms0);
    expect(texts.map((x) => x.to)).toEqual([textOnly.user.phone]);
    expect(smsSegments(texts[0]!.body)).toBe(1);
    expect(texts[0]!.body).toContain("Lash fill");
    expect(env.ctx.providers.outbox.push.slice(push0).some((p) => p.token.includes(app.user.id.slice(0, 8)))).toBe(true);
  });
});

describe("promos", () => {
  const promo = { templateKey: "valentines_nails", title: "Valentine's nails", body: "Book your Valentine's set before Feb 14." };

  it("a free shop sees the templates and the plan line, and a send is refused with the plan offer", async () => {
    const s = await shop({ plan: "free", vertical: "salon" });
    await member(s.merchant.id, { email: "r@example.com" }, { consent: true });
    const list = await call(env, s.ownerToken, "GET", `${s.base}/promo-templates`);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(6);
    expect(list.body.allowance).toMatchObject({ limit: 0, remaining: 0 });
    expect(list.body.offer).toMatchObject({ plan: "plus" });
    const r = await call(env, s.ownerToken, "POST", `${s.base}/promo-sends`, { ...promo, segment: "all" });
    expect(r.status).toBe(402);
    expect(r.body.error.details?.offer ?? r.body.error.offer).toMatchObject({ kind: "plan", plan: "plus" });
  });

  it("a paid shop sends to its regulars by app and email, never by text, and the counter moves", async () => {
    const s = await shop({ plan: "plus", vertical: "nails" });
    const pushUser = await member(s.merchant.id, {}, { push: true, consent: true });
    const mailUser = await member(s.merchant.id, { email: "regular@example.com" }, { consent: true });
    const noConsent = await member(s.merchant.id, { email: "nope@example.com" });
    const phoneOnly = await member(s.merchant.id, {}, { consent: true });
    // Regulars: two completed visits in the last year.
    for (const u of [pushUser, mailUser, noConsent, phoneOnly])
      for (const d of [20, 60])
        await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: u.user.id, items: [{ serviceId: null, name: "Gel", durationMin: 60, priceCents: 5000 }], startsAt: new Date(env.clock.now.getTime() - d * 86_400_000), endsAt: new Date(env.clock.now.getTime() - d * 86_400_000 + 3600_000), status: "completed", source: "online" });
    const list = await call(env, s.ownerToken, "GET", `${s.base}/promo-templates`);
    expect(list.body.items.some((x: { key: string }) => x.key === "valentines_nails")).toBe(true);
    expect(list.body.audience).toMatchObject({ regulars: 2, byPush: 1, byEmail: 1 });
    const sms0 = env.ctx.providers.outbox.sms.length;
    const r = await call(env, s.ownerToken, "POST", `${s.base}/promo-sends`, promo);
    expect(r.status).toBe(201);
    expect(r.body.result).toMatchObject({ recipients: 2, byPush: 1, byEmail: 1, templateKey: "valentines_nails" });
    expect(r.body.allowance).toMatchObject({ limit: 4, used: 1, remaining: 3 });
    expect(env.ctx.providers.outbox.sms.length).toBe(sms0);
    expect(env.ctx.providers.outbox.email.at(-1)!.text).toContain("Unsubscribe");
    // The counter is the shop's, and the fifth promo of the month is refused.
    for (let i = 0; i < 3; i++) expect((await call(env, s.ownerToken, "POST", `${s.base}/promo-sends`, promo)).status).toBe(201);
    const fifth = await call(env, s.ownerToken, "POST", `${s.base}/promo-sends`, promo);
    expect(fifth.status).toBe(402);
    const last = await call(env, s.ownerToken, "GET", `${s.base}/promo-sends/last`);
    expect(last.body.result).toMatchObject({ recipients: 2 });
  });
});

describe("inbox", () => {
  it("the shop writes to a client by their best channel, and the client's text reply lands in the right thread", async () => {
    const a = await shop();
    const b = await shop();
    const c = await member(a.merchant.id);
    await join(b.merchant.id, c.user.id);
    // Shop B texted them a while ago; shop A writes now, and it goes by text (no app, no email).
    const tb = await call(env, b.ownerToken, "POST", `${b.base}/inbox`, { memberId: (await env.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, b.merchant.id), eq(merchantMembers.userId, c.user.id))))[0]!.id });
    await call(env, b.ownerToken, "POST", `${b.base}/inbox/${tb.body.id}/messages`, { body: "Your order is in" });
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    const ta = await call(env, a.ownerToken, "POST", `${a.base}/inbox`, { memberId: c.memberId });
    const sent = await call(env, a.ownerToken, "POST", `${a.base}/inbox/${ta.body.id}/messages`, { body: "Running 10 minutes late, sorry!" });
    expect(sent.status).toBe(201);
    expect(sent.body.deliveredBy).toEqual(["sms"]);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("Running 10 minutes late");

    const r = await handleInboundSms(env.ctx, c.user.phone!, "No problem, see you soon");
    expect(r.action).toBe("none");
    const [inA] = await env.db.select().from(conversationMessages).where(and(eq(conversationMessages.conversationId, ta.body.id), eq(conversationMessages.direction, "in")));
    expect(inA).toMatchObject({ body: "No problem, see you soon", channel: "sms" });
    const inB = await env.db.select().from(conversationMessages).where(and(eq(conversationMessages.conversationId, tb.body.id), eq(conversationMessages.direction, "in")));
    expect(inB).toHaveLength(0);
    const list = await call(env, a.ownerToken, "GET", `${a.base}/inbox`);
    expect(list.body.items[0]).toMatchObject({ id: ta.body.id, unread: 1 });
    // STOP still opts out and is not a thread message.
    await handleInboundSms(env.ctx, c.user.phone!, "STOP");
    expect(await env.db.select().from(conversationMessages).where(and(eq(conversationMessages.conversationId, ta.body.id), eq(conversationMessages.direction, "in")))).toHaveLength(1);
  });

  it("in-app messages show in the customer's own threads and they can reply", async () => {
    const s = await shop();
    const c = await member(s.merchant.id, {}, { push: true });
    const t = await call(env, s.ownerToken, "POST", `${s.base}/inbox`, { memberId: c.memberId });
    const sent = await call(env, s.ownerToken, "POST", `${s.base}/inbox/${t.body.id}/messages`, { body: "Can you do 4:30 instead?" });
    expect(sent.body.deliveredBy).toEqual(["push"]);
    const mine = await call(env, c.token, "GET", "/v1/me/inbox");
    expect(mine.body).toMatchObject({ unreadTotal: 1, items: [{ id: t.body.id, merchant: { id: s.merchant.id } }] });
    const thread = await call(env, c.token, "GET", `/v1/me/inbox/${t.body.id}`);
    expect(thread.body.messages.at(-1)).toMatchObject({ direction: "out", body: "Can you do 4:30 instead?" });
    const rep = await call(env, c.token, "POST", `/v1/me/inbox/${t.body.id}/messages`, { body: "Yes, 4:30 works" });
    expect(rep.status).toBe(201);
    expect((await call(env, c.token, "GET", "/v1/me/inbox")).body.unreadTotal).toBe(0);
    // Someone else's thread is not theirs.
    const other = await customer(env);
    expect((await call(env, other.token, "GET", `/v1/me/inbox/${t.body.id}`)).status).toBe(404);
  });
});

describe("Instagram (stub)", () => {
  it("reads as coming when off", async () => {
    const s = await shop();
    const st = await call(env, s.ownerToken, "GET", `${s.base}/instagram`);
    expect(st.body).toMatchObject({ mode: "off", connected: false });
    expect((await call(env, s.ownerToken, "POST", `${s.base}/instagram/connect`)).status).toBe(409);
  });

  it("imports a seeded thread, books from it with the handle and the source, never sends, and disconnect purges", async () => {
    process.env.INSTAGRAM_DM_ENABLED = "stub";
    const s = await shop();
    const con = await call(env, s.ownerToken, "POST", `${s.base}/instagram/connect`);
    expect(con.status).toBe(200);
    expect(con.body).toMatchObject({ authorizeUrl: null, imported: 3, status: { mode: "stub", connected: true } });
    // Connecting again imports nothing new.
    expect((await call(env, s.ownerToken, "POST", `${s.base}/instagram/connect`)).body.imported).toBe(0);
    const list = await call(env, s.ownerToken, "GET", `${s.base}/inbox?channel=instagram`);
    const maya = list.body.items.find((x: { handle: string }) => x.handle === "maya.chen");
    expect(maya).toMatchObject({ channel: "instagram", readOnly: true, displayName: "Maya Chen", unread: 2, externalUrl: "https://ig.me/m/maya.chen" });
    expect((await call(env, s.ownerToken, "POST", `${s.base}/inbox/${maya.id}/messages`, { body: "Yes!" })).status).toBe(409);

    const pre = await call(env, s.ownerToken, "GET", `${s.base}/inbox/${maya.id}/booking-prefill`);
    expect(pre.body).toMatchObject({ customerName: "Maya Chen", handle: "@maya.chen", source: "instagram", externalUrl: "https://ig.me/m/maya.chen" });
    expect(pre.body.clientNote).toContain("@maya.chen on Instagram: Anytime after 1 works for me");

    const start = new Date(env.clock.now.getTime() + 3 * 86_400_000).toISOString();
    const booked = await call(env, s.ownerToken, "POST", `${s.base}/appointments`, {
      customer: { name: pre.body.customerName },
      staffId: s.owner.id,
      items: [{ serviceId: null, name: "Classic fill", durationMin: 60, priceCents: 6500 }],
      startsAt: start,
      source: "instagram",
      conversationId: maya.id,
      clientNote: pre.body.clientNote,
      force: true,
    });
    expect(booked.status, JSON.stringify(booked.body)).toBe(201);
    expect(booked.body).toMatchObject({ source: "instagram", conversationId: maya.id, customer: { name: "Maya Chen" } });
    expect(booked.body.clientNote).toContain("@maya.chen");

    // Webhook deliveries (stub format) add messages to the same thread.
    const [conn] = await env.db.select().from(instagramConnections).where(eq(instagramConnections.merchantId, s.merchant.id));
    const wh = await call(env, null, "POST", "/v1/public/instagram/webhook", { account: conn!.igUserId, threads: [{ externalUserId: "stub_ig_user_maya", threadId: "t", handle: "maya.chen", displayName: null, messages: [{ externalId: "new_1", direction: "in", text: "See you then!", at: env.clock.now.toISOString() }] }] });
    expect(wh.body.imported).toBe(1);

    // Only id, handle, name, text and time are kept; disconnect deletes them.
    const off = await call(env, s.ownerToken, "POST", `${s.base}/instagram/disconnect`);
    expect(off.body).toMatchObject({ connected: false });
    expect(await env.db.select().from(conversations).where(and(eq(conversations.merchantId, s.merchant.id), eq(conversations.channel, "instagram")))).toHaveLength(0);
    const [c2] = await env.db.select().from(instagramConnections).where(eq(instagramConnections.merchantId, s.merchant.id));
    expect(c2!.tokenEncrypted).toBeNull();
  });

  it("parses Meta's webhook and checks its signature; the data-deletion callback deletes that person's threads", async () => {
    const body = { object: "instagram", entry: [{ id: "acct1", messaging: [{ sender: { id: "u1" }, recipient: { id: "acct1" }, timestamp: 1, message: { mid: "m1", text: "hi" } }, { sender: { id: "acct1" }, recipient: { id: "u1" }, timestamp: 2, message: { mid: "m2", text: "hello", is_echo: true } }] }] };
    const r = parseInstagramWebhook(body);
    expect(r.externalAccountId).toBe("acct1");
    expect(r.threads[0]!.messages.map((m) => m.direction)).toEqual(["in", "out"]);
    const raw = JSON.stringify(body);
    const sig = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;
    expect(verifyMetaSignature("secret", raw, sig)).toBe(true);
    expect(verifyMetaSignature("secret", raw, "sha256=00")).toBe(false);

    process.env.INSTAGRAM_DM_ENABLED = "stub";
    const s = await shop();
    await call(env, s.ownerToken, "POST", `${s.base}/instagram/connect`);
    const del = await call(env, null, "POST", "/v1/public/instagram/data-deletion", { signed_request: "stub_ig_user_jordan" });
    expect(del.status).toBe(200);
    expect(del.body.confirmation_code).toBeTruthy();
    expect(await env.db.select().from(conversations).where(and(eq(conversations.merchantId, s.merchant.id), eq(conversations.externalId, "stub_ig_user_jordan")))).toHaveLength(0);
  });
});

describe("client profile and list", () => {
  it("shows the next visit, the visits timeline with notes, book again, and channel and language", async () => {
    const s = await shop();
    const c = await member(s.merchant.id, { name: "Priya Client" });
    const past = new Date(env.clock.now.getTime() - 21 * 86_400_000);
    const [done] = await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: c.user.id, staffId: s.owner.id, items: [{ serviceId: null, name: "Classic fill", durationMin: 60, priceCents: 6500 }], startsAt: past, endsAt: new Date(past.getTime() + 3600_000), status: "completed", source: "online", depositCents: 2000, intakeAnswer: "Sensitive to glue" }).returning();
    const fut = new Date(env.clock.now.getTime() + 5 * 86_400_000);
    await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: c.user.id, staffId: s.owner.id, items: [{ serviceId: null, name: "Brow tint", durationMin: 30, priceCents: 3000 }], startsAt: fut, endsAt: new Date(fut.getTime() + 1800_000), status: "booked", source: "online" });
    const note = await call(env, s.ownerToken, "PUT", `${s.base}/appointments/${done!.id}/visit-note`, { visitNote: "C curl 11 mm, sensitive glue" });
    expect(note.status).toBe(200);
    const p = await call(env, s.ownerToken, "GET", `${s.base}/customers/${c.memberId}/people`);
    expect(p.status).toBe(200);
    expect(p.body.nextVisit).toMatchObject({ title: "Brow tint", status: "booked" });
    expect(p.body.timeline[0]).toMatchObject({ kind: "appointment", title: "Classic fill", visitNote: "C curl 11 mm, sensitive glue", intakeAnswer: "Sensitive to glue", depositCents: 2000 });
    expect(p.body).toMatchObject({ channelPref: "best", locale: null, visits12m: 1, reachable: { push: false, text: true } });
    const up = await call(env, s.ownerToken, "PATCH", `${s.base}/customers/${c.memberId}/preferences`, { channelPref: "app", locale: "ur" });
    expect(up.body).toEqual({ channelPref: "app", locale: "ur" });
  });

  it("lists clients by appointment, with a staff filter that a private renter can't leave", async () => {
    const s = await shop();
    const dev = await createUser(env.db, { name: "Dev", email: `dev${Date.now()}@example.com` });
    const { merchantStaff } = await import("@ll/db");
    await env.db.insert(merchantStaff).values({ merchantId: s.merchant.id, userId: dev.id, role: "staff" });
    await env.db.insert(staffPay).values({ merchantId: s.merchant.id, userId: dev.id, model: "chair_rent", ownClientsOnly: true });
    const mine = await member(s.merchant.id, { name: "Dev's regular" });
    const theirs = await member(s.merchant.id, { name: "Owner's regular" });
    const at = new Date(env.clock.now.getTime() - 10 * 86_400_000);
    for (const [u, staffId] of [[mine, dev.id], [theirs, s.owner.id]] as const)
      await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: u.user.id, staffId, items: [{ serviceId: null, name: "Cut", durationMin: 30, priceCents: 3000 }], startsAt: at, endsAt: new Date(at.getTime() + 1800_000), status: "completed", source: "staff" });
    const all = await call(env, s.ownerToken, "GET", `${s.base}/clients`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    const filtered = await call(env, s.ownerToken, "GET", `${s.base}/clients?staffId=${dev.id}`);
    expect(filtered.body.items.map((x: { name: string }) => x.name)).toEqual(["Dev's regular"]);
    const devToken = await tokenFor(env, dev);
    const asDev = await call(env, devToken, "GET", `${s.base}/clients`);
    expect(asDev.body).toMatchObject({ staffId: dev.id, staffLocked: true, total: 1 });
    expect(asDev.body.items[0]).toMatchObject({ name: "Dev's regular", lastVisit: { services: "Cut", staffName: "Dev" } });
  });
});

describe("web push", () => {
  it("encrypts a payload the browser can decrypt (RFC 8291 round trip)", async () => {
    const { createDecipheriv } = await import("node:crypto");
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = Buffer.alloc(16, 7);
    const body = encryptPayload(Buffer.from("hello"), ua.getPublicKey().toString("base64url"), auth.toString("base64url"));
    const salt = body.subarray(0, 16);
    const idlen = body[20]!;
    const asPublic = body.subarray(21, 21 + idlen);
    const ct = body.subarray(21 + idlen);
    const hmac = (k: Buffer, d: Buffer) => createHmac("sha256", k).update(d).digest();
    const ikm = hmac(hmac(auth, ua.computeSecret(asPublic)), Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic, Buffer.from([1])]));
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);
    const d = createDecipheriv("aes-128-gcm", cek, nonce);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    expect(plain.subarray(0, -1).toString()).toBe("hello");
    expect(plain.at(-1)).toBe(2);
  });

  it("a customer subscribes and unsubscribes; the key is public", async () => {
    const c = await customer(env);
    expect((await call(env, null, "GET", "/v1/public/web-push/key")).body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    const sub = await call(env, c.token, "POST", "/v1/me/web-push", { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } });
    expect(sub.body).toEqual({ subscribed: true, devices: 1 });
    const off = await call(env, c.token, "DELETE", "/v1/me/web-push", { endpoint: "https://fcm.googleapis.com/fcm/send/abc" });
    expect(off.body).toEqual({ subscribed: false, devices: 0 });
    const pref = await call(env, c.token, "PUT", "/v1/me/channel-pref", { channelPref: "email" });
    expect(pref.body).toEqual({ channelPref: "email" });
  });
});
