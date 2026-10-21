/**
 * Emits:
 *   dist/tokens.css  CSS custom properties (light + dark via prefers-color-scheme and [data-theme])
 *   dist/theme.css   Tailwind v4 @theme block (imports ./tokens.css)
 * and copies both into css/ (committed; dist/ is gitignored).
 *
 *   pnpm --filter @ll/design-tokens build:css        write files
 *   pnpm --filter @ll/design-tokens check:css        fail if css/ is stale (CI)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildThemeCss, buildTokensCss } from "./css.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputs = { "tokens.css": buildTokensCss(), "theme.css": buildThemeCss() };

if (process.argv.includes("--check")) {
  const stale = Object.entries(outputs).filter(([name, css]) => {
    const p = join(root, "css", name);
    return !existsSync(p) || readFileSync(p, "utf8") !== css;
  });
  if (stale.length) {
    console.error(`Stale design tokens CSS: ${stale.map(([n]) => n).join(", ")}. Run: pnpm --filter @ll/design-tokens build:css`);
    process.exit(1);
  }
  console.log("design-tokens css/ is up to date");
} else {
  for (const dir of ["dist", "css"]) {
    mkdirSync(join(root, dir), { recursive: true });
    for (const [name, css] of Object.entries(outputs)) writeFileSync(join(root, dir, name), css);
  }
  console.log(`Wrote ${Object.keys(outputs).join(", ")} to dist/ and css/`);
}
