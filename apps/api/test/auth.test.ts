import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantStaff, otpCodes, sessions, users } from "@ll/db";
import { createMerchant, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, token?: string) =>
  env.app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

async function phoneLogin(phone: string, name?: string) {
  const start = await call("POST", "/v1/auth/otp/start", { phone });
  expect(start.statusCode).toBe(200);
  const res = await call("POST", "/v1/auth/otp/verify", { phone, code: start.json().devCode, name });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe("phone OTP", () => {
  it("sends a hashed 6-digit code and signs the customer in, creating the account once", async () => {
    const phone = "416-555-0101";
    const start = await call("POST", "/v1/auth/otp/start", { phone });
    expect(start.statusCode).toBe(200);
    const { devCode, expiresInSeconds } = start.json();
    expect(devCode).toMatch(/^\d{6}$/);
    expect(expiresInSeconds).toBe(600);
    const sms = env.ctx.providers.outbox.sms.at(-1)!;
    expect(sms.to).toBe("+14165550101");
    expect(sms.body).toContain(devCode);
    const [row] = await env.db.select().from(otpCodes);
    expect(row!.codeHash).not.toContain(devCode);
    expect(row!.codeHash).toHaveLength(64);

    const res = await call("POST", "/v1/auth/otp/verify", { phone, code: devCode, name: "Sam Lee" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.created).toBe(true);
    expect(body.user).toMatchObject({ phone: "+14165550101", name: "Sam Lee", phoneVerified: true, platformRole: "none" });
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const again = await phoneLogin(phone);
    expect(again.created).toBe(false);
    expect(again.user.id).toBe(body.user.id);

    const me = await call("GET", "/v1/auth/me", undefined, body.accessToken);
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ platformRole: "none", merchants: [], user: { id: body.user.id } });
  });

  it("rejects invalid phone numbers", async () => {
    const res = await call("POST", "/v1/auth/otp/start", { phone: "12345678" });
    expect(res.statusCode).toBe(400);
  });

  it("locks a code after 5 wrong attempts", async () => {
    const phone = nextPhone();
    const { devCode } = (await call("POST", "/v1/auth/otp/start", { phone })).json();
    const wrong = devCode === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 4; i++) {
      const r = await call("POST", "/v1/auth/otp/verify", { phone, code: wrong });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatchObject({ code: "invalid_code", details: { attemptsLeft: 5 - i } });
    }
    const fifth = await call("POST", "/v1/auth/otp/verify", { phone, code: wrong });
    expect(fifth.statusCode).toBe(429);
    const right = await call("POST", "/v1/auth/otp/verify", { phone, code: devCode });
    expect(right.statusCode).toBe(400);
  });

  it("expires codes after 10 minutes and only the newest code works", async () => {
    const phone = nextPhone();
    const first = (await call("POST", "/v1/auth/otp/start", { phone })).json().devCode;
    const second = (await call("POST", "/v1/auth/otp/start", { phone })).json().devCode;
    if (first !== second) expect((await call("POST", "/v1/auth/otp/verify", { phone, code: first })).statusCode).toBe(400);
    env.clock.now = new Date(env.clock.now.getTime() + 11 * 60_000);
    const late = await call("POST", "/v1/auth/otp/verify", { phone, code: second });
    expect(late.statusCode).toBe(400);
    expect(late.json().error.code).toBe("invalid_code");
  });

  it("rate-limits to 5 codes per phone per hour", async () => {
    const phone = nextPhone();
    for (let i = 0; i < 5; i++) expect((await call("POST", "/v1/auth/otp/start", { phone })).statusCode).toBe(200);
    const sixth = await call("POST", "/v1/auth/otp/start", { phone });
    expect(sixth.statusCode).toBe(429);
    expect((await call("POST", "/v1/auth/otp/start", { phone: nextPhone() })).statusCode).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 61 * 60_000);
    expect((await call("POST", "/v1/auth/otp/start", { phone })).statusCode).toBe(200);
  });

  it("never returns devCode in production", async () => {
    env.ctx.config.env = "production";
    const phone = nextPhone();
    const start = await call("POST", "/v1/auth/otp/start", { phone });
    expect(start.statusCode).toBe(200);
    expect(start.json().devCode).toBeUndefined();
    const code = env.ctx.providers.outbox.sms.at(-1)!.body.match(/\d{6}/)![0];
    expect((await call("POST", "/v1/auth/otp/verify", { phone, code })).statusCode).toBe(200);
  });
});

