/**
 * Object storage for merchant uploads (ticket photos). No third-party account is needed to run the product:
 *  - MemoryStorage: tests. Keeps bytes in a map and hands back a fake URL.
 *  - DiskStorage: development and single-host installs. Writes under UPLOADS_DIR (default ./data/uploads) and the API
 *    serves them from GET /v1/public/uploads/:key.
 *
 * Nothing is served from a permanent link. The database stores only the relative path (`/v1/public/uploads/<key>`);
 * every time an upload is shown, `uploadSigner(ctx)` turns it into a short-lived HMAC-signed URL
 * (`?exp=<unix seconds>&sig=<hmac>`, UPLOAD_URL_TTL_SECONDS) that the serving route verifies for signature and expiry.
 * Production uses Cloudflare R2 (STORAGE_PROVIDER=r2, providers/storageR2.ts: S3 API, presigned GET with expiry).
 * STORAGE_PROVIDER picks the provider (default: memory in tests, disk elsewhere); another store plugs in by passing
 * `providers.storage` to createProviders and implementing `signedUrl`; the callers do not change. Use
 * `getStorage(ctx)`; never construct a provider in a route.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { UPLOAD_LINK_MINUTES } from "@ll/shared";
import type { AppContext } from "../context.js";
import { hmacSha256, safeEqual } from "../lib/crypto.js";
import { R2Storage } from "./storageR2.js";

export interface StoredObject {
  url: string;
  key: string;
}

export interface StorageProvider {
  name: string;
  put(args: { merchantId: string; contentType: string; body: Buffer }): Promise<StoredObject>;
  /** Read back an object the provider serves itself (disk and memory). Hosted stores may implement it too (R2 does, for the owner export ZIP). */
  get?(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  /** Remove an object (retention and account deletion). Resolves true when something was removed; a missing object is not an error. */
  delete?(key: string): Promise<boolean>;
  /**
   * A time-limited URL for reading the object. Hosted stores implement this with their own presigned GET. Providers
   * that leave it out (disk, memory) are served by the API route, signed with the API's own HMAC secret.
   */
  signedUrl?(key: string, expiresAt: Date): string;
}

