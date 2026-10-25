import { DEFAULT_LOCALE, type Locale } from "./locales.js";
import { t, type MessageKey } from "./t.js";

/**
 * "120 points", "1 stamp", "3 stars": a shop's own unit word with its count, in the shopper's language.
 * The shop owner chooses the word (`loyalty_programs.terminology`). English keeps it as typed (singular when 1);
 * in hi/ur/pa the two units every program starts with (points, stamps) are translated, any custom word stays as typed.
 */
export function unitLabel(locale: Locale, terminology: string, n: number): string {
  const term = (terminology || "points").trim();
  const lower = term.toLowerCase();
  const num = Math.abs(n) === 1 ? "1" : n.toLocaleString("en-CA");
  if (locale !== DEFAULT_LOCALE) {
    if (lower === "points" || lower === "point") return t(locale, "auth.unit.points", { n: num });
    if (lower === "stamps" || lower === "stamp") return t(locale, "auth.unit.stamps", { n: num });
  }
  const unit = Math.abs(n) === 1 ? term.replace(/s$/, "") : term;
  return `${num} ${unit}`;
}

/** Just the unit word ("points", "पॉइंट"), for sentences like "Your {unit} never expire". */
export function unitWord(locale: Locale, terminology: string): string {
  const lower = (terminology || "points").trim().toLowerCase();
  if (locale !== DEFAULT_LOCALE) {
    if (lower === "points" || lower === "point") return t(locale, "sh.n.unitPoints");
    if (lower === "stamps" || lower === "stamp") return t(locale, "sh.n.unitStamps");
  }
  return terminology || "points";
}

const PLACE_KINDS = ["cafe", "restaurant", "bakery", "bar", "grocery", "pharmacy", "retail", "bookstore", "florist", "pet", "salon", "barber", "spa", "fitness", "repair_electronics", "repair_auto", "alterations", "dry_cleaning", "print_shop"] as const;

/** The short, lowercase kind of place under a shop name ("café", "bakery") in the shopper's language; "shop" when unknown. */
export function placeKindLabel(locale: Locale, vertical: string | null | undefined): string {
  const k = (PLACE_KINDS as readonly string[]).includes(vertical ?? "") ? vertical : "other";
  return t(locale, `sh.kind.${k}` as MessageKey);
}
