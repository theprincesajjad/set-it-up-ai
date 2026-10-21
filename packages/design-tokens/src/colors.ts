import { palette as p } from "./palette.js";

/**
 * Semantic colour roles. Every component uses these, never raw hex.
 *
 * Naming: `x` is a fill, `onX` is text/icon drawn ON that fill,
 * `xSubtle` is a tinted background, `onXSubtle` is text/icon on that tint,
 * `fg*` is text on canvas/surface. All `on*` and `fg*` pairs are contrast
 * tested in test/contrast.test.ts (>= 4.5:1).
 */
export interface ColorRoles {
  // Backgrounds
  canvas: string; // app/page background ("paper")
  canvasSubtle: string; // alternating sections, sidebar
  surface: string; // cards, sheets, inputs
  surfaceRaised: string; // popovers, menus, toasts on top of surface
  surfaceSunken: string; // wells, table header, segmented control track
  surfaceInverse: string; // tooltips, snackbars in light mode
  overlay: string; // modal scrim (with alpha)

  // Text
  fg: string;
  fgMuted: string; // secondary text, labels, helper text, placeholders
  fgInverse: string; // text on surfaceInverse
  fgLink: string;
  fgDisabled: string; // exempt from contrast (WCAG 1.4.3 exception), but kept >= 3:1 anyway where possible

  // Lines
  border: string; // decorative dividers, card outlines (exempt from 3:1)
  borderStrong: string; // input borders, checkbox outlines (>= 3:1 vs surface)
  focusRing: string; // 2px focus ring + 2px offset (>= 3:1 vs canvas & surface)

  // Brand (primary actions)
  brand: string;
  brandHover: string;
  brandPressed: string;
  onBrand: string;
  brandSubtle: string;
  onBrandSubtle: string;
  fgBrand: string; // brand colour used as text on canvas/surface (e.g. points numbers, links in cards)

  // Accent (stamps, points earned, celebratory moments, highlights)
  accent: string;
  accentHover: string;
  onAccent: string;
  accentSubtle: string;
  onAccentSubtle: string;

  // Neutral chips, "Sponsored" label, "Coming soon" lock tag
  neutralSubtle: string;
  onNeutralSubtle: string;

  // Semantic
  success: string;
  onSuccess: string;
  successSubtle: string;
  onSuccessSubtle: string;
  warning: string;
  onWarning: string;
  warningSubtle: string;
  onWarningSubtle: string;
  danger: string;
  dangerHover: string;
  onDanger: string;
  dangerSubtle: string;
  onDangerSubtle: string;
  info: string;
  onInfo: string;
  infoSubtle: string;
  onInfoSubtle: string;

  // Specials
  disabledBg: string;
  onDisabled: string;
  skeleton: string;
  skeletonHighlight: string;
  stampEmpty: string; // empty stamp slot outline
  ringTrack: string; // points ring background track
  /** QR codes are ALWAYS black on white, both themes, for scanner reliability. */
  qrFg: string;
  qrBg: string;
}

