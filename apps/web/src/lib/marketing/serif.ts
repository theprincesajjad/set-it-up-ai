import localFont from "next/font/local";

/**
 * The landing page's headline face (wave V, direction B): Newsreader (Production Type, SIL OFL 1.1, ./fonts/Newsreader-OFL.txt), with
 * its optical-size axis kept (18 to 72), so a 112px headline gets the fine display cut and a 26px tile title the sturdier text cut,
 * and the italic for the one emphasised phrase in each headline. It feeds `--mkt-face-serif` (@ll/design-tokens marketing.ts).
 * Self-hosted subsets, made from the Google Fonts Latin files with fontTools: Basic Latin, Latin-1 and the typographic punctuation the
 * copy uses, the weight pinned to the two the page sets (500 upright, 400 italic). 39 kB + 40 kB instead of the 132 kB + 147 kB of the
 * full variable files, which is what keeps the hero's first paint inside the LCP budget on slow 4G.
 * Imported by the home page only, so the other marketing pages do not preload it. The fallback is sized to Newsreader's metrics.
 */
const serif = localFont({
  src: [
    { path: "./fonts/newsreader-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/newsreader-italic-400.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-mkt-serif",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
  preload: false,
});

export const marketingSerifVar = serif.variable;
