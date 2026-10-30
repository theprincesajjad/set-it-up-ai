/**
 * Shop cards (docs/engineering/wallet.md): one Apple + Google card per membership in the shop's look. Fake credentials only
 * (services/wallet-dev-fake.ts); nothing here calls Apple or Google.
 */
import { createHash, createVerify } from "node:crypto";
import { unzipSync } from "fflate";
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import forge from "node-forge";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, locations, loyaltyPrograms, merchantMembers, merchants, rewards, services, users, walletDeviceRegistrations, walletPasses } from "@ll/db";
import { offsetPin } from "@ll/shared";
import { setHttp } from "../src/services/integrations-http.js";
import { consoleApns, setApnsPusher } from "../src/services/wallet-apns.js";
import { appleSignerFromConfig, missingAppleConfig } from "../src/services/wallet-apple.js";
import { fakeP12Base64, makeFakeAppleChain, makeFakeServiceAccount, recordingGoogleFetch } from "../src/services/wallet-dev-fake.js";
import { clearGoogleTokenCache, googleConfigured } from "../src/services/wallet-google.js";
import { pngSize } from "../src/services/wallet-png.js";
import {
  buildShopModel,
  buildShopPassJson,
  buildShopPkpass,
  cardColors,
  contrast,
  flushWalletWork,
  googleCallbackKey,
  notifyShopPassUpdate,
  sampleShopModel,
  shopClassId,
  shopLoyaltyClass,
  shopLoyaltyObject,
  shopObjectId,
  shopPassLocations,
  shopPassModel,
  shopPassPlace,
  walletAppointmentChanged,
} from "../src/services/wallet-shop.js";
import { renderStrip, stampLayout, stripImages } from "../src/services/wallet-strip.js";
import { createMerchant, createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
  clearGoogleTokenCache();
});
afterEach(async () => {
  await flushWalletWork();
  await env.close();
});

const ISSUER = "3388000000012345678";
const chain = makeFakeAppleChain("pass.test.shopcards", "TEAM123456");

function configureApple() {
  env.ctx.config.apple = { passTypeId: chain.passTypeId, teamId: chain.teamId, certPem: chain.certPem, keyPem: chain.keyPem, wwdrPem: chain.wwdrPem };
}
function configureGoogle() {
  const sa = makeFakeServiceAccount("wallet@proj.iam.gserviceaccount.com");
  env.ctx.config.google = { ...env.ctx.config.google, walletIssuerId: ISSUER, walletServiceAccountJson: sa.json };
  const rec = recordingGoogleFetch();
  setHttp(env.ctx, rec);
  return { sa, calls: rec.calls };
}

const HOME_ADDRESS = "41 Quiet Lane";

/** A stamp shop (6 stamps for a free coffee) with a storefront, or a home studio (area) / mobile pro (city). */
async function stampShop(opts: { visibility?: "exact" | "area" | "city"; vertical?: string; bookable?: boolean } = {}) {
  const m = await createMerchant(env, { earnType: "stamps", vertical: opts.vertical });
  await env.db.update(loyaltyPrograms).set({ stampGoal: 6, terminology: "stamps", termsText: "One stamp per visit." }).where(eq(loyaltyPrograms.merchantId, m.merchant.id));
  await env.db.update(rewards).set({ name: "Free coffee", pointsCost: 6 }).where(eq(rewards.id, m.reward.id));
  await env.db.update(merchants).set({ name: "Pinecone Coffee", brandColor: "#1F6F4A", logoUrl: null }).where(eq(merchants.id, m.merchant.id));
  const v = opts.visibility ?? "exact";
  const pin = offsetPin(m.merchant.id, { lat: 43.6505, lng: -79.4785 });
  const [loc] = await env.db
    .insert(locations)
    .values({
      merchantId: m.merchant.id,
      name: "Main",
      address: v === "exact" ? "1102 Dundas St W" : HOME_ADDRESS,
      city: "Toronto",
      postalCode: "M6J 1X2",
      lat: 43.649612,
      lng: -79.421834,
      addressVisibility: v,
      areaLabel: v === "area" ? "Bloor West" : null,
      mapLat: v === "area" ? pin.lat : v === "city" ? 43.6532 : null,
      mapLng: v === "area" ? pin.lng : v === "city" ? -79.3832 : null,
      hours: { mon: [["08:00", "17:00"]], tue: [["08:00", "17:00"]], sat: [["09:00", "14:00"]] },
      qrCode: `QR${Math.random().toString(36).slice(2, 10)}`,
    })
    .returning();
  if (opts.bookable) await env.db.insert(services).values({ merchantId: m.merchant.id, name: "Lash fill", durationMin: 45 });
  const user = await createUser(env.db, { name: "Priya" });
  const [member] = await env.db.insert(merchantMembers).values({ merchantId: m.merchant.id, userId: user.id, balance: 4 }).returning();
  return { ...m, location: loc!, user, member: member!, token: await tokenFor(env, user) };
}

