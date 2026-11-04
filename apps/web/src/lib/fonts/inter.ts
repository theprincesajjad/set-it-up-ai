import { preload } from "react-dom";
import "./inter.css";

/**
 * Inter (wave W2): self-hosted from public/fonts (content-hashed name, cached for a year by next.config.ts; SIL OFL 1.1,
 * public/fonts/Inter-OFL.txt) so that only the pages that draw it preload it. With next/font in the root layout, every page preloaded
 * the 72 kB file, including the home page, which draws nothing in Inter (its text is Schibsted and Newsreader) and lost LCP to it.
 *
 * The root layout imports this module for the @font-face rules and `--font-inter` (every page can still draw Inter; a page that does
 * not preload it fetches it when it first draws it, in `swap`). Call `preloadInter()` from each layout or page whose first screen draws
 * Inter: the app layouts, sign-up, the merchant picker, and every marketing page except the home page (test/inter-preload.test.ts).
 * To update the face, take the Latin file Google Fonts serves for Inter:opsz,wght@14..32,100..900 and rename it with a new hash.
 */
export const INTER_FILE = "/fonts/inter-latin.dd8a4575.woff2";

export function preloadInter() {
  preload(INTER_FILE, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
}
