import { describe, expect, it } from "vitest";
import { BRAND, isPlaceholderEmail, missingBrandConfig } from "../src/index.js";

describe("brand configuration", () => {
  it("flags placeholder and malformed addresses", () => {
    for (const a of ["hello@localloyalty.example", "x@foo.test", "Local <a@b.example>", "nope", "", undefined, "a@example.com"]) expect(isPlaceholderEmail(a), String(a)).toBe(true);
    expect(isPlaceholderEmail("help@shop-loyalty.ca")).toBe(false);
    expect(isPlaceholderEmail("Local Loyalty <hello@shop-loyalty.ca>")).toBe(false);
  });
  it("names every missing launch fact", () => {
    expect(missingBrandConfig({}).join(" ")).toMatch(/SUPPORT_EMAIL.*LEGAL_ENTITY_NAME/);
    expect(missingBrandConfig({ SUPPORT_EMAIL: "hello@localloyalty.example", LEGAL_ENTITY_NAME: "X Inc." })[0]).toMatch(/placeholder/);
    expect(missingBrandConfig({ NEXT_PUBLIC_SUPPORT_EMAIL: "help@shop-loyalty.ca", NEXT_PUBLIC_LEGAL_ENTITY_NAME: "X Inc." })).toEqual([]);
  });
  it("keeps the working values only outside production", () => {
    expect(process.env.NODE_ENV).not.toBe("production");
    expect(BRAND.supportEmail).toMatch(/@/);
    expect(BRAND.legalName).toBeTruthy();
  });
});
