/**
 * Brand colours from a website: the theme-color meta, CSS custom properties named like a brand colour, the most frequent
 * non-neutral colours in the linked CSS (capped), and the logo's dominant colour (PNG; other formats are skipped). A primary
 * and an accent are picked, then run through the shop colour helper (packages/design-tokens shopColor) so what the owner is
 * offered already passes contrast on the pass and the shop page.
 */
import { inflateSync } from "node:zlib";
import { contrastRatio, normaliseBrandColor, resolveShopColors } from "@ll/design-tokens";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const toHex = (c: Rgb) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();

const NAMED: Record<string, string> = { red: "#FF0000", blue: "#0000FF", green: "#008000", purple: "#800080", orange: "#FFA500", teal: "#008080", navy: "#000080", maroon: "#800000", pink: "#FFC0CB", gold: "#FFD700", crimson: "#DC143C", coral: "#FF7F50", tomato: "#FF6347", salmon: "#FA8072", olive: "#808000" };

/** One CSS colour value (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl(), a few names) to #RRGGBB, or null. Transparent-ish values are dropped. */
export function parseCssColor(v: string): string | null {
  const s = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,4})$/.exec(s);
  if (m) {
    const [r, g, b, a] = m[1]!.split("").map((x) => parseInt(x + x, 16));
    if (a !== undefined && a < 128) return null;
    return toHex({ r: r!, g: g!, b: b! });
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) {
    if (m[2] && parseInt(m[2], 16) < 128) return null;
    return `#${m[1]!.toUpperCase()}`;
  }
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 0.5) return null;
    }
    return toHex({ r: +m[1]!, g: +m[2]!, b: +m[3]! });
  }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) return hslToHex(+m[1]!, +m[2]! / 100, +m[3]! / 100);
  return NAMED[s] ?? null;
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hsl(c: Rgb): { h: number; s: number; l: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** Greys, near-white and near-black do not say anything about a brand. */
export function isNeutral(hex: string): boolean {
  const { s, l } = hsl(hexToRgb(hex));
  return s < 0.18 || l > 0.94 || l < 0.08;
}

const hueGap = (a: string, b: string) => {
  const d = Math.abs(hsl(hexToRgb(a)).h - hsl(hexToRgb(b)).h);
  return Math.min(d, 360 - d);
};

/** Custom properties that name a brand colour: `--brand`, `--color-primary`, `--accent-color`, `--wp--preset--color--primary`... */
export function cssVarColors(css: string): { primary: string[]; accent: string[] } {
  const primary: string[] = [];
  const accent: string[] = [];
  for (const m of css.matchAll(/--([\w-]{1,80})\s*:\s*([^;}{]{1,80})/g)) {
    const name = m[1]!.toLowerCase();
    const c = parseCssColor(m[2]!);
    if (!c || isNeutral(c)) continue;
    if (/(primary|brand|main|theme)(?!-?(text|fg|foreground|contrast|light|lighter|bg-light))/.test(name)) primary.push(c);
    else if (/(accent|secondary|highlight)(?!-?(text|fg|foreground|contrast))/.test(name)) accent.push(c);
  }
  return { primary, accent };
}

/** The most frequent non-neutral colours in a stylesheet, most frequent first (at most `cap` values read). */
export function frequentColors(css: string, cap = 4000): { color: string; count: number }[] {
  const counts = new Map<string, number>();
  let seen = 0;
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{5,40}\)|hsla?\([^)]{5,40}\)/g)) {
    if (++seen > cap) break;
    const c = parseCssColor(m[0]);
    if (!c || isNeutral(c)) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].map(([color, count]) => ({ color, count })).sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));
}