export const light: ColorRoles = {
  canvas: p.stone[50],
  canvasSubtle: p.stone[100],
  surface: p.stone[0],
  surfaceRaised: p.stone[0],
  surfaceSunken: p.stone[100],
  surfaceInverse: p.stone[900],
  overlay: "rgba(31, 27, 22, 0.48)",

  fg: p.stone[900],
  fgMuted: p.stone[600],
  fgInverse: p.stone[50],
  fgLink: p.pine[700],
  fgDisabled: p.stone[400],

  border: p.stone[200],
  borderStrong: p.stone[500],
  focusRing: p.lake[600],

  brand: p.pine[600],
  brandHover: p.pine[700],
  brandPressed: p.pine[800],
  onBrand: p.stone[0],
  brandSubtle: p.pine[50],
  onBrandSubtle: p.pine[800],
  fgBrand: p.pine[700],

  accent: p.marigold[400],
  accentHover: p.marigold[500],
  onAccent: p.stone[900],
  accentSubtle: p.marigold[50],
  onAccentSubtle: p.marigold[800],

  neutralSubtle: p.stone[100],
  onNeutralSubtle: p.stone[700],

  success: p.leaf[600],
  onSuccess: p.stone[0],
  successSubtle: p.leaf[50],
  onSuccessSubtle: p.leaf[800],
  warning: p.ochre[400],
  onWarning: p.stone[900],
  warningSubtle: p.ochre[50],
  onWarningSubtle: p.ochre[800],
  danger: p.cherry[600],
  dangerHover: p.cherry[700],
  onDanger: p.stone[0],
  dangerSubtle: p.cherry[50],
  onDangerSubtle: p.cherry[800],
  info: p.lake[600],
  onInfo: p.stone[0],
  infoSubtle: p.lake[50],
  onInfoSubtle: p.lake[800],

  disabledBg: p.stone[200],
  onDisabled: p.stone[600],
  skeleton: p.stone[200],
  skeletonHighlight: p.stone[100],
  stampEmpty: p.stone[500],
  ringTrack: p.stone[200],
  qrFg: "#000000",
  qrBg: "#FFFFFF",
};

export const dark: ColorRoles = {
  canvas: p.stone[950],
  canvasSubtle: p.stone[1000],
  surface: p.stone[900],
  surfaceRaised: p.stone[850],
  surfaceSunken: p.stone[1000],
  surfaceInverse: p.stone[100],
  overlay: "rgba(0, 0, 0, 0.64)",

  fg: p.stone[100],
  fgMuted: p.stone[400],
  fgInverse: p.stone[900],
  fgLink: p.pine[300],
  fgDisabled: p.stone[600],

  border: p.stone[800],
  borderStrong: p.stone[500],
  focusRing: p.lake[400],

  brand: p.pine[400],
  brandHover: p.pine[300],
  brandPressed: p.pine[200],
  onBrand: p.stone[1000],
  brandSubtle: p.pine[950],
  onBrandSubtle: p.pine[200],
  fgBrand: p.pine[300],

  accent: p.marigold[400],
  accentHover: p.marigold[300],
  onAccent: p.stone[1000],
  accentSubtle: "#33240C",
  onAccentSubtle: p.marigold[200],

  neutralSubtle: p.stone[800],
  onNeutralSubtle: p.stone[200],

  success: p.leaf[400],
  onSuccess: p.stone[1000],
  successSubtle: "#10291A",
  onSuccessSubtle: p.leaf[300],
  warning: p.ochre[400],
  onWarning: p.stone[1000],
  warningSubtle: "#30210A",
  onWarningSubtle: p.ochre[300],
  danger: p.cherry[400],
  dangerHover: p.cherry[300],
  onDanger: p.stone[1000],
  dangerSubtle: "#3A1411",
  onDangerSubtle: p.cherry[300],
  info: p.lake[400],
  onInfo: p.stone[1000],
  infoSubtle: "#0F2238",
  onInfoSubtle: p.lake[300],

  disabledBg: p.stone[800],
  onDisabled: p.stone[400],
  skeleton: p.stone[800],
  skeletonHighlight: p.stone[850],
  stampEmpty: p.stone[500],
  ringTrack: p.stone[800],
  qrFg: "#000000",
  qrBg: "#FFFFFF",
};

export const colors = { light, dark } as const;
export type ThemeName = keyof typeof colors;
export type ColorRole = keyof ColorRoles;

/** A foreground/background pair the system promises is readable. */
export interface ContrastPair {
  fg: ColorRole;
  bg: ColorRole;
  /** Minimum ratio: 4.5 for body text, 3 for UI/non-text. */
  min: number;
  note: string;
}

const TEXT = 4.5;
const UI = 3;

