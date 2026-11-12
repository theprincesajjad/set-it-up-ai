import { describe, expect, it } from "vitest";
import { assertBrandInProduction } from "@/lib/env";

describe("assertBrandInProduction", () => {
  const real = { NODE_ENV: "production", NEXT_PUBLIC_API_URL: "https://api.shop-loyalty.ca" };
  it("refuses a real deployment without the support address and entity name", () => {
    expect(() => assertBrandInProduction(real)).toThrow(/SUPPORT_EMAIL[\s\S]*LEGAL_ENTITY_NAME/);
  });
  it("refuses a placeholder address", () => {
    expect(() => assertBrandInProduction({ ...real, NEXT_PUBLIC_SUPPORT_EMAIL: "hello@localloyalty.example", NEXT_PUBLIC_LEGAL_ENTITY_NAME: "X Inc." })).toThrow(/placeholder/);
  });
  it("accepts real values, and a local production build or development", () => {
    expect(() => assertBrandInProduction({ ...real, NEXT_PUBLIC_SUPPORT_EMAIL: "help@shop-loyalty.ca", NEXT_PUBLIC_LEGAL_ENTITY_NAME: "X Inc." })).not.toThrow();
    expect(() => assertBrandInProduction({ NODE_ENV: "production" })).not.toThrow();
    expect(() => assertBrandInProduction({ NODE_ENV: "development" })).not.toThrow();
  });
});