const UPLOAD_KEY = /([0-9a-f-]{36}\/[0-9a-f]{32}\.[a-z]+)(?:[?#].*)?$/;
/** The storage key inside a stored upload URL (relative path, our own origin or a hosted store's URL), or null when it is not one of ours. */
export function storageKeyFromUrl(url: string): string | null {
  return UPLOAD_KEY.exec(url)?.[1] ?? null;
}

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** First bytes of the file must look like the type it claims: a renamed script is not an image. */
export function sniffImage(body: Buffer): string | null {
  if (body.length < 12) return null;
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (body.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = body.subarray(8, 12).toString("ascii");
    if (/^(heic|heix|hevc|mif1|msf1)/.test(brand)) return "image/heic";
    if (brand.startsWith("heif")) return "image/heif";
  }
  return null;
}

/** Path (no origin) at which the API serves an upload. Stored values use this form so they survive a change of API host or port. */
export const UPLOAD_PATH = "/v1/public/uploads/";

/**
 * Store form: our own origin and any signature (`?exp=&sig=`) are dropped from an upload URL, leaving the permanent
 * relative path; anything else (a link the shop pasted) is kept as given.
 */
export function toStoredUploadUrl(url: string, publicApiUrl: string): string {
  const base = publicApiUrl.replace(/\/+$/, "");
  const path = url.startsWith(UPLOAD_PATH) ? url : url.startsWith(`${base}${UPLOAD_PATH}`) ? url.slice(base.length) : null;
  if (path === null) return url;
  const key = storageKeyFromUrl(path);
  return key ? `${UPLOAD_PATH}${key}` : path;
}

/** How long a signed photo link works. Links are made fresh each time a photo is shown, so this only has to outlive a page view. */
export const UPLOAD_URL_TTL_SECONDS = UPLOAD_LINK_MINUTES * 60;

const uploadSignature = (secret: string, key: string, exp: number) => hmacSha256(secret, `upload:${key}:${exp}`);

/** A signed, expiring URL on the API's public origin for one stored object. */
export function signUploadUrl(secret: string, publicApiUrl: string, key: string, expiresAt: Date): string {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  return `${publicApiUrl.replace(/\/+$/, "")}${UPLOAD_PATH}${key}?exp=${exp}&sig=${uploadSignature(secret, key, exp)}`;
}

/** Checks the `exp` and `sig` query values of an upload request. Signature first, so an expired but forged link reads as invalid. */
export function checkUploadSignature(secret: string, key: string, exp: unknown, sig: unknown, now: Date): "ok" | "invalid" | "expired" {
  if (typeof exp !== "string" || typeof sig !== "string" || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return "invalid";
  if (!safeEqual(sig, uploadSignature(secret, key, Number(exp)))) return "invalid";
  return now.getTime() >= Number(exp) * 1000 ? "expired" : "ok";
}

export type UploadSigner = (stored: string) => string;

/**
 * Read-time resolver for a stored upload value. One of ours (a relative upload path, or any URL carrying our key
 * shape) becomes a signed URL that expires `ttlSeconds` from now; anything else (a link the shop pasted, an
 * unsigned legacy URL on a hosted store) is returned unchanged.
 */
export function uploadSigner(ctx: AppContext, ttlSeconds = UPLOAD_URL_TTL_SECONDS): UploadSigner {
  const expiresAt = new Date(ctx.now().getTime() + ttlSeconds * 1000);
  const provider = getStorage(ctx);
  return (stored) => {
    const key = storageKeyFromUrl(stored);
    if (!key) return stored;
    if (provider.signedUrl) return provider.signedUrl(key, expiresAt);
    return stored.startsWith(UPLOAD_PATH) || stored.startsWith(ctx.config.publicApiUrl.replace(/\/+$/, "")) ? signUploadUrl(ctx.config.jwtSecret, ctx.config.publicApiUrl, key, expiresAt) : stored;
  };
}

export function newKey(merchantId: string, contentType: string): string {
  return `${merchantId}/${randomBytes(16).toString("hex")}.${IMAGE_TYPES[contentType] ?? "bin"}`;
}

export class MemoryStorage implements StorageProvider {
  name = "memory";
  objects = new Map<string, { body: Buffer; contentType: string }>();
  constructor(private baseUrl = "https://uploads.test") {}
  async put({ merchantId, contentType, body }: { merchantId: string; contentType: string; body: Buffer }): Promise<StoredObject> {
    const key = newKey(merchantId, contentType);
    this.objects.set(key, { body, contentType });
    return { key, url: `${this.baseUrl}/${key}` };
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string) {
    return this.objects.delete(key);
  }
}

export class DiskStorage implements StorageProvider {
  name = "disk";
  constructor(private dir: string, private publicApiUrl: string) {}
  async put({ merchantId, contentType, body }: { merchantId: string; contentType: string; body: Buffer }): Promise<StoredObject> {
    const key = newKey(merchantId, contentType);
    const path = join(this.dir, key);
    await mkdir(join(this.dir, merchantId), { recursive: true });
    await writeFile(path, body);
    return { key, url: `${this.publicApiUrl.replace(/\/+$/, "")}/v1/public/uploads/${key}` };
  }
  async get(key: string) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f]{32}\.(jpg|png|webp|heic|heif)$/.test(key)) return null;
    const ext = key.split(".").pop()!;
    const contentType = Object.entries(IMAGE_TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    try {
      return { body: await readFile(join(this.dir, key)), contentType };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f]{32}\.(jpg|png|webp|heic|heif)$/.test(key)) return false;
    try {
      await unlink(join(this.dir, key));
      return true;
    } catch {
      return false;
    }
  }
}

const fallback = new WeakMap<object, StorageProvider>();

/** The provider STORAGE_PROVIDER names for this config (config.ts has already checked the R2 settings). */
export function createStorage(config: AppContext["config"], now: () => Date = () => new Date()): StorageProvider {
  switch (config.storage.provider) {
    case "r2":
      return new R2Storage({ ...config.storage.r2!, now });
    case "memory":
      return new MemoryStorage();
    default:
      return new DiskStorage(process.env.UPLOADS_DIR ?? join(process.cwd(), "data", "uploads"), config.publicApiUrl);
  }
}

export function getStorage(ctx: AppContext): StorageProvider {
  if (ctx.providers.storage) return ctx.providers.storage;
  let s = fallback.get(ctx.config);
  if (!s) {
    s = createStorage(ctx.config, () => ctx.now());
    fallback.set(ctx.config, s);
  }
  return s;
}
