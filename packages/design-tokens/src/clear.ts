import type { RolesV3 } from "./colors.js";
import { hexToRgb, hsl, mix, rgbToHex } from "./contrast.js";
import { TILE_NAMES, TRADE_FAMILIES, tradeFamilies, type TradeFamily } from "./warm.js";

/**
 * "Clear" (docs/design/v3.2-clear.md rev 5 + the rev 6 layout audit, founder-approved 2026-10-28): Liquid Glass chrome over a flat,
 * Shopify-clear content layer. The default theme for every shop and customer; light only unless a shop opts into graphite dark.
 *
 * Values are copied from the v6 mock (`:root[data-theme-style="clear"]`), which is the source of truth where it and the spec differ.
 * Web: emitted under `:root[data-theme-style="clear"]` by css.ts. Mobile: import `clearRoles`, `clearExtra`, `clearGlass`,
 * `clearTradeColors` from "@ll/design-tokens" (the same way `warm`, `tradeColors` are imported).
 */

export { THEME_STYLES, DEFAULT_THEME_STYLE, type ThemeStyle } from "@ll/shared";

/** Neutral values (light and graphite dark). */
export const clear = {
  canvas: "#F2F2F7", // Apple grouped background
  ink: "#17171A",
  card: "#FFFFFF",
  muted: "#EBEBED",
  mutedText: "#54545A", // AA on glass (spec 2.8)
  subtle: "#86868B",
  hairline: "#E5E5EA",
  hairlineStrong: "#D2D2D7",
  input: "#838388", // Polaris #8A8A8A is 2.9:1 on the muted surface; this is 3.1
  focus: "#0071E3",
  link: "#0066CC",
  hover: "#F0F0F2", // rgba(0,0,0,.035) composited on white
  tile: "#F1F1F1",
  // graphite dark (opt-in)
  black: "#000000",
  white: "#FFFFFF",
  cardDark: "#1C1C1E",
  mutedDark: "#2C2C2E",
  mutedTextDark: "#B4B4BA", // spec 2.8 (the mock's #B0B0B8 is 4.49 on the dark search field)
  subtleDark: "#7C7C82",
  hairlineDark: "#2C2C30",
  hairlineStrongDark: "#3E3E43",
  inputDark: "#8E8E93",
  focusDark: "#4DA3FF",
  linkDark: "#4DA3FF",
  hoverDark: "#2A2A2C", // rgba(255,255,255,.06) on the dark card
  tileDark: "#2C2C2E",
} as const;

const tiles = (fill: string, fg: string) =>
  Object.fromEntries(
    TILE_NAMES.flatMap((n) => {
      const cap = n.charAt(0).toUpperCase() + n.slice(1);
      return [
        [`tile${cap}`, fill],
        [`tile${cap}Foreground`, fg],
      ];
    }),
  ) as Pick<RolesV3, `tile${Capitalize<(typeof TILE_NAMES)[number]>}` | `tile${Capitalize<(typeof TILE_NAMES)[number]>}Foreground`>;

// ---------------------------------------------------------------------------
// Trade accents adapted for Clear (spec 2.4 + rev 5): one accent per family; no alt, no gradient.
// ---------------------------------------------------------------------------

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

/** Graphite dark: the family accent lifted to lightness 69, saturation clamped to 55..65 (rev 5: café #8A5A3C -> #E0A57F, pinned). */
const DARK_PINNED: Partial<Record<TradeFamily, string>> = { cafe: "#E0A57F" };
export function clearDarkAccent(family: TradeFamily): string {
  const pinned = DARK_PINNED[family];
  if (pinned) return pinned;
  const [h, s] = toHsl(tradeFamilies[family].accent);
  return hsl(h, Math.min(65, Math.max(55, s)), 69);
}

export interface ClearTradeColors {
  /** --trade: active nav glyph, icon-tile glyph, chart current bar, shop mark, filled stamps. */
  accent: string;
  /** --trade-foreground: text on the accent (shop mark initials). */
  foreground: string;
  /** --trade-alt and --trade-deep resolve to the accent in Clear. */
  alt: string;
  deep: string;
  /** --trade-soft / --trade-tint: the accent at 14% over the card (stat and row icon tiles). */
  soft: string;
  /** --trade-nav: the active nav item, the accent at 13% over the lifted glass. */
  nav: string;
  /** No gradient in Clear: the pass reads the accent and the foreground. */
  passFrom: string;
  passTo: string;
  passText: string;
}

