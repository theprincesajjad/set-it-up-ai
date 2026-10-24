import { palette as p } from "./palette.js";

/**
 * Semantic colour roles (v2, docs/design/foundations.md § Colour).
 *
 * The first block is the v2 system, exactly as the foundations table. New
 * code uses ONLY these. The second block keeps the role names the apps
 * already use so they keep compiling, but every one now resolves to a v2
 * value (brand = black, surfaces = white, tints = bg-subtle). They are
 * deprecated: restyle onto the v2 names.
 *
 * Accent rule: `accent` (#FF5A1F) is 3.1:1 on white, so it is for fills,
 * stamps, dots and large numbers (>= 17px semibold / 24px regular) only.
 * Small accent text uses `accentText` (#C2410C light, 5.2:1).
 */
export interface ColorRoles {
  // ── v2 roles ────────────────────────────────────────────────
  /** Screens, sheets. */
  bg: string;
  /** Grouped backgrounds, sidebar, table header. */
  bgSubtle: string;
  /** Pressed rows, skeletons, active sidebar item. */
  bgMuted: string;
  /** Primary text; primary buttons are fg-filled (black in light). */
  fg: string;
  /** Secondary text, italic place subtitles. */
  fgMuted: string;
  /** Placeholders, disabled. Not for readable text (below 4.5:1). */
  fgSubtle: string;
  /** Hairlines (1px web, StyleSheet.hairlineWidth native). */
  line: string;
  /** Form-control outlines that must meet 3:1 (inputs, checkboxes, empty stamp slots). */
  lineStrong: string;
  /** Points, stamps, "reward ready", activity dots. Nothing else. Fills / large numbers. */
  accent: string;
  /** Accent for small text (balances in lists, "reward ready" label). >= 4.5:1 on bg and accentSoft. */
  accentText: string;
  /** Background behind accent text / badges. */
  accentSoft: string;
  /** Icon/text drawn on an accent fill (icons + large text only, 3:1). */
  onAccent: string;
  /** "Open now" dot, positive delta arrow (dot/icon, 3:1). Not for small text: use `positiveText`. */
  positive: string;
  /** Positive text (deltas, "paid", "can text", credits): >= 4.5:1 on bg, bgSubtle, bgMuted and accentSoft in both themes. */
  positiveText: string;
  /** Closed, errors, destructive. Text-safe on bg. */
  negative: string;
  /** The user's own location dot only. */
  location: string;
  /** Frosted chrome fill (tab bar, top capsules): bg at 80%, use with blur.chrome. */
  chrome: string;
  /** Modal scrim. */
  overlay: string;
  /** QR codes are ALWAYS black on white, both themes, for scanner reliability. */
  qrFg: string;
  qrBg: string;

  // ── Deprecated v1 role names, redefined onto v2 ─────────────
  /** @deprecated use `bg` */ canvas: string;
  /** @deprecated use `bgSubtle` */ canvasSubtle: string;
  /** @deprecated use `bg` (cards on a white page get a `line` hairline, not a fill) */ surface: string;
  /** @deprecated use `bg` + shadows.float */ surfaceRaised: string;
  /** @deprecated use `bgSubtle` */ surfaceSunken: string;
  /** @deprecated use `fg` as a fill */ surfaceInverse: string;
  /** @deprecated use `bg` as text on an fg fill */ fgInverse: string;
  /** @deprecated links are `fg` + underline */ fgLink: string;
  /** @deprecated use `fgSubtle` */ fgDisabled: string;
  /** @deprecated use `line` */ border: string;
  /** @deprecated use `lineStrong` */ borderStrong: string;
  /** Focus ring: fg (2px + 2px offset). */ focusRing: string;
  /** @deprecated primary buttons are `fg` (black) */ brand: string;
  /** @deprecated */ brandHover: string;
  /** @deprecated */ brandPressed: string;
  /** @deprecated use `bg` on an `fg` fill */ onBrand: string;
  /** @deprecated use `bgMuted` (no tinted fills in v2) */ brandSubtle: string;
  /** @deprecated use `fg` */ onBrandSubtle: string;
  /** @deprecated brand-coloured text is gone; use `fg`, or `accentText` for points */ fgBrand: string;
  /** @deprecated */ accentHover: string;
  /** @deprecated use `accentSoft` */ accentSubtle: string;
  /** @deprecated use `accentText` */ onAccentSubtle: string;
  /** @deprecated use `bgMuted` */ neutralSubtle: string;
  /** @deprecated use `fgMuted` */ onNeutralSubtle: string;
  /** @deprecated use `positive` (dot + word, never a filled card) */ success: string;
  /** @deprecated */ onSuccess: string;
  /** @deprecated use `bgSubtle` */ successSubtle: string;
  /** @deprecated use `fg` */ onSuccessSubtle: string;
  /** @deprecated no warning colour in v2: use an fg (black) banner */ warning: string;
  /** @deprecated */ onWarning: string;
  /** @deprecated use `bgSubtle` */ warningSubtle: string;
  /** @deprecated use `fg` */ onWarningSubtle: string;
  /** @deprecated use `negative` */ danger: string;
  /** @deprecated */ dangerHover: string;
  /** @deprecated */ onDanger: string;
  /** @deprecated use `bgSubtle` + a `negative` icon */ dangerSubtle: string;
  /** @deprecated use `fg` */ onDangerSubtle: string;
  /** @deprecated no info colour in v2: use `fg` */ info: string;
  /** @deprecated */ onInfo: string;
  /** @deprecated use `bgSubtle` */ infoSubtle: string;
  /** @deprecated use `fg` */ onInfoSubtle: string;
  /** @deprecated use `bgMuted` */ disabledBg: string;
  /** @deprecated */ onDisabled: string;
  /** Skeleton block (bgMuted) and its shimmer highlight (bgSubtle). */ skeleton: string;
  skeletonHighlight: string;
  /** Empty stamp slot outline (lineStrong). */ stampEmpty: string;
  /** Points ring / bar track (bgMuted). */ ringTrack: string;
}

