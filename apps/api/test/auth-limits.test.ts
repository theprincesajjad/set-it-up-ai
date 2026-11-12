/**
 * Sign-in throttles and session lifecycle (API-06, API-07, SEC-04, SEC-08). The rules and numbers: src/lib/auth-limits.ts.
 * The point of every case: a throttle must not let a stranger lock a real person out, and an account made with register must not be
 * kept by whoever made it once the real owner proves the email.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, sessions, users } from "@ll/db";
import { setAuthLimits } from "../src/lib/auth-limits.js";
import { createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown, token?: string, ip?: string) =>
  env.app.inject({ method, url, payload: payload as object, remoteAddress: ip, headers: token ? { authorization: `Bearer ${token}` } : {} });
const advance = (ms: number) => (env.clock.now = new Date(env.clock.now.getTime() + ms));

describe("code requests cannot be used to lock someone out (API-06)", () => {
  it("a second request inside the cooldown is refused with Retry-After, and the code that was sent still works", async () => {
    const phone = nextPhone();
    const first = await call("POST", "/v1/auth/otp/start", { phone });
    expect(first.statusCode).toBe(200);
    // A stranger hammers the endpoint with the victim's number.
    for (let i = 0; i < 6; i++) {
      advance(2_000);
      const r = await call("POST", "/v1/auth/otp/start", { phone });
      expect(r.statusCode).toBe(429);
      expect(r.json().error.details).toMatchObject({ reason: "otp_cooldown", codeStillValid: true });
      expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
      expect(Number(r.headers["retry-after"])).toBeLessThanOrEqual(30);
    }
    // Nothing was burnt: the person types the code they were sent and signs in.
    const ok = await call("POST", "/v1/auth/otp/verify", { phone, code: first.json().devCode });
    expect(ok.statusCode).toBe(200);
    // And only one text went out.
    expect(env.ctx.providers.outbox.sms.filter((s) => s.to === phone.replace(/^\+?1?/, "+1"))).toHaveLength(1);
  });

  it("after the cooldown a new code is allowed, and it replaces the old one", async () => {
    const phone = nextPhone();
    const first = (await call("POST", "/v1/auth/otp/start", { phone })).json().devCode;
    advance(31_000);
    const second = await call("POST", "/v1/auth/otp/start", { phone });
    expect(second.statusCode).toBe(200);
    if (first !== second.json().devCode) expect((await call("POST", "/v1/auth/otp/verify", { phone, code: first })).statusCode).toBe(400);
  });

  it("the hourly cap is a sliding window that says how long, and never touches the latest code", async () => {
    const phone = nextPhone();
    let last = "";
    for (let i = 0; i < 5; i++) {
      const r = await call("POST", "/v1/auth/otp/start", { phone });
      expect(r.statusCode).toBe(200);
      last = r.json().devCode;
      if (i < 4) advance(31_000);
    }
    const blocked = await call("POST", "/v1/auth/otp/start", { phone });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.details).toMatchObject({ reason: "otp_cooldown" });
    advance(31_000);
    const capped = await call("POST", "/v1/auth/otp/start", { phone });
    expect(capped.statusCode).toBe(429);
    expect(capped.json().error.details).toMatchObject({ reason: "otp_target_cap", codeStillValid: true });
    // The wait is until the first of the five is an hour old (about 57 minutes here), not a flat hour.
    const wait = Number(capped.headers["retry-after"]);
    expect(wait).toBe(capped.json().error.details.retryAfterSec);
    expect(wait).toBeLessThan(3600);
    expect(wait).toBeGreaterThan(50 * 60);
    // The latest code still signs the person in.
    expect((await call("POST", "/v1/auth/otp/verify", { phone, code: last })).statusCode).toBe(200);
    // After the wait it works again.
    advance(wait * 1000);
    expect((await call("POST", "/v1/auth/otp/start", { phone })).statusCode).toBe(200);
  });

  it("limits code requests per address across phones and emails, without touching other addresses", async () => {
    setAuthLimits(env.ctx, { otpPerIp: 3 });
    expect((await call("POST", "/v1/auth/otp/start", { phone: nextPhone() }, undefined, "203.0.113.9")).statusCode).toBe(200);
    expect((await call("POST", "/v1/auth/otp/start", { phone: nextPhone() }, undefined, "203.0.113.9")).statusCode).toBe(200);
    expect((await call("POST", "/v1/auth/email-otp/start", { email: "a@example.com" }, undefined, "203.0.113.9")).statusCode).toBe(200);
    const blocked = await call("POST", "/v1/auth/otp/start", { phone: nextPhone() }, undefined, "203.0.113.9");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.details.reason).toBe("otp_ip");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(blocked.headers["retry-after"])).toBeLessThanOrEqual(600);
    // Another address is unaffected, and so is the person behind the blocked one once the window passes.
    expect((await call("POST", "/v1/auth/otp/start", { phone: nextPhone() }, undefined, "198.51.100.4")).statusCode).toBe(200);
    advance(10 * 60_000 + 1000);
    expect((await call("POST", "/v1/auth/otp/start", { phone: nextPhone() }, undefined, "203.0.113.9")).statusCode).toBe(200);
  });

  it("keeps a ceiling on texts sent per minute across everyone, and email codes are not counted", async () => {
    setAuthLimits(env.ctx, { smsPerMinute: 2 });
    expect((await call("POST", "/v1/auth/otp/start", { phone: nextPhone() })).statusCode).toBe(200);
    expect((await call("POST", "/v1/auth/otp/start", { phone: nextPhone() })).statusCode).toBe(200);
    const busy = await call("POST", "/v1/auth/otp/start", { phone: nextPhone() });
    expect(busy.statusCode).toBe(429);
    expect(busy.json().error.details.reason).toBe("otp_busy");
    expect((await call("POST", "/v1/auth/email-otp/start", { email: "x@example.com" })).statusCode).toBe(200);
    advance(61_000);
    expect((await call("POST", "/v1/auth/otp/start", { phone: nextPhone() })).statusCode).toBe(200);
  });

  it("texts only the countries we serve (default +1), so the code line cannot pump texts abroad", async () => {
    const r = await call("POST", "/v1/auth/otp/start", { phone: "+442071838750" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("unsupported_region");
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);
    setAuthLimits(env.ctx, { smsCountryCodes: [] });
    expect((await call("POST", "/v1/auth/otp/start", { phone: "+442071838750" })).statusCode).toBe(200);
  });
});

describe("password sign-in throttle (API-07, SEC-04)", () => {
  const reg = async (email = "owner@cafe.ca") => {
    const r = await call("POST", "/v1/auth/register", { email, password: "correct horse", name: "Ana" });
    expect(r.statusCode).toBe(201);
  };
  const wrong = (email: string, ip = "203.0.113.50") => call("POST", "/v1/auth/login", { email, password: "nope-nope" }, undefined, ip);

  it("refuses the sixth try from one address, with Retry-After, even with the right password; a good sign-in elsewhere and email codes still work", async () => {
    await reg();
    for (let i = 0; i < 5; i++) expect((await wrong("owner@cafe.ca")).statusCode).toBe(401);
    const blocked = await call("POST", "/v1/auth/login", { email: "owner@cafe.ca", password: "correct horse" }, undefined, "203.0.113.50");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.details.reason).toBe("login_account_ip");
    const wait = Number(blocked.headers["retry-after"]);
    expect(wait).toBeGreaterThan(14 * 60);
    expect(wait).toBeLessThanOrEqual(15 * 60);
    // The real person on another connection is not locked out, and the emailed code is another way in.
    expect((await call("POST", "/v1/auth/login", { email: "owner@cafe.ca", password: "correct horse" }, undefined, "198.51.100.7")).statusCode).toBe(200);
    const code = (await call("POST", "/v1/auth/email-otp/start", { email: "owner@cafe.ca" }, undefined, "203.0.113.50")).json().devCode;
    expect((await call("POST", "/v1/auth/email-otp/verify", { email: "owner@cafe.ca", code }, undefined, "203.0.113.50")).statusCode).toBe(200);
    // The wait ends by itself.
    advance(wait * 1000 + 1000);
    expect((await call("POST", "/v1/auth/login", { email: "owner@cafe.ca", password: "wrong-again" }, undefined, "203.0.113.50")).statusCode).toBe(401);
  });

  it("counts per account from any address (15), says the same thing for an email with no account, and a good sign-in clears the count", async () => {
    await reg();
    for (let i = 0; i < 14; i++) expect((await wrong("owner@cafe.ca", `10.0.0.${i + 1}`)).statusCode).toBe(401);
    // A right password clears this account's count, so a long run of mistakes by a stranger does not stack up forever.
    expect((await call("POST", "/v1/auth/login", { email: "owner@cafe.ca", password: "correct horse" }, undefined, "10.0.1.1")).statusCode).toBe(200);
    for (let i = 0; i < 15; i++) expect((await wrong("owner@cafe.ca", `10.0.2.${i + 1}`)).statusCode).toBe(401);
    const blocked = await wrong("owner@cafe.ca", "10.0.3.1");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.details.reason).toBe("login_account");
    // No account enumeration: an unknown email is counted and refused the same way.
    for (let i = 0; i < 5; i++) expect((await wrong("ghost@cafe.ca")).statusCode).toBe(401);
    const ghost = await wrong("ghost@cafe.ca");
    expect(ghost.statusCode).toBe(429);
    expect(ghost.json().error.details.reason).toBe("login_account_ip");
  });

  it("counts per address across emails", async () => {
    setAuthLimits(env.ctx, { loginPerIp: 4 });
    for (let i = 0; i < 4; i++) expect((await wrong(`p${i}@cafe.ca`, "203.0.113.77")).statusCode).toBe(401);
    const blocked = await wrong("p9@cafe.ca", "203.0.113.77");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.details.reason).toBe("login_ip");
    expect((await wrong("p9@cafe.ca", "203.0.113.78")).statusCode).toBe(401);
  });

  it("writes every failed password to the audit log (no password in it)", async () => {
    await reg();
    await wrong("owner@cafe.ca");
    await wrong("ghost@cafe.ca");
    const rows = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "auth.login_failed"));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.data as { known: boolean }).known).sort()).toEqual([false, true]);
    expect(JSON.stringify(rows)).not.toContain("nope-nope");
    expect(rows.every((r) => r.ip)).toBe(true);
  });

  it("limits registrations per address and keeps the duplicate-email answer", async () => {
    setAuthLimits(env.ctx, { registerPerIpPerHour: 2 });
    const r = (email: string) => call("POST", "/v1/auth/register", { email, password: "correct horse", name: "A" }, undefined, "203.0.113.90");
    expect((await r("a1@cafe.ca")).statusCode).toBe(201);
    expect((await r("a1@cafe.ca")).statusCode).toBe(409);
    const blocked = await r("a2@cafe.ca");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.details.reason).toBe("register_ip");
    expect(blocked.headers["retry-after"]).toBeTruthy();
  });
});

describe("an account made with register cannot be kept from the real owner (SEC-08)", () => {
  it("the emailed code removes the pre-set password and every earlier session", async () => {
    // The attacker registers the victim's address with a password they know.
    const attacker = (await call("POST", "/v1/auth/register", { email: "victim@example.com", password: "attacker-pass-1", name: "Mallory" })).json();
    expect((await call("GET", "/v1/auth/me", undefined, attacker.accessToken)).statusCode).toBe(200);
    // The real owner signs in with the code sent to their inbox.
    const code = (await call("POST", "/v1/auth/email-otp/start", { email: "victim@example.com" })).json().devCode;
    const owner = await call("POST", "/v1/auth/email-otp/verify", { email: "victim@example.com", code });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().passwordCleared).toBe(true);
    // The attacker's password, refresh token and access token are all dead.
    expect((await call("POST", "/v1/auth/login", { email: "victim@example.com", password: "attacker-pass-1" })).statusCode).toBe(401);
    expect((await call("POST", "/v1/auth/refresh", { refreshToken: attacker.refreshToken })).statusCode).toBe(401);
    expect((await call("GET", "/v1/auth/me", undefined, attacker.accessToken)).statusCode).toBe(401);
    // The owner is in, and the email is now verified.
    expect((await call("GET", "/v1/auth/me", undefined, owner.json().accessToken)).statusCode).toBe(200);
    const [u] = await env.db.select().from(users).where(eq(users.email, "victim@example.com"));
    expect(u!.emailVerifiedAt).toBeTruthy();
    expect(u!.passwordHash).toBeNull();
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "auth.unverified_password_cleared"))).toHaveLength(1);
  });

  it("once the email is verified, a later emailed-code sign-in keeps the password", async () => {
    await call("POST", "/v1/auth/register", { email: "own@example.com", password: "my-own-pass-1", name: "Own" });
    const c1 = (await call("POST", "/v1/auth/email-otp/start", { email: "own@example.com" })).json().devCode;
    const reset = await call("POST", "/v1/auth/password-reset", { email: "own@example.com", code: c1, password: "fresh-pass-22" });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().passwordCleared).toBeUndefined();
    advance(31_000);
    const c2 = (await call("POST", "/v1/auth/email-otp/start", { email: "own@example.com" })).json().devCode;
    const again = await call("POST", "/v1/auth/email-otp/verify", { email: "own@example.com", code: c2 });
    expect(again.statusCode).toBe(200);
    expect(again.json().passwordCleared).toBeUndefined();
    expect((await call("POST", "/v1/auth/login", { email: "own@example.com", password: "fresh-pass-22" })).statusCode).toBe(200);
  });
});

describe("access tokens stop working when the account or session ends (SEC-08)", () => {
  const signUp = async () => (await call("POST", "/v1/auth/register", { email: `u${Math.random().toString(36).slice(2, 8)}@example.com`, password: "correct horse", name: "U" })).json();

  it("sign-out ends the access token at once", async () => {
    const s = await signUp();
    expect((await call("GET", "/v1/auth/me", undefined, s.accessToken)).statusCode).toBe(200);
    await call("POST", "/v1/auth/logout", { refreshToken: s.refreshToken });
    expect((await call("GET", "/v1/auth/me", undefined, s.accessToken)).statusCode).toBe(401);
  });

  it("a password reset ends every earlier access token", async () => {
    const email = "reset-me@example.com";
    const s = (await call("POST", "/v1/auth/register", { email, password: "correct horse", name: "R" })).json();
    const code = (await call("POST", "/v1/auth/email-otp/start", { email })).json().devCode;
    const res = await call("POST", "/v1/auth/password-reset", { email, code, password: "new-password-9" });
    expect(res.statusCode).toBe(200);
    expect((await call("GET", "/v1/auth/me", undefined, s.accessToken)).statusCode).toBe(401);
    expect((await call("GET", "/v1/auth/me", undefined, res.json().accessToken)).statusCode).toBe(200);
  });

  it("deleting the account ends its token (it used to keep answering for an hour)", async () => {
    const s = await signUp();
    expect((await call("DELETE", "/v1/me", { confirm: "DELETE" }, s.accessToken)).statusCode).toBe(204);
    expect((await call("GET", "/v1/me/memberships", undefined, s.accessToken)).statusCode).toBe(401);
  });

  it("a refresh keeps the previous access token for 30 seconds so requests in flight do not fail, then ends it", async () => {
    const s = await signUp();
    const next = (await call("POST", "/v1/auth/refresh", { refreshToken: s.refreshToken })).json();
    expect((await call("GET", "/v1/auth/me", undefined, s.accessToken)).statusCode).toBe(200);
    expect((await call("GET", "/v1/auth/me", undefined, next.accessToken)).statusCode).toBe(200);
    advance(31_000);
    expect((await call("GET", "/v1/auth/me", undefined, s.accessToken)).statusCode).toBe(401);
    expect((await call("GET", "/v1/auth/me", undefined, next.accessToken)).statusCode).toBe(200);
    // A replayed refresh token ends every session, grace or not.
    expect((await call("POST", "/v1/auth/refresh", { refreshToken: s.refreshToken })).statusCode).toBe(401);
    expect((await call("GET", "/v1/auth/me", undefined, next.accessToken)).statusCode).toBe(401);
  });

  it("demoting an admin takes effect on the next request, whatever the token says", async () => {
    const admin = await createUser(env.db, { email: "boss@example.com", platformRole: "admin" });
    const target = await createUser(env.db, { email: "rep-to-be@example.com" });
    const token = await tokenFor(env, admin);
    expect((await call("GET", "/v1/admin/dashboard", undefined, token)).statusCode).toBe(200);
    const other = await createUser(env.db, { email: "boss2@example.com", platformRole: "admin" });
    expect((await call("PUT", `/v1/admin/users/${admin.id}/role`, { platformRole: "none" }, await tokenFor(env, other))).statusCode).toBe(200);
    expect((await call("GET", "/v1/admin/dashboard", undefined, token)).statusCode).toBe(403);
    void target;
  });

  it("staff PIN tokens (no session) still work", async () => {
    const u = await createUser(env.db, { email: "pin-user@example.com" });
    expect((await call("GET", "/v1/auth/me", undefined, await tokenFor(env, u))).statusCode).toBe(200);
    expect(await env.db.select().from(sessions)).toHaveLength(0);
  });
});
