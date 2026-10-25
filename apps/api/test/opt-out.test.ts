import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commOptOuts, featureOverrides, merchantMembers, merchantMilestones, merchants, messageDeliveries, preorderWaitlist, users, whatsappSessions } from "@ll/db";
import { START_KEYWORDS, STOP_KEYWORDS, isStartKeyword, isStopKeyword } from "@ll/shared";
import { twilioSignature } from "../src/providers/twilio.js";
import { notifyCustomer } from "../src/services/commerceShared.js";
import { dispatchInboundSms } from "../src/services/integrations-sms.js";
import { awardPurchase } from "../src/services/ledger.js";
import { runOnboardingNudges, nudgeUnsubscribeUrl } from "../src/services/onboarding.js";
import { isOptedOut, recordPhoneOptOut, sendSms } from "../src/services/opt-out.js";
import { notifyWaitlist } from "../src/services/preorderWaitlist.js";
import { consentedChannels } from "../src/services/reviews.js";
import { getSession, sendWhatsApp } from "../src/services/whatsapp.js";
import { call, customer, paidMerchant } from "./commerce-fixtures.js";
import { createMerchant, createTestEnv, createUser, grantFeatures, nextPhone, tokenFor, type TestEnv } from "./helpers.js";
import { connectWhatsapp, optIn, restaurantShop, sendInbound, wa } from "./restaurant-msg-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => env.close());

const smsTo = (phone: string) => env.ctx.providers.outbox.sms.filter((s) => s.to === phone);
const optedOut = (phone: string, channel: "sms" | "whatsapp" = "sms") => isOptedOut(env.db, phone, channel);

describe("keywords", () => {
  it("every STOP word, in English and French, any case, with punctuation and spaces", () => {
    for (const w of ["STOP", "stop", " Stop ", "STOP.", "stopall", "UNSUBSCRIBE", "END", "CANCEL", "QUIT", "ARRET", "arrêt", "ARRÊT", "Arrêt!", "REVOKE", "OPTOUT", "opt out", "opt-out", "Désabonner", "Annuler"]) expect(isStopKeyword(w), w).toBe(true);
    expect(STOP_KEYWORDS).toEqual(expect.arrayContaining(["STOP", "ARRET", "UNSUBSCRIBE", "END", "CANCEL", "QUIT"]));
  });
  it("START words restart, other text is neither", () => {
    for (const w of ["START", "start", "UNSTOP", "YES", "Oui", "subscribe"]) expect(isStartKeyword(w), w).toBe(true);
    expect(START_KEYWORDS).toContain("START");
    for (const w of ["thanks", "please stop texting", "stopping by at 5", "I want to cancel my order", "", "menu"]) {
      expect(isStopKeyword(w), w).toBe(false);
      expect(isStartKeyword(w), w).toBe(false);
    }
  });
});

describe("inbound SMS records the opt-out per number", () => {
  it.each(["STOP", "ARRET", "ARRÊT", "UNSUBSCRIBE", "END", "CANCEL", "QUIT", "stopall", "revoke", "optout"])("%s opts the number out, even a number we have no account for", async (word) => {
    const phone = nextPhone();
    expect(await optedOut(phone)).toBe(false);
    await dispatchInboundSms(env.ctx, phone, word);
    expect(await optedOut(phone)).toBe(true);
    const [row] = await env.db.select().from(commOptOuts).where(eq(commOptOuts.phone, phone));
    expect(row).toMatchObject({ channel: "sms", source: "sms_reply", resubscribedAt: null });
    expect(await optedOut(phone, "whatsapp")).toBe(false);
  });

  it("only that number is affected; START brings it back; STOP again opts out again", async () => {
    const a = nextPhone();
    const b = nextPhone();
    await dispatchInboundSms(env.ctx, a, "STOP");
    await dispatchInboundSms(env.ctx, b, "hello");
    expect(await optedOut(a)).toBe(true);
    expect(await optedOut(b)).toBe(false);
    await dispatchInboundSms(env.ctx, a, "START");
    expect(await optedOut(a)).toBe(false);
    await dispatchInboundSms(env.ctx, a, "stop");
    expect(await optedOut(a)).toBe(true);
    expect(await env.db.select().from(commOptOuts).where(eq(commOptOuts.phone, a))).toHaveLength(1);
  });

  it("through the Twilio webhook, matches numbers typed differently, and still mutes the member", async () => {
    env.ctx.config.sms = { ...env.ctx.config.sms, twilioAuthToken: "tw_token", twilioAccountSid: "AC1" };
    const m = await createMerchant(env);
    const u = await createUser(env.db, { phone: "+14165550177" });
    await env.db.insert(merchantMembers).values({ merchantId: m.merchant.id, userId: u.id, marketingConsentAt: new Date() });
    const url = "/v1/webhooks/twilio/sms";
    const params = { From: "+14165550177", To: "+14165550000", Body: "ARRÊT", MessageSid: "SM1" };
    const sig = twilioSignature("tw_token", `${env.ctx.config.publicApiUrl}${url}`, params);
    const r = await env.app.inject({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, payload: new URLSearchParams(params).toString() });
    expect(r.statusCode).toBe(200);
    expect(await optedOut("(416) 555-0177")).toBe(true);
    expect((await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, u.id)))[0]).toMatchObject({ muted: true, marketingConsentAt: null });
  });
});

