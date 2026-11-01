import { describe, expect, it } from "vitest";
import {
  clear,
  clearDarkAccent,
  contrastRatio,
  normaliseBrandColor,
  readableOn,
  resolveShopColors,
  rolesV3,
  shadeUntil,
  SHOP_TRADE_VARS,
  shopColorStyle,
  tradeFamilies,
  WCAG,
} from "../src/index.js";
import { buildTokensCss } from "../src/css.js";

const LIGHT_BGS = [clear.card, clear.canvas, rolesV3.light.card, rolesV3.light.background];
const DARK_BGS = [clear.cardDark, clear.black, rolesV3.dark.card, rolesV3.dark.background];
const min = (c: string, bgs: string[]) => Math.min(...bgs.map((b) => contrastRatio(c, b)));

/** Every colour the founder or a shop might pick: pastel, neon, near-white, near-black, mid-grey, the trade accents. */
const SAMPLES = ["#FFE4EC", "#FFFF00", "#00FF00", "#FAFAFA", "#FFFFFF", "#000000", "#0B0B0C", "#777777", "#1A7F5A", "#E91E63", "#2E5E4E", "#4A90E2", "#F5A623", "#8A5A3C", "#B83A64", "#123"];

describe("normaliseBrandColor", () => {
  it("accepts #rgb and #rrggbb (with or without #), upper-cases, rejects junk", () => {
    expect(normaliseBrandColor("#1a7f5a")).toBe("#1A7F5A");
    expect(normaliseBrandColor("1a7f5a")).toBe("#1A7F5A");
    expect(normaliseBrandColor("#abc")).toBe("#AABBCC");
    expect(normaliseBrandColor(" #1A7F5A ")).toBe("#1A7F5A");
    for (const bad of [null, undefined, "", "red", "#12345", "#GGGGGG", "rgb(0,0,0)", "#1A7F5A80"]) expect(normaliseBrandColor(bad)).toBeNull();
  });
});

describe("resolveShopColors: where the colour comes from", () => {
  it("uses the shop's brand colour when it set one", () => {
    const c = resolveShopColors("#2E5E4E", "nails");
    expect(c.source).toBe("brand");
    expect(c.base).toBe("#2E5E4E");
    expect(c.light.accent).toBe("#2E5E4E");
    expect(c.light.adjusted).toBe(false);
  });

  it("falls back to the trade colour: nails pink, café brown, barber oxblood, unknown terracotta", () => {
    expect(resolveShopColors(null, "nails")).toMatchObject({ source: "trade", family: "rose", base: tradeFamilies.rose.accent });
    expect(resolveShopColors(undefined, "cafe")).toMatchObject({ source: "trade", family: "cafe", base: tradeFamilies.cafe.accent });
    expect(resolveShopColors("", "barber")).toMatchObject({ source: "trade", family: "barber" });
    expect(resolveShopColors("not-a-colour", "pet")).toMatchObject({ source: "trade", family: "sky" });
    expect(resolveShopColors(null, "spaceship")).toMatchObject({ source: "trade", family: "terracotta" });
    expect(resolveShopColors(null, null)).toMatchObject({ source: "trade", family: "terracotta" });
  });

  it("keeps the designed trade accents as they are (light) and the Clear graphite accent in dark", () => {
    expect(resolveShopColors(null, "nails").light.accent).toBe(tradeFamilies.rose.accent);
    expect(resolveShopColors(null, "cafe").light.accent).toBe(tradeFamilies.cafe.accent);
    expect(resolveShopColors(null, "cafe").dark.accent).toBe(clearDarkAccent("cafe").toUpperCase());
  });
});

