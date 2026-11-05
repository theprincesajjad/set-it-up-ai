import localFont from "next/font/local";

/**
 * The marketing text face (wave Y): Halden (fontzz, SIL OFL 1.1, ./fonts/fontzz-OFL.txt), for the landing page's text, the marketing
 * header and footer and the wordmark on every marketing page. It feeds `--mkt-face-sans` and `--mkt-face-display` (@ll/design-tokens
 * marketing.ts) inside the wrappers that carry `marketingFontVars` and the `.mkt` class, so app screens keep their faces. hi, ur and pa
 * text falls through to Noto. It replaced Schibsted Grotesk (waves V to X).
 *
 * next/font serves it self-hosted under a content-hashed name, preloads it on every page that renders a marketing header, and computes
 * the metric-matched Arial fallback (size-adjust and ascent/descent overrides), so an edge case past the block period never shifts the
 * layout. `font-display: block`: the header is the first thing drawn on every marketing page and text waits the few hundred ms for the
 * face instead of flashing Arial. One variable file, the weight axis cut to 400 to 700 (the range the marketing pages set), subset with
 * fontTools to Basic Latin, the accented Latin-1 letters of French and Spanish names, and the punctuation the copy uses
 * (’ “ ” · – — … • → €), no hinting: 16 kB (was 29 kB). Source: fontzz site/public/fonts/halden.woff2; the commands are in
 * scripts/hero-video/README.md ("Fonts").
 */
const sans = localFont({
  src: [{ path: "./fonts/halden.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-mkt-sans",
  display: "block",
  fallback: ["Arial", "Helvetica", "sans-serif"],
  adjustFontFallback: "Arial",
  preload: true,
});

export const marketingFontVars = sans.variable;

/**
 * Wave W2: the root layout's skip link ("Skip to content", `.ll-skip`) sits outside every `.mkt` wrapper, so it would draw in Inter,
 * which the home page does not otherwise load. The marketing layouts render this rule in a hoisted <style> (React dedupes it by href),
 * so on marketing pages it uses the face they already preload; app pages keep Inter.
 */
export const marketingSkipLinkCss = `.ll-skip{font-family:${sans.style.fontFamily}}`;
