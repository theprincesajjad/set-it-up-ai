/**
 * Uploads are served only through short-lived HMAC-signed URLs (providers/storage.ts): repair-ticket photos are stored
 * as a permanent relative path and signed again each time they are read; the serving route refuses a missing, forged,
 * edited or expired signature.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serviceTickets } from "@ll/db";
import { MemoryStorage, UPLOAD_PATH, UPLOAD_URL_TTL_SECONDS, checkUploadSignature, signUploadUrl, storageKeyFromUrl, type StorageProvider } from "../src/providers/storage.js";
import { call, customer, paidMerchant } from "./commerce-fixtures.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
type M = Awaited<ReturnType<typeof paidMerchant>>;
const base = (m: M) => `/v1/merchants/${m.merchant.id}`;
const SECRET = "test-secret";
const KEY = "00000000-0000-0000-0000-000000000001/0123456789abcdef0123456789abcdef.png";

async function upload(m: M, store: StorageProvider = new MemoryStorage()) {
  env.ctx.providers.storage = store;
  const res = await env.app.inject({ method: "POST", url: `${base(m)}/uploads`, headers: { authorization: `Bearer ${m.ownerToken}`, "content-type": "image/png" }, payload: PNG });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.body).url as string;
}
const get = (url: string) => {
  const u = new URL(url);
  return env.app.inject({ method: "GET", url: `${u.pathname}${u.search}` });
};
const withParam = (url: string, k: string, v: string) => {
  const u = new URL(url);
  u.searchParams.set(k, v);
  return u.toString();
};

describe("signing primitives", () => {
  const now = new Date("2026-11-03T15:00:00Z");
  const url = signUploadUrl(SECRET, "http://api.test/", KEY, new Date(now.getTime() + 60_000));
  const q = new URL(url).searchParams;

  it("signs the relative path with an expiry and a 64-hex signature", () => {
    expect(url).toMatch(new RegExp(`^http://api.test${UPLOAD_PATH}${KEY}\\?exp=\\d+&sig=[0-9a-f]{64}$`));
    expect(storageKeyFromUrl(url)).toBe(KEY);
    expect(checkUploadSignature(SECRET, KEY, q.get("exp"), q.get("sig"), now)).toBe("ok");
  });
  it("rejects a wrong secret, another key, an edited expiry and malformed values", () => {
    expect(checkUploadSignature("other", KEY, q.get("exp"), q.get("sig"), now)).toBe("invalid");
    expect(checkUploadSignature(SECRET, KEY.replace("0123", "4567"), q.get("exp"), q.get("sig"), now)).toBe("invalid");
    expect(checkUploadSignature(SECRET, KEY, String(Number(q.get("exp")) + 3600), q.get("sig"), now)).toBe("invalid");
    expect(checkUploadSignature(SECRET, KEY, q.get("exp"), "zz", now)).toBe("invalid");
    expect(checkUploadSignature(SECRET, KEY, undefined, undefined, now)).toBe("invalid");
    expect(checkUploadSignature(SECRET, KEY, "1e9", q.get("sig"), now)).toBe("invalid");
  });
  it("expires exactly at the expiry second", () => {
    expect(checkUploadSignature(SECRET, KEY, q.get("exp"), q.get("sig"), new Date(now.getTime() + 59_999))).toBe("ok");
    expect(checkUploadSignature(SECRET, KEY, q.get("exp"), q.get("sig"), new Date(now.getTime() + 60_000))).toBe("expired");
  });
  it("a forged signature on an expired link reads as invalid, not expired", () => {
    expect(checkUploadSignature(SECRET, KEY, "1", "0".repeat(64), now)).toBe("invalid");
  });
});

describe("serving uploads", () => {
  it("serves a fresh signed URL with private, short caching, and refuses it after it expires", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const url = await upload(m);
    const ok = await get(url);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/png");
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    expect(ok.headers["cache-control"]).toBe(`private, max-age=${UPLOAD_URL_TTL_SECONDS}`);
    expect(ok.rawPayload.equals(PNG)).toBe(true);

    env.clock.now = new Date(env.clock.now.getTime() + (UPLOAD_URL_TTL_SECONDS - 1) * 1000);
    expect((await get(url)).statusCode).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 1000);
    const late = await get(url);
    expect(late.statusCode).toBe(403);
    expect(late.json().error.code).toBe("link_expired");
  });

  it("refuses an unsigned path, a changed signature, a changed expiry and another file's signature", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const a = await upload(m);
    const other = await upload(m, env.ctx.providers.storage);
    const path = new URL(a).pathname;
    const unsigned = await get(`http://x${path}`);
    expect(unsigned.statusCode).toBe(403);
    expect(unsigned.json().error.code).toBe("invalid_link");
    const sig = new URL(a).searchParams.get("sig")!;
    expect((await get(withParam(a, "sig", (sig[0] === "0" ? "1" : "0") + sig.slice(1)))).json().error.code).toBe("invalid_link");
    // pushing the expiry out does not extend a link
    expect((await get(withParam(a, "exp", String(Number(new URL(a).searchParams.get("exp")) + 86_400)))).statusCode).toBe(403);
    // the signature for file B does not open file A
    const otherQ = new URL(other).searchParams;
    expect((await get(`http://x${path}?exp=${otherQ.get("exp")}&sig=${otherQ.get("sig")}`)).statusCode).toBe(403);
    // a validly signed link to a file that is not there is a plain 404
    const missing = signUploadUrl(env.ctx.config.jwtSecret, env.ctx.config.publicApiUrl, `${m.merchant.id}/${"0".repeat(32)}.png`, new Date(env.clock.now.getTime() + 60_000));
    expect((await get(missing)).statusCode).toBe(404);
  });
});

describe("ticket photos resolve at read time", () => {
  it("stores the permanent path, shows a fresh signed URL on every read, and never stores a signature", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const shown = await upload(m);
    const made = await call(env, m.ownerToken, "POST", `${base(m)}/tickets`, { customer: { phone: "(416) 555-0199", name: "Riley" }, locationId: m.location.id, itemKind: "device", itemDetails: { make: "Apple" }, issue: "Cracked screen", photos: [shown, "https://example.com/pasted.jpg"] });
    expect(made.status).toBe(201);
    const id = made.body.ticket.id as string;
    const key = storageKeyFromUrl(shown)!;
    const [row] = await env.db.select().from(serviceTickets).where(eq(serviceTickets.id, id));
    expect(row!.photos).toEqual([`${UPLOAD_PATH}${key}`, "https://example.com/pasted.jpg"]);

    const first = (await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${id}`)).body.ticket.photos as string[];
    expect(first[0]).toMatch(/\?exp=\d+&sig=[0-9a-f]{64}$/);
    expect((await get(first[0]!)).statusCode).toBe(200);
    expect(first[1]).toBe("https://example.com/pasted.jpg"); // a link the shop pasted is not ours to sign

    // 10 minutes later the old link still works and a re-read gives a link with a later expiry
    env.clock.now = new Date(env.clock.now.getTime() + 10 * 60_000);
    m.ownerToken = await tokenFor(env, m.owner);
    const second = (await call(env, m.ownerToken, "GET", `${base(m)}/tickets/${id}`)).body.ticket.photos as string[];
    expect(new URL(second[0]!).searchParams.get("exp")).not.toBe(new URL(first[0]!).searchParams.get("exp"));
    // 20 minutes after the first read the first link is dead, the second is alive
    env.clock.now = new Date(env.clock.now.getTime() + 10 * 60_000);
    expect((await get(first[0]!)).statusCode).toBe(403);
    expect((await get(second[0]!)).statusCode).toBe(200);

    // The staff form sends signed URLs back on a patch: only the path is kept.
    m.ownerToken = await tokenFor(env, m.owner);
    const patched = await call(env, m.ownerToken, "PATCH", `${base(m)}/tickets/${id}`, { photos: second });
    expect(patched.status).toBe(200);
    const [after] = await env.db.select().from(serviceTickets).where(eq(serviceTickets.id, id));
    expect(after!.photos[0]).toBe(`${UPLOAD_PATH}${key}`);
  });

  it("the list and the customer's own view sign too, and another shop's photo cannot be attached", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const other = await paidMerchant(env, { plan: "pro" });
    const mine = await upload(m);
    const theirs = await upload(other, env.ctx.providers.storage);
    const bad = await call(env, m.ownerToken, "POST", `${base(m)}/tickets`, { customer: { phone: "(416) 555-0198", name: "Sam" }, locationId: m.location.id, itemKind: "device", itemDetails: {}, issue: "x", photos: [theirs] });
    expect(bad.status).toBe(400);
    const c = await customer(env);
    const made = await call(env, m.ownerToken, "POST", `${base(m)}/tickets`, { customer: { phone: c.user.phone, name: "Sam" }, locationId: m.location.id, itemKind: "device", itemDetails: {}, issue: "x", photos: [mine] });
    expect(made.status).toBe(201);
    const list = await call(env, m.ownerToken, "GET", `${base(m)}/tickets`);
    expect(list.body.items[0].photos[0]).toMatch(/sig=[0-9a-f]{64}$/);
    const mineView = await call(env, c.token, "GET", "/v1/me/tickets");
    expect(mineView.body.items[0].photos[0]).toMatch(/sig=[0-9a-f]{64}$/);
  });

  it("a hosted store's own presigned URL is used when the provider supplies one, and never stored", async () => {
    const m = await paidMerchant(env, { plan: "pro" });
    const store = Object.assign(new MemoryStorage(), { signedUrl: (key: string, expiresAt: Date) => `https://cdn.test/${key}?X-Expires=${Math.floor(expiresAt.getTime() / 1000)}&X-Sig=abc` });
    const url = await upload(m, store);
    expect(url).toMatch(/^https:\/\/cdn\.test\/.+\?X-Expires=\d+&X-Sig=abc$/);
    const made = await call(env, m.ownerToken, "POST", `${base(m)}/tickets`, { customer: { phone: "(416) 555-0197", name: "Lee" }, locationId: m.location.id, itemKind: "device", itemDetails: {}, issue: "x", photos: [url] });
    const [row] = await env.db.select().from(serviceTickets).where(eq(serviceTickets.id, made.body.ticket.id));
    expect(row!.photos[0]).toBe(`${UPLOAD_PATH}${storageKeyFromUrl(url)}`); // the presigned query is never stored
  });
});
