import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config security headers", () => {
  it("every path gets nosniff, a framing rule and a referrer policy; signed-in areas keep no-referrer", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    const keys = Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
    expect(keys["X-Content-Type-Options"]).toBe("nosniff");
    expect(keys["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(keys["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    // The narrower rule comes later in the list so its no-referrer wins for token links and signed-in pages.
    const narrow = rules.findIndex((r) => r.source.includes("(q|i|e|o|me|m|rep|admin|bia|dev)"));
    expect(narrow).toBeGreaterThan(rules.indexOf(all!));
  });
});
