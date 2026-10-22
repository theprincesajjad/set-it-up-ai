/**
 * APNs for Wallet pass updates: an empty JSON push to each registered device
 * token, topic = pass type identifier, over HTTP/2. Devices then call our
 * PassKit web service to fetch the new pass (and show the pass's changeMessage
 * on the lock screen).
 *
 * Auth, in order:
 *  1. Token-based (provider JWT, ES256, signed with the .p8 key from Apple
 *     Developer → Keys): APPLE_APNS_KEY_ID + APPLE_APNS_KEY_P8 + APPLE_TEAM_ID.
 *  2. Certificate-based (TLS client cert = the Pass Type ID certificate):
 *     APPLE_PASS_CERT_PEM + APPLE_PASS_KEY_PEM. Also used as the fallback for any
 *     token that APNs rejects with 403 (e.g. TopicDisallowed / InvalidProviderToken),
 *     because Apple has historically required the pass certificate for pass topics.
 */
import http2 from "node:http2";
import { SignJWT, importPKCS8 } from "jose";
import type { AppContext } from "../context.js";

export interface ApnsResult {
  sent: number;
  failed: number;
  /** Tokens APNs says are no longer valid (410, or 400 BadDeviceToken). */
  invalid: string[];
  /** Per-token outcome (status + APNs reason) for logging/tests. */
  results?: { token: string; status: number; reason?: string; auth: "token" | "cert" }[];
}

export interface ApnsPusher {
  name: string;
  push(tokens: string[], topic: string): Promise<ApnsResult>;
}

export const APNS_HOST = "https://api.push.apple.com";

export const pemFromEnv = (v: string | undefined) => (v ? v.replace(/\\n/g, "\n") : undefined);

export type Http2Connect = (authority: string, options: http2.SecureClientSessionOptions) => http2.ClientHttp2Session;

export type ApnsAuth =
  | { kind: "token"; keyId: string; teamId: string; keyP8: string }
  | { kind: "cert"; certPem: string; keyPem: string; passphrase?: string };

/** Provider authentication token (JWT, ES256). Apple accepts a token for up to 60 min; we refresh after 50. */
export async function apnsProviderToken(auth: { keyId: string; teamId: string; keyP8: string }, now = new Date()): Promise<string> {
  const key = await importPKCS8(auth.keyP8, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: auth.keyId })
    .setIssuer(auth.teamId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .sign(key);
}

const jwtCache = new Map<string, { jwt: string; at: number }>();
async function cachedProviderToken(auth: { keyId: string; teamId: string; keyP8: string }, now: () => Date): Promise<string> {
  const k = `${auth.teamId}:${auth.keyId}`;
  const hit = jwtCache.get(k);
  const t = now().getTime();
  if (hit && t - hit.at < 50 * 60_000) return hit.jwt;
  const jwt = await apnsProviderToken(auth, now());
  jwtCache.set(k, { jwt, at: t });
  return jwt;
}

/** One HTTP/2 session, one POST /3/device/<token> per token, "{}" body. */
async function sendBatch(
  opts: { host: string; connect: Http2Connect; now: () => Date },
  auth: ApnsAuth,
  tokens: string[],
  topic: string,
): Promise<{ token: string; status: number; reason?: string }[]> {
  const out: { token: string; status: number; reason?: string }[] = [];
  if (!tokens.length) return out;
  const tls: http2.SecureClientSessionOptions = auth.kind === "cert" ? { cert: auth.certPem, key: auth.keyPem, passphrase: auth.passphrase } : {};
  const bearer = auth.kind === "token" ? await cachedProviderToken(auth, opts.now) : null;
  const client = opts.connect(opts.host, tls);
  client.on("error", () => {});
  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            let status = 0;
            let body = "";
            const headers: http2.OutgoingHttpHeaders = {
              ":method": "POST",
              ":path": `/3/device/${token}`,
              "apns-topic": topic,
              "content-type": "application/json",
            };
            if (bearer) headers.authorization = `bearer ${bearer}`;
            let req: http2.ClientHttp2Stream;
            try {
              req = client.request(headers);
            } catch {
              out.push({ token, status: 0, reason: "connect_failed" });
              return resolve();
            }
            req.setTimeout(10_000, () => req.close());
            req.setEncoding("utf8");
            req.on("response", (h) => {
              status = Number(h[":status"]);
            });
            req.on("data", (chunk: string) => {
              body += chunk;
            });
            req.on("error", () => {
              /* reported on close */
            });
            req.on("close", () => {
              let reason: string | undefined;
              try {
                reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
              } catch {
                /* ignore */
              }
              out.push({ token, status, reason });
              resolve();
            });
            req.end("{}");
          }),
      ),
    );
  } finally {
    client.close();
  }
  return out;
}

