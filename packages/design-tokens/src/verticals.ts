import { VERTICALS, VERTICAL_TEMPLATES, type Vertical } from "@ll/shared";
import { hsl, type Hex } from "./contrast.js";

/**
 * Per-vertical identity: used for ShopTile placeholder (when a shop has no
 * logo), MapPin glyph, feed filters and category chips. The shop's own logo
 * and photos always win over these.
 *
 * Colours are derived from a hue so they stay a coherent family; every pair
 * is contrast-tested. Use:
 *  - `tint` + `ink`      → chip / tile background with label text (>= 4.5:1)
 *  - `tint` + `accent`   → icon on tile (>= 3:1)
 *  - `accent` + `onAccent` → map pin fill with white glyph (>= 4.5:1 so the glyph reads in sunlight)
 */

export interface VerticalVisual {
  vertical: Vertical;
  label: string;
  /** Emoji fallback (notifications, SMS-safe contexts, wallet pass, where icons can't render). */
  emoji: string;
  /** lucide icon name (kebab-case, lucide-static / lucide.dev). */
  icon: string;
  /** lucide-react / lucide-react-native component name. */
  iconComponent: string;
  hue: number;
  light: VerticalColors;
  dark: VerticalColors;
}

export interface VerticalColors {
  accent: Hex;
  onAccent: Hex;
  tint: Hex;
  ink: Hex;
}

interface Seed {
  emoji: string;
  icon: string;
  hue: number;
  /** Saturation 0-100. */
  sat: number;
}

const seeds: Record<Vertical, Seed> = {
  cafe: { emoji: "☕", icon: "coffee", hue: 25, sat: 45 },
  restaurant: { emoji: "🍽️", icon: "utensils-crossed", hue: 8, sat: 65 },
  bakery: { emoji: "🥐", icon: "croissant", hue: 36, sat: 70 },
  bar: { emoji: "🍻", icon: "beer", hue: 46, sat: 70 },
  grocery: { emoji: "🧺", icon: "shopping-basket", hue: 95, sat: 50 },
  pharmacy: { emoji: "💊", icon: "pill", hue: 185, sat: 60 },
  retail: { emoji: "🛍️", icon: "shopping-bag", hue: 325, sat: 55 },
  bookstore: { emoji: "📚", icon: "book-open", hue: 230, sat: 45 },
  florist: { emoji: "💐", icon: "flower-2", hue: 345, sat: 60 },
  pet: { emoji: "🐾", icon: "paw-print", hue: 160, sat: 45 },
  salon: { emoji: "💅", icon: "sparkles", hue: 290, sat: 45 },
  barber: { emoji: "💈", icon: "scissors", hue: 210, sat: 55 },
  spa: { emoji: "🧖", icon: "leaf", hue: 140, sat: 30 },
  fitness: { emoji: "🏋️", icon: "dumbbell", hue: 15, sat: 75 },
  repair_electronics: { emoji: "📱", icon: "monitor-smartphone", hue: 255, sat: 45 },
  repair_auto: { emoji: "🚗", icon: "car", hue: 200, sat: 30 },
  alterations: { emoji: "🧵", icon: "ruler", hue: 270, sat: 35 },
  dry_cleaning: { emoji: "👔", icon: "shirt", hue: 195, sat: 45 },
  print_shop: { emoji: "🖨️", icon: "printer", hue: 170, sat: 55 },
  other: { emoji: "🏪", icon: "store", hue: 30, sat: 12 },
};

const pascal = (kebab: string) =>
  kebab
    .split("-")
    .map((s) => (/^\d/.test(s) ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join("");

function build(v: Vertical): VerticalVisual {
  const s = seeds[v];
  return {
    vertical: v,
    label: VERTICAL_TEMPLATES[v].label,
    emoji: s.emoji,
    icon: s.icon,
    iconComponent: pascal(s.icon),
    hue: s.hue,
    light: {
      accent: hsl(s.hue, s.sat, 32),
      onAccent: "#FFFFFF",
      tint: hsl(s.hue, Math.min(70, s.sat + 15), 94),
      ink: hsl(s.hue, s.sat, 22),
    },
    dark: {
      accent: hsl(s.hue, s.sat, 70),
      onAccent: "#0F0D0A",
      tint: hsl(s.hue, Math.max(12, s.sat - 15), 16),
      ink: hsl(s.hue, Math.min(70, s.sat + 10), 84),
    },
  };
}

export const verticalVisuals: Record<Vertical, VerticalVisual> = Object.fromEntries(
  VERTICALS.map((v) => [v, build(v)]),
) as Record<Vertical, VerticalVisual>;

export function verticalVisual(v: Vertical | string | null | undefined): VerticalVisual {
  return (v && (verticalVisuals as Record<string, VerticalVisual>)[v]) || verticalVisuals.other;
}
