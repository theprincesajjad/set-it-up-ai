import { Figtree } from "next/font/google";

/**
 * The marketing headline face (wave S2, the landing page, header and footer): Figtree at 700, a confident, friendly, neutral
 * grotesk that suits a coffee house and a phone repair shop alike (wave S's Bricolage Grotesque read quirky). Body text is Inter, which the
 * root layout already preloads (the stack in @ll/design-tokens marketing.ts). Scoped to the marketing wrappers (they carry
 * `marketingFontVars` and the `.mkt` class that reads it), so app screens keep their faces. hi, ur and pa text falls through to Noto.
 * One static weight, Latin only (11 kB), preloaded: the hero headline is drawn in it, so it is ready for the first layout on most loads.
 */
const display = Figtree({ subsets: ["latin"], weight: "700", variable: "--font-mkt-display", display: "swap", adjustFontFallback: false });

export const marketingFontVars = display.variable;
