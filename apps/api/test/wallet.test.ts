import { createHash, generateKeyPairSync, verify as cryptoVerify } from "node:crypto";
import { unzipSync } from "fflate";
import { importSPKI, jwtVerify } from "jose";
import forge from "node-forge";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantMembers, walletPasses } from "@ll/db";
import { eq } from "drizzle-orm";
import { rotateApiKey } from "../src/services/merchant.js";
import { consoleApns, setApnsPusher } from "../src/services/wallet-apns.js";
import { buildPassJson, signManifest, unsignedBundle } from "../src/services/wallet-apple.js";
import { notifyPassUpdate, walletSummary } from "../src/services/wallet.js";
import { createMerchant, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
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

async function customerWithPoints() {
  const m = await createMerchant(env);
  const phone = nextPhone();
  const key = await rotateApiKey(env.ctx, m.merchant.id, m.owner.id);
  await env.app.inject({ method: "POST", url: "/v1/api/award", headers: { "x-ll-api-key": key }, payload: { phone, amountCents: 4200 } });
  const [mm] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, m.merchant.id));
  const { users } = await import("@ll/db");
  const [u] = await env.db.select().from(users).where(eq(users.id, mm!.userId));
  return { m, user: u!, token: await tokenFor(env, u!), key, phone };
}

describe("Apple Wallet pass", () => {
  it("builds a storeCard with the member QR, balance summary and expiry disclosure; manifest has SHA-1s", async () => {
    const { user } = await customerWithPoints();
    const summary = await walletSummary(env.ctx, user.id);
    expect(summary).toMatchObject({ shopCount: 1, totalPoints: 42, qrValue: `LL:${user.memberCode}` });
    const p = { passTypeId: "pass.test.loyalty", teamId: "TEAM123456" };
    const { files, manifest } = unsignedBundle(env.ctx.config, p, { serialNumber: "SER1", authToken: "a".repeat(32), summary });
    expect(Object.keys(files).sort()).toEqual(["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "pass.json"]);
    const pass = JSON.parse(files["pass.json"]!.toString());
    expect(pass).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: "pass.test.loyalty",
      teamIdentifier: "TEAM123456",
      serialNumber: "SER1",
      authenticationToken: "a".repeat(32),
      webServiceURL: "http://localhost:4000/v1/wallet/apple",
      barcodes: [{ format: "PKBarcodeFormatQR", message: `LL:${user.memberCode}` }],
    });
    expect(pass.storeCard.primaryFields[0]).toMatchObject({ key: "points", value: 42 });
    expect(pass.storeCard.headerFields[0]).toMatchObject({ key: "shops", value: 1 });
    expect(pass.storeCard.backFields.find((f: { key: string }) => f.key === "expiry").value).toBe("Your points never expire.");
    const man = JSON.parse(manifest.toString());
    for (const [name, buf] of Object.entries(files)) expect(man[name]).toBe(createHash("sha1").update(buf).digest("hex"));
    expect(files["icon.png"]!.subarray(1, 4).toString()).toBe("PNG");

    const withExpiry = buildPassJson(env.ctx.config, p, { serialNumber: "S", authToken: "t", summary: { ...summary, shops: [{ ...summary.shops[0]!, expiryMonths: 12 }] } });
    expect(withExpiry.storeCard.backFields.find((f) => f.key === "expiry")!.value).toContain("after 12 months");
  });

  it("signs the manifest as a detached PKCS#7 that verifies against the pass certificate", async () => {
    const signer = selfSignedCert("Pass Type ID: pass.test.loyalty");
    const wwdr = selfSignedCert("Test WWDR");
    const manifest = Buffer.from(JSON.stringify({ "pass.json": "abc" }));
    const der = signManifest(manifest, { certPem: signer.certPem, keyPem: signer.keyPem, wwdrPem: wwdr.certPem });
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString("binary")));
    const msg = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData & { rawCapture: unknown };
    expect(msg.certificates).toHaveLength(2);
    expect(msg.certificates.map((c) => c.subject.getField("CN").value)).toContain("Test WWDR");
    // Detached: the signed data carries no content.
    const signedData = (asn1.value as forge.asn1.Asn1[])[1]!.value[0] as forge.asn1.Asn1;
    const contentInfo = (signedData.value as forge.asn1.Asn1[])[2]!;
    expect((contentInfo.value as forge.asn1.Asn1[]).length).toBe(1);
    // Verify: messageDigest attr == sha256(manifest), and RSA signature over the attributes (as a SET).
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

  it("GET /v1/me/wallet/apple: 503 without certs, a zipped signed .pkpass with them", async () => {
    const { token, user } = await customerWithPoints();
    const h = { authorization: `Bearer ${token}` };
    const off = await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: h });
    expect(off.statusCode).toBe(503);
    expect(off.json().error).toMatchObject({ code: "wallet_not_configured" });
    expect(off.json().error.message).toContain("APPLE_PASS_CERT_PEM");
    expect((await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple" })).statusCode).toBe(401);

    configureApple();
    const r = await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/vnd.apple.pkpass");
    const files = unzipSync(new Uint8Array(r.rawPayload));
    expect(Object.keys(files).sort()).toEqual(["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "manifest.json", "pass.json", "signature"]);
    const pass = JSON.parse(Buffer.from(files["pass.json"]!).toString());
    expect(pass.barcodes[0].message).toBe(`LL:${user.memberCode}`);
    // Same pass (serial) every time: one network pass per customer.
    await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: h });
    expect(await env.db.select().from(walletPasses).where(eq(walletPasses.userId, user.id))).toHaveLength(1);

    const status = await env.app.inject({ method: "GET", url: "/v1/me/wallet", headers: h });
    expect(status.json().apple.available).toBe(true);
    const dlUrl = new URL(status.json().apple.downloadUrl);
    const dl = await env.app.inject({ method: "GET", url: dlUrl.pathname + dlUrl.search });
    expect(dl.statusCode).toBe(200);
    const badDl = await env.app.inject({ method: "GET", url: `/v1/wallet/apple/download?token=${user.id}.9999999999999.deadbeef` });
    expect(badDl.statusCode).toBe(401);
  });
});

