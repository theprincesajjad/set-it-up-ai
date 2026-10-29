#!/usr/bin/env node
/**
 * The 3D icon pipeline (docs/design/onboarding-v1.md section 6.5).
 *
 *   node scripts/icons3d.mjs            author the set, lint it, write css/icons3d.css and the sprite, render @2x PNGs, copy to web and mobile
 *   node scripts/icons3d.mjs --lint     lint the committed assets only (no writes); this is what `pnpm --filter @ll/design-tokens build` fails on
 *
 * The set is authored in code (scripts/icons3d/*.mjs: one engine, one fixed light, three flat tones per material) so every object is lit
 * the same way. The SVGs use CSS variables with fallbacks, so one file serves every trade colour and both themes.
 *
 * Lint (fails the build): no linearGradient, radialGradient, mesh or pattern, no filter or fe* element, no url() paint, no raw colour outside
 * the <style> block, no opacity attribute (the shadow's fill-opacity lives in the style block), no unknown fill class, the right viewBox,
 * every name in src/icons3d.ts present and nothing extra.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(here, "..");
const assets = path.join(pkg, "assets", "icons3d");
const lintOnly = process.argv.includes("--lint");

const mod = await tsImport("../src/icons3d.ts", import.meta.url);
const { ICON3D_NAMES, ICON3D_SCENES, ICON3D_VIEWBOX, icons3dCss } = mod;

// --- lint -----------------------------------------------------------------------------------------------------------------------------

const FORBIDDEN = [
  [/<\s*(linearGradient|radialGradient|meshgradient|meshGradient|conicGradient|pattern|filter|mask|image|foreignObject|script|animate\w*|set)\b/i, "forbidden element"],
  [/<\s*fe[A-Z]\w*/, "filter primitive"],
  [/\bfilter\s*[=:]/i, "filter attribute"],
  [/url\(\s*#/i, "url() paint or filter reference"],
  [/gradient/i, "gradient"],
  [/\sopacity\s*=/i, "opacity attribute (shadow opacity lives in the style block)"],
  [/\sstyle\s*=\s*"[^"]*(gradient|filter|blur|drop-shadow)/i, "inline style effect"],
];
const FILL_CLASSES = new Set(["n1", "n2", "n3", "a1", "a2", "a3", "ik", "on", "w", "s", "sh"]);

export function lintSvg(name, svg) {
  const errs = [];
  for (const [re, what] of FORBIDDEN) if (re.test(svg)) errs.push(`${name}: ${what}`);
  const vb = ICON3D_SCENES.includes(name) ? ICON3D_VIEWBOX.scene : ICON3D_VIEWBOX.object;
  if (!svg.includes(`viewBox="0 0 ${vb.w} ${vb.h}"`)) errs.push(`${name}: viewBox must be 0 0 ${vb.w} ${vb.h}`);
  const body = svg.replace(/<style>[\s\S]*?<\/style>/g, "");
  if (/#[0-9a-fA-F]{3,8}\b/.test(body)) errs.push(`${name}: raw colour outside the style block`);
  if (/\sfill="(?!none)/.test(body)) errs.push(`${name}: fill attribute (use a tone class)`);
  for (const m of body.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (!FILL_CLASSES.has(c)) errs.push(`${name}: unknown class "${c}"`);
  if (/stroke-width/.test(body) && !/class="s /.test(body)) errs.push(`${name}: stroke without the mark class`);
  return errs;
}

export function lintDir(dir = assets) {
  const errs = [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)) : [];
  for (const n of ICON3D_NAMES) if (!files.includes(n)) errs.push(`${n}: missing from assets/icons3d`);
  for (const f of files) if (!ICON3D_NAMES.includes(f)) errs.push(`${f}: not in src/icons3d.ts`);
  for (const f of files) errs.push(...lintSvg(f, fs.readFileSync(path.join(dir, `${f}.svg`), "utf8")));
  return errs;
}

function report(errs) {
  if (errs.length) {
    console.error(`icons3d lint failed (${errs.length}):\n  ${errs.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`icons3d lint ok: ${ICON3D_NAMES.length} icons, no gradient, no filter, no raw colour`);
}

if (lintOnly) {
  report(lintDir());
  process.exit(0);
}

// --- author ---------------------------------------------------------------------------------------------------------------------------

fs.mkdirSync(assets, { recursive: true });
const { authorAll } = await import(pathToFileURL(path.join(here, "icons3d", "author.mjs")).href);
const authored = authorAll();
for (const [name, svg] of Object.entries(authored)) fs.writeFileSync(path.join(assets, `${name}.svg`), svg + "\n");
report(lintDir());

// --- css, sprite ----------------------------------------------------------------------------------------------------------------------

fs.writeFileSync(path.join(pkg, "css", "icons3d.css"), icons3dCss());

const styleOf = (svg) => /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? "";
const first = fs.readFileSync(path.join(assets, `${ICON3D_NAMES[0]}.svg`), "utf8");
const symbols = ICON3D_NAMES.map((n) => {
  const svg = fs.readFileSync(path.join(assets, `${n}.svg`), "utf8");
  const vb = /viewBox="([^"]+)"/.exec(svg)[1];
  const inner = svg.replace(/^[\s\S]*?<\/style>/, "").replace(/<\/svg>\s*$/, "");
  return `<symbol id="${n}" viewBox="${vb}">${inner}</symbol>`;
});
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none"><style>${styleOf(first)}</style>${symbols.join("")}</svg>\n`;
fs.writeFileSync(path.join(assets, "sprite.svg"), sprite);

// --- PNG @2x --------------------------------------------------------------------------------------------------------------------------

function loadSharp() {
  const req = createRequire(import.meta.url);
  try { return req("sharp"); } catch {}
  try {
    const nextPkg = req.resolve("next/package.json", { paths: [path.join(pkg, "..", "..", "apps", "web")] });
    return createRequire(nextPkg)("sharp");
  } catch {}
  return null;
}
const sharp = loadSharp();
const resolveVars = (svg) => svg.replace(/var\(--i3d-[\w-]+,\s*([^)]+)\)/g, "$1");
if (sharp) {
  for (const n of ICON3D_NAMES) {
    const svg = resolveVars(fs.readFileSync(path.join(assets, `${n}.svg`), "utf8"));
    const vb = ICON3D_SCENES.includes(n) ? ICON3D_VIEWBOX.scene : ICON3D_VIEWBOX.object;
    // The shadow's opacity comes from the CSS variable in the style block; the fallback .028 x 3 stacked = the 8% shadow.
    await sharp(Buffer.from(svg), { density: 72 * 4 }).resize(vb.w * 2, vb.h * 2).png({ compressionLevel: 9 }).toFile(path.join(assets, `${n}@2x.png`));
  }
  console.log(`icons3d: rendered ${ICON3D_NAMES.length} @2x PNGs`);
} else {
  console.warn("icons3d: sharp not found, PNGs not rendered (pnpm install brings it with apps/web)");
}

// --- copy -----------------------------------------------------------------------------------------------------------------------------

const targets = [
  [path.join(pkg, "..", "..", "apps", "web", "public", "icons3d"), true],
  [path.join(pkg, "..", "..", "apps", "mobile", "assets", "icons3d"), false],
];
for (const [dest, withSprite] of targets) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(assets)) {
    if (f === "sprite.svg" && !withSprite) continue;
    fs.copyFileSync(path.join(assets, f), path.join(dest, f));
  }
}
console.log("icons3d: copied to apps/web/public/icons3d and apps/mobile/assets/icons3d");
