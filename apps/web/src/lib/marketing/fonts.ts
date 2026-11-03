import { Inter_Tight } from "next/font/google";

/**
 * The marketing headline face (wave T, the landing page, header and footer): Inter Tight at 600, a tight, plain grotesk in the spirit
 * of Square's headlines, set large with negative tracking. Body text is Inter, which the root layout already preloads (the stack in
 * @ll/design-tokens marketing.ts). Scoped to the marketing wrappers (they carry `marketingFontVars` and the `.mkt` class that reads it),
 * so app screens keep their faces. hi, ur and pa text falls through to Noto.
 * One static weight, Latin only, preloaded: the hero headline is drawn in it, so it is ready for the first layout on most loads.
 */
const display = Inter_Tight({ subsets: ["latin"], weight: "600", variable: "--font-mkt-display", display: "swap", adjustFontFallback: false });

export const marketingFontVars = display.variable;
