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

/**
 * v3 roles (docs/design/v3-strategy.md section 5): shadcn variable names for every role, warm stone neutrals,
 * our orange renamed `points`, new `info`, `warning` and `paper`. The CSS custom properties are these keys in
 * kebab-case (`--background`, `--muted-foreground`, `--points-text` ...). The v2 role names above are aliases
 * of these (see `v2Alias`) until the final sweep.
 *
 * NOTE `accent` here is shadcn's "hover surface", NOT the orange (that is `points`). The v2 `ColorRoles.accent`
 * (orange) is the alias of `points`.
 */
export interface RolesV3 {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  /** Hover / active surface. Not the brand orange. */
  accent: string;
  accentForeground: string;
  destructive: string;
  border: string;
  /** Form-control outline (3:1). */
  input: string;
  ring: string;
  /** Disabled only (3.6:1 on background). Placeholders use `mutedForeground`. */
  subtleForeground: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  /** Points, stamps, the shop-must-act dot. Fills, dots, numbers >= 17px. */
  points: string;
  /** Small orange text. */
  pointsText: string;
  pointsSoft: string;
  pointsForeground: string;
  success: string;
  successText: string;
  info: string;
  infoText: string;
  infoSoft: string;
  warning: string;
  warningText: string;
  /** Pass and marketing canvas. */
  paper: string;
  /** Always black on white. */
  qrFg: string;
  qrBg: string;
}

const v3Light: RolesV3 = {
  background: p.stone[0],
  foreground: p.gray[950],
  card: p.stone[0],
  cardForeground: p.gray[950],
  popover: p.stone[0],
  popoverForeground: p.gray[950],
  primary: p.gray[950],
  primaryForeground: p.stone[0],
  secondary: p.stone[50],
  secondaryForeground: p.gray[950],
  muted: p.stone[50],
  mutedForeground: p.stone[600],
  accent: p.stone[100],
  accentForeground: p.gray[950],
  destructive: p.red[600],
  border: p.stone[150],
  input: p.stone[400],
  ring: p.gray[950],
  subtleForeground: p.stone[400],
  sidebar: p.stone[50],
  sidebarForeground: p.gray[950],
  sidebarPrimary: p.gray[950],
  sidebarPrimaryForeground: p.stone[0],
  sidebarAccent: p.stone[100],
  sidebarAccentForeground: p.gray[950],
  sidebarBorder: p.stone[150],
  sidebarRing: p.gray[950],
  points: p.orange[500],
  pointsText: p.orange[700],
  pointsSoft: p.orange[50],
  pointsForeground: p.stone[0],
  success: p.green[600],
  successText: p.green[700],
  info: p.blue[500],
  infoText: p.blue[700],
  infoSoft: p.blue[50],
  warning: p.amber[600],
  warningText: p.amber[700],
  paper: p.stone[25],
  qrFg: "#000000",
  qrBg: "#FFFFFF",
};

const v3Dark: RolesV3 = {
  background: p.stone[950],
  foreground: p.stone[50],
  card: p.stone[900],
  cardForeground: p.stone[50],
  popover: p.stone[900],
  popoverForeground: p.stone[50],
  primary: p.stone[50],
  primaryForeground: p.stone[950],
  secondary: p.stone[850],
  secondaryForeground: p.stone[50],
  muted: p.stone[850],
  mutedForeground: p.stone[650],
  accent: p.stone[800],
  accentForeground: p.stone[50],
  destructive: p.red[400],
  border: p.stone[750],
  input: p.stone[550],
  ring: p.stone[50],
  subtleForeground: p.stone[550],
  sidebar: p.stone[900],
  sidebarForeground: p.stone[50],
  sidebarPrimary: p.stone[50],
  sidebarPrimaryForeground: p.stone[950],
  sidebarAccent: p.stone[800],
  sidebarAccentForeground: p.stone[50],
  sidebarBorder: p.stone[750],
  sidebarRing: p.stone[50],
  points: p.orange[400],
  pointsText: p.orange[400],
  pointsSoft: p.orange[950],
  pointsForeground: p.stone[950],
  success: p.green[500],
  successText: p.green[400],
  info: p.blue[400],
  infoText: p.blue[300],
  infoSoft: p.blue[950],
  warning: p.amber[400],
  warningText: p.amber[400],
  paper: p.stone[950],
  qrFg: "#000000",
  qrBg: "#FFFFFF",
};

export const rolesV3 = { light: v3Light, dark: v3Dark } as const;
export type RoleV3 = keyof RolesV3;

/** v3 chart series (shadcn `--chart-1` to `--chart-5`). */
export const chartSeriesV3 = {
  light: [p.gray[950], p.orange[500], p.stone[600], p.blue[500], p.green[600]],
  dark: [p.stone[50], p.orange[400], p.stone[650], p.blue[400], p.green[500]],
} as const;

/**
 * v2 role name -> the v3 role it is an alias of. The CSS emits `--ll-color-<v2>: var(--<v3>)` for these, and
 * the TS values below are read from the v3 table, so web and native cannot drift. Removed in the final sweep.
 */
