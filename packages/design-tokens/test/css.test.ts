import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
    expect(css).toContain("--background: #FFFFFF;");
    expect(css).toContain("--ll-color-bg: var(--background);");
    expect(css).toContain("--ll-shadow-float: 0 1px 2px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.08);");
    expect(css).not.toMatch(/undefined|NaN/);
  });
  it("theme.css is a Tailwind v4 theme with the v2 type scale and fonts", () => {
    const css = buildThemeCss();
    expect(css).toContain("@theme inline {");
    expect(css).toContain("--color-bg: var(--ll-color-bg);");
    expect(css).toContain("--color-background: var(--background);");
    expect(css).toContain("--color-accent-text: var(--ll-color-accent-text);");
    expect(css).toContain("--text-body: 0.9375rem;");
    expect(css).toContain("--text-display-number: 2.5rem;");
    expect(css).toContain('var(--font-bricolage, "Bricolage Grotesque")');
    expect(css).toContain('var(--font-inter, "Inter")');
    expect(css).not.toMatch(/Figtree|Fraunces|pine|marigold/i);
    expect(css).not.toMatch(/undefined|NaN/);
  });
  it("tokens.css defines every v3 role in light, the dark media query and forced dark", () => {
    const css = buildTokensCss();
    const light = css.slice(css.indexOf(":root,\n[data-theme=\"light\"]"), css.indexOf("@media (prefers-color-scheme: dark)"));
    const media = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("/* Dark theme: forced */"));
    const forced = css.slice(css.indexOf("/* Dark theme: forced */"));
    for (const [block, bg] of [[light, "#FFFFFF"], [media, "#0E0D0C"], [forced, "#0E0D0C"]] as const) {
      expect(block).toContain(`--background: ${bg};`);
      for (const v of ["--foreground", "--card", "--popover", "--primary", "--secondary", "--muted", "--muted-foreground", "--accent", "--destructive", "--border", "--input", "--ring", "--sidebar", "--sidebar-accent", "--points", "--points-text", "--points-soft", "--points-foreground", "--success", "--info", "--warning", "--paper", "--chart-1", "--chart-5"]) {
        expect(block, v).toContain(`${v}: `);
      }
    }
    expect(css).toContain("--radius: 0.625rem;");
  });
  it("theme.css maps the shadcn names, keeps v2 aliases, and holds accent as the orange until the sweep", () => {
    const css = buildThemeCss();
    for (const n of ["background", "foreground", "card", "popover", "primary", "secondary", "muted", "muted-foreground", "destructive", "border", "input", "ring", "sidebar", "sidebar-accent", "points", "points-text", "points-soft", "success", "info", "warning", "paper", "chart-1", "chart-5", "hover"]) {
      expect(css, n).toContain(`--color-${n}: var(--`);
    }
    expect(css).toContain("--color-accent: var(--ll-color-accent);");
    expect(css).toContain("--color-hover: var(--accent);");
    expect(css).toContain("--color-fg: var(--ll-color-fg);");
    expect(css).toContain("--radius-lg: var(--radius);");
    expect(css).toContain("--radius-card: 16px;");
    expect(css).toContain("--shadow-sheet: var(--ll-shadow-sheet);");
  });
});
