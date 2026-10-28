import { describe, expect, it } from "vitest";
import { VERTICALS } from "@ll/shared";
import {
  contrastPairsTrade,
  contrastRatio,
  rolesV3,
  TILE_NAMES,
  TRADE_FAMILIES,
  tileRoles,
  tilePairs,
  tradeColors,
  tradeFamilies,
  tradeFamilyOf,
  verticalTrade,
  WCAG,
  type ThemeName,
  type TradeFamily,
} from "../src/index.js";

const themes: ThemeName[] = ["light", "dark"];
const fmt = (n: number) => n.toFixed(2);

describe("pastel tiles (Main Street Warm)", () => {
  it("exposes peach, mint, butter, lilac, sky and rose as roles with deep text", () => {
    expect([...TILE_NAMES]).toEqual(["peach", "mint", "butter", "lilac", "sky", "rose"]);
    for (const theme of themes) {
      const r = rolesV3[theme] as unknown as Record<string, string>;
      for (const n of TILE_NAMES) {
        const cap = n.charAt(0).toUpperCase() + n.slice(1);
        expect(r[`tile${cap}`], `${theme} tile${cap}`).toMatch(/^#[0-9A-F]{6}$/);
        expect(r[`tile${cap}Foreground`], `${theme} tile${cap}Foreground`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });
  it.each(themes.flatMap((t) => TILE_NAMES.map((n) => [t, n] as const)))("%s %s: deep text and ink are AA on the fill, deep text is AA on the card", (theme, n) => {
    const roles = tileRoles(theme);
    const cap = (n.charAt(0).toUpperCase() + n.slice(1)) as Capitalize<typeof n>;
    const fill = roles[`tile${cap}`];
    const text = roles[`tile${cap}Foreground`];
    expect(contrastRatio(text, fill), `${theme} ${n} ${text} on ${fill}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    expect(contrastRatio(rolesV3[theme].foreground, fill), `${theme} ${n} ink on fill`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    expect(contrastRatio(text, rolesV3[theme].card), `${theme} ${n} deep text on card`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });
  it("light tile fills are the brief's pastels", () => {
    expect(tilePairs.peach).toMatchObject({ fill: "#FCE4D8" });
    expect(tilePairs.mint.deep).toBe("#1F5C4A");
  });
});

describe("per-trade accent families", () => {
  it("every vertical in @ll/shared maps to a family", () => {
    expect(Object.keys(tradeFamilyOf).sort()).toEqual([...VERTICALS].sort());
    for (const v of VERTICALS) expect(TRADE_FAMILIES, v).toContain(tradeFamilyOf[v]);
    expect(verticalTrade("not-a-vertical")).toBe("terracotta");
    expect(verticalTrade(null)).toBe("terracotta");
  });
  it("follows the brief", () => {
    expect(tradeFamilyOf).toMatchObject({
      cafe: "cafe", bakery: "bakery", salon: "rose", spa: "rose", barber: "barber", restaurant: "saffron", restaurant_south_asian: "saffron", tiffin: "saffron",
      caterer: "saffron", banquet_hall: "saffron", grocery: "leaf", pharmacy: "teal", fitness: "studio", pet: "sky", repair_auto: "slate", car_wash: "slate",
      repair_electronics: "steel", florist: "fuchsia", bookstore: "plum", other: "terracotta",
    });
  });
  it("every family is used by a vertical and has distinct accents", () => {
    const used = new Set(Object.values(tradeFamilyOf));
    for (const f of TRADE_FAMILIES) expect(used.has(f), f).toBe(true);
    expect(new Set(TRADE_FAMILIES.map((f) => tradeFamilies[f].accent)).size).toBe(TRADE_FAMILIES.length);
  });

  const cases: [string, ThemeName, TradeFamily, (typeof contrastPairsTrade)[number]][] = themes.flatMap((theme) => TRADE_FAMILIES.flatMap((f) => contrastPairsTrade.map((p): [string, ThemeName, TradeFamily, (typeof contrastPairsTrade)[number]] => [`${theme} ${f}: ${p.fg} on ${p.bg} (>= ${p.min})`, theme, f, p])));
  it.each(cases)("%s", (_l, theme, f, p) => {
    const trade = tradeColors(f, theme) as unknown as Record<string, string>;
    const roles = rolesV3[theme] as unknown as Record<string, string>;
    const pick = (k: string) => trade[k] ?? roles[k]!;
    const ratio = contrastRatio(pick(p.fg), pick(p.bg));
    expect(ratio, `${theme} ${f}: ${p.fg} ${pick(p.fg)} on ${p.bg} ${pick(p.bg)} = ${fmt(ratio)} (${p.note})`).toBeGreaterThanOrEqual(p.min);
  });
});
