import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const me = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "ll_at" ? { value: "token" } : undefined), has: () => true }),
  headers: async () => new Headers({ "x-ll-next": "/m/abc/customers?x=1" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/api/server", () => ({ getServerApi: async () => ({ auth: { me } }) }));

const { getMe, requireMe, requireMeOrOutage, ApiUnavailableError, currentPath } = await import("@/lib/auth/session");

describe("an outage is not a sign-out (FS-03)", () => {
  beforeEach(() => {
    me.mockReset();
  });

  it("treats a dead API as unavailable, never as signed out", async () => {
    me.mockRejectedValue(ApiError.network());
    await expect(getMe()).rejects.toBeInstanceOf(ApiUnavailableError);
    // requireMe must not send a signed-in person to /login because the API is down
    await expect(requireMe("/m/abc")).rejects.toBeInstanceOf(ApiUnavailableError);
    expect(await requireMeOrOutage("/m/abc")).toEqual({ outage: true });
  });

  it("treats a 5xx the same way", async () => {
    me.mockRejectedValue(new ApiError(503, "server_error", "x"));
    expect(await requireMeOrOutage("/m/abc")).toEqual({ outage: true });
  });

  it("still sends a really gone session (401) to /login with the path to come back to", async () => {
    me.mockRejectedValue(new ApiError(401, "unauthorized", "x"));
    expect(await getMe()).toBeNull();
    await expect(requireMeOrOutage("/m/abc/customers?x=1")).rejects.toThrow("REDIRECT:/login?next=%2Fm%2Fabc%2Fcustomers%3Fx%3D1");
  });

  it("returns the person when the API answers", async () => {
    me.mockResolvedValue({ user: { id: "u" }, merchants: [], platformRole: "none" });
    expect((await requireMeOrOutage("/m/abc")).me?.user.id).toBe("u");
  });

  it("remembers the full path (with query) the person asked for", async () => {
    expect(await currentPath("/m/abc")).toBe("/m/abc/customers?x=1");
  });
});
