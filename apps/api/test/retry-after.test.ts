import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, nextPhone, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

describe("429 says when to try again", () => {
  it("sends Retry-After and details.retryAfterSec on the hourly cap for new codes (when the oldest of the five ages out, not a flat hour)", async () => {
    const phone = nextPhone();
    const call = () => env.app.inject({ method: "POST", url: "/v1/auth/otp/start", payload: { phone } });
    const advance = (ms: number) => (env.clock.now = new Date(env.clock.now.getTime() + ms));
    for (let i = 0; i < 5; i++) {
      expect((await call()).statusCode).toBe(200);
      advance(31_000); // past the cooldown between two codes
    }
    const sixth = await call();
    expect(sixth.statusCode).toBe(429);
    const wait = Number(sixth.headers["retry-after"]);
    expect(wait).toBeGreaterThan(3600 - 5 * 31 - 5);
    expect(wait).toBeLessThanOrEqual(3600 - 4 * 31);
    expect(sixth.json().error).toMatchObject({ code: "rate_limited", details: { retryAfterSec: wait, reason: "otp_target_cap" } });
  });

  it("sends Retry-After on the cooldown between two codes", async () => {
    const phone = nextPhone();
    const call = () => env.app.inject({ method: "POST", url: "/v1/auth/otp/start", payload: { phone } });
    expect((await call()).statusCode).toBe(200);
    const second = await call();
    expect(second.statusCode).toBe(429);
    expect(second.headers["retry-after"]).toBe("30");
    expect(second.json().error).toMatchObject({ code: "rate_limited", details: { retryAfterSec: 30, reason: "otp_cooldown", codeStillValid: true } });
  });

  it("answers a validation failure with plain field sentences and codes", async () => {
    const res = await env.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "x", password: "" } });
    expect(res.statusCode).toBe(400);
    const e = res.json().error;
    expect(e.message).toBe("Check the highlighted fields and try again.");
    expect(e.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "email", code: "email", message: "Enter a valid email address." }),
        expect.objectContaining({ path: "password", code: "required", message: "This is required." }),
      ]),
    );
  });
});
