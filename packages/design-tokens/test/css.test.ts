import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERTICALS } from "@ll/shared";
import { buildThemeCss, buildTokensCss } from "../src/css.js";
import { buildMapJson } from "../src/map-json.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssDir = join(root, "css");

describe("generated css", () => {
  it("committed css/tokens.css is up to date (run build:css)", () => {
    expect(readFileSync(join(cssDir, "tokens.css"), "utf8")).toBe(buildTokensCss());
  });
  it("committed css/theme.css is up to date (run build:css)", () => {
    expect(readFileSync(join(cssDir, "theme.css"), "utf8")).toBe(buildThemeCss());
  });
  it("committed map/*.json is up to date (run build:css)", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(readFileSync(join(root, "map", `corner-${mode}.json`), "utf8")).toBe(buildMapJson(mode));
    }
  });
  it("tokens.css has light, dark media and forced dark blocks", () => {
    const css = buildTokensCss();
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain('[data-theme="dark"] {');
    expect(css).toContain("--background: #FBF6EE;");
    expect(css).toContain("--ll-color-bg: var(--background);");
    expect(css).toContain("--ll-shadow-float: 0 1px 2px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.08);");
    expect(css).not.toMatch(/undefined|NaN/);
  });
  it("theme.css is a Tailwind v4 theme with the v2 type scale and fonts", () => {
    const css = buildThemeCss();
    expect(css).toContain("@theme inline {");
    expect(css).toContain("--color-bg: var(--ll-color-bg);");
    expect(css).toContain("--color-background: var(--background);");
    expect(css).toContain("--color-points-text: var(--points-text);");
    expect(css).toContain('var(--font-noto-nastaliq, "Noto Nastaliq Urdu")');
    expect(css).toContain("--text-body: 0.9375rem;");
    expect(css).toContain("--text-display-number: 2.5rem;");
    expect(css).toContain('var(--font-bricolage, "Bricolage Grotesque")');
    expect(css).toContain('var(--font-inter, "Inter")');
    expect(css).toContain('--font-display: var(--font-fraunces, "Fraunces"), var(--font-noto-deva');
    expect(css).not.toMatch(/Figtree|pine|marigold/i);
    expect(css).not.toMatch(/undefined|NaN/);
  });
  it("tokens.css defines every v3 role in light, the dark media query and forced dark", () => {
    const css = buildTokensCss();
    const light = css.slice(css.indexOf(":root,\n[data-theme=\"light\"]"), css.indexOf("@media (prefers-color-scheme: dark)"));
    const media = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("/* Dark theme: forced */"));
    const forced = css.slice(css.indexOf("/* Dark theme: forced */"));
    for (const [block, bg] of [[light, "#FBF6EE"], [media, "#1A1410"], [forced, "#1A1410"]] as const) {
      expect(block).toContain(`--background: ${bg};`);
      for (const v of ["--foreground", "--card", "--popover", "--primary", "--secondary", "--muted", "--muted-foreground", "--accent", "--destructive", "--border", "--input", "--ring", "--sidebar", "--sidebar-accent", "--points", "--points-text", "--points-soft", "--points-foreground", "--success", "--info", "--warning", "--paper", "--chart-1", "--chart-5", "--primary-text", "--forest", "--tile-peach", "--tile-peach-foreground", "--tile-mint", "--tile-butter", "--tile-lilac", "--tile-sky", "--tile-rose-foreground", "--trade", "--trade-foreground", "--trade-alt", "--trade-soft", "--trade-deep"]) {
        expect(block, v).toContain(`${v}: `);
      }
    }
    expect(css).toContain("--radius: 0.625rem;");
  });
  it("theme.css maps the shadcn names, points is the orange, accent is the hover surface, and only the v2 aliases still in use remain", () => {
    const css = buildThemeCss();
    for (const n of ["background", "foreground", "card", "popover", "primary", "secondary", "muted", "muted-foreground", "destructive", "border", "input", "ring", "sidebar", "sidebar-accent", "points", "points-text", "points-soft", "success", "info", "warning", "paper", "chart-1", "chart-5", "hover"]) {
      expect(css, n).toContain(`--color-${n}: var(--`);
    }
    expect(css).toContain("--color-accent: var(--accent);");
    expect(css).toContain("--color-accent-foreground: var(--accent-foreground);");
    expect(css).toContain("--color-qr-fg: var(--qr-fg);");
    // The v2 orange names and the unused v1 block are gone from the Tailwind theme (grep proved no call site uses them).
    for (const gone of ["--color-accent-text", "--color-accent-soft", "--color-on-accent", "--color-canvas", "--color-surface", "--color-on-brand", "--color-vertical-cafe-accent"]) expect(css, gone).not.toContain(`${gone}:`);
    expect(css).toContain("--color-hover: var(--accent);");
    expect(css).toContain("--color-fg: var(--ll-color-fg);");
    expect(css).toContain("--radius-lg: var(--radius);");
    expect(css).toContain("--radius-card: 22px;");
    expect(css).toContain("--shadow-sheet: var(--ll-shadow-sheet);");
    expect(css).toContain("--shadow-card: var(--ll-shadow-card);");
    expect(css).toContain("--shadow-glow: var(--ll-shadow-glow);");
    expect(css).toContain("--radius-tile: 20px;");
    for (const n of ["primary-text", "forest", "tile-peach", "tile-peach-foreground", "tile-lilac", "tile-sky", "tile-rose", "trade", "trade-foreground", "trade-alt", "trade-soft", "trade-deep"]) {
      expect(css, n).toContain(`--color-${n}: var(--`);
    }
  });
  it("tokens.css switches the trade accent with [data-trade] for every vertical, in light, the dark media query and forced dark", () => {
    const css = buildTokensCss();
    const start = css.indexOf("/* Per-trade accent families");
    expect(start).toBeGreaterThan(-1);
    const trade = css.slice(start);
    const darkMedia = trade.slice(trade.indexOf("@media (prefers-color-scheme: dark)"));
    for (const v of VERTICALS) {
      expect(trade, v).toContain(`[data-trade="${v}"]`);
      expect(trade, v).toContain(`:root:not([data-theme="light"]) [data-trade="${v}"]`);
      expect(trade, v).toContain(`[data-theme="dark"] [data-trade="${v}"]`);
    }
    expect(darkMedia).toContain("--trade-deep:");
    // A forced-light area inside a dark page takes the light trade values, with enough specificity to beat the dark media block, and after it.
    const forcedLight = trade.indexOf("/* Forced light inside a dark page */");
    expect(forcedLight).toBeGreaterThan(trade.indexOf("@media (prefers-color-scheme: dark)"));
    for (const v of VERTICALS) {
      expect(trade, v).toContain(`:root [data-theme="light"] [data-trade="${v}"]`);
      expect(trade, v).toContain(`:root [data-theme="light"][data-trade="${v}"]`);
    }
    expect(trade.slice(forcedLight)).toMatch(/:root \[data-theme="light"\]\[data-trade="cafe"\][^{]*\{\n  --trade: #8A5A3C;/);
    expect(trade).toMatch(/\[data-trade="cafe"\] \{\n  --trade: #8A5A3C;/);
    expect(css).toContain("--ll-shadow-glow: 0 8px 20px -6px rgba(200, 69, 44, 0.45);");
  });
});
