import { Schibsted_Grotesk } from "next/font/google";

/**
 * The marketing text face (wave V, direction B): Schibsted Grotesk (Schibsted / Bakken & Bæck, SIL OFL 1.1), for the landing page's
 * text, the marketing header and footer and the wordmark. It feeds `--mkt-face-sans` and `--mkt-face-display` (@ll/design-tokens
 * marketing.ts) inside the wrappers that carry `marketingFontVars` and the `.mkt` class, so app screens keep their faces. hi, ur and
 * pa text falls through to Noto. The headline serif (Newsreader) is in ./serif.ts and loads on the home page only.
 * One variable file (400 to 900), Latin only, preloaded: the header and the hero text are drawn in it.
 */
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-mkt-sans", display: "swap", preload: false });

export const marketingFontVars = sans.variable;
