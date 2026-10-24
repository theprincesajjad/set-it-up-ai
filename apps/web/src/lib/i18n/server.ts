import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, normalizeLocale, negotiateLocale, translator, type Locale } from "@ll/shared";

export const LOCALE_COOKIE = "ll_lang";
/** Request header proxy.ts sets from `?lang=`. */
export const LANG_HEADER = "x-ll-lang";

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
  // proxy.ts copies this request's ?lang= here, so layouts (which can't see searchParams) agree with the page.
  const fromProxy = normalizeLocale((await headers()).get(LANG_HEADER));
  if (fromProxy) return fromProxy;
  const fromCookie = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return negotiateLocale((await headers()).get("accept-language"), DEFAULT_LOCALE);
}

/** Server-side translator: `const t = await getT(sp); t("menu.add")`. */
export async function getT(sp?: SearchParams) {
  return translator(await getLocale(sp));
}

/**
 * Locale for a signed-in shopper: an explicit choice for this request (`?lang=`, the saved cookie) wins, then the language
 * on their profile, then Accept-Language. Pages that read `profile.locale` use this so a Hindi-speaking shopper sees Hindi
 * on a new phone without picking it again.
 */
export async function getLocaleForProfile(sp: SearchParams, profileLocale: string | null | undefined): Promise<Locale> {
  const q = sp?.lang;
  const fromQuery = normalizeLocale(Array.isArray(q) ? q[0] : q);
  if (fromQuery) return fromQuery;
  const fromProxy = normalizeLocale((await headers()).get(LANG_HEADER));
  if (fromProxy) return fromProxy;
  const fromCookie = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return normalizeLocale(profileLocale) ?? negotiateLocale((await headers()).get("accept-language"), DEFAULT_LOCALE);
}
