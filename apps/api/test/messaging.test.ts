import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, featureOverrides, ledgerTransactions, loyaltyPrograms, merchantMembers, merchants, messageDeliveries, messages, pushTokens, users } from "@ll/db";
import { awardPurchase } from "../src/services/ledger.js";
import {
  awardBirthdayBonuses,
  handleInboundSms,
  resetSmsCreditsIfNewMonth,
  runAutomations,
  sendScheduledCampaigns,
  unsubscribeToken,
} from "../src/services/messaging.js";
import { messagingJobs } from "../src/jobs/messaging.js";
import { createMerchant as createBaseMerchant, createTestEnv, nextPhone, tokenFor, type TestEnv, grantFeatures } from "./helpers.js";

/** Pricing v2: these features are paid and hidden at launch; this file's shops are pilots with admin overrides. */
const PILOT_FEATURES = ["marketing.email", "loyalty.birthday_bonus"] as const;
async function createMerchant(env: TestEnv, opts: Parameters<typeof createBaseMerchant>[1] = {}) {
  const m = await createBaseMerchant(env, opts);
  await grantFeatures(env, m.merchant.id, [...PILOT_FEATURES]);
  return m;
}


let env: TestEnv;
// Real-time clock: members/visits get DB-default timestamps, so keep ctx.now() aligned with them.
beforeEach(async () => {
  env = await createTestEnv({ now: new Date() });
});
afterEach(async () => env.close());

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const consent = { text: "Yes, send me offers", source: "counter" };

/** Merchant with 4 members: consented (email+phone), consented-but-muted, no consent, consented w/o email. */
async function setup() {
  const m = await createMerchant(env);
  const mk = async (name: string, opts: { consent?: boolean; email?: string | null; muted?: boolean; amountCents?: number } = {}) => {
    const r = await awardPurchase(env.ctx, { merchantId: m.merchant.id, phone: nextPhone(), customerName: name, source: "staff_app", amountCents: opts.amountCents ?? 1000, consent: opts.consent === false ? null : consent });
    if (opts.email !== null) await env.db.update(users).set({ email: opts.email ?? `${name.toLowerCase()}@example.com` }).where(eq(users.id, r.member.userId));
    if (opts.muted) await env.db.update(merchantMembers).set({ muted: true }).where(eq(merchantMembers.id, r.member.id));
    return r.member;
  };
  const alice = await mk("Alice", { amountCents: 6000 });
  const mutedMember = await mk("Muted", { muted: true });
  const noConsent = await mk("Noconsent", { consent: false });
  const noEmail = await mk("Noemail", { email: null });
  return { ...m, alice, mutedMember, noConsent, noEmail };
}

async function enableSms(merchantId: string) {
  await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, merchantId));
  await env.db.insert(featureOverrides).values({ merchantId, key: "marketing.sms", enabled: true, reason: "pilot" });
}

