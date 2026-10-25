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

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Whether a Text's children can hold Urdu: any Arabic-script letter, or a child that is not a plain string (a nested Text or element).
 * A Latin code ("YDKM J5DN") or a number keeps the line height and letter-spacing it was designed with.
 */
export function mayHoldUrdu(children: unknown): boolean {
  if (children == null || typeof children === "boolean") return false;
  if (typeof children === "string") return ARABIC_SCRIPT.test(children);
  if (typeof children === "number") return false;
  if (Array.isArray(children)) return children.some(mayHoldUrdu);
  return true;
}

/** `size` and `lineHeight` come from the flattened style of the Text; null for languages that need no adjustment. */
export function scriptStyle(locale: Locale, flat: { fontSize?: unknown; lineHeight?: unknown }, children?: unknown): ScriptStyle | null {
  if (locale !== "ur" || (children !== undefined && !mayHoldUrdu(children))) return null;
  const size = typeof flat.fontSize === "number" ? flat.fontSize : 14;
  const lh = typeof flat.lineHeight === "number" ? flat.lineHeight : size * 1.2;
  return { letterSpacing: 0, fontStyle: "normal", lineHeight: Math.round(Math.max(lh, size * URDU_MIN_LINE_HEIGHT)) };
}
