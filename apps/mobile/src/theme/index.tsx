/**
 * Light/dark themes from @ll/design-tokens. Customer app follows the OS;
 * counter mode and kiosk default to light (bright shops) with a manual toggle
 * (brand.md § 4), via a nested <ThemeScope scheme="light">.
 */
import { colors, nativeFonts, textStyles, verticalVisual, type ColorRoles, type TextStyleName, type VerticalColors } from "@ll/design-tokens";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme, type TextStyle } from "react-native";

export type SchemeName = "light" | "dark";
export type SchemePref = "system" | SchemeName;

export interface Theme {
  scheme: SchemeName;
  isDark: boolean;
  c: ColorRoles;
  /** Vertical identity colours (placeholder tiles, map pins). */
  vertical: (v: string | null | undefined) => VerticalColors & { icon: string; label: string };
}

const ThemeContext = createContext<Theme | null>(null);

function buildTheme(scheme: SchemeName): Theme {
  return {
    scheme,
    isDark: scheme === "dark",
    c: colors[scheme],
    vertical: (v) => {
      const vis = verticalVisual(v);
      return { ...vis[scheme], icon: vis.iconComponent, label: vis.label };
    },
  };
}

/** Root provider: follows the OS unless `pref` forces a scheme. */
export function ThemeProvider({ pref = "system", children }: { pref?: SchemePref; children: ReactNode }) {
  const os = useColorScheme();
  const scheme: SchemeName = pref === "system" ? (os === "dark" ? "dark" : "light") : pref;
  const theme = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Nested override, e.g. counter mode (light by default). */
export function ThemeScope({ scheme, children }: { scheme: SchemeName; children: ReactNode }) {
  const theme = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  return t ?? buildTheme("light");
}

const familyForWeight = (w: number, display: boolean): string => {
  if (display) return nativeFonts.display;
  if (w >= 700) return nativeFonts.bold;
  if (w >= 600) return nativeFonts.semibold;
  if (w >= 500) return nativeFonts.medium;
  return nativeFonts.regular;
};

/**
 * RN text style for a token text style. Android doesn't synthesise weights for
 * custom fonts, so weight maps to a font family (system.md § Mobile).
 */
export function typo(name: TextStyleName): TextStyle {
  const s = textStyles[name];
  const display = s.family === "display";
  return {
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing * s.fontSize,
    fontFamily: familyForWeight(s.fontWeight, display),
    ...(s.tabular ? { fontVariant: ["tabular-nums"] } : {}),
    ...("uppercase" in s && s.uppercase ? { textTransform: "uppercase" } : {}),
  };
}
