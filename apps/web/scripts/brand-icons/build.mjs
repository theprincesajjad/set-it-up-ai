/**
 * Rasterises the mark for the places that cannot take an SVG: the iPhone home-screen icon (src/app/apple-icon.png, 180), the web app
 * manifest (public/icons/icon-192.png, icon-512.png, and a full-bleed maskable 512) and favicon.ico (16, 32 and 48, PNG entries).
 * Sources: src/app/icon.svg (the rounded tile) and public/brand/app-icon.svg (full bleed, for masks). Run from apps/web after either
 * drawing changes: `node scripts/brand-icons/build.mjs`. Needs the Playwright Chromium the e2e tests already use.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tile = fs.readFileSync(path.join(root, "src/app/icon.svg"), "utf8");
const bleed = fs.readFileSync(path.join(root, "public/brand/app-icon.svg"), "utf8");

async function png(page, svg, size, transparent) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
}

/** An .ico whose entries are PNGs (every current browser reads these). */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at);
    head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt8(0, at + 2);
    head.writeUInt8(0, at + 3);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.data)]);
}

{
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  fs.writeFileSync(path.join(root, "src/app/apple-icon.png"), await png(page, bleed, 180, false));
  fs.writeFileSync(path.join(root, "public/icons/icon-192.png"), await png(page, tile, 192, true));
  fs.writeFileSync(path.join(root, "public/icons/icon-512.png"), await png(page, tile, 512, true));
  fs.writeFileSync(path.join(root, "public/icons/icon-maskable-512.png"), await png(page, bleed, 512, false));
  const sizes = [16, 32, 48];
  const entries = [];
  for (const size of sizes) entries.push({ size, data: await png(page, tile, size, true) });
  fs.writeFileSync(path.join(root, "src/app/favicon.ico"), ico(entries));
  await browser.close();
}
