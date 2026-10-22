import { createHash, generateKeyPairSync, randomUUID, verify as cryptoVerify } from "node:crypto";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { unzipSync } from "fflate";
import { importSPKI, jwtVerify, decodeProtectedHeader } from "jose";
import forge from "node-forge";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locations, loyaltyPrograms, merchantMembers, users, walletDeviceRegistrations, walletPasses } from "@ll/db";
import type { walletApi } from "@ll/shared";
import { eq } from "drizzle-orm";
import { rotateApiKey } from "../src/services/merchant.js";
import { awardPurchase, redeemReward, reverseTransaction } from "../src/services/ledger.js";
import { setHttp } from "../src/services/integrations-http.js";
import { consoleApns, http2Apns, setApnsPusher } from "../src/services/wallet-apns.js";
import { buildPassJson, passImages, signManifest, unsignedBundle } from "../src/services/wallet-apple.js";
import { addGoogleMessage, clearGoogleTokenCache, loyaltyClass, loyaltyObject, updateGoogleObject } from "../src/services/wallet-google.js";
import { pngSize } from "../src/services/wallet-png.js";
import { notifyPassUpdate, passLocations, walletSummary } from "../src/services/wallet.js";
import { createMerchant, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv, grantFeatures } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
  clearGoogleTokenCache();
});
afterEach(async () => env.close());

function selfSignedCert(cn: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }).toString());
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-01-01");
  cert.validity.notAfter = new Date("2028-01-01");
  const attrs = [{ name: "commonName", value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(forge.pki.privateKeyFromPem(keyPem), forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}

function configureApple() {
  const signer = selfSignedCert("Pass Type ID: pass.test.loyalty");
  const wwdr = selfSignedCert("Test WWDR");
  env.ctx.config.apple = { passTypeId: "pass.test.loyalty", teamId: "TEAM123456", certPem: signer.certPem, keyPem: signer.keyPem, wwdrPem: wwdr.certPem };
  return signer;
}

function configureGoogle() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  env.ctx.config.google = {
    ...env.ctx.config.google,
    walletIssuerId: "3388000000012345678",
    walletServiceAccountJson: Buffer.from(JSON.stringify({ client_email: "wallet@proj.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() })).toString("base64"),
  };
  return { publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}

/** Recording fake fetch for Google (OAuth token + Wallet REST). */
function recordGoogle(status: (url: string) => number = () => 200) {
  const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const raw = String(init.body ?? "");
    const headers = init.headers as Record<string, string>;
    const body = headers["content-type"]?.includes("json") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    calls.push({ method: init.method ?? "GET", url, headers, body });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600, token_type: "Bearer" }), { status: 200 });
    return new Response(JSON.stringify({}), { status: status(url) });
  }) as unknown as typeof fetch;
  return { calls, fetch: f };
}

async function customerWithPoints() {
  const m = await createMerchant(env);
  // The merchant REST API is Plus (Pricing v2): this shop is a pilot with an admin override.
  await grantFeatures(env, m.merchant.id, ["integrations.webhooks"]);
  const phone = nextPhone();
  const key = await rotateApiKey(env.ctx, m.merchant.id, m.owner.id);
  await env.app.inject({ method: "POST", url: "/v1/api/award", headers: { "x-ll-api-key": key }, payload: { phone, amountCents: 4200 } });
  const [mm] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, m.merchant.id));
  const [u] = await env.db.select().from(users).where(eq(users.id, mm!.userId));
  return { m, member: mm!, user: u!, token: await tokenFor(env, u!), key, phone };
}

