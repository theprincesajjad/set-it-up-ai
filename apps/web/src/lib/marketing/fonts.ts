import { Bricolage_Grotesque } from "next/font/google";

/**
 * The marketing face (wave S, the landing page, header and footer): Bricolage Grotesque at 700 for headlines, a friendly grotesk with
 * some character; body text is Inter, which the root layout already preloads (the stack in @ll/design-tokens marketing.ts). Scoped to the
 * marketing wrappers (they carry `marketingFontVars` and the `.mkt` class that reads it), so app screens keep their faces. hi, ur and pa
 * text falls through to the Noto faces in the same stack.
 * One static weight, Latin only, preloaded: the hero headline is drawn in it, so it is ready for the first layout on most loads.
 */
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: "700", variable: "--font-mkt-display", display: "swap", adjustFontFallback: false });

export const marketingFontVars = display.variable;
