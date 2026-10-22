import { LOCALES, type Locale } from "./locales.js";

const TZ = "America/Toronto";

/** Try the locale's tag, then en-CA. Intl can throw on very small ICU builds (older Hermes). */
function tryIntl<T>(locale: Locale, make: (tag: string) => T): T {
  try {
    return make(LOCALES[locale].bcp47);
  } catch {
    return make("en-CA");
  }
}

export function formatNumber(locale: Locale, n: number, opts?: Intl.NumberFormatOptions): string {
  return tryIntl(locale, (tag) => new Intl.NumberFormat(tag, opts).format(n));
}

/** Integer cents to a currency string (CAD unless told otherwise). */
export function formatCurrency(locale: Locale, cents: number, currency = "CAD"): string {
  const whole = cents % 100 === 0;
  return tryIntl(locale, (tag) => new Intl.NumberFormat(tag, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100));
}

/** Dates are stored UTC and shown in America/Toronto unless a merchant timezone is given. */
export function formatDate(locale: Locale, date: Date | string | number, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }, timeZone: string = TZ): string {
  const d = date instanceof Date ? date : new Date(date);
  return tryIntl(locale, (tag) => new Intl.DateTimeFormat(tag, { timeZone, ...opts }).format(d));
}

export function formatTime(locale: Locale, date: Date | string | number, timeZone: string = TZ): string {
  return formatDate(locale, date, { hour: "numeric", minute: "2-digit" }, timeZone);
}
