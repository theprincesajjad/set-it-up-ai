import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, normalizeLocale, negotiateLocale, translator, type Locale } from "@ll/shared";

export const LOCALE_COOKIE = "ll_lang";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

/**
 * Locale for this request: `?lang=` wins, then the saved cookie, then Accept-Language (only when it names
 * a supported language), then English.
 * `await getLocale((await searchParams))` in a page; `await getLocale()` elsewhere.
 */
export async function getLocale(sp?: SearchParams): Promise<Locale> {
  const q = sp?.lang;
  const fromQuery = normalizeLocale(Array.isArray(q) ? q[0] : q);
  if (fromQuery) return fromQuery;
  const fromCookie = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return negotiateLocale((await headers()).get("accept-language"), DEFAULT_LOCALE);
}

/** Server-side translator: `const t = await getT(sp); t("menu.add")`. */
export async function getT(sp?: SearchParams) {
  return translator(await getLocale(sp));
}
