import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outboundWebhookDeliveries, outboundWebhooks } from "@ll/db";
import { rotateApiKey } from "../src/services/merchant.js";
import { setHttp } from "../src/services/integrations-http.js";
import { BACKOFF_SECONDS, MAX_ATTEMPTS, deliverDueWebhooks, emitMerchantEvent, verifyWebhookSignature } from "../src/services/webhooks-out.js";
import { createMerchant as createBaseMerchant, createTestEnv, nextPhone, type TestEnv, grantFeatures } from "./helpers.js";
import { fakeFetch } from "./integrations-support.js";

/** Pricing v2: these features are paid and hidden at launch; this file's shops are pilots with admin overrides. */
const PILOT_FEATURES = ["integrations.webhooks", "integrations.pos_auto_award"] as const;
async function createMerchant(env: TestEnv, opts: Parameters<typeof createBaseMerchant>[1] = {}) {
  const m = await createBaseMerchant(env, opts);
  await grantFeatures(env, m.merchant.id, [...PILOT_FEATURES]);
  return m;
}


let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const nowS = () => Math.floor(env.clock.now.getTime() / 1000);

async function register(m: Awaited<ReturnType<typeof createMerchant>>, events = ["points.earned", "member.joined"]) {
  const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/webhooks`, headers: { authorization: `Bearer ${m.ownerToken}` }, payload: { url: "https://hooks.example.com/ll", events } });
  expect(r.statusCode).toBe(201);
  return r.json() as { id: string; secret: string };
}

describe("outbound webhooks", () => {
  it("registers, returns the secret once, stores it encrypted, validates input", async () => {
    const m = await createMerchant(env);
    const w = await register(m);
    expect(w.secret).toMatch(/^whsec_/);
    const [row] = await env.db.select().from(outboundWebhooks).where(eq(outboundWebhooks.id, w.id));
    expect(row!.secret).not.toContain(w.secret);
    const list = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/webhooks`, headers: { authorization: `Bearer ${m.ownerToken}` } });
    expect(list.json().items[0].secret).toBeUndefined();
    const bad = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/webhooks`, headers: { authorization: `Bearer ${m.ownerToken}` }, payload: { url: "https://x.example.com", events: ["nope"] } });
    expect(bad.statusCode).toBe(400);
    const other = await createMerchant(env);
    const cross = await env.app.inject({ method: "DELETE", url: `/v1/merchants/${other.merchant.id}/webhooks/${w.id}`, headers: { authorization: `Bearer ${other.ownerToken}` } });
    expect(cross.statusCode).toBe(404);
  });

  it("blocks internal URLs in production", async () => {
    const m = await createMerchant(env);
    env.ctx.config.env = "production";
    for (const url of ["http://hooks.example.com", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://localhost/x", "https://user:pw@hooks.example.com"]) {
      const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/webhooks`, headers: { authorization: `Bearer ${m.ownerToken}` }, payload: { url, events: ["*"] } });
      expect(r.statusCode, url).toBe(400);
    }
    env.ctx.config.env = "test";
  });

  it("signs deliveries with X-LL-Signature (t=,v1=) and only sends subscribed events", async () => {
    const m = await createMerchant(env);
    const w = await register(m, ["points.earned"]);
    const fake = fakeFetch([["POST", "https://hooks.example.com/ll", () => ({ status: 200 })]]);
    await emitMerchantEvent(env.ctx, m.merchant.id, "points.earned", { memberId: "m1", points: 10 });
    await emitMerchantEvent(env.ctx, m.merchant.id, "reward.redeemed", { memberId: "m1" });
    const r = await deliverDueWebhooks(env.ctx, fake);
    expect(r).toEqual({ attempted: 1, delivered: 1, failed: 0 });
    const call = fake.calls[0]!;
    expect(call.headers["x-ll-event"]).toBe("points.earned");
    expect(verifyWebhookSignature(w.secret, call.headers["x-ll-signature"], call.body!, nowS())).toBe(true);
    expect(verifyWebhookSignature(w.secret, call.headers["x-ll-signature"], call.body!.replace("10", "99"), nowS())).toBe(false);
    expect(verifyWebhookSignature("whsec_wrong", call.headers["x-ll-signature"], call.body!, nowS())).toBe(false);
    expect(verifyWebhookSignature(w.secret, call.headers["x-ll-signature"], call.body!, nowS() + 3600)).toBe(false); // replay window
    const body = JSON.parse(call.body!);
    expect(body).toMatchObject({ type: "points.earned", merchantId: m.merchant.id, data: { memberId: "m1", points: 10 } });
    expect(body.id).toMatch(/^evt_/);
  });

  it("retries with backoff, then gives up after MAX_ATTEMPTS", async () => {
    const m = await createMerchant(env);
    await register(m, ["*"]);
    let status = 500;
    const fake = fakeFetch([["POST", "https://hooks.example.com/ll", () => ({ status })]]);
    await emitMerchantEvent(env.ctx, m.merchant.id, "member.joined", { memberId: "m1" });
    expect((await deliverDueWebhooks(env.ctx, fake)).failed).toBe(1);
    let [d] = await env.db.select().from(outboundWebhookDeliveries);
    expect(d).toMatchObject({ status: "pending", attempts: 1, lastStatusCode: 500 });
    expect(d!.nextAttemptAt.getTime() - env.clock.now.getTime()).toBe(BACKOFF_SECONDS[0]! * 1000);
    // Not due yet → nothing sent.
    expect((await deliverDueWebhooks(env.ctx, fake)).attempted).toBe(0);
    env.clock.now = new Date(env.clock.now.getTime() + BACKOFF_SECONDS[0]! * 1000);
    status = 200;
    expect((await deliverDueWebhooks(env.ctx, fake)).delivered).toBe(1);
    [d] = await env.db.select().from(outboundWebhookDeliveries);
    expect(d).toMatchObject({ status: "delivered", attempts: 2 });

    status = 503;
    await emitMerchantEvent(env.ctx, m.merchant.id, "member.joined", { memberId: "m2" });
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      await deliverDueWebhooks(env.ctx, fake);
      env.clock.now = new Date(env.clock.now.getTime() + 13 * 3600_000);
    }
    const rows = await env.db.select().from(outboundWebhookDeliveries);
    const last = rows.find((x) => (x.payload as { data: { memberId: string } }).data.memberId === "m2")!;
    expect(last).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
  });

  it("410 Gone disables the webhook (Zapier unsubscribed)", async () => {
    const m = await createMerchant(env);
    const w = await register(m, ["*"]);
    await emitMerchantEvent(env.ctx, m.merchant.id, "member.joined", {});
    await deliverDueWebhooks(env.ctx, fakeFetch([["POST", "https://hooks.example.com/ll", () => ({ status: 410 })]]));
    const [row] = await env.db.select().from(outboundWebhooks).where(eq(outboundWebhooks.id, w.id));
    expect(row!.active).toBe(false);
  });

  it("emits points.earned from the merchant API and supports Zapier REST hooks", async () => {
    const m = await createMerchant(env);
    const key = await rotateApiKey(env.ctx, m.merchant.id, m.owner.id);
    const h = { "x-ll-api-key": key };
    const sub = await env.app.inject({ method: "POST", url: "/v1/api/hooks", headers: h, payload: { url: "https://hooks.zapier.com/hooks/standard/1/abc", event: "points.earned", source: "zapier" } });
    expect(sub.statusCode).toBe(201);
    const catalog = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/integrations`, headers: { authorization: `Bearer ${m.ownerToken}` } });
    expect(catalog.json().items.find((i: { provider: string }) => i.provider === "zapier").status).toBe("connected");
    await env.app.inject({ method: "POST", url: "/v1/api/award", headers: h, payload: { phone: nextPhone(), amountCents: 1500, externalId: "s1" } });
    const fake = fakeFetch([["POST", "https://hooks.zapier.com/", () => ({ status: 200 })]]);
    const r = await deliverDueWebhooks(env.ctx, fake);
    expect(r.delivered).toBe(1);
    expect(JSON.parse(fake.calls[0]!.body!).data).toMatchObject({ points: 15, balance: 15, source: "api" });
    const samples = await env.app.inject({ method: "GET", url: "/v1/api/samples/points.earned", headers: h });
    expect(samples.json()[0].type).toBe("points.earned");
    const unsub = await env.app.inject({ method: "DELETE", url: `/v1/api/hooks/${sub.json().id}`, headers: h });
    expect(unsub.statusCode).toBe(204);
  });

  it("test endpoint sends a ping and records deliveries", async () => {
    const m = await createMerchant(env);
    const w = await register(m, ["points.earned"]);
    setHttp(env.ctx, fakeFetch([["POST", "https://hooks.example.com/ll", () => ({ status: 204 })]]));
    const h = { authorization: `Bearer ${m.ownerToken}` };
    const t = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/webhooks/${w.id}/test`, headers: h });
    expect(t.json()).toMatchObject({ status: "delivered", statusCode: 204 });
    const d = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/webhooks/${w.id}/deliveries`, headers: h });
    expect(d.json().items[0]).toMatchObject({ event: "ping", status: "delivered", attempts: 1 });
  });

  it("emitMerchantEvent never throws", async () => {
    await expect(emitMerchantEvent(env.ctx, "not-a-uuid", "order.ready", {})).resolves.toBeUndefined();
  });
});
