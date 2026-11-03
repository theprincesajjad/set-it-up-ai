import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/contrast.js";
import { buildThemeCss, buildTokensCss } from "../src/css.js";
import { MARKETING_VARS, marketingColors as M } from "../src/marketing.js";

describe("marketing landing tokens (wave R)", () => {
  it("text roles and the accent reach AA on paper, the stock and the hero wall", () => {
    for (const bg of [M.paper, M.raised, M.stock]) {
      expect(contrastRatio(M.ink, bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(M.text2, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(M.muted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(M.vermilion, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(M.ink, M.wall)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(M.text2, M.wall)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(M.onInk, M.ink)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(M.onInk, M.inkHover)).toBeGreaterThanOrEqual(7);
  });
  it("is scoped to .mkt and mapped for Tailwind", () => {
    const css = buildTokensCss();
    const block = css.slice(css.indexOf(".mkt {"));
    for (const v of MARKETING_VARS) expect(block).toContain(`${v}:`);
    // Nowhere outside the .mkt block.
    expect(css.slice(0, css.indexOf(".mkt {"))).not.toContain("--mkt-");
    expect(buildThemeCss()).toContain("--color-mkt-paper: var(--mkt-paper);");
    expect(buildThemeCss()).toContain("--font-mkt-serif: var(--mkt-face-serif);");
  });
});
