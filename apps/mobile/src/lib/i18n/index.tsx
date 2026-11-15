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
  CATALOGS,
  formatMessage,
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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { setApiErrorTranslator, setRequestLocale } from "../../api/client";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { getJson, setJson } from "../../state/storage";
import { dirStyle } from "../../ui/direction";
import { isLocalKey, LOCAL_MESSAGES, type LocalKey } from "./local";

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

/**
 * The English catalogue is written with straight apostrophes; the product copy rule is curly ones ("What’s your number?").
 * Only the template is changed (before names and amounts are filled in), so a shop called "Nonna's Table" stays as typed.
 */
const CURLY_APOSTROPHE = /(\p{L})'(\p{L})/gu;
const curlyTemplates = new Map<string, string>();
function translateCopy(locale: Locale, key: MessageKey | LocalKey, vars?: Vars): string {
  if (isLocalKey(key)) {
    const words: Record<Locale, string> = LOCAL_MESSAGES[key];
    const msg = words[locale] ?? words.en;
    return vars || msg.includes("{") ? formatMessage(locale, msg, vars) : msg;
  }
  if (locale !== "en") return translate(locale, key, vars);
  let msg = curlyTemplates.get(key);
  if (msg === undefined) {
    msg = (CATALOGS.en[key] ?? key).replace(CURLY_APOSTROPHE, "$1\u2019$2");
    curlyTemplates.set(key, msg);
  }
  return vars || msg.includes("{") ? formatMessage(locale, msg, vars) : msg;
}

export interface LocaleValue {
  locale: Locale;
  info: LocaleInfo;
  dir: "ltr" | "rtl";
  isRtl: boolean;
  t: (key: MessageKey | LocalKey, vars?: Vars) => string;
  setLocale: (next: Locale) => void;
  money: (cents: number, currency?: string) => string;
  number: (n: number) => string;
  /** A run that must read left to right inside a right-to-left line (an address, a phone number, a price): wrapped in an LTR isolate there, unchanged elsewhere. */
  ltr: (text: string) => string;
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

  // A language picked before signing in (welcome screen) belongs to the new account too: push it once the account exists and differs.
  const pushedFor = useRef<string | null>(null);
  const accountLocale = (session.user as { locale?: string | null } | null)?.locale ?? null;
  useEffect(() => {
    if (!signedInShopper || !chosen || !accountLocale || accountLocale === chosen) return;
    const key = `${session.user?.id ?? ""}:${chosen}`;
    if (pushedFor.current === key) return;
    pushedFor.current = key;
    void api.me.updateProfile({ locale: chosen }).catch(() => undefined);
  }, [signedInShopper, chosen, accountLocale, session.user?.id]);

  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      info: LOCALES[locale],
      dir: LOCALES[locale].dir,
      isRtl: LOCALES[locale].dir === "rtl",
      t: (key, vars) => withRtlMark(locale, translateCopy(locale, key, vars && LOCALES[locale].dir === "rtl" ? isolateVars(vars) : vars)),
      setLocale,
      // Right-to-left text would put the currency sign on the wrong side ("$54" as "54$"): wrap the amount in a left-to-right isolate.
      money: (cents, currency) => (LOCALES[locale].dir === "rtl" ? `\u2066${formatCurrency(locale, cents, currency)}\u2069` : formatCurrency(locale, cents, currency)),
      number: (n) => formatNumber(locale, n),
      ltr: (text) => (LOCALES[locale].dir === "rtl" && text ? `\u2066${text}\u2069` : text),
      date: (d, opts, tz) => formatDate(locale, d, opts, tz),
      time: (d, tz) => formatTime(locale, d, tz),
      pick: (item) => pickTranslation(item, locale),
    }),
    [locale, setLocale],
  );
  // Server calls speak the chosen language, and failures read in it (see errorMessage in api/client.ts).
  useEffect(() => {
    setRequestLocale(locale);
    setApiErrorTranslator((key, vars) => value.t(key, vars));
    return () => setApiErrorTranslator(null);
  }, [locale, value]);
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
    <View {...({ dir } as object)} style={[{ flex: 1 }, dirStyle(dir), style]}>
      {children}
    </View>
  );
}
