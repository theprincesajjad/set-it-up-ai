/**
 * Raw palette (v2, docs/design/foundations.md). Apps should NOT use these in
 * components; use the semantic roles in `colors.ts` (they switch for dark mode
 * and are contrast tested). Raw values exist for the map style, illustration
 * and marketing.
 *
 * Monochrome first. One warm accent (orange), reserved for points and rewards.
 *  - gray   : cool-neutral greys from pure white to near-black ink.
 *  - orange : the accent. 500 is fills / large numbers; 700 is accent *text* (AA on white).
 *  - green / red / blue : positive, negative, the user's own location dot.
 *  - map    : basemap colours (land, water, parks), light and dark.
 */

export const palette = {
  gray: {
    0: "#FFFFFF", // bg (light)
    50: "#F5F5F4", // bg-subtle (light) / fg (dark)
    100: "#EDEDEC", // bg-muted (light)
    150: "#E8E8E6", // line (light)
    400: "#9A9AA0", // fg-subtle (light)
    450: "#8A8A90", // line-strong (light): input/checkbox outlines, 3:1
    500: "#7A7A82", // line-strong (dark)
    550: "#6E6E76", // fg-subtle (dark)
    600: "#6B6B70", // fg-muted (light)
    650: "#A1A1A8", // fg-muted (dark)
    800: "#2A2A2E", // line (dark)
    850: "#202023", // bg-muted (dark)
    900: "#161618", // bg-subtle (dark)
    950: "#0B0B0C", // fg (light) / bg (dark): ink
  },
  /**
   * v3 warm stone neutrals (docs/design/v3-strategy.md section 5). The v2 role names
   * resolve to these. `gray` above stays for the map style and anything that needs the cool ramp.
   */
  stone: {
    0: "#FFFFFF", // background, card, popover (light)
    25: "#FBF9F6", // paper (light)
    50: "#F6F4F1", // muted, secondary, sidebar (light) / foreground (dark)
    100: "#EEEBE6", // accent (hover surface), sidebar-accent (light)
    150: "#E7E3DD", // border (light)
    400: "#8A8680", // input, subtle-foreground (light)
    600: "#6B6762", // muted-foreground (light)
    550: "#7C7770", // input, subtle-foreground (dark)
    650: "#A8A39C", // muted-foreground (dark)
    750: "#2C2926", // border (dark)
    800: "#262320", // accent, sidebar-accent (dark)
    850: "#1C1A18", // muted, secondary (dark)
    900: "#161412", // card, popover, sidebar (dark)
    950: "#0E0D0C", // background, paper (dark)
  },
  orange: {
    50: "#FFF1EA", // accent-soft (light)
    400: "#FF7A45", // accent (dark), accent-text (dark)
    500: "#FF5A1F", // accent (light): fills, stamps, large numbers
    600: "#E84E14", // accent hover (light)
    700: "#C2410C", // accent-text (light): small accent text, 5.2:1 on white
    950: "#2A1710", // accent-soft (dark)
  },
  green: {
    400: "#4ADE80", // success-text (dark)
    500: "#22C55E", // positive (dark), positive-text (dark)
    600: "#16A34A", // positive (light): dots and icons (3:1)
    700: "#15803D", // success-text (light)
    800: "#166534", // v2 positive-text (light): small text, 4.5:1 or better on every background
  },
  red: {
    400: "#F87171", // negative (dark)
    600: "#DC2626", // negative (light)
    700: "#B91C1C", // destructive hover (light)
  },
  blue: {
    50: "#EFF4FF", // info-soft (light)
    300: "#8DB2FF", // info-text (dark)
    400: "#4C8DF8", // location, info (dark)
    500: "#2F7BF6", // location, info (light)
    700: "#1D4ED8", // info-text (light)
    950: "#111C33", // info-soft (dark)
  },
  amber: {
    400: "#FBBF24", // warning, warning-text (dark)
    600: "#D97706", // warning (light)
    700: "#B45309", // warning-text (light)
  },
  map: {
    land: "#F2F2F0",
    water: "#E9F0F5",
    park: "#EEF3EA",
    road: "#FFFFFF",
    landDark: "#121214",
    waterDark: "#0F1820",
    parkDark: "#141A14",
    roadDark: "#232327",
  },
} as const;

export type Palette = typeof palette;
