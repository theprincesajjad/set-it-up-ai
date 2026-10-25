/**
 * Cloudflare R2 object storage over its S3-compatible API (STORAGE_PROVIDER=r2). Plugs into providers/storage.ts:
 *  - put / get / delete are server-side requests signed with SigV4 (lib/sigv4.ts);
 *  - signedUrl is a presigned GET that expires at the time the caller asks (uploadSigner: UPLOAD_LINK_MINUTES), so
 *    nothing is served from a permanent link, same as the disk provider. The bucket stays private.
 * No SDK: three verbs and a signature are less code than the dependency (about 2 MB of @aws-sdk/client-s3 plus its
 * middleware stack) and it keeps the API image small. `fetch` and the clock are injectable so tests run with no network.
 * Setup, CORS and lifecycle rules: docs/engineering/storage-go-live.md.
 */
import type { StorageProvider, StoredObject } from "./storage.js";
import { IMAGE_TYPES, newKey } from "./storage.js";
import { encodePath, presignUrl, sha256Hex, signHeaders, type SigV4Credentials } from "../lib/sigv4.js";

export interface R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Override the S3 endpoint: a jurisdiction endpoint (`https://<account>.eu.r2.cloudflarestorage.com`) or a local fake. */
  endpoint?: string;
  /** Public custom domain of the bucket. Only used for the URL `put` returns; presigned links never use it (R2 presigns only on the S3 endpoint). */
  publicBase?: string;
  /** Lifetime of the URL `put` returns when there is no publicBase. */
  putUrlTtlSeconds?: number;
  now?: () => Date;
  fetch?: typeof fetch;
}

export class R2Storage implements StorageProvider {
  name = "r2";
  private creds: SigV4Credentials;
  private url: URL;
  private now: () => Date;
  private doFetch: typeof fetch;
  constructor(private o: R2Options) {
    if (!o.accountId || !o.accessKeyId || !o.secretAccessKey || !o.bucket) throw new Error("R2 storage needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET");
    this.creds = { accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey, region: "auto", service: "s3" };
    this.url = new URL(o.endpoint ?? `https://${o.accountId}.r2.cloudflarestorage.com`);
    this.now = o.now ?? (() => new Date());
    this.doFetch = o.fetch ?? fetch;
  }

  /** Path-style: `/<bucket>/<key>`. R2 also supports bucket subdomains only on custom domains, which cannot be presigned. */
  private path(key: string) {
    return `/${encodePath(this.o.bucket)}/${encodePath(key)}`;
  }

  private async send(method: "PUT" | "GET" | "HEAD" | "DELETE", key: string, body?: Buffer, headers: Record<string, string> = {}) {
    const path = this.path(key);
    const signed = signHeaders(this.creds, { method, host: this.url.host, path, now: this.now(), payloadHash: sha256Hex(body ?? ""), headers });
    return this.doFetch(`${this.url.origin}${path}`, { method, headers: signed, body: body ? new Uint8Array(body) : undefined });
  }

  async put({ merchantId, contentType, body }: { merchantId: string; contentType: string; body: Buffer }): Promise<StoredObject> {
    const key = newKey(merchantId, contentType);
    const res = await this.send("PUT", key, body, { "content-type": contentType in IMAGE_TYPES ? contentType : "application/octet-stream" });
    if (!res.ok) throw new Error(`R2 put failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const base = this.o.publicBase?.replace(/\/+$/, "");
    return { key, url: base ? `${base}/${key}` : this.signedUrl(key, new Date(this.now().getTime() + (this.o.putUrlTtlSeconds ?? 900) * 1000)) };
  }

  async get(key: string) {
    const res = await this.send("GET", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 get failed (${res.status})`);
    return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }

  /** S3 answers DELETE 204 whether or not the object existed, so look first to report whether something was removed. */
  async delete(key: string) {
    const head = await this.send("HEAD", key);
    if (head.status === 404) return false;
    if (!head.ok) throw new Error(`R2 head failed (${head.status})`);
    const res = await this.send("DELETE", key);
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status})`);
    return true;
  }

  signedUrl(key: string, expiresAt: Date): string {
    const now = this.now();
    return presignUrl(this.creds, { method: "GET", host: this.url.host, path: this.path(key), now, expiresInSeconds: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000), protocol: this.url.protocol === "http:" ? "http" : "https" });
  }
}