export const v2Alias = {
  bg: "background",
  bgSubtle: "muted",
  bgMuted: "accent",
  fg: "foreground",
  fgMuted: "mutedForeground",
  fgSubtle: "subtleForeground",
  line: "border",
  lineStrong: "input",
  accent: "points",
  accentText: "pointsText",
  accentSoft: "pointsSoft",
  onAccent: "pointsForeground",
  positive: "success",
  negative: "destructive",
  location: "info",
  focusRing: "ring",
  qrFg: "qrFg",
  qrBg: "qrBg",
} as const satisfies Partial<Record<string, RoleV3>>;

const fromV3 = (r: RolesV3) => ({
  bg: r.background,
  bgSubtle: r.muted,
  bgMuted: r.accent,
  fg: r.foreground,
  fgMuted: r.mutedForeground,
  fgSubtle: r.subtleForeground,
  line: r.border,
  lineStrong: r.input,
  accent: r.points,
  accentText: r.pointsText,
  accentSoft: r.pointsSoft,
  onAccent: r.pointsForeground,
  positive: r.success,
  negative: r.destructive,
  location: r.info,
  qrFg: r.qrFg,
  qrBg: r.qrBg,
});

/**
 * v2 `positiveText` is NOT an alias of `successText`: the strategy's #15803D is 4.2:1 on the v3 hover surface (`accent`, #EEEBE6),
 * and v2 promised 4.5:1 on bgMuted. It keeps its v2 value (green 800) until the sweep; `successText` is for background and muted only.
 */
const v2Light = {
  ...fromV3(v3Light),
  positiveText: p.green[800],
  chrome: "rgba(255, 255, 255, 0.8)",
  overlay: "rgba(11, 11, 12, 0.4)",
} as const;

const v2Dark = {
  ...fromV3(v3Dark),
  positiveText: p.green[500],
  chrome: "rgba(22, 20, 18, 0.8)",
  overlay: "rgba(0, 0, 0, 0.6)",
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

/** A v3 foreground/background pair (section 5.1 of v3-strategy.md). `themes` limits a pair to one theme. */
export interface ContrastPairV3 {
  fg: RoleV3;
  bg: RoleV3;
  min: number;
  note: string;
  themes?: ThemeName[];
}

const textOnV3 = (bgs: RoleV3[], fgs: RoleV3[], note: string, themes?: ThemeName[]): ContrastPairV3[] =>
  bgs.flatMap((bg) => fgs.map((fg) => ({ fg, bg, min: TEXT, note, ...(themes ? { themes } : {}) })));

/**
 * Every v3 pair the components may use. Add a pair here before using it in a component; the test asserts
 * each one in light and dark. Numbers in the notes are the ratios computed in v3-strategy.md section 5.1.
 */
export const contrastPairsV3: ContrastPairV3[] = [
  ...textOnV3(["background", "card", "popover", "muted", "accent"], ["foreground"], "Primary text on every surface (19.7 / 17.7 on background)"),
  ...textOnV3(["background", "muted", "accent"], ["mutedForeground"], "Secondary text and placeholders (5.6 / 5.1 / 4.7 light, 7.8 / 6.9 dark)"),
  { fg: "primaryForeground", bg: "primary", min: TEXT, note: "The one black primary button label" },
  { fg: "sidebarForeground", bg: "sidebar", min: TEXT, note: "Sidebar row text" },
  { fg: "sidebarForeground", bg: "sidebarAccent", min: TEXT, note: "Active sidebar row text" },
  ...textOnV3(["background", "pointsSoft"], ["pointsText"], "Small orange text (5.2 / 4.7 light, 7.5 / 6.6 dark)"),
  ...textOnV3(["background", "muted"], ["successText"], "Positive text (5.0 / 4.6 light, 11.1 dark)"),
  ...textOnV3(["background", "infoSoft"], ["infoText"], "Info text (6.7 / 6.1 light, 9.2 / 8.0 dark)"),
  ...textOnV3(["background"], ["warningText"], "Warning text (5.0 light, 11.6 dark)"),
  { fg: "destructive", bg: "background", min: TEXT, note: "Inline error text (4.8 light, 7.0 dark)" },
  { fg: "background", bg: "destructive", min: TEXT, note: "White on destructive fill (4.8)", themes: ["light"] },
  { fg: "qrFg", bg: "qrBg", min: 15, note: "QR modules: always black on white" },
  // Non-text UI (3:1)
  { fg: "input", bg: "background", min: UI, note: "Form-control outline (3.6 light, 4.4 dark)" },
  { fg: "input", bg: "muted", min: UI, note: "Form-control outline on a grouped surface" },
  { fg: "ring", bg: "background", min: UI, note: "Focus ring" },
  { fg: "points", bg: "background", min: UI, note: "Dot or number >= 17px (3.1 light)" },
  { fg: "pointsForeground", bg: "points", min: UI, note: "Check on a filled stamp (large or icon only)" },
  { fg: "success", bg: "background", min: UI, note: "Dot (3.3 light)" },
  { fg: "info", bg: "background", min: UI, note: "Dot (4.0 light)" },
  { fg: "warning", bg: "background", min: UI, note: "Dot (3.2 light)" },
  { fg: "subtleForeground", bg: "background", min: 3, note: "Disabled only: 3.6 light, fails 4.5 by design" },
];
