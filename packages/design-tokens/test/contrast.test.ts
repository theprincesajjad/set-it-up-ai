import { describe, expect, it } from "vitest";
import { VERTICALS } from "@ll/shared";
import { chartColors, colors, contrastPairs, contrastRatio, verticalVisuals, WCAG, type ThemeName } from "../src/index.js";

const themes: ThemeName[] = ["light", "dark"];
const fmt = (n: number) => n.toFixed(2);

describe("contrast math", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(themes)("%s theme semantic pairs", (theme) => {
  const c = colors[theme] as unknown as Record<string, string>;
  it.each(contrastPairs.map((p) => [`${p.fg} on ${p.bg} (>= ${p.min})`, p] as const))("%s", (_label, pair) => {
    const ratio = contrastRatio(c[pair.fg]!, c[pair.bg]!);
    expect(ratio, `${theme}: ${pair.fg} ${c[pair.fg]} on ${pair.bg} ${c[pair.bg]} = ${fmt(ratio)} (${pair.note})`).toBeGreaterThanOrEqual(pair.min);
  });

  it("every body-text role is >= 4.5:1 on every background role", () => {
    const backgrounds = ["canvas", "canvasSubtle", "surface", "surfaceRaised", "surfaceSunken"];
    for (const bg of backgrounds) for (const fg of ["fg", "fgMuted", "fgLink", "fgBrand"]) {
      expect(contrastRatio(c[fg]!, c[bg]!), `${theme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    }
  });
});

describe.each(themes)("%s theme verticals", (theme) => {
  it("covers every Vertical", () => {
    expect(Object.keys(verticalVisuals).sort()).toEqual([...VERTICALS].sort());
  });
  it.each(VERTICALS.map((v) => [v]))("%s", (v) => {
    const vc = verticalVisuals[v][theme];
    const bg = colors[theme].surface;
    expect(contrastRatio(vc.ink, vc.tint), `${theme} ${v} ink/tint ${vc.ink}/${vc.tint}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    expect(contrastRatio(vc.onAccent, vc.accent), `${theme} ${v} onAccent/accent ${vc.accent}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    expect(contrastRatio(vc.accent, vc.tint), `${theme} ${v} accent/tint`).toBeGreaterThanOrEqual(WCAG.AA_UI);
    expect(contrastRatio(vc.accent, bg), `${theme} ${v} accent/surface (map pin edge)`).toBeGreaterThanOrEqual(WCAG.AA_UI);
  });
});

describe.each(themes)("%s theme charts", (theme) => {
  const ch = chartColors[theme];
  const surface = colors[theme].surface;
  it("categorical series are >= 3:1 on surface", () => {
    for (const c of ch.categorical) expect(contrastRatio(c, surface), `${theme} ${c}`).toBeGreaterThanOrEqual(WCAG.AA_UI);
  });
  it("you / status colours are >= 3:1 on surface", () => {
    for (const c of [ch.you, ch.status.low, ch.status.building, ch.status.healthy]) {
      expect(contrastRatio(c, surface), `${theme} ${c}`).toBeGreaterThanOrEqual(WCAG.AA_UI);
    }
  });
  it("axis labels are >= 4.5:1 on surface", () => {
    expect(contrastRatio(ch.axis, surface)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });
});
