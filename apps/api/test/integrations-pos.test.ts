import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { integrations, locations, merchantCategories, merchantMembers, users, webhookEvents } from "@ll/db";
import { encryptCredentials } from "../src/services/integrations.js";
import { setHttp } from "../src/services/integrations-http.js";
import { createMerchant as createBaseMerchant, createTestEnv, nextPhone, type TestEnv, grantFeatures } from "./helpers.js";
import { CLOVER_MID, SHOP, b64hmac, cloverOrder, cloverPayment, fakeFetch, hexhmac, lightspeedSale, shopifyOrderPaid, shopifyRefund, toastOrder } from "./integrations-support.js";

/** Pricing v2: these features are paid and hidden at launch; this file's shops are pilots with admin overrides. */
const PILOT_FEATURES = ["integrations.pos_auto_award", "integrations.webhooks"] as const;
async function createMerchant(env: TestEnv, opts: Parameters<typeof createBaseMerchant>[1] = {}) {
  const m = await createBaseMerchant(env, opts);
  await grantFeatures(env, m.merchant.id, [...PILOT_FEATURES]);
  return m;
}


let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
  const c = env.ctx.config;
  c.shopify = { apiKey: "shp_key", apiSecret: "shp_secret" };
  c.clover = { ...c.clover, appId: "clv", appSecret: "clv_secret", webhookAuthCode: "clover-auth" };
  c.lightspeed = { clientId: "ls_id", clientSecret: "ls_secret" };
  c.toast = { ...c.toast, clientId: "t_id", clientSecret: "t_secret", webhookSecret: "toast_secret" };
});
afterEach(async () => env.close());

async function connected(provider: "shopify" | "clover" | "lightspeed" | "toast", accountId: string, extra: Record<string, string> = {}) {
  const m = await createMerchant(env);
  await env.db.insert(integrations).values({
    merchantId: m.merchant.id,
    provider,
    status: "connected",
    externalAccountId: accountId,
    credentialsEnc: encryptCredentials(env.ctx, { accessToken: `${provider}_token`, extra }),
    settings: { autoAward: true, autoEnroll: true },
  });
  return m;
}

const balance = async (merchantId: string, phone: string) => {
  const [u] = await env.db.select().from(users).where(eq(users.phone, phone));
  if (!u) return null;
  const [mm] = await env.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, u.id)));
  return mm?.balance ?? null;
};

describe("Shopify", () => {
  const post = (topic: string, body: unknown, id: string) => {
    const raw = JSON.stringify(body);
    return env.app.inject({
      method: "POST",
      url: "/v1/webhooks/shopify",
      headers: { "content-type": "application/json", "x-shopify-topic": topic, "x-shopify-shop-domain": SHOP, "x-shopify-webhook-id": id, "x-shopify-hmac-sha256": b64hmac("shp_secret", raw) },
      payload: raw,
    });
  };

  it("orders/paid awards (product types map to categories), refunds/create reverses proportionally", async () => {
    const m = await connected("shopify", SHOP, { shop: SHOP });
    await env.db.update(merchantCategories).set({ externalIds: { "shopify:Gift card": "Gift card" } }).where(eq(merchantCategories.id, m.noEarnCategory.id));
    const fake = fakeFetch([["GET", /products\.json\?ids=/, () => ({ json: { products: [{ id: 111, product_type: "Mug" }, { id: 222, product_type: "Gift card" }] } })]]);
    setHttp(env.ctx, fake);
    const phone = nextPhone();
    const r = await post("orders/paid", shopifyOrderPaid(9001, phone), "w-1");
    expect(r.statusCode).toBe(200);
    expect(r.json().results[0].status).toBe("processed");
    expect(await balance(m.merchant.id, phone)).toBe(30); // $15 "gift card" line excluded
    expect(fake.calls[0]!.headers["x-shopify-access-token"]).toBe("shopify_token");
    expect((await post("orders/paid", shopifyOrderPaid(9001, phone), "w-1")).json().results[0].status).toBe("duplicate");
    // $15 of the $45 subtotal refunded → a third of the points.
    await post("refunds/create", shopifyRefund(5001, 9001, "15.00"), "w-2");
    expect(await balance(m.merchant.id, phone)).toBe(20);
  });

  it("bad HMAC → 401; app/uninstalled disconnects", async () => {
    const m = await connected("shopify", SHOP, { shop: SHOP });
    const raw = JSON.stringify(shopifyOrderPaid(1, nextPhone()));
    const bad = await env.app.inject({ method: "POST", url: "/v1/webhooks/shopify", headers: { "content-type": "application/json", "x-shopify-topic": "orders/paid", "x-shopify-shop-domain": SHOP, "x-shopify-hmac-sha256": b64hmac("x", raw) }, payload: raw });
    expect(bad.statusCode).toBe(401);
    await post("app/uninstalled", { id: 1, domain: SHOP }, "w-3");
    const [row] = await env.db.select().from(integrations).where(eq(integrations.merchantId, m.merchant.id));
    expect(row!.status).toBe("disconnected");
  });

  it("connect requires a valid shop domain and builds the shop's authorize URL", async () => {
    const m = await createMerchant(env);
    const h = { authorization: `Bearer ${m.ownerToken}` };
    const bad = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/shopify/connect`, headers: h, payload: { shop: "evil.com" } });
    expect(bad.statusCode).toBe(400);
    const ok = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/shopify/connect`, headers: h, payload: { shop: "corner-shop" } });
    expect(new URL(ok.json().authUrl).host).toBe(SHOP);
  });
});