async function counterAward(s: Awaited<ReturnType<typeof stampShop>>, memberCode: string, key: string) {
  // Past the visit cooldown, so every scan stamps.
  env.clock.now = new Date(env.clock.now.getTime() + 31 * 60_000);
  const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/counter/award`, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` }, payload: { memberCode, idempotencyKey: `wallet-test-${key}` } });
  if (r.statusCode >= 300) throw new Error(`award ${r.statusCode}: ${r.body}`);
  return r;
}

describe("shop card model", () => {
  it("stamps: shop name, trade colour, 4 of 6, next reward, member name, the counter QR; contrast-safe colours", async () => {
    const s = await stampShop();
    const { model } = await shopPassModel(env.ctx, s.user.id, s.merchant.id);
    expect(model).toMatchObject({
      name: "Pinecone Coffee",
      kind: "stamps",
      goal: 6,
      filled: 4,
      balance: 4,
      nextReward: { name: "Free coffee", cost: 6, left: 2 },
      memberName: "Priya",
      qrValue: `LL:${s.user.memberCode}`,
      colors: { background: "#1F6F4A", foreground: "#FFFFFF" },
      terms: "One stamp per visit.",
      place: "1102 Dundas St W",
      nextAppointment: null,
    });
    expect(model.hours).toContain("08:00–17:00");
    // Light cards get dark text, dark cards light text, always at least 4.5:1.
    for (const bg of ["#FFFFFF", "#FDE68A", "#0B0B0C", "#1F6F4A", "#7C3AED", "#F97316"]) {
      const c = cardColors(bg);
      expect(contrast(c.background, c.foreground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("wallet card settings: colour, reward line, plain front, hours and booking off, custom terms", async () => {
    const s = await stampShop({ bookable: true });
    await env.db.update(merchants).set({ walletCard: { color: "#FDE68A", rewardText: "Free latte", strip: "plain", showHours: false, terms: "Not valid with other offers." } }).where(eq(merchants.id, s.merchant.id));
    const { model } = await shopPassModel(env.ctx, s.user.id, s.merchant.id);
    expect(model).toMatchObject({ colors: { background: "#FDE68A", foreground: "#111111" }, strip: "plain", nextReward: { name: "Free latte" }, hours: null, terms: "Not valid with other offers." });
    expect(model.bookingUrl).toBe(`${env.ctx.config.publicWebUrl}/shops/${s.merchant.slug}/book`);
    const preview = await sampleShopModel(env.ctx, s.merchant.id, { showBooking: false });
    expect(preview).toMatchObject({ memberName: "Priya", bookingUrl: null, colors: { background: "#1F6F4A" } });
  });

  it("a full card that hasn't been redeemed shows full; points programs count towards the next reward", async () => {
    const s = await stampShop();
    await env.db.update(merchantMembers).set({ balance: 6 }).where(eq(merchantMembers.id, s.member.id));
    expect((await shopPassModel(env.ctx, s.user.id, s.merchant.id)).model).toMatchObject({ filled: 6, rewardsReady: 1 });
    const p = await createMerchant(env);
    const u = await createUser(env.db, { name: "Sam" });
    await env.db.insert(merchantMembers).values({ merchantId: p.merchant.id, userId: u.id, balance: 30 });
    expect((await shopPassModel(env.ctx, u.id, p.merchant.id)).model).toMatchObject({ kind: "points", goal: 50, filled: 30, nextReward: { name: "$5 off", left: 20 } });
  });

  it("a client who booked but never joined gets the card at 0, with the visit on it", async () => {
    const s = await stampShop();
    const client = await createUser(env.db, { name: "Noor" });
    expect(await shopPassModel(env.ctx, client.id, s.merchant.id).catch((e) => e.statusCode)).toBe(404);
    await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: client.id, startsAt: new Date("2026-11-05T15:00:00Z"), endsAt: new Date("2026-11-05T15:45:00Z"), items: [{ serviceId: null, name: "Lash fill", durationMin: 45, priceCents: 6000 }] });
    const { model } = await shopPassModel(env.ctx, client.id, s.merchant.id);
    expect(model).toMatchObject({ balance: 0, filled: 0, memberName: "Noor", nextAppointment: { label: "Lash fill" } });
  });

  it("404 for someone who isn't a member", async () => {
    const s = await stampShop();
    const stranger = await createUser(env.db);
    await expect(shopPassModel(env.ctx, stranger.id, s.merchant.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("Apple shop card (pass.json, images, manifest, signature)", () => {
  it("storeCard with the required keys, shop colours as rgb(), QR, the stamp strip at 1x/2x/3x, appointment relevance", async () => {
    const s = await stampShop();
    const start = new Date("2026-11-05T15:00:00Z");
    await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: s.user.id, startsAt: start, endsAt: new Date(start.getTime() + 45 * 60_000), items: [{ serviceId: null, name: "Lash fill", durationMin: 45, priceCents: 6000 }] });
    const { model, locations: locs } = await shopPassModel(env.ctx, s.user.id, s.merchant.id);
    const json = buildShopPassJson(env.ctx.config, chain, { serialNumber: "S123", authToken: "a".repeat(24) }, model, locs);
    for (const k of ["formatVersion", "passTypeIdentifier", "serialNumber", "teamIdentifier", "organizationName", "description", "storeCard"]) expect(json).toHaveProperty(k);
    expect(json).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: "pass.test.shopcards",
      teamIdentifier: "TEAM123456",
      organizationName: "Pinecone Coffee",
      logoText: "Pinecone Coffee",
      backgroundColor: "rgb(31, 111, 74)",
      foregroundColor: "rgb(255, 255, 255)",
      webServiceURL: `${env.ctx.config.publicApiUrl}/v1/wallet/apple`,
      barcodes: [{ format: "PKBarcodeFormatQR", message: `LL:${s.user.memberCode}`, messageEncoding: "iso-8859-1", altText: s.user.memberCode }],
      relevantDates: [{ startDate: "2026-11-05T13:00:00.000Z", endDate: "2026-11-05T15:45:00.000Z" }],
      relevantDate: "2026-11-05T14:00:00.000Z",
      maxDistance: 150,
    });
    expect(json).not.toHaveProperty("nfc");
    expect(json.authenticationToken.length).toBeGreaterThanOrEqual(16);
    expect(json.storeCard.headerFields[0]).toMatchObject({ key: "balance", label: "Stamps", value: "4 of 6" });
    expect(json.storeCard.secondaryFields).toEqual([
      expect.objectContaining({ key: "reward", value: "Free coffee, 2 to go" }),
      expect.objectContaining({ key: "member", value: "Priya" }),
    ]);
    expect(json.storeCard.auxiliaryFields[0]).toMatchObject({ key: "visit", value: start.toISOString(), dateStyle: "PKDateStyleMedium" });
    expect(json.locations).toEqual([{ latitude: 43.649612, longitude: -79.421834, relevantText: "Show this at Pinecone Coffee to earn" }]);
    const back = Object.fromEntries(json.storeCard.backFields.map((f) => [f.key, f.value]));
    expect(back).toMatchObject({ where: "1102 Dundas St W", terms: "One stamp per visit.", code: s.user.memberCode });

    const strips = stripImages({ kind: "stamps", filled: 4, goal: 6, background: "#1F6F4A", foreground: "#FFFFFF" });
    expect(pngSize(strips["strip.png"]!)).toEqual({ width: 375, height: 123 });
    expect(pngSize(strips["strip@2x.png"]!)).toEqual({ width: 750, height: 246 });
    expect(pngSize(strips["strip@3x.png"]!)).toEqual({ width: 1125, height: 369 });
  });

  it("the .pkpass: manifest = SHA-1 of every file, a detached PKCS#7 signature by the pass certificate with the WWDR certificate in the chain", async () => {
    configureApple();
    const s = await stampShop();
    const { model, locations: locs } = await shopPassModel(env.ctx, s.user.id, s.merchant.id);
    const signer = appleSignerFromConfig(env.ctx.config)!;
    const { buffer } = await buildShopPkpass(env.ctx, signer, { serialNumber: "S1", authToken: "b".repeat(24) }, model, locs, env.clock.now);
    const files = unzipSync(new Uint8Array(buffer));
    expect(Object.keys(files).sort()).toEqual(["icon.png", "icon@2x.png", "icon@3x.png", "manifest.json", "pass.json", "signature", "strip.png", "strip@2x.png", "strip@3x.png"]);
    const manifest = JSON.parse(Buffer.from(files["manifest.json"]!).toString());
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(files).filter((f) => f !== "manifest.json" && f !== "signature").sort());
    for (const [name, sha] of Object.entries(manifest)) expect(sha).toBe(createHash("sha1").update(files[name]!).digest("hex"));
    expect(pngSize(Buffer.from(files["icon@3x.png"]!))).toEqual({ width: 87, height: 87 });

    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(files.signature!).toString("binary")))) as forge.pkcs7.PkcsSignedData & { rawCapture: { content?: unknown; signature: string; authenticatedAttributes: forge.asn1.Asn1[] } };
    // Detached: no content inside the signature.
    expect(p7.rawCapture.content).toBeUndefined();
    const subjects = p7.certificates.map((c) => c.subject.getField("CN").value as string);
    expect(subjects).toEqual([`Pass Type ID: ${chain.passTypeId}`, expect.stringContaining("Worldwide Developer Relations")]);
    // The leaf is issued by the WWDR certificate in the bundle.
    expect(p7.certificates[1]!.verify(p7.certificates[0]!)).toBe(true);
    // The signed attributes carry the manifest digest, and the RSA signature over them verifies with the pass certificate.
    const attrs = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, p7.rawCapture.authenticatedAttributes);
    const v = createVerify("sha256");
    v.update(Buffer.from(forge.asn1.toDer(attrs).getBytes(), "binary"));
    expect(v.verify(chain.publicKeyPem, Buffer.from(p7.rawCapture.signature, "binary"))).toBe(true);
    const digestAttr = p7.rawCapture.authenticatedAttributes.find((a) => forge.asn1.derToOid((a.value as forge.asn1.Asn1[])[0]!.value as string) === forge.pki.oids.messageDigest)!;
    const digest = ((digestAttr.value as forge.asn1.Asn1[])[1]!.value as forge.asn1.Asn1[])[0]!.value as string;
    expect(Buffer.from(digest, "binary").toString("hex")).toBe(createHash("sha256").update(files["manifest.json"]!).digest("hex"));
  });

  it("accepts the certificate as a .p12 (APPLE_PASS_P12_BASE64 + password); lists what is missing otherwise", () => {
    env.ctx.config.apple = { passTypeId: chain.passTypeId, teamId: chain.teamId, wwdrPem: chain.wwdrPem, p12Base64: fakeP12Base64(chain, "s3cret"), p12Password: "s3cret" };
    const signer = appleSignerFromConfig(env.ctx.config)!;
    expect(forge.pki.certificateFromPem(signer.certPem).subject.getField("CN").value).toBe(`Pass Type ID: ${chain.passTypeId}`);
    env.ctx.config.apple = { teamId: "T" };
    expect(missingAppleConfig(env.ctx.config)).toEqual(["APPLE_PASS_TYPE_ID", "APPLE_PASS_P12_BASE64 (or APPLE_PASS_CERT_PEM + APPLE_PASS_KEY_PEM)", "APPLE_WWDR_PEM"]);
  });

  it("strip layout: one row up to 6, two rows above; points draw a bar; nothing personal goes into the image", () => {
    expect(stampLayout(6, 2, 750, 246).rows).toBe(1);
    expect(stampLayout(10, 2, 750, 246)).toMatchObject({ rows: 2, perRow: 5 });
    const a = renderStrip({ kind: "points", filled: 30, goal: 50, background: "#0B0B0C", foreground: "#FFFFFF" }, 1);
    const b = renderStrip({ kind: "points", filled: 31, goal: 50, background: "#0B0B0C", foreground: "#FFFFFF" }, 1);
    expect(a.equals(b)).toBe(false);
  });
});

