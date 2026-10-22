/**
 * Render the Wallet pass artwork from the v2 brand SVGs (apps/web/public/brand/) with sharp:
 *   node apps/api/scripts/render-wallet-assets.cjs
 * Writes apps/api/assets/wallet/*.png (committed; the API reads them at runtime, no sharp in production).
 *
 *   icon.png / @2x / @3x   29 / 58 / 87 px     app-icon.svg (black tile, four places, accent corner).
 *                                              Apple shows it on the lock screen and in notifications.
 *   logo.png / @2x / @3x   50 / 100 / 150 px   the inverse "four corners" tile from wordmark-inverse.svg
 *                                              (white tile for the near-black pass). iOS sets logoText next to it.
 *   google-logo.png        660 px              app-icon.svg; Google Wallet programLogo (min 660x660, masked to a circle).
 *
 * sharp resolves through Next.js (apps/web), same as packages/design-tokens/scripts/render-categories.cjs.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

function loadSharp() {
  try {
    return require("sharp");
  } catch {}
  try {
    const nextPkg = require.resolve("next/package.json", { paths: [path.join(__dirname, "../../web")] });
    return createRequire(nextPkg)("sharp");
  } catch {}
  throw new Error("sharp not found: run `pnpm install` (apps/web brings it).");
}

const sharp = loadSharp();
const brand = path.join(__dirname, "../../web/public/brand");
const out = path.join(__dirname, "../assets/wallet");
fs.mkdirSync(out, { recursive: true });

const appIcon = fs.readFileSync(path.join(brand, "app-icon.svg"), "utf8");
// Crop the inverse wordmark to its tile (x/y 4..60): the same mark, without the text.
const inverse = fs
  .readFileSync(path.join(brand, "wordmark-inverse.svg"), "utf8")
  .replace(/<text[\s\S]*?<\/text>/, "")
  .replace(/viewBox="[^"]*"/, 'viewBox="4 4 56 56"')
  .replace(/width="340" height="64"/, 'width="56" height="56"');

async function render(svg, size, file) {
  // Rasterise at ~2x the target, then downsample (crisp circle edges).
  const intrinsic = Number(/width="(\d+)"/.exec(svg)[1]);
  const density = Math.min(2400, Math.max(1, Math.ceil((72 * size * 2) / intrinsic)));
  await sharp(Buffer.from(svg), { density }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(out, file));
  console.log(`wrote ${file} (${size}x${size})`);
}

(async () => {
  for (const [s, suffix] of [[1, ""], [2, "@2x"], [3, "@3x"]]) {
    await render(appIcon, 29 * s, `icon${suffix}.png`);
    await render(inverse, 50 * s, `logo${suffix}.png`);
  }
  await render(appIcon, 660, "google-logo.png");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
