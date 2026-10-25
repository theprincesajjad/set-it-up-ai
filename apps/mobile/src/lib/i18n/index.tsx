/**
 * Language for the app: en / hi / ur / pa. Choice is persisted on the device; until the person picks one,
 * the staff counter uses merchant_staff.locale (when the session exposes it) and everyone else uses
 * their account locale. RTL is a `direction` style on the subtree (LocaleRoot), never I18nManager.
 */
import {
  LOCALES,
  formatCurrency,
  formatDate,
  formatNumber,
  formatTime,
  isLocale,
  normalizeLocale,
  pickTranslation,
  t as translate,
  withRtlMark,
  type Locale,
  type LocaleInfo,
  type MessageKey,
  type TranslationsJson,
  type Vars,
} from "@ll/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { getJson, setJson } from "../../state/storage";

const LOCALE_KEY = "ll.locale.v1";

/**
 * Variables that hold Latin runs or shop-written text (shop and customer names, reward names, amounts, links). In a right-to-left
 * language `t()` wraps them in a first-strong isolate, so "$5 off" or "Sarson Dhaba" can't reorder the Urdu around it.
 */
const ISOLATED_VARS = new Set(["shop", "name", "amount", "price", "reward", "brand", "link", "url", "code", "phone", "total", "balance", "fee", "tax", "street", "address", "email", "item", "place", "hood", "staff", "service", "services", "label", "ref", "note", "notes", "hall", "prize", "headline", "text", "pickup", "card", "certifier", "sender", "deposit", "cost", "hours"]);
function isolateVars(vars: Vars): Vars {
  const out: Vars = {};
  for (const [k, x] of Object.entries(vars)) out[k] = ISOLATED_VARS.has(k) && typeof x === "string" && x !== "" && !/^\d+$/.test(x) ? `\u2068${x}\u2069` : x;
  return out;
}

export interface LocaleValue {
  locale: Locale;
  info: LocaleInfo;
  dir: "ltr" | "rtl";
  isRtl: boolean;
  t: (key: MessageKey, vars?: Vars) => string;
  setLocale: (next: Locale) => void;
  money: (cents: number, currency?: string) => string;
  number: (n: number) => string;
  date: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions, tz?: string) => string;
  time: (d: Date | string | number, tz?: string) => string;
  pick: (item: { name: string; description?: string | null; translations?: TranslationsJson | null }) => { name: string; description: string | null };
}

const Ctx = createContext<LocaleValue | null>(null);

/** Staff locale, read defensively: the me payload may carry it on a membership or on the user. */
function sessionDefault(session: ReturnType<typeof useSession>): Locale | null {
  type WithLocale = { staffLocale?: string | null; locale?: string | null };
  const staff = session.mode === "counter" ? (session.merchants[0] as WithLocale | undefined) : undefined;
  const user = session.user as WithLocale | null;
  return normalizeLocale(staff?.staffLocale) ?? normalizeLocale(staff?.locale) ?? normalizeLocale(user?.staffLocale) ?? (session.mode === "counter" ? null : normalizeLocale(user?.locale));
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [chosen, setChosen] = useState<Locale | null>(null);

  useEffect(() => {
    let live = true;
    void getJson<string>(LOCALE_KEY).then((v) => {
      if (live && isLocale(v)) setChosen(v);
    });
    return () => {
      live = false;
    };
  }, []);

  const locale: Locale = chosen ?? sessionDefault(session) ?? "en";
  const signedInShopper = session.status === "signedIn" && session.mode !== "counter";
  const setLocale = useCallback(
    (next: Locale) => {
      setChosen(next);
      void setJson(LOCALE_KEY, next);
      // The shopper's language travels with the account: alerts, texts and the wallet pass are written in it.
      if (signedInShopper) void api.me.updateProfile({ locale: next }).catch(() => undefined);
    },
    [signedInShopper],
  );

  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      info: LOCALES[locale],
      dir: LOCALES[locale].dir,
      isRtl: LOCALES[locale].dir === "rtl",
      t: (key, vars) => withRtlMark(locale, translate(locale, key, vars && LOCALES[locale].dir === "rtl" ? isolateVars(vars) : vars)),
      setLocale,
      // Right-to-left text would put the currency sign on the wrong side ("$54" as "54$"): wrap the amount in a left-to-right isolate.
      money: (cents, currency) => (LOCALES[locale].dir === "rtl" ? `\u2066${formatCurrency(locale, cents, currency)}\u2069` : formatCurrency(locale, cents, currency)),
      number: (n) => formatNumber(locale, n),
      date: (d, opts, tz) => formatDate(locale, d, opts, tz),
      time: (d, tz) => formatTime(locale, d, tz),
      pick: (item) => pickTranslation(item, locale),
    }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Layout direction without requiring a provider (false outside one: tests, early boot). */
export function useIsRtl(): boolean {
  return useContext(Ctx)?.isRtl ?? false;
}

/** The active language without requiring a provider ("en" outside one). */
export function useLocaleCode(): Locale {
  return useContext(Ctx)?.locale ?? "en";
}

export function useLocale(): LocaleValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLocale outside LocaleProvider");
  return v;
}

/** Sets layout direction for everything below it (flex rows flip, start/end follow). Mounted once at the root. */
export function LocaleRoot({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { dir } = useLocale();
  // `dir` (not only the style) so react-native-web resolves start/end and marginStart/paddingStart for the whole subtree.
  return (
    <View {...({ dir } as object)} style={[{ flex: 1, direction: dir }, style]}>
      {children}
    </View>
  );
}
