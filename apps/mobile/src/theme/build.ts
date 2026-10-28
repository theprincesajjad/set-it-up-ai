/**
 * Builds a Theme value for a scheme and a look. Pure (no react-native import), so the theme switch is unit-tested
 * (`build.test.ts`); `index.tsx` provides it through context.
 */
import { colors, tradeColors, verticalTrade, verticalVisual, type ColorRoles, type TradeColors, type VerticalColors } from "@ll/design-tokens";
import type { ThemeStyle } from "./appearance";
import { clearColorRoles, clearExtras, clearGlass, clearRoles, clearTradeColors, type ClearExtras, type ClearGlass } from "./clear";
import { rolesFor, type RolesV3, type SchemeName } from "./roles";

export interface Theme {
  scheme: SchemeName;
  isDark: boolean;
  /** "clear" (default) or "warm". */
  style: ThemeStyle;
  isClear: boolean;
  /** Reduce Transparency is on: glass renders opaque. */
  reduceTransparency: boolean;
  /** v2 role names (aliases of `r`, removed in the final sweep). */
  c: ColorRoles;
  /** v3 roles: the shadcn names the web uses (`background`, `mutedForeground`, `points`, `pointsText`, `paper` ...). */
  r: RolesV3;
  /** Clear-only roles (link, chart, chips, card shadow). Warm gets the Clear light values so callers never branch on undefined. */
  x: ClearExtras;
  /** Liquid Glass roles (opaque when `reduceTransparency`). */
  glass: ClearGlass;
  /** Vertical identity colours (placeholder tiles, map pins). */
  vertical: (v: string | null | undefined) => VerticalColors & { icon: string; label: string };
  /** The trade accent family for a vertical (accent, foreground, alt, soft, deep): the same values as the web `[data-trade]` variables. */
  trade: (v: string | null | undefined) => TradeColors;
}

export function buildTheme(scheme: SchemeName, style: ThemeStyle = "clear", reduceTransparency = false): Theme {
  const clear = style === "clear";
  return {
    scheme,
    isDark: scheme === "dark",
    style,
    isClear: clear,
    reduceTransparency,
    c: clear ? clearColorRoles(scheme) : colors[scheme],
    r: clear ? clearRoles[scheme] : rolesFor(scheme),
    x: clearExtras[scheme],
    glass: clearGlass(scheme, reduceTransparency),
    vertical: (v) => {
      const vis = verticalVisual(v);
      return { ...vis[scheme], icon: vis.iconComponent, label: vis.label };
    },
    trade: (v) => (clear ? clearTradeColors(verticalTrade(v), scheme) : tradeColors(verticalTrade(v), scheme)),
  };
}