/** Deterministic summary for snapshots: a points shop with a reward ready, a stamps shop with expiry, one more. */
const FIXED_SUMMARY: walletApi.WalletSummary = {
  memberCode: "K7Q2M9",
  qrValue: "LL:K7Q2M9",
  name: "Priya",
  shopCount: 3,
  totalPoints: 137,
  rewardsReady: 1,
  shops: [
    { merchantId: "11111111-1111-4111-8111-111111111111", name: "Pinecone Coffee", slug: "pinecone", balance: 130, terminology: "points", expiryMonths: null, rewardsReady: 1, lastVisitAt: "2026-11-03T14:00:00.000Z" },
    { merchantId: "22222222-2222-4222-8222-222222222222", name: "Dundas West Bakery & Café", slug: "dw-bakery", balance: 7, terminology: "stamps", expiryMonths: 12, rewardsReady: 0, lastVisitAt: "2026-10-30T14:00:00.000Z" },
    { merchantId: "33333333-3333-4333-8333-333333333333", name: "Ossington Repair", slug: "oss-repair", balance: 0, terminology: "points", expiryMonths: null, rewardsReady: 0, lastVisitAt: null },
  ],
};
const FIXED_LOCATIONS = [
  { latitude: 43.6496, longitude: -79.4218, relevantText: "Show this at Pinecone Coffee to earn" },
  { latitude: 43.6502, longitude: -79.4305, relevantText: "Show this at Dundas West Bakery & Café to earn" },
];