const textOn = (bgs: ColorRole[], fgs: ColorRole[], note: string): ContrastPair[] =>
  bgs.flatMap((bg) => fgs.map((fg) => ({ fg, bg, min: TEXT, note })));

/**
 * Every text/background and UI/background pair the components use. If a
 * component needs a pair that is not listed here, add it here first so the
 * test checks it.
 */
export const contrastPairs: ContrastPair[] = [
  ...textOn(
    ["canvas", "canvasSubtle", "surface", "surfaceRaised", "surfaceSunken"],
    ["fg", "fgMuted", "fgLink", "fgBrand"],
    "Body & secondary text, links and brand-coloured numbers on every background",
  ),
  { fg: "fgInverse", bg: "surfaceInverse", min: TEXT, note: "Tooltip / snackbar text" },
  ...(["brand", "brandHover", "brandPressed"] as ColorRole[]).map((bg) => ({
    fg: "onBrand" as ColorRole,
    bg,
    min: TEXT,
    note: "Primary button label in all states",
  })),
  { fg: "onBrandSubtle", bg: "brandSubtle", min: TEXT, note: "Brand chip, selected tab, tonal button" },
  { fg: "onAccent", bg: "accent", min: TEXT, note: "Accent button / points-earned banner" },
  { fg: "onAccent", bg: "accentHover", min: TEXT, note: "Accent button hover" },
  { fg: "onAccentSubtle", bg: "accentSubtle", min: TEXT, note: "Reward-ready chip, promo card tint" },
  { fg: "onNeutralSubtle", bg: "neutralSubtle", min: TEXT, note: "Sponsored label, Coming soon tag, neutral chip" },
  { fg: "onSuccess", bg: "success", min: TEXT, note: "Success fill (award confirmation)" },
  { fg: "onSuccessSubtle", bg: "successSubtle", min: TEXT, note: "Success banner / badge" },
  { fg: "onWarning", bg: "warning", min: TEXT, note: "Warning fill (offline banner)" },
  { fg: "onWarningSubtle", bg: "warningSubtle", min: TEXT, note: "Warning banner / badge" },
  { fg: "onDanger", bg: "danger", min: TEXT, note: "Destructive button" },
  { fg: "onDanger", bg: "dangerHover", min: TEXT, note: "Destructive button hover" },
  { fg: "onDangerSubtle", bg: "dangerSubtle", min: TEXT, note: "Error banner / inline error" },
  { fg: "onInfo", bg: "info", min: TEXT, note: "Info fill" },
  { fg: "onInfoSubtle", bg: "infoSubtle", min: TEXT, note: "Info banner / badge" },
  { fg: "danger", bg: "surface", min: TEXT, note: "Inline field error text on input surface" },
  { fg: "danger", bg: "canvas", min: TEXT, note: "Inline error text on canvas" },
  { fg: "onSuccessSubtle", bg: "surface", min: TEXT, note: "'+12 pts' green text in activity list" },
  { fg: "onDisabled", bg: "disabledBg", min: UI, note: "Disabled control label (exempt; held to 3:1)" },
  { fg: "qrFg", bg: "qrBg", min: 15, note: "QR modules: always black on white" },
  // Non-text UI (WCAG 1.4.11)
  { fg: "borderStrong", bg: "surface", min: UI, note: "Input / checkbox border" },
  { fg: "borderStrong", bg: "canvas", min: UI, note: "Input border on canvas" },
  { fg: "focusRing", bg: "canvas", min: UI, note: "Focus ring" },
  { fg: "focusRing", bg: "surface", min: UI, note: "Focus ring on cards" },
  { fg: "brand", bg: "surface", min: UI, note: "Brand icons, selected radio, progress fill" },
  { fg: "brand", bg: "canvas", min: UI, note: "Brand icons on canvas" },
  { fg: "stampEmpty", bg: "surface", min: UI, note: "Empty stamp slot outline" },
  { fg: "danger", bg: "dangerSubtle", min: UI, note: "Error icon in error banner" },
];
