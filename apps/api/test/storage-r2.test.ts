/**
 * R2 storage provider against a local S3-compatible fake (node:http, no network). The fake checks every request the
 * way R2 does: it recomputes the SigV4 signature (header form for put/get/head/delete, query form for presigned GET),
 * refuses an expired link, and keeps objects in a map.
 */
import { createHash, createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createStorage, DiskStorage, MemoryStorage, storageKeyFromUrl } from "../src/providers/storage.js";
import { R2Storage } from "../src/providers/storageR2.js";

const ACCESS = "AKIATESTTESTTESTTEST";
const SECRET = "test-secret-key-for-the-fake";
const BUCKET = "ll-uploads";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("pixels")]);

let server: Server;
let endpoint: string;
let clock = new Date("2026-11-03T15:00:00Z");
const objects = new Map<string, { body: Buffer; contentType: string }>();
const seen: { method: string; path: string }[] = [];

const h = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const enc = (s: string) => encodeURIComponent(s);

/** What the signature should be for these canonical parts. */
function expectedSignature(method: string, path: string, query: [string, string][], headers: string[], req: IncomingMessage, payloadHash: string, stamp: string) {
  const date = stamp.slice(0, 8);
  const canonical = [
    method,
    path,
    query.map(([k, v]) => [enc(k), enc(v)] as const).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&"),
    headers.map((n) => `${n}:${n === "host" ? req.headers.host : req.headers[n]}\n`).join(""),
    headers.join(";"),
    payloadHash,
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, `${date}/auto/s3/aws4_request`, sha(canonical)].join("\n");
  return createHmac("sha256", h(h(h(h(`AWS4${SECRET}`, date), "auto"), "s3"), "aws4_request")).update(toSign).digest("hex");
}

