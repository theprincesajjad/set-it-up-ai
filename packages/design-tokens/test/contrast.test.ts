import { describe, expect, it } from "vitest";
import { VERTICALS } from "@ll/shared";
import {
  chartColors,
  colors,
  contrastPairs,
  contrastPairsV3,
  rolesV3,
  v2Alias,
  chartSeriesV3,
  contrastRatio,
  FALLBACK_CATEGORY,
  MAP_CATEGORIES,
  verticalVisuals,
  WCAG,
  type ThemeName,
} from "../src/index.js";

const themes: ThemeName[] = ["light", "dark"];
const fmt = (n: number) => n.toFixed(2);

describe("contrast math", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("v2 role values (aliases of v3, warm neutrals)", () => {
  it("light roles match foundations.md", () => {
    const c = colors.light;
    expect([c.bg, c.bgSubtle, c.bgMuted, c.fg, c.fgMuted, c.fgSubtle, c.line, c.accent, c.accentSoft, c.positive, c.negative, c.location]).toEqual([
      "#FBF6EE", "#F6EEE2", "#F0E4D2", "#2A1E14", "#725F4E", "#A8967F", "#EADCC8", "#E5530A", "#FFF1EA", "#16A34A", "#CC2222", "#2F7BF6",
    ]);
  });
  it("dark roles match foundations.md", () => {
    const c = colors.dark;
    expect([c.bg, c.bgSubtle, c.bgMuted, c.fg, c.fgMuted, c.fgSubtle, c.line, c.accent, c.accentSoft, c.positive, c.negative, c.location]).toEqual([
      "#1A1410", "#2B221B", "#34291F", "#F7EEE3", "#BBAA98", "#86766A", "#3B2F25", "#FF7A45", "#2A1710", "#22C55E", "#F87171", "#4C8DF8",
    ]);
  });
  it("light accent fails small text on bg, so accentText exists and passes", () => {
    expect(contrastRatio(colors.light.accent, colors.light.bg)).toBeLessThan(WCAG.AA_TEXT);
    expect(contrastRatio(colors.light.accentText, colors.light.bg)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });
  it("primary buttons are terracotta with white text in light, a lifted terracotta with espresso text in dark", () => {
    expect(colors.light.brand).toBe("#C8452C");
    expect(colors.light.onBrand).toBe("#FFFFFF");
    expect(colors.dark.brand).toBe(rolesV3.dark.primary);
    expect(contrastRatio(colors.dark.onBrand, colors.dark.brand)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });
});

describe("v3 roles (docs/design/v3-strategy.md section 5.1)", () => {
  const L = rolesV3.light;
  const D = rolesV3.dark;
  it("light values are the warm palette", () => {
    expect(L).toMatchObject({
      background: "#FBF6EE", foreground: "#2A1E14", card: "#FFFFFF", popover: "#FFFFFF", primary: "#C8452C", primaryForeground: "#FFFFFF",
      secondary: "#F6EEE2", muted: "#F6EEE2", mutedForeground: "#725F4E", accent: "#F0E4D2", destructive: "#CC2222",
      border: "#EADCC8", input: "#8A7866", ring: "#2A1E14", subtleForeground: "#A8967F", sidebar: "#F3E9DA", sidebarAccent: "#FFFFFF", sidebarBorder: "#E2D0B6",
      points: "#E5530A", pointsText: "#B33A09", pointsSoft: "#FFF1EA", pointsForeground: "#FFFFFF",
      success: "#16A34A", successText: "#166534", info: "#2F7BF6", infoText: "#1D4ED8", infoSoft: "#EFF4FF",
      warning: "#CC6C00", warningText: "#B45309", paper: "#FBF6EE", qrFg: "#000000", qrBg: "#FFFFFF",
      forest: "#1F5C4A", primaryText: "#B23A23",
      tilePeach: "#FCE4D8", tilePeachForeground: "#A63A22", tileMint: "#E1EEE6", tileMintForeground: "#1F5C4A",
      tileButter: "#FDF0C8", tileLilac: "#EBE2F3", tileSky: "#DCEBF7", tileRose: "#F9DEE5",
    });
  });
  it("dark values are the warm espresso palette", () => {
    expect(D).toMatchObject({
      background: "#1A1410", foreground: "#F7EEE3", card: "#241C16", popover: "#241C16", primary: "#E0583F", primaryForeground: "#1A1410",
      secondary: "#2B221B", muted: "#2B221B", mutedForeground: "#BBAA98", accent: "#34291F", destructive: "#F87171",
      border: "#3B2F25", input: "#8C7B6B", ring: "#F7EEE3", subtleForeground: "#86766A", sidebar: "#201811", sidebarAccent: "#33281F", sidebarBorder: "#3B2F25",
      points: "#FF7A45", pointsText: "#FF7A45", pointsSoft: "#2A1710", pointsForeground: "#1A1410",
      success: "#22C55E", successText: "#4ADE80", info: "#4C8DF8", infoText: "#8DB2FF", infoSoft: "#111C33",
      warning: "#FBBF24", warningText: "#FBBF24", paper: "#1A1410",
    });
  });
  it("every v2 role that has an alias reads the v3 value", () => {
    for (const theme of themes) {
      for (const [v2, v3] of Object.entries(v2Alias)) {
        expect((colors[theme] as unknown as Record<string, string>)[v2], `${theme} ${v2} -> ${v3}`).toBe((rolesV3[theme] as unknown as Record<string, string>)[v3]);
      }
    }
  });
  it("the v3 accent is the hover surface, not the orange", () => {
    expect(L.accent).not.toBe(L.points);
    expect(colors.light.accent).toBe(L.points);
  });
  it("subtle-foreground fails 4.5:1 by design (disabled only)", () => {
    expect(contrastRatio(L.subtleForeground, L.background)).toBeLessThan(WCAG.AA_TEXT);
  });
});

describe.each(themes)("%s theme v3 pairs", (theme) => {
  const c = rolesV3[theme] as unknown as Record<string, string>;
  const pairs = contrastPairsV3.filter((p) => !p.themes || p.themes.includes(theme));
  it.each(pairs.map((p) => [`${p.fg} on ${p.bg} (>= ${p.min})`, p] as const))("%s", (_label, pair) => {
    const ratio = contrastRatio(c[pair.fg]!, c[pair.bg]!);
    expect(ratio, `${theme}: ${pair.fg} ${c[pair.fg]} on ${pair.bg} ${c[pair.bg]} = ${fmt(ratio)} (${pair.note})`).toBeGreaterThanOrEqual(pair.min);
  });
  it("chart series are >= 3:1 on background", () => {
    for (const s of chartSeriesV3[theme]) expect(contrastRatio(s, c.background!), `${theme} ${s}`).toBeGreaterThanOrEqual(WCAG.AA_UI);
  });
});

describe.each(themes)("%s theme semantic pairs", (theme) => {
  const c = colors[theme] as unknown as Record<string, string>;
  it.each(contrastPairs.map((p) => [`${p.fg} on ${p.bg} (>= ${p.min})`, p] as const))("%s", (_label, pair) => {
    const ratio = contrastRatio(c[pair.fg]!, c[pair.bg]!);
    expect(ratio, `${theme}: ${pair.fg} ${c[pair.fg]} on ${pair.bg} ${c[pair.bg]} = ${fmt(ratio)} (${pair.note})`).toBeGreaterThanOrEqual(pair.min);
  });

  it("every body-text role is >= 4.5:1 on every background role", () => {
    for (const bg of ["bg", "bgSubtle", "bgMuted"]) for (const fg of ["fg", "fgMuted"]) {
      expect(contrastRatio(c[fg]!, c[bg]!), `${theme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    }
  });
});

describe("verticals", () => {
  const allowed = [...MAP_CATEGORIES.filter((m) => m !== "all"), FALLBACK_CATEGORY];
  it("covers every Vertical", () => {
    expect(Object.keys(verticalVisuals).sort()).toEqual([...VERTICALS].sort());
  });
  it.each(VERTICALS.map((v) => [v]))("%s is neutral and has a map category", (v) => {
    const vis = verticalVisuals[v];
    expect(allowed).toContain(vis.category);
    for (const theme of themes) {
      expect(vis[theme].tint).toBe(colors[theme].bgSubtle);
      expect(vis[theme].ink).toBe(colors[theme].fg);
      expect(contrastRatio(vis[theme].ink, vis[theme].tint)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    }
  });
  it("every rail category except all has at least one vertical", () => {
    for (const cat of MAP_CATEGORIES.filter((m) => m !== "all")) {
      expect(VERTICALS.some((v) => verticalVisuals[v].category === cat), cat).toBe(true);
    }
  });
});

describe.each(themes)("%s theme charts", (theme) => {
  const ch = chartColors[theme];
  const bg = colors[theme].bg;
  it("series are >= 3:1 on bg", () => {
    for (const c of [...ch.categorical, ch.line, ch.highlight, ch.you]) expect(contrastRatio(c, bg), `${theme} ${c}`).toBeGreaterThanOrEqual(WCAG.AA_UI);
  });
  it("status colours are >= 3:1 on bg", () => {
    for (const c of Object.values(ch.status)) expect(contrastRatio(c, bg), `${theme} ${c}`).toBeGreaterThanOrEqual(WCAG.AA_UI);
  });
  it("axis labels are >= 4.5:1 on bg", () => {
    expect(contrastRatio(ch.axis, bg)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });
});