describe("email + password", () => {
  it("registers, logs in case-insensitively, refuses duplicates and wrong passwords", async () => {
    const reg = await call("POST", "/v1/auth/register", { email: "Owner@Cafe.ca", password: "correct horse", name: "Ana" });
    expect(reg.statusCode).toBe(201);
    expect(reg.json().user).toMatchObject({ email: "owner@cafe.ca", name: "Ana", emailVerified: false });
    const [u] = await env.db.select().from(users).where(eq(users.id, reg.json().user.id));
    expect(u!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(u!.memberCode).toHaveLength(8);

    expect((await call("POST", "/v1/auth/register", { email: "owner@cafe.ca", password: "another pass", name: "B" })).statusCode).toBe(409);
    expect((await call("POST", "/v1/auth/register", { email: "x@cafe.ca", password: "short", name: "B" })).statusCode).toBe(400);
    const ok = await call("POST", "/v1/auth/login", { email: "OWNER@cafe.ca", password: "correct horse" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.id).toBe(reg.json().user.id);
    expect((await call("POST", "/v1/auth/login", { email: "owner@cafe.ca", password: "wrong pass" })).statusCode).toBe(401);
    expect((await call("POST", "/v1/auth/login", { email: "nobody@cafe.ca", password: "whatever1" })).statusCode).toBe(401);
  });

  it("signs in by email code and marks the email verified", async () => {
    await call("POST", "/v1/auth/register", { email: "rep@ll.ca", password: "password123", name: "Rep" });
    const start = await call("POST", "/v1/auth/email-otp/start", { email: "Rep@LL.ca" });
    expect(start.statusCode).toBe(200);
    const mail = env.ctx.providers.outbox.email.at(-1)!;
    expect(mail.to).toBe("rep@ll.ca");
    expect(mail.text).toContain(start.json().devCode);
    const res = await call("POST", "/v1/auth/email-otp/verify", { email: "rep@ll.ca", code: start.json().devCode });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: false, user: { email: "rep@ll.ca", emailVerified: true } });
    // A wrong code against the email flow counts attempts too.
    const s2 = await call("POST", "/v1/auth/email-otp/start", { email: "new@ll.ca" });
    const bad = await call("POST", "/v1/auth/email-otp/verify", { email: "new@ll.ca", code: s2.json().devCode === "123456" ? "654321" : "123456" });
    expect(bad.statusCode).toBe(400);
    const created = await call("POST", "/v1/auth/email-otp/verify", { email: "new@ll.ca", code: s2.json().devCode, name: "New" });
    expect(created.json()).toMatchObject({ created: true, user: { email: "new@ll.ca", name: "New" } });
  });
});

describe("refresh sessions", () => {
  it("rotates refresh tokens, detects reuse, and logs out", async () => {
    const login = await phoneLogin(nextPhone());
    const r1 = await call("POST", "/v1/auth/refresh", { refreshToken: login.refreshToken });
    expect(r1.statusCode).toBe(200);
    const t2 = r1.json().refreshToken;
    expect(t2).not.toBe(login.refreshToken);
    const stored = await env.db.select().from(sessions);
    expect(stored.every((s) => s.refreshTokenHash !== t2)).toBe(true);

    // Replaying the rotated token kills every session.
    expect((await call("POST", "/v1/auth/refresh", { refreshToken: login.refreshToken })).statusCode).toBe(401);
    expect((await call("POST", "/v1/auth/refresh", { refreshToken: t2 })).statusCode).toBe(401);

    const fresh = await phoneLogin(login.user.phone);
    expect((await call("POST", "/v1/auth/logout", { refreshToken: fresh.refreshToken })).statusCode).toBe(200);
    expect((await call("POST", "/v1/auth/refresh", { refreshToken: fresh.refreshToken })).statusCode).toBe(401);
  });

  it("expires refresh tokens after 90 days", async () => {
    const login = await phoneLogin(nextPhone());
    env.clock.now = new Date(env.clock.now.getTime() + 91 * 86400_000);
    expect((await call("POST", "/v1/auth/refresh", { refreshToken: login.refreshToken })).statusCode).toBe(401);
  });

  it("requires a token for /auth/me", async () => {
    expect((await call("GET", "/v1/auth/me")).statusCode).toBe(401);
    expect((await call("GET", "/v1/auth/me", undefined, "garbage")).statusCode).toBe(401);
  });
});

