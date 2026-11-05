import { preload } from "react-dom";
import "./serif.css";

/**
 * The landing page's headline faces (wave Y, after the founder asked for a bolder hero): Strata (fontzz, SIL OFL 1.1, public/marketing/
 * fonts/fontzz-OFL.txt), a condensed grotesque at 800 to 900, for every headline and big number (`--mkt-face-serif`, @ll/design-tokens
 * marketing.ts, inside the wrapper that carries `marketingSerifVar`; the name is kept from the Newsreader days), and the Newsreader
 * italic (Production Type, SIL OFL 1.1, public/marketing/fonts/Newsreader-OFL.txt) for the one emphasised phrase in each headline
 * (`--mkt-face-italic`). The upright Newsreader is no longer drawn and is gone.
 *
 * The headline must never show a fallback face. Both files are preloaded by the pages that draw them (`preloadSerif`, a <link
 * rel=preload> in the document head, so they download beside the CSS) and use `font-display: block` (serif.css). They are not next/font
 * files: Turbopack put next/font's @font-face rules in a CSS chunk the whole marketing group shares, so every marketing page would
 * preload them. Subsets made with fontTools: Basic Latin, the accented Latin-1 letters, the punctuation the copy uses, no hinting;
 * Strata's weight axis cut to 800 to 900 (14 kB), the Newsreader italic pinned to 400 (32 kB). Re-run the subset with a new content hash
 * in the file name when characters are added (the files are cached for a year); the commands are in scripts/hero-video/README.md.
 */
export const SERIF_FILES = ["/marketing/fonts/strata-800-900.7cec53ce.woff2", "/marketing/fonts/newsreader-italic-400.b966f4e1.woff2"] as const;

export const marketingSerifVar = "mkt-serif";

/** Call from the server component that draws the serif above the fold: both faces start downloading with the CSS. */
export function preloadSerif() {
  for (const href of SERIF_FILES) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous", fetchPriority: "high" });
}
