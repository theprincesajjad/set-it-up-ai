import { Noto_Naskh_Arabic, Noto_Nastaliq_Urdu, Noto_Sans_Devanagari, Noto_Sans_Gurmukhi } from "next/font/google";
import type { Locale } from "@ll/shared";

// next/font needs module-scope calls with literal options. A font only ships (CSS + preload) on a route
// that renders its `.variable` class, and LocaleScope renders only the active locale's, so English
// visitors never download Noto. Latin text inside these scripts keeps Inter via the stack below.
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-noto-deva", display: "swap", preload: false });
const gurmukhi = Noto_Sans_Gurmukhi({ subsets: ["gurmukhi"], variable: "--font-noto-guru", display: "swap", preload: false });
const nastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], variable: "--font-noto-nastaliq", display: "swap", preload: false });
const naskh = Noto_Naskh_Arabic({ subsets: ["arabic"], variable: "--font-noto-naskh", display: "swap", preload: false });

const BASE = "var(--font-inter), system-ui, sans-serif";

/** className (declares the CSS variables) and font-family for the non-Latin locales; empty for English. */
export function localeFont(locale: Locale): { className: string; fontFamily?: string } {
  switch (locale) {
    case "hi":
      return { className: devanagari.variable, fontFamily: `var(--font-noto-deva), ${BASE}` };
    case "pa":
      return { className: gurmukhi.variable, fontFamily: `var(--font-noto-guru), ${BASE}` };
    case "ur":
      // Inter first so Latin runs (shop names, dish names, amounts) stay sans: Noto Nastaliq ships its own serif Latin and would take them. Inter has no Arabic glyphs, so Urdu falls through to Nastaliq, then Naskh for glyphs Nastaliq lacks. Nastaliq has tall ascenders, so lines get extra leading.
      return { className: `${nastaliq.variable} ${naskh.variable}`, fontFamily: `var(--font-inter), var(--font-noto-nastaliq), var(--font-noto-naskh), system-ui, sans-serif` };
    default:
      return { className: "" };
  }
}
