import { describe, expect, it, vi } from "vitest";
import { ApiError, buildUrl, createApiClient, errorMessage, type StoredTokens, type TokenStore } from "./client";
import { createEndpoints } from "./endpoints";

const tokens = (n: number): StoredTokens => ({
  accessToken: `access-${n}`,
  accessTokenExpiresAt: "2026-11-01T00:00:00Z",
  refreshToken: `refresh-token-number-${n}-xxxxxxxx`,
  refreshTokenExpiresAt: "2027-02-01T00:00:00Z",
});

function memoryStore(initial: StoredTokens | null = null): TokenStore & { value: StoredTokens | null } {
  const s = {
    value: initial,
    async get() {
      return s.value;
    },
    async set(t: StoredTokens | null) {
      s.value = t;
    },
  };
  return s;
}

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return handler(call);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe("buildUrl", () => {
  it("joins base + path and drops empty query values", () => {
    expect(buildUrl("http://localhost:4000/", "/v1/network/shops", { lat: 43.6, lng: -79.4, q: undefined, cursor: null, vertical: "" })).toBe(
      "http://localhost:4000/v1/network/shops?lat=43.6&lng=-79.4",
    );
    expect(buildUrl("http://x", "v1/me", { q: "LL:K7 Q" })).toBe("http://x/v1/me?q=LL%3AK7%20Q");
  });
});

