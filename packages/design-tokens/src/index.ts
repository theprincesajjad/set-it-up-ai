/**
 * @ll/design-tokens — the single source of visual truth for Local Loyalty (v2).
 *
 * Spec:   docs/design/foundations.md (wins over everything else)
 * Web:    @import "@ll/design-tokens/theme.css" (Tailwind v4) after "tailwindcss".
 * Mobile: import { colors, textStyles, spacing, radii, shadows, nativeFonts } from "@ll/design-tokens".
 * Map:    cornerMapStyle(baseStyle, mode) / googleMapStyle[mode]; JSON in map/.
 * Icons:  assets/categories/<category>.svg | .png | @2x.png | @3x.png
 * Docs:   docs/design/system.md
 */
export * from "./palette.js";
export * from "./colors.js";
export * from "./typography.js";
export * from "./scales.js";
export * from "./verticals.js";
export * from "./warm.js";
export * from "./charts.js";
export * from "./contrast.js";
export * from "./map.js";

import { colors } from "./colors.js";
import { chartColors } from "./charts.js";
import {
  blur,
  borderWidths,
  breakpoints,
  categoryIconSizes,
  durations,
  easings,
  iconSizes,
  iconStroke,
  layout,
  opacity,
  radii,
  shadows,
  spacing,
  springs,
  touchTargets,
  zIndex,
} from "./scales.js";
import { fontFamilies, fontWeights, nativeFonts, textStyles, typeScale } from "./typography.js";
import { verticalVisuals } from "./verticals.js";

export const tokens = {
  colors,
  chartColors,
  fontFamilies,
  fontWeights,
  nativeFonts,
  textStyles,
  typeScale,
  spacing,
  layout,
  radii,
  shadows,
  blur,
  durations,
  easings,
  springs,
  zIndex,
  breakpoints,
  touchTargets,
  opacity,
  borderWidths,
  iconSizes,
  iconStroke,
  categoryIconSizes,
  verticalVisuals,
} as const;

export type Tokens = typeof tokens;
