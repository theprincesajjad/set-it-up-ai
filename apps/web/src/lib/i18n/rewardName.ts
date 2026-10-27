/**
 * A reward's name in the reader's language. Shops start from a template ("$10 off", "Free appetizer") and owners can rename it:
 * a name we recognise is translated, anything else keeps the shop's own words. English is returned as written.
 */
import type { Locale, MessageKey, Vars } from "@ll/shared";

type T = (key: MessageKey, vars?: Vars) => string;

/** The thing given free, by its template name (lowercase) to its message key. */
const FREE_ITEMS: Record<string, MessageKey> = {
  appetizer: "rw.item.appetizer",
  drink: "rw.item.drink",
  snack: "rw.item.snack",
  pastry: "rw.item.pastry",
  "masala chai": "rw.item.masalaChai",
  "tiffin box": "rw.item.tiffinBox",
};

export function rewardNameIn(locale: Locale, t: T, name: string): string {
  if (locale === "en") return name;
  const n = name.trim();
  const amount = /^\$(\d+(?:\.\d{1,2})?) off$/i.exec(n);
  if (amount) return t("rw.amountOff", { amount: `$${amount[1]}` });
  const pct = /^(\d{1,3})% off$/i.exec(n);
  if (pct) return t("rw.pctOff", { pct: pct[1]! });
  const free = /^free (.+)$/i.exec(n);
  const key = free ? FREE_ITEMS[free[1]!.toLowerCase()] : undefined;
  return key ? t("rw.free", { item: t(key) }) : name;
}
