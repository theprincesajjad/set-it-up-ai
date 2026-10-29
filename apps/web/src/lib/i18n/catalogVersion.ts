/** Server only (node:crypto): LocaleScope uses it; never import it from a client component. */
import { createHash } from "node:crypto";
import { CATALOGS, type Locale } from "@ll/shared";

const memo = new Map<Locale, string>();

/** `/i18n/<locale>?v=<hash>`: the catalogue URL, versioned by its content so a deploy with new strings never meets a cached old one. */
export function catalogHref(locale: Locale): string {
  let v = memo.get(locale);
  if (!v) {
    v = createHash("sha1").update(JSON.stringify(CATALOGS[locale])).digest("hex").slice(0, 10);
    memo.set(locale, v);
  }
  return `/i18n/${locale}?v=${v}`;
}
