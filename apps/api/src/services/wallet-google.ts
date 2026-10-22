/**
 * Google Wallet: ONE loyalty class per network (issuer branding) and one
 * loyalty object per customer.
 *  - "Save" = https://pay.google.com/gp/v/save/<JWT> (RS256, service-account key) embedding class + object.
 *  - Balance changes PATCH the object (OAuth 2.0 JWT-bearer access token from the service account).
 *  - "Reward ready" adds a TEXT_AND_NOTIFY message to the object (addMessage), which Google shows as a
 *    notification on the pass (Google rate-limits these to a few per day per pass).
 * All HTTP goes through an injectable fetch (tests record payloads; no live network).
 * Docs: https://developers.google.com/wallet/retail/loyalty-cards
 */
import { SignJWT, importPKCS8 } from "jose";
import { BRAND, walletApi } from "@ll/shared";
import type { Config } from "../config.js";
import { requestJson } from "../connectors/util.js";
import type { Fetch } from "./integrations-http.js";
import { PASS_COLORS, balanceText, type PassLocation } from "./wallet-apple.js";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
export const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

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

export const classIdFor = (issuerId: string) => `${issuerId}.ll_network_loyalty`;
export const objectIdFor = (issuerId: string, userId: string) => `${issuerId}.ll_${userId.replace(/-/g, "")}`;

const LANG = "en-CA";
const ls = (value: string) => ({ defaultValue: { language: LANG, value } });

/** The network's loyalty class: issuer branding, v2 colours. */
export function loyaltyClass(config: Config, issuerId: string) {
  return {
    id: classIdFor(issuerId),
    issuerName: BRAND.name,
    programName: "member card",
    localizedIssuerName: ls(BRAND.name),
    localizedProgramName: ls("member card"),
    programLogo: { sourceUri: { uri: `${config.publicApiUrl}/v1/wallet/assets/logo.png` }, contentDescription: ls(`${BRAND.name} logo`) },
    hexBackgroundColor: PASS_COLORS.background,
    countryCode: "CA",
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    homepageUri: { uri: config.publicWebUrl, description: BRAND.name },
  };
}

export interface GoogleObjectInput {
  summary: walletApi.WalletSummary;
  locations?: PassLocation[];
}

/** One loyalty object per customer. */
export function loyaltyObject(config: Config, issuerId: string, userId: string, input: GoogleObjectInput) {
  const s = input.summary;
  const top = s.shops.slice(0, 3);
  const anyExpiry = s.shops.some((x) => x.expiryMonths);
  return {
    id: objectIdFor(issuerId, userId),
    classId: classIdFor(issuerId),
    state: "ACTIVE",
    accountId: s.memberCode,
    accountName: s.name ?? "Member",
    hexBackgroundColor: PASS_COLORS.background,
    loyaltyPoints: { label: "Rewards ready", balance: { int: s.rewardsReady } },
    secondaryLoyaltyPoints: { label: "Shops", balance: { int: s.shopCount } },
    barcode: { type: "QR_CODE", value: s.qrValue, alternateText: s.memberCode },
    textModulesData: [
      ...top.map((x, i) => ({
        id: `shop${i + 1}`,
        header: x.name,
        body: `${balanceText(x.balance, x.terminology)}${x.rewardsReady ? ` · ${x.rewardsReady} ${x.rewardsReady === 1 ? "reward" : "rewards"} ready` : ""}`,
      })),
      ...(s.shops.length > 3
        ? [{ id: "more", header: `${s.shops.length - 3} more ${s.shops.length - 3 === 1 ? "shop" : "shops"}`, body: s.shops.slice(3).map((x) => `${x.name}: ${balanceText(x.balance, x.terminology)}`).join("\n") }]
        : []),
      ...(s.shops.length ? [] : [{ id: "join", header: "Start earning", body: "Show this card at any participating shop to join." }]),
      {
        id: "expiry",
        header: "Points expiry",
        body: anyExpiry
          ? s.shops
              .filter((x) => x.expiryMonths)
              .map((x) => `${x.name}: after ${x.expiryMonths} months without a visit`)
              .join("\n") + "\nOther shops: points never expire."
          : "Your points never expire.",
      },
      { id: "how", header: "How to use", body: `Show this card at the counter of any ${BRAND.name} shop to earn and redeem.` },
    ],
    linksModuleData: {
      uris: [
        { id: "card", uri: `${config.publicWebUrl}/me`, description: "Your shops and rewards" },
        { id: "terms", uri: `${config.publicWebUrl}/terms`, description: "Terms" },
        { id: "support", uri: `mailto:${BRAND.supportEmail}`, description: "Support" },
      ],
    },
    ...(input.locations?.length ? { locations: input.locations.slice(0, 10).map((l) => ({ latitude: l.latitude, longitude: l.longitude })) } : {}),
  };
}

