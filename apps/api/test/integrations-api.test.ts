import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantMembers, users } from "@ll/db";
import { twilioSignature } from "../src/providers/twilio.js";
import { rotateApiKey } from "../src/services/merchant.js";
import { createMerchant as createBaseMerchant, createTestEnv, createUser, nextPhone, type TestEnv, grantFeatures } from "./helpers.js";

/** Pricing v2: the merchant REST API ("Webhooks & API") is Plus; these shops are pilots with admin overrides. */
async function createMerchant(env: TestEnv) {
  const m = await createBaseMerchant(env);
  await grantFeatures(env, m.merchant.id, ["integrations.webhooks"]);
  return m;
}

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

describe("merchant REST API (X-LL-Api-Key)", () => {
  it("rejects missing/invalid keys", async () => {
    const r1 = await env.app.inject({ method: "POST", url: "/v1/api/award", payload: { phone: nextPhone(), amountCents: 1000 } });
    expect(r1.statusCode).toBe(401);
    const r2 = await env.app.inject({ method: "POST", url: "/v1/api/award", headers: { "x-ll-api-key": "llk_not_a_real_key" }, payload: { phone: nextPhone(), amountCents: 1000 } });
    expect(r2.statusCode).toBe(401);
    // A bearer token is not an API key.
    const m = await createMerchant(env);
    const r3 = await env.app.inject({ method: "POST", url: "/v1/api/award", headers: { authorization: `Bearer ${m.ownerToken}` }, payload: { phone: nextPhone(), amountCents: 1000 } });
    expect(r3.statusCode).toBe(401);
  });

  it("awards (idempotent), looks up, redeems and refunds", async () => {
    const m = await createMerchant(env);
    const key = await rotateApiKey(env.ctx, m.merchant.id, m.owner.id);
    const h = { "x-ll-api-key": key };
    const phone = nextPhone();
    const body = { phone, externalId: "sale-1", lines: [{ amountCents: 6000 }, { amountCents: 2000, categoryId: m.noEarnCategory.id }] };
    const a = await env.app.inject({ method: "POST", url: "/v1/api/award", headers: h, payload: body });
    expect(a.statusCode).toBe(200);
    expect(a.json()).toMatchObject({ pointsAwarded: 60, balance: 60, memberCreated: true, duplicate: false });
    expect(a.json().rewardsAvailable).toHaveLength(1);
    const again = await env.app.inject({ method: "POST", url: "/v1/api/award", headers: h, payload: body });
    expect(again.json()).toMatchObject({ duplicate: true, balance: 60, pointsAwarded: 0 });

    const me = await env.app.inject({ method: "GET", url: `/v1/api/members/${encodeURIComponent(phone)}`, headers: h });
    expect(me.json()).toMatchObject({ balance: 60, visitCount: 1, marketingConsent: false });
    const [u] = await env.db.select().from(users).where(eq(users.phone, phone));
    const byCode = await env.app.inject({ method: "GET", url: `/v1/api/members/LL:${u!.memberCode}`, headers: h });
    expect(byCode.json().memberId).toBe(me.json().memberId);

    const red = await env.app.inject({ method: "POST", url: "/v1/api/redeem", headers: { ...h, "idempotency-key": "red-1" }, payload: { phone, rewardId: m.reward.id } });
    expect(red.json()).toMatchObject({ balance: 10, duplicate: false, discountCents: 500 });
    const red2 = await env.app.inject({ method: "POST", url: "/v1/api/redeem", headers: { ...h, "idempotency-key": "red-1" }, payload: { phone, rewardId: m.reward.id } });
    expect(red2.json().duplicate).toBe(true);

    const refund = await env.app.inject({ method: "POST", url: "/v1/api/refund", headers: h, payload: { externalId: "sale-1", refundId: "rf-1", amountCents: 4000 } });
    // $40 of $80 → half of 60 points; balance may go negative after a redemption (refund reversal).
    expect(refund.json()).toMatchObject({ status: "reversed", pointsReversed: 30, balance: -20 });
    const missing = await env.app.inject({ method: "POST", url: "/v1/api/refund", headers: h, payload: { externalId: "nope", refundId: "rf-2" } });
    expect(missing.json().status).toBe("not_found");
  });

  it("scopes keys to their merchant", async () => {
    const a = await createMerchant(env);
    const b = await createMerchant(env);
    const keyA = await rotateApiKey(env.ctx, a.merchant.id, a.owner.id);
    const r = await env.app.inject({ method: "POST", url: "/v1/api/redeem", headers: { "x-ll-api-key": keyA }, payload: { phone: nextPhone(), rewardId: b.reward.id } });
    expect(r.statusCode).toBe(404);
    expect((await env.app.inject({ method: "GET", url: "/v1/api/me", headers: { "x-ll-api-key": keyA } })).json().merchantId).toBe(a.merchant.id);
  });

  it("validates bodies", async () => {
    const m = await createMerchant(env);
    const key = await rotateApiKey(env.ctx, m.merchant.id, m.owner.id);
    const r = await env.app.inject({ method: "POST", url: "/v1/api/award", headers: { "x-ll-api-key": key }, payload: { amountCents: 100 } });
    expect(r.statusCode).toBe(400);
  });
});

describe("Twilio inbound SMS", () => {
  const url = "/v1/webhooks/twilio/sms";
  const send = (params: Record<string, string>, token = "tw_token") => {
    const sig = twilioSignature(token, `${env.ctx.config.publicApiUrl}${url}`, params);
    return env.app.inject({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, payload: new URLSearchParams(params).toString() });
  };

  beforeEach(() => {
    env.ctx.config.sms = { ...env.ctx.config.sms, twilioAuthToken: "tw_token", twilioAccountSid: "AC1" };
  });

  it("STOP mutes and clears consent on every membership of that phone; START unmutes; HELP replies", async () => {
    const a = await createMerchant(env);
    const b = await createMerchant(env);
    const phone = nextPhone();
    const u = await createUser(env.db, { phone });
    const other = await createUser(env.db);
    await env.db.insert(merchantMembers).values([
      { merchantId: a.merchant.id, userId: u.id, marketingConsentAt: new Date(), marketingConsentSource: "web" },
      { merchantId: b.merchant.id, userId: u.id, marketingConsentAt: new Date(), marketingConsentSource: "web" },
      { merchantId: a.merchant.id, userId: other.id, marketingConsentAt: new Date() },
    ]);
    const r = await send({ From: phone, To: "+14165550000", Body: "Stop", MessageSid: "SM1" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("text/xml");
    const rows = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, u.id));
    expect(rows.every((m) => m.muted && m.marketingConsentAt === null)).toBe(true);
    const [o] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, other.id));
    expect(o!.marketingConsentAt).not.toBeNull();

    await send({ From: phone, Body: "START" });
    const after = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, u.id));
    expect(after.every((m) => !m.muted && m.marketingConsentAt === null)).toBe(true); // consent must be re-given

    const help = await send({ From: phone, Body: "help" });
    expect(help.body).toContain("Reply STOP");
  });

  it("rejects unsigned or mis-signed requests", async () => {
    const r = await env.app.inject({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "From=%2B14165550123&Body=STOP" });
    expect(r.statusCode).toBe(403);
    expect((await send({ From: "+14165550123", Body: "STOP" }, "wrong")).statusCode).toBe(403);
  });
});