export function clearTradeColors(family: TradeFamily, theme: "light" | "dark"): ClearTradeColors {
  if (theme === "light") {
    const a = tradeFamilies[family].accent;
    return { accent: a, foreground: "#FFFFFF", alt: a, deep: a, soft: mix(clear.card, a, 0.14), nav: mix(clear.white, a, 0.13), passFrom: a, passTo: a, passText: "#FFFFFF" };
  }
  const a = clearDarkAccent(family);
  // The lifted glass in dark is white at 22% over the graphite fill: about #3B3B40 over black.
  return { accent: a, foreground: "#1A1208", alt: a, deep: a, soft: mix(clear.cardDark, a, 0.18), nav: mix("#3B3B40", a, 0.13), passFrom: a, passTo: a, passText: "#1A1208" };
}

export const clearTradeFamilies = TRADE_FAMILIES;

// ---------------------------------------------------------------------------
// Roles: every v3 role (so every existing class resolves in Clear), plus the Clear-only roles and the Liquid Glass roles.
// ---------------------------------------------------------------------------

const tradeL = clearTradeColors("terracotta", "light");
const tradeD = clearTradeColors("terracotta", "dark");

const clearLight: RolesV3 = {
  background: clear.canvas,
  foreground: clear.ink,
  card: clear.card,
  cardForeground: clear.ink,
  popover: clear.card,
  popoverForeground: clear.ink,
  primary: clear.ink,
  primaryForeground: "#FFFFFF",
  secondary: clear.muted,
  secondaryForeground: clear.ink,
  muted: clear.muted,
  mutedForeground: clear.mutedText,
  accent: clear.hover,
  accentForeground: clear.ink,
  destructive: "#C70A24",
  border: clear.hairline,
  input: clear.input,
  ring: clear.focus,
  subtleForeground: clear.subtle,
  sidebar: "#F7F7F9",
  sidebarForeground: clear.ink,
  sidebarPrimary: clear.ink,
  sidebarPrimaryForeground: "#FFFFFF",
  sidebarAccent: "#FFFFFF",
  sidebarAccentForeground: clear.ink,
  sidebarBorder: clear.hairline,
  sidebarRing: clear.focus,
  // Points have no colour in Clear: they are numbers.
  points: clear.ink,
  pointsText: clear.ink,
  pointsSoft: clear.muted,
  pointsForeground: "#FFFFFF",
  success: "#047B5D",
  successText: "#014B40",
  info: "#0071E3",
  infoText: "#003A5A",
  infoSoft: "#EAF4FF",
  // Polaris's #FFB800 is a fill for dark text; as a dot on the canvas it is 1.6:1, so the dot is the deeper amber (3.2:1).
  warning: "#B26B00",
  warningText: "#5E4200",
  paper: clear.canvas,
  qrFg: "#000000",
  qrBg: "#FFFFFF",
  primaryText: clear.link,
  forest: clear.ink,
  forestForeground: "#FFFFFF",
  ...tiles(clear.tile, clear.mutedText),
  trade: tradeL.accent,
  tradeForeground: tradeL.foreground,
  tradeAlt: tradeL.alt,
  tradeSoft: tradeL.soft,
  tradeDeep: tradeL.deep,
  tradePassFrom: tradeL.passFrom,
  tradePassTo: tradeL.passTo,
  tradePassText: tradeL.passText,
};

const clearDark: RolesV3 = {
  background: clear.black,
  foreground: clear.white,
  card: clear.cardDark,
  cardForeground: clear.white,
  popover: clear.cardDark,
  popoverForeground: clear.white,
  primary: clear.white,
  primaryForeground: clear.black,
  secondary: clear.mutedDark,
  secondaryForeground: clear.white,
  muted: clear.mutedDark,
  mutedForeground: clear.mutedTextDark,
  accent: clear.hoverDark,
  accentForeground: clear.white,
  destructive: "#FF453A",
  border: clear.hairlineDark,
  input: clear.inputDark,
  ring: clear.focusDark,
  subtleForeground: clear.subtleDark,
  sidebar: "#1F1F22",
  sidebarForeground: clear.white,
  sidebarPrimary: clear.white,
  sidebarPrimaryForeground: clear.black,
  sidebarAccent: "#3A3A3C",
  sidebarAccentForeground: clear.white,
  sidebarBorder: clear.hairlineDark,
  sidebarRing: clear.focusDark,
  points: clear.white,
  pointsText: clear.white,
  pointsSoft: clear.mutedDark,
  pointsForeground: clear.black,
  success: "#30D158",
  successText: "#6AE08A",
  info: clear.linkDark,
  infoText: "#7CC0FF",
  infoSoft: mix(clear.cardDark, clear.linkDark, 0.18),
  warning: "#FF9F0A",
  warningText: "#FFB340",
  paper: clear.black,
  qrFg: "#000000",
  qrBg: "#FFFFFF",
  primaryText: clear.linkDark,
  forest: clear.white,
  forestForeground: clear.black,
  ...tiles(clear.tileDark, "#A8A8AE"),
  trade: tradeD.accent,
  tradeForeground: tradeD.foreground,
  tradeAlt: tradeD.alt,
  tradeSoft: tradeD.soft,
  tradeDeep: tradeD.deep,
  tradePassFrom: tradeD.passFrom,
  tradePassTo: tradeD.passTo,
  tradePassText: tradeD.passText,
};