describe("email campaigns + CASL", () => {
  it("only reaches consented, unmuted members and appends the footer", async () => {
    const s = await setup();
    const base = `/v1/merchants/${s.merchant.id}/messages`;
    const preview = (await env.app.inject({ method: "POST", url: `${base}/audience`, headers: auth(s.ownerToken), payload: { channel: "email" } })).json();
    expect(preview).toMatchObject({ matched: 4, recipients: 1, excludedNoConsent: 1, excludedMuted: 1, excludedNoContact: 1 });

    const r = await env.app.inject({
      method: "POST",
      url: base,
      headers: auth(s.ownerToken),
      payload: { channel: "email", subject: "Hi {{first_name}}", body: "You have {{balance}} {{terminology}}.", sendNow: true },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ status: "sent", recipientCount: 1, stats: { sent: 1 } });
    expect(env.ctx.providers.outbox.email).toHaveLength(1);
    const mail = env.ctx.providers.outbox.email[0]!;
    expect(mail.to).toBe("alice@example.com");
    expect(mail.subject).toBe("Hi Alice");
    expect(mail.text).toContain("You have 60 points.");
    expect(mail.text).toContain("Sent by Test Shop");
    expect(mail.text).toMatch(/Unsubscribe: http:\/\/localhost:4000\/v1\/public\/messaging\/unsubscribe\?m=/);
    // Can't resend.
    expect((await env.app.inject({ method: "POST", url: `${base}/${r.json().id}/send`, headers: auth(s.ownerToken) })).statusCode).toBe(409);
  });

  it("requires a subject for email, manager role, and isolates merchants", async () => {
    const s = await setup();
    const other = await createMerchant(env);
    const base = `/v1/merchants/${s.merchant.id}/messages`;
    expect((await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload: { channel: "email", body: "x" } })).statusCode).toBe(400);
    expect((await env.app.inject({ method: "POST", url: base, headers: auth(other.ownerToken), payload: { channel: "email", subject: "x", body: "x" } })).statusCode).toBe(403);
    const draft = await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload: { channel: "email", subject: "x", body: "x" } });
    expect(draft.json().status).toBe("draft");
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${other.merchant.id}/messages/${draft.json().id}`, headers: auth(other.ownerToken) })).statusCode).toBe(404);
    const list = (await env.app.inject({ method: "GET", url: base, headers: auth(s.ownerToken) })).json();
    expect(list.items).toHaveLength(1);
  });

  it("segments: lapsed, reward_ready, tag, new, vip", async () => {
    const s = await setup();
    await env.db.update(merchantMembers).set({ tags: ["regular"] }).where(eq(merchantMembers.id, s.noEmail.id));
    const preview = async (segment: object, channel = "sms") =>
      (await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/messages/audience`, headers: auth(s.ownerToken), payload: { channel, segment } })).json();
    expect((await preview({ kind: "reward_ready" })).matched).toBe(1); // Alice has 60 >= 50
    expect((await preview({ kind: "tag", tag: "Regular" })).recipients).toBe(1);
    expect((await preview({ kind: "new", days: 7 })).matched).toBe(4);
    expect((await preview({ kind: "vip" })).matched).toBe(0);
    expect((await preview({ kind: "lapsed", days: 30 })).matched).toBe(0);
    env.clock.now = new Date(env.clock.now.getTime() + 45 * 86400000);
    const fresh = await tokenFor(env, s.owner);
    const lapsed = (await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/messages/audience`, headers: auth(fresh), payload: { channel: "sms", segment: { kind: "lapsed", days: 30 } } })).json();
    expect(lapsed.matched).toBe(4);
    expect(lapsed.recipients).toBe(2); // Alice + Noemail (has phone)
  });

  it("schedules, edits, cancels and the job sends due campaigns", async () => {
    const s = await setup();
    const base = `/v1/merchants/${s.merchant.id}/messages`;
    const at = new Date(env.clock.now.getTime() + 3600_000).toISOString();
    expect((await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload: { channel: "email", subject: "x", body: "x", scheduledAt: "2020-01-01T00:00:00Z" } })).statusCode).toBe(400);
    const m = await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload: { channel: "email", subject: "Weekend", body: "2x points Sat", scheduledAt: at } });
    expect(m.json().status).toBe("scheduled");
    const id = m.json().id;
    const edited = await env.app.inject({ method: "PATCH", url: `${base}/${id}`, headers: auth(s.ownerToken), payload: { body: "Double points Saturday" } });
    expect(edited.json().body).toBe("Double points Saturday");
    const c = await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload: { channel: "email", subject: "y", body: "y", scheduledAt: at } });
    await env.app.inject({ method: "POST", url: `${base}/${c.json().id}/cancel`, headers: auth(s.ownerToken) });

    expect(await sendScheduledCampaigns(env.ctx)).toBe(0);
    env.clock.now = new Date(env.clock.now.getTime() + 2 * 3600_000);
    const job = messagingJobs.find((j) => j.name === "messaging.send-scheduled")!;
    await job.run(env.ctx);
    const [row] = await env.db.select().from(messages).where(eq(messages.id, id));
    expect(row!.status).toBe("sent");
    expect(env.ctx.providers.outbox.email).toHaveLength(1);
    const [cancelled] = await env.db.select().from(messages).where(eq(messages.id, c.json().id));
    expect(cancelled!.status).toBe("cancelled");
    await job.run(env.ctx);
    expect(env.ctx.providers.outbox.email).toHaveLength(1);
  });
});

describe("SMS (Plus) and push", () => {
  it("is feature-gated, counts credits and stops at the allowance", async () => {
    env.clock.now = new Date("2026-11-03T15:00:00Z");
    const s = await setup();
    const base = `/v1/merchants/${s.merchant.id}/messages`;
    const payload = { channel: "sms", body: "Fresh croissants today!", sendNow: true };
    const locked = await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload });
    expect(locked.statusCode).toBe(402);
    expect(locked.json().error.code).toBe("feature_locked");

    await enableSms(s.merchant.id);
    const ok = await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().recipientCount).toBe(2); // Alice + Noemail; not muted/no-consent
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toBe("Fresh croissants today!\n— Test Shop. Reply STOP to unsubscribe.");
    const usage = (await env.app.inject({ method: "GET", url: `${base}/sms-usage`, headers: auth(s.ownerToken) })).json();
    expect(usage).toMatchObject({ used: 2, allowance: 500, remaining: 498, resetsOn: "2026-12-01" });

    await env.db.update(merchants).set({ smsCreditsUsed: 499 }).where(eq(merchants.id, s.merchant.id));
    const over = await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload });
    expect(over.statusCode).toBe(402);
    expect(over.json().error.code).toBe("sms_credits_exhausted");
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    expect(m!.smsCreditsUsed).toBe(499);
    expect((await env.app.inject({ method: "POST", url: base, headers: auth(s.ownerToken), payload: { channel: "sms", body: "x".repeat(321) } })).statusCode).toBe(400);
  });

  it("resets SMS credits once per month", async () => {
    env.clock.now = new Date("2026-11-03T15:00:00Z");
    const s = await setup();
    await env.db.update(merchants).set({ smsCreditsUsed: 120 }).where(eq(merchants.id, s.merchant.id));
    expect(await resetSmsCreditsIfNewMonth(env.ctx)).toBe(true);
    let [m] = await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    expect(m!.smsCreditsUsed).toBe(0);
    await env.db.update(merchants).set({ smsCreditsUsed: 5 }).where(eq(merchants.id, s.merchant.id));
    expect(await resetSmsCreditsIfNewMonth(env.ctx)).toBe(false);
    env.clock.now = new Date("2026-12-01T12:00:00Z");
    expect(await resetSmsCreditsIfNewMonth(env.ctx)).toBe(true);
    [m] = await env.db.select().from(merchants).where(eq(merchants.id, s.merchant.id));
    expect(m!.smsCreditsUsed).toBe(0);
  });

  it("sends push to consented members' devices", async () => {
    const s = await setup();
    await env.db.insert(pushTokens).values([
      { userId: s.alice.userId, token: "ExponentPushToken[alice-1]", platform: "ios" },
      { userId: s.alice.userId, token: "ExponentPushToken[alice-2]", platform: "android" },
      { userId: s.noConsent.userId, token: "ExponentPushToken[nc]", platform: "ios" },
    ]);
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/messages`, headers: auth(s.ownerToken), payload: { channel: "push", body: "Patio is open!", sendNow: true } });
    expect(r.statusCode).toBe(201);
    expect(env.ctx.providers.outbox.push.map((p) => p.token).sort()).toEqual(["ExponentPushToken[alice-1]", "ExponentPushToken[alice-2]"]);
    expect(env.ctx.providers.outbox.push[0]!.title).toBe("Test Shop");
  });
});

