import { describe, expect, it } from "vitest";
import { APP_LINK_PREFIXES, assertConfig, configProblems, isPlaceholderHost, linkHost, variantOf } from "../../config/envConfig.cjs";

const good = { EXPO_PUBLIC_API_URL: "https://api.shop.test-real.app", EXPO_PUBLIC_WEB_URL: "https://shop.test-real.app", EXPO_PUBLIC_SUPPORT_EMAIL: "help@shop.test-real.app" };

describe("envConfig", () => {
  it("never blocks development", () => {
    expect(configProblems({}, "development")).toEqual([]);
  });
  it("fails a production build with nothing set, naming every missing value", () => {
    const p = configProblems({}, "production");
    expect(p).toHaveLength(3);
    expect(() => assertConfig({}, "production")).toThrow(/EXPO_PUBLIC_API_URL is not set/);
  });
  it("rejects placeholder and local hosts and non-https", () => {
    for (const bad of ["https://api.local.example", "http://localhost:4000", "https://10.0.2.2", "https://api.example.com", "http://api.real.app"]) {
      expect(configProblems({ ...good, EXPO_PUBLIC_API_URL: bad }, "production")).toHaveLength(1);
    }
    expect(configProblems({ ...good, EXPO_PUBLIC_SUPPORT_EMAIL: "hello@localloyalty.example" }, "preview")).toHaveLength(1);
  });
  it("accepts real values", () => {
    expect(configProblems(good, "production")).toEqual([]);
    expect(() => assertConfig(good, "production")).not.toThrow();
  });
  it("tells placeholders apart", () => {
    expect(isPlaceholderHost("local.example")).toBe(true);
    expect(isPlaceholderHost("192.168.1.4:8081")).toBe(true);
    expect(isPlaceholderHost("shop.real.app")).toBe(false);
  });
  it("derives the link host only from a real web URL and never claims /i/", () => {
    expect(linkHost(good)).toBe("shop.test-real.app");
    expect(linkHost({})).toBeNull();
    expect(linkHost({ EXPO_PUBLIC_WEB_URL: "https://local.example" })).toBeNull();
    expect(APP_LINK_PREFIXES).not.toContain("/i/");
  });
  it("reads the variant", () => {
    expect(variantOf("production")).toBe("production");
    expect(variantOf(undefined)).toBe("development");
  });
});
