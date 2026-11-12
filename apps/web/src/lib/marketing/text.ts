/** Replace `{name}` placeholders in a copy string. Unknown names are left in place so a typo is visible. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

import { formatMoney } from "@/lib/format";

/** "$99", "$99.50", "$1,500" (no trailing .00). */
export const moneyShort = (cents: number) => formatMoney(cents).replace(/\.00$/, "");

/**
 * Headlines on the marketing pages are sentence case, like the home page's ("Your regulars, on repeat."). Much of the older page copy
 * is typed in lower case, so the pages pass their headline through this: the first letter of each sentence goes to upper case and
 * nothing else changes (names keep their capitals; Hindi, Urdu and Punjabi have no case and pass through).
 */
export function sentenceCase(text: string): string {
  return text.replace(/(^|[.?!]\s+)(\p{Ll})/gu, (_m, lead: string, letter: string) => lead + letter.toUpperCase());
}
