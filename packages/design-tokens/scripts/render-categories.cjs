/**
 * Render assets/categories/*.svg → <name>.png, <name>@2x.png, <name>@3x.png (64/128/192 px).
 * Needs `sharp` resolvable (it is in the workspace via Next.js):
 *   node packages/design-tokens/scripts/render-categories.cjs
 * Metro picks the @2x/@3x variants automatically:
 *   <Image source={require("@ll/design-tokens/assets/categories/coffee.png")} style={{ width: 28, height: 28 }} />
 */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

function loadSharp() {
  try {
    return require("sharp");
  } catch {}
  try {
    // sharp ships with Next.js (apps/web); resolve it through next.
    const nextPkg = require.resolve("next/package.json", { paths: [path.join(__dirname, "../../../apps/web")] });
    return createRequire(nextPkg)("sharp");
  } catch {}
  throw new Error("sharp not found: run `pnpm install` (apps/web brings it) or `pnpm dlx sharp-cli`.");
}

const sharp = loadSharp();
const dir = path.join(__dirname, "..", "assets", "categories");
(async () => {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".svg"))) {
    const name = file.replace(/\.svg$/, "");
    const svg = fs.readFileSync(path.join(dir, file));
    for (const [s, suffix] of [[1, ""], [2, "@2x"], [3, "@3x"]]) {
      await sharp(svg, { density: 72 * s }).resize(64 * s, 64 * s).png({ compressionLevel: 9 }).toFile(path.join(dir, `${name}${suffix}.png`));
    }
    console.log(`rendered ${name}`);
  }
})();
