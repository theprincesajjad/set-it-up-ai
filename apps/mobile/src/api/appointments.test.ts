import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { createEndpoints } from "./endpoints";

const tokens = { accessToken: "a", accessTokenExpiresAt: "2099-01-01T00:00:00Z", refreshToken: "refresh-token-xxxxxxxxxxxxxxxx", refreshTokenExpiresAt: "2099-02-01T00:00:00Z" };

function setup() {
  const calls: { url: string; method: string; body: unknown; auth?: string }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: (init?.headers as Record<string, string> | undefined)?.authorization });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  const store = { get: async () => tokens, set: async () => undefined };
  const api = createEndpoints(createApiClient({ baseUrl: "http://api", tokenStore: store, fetch: fn as unknown as typeof fetch }));
  return { api, calls };
}

describe("appointment endpoints", () => {
  it("reads the shop's services and availability without needing a login", async () => {
    const { api, calls } = setup();
    await api.appointments.services("bloom hair");
    await api.appointments.availability("bloom", { serviceIds: ["a", "b"], staffId: "any", from: "2026-11-04", to: "2026-11-17" });
    expect(calls[0]!.url).toBe("http://api/v1/public/shops/bloom%20hair/services");
    expect(calls[1]!.url).toBe("http://api/v1/public/shops/bloom/availability?serviceIds=a%2Cb&staffId=any&from=2026-11-04&to=2026-11-17");
  });
  it("books, looks at, moves and cancels with the customer's login", async () => {
    const { api, calls } = setup();
    await api.appointments.book({ serviceIds: ["s1"], staffId: null, startsAt: "2026-11-04T15:00:00.000Z" });
    await api.appointments.get("x/1");
    await api.appointments.reschedule("x1", { startsAt: "2026-11-05T15:00:00.000Z" });
    await api.appointments.cancel("x1");
    expect(calls.map((c) => `${c.method} ${c.url.replace("http://api", "")}`)).toEqual([
      "POST /v1/me/appointments",
      "GET /v1/me/appointments/x%2F1",
      "POST /v1/me/appointments/x1/reschedule",
      "POST /v1/me/appointments/x1/cancel",
    ]);
    expect(calls[0]!.body).toMatchObject({ serviceIds: ["s1"], staffId: null });
    expect(calls[0]!.auth).toBe("Bearer a");
  });
  it("asks for drop-off slots now that the kind type is widened", async () => {
    const { api, calls } = setup();
    await api.commerce.slots("shop", { kind: "dropoff" });
    expect(calls[0]!.url).toBe("http://api/v1/public/shops/shop/slots?kind=dropoff");
  });
});
