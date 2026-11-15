import { describe, expect, it } from "vitest";
import { translator } from "@ll/shared";
import { ApiError } from "@/lib/api/errors";
import { otpErrorMessage } from "@/lib/auth/otpErrors";

const rateLimited = (retryAfter?: number) => {
  const e = new ApiError(429, "rate_limited", "Too many requests");
  if (retryAfter !== undefined) e.retryAfter = retryAfter;
  return e;
};

/** A 429 from the API carries `details.reason`: the page branches on it, never on the English text. */
const limited = (reason: string, retryAfter?: number) => {
  const e = new ApiError(429, "rate_limited", "Some English text that no longer matters", { reason });
  if (retryAfter !== undefined) e.retryAfter = retryAfter;
  return e;
};

describe("otpErrorMessage by reason", () => {
  const t = translator("en");
  it("the hourly cap on new codes says when to come back, not 'going a little fast'", () => {
    const msg = otpErrorMessage(limited("otp_target_cap", 2482), t, "en");
    expect(msg).toContain("41 minutes");
    expect(msg).not.toMatch(/a little fast/);
    expect(otpErrorMessage(limited("otp_target_cap"), t, "en")).toBe(t("auth.err.startCap"));
  });
  it("five wrong tries closes the code", () => {
    expect(otpErrorMessage(limited("otp_locked"), t, "en")).toBe(t("auth.err.lockedCode"));
  });
  it("the short wait between two codes is the plain wait line", () => {
    expect(otpErrorMessage(limited("otp_cooldown", 23), t, "en")).toContain("23 seconds");
  });
  it("says the same in Punjabi", () => {
    const pa = translator("pa");
    expect(otpErrorMessage(limited("otp_target_cap", 600), pa, "pa")).toContain("10");
    expect(otpErrorMessage(limited("otp_locked"), pa, "pa")).toBe(pa("auth.err.lockedCode"));
  });
});

describe("otpErrorMessage 429", () => {
  it("says how long the server asked for, not a fixed guess", () => {
    const t = translator("en");
    expect(otpErrorMessage(rateLimited(60), t, "en")).toContain("60 seconds");
    expect(otpErrorMessage(rateLimited(600), t, "en")).toContain("10 minutes");
    expect(otpErrorMessage(rateLimited(120), t, "en")).toContain("2 minutes");
  });
  it("without Retry-After keeps the plain wait-a-few-minutes line", () => {
    const t = translator("en");
    expect(otpErrorMessage(rateLimited(), t, "en")).toBe(t("auth.err.tooMany"));
  });
});
