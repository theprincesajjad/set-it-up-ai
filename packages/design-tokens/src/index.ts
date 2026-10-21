/**
 * @ll/design-tokens — the single source of visual truth for Local Loyalty.
 *
 * Web:    @import "@ll/design-tokens/theme.css" (Tailwind v4) after "tailwindcss".
 * Mobile: import { colors, textStyles, spacing, radii, shadows } from "@ll/design-tokens".
 * Docs:   docs/design/system.md
 */
export * from "./palette.js";
export * from "./colors.js";
export * from "./typography.js";
export * from "./scales.js";
export * from "./verticals.js";
export * from "./charts.js";
export * from "./contrast.js";

import { colors } from "./colors.js";
import { chartColors } from "./charts.js";
import { borderWidths, breakpoints, durations, easings, iconSizes, layout, opacity, radii, shadows, spacing, touchTargets, zIndex } from "./scales.js";
import { fontFamilies, fontWeights, nativeFonts, textStyles } from "./typography.js";
import { verticalVisuals } from "./verticals.js";

export const tokens = {
  colors,
  chartColors,
  fontFamilies,
  fontWeights,
  nativeFonts,
  textStyles,
  spacing,
  layout,
  radii,
  shadows,
  durations,
  easings,
  zIndex,
  breakpoints,
  touchTargets,
  opacity,
  borderWidths,
  iconSizes,
  verticalVisuals,
} as const;

export type Tokens = typeof tokens;
