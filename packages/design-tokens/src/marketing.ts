/**
 * Marketing tokens, scoped to the `.mkt` class the marketing layout sets, so no app, dashboard or customer screen changes. tokens.css
 * emits them under `.mkt`; theme.css maps them to Tailwind names (bg-mkt-black, text-mkt-body, bg-mkt-grey, font-mkt-display ...) that
 * resolve only inside it.
 * Wave T (the landing page, header and footer, after squareup.com), kept in wave V (direction B: Newsreader and Schibsted Grotesk): confident black and white. A white page, near-black text and
 * primary buttons, full-bleed black bands, #F2F2F2 grey bands and card bottoms, and one restrained accent (a deep green for checks and
 * "free"). Colour comes from the photography and the product screenshots, not from UI tints.
 * The wave S colours below (sun, mint, coral, violet ...) are kept because the other marketing pages (/pricing, /for-restaurants,
 * /for-bias ...) still read them; the landing page does not.
 * Contrast (WCAG, computed in test/marketing.test.ts): black, body and quiet text 4.5:1 or more on white and grey; white and the
 * on-black muted grey 4.5:1 or more on black; the accent 4.5:1 or more on white and grey.
 * Light only: the marketing site follows Clear, which is light only (docs/design/v3.2-clear-build.md).
 */
export const marketingColors = {
  /** Wave T (the landing page, header and footer). Near-black: headlines, text, the primary button and the dark bands. */
  black: "#0B0B0B",
  blackHover: "#2E2E2E",
  onBlack: "#FFFFFF",
  /** Secondary text on black. */
  onBlackMuted: "#A6A6A6",
  /** The grey band and card bottoms (Square's #F2F2F2), and the hover of white controls. */
  grey: "#F2F2F2",
  greyHover: "#E6E6E6",
  /** Body copy on white and grey. */
  body: "#3D3D3D",
  /** Captions, meta and the grey lead-in of a headline. */
  quiet: "#616161",
  /** The one accent: checks, "free", a positive change. */
  accent: "#0B6E33",
  /** The page: plain white. */
  paper: "#FFFFFF",
  /** The quiet surface: a lilac-tinted white (the pricing band, the footer, input wells). */
  soft: "#F6F4FF",
  /** Cards on a colour block. */
  stock: "#FFFFFF",
  /** Primary text, outlines in the illustrations, the dark button. */
  ink: "#17142E",
  inkHover: "#2B2650",
  onInk: "#FFFFFF",
  /** Secondary text. */
  text2: "#47425C",
  /** Muted text: captions and meta only. */
  muted: "#5B556F",
  /** The primary action and the one dark colour block. White text on it. */
  violet: "#5A3BDB",
  violetHover: "#4729C2",
  onViolet: "#FFFFFF",
  violetSoft: "#ECE7FF",
  /** Sun yellow: the hero block and highlights. Ink text on it. */
  sun: "#FFD23F",
  sunSoft: "#FFF4CC",
  /** Fresh green. Ink text on it. */
  mint: "#5DDB97",
  mintSoft: "#DDF8E9",
  /** Coral. Ink text on it. */
  coral: "#FFA190",
  coralSoft: "#FFE5DF",
  /** Small accent text on white (the first-year price, the step numbers): a deep coral that reads at 4.5:1. */
  coralInk: "#B4301F",
} as const;