const v2Light = {
  bg: p.gray[0],
  bgSubtle: p.gray[50],
  bgMuted: p.gray[100],
  fg: p.gray[950],
  fgMuted: p.gray[600],
  fgSubtle: p.gray[400],
  line: p.gray[150],
  lineStrong: p.gray[450],
  accent: p.orange[500],
  accentText: p.orange[700],
  accentSoft: p.orange[50],
  onAccent: p.gray[0],
  positive: p.green[600],
  positiveText: p.green[800],
  negative: p.red[600],
  location: p.blue[500],
  chrome: "rgba(255, 255, 255, 0.8)",
  overlay: "rgba(11, 11, 12, 0.4)",
  qrFg: "#000000",
  qrBg: "#FFFFFF",
} as const;

const v2Dark = {
  bg: p.gray[950],
  bgSubtle: p.gray[900],
  bgMuted: p.gray[850],
  fg: p.gray[50],
  fgMuted: p.gray[650],
  fgSubtle: p.gray[550],
  line: p.gray[800],
  lineStrong: p.gray[500],
  accent: p.orange[400],
  accentText: p.orange[400],
  accentSoft: p.orange[950],
  onAccent: p.gray[950],
  positive: p.green[500],
  positiveText: p.green[500],
  negative: p.red[400],
  location: p.blue[400],
  chrome: "rgba(22, 22, 24, 0.8)",
  overlay: "rgba(0, 0, 0, 0.6)",
  qrFg: "#000000",
  qrBg: "#FFFFFF",
} as const;

type V2 = { [K in keyof typeof v2Light]: string };

/** v1 role names expressed in v2 roles (same mapping in both themes). */
function legacy(c: V2, x: { brandHover: string; brandPressed: string; accentHover: string; dangerHover: string; onDanger: string; onSuccess: string }) {
  return {
    canvas: c.bg,
    canvasSubtle: c.bgSubtle,
    surface: c.bg,
    surfaceRaised: c.bg,
    surfaceSunken: c.bgSubtle,
    surfaceInverse: c.fg,
    fgInverse: c.bg,
    fgLink: c.fg,
    fgDisabled: c.fgSubtle,
    border: c.line,
    borderStrong: c.lineStrong,
    focusRing: c.fg,
    brand: c.fg,
    brandHover: x.brandHover,
    brandPressed: x.brandPressed,
    onBrand: c.bg,
    brandSubtle: c.bgMuted,
    onBrandSubtle: c.fg,
    fgBrand: c.fg,
    accentHover: x.accentHover,
    accentSubtle: c.accentSoft,
    onAccentSubtle: c.accentText,
    neutralSubtle: c.bgMuted,
    onNeutralSubtle: c.fgMuted,
    success: c.positive,
    onSuccess: x.onSuccess,
    successSubtle: c.bgSubtle,
    onSuccessSubtle: c.fg,
    warning: c.fg,
    onWarning: c.bg,
    warningSubtle: c.bgSubtle,
    onWarningSubtle: c.fg,
    danger: c.negative,
    dangerHover: x.dangerHover,
    onDanger: x.onDanger,
    dangerSubtle: c.bgSubtle,
    onDangerSubtle: c.fg,
    info: c.fg,
    onInfo: c.bg,
    infoSubtle: c.bgSubtle,
    onInfoSubtle: c.fg,
    disabledBg: c.bgMuted,
    onDisabled: c.fgMuted,
    skeleton: c.bgMuted,
    skeletonHighlight: c.bgSubtle,
    stampEmpty: c.lineStrong,
    ringTrack: c.bgMuted,
  };
}

