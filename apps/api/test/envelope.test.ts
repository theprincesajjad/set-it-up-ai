/** Every error the API sends, including the framework's own, uses { error: { code, message } } with the right status. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { parseQueryDate } from "../src/lib/validate.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const send = (method: string, url: string, extra: Record<string, unknown> = {}) => env.app.inject({ method: method as never, url, ...extra } as never);
const shape = (r: { json(): unknown }) => {
  const b = r.json() as { error?: { code?: string; message?: string }; statusCode?: number };
  expect(b.statusCode).toBeUndefined();
  expect(typeof b.error?.code).toBe("string");
  expect(typeof b.error?.message).toBe("string");
  return b.error!;
};

describe("error envelope", () => {
  it("unknown route: 404 not_found", async () => {
    const r = await send("GET", "/v1/nothing-here");
    expect(r.statusCode).toBe(404);
    expect(shape(r).code).toBe("not_found");
  });
  it("known path, wrong method: 405 with Allow", async () => {
    const r = await send("DELETE", "/v1/public/plans");
    expect(r.statusCode).toBe(405);
    expect(r.headers.allow).toContain("GET");
    expect(shape(r).code).toBe("method_not_allowed");
  });
  it("broken percent-escape in the path", async () => {
    const r = await send("GET", "/v1/public/shops/%E0%A4%A");
    expect(r.statusCode).toBe(404);
    expect(shape(r).code).toBe("not_found");
  });
  it("bad JSON: 400 without the parser's own text", async () => {
    const r = await send("POST", "/v1/auth/otp/start", { payload: "{bad", headers: { "content-type": "application/json" } });
    expect(r.statusCode).toBe(400);
    const e = shape(r);
    expect(e.message).not.toMatch(/JSON|position|Expected/);
  });
  it("unsupported media type: 415", async () => {
    const r = await send("POST", "/v1/auth/otp/start", { payload: "x", headers: { "content-type": "application/xml" } });
    expect(r.statusCode).toBe(415);
    expect(shape(r).code).toBe("unsupported_media_type");
  });
  it("body too large: 413", async () => {
    const r = await send("POST", "/v1/auth/otp/start", { payload: JSON.stringify({ x: "a".repeat(6 * 1024 * 1024) }), headers: { "content-type": "application/json" } });
    expect(r.statusCode).toBe(413);
    expect(shape(r).code).toBe("payload_too_large");
  });
});

describe("malformed ids", () => {
  it.each(["/v1/me/vehicles/not-a-uuid", "/v1/me/pets/xyz/vaccines/rabies", "/v1/me/notifications/1/read", "/v1/merchants/zzz/appointments/staff", "/v1/me/vehicles/%00"])("%s is a 404, not a 500", async (url) => {
    const r = await send(url.includes("read") ? "POST" : "GET", url);
    expect([404, 401, 405]).toContain(r.statusCode);
    expect(r.statusCode).toBeLessThan(500);
  });
});

describe("/health and /ready", () => {
  it("health is cheap; ready checks the database", async () => {
    expect((await send("GET", "/health")).statusCode).toBe(200);
    const r = await send("GET", "/ready");
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });
});

describe("parseQueryDate", () => {
  it("accepts ISO dates and refuses everything else with a 400", () => {
    expect(parseQueryDate("2026-11-30")?.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(parseQueryDate(undefined)).toBeUndefined();
    expect(() => parseQueryDate("x")).toThrow(/Use a date like/);
    expect(() => parseQueryDate("2026-13-45")).toThrow(/Use a date like/);
  });
});