export async function googleSaveUrl(config: Config, userId: string, input: GoogleObjectInput, now: Date): Promise<string> {
  const sa = parseServiceAccount(config.google.walletServiceAccountJson);
  const issuerId = config.google.walletIssuerId;
  if (!sa || !issuerId) throw new Error("Google Wallet is not configured");
  const key = await importPKCS8(sa.private_key, "RS256");
  const jwt = await new SignJWT({
    origins: [config.publicWebUrl],
    typ: "savetowallet",
    payload: { loyaltyClasses: [loyaltyClass(config, issuerId)], loyaltyObjects: [loyaltyObject(config, issuerId, userId, input)] },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("google")
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .sign(key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

const tokenCache = new Map<string, { token: string; exp: number }>();
export const clearGoogleTokenCache = () => tokenCache.clear();

/** OAuth 2.0 service-account flow (JWT bearer grant) → access token for the Wallet API. */
export async function accessToken(config: Config, fetch: Fetch, now: Date): Promise<string> {
  const sa = parseServiceAccount(config.google.walletServiceAccountJson)!;
  const cached = tokenCache.get(sa.client_email);
  if (cached && cached.exp - 60_000 > now.getTime()) return cached.token;
  const key = await importPKCS8(sa.private_key, "RS256");
  const iat = Math.floor(now.getTime() / 1000);
  const assertion = await new SignJWT({ scope: WALLET_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience(OAUTH_TOKEN_URL)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(key);
  const r = await requestJson(fetch, OAUTH_TOKEN_URL, { method: "POST", form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion } });
  tokenCache.set(sa.client_email, { token: r.access_token, exp: now.getTime() + Number(r.expires_in ?? 3600) * 1000 });
  return r.access_token as string;
}

/** PATCH the customer's object with fresh balances. 404 (never saved) is fine. */
export async function updateGoogleObject(config: Config, userId: string, input: GoogleObjectInput, fetch: Fetch, now: Date): Promise<"updated" | "missing"> {
  const issuerId = config.google.walletIssuerId!;
  const token = await accessToken(config, fetch, now);
  const obj = loyaltyObject(config, issuerId, userId, input);
  try {
    await requestJson(fetch, `${WALLET_API}/loyaltyObject/${encodeURIComponent(obj.id)}`, { method: "PATCH", headers: { authorization: `Bearer ${token}` }, json: obj });
    return "updated";
  } catch (err) {
    if ((err as { status?: number }).status === 404) return "missing";
    throw err;
  }
}

/**
 * Add a message to the customer's pass. TEXT_AND_NOTIFY makes Google show a
 * notification ("Reward ready at Pinecone"). 404 (pass never saved) is fine.
 */
export async function addGoogleMessage(
  config: Config,
  userId: string,
  msg: { id: string; header: string; body: string; notify?: boolean; validDays?: number },
  fetch: Fetch,
  now: Date,
): Promise<"added" | "missing"> {
  const issuerId = config.google.walletIssuerId!;
  const token = await accessToken(config, fetch, now);
  const end = new Date(now.getTime() + (msg.validDays ?? 7) * 86_400_000);
  const body = {
    message: {
      id: msg.id,
      header: msg.header,
      body: msg.body,
      messageType: msg.notify === false ? "TEXT" : "TEXT_AND_NOTIFY",
      displayInterval: { start: { date: now.toISOString() }, end: { date: end.toISOString() } },
    },
  };
  try {
    await requestJson(fetch, `${WALLET_API}/loyaltyObject/${encodeURIComponent(objectIdFor(issuerId, userId))}/addMessage`, { method: "POST", headers: { authorization: `Bearer ${token}` }, json: body });
    return "added";
  } catch (err) {
    if ((err as { status?: number }).status === 404) return "missing";
    throw err;
  }
}
