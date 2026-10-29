import { mix } from "./contrast.js";
import { clearDarkAccent } from "./clear.js";
import { TRADE_FAMILIES, tradeFamilies, tradeFamilyOf, type TradeFamily } from "./warm.js";

/**
 * The 3D icon and illustration set (docs/design/onboarding-v1.md section 6).
 *
 * Objects (viewBox 0 0 48 48, shown at 40, 64, 96 or 120) and spot scenes (0 0 160 120). Light from the top-left; exactly three flat tones per
 * material; trade colour enters as one accent material per object. Files: assets/icons3d/<name>.svg, copied to apps/web/public/icons3d/ and
 * apps/mobile/assets/icons3d/ with a @2x PNG and, for the web, one sprite.svg that the Icon3d component references.
 */

/** Trade objects (accent = trade colour). `cafe`, `bakery`, `eat`, `repair`, `shops`, `services`, `beauty` and `top` are the existing categories on the 24-unit grid. */
export const ICON3D_TRADE = [
  "nails", "brows_lashes", "makeup", "barber", "salon", "groomer", "cafe", "bakery", "butcher", "pet_shop",
  "repair", "shops", "services", "eat", "beauty", "top",
] as const;

/** Step and concept objects (accent = trade colour when known). */
export const ICON3D_STEP = [
  "link", "price_tag", "calendar_week", "pin_area", "megaphone", "phone_message", "qr_stand", "stamp_card", "deposit", "bell",
  "pass", "site", "domain", "inbox", "instagram_mark", "team", "pos", "check_done",
] as const;

/** Spot illustrations (160 x 120): one scene each, at most four objects. */
export const ICON3D_SCENES = ["live", "first_booking", "regulars", "home_studio", "site_ready", "inbox_quiet", "chairs"] as const;

export const ICON3D_OBJECTS = [...ICON3D_TRADE, ...ICON3D_STEP] as const;
export const ICON3D_NAMES = [...ICON3D_OBJECTS, ...ICON3D_SCENES] as const;

export type Icon3dTrade = (typeof ICON3D_TRADE)[number];
export type Icon3dStep = (typeof ICON3D_STEP)[number];
export type Icon3dObject = (typeof ICON3D_OBJECTS)[number];
export type Icon3dScene = (typeof ICON3D_SCENES)[number];
export type Icon3dName = (typeof ICON3D_NAMES)[number];

export const isIcon3dScene = (name: Icon3dName): name is Icon3dScene => (ICON3D_SCENES as readonly string[]).includes(name);

/** Sizes an object is drawn at: 40 choice tiles and share rows, 64 step cards, 96 empty states and Home cards, 120 landing hero tiles. Never below 40 (Lucide owns the small glyphs). */
export const ICON3D_SIZES = { tile: 40, step: 64, empty: 96, hero: 120 } as const;
export type Icon3dSize = (typeof ICON3D_SIZES)[keyof typeof ICON3D_SIZES];

export const ICON3D_VIEWBOX = { object: { w: 48, h: 48 }, scene: { w: 160, h: 120 } } as const;

/** Ink used to derive the mid and shade tones, and for marks. */
export const ICON3D_INK = "#1D1D1F";
/** Mid is the base mixed 18% toward ink, shade 36%. */
export const ICON3D_MID = 0.18;
export const ICON3D_SHADE = 0.36;

/** The neutral body, from the Clear tokens. */
export const icon3dNeutral = {
  // canvasLit: on the #F2F2F7 canvas (not a white card) the lit body tone would equal the background and the top faces would vanish, so an
  // object placed straight on the canvas (`Icon3d surface="canvas"`) lifts its lit tone to white. Mid and shade stay.
  light: { lit: "#F2F2F7", canvasLit: "#FFFFFF", mid: "#D2D2D7", shade: "#AEAEB4", ink: ICON3D_INK, onAccent: "#FFFFFF", shadow: ICON3D_INK, shadowOpacity: 0.08 },
  dark: { lit: "#3A3A3C", mid: "#2C2C2E", shade: "#1C1C1E", ink: "#F2F2F7", onAccent: "#1A1208", shadow: "#FFFFFF", shadowOpacity: 0.06 },
} as const;

/** The sky family: the accent when no trade is known (marketing, generic steps). */
export const ICON3D_DEFAULT_FAMILY: TradeFamily = "sky";

