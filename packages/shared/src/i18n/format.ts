import type { Locale } from "./locales.js";

const TZ = "America/Toronto";

/**
 * Deterministic formatting. Server and browser must print the same string, and Node/browsers ship different ICU data for hi/ur/pa
 * (a limited build prints "M10 25" for a Punjabi month), so only English goes through Intl's locale data. Numbers and currency use
 * en-CA digits and grouping in every language; dates and times for hi/ur/pa are built from the name tables below.
 */
export function formatNumber(_locale: Locale, n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-CA", opts).format(n);
}

/** Integer cents to a currency string (CAD unless told otherwise). */
export function formatCurrency(_locale: Locale, cents: number, currency = "CAD", exact = false): string {
  const whole = !exact && cents % 100 === 0;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}

interface NameTable {
  monthsLong: readonly string[];
  monthsShort: readonly string[];
  /** Sunday first. */
  weekdaysLong: readonly string[];
  weekdaysShort: readonly string[];
  am: string;
  pm: string;
  comma: string;
}

export const DATE_NAMES: Record<Exclude<Locale, "en">, NameTable> = {
  hi: {
    monthsLong: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्तूबर", "नवंबर", "दिसंबर"],
    monthsShort: ["जन॰", "फ़र॰", "मार्च", "अप्रैल", "मई", "जून", "जुल॰", "अग॰", "सित॰", "अक्तू॰", "नव॰", "दिस॰"],
    weekdaysLong: ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"],
    weekdaysShort: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"],
    am: "पूर्वाह्न",
    pm: "अपराह्न",
    comma: ",",
  },
  ur: {
    monthsLong: ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"],
    monthsShort: ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"],
    weekdaysLong: ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"],
    weekdaysShort: ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"],
    am: "صبح",
    pm: "شام",
    comma: "،",
  },
  pa: {
    monthsLong: ["ਜਨਵਰੀ", "ਫ਼ਰਵਰੀ", "ਮਾਰਚ", "ਅਪ੍ਰੈਲ", "ਮਈ", "ਜੂਨ", "ਜੁਲਾਈ", "ਅਗਸਤ", "ਸਤੰਬਰ", "ਅਕਤੂਬਰ", "ਨਵੰਬਰ", "ਦਸੰਬਰ"],
    monthsShort: ["ਜਨ", "ਫ਼ਰ", "ਮਾਰਚ", "ਅਪ੍ਰੈ", "ਮਈ", "ਜੂਨ", "ਜੁਲਾ", "ਅਗ", "ਸਤੰ", "ਅਕਤੂ", "ਨਵੰ", "ਦਸੰ"],
    weekdaysLong: ["ਐਤਵਾਰ", "ਸੋਮਵਾਰ", "ਮੰਗਲਵਾਰ", "ਬੁੱਧਵਾਰ", "ਵੀਰਵਾਰ", "ਸ਼ੁੱਕਰਵਾਰ", "ਸ਼ਨਿੱਚਰਵਾਰ"],
    weekdaysShort: ["ਐਤ", "ਸੋਮ", "ਮੰਗਲ", "ਬੁੱਧ", "ਵੀਰ", "ਸ਼ੁੱਕ", "ਸ਼ਨਿੱਚਰ"],
    am: "ਪੂ.ਦੁ.",
    pm: "ਬਾ.ਦੁ.",
    comma: ",",
  },
};

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

/** Wall-clock parts of an instant in a time zone. en-CA numeric parts are identical on every ICU build. */
function zonedParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return { year, month, day, hour: get("hour") % 24, minute: get("minute"), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

const OWN_OPTS = new Set(["weekday", "day", "month", "year", "hour", "minute", "hour12", "hourCycle", "timeZone"]);

/** The word Urdu puts before a 12-hour time: night, morning, noon to afternoon, evening. */
function urduDayPart(hour: number): string {
  return hour < 4 || hour >= 20 ? "رات" : hour < 12 ? "صبح" : hour < 16 ? "دوپہر" : "شام";
}

function formatOwn(locale: Exclude<Locale, "en">, d: Date, opts: Intl.DateTimeFormatOptions, timeZone: string): string {
  const n = DATE_NAMES[locale];
  const p = zonedParts(d, timeZone);
  const two = (v: number) => String(v).padStart(2, "0");

  const weekday = opts.weekday ? (opts.weekday === "long" ? n.weekdaysLong[p.weekday] : opts.weekday === "short" ? n.weekdaysShort[p.weekday] : (Array.from(n.weekdaysShort[p.weekday] ?? "")[0] ?? "")) : "";
  let month = "";
  if (opts.month === "long") month = n.monthsLong[p.month - 1] ?? "";
  else if (opts.month === "short" || opts.month === "narrow") month = n.monthsShort[p.month - 1] ?? "";
  else if (opts.month === "2-digit") month = two(p.month);
  else if (opts.month === "numeric") month = String(p.month);
  const numericMonth = opts.month === "2-digit" || opts.month === "numeric";
  const day = opts.day ? (opts.day === "2-digit" ? two(p.day) : String(p.day)) : "";
  const year = opts.year ? (opts.year === "2-digit" ? two(p.year % 100) : String(p.year)) : "";

  const datePart = numericMonth ? [year, month, day].filter(Boolean).join("-") : [day, month, year].filter(Boolean).join(" ");
  const left = [weekday, datePart].filter(Boolean).join(`${n.comma} `);

  let time = "";
  if (opts.hour || opts.minute) {
    const h24 = opts.hourCycle === "h23" || opts.hour12 === false;
    const mm = opts.minute ? `:${two(p.minute)}` : "";
    if (h24) time = `${two(p.hour)}${mm}`;
    else {
      const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
      const clock = `${opts.hour === "2-digit" ? two(h12) : h12}${mm}`;
      // Urdu names the part of the day before the hour ("رات 11:00", "شام 6:00"), as it is said; a bare "11 شام" reads as stiff or wrong.
      time = locale === "ur" ? `${urduDayPart(p.hour)} ${clock}` : `${clock} ${p.hour < 12 ? n.am : n.pm}`;
    }
  }
  return [left, time].filter(Boolean).join(`${n.comma} `);
}

/** Dates are stored UTC and shown in America/Toronto unless a merchant timezone is given. */
export function formatDate(locale: Locale, date: Date | string | number, opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS, timeZone: string = TZ): string {
  const d = date instanceof Date ? date : new Date(date);
  const tz = opts.timeZone ?? timeZone;
  if (locale !== "en" && Object.keys(opts).every((k) => OWN_OPTS.has(k))) return formatOwn(locale, d, opts, tz);
  return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz }).format(d);
}

export function formatTime(locale: Locale, date: Date | string | number, timeZone: string = TZ): string {
  return formatDate(locale, date, { hour: "numeric", minute: "2-digit" }, timeZone);
}