describe("api client", () => {
  it("sends the bearer token and parses JSON", async () => {
    const store = memoryStore(tokens(1));
    const { fn, calls } = mockFetch(() => json(200, { id: "u1" }));
    const api = createApiClient({ baseUrl: "http://api", tokenStore: store, fetch: fn });
    await expect(api.get("/v1/me")).resolves.toEqual({ id: "u1" });
    expect(calls[0]?.headers.authorization).toBe("Bearer access-1");
    expect(calls[0]?.url).toBe("http://api/v1/me");
  });

  it("does not send a token for auth: none", async () => {
    const { fn, calls } = mockFetch(() => json(200, { sent: true, expiresInSeconds: 600, devCode: "123456" }));
    const api = createEndpoints(createApiClient({ baseUrl: "http://api", tokenStore: memoryStore(tokens(1)), fetch: fn }));
    const res = await api.auth.otpStart("4165550123");
    expect(res.devCode).toBe("123456");
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({ phone: "4165550123" });
  });

  it("maps the error envelope { error: { code, message, details } } to ApiError", async () => {
    const { fn } = mockFetch(() => json(409, { error: { code: "insufficient_points", message: "Not enough points yet.", details: { needed: 3 } } }));
    const api = createApiClient({ baseUrl: "http://api", tokenStore: memoryStore(tokens(1)), fetch: fn });
    const err = await api.post("/v1/me/memberships/m/redeem", { rewardId: "r" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "insufficient_points", message: "Not enough points yet.", details: { needed: 3 } });
    expect((err as ApiError).isRetryable).toBe(false);
  });

  it("maps network failures to code 'network' (retryable)", async () => {
    const fn = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: "http://api", tokenStore: memoryStore(tokens(1)), fetch: fn });
    const err = (await api.get("/v1/me").catch((e) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.code).toBe("network");
    expect(err.isNetwork).toBe(true);
    expect(err.isRetryable).toBe(true);
    expect(errorMessage(err, { network: "Can't connect right now.", server: "Server" })).toBe("Can't connect right now.");
  });

  it("times out slow requests as a network error", async () => {
    const fn = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: "http://api", tokenStore: memoryStore(tokens(1)), fetch: fn });
    const err = (await api.get("/v1/me", { timeoutMs: 20 }).catch((e) => e)) as ApiError;
    expect(err.code).toBe("network");
    expect(err.message).toMatch(/timed out/);
  });

  it("returns undefined for 204", async () => {
    const { fn } = mockFetch(() => new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: "http://api", tokenStore: memoryStore(tokens(1)), fetch: fn });
    await expect(api.post("/v1/me/push-tokens", { token: "x", platform: "ios" })).resolves.toBeUndefined();
  });

  it("sends the Idempotency-Key header and body field for counter awards", async () => {
    const { fn, calls } = mockFetch(() => json(200, { duplicate: false }));
    const api = createEndpoints(createApiClient({ baseUrl: "http://api", tokenStore: memoryStore(tokens(1)), fetch: fn }));
    await api.counter.award("m1", { memberId: "x", idempotencyKey: "key-12345678" });
    expect(calls[0]?.url).toBe("http://api/v1/merchants/m1/counter/award");
    expect(calls[0]?.headers["idempotency-key"]).toBe("key-12345678");
    expect(calls[0]?.body).toMatchObject({ idempotencyKey: "key-12345678" });
  });

  it("on 401 refreshes once, stores the rotated pair and retries", async () => {
    const store = memoryStore(tokens(1));
    const onTokens = vi.fn();
    const { fn, calls } = mockFetch((c) => {
      if (c.url.endsWith("/v1/auth/refresh")) return json(200, { ...tokens(2), created: false, user: { id: "u1" } });
      return c.headers.authorization === "Bearer access-2" ? json(200, { ok: true }) : json(401, { error: { code: "unauthorized", message: "Expired" } });
    });
    const api = createApiClient({ baseUrl: "http://api", tokenStore: store, fetch: fn, onTokens });
    await expect(api.get("/v1/me")).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual(["http://api/v1/me", "http://api/v1/auth/refresh", "http://api/v1/me"]);
    expect(calls[1]?.body).toEqual({ refreshToken: tokens(1).refreshToken });
    expect(store.value).toEqual(tokens(2)); // single-use refresh token replaced
    expect(onTokens).toHaveBeenCalledWith(tokens(2));
  });

  it("parallel 401s share one refresh (refresh tokens are single use)", async () => {
    const store = memoryStore(tokens(1));
    let refreshes = 0;
    const { fn } = mockFetch(async (c) => {
      if (c.url.endsWith("/v1/auth/refresh")) {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 5));
        return json(200, { ...tokens(2), created: false, user: { id: "u1" } });
      }
      return c.headers.authorization === "Bearer access-2" ? json(200, { url: c.url }) : json(401, { error: { code: "unauthorized", message: "x" } });
    });
    const api = createApiClient({ baseUrl: "http://api", tokenStore: store, fetch: fn });
    const results = await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(results).toHaveLength(3);
    expect(refreshes).toBe(1);
  });

  it("when the refresh is rejected: clears tokens, fires onSessionExpired and throws 401", async () => {
    const store = memoryStore(tokens(1));
    const onSessionExpired = vi.fn();
    const { fn, calls } = mockFetch(() => json(401, { error: { code: "unauthorized", message: "Session expired" } }));
    const api = createApiClient({ baseUrl: "http://api", tokenStore: store, fetch: fn, onSessionExpired });
    const err = (await api.get("/v1/me").catch((e) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(store.value).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2); // original + refresh, no retry loop
  });

  it("does not try to refresh when signed out", async () => {
    const { fn, calls } = mockFetch(() => json(401, { error: { code: "unauthorized", message: "Sign in" } }));
    const api = createApiClient({ baseUrl: "http://api", tokenStore: memoryStore(null), fetch: fn });
    await expect(api.get("/v1/me")).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it("uses the staff PIN token for counter calls and asks for the PIN again on 401", async () => {
    let staff: { accessToken: string; accessTokenExpiresAt: string } | null = { accessToken: "pin-token", accessTokenExpiresAt: "2026-11-01T00:00:00Z" };
    const onStaffTokenExpired = vi.fn();
    const { fn, calls } = mockFetch((c) => (c.headers.authorization === "Bearer pin-token" ? json(401, { error: { code: "unauthorized", message: "x" } }) : json(200, {})));
    const client = createApiClient({
      baseUrl: "http://api",
      tokenStore: memoryStore(tokens(1)),
      fetch: fn,
      staffToken: { get: () => staff, clear: () => (staff = null) },
      onStaffTokenExpired,
    });
    const api = createEndpoints(client);
    await expect(api.counter.lookup("m1", "0123")).rejects.toMatchObject({ status: 401 });
    expect(calls[0]?.headers.authorization).toBe("Bearer pin-token");
    expect(onStaffTokenExpired).toHaveBeenCalled();
    expect(staff).toBeNull();
    // next counter call falls back to the device user's token
    await api.counter.lookup("m1", "0123");
    expect(calls[1]?.headers.authorization).toBe("Bearer access-1");
    expect(calls[1]?.url).toBe("http://api/v1/merchants/m1/counter/lookup?q=0123");
  });

  it("setSession stores tokens from an AuthResponse", async () => {
    const store = memoryStore(null);
    const api = createApiClient({ baseUrl: "http://api", tokenStore: store, fetch: mockFetch(() => json(200, {})).fn });
    await api.setSession({ ...tokens(5), created: true, user: {} as never });
    expect(store.value).toEqual(tokens(5));
    expect(await api.hasSession()).toBe(true);
    await api.setSession(null);
    expect(await api.hasSession()).toBe(false);
  });
});
