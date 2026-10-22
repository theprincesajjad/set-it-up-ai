import { DEFAULT_LOCALE, type Locale } from "./locales.js";

/** Shape of `catalog_items.translations` / tiffin plan `translations` jsonb. */
export type TranslationsJson = Record<string, { name?: string; description?: string } | undefined>;

interface Translatable {
  name: string;
  description?: string | null;
  translations?: TranslationsJson | null;
}

/** Name and description in the wanted locale, per-field fallback to the base (shop's own) text. */
export function pickTranslation(item: Translatable, locale: Locale): { name: string; description: string | null } {
  const tr = locale === DEFAULT_LOCALE ? undefined : item.translations?.[locale];
  return {
    name: tr?.name?.trim() || item.name,
    description: tr?.description?.trim() || item.description || null,
  };
}
