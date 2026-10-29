/**
 * The no-gradient lint for the 3D set. Pure: used by scripts/icons3d.mjs (fails the build) and by test/icons3d.test.ts.
 */
import fs from "node:fs";
import path from "node:path";

const FORBIDDEN = [
  [/<\s*(linearGradient|radialGradient|meshgradient|meshGradient|conicGradient|pattern|filter|mask|image|foreignObject|script|animate\w*|set)\b/i, "forbidden element"],
  [/<\s*fe[A-Z]\w*/, "filter primitive"],
  [/\bfilter\s*[=:]/i, "filter attribute"],
  [/url\(\s*#/i, "url() paint or filter reference"],
  [/gradient/i, "gradient"],
  [/\sopacity\s*=/i, "opacity attribute (shadow opacity lives in the style block)"],
  [/\sstyle\s*=\s*"[^"]*(gradient|filter|blur|drop-shadow)/i, "inline style effect"],
];
export const FILL_CLASSES = new Set(["n1", "n2", "n3", "a1", "a2", "a3", "ik", "on", "w", "s", "sh"]);

export function lintSvg(name, svg, scenes, viewbox) {
  const errs = [];
  for (const [re, what] of FORBIDDEN) if (re.test(svg)) errs.push(`${name}: ${what}`);
  const vb = scenes.includes(name) ? viewbox.scene : viewbox.object;
  if (!svg.includes(`viewBox="0 0 ${vb.w} ${vb.h}"`)) errs.push(`${name}: viewBox must be 0 0 ${vb.w} ${vb.h}`);
  const body = svg.replace(/<style>[\s\S]*?<\/style>/g, "");
  if (/#[0-9a-fA-F]{3,8}\b/.test(body)) errs.push(`${name}: raw colour outside the style block`);
  if (/\sfill="(?!none)/.test(body)) errs.push(`${name}: fill attribute (use a tone class)`);
  for (const m of body.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (!FILL_CLASSES.has(c)) errs.push(`${name}: unknown class "${c}"`);
  if (/stroke-width/.test(body) && !/class="s /.test(body)) errs.push(`${name}: stroke without the mark class`);
  return errs;
}

export function lintDir(dir, names, scenes, viewbox) {
  const errs = [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".svg") && f !== "sprite.svg").map((f) => f.slice(0, -4)) : [];
  for (const n of names) if (!files.includes(n)) errs.push(`${n}: missing from assets/icons3d`);
  for (const f of files) if (!names.includes(f)) errs.push(`${f}: not in src/icons3d.ts`);
  for (const f of files) errs.push(...lintSvg(f, fs.readFileSync(path.join(dir, `${f}.svg`), "utf8"), scenes, viewbox));
  return errs;
}
