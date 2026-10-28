import { describe, expect, it } from "vitest";
import {
  clearExtra,
  clearExtraSolid,
  clearGlass,
  clearGlassSolid,
  clearRoles,
  clearTradeColors,
  composite,
  contrastPairsV3,
  contrastRatio,
  TRADE_FAMILIES,
  WCAG,
  type ThemeName,
  type TradeFamily,
} from "../src/index.js";
import { buildThemeCss, buildTokensCss, CLEAR_COLOR_NAMES } from "../src/css.js";

const themes: ThemeName[] = ["light", "dark"];
const fmt = (n: number) => n.toFixed(2);

describe("Clear roles (v3.2-clear.md, v6 mock)", () => {
  it("light values are the mock's", () => {
    expect(clearRoles.light).toMatchObject({
      background: "#F2F2F7", foreground: "#17171A", card: "#FFFFFF", muted: "#EBEBED", mutedForeground: "#54545A", subtleForeground: "#86868B",
      border: "#E5E5EA", input: "#838388", ring: "#0071E3", primary: "#17171A", primaryForeground: "#FFFFFF", primaryText: "#0066CC", destructive: "#C70A24",
      successText: "#014B40", infoText: "#003A5A", infoSoft: "#EAF4FF", warningText: "#5E4200",
    });
    expect(clearExtra.light).toMatchObject({ link: "#0066CC", borderStrong: "#D2D2D7", successSoft: "#CDFED4", warningSoft: "#FFF1E3", rowSel: "#EAF4FF", chartMuted: "#D6D6DC" });
  });
  it("graphite dark values are the mock's", () => {
    expect(clearRoles.dark).toMatchObject({
      background: "#000000", foreground: "#FFFFFF", card: "#1C1C1E", muted: "#2C2C2E", mutedForeground: "#B4B4BA", border: "#2C2C30", primary: "#FFFFFF",
      primaryForeground: "#000000", primaryText: "#4DA3FF", ring: "#4DA3FF", destructive: "#FF453A", successText: "#6AE08A", infoText: "#7CC0FF", warningText: "#FFB340",
    });
    expect(clearTradeColors("cafe", "dark").accent).toBe("#E0A57F");
    expect(clearTradeColors("cafe", "light").accent).toBe("#8A5A3C");
  });
  it("glass roles are the mock's (spec 2.8, rev 5)", () => {
    expect(clearGlass.light).toMatchObject({ fill: "rgba(255, 255, 255, 0.58)", fillSide: "rgba(255, 255, 255, 0.4)", fillStrong: "rgba(255, 255, 255, 0.86)", lift: "rgba(255, 255, 255, 0.82)", blur: 22, blurStrong: 32, sat: 1.9 });
    expect(clearGlass.dark).toMatchObject({ fill: "rgba(84, 84, 92, 0.52)", fillStrong: "rgba(50, 50, 56, 0.84)", lift: "rgba(255, 255, 255, 0.22)", sat: 1.8 });
    expect(clearGlassSolid.light).toMatchObject({ fill: "#F2F2F4", fillStrong: "#F7F7F9", lift: "#FFFFFF", blur: 0 });
  });
});

describe("Clear contrast (every v3 pair, light and dark)", () => {
  const cases = themes.flatMap((theme) =>
    contrastPairsV3.filter((p) => !p.themes || p.themes.includes(theme)).map((p) => [`${theme}: ${p.fg} on ${p.bg} (>= ${p.min})`, theme, p] as const),
  );
  it.each(cases)("%s", (_l, theme, p) => {
    const r = clearRoles[theme] as unknown as Record<string, string>;
    const ratio = contrastRatio(r[p.fg]!, r[p.bg]!);
    expect(ratio, `${r[p.fg]} on ${r[p.bg]} = ${fmt(ratio)} (${p.note})`).toBeGreaterThanOrEqual(p.min);
  });
});

