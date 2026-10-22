// Contracts for the restaurant pack: i18n. Owned by the i18n build team.
import { z } from "zod";
import { LOCALE_CODES } from "../i18n/locales.js";

export const localeSchema = z.enum(LOCALE_CODES);
export type LocaleCode = z.infer<typeof localeSchema>;

/** `?lang=` on menu / catalog reads. Unknown values fall back to English instead of failing the request. */
export const langQuery = z.object({ lang: localeSchema.catch("en").optional() });
export type LangQuery = z.infer<typeof langQuery>;

/** Per-item translations jsonb as stored on `catalog_items` and tiffin plans. */
export const translationsSchema = z.record(z.string(), z.object({ name: z.string().max(200).optional(), description: z.string().max(2000).optional() }));
export type TranslationsDto = z.infer<typeof translationsSchema>;
