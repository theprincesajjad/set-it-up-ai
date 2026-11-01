import { clear, clearDarkAccent } from "./clear.js";
import { rolesV3 } from "./colors.js";
import { contrastRatio, hexToRgb, mix, rgbToHex, WCAG } from "./contrast.js";
import { tradeFamilies, verticalTrade, type TradeFamily } from "./warm.js";

/**
 * A shop's own colour on its customer screens (join, pass, shop page, booking, /me): the shop's `brandColor` when it set one, else its trade
 * family's accent (nails rose, café brown, barber oxblood ...). Contrast is computed, never assumed, because a brand colour is data:
 *
 *   accent      the fill (the pass field, filled stamps, the hero card). At least 3:1 against every card and canvas it sits on (WCAG 1.4.11);
 *               a colour that is too pale (light) or too dark (dark mode) is shaded toward black (light) or white (dark) until it is.
 *   foreground  text and glyphs on the accent: white, then ink, then pure black, whichever first reaches 4.5:1 (one always does).
 *   soft        the accent at 14% (light) or 18% (dark) over the card: tinted chips and icon tiles.
 *   deep        the accent as text on the card, the canvas and `soft`: shaded until 4.5:1.
 *
 * Works for both looks (Clear and Main Street Warm): every check runs against the backgrounds of both. No gradient: from = to = accent.
 */

export type ShopColorSource = "brand" | "trade";

export interface ShopColorSet {
  accent: string;
  foreground: string;
  soft: string;
  deep: string;
  /** True when the brand colour itself failed and a shaded version is used. */
  adjusted: boolean;
}

export interface ShopColors {
  source: ShopColorSource;
  family: TradeFamily;
  /** The colour the shop picked (normalised #RRGGBB), or the trade accent. */
  base: string;
  light: ShopColorSet;
  dark: ShopColorSet;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A usable #RRGGBB from what the shop stored, or null (empty, malformed). */
export function normaliseBrandColor(c: string | null | undefined): string | null {
  if (!c || !HEX.test(c.trim())) return null;
  return rgbToHex(hexToRgb(c.trim()));
}

/** The surfaces a shop colour sits on, per mode, across Clear and Warm. */
const SURFACES = {
  light: [clear.card, clear.canvas, rolesV3.light.card, rolesV3.light.background],
  dark: [clear.cardDark, clear.black, rolesV3.dark.card, rolesV3.dark.background],
} as const;

/** Text candidates on the accent, in order of preference. */
const ON_ACCENT = ["#FFFFFF", clear.ink, clear.black] as const;

const minContrast = (c: string, bgs: readonly string[]) => Math.min(...bgs.map((b) => contrastRatio(c, b)));

/** Shade `c` toward `to` in 4% steps until it reaches `ratio` against every background (at most fully `to`). */
export function shadeUntil(c: string, to: string, bgs: readonly string[], ratio: number): string {
  if (minContrast(c, bgs) >= ratio) return rgbToHex(hexToRgb(c));
  for (let t = 0.04; t < 1; t += 0.04) {
    const s = mix(c, to, t);
    if (minContrast(s, bgs) >= ratio) return s;
  }
  return rgbToHex(hexToRgb(to));
}

/** The first of white, ink, black that reads on `bg` at AA body size (4.5:1). Pure black always does when white does not. */
export function readableOn(bg: string, candidates: readonly string[] = ON_ACCENT): string {
  return candidates.find((c) => contrastRatio(c, bg) >= WCAG.AA_TEXT) ?? (contrastRatio(clear.black, bg) >= contrastRatio("#FFFFFF", bg) ? clear.black : "#FFFFFF");
}

function setFor(base: string, mode: "light" | "dark"): ShopColorSet {
  const bgs = SURFACES[mode];
  const toward = mode === "light" ? clear.black : clear.white;
  const accent = shadeUntil(base, toward, bgs, WCAG.AA_UI);
  const foreground = readableOn(accent, mode === "light" ? ON_ACCENT : [clear.ink, clear.black, "#FFFFFF"]);
  const soft = mix(mode === "light" ? clear.card : clear.cardDark, accent, mode === "light" ? 0.14 : 0.18);
  const deep = shadeUntil(accent, toward, [...bgs, soft], WCAG.AA_TEXT);
  return { accent, foreground, soft, deep, adjusted: accent !== rgbToHex(hexToRgb(base)) };
}

/** Resolve a shop's colours: its brand colour, else its trade family (by vertical). */
export function resolveShopColors(brandColor: string | null | undefined, vertical: string | null | undefined): ShopColors {
  const family = verticalTrade(vertical);
  const brand = normaliseBrandColor(brandColor);
  if (brand) return { source: "brand", family, base: brand, light: setFor(brand, "light"), dark: setFor(brand, "dark") };
  const t = tradeFamilies[family].accent;
  // The trade's graphite-dark accent is the designed one (Clear rev 5); the checks still run on it.
  return { source: "trade", family, base: t, light: setFor(t, "light"), dark: setFor(clearDarkAccent(family), "dark") };
}

/** CSS custom properties for one mode, named like the trade roles (`--trade`, `--trade-foreground` ...). */
export function shopTradeVars(s: ShopColorSet): Record<string, string> {
  return {
    "--trade": s.accent,
    "--trade-foreground": s.foreground,
    "--trade-alt": s.accent,
    "--trade-soft": s.soft,
    "--trade-tint": s.soft,
    "--trade-deep": s.deep,
    "--trade-pass-from": s.accent,
    "--trade-pass-to": s.accent,
    "--trade-pass-text": s.foreground,
    "--chart-hi": s.accent,
  };
}

/** The variable names the `[data-shop-color]` rules map from: `--shop-l-trade`, `--shop-d-trade-foreground` ... */
export const SHOP_TRADE_VARS = Object.keys(shopTradeVars({ accent: "", foreground: "", soft: "", deep: "", adjusted: false }));

/** Inline style for an element with `data-shop-color`: both modes' values; the CSS in tokens.css picks the right one for the theme. */
export function shopColorStyle(c: ShopColors): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [mode, set] of [["l", c.light], ["d", c.dark]] as const)
    for (const [k, v] of Object.entries(shopTradeVars(set))) out[`--shop-${mode}-${k.slice(2)}`] = v;
  return out;
}