describe("PassKit web service", () => {
  it("registers devices, reports updated serials, serves the latest pass, pushes on balance change", async () => {
    configureApple();
    const apns = consoleApns();
    setApnsPusher(env.ctx, apns);
    const { token, user, key, phone } = await customerWithPoints();
    await env.app.inject({ method: "GET", url: "/v1/me/wallet/apple", headers: { authorization: `Bearer ${token}` } });
    const [pass] = await env.db.select().from(walletPasses).where(eq(walletPasses.userId, user.id));
    const base = "/v1/wallet/apple/v1";
    const regUrl = `${base}/devices/DEVICE1/registrations/pass.test.loyalty/${pass!.serialNumber}`;
    const ap = { authorization: `ApplePass ${pass!.authToken}` };

    expect((await env.app.inject({ method: "POST", url: regUrl, headers: { authorization: "ApplePass wrong" }, payload: { pushToken: "tok1" } })).statusCode).toBe(401);
    expect((await env.app.inject({ method: "POST", url: regUrl, payload: { pushToken: "tok1" } })).statusCode).toBe(401);
    expect((await env.app.inject({ method: "POST", url: regUrl, headers: ap, payload: { pushToken: "tok1" } })).statusCode).toBe(201);
    expect((await env.app.inject({ method: "POST", url: regUrl, headers: ap, payload: { pushToken: "tok1" } })).statusCode).toBe(200);

    const list = await env.app.inject({ method: "GET", url: `${base}/devices/DEVICE1/registrations/pass.test.loyalty` });
    expect(list.statusCode).toBe(200);
    expect(list.json().serialNumbers).toEqual([pass!.serialNumber]);
    const tag = list.json().lastUpdated;
    expect((await env.app.inject({ method: "GET", url: `${base}/devices/DEVICE1/registrations/pass.test.loyalty?passesUpdatedSince=${tag}` })).statusCode).toBe(204);
    expect((await env.app.inject({ method: "GET", url: `${base}/devices/OTHER/registrations/pass.test.loyalty` })).statusCode).toBe(204);

    // A purchase changes the balance → APNs push to the registered device.
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    await env.app.inject({ method: "POST", url: "/v1/api/award", headers: { "x-ll-api-key": key }, payload: { phone, amountCents: 1000, externalId: "s2" } });
    expect(apns.sent).toEqual([{ token: "tok1", topic: "pass.test.loyalty" }]);
    const updated = await env.app.inject({ method: "GET", url: `${base}/devices/DEVICE1/registrations/pass.test.loyalty?passesUpdatedSince=${tag}` });
    expect(updated.json().serialNumbers).toEqual([pass!.serialNumber]);

    const passUrl = `${base}/passes/pass.test.loyalty/${pass!.serialNumber}`;
    const latest = await env.app.inject({ method: "GET", url: passUrl, headers: ap });
    expect(latest.statusCode).toBe(200);
    const pj = JSON.parse(Buffer.from(unzipSync(new Uint8Array(latest.rawPayload))["pass.json"]!).toString());
    expect(pj.storeCard.primaryFields[0].value).toBe(52);
    const notModified = await env.app.inject({ method: "GET", url: passUrl, headers: { ...ap, "if-modified-since": latest.headers["last-modified"] as string } });
    expect(notModified.statusCode).toBe(304);
    expect((await env.app.inject({ method: "GET", url: passUrl })).statusCode).toBe(401);

    expect((await env.app.inject({ method: "POST", url: `${base}/log`, payload: { logs: ["hello"] } })).statusCode).toBe(200);
    expect((await env.app.inject({ method: "DELETE", url: regUrl, headers: ap })).statusCode).toBe(200);
    await notifyPassUpdate(env.ctx, user.id);
    expect(apns.sent).toHaveLength(1);
  });

  it("notifyPassUpdate is a no-op for customers without passes and never throws", async () => {
    const u = await createUser(env.db);
    await expect(notifyPassUpdate(env.ctx, u.id)).resolves.toBeUndefined();
    await expect(notifyPassUpdate(env.ctx, "00000000-0000-4000-8000-000000000000")).resolves.toBeUndefined();
  });
});