describe("Apple Wallet pass (v2 design)", () => {
  it("pass.json snapshot: near-black storeCard, rewards ready header, per-shop balances (never summed), QR, locations, no relevantDate", async () => {
    const p = { passTypeId: "pass.test.loyalty", teamId: "TEAM123456" };
    const pass = buildPassJson(env.ctx.config, p, { serialNumber: "A_SERIAL", authToken: "t".repeat(32), summary: FIXED_SUMMARY, locations: FIXED_LOCATIONS });
    expect(pass).toMatchSnapshot();

    expect(pass).toMatchObject({ backgroundColor: "rgb(11, 11, 12)", foregroundColor: "rgb(245, 245, 244)", labelColor: "rgb(255, 122, 69)", logoText: "local loyalty" });
    expect(pass).not.toHaveProperty("relevantDate");
    expect(pass.barcodes).toEqual([{ format: "PKBarcodeFormatQR", message: "LL:K7Q2M9", messageEncoding: "iso-8859-1", altText: "K7Q2M9" }]);
    expect(pass.storeCard.headerFields[0]).toMatchObject({ key: "ready", label: "rewards ready", value: 1 });
    expect(pass.storeCard.primaryFields[0]).toMatchObject({ value: "1 reward", label: "ready at Pinecone Coffee" });
    // Top two shops in their own units; the first carries the lock-screen change message.
    expect(pass.storeCard.secondaryFields).toEqual([
      { key: "shop1", label: "pinecone coffee", value: "130 points", changeMessage: "You now have %@ at Pinecone Coffee" },
      { key: "shop2", label: "dundas west bakery…", value: "7 stamps" },
    ]);
    const json = JSON.stringify(pass);
    expect(json).not.toContain("137"); // the deprecated cross-shop sum is never shown
    const back = Object.fromEntries(pass.storeCard.backFields.map((f) => [f.key, f.value]));
    expect(back.memberships).toContain("Pinecone Coffee: 130 points (1 reward ready)");
    expect(back.memberships).toContain("Dundas West Bakery & Café: 7 stamps\nStamps expire after 12 months with no visits.");
    expect(back.memberships).toContain("Ossington Repair: 0 points");
    expect(back.expiry).toContain("Dundas West Bakery & Café: after 12 months without a visit.");
    expect(back.terms).toBe("http://localhost:3000/terms");
    expect(back.help).toBe("hello@localloyalty.example");
    expect(Object.keys(back)).toEqual(["memberships", "expiry", "how", "code", "updates", "terms", "help"]);
    expect(pass.locations).toEqual(FIXED_LOCATIONS);

    // No rewards ready → the primary field is the shop count.
    const none = buildPassJson(env.ctx.config, p, { serialNumber: "S", authToken: "t", summary: { ...FIXED_SUMMARY, rewardsReady: 0, shops: FIXED_SUMMARY.shops.map((s) => ({ ...s, rewardsReady: 0 })) } });
    expect(none.storeCard.primaryFields[0]).toMatchObject({ label: "member at", value: "3 shops" });
    expect(none).not.toHaveProperty("locations");
    const empty = buildPassJson(env.ctx.config, p, { serialNumber: "S", authToken: "t", summary: { ...FIXED_SUMMARY, shopCount: 0, rewardsReady: 0, shops: [] } });
    expect(empty.storeCard.backFields[0]!.value).toContain("Show this card at any participating shop");
  });

  it("ships the v2 four-corners artwork at 1x/2x/3x (rendered from the brand SVGs)", () => {
    const img = passImages();
    expect(Object.keys(img).sort()).toEqual(["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "logo@3x.png"]);
    expect(pngSize(img["icon.png"]!)).toEqual({ width: 29, height: 29 });
    expect(pngSize(img["icon@2x.png"]!)).toEqual({ width: 58, height: 58 });
    expect(pngSize(img["icon@3x.png"]!)).toEqual({ width: 87, height: 87 });
    expect(pngSize(img["logo.png"]!)).toEqual({ width: 50, height: 50 });
    expect(pngSize(img["logo@3x.png"]!)).toEqual({ width: 150, height: 150 });
  });

  it("summary: rewards ready per shop, shops with rewards first, then most recent visit; manifest has SHA-1s", async () => {
    const { user, m } = await customerWithPoints();
    let s = await walletSummary(env.ctx, user.id);
    expect(s).toMatchObject({ shopCount: 1, rewardsReady: 0, qrValue: `LL:${user.memberCode}` });
    expect(s.shops[0]).toMatchObject({ name: "Test Shop", balance: 42, terminology: "points", rewardsReady: 0, slug: m.merchant.slug });
    const other = await createMerchant(env, { earnType: "stamps" });
    await env.db.update(loyaltyPrograms).set({ terminology: "stamps" }).where(eq(loyaltyPrograms.merchantId, other.merchant.id));
    env.clock.now = new Date(env.clock.now.getTime() + 3600_000);
    await awardPurchase(env.ctx, { merchantId: other.merchant.id, userId: user.id, source: "staff_app", quantity: 2 });
    s = await walletSummary(env.ctx, user.id);
    expect(s.shops.map((x) => [x.balance, x.terminology])).toEqual([
      [2, "stamps"],
      [42, "points"],
    ]);
    expect(s.shops[0]!.merchantId).toBe(other.merchant.id); // most recent visit first
    env.clock.now = new Date(env.clock.now.getTime() + 3600_000);
    await awardPurchase(env.ctx, { merchantId: m.merchant.id, userId: user.id, source: "staff_app", amountCents: 1000 });
    s = await walletSummary(env.ctx, user.id);
    expect(s.rewardsReady).toBe(1); // 52 >= 50
    expect(s.shops[0]).toMatchObject({ merchantId: m.merchant.id, rewardsReady: 1 });

    const p = { passTypeId: "pass.test.loyalty", teamId: "TEAM123456" };
    const { files, manifest } = unsignedBundle(env.ctx.config, p, { serialNumber: "SER1", authToken: "a".repeat(32), summary: s });
    const man = JSON.parse(manifest.toString());
    for (const [name, buf] of Object.entries(files)) expect(man[name]).toBe(createHash("sha1").update(buf).digest("hex"));
  });

  it("locations: up to 10 member-shop locations, nearest first, with relevantText", async () => {
    const { user, m } = await customerWithPoints();
    const rows = Array.from({ length: 12 }, (_, i) => ({ merchantId: m.merchant.id, name: `Loc ${i}`, address: `${i} Dundas St W`, lat: 43.65 + i * 0.001, lng: -79.42, qrCode: `QR${randomUUID().slice(0, 8)}` }));
    await env.db.insert(locations).values(rows);
    await env.db.insert(locations).values({ merchantId: m.merchant.id, name: "No coords", address: "x", qrCode: `QR${randomUUID().slice(0, 8)}` });
    const locs = await passLocations(env.ctx, user.id);
    expect(locs).toHaveLength(10);
    expect(locs[0]).toEqual({ latitude: 43.65, longitude: -79.42, relevantText: "Show this at Test Shop to earn" });
  });

  it("signs the manifest as a detached PKCS#7 (self-signed test cert) that verifies against the pass certificate", async () => {
    const signer = selfSignedCert("Pass Type ID: pass.test.loyalty");
    const wwdr = selfSignedCert("Test WWDR");
    const manifest = Buffer.from(JSON.stringify({ "pass.json": "abc" }));
    const der = signManifest(manifest, { certPem: signer.certPem, keyPem: signer.keyPem, wwdrPem: wwdr.certPem });
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString("binary")));
    const msg = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData & { rawCapture: unknown };
    expect(msg.certificates).toHaveLength(2);
    expect(msg.certificates.map((c) => c.subject.getField("CN").value)).toContain("Test WWDR");
    const signedData = (asn1.value as forge.asn1.Asn1[])[1]!.value[0] as forge.asn1.Asn1;
    const contentInfo = (signedData.value as forge.asn1.Asn1[])[2]!;
    expect((contentInfo.value as forge.asn1.Asn1[]).length).toBe(1); // detached
    const signerInfos = (signedData.value as forge.asn1.Asn1[]).at(-1)!;
    const signerInfo = (signerInfos.value as forge.asn1.Asn1[])[0]!;
    const parts = signerInfo.value as forge.asn1.Asn1[];
    const attrs = parts.find((p) => p.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && p.type === 0)!;
    const sig = Buffer.from(parts.at(-1)!.value as string, "binary");
    const digestAttr = (attrs.value as forge.asn1.Asn1[]).find((a) => forge.asn1.derToOid((a.value as forge.asn1.Asn1[])[0]!.value as string) === forge.pki.oids.messageDigest)!;
    const digest = Buffer.from(((digestAttr.value as forge.asn1.Asn1[])[1]!.value as forge.asn1.Asn1[])[0]!.value as string, "binary");
    expect(digest.toString("hex")).toBe(createHash("sha256").update(manifest).digest("hex"));
    const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs.value as forge.asn1.Asn1[]);
    const signedBytes = Buffer.from(forge.asn1.toDer(set).getBytes(), "binary");
    expect(cryptoVerify("sha256", signedBytes, signer.publicKeyPem, sig)).toBe(true);
    expect(cryptoVerify("sha256", Buffer.concat([signedBytes, Buffer.from("x")]), signer.publicKeyPem, sig)).toBe(false);
  });

  it("GET /v1/me/wallet/apple: 503 without certs, a zipped signed .pkpass with them; one pass per customer", async () => {
    const { token, user } = await customerWithPoints();
    const h = { authorization: `Bearer ${token}` };
    const off = await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: h });
    expect(off.statusCode).toBe(503);
    expect(off.json().error).toMatchObject({ code: "wallet_not_configured" });
    expect(off.json().error.details.missing).toContain("APPLE_PASS_CERT_PEM");
    expect((await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple" })).statusCode).toBe(401);

    configureApple();
    const r = await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/vnd.apple.pkpass");
    const files = unzipSync(new Uint8Array(r.rawPayload));
    expect(Object.keys(files).sort()).toEqual(["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "logo@3x.png", "manifest.json", "pass.json", "signature"]);
    const pass = JSON.parse(Buffer.from(files["pass.json"]!).toString());
    expect(pass.barcodes[0]).toMatchObject({ message: `LL:${user.memberCode}`, altText: user.memberCode });
    expect(pass.storeCard.secondaryFields[0]).toMatchObject({ value: "42 points" });
    await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: h });
    expect(await env.db.select().from(walletPasses).where(eq(walletPasses.userId, user.id))).toHaveLength(1);

    const status = await env.app.inject({ method: "GET", url: "/v1/me/wallet", headers: h });
    expect(status.json().apple.available).toBe(true);
    expect(status.json().summary).toMatchObject({ rewardsReady: 0, shopCount: 1 });
    const dlUrl = new URL(status.json().apple.downloadUrl);
    expect((await env.app.inject({ method: "GET", url: dlUrl.pathname + dlUrl.search })).statusCode).toBe(200);
    expect((await env.app.inject({ method: "GET", url: `/v1/wallet/apple/download?token=${user.id}.9999999999999.deadbeef` })).statusCode).toBe(401);
    const logo = await env.app.inject({ method: "GET", url: "/v1/wallet/assets/logo.png" });
    expect(pngSize(Buffer.from(logo.rawPayload))).toEqual({ width: 660, height: 660 });
  });
});

