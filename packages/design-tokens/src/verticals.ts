import { VERTICALS, VERTICAL_TEMPLATES, type Vertical } from "@ll/shared";
import { dark, light } from "./colors.js";

/**
 * Per-vertical visuals (v2). Verticals no longer carry colour: placeholder
 * tiles, chips and map bubbles are neutral (white bubble / bg-subtle tile,
 * fg glyph). A shop's identity comes ONLY from its own `brandColor`, shown
 * inside its avatar (initials or logo).
 *
 * Each vertical maps to one of the 7 map categories (`category`) whose
 * object illustration lives in `assets/categories/<category>.svg|png`.
 */

/** The category rail, in order. "all" uses the `top` (star) illustration. */
export const MAP_CATEGORIES = ["all", "coffee", "bakery", "eat", "shops", "beauty", "repair"] as const;
/** Fallback category for verticals that fit none of the rail categories (not shown in the rail). */
export const FALLBACK_CATEGORY = "services" as const;
export type MapCategoryId = (typeof MAP_CATEGORIES)[number];
export type VerticalCategory = Exclude<MapCategoryId, "all"> | typeof FALLBACK_CATEGORY;

/** Illustration file stem per category (assets/categories/<stem>.svg, <stem>@2x.png …). */
export const categoryAsset: Record<MapCategoryId | typeof FALLBACK_CATEGORY, string> = {
  all: "top",
  coffee: "coffee",
  bakery: "bakery",
  eat: "eat",
  shops: "shops",
  beauty: "beauty",
  repair: "repair",
  services: "services",
};

/** Lowercase rail labels (the label IS the id; kept explicit for i18n later). */
export const categoryLabels: Record<MapCategoryId | typeof FALLBACK_CATEGORY, string> = {
  all: "all",
  coffee: "coffee",
  bakery: "bakery",
  eat: "eat",
  shops: "shops",
  beauty: "beauty",
  repair: "repair",
  services: "services",
};

/**
 * Neutral styling, same shape as v1 so apps compile. Every vertical gets the
 * SAME values: tint = bg-subtle tile, ink/accent = fg glyph, onAccent = bg.
 */
export interface VerticalColors {
  /** Glyph / icon colour (fg). */
  accent: string;
  /** Glyph on an accent fill (bg). */
  onAccent: string;
  /** Placeholder tile / chip background (bgSubtle). */
  tint: string;
  /** Label text on the tile (fg). */
  ink: string;
}

export interface VerticalVisual {
  vertical: Vertical;
  label: string;
  /** Map category for the rail, filters and the object illustration. */
  category: VerticalCategory;
  /** Emoji fallback (notifications, SMS-safe contexts, wallet pass, where icons can't render). */
  emoji: string;
  /** lucide icon name (kebab-case, lucide-static / lucide.dev). */
  icon: string;
  /** lucide-react / lucide-react-native component name. */
  iconComponent: string;
  light: VerticalColors;
  dark: VerticalColors;
}

interface Seed {
  emoji: string;
  icon: string;
  category: VerticalCategory;
}

const seeds: Record<Vertical, Seed> = {
  cafe: { emoji: "☕", icon: "coffee", category: "coffee" },
  restaurant: { emoji: "🍽️", icon: "utensils-crossed", category: "eat" },
  restaurant_south_asian: { emoji: "🍛", icon: "utensils-crossed", category: "eat" },
  tiffin: { emoji: "🍱", icon: "package", category: "eat" },
  caterer: { emoji: "🍲", icon: "utensils-crossed", category: "eat" },
  banquet_hall: { emoji: "🎉", icon: "store", category: "eat" },
  bakery: { emoji: "🥐", icon: "croissant", category: "bakery" },
  bar: { emoji: "🍻", icon: "beer", category: "eat" },
  grocery: { emoji: "🧺", icon: "shopping-basket", category: "shops" },
  pharmacy: { emoji: "💊", icon: "pill", category: "shops" },
  retail: { emoji: "🛍️", icon: "shopping-bag", category: "shops" },
  bookstore: { emoji: "📚", icon: "book-open", category: "shops" },
  florist: { emoji: "💐", icon: "flower-2", category: "shops" },
  pet: { emoji: "🐾", icon: "paw-print", category: "shops" },
  salon: { emoji: "💅", icon: "sparkles", category: "beauty" },
  barber: { emoji: "💈", icon: "scissors", category: "beauty" },
  nails: { emoji: "💅", icon: "sparkles", category: "beauty" },
  brows_lashes: { emoji: "👁️", icon: "eye", category: "beauty" },
  makeup: { emoji: "💄", icon: "brush", category: "beauty" },
  spa: { emoji: "🧖", icon: "leaf", category: "beauty" },
  beauty_supply: { emoji: "🧴", icon: "sparkles", category: "beauty" },
  fitness: { emoji: "🏋️", icon: "dumbbell", category: "services" },
  repair_electronics: { emoji: "📱", icon: "monitor-smartphone", category: "repair" },
  repair_auto: { emoji: "🚗", icon: "car", category: "repair" },
  car_wash: { emoji: "🫧", icon: "sparkles", category: "services" },
  alterations: { emoji: "🧵", icon: "ruler", category: "repair" },
  dry_cleaning: { emoji: "👔", icon: "shirt", category: "services" },
  print_shop: { emoji: "🖨️", icon: "printer", category: "services" },
  other: { emoji: "🏪", icon: "store", category: "services" },
};

const pascal = (kebab: string) =>
  kebab
    .split("-")
    .map((s) => (/^\d/.test(s) ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join("");

export const neutralVerticalColors: { light: VerticalColors; dark: VerticalColors } = {
  light: { accent: light.fg, onAccent: light.bg, tint: light.bgSubtle, ink: light.fg },
  dark: { accent: dark.fg, onAccent: dark.bg, tint: dark.bgSubtle, ink: dark.fg },
};

function build(v: Vertical): VerticalVisual {
  const s = seeds[v];
  return {
    vertical: v,
    label: VERTICAL_TEMPLATES[v].label,
    category: s.category,
    emoji: s.emoji,
    icon: s.icon,
    iconComponent: pascal(s.icon),
    light: neutralVerticalColors.light,
    dark: neutralVerticalColors.dark,
  };
}

export const verticalVisuals: Record<Vertical, VerticalVisual> = Object.fromEntries(
  VERTICALS.map((v) => [v, build(v)]),
) as Record<Vertical, VerticalVisual>;

export function verticalVisual(v: Vertical | string | null | undefined): VerticalVisual {
  return (v && (verticalVisuals as Record<string, VerticalVisual>)[v]) || verticalVisuals.other;
}

/** Map category for a vertical (unknown → "services"). */
export function verticalCategory(v: Vertical | string | null | undefined): VerticalCategory {
  return verticalVisual(v).category;
}

/** Verticals in a rail category ("all" → every vertical). */
export function verticalsInCategory(c: MapCategoryId | typeof FALLBACK_CATEGORY): Vertical[] {
  return c === "all" ? [...VERTICALS] : VERTICALS.filter((v) => seeds[v].category === c);
}
