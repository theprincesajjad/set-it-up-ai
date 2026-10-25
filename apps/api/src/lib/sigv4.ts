/**
 * AWS Signature Version 4 for the S3 API (Cloudflare R2 speaks it with region "auto"). Two uses:
 *  - presignUrl: a query-string signed GET (or any method) that anyone can open until it expires;
 *  - signHeaders: the `Authorization` header for a server-side PUT, HEAD, GET or DELETE.
 * No dependency: it is HMAC-SHA256 over a canonical request (apps/api/test/sigv4.test.ts checks both forms against the
 * worked examples in AWS's own documentation). S3 differs from other AWS services in one way that matters here: the
 * path is encoded once, never twice, and the payload hash may be the literal UNSIGNED-PAYLOAD.
 */
import { createHash, createHmac } from "node:crypto";

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Service name in the credential scope. S3 and R2 use "s3". */
  service?: string;
}

const hex = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
/** RFC 3986 percent-encoding: everything but A-Z a-z 0-9 - _ . ~ (the "/" of a path is kept by the caller). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export const sha256Hex = hex;
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
/** 20130524T000000Z */
export const amzDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Path with each segment encoded once. Keys here are `<uuid>/<hex>.<ext>`, so this is mostly the identity. */
export const encodePath = (path: string) => path.split("/").map(enc).join("/");

function signingKey(c: SigV4Credentials, date: string) {
  return hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, date), c.region), c.service ?? "s3"), "aws4_request");
}
const scope = (c: SigV4Credentials, date: string) => `${date}/${c.region}/${c.service ?? "s3"}/aws4_request`;
const canonicalQuery = (q: Record<string, string>) =>
  Object.entries(q)
    .map(([k, v]) => [enc(k), enc(v)] as const)
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

interface Target {
  method: string;
  /** Host (and port, if not default) exactly as the HTTP client will send it. */
  host: string;
  /** Absolute path, already the way it goes on the wire (see encodePath). */
  path: string;
  query?: Record<string, string>;
}

/** Query-string signed URL (https). `expiresInSeconds` is 1 to 604800 (seven days, the S3 and R2 maximum). */
export function presignUrl(c: SigV4Credentials, t: Target & { now: Date; expiresInSeconds: number; protocol?: "https" | "http" }): string {
  const expires = Math.min(604_800, Math.max(1, Math.floor(t.expiresInSeconds)));
  const stamp = amzDate(t.now);
  const date = stamp.slice(0, 8);
  const query: Record<string, string> = {
    ...t.query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.accessKeyId}/${scope(c, date)}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  const cq = canonicalQuery(query);
  const canonical = [t.method, t.path, cq, `host:${t.host}\n`, "host", UNSIGNED_PAYLOAD].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope(c, date), hex(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c, date)).update(toSign).digest("hex");
  return `${t.protocol ?? "https"}://${t.host}${t.path}?${cq}&X-Amz-Signature=${signature}`;
}

/**
 * Headers for a request signed in the `Authorization` header. `headers` are the extra headers to sign (lower-cased
 * names; `host`, `x-amz-date` and `x-amz-content-sha256` are added). Returns every header to send.
 */
export function signHeaders(c: SigV4Credentials, t: Target & { now: Date; payloadHash: string; headers?: Record<string, string> }): Record<string, string> {
  const stamp = amzDate(t.now);
  const date = stamp.slice(0, 8);
  const all: Record<string, string> = { ...Object.fromEntries(Object.entries(t.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: t.host, "x-amz-content-sha256": t.payloadHash, "x-amz-date": stamp };
  const names = Object.keys(all).sort();
  const signedHeaders = names.join(";");
  const canonical = [t.method, t.path, canonicalQuery(t.query ?? {}), names.map((n) => `${n}:${all[n]}\n`).join(""), signedHeaders, t.payloadHash].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope(c, date), hex(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c, date)).update(toSign).digest("hex");
  const { host: _host, ...send } = all; // fetch sets Host itself
  return { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope(c, date)}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}