describe("opt-outs", () => {
  it("handles inbound STOP across every merchant", async () => {
    const a = await createMerchant(env);
    const b = await createMerchant(env);
    const phone = nextPhone();
    await awardPurchase(env.ctx, { merchantId: a.merchant.id, phone, source: "staff_app", amountCents: 1000, consent });
    await awardPurchase(env.ctx, { merchantId: b.merchant.id, phone, source: "staff_app", amountCents: 1000, consent });
    expect((await handleInboundSms(env.ctx, phone, "thanks!")).action).toBe("none");
    expect((await handleInboundSms(env.ctx, phone, "help")).action).toBe("help");
    const r = await handleInboundSms(env.ctx, phone, " Stop ");
    expect(r).toMatchObject({ action: "opted_out", merchantsAffected: 2 });
    const rows = await env.db.select().from(merchantMembers);
    expect(rows.every((m) => m.muted && m.marketingConsentAt === null)).toBe(true);
    expect((await handleInboundSms(env.ctx, phone, "ARRÊT")).action).toBe("opted_out");
    expect((await handleInboundSms(env.ctx, "+19995550000", "UNSUBSCRIBE")).merchantsAffected).toBe(0);
    const logs = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "consent.withdrawn_sms_stop"));
    expect(logs.length).toBeGreaterThan(0);
  });

  it("unsubscribe link withdraws consent for that merchant only", async () => {
    const s = await setup();
    const bad = await env.app.inject({ method: "GET", url: `/v1/public/messaging/unsubscribe?m=${s.alice.id}&t=wrongtokenwrongtoken` });
    expect(bad.statusCode).toBe(400);
    const ok = await env.app.inject({ method: "GET", url: `/v1/public/messaging/unsubscribe?m=${s.alice.id}&t=${unsubscribeToken(env.ctx, s.alice.id)}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain("Test Shop");
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, s.alice.id));
    expect(m!.marketingConsentAt).toBeNull();
    const post = await env.app.inject({ method: "POST", url: `/v1/public/messaging/unsubscribe`, payload: { m: s.alice.id, t: unsubscribeToken(env.ctx, s.alice.id) } });
    expect(post.json()).toEqual({ ok: true, merchantName: "Test Shop" });
  });
});

describe("Pricing v2: email & push campaigns are Plus", () => {
  it("refuses campaigns (402) for a shop without marketing.email", async () => {
    const m = await createBaseMerchant(env);
    for (const channel of ["email", "push"] as const) {
      const r = await env.app.inject({
        method: "POST",
        url: `/v1/merchants/${m.merchant.id}/messages`,
        headers: { authorization: `Bearer ${m.ownerToken}` },
        payload: { channel, subject: channel === "email" ? "Hi" : undefined, body: "Hello" },
      });
      expect(r.statusCode).toBe(402);
      expect(r.json().error.code).toBe("feature_locked");
    }
  });
});

describe("automations (Plus) + birthday bonus (Plus since Pricing v2)", () => {
  it("gates automations and runs win-back / reward-ready once per trigger", async () => {
    const s = await setup();
    const url = (k: string) => `/v1/merchants/${s.merchant.id}/automations/${k}`;
    const list = (await env.app.inject({ method: "GET", url: `/v1/merchants/${s.merchant.id}/automations`, headers: auth(s.ownerToken) })).json();
    expect(list.items).toHaveLength(4);
    expect(list.items[0]).toMatchObject({ kind: "win_back", enabled: false, configured: false, available: false });
    const locked = await env.app.inject({ method: "PUT", url: url("reward_ready"), headers: auth(s.ownerToken), payload: { enabled: true, body: "Reward ready!" } });
    expect(locked.statusCode).toBe(402);
    // Saving a disabled automation is allowed (draft copy).
    expect((await env.app.inject({ method: "PUT", url: url("reward_ready"), headers: auth(s.ownerToken), payload: { enabled: false, body: "Draft" } })).statusCode).toBe(200);

    await env.db.insert(featureOverrides).values({ merchantId: s.merchant.id, key: "marketing.automations", enabled: true });
    const rr = await env.app.inject({ method: "PUT", url: url("reward_ready"), headers: auth(s.ownerToken), payload: { enabled: true, body: "{{first_name}}, you have {{balance}} {{terminology}}!" } });
    expect(rr.json()).toMatchObject({ enabled: true, available: true });
    const wb = await env.app.inject({ method: "PUT", url: url("win_back"), headers: auth(s.ownerToken), payload: { enabled: true, body: "We miss you", subject: "Come back", days: 30 } });
    expect(wb.json().days).toBe(30);
    expect((await env.app.inject({ method: "PUT", url: url("nope"), headers: auth(s.ownerToken), payload: { enabled: true, body: "x" } })).statusCode).toBe(400);

    expect(await runAutomations(env.ctx)).toBe(1); // reward_ready → Alice
    expect(env.ctx.providers.outbox.email.at(-1)!.text).toContain("Alice, you have 60 points!");
    expect(await runAutomations(env.ctx)).toBe(0); // not again until a new visit

    env.clock.now = new Date(env.clock.now.getTime() + 40 * 86400000);
    const sent = await runAutomations(env.ctx);
    expect(sent).toBe(1); // win-back → Alice (only consented+unmuted with email)
    expect(env.ctx.providers.outbox.email.at(-1)!.subject).toBe("Come back");
    expect(await runAutomations(env.ctx)).toBe(0);
    const deliveries = await env.db.select().from(messageDeliveries).where(eq(messageDeliveries.userId, s.mutedMember.userId));
    expect(deliveries).toHaveLength(0);
  });

  it("awards the birthday bonus once per year via the ledger (pilot override), message only with automation", async () => {
    env.clock.now = new Date("2026-11-03T15:00:00Z");
    const s = await setup();
    await env.db.update(loyaltyPrograms).set({ birthdayBonus: 25 }).where(eq(loyaltyPrograms.merchantId, s.merchant.id));
    // Clock is 2026-11-03 10:00 Toronto.
    await env.db.update(users).set({ birthday: "1990-11-03" }).where(eq(users.id, s.noConsent.userId));
    await env.db.update(users).set({ birthday: "1985-11-04" }).where(eq(users.id, s.alice.userId));
    // Pricing v2: without loyalty.birthday_bonus the job skips the shop entirely.
    await grantFeatures(env, s.merchant.id, ["loyalty.birthday_bonus"], false);
    expect(await awardBirthdayBonuses(env.ctx)).toBe(0);
    await grantFeatures(env, s.merchant.id, ["loyalty.birthday_bonus"]);
    expect(await awardBirthdayBonuses(env.ctx)).toBe(1);
    expect(await awardBirthdayBonuses(env.ctx)).toBe(0);
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, s.noConsent.id));
    expect(m!.balance).toBe(10 + 25);
    expect(m!.lastBirthdayBonusYear).toBe(2026);
    const txs = await env.db.select().from(ledgerTransactions).where(and(eq(ledgerTransactions.memberId, s.noConsent.id), eq(ledgerTransactions.type, "birthday_bonus")));
    expect(txs).toHaveLength(1);
    // No birthday message without the automation (and never to a non-consented member).
    expect(env.ctx.providers.outbox.email).toHaveLength(0);
    // Next year: again.
    env.clock.now = new Date("2027-11-03T15:00:00Z");
    expect(await awardBirthdayBonuses(env.ctx)).toBe(1);

    // Birthday automation messages consented members on their birthday.
    await env.db.insert(featureOverrides).values({ merchantId: s.merchant.id, key: "marketing.automations", enabled: true });
    env.clock.now = new Date("2027-11-04T15:00:00Z");
    const token = await tokenFor(env, s.owner);
    await env.app.inject({ method: "PUT", url: `/v1/merchants/${s.merchant.id}/automations/birthday`, headers: auth(token), payload: { enabled: true, body: "Happy birthday {{first_name}}" } });
    expect(await runAutomations(env.ctx)).toBe(1);
    expect(env.ctx.providers.outbox.email.at(-1)!.to).toBe("alice@example.com");
    expect(await runAutomations(env.ctx)).toBe(0);
  });
});