describe("contrast is computed, with a fallback for colours that fail AA", () => {
  for (const hex of SAMPLES) {
    it(`${hex}: fills reach 3:1 and text reaches 4.5:1 in light and dark, Clear and Warm`, () => {
      const c = resolveShopColors(hex, "other");
      // Fills (stamps, the field) against every card and canvas: WCAG 1.4.11.
      expect(min(c.light.accent, LIGHT_BGS)).toBeGreaterThanOrEqual(WCAG.AA_UI);
      expect(min(c.dark.accent, DARK_BGS)).toBeGreaterThanOrEqual(WCAG.AA_UI);
      // Text on the fill ("You're in", initials, the stamp glyph).
      expect(contrastRatio(c.light.foreground, c.light.accent)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      expect(contrastRatio(c.dark.foreground, c.dark.accent)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      // The accent as text on cards, the canvas and its own soft tint.
      expect(min(c.light.deep, [...LIGHT_BGS, c.light.soft])).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      expect(min(c.dark.deep, [...DARK_BGS, c.dark.soft])).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    });
  }

  it("a pale brand colour is darkened (same hue family), never shown as-is under white text", () => {
    const c = resolveShopColors("#FFE4EC", "nails");
    expect(c.light.adjusted).toBe(true);
    expect(c.light.accent).not.toBe("#FFE4EC");
    expect(contrastRatio(c.light.accent, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    // still pink: red channel is the largest
    const n = parseInt(c.light.accent.slice(1), 16);
    expect((n >> 16) & 255).toBeGreaterThan(n & 255);
  });

  it("a bright brand colour keeps its hue and gets dark text instead of white", () => {
    const c = resolveShopColors("#F5A623", "cafe");
    expect(c.light.foreground).not.toBe("#FFFFFF");
    expect(contrastRatio(c.light.foreground, c.light.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("a near-black brand colour is lifted in dark mode so it still shows on the graphite card", () => {
    const c = resolveShopColors("#0B0B0C", "barber");
    expect(c.light.accent).toBe("#0B0B0C");
    expect(c.dark.adjusted).toBe(true);
    expect(min(c.dark.accent, DARK_BGS)).toBeGreaterThanOrEqual(3);
  });

  it("readableOn picks white first, then ink, then black", () => {
    expect(readableOn("#2E5E4E")).toBe("#FFFFFF");
    expect(readableOn("#FFFF00")).toBe(clear.ink);
    expect(contrastRatio(readableOn("#777777"), "#777777")).toBeGreaterThanOrEqual(4.5);
  });

  it("shadeUntil returns the colour unchanged when it already passes", () => {
    expect(shadeUntil("#2E5E4E", "#000000", ["#FFFFFF"], 3)).toBe("#2E5E4E");
  });
});

describe("CSS wiring", () => {
  it("the inline style carries both modes for every trade variable", () => {
    const s = shopColorStyle(resolveShopColors("#1A7F5A", "nails"));
    for (const v of SHOP_TRADE_VARS) {
      expect(s[`--shop-l-${v.slice(2)}`]).toMatch(/^#[0-9A-F]{6}$/);
      expect(s[`--shop-d-${v.slice(2)}`]).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(s["--shop-l-trade"]).toBe("#1A7F5A");
  });

  it("tokens.css maps the variables for light, OS dark (Warm), forced dark (Clear) and forced-light islands", () => {
    const css = buildTokensCss();
    expect(css).toContain(":root [data-shop-color][data-shop-color][data-shop-color] {\n  --trade: var(--shop-l-trade);");
    expect(css).toContain(':root:not([data-theme="light"]) [data-shop-color][data-shop-color][data-shop-color]');
    expect(css).toContain(':root[data-theme="dark"] [data-shop-color][data-shop-color][data-shop-color] {\n  --trade: var(--shop-d-trade);');
    // The OS dark block sits before the Clear section (Clear is never turned dark by the OS).
    expect(css.indexOf("data-shop-color")).toBeLessThan(css.indexOf("/* ===== Clear"));
    // Specificity: (0,4,0) light and (0,5,0) dark beat Clear's trade rules, (0,3,0) and (0,4,0), whatever the order.
    expect(css).toContain(':root[data-theme-style="clear"][data-theme="dark"] [data-trade="nails"]');
  });
});
