import { describe, expect, it } from "vitest";
import { appearanceFromPayload, parseStoredPref, resolveAppearance, schemeFor } from "./appearance";
import { buildTheme } from "./build";

describe("which look the app wears", () => {
  it("defaults to Clear light, even when the OS is dark", () => {
    expect(resolveAppearance({})).toEqual({ style: "clear", scheme: "light" });
    expect(resolveAppearance({ os: "dark" })).toEqual({ style: "clear", scheme: "light" });
  });
  it("Clear dark is opt-in only", () => {
    expect(resolveAppearance({ device: { scheme: "dark" }, os: "light" })).toEqual({ style: "clear", scheme: "dark" });
    expect(resolveAppearance({ device: { scheme: "system" }, os: "dark" })).toEqual({ style: "clear", scheme: "light" });
  });
  it("Warm keeps following the OS unless a scheme is forced", () => {
    expect(resolveAppearance({ shop: { style: "warm" }, os: "dark" })).toEqual({ style: "warm", scheme: "dark" });
    expect(resolveAppearance({ shop: { style: "warm" }, os: "light" })).toEqual({ style: "warm", scheme: "light" });
    expect(resolveAppearance({ shop: { style: "warm", scheme: "light" }, os: "dark" })).toEqual({ style: "warm", scheme: "light" });
  });
  it("the device choice beats the user's setting, which beats the shop's", () => {
    expect(resolveAppearance({ device: { style: "clear" }, user: { style: "warm" }, shop: { style: "warm" } }).style).toBe("clear");
    expect(resolveAppearance({ user: { style: "warm" }, shop: { style: "clear" } }).style).toBe("warm");
    expect(resolveAppearance({ device: { style: null, scheme: null }, shop: { style: "warm" }, os: "dark" })).toEqual({ style: "warm", scheme: "dark" });
    expect(resolveAppearance({ device: { scheme: "dark" }, shop: { style: "warm", scheme: "light" } })).toEqual({ style: "warm", scheme: "dark" });
  });
  it("schemeFor treats system as light in Clear", () => {
    expect(schemeFor("clear", "system", "dark")).toBe("light");
    expect(schemeFor("warm", "system", "dark")).toBe("dark");
    expect(schemeFor("warm", "system", null)).toBe("light");
  });
});

describe("reading the setting the web keeps", () => {
  it("finds the style and scheme at the top level or nested", () => {
    expect(appearanceFromPayload({ themeStyle: "warm" })).toEqual({ style: "warm", scheme: null });
    expect(appearanceFromPayload({ merchant: { theme_style: "clear", themeScheme: "dark" } })).toEqual({ style: "clear", scheme: "dark" });
    expect(appearanceFromPayload({ settings: { theme: "dark" } })).toEqual({ style: null, scheme: "dark" });
  });
  it("reads the shop's setting off MerchantDetail (themeStyle + themeDark)", () => {
    expect(appearanceFromPayload({ merchant: { themeStyle: "clear", themeDark: true } })).toEqual({ style: "clear", scheme: "dark" });
    // Warm ignores theme_dark and follows the device.
    expect(appearanceFromPayload({ merchant: { themeStyle: "warm", themeDark: true } })).toEqual({ style: "warm", scheme: null });
  });
  it("ignores missing or unknown values", () => {
    expect(appearanceFromPayload(null)).toBeNull();
    expect(appearanceFromPayload({ name: "Sofia" })).toBeNull();
    expect(appearanceFromPayload({ themeStyle: "neon", theme: "sepia" })).toBeNull();
  });
  it("a stored device choice from any older build parses safely", () => {
    expect(parseStoredPref(null)).toEqual({});
    expect(parseStoredPref({ style: "warm", scheme: "dark" })).toEqual({ style: "warm", scheme: "dark" });
    expect(parseStoredPref({ style: 3, scheme: "blue" })).toEqual({ style: null, scheme: null });
  });
});

describe("the theme switch", () => {
  it("Clear and Warm resolve to different palettes over the same role names", () => {
    const clear = buildTheme("light", "clear");
    const warm = buildTheme("light", "warm");
    expect(clear.isClear).toBe(true);
    expect(warm.isClear).toBe(false);
    expect(clear.c.bg).toBe("#F2F2F7");
    expect(warm.c.bg).toBe("#FBF6EE");
    expect(clear.r.primary).toBe("#17171A");
    expect(warm.r.primary).toBe("#C8452C");
    expect(Object.keys(clear.c).sort()).toEqual(Object.keys(warm.c).sort());
    expect(Object.keys(clear.r).sort()).toEqual(Object.keys(warm.r).sort());
  });
  it("Clear dark is graphite on true black with a white primary", () => {
    const t = buildTheme("dark", "clear");
    expect(t.isDark).toBe(true);
    expect(t.c.bg).toBe("#000000");
    expect(t.r.card).toBe("#1C1C1E");
    expect(t.c.brand).toBe("#FFFFFF");
    expect(t.c.onBrand).toBe("#000000");
  });
  it("the trade colour is a single accent in Clear (no gradient) and the family pair in Warm", () => {
    const clear = buildTheme("light", "clear").trade("cafe");
    expect(clear.accent).toBe("#8A5A3C");
    expect(clear.passFrom).toBe(clear.passTo);
    expect(clear.alt).toBe(clear.accent);
    const warm = buildTheme("light", "warm").trade("cafe");
    expect(warm.alt).not.toBe(warm.accent);
  });
  it("reduce transparency swaps the glass for opaque fills with no blur", () => {
    const live = buildTheme("light", "clear").glass;
    const solid = buildTheme("light", "clear", true).glass;
    expect(live.solid).toBe(false);
    expect(live.blur).toBeGreaterThan(0);
    expect(solid.solid).toBe(true);
    expect(solid.blur).toBe(0);
    expect(solid.fill).toMatch(/^#[0-9A-F]{6}$/i);
    expect(solid.fillStrong).toMatch(/^#[0-9A-F]{6}$/i);
    expect(solid.rimA).toBe("transparent");
  });
});