/** Hairlines and shadows: ink at low alpha, so they stay neutral on white and on the blocks. */
export const marketingEffects = {
  line: "rgb(23 20 46 / 0.10)",
  lineStrong: "rgb(23 20 46 / 0.20)",
  /** Small things (chips, inputs). */
  shadowSm: "0 1px 2px rgb(23 20 46 / 0.06)",
  /** Cards resting on a colour block. */
  shadowCard: "0 1px 2px rgb(23 20 46 / 0.06), 0 10px 28px rgb(23 20 46 / 0.08)",
  /** Product mockups (the phone, the counter tablet): a soft lift. */
  shadowPop: "0 2px 6px rgb(23 20 46 / 0.10), 0 28px 56px rgb(23 20 46 / 0.18)",
  /** Floating panels (menus). */
  shadowFloat: "0 12px 32px rgb(23 20 46 / 0.12)",
  radiusControl: "12px",
  radiusCard: "24px",
  radiusPanel: "32px",
  radiusPill: "999px",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** Wave T: hairlines on white and grey, and on black. */
  rule: "rgb(0 0 0 / 0.12)",
  ruleOnBlack: "rgb(255 255 255 / 0.18)",
  /** Product screenshots laid over or beside a photo. */
  shadowShot: "0 1px 2px rgb(0 0 0 / 0.10), 0 24px 56px rgb(0 0 0 / 0.22)",
  /** Photos and product panels. */
  radiusPhoto: "20px",
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** CSS variable names, in emit order: --mkt-paper ... --mkt-ease. */
export const MARKETING_VARS = [...Object.keys(marketingColors), ...Object.keys(marketingEffects)].map((k) => `--mkt-${kebab(k)}`);

/** The `.mkt` block for tokens.css. `scriptFonts` is the hi/ur/pa Noto list, so those scripts keep their faces. */
export function marketingCss(scriptFonts: string): string[] {
  return [
    `/* Marketing (wave V): black and white with grey bands, Newsreader headlines on Schibsted Grotesk. Scoped to .mkt (the marketing layout); nothing else reads these. */`,
    `.mkt {`,
    ...Object.entries(marketingColors).map(([k, v]) => `  --mkt-${kebab(k)}: ${v};`),
    ...Object.entries(marketingEffects).map(([k, v]) => `  --mkt-${kebab(k)}: ${v};`),
    // Wave V: Schibsted Grotesk for text and the wordmark (lib/marketing/fonts.ts), Newsreader for the landing headlines (lib/marketing/serif.ts,
    // loaded by the home page only). Inter (apps/web lib/fonts/inter.ts) is the fallback.
    `  --mkt-face-sans: var(--font-mkt-sans, var(--font-inter, "Inter")), ${scriptFonts}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`,
    `  --mkt-face-display: var(--font-mkt-sans, var(--font-inter, "Inter")), ${scriptFonts}, ui-sans-serif, system-ui, sans-serif;`,
    `  --mkt-face-serif: var(--font-mkt-serif, "Newsreader"), Georgia, "Times New Roman", ${scriptFonts}, serif;`,
    `}`,
    ``,
  ];
}

/** The Tailwind names for theme.css (@theme inline). */
export function marketingThemeLines(): string[] {
  const colors = [...Object.keys(marketingColors).map((k) => [kebab(k), kebab(k)]), ["line", "line"], ["line-strong", "line-strong"], ["rule", "rule"], ["rule-on-black", "rule-on-black"]];
  return [
    `  /* Marketing (.mkt scope only): bg-mkt-black, text-mkt-body, bg-mkt-grey, border-mkt-rule, shadow-mkt-shot, font-mkt-display; the wave S names stay for the other marketing pages. */`,
    ...colors.map(([n, v]) => `  --color-mkt-${n}: var(--mkt-${v});`),
    `  --shadow-mkt-sm: var(--mkt-shadow-sm);`,
    `  --shadow-mkt-card: var(--mkt-shadow-card);`,
    `  --shadow-mkt-pop: var(--mkt-shadow-pop);`,
    `  --shadow-mkt-float: var(--mkt-shadow-float);`,
    `  --shadow-mkt-shot: var(--mkt-shadow-shot);`,
    `  --font-mkt-sans: var(--mkt-face-sans);`,
    `  --font-mkt-display: var(--mkt-face-display);`,
    `  --font-mkt-serif: var(--mkt-face-serif);`,
  ];
}