describe("PassKit web service + pass updates", () => {
  it("register → serials since → latest pass → log → unregister; award, redeem, reversal and POS events each push via APNs", async () => {
    configureApple();
    const apns = consoleApns();
    setApnsPusher(env.ctx, apns);
    const { token, user, key, phone, m, member } = await customerWithPoints();
    await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: { authorization: `Bearer ${token}` } });
    const [pass] = await env.db.select().from(walletPasses).where(eq(walletPasses.userId, user.id));
    const base = "/v1/wallet/apple/v1";
    const regUrl = `${base}/devices/DEVICE1/registrations/pass.test.loyalty/${pass!.serialNumber}`;
    const ap = { authorization: `ApplePass ${pass!.authToken}` };

    expect((await env.app.inject({ method: "POST", url: regUrl, headers: { authorization: "ApplePass wrong" }, payload: { pushToken: "tok1" } })).statusCode).toBe(401);
    expect((await env.app.inject({ method: "POST", url: regUrl, payload: { pushToken: "tok1" } })).statusCode).toBe(401);
    expect((await env.app.inject({ method: "POST", url: regUrl, headers: ap, payload: {} })).statusCode).toBe(400);
    expect((await env.app.inject({ method: "POST", url: `${base}/devices/DEVICE1/registrations/pass.other/${pass!.serialNumber}`, headers: ap, payload: { pushToken: "tok1" } })).statusCode).toBe(404);
    expect((await env.app.inject({ method: "POST", url: regUrl, headers: ap, payload: { pushToken: "tok1" } })).statusCode).toBe(201);
    expect((await env.app.inject({ method: "POST", url: regUrl, headers: ap, payload: { pushToken: "tok1" } })).statusCode).toBe(200);

    const list = await env.app.inject({ method: "GET", url: `${base}/devices/DEVICE1/registrations/pass.test.loyalty` });
    expect(list.statusCode).toBe(200);
    expect(list.json().serialNumbers).toEqual([pass!.serialNumber]);
    const tag = list.json().lastUpdated;
    expect((await env.app.inject({ method: "GET", url: `${base}/devices/DEVICE1/registrations/pass.test.loyalty?passesUpdatedSince=${tag}` })).statusCode).toBe(204);
    expect((await env.app.inject({ method: "GET", url: `${base}/devices/OTHER/registrations/pass.test.loyalty` })).statusCode).toBe(204);

    // POS / merchant API award → exactly one APNs push (the ledger listener; the explicit call is deduped).
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    await env.app.inject({ method: "POST", url: "/v1/api/award", headers: { "x-ll-api-key": key }, payload: { phone, amountCents: 1000, externalId: "s2" } });
    expect(apns.sent).toEqual([{ token: "tok1", topic: "pass.test.loyalty" }]);
    const updated = await env.app.inject({ method: "GET", url: `${base}/devices/DEVICE1/registrations/pass.test.loyalty?passesUpdatedSince=${tag}` });
    expect(updated.json().serialNumbers).toEqual([pass!.serialNumber]);

    const passUrl = `${base}/passes/pass.test.loyalty/${pass!.serialNumber}`;
    const latest = await env.app.inject({ method: "GET", url: passUrl, headers: ap });
    expect(latest.statusCode).toBe(200);
    const pj = JSON.parse(Buffer.from(unzipSync(new Uint8Array(latest.rawPayload))["pass.json"]!).toString());
    expect(pj.storeCard.headerFields[0].value).toBe(1); // 52 points ≥ the 50-point reward
    expect(pj.storeCard.secondaryFields[0]).toMatchObject({ value: "52 points", changeMessage: "You now have %@ at Test Shop" });
    const notModified = await env.app.inject({ method: "GET", url: passUrl, headers: { ...ap, "if-modified-since": latest.headers["last-modified"] as string } });
    expect(notModified.statusCode).toBe(304);
    expect((await env.app.inject({ method: "GET", url: passUrl })).statusCode).toBe(401);

    // Counter award, redeem and reversal all reach APNs through the ledger.
    env.clock.now = new Date(env.clock.now.getTime() + 3600_000);
    const aw = await awardPurchase(env.ctx, { merchantId: m.merchant.id, memberId: member.id, source: "staff_app", amountCents: 500 });
    expect(apns.sent).toHaveLength(2);
    const red = await redeemReward(env.ctx, { merchantId: m.merchant.id, memberId: member.id, rewardId: m.reward.id, source: "staff_app" });
    expect(apns.sent).toHaveLength(3);
    await reverseTransaction(env.ctx, { merchantId: m.merchant.id, transactionId: red.redemption.transactionId!, reason: "mistake" });
    expect(apns.sent).toHaveLength(4);
    await reverseTransaction(env.ctx, { merchantId: m.merchant.id, transactionId: aw.transaction!.id, reason: "refund" });
    expect(apns.sent).toHaveLength(5);
    // Nothing changed → no push.
    await notifyPassUpdate(env.ctx, user.id);
    expect(apns.sent).toHaveLength(5);

    expect((await env.app.inject({ method: "POST", url: `${base}/log`, payload: { logs: ["hello"] } })).statusCode).toBe(200);
    expect((await env.app.inject({ method: "DELETE", url: regUrl, headers: { authorization: "ApplePass nope" } })).statusCode).toBe(401);
    expect((await env.app.inject({ method: "DELETE", url: regUrl, headers: ap })).statusCode).toBe(200);
    expect(await env.db.select().from(walletDeviceRegistrations)).toHaveLength(0);
    await notifyPassUpdate(env.ctx, user.id, { force: true });
    expect(apns.sent).toHaveLength(5);
  });

  it("drops device registrations APNs reports as invalid", async () => {
    configureApple();
    const { user, token, m, member } = await customerWithPoints();
    await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: { authorization: `Bearer ${token}` } });
    const [pass] = await env.db.select().from(walletPasses).where(eq(walletPasses.userId, user.id));
    await env.db.insert(walletDeviceRegistrations).values([
      { deviceLibraryId: "D1", pushToken: "good", passId: pass!.id },
      { deviceLibraryId: "D2", pushToken: "gone", passId: pass!.id },
    ]);
    setApnsPusher(env.ctx, { name: "fake", push: async (tokens) => ({ sent: 1, failed: 1, invalid: tokens.filter((t) => t === "gone") }) });
    await awardPurchase(env.ctx, { merchantId: m.merchant.id, memberId: member.id, source: "staff_app", amountCents: 100 });
    expect((await env.db.select().from(walletDeviceRegistrations)).map((r) => r.pushToken)).toEqual(["good"]);
  });

  it("notifyPassUpdate is a no-op for customers without passes and never throws", async () => {
    const u = await createUser(env.db);
    await expect(notifyPassUpdate(env.ctx, u.id)).resolves.toBeUndefined();
    await expect(notifyPassUpdate(env.ctx, "00000000-0000-4000-8000-000000000000")).resolves.toBeUndefined();
  });
});