describe("Google shop card (class, object, save JWT)", () => {
  it("class per shop (name, logo, colour, callback, storefront merchantLocations); object per member (stamps, reward, QR, strip hero, links)", async () => {
    const s = await stampShop({ bookable: true });
    const { model, locations: locs } = await shopPassModel(env.ctx, s.user.id, s.merchant.id);
    const cls = shopLoyaltyClass(env.ctx.config, ISSUER, model, locs);
    expect(cls).toMatchObject({
      id: shopClassId(ISSUER, s.merchant.id),
      issuerName: "Pinecone Coffee",
      hexBackgroundColor: "#1F6F4A",
      countryCode: "CA",
      reviewStatus: "UNDER_REVIEW",
      programLogo: { sourceUri: { uri: `${env.ctx.config.publicApiUrl}/v1/wallet/assets/logo.png` } },
      merchantLocations: [{ latitude: 43.649612, longitude: -79.421834 }],
      callbackOptions: { url: `${env.ctx.config.publicApiUrl}/v1/wallet/google/callback?k=${googleCallbackKey(env.ctx.config, cls.id)}` },
    });
    expect(cls).not.toHaveProperty("locations");
    const obj = shopLoyaltyObject(env.ctx.config, ISSUER, s.user.id, model);
    expect(obj).toMatchObject({
      id: shopObjectId(ISSUER, s.merchant.id, s.user.id),
      classId: cls.id,
      state: "ACTIVE",
      accountId: s.user.memberCode,
      accountName: "Priya",
      loyaltyPoints: { label: "Stamps", balance: { string: "4 of 6" } },
      barcode: { type: "QR_CODE", value: `LL:${s.user.memberCode}`, alternateText: s.user.memberCode },
    });
    expect(obj.loyaltyPoints.label.length).toBeLessThanOrEqual(9);
    expect(obj.id).toMatch(/^[\w.-]+$/);
    expect(obj.heroImage!.sourceUri.uri).toBe(`${env.ctx.config.publicApiUrl}/v1/wallet/strip.png?k=stamps&n=4&g=6&bg=1F6F4A&fg=FFFFFF`);
    expect(obj.textModulesData[0]).toEqual({ id: "reward", header: "Next reward", body: "Free coffee, 2 to go" });
    expect(obj.linksModuleData.uris.map((u) => u.id)).toEqual(["book", "shop", "support"]);
    const strip = await env.app.inject({ method: "GET", url: obj.heroImage!.sourceUri.uri.replace(env.ctx.config.publicApiUrl, "") });
    expect(strip.headers["content-type"]).toBe("image/png");
    expect(pngSize(strip.rawPayload)).toEqual({ width: 1125, height: 369 });
  });

  it("save link: RS256 JWT, iss = service account, aud google, typ savetowallet, origins, payload with the class and object", async () => {
    const { sa } = configureGoogle();
    const s = await stampShop();
    const r = await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } });
    expect(r.statusCode).toBe(200);
    const url: string = r.json().google.url;
    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\/[\w-]+\.[\w-]+\.[\w-]+$/);
    const jwt = url.split("/").at(-1)!;
    expect(decodeProtectedHeader(jwt)).toEqual({ alg: "RS256", typ: "JWT" });
    const { payload } = await jwtVerify(jwt, await importSPKI(sa.publicKeyPem, "RS256"), { issuer: "wallet@proj.iam.gserviceaccount.com", audience: "google", currentDate: env.clock.now });
    expect(payload).toMatchObject({ typ: "savetowallet", origins: [env.ctx.config.publicWebUrl], iat: Math.floor(env.clock.now.getTime() / 1000) });
    const p = payload.payload as { loyaltyClasses: { id: string }[]; loyaltyObjects: { id: string; classId: string }[] };
    expect(p.loyaltyClasses[0]!.id).toBe(shopClassId(ISSUER, s.merchant.id));
    expect(p.loyaltyObjects[0]).toMatchObject({ id: shopObjectId(ISSUER, s.merchant.id, s.user.id), classId: shopClassId(ISSUER, s.merchant.id) });
  });
});

