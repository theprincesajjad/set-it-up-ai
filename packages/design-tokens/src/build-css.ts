/**
 * Emits:
 *   dist/tokens.css  CSS custom properties (light + dark via prefers-color-scheme and [data-theme])
 *   dist/theme.css   Tailwind v4 @theme block (imports ./tokens.css)
 * and copies both into css/ (committed; dist/ is gitignored), plus
 *   map/corner-light.json, map/corner-dark.json  MapLibre basemap overrides (committed).
 *
 *   pnpm --filter @ll/design-tokens build:css        write files
 *   pnpm --filter @ll/design-tokens check:css        fail if css/ is stale (CI)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildThemeCss, buildTokensCss } from "./css.js";
import { buildMapJson } from "./map-json.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputs = { "tokens.css": buildTokensCss(), "theme.css": buildThemeCss() };
const mapOutputs = { "corner-light.json": buildMapJson("light"), "corner-dark.json": buildMapJson("dark") };

if (process.argv.includes("--check")) {
  const files = [
    ...Object.entries(outputs).map(([n, c]) => [join("css", n), c] as const),
    ...Object.entries(mapOutputs).map(([n, c]) => [join("map", n), c] as const),
  ];
  const stale = files.filter(([rel, content]) => {
    const p = join(root, rel);
    return !existsSync(p) || readFileSync(p, "utf8") !== content;
  });
  if (stale.length) {
    console.error(`Stale design tokens output: ${stale.map(([n]) => n).join(", ")}. Run: pnpm --filter @ll/design-tokens build:css`);
    process.exit(1);
  }
  console.log("design-tokens css/ and map/ are up to date");
} else {
  for (const dir of ["dist", "css"]) {
    mkdirSync(join(root, dir), { recursive: true });
    for (const [name, css] of Object.entries(outputs)) writeFileSync(join(root, dir, name), css);
  }
  mkdirSync(join(root, "map"), { recursive: true });
  for (const [name, json] of Object.entries(mapOutputs)) writeFileSync(join(root, "map", name), json);
  console.log(`Wrote ${Object.keys(outputs).join(", ")} to dist/ and css/; ${Object.keys(mapOutputs).join(", ")} to map/`);
}