/** The three tones of an accent: lit = the colour, mid = 18% toward ink, shade = 36% toward ink (hex, for native and email). The web derives the same with color-mix. */
export function icon3dTones(accent: string): { lit: string; mid: string; shade: string } {
  return { lit: mix(accent, accent, 0), mid: mix(accent, ICON3D_INK, ICON3D_MID), shade: mix(accent, ICON3D_INK, ICON3D_SHADE) };
}

/** The accent of a family in a theme: the family accent in light, the lifted value in Clear dark. */
export function icon3dAccent(family: TradeFamily, theme: "light" | "dark"): string {
  return theme === "light" ? tradeFamilies[family].accent : clearDarkAccent(family);
}

/** A family name, or a vertical from @ll/shared (mapped to its family). Anything else is the default family. */
export function icon3dFamily(trade: string | null | undefined): TradeFamily {
  if (!trade) return ICON3D_DEFAULT_FAMILY;
  if ((TRADE_FAMILIES as readonly string[]).includes(trade)) return trade as TradeFamily;
  return (tradeFamilyOf as Record<string, TradeFamily>)[trade] ?? ICON3D_DEFAULT_FAMILY;
}

/** The stylesheet that makes one SVG serve every trade colour and both themes (written to css/icons3d.css by scripts/icons3d.mjs). */
export function icons3dCss(): string {
  const mid = `${Math.round((1 - ICON3D_MID) * 100)}%`;
  const shade = `${Math.round((1 - ICON3D_SHADE) * 100)}%`;
  const L = icon3dNeutral.light;
  const D = icon3dNeutral.dark;
  const lines: string[] = [];
  lines.push("/* Generated by scripts/icons3d.mjs from src/icons3d.ts. Do not edit. */");
  lines.push(`.i3d {`);
  lines.push(`  --i3d-n1: ${L.lit}; --i3d-n2: ${L.mid}; --i3d-n3: ${L.shade}; --i3d-ik: ${L.ink}; --i3d-on: ${L.onAccent}; --i3d-w: #FFFFFF;`);
  lines.push(`  --i3d-sh: ${L.shadow}; --i3d-so: ${L.shadowOpacity / 3};`);
  lines.push(`  --i3d-accent-l: ${tradeFamilies[ICON3D_DEFAULT_FAMILY].accent}; --i3d-accent-d: ${clearDarkAccent(ICON3D_DEFAULT_FAMILY)};`);
  lines.push(`  --i3d-accent: var(--i3d-accent-l);`);
  lines.push(`  --i3d-a1: var(--i3d-accent);`);
  lines.push(`  --i3d-a2: color-mix(in srgb, var(--i3d-accent) ${mid}, ${ICON3D_INK});`);
  lines.push(`  --i3d-a3: color-mix(in srgb, var(--i3d-accent) ${shade}, ${ICON3D_INK});`);
  lines.push(`  display: inline-block; flex: none; overflow: visible;`);
  lines.push(`}`);
  const darkBody = `  --i3d-n1: ${D.lit}; --i3d-n2: ${D.mid}; --i3d-n3: ${D.shade}; --i3d-ik: ${D.ink}; --i3d-on: ${D.onAccent};\n  --i3d-sh: ${D.shadow}; --i3d-so: ${D.shadowOpacity / 3}; --i3d-accent: var(--i3d-accent-d);`;
  lines.push(`/* Straight on the light canvas: the lit tone lifts to white so the top faces stay visible (dark mode below wins). */`);
  lines.push(`.i3d[data-surface="canvas"] { --i3d-n1: ${L.canvasLit}; }`);
  lines.push(`/* Clear graphite dark: the body tones swap, the accent lifts, the shadow turns white. */`);
  lines.push(`:root[data-theme="dark"] .i3d {\n${darkBody}\n}`);
  lines.push(`/* Warm follows the device. */`);
  lines.push(`@media (prefers-color-scheme: dark) {\n  :root[data-theme-style="warm"]:not([data-theme="light"]) .i3d {\n  ${darkBody.replace(/\n/g, "\n  ")}\n  }\n}`);
  lines.push(`/* The 14 trade families: light accent and the dark lift. */`);
  for (const f of TRADE_FAMILIES) lines.push(`.i3d[data-fam="${f}"] { --i3d-accent-l: ${tradeFamilies[f].accent}; --i3d-accent-d: ${clearDarkAccent(f)}; }`);
  lines.push("");
  return lines.join("\n");
}
