import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/contrast.js";
import { buildThemeCss, buildTokensCss } from "../src/css.js";
import { MARKETING_VARS, marketingColors as M } from "../src/marketing.js";

describe("marketing landing tokens (wave S)", () => {
  it("text roles reach AA on white and on the soft tints", () => {
    for (const bg of [M.paper, M.soft, M.violetSoft, M.sunSoft, M.mintSoft, M.coralSoft]) {
      expect(contrastRatio(M.ink, bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(M.text2, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(M.muted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(M.violet, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(M.coralInk, M.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(M.coralInk, M.soft)).toBeGreaterThanOrEqual(4.5);
  });
  it("dark ink on the bright blocks, white on violet and ink", () => {
    for (const bg of [M.sun, M.mint, M.coral]) {
      expect(contrastRatio(M.ink, bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(M.text2, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(M.onViolet, M.violet)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(M.onViolet, M.violetHover)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(M.onInk, M.ink)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(M.onInk, M.inkHover)).toBeGreaterThanOrEqual(7);
    // The yellow button on the violet block and the closing band: ink text on sun.
    expect(contrastRatio(M.ink, M.sun)).toBeGreaterThanOrEqual(7);
    // The sun-yellow first-year price on the violet Pro card.
    expect(contrastRatio(M.sun, M.violet)).toBeGreaterThanOrEqual(4.5);
  });
  it("wave T: black, body, quiet and the accent read on white and grey; white and the muted grey on black", () => {
    for (const bg of [M.paper, M.grey, M.greyHover]) {
      expect(contrastRatio(M.black, bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(M.body, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(M.quiet, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(M.accent, bg)).toBeGreaterThanOrEqual(4.5);
    }
    for (const bg of [M.black, M.blackHover]) expect(contrastRatio(M.onBlack, bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(M.onBlackMuted, M.black)).toBeGreaterThanOrEqual(4.5);
  });
  it("is scoped to .mkt and mapped for Tailwind", () => {
    const css = buildTokensCss();
    const block = css.slice(css.indexOf(".mkt {"));
    for (const v of MARKETING_VARS) expect(block).toContain(`${v}:`);
    // Nowhere outside the .mkt block.
    expect(css.slice(0, css.indexOf(".mkt {"))).not.toContain("--mkt-");
    expect(buildThemeCss()).toContain("--color-mkt-paper: var(--mkt-paper);");
    expect(buildThemeCss()).toContain("--color-mkt-violet: var(--mkt-violet);");
    expect(buildThemeCss()).toContain("--font-mkt-display: var(--mkt-face-display);");
    expect(buildThemeCss()).toContain("--color-mkt-black: var(--mkt-black);");
    expect(buildThemeCss()).toContain("--color-mkt-rule: var(--mkt-rule);");
  });
});