describe("Clover", () => {
  const post = (body: unknown, authCode = "clover-auth") =>
    env.app.inject({ method: "POST", url: "/v1/webhooks/clover", headers: { "content-type": "application/json", "x-clover-auth": authCode }, payload: JSON.stringify(body) });

  it("answers the verification handshake and awards payments", async () => {
    const m = await connected("clover", CLOVER_MID);
    const phone = nextPhone();
    setHttp(
      env.ctx,
      fakeFetch([
        ["GET", /\/payments\/PAYCLV1\?/, () => ({ json: cloverPayment })],
        ["GET", /\/orders\/ORDCLV1\?/, () => ({ json: cloverOrder("CUSTCLV") })],
        ["GET", /\/items\//, () => ({ json: { categories: { elements: [] } } })],
        ["GET", /\/customers\/CUSTCLV\?/, () => ({ json: { id: "CUSTCLV", firstName: "Jo", phoneNumbers: { elements: [{ phoneNumber: phone }] }, emailAddresses: { elements: [] } } })],
      ]),
    );
    const hs = await env.app.inject({ method: "POST", url: "/v1/webhooks/clover", headers: { "content-type": "application/json" }, payload: JSON.stringify({ verificationCode: "v-123" }) });
    expect(hs.statusCode).toBe(200);
    const body = { appId: "APP", merchants: { [CLOVER_MID]: [{ objectId: "P:PAYCLV1", type: "CREATE", ts: 1793718000000 }] } };
    expect((await post(body, "wrong")).statusCode).toBe(401);
    expect((await post(body)).json().results[0].status).toBe("processed");
    expect(await balance(m.merchant.id, phone)).toBe(20);
    expect((await post(body)).json().results[0].status).toBe("duplicate");
  });
});

describe("Lightspeed", () => {
  it("awards closed sales posted as signed form data and maps outlets", async () => {
    const m = await connected("lightspeed", "cornershop", { domainPrefix: "cornershop" });
    const [loc] = await env.db.insert(locations).values({ merchantId: m.merchant.id, name: "Queen St", address: "2 Queen", qrCode: "LSQR1", externalIds: { lightspeed: "OUTLET1" } }).returning();
    setHttp(env.ctx, fakeFetch([]));
    const phone = nextPhone();
    const raw = new URLSearchParams({ type: "sale.update", domain_prefix: "cornershop", retailer_id: "r1", payload: JSON.stringify(lightspeedSale(phone)) }).toString();
    const r = await env.app.inject({
      method: "POST",
      url: "/v1/webhooks/lightspeed",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-signature": `signature=${hexhmac("ls_secret", raw)}, algorithm=HMAC-SHA256` },
      payload: raw,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().results[0].status).toBe("processed");
    expect(await balance(m.merchant.id, phone)).toBe(25);
    const [ev] = await env.db.select().from(webhookEvents);
    expect(ev!.locationId).toBe(loc!.id);
  });
});

describe("Toast", () => {
  it("awards paid checks; alcohol sales category mapped to no-earn earns nothing", async () => {
    const m = await connected("toast", "rest-guid");
    await env.db.update(merchantCategories).set({ name: "Alcohol", externalIds: { "toast:SC_ALCOHOL": "SC_ALCOHOL" } }).where(eq(merchantCategories.id, m.noEarnCategory.id));
    setHttp(env.ctx, fakeFetch([]));
    const phone = nextPhone();
    const body = { timestamp: "2026-11-03T19:00:00Z", eventCategory: "orders", eventType: "order_updated", guid: "evt-t1", details: { restaurantGuid: "rest-guid", order: toastOrder(phone) } };
    const raw = JSON.stringify(body);
    const r = await env.app.inject({ method: "POST", url: "/v1/webhooks/toast", headers: { "content-type": "application/json", "toast-signature": b64hmac("toast_secret", raw), "toast-restaurant-external-id": "rest-guid" }, payload: raw });
    expect(r.json().results[0].status).toBe("processed");
    expect(await balance(m.merchant.id, phone)).toBe(18);
    // Later update of the same order with a partial refund ($11.30 of $45.20 paid = 25%).
    const body2 = { ...body, guid: "evt-t2", details: { restaurantGuid: "rest-guid", order: toastOrder(phone, 11.3) } };
    const raw2 = JSON.stringify(body2);
    await env.app.inject({ method: "POST", url: "/v1/webhooks/toast", headers: { "content-type": "application/json", "toast-signature": b64hmac("toast_secret", raw2) }, payload: raw2 });
    expect(await balance(m.merchant.id, phone)).toBe(13);
  });

  it("connects with client credentials + restaurant GUID", async () => {
    const m = await createMerchant(env);
    const fake = fakeFetch([
      ["POST", /authentication\/login$/, () => ({ json: { token: { accessToken: "toast_at", expiresIn: 3600 } } })],
      ["GET", /restaurants\/v1\/restaurants\//, () => ({ json: { general: { name: "Bistro" } } })],
      ["GET", /config\/v2\/salesCategories/, () => ({ json: [{ guid: "SC_ALCOHOL", name: "Prescriptions" }] })],
    ]);
    setHttp(env.ctx, fake);
    const r = await env.app.inject({
      method: "POST",
      url: `/v1/merchants/${m.merchant.id}/integrations/toast/connect`,
      headers: { authorization: `Bearer ${m.ownerToken}` },
      payload: { restaurantGuid: "11111111-2222-3333-4444-555555555555" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().integration).toMatchObject({ status: "connected", externalAccountId: "11111111-2222-3333-4444-555555555555" });
    expect(r.json().integration.settings.restaurantName).toBe("Bistro");
    expect(fake.calls[1]!.headers["toast-restaurant-external-id"]).toBe("11111111-2222-3333-4444-555555555555");
  });
});

describe("Google Business Profile", () => {
  it("links a listing and returns join/review links", async () => {
    const m = await createMerchant(env);
    const h = { authorization: `Bearer ${m.ownerToken}` };
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/google_business/connect`, headers: h, payload: { placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().integration.status).toBe("connected");
    const links = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/integrations/google_business/links`, headers: h });
    expect(links.json().joinUrl).toContain(`/join/${m.merchant.slug}`);
    expect(links.json().reviewUrl).toContain("placeid=ChIJN1t_tDeuEmsRUsoyG83frY4");
  });
});

describe("Mailchimp", () => {
  it("syncs only CASL-consenting, un-muted members and unsubscribes withdrawn ones", async () => {
    const m = await createMerchant(env);
    env.ctx.config.mailchimp = { clientId: "mc", clientSecret: "mcs" };
    const { createUser } = await import("./helpers.js");
    const yes = await createUser(env.db, { email: "yes@example.com", name: "Yes Person" });
    const no = await createUser(env.db, { email: "no@example.com" });
    const muted = await createUser(env.db, { email: "muted@example.com" });
    await env.db.insert(merchantMembers).values([
      { merchantId: m.merchant.id, userId: yes.id, marketingConsentAt: new Date("2026-10-01"), marketingConsentSource: "web" },
      { merchantId: m.merchant.id, userId: no.id },
      { merchantId: m.merchant.id, userId: muted.id, marketingConsentAt: new Date("2026-10-01"), muted: true },
    ]);
    await env.db.insert(integrations).values({
      merchantId: m.merchant.id,
      provider: "mailchimp",
      status: "connected",
      externalAccountId: "mc-user",
      credentialsEnc: encryptCredentials(env.ctx, { accessToken: "mc_at", extra: { apiEndpoint: "https://us21.api.mailchimp.com" } }),
      settings: { audienceId: "aud1", syncedHashes: ["5d41402abc4b2a76b9719d911017c592"] },
    });
    const fake = fakeFetch([
      ["GET", /\/3\.0\/lists\?/, () => ({ json: { lists: [{ id: "aud1", name: "Customers" }] } })],
      ["POST", /\/3\.0\/lists\/aud1$/, () => ({ json: { new_members: [] } })],
      ["PATCH", /\/3\.0\/lists\/aud1\/members\//, () => ({ json: {} })],
    ]);
    setHttp(env.ctx, fake);
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/mailchimp/sync`, headers: { authorization: `Bearer ${m.ownerToken}` } });
    expect(r.statusCode).toBe(200);
    expect(r.json().stats).toEqual({ subscribed: 1, unsubscribed: 1 });
    const batch = JSON.parse(fake.calls.find((c) => c.method === "POST")!.body!);
    expect(batch.members.map((x: { email_address: string }) => x.email_address)).toEqual(["yes@example.com"]);
    expect(fake.calls.find((c) => c.method === "PATCH")!.url).toContain("5d41402abc4b2a76b9719d911017c592");
  });
});
