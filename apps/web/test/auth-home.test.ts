import { describe, expect, it } from "vitest";
import { translator } from "@ll/shared";
import { ApiError } from "../src/lib/api/errors";
import { roleHome, staffHome } from "../src/lib/auth/home";
import { otpErrorMessage } from "../src/lib/auth/otpErrors";

const base = { platformRole: "none", merchants: [] as { merchantId: string }[] };

describe("where people land after signing in", () => {
  it("sends each role to its own home", () => {
    expect(staffHome({ ...base, platformRole: "admin" })).toBe("/admin");
    expect(staffHome({ ...base, platformRole: "rep" })).toBe("/rep");
    expect(staffHome({ ...base, merchants: [{ merchantId: "m1" }] })).toBe("/m/m1");
    expect(staffHome({ ...base, biaManager: true })).toBe("/bia");
  });
  it("never sends a signed-in account to the signup wizard", () => {
    expect(staffHome(base)).toBe("/signed-in");
    expect(staffHome(null)).toBe("/signed-in");
    expect(roleHome(base)).toBeNull();
  });
  it("honours an explicit next, sub-paths included", () => {
    expect(staffHome({ ...base, biaManager: true }, "/bia/campaigns/c1")).toBe("/bia/campaigns/c1");
  });
});

describe("OTP rate-limit copy", () => {
  const t = translator("en");
  it("tells the wrong-code lockout and the hourly cap apart", () => {
    expect(otpErrorMessage(new ApiError(429, "rate_limited", "Too many wrong codes. Request a new one.", { reason: "otp_locked" }), t, "en")).toMatch(/closed that code.*Resend code/);
    // The API names the limit (details.reason); its English sentence is never matched.
    expect(otpErrorMessage(new ApiError(429, "rate_limited", "Too many codes requested. Try again in an hour.", { reason: "otp_target_cap" }), t, "en")).toMatch(/hour/);
    expect(otpErrorMessage(new ApiError(429, "rate_limited", "Too many requests"), t, "en")).not.toMatch(/10 minutes/);
  });
});
