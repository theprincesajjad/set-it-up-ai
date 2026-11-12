import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { canRetry, failKind } from "./failKind";

describe("failKind", () => {
  it("tells offline from missing from broken", () => {
    expect(failKind(new ApiError(0, "network", "x"))).toBe("offline");
    expect(failKind(new ApiError(503, "internal", "x"))).toBe("server");
    expect(failKind(new ApiError(404, "not_found", "x"))).toBe("notFound");
    expect(failKind(new ApiError(410, "gone", "x"))).toBe("expired");
    expect(failKind(new ApiError(400, "quote_expired", "x"))).toBe("expired");
    expect(failKind(new ApiError(401, "unauthorized", "x"))).toBe("signedOut");
    expect(failKind(new ApiError(403, "forbidden", "x"))).toBe("forbidden");
    expect(failKind(null)).toBe("notFound");
    expect(failKind(new Error("boom"))).toBe("other");
  });
  it("only offers Try again when it can help", () => {
    expect(canRetry("offline")).toBe(true);
    expect(canRetry("server")).toBe(true);
    expect(canRetry("notFound")).toBe(false);
    expect(canRetry("expired")).toBe(false);
  });
});
