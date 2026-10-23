/** Replace `{name}` placeholders in a copy string. Unknown names are left in place so a typo is visible. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

import { formatMoney } from "@/lib/format";

/** "$99", "$99.50", "$1,500" (no trailing .00). */
export const moneyShort = (cents: number) => formatMoney(cents).replace(/\.00$/, "");