describe("inbound WhatsApp records the opt-out per number", () => {
  async function shopWithGuest() {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop);
    const c = await customer(env, { name: "Aisha" });
    await optIn(env, shop.merchant.id, c.user.id);
    return { shop, c };
  }
  it.each(["STOP", "ARRET", "UNSUBSCRIBE", "END", "CANCEL", "QUIT"])("%s stops WhatsApp for that number, at every shop, and is confirmed", async (word) => {
    const { shop, c } = await shopWithGuest();
    const phone = c.user.phone!;
    await sendInbound(env, "pn_1001", phone, word);
    expect(await optedOut(phone, "whatsapp")).toBe(true);
    expect(await optedOut(phone, "sms")).toBe(false);
    expect((await getSession(env.ctx, shop.merchant.id, phone))).toMatchObject({ state: "opted_out", marketingOptInAt: null });
    expect(wa(env).sent.some((m) => m.to === phone && m.kind === "text" && /will not get WhatsApp messages/.test((m as { text?: string; body?: string }).text ?? (m as { body?: string }).body ?? ""))).toBe(true);

    // Another shop cannot message this number either.
    const other = await restaurantShop(env, "growth");
    await connectWhatsapp(env, other, ["eid_preorder"], "pn_2002");
    wa(env).reset();
    const out = await sendWhatsApp(ctx(), other.merchant, phone, { text: "Eid offer" });
    expect(out).toMatchObject({ sent: false, reason: "opted_out" });
    expect(wa(env).sent).toHaveLength(0);
  });

  it("CANCEL stops messages (it used to empty the cart); START brings the number back and clears the do-not-contact entry", async () => {
    const { shop, c } = await shopWithGuest();
    const phone = c.user.phone!;
    await sendInbound(env, "pn_1001", phone, "add 1");
    await sendInbound(env, "pn_1001", phone, "cancel");
    expect((await getSession(env.ctx, shop.merchant.id, phone))!.state).toBe("opted_out");
    await sendInbound(env, "pn_1001", phone, "START");
    expect(await optedOut(phone, "whatsapp")).toBe(false);
    expect((await getSession(env.ctx, shop.merchant.id, phone))).toMatchObject({ state: "browsing" });
    wa(env).reset();
    expect((await sendWhatsApp(ctx(), shop.merchant, phone, { text: "hello again" })).sent).toBe(true);
  });

  it("a shop recording a WhatsApp opt-in for a guest cannot undo their STOP", async () => {
    const { shop, c } = await shopWithGuest();
    await sendInbound(env, "pn_1001", c.user.phone!, "STOP");
    await optIn(env, shop.merchant.id, c.user.id); // staff-recorded
    expect(await optedOut(c.user.phone!, "whatsapp")).toBe(true);
    expect((await sendWhatsApp(ctx(), shop.merchant, c.user.phone!, { text: "x" })).reason).toBe("opted_out");
  });
  const ctx = () => env.ctx;
});

