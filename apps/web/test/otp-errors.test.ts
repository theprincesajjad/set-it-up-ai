import { describe, expect, it } from "vitest";
import { translator } from "@ll/shared";
import { ApiError } from "@/lib/api/errors";
import { otpErrorMessage } from "@/lib/auth/otpErrors";

const rateLimited = (retryAfter?: number) => {
  const e = new ApiError(429, "rate_limited", "Too many requests");
  if (retryAfter !== undefined) e.retryAfter = retryAfter;
  return e;
};

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
