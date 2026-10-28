/**
 * Main Street Warm tile tones. A tone is a pastel fill with its deep text (design-tokens `tile*` roles, AA-tested in light and dark).
 * `trade` is the shop's own accent family (`--trade-soft` on `--trade-deep`, switched by `[data-trade]` on the shell, pass or shop page).
 * Class names are written out in full so Tailwind sees them.
 */
export type Tone = "peach" | "mint" | "butter" | "lilac" | "sky" | "rose" | "trade";

export const TONES: readonly Tone[] = ["trade", "mint", "butter", "lilac", "sky", "rose", "peach"];

/** Fill + text, for a tile or a pill. */
export const TONE_SURFACE: Record<Tone, string> = {
  peach: "bg-tile-peach text-tile-peach-foreground",
  mint: "bg-tile-mint text-tile-mint-foreground",
  butter: "bg-tile-butter text-tile-butter-foreground",
  lilac: "bg-tile-lilac text-tile-lilac-foreground",
  sky: "bg-tile-sky text-tile-sky-foreground",
  rose: "bg-tile-rose text-tile-rose-foreground",
  trade: "bg-trade-soft text-trade-deep",
};

/** The deep colour alone (a glyph or a line on the tone, or on the card). */
export const TONE_TEXT: Record<Tone, string> = {
  peach: "text-tile-peach-foreground",
  mint: "text-tile-mint-foreground",
  butter: "text-tile-butter-foreground",
  lilac: "text-tile-lilac-foreground",
  sky: "text-tile-sky-foreground",
  rose: "text-tile-rose-foreground",
  trade: "text-trade-deep",
};

/** Hover: a hair darker, never a new colour. */
export const TONE_HOVER = "transition-[filter] duration-150 ease-out hover:brightness-[0.97] active:brightness-95";