export const clearRoles = { light: clearLight, dark: clearDark } as const;

/**
 * Roles new in Clear (spec 2.2, 2.5, rev 5). Warm gets an equivalent for each (`warmExtra`), so a class such as `text-link` resolves in both.
 * CSS names: --link, --primary-hover, --border-strong, --success-soft, --warning-soft, --destructive-text, --destructive-soft, --info-text-strong,
 * --row-sel, --tile, --chart-muted, --chart-hi, --scrim, --toast-bg, --toast-fg, --shadow-card-clear.
 */
export interface ClearExtraRoles {
  link: string;
  primaryHover: string;
  borderStrong: string;
  successSoft: string;
  warningSoft: string;
  destructiveText: string;
  destructiveSoft: string;
  rowSel: string;
  tile: string;
  chartMuted: string;
  chartHi: string;
  scrim: string;
  toastBg: string;
  toastFg: string;
}

export const clearExtra: Record<"light" | "dark", ClearExtraRoles> = {
  light: {
    link: clear.link,
    primaryHover: "#000000",
    borderStrong: clear.hairlineStrong,
    successSoft: "#CDFED4",
    warningSoft: "#FFF1E3",
    destructiveText: "#8E0B21",
    destructiveSoft: "#FEE8EB",
    rowSel: "#EAF4FF",
    tile: clear.tile,
    chartMuted: "#D6D6DC",
    chartHi: tradeL.accent,
    scrim: "rgba(0, 0, 0, 0.16)",
    toastBg: "rgba(30, 30, 34, 0.74)",
    toastFg: "#FFFFFF",
  },
  dark: {
    link: clear.linkDark,
    primaryHover: "#FFFFFF",
    borderStrong: clear.hairlineStrongDark,
    successSoft: "rgba(48, 209, 88, 0.18)",
    warningSoft: "rgba(255, 159, 10, 0.18)",
    destructiveText: "#FF6961",
    destructiveSoft: "rgba(255, 69, 58, 0.18)",
    rowSel: "rgba(77, 163, 255, 0.18)",
    tile: clear.tileDark,
    chartMuted: "#3A3A3E",
    chartHi: tradeD.accent,
    scrim: "rgba(0, 0, 0, 0.5)",
    toastBg: "rgba(245, 245, 247, 0.86)",
    toastFg: "#000000",
  },
};

/** Opaque equivalents of the translucent extras, for contrast tests and for native surfaces that cannot composite. */
export const clearExtraSolid: Record<"light" | "dark", Pick<ClearExtraRoles, "successSoft" | "warningSoft" | "destructiveSoft" | "rowSel" | "toastBg">> = {
  light: { successSoft: "#CDFED4", warningSoft: "#FFF1E3", destructiveSoft: "#FEE8EB", rowSel: "#EAF4FF", toastBg: "#38383B" },
  dark: { successSoft: mix(clear.cardDark, "#30D158", 0.18), warningSoft: mix(clear.cardDark, "#FF9F0A", 0.18), destructiveSoft: mix(clear.cardDark, "#FF453A", 0.18), rowSel: mix(clear.cardDark, "#4DA3FF", 0.18), toastBg: "#E3E3E5" },
};

/**
 * Liquid Glass roles (spec 2.8, values from the v6 mock). CSS names are `--lg-<kebab>`: --lg-fill, --lg-fill-side, --lg-fill-strong, --lg-lift,
 * --lg-rim-a, --lg-rim-b, --lg-rim-c, --lg-edge, --lg-inner, --lg-shadow, --lg-shadow-lg, --lg-blur, --lg-blur-strong, --lg-sat, --lg-seg-track.
 */
export interface GlassRoles {
  fill: string;
  fillSide: string;
  fillStrong: string;
  lift: string;
  rimA: string;
  rimB: string;
  rimC: string;
  edge: string;
  inner: string;
  shadow: string;
  shadowLg: string;
  /** px */
  blur: number;
  blurStrong: number;
  sat: number;
  segTrack: string;
  /** Card elevation (rev 5): --shadow-card in the mock; emitted as --lg-shadow-card so Warm's --shadow-card is untouched. */
  shadowCard: string;
}

