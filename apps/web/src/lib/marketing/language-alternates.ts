import { LOCALES, LOCALE_LIST, type Locale } from "@ll/shared";

/**
 * Canonical and hreflang links for a page that renders in the visitor's language from ?lang= (the restaurant and shopper pages).
 * English is the bare path; each other language is the same path with ?lang=. Every version lists all four plus x-default (English), so
 * a search engine can show the Hindi, Urdu or Punjabi page to the people who read it, and none is treated as a copy of the English one.
 */
export function languageAlternates(path: string, locale: Locale): { canonical: string; languages: Record<string, string> } {
  const href = (l: Locale) => (l === "en" ? path : `${path}?lang=${l}`);
  const languages: Record<string, string> = { "x-default": path };
  for (const l of LOCALE_LIST) languages[LOCALES[l.code].bcp47] = href(l.code);
  return { canonical: href(locale), languages };
}