describe("every sender honours it", () => {
  it("sendSms sends to anyone not opted out and nothing to a number that is", async () => {
    const a = nextPhone();
    const b = nextPhone();
    await recordPhoneOptOut(env.ctx, b, "sms", "STOP", "sms_reply");
    expect(await sendSms(env.ctx, a, "hi")).toMatchObject({ id: expect.any(String) });
    expect(await sendSms(env.ctx, b, "hi")).toBeNull();
    expect(smsTo(a)).toHaveLength(1);
    expect(smsTo(b)).toHaveLength(0);
  });

  it("campaigns: an opted-out number is off the audience and gets nothing, even if the consent record still stands", async () => {
    const m = await createMerchant(env);
    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, m.merchant.id));
    await env.db.insert(featureOverrides).values({ merchantId: m.merchant.id, key: "marketing.sms", enabled: true, reason: "pilot" });
    const consent = { text: "Yes", source: "counter" };
    const keep = await awardPurchase(env.ctx, { merchantId: m.merchant.id, phone: nextPhone(), customerName: "Keep", source: "staff_app", amountCents: 1000, consent });
    const gone = await awardPurchase(env.ctx, { merchantId: m.merchant.id, phone: nextPhone(), customerName: "Gone", source: "staff_app", amountCents: 1000, consent });
    const gonePhone = (await env.db.select().from(users).where(eq(users.id, gone.member.userId)))[0]!.phone!;
    await recordPhoneOptOut(env.ctx, gonePhone, "sms", "STOP", "sms_reply"); // consent row untouched on purpose
    const base = `/v1/merchants/${m.merchant.id}/messages`;
    const headers = { authorization: `Bearer ${m.ownerToken}` };
    const preview = (await env.app.inject({ method: "POST", url: `${base}/audience`, headers, payload: { channel: "sms" } })).json();
    expect(preview.recipients).toBe(1);
    const sent = await env.app.inject({ method: "POST", url: base, headers, payload: { channel: "sms", body: "Fresh bread", sendNow: true } });
    expect(sent.json().recipientCount).toBe(1);
    expect(smsTo(gonePhone)).toHaveLength(0);
    expect(smsTo((await env.db.select().from(users).where(eq(users.id, keep.member.userId)))[0]!.phone!)).toHaveLength(1);
    expect((await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id)))[0]!.smsCreditsUsed).toBe(1);
  });

  it("transactional and reminder texts (order, tiffin, catering, pickup) go through notifyCustomer, which skips an opted-out number and logs why", async () => {
    const m = await createMerchant(env);
    const c = await customer(env, { pushToken: false });
    const args = { userId: c.user.id, merchantId: m.merchant.id, title: "Order ready", body: "Your order is ready", push: false, sms: true } as const;
    expect((await notifyCustomer(env.ctx, args)).sms).toBe(true);
    expect(smsTo(c.user.phone!)).toHaveLength(1);
    await dispatchInboundSms(env.ctx, c.user.phone!, "STOP");
    expect((await notifyCustomer(env.ctx, args)).sms).toBe(false);
    expect(smsTo(c.user.phone!)).toHaveLength(1);
    const log = await env.db.select().from(messageDeliveries).where(and(eq(messageDeliveries.userId, c.user.id), eq(messageDeliveries.status, "skipped")));
    expect(log).toHaveLength(1);
    expect(log[0]!.error).toBe("opted_out");
  });

  it("wait-list texts skip an opted-out number", async () => {
    const m = await createMerchant(env);
    const a = nextPhone();
    const b = nextPhone();
    await env.db.insert(preorderWaitlist).values([
      { merchantId: m.merchant.id, date: "2026-11-20", phone: a, consentText: "text me", createdAt: new Date("2026-11-01T00:00:00Z") },
      { merchantId: m.merchant.id, date: "2026-11-20", phone: b, consentText: "text me", createdAt: new Date("2026-11-01T00:00:01Z") },
    ]);
    await recordPhoneOptOut(env.ctx, a, "sms", "STOP", "sms_reply");
    expect(await notifyWaitlist(env.ctx, m.merchant.id, "2026-11-20", 2)).toBe(1);
    expect(smsTo(a)).toHaveLength(0);
    expect(smsTo(b)).toHaveLength(1);
  });

  it("review requests: SMS is not an option for an opted-out number", async () => {
    const shop = await paidMerchant(env, { plan: "plus", connect: false });
    await grantFeatures(env, shop.merchant.id, ["marketing.sms"]);
    const c = await customer(env, { pushToken: false });
    await env.db.insert(merchantMembers).values({ merchantId: shop.merchant.id, userId: c.user.id, marketingConsentAt: new Date() });
    expect(await consentedChannels(env.ctx, shop.merchant, c.user.id)).toContain("sms");
    await recordPhoneOptOut(env.ctx, c.user.phone!, "sms", "STOP", "sms_reply");
    expect(await consentedChannels(env.ctx, shop.merchant, c.user.id)).not.toContain("sms");
  });
});

