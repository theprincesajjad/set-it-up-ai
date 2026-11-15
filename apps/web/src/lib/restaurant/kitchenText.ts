/** Pure text helpers for the kitchen display: a time and a Latin run in the language the cook reads. */
import { LOCALES, type restaurantApi } from "@ll/shared";
import { clockText } from "@/lib/format";

type Lang = restaurantApi.MenuLang;

/** "4:30 p.m." in Toronto time. */
export const clock12 = (iso: string) => clockText(new Date(iso));

/** The same time for a cook reading `lang`: 12-hour with am/pm in English, 24-hour digits otherwise (no "PM" in the middle of Urdu). */
export const clockIn = (lang: Lang, iso: string) =>
  lang === "en" ? clock12(iso) : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

const FSI = "⁨";
const PDI = "⁩";
/** A Latin run (a time, a name, a number) inside an RTL sentence: isolated so it cannot reorder the Urdu around it. Left alone for left-to-right languages. */
export const isolate = (lang: Lang, v: string | number) => (LOCALES[lang].dir === "rtl" ? `${FSI}${v}${PDI}` : String(v));
