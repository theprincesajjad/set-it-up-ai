/**
 * Apple Wallet .pkpass: pass.json (storeCard) + images + manifest.json (SHA-1
 * of every file) + signature (PKCS#7 detached, signed with the Pass Type ID
 * certificate, WWDR intermediate included), zipped.
 * Spec: https://developer.apple.com/documentation/walletpasses/building-a-pass
 *
 * v2 design (docs/design/foundations.md): near-black card, white text, the
 * accent (#FF7A45, the dark-mode accent) as the label colour, the "four
 * corners" mark. Balances are always shown per shop in the shop's own units;
 * points and stamps are never summed.
 */
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import forge from "node-forge";
import { BRAND, normalizeLocale, t as translate, unitLabel, unitWord, walletApi, type Locale } from "@ll/shared";
import type { Config } from "../config.js";
import { pemFromEnv } from "./wallet-apns.js";
import { iconPng, logoPng, walletAsset } from "./wallet-png.js";

/** v2 tokens: bg (dark) #0B0B0C, fg (dark) #F5F5F4, accent (dark) #FF7A45. */
export const PASS_COLORS = { background: "#0B0B0C", foreground: "#F5F5F4", label: "#FF7A45", accent: "#FF5A1F" };
const rgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`;
};

export interface PassLocation {
  latitude: number;
  longitude: number;
  relevantText: string;
}

export interface ApplePassInput {
  serialNumber: string;
  authToken: string;
  summary: walletApi.WalletSummary;
  /** Up to 10 member shop locations (lock-screen relevance). */
  locations?: PassLocation[];
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

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "1 stamp", "120 points", "3 stars": the shop's own unit, singular when 1. */
export function balanceText(balance: number, terminology: string, locale: Locale = "en"): string {
  return unitLabel(locale, terminology, balance);
}

/** The pass language: the shopper's profile language, English when absent. */
export const passLocale = (s: { locale?: string | null }): Locale => normalizeLocale(s.locale) ?? "en";
const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

const expiryLine = (x: walletApi.WalletShopBalance, loc: Locale) => {
  const unit = cap(unitWord(loc, x.terminology));
  return x.expiryMonths ? translate(loc, "sh.pass.expireAfter", { unit, months: x.expiryMonths }) : translate(loc, "sh.pass.neverExpire", { unit });
};

export function buildPassJson(config: Config, p: { passTypeId: string; teamId: string }, input: ApplePassInput) {
  const s = input.summary;
  const loc = passLocale(s);
  const tr = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(loc, key, vars);
  const ready = s.rewardsReady ?? 0;
  const top = s.shops.slice(0, 2);
  const readyShops = s.shops.filter((x) => (x.rewardsReady ?? 0) > 0);

  const primary =
    ready > 0
      ? {
          key: "primary",
          label: readyShops.length === 1 ? tr("sh.pass.readyAt", { shop: truncate(readyShops[0]!.name, 28) }) : tr("sh.pass.readyAcross", { n: readyShops.length }),
          value: tr("sh.pass.rewardsN", { n: ready }),
        }
      : { key: "primary", label: s.shopCount ? tr("sh.pass.memberAt") : tr("sh.pass.yourCard"), value: s.shopCount ? tr("sh.pass.shopsN", { n: s.shopCount }) : tr("sh.pass.everyShop") };

  // Slot 1 = the shop visited most recently (the one that just changed), so its
  // change message is the lock-screen notification: "You now have 130 points at Pinecone".
  const shopFields = top.map((x, i) => ({
    key: `shop${i + 1}`,
    label: truncate(x.name.toLowerCase(), 20),
    value: balanceText(x.balance, x.terminology, loc),
    ...(i === 0 ? { changeMessage: tr("sh.pass.change", { shop: x.name }) } : {}),
  }));

  const memberships = s.shops.length
    ? s.shops
        .map((x) => `${x.name}: ${balanceText(x.balance, x.terminology, loc)}${x.rewardsReady ? ` (${tr("sh.pass.rewardsReadySuffix", { n: x.rewardsReady })})` : ""}\n${expiryLine(x, loc)}`)
        .join("\n\n")
    : tr("sh.pass.joinBody");
  const anyExpiry = s.shops.some((x) => x.expiryMonths);

  return {
    formatVersion: 1,
    passTypeIdentifier: p.passTypeId,
    serialNumber: input.serialNumber,
    teamIdentifier: p.teamId,
    webServiceURL: `${config.publicApiUrl}/v1/wallet/apple`,
    authenticationToken: input.authToken,
    organizationName: BRAND.name,
    description: `${BRAND.name} ${loc === "en" ? "member card" : tr("sh.card.title")}`,
    logoText: BRAND.name.toLowerCase(),
    foregroundColor: rgb(PASS_COLORS.foreground),
    backgroundColor: rgb(PASS_COLORS.background),
    labelColor: rgb(PASS_COLORS.label),
    sharingProhibited: true,
    // No relevantDate: the pass is relevant by place, never by time.
    ...(input.locations?.length ? { locations: input.locations.slice(0, 10), maxDistance: 100 } : {}),
    barcodes: [{ format: "PKBarcodeFormatQR", message: s.qrValue, messageEncoding: "iso-8859-1", altText: s.memberCode }],
    storeCard: {
      headerFields: [{ key: "ready", label: tr("sh.pass.ready"), value: ready, textAlignment: "PKTextAlignmentRight", changeMessage: tr("sh.pass.changeReady") }],
      primaryFields: [primary],
      secondaryFields: shopFields,
      auxiliaryFields: [{ key: "member", label: tr("sh.pass.member"), value: s.name ?? s.memberCode }],
      backFields: [
        { key: "memberships", label: tr("sh.pass.shopsBack"), value: memberships },
        {
          key: "expiry",
          label: tr("sh.pass.expiryLabel"),
          value: anyExpiry
            ? `${tr("sh.pass.expiryUnless")} ${s.shops
                .filter((x) => x.expiryMonths)
                .map((x) => tr("sh.pass.afterMonths", { shop: x.name, months: x.expiryMonths! }))
                .join(" ")}`
            : tr("sh.pass.expiryNever"),
        },
        { key: "how", label: tr("sh.pass.howLabel"), value: tr("sh.pass.how", { brand: BRAND.name }) },
        { key: "code", label: tr("sh.pass.codeLabel"), value: s.memberCode },
        { key: "updates", label: tr("sh.pass.updatesLabel"), value: tr("sh.pass.updatesBody") },
        { key: "terms", label: tr("sh.pass.terms"), value: `${config.publicWebUrl}/terms`, attributedValue: `<a href='${config.publicWebUrl}/terms'>${config.publicWebUrl.replace(/^https?:\/\//, "")}/terms</a>` },
        { key: "help", label: tr("sh.pass.support"), value: BRAND.supportEmail, attributedValue: `<a href='mailto:${BRAND.supportEmail}'>${BRAND.supportEmail}</a>` },
      ],
    },
  };
}

/** Pass images: v2 artwork from assets/wallet (see scripts/render-wallet-assets.cjs), procedural fallback. */
export function passImages(): Record<string, Buffer> {
  const pick = (name: string, fallback: () => Buffer) => walletAsset(name) ?? fallback();
  return {
    "icon.png": pick("icon.png", () => iconPng(29, PASS_COLORS.background)),
    "icon@2x.png": pick("icon@2x.png", () => iconPng(58, PASS_COLORS.background)),
    "icon@3x.png": pick("icon@3x.png", () => iconPng(87, PASS_COLORS.background)),
    "logo.png": pick("logo.png", () => logoPng(50, 50)),
    "logo@2x.png": pick("logo@2x.png", () => logoPng(100, 100)),
    "logo@3x.png": pick("logo@3x.png", () => logoPng(150, 150)),
  };
}

/** Pass files (without manifest/signature). */
export function passFiles(config: Config, p: { passTypeId: string; teamId: string }, input: ApplePassInput): Record<string, Buffer> {
  return { "pass.json": Buffer.from(JSON.stringify(buildPassJson(config, p, input))), ...passImages() };
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