describe("onboarding nudges to shop owners (CASL)", () => {
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  async function signup(name = "Sunrise Bakery") {
    const owner = await createUser(env.db, { email: `o${Math.random().toString(36).slice(2)}@example.com` });
    const token = await tokenFor(env, owner);
    const res = await env.app.inject({ method: "POST", url: "/v1/merchants", headers: auth(token), payload: { name, vertical: "cafe", address: "2210 Danforth Ave", phone: "(416) 555-0134" } });
    return { owner, token, id: res.json().merchant.id as string };
  }
  const nextDay = () => (env.clock.now = new Date(env.clock.now.getTime() + 25 * 3_600_000));

  it("the text names us, says Reply STOP to stop and carries a one-step unsubscribe link that works without signing in", async () => {
    const s = await signup();
    nextDay();
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(1);
    const sms = smsTo(s.owner.phone!).at(-1)!;
    expect(sms.body).toContain("Local Loyalty");
    expect(sms.body).toContain("Reply STOP to stop");
    expect(sms.body).toContain(nudgeUnsubscribeUrl(env.ctx, s.id));
    const url = sms.body.match(/https?:\/\/\S+unsubscribe\?\S+/)![0];
    const path = url.replace(env.ctx.config.publicApiUrl, "");
    const nudgesOff = async () => (await env.db.select().from(merchantMilestones).where(and(eq(merchantMilestones.merchantId, s.id), eq(merchantMilestones.key, "nudges_off")))).length;
    // The link only asks (scanners open every link in a text); the button's POST turns the reminders off.
    const r = await env.app.inject({ method: "GET", url: path });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("Stop setup reminders for");
    expect(r.body).toContain('<form method="post" action="/v1/public/onboarding/unsubscribe">');
    expect(await nudgesOff()).toBe(0);
    const form = await env.app.inject({ method: "POST", url: "/v1/public/onboarding/unsubscribe", headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams(path.split("?")[1]!).toString() });
    expect(form.statusCode).toBe(200);
    expect(form.body).toContain("No more setup reminders");
    expect(await nudgesOff()).toBe(1);
    env.clock.now = new Date(env.clock.now.getTime() + 3 * 86_400_000);
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(0);
  });

  it("rejects a forged or other shop's unsubscribe token", async () => {
    const a = await signup("Alder Bakery");
    const b = await signup("Birch Bakery");
    const tokenOfB = nudgeUnsubscribeUrl(env.ctx, b.id).split("t=")[1]!;
    expect((await env.app.inject({ method: "GET", url: `/v1/public/onboarding/unsubscribe?m=${a.id}&t=${tokenOfB}` })).statusCode).toBe(400);
    expect((await env.app.inject({ method: "POST", url: `/v1/public/onboarding/unsubscribe?m=${a.id}&t=nope-nope-nope` })).statusCode).toBe(400);
    expect((await env.db.select().from(merchantMilestones).where(eq(merchantMilestones.key, "nudges_off"))).length).toBe(0);
  });

  it("a one-click POST (email clients) unsubscribes too", async () => {
    const s = await signup();
    const path = nudgeUnsubscribeUrl(env.ctx, s.id).replace(env.ctx.config.publicApiUrl, "");
    expect((await env.app.inject({ method: "POST", url: path })).statusCode).toBe(200);
    nextDay();
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(0);
  });

  it("an owner who replied STOP gets no more setup texts, and the nudge is not used up", async () => {
    const s = await signup();
    await dispatchInboundSms(env.ctx, s.owner.phone!, "STOP");
    nextDay();
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(0);
    expect(smsTo(s.owner.phone!)).toHaveLength(0);
    expect(await env.db.select().from(merchantMilestones).where(and(eq(merchantMilestones.merchantId, s.id), eq(merchantMilestones.key, "nudge_d1")))).toHaveLength(0);
    await dispatchInboundSms(env.ctx, s.owner.phone!, "START");
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(1);
  });
});