export const light: ColorRoles = {
  ...v2Light,
  ...legacy(v2Light, {
    brandHover: "#26262A",
    brandPressed: "#3A3A3F",
    accentHover: p.orange[600],
    dangerHover: p.red[700],
    onDanger: p.gray[0],
    onSuccess: p.gray[0],
  }),
};

export const dark: ColorRoles = {
  ...v2Dark,
  ...legacy(v2Dark, {
    brandHover: "#E5E5E3",
    brandPressed: "#D4D4D2",
    accentHover: "#FF8F62",
    dangerHover: "#FCA5A5",
    onDanger: p.gray[950],
    onSuccess: p.gray[950],
  }),
};

export const colors = { light, dark } as const;
export type ThemeName = keyof typeof colors;
export type ColorRole = keyof ColorRoles;

/** The v2 role names (what new code should use). */
export const v2ColorRoles = Object.keys(v2Light) as ColorRole[];

/** A foreground/background pair the system promises is readable. */
export interface ContrastPair {
  fg: ColorRole;
  bg: ColorRole;
  /** Minimum ratio: 4.5 for body text, 3 for UI/non-text and large text. */
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
  ...textOn(["bg", "bgSubtle", "bgMuted"], ["fg", "fgMuted"], "Primary & secondary text on every background"),
  ...textOn(["bg", "bgSubtle", "accentSoft"], ["accentText"], "Small accent text: balances, 'reward ready', points labels"),
  { fg: "bg", bg: "fg", min: TEXT, note: "Primary (black) button label, inverse snackbar" },
  ...textOn(["bg", "bgSubtle", "bgMuted", "accentSoft"], ["positiveText"], "Positive text: deltas, 'paid', 'can text', credit lines"),
  { fg: "negative", bg: "bg", min: TEXT, note: "Inline error / 'closed' text" },
  { fg: "qrFg", bg: "qrBg", min: 15, note: "QR modules: always black on white" },
  // Large text / non-text UI (WCAG 1.4.3 large, 1.4.11)
  { fg: "accent", bg: "bg", min: UI, note: "Accent fills, stamps, dots and large (>= 17px semibold) numbers" },
  { fg: "onAccent", bg: "accent", min: UI, note: "Check icon / large label on a filled stamp or accent badge" },
  { fg: "positive", bg: "bg", min: UI, note: "'Open now' dot, positive delta arrow" },
  { fg: "location", bg: "bg", min: UI, note: "User location dot" },
  { fg: "lineStrong", bg: "bg", min: UI, note: "Input / checkbox outline, empty stamp slot" },
  { fg: "lineStrong", bg: "bgSubtle", min: UI, note: "Input outline on grouped background" },
  { fg: "fg", bg: "bg", min: UI, note: "Focus ring (fg), chart line/bars" },
  { fg: "fgSubtle", bg: "bg", min: 2.5, note: "Placeholder / disabled (exempt; kept legible)" },
  // Deprecated names still used by apps
  ...(["brand", "brandHover", "brandPressed"] as ColorRole[]).map((bg) => ({ fg: "onBrand" as ColorRole, bg, min: TEXT, note: "Legacy primary button label in all states" })),
  { fg: "onDanger", bg: "danger", min: TEXT, note: "Destructive button" },
  { fg: "onDanger", bg: "dangerHover", min: TEXT, note: "Destructive button hover" },
  { fg: "onAccentSubtle", bg: "accentSubtle", min: TEXT, note: "Legacy reward-ready chip" },
  { fg: "onNeutralSubtle", bg: "neutralSubtle", min: TEXT, note: "Legacy neutral chip" },
  { fg: "onDisabled", bg: "disabledBg", min: UI, note: "Disabled control label (exempt; held to 3:1)" },
];