// ---------------------------------------------------------------------------
// PNG: enough of a decoder for a dominant colour (8-bit, non-interlaced; grey, RGB, palette, grey+alpha, RGBA)
// ---------------------------------------------------------------------------
export function decodePngPixels(buf: Buffer, maxPixels = 400_000): { width: number; height: number; rgba: Uint8Array } | null {
  try {
    if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    let off = 8;
    let width = 0;
    let height = 0;
    let depth = 0;
    let type = 0;
    let interlace = 0;
    let palette: Buffer | null = null;
    let trns: Buffer | null = null;
    const idat: Buffer[] = [];
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const kind = buf.toString("ascii", off + 4, off + 8);
      const data = buf.subarray(off + 8, off + 8 + len);
      if (kind === "IHDR") {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        depth = data[8]!;
        type = data[9]!;
        interlace = data[12]!;
      } else if (kind === "PLTE") palette = data;
      else if (kind === "tRNS") trns = data;
      else if (kind === "IDAT") idat.push(data);
      else if (kind === "IEND") break;
      off += 12 + len;
    }
    if (depth !== 8 || interlace !== 0 || !width || !height || width * height > maxPixels) return null;
    const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
    if (!channels) return null;
    const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: (width * channels + 1) * height + 16 });
    const stride = width * channels;
    const out = new Uint8Array(width * height * 4);
    let prev = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)]!;
      const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? line[x - channels]! : 0;
        const b = prev[x]!;
        const c = x >= channels ? prev[x - channels]! : 0;
        let v = line[x]!;
        if (filter === 1) v += a;
        else if (filter === 2) v += b;
        else if (filter === 3) v += (a + b) >> 1;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        line[x] = v & 255;
      }
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const i = x * channels;
        if (type === 6) out.set([line[i]!, line[i + 1]!, line[i + 2]!, line[i + 3]!], o);
        else if (type === 2) out.set([line[i]!, line[i + 1]!, line[i + 2]!, 255], o);
        else if (type === 0) out.set([line[i]!, line[i]!, line[i]!, 255], o);
        else if (type === 4) out.set([line[i]!, line[i]!, line[i]!, line[i + 1]!], o);
        else {
          const p = line[i]! * 3;
          if (!palette || p + 2 >= palette.length) return null;
          out.set([palette[p]!, palette[p + 1]!, palette[p + 2]!, trns && line[i]! < trns.length ? trns[line[i]!]! : 255], o);
        }
      }
      prev = line;
    }
    return { width, height, rgba: out };
  } catch {
    return null;
  }
}

/** The most common non-neutral, opaque colour in a PNG logo (quantised to 32 levels a channel), or null. */
export function logoDominantColor(png: Buffer): string | null {
  const img = decodePngPixels(png);
  if (!img) return null;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (img.rgba[i + 3]! < 200) continue;
    const r = img.rgba[i]!;
    const g = img.rgba[i + 1]!;
    const b = img.rgba[i + 2]!;
    if (isNeutral(toHex({ r, g, b }))) continue;
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(k, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  // Fewer than 2% of the opaque pixels: a stray anti-aliasing fringe, not a brand colour.
  if (!best || best.n < Math.max(8, (img.width * img.height) / 50)) return null;
  return toHex({ r: best.r / best.n, g: best.g / best.n, b: best.b / best.n });
}

export type ColorSource = "theme_color" | "css_vars" | "css" | "logo_color";
export interface ColorCandidates {
  themeColor: string | null;
  vars: { primary: string[]; accent: string[] };
  frequent: { color: string; count: number }[];
  logo: string | null;
}

export interface PickedColors {
  primary: { value: string; found: string; adjusted: boolean; source: ColorSource } | null;
  accent: { value: string; source: ColorSource } | null;
}

/**
 * Primary: the theme colour, then a brand custom property, then the logo's colour, then the most frequent CSS colour. Accent: an
 * accent custom property, else the next candidate at least 30 degrees of hue away. Both are made usable by resolveShopColors
 * (shaded until 3:1 against every card and canvas, light mode).
 */
export function pickColors(c: ColorCandidates, vertical: string | null): PickedColors {
  const ordered: { color: string; source: ColorSource }[] = [];
  const push = (color: string | null | undefined, source: ColorSource) => {
    const n = normaliseBrandColor(color ?? null);
    if (n && !isNeutral(n) && !ordered.some((o) => o.color === n)) ordered.push({ color: n, source });
  };
  push(c.themeColor, "theme_color");
  for (const v of c.vars.primary) push(v, "css_vars");
  push(c.logo, "logo_color");
  for (const f of c.frequent.slice(0, 6)) push(f.color, "css");
  const first = ordered[0];
  if (!first) return { primary: null, accent: null };
  const usable = resolveShopColors(first.color, vertical).light;
  const primary = { value: usable.accent.toUpperCase(), found: first.color, adjusted: usable.adjusted, source: first.source };
  const accentCands: { color: string; source: ColorSource }[] = [];
  for (const v of c.vars.accent) {
    const n = normaliseBrandColor(v);
    if (n && !isNeutral(n)) accentCands.push({ color: n, source: "css_vars" });
  }
  for (const o of ordered.slice(1)) accentCands.push(o);
  const acc = accentCands.find((a) => a.color !== first.color && hueGap(a.color, first.color) >= 30) ?? null;
  const accent = acc ? { value: resolveShopColors(acc.color, vertical).light.accent.toUpperCase(), source: acc.source } : null;
  return { primary, accent };
}

/** For tests and notes: the contrast of a picked colour on white. */
export const onWhite = (hex: string) => contrastRatio(hex, "#FFFFFF");
