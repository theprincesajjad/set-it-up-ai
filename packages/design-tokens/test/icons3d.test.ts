import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { ICON3D_NAMES, ICON3D_OBJECTS, ICON3D_SCENES, ICON3D_VIEWBOX, TRADE_FAMILIES, icon3dAccent, icon3dFamily, icon3dNeutral, icon3dTones, icons3dCss, contrastRatio, tradeFamilies } from "../src/index.js";

const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(pkg, "assets", "icons3d");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lint: any = await import(pathToFileURL(path.join(pkg, "scripts", "icons3d", "lint.mjs")).href);

describe("3D icon set", () => {
  it("has every object and scene in the doc's list, and nothing extra", () => {
    expect(ICON3D_OBJECTS.length).toBe(34);
    expect(ICON3D_SCENES.length).toBe(7);
    expect(lint.lintDir(assets, ICON3D_NAMES, ICON3D_SCENES, ICON3D_VIEWBOX)).toEqual([]);
  });
  it("the lint script passes from the command line", () => {
    execFileSync("node", [path.join(pkg, "scripts", "icons3d.mjs"), "--lint"], { cwd: pkg, stdio: "pipe" });
  });
  it("the lint rejects a gradient, a filter, a raw colour and an unknown class", () => {
    const base = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><style>.n1{fill:var(--i3d-n1,#F2F2F7)}</style>`;
    const bad = (inner: string) => lint.lintSvg("x", `${base}${inner}</svg>`, [], ICON3D_VIEWBOX);
    expect(bad(`<linearGradient id="g"/>`).length).toBeGreaterThan(0);
    expect(bad(`<radialGradient id="g"/>`).length).toBeGreaterThan(0);
    expect(bad(`<filter id="f"><feGaussianBlur/></filter>`).length).toBeGreaterThan(0);
    expect(bad(`<path class="n1" style="filter:blur(2px)" d="M0 0"/>`).length).toBeGreaterThan(0);
    expect(bad(`<path fill="#ff0000" d="M0 0"/>`).length).toBeGreaterThan(0);
    expect(bad(`<path class="rainbow" d="M0 0"/>`).length).toBeGreaterThan(0);
    expect(bad(`<path class="n1" d="M0 0"/>`)).toEqual([]);
  });
  it("uses the 48 grid for objects and 160 x 120 for scenes", () => {
    for (const n of ICON3D_NAMES) {
      const svg = fs.readFileSync(path.join(assets, `${n}.svg`), "utf8");
      const vb = (ICON3D_SCENES as readonly string[]).includes(n) ? ICON3D_VIEWBOX.scene : ICON3D_VIEWBOX.object;
      expect(svg).toContain(`viewBox="0 0 ${vb.w} ${vb.h}"`);
      expect(fs.existsSync(path.join(assets, `${n}@2x.png`))).toBe(true);
    }
  });
  it("draws exactly one contact shadow group per object and only neutral, accent, ink and white tones", () => {
    for (const n of ICON3D_OBJECTS) {
      const svg = fs.readFileSync(path.join(assets, `${n}.svg`), "utf8");
      expect((svg.match(/<g class="sh">/g) ?? []).length).toBe(1);
      expect((svg.match(/<ellipse/g) ?? []).length).toBe(3);
    }
  });
  it("the sprite has a symbol for every name", () => {
    const sprite = fs.readFileSync(path.join(assets, "sprite.svg"), "utf8");
    for (const n of ICON3D_NAMES) expect(sprite).toContain(`<symbol id="${n}"`);
    expect(lint.lintSvg("sprite", sprite.replace("<svg ", '<svg viewBox="0 0 48 48" '), ICON3D_NAMES as unknown as string[], ICON3D_VIEWBOX).filter((e: string) => /gradient|filter/.test(e))).toEqual([]);
  });
});

describe("icon3dTones and the stylesheet", () => {
  it("lit is the colour, mid 18% and shade 36% toward ink", () => {
    const t = icon3dTones("#2873B0");
    expect(t.lit).toBe("#2873B0");
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(t.lit)).toBeGreaterThan(lum(t.mid));
    expect(lum(t.mid)).toBeGreaterThan(lum(t.shade));
  });
  it("the fallback colours in the SVGs equal the tones for sky", () => {
    const svg = fs.readFileSync(path.join(assets, "nails.svg"), "utf8");
    const t = icon3dTones(tradeFamilies.sky.accent);
    expect(svg).toContain(`--i3d-a1,${t.lit}`);
    expect(svg).toContain(`--i3d-a2,${t.mid}`);
    expect(svg).toContain(`--i3d-a3,${t.shade}`);
    expect(svg).toContain(`--i3d-n1,${icon3dNeutral.light.lit}`);
    expect(svg).toContain(`--i3d-n3,${icon3dNeutral.light.shade}`);
  });
  it("the stylesheet has the dark body tones and all 14 families, and the committed file is current", () => {
    const css = icons3dCss();
    expect(css).toContain(icon3dNeutral.dark.lit);
    for (const f of TRADE_FAMILIES) expect(css).toContain(`data-fam="${f}"`);
    expect(css).not.toMatch(/gradient/);
    expect(fs.readFileSync(path.join(pkg, "css", "icons3d.css"), "utf8")).toBe(css);
  });
  it("maps verticals to families and keeps the accent legible against the neutral body", () => {
    expect(icon3dFamily("salon")).toBe("rose");
    expect(icon3dFamily("barber")).toBe("barber");
    expect(icon3dFamily(undefined)).toBe("sky");
    for (const f of TRADE_FAMILIES) {
      // the accent must read against the lit body (3:1) in light and against the dark body in dark
      expect(contrastRatio(icon3dAccent(f, "light"), icon3dNeutral.light.lit)).toBeGreaterThan(3);
      expect(contrastRatio(icon3dAccent(f, "dark"), icon3dNeutral.dark.lit)).toBeGreaterThan(3);
    }
  });
});