describe("tiffin driver links", () => {
  it("a driver who replied STOP to our texts is reported as skipped, not texted", async () => {
    const m = await paidMerchant(env, { plan: "free", connect: false });
    await grantFeatures(env, m.merchant.id, ["restaurant.tiffin"]);
    const base = `/v1/merchants/${m.merchant.id}/tiffin`;
    const north = (await call(env, m.ownerToken, "POST", `${base}/routes`, { name: "North run", driverName: "Raj", driverPhone: "(416) 555-0199", areas: ["L4T"] })).body;
    const first = await call(env, m.ownerToken, "POST", `${base}/driver-links/send`, { routeIds: [north.id], channel: "sms" });
    expect(first.body.sent).toHaveLength(1);
    expect(smsTo("+14165550199")).toHaveLength(1);
    await dispatchInboundSms(env.ctx, "+14165550199", "STOP");
    const again = await call(env, m.ownerToken, "POST", `${base}/driver-links/send`, { routeIds: [north.id], channel: "sms" });
    expect(again.body.sent).toHaveLength(0);
    expect(again.body.skipped).toEqual([{ routeId: north.id, reason: "opted_out" }]);
    expect(smsTo("+14165550199")).toHaveLength(1);
  });
});

describe("rebooking nudges", () => {
  it("a number that replied STOP is not sendable even if consent is still on file", async () => {
    // Uses the same setup as service-ops: a customer due for a repeat visit, consented, with a phone.
    const { services, merchantMembers: mm, invoices } = await import("@ll/db");
    const m = await paidMerchant(env, { plan: "plus" });
    await grantFeatures(env, m.merchant.id, ["service.rebooking"]);
    const [svc] = await env.db.insert(services).values({ merchantId: m.merchant.id, kind: "appointment", name: "Cut", durationMin: 45, priceCents: 6000, rebookAfterDays: 28 }).returning();
    const cust = await createUser(env.db, { name: "Ritu" });
    await env.db.insert(mm).values({ merchantId: m.merchant.id, userId: cust.id, marketingConsentAt: new Date(), marketingConsentSource: "test" });
    const paidAt = new Date(env.clock.now.getTime() - 30 * 86_400_000);
    await env.db.insert(invoices).values({ merchantId: m.merchant.id, userId: cust.id, number: 1, lineItems: [{ description: "Cut", quantity: 1, unitPriceCents: 6000, serviceId: svc!.id }], subtotalCents: 6000, totalCents: 6000, amountDueCents: 0, status: "paid", payToken: "tok-rebook-0123456789", paidAt, createdAt: paidAt });
    const base = `/v1/merchants/${m.merchant.id}`;
    const list = async () => (await call(env, m.ownerToken, "GET", `${base}/rebooking?state=due`)).body.items[0];
    expect((await list()).canSend).toBe(true);
    await recordPhoneOptOut(env.ctx, cust.phone!, "sms", "STOP", "sms_reply");
    expect((await list()).canSend).toBe(false);
    const send = await call(env, m.ownerToken, "POST", `${base}/rebooking/${cust.id}/${svc!.id}/send`);
    expect(send.status).toBe(409);
    expect(smsTo(cust.phone!)).toHaveLength(0);
    void whatsappSessions;
  });
});
