import { VERTICALS, type Vertical } from "@ll/shared";
import { hexToRgb, hsl, mix } from "./contrast.js";

/** Hex to HSL (h 0-360, s and l 0-100). */
function toHsl(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

/** Same hue, lifted to lightness `l` with at least `minS` saturation: a dark-mode tone that stays colourful instead of turning grey. */
function lift(hex: string, l: number, minS = 55): string {
  const [h, s] = toHsl(hex);
  return hsl(h, Math.max(s, minS), l);
}

/**
 * "Main Street Warm" (founder decision 2026-10-28): the warm palette, the pastel tile pairs and the per-trade accent
 * families. Roles live in colors.ts (they read from here); this file only holds values and the vertical -> family map.
 */

/** Warm neutrals and brand colours. */
export const warm = {
  cream: "#FBF6EE", // canvas (light)
  creamDeep: "#F6EEE2", // muted surface (light)
  sand: "#F3E9DA", // sidebar (light)
  sandDeep: "#F0E4D2", // hover surface (light)
  hairline: "#EADCC8", // border (light)
  hairlineStrong: "#E2D0B6", // sidebar border (light)
  inputLight: "#8A7866", // form outline, 3:1 on cream, white and muted
  ink: "#2A1E14", // foreground (light)
  muted: "#725F4E", // muted foreground (light); the mock's #7A6655 is 4.3:1 on the hover surface, this is 4.8
  subtle: "#A8967F", // disabled (light)
  points: "#E5530A", // points orange (light): 3.3:1 on every light surface
  pointsText: "#B33A09",
  red: "#CC2222", // destructive (light), 4.8:1 on the muted surface
  amber: "#CC6C00", // warning dot (light)
  terracotta: "#C8452C", // primary
  terracottaDeep: "#B23A23", // primary text on cream / white (>= 4.5), pressed state
  terracottaHover: "#B33D26",
  forest: "#1F5C4A", // secondary brand: the customer pass card
  // dark
  espresso: "#1A1410", // canvas (dark)
  roast: "#241C16", // cards (dark)
  roastMuted: "#2B221B", // muted surface (dark)
  roastHover: "#34291F", // hover surface (dark)
  roastLine: "#3B2F25", // border (dark)
  roastSidebar: "#201811", // sidebar (dark)
  roastPill: "#33281F", // active sidebar pill (dark)
  roastInput: "#8C7B6B", // form outline (dark)
  cocoa: "#F7EEE3", // foreground (dark)
  cocoaMuted: "#BBAA98", // muted foreground (dark)
  cocoaSubtle: "#86766A", // disabled (dark)
  terracottaDark: "#E0583F", // primary in dark: 4.9:1 with espresso text on it
  forestDark: "#7CC2A5", // forest used as a fill in dark
} as const;

export const TILE_NAMES = ["peach", "mint", "butter", "lilac", "sky", "rose"] as const;
export type TileName = (typeof TILE_NAMES)[number];

interface TilePair {
  /** Pastel fill (light). */
  fill: string;
  /** Deep text and glyph on the fill (light). */
  deep: string;
  /** The hue the dark fill is tinted with (18% over the card). */
  hue: string;
  /** Light text on the dark fill. */
  deepDark: string;
}

/** Pastel tile pairs. Dark tiles are the hue at ~18% over the dark card, with light text. */
export const tilePairs: Record<TileName, TilePair> = {
  peach: { fill: "#FCE4D8", deep: "#A63A22", hue: "#E8704F", deepDark: "#FFB9A3" },
  mint: { fill: "#E1EEE6", deep: "#1F5C4A", hue: "#4FB38E", deepDark: "#9DE0C3" },
  butter: { fill: "#FDF0C8", deep: "#7A5A05", hue: "#E9B72E", deepDark: "#F7D878" },
  lilac: { fill: "#EBE2F3", deep: "#6B3FA0", hue: "#9B6FD6", deepDark: "#CDB2F2" },
  sky: { fill: "#DCEBF7", deep: "#1F5A8C", hue: "#4A9BDB", deepDark: "#A5D0F5" },
  rose: { fill: "#F9DEE5", deep: "#A02B52", hue: "#E0587F", deepDark: "#FFB3C9" },
};

export const tileRoles = (theme: "light" | "dark") =>
  Object.fromEntries(
    TILE_NAMES.flatMap((n) => {
      const t = tilePairs[n];
      const cap = n.charAt(0).toUpperCase() + n.slice(1);
      return [
        [`tile${cap}`, theme === "light" ? t.fill : mix(warm.roast, t.hue, 0.18)],
        [`tile${cap}Foreground`, theme === "light" ? t.deep : t.deepDark],
      ];
    }),
  ) as Record<`tile${Capitalize<TileName>}` | `tile${Capitalize<TileName>}Foreground`, string>;

// ---------------------------------------------------------------------------
// Per-trade accent families
// ---------------------------------------------------------------------------

export const TRADE_FAMILIES = [
  "cafe", "bakery", "rose", "barber", "saffron", "leaf", "teal", "studio", "sky", "slate", "steel", "fuchsia", "plum", "terracotta",
] as const;
export type TradeFamily = (typeof TRADE_FAMILIES)[number];

export interface TradeLight {
  /** Fill: glyphs, bars, stamps, the pass gradient start. White text on it is >= 4.5:1; >= 3:1 on cream, white and sand. */
  accent: string;
  /** Second colour of the family (caramel, navy, lime ...): gradient end, small decoration. >= 3:1 on white. */
  alt: string;
  /** Soft tint (first stat tile, active chips). */
  soft: string;
  /** Deep text and page-title accent on soft, white and cream (>= 4.5:1). */
  deep: string;
  /** What the family is called in the brief. */
  label: string;
}

export const tradeFamilies: Record<TradeFamily, TradeLight> = {
  cafe: { accent: "#8A5A3C", alt: "#B3702A", soft: "#F3E3D3", deep: "#5E3A22", label: "Coffee brown and caramel" },
  bakery: { accent: "#9A5B07", alt: "#B07209", soft: "#FBEBC5", deep: "#6B4004", label: "Wheat and amber" },
  rose: { accent: "#B83A64", alt: "#D9547F", soft: "#F9DEE5", deep: "#8A2348", label: "Rose" },
  barber: { accent: "#8C2231", alt: "#1F3A5F", soft: "#F3DDDF", deep: "#6B1722", label: "Oxblood and navy" },
  saffron: { accent: "#B5321B", alt: "#C27C06", soft: "#FDE9C9", deep: "#7A2410", label: "Saffron and chilli" },
  leaf: { accent: "#2F7D3A", alt: "#6E9B1E", soft: "#E1F0DC", deep: "#1E5226", label: "Leaf green" },
  teal: { accent: "#0E7387", alt: "#3B9BAA", soft: "#D9EEF2", deep: "#0A5160", label: "Clinical teal" },
  studio: { accent: "#0D7A63", alt: "#5E9C0F", soft: "#DDF3E8", deep: "#0B4F43", label: "Teal and lime" },
  sky: { accent: "#2873B0", alt: "#2A84C6", soft: "#DCEBF7", deep: "#174E7A", label: "Sky blue" },
  slate: { accent: "#2F55D4", alt: "#475569", soft: "#E0E7FB", deep: "#1E3A8A", label: "Slate and electric blue" },
  steel: { accent: "#4A6378", alt: "#C2570C", soft: "#E3EAF0", deep: "#2D3F4F", label: "Steel and orange" },
  fuchsia: { accent: "#A8168F", alt: "#D246B3", soft: "#F9DDF3", deep: "#74106A", label: "Fuchsia" },
  plum: { accent: "#7A2E6E", alt: "#A85C9C", soft: "#EBDDF0", deep: "#52204F", label: "Plum" },
  terracotta: { accent: "#C8452C", alt: "#B8691F", soft: "#FCE4D8", deep: "#9B2F1A", label: "Terracotta" },
};

/** Which family each vertical in @ll/shared wears. Every vertical is mapped (a test asserts it). */
export const tradeFamilyOf: Record<Vertical, TradeFamily> = {
  cafe: "cafe",
  bakery: "bakery",
  salon: "rose",
  spa: "rose",
  beauty_supply: "rose",
  barber: "barber",
  nails: "rose",
  brows_lashes: "rose",
  makeup: "rose",
  restaurant: "saffron",
  restaurant_south_asian: "saffron",
  tiffin: "saffron",
  caterer: "saffron",
  banquet_hall: "saffron",
  bar: "saffron",
  grocery: "leaf",
  pharmacy: "teal",
  fitness: "studio",
  pet: "sky",
  repair_auto: "slate",
  car_wash: "slate",
  dry_cleaning: "slate",
  repair_electronics: "steel",
  alterations: "steel",
  print_shop: "steel",
  florist: "fuchsia",
  bookstore: "plum",
  retail: "terracotta",
  other: "terracotta",
};

export interface TradeColors {
  accent: string;
  /** Text / icon on the accent fill. */
  foreground: string;
  alt: string;
  soft: string;
  deep: string;
  /** The customer pass card: gradient start (the left, where the text sits), the blend 30% of the way across (where text ends), the end, and the text on it. Dark is the accent mixed over the espresso canvas, never neon. */
  passFrom: string;
  passMid: string;
  passTo: string;
  passText: string;
}

/** Dark: the accent is lifted toward white until dark text reads on it; soft is the accent at 18% over the dark card; deep is a light tint. */
export function tradeColors(family: TradeFamily, theme: "light" | "dark"): TradeColors {
  const t = tradeFamilies[family];
  if (theme === "light") return { accent: t.accent, foreground: "#FFFFFF", alt: t.alt, soft: t.soft, deep: t.deep, passFrom: t.accent, passMid: mix(t.accent, t.alt, 0.25), passTo: t.alt, passText: "#FFFFFF" };
  const accent = lift(t.accent, 62);
  const alt = lift(t.alt, 60);
  const passFrom = mix(warm.espresso, accent, 0.4);
  const passTo = mix(warm.espresso, alt, 0.4);
  return { accent, foreground: warm.espresso, alt, soft: mix(warm.roast, accent, 0.2), deep: lift(t.accent, 80, 60), passFrom, passMid: mix(passFrom, passTo, 0.25), passTo, passText: warm.cocoa };
}

export const verticalTrade = (v: string | null | undefined): TradeFamily => (v && (tradeFamilyOf as Record<string, TradeFamily>)[v]) || "terracotta";

/** Verticals grouped by family (the CSS selector lists). */
export const verticalsByFamily = (f: TradeFamily): Vertical[] => VERTICALS.filter((v) => tradeFamilyOf[v] === f);
