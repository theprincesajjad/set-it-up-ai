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

/**
 * Display (Bricolage) uses its own family per weight; everything else returns
 * `undefined` = the system font (SF Pro / Roboto), which takes `fontWeight`.
 * The system font is what makes the app feel native (foundations.md § Type).
 */
export const familyForWeight = (w: number, display: boolean): string | undefined => {
  if (!display) return undefined;
  return w >= 800 ? nativeFonts.displayHeavy : nativeFonts.displayBold;
};

type RNWeight = NonNullable<TextStyle["fontWeight"]>;
const toWeight = (w: number): RNWeight => String(w) as RNWeight;

/** RN text style for a token text style (system font body, Bricolage display). */
export function typo(name: TextStyleName): TextStyle {
  const s = textStyles[name] as (typeof textStyles)[TextStyleName] & { lowercase?: boolean; italic?: boolean };
  const display = s.family === "display";
  const family = familyForWeight(s.fontWeight, display);
  return {
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing * s.fontSize,
    // Custom display faces carry their weight in the family; a fontWeight on top
    // makes Android pick a synthetic bold, so only the system font gets one.
    ...(family ? { fontFamily: family } : { fontWeight: toWeight(s.fontWeight) }),
    ...(s.tabular ? { fontVariant: ["tabular-nums"] } : {}),
    ...(s.italic ? { fontStyle: "italic" } : {}),
    ...(s.lowercase ? { textTransform: "lowercase" } : {}),
  };
}

