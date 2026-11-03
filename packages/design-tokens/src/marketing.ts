/**
 * Marketing landing tokens (wave R, the landing page only): a warm paper ramp, ink actions and the stamp-ink vermilion, scoped to the
 * `.mkt` class the marketing layout sets, so no app, dashboard or customer screen changes. tokens.css emits them under `.mkt`;
 * theme.css maps them to Tailwind names (bg-mkt-paper, text-mkt-ink, border-mkt-line, font-mkt-serif ...) that resolve only inside it.
 * Contrast (WCAG, computed in test/marketing.test.ts): ink 15.8:1, text-2 6.9:1, muted 5.4:1 and vermilion 5.5:1 on paper; white on ink 17.4:1.
 * Light only: the marketing site follows Clear, which is light only (docs/design/v3.2-clear-build.md).
 */
export const marketingColors = {
  /** The page: warm paper. */
  paper: "#F7F4EE",
  /** One surface step up from the page (the Pro column, the visit form, hover). */
  raised: "#EFE9DF",
  /** Card stock: the stamp card body and input fields. */
  stock: "#FDFBF7",
  /** The plaster wall in the hero scene (counter-*.avif): the phone hero and the closing band sit on it so the photo blends in. */
  wall: "#EED5BD",
  /** Primary text and the primary button fill. */
  ink: "#1C1A17",
  inkHover: "#36312B",
  onInk: "#FFFFFF",
  /** Secondary text. */
  text2: "#57534E",
  /** Muted text: captions and meta only. */
  muted: "#6B635A",
  /** Stamp-ink vermilion, used rarely: the logo stamp and the one key figure. 5.5:1 on paper. */
  vermilion: "#B23A0B",
} as const;

/** Hairlines and shadows: ink at low alpha, so they stay neutral on paper. */
export const marketingEffects = {
  line: "rgb(28 26 23 / 0.10)",
  lineStrong: "rgb(28 26 23 / 0.18)",
  /** Small things (buttons on hover, inputs). */
  shadowSm: "0 1px 2px rgb(28 26 23 / 0.05)",
  /** The stamp card object, lit from the right like the scene: a contact shadow plus a long soft one falling left. */
  shadowObject: "0 1px 2px rgb(40 24 10 / 0.10), -12px 18px 32px rgb(40 24 10 / 0.18), -2px 4px 8px rgb(40 24 10 / 0.10)",
  /** Floating panels (menus). */
  shadowFloat: "0 8px 24px rgb(28 26 23 / 0.08)",
  radiusControl: "8px",
  radiusCard: "12px",
  radiusPanel: "16px",
  radiusStampCard: "18px",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** CSS variable names, in emit order: --mkt-paper ... --mkt-ease. */
export const MARKETING_VARS = [...Object.keys(marketingColors), ...Object.keys(marketingEffects)].map((k) => `--mkt-${kebab(k)}`);

/** The `.mkt` block for tokens.css. `scriptFonts` is the hi/ur/pa Noto list, so those scripts keep their faces under Instrument. */
export function marketingCss(scriptFonts: string): string[] {
  return [
    `/* Marketing landing (wave R): warm paper, ink, vermilion, Instrument Sans and Serif. Scoped to .mkt (the marketing layout); nothing else reads these. */`,
    `.mkt {`,
    ...Object.entries(marketingColors).map(([k, v]) => `  --mkt-${kebab(k)}: ${v};`),
    ...Object.entries(marketingEffects).map(([k, v]) => `  --mkt-${kebab(k)}: ${v};`),
    // Inter second: the app already loads it (root layout), so until Instrument Sans arrives the page draws in a face that is ready, with no
    // walk through system fallbacks on first layout (measured: ~200 ms of layout on a throttled phone).
    `  --mkt-face-sans: var(--font-instrument-sans, "Instrument Sans"), var(--font-inter, "Inter"), ${scriptFonts}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`,
    `  --mkt-face-serif: var(--font-instrument-serif, "Instrument Serif"), ${scriptFonts}, "Iowan Old Style", Georgia, serif;`,
    `}`,
    ``,
  ];
}

/** The Tailwind names for theme.css (@theme inline). */
export function marketingThemeLines(): string[] {
  const colors = [...Object.keys(marketingColors).map((k) => [kebab(k), kebab(k)]), ["line", "line"], ["line-strong", "line-strong"]];
  return [
    `  /* Marketing landing (wave R, .mkt scope only): bg-mkt-paper, text-mkt-ink, border-mkt-line, shadow-mkt-object, font-mkt-serif ... */`,
    ...colors.map(([n, v]) => `  --color-mkt-${n}: var(--mkt-${v});`),
    `  --shadow-mkt-sm: var(--mkt-shadow-sm);`,
    `  --shadow-mkt-object: var(--mkt-shadow-object);`,
    `  --shadow-mkt-float: var(--mkt-shadow-float);`,
    `  --font-mkt-sans: var(--mkt-face-sans);`,
    `  --font-mkt-serif: var(--mkt-face-serif);`,
  ];
}
