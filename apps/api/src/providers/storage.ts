/**
 * Object storage for merchant uploads (ticket photos). No third-party account is needed to run the product:
 *  - MemoryStorage: tests. Keeps bytes in a map and hands back a fake URL.
 *  - DiskStorage: development and single-host installs. Writes under UPLOADS_DIR (default ./data/uploads) and the API
 *    serves them from GET /v1/public/uploads/:key. Keys are random, so a URL is unguessable but not secret.
 *
 * A production object store (S3, R2, GCS) plugs in by passing `providers.storage` to createProviders; nothing else changes.
 * Use `getStorage(ctx)`; never construct a provider in a route.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppContext } from "../context.js";

export interface StoredObject {
  url: string;
  key: string;
}

export interface StorageProvider {
  name: string;
  put(args: { merchantId: string; contentType: string; body: Buffer }): Promise<StoredObject>;
  /** Read back an object the provider serves itself (disk and memory). Hosted stores return null: their URLs are public. */
  get?(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  /** Remove an object (retention and account deletion). Resolves true when something was removed; a missing object is not an error. */
  delete?(key: string): Promise<boolean>;
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

/** Store form: our own origin is dropped from an upload URL; anything else (a hosted store's CDN URL) is kept as given. */
export function toStoredUploadUrl(url: string, publicApiUrl: string): string {
  const base = publicApiUrl.replace(/\/+$/, "");
  return url.startsWith(`${base}${UPLOAD_PATH}`) ? url.slice(base.length) : url;
}

/** Read form: a stored relative upload path becomes an absolute URL on the API's public origin. */
export function resolveUploadUrl(url: string, publicApiUrl: string): string {
  return url.startsWith(UPLOAD_PATH) ? `${publicApiUrl.replace(/\/+$/, "")}${url}` : url;
}

function newKey(merchantId: string, contentType: string): string {
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

export function getStorage(ctx: AppContext): StorageProvider {
  if (ctx.providers.storage) return ctx.providers.storage;
  let s = fallback.get(ctx.config);
  if (!s) {
    s = ctx.config.env === "test" ? new MemoryStorage() : new DiskStorage(process.env.UPLOADS_DIR ?? join(process.cwd(), "data", "uploads"), ctx.config.publicApiUrl);
    fallback.set(ctx.config, s);
  }
  return s;
}
