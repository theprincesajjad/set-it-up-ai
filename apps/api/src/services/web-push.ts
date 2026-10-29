/**
 * Web Push (the second rung of the reminder ladder, after the app): a customer who booked on the web and tapped "Turn on reminders"
 * gets reminders and shop messages as a browser notification, free, with no app and no text.
 *
 * Standards: VAPID (RFC 8292) for the sender identity, aes128gcm message encryption (RFC 8291, RFC 8188), all with node:crypto.
 * Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url, raw P-256) and VAPID_SUBJECT (mailto: or https:). Without keys
 * a development process makes an in-memory pair, so the PWA can subscribe locally; tests never reach the network (the transport
 * records into `webPushOutbox`). A 404 or 410 from the push service means the subscription is gone and it is deleted.
 */
import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { webPushSubscriptions } from "@ll/db";
import type { inboxApi } from "@ll/shared";
import type { AppContext } from "../context.js";

export interface WebPushPayload {
  title: string;
  body: string;
  /** Where a tap opens (path on the web app, e.g. /me or /shops/<slug>/book/<id>). */
  url?: string;
  tag?: string;
}

interface Keys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

let devKeys: Keys | null = null;

/** The VAPID keys in use, or null when web push is off (production without keys). */
export function vapidKeys(ctx: AppContext): Keys | null {
  const env = process.env;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || "mailto:hello@localloyalty.ca" };
  if (ctx.config.env === "production") return null;
  if (!devKeys) {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    devKeys = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()), subject: "mailto:dev@localloyalty.ca" };
  }
  return devKeys;
}

export function webPushPublicKey(ctx: AppContext): inboxApi.WebPushKeyResponse {
  return { publicKey: vapidKeys(ctx)?.publicKey ?? null };
}

// ---------------------------------------------------------------------------
// Encryption (RFC 8291) and VAPID (RFC 8292)
// ---------------------------------------------------------------------------
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/** Encrypt one payload for one subscription: the aes128gcm body (header + one record). Exported for the unit test. */
export function encryptPayload(plaintext: Buffer, p256dh: string, auth: string, opts: { salt?: Buffer; ecdh?: ReturnType<typeof createECDH> } = {}): Buffer {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const ecdh = opts.ecdh ?? createECDH("prime256v1");
  if (!opts.ecdh) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const salt = opts.salt ?? randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** The VAPID Authorization header for a push service origin. */
export function vapidAuthorization(keys: Keys, endpoint: string, now: Date): string {
  const aud = new URL(endpoint).origin;
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: keys.subject })));
  const pub = fromB64u(keys.publicKey);
  const key = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  const sig = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
export interface WebPushRecord {
  endpoint: string;
  userId: string;
  payload: WebPushPayload;
  at: Date;
}
/** What the test transport recorded (like providers.outbox). */
export const webPushOutbox: WebPushRecord[] = [];

type Transport = (req: { endpoint: string; headers: Record<string, string>; body: Buffer }) => Promise<{ status: number }>;
let transport: Transport | null = null;

/** Tests swap the HTTP call (e.g. to return 410 for an expired subscription). Null restores the default. */
export function setWebPushTransport(t: Transport | null) {
  transport = t;
}

const fetchTransport: Transport = async ({ endpoint, headers, body }) => {
  const r = await fetch(endpoint, { method: "POST", headers, body: new Uint8Array(body) });
  return { status: r.status };
};

export async function hasWebPush(ctx: AppContext, userId: string): Promise<boolean> {
  const [row] = await ctx.db.select({ id: webPushSubscriptions.id }).from(webPushSubscriptions).where(eq(webPushSubscriptions.userId, userId)).limit(1);
  return !!row;
}

/**
 * Send to every browser the person turned reminders on in. Returns how many accepted it (2xx). Never throws.
 */
export async function sendWebPush(ctx: AppContext, userId: string, payload: WebPushPayload): Promise<number> {
  try {
    const keys = vapidKeys(ctx);
    if (!keys) return 0;
    const subs = await ctx.db.select().from(webPushSubscriptions).where(eq(webPushSubscriptions.userId, userId));
    if (!subs.length) return 0;
    const now = ctx.now();
    const send = transport ?? (ctx.config.env === "test" ? null : fetchTransport);
    const plaintext = Buffer.from(JSON.stringify(payload));
    let ok = 0;
    const dead: string[] = [];
    for (const s of subs) {
      if (!send) {
        webPushOutbox.push({ endpoint: s.endpoint, userId, payload, at: now });
        if (webPushOutbox.length > 500) webPushOutbox.shift();
        ok++;
        continue;
      }
      try {
        const body = encryptPayload(plaintext, s.keys.p256dh, s.keys.auth);
        const r = await send({ endpoint: s.endpoint, headers: { "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: "86400", urgency: "normal", authorization: vapidAuthorization(keys, s.endpoint, now) }, body });
        if (r.status >= 200 && r.status < 300) ok++;
        else if (r.status === 404 || r.status === 410) dead.push(s.id);
      } catch (err) {
        if (ctx.config.env !== "test") console.error("[web-push] send failed", err);
      }
    }
    if (dead.length) await ctx.db.delete(webPushSubscriptions).where(inArray(webPushSubscriptions.id, dead));
    if (ok) await ctx.db.update(webPushSubscriptions).set({ lastSuccessAt: now }).where(eq(webPushSubscriptions.userId, userId));
    return ok;
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[web-push]", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Subscriptions (customer routes)
// ---------------------------------------------------------------------------
export async function subscribeWebPush(ctx: AppContext, userId: string, body: inboxApi.WebPushSubscribeBody): Promise<inboxApi.WebPushStatusResponse> {
  await ctx.db
    .insert(webPushSubscriptions)
    .values({ userId, endpoint: body.endpoint, keys: body.keys, userAgent: body.userAgent ?? null })
    .onConflictDoUpdate({ target: webPushSubscriptions.endpoint, set: { userId, keys: body.keys, userAgent: body.userAgent ?? null } });
  return webPushStatus(ctx, userId);
}

export async function unsubscribeWebPush(ctx: AppContext, userId: string, endpoint: string): Promise<inboxApi.WebPushStatusResponse> {
  await ctx.db.delete(webPushSubscriptions).where(and(eq(webPushSubscriptions.userId, userId), eq(webPushSubscriptions.endpoint, endpoint)));
  return webPushStatus(ctx, userId);
}

export async function webPushStatus(ctx: AppContext, userId: string): Promise<inboxApi.WebPushStatusResponse> {
  const rows = await ctx.db.select({ id: webPushSubscriptions.id }).from(webPushSubscriptions).where(eq(webPushSubscriptions.userId, userId));
  return { subscribed: rows.length > 0, devices: rows.length };
}
