/**
 * Typography (v2, docs/design/foundations.md § Type).
 *
 * - Display & map labels: **Bricolage Grotesque** 700/800 (Google Fonts, OFL).
 *   Web: `next/font/google` → Bricolage_Grotesque, `variable: "--font-bricolage"`, weights 700/800.
 *   Native: `@expo-google-fonts/bricolage-grotesque` (BricolageGrotesque_700Bold, _800ExtraBold).
 *   Map / category / city labels are lowercase.
 * - UI & body, web: **Inter** 400/500/600 (`variable: "--font-inter"`), tabular numbers.
 * - UI & body, native: the **system font** (SF Pro / Roboto). `nativeFonts.body`
 *   is `undefined` on purpose: leave `fontFamily` unset and use `fontWeight`.
 *   This is what makes the app feel native.
 *
 * Scale (px): 11 caption · 13 meta · 15 body · 17 headline · 22 title ·
 * 28 large title · 40 display number. Line height 1.3 UI, 1.15 display.
 * Letter-spacing −0.01em on display sizes. Numbers always tabular.
 * Italic is used for exactly one thing: the grey subtitle under a place name.
 */

export const fontFamilies = {
  sans: '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: '"Bricolage Grotesque", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/** Google Fonts used on web. */
export const googleFonts = {
  sans: { family: "Inter", weights: [400, 500, 600], cssVariable: "--font-inter" },
  display: { family: "Bricolage Grotesque", weights: [700, 800], cssVariable: "--font-bricolage" },
} as const;

/**
 * React Native font families. Display = Bricolage (load these two names with
 * expo-font from @expo-google-fonts/bricolage-grotesque). Everything else is
 * `undefined` = system font; set `fontWeight` instead of a family.
 */
export const nativeFonts: {
  display: string;
  displayBold: string;
  displayHeavy: string;
  body: undefined;
  regular: undefined;
  medium: undefined;
  semibold: undefined;
  bold: undefined;
} = {
  /** Default display face (800 heavy, the Corner label look). */
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
  displayHeavy: "BricolageGrotesque_800ExtraBold",
  body: undefined,
  regular: undefined,
  medium: undefined,
  semibold: undefined,
  bold: undefined,
};

/** The expo-font map keys to load in the root layout. */
export const nativeFontsToLoad = ["BricolageGrotesque_700Bold", "BricolageGrotesque_800ExtraBold"] as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
} as const;
export type FontWeight = keyof typeof fontWeights;

export interface TextStyle {
  /** px (web: emitted as rem with 16px root) */
  fontSize: number;
  /** px */
  lineHeight: number;
  fontWeight: number;
  /** em */
  letterSpacing: number;
  family: keyof typeof fontFamilies;
  /** Use tabular figures (true everywhere in v2: numbers always tabular). */
  tabular: boolean;
  /** Render lowercase (map, category and city labels). */
  lowercase?: boolean;
  /** Italic: ONLY the grey subtitle under a place name. */
  italic?: boolean;
}

const UI_LH = 1.3;
const DISPLAY_LH = 1.15;
const DISPLAY_TRACKING = -0.01;

const ui = (fontSize: number, fontWeight: number, extra: Partial<TextStyle> = {}): TextStyle => ({
  fontSize,
  lineHeight: Math.round(fontSize * UI_LH),
  fontWeight,
  letterSpacing: 0,
  family: "sans",
  tabular: true,
  ...extra,
});

const display = (fontSize: number, fontWeight: 700 | 800, extra: Partial<TextStyle> = {}): TextStyle => ({
  fontSize,
  lineHeight: Math.round(fontSize * DISPLAY_LH),
  fontWeight,
  letterSpacing: DISPLAY_TRACKING,
  family: "display",
  tabular: true,
  ...extra,
});

/** The v2 scale in px. */
export const typeScale = {
  caption: 11,
  meta: 13,
  body: 15,
  headline: 17,
  title: 22,
  largeTitle: 28,
  displayNumber: 40,
} as const;

/**
 * Text styles. The first block is the v2 system. The second block keeps v1
 * names the apps use so they compile, each re-pointed onto the v2 scale
 * (deprecated; restyle onto the v2 names). Note `title` is now 22 (was 17):
 * use `headline` for 17px row/card titles.
 */
export const textStyles = {
  // ── v2 ──────────────────────────────────────────────────────
  caption: ui(11, 500),
  meta: ui(13, 400),
  metaStrong: ui(13, 600),
  body: ui(15, 400),
  bodyStrong: ui(15, 600),
  headline: ui(17, 600),
  title: ui(22, 600),
  largeTitle: display(28, 800, { lowercase: true }),
  displayNumber: display(40, 800),
  /** Place name next to a map bubble / in lists: bold black. */
  placeName: ui(15, 600),
  /** The ONE italic: grey subtitle under a place name ("trending cozy cafe"). */
  placeSubtitle: ui(13, 400, { italic: true }),
  /** City pills, map capsule labels ("toronto", "search here"). */
  mapLabel: display(15, 700, { lowercase: true, letterSpacing: 0, lineHeight: Math.round(15 * UI_LH) }),
  /** Category rail captions under the object icons ("coffee"). */
  categoryLabel: display(13, 700, { lowercase: true, letterSpacing: 0, lineHeight: Math.round(13 * UI_LH) }),

  // ── Deprecated v1 names, re-pointed onto the v2 scale ───────
  /** @deprecated use displayNumber (marketing hero also caps at 40 in-product) */ hero: display(40, 800),
  /** @deprecated use displayNumber */ display: display(40, 800),
  /** @deprecated use largeTitle */ h1: display(28, 800),
  /** @deprecated use title */ h2: ui(22, 600),
  /** @deprecated use headline */ h3: ui(17, 600),
  /** @deprecated use headline */ bodyLg: ui(17, 400),
  /** @deprecated use meta */ bodySm: ui(13, 400),
  /** @deprecated use metaStrong */ label: ui(13, 600),
  /** @deprecated section headers are lowercase metaStrong in fgMuted; no uppercase overlines */ overline: ui(11, 600),
  /** @deprecated use displayNumber in accent */ points: display(40, 800),
  /** @deprecated use displayNumber */ counterHero: display(40, 800),
  /** @deprecated use largeTitle-size tabular sans: keypad digits */ keypad: ui(28, 600, { lineHeight: Math.round(28 * DISPLAY_LH) }),
  /** @deprecated dashboard stats: plain 28 tabular numbers */ stat: ui(28, 600, { lineHeight: Math.round(28 * DISPLAY_LH), letterSpacing: DISPLAY_TRACKING }),
  /** Redemption codes shown to staff ("K7 4Q"): 40 tabular, tracked for legibility. */ code: ui(40, 700, { lineHeight: Math.round(40 * DISPLAY_LH), letterSpacing: 0.08 }),
} as const satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;