describe("APNs (HTTP/2, mock server)", () => {
  async function mockApns(handler: (h: http2.IncomingHttpHeaders, body: string) => { status: number; reason?: string }) {
    const seen: { headers: http2.IncomingHttpHeaders; body: string }[] = [];
    const server = http2.createServer();
    server.on("stream", (stream, headers) => {
      let body = "";
      stream.setEncoding("utf8");
      stream.on("data", (c: string) => (body += c));
      stream.on("end", () => {
        seen.push({ headers, body });
        const r = handler(headers, body);
        stream.respond({ ":status": r.status, "apns-id": randomUUID() });
        stream.end(r.reason ? JSON.stringify({ reason: r.reason }) : "");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { seen, host, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  }

  it("token auth: POST /3/device/<token>, apns-topic = pass type id, ES256 provider JWT, empty JSON body; 410 → invalid; 403 → retried with the pass certificate", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const keyP8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const srv = await mockApns((h) => {
      const token = String(h[":path"]).split("/").at(-1);
      if (token === "gone") return { status: 410, reason: "Unregistered" };
      if (token === "certonly") return h.authorization ? { status: 403, reason: "TopicDisallowed" } : { status: 200 };
      return { status: 200 };
    });
    try {
      const pusher = http2Apns({ token: { keyId: "KEY123ABCD", teamId: "TEAM123456", keyP8 }, cert: { certPem: "unused-over-h2c", keyPem: "unused" }, host: srv.host, now: () => env.clock.now });
      const r = await pusher.push(["ok1", "gone", "certonly"], "pass.test.loyalty");
      expect(r).toMatchObject({ sent: 2, failed: 1, invalid: ["gone"] });
      expect(r.results!.find((x) => x.token === "certonly")).toMatchObject({ status: 200, auth: "cert" });
      expect(r.results!.find((x) => x.token === "ok1")).toMatchObject({ status: 200, auth: "token" });

      const first = srv.seen.find((s) => s.headers[":path"] === "/3/device/ok1")!;
      expect(first.headers[":method"]).toBe("POST");
      expect(first.headers["apns-topic"]).toBe("pass.test.loyalty");
      expect(first.body).toBe("{}");
      const jwt = String(first.headers.authorization).replace(/^bearer /, "");
      expect(decodeProtectedHeader(jwt)).toEqual({ alg: "ES256", kid: "KEY123ABCD" });
      const { payload } = await jwtVerify(jwt, await importSPKI(publicKey.export({ type: "spki", format: "pem" }).toString(), "ES256"), { issuer: "TEAM123456", currentDate: env.clock.now });
      expect(payload.iat).toBe(Math.floor(env.clock.now.getTime() / 1000));
      const retried = srv.seen.filter((s) => s.headers[":path"] === "/3/device/certonly");
      expect(retried).toHaveLength(2);
      expect(retried[1]!.headers.authorization).toBeUndefined();
    } finally {
      await srv.close();
    }
  });

  it("certificate-only config sends without a provider token", async () => {
    const srv = await mockApns(() => ({ status: 200 }));
    try {
      const r = await http2Apns({ cert: { certPem: "x", keyPem: "y" }, host: srv.host }).push(["t1"], "pass.test.loyalty");
      expect(r.sent).toBe(1);
      expect(srv.seen[0]!.headers.authorization).toBeUndefined();
    } finally {
      await srv.close();
    }
  });
});

describe("Google Wallet (loyalty class + object)", () => {
  const cfg = () => env.ctx.config;

  it("recorded payloads: loyalty class (issuer branding, v2 colour) and loyalty object (rewards ready, shops, top shops, QR, links, locations)", async () => {
    configureGoogle();
    const cls = loyaltyClass(cfg(), "3388000000012345678");
    const obj = loyaltyObject(cfg(), "3388000000012345678", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", { summary: FIXED_SUMMARY, locations: FIXED_LOCATIONS });
    await expect(JSON.stringify(cls, null, 2)).toMatchFileSnapshot("./fixtures/google-wallet/loyalty-class.json");
    await expect(JSON.stringify(obj, null, 2)).toMatchFileSnapshot("./fixtures/google-wallet/loyalty-object.json");
    expect(cls).toMatchObject({ id: "3388000000012345678.ll_network_loyalty", issuerName: "Local Loyalty", hexBackgroundColor: "#0B0B0C" });
    expect(obj).toMatchObject({
      id: "3388000000012345678.ll_aaaaaaaabbbb4ccc8dddeeeeeeeeeeee",
      loyaltyPoints: { label: "Rewards ready", balance: { int: 1 } },
      secondaryLoyaltyPoints: { label: "Shops", balance: { int: 3 } },
      barcode: { type: "QR_CODE", value: "LL:K7Q2M9", alternateText: "K7Q2M9" },
    });
    expect(obj.textModulesData.slice(0, 2)).toEqual([
      { id: "shop1", header: "Pinecone Coffee", body: "130 points · 1 reward ready" },
      { id: "shop2", header: "Dundas West Bakery & Café", body: "7 stamps" },
    ]);
    expect(obj.locations).toEqual([
      { latitude: 43.6496, longitude: -79.4218 },
      { latitude: 43.6502, longitude: -79.4305 },
    ]);
  });

  it("503 when unconfigured; otherwise a Save URL whose RS256 JWT carries the loyalty class + object", async () => {
    const { token, user } = await customerWithPoints();
    const h = { authorization: `Bearer ${token}` };
    const off = await env.app.inject({ method: "GET", url: "/v1/me/wallet/google", headers: h });
    expect(off.statusCode).toBe(503);
    expect(off.json().error.details.missing).toEqual(["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"]);
    const { publicKeyPem } = configureGoogle();
    const r = await env.app.inject({ method: "GET", url: "/v1/me/wallet/google", headers: h });
    expect(r.statusCode).toBe(200);
    const url: string = r.json().saveUrl;
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const { payload, protectedHeader } = await jwtVerify(url.split("/").at(-1)!, await importSPKI(publicKeyPem, "RS256"), { audience: "google", issuer: "wallet@proj.iam.gserviceaccount.com" });
    expect(protectedHeader.alg).toBe("RS256");
    expect(payload.typ).toBe("savetowallet");
    expect(payload.origins).toEqual(["http://localhost:3000"]);
    const p = payload.payload as { loyaltyClasses: { id: string }[]; loyaltyObjects: { classId: string; barcode: { value: string }; accountId: string }[] };
    expect(p.loyaltyClasses[0]!.id).toBe("3388000000012345678.ll_network_loyalty");
    expect(p.loyaltyObjects[0]).toMatchObject({ classId: "3388000000012345678.ll_network_loyalty", barcode: { value: `LL:${user.memberCode}` }, accountId: user.memberCode });
    expect((await env.app.inject({ method: "GET", url: "/v1/me/wallet", headers: h })).json().google.available).toBe(true);
  });

  it("balance change → OAuth JWT-bearer token + loyaltyObject PATCH; addMessage payload; 404 = not saved", async () => {
    configureGoogle();
    const rec = recordGoogle();
    setHttp(env.ctx, rec.fetch);
    const { token, user, m, member } = await customerWithPoints();
    await env.app.inject({ method: "GET", url: "/v1/me/wallet/google", headers: { authorization: `Bearer ${token}` } });
    env.clock.now = new Date(env.clock.now.getTime() + 3600_000);
    await awardPurchase(env.ctx, { merchantId: m.merchant.id, memberId: member.id, source: "square", amountCents: 1000 });

    const tokenCall = rec.calls.find((c) => c.url === "https://oauth2.googleapis.com/token")!;
    expect(tokenCall.method).toBe("POST");
    expect((tokenCall.body as Record<string, string>).grant_type).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const assertion = decodeProtectedHeader((tokenCall.body as Record<string, string>).assertion!);
    expect(assertion.alg).toBe("RS256");
    const patch = rec.calls.find((c) => c.method === "PATCH")!;
    const objectId = `3388000000012345678.ll_${user.id.replace(/-/g, "")}`;
    expect(patch.url).toBe(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`);
    expect(patch.headers.authorization).toBe("Bearer ya29.test");
    expect(patch.body).toMatchObject({ id: objectId, loyaltyPoints: { balance: { int: 1 } }, textModulesData: [{ id: "shop1", body: "52 points · 1 reward ready" }, { id: "expiry" }, { id: "how" }] });
    // reward_ready (52 crosses the 50-point reward) adds a notifying message to the pass.
    const msg = rec.calls.find((c) => c.url.endsWith("/addMessage"))!;
    expect(msg.url).toBe(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}/addMessage`);
    expect(msg.body).toMatchObject({ message: { header: "Reward ready at Test Shop", messageType: "TEXT_AND_NOTIFY", displayInterval: { start: { date: env.clock.now.toISOString() } } } });
    expect(rec.calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(1); // token cached

    const missing = recordGoogle(() => 404);
    expect(await updateGoogleObject(cfg(), user.id, { summary: FIXED_SUMMARY }, missing.fetch, env.clock.now)).toBe("missing");
    expect(await addGoogleMessage(cfg(), user.id, { id: "m1", header: "h", body: "b" }, missing.fetch, env.clock.now)).toBe("missing");
    const broken = recordGoogle(() => 500);
    await expect(updateGoogleObject(cfg(), user.id, { summary: FIXED_SUMMARY }, broken.fetch, env.clock.now)).rejects.toThrow(/HTTP 500/);
  });
});
