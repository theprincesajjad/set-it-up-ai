/**
 * Pass artwork. The real v2 artwork is rendered from the brand SVGs by
 * scripts/render-wallet-assets.cjs into assets/wallet/*.png (committed). The
 * minimal PNG encoder below is only a fallback if those files are missing.
 */
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const ASSET_DIR = new URL("../../assets/wallet/", import.meta.url);
const assetCache = new Map<string, Buffer | null>();

/** Read assets/wallet/<name> (cached). Null if it isn't there. */
export function walletAsset(name: string): Buffer | null {
  if (!assetCache.has(name)) {
    let buf: Buffer | null = null;
    try {
      buf = readFileSync(new URL(name, ASSET_DIR));
    } catch {
      buf = null;
    }
    assetCache.set(name, buf);
  }
  return assetCache.get(name)!;
}

/** PNG width/height from the IHDR chunk. */
export function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export type Rgba = [number, number, number, number];

/** Encode an RGBA pixel function as PNG. */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1]!, 16) : 0x115e59;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Square app icon: brand colour with a white ring (the "network" mark). */
export function iconPng(size: number, hex: string): Buffer {
  const [r, g, b] = hexToRgb(hex);
  const c = (size - 1) / 2;
  return encodePng(size, size, (x, y) => {
    const d = Math.hypot(x - c, y - c) / (size / 2);
    return d > 0.42 && d < 0.62 ? [255, 255, 255, 255] : [r, g, b, 255];
  });
}

/** Logo strip (transparent) with the white ring mark at the left. */
export function logoPng(width: number, height: number): Buffer {
  const c = height / 2;
  return encodePng(width, height, (x, y) => {
    const d = Math.hypot(x - c, y - c) / (height / 2);
    return d > 0.42 && d < 0.72 ? [255, 255, 255, 255] : [0, 0, 0, 0];
  });
}