describe("Clear-only pairs: links, status chips, toast, text on glass", () => {
  for (const theme of themes) {
    const r = clearRoles[theme];
    const e = { ...clearExtra[theme], ...clearExtraSolid[theme] };
    const g = clearGlass[theme];
    const gs = clearGlassSolid[theme];
    // Worst case behind the glass: the canvas and the card (the content that scrolls under it).
    const behind = [r.background, r.card];
    const onGlass = (fill: string) => behind.map((b) => composite(fill, b));
    const pairs: [string, string, string, number][] = [
      ["link on card", e.link, r.card, WCAG.AA_TEXT],
      ["link on canvas", e.link, r.background, WCAG.AA_TEXT],
      ["success chip", r.successText, e.successSoft, WCAG.AA_TEXT],
      ["warning chip", r.warningText, e.warningSoft, WCAG.AA_TEXT],
      ["info chip", r.infoText, r.infoSoft, WCAG.AA_TEXT],
      ["critical chip", e.destructiveText, e.destructiveSoft, WCAG.AA_TEXT],
      ["muted text on card", r.mutedForeground, r.card, WCAG.AA_TEXT],
      ["text on selected row", r.foreground, e.rowSel, WCAG.AA_TEXT],
      ["toast text", e.toastFg, e.toastBg, WCAG.AA_TEXT],
      ["toast text (reduced transparency)", e.toastFg, gs.toastBg, WCAG.AA_TEXT],
      ["primary label", r.primaryForeground, r.primary, WCAG.AA_TEXT],
      ["chart current bar on card", e.chartHi, r.card, WCAG.AA_UI],
      ["tile glyph on tile", r.tilePeachForeground, e.tile, WCAG.AA_TEXT],
      ...onGlass(g.fill).flatMap((bg, i): [string, string, string, number][] => [
        [`text on glass over ${behind[i]}`, r.foreground, bg, WCAG.AA_TEXT],
        [`muted text on glass over ${behind[i]}`, r.mutedForeground, bg, WCAG.AA_TEXT],
      ]),
      ...onGlass(g.fillStrong).map((bg, i): [string, string, string, number] => [`muted text on strong glass over ${behind[i]}`, r.mutedForeground, bg, WCAG.AA_TEXT]),
      ...onGlass(g.fillSide).map((bg, i): [string, string, string, number] => [`muted text on the sidebar over ${behind[i]}`, r.mutedForeground, bg, WCAG.AA_TEXT]),
      ...onGlass(g.lift).map((bg, i): [string, string, string, number] => [`text on lifted glass over ${behind[i]}`, r.foreground, bg, WCAG.AA_TEXT]),
      [`muted text on reduced-transparency glass`, r.mutedForeground, String(gs.fill), WCAG.AA_TEXT],
      [`muted text on the search field (seg track over glass)`, r.mutedForeground, composite(g.segTrack, composite(g.fill, r.background)), WCAG.AA_TEXT],
    ];
    it.each(pairs)(`${theme}: %s`, (_n, fg, bg, min) => {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `${fg} on ${bg} = ${fmt(ratio)}`).toBeGreaterThanOrEqual(min);
    });
  }
});

describe("Clear trade accents (every family, light and dark)", () => {
  const cases = themes.flatMap((theme) => TRADE_FAMILIES.map((f) => [`${theme} ${f}`, theme, f] as const));
  it.each(cases)("%s: label on the accent, glyph on card, canvas, icon tile and the active nav item", (_l, theme: ThemeName, f: TradeFamily) => {
    const t = clearTradeColors(f, theme);
    const r = clearRoles[theme];
    const checks: [string, string, string, number][] = [
      ["initials on the shop mark", t.foreground, t.accent, WCAG.AA_TEXT],
      ["glyph on the card", t.accent, r.card, WCAG.AA_UI],
      ["glyph on the canvas", t.accent, r.background, WCAG.AA_UI],
      ["glyph on the icon tile", t.accent, t.soft, WCAG.AA_UI],
      ["glyph on the active nav item", t.accent, t.nav, WCAG.AA_UI],
      ["text on the active nav item", r.foreground, t.nav, WCAG.AA_TEXT],
    ];
    for (const [n, fg, bg, min] of checks) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `${theme} ${f} ${n}: ${fg} on ${bg} = ${fmt(ratio)}`).toBeGreaterThanOrEqual(min);
    }
  });
});

describe("Clear CSS", () => {
  const css = buildTokensCss();
  it("scopes Clear under data-theme-style and makes dark opt-in only", () => {
    expect(css).toContain(':root[data-theme-style="clear"],\n[data-theme-style="clear"] [data-theme="light"]');
    expect(css).toContain(':root[data-theme-style="clear"][data-theme="dark"],');
    const clearStart = css.indexOf("/* ===== Clear");
    expect(clearStart).toBeGreaterThan(-1);
    // No prefers-color-scheme block inside the Clear section: the OS never turns Clear dark.
    expect(css.slice(clearStart)).not.toContain("prefers-color-scheme");
    expect(css.slice(clearStart)).toContain("--background: #F2F2F7;");
    expect(css.slice(clearStart)).toContain("--lg-fill: rgba(255, 255, 255, 0.58);");
    expect(css.slice(clearStart)).toContain("--lg-blur: 22px;");
    expect(css.slice(clearStart)).toContain("@media (prefers-reduced-transparency: reduce)");
  });
  it("leaves Warm's blocks as they were and gives Warm opaque glass", () => {
    const warm = css.slice(0, css.indexOf("/* ===== Clear"));
    expect(warm).toContain("--background: #FBF6EE;");
    expect(warm).toContain("--lg-blur: 0px;");
    expect(warm).not.toContain("data-theme-style");
  });
  it("emits Clear trade rules for every family in light and dark", () => {
    for (const f of TRADE_FAMILIES) expect(css).toContain(`--trade: ${clearTradeColors(f, "dark").accent};`);
    expect(css).toContain(':root[data-theme-style="clear"] [data-trade="cafe"]');
    expect(css).toContain(':root[data-theme-style="clear"][data-theme="dark"] [data-trade="cafe"]');
  });
  it("theme.css has the Clear colour names, variants and glass utilities", () => {
    const theme = buildThemeCss();
    for (const n of CLEAR_COLOR_NAMES) expect(theme, n).toContain(`--color-${n}: var(--${n});`);
    for (const u of ["glass", "glass-chrome", "glass-sheet", "glass-side", "glass-lite", "glass-lift", "glass-seg-on", "seg-track", "card-clear", "divide-overlay", "scroll-edge-top", "scroll-edge-bottom"]) {
      expect(theme, u).toContain(`@utility ${u} {`);
    }
    expect(theme).toContain("@custom-variant clear");
    expect(theme).toContain(':root:not([data-theme="light"]):not([data-theme-style="clear"])');
    expect(theme).not.toMatch(/undefined|NaN/);
  });
});
