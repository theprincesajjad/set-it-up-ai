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
      "#FFFFFF", "#F6F4F1", "#EEEBE6", "#0B0B0C", "#6B6762", "#8A8680", "#E7E3DD", "#FF5A1F", "#FFF1EA", "#16A34A", "#DC2626", "#2F7BF6",
    ]);
  });
  it("dark roles match foundations.md", () => {
    const c = colors.dark;
    expect([c.bg, c.bgSubtle, c.bgMuted, c.fg, c.fgMuted, c.fgSubtle, c.line, c.accent, c.accentSoft, c.positive, c.negative, c.location]).toEqual([
      "#0E0D0C", "#1C1A18", "#262320", "#F6F4F1", "#A8A39C", "#7C7770", "#2C2926", "#FF7A45", "#2A1710", "#22C55E", "#F87171", "#4C8DF8",
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

describe("v3 roles (docs/design/v3-strategy.md section 5.1)", () => {
  const L = rolesV3.light;
  const D = rolesV3.dark;
  it("light values match the strategy table", () => {
    expect(L).toMatchObject({
      background: "#FFFFFF", foreground: "#0B0B0C", card: "#FFFFFF", popover: "#FFFFFF", primary: "#0B0B0C", primaryForeground: "#FFFFFF",
      secondary: "#F6F4F1", muted: "#F6F4F1", mutedForeground: "#6B6762", accent: "#EEEBE6", destructive: "#DC2626",
      border: "#E7E3DD", input: "#8A8680", ring: "#0B0B0C", subtleForeground: "#8A8680", sidebar: "#F6F4F1", sidebarAccent: "#EEEBE6",
      points: "#FF5A1F", pointsText: "#C2410C", pointsSoft: "#FFF1EA", pointsForeground: "#FFFFFF",
      success: "#16A34A", successText: "#15803D", info: "#2F7BF6", infoText: "#1D4ED8", infoSoft: "#EFF4FF",
      warning: "#D97706", warningText: "#B45309", paper: "#FBF9F6", qrFg: "#000000", qrBg: "#FFFFFF",
    });
    expect(chartSeriesV3.light).toEqual(["#0B0B0C", "#FF5A1F", "#6B6762", "#2F7BF6", "#16A34A"]);
  });
  it("dark values match the strategy table", () => {
    expect(D).toMatchObject({
      background: "#0E0D0C", foreground: "#F6F4F1", card: "#161412", popover: "#161412", primary: "#F6F4F1", primaryForeground: "#0E0D0C",
      secondary: "#1C1A18", muted: "#1C1A18", mutedForeground: "#A8A39C", accent: "#262320", destructive: "#F87171",
      border: "#2C2926", input: "#7C7770", ring: "#F6F4F1", subtleForeground: "#7C7770", sidebar: "#161412", sidebarAccent: "#262320", sidebarBorder: "#2C2926",
      points: "#FF7A45", pointsText: "#FF7A45", pointsSoft: "#2A1710", pointsForeground: "#0E0D0C",
      success: "#22C55E", successText: "#4ADE80", info: "#4C8DF8", infoText: "#8DB2FF", infoSoft: "#111C33",
      warning: "#FBBF24", warningText: "#FBBF24", paper: "#0E0D0C",
    });
    expect(chartSeriesV3.dark).toEqual(["#F6F4F1", "#FF7A45", "#A8A39C", "#4C8DF8", "#22C55E"]);
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
  it("documents the headline ratios from section 5.1", () => {
    const r = (a: string, b: string) => Math.round(contrastRatio(a, b) * 10) / 10;
    expect(r(L.foreground, L.background)).toBe(19.7);
    expect(r(D.foreground, D.background)).toBe(17.7);
    expect(r(L.mutedForeground, L.background)).toBe(5.6);
    expect(r(L.mutedForeground, L.muted)).toBe(5.1);
    expect(r(L.mutedForeground, L.accent)).toBe(4.7);
    expect(r(L.pointsText, L.background)).toBe(5.2);
    expect(r(L.pointsText, L.pointsSoft)).toBe(4.7);
    expect(r(L.successText, L.background)).toBe(5.0);
    expect(r(L.infoText, L.background)).toBe(6.7);
    expect(r(L.warningText, L.background)).toBe(5.0);
    expect(r(L.destructive, L.background)).toBe(4.8);
    expect(r(L.input, L.background)).toBe(3.6);
    expect(r(L.points, L.background)).toBe(3.1);
    expect(r(L.success, L.background)).toBe(3.3);
    expect(r(L.info, L.background)).toBe(4.0);
    expect(r(L.warning, L.background)).toBe(3.2);
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
