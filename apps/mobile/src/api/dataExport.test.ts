import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { createEndpoints } from "./endpoints";

const tokens = { accessToken: "a", accessTokenExpiresAt: "2099-01-01T00:00:00Z", refreshToken: "refresh-token-xxxxxxxxxxxxxxxx", refreshTokenExpiresAt: "2099-02-01T00:00:00Z" };

describe("Settings > Download my data (shopper app)", () => {
  it("asks the export endpoint with the shopper's login and hands back every section the API sends", async () => {
    const calls: { url: string; method: string; auth?: string }[] = [];
    const payload = { exportedAt: "2026-11-03T15:00:00.000Z", profile: { id: "u1" }, orders: [], appointments: [], tiffinSubscriptions: [], cateringEvents: [], hallBookings: [], whatsapp: { sessions: [], messages: [] }, phoneCalls: [], reviews: [], serviceTickets: [], waitlist: [], consents: [], doNotContact: [] };
    const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", auth: (init?.headers as Record<string, string> | undefined)?.authorization });
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    });
    const api = createEndpoints(createApiClient({ baseUrl: "http://api", tokenStore: { get: async () => tokens, set: async () => undefined }, fetch: fn as unknown as typeof fetch }));
    const data = await api.me.exportData();
    expect(calls).toEqual([{ url: "http://api/v1/me/export", method: "GET", auth: "Bearer a" }]);
    for (const key of ["orders", "appointments", "tiffinSubscriptions", "cateringEvents", "hallBookings", "whatsapp", "phoneCalls", "reviews", "serviceTickets", "waitlist", "consents", "doNotContact"]) expect(data, key).toHaveProperty(key);
    // The file the app shares is the response as-is, pretty-printed.
    expect(JSON.parse(JSON.stringify(data, null, 2))).toEqual(payload);
  });
});
