import { describe, expect, it } from "vitest";
import { VERTICALS } from "@ll/shared";
import {
  chartColors,
  colors,
  contrastPairs,
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

describe("v2 foundations values", () => {
  it("light roles match foundations.md", () => {
    const c = colors.light;
    expect([c.bg, c.bgSubtle, c.bgMuted, c.fg, c.fgMuted, c.fgSubtle, c.line, c.accent, c.accentSoft, c.positive, c.negative, c.location]).toEqual([
      "#FFFFFF", "#F5F5F4", "#EDEDEC", "#0B0B0C", "#6B6B70", "#9A9AA0", "#E8E8E6", "#FF5A1F", "#FFF1EA", "#16A34A", "#DC2626", "#2F7BF6",
    ]);
  });
  it("dark roles match foundations.md", () => {
    const c = colors.dark;
    expect([c.bg, c.bgSubtle, c.bgMuted, c.fg, c.fgMuted, c.fgSubtle, c.line, c.accent, c.accentSoft, c.positive, c.negative, c.location]).toEqual([
      "#0B0B0C", "#161618", "#202023", "#F5F5F4", "#A1A1A8", "#6E6E76", "#2A2A2E", "#FF7A45", "#2A1710", "#22C55E", "#F87171", "#4C8DF8",
    ]);
  });
  it("light accent fails small text on bg, so accentText exists and passes", () => {
    expect(contrastRatio(colors.light.accent, colors.light.bg)).toBeLessThan(WCAG.AA_TEXT);
    expect(contrastRatio(colors.light.accentText, colors.light.bg)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });
  it("primary buttons are black in light, inverted in dark", () => {
    expect(colors.light.brand).toBe(colors.light.fg);
    expect(colors.dark.brand).toBe(colors.dark.fg);
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
