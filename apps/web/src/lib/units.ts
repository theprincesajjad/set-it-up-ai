import { unitLabel, type Locale } from "@ll/shared";
import { formatPoints } from "./format";

/** "120 pts" in English (the shop's own word otherwise), the translated unit in hi/ur/pa. */
export function unitsText(locale: Locale, n: number, terminology: string | null | undefined, short = true): string {
  return locale === "en" ? formatPoints(n, terminology, short) : unitLabel(locale, terminology || "points", n);
}

/** Just the unit word with the count removed ("points", "stamps", "पॉइंट"): for a right-aligned caption under a balance. */
export function unitCaption(locale: Locale, n: number, terminology: string | null | undefined): string {
  return unitsText(locale, n, terminology, false).replace(/^[\d,.\s]+/, "");
}
