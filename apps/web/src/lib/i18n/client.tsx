"use client";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { browserApi } from "@/lib/api/browser";
import { LOCALES, formatCurrency, formatDate, formatNumber, formatTime, pickTranslation, t as translate, withRtlMark, type Locale, type LocaleInfo, type MessageKey, type TranslationsJson, type Vars } from "@ll/shared";

export const LOCALE_COOKIE = "ll_lang";

/**
 * Variables that hold Latin runs (shop and customer names, brand, amounts, phone numbers, countdowns). In a right-to-left locale `t()` wraps
 * them in a first-strong isolate so "Sarson Dhaba." or "$12.50" can't reorder the Urdu around them; `rich()` wraps them in <bdi>.
 */
const LATIN_VARS = new Set(["shop", "name", "amount", "price", "certifier", "phone", "brand", "sender", "street", "reward", "time", "tax", "total", "balance", "fee", "link", "address", "code"]);
const FSI = "\u2068";
const PDI = "\u2069";

interface LocaleValue {
  locale: Locale;
  info: LocaleInfo;
  dir: "ltr" | "rtl";
  t: (key: MessageKey, vars?: Vars) => string;
  /** Like `t`, but the Latin variables (shop, name, amount, price, certifier, phone) come back wrapped in <bdi>. */
  rich: (key: MessageKey, vars?: Vars) => ReactNode;
  setLocale: (next: Locale) => void;
  money: (cents: number, currency?: string) => string;
  /** Always two decimals ($129.00): quotes, invoices and receipts, where lines must add up on sight. */
  moneyExact: (cents: number, currency?: string) => string;
  number: (n: number) => string;
  date: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions, tz?: string) => string;
  time: (d: Date | string | number, tz?: string) => string;
  /** Item name/description in the active language, falling back to the shop's own text. */
  pick: (item: { name: string; description?: string | null; translations?: TranslationsJson | null }) => { name: string; description: string | null };
}

const Ctx = createContext<LocaleValue | null>(null);

function buildValue(locale: Locale, setLocale: (next: Locale) => void): LocaleValue {
  return {
    locale,
    info: LOCALES[locale],
    dir: LOCALES[locale].dir,
    t: (key, vars) => {
      const rtl = LOCALES[locale].dir === "rtl";
      if (!rtl) return translate(locale, key, vars);
      if (!vars) return withRtlMark(locale, translate(locale, key));
      const v: Vars = {};
      for (const [k, x] of Object.entries(vars)) v[k] = LATIN_VARS.has(k) && x != null && x !== "" ? `${FSI}${x}${PDI}` : x;
      return withRtlMark(locale, translate(locale, key, v));
    },
    rich: (key, vars) => {
      if (!vars) return translate(locale, key);
      const v: Vars = {};
      for (const [k, x] of Object.entries(vars)) v[k] = LATIN_VARS.has(k) && x != null && x !== "" ? `\uE000${k}\uE001` : x;
      return translate(locale, key, v)
        .split(/\uE000(\w+)\uE001/)
        .map((part, i) => (i % 2 ? <bdi key={i}>{vars[part]}</bdi> : part));
    },
    setLocale,
    money: (cents, currency) => formatCurrency(locale, cents, currency),
    moneyExact: (cents, currency) => formatCurrency(locale, cents, currency, true),
    number: (n) => formatNumber(locale, n),
    date: (d, opts, tz) => formatDate(locale, d, opts, tz),
    time: (d, tz) => formatTime(locale, d, tz),
    pick: (item) => pickTranslation(item, locale),
  };
}

/** Remember the language for next visits (the same cookie LanguageSwitcher writes). */
export function rememberLocale(locale: Locale) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // cookies blocked: ?lang= still carries the language
  }
}

/**
 * Save the language on the shopper's profile, so texts, alerts and the wallet pass follow it. Signed-in callers only
 * (right after sign-in, or from Settings). After sign-in only a non-English page language is saved: English is also
 * what an untouched browser shows, so it must not overwrite a language chosen on another device.
 */
export function saveProfileLocale(locale: Locale, opts: { explicit?: boolean } = {}): Promise<boolean> {
  if (locale === "en" && !opts.explicit) return Promise.resolve(false);
  return browserApi.me.updateProfile({ locale }).then(
    () => true,
    () => false,
  );
}

const ENGLISH = buildValue("en", () => undefined);

/** Mounted by LocaleScope (server). Client components read it with `useLocale()`. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setLocale = useCallback(
    (next: Locale) => {
      try {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      } catch {
        // cookies blocked: the ?lang= param below still switches this page
      }
      const sp = new URLSearchParams(params.toString());
      sp.set("lang", next);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
      // A layout does not re-render when only the query changes, and the dashboard and console layouts read the language there: ask for a fresh render now that the cookie is set.
      router.refresh();
    },
    [router, pathname, params],
  );

  const value = useMemo<LocaleValue>(() => buildValue(locale, setLocale), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLocale must be used inside <LocaleScope>");
  return v;
}

/**
 * `useLocale()` for components that also render outside a <LocaleScope> (shared sign-in pieces, tests):
 * English, with a no-op `setLocale`, when there is no scope.
 */
export function useLocaleOrEnglish(): LocaleValue {
  return useContext(Ctx) ?? ENGLISH;
}