describe("Google Wallet", () => {
  it("503 when unconfigured; otherwise a Save URL whose RS256 JWT carries the member QR", async () => {
    const { token, user } = await customerWithPoints();
    const h = { authorization: `Bearer ${token}` };
    expect((await env.app.inject({ method: "GET", url: "/v1/me/wallet/google", headers: h })).statusCode).toBe(503);

    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    env.ctx.config.google = {
      ...env.ctx.config.google,
      walletIssuerId: "3388000000012345678",
      walletServiceAccountJson: Buffer.from(JSON.stringify({ client_email: "wallet@proj.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() })).toString("base64"),
    };
    const r = await env.app.inject({ method: "GET", url: "/v1/me/wallet/google", headers: h });
    expect(r.statusCode).toBe(200);
    const url: string = r.json().saveUrl;
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const jwt = url.split("/").at(-1)!;
    const { payload, protectedHeader } = await jwtVerify(jwt, await importSPKI(publicKey.export({ type: "spki", format: "pem" }).toString(), "RS256"), { audience: "google", issuer: "wallet@proj.iam.gserviceaccount.com" });
    expect(protectedHeader.alg).toBe("RS256");
    const obj = (payload as { payload: { genericObjects: { id: string; barcode: { value: string }; classId: string }[] } }).payload.genericObjects[0]!;
    expect(obj.barcode.value).toBe(`LL:${user.memberCode}`);
    expect(obj.classId).toBe("3388000000012345678.ll_network_member");
    expect(payload.typ).toBe("savetowallet");
  });
});