function deny(res: ServerResponse, status: number, code: string) {
  res.writeHead(status, { "content-type": "application/xml" }).end(`<Error><Code>${code}</Code></Error>`);
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url!, "http://x");
      const method = req.method!;
      seen.push({ method, path: url.pathname });
      const body = Buffer.concat(chunks);
      const [, bucket, ...rest] = url.pathname.split("/");
      const key = rest.join("/");
      if (bucket !== BUCKET) return deny(res, 404, "NoSuchBucket");
      const q = url.searchParams;
      if (q.has("X-Amz-Signature")) {
        // presigned: only GET, signed with `host`, not expired
        const stamp = q.get("X-Amz-Date")!;
        const age = (clock.getTime() - Date.parse(stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"))) / 1000;
        const query = [...q.entries()].filter(([k]) => k !== "X-Amz-Signature");
        const sig = expectedSignature(method, url.pathname, query, ["host"], req, "UNSIGNED-PAYLOAD", stamp);
        if (sig !== q.get("X-Amz-Signature")) return deny(res, 403, "SignatureDoesNotMatch");
        if (age > Number(q.get("X-Amz-Expires"))) return deny(res, 403, "AccessDenied");
      } else {
        const auth = req.headers.authorization ?? "";
        const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/auto\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(auth);
        if (!m || m[1] !== ACCESS) return deny(res, 403, "InvalidAccessKeyId");
        const payloadHash = String(req.headers["x-amz-content-sha256"]);
        if (payloadHash !== sha(body)) return deny(res, 400, "XAmzContentSHA256Mismatch");
        const sig = expectedSignature(method, url.pathname, [...q.entries()], m[3]!.split(";"), req, payloadHash, String(req.headers["x-amz-date"]));
        if (sig !== m[4]) return deny(res, 403, "SignatureDoesNotMatch");
      }
      const obj = objects.get(key);
      if (method === "PUT") {
        objects.set(key, { body, contentType: String(req.headers["content-type"] ?? "") });
        return void res.writeHead(200, { etag: '"x"' }).end();
      }
      if (method === "DELETE") {
        objects.delete(key);
        return void res.writeHead(204).end();
      }
      if (!obj) return deny(res, 404, "NoSuchKey");
      res.writeHead(200, { "content-type": obj.contentType, "content-length": obj.body.length });
      res.end(method === "HEAD" ? undefined : obj.body);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const make = (extra: Partial<ConstructorParameters<typeof R2Storage>[0]> = {}) =>
  new R2Storage({ accountId: "acct", accessKeyId: ACCESS, secretAccessKey: SECRET, bucket: BUCKET, endpoint, now: () => clock, ...extra });

describe("R2Storage against a local S3 fake", () => {
  it("put stores the bytes under a merchant-prefixed key with a signed request", async () => {
    const r2 = make();
    const merchantId = "00000000-0000-0000-0000-000000000001";
    const out = await r2.put({ merchantId, contentType: "image/png", body: PNG });
    expect(out.key).toMatch(new RegExp(`^${merchantId}/[0-9a-f]{32}\\.png$`));
    expect(storageKeyFromUrl(out.url)).toBe(out.key);
    expect(objects.get(out.key)).toMatchObject({ contentType: "image/png" });
    expect(objects.get(out.key)!.body.equals(PNG)).toBe(true);
  });

  it("get reads it back; a missing key is null", async () => {
    const r2 = make();
    const { key } = await r2.put({ merchantId: "00000000-0000-0000-0000-000000000002", contentType: "image/png", body: PNG });
    const got = await r2.get(key);
    expect(got?.contentType).toBe("image/png");
    expect(got?.body.equals(PNG)).toBe(true);
    expect(await r2.get("00000000-0000-0000-0000-000000000002/ffffffffffffffffffffffffffffffff.png")).toBeNull();
  });

  it("delete removes the object and reports whether anything was there", async () => {
    const r2 = make();
    const { key } = await r2.put({ merchantId: "00000000-0000-0000-0000-000000000003", contentType: "image/png", body: PNG });
    expect(await r2.delete(key)).toBe(true);
    expect(objects.has(key)).toBe(false);
    expect(await r2.delete(key)).toBe(false);
  });

  it("presigned GET opens with no credentials until it expires, and only for its own key", async () => {
    const r2 = make();
    const { key } = await r2.put({ merchantId: "00000000-0000-0000-0000-000000000004", contentType: "image/png", body: PNG });
    const url = r2.signedUrl(key, new Date(clock.getTime() + 15 * 60_000));
    const q = new URL(url).searchParams;
    expect(q.get("X-Amz-Expires")).toBe("900");
    expect(q.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url).not.toContain(SECRET);
    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer()).equals(PNG)).toBe(true);
    // tampered key or expiry: refused
    expect((await fetch(url.replace(key.split("/")[1]!, "0".repeat(32) + ".png"))).status).toBe(403);
    expect((await fetch(url.replace("X-Amz-Expires=900", "X-Amz-Expires=9000"))).status).toBe(403);
    // after expiry: refused
    const before = clock;
    clock = new Date(clock.getTime() + 16 * 60_000);
    expect((await fetch(url)).status).toBe(403);
    clock = before;
  });

  it("a wrong secret is refused by the store and surfaces as an error", async () => {
    const bad = make({ secretAccessKey: "nope" });
    await expect(bad.put({ merchantId: "00000000-0000-0000-0000-000000000005", contentType: "image/png", body: PNG })).rejects.toThrow(/R2 put failed \(403\)/);
  });

  it("put returns the public URL when R2_PUBLIC_BASE is set, otherwise a presigned one", async () => {
    const pub = await make({ publicBase: "https://files.example.test/" }).put({ merchantId: "00000000-0000-0000-0000-000000000006", contentType: "image/png", body: PNG });
    expect(pub.url).toBe(`https://files.example.test/${pub.key}`);
    const priv = await make().put({ merchantId: "00000000-0000-0000-0000-000000000006", contentType: "image/png", body: PNG });
    expect(priv.url).toContain("X-Amz-Signature=");
  });

  it("refuses to build without credentials", () => {
    expect(() => new R2Storage({ accountId: "", accessKeyId: "", secretAccessKey: "", bucket: "" })).toThrow(/R2_ACCOUNT_ID/);
  });

  it("defaults to the real R2 host for the account", () => {
    const url = new R2Storage({ accountId: "abc123", accessKeyId: ACCESS, secretAccessKey: SECRET, bucket: BUCKET, now: () => clock }).signedUrl("k/f.png", new Date(clock.getTime() + 60_000));
    expect(url.startsWith(`https://abc123.r2.cloudflarestorage.com/${BUCKET}/k/f.png?`)).toBe(true);
  });
});

describe("STORAGE_PROVIDER config", () => {
  const r2Env = { R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "d" };
  it("defaults to memory in tests and disk in development", () => {
    expect(createStorage(loadConfig({ NODE_ENV: "test" }))).toBeInstanceOf(MemoryStorage);
    expect(createStorage(loadConfig({ NODE_ENV: "development" }))).toBeInstanceOf(DiskStorage);
  });
  it("builds R2 when asked, and says which variable is missing", () => {
    const cfg = loadConfig({ NODE_ENV: "test", STORAGE_PROVIDER: "r2", ...r2Env, R2_PUBLIC_BASE: "https://f.test" });
    expect(cfg.storage.r2).toMatchObject({ accountId: "a", bucket: "d", publicBase: "https://f.test" });
    expect(createStorage(cfg)).toBeInstanceOf(R2Storage);
    expect(() => loadConfig({ NODE_ENV: "test", STORAGE_PROVIDER: "r2", R2_ACCOUNT_ID: "a" })).toThrow(/R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET/);
  });
  it("rejects unknown values and memory in production", () => {
    expect(() => loadConfig({ NODE_ENV: "test", STORAGE_PROVIDER: "s3" })).toThrow(/STORAGE_PROVIDER/);
    expect(() => loadConfig({ NODE_ENV: "production", STORAGE_PROVIDER: "memory", JWT_SECRET: "x", ENCRYPTION_KEY: "0".repeat(64) })).toThrow(/memory/);
  });
});
