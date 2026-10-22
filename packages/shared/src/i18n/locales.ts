/** Supported UI languages for the restaurant pack. Keep `LOCALE_CODES` and the message catalogs in step. */
export const LOCALE_CODES = ["en", "hi", "ur", "pa"] as const;
export type Locale = (typeof LOCALE_CODES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export interface LocaleInfo {
  code: Locale;
  /** Name in its own script (what the switcher shows). */
  name: string;
  /** Name in English, for admin screens and aria labels. */
  englishName: string;
  dir: "ltr" | "rtl";
  /** BCP-47 tag for the `lang` attribute and Intl. */
  bcp47: string;
  /** Script, so callers can decide whether a non-Latin font is needed. */
  script: "Latn" | "Deva" | "Arab" | "Guru";
  /** Web font family suggestions, first is preferred (Noto via next/font/google or CSS stacks). */
  fonts: readonly string[];
  /** Short label for a tight switcher. */
  short: string;
}

export const LOCALES: Record<Locale, LocaleInfo> = {
  en: { code: "en", name: "English", englishName: "English", dir: "ltr", bcp47: "en-CA", script: "Latn", fonts: [], short: "EN" },
  hi: { code: "hi", name: "हिन्दी", englishName: "Hindi", dir: "ltr", bcp47: "hi-IN", script: "Deva", fonts: ["Noto Sans Devanagari"], short: "हिं" },
  ur: { code: "ur", name: "اردو", englishName: "Urdu", dir: "rtl", bcp47: "ur-PK", script: "Arab", fonts: ["Noto Nastaliq Urdu", "Noto Naskh Arabic"], short: "اردو" },
  pa: { code: "pa", name: "ਪੰਜਾਬੀ", englishName: "Punjabi", dir: "ltr", bcp47: "pa-IN", script: "Guru", fonts: ["Noto Sans Gurmukhi"], short: "ਪੰ" },
};

export const LOCALE_LIST: readonly LocaleInfo[] = LOCALE_CODES.map((c) => LOCALES[c]);

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALE_CODES as readonly string[]).includes(v);
}

/** "hi-IN" / "pa_Guru" / "UR" -> "hi" / "pa" / "ur". Null when unsupported. */
export function normalizeLocale(input: string | null | undefined): Locale | null {
  if (!input) return null;
  const base = input.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

export function resolveLocale(input: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  return normalizeLocale(input) ?? fallback;
}

/** Best supported locale from an Accept-Language header. */
export function negotiateLocale(header: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!header) return fallback;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean);
      return { tag, q: q ? Number(q) : 1 };
    })
    .filter((x) => x.tag && Number.isFinite(x.q))
    .sort((a, b) => b.q - a.q);
  for (const r of ranked) {
    const l = normalizeLocale(r.tag);
    if (l) return l;
  }
  return fallback;
}

export const localeDir = (l: Locale): "ltr" | "rtl" => LOCALES[l].dir;