export const clearGlass: Record<"light" | "dark", GlassRoles> = {
  light: {
    fill: "rgba(255, 255, 255, 0.58)",
    fillSide: "rgba(255, 255, 255, 0.4)",
    fillStrong: "rgba(255, 255, 255, 0.86)",
    lift: "rgba(255, 255, 255, 0.82)",
    rimA: "rgba(255, 255, 255, 1)",
    rimB: "rgba(255, 255, 255, 0.3)",
    rimC: "rgba(255, 255, 255, 0.8)",
    edge: "rgba(255, 255, 255, 0.75)",
    inner: "rgba(255, 255, 255, 0.38)",
    shadow: "0 10px 30px rgba(20, 24, 40, 0.12), 0 2px 6px rgba(20, 24, 40, 0.06)",
    shadowLg: "0 24px 60px rgba(20, 24, 40, 0.22), 0 4px 12px rgba(20, 24, 40, 0.08)",
    blur: 22,
    blurStrong: 32,
    sat: 1.9,
    segTrack: "rgba(118, 118, 128, 0.14)",
    shadowCard: "0 1px 2px rgba(20, 24, 40, 0.05), 0 10px 24px -10px rgba(20, 24, 40, 0.14)",
  },
  dark: {
    fill: "rgba(84, 84, 92, 0.52)",
    fillSide: "rgba(84, 84, 92, 0.4)",
    fillStrong: "rgba(50, 50, 56, 0.84)",
    lift: "rgba(255, 255, 255, 0.22)",
    rimA: "rgba(255, 255, 255, 0.8)",
    rimB: "rgba(255, 255, 255, 0.12)",
    rimC: "rgba(255, 255, 255, 0.45)",
    edge: "rgba(255, 255, 255, 0.22)",
    inner: "rgba(255, 255, 255, 0.12)",
    shadow: "0 12px 32px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)",
    shadowLg: "0 28px 64px rgba(0, 0, 0, 0.75), 0 4px 12px rgba(0, 0, 0, 0.45)",
    blur: 22,
    blurStrong: 32,
    sat: 1.8,
    segTrack: "rgba(118, 118, 128, 0.32)",
    shadowCard: "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
  },
};

/** Reduce Transparency (and the `.solid` class): opaque glass, no blur, no rim sheen. Same layout. */
export const clearGlassSolid: Record<"light" | "dark", Partial<Record<keyof GlassRoles, string | number>> & { toastBg: string }> = {
  light: { fill: "#F2F2F4", fillSide: "#F2F2F4", fillStrong: "#F7F7F9", lift: "#FFFFFF", blur: 0, blurStrong: 0, sat: 1, inner: "transparent", rimA: "transparent", rimB: "transparent", rimC: "transparent", toastBg: "#303030" },
  dark: { fill: "#242427", fillSide: "#242427", fillStrong: "#1F1F22", lift: "#3A3A3C", blur: 0, blurStrong: 0, sat: 1, inner: "transparent", rimA: "transparent", rimB: "transparent", rimC: "transparent", toastBg: "#F5F5F7" },
};

/** Clear layout scale (audit 2.2 to 2.4), shared by web and mobile. */
export const clearLayout = {
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
  radius: { r1: 4, r2: 8, r3: 10, r4: 12, r5: 16, r6: 20, r7: 26, r8: 30, r9: 32 },
  button: { slim: 28, default: 32, quick: 40, circle: 44, large: 48, xl: 56 },
  segmented: { sm: 28, md: 32, lg: 44, inset: 2 },
  sidebar: { width: 244, radius: 30, inset: 12, padding: 10, item: 36, subItem: 32, groupLabel: 36 },
  toolbar: { height: 52, radius: 26, inset: 10, search: { width: 420, height: 32, radius: 16 }, control: 32 },
  tabBar: { width: 358, height: 64, radius: 32, inset: 4, tab: 56, tabRadius: 28, minimised: 52 },
  grid: { desktop: { contentStart: 268, contentEnd: 1428, columns: 8, column: 131, gutter: 16 }, phone: { margin: 16, columns: 2, column: 171, gutter: 16 } },
  card: { radius: 20, header: 56, row: 64, rowSingle: 44, padding: 16, gap: 16 },
  statCard: { desktop: { height: 144, tile: 32, tileRadius: 10 }, phone: { height: 172, tile: 36, tileRadius: 12 } },
  chip: { height: 24, radius: 12 },
  badge: { height: 20, radius: 8 },
} as const;

/** Composite an rgba() over an opaque hex (contrast checks for text on glass). */
export function composite(rgba: string, over: string): string {
  const m = rgba.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgbToHex(hexToRgb(rgba));
  const [r, g, b, a = 1] = m[1]!.split(",").map((x) => parseFloat(x));
  const o = hexToRgb(over);
  return rgbToHex({ r: o.r + (r! - o.r) * a, g: o.g + (g! - o.g) * a, b: o.b + (b! - o.b) * a });
}
