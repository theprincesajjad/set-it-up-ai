/**
 * Apple Wallet .pkpass: pass.json (storeCard) + images + manifest.json (SHA-1
 * of every file) + signature (PKCS#7 detached, signed with the Pass Type ID
 * certificate, WWDR intermediate included), zipped.
 * Spec: https://developer.apple.com/documentation/walletpasses/building-a-pass
 */
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import forge from "node-forge";
import { BRAND, walletApi } from "@ll/shared";
import type { Config } from "../config.js";
import { pemFromEnv } from "./wallet-apns.js";
import { iconPng, logoPng } from "./wallet-png.js";

export const PASS_COLORS = { background: "#115E59", foreground: "#FFFFFF", label: "#CCFBF1" };
const rgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`;
};

export interface ApplePassInput {
  serialNumber: string;
  authToken: string;
  summary: walletApi.WalletSummary;
}

export interface AppleSigner {
  passTypeId: string;
  teamId: string;
  certPem: string;
  keyPem: string;
  wwdrPem: string;
  keyPassphrase?: string;
}

export function appleSignerFromConfig(config: Config): AppleSigner | null {
  const a = config.apple;
  if (!a.passTypeId || !a.teamId || !a.certPem || !a.keyPem || !a.wwdrPem) return null;
  return { passTypeId: a.passTypeId, teamId: a.teamId, certPem: pemFromEnv(a.certPem)!, keyPem: pemFromEnv(a.keyPem)!, wwdrPem: pemFromEnv(a.wwdrPem)!, keyPassphrase: a.keyPassphrase };
}

export function missingAppleConfig(config: Config): string[] {
  const a = config.apple;
  const pairs: [string, unknown][] = [
    ["APPLE_PASS_TYPE_ID", a.passTypeId],
    ["APPLE_TEAM_ID", a.teamId],
    ["APPLE_PASS_CERT_PEM", a.certPem],
    ["APPLE_PASS_KEY_PEM", a.keyPem],
    ["APPLE_WWDR_PEM", a.wwdrPem],
  ];
  return pairs.filter(([, v]) => !v).map(([k]) => k);
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildPassJson(config: Config, p: { passTypeId: string; teamId: string }, input: ApplePassInput) {
  const s = input.summary;
  const shopLines = s.shops.length
    ? s.shops.map((x) => `${x.name}: ${x.balance} ${x.terminology}${x.expiryMonths ? ` (expire after ${x.expiryMonths} months of inactivity)` : ""}`).join("\n")
    : "Show this card at any participating shop to join and start earning.";
  const expiring = s.shops.filter((x) => x.expiryMonths);
  return {
    formatVersion: 1,
    passTypeIdentifier: p.passTypeId,
    serialNumber: input.serialNumber,
    teamIdentifier: p.teamId,
    webServiceURL: `${config.publicApiUrl}/v1/wallet/apple`,
    authenticationToken: input.authToken,
    organizationName: BRAND.name,
    description: `${BRAND.name} member card`,
    logoText: BRAND.name,
    foregroundColor: rgb(PASS_COLORS.foreground),
    backgroundColor: rgb(PASS_COLORS.background),
    labelColor: rgb(PASS_COLORS.label),
    sharingProhibited: true,
    barcodes: [{ format: "PKBarcodeFormatQR", message: s.qrValue, messageEncoding: "iso-8859-1", altText: s.memberCode }],
    storeCard: {
      headerFields: [{ key: "shops", label: "SHOPS", value: s.shopCount }],
      primaryFields: [{ key: "points", label: "TOTAL POINTS", value: s.totalPoints, changeMessage: "You now have %@ points across your shops" }],
      secondaryFields: [{ key: "member", label: "MEMBER", value: s.name ?? "Member" }],
      auxiliaryFields: s.shops.slice(0, 2).map((x, i) => ({ key: `shop${i}`, label: truncate(x.name.toUpperCase(), 18), value: x.balance, changeMessage: `${x.name}: %@ ${x.terminology}` })),
      backFields: [
        { key: "balances", label: "Your shops", value: shopLines },
        {
          key: "expiry",
          label: "Points expiry",
          value: expiring.length ? `Points never expire unless noted above. ${expiring.map((x) => `${x.name}: after ${x.expiryMonths} months without a visit.`).join(" ")}` : "Your points never expire.",
        },
        { key: "code", label: "Member code", value: s.memberCode },
        { key: "how", label: "How it works", value: `Show this card at the counter at any ${BRAND.name} shop to earn and redeem. One card for every shop on your street.` },
        { key: "help", label: "Help", value: BRAND.supportEmail },
      ],
    },
  };
}

/** Pass files (without manifest/signature). */
export function passFiles(config: Config, p: { passTypeId: string; teamId: string }, input: ApplePassInput): Record<string, Buffer> {
  return {
    "pass.json": Buffer.from(JSON.stringify(buildPassJson(config, p, input))),
    "icon.png": iconPng(29, PASS_COLORS.background),
    "icon@2x.png": iconPng(58, PASS_COLORS.background),
    "icon@3x.png": iconPng(87, PASS_COLORS.background),
    "logo.png": logoPng(160, 50),
    "logo@2x.png": logoPng(320, 100),
  };
}

export function manifestFor(files: Record<string, Buffer>): Buffer {
  const m: Record<string, string> = {};
  for (const [name, buf] of Object.entries(files)) m[name] = createHash("sha1").update(buf).digest("hex");
  return Buffer.from(JSON.stringify(m));
}

/** PKCS#7 detached signature (DER) over manifest.json. */
export function signManifest(manifest: Buffer, signer: Pick<AppleSigner, "certPem" | "keyPem" | "wwdrPem" | "keyPassphrase">, signingTime = new Date()): Buffer {
  const cert = forge.pki.certificateFromPem(signer.certPem);
  const wwdr = forge.pki.certificateFromPem(signer.wwdrPem);
  const key = signer.keyPassphrase ? forge.pki.decryptRsaPrivateKey(signer.keyPem, signer.keyPassphrase) : forge.pki.privateKeyFromPem(signer.keyPem);
  if (!key) throw new Error("Could not read APPLE_PASS_KEY_PEM (wrong passphrase?)");
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString("binary"));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest! },
      { type: forge.pki.oids.signingTime!, value: signingTime as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

/** Unsigned bundle contents (manifest included) — used by tests and for debugging. */
export function unsignedBundle(config: Config, p: { passTypeId: string; teamId: string }, input: ApplePassInput) {
  const files = passFiles(config, p, input);
  return { files, manifest: manifestFor(files) };
}

export function buildPkpass(config: Config, signer: AppleSigner, input: ApplePassInput, signingTime?: Date): Buffer {
  const { files, manifest } = unsignedBundle(config, signer, input);
  const signature = signManifest(manifest, signer, signingTime);
  const entries: Record<string, Uint8Array> = { "manifest.json": manifest, signature };
  for (const [k, v] of Object.entries(files)) entries[k] = v;
  return Buffer.from(zipSync(entries, { level: 6 }));
}
