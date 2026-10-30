/**
 * Fake wallet credentials for dev and e2e (WALLET_DEV_FAKE=1, refused in production by config.ts) and for tests.
 *
 *  - Apple: a throwaway "WWDR" CA and a Pass Type ID leaf it signs, so a .pkpass has the real structure (manifest, PKCS#7
 *    detached signature with the chain). iOS will not install it: only Apple's WWDR G4 chain is trusted.
 *  - Google: a throwaway service-account key, so save links carry a real RS256 JWT; Wallet REST calls are recorded, never sent.
 *
 * Nothing here talks to Apple or Google.
 */
import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";
import type { Fetch } from "./integrations-http.js";

export const FAKE_PASS_TYPE_ID = "pass.dev.local-loyalty.fake";
export const FAKE_TEAM_ID = "FAKETEAM00";
export const FAKE_ISSUER_ID = "3388000000000000000";
export const FAKE_SA_EMAIL = "wallet-dev@fake.iam.gserviceaccount.com";

function rsaPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    keyPem: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    pkcs8Pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function cert(subjectCn: string, pub: string, signerKeyPem: string, issuerCn: string, serial: string, ca: boolean) {
  const c = forge.pki.createCertificate();
  c.publicKey = forge.pki.publicKeyFromPem(pub);
  c.serialNumber = serial;
  c.validity.notBefore = new Date(Date.now() - 86_400_000);
  c.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  c.setSubject([{ name: "commonName", value: subjectCn }, { name: "organizationName", value: "Local Loyalty (FAKE, dev only)" }]);
  c.setIssuer([{ name: "commonName", value: issuerCn }, { name: "organizationName", value: "Local Loyalty (FAKE, dev only)" }]);
  c.setExtensions([{ name: "basicConstraints", cA: ca }, { name: "keyUsage", keyCertSign: ca, digitalSignature: true }]);
  c.sign(forge.pki.privateKeyFromPem(signerKeyPem), forge.md.sha256.create());
  return forge.pki.certificateToPem(c);
}

export interface FakeAppleChain {
  passTypeId: string;
  teamId: string;
  certPem: string;
  keyPem: string;
  wwdrPem: string;
  /** The leaf's public key, for signature checks in tests. */
  publicKeyPem: string;
}

/** A fake WWDR-like CA plus a Pass Type ID certificate it issued. */
export function makeFakeAppleChain(passTypeId = FAKE_PASS_TYPE_ID, teamId = FAKE_TEAM_ID): FakeAppleChain {
  const ca = rsaPair();
  const leaf = rsaPair();
  const wwdrPem = cert("FAKE Apple Worldwide Developer Relations Certification Authority G4", ca.publicPem, ca.keyPem, "FAKE Apple Worldwide Developer Relations Certification Authority G4", "01", true);
  const certPem = cert(`Pass Type ID: ${passTypeId}`, leaf.publicPem, ca.keyPem, "FAKE Apple Worldwide Developer Relations Certification Authority G4", "02", false);
  return { passTypeId, teamId, certPem, keyPem: leaf.keyPem, wwdrPem, publicKeyPem: leaf.publicPem };
}

/** The same chain packed as a password-protected .p12 (base64), to test the p12 path. */
export function fakeP12Base64(chain: FakeAppleChain, password: string): string {
  const p12 = forge.pkcs12.toPkcs12Asn1(forge.pki.privateKeyFromPem(chain.keyPem), [forge.pki.certificateFromPem(chain.certPem)], password, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary").toString("base64");
}

export interface FakeServiceAccount {
  json: string;
  publicKeyPem: string;
}

export function makeFakeServiceAccount(email = FAKE_SA_EMAIL): FakeServiceAccount {
  const k = rsaPair();
  return { json: JSON.stringify({ type: "service_account", client_email: email, private_key: k.pkcs8Pem }), publicKeyPem: k.publicPem };
}

let devApple: FakeAppleChain | null = null;
let devGoogle: FakeServiceAccount | null = null;
/** Process-wide dev credentials (generated once, on first use). */
export const devAppleChain = () => (devApple ??= makeFakeAppleChain());
export const devServiceAccount = () => (devGoogle ??= makeFakeServiceAccount());

export interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

/** A fetch that answers Google's OAuth and Wallet REST like Google would (200, a token) and records every call. */
export function recordingGoogleFetch(log = false): Fetch & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const raw = typeof init?.body === "string" ? init.body : "";
    let body: unknown = raw;
    try {
      body = JSON.parse(raw);
    } catch {
      /* form or empty */
    }
    calls.push({ method: init?.method ?? "GET", url, body });
    if (log) console.log(`[wallet dev] ${init?.method ?? "GET"} ${url}`);
    if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "ya29.dev-fake", expires_in: 3600, token_type: "Bearer" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as Fetch & { calls: RecordedCall[] };
  f.calls = calls;
  return f;
}
