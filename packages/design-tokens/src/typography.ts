/**
 * Typography.
 *
 * - UI + body: **Figtree** (Google Fonts, OFL). Friendly, open, very legible
 *   at small sizes and on low-dpi screens; has tabular figures (`tnum`).
 *   Web: `next/font/google` → Figtree, `variable: "--font-figtree"`, weights 400/500/600/700.
 *   Mobile: `@expo-google-fonts/figtree` (same weights). If fonts fail to load,
 *   fall back to the system font (never block render on fonts).
 * - Display (marketing site, print, big shop-sign moments only): **Fraunces**
 *   (Google Fonts, OFL), soft optical size 72-144, weight 600. Never in app UI
 *   below 24px, never in counter mode.
 * - Numbers that change (balances, keypad, KPIs) always use tabular figures.
 */

export const fontFamilies = {
  sans: '"Figtree", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: '"Fraunces", ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/** Google Fonts used on web. */
export const googleFonts = {
  sans: { family: "Figtree", weights: [400, 500, 600, 700], cssVariable: "--font-figtree" },
  display: { family: "Fraunces", weights: [600], cssVariable: "--font-fraunces", axes: ["SOFT", "opsz"] },
} as const;

/** React Native font family names (from @expo-google-fonts/figtree). */
export const nativeFonts = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  display: "Fraunces_600SemiBold",
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
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
  /** Use tabular figures. */
  tabular?: boolean;
  uppercase?: boolean;
}

const t = (
  fontSize: number,
  lineHeight: number,
  fontWeight: number,
  letterSpacing = 0,
  extra: Partial<TextStyle> = {},
): TextStyle => ({ fontSize, lineHeight, fontWeight, letterSpacing, family: "sans", ...extra });

/**
 * Type scale. Mobile body is never below 16px; captions never below 12px.
 * Names are what engineers use: `text-body`, `typography.body`.
 */
export const textStyles = {
  /** Marketing hero only. */
  hero: t(56, 60, 600, -0.02, { family: "display" }),
  display: t(40, 44, 600, -0.015, { family: "display" }),
  h1: t(32, 38, 700, -0.01),
  h2: t(24, 30, 700, -0.005),
  h3: t(20, 26, 600),
  title: t(17, 24, 600),
  bodyLg: t(18, 28, 400),
  body: t(16, 24, 400),
  bodyStrong: t(16, 24, 600),
  bodySm: t(14, 20, 400),
  label: t(14, 20, 600, 0.005),
  caption: t(12, 16, 500, 0.01),
  overline: t(12, 16, 700, 0.08, { uppercase: true }),
  /** Big points balance on My Card / reward screens. (Not "balance": Tailwind owns text-balance.) */
  points: t(56, 60, 700, -0.02, { tabular: true }),
  /** Counter success state new balance, kiosk numbers. */
  counterHero: t(72, 76, 700, -0.02, { tabular: true }),
  /** Keypad digits, entered phone number in counter mode. */
  keypad: t(32, 36, 600, 0, { tabular: true }),
  /** Dashboard KPI tiles. */
  stat: t(32, 36, 700, -0.01, { tabular: true }),
  /** Redemption codes shown to staff (e.g. "K7 4Q"). */
  code: t(40, 44, 700, 0.12, { tabular: true }),
} as const satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;
