import { preload } from "react-dom";
import "./serif.css";

/**
 * The landing page's headline face (wave V, direction B): Newsreader (Production Type, SIL OFL 1.1, public/marketing/fonts/
 * Newsreader-OFL.txt), with its optical-size axis kept (18 to 72), so a 112px headline gets the fine display cut and a 26px tile title
 * the sturdier text cut, and the italic for the one emphasised phrase in each headline. It feeds `--mkt-face-serif`
 * (@ll/design-tokens marketing.ts) inside the wrapper that carries `marketingSerifVar`.
 *
 * Wave W: the headline must never show a fallback face. Both files are preloaded by the pages that draw them (`preloadSerif`, a
 * <link rel=preload> in the document head, so they download beside the CSS) and use `font-display: block` (serif.css). They are not
 * next/font files: Turbopack put next/font's @font-face rules in a CSS chunk the whole marketing group shares, so every marketing page
 * preloaded 62 kB of headline face it never draws. Subsets made with fontTools from the Google Fonts Latin files: Basic Latin, the
 * accented Latin-1 letters (Café, and names an owner types into the card maker), the punctuation the copy uses, no hinting, the weight
 * pinned to the two the page sets (500 upright, 400 italic): 30 kB + 32 kB, down from 39 + 40. Re-run the subset with a new content
 * hash in the file name when characters are added (the files are cached for a year).
 */
export const SERIF_FILES = ["/marketing/fonts/newsreader-500.cdb2e484.woff2", "/marketing/fonts/newsreader-italic-400.b966f4e1.woff2"] as const;

export const marketingSerifVar = "mkt-serif";

/** Call from the server component that draws the serif above the fold: both faces start downloading with the CSS. */
export function preloadSerif() {
  for (const href of SERIF_FILES) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous", fetchPriority: "high" });
}
