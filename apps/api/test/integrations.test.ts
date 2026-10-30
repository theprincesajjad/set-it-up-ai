import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { integrations, ledgerTransactions, locations, merchantCategories, merchantMembers, merchantStaff, merchants, users, webhookEvents } from "@ll/db";
import { decryptCredentials, encryptCredentials, signOAuthState } from "../src/services/integrations.js";
import { setHttp } from "../src/services/integrations-http.js";
import { retryFailedEvents } from "../src/services/integrations-pipeline.js";
import { createMerchant as createBaseMerchant, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv, grantFeatures } from "./helpers.js";
import { SQ_LOCATION, SQ_MERCHANT, b64hmac, fakeFetch, squareOrderUpdated, squarePaymentUpdated, squareRefundUpdated, squareRoutes } from "./integrations-support.js";

/** Pricing v2: these features are paid and hidden at launch; this file's shops are pilots with admin overrides. */
const PILOT_FEATURES = ["integrations.pos_auto_award", "integrations.webhooks", "marketing.email"] as const;
async function createMerchant(env: TestEnv, opts: Parameters<typeof createBaseMerchant>[1] = {}) {
  const m = await createBaseMerchant(env, opts);
  await grantFeatures(env, m.merchant.id, [...PILOT_FEATURES]);
  return m;
}


let env: TestEnv;
const SIG_KEY = "sq_test_signature_key";

beforeEach(async () => {
  env = await createTestEnv();
  env.ctx.config.square = { appId: "sq0idp-test", appSecret: "sq0csp-test", webhookSignatureKey: SIG_KEY, environment: "sandbox" };
});
afterEach(async () => env.close());

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup(opts: { phone?: string | null; orderCustomer?: string | null } = {}) {
  const m = await createMerchant(env);
  const [loc] = await env.db.insert(locations).values({ merchantId: m.merchant.id, name: "Main St", address: "1 Main St", qrCode: `QR${Date.now()}${Math.random()}`.slice(0, 20) }).returning();
  const phone = opts.phone === undefined ? nextPhone() : opts.phone;
  const fake = fakeFetch(squareRoutes({ phone, orderCustomer: opts.orderCustomer }));
  setHttp(env.ctx, fake);
  return { ...m, location: loc!, phone, fake };
}