export function http2Apns(opts: { token?: { keyId: string; teamId: string; keyP8: string }; cert?: { certPem: string; keyPem: string; passphrase?: string }; host?: string; connect?: Http2Connect; now?: () => Date }): ApnsPusher {
  const base = { host: opts.host ?? APNS_HOST, connect: opts.connect ?? (http2.connect as Http2Connect), now: opts.now ?? (() => new Date()) };
  return {
    name: opts.token ? "apns-token" : "apns-cert",
    async push(tokens, topic) {
      const res: ApnsResult = { sent: 0, failed: 0, invalid: [], results: [] };
      if (!tokens.length) return res;
      let pending = tokens;
      if (opts.token) {
        const r = await sendBatch(base, { kind: "token", ...opts.token }, pending, topic);
        for (const x of r) res.results!.push({ ...x, auth: "token" });
        // 403 = the provider token isn't accepted for this topic: retry with the pass certificate.
        pending = opts.cert ? r.filter((x) => x.status === 403).map((x) => x.token) : [];
        if (pending.length) res.results = res.results!.filter((x) => !pending.includes(x.token));
      }
      if (opts.cert && pending.length) {
        const r = await sendBatch(base, { kind: "cert", ...opts.cert }, pending, topic);
        for (const x of r) res.results!.push({ ...x, auth: "cert" });
      }
      for (const x of res.results!) {
        if (x.status === 200) res.sent++;
        else {
          res.failed++;
          if (x.status === 410 || (x.status === 400 && (x.reason === "BadDeviceToken" || x.reason === "DeviceTokenNotForTopic"))) res.invalid.push(x.token);
        }
      }
      return res;
    },
  };
}

/** Records pushes (dev/test, or when APNs credentials aren't configured). */
export function consoleApns(log = false): ApnsPusher & { sent: { token: string; topic: string }[] } {
  const sent: { token: string; topic: string }[] = [];
  return {
    name: "console",
    sent,
    async push(tokens, topic) {
      for (const token of tokens) {
        sent.push({ token, topic });
        if (log) console.log(`[apns -> ${token.slice(0, 8)}…] pass update ${topic}`);
      }
      return { sent: tokens.length, failed: 0, invalid: [] };
    },
  };
}

const registry = new WeakMap<AppContext, ApnsPusher>();

export function setApnsPusher(ctx: AppContext, p: ApnsPusher) {
  registry.set(ctx, p);
}

/** Which APNs auth the config enables (for /v1/me/wallet diagnostics and docs). */
export function apnsAuthMode(config: AppContext["config"]): "token+cert" | "token" | "cert" | "none" {
  const a = config.apple;
  const token = !!(a.apnsKeyId && a.apnsKeyP8 && a.teamId);
  const cert = !!(a.certPem && a.keyPem);
  return token && cert ? "token+cert" : token ? "token" : cert ? "cert" : "none";
}

export function apnsFor(ctx: AppContext): ApnsPusher {
  let p = registry.get(ctx);
  if (!p) {
    const a = ctx.config.apple;
    const mode = apnsAuthMode(ctx.config);
    p =
      mode !== "none" && ctx.config.env !== "test"
        ? http2Apns({
            token: a.apnsKeyId && a.apnsKeyP8 && a.teamId ? { keyId: a.apnsKeyId, teamId: a.teamId, keyP8: pemFromEnv(a.apnsKeyP8)! } : undefined,
            cert: a.certPem && a.keyPem ? { certPem: pemFromEnv(a.certPem)!, keyPem: pemFromEnv(a.keyPem)!, passphrase: a.keyPassphrase } : undefined,
            now: ctx.now,
          })
        : consoleApns(ctx.config.env === "development");
    registry.set(ctx, p);
  }
  return p;
}
