import { describe, expect, it, vi } from "vitest";
import { buildUrl, createApiClient, newIdempotencyKey } from "@/lib/api/client";
import { ApiError, errorMessage, isApiError } from "@/lib/api/errors";
import { llApi } from "@/lib/api/endpoints";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("buildUrl", () => {
  it("joins base + path and skips empty query values", () => {
    expect(buildUrl("http://api:4000/", "/v1/network/shops", { lat: 43.6, lng: -79.4, q: "", vertical: undefined, x: null })).toBe("http://api:4000/v1/network/shops?lat=43.6&lng=-79.4");
    expect(buildUrl("/api/ll", "v1/me")).toBe("/api/ll/v1/me");
    expect(buildUrl("/api/ll", "/v1/x", { status: ["a", "b"] })).toBe("/api/ll/v1/x?status=a&status=b");
  });
});

describe("createApiClient", () => {
  it("sends JSON, the bearer token and the idempotency key; parses JSON", async () => {
    const fetch = vi.fn(async () => json(201, { ok: true }));
    const c = createApiClient({ baseUrl: "http://api", getAccessToken: () => "tok", fetch });
    const r = await c.post<{ ok: boolean }>("/v1/me/memberships", { a: 1 }, { idempotencyKey: "k-123" });
    expect(r).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api/v1/me/memberships");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer tok");
    expect(h["content-type"]).toBe("application/json");
    expect(h["idempotency-key"]).toBe("k-123");
  });

  it("omits the token for anonymous calls", async () => {
    const fetch = vi.fn(async () => json(200, {}));
    const c = createApiClient({ baseUrl: "http://api", getAccessToken: () => "tok", fetch });
    await c.get("/v1/public/shops/x", { anonymous: true });
    const h = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(h.authorization).toBeUndefined();
  });

  it("turns the error envelope into ApiError with code, message and details", async () => {
    const fetch = vi.fn(async () => json(400, { error: { code: "invalid_code", message: "That code didn't match", details: { attemptsLeft: 3 } } }));
    const c = createApiClient({ baseUrl: "http://api", fetch });
    const err = await c.post("/v1/auth/otp/verify", {}).catch((e) => e);
    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({ status: 400, code: "invalid_code", message: "That code didn't match", details: { attemptsLeft: 3 } });
  });

  it("handles non-JSON errors and 204s", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("Bad gateway", { status: 502 })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const c = createApiClient({ baseUrl: "http://api", fetch });
    const err = (await c.get("/v1/x").catch((e) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.code).toBe("server_error");
    expect(errorMessage(err)).toMatch(/on our end/);
    await expect(c.delete("/v1/me", { confirm: "DELETE" })).resolves.toBeUndefined();
  });

  it("maps network failures to status 0", async () => {
    const c = createApiClient({ baseUrl: "http://api", fetch: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) });
    const err = (await c.get("/v1/x").catch((e) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
    expect(errorMessage(err)).toBe("Can't connect right now. Check your connection and try again.");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    let token = "old";
    const fetch = vi.fn(async (_u: string, init: RequestInit) => ((init.headers as Record<string, string>).authorization === "Bearer new" ? json(200, { user: 1 }) : json(401, { error: { code: "unauthorized", message: "expired" } })));
    const refresh = vi.fn(async () => {
      token = "new";
      return true;
    });
    const c = createApiClient({ baseUrl: "http://api", getAccessToken: () => token, refresh, fetch: fetch as unknown as typeof globalThis.fetch });
    await expect(c.get("/v1/auth/me")).resolves.toEqual({ user: 1 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not loop when refresh fails", async () => {
    const fetch = vi.fn(async () => json(401, { error: { code: "unauthorized", message: "nope" } }));
    const refresh = vi.fn(async () => false);
    const c = createApiClient({ baseUrl: "http://api", getAccessToken: () => "t", refresh, fetch });
    await expect(c.get("/v1/me")).rejects.toMatchObject({ status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("llApi endpoints", () => {
  it("encodes path params and hits the documented paths", async () => {
    const fetch = vi.fn(async () => json(200, {}));
    const api = llApi(createApiClient({ baseUrl: "http://api", fetch }));
    await api.public.joinInfo("AB C/1");
    await api.public.approveQuote("tok", "Alex Chen");
    await api.me.join({ locationQrCode: "RONCY01", referralCode: "K7QX2M9P" });
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![0]).toBe("http://api/v1/public/join/AB%20C%2F1");
    expect(calls[1]![0]).toBe("http://api/v1/public/quotes/tok/approve");
    expect(JSON.parse(calls[1]![1].body as string)).toEqual({ signatureName: "Alex Chen" });
    expect(calls[2]![0]).toBe("http://api/v1/me/memberships");
  });

  it("idempotency keys are unique", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
    expect(newIdempotencyKey("redeem").length).toBeGreaterThanOrEqual(8);
  });
});