describe("privacy: home-based and mobile shops", () => {
  for (const visibility of ["area", "city"] as const) {
    it(`${visibility}: no street address and no pin anywhere on the Apple or Google card, only the public place line`, async () => {
      configureApple();
      const { sa: _sa } = configureGoogle();
      const s = await stampShop({ visibility });
      const { model, locations: locs } = await shopPassModel(env.ctx, s.user.id, s.merchant.id);
      expect(locs).toEqual([]);
      expect(model.place).toBe(visibility === "area" ? "Bloor West area" : "Toronto");
      const json = buildShopPassJson(env.ctx.config, chain, { serialNumber: "S", authToken: "c".repeat(24) }, model, locs);
      expect(json).not.toHaveProperty("locations");
      const cls = shopLoyaltyClass(env.ctx.config, ISSUER, model, locs);
      expect(cls).not.toHaveProperty("merchantLocations");
      const obj = shopLoyaltyObject(env.ctx.config, ISSUER, s.user.id, model);
      // The signed pass and the save link, end to end.
      const status = (await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } })).json();
      const pk = await env.app.inject({ method: "GET", url: status.apple.url.replace(env.ctx.config.publicApiUrl, "") });
      expect(pk.statusCode).toBe(200);
      const passJson = Buffer.from(unzipSync(new Uint8Array(pk.rawPayload))["pass.json"]!).toString();
      const jwtPayload = JSON.stringify(decodeJwt(status.google.url.split("/").at(-1)));
      for (const text of [JSON.stringify(json), JSON.stringify(cls), JSON.stringify(obj), passJson, jwtPayload]) {
        expect(text).not.toContain(HOME_ADDRESS);
        expect(text).not.toContain("M6J"); // postal code
        expect(text).not.toContain("43.649612"); // the real pin
        expect(text).not.toContain("latitude");
      }
      expect(passJson).toContain(visibility === "area" ? "Bloor West area" : "Toronto");
    });
  }

  it("shopPassLocations / shopPassPlace keep only storefront pins and the public line", () => {
    const base = { lat: 43.1, lng: -79.1, areaLabel: "Leslieville", city: "Toronto", address: "9 Home St" };
    expect(shopPassLocations({ name: "X" }, [{ ...base, addressVisibility: "area" }, { ...base, addressVisibility: "city" }], "en")).toEqual([]);
    expect(shopPassLocations({ name: "X" }, [{ ...base, addressVisibility: "exact" }], "en")).toHaveLength(1);
    expect(shopPassPlace([{ ...base, addressVisibility: "area" }])).toBe("Leslieville area");
    expect(shopPassPlace([{ ...base, addressVisibility: "exact" }])).toBe("9 Home St");
  });

  it("pharmacy: a visit never goes on the card (no lock-screen relevance, no service name)", async () => {
    const s = await stampShop({ vertical: "pharmacy" });
    await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: s.user.id, startsAt: new Date("2026-11-05T15:00:00Z"), endsAt: new Date("2026-11-05T15:15:00Z"), items: [{ serviceId: null, name: "Flu shot", durationMin: 15, priceCents: 0 }] });
    const { model, locations: locs } = await shopPassModel(env.ctx, s.user.id, s.merchant.id);
    expect(model.nextAppointment).toBeNull();
    const json = JSON.stringify(buildShopPassJson(env.ctx.config, chain, { serialNumber: "S", authToken: "e".repeat(24) }, model, locs));
    expect(json).not.toContain("relevantDate");
    expect(json).not.toContain("Flu shot");
  });
});

