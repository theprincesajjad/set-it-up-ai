import { describe, expect, it, vi } from "vitest";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessTokenStale, jwtExpiry } from "@/lib/auth/cookies";
import { counterStaffToken, forwardToApi, isBlockedBffPath, signIn } from "@/lib/auth/handlers";

const pair = (n: string) => ({
  accessToken: `at-${n}`,
  accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
  refreshToken: `rt-${n}-xxxxxxxxxxxxxxxxxxxxxxxx`,
  refreshTokenExpiresAt: new Date(Date.now() + 90 * 86400_000).toISOString(),
});
const user = { id: "u1", name: "Sam", email: null, phone: "+14165550101", platformRole: "none", memberCode: "K7QX2M9P", phoneVerified: true, emailVerified: false, birthday: null, postalCode: null, homeNeighbourhoodId: null, locale: "en-CA", createdAt: "" };
const jar = (c: Record<string, string>) => ({ get: (n: string) => (c[n] ? { value: c[n]! } : undefined) });

describe("BFF guard", () => {
  it("blocks token-returning endpoints", () => {
    for (const p of ["/v1/auth/otp/verify", "/v1/auth/login", "/v1/auth/register", "/v1/auth/refresh", "/v1/auth/logout", "/v1/auth/email-otp/verify"]) expect(isBlockedBffPath(p)).toBe(true);
    for (const p of ["/v1/auth/otp/start", "/v1/me", "/v1/auth/me"]) expect(isBlockedBffPath(p)).toBe(false);
  });
});

describe("signIn", () => {
  it("returns the user (never the tokens) and httpOnly cookies", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ...pair("1"), user, created: true }), { status: 200 }));
    const r = await signIn("/v1/auth/otp/verify", { phone: "+14165550101", code: "123456" }, {}, fetch);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ user, created: true });
    expect(JSON.stringify(r.json)).not.toContain("at-1");
    const at = r.cookies.find((c) => c.name === ACCESS_COOKIE)!;
    const rt = r.cookies.find((c) => c.name === REFRESH_COOKIE)!;
    expect(at.httpOnly && rt.httpOnly).toBe(true);
    expect(at.value).toBe("at-1");
    expect(rt.sameSite).toBe("lax");
  });

  it("passes API errors through without cookies", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: "invalid_code", message: "x" } }), { status: 400 }));
    const r = await signIn("/v1/auth/otp/verify", {}, {}, fetch);
    expect(r.status).toBe(400);
    expect(r.cookies).toEqual([]);
  });
});

describe("counterStaffToken", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const req = () => new Request("http://web/api/ll/x", { headers: { "x-counter-staff-token": "tok-staff" } });
  it("applies to counter calls, including a grocer's counter pantry log, and nothing else", () => {
    expect(counterStaffToken(req(), `/v1/merchants/${id}/counter/award`)).toBe("tok-staff");
    expect(counterStaffToken(req(), `/v1/merchants/${id}/grocery/counter/pantry`)).toBe("tok-staff");
    expect(counterStaffToken(req(), `/v1/merchants/${id}/grocery/pantry/send`)).toBeNull();
    expect(counterStaffToken(req(), `/v1/merchants/${id}/staff`)).toBeNull();
  });
});

describe("forwardToApi", () => {
  it("attaches the bearer cookie", async () => {
    const fetch = vi.fn(async () => new Response('{"ok":1}', { status: 200, headers: { "content-type": "application/json" } }));
    const r = await forwardToApi(new Request("http://web/api/ll/v1/me?x=1"), "/v1/me", jar({ [ACCESS_COOKIE]: "at-0" }), fetch);
    expect(r.status).toBe(200);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/v1/me?x=1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer at-0");
    expect(r.cookies).toEqual([]);
  });

  it("rotates the refresh token on 401 and retries once", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/v1/auth/refresh")) return new Response(JSON.stringify({ ...pair("2"), user, created: false }), { status: 200 });
      return (init.headers as Headers).get("authorization") === "Bearer at-2" ? new Response("{}", { status: 200 }) : new Response('{"error":{"code":"unauthorized","message":"x"}}', { status: 401 });
    });
    const r = await forwardToApi(new Request("http://web/api/ll/v1/me", { method: "GET" }), "/v1/me", jar({ [ACCESS_COOKIE]: "at-1", [REFRESH_COOKIE]: "rt-unique-1-xxxxxxxxxxxxxxxx" }), fetch as unknown as typeof globalThis.fetch);
    expect(r.status).toBe(200);
    expect(r.cookies.find((c) => c.name === ACCESS_COOKIE)?.value).toBe("at-2");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("clears the session when refresh fails", async () => {
    const fetch = vi.fn(async () => new Response('{"error":{"code":"unauthorized","message":"x"}}', { status: 401 }));
    const r = await forwardToApi(new Request("http://web/api/ll/v1/me"), "/v1/me", jar({ [REFRESH_COOKIE]: "rt-unique-2-xxxxxxxxxxxxxxxx" }), fetch);
    expect(r.status).toBe(401);
    expect(r.cookies.every((c) => c.value === "")).toBe(true);
  });
});

describe("jwt helpers", () => {
  it("reads exp and detects stale tokens", () => {
    const exp = Math.floor(Date.now() / 1000) + 30;
    const tok = `x.${btoa(JSON.stringify({ exp })).replace(/=+$/, "")}.y`;
    expect(jwtExpiry(tok)).toBe(exp * 1000);
    expect(accessTokenStale(tok)).toBe(true); // within the 60 s skew
    expect(accessTokenStale(tok, Date.now(), 0)).toBe(false);
    expect(accessTokenStale(undefined)).toBe(true);
  });
});
