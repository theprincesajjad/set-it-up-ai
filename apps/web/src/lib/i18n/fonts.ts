import type { Locale } from "@ll/shared";

// The Noto faces are declared once, in app/layout.tsx (next/font), and their CSS variables sit on <html>, so a dialog or a
// menu that portals out of a <LocaleScope> still finds them. A face only downloads when a glyph of its script is drawn
// (`preload: false`, unicode-range subsets), so English visitors never fetch Noto. These stacks are what a script needs
// where a component sets one itself (the kitchen board shows one dish name per language); the page text gets the same
// stacks from the `[lang]` rules in globals.css. Inter comes first so Latin runs (shop names, amounts) stay sans.
const LATIN = "var(--font-inter), system-ui, sans-serif";

/** font-family for the non-Latin locales; undefined for English. `className` is kept for callers that spread it (always empty). */
export function localeFont(locale: Locale): { className: string; fontFamily?: string } {
  switch (locale) {
    case "hi":
      return { className: "", fontFamily: `var(--font-inter), var(--font-noto-deva), ${LATIN}` };
    case "pa":
      return { className: "", fontFamily: `var(--font-inter), var(--font-noto-guru), ${LATIN}` };
    case "ur":
      // Nastaliq has tall ascenders, so lines get extra leading (globals.css). Naskh covers glyphs Nastaliq lacks.
      return { className: "", fontFamily: `var(--font-inter), var(--font-noto-nastaliq), var(--font-noto-naskh), system-ui, sans-serif` };
    default:
      return { className: "" };
  }
}
