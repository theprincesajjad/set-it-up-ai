import type { Locale } from "@ll/shared";

/**
 * Per-script text adjustments (docs/engineering/translation-glossary.md, Urdu notes). Noto Nastaliq Urdu (the system Urdu face on iOS)
 * has tall ascenders and deep descenders, so a line box tuned for Latin clips them: Urdu lines get at least 1.7 times the font size.
 * Arabic script joins letters, and any letter-spacing breaks the joins; slanted (italic) Nastaliq is a synthetic skew of a face that
 * is already slanted. Both are switched off for Urdu.
 */
export const URDU_MIN_LINE_HEIGHT = 1.7;

export interface ScriptStyle {
  letterSpacing: number;
  fontStyle: "normal";
  lineHeight: number;
}

/** `size` and `lineHeight` come from the flattened style of the Text; null for languages that need no adjustment. */
export function scriptStyle(locale: Locale, flat: { fontSize?: unknown; lineHeight?: unknown }): ScriptStyle | null {
  if (locale !== "ur") return null;
  const size = typeof flat.fontSize === "number" ? flat.fontSize : 14;
  const lh = typeof flat.lineHeight === "number" ? flat.lineHeight : size * 1.2;
  return { letterSpacing: 0, fontStyle: "normal", lineHeight: Math.round(Math.max(lh, size * URDU_MIN_LINE_HEIGHT)) };
}
