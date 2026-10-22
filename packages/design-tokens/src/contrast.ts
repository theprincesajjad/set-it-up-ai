/**
 * WCAG 2.x contrast helpers. Used by the token tests, and safe to use at
 * runtime (e.g. to pick black/white text over a colour a merchant uploads).
 */

export type Hex = `#${string}`;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse #rgb, #rrggbb or #rrggbbaa (alpha ignored). */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex colour: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): Hex {
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase() as Hex;
}

/** Relative luminance per WCAG 2.1. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Contrast ratio between two colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG thresholds. */
export const WCAG = {
  /** Body text (< 18.66px bold / < 24px regular). */
  AA_TEXT: 4.5,
  /** Large text (>= 24px regular or >= 18.66px bold). */
  AA_LARGE_TEXT: 3,
  /** Non-text UI: icons, input borders, focus rings, chart marks (1.4.11). */
  AA_UI: 3,
  AAA_TEXT: 7,
} as const;

/**
 * Pick the more readable of two text colours for a background. Use when a
 * merchant supplies their own colour (e.g. logo backdrop) at runtime.
 */
export function pickOnColor(bg: string, dark = "#0B0B0C", light = "#FFFFFF"): string {
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}

/** Mix two hex colours, t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): Hex {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** HSL (h 0-360, s/l 0-100) to hex. */
export function hsl(h: number, s: number, l: number): Hex {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

/** Append an alpha channel (0..1) to a #rrggbb colour → #rrggbbaa. */
export function withAlpha(hex: string, alpha: number): string {
  const base = rgbToHex(hexToRgb(hex));
  return `${base}${Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase()}`;
}