/** Connect Square through the real OAuth flow (fake token endpoint). */
async function connectSquare(m: Awaited<ReturnType<typeof setup>>) {
  const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/square/connect`, headers: auth(m.ownerToken), payload: {} });
  expect(r.statusCode).toBe(200);
  const authUrl = new URL(r.json().authUrl);
  const cb = await env.app.inject({ method: "GET", url: `/v1/integrations/square/callback?code=sq_code&state=${encodeURIComponent(authUrl.searchParams.get("state")!)}` });
  expect(cb.statusCode).toBe(302);
  expect(cb.headers.location).toContain("status=connected");
  return authUrl;
}

async function postSquare(body: unknown, opts: { badSig?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const url = `${env.ctx.config.publicApiUrl}/v1/webhooks/square`;
  return env.app.inject({
    method: "POST",
    url: "/v1/webhooks/square",
    headers: { "content-type": "application/json", "x-square-hmacsha256-signature": b64hmac(opts.badSig ? "wrong" : SIG_KEY, url + raw) },
    payload: raw,
  });
}

const memberByPhone = async (merchantId: string, phone: string) => {
  const [u] = await env.db.select().from(users).where(eq(users.phone, phone));
  if (!u) return null;
  const [mm] = await env.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, u.id)));
  return mm ?? null;
};

describe("integrations catalog + OAuth", () => {
  it("lists every connector, marks paid ones (Pricing v2) and requires a manager", async () => {
    const m = await setup();
    const r = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/integrations`, headers: auth(m.ownerToken) });
    expect(r.statusCode).toBe(200);
    const items = r.json().items as { provider: string; free: boolean; status: string; available: boolean; category: string }[];
    expect(items.map((i) => i.provider)).toEqual(expect.arrayContaining(["square", "clover", "shopify", "lightspeed", "toast", "google_business", "mailchimp", "zapier", "make", "webhooks", "api", "twilio"]));
    // Pricing v2: POS, Mailchimp and automation (webhooks/API/Zapier/Make) are Plus; Google Business and Twilio stay free.
    expect(items.filter((i) => i.free).map((i) => i.provider).sort()).toEqual(["google_business", "twilio"]);
    // This pilot shop has the paid features via admin overrides, so nothing is locked.
    expect(items.every((i) => !(i as unknown as { locked: boolean }).locked)).toBe(true);
    expect(items.find((i) => i.provider === "square")).toMatchObject({ status: "not_connected", available: true, category: "pos" });
    expect(items.find((i) => i.provider === "clover")!.available).toBe(false);

    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/integrations` })).statusCode).toBe(401);
    const clerk = await createUser(env.db);
    await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: clerk.id, role: "staff" });
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/integrations`, headers: auth(await tokenFor(env, clerk)) })).statusCode).toBe(403);
  });

  it("returns 503 not_configured when platform credentials are missing", async () => {
    const m = await setup();
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/clover/connect`, headers: auth(m.ownerToken), payload: {} });
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe("not_configured");
  });

  it("connects Square via OAuth, stores encrypted credentials, syncs and auto-maps", async () => {
    const m = await setup();
    const authUrl = await connectSquare(m);
    expect(authUrl.origin).toBe("https://connect.squareupsandbox.com");
    expect(authUrl.searchParams.get("scope")).toContain("ORDERS_READ");
    const [row] = await env.db.select().from(integrations).where(eq(integrations.merchantId, m.merchant.id));
    expect(row).toMatchObject({ status: "connected", externalAccountId: SQ_MERCHANT });
    expect(row!.credentialsEnc).not.toContain("sq_access_1");
    expect(decryptCredentials(env.ctx, row!.credentialsEnc)!.accessToken).toBe("sq_access_1");
    expect(row!.settings._oauthNonce).toBeUndefined();
    // Token exchange sent our app secret to Square, not to anyone else.
    const tokenCall = m.fake.calls.find((c) => c.url.endsWith("/oauth2/token"))!;
    expect(JSON.parse(tokenCall.body!)).toMatchObject({ code: "sq_code", grant_type: "authorization_code", client_secret: "sq0csp-test" });
    // Sync: single location mapped, "Prescriptions" category matched by name.
    const [loc] = await env.db.select().from(locations).where(eq(locations.id, m.location.id));
    expect(loc!.externalIds.square).toBe(SQ_LOCATION);
    const [cat] = await env.db.select().from(merchantCategories).where(eq(merchantCategories.id, m.noEarnCategory.id));
    expect(cat!.externalIds["square:CAT_RX"]).toBe("CAT_RX");

    const detail = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/integrations/square`, headers: auth(m.ownerToken) });
    expect(detail.json().mapping).toEqual({ locationMap: { [SQ_LOCATION]: m.location.id }, categoryMap: { CAT_RX: m.noEarnCategory.id } });
    expect(detail.json().settings.externalLocations).toHaveLength(1);
  });

  it("rejects tampered, replayed, expired and cross-provider OAuth state", async () => {
    const m = await setup();
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/square/connect`, headers: auth(m.ownerToken), payload: {} });
    const state = new URL(r.json().authUrl).searchParams.get("state")!;
    const [payload, sig] = state.split(".");
    // Swap the merchant id in the payload (keeping the signature): CSRF / account-binding attack.
    const other = await createMerchant(env);
    const forged = JSON.parse(Buffer.from(payload!, "base64url").toString());
    forged.m = other.merchant.id;
    const tampered = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
    const cb = (s: string, provider = "square") => env.app.inject({ method: "GET", url: `/v1/integrations/${provider}/callback?code=x&state=${encodeURIComponent(s)}` });
    let res = await cb(tampered);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("error=invalid_state");
    res = await cb(state, "clover");
    expect(res.headers.location).toContain("error=invalid_state");
    // State minted by us but never issued for this connect attempt (nonce mismatch).
    res = await cb(signOAuthState(env.ctx, { merchantId: m.merchant.id, userId: m.owner.id, provider: "square", nonce: "guess" }));
    expect(res.headers.location).toContain("error=invalid_state");
    // Expired.
    env.clock.now = new Date(env.clock.now.getTime() + 16 * 60_000);
    res = await cb(state);
    expect(res.headers.location).toContain("error=invalid_state");
    env.clock.now = new Date(env.clock.now.getTime() - 16 * 60_000);
    // Valid once, then replay fails.
    expect((await cb(state)).headers.location).toContain("status=connected");
    expect((await cb(state)).headers.location).toContain("error=invalid_state");
    expect(m.fake.calls.filter((c) => c.url.endsWith("/oauth2/token"))).toHaveLength(1);
  });

  it("rejects the callback if the user lost manager access meanwhile", async () => {
    const m = await setup();
    const mgr = await createUser(env.db);
    await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: mgr.id, role: "manager" });
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/square/connect`, headers: auth(await tokenFor(env, mgr)), payload: {} });
    const state = new URL(r.json().authUrl).searchParams.get("state")!;
    await env.db.update(merchantStaff).set({ role: "staff" }).where(eq(merchantStaff.userId, mgr.id));
    const res = await env.app.inject({ method: "GET", url: `/v1/integrations/square/callback?code=x&state=${encodeURIComponent(state)}` });
    expect(res.headers.location).toContain("error=forbidden");
  });

  it("disconnects (revokes at Square, drops credentials)", async () => {
    const m = await setup();
    await connectSquare(m);
    const r = await env.app.inject({ method: "DELETE", url: `/v1/merchants/${m.merchant.id}/integrations/square`, headers: auth(m.ownerToken) });
    expect(r.json().status).toBe("disconnected");
    expect(m.fake.calls.some((c) => c.url.endsWith("/oauth2/revoke"))).toBe(true);
    const [row] = await env.db.select().from(integrations).where(eq(integrations.merchantId, m.merchant.id));
    expect(row!.credentialsEnc).toBeNull();
  });
});

