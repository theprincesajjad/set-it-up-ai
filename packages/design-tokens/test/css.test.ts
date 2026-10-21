import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildThemeCss, buildTokensCss } from "../src/css.js";

const cssDir = join(dirname(fileURLToPath(import.meta.url)), "..", "css");

describe("generated css", () => {
  it("committed css/tokens.css is up to date (run build:css)", () => {
    expect(readFileSync(join(cssDir, "tokens.css"), "utf8")).toBe(buildTokensCss());
  });
  it("committed css/theme.css is up to date (run build:css)", () => {
    expect(readFileSync(join(cssDir, "theme.css"), "utf8")).toBe(buildThemeCss());
  });
  it("tokens.css has light, dark media and forced dark blocks", () => {
    const css = buildTokensCss();
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain('[data-theme="dark"] {');
    expect(css).not.toMatch(/undefined|NaN/);
  });
  it("theme.css is a Tailwind v4 theme", () => {
    const css = buildThemeCss();
    expect(css).toContain("@theme inline {");
    expect(css).toContain("--color-brand: var(--ll-color-brand);");
    expect(css).toContain("--text-body: 1rem;");
    expect(css).not.toMatch(/undefined|NaN/);
  });
});