describe("/auth/me memberships and staff PINs", () => {
  it("lists merchant memberships with roles", async () => {
    const { merchant, owner, ownerToken } = await createMerchant(env);
    const me = await call("GET", "/v1/auth/me", undefined, ownerToken);
    expect(me.json().merchants).toEqual([
      { merchantId: merchant.id, name: "Test Shop", slug: merchant.slug, role: "owner", status: "active", logoUrl: null, hasPin: false, locale: "en", station: null },
    ]);
    expect(me.json().user.id).toBe(owner.id);
  });

  it("switches staff on a shared counter device by PIN, with lockout", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const barista = await createUser(env.db, { name: "Jo Barista" });
    await env.db.insert(merchantStaff).values({ merchantId: merchant.id, userId: barista.id, role: "staff" });
    const baristaToken = await tokenFor(env, barista);

    expect((await call("PUT", `/v1/merchants/${merchant.id}/staff-pin`, { pin: "4821" }, baristaToken)).statusCode).toBe(200);
    expect((await call("PUT", `/v1/merchants/${merchant.id}/staff-pin`, { pin: "4821" }, ownerToken)).statusCode).toBe(409);
    expect((await call("PUT", `/v1/merchants/${merchant.id}/staff-pin`, { pin: "12" }, ownerToken)).statusCode).toBe(400);

    // The counter tablet is signed in as the owner; the barista taps in with their PIN.
    const ok = await call("POST", `/v1/merchants/${merchant.id}/staff-pin/verify`, { pin: "4821" }, ownerToken);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().staff).toEqual({ userId: barista.id, name: "Jo Barista", role: "staff" });
    const me = await call("GET", "/v1/auth/me", undefined, ok.json().accessToken);
    expect(me.json().user.id).toBe(barista.id);
    expect(me.json().merchants[0].hasPin).toBe(true);
    const byUser = await call("POST", `/v1/merchants/${merchant.id}/staff-pin/verify`, { pin: "4821", userId: barista.id }, ownerToken);
    expect(byUser.statusCode).toBe(200);

    for (let i = 0; i < 5; i++) {
      const bad = await call("POST", `/v1/merchants/${merchant.id}/staff-pin/verify`, { pin: "0000" }, ownerToken);
      expect(bad.statusCode).toBe(401);
      expect(bad.json().error.code).toBe("invalid_pin");
    }
    expect((await call("POST", `/v1/merchants/${merchant.id}/staff-pin/verify`, { pin: "4821" }, ownerToken)).statusCode).toBe(429);
    env.clock.now = new Date(env.clock.now.getTime() + 16 * 60_000);
    expect((await call("POST", `/v1/merchants/${merchant.id}/staff-pin/verify`, { pin: "4821" }, ownerToken)).statusCode).toBe(200);
  });

  it("never lets another merchant's staff or a customer use a PIN", async () => {
    const a = await createMerchant(env);
    const b = await createMerchant(env);
    await call("PUT", `/v1/merchants/${a.merchant.id}/staff-pin`, { pin: "9999" }, a.ownerToken);
    expect((await call("POST", `/v1/merchants/${a.merchant.id}/staff-pin/verify`, { pin: "9999" }, b.ownerToken)).statusCode).toBe(403);
    const customer = await phoneLogin(nextPhone());
    expect((await call("POST", `/v1/merchants/${a.merchant.id}/staff-pin/verify`, { pin: "9999" }, customer.accessToken)).statusCode).toBe(403);
    expect((await call("POST", `/v1/merchants/${a.merchant.id}/staff-pin/verify`, { pin: "9999" })).statusCode).toBe(401);
    expect((await call("POST", `/v1/merchants/not-a-uuid/staff-pin/verify`, { pin: "9999" }, a.ownerToken)).statusCode).toBe(404);
  });
});
