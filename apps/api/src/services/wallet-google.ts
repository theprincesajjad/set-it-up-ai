/**
 * Google Wallet: one Generic pass object per customer under one issuer class.
 * "Save to Google Wallet" = https://pay.google.com/gp/v/save/<JWT> where the
 * JWT (RS256, service-account key) embeds the class + object.
 * Updates PATCH the object through the Wallet REST API.
 * Docs: https://developers.google.com/wallet/generic
 */
import { SignJWT, importPKCS8 } from "jose";
import { BRAND, walletApi } from "@ll/shared";
import type { Config } from "../config.js";
import { requestJson } from "../connectors/util.js";
import type { Fetch } from "./integrations-http.js";
import { PASS_COLORS } from "./wallet-apple.js";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** GOOGLE_WALLET_SERVICE_ACCOUNT_JSON may be raw JSON or base64 of it. */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  const tryParse = (s: string) => {
    try {
      const j = JSON.parse(s);
      return j?.client_email && j?.private_key ? ({ client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") } as ServiceAccount) : null;
    } catch {
      return null;
    }
  };
  return tryParse(raw) ?? tryParse(Buffer.from(raw, "base64").toString("utf8"));
}

export const googleConfigured = (config: Config) => !!(config.google.walletIssuerId && parseServiceAccount(config.google.walletServiceAccountJson));

export const classIdFor = (issuerId: string) => `${issuerId}.ll_network_member`;
export const objectIdFor = (issuerId: string, userId: string) => `${issuerId}.ll_${userId.replace(/-/g, "")}`;

export function genericClass(issuerId: string) {
  return { id: classIdFor(issuerId) };
}

export function genericObject(config: Config, issuerId: string, userId: string, s: walletApi.WalletSummary) {
  const lang = "en-CA";
  const top = s.shops.slice(0, 5).map((x) => `${x.name}: ${x.balance} ${x.terminology}`).join("\n");
  return {
    id: objectIdFor(issuerId, userId),
    classId: classIdFor(issuerId),
    state: "ACTIVE",
    cardTitle: { defaultValue: { language: lang, value: BRAND.name } },
    header: { defaultValue: { language: lang, value: s.name ?? "Member" } },
    subheader: { defaultValue: { language: lang, value: `${s.totalPoints} points · ${s.shopCount} ${s.shopCount === 1 ? "shop" : "shops"}` } },
    hexBackgroundColor: PASS_COLORS.background,
    logo: { sourceUri: { uri: `${config.publicApiUrl}/v1/wallet/assets/logo.png` }, contentDescription: { defaultValue: { language: lang, value: BRAND.name } } },
    barcode: { type: "QR_CODE", value: s.qrValue, alternateText: s.memberCode },
    textModulesData: [
      { id: "points", header: "Total points", body: String(s.totalPoints) },
      { id: "shops", header: "Your shops", body: top || "Show this card at any participating shop to join." },
      {
        id: "expiry",
        header: "Points expiry",
        body: s.shops.some((x) => x.expiryMonths)
          ? s.shops.filter((x) => x.expiryMonths).map((x) => `${x.name}: after ${x.expiryMonths} months without a visit`).join("\n")
          : "Your points never expire.",
      },
    ],
  };
}

export async function googleSaveUrl(config: Config, userId: string, summary: walletApi.WalletSummary, now: Date): Promise<string> {
  const sa = parseServiceAccount(config.google.walletServiceAccountJson);
  const issuerId = config.google.walletIssuerId;
  if (!sa || !issuerId) throw new Error("Google Wallet is not configured");
  const key = await importPKCS8(sa.private_key, "RS256");
  const jwt = await new SignJWT({
    origins: [config.publicWebUrl],
    typ: "savetowallet",
    payload: { genericClasses: [genericClass(issuerId)], genericObjects: [genericObject(config, issuerId, userId, summary)] },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("google")
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .sign(key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

async function accessToken(config: Config, fetch: Fetch, now: Date): Promise<string> {
  const sa = parseServiceAccount(config.google.walletServiceAccountJson)!;
  const key = await importPKCS8(sa.private_key, "RS256");
  const iat = Math.floor(now.getTime() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/wallet_object.issuer" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(key);
  const r = await requestJson(fetch, "https://oauth2.googleapis.com/token", { method: "POST", form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion } });
  return r.access_token as string;
}

/** PATCH the customer's object with fresh balances. 404 (never saved) is fine. */
export async function updateGoogleObject(config: Config, userId: string, summary: walletApi.WalletSummary, fetch: Fetch, now: Date): Promise<"updated" | "missing"> {
  const issuerId = config.google.walletIssuerId!;
  const token = await accessToken(config, fetch, now);
  const obj = genericObject(config, issuerId, userId, summary);
  try {
    await requestJson(fetch, `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(obj.id)}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      json: obj,
    });
    return "updated";
  } catch (err) {
    if ((err as { status?: number }).status === 404) return "missing";
    throw err;
  }
}
