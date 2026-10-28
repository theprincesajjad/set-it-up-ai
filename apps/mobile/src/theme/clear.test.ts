import { contrastRatio, mix, TRADE_FAMILIES } from "@ll/design-tokens";
import { describe, expect, it } from "vitest";
import { clearRoles as pkgRoles, clearGlass as pkgGlass } from "@ll/design-tokens";
import { clearColorRoles, clearExtras, clearGlass, clearPhone, clearRoles, clearTradeColors } from "./clear";

const HEX = /^#[0-9A-F]{6}$/i;

describe("Clear tokens mirror docs/design/v3.2-clear.md", () => {
  it("light canvas, ink, hairline, black primary and link blue (rev 5)", () => {
    const r = clearRoles.light;
    expect(r.background).toBe("#F2F2F7");
    expect(r.foreground).toBe("#17171A");
    expect(r.border).toBe("#E5E5EA");
    expect(r.card).toBe("#FFFFFF");
    expect(r.primary).toBe("#17171A");
    expect(r.mutedForeground).toBe("#54545A");
    expect(clearExtras.light.link).toBe("#0066CC");
  });
  it("native reads the package's Clear values (no drift from the web CSS)", () => {
    expect(clearRoles).toBe(pkgRoles);
    expect(clearGlass("light").fill).toBe(pkgGlass.light.fill);
    expect(clearGlass("dark").shadowLg).toBe(pkgGlass.dark.shadowLg);
  });
  it("every role is a hex colour in both schemes", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const [k, v] of Object.entries(clearRoles[scheme])) expect(v, `${scheme} ${k}`).toMatch(HEX);
    }
  });
  it("text pairs pass AA (4.5:1) in both schemes", () => {
    for (const scheme of ["light", "dark"] as const) {
      const r = clearRoles[scheme];
      const x = clearExtras[scheme];
      const pairs: [string, string, string][] = [
        ["foreground/background", r.foreground, r.background],
        ["foreground/card", r.foreground, r.card],
        ["muted/background", r.mutedForeground, r.background],
        ["muted/card", r.mutedForeground, r.card],
        ["muted/muted", r.mutedForeground, r.muted],
        ["primaryForeground/primary", r.primaryForeground, r.primary],
        ["link/card", x.link, r.card],
        ["link/background", x.link, r.background],
        ["infoText/infoSoft", r.infoText, r.infoSoft],
        ["destructive/card", r.destructive, r.card],
      ];
      pairs.push(["successText/successSoft", r.successText, x.successSoft]);
      pairs.push(["destructiveText/destructiveSoft", x.destructiveText, x.destructiveSoft]);
      for (const [name, fg, bg] of pairs) expect(contrastRatio(fg, bg), `${scheme} ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("the trade mark text reads on every trade colour (light white, dark ink)", () => {
    for (const f of TRADE_FAMILIES) {
      for (const scheme of ["light", "dark"] as const) {
        const t = clearTradeColors(f, scheme);
        expect(contrastRatio(t.foreground, t.accent), `${f} ${scheme}`).toBeGreaterThanOrEqual(4.5);
        // Glyph on the 14% tile tint (icons: 3:1).
        expect(contrastRatio(t.accent, t.soft), `${f} ${scheme} tile`).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it("the tile tint is the accent at 14% over the card", () => {
    expect(clearTradeColors("cafe", "light").soft).toBe(mix("#FFFFFF", "#8A5A3C", 0.14));
  });
  it("muted text stays AA on the opaque (reduce transparency) glass", () => {
    for (const scheme of ["light", "dark"] as const) {
      const g = clearGlass(scheme, true);
      expect(contrastRatio(clearRoles[scheme].mutedForeground, g.fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(clearRoles[scheme].mutedForeground, g.fillStrong)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("v2 names alias the Clear roles", () => {
    const c = clearColorRoles("light");
    expect(c.bg).toBe(clearRoles.light.background);
    expect(c.brand).toBe(clearRoles.light.primary);
    expect(c.line).toBe(clearRoles.light.border);
    expect(c.fgMuted).toBe(clearRoles.light.mutedForeground);
  });
  it("phone layout spec: 16 margin, 2 x 171 + 16 = 358, concentric frames", () => {
    const L = clearPhone;
    expect(2 * L.column + L.gutter + 2 * L.margin).toBe(390);
    expect(L.tabBar.height).toBe(L.tabBar.inset * 2 + L.tabBar.tab);
    expect(L.tabBar.tabRadius).toBe(L.tabBar.radius - L.tabBar.inset);
    expect(L.cta.frame).toBe(L.cta.inset * 2 + L.cta.button);
    expect(L.cta.buttonRadius).toBe(L.cta.radius - L.cta.inset);
    expect(5 * L.pass.stamp + 4 * L.pass.stampGap + 2 * L.pass.padding).toBe(358);
  });
});