describe("POS webhook pipeline (Square)", () => {
  it("awards once per sale, honours no-earn categories, maps the location", async () => {
    const m = await setup();
    await connectSquare(m);
    const r1 = await postSquare(squarePaymentUpdated({ eventId: "evt_1", orderId: "ORDER_1" }));
    expect(r1.statusCode).toBe(200);
    expect(r1.json().results[0].status).toBe("processed");
    const member = await memberByPhone(m.merchant.id, m.phone!);
    expect(member!.balance).toBe(30); // $30 front store; $20 prescription excluded
    expect(member!.joinedVia).toBe("pos");
    const [tx] = await env.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.memberId, member!.id));
    expect(tx).toMatchObject({ source: "square", idempotencyKey: "square:ORDER_1", locationId: m.location.id, amountCents: 5000, eligibleCents: 3000 });

    // Same notification redelivered → deduped by event id.
    const r2 = await postSquare(squarePaymentUpdated({ eventId: "evt_1", orderId: "ORDER_1" }));
    expect(r2.json().results[0].status).toBe("duplicate");
    // order.updated for the same sale → deduped by the ledger idempotency key.
    const r3 = await postSquare(squareOrderUpdated("evt_2", "ORDER_1"));
    expect(r3.json().results[0].status).toBe("duplicate");
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(30);
    expect((await memberByPhone(m.merchant.id, m.phone!))!.visitCount).toBe(1);
    expect(await env.db.select().from(webhookEvents)).toHaveLength(2);
  });

  it("rejects bad signatures without storing anything", async () => {
    const m = await setup();
    await connectSquare(m);
    const r = await postSquare(squarePaymentUpdated({ eventId: "evt_x", orderId: "ORDER_1" }), { badSig: true });
    expect(r.statusCode).toBe(401);
    expect(await env.db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("applies category mapping changes made in settings", async () => {
    const m = await setup();
    await connectSquare(m);
    // Unmap Rx: the whole $50 earns.
    let r = await env.app.inject({ method: "PATCH", url: `/v1/merchants/${m.merchant.id}/integrations/square`, headers: auth(m.ownerToken), payload: { categoryMap: { CAT_RX: null } } });
    expect(r.statusCode).toBe(200);
    expect(r.json().mapping.categoryMap).toEqual({});
    await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "ORDER_A" }));
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(50);
    // Map it back explicitly.
    r = await env.app.inject({ method: "PATCH", url: `/v1/merchants/${m.merchant.id}/integrations/square`, headers: auth(m.ownerToken), payload: { categoryMap: { CAT_RX: m.noEarnCategory.id } } });
    expect(r.json().mapping.categoryMap).toEqual({ CAT_RX: m.noEarnCategory.id });
    await postSquare(squarePaymentUpdated({ eventId: "e2", orderId: "ORDER_B" }));
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(80);
    // Unknown category id is rejected.
    r = await env.app.inject({ method: "PATCH", url: `/v1/merchants/${m.merchant.id}/integrations/square`, headers: auth(m.ownerToken), payload: { categoryMap: { CAT_RX: "00000000-0000-4000-8000-000000000000" } } });
    expect(r.statusCode).toBe(400);
  });

  it("reverses points on full refunds and proportionally on partial refunds", async () => {
    const m = await setup();
    await connectSquare(m);
    await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "ORDER_1" }));
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(30);
    // Half the money back → half the points.
    await postSquare(squareRefundUpdated("r1", "REF_1", 2825));
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(15);
    // Same refund again → no change.
    await postSquare(squareRefundUpdated("r1b", "REF_1", 2825));
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(15);
    // The rest → all points gone, never more than were earned.
    await postSquare(squareRefundUpdated("r2", "REF_2", 2825));
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(0);
    await postSquare(squareRefundUpdated("r3", "REF_3", 1000));
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(0);
  });

  it("full refund uses reverseTransaction", async () => {
    const m = await setup();
    await connectSquare(m);
    await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "ORDER_1" }));
    await postSquare(squareRefundUpdated("r1", "REF_1", 5650));
    const member = await memberByPhone(m.merchant.id, m.phone!);
    expect(member!.balance).toBe(0);
    const txs = await env.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.memberId, member!.id));
    expect(txs.find((t) => t.type === "earn")!.reversedAt).not.toBeNull();
    expect(txs.find((t) => t.type === "reversal")!.points).toBe(-30);
  });

  it("records purchases without a customer as unmatched; staff attach a phone to award", async () => {
    const m = await setup({ phone: null, orderCustomer: null });
    await connectSquare(m);
    const r = await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "ORDER_U", customerId: null }));
    expect(r.json().results[0].status).toBe("unmatched");
    // The order.updated twin doesn't create a second claimable record.
    expect((await postSquare(squareOrderUpdated("e2", "ORDER_U"))).json().results[0].status).toBe("duplicate");

    const list = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/integrations/unmatched`, headers: auth(m.ownerToken) });
    expect(list.json().items).toHaveLength(1);
    const item = list.json().items[0];
    expect(item).toMatchObject({ provider: "square", status: "unmatched", receiptCode: "PAYA", totalCents: 5000, locationId: m.location.id });

    const phone = nextPhone();
    const clerk = await createUser(env.db);
    await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: clerk.id, role: "staff" });
    const attach = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/unmatched/${item.id}/attach`, headers: auth(await tokenFor(env, clerk)), payload: { phone } });
    expect(attach.statusCode).toBe(200);
    expect(attach.json()).toMatchObject({ pointsAwarded: 30, balance: 30 });
    const again = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/integrations/unmatched/${item.id}/attach`, headers: auth(m.ownerToken), payload: { phone: nextPhone() } });
    expect(again.statusCode).toBe(409);
    // Other merchants can't touch it.
    const other = await createMerchant(env);
    const cross = await env.app.inject({ method: "POST", url: `/v1/merchants/${other.merchant.id}/integrations/unmatched/${item.id}/attach`, headers: auth(other.ownerToken), payload: { phone } });
    expect(cross.statusCode).toBe(404);
  });

  it("customers claim an unmatched purchase with the receipt code", async () => {
    const m = await setup({ phone: null, orderCustomer: null });
    await connectSquare(m);
    await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "ORDER_C", customerId: null }));
    const customer = await createUser(env.db);
    const token = await tokenFor(env, customer);
    const bad = await env.app.inject({ method: "POST", url: "/v1/me/purchases/claim", headers: auth(token), payload: { merchantId: m.merchant.id, code: "NOPE" } });
    expect(bad.statusCode).toBe(404);
    const ok = await env.app.inject({ method: "POST", url: "/v1/me/purchases/claim", headers: auth(token), payload: { merchantId: m.merchant.id, code: "paya" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().pointsAwarded).toBe(30);
    const [mm] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.userId, customer.id));
    expect(mm!.balance).toBe(30);
    const twice = await env.app.inject({ method: "POST", url: "/v1/me/purchases/claim", headers: auth(await tokenFor(env, await createUser(env.db))), payload: { merchantId: m.merchant.id, code: "PAYA" } });
    expect(twice.statusCode).toBe(409);
    expect((await env.app.inject({ method: "POST", url: "/v1/me/purchases/claim", payload: { merchantId: m.merchant.id, code: "PAYA" } })).statusCode).toBe(401);
  });

  it("refunding an unmatched sale retires it", async () => {
    const m = await setup({ phone: null, orderCustomer: null });
    await connectSquare(m);
    await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "ORDER_1", customerId: null }));
    await postSquare(squareRefundUpdated("r1", "REF_1", 5650));
    const [row] = await env.db.select().from(webhookEvents).where(eq(webhookEvents.externalId, "e1"));
    expect(row!.status).toBe("refunded");
  });

  it("respects autoAward=false and paused merchants", async () => {
    const m = await setup();
    await connectSquare(m);
    await env.app.inject({ method: "PATCH", url: `/v1/merchants/${m.merchant.id}/integrations/square`, headers: auth(m.ownerToken), payload: { autoAward: false } });
    expect((await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "O1" }))).json().results[0].status).toBe("ignored");
    await env.app.inject({ method: "PATCH", url: `/v1/merchants/${m.merchant.id}/integrations/square`, headers: auth(m.ownerToken), payload: { autoAward: true } });
    await env.db.update(merchants).set({ status: "paused" }).where(eq(merchants.id, m.merchant.id));
    expect((await postSquare(squarePaymentUpdated({ eventId: "e2", orderId: "O2" }))).json().results[0].status).toBe("ignored");
    expect(await memberByPhone(m.merchant.id, m.phone!)).toBeNull();
  });

  it("Pricing v2: a shop without POS auto-award can't connect; an existing connection pauses with a clear status", async () => {
    // Not a pilot: no overrides, so the Plus features are locked (hidden at launch).
    const plain = await createBaseMerchant(env);
    const list = (await env.app.inject({ method: "GET", url: `/v1/merchants/${plain.merchant.id}/integrations`, headers: auth(plain.ownerToken) })).json().items as {
      provider: string;
      locked: boolean;
      feature: string | null;
    }[];
    expect(list.find((i) => i.provider === "square")).toMatchObject({ locked: true, feature: "integrations.pos_auto_award" });
    expect(list.find((i) => i.provider === "google_business")).toMatchObject({ locked: false, feature: null });
    const c = await env.app.inject({ method: "POST", url: `/v1/merchants/${plain.merchant.id}/integrations/square/connect`, headers: auth(plain.ownerToken), payload: {} });
    expect(c.statusCode).toBe(402);
    expect(c.json().error.code).toBe("feature_locked");

    // A pilot that connected Square, then lost the feature (override removed): connection kept, awarding stops.
    const m = await setup();
    await connectSquare(m);
    await grantFeatures(env, m.merchant.id, ["integrations.pos_auto_award"], false);
    const r = await postSquare(squarePaymentUpdated({ eventId: "lost_1", orderId: "LOST_1" }));
    expect(r.json().results[0].status).toBe("ignored");
    const [ev] = await env.db.select().from(webhookEvents).where(eq(webhookEvents.externalId, "lost_1"));
    expect(ev!.error).toMatch(/paused: it's a Pro feature/);
    expect(await memberByPhone(m.merchant.id, m.phone!)).toBeNull();
    const sq = (await env.app.inject({ method: "GET", url: `/v1/merchants/${m.merchant.id}/integrations`, headers: auth(m.ownerToken) })).json().items.find((i: { provider: string }) => i.provider === "square");
    expect(sq).toMatchObject({ status: "connected", locked: true });
    expect(sq.pausedReason).toMatch(/^Paused: POS auto-award is a Studio feature/);
    // Re-enabled → awards again; nothing was deleted.
    await grantFeatures(env, m.merchant.id, ["integrations.pos_auto_award"]);
    expect((await postSquare(squarePaymentUpdated({ eventId: "back_1", orderId: "BACK_1" }))).json().results[0].status).toBe("processed");
  });

  it("autoEnroll=false only awards existing members", async () => {
    const m = await setup();
    await connectSquare(m);
    await env.app.inject({ method: "PATCH", url: `/v1/merchants/${m.merchant.id}/integrations/square`, headers: auth(m.ownerToken), payload: { autoEnroll: false } });
    expect((await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "O1" }))).json().results[0].status).toBe("unmatched");
  });

  it("ignores events for accounts nobody connected", async () => {
    await setup();
    const r = await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "O1" }));
    expect(r.statusCode).toBe(200);
    expect(r.json().results[0].status).toBe("ignored");
  });

  it("retries transient provider errors from the job", async () => {
    const m = await setup();
    await connectSquare(m);
    let fail = true;
    const base = fakeFetch(squareRoutes({ phone: m.phone }));
    setHttp(env.ctx, (async (input: string | URL | Request, init?: RequestInit) => {
      if (fail && String(input).includes("/v2/orders/")) return new Response("{}", { status: 503 });
      return base(input, init);
    }) as typeof fetch);
    expect((await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "O1" }))).json().results[0].status).toBe("retry");
    fail = false;
    expect((await retryFailedEvents(env.ctx)).attempted).toBe(0); // not due yet
    env.clock.now = new Date(env.clock.now.getTime() + 2 * 60_000);
    expect(await retryFailedEvents(env.ctx)).toEqual({ attempted: 1, ok: 1 });
    expect((await memberByPhone(m.merchant.id, m.phone!))!.balance).toBe(30);
  });

  it("refreshes expiring tokens before calling Square", async () => {
    const m = await setup();
    await connectSquare(m);
    const [row] = await env.db.select().from(integrations).where(eq(integrations.merchantId, m.merchant.id));
    await env.db
      .update(integrations)
      .set({ credentialsEnc: encryptCredentials(env.ctx, { accessToken: "old", refreshToken: "sq_refresh_1", expiresAt: env.clock.now.toISOString() }) })
      .where(eq(integrations.id, row!.id));
    await postSquare(squarePaymentUpdated({ eventId: "e1", orderId: "O1" }));
    const orderCall = m.fake.calls.find((c) => c.url.includes("/v2/orders/O1"))!;
    expect(orderCall.headers.authorization).toBe("Bearer sq_access_1");
  });
});
