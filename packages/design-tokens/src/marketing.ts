/**
 * Marketing landing tokens (wave S, the landing page and the marketing header and footer): a white base with bright, saturated colour
 * blocks (sun yellow, fresh green, coral, deep violet) and a violet primary, scoped to the `.mkt` class the marketing layout sets, so no
 * app, dashboard or customer screen changes. tokens.css emits them under `.mkt`; theme.css maps them to Tailwind names (bg-mkt-paper,
 * text-mkt-ink, bg-mkt-violet, font-mkt-display ...) that resolve only inside it.
 * Contrast (WCAG, computed in test/marketing.test.ts): ink on every block 9:1 or more; text-2 and muted 4.5:1 or more on white and the
 * soft tints; white on violet 6:1 or more; ink on sun 13:1. Dark ink text sits on the light blocks, white text only on violet and ink.
 * Light only: the marketing site follows Clear, which is light only (docs/design/v3.2-clear-build.md).
 */
export const marketingColors = {
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
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** CSS variable names, in emit order: --mkt-paper ... --mkt-ease. */
export const MARKETING_VARS = [...Object.keys(marketingColors), ...Object.keys(marketingEffects)].map((k) => `--mkt-${kebab(k)}`);

/** The `.mkt` block for tokens.css. `scriptFonts` is the hi/ur/pa Noto list, so those scripts keep their faces. */
export function marketingCss(scriptFonts: string): string[] {
  return [
    `/* Marketing landing (wave S): white, sun, mint, coral and violet blocks, Bricolage Grotesque headlines on Inter. Scoped to .mkt (the marketing layout); nothing else reads these. */`,
    `.mkt {`,
    ...Object.entries(marketingColors).map(([k, v]) => `  --mkt-${kebab(k)}: ${v};`),
    ...Object.entries(marketingEffects).map(([k, v]) => `  --mkt-${kebab(k)}: ${v};`),
    // Inter is the app's face, preloaded by the root layout, so body text never waits on a marketing download.
    `  --mkt-face-sans: var(--font-inter, "Inter"), ${scriptFonts}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`,
    `  --mkt-face-display: var(--font-mkt-display, "Bricolage Grotesque"), var(--font-inter, "Inter"), ${scriptFonts}, ui-sans-serif, system-ui, sans-serif;`,
    `}`,
    ``,
  ];
}

/** The Tailwind names for theme.css (@theme inline). */
export function marketingThemeLines(): string[] {
  const colors = [...Object.keys(marketingColors).map((k) => [kebab(k), kebab(k)]), ["line", "line"], ["line-strong", "line-strong"]];
  return [
    `  /* Marketing landing (wave S, .mkt scope only): bg-mkt-paper, text-mkt-ink, bg-mkt-violet, border-mkt-line, shadow-mkt-card, font-mkt-display ... */`,
    ...colors.map(([n, v]) => `  --color-mkt-${n}: var(--mkt-${v});`),
    `  --shadow-mkt-sm: var(--mkt-shadow-sm);`,
    `  --shadow-mkt-card: var(--mkt-shadow-card);`,
    `  --shadow-mkt-pop: var(--mkt-shadow-pop);`,
    `  --shadow-mkt-float: var(--mkt-shadow-float);`,
    `  --font-mkt-sans: var(--mkt-face-sans);`,
    `  --font-mkt-display: var(--mkt-face-display);`,
  ];
}
