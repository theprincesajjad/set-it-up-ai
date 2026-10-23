import type { Locale } from "@ll/shared";

/** Adds `lang=<locale>` to a same-site path (keeping any existing `lang`), so the language survives a redirect. English is the default, so it adds nothing. */
export function withLang(path: string, locale: Locale): string {
  if (locale === "en") return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const rest = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const q = rest.indexOf("?");
  const base = q >= 0 ? rest.slice(0, q) : rest;
  const params = new URLSearchParams(q >= 0 ? rest.slice(q + 1) : "");
  if (!params.has("lang")) params.set("lang", locale);
  return `${base}?${params.toString()}${hash}`;
}
