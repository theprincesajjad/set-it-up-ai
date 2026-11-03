import { Instrument_Sans, Instrument_Serif } from "next/font/google";

/**
 * The marketing faces (wave R, the landing page): Instrument Sans for the interface text, Instrument Serif at 400 for the big headlines
 * only. Scoped to the marketing layout (its wrapper carries `marketingFontVars` and the `.mkt` class that reads them, see
 * @ll/design-tokens marketing.ts), so app screens keep Inter. hi, ur and pa text falls through to the Noto faces in the same stacks.
 */
/**
 * Measured on a throttled phone (scratchpad wave-r landing notes): text drawn in a face that is not loaded yet makes the first layout walk
 * the system fallbacks, which cost ~200 ms. So the sans is not preloaded and falls back to Inter, which the root layout already preloads
 * (the stack in @ll/design-tokens marketing.ts; no size-adjusted local() fallback, `adjustFontFallback: false`), and swaps in after first
 * paint. The serif draws the hero headline, so it is preloaded (15 kB) and is usually ready for the first layout.
 */
const sans = Instrument_Sans({ subsets: ["latin"], weight: "variable", variable: "--font-instrument-sans", display: "swap", preload: false, adjustFontFallback: false });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument-serif", display: "swap", adjustFontFallback: false });

export const marketingFontVars = `${sans.variable} ${serif.variable}`;