describe("API: buttons, download, web service, live updates, removal", () => {
  it("no credentials: both wallets unavailable (buttons hidden / coming soon), shop-download refuses; the dev-fake signer is never used in production", async () => {
    const s = await stampShop();
    expect((await env.app.inject({ method: "GET", url: "/v1/wallet/availability" })).json()).toEqual({ apple: false, google: false });
    const r = (await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } })).json();
    expect(r).toMatchObject({ apple: { available: false, url: null, added: false }, google: { available: false, url: null, added: false } });
    expect((await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}` })).statusCode).toBe(401);
    env.ctx.config.walletDevFake = true;
    expect(googleConfigured(env.ctx.config)).toBe(true);
    expect(appleSignerFromConfig(env.ctx.config)?.passTypeId).toBe("pass.dev.local-loyalty.fake");
    env.ctx.config.env = "production";
    expect(googleConfigured(env.ctx.config)).toBe(false);
    expect(appleSignerFromConfig(env.ctx.config)).toBeNull();
    env.ctx.config.env = "test";
  });

  it("Apple: signed link → pkpass; register (201, in wallet) → serials since → latest pass → stamp at the counter by scanning the card's QR → APNs push → newer pass; unregister = removed", async () => {
    configureApple();
    const apns = consoleApns();
    setApnsPusher(env.ctx, apns);
    const s = await stampShop();
    const status = (await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } })).json();
    expect(status.apple).toMatchObject({ available: true, added: false });
    const dl = await env.app.inject({ method: "GET", url: status.apple.url.replace(env.ctx.config.publicApiUrl, "") });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"]).toBe("application/vnd.apple.pkpass");
    expect((await env.app.inject({ method: "GET", url: "/v1/wallet/apple/shop-download?token=nope" })).statusCode).toBe(401);
    const [pass] = await env.db.select().from(walletPasses).where(and(eq(walletPasses.userId, s.user.id), eq(walletPasses.merchantId, s.merchant.id)));
    const base = "/v1/wallet/apple/v1";
    const ap = { authorization: `ApplePass ${pass!.authToken}` };
    const reg = `${base}/devices/DEV1/registrations/${chain.passTypeId}/${pass!.serialNumber}`;
    expect((await env.app.inject({ method: "POST", url: reg, headers: { authorization: "ApplePass nope" }, payload: { pushToken: "tokA" } })).statusCode).toBe(401);
    expect((await env.app.inject({ method: "POST", url: reg, headers: ap, payload: { pushToken: "tokA" } })).statusCode).toBe(201);
    expect((await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } })).json().apple.added).toBe(true);
    const list = (await env.app.inject({ method: "GET", url: `${base}/devices/DEV1/registrations/${chain.passTypeId}` })).json();
    expect(list.serialNumbers).toEqual([pass!.serialNumber]);
    const latest = await env.app.inject({ method: "GET", url: `${base}/passes/${chain.passTypeId}/${pass!.serialNumber}`, headers: ap });
    expect(latest.statusCode).toBe(200);
    const pj = (b: Buffer) => JSON.parse(Buffer.from(unzipSync(new Uint8Array(b))["pass.json"]!).toString());
    expect(pj(latest.rawPayload).storeCard.headerFields[0].value).toBe("4 of 6");
    expect((await env.app.inject({ method: "GET", url: `${base}/passes/${chain.passTypeId}/${pass!.serialNumber}`, headers: { ...ap, "if-modified-since": latest.headers["last-modified"] as string } })).statusCode).toBe(304);

    // The counter scans the wallet card's QR, exactly like the in-app card.
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    const qr = pj(latest.rawPayload).barcodes[0].message as string;
    const found = await env.app.inject({ method: "GET", url: `/v1/merchants/${s.merchant.id}/counter/lookup?q=${encodeURIComponent(qr)}`, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` } });
    expect(found.json().items[0].memberId ?? found.json().items[0].id).toBeTruthy();
    expect((await counterAward(s, qr, "k1")).statusCode).toBeLessThan(300);
    await flushWalletWork();
    expect(apns.sent).toContainEqual({ token: "tokA", topic: chain.passTypeId });
    const since = await env.app.inject({ method: "GET", url: `${base}/devices/DEV1/registrations/${chain.passTypeId}?passesUpdatedSince=${list.lastUpdated}` });
    expect(since.json().serialNumbers).toEqual([pass!.serialNumber]);
    const after = await env.app.inject({ method: "GET", url: `${base}/passes/${chain.passTypeId}/${pass!.serialNumber}`, headers: ap });
    expect(pj(after.rawPayload).storeCard.headerFields[0].value).toBe("5 of 6");

    // Deleting the card from Wallet unregisters the device: removed, and no more pushes.
    expect((await env.app.inject({ method: "DELETE", url: reg, headers: ap })).statusCode).toBe(200);
    const [gone] = await env.db.select().from(walletPasses).where(eq(walletPasses.id, pass!.id));
    expect(gone!.removedAt).not.toBeNull();
    expect((await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } })).json().apple.added).toBe(false);
    const pushes = apns.sent.length;
    await counterAward(s, qr, "k2");
    await flushWalletWork();
    expect(apns.sent.length).toBe(pushes);
    expect(await env.db.select().from(walletDeviceRegistrations)).toHaveLength(0);
  });

  it("Google: stamps, reward ready, appointment booked/cancelled each PATCH the object; a wallet card edit PATCHes the class; del callback stops updates", async () => {
    const { calls } = configureGoogle();
    const s = await stampShop();
    await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } });
    const objectId = shopObjectId(ISSUER, s.merchant.id, s.user.id);
    const patches = () => calls.filter((c) => c.method === "PATCH" && c.url.endsWith(`/loyaltyObject/${encodeURIComponent(objectId)}`));

    // Stamp → 5 of 6.
    await counterAward(s, s.user.memberCode, "g1");
    await flushWalletWork();
    expect(patches().at(-1)!.body).toMatchObject({ loyaltyPoints: { balance: { string: "5 of 6" } }, notifyPreference: "NOTIFY" });
    // Stamp → 6 of 6, reward ready.
    await counterAward(s, s.user.memberCode, "g2");
    await flushWalletWork();
    expect(patches().at(-1)!.body).toMatchObject({ loyaltyPoints: { balance: { string: "6 of 6" } }, secondaryLoyaltyPoints: { balance: { int: 1 } }, textModulesData: expect.arrayContaining([expect.objectContaining({ body: "Free coffee, ready now" })]) });

    // Appointment booked, then cancelled by the shop: the card shows the next visit, then drops it.
    const [a] = await env.db.insert(appointments).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: s.user.id, startsAt: new Date("2026-11-06T16:00:00Z"), endsAt: new Date("2026-11-06T16:45:00Z"), items: [{ serviceId: null, name: "Lash fill", durationMin: 45, priceCents: 6000 }] }).returning();
    walletAppointmentChanged(env.ctx, a!);
    await flushWalletWork();
    expect(patches().at(-1)!.body).toMatchObject({ textModulesData: expect.arrayContaining([expect.objectContaining({ id: "visit", body: expect.stringContaining("Lash fill") })]) });
    const n = patches().length;
    const cancel = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/appointments/${a!.id}/status`, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` }, payload: { status: "cancelled" } });
    expect(cancel.statusCode).toBe(200);
    await flushWalletWork();
    expect(patches().length).toBe(n + 1);
    expect(JSON.stringify(patches().at(-1)!.body)).not.toContain("Lash fill");

    // The owner edits the wallet card: class PATCH + every card refreshed (quietly).
    const put = await env.app.inject({ method: "PUT", url: `/v1/merchants/${s.merchant.id}/wallet-card`, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` }, payload: { color: "#7C3AED", rewardText: "Free latte" } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ settings: { color: "#7C3AED", rewardText: "Free latte" }, preview: { colors: { background: "#7C3AED" } } });
    await flushWalletWork();
    expect(calls.find((c) => c.method === "PATCH" && c.url.includes("/loyaltyClass/"))!.body).toMatchObject({ hexBackgroundColor: "#7C3AED" });
    expect(patches().at(-1)!.body).toMatchObject({ notifyPreference: "DO_NOT_NOTIFY", textModulesData: expect.arrayContaining([expect.objectContaining({ body: expect.stringContaining("Free latte") })]) });

    // Google tells us the card was deleted: no more PATCHes. A forged callback is refused.
    const cls = shopClassId(ISSUER, s.merchant.id);
    const signedMessage = JSON.stringify({ classId: cls, objectId, eventType: "del", expTimeMillis: Date.now() + 60_000, count: 1, nonce: "n1" });
    expect((await env.app.inject({ method: "POST", url: "/v1/wallet/google/callback?k=forged", payload: { signedMessage } })).statusCode).toBe(401);
    expect((await env.app.inject({ method: "POST", url: `/v1/wallet/google/callback?k=${googleCallbackKey(env.ctx.config, cls)}`, payload: { signedMessage, protocolVersion: "ECv2SigningOnly", signature: "x" } })).statusCode).toBe(200);
    const before = patches().length;
    await counterAward(s, s.user.memberCode, "g3");
    await flushWalletWork();
    expect(patches().length).toBe(before);
    expect((await notifyShopPassUpdate(env.ctx, s.user.id, s.merchant.id, { force: true }))!.google).toBe("removed");
    // Saving it again (a "save" callback) turns updates back on.
    await env.app.inject({ method: "POST", url: `/v1/wallet/google/callback?k=${googleCallbackKey(env.ctx.config, cls)}`, payload: { signedMessage: signedMessage.replace('"del"', '"save"') } });
    env.clock.now = new Date(env.clock.now.getTime() + 1000);
    expect((await notifyShopPassUpdate(env.ctx, s.user.id, s.merchant.id, { force: true }))!.google).toBe("updated");
    expect((await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } })).json().google.added).toBe(true);
  });

  it("Settings, Wallet card: staff read it, only managers save it, bad colours are refused; a profile change refreshes the cards", async () => {
    const { calls } = configureGoogle();
    const s = await stampShop();
    const g = await env.app.inject({ method: "GET", url: `/v1/merchants/${s.merchant.id}/wallet-card`, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` } });
    expect(g.json()).toMatchObject({ settings: {}, availability: { apple: false, google: true }, cardsInWallets: { apple: 0, google: 0 }, preview: { name: "Pinecone Coffee", memberName: "Priya" } });
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${s.merchant.id}/wallet-card`, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` }, payload: { color: "green" } })).statusCode).toBe(400);
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${s.merchant.id}/wallet-card`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` }, payload: {} })).statusCode).toBe(403);
    const pv = await env.app.inject({ method: "POST", url: `/v1/merchants/${s.merchant.id}/wallet-card/preview`, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` }, payload: { strip: "plain", color: "#FFFFFF" } });
    expect(pv.json()).toMatchObject({ strip: "plain", colors: { background: "#FFFFFF", foreground: "#111111" } });
    // A member with a Google card; then the shop renames itself in Shop profile.
    await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } });
    const r = await env.app.inject({ method: "PATCH", url: `/v1/merchants/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.owner)}` }, payload: { name: "Pinecone Café" } });
    expect(r.statusCode).toBe(200);
    await flushWalletWork();
    expect(calls.find((c) => c.method === "PATCH" && c.url.includes("/loyaltyClass/"))!.body).toMatchObject({ issuerName: "Pinecone Café" });
  });

  it("dev-fake mode: Apple and Google work end to end with throwaway keys; the Google link opens a local preview page", async () => {
    env.ctx.config.walletDevFake = true;
    const s = await stampShop();
    const st = (await env.app.inject({ method: "GET", url: `/v1/me/wallet/shops/${s.merchant.id}`, headers: { authorization: `Bearer ${await tokenFor(env, s.user)}` } })).json();
    expect(st.apple.available && st.google.available).toBe(true);
    expect(st.google.url).toContain("/v1/wallet/dev/google-save?jwt=");
    const page = await env.app.inject({ method: "GET", url: st.google.url.replace(env.ctx.config.publicApiUrl, "") });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Pinecone Coffee");
    const pk = await env.app.inject({ method: "GET", url: st.apple.url.replace(env.ctx.config.publicApiUrl, "") });
    expect(JSON.parse(Buffer.from(unzipSync(new Uint8Array(pk.rawPayload))["pass.json"]!).toString()).passTypeIdentifier).toBe("pass.dev.local-loyalty.fake");
    env.ctx.config.walletDevFake = false;
    expect((await env.app.inject({ method: "GET", url: st.google.url.replace(env.ctx.config.publicApiUrl, "") })).statusCode).toBe(404);
  });

  it("model builder is pure: unchanged content skips the push", async () => {
    configureApple();
    const apns = consoleApns();
    setApnsPusher(env.ctx, apns);
    const s = await stampShop();
    const pass = await env.db.insert(walletPasses).values({ userId: s.user.id, merchantId: s.merchant.id, platform: "apple", serialNumber: "Sdedupe", authToken: "d".repeat(24) }).returning();
    await env.db.insert(walletDeviceRegistrations).values({ passId: pass[0]!.id, deviceLibraryId: "D", pushToken: "t" });
    expect((await notifyShopPassUpdate(env.ctx, s.user.id, s.merchant.id))!.changed).toBe(true);
    expect((await notifyShopPassUpdate(env.ctx, s.user.id, s.merchant.id))!.changed).toBe(false);
    expect(apns.sent).toHaveLength(1);
    expect(buildShopModel(env.ctx.config, { shop: { merchant: { ...s.merchant, walletCard: {} }, program: null, rewards: [], locs: [], bookable: false }, balance: 0, memberName: null, memberCode: "X", locale: "hi", nextAppointment: null }).nextReward).toBeNull();
    expect((await env.db.select().from(users).where(eq(users.id, s.user.id))).length).toBe(1);
  });
});
