import { cookies } from "next/headers";
import { normalizeLocale, type Locale } from "@ll/shared";
import { LOCALE_COOKIE } from "@/lib/i18n/server";

/** ?lang= wins, then the language cookie, English otherwise (same rule as the restaurant page: the header and the page must agree). */
export async function soloLocale(sp: Record<string, string | string[] | undefined>): Promise<Locale> {
  const q = sp.lang;
  return normalizeLocale(Array.isArray(q) ? q[0] : q) ?? normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value) ?? "en";
}
