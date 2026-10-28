/**
 * The shop's look (docs/design/v3.2-clear-build.md): Clear (the default, Liquid Glass chrome, light unless the shop opts into graphite dark)
 * or Main Street Warm (its own light and dark, following the device). Stored per shop (merchants.theme_style, merchants.theme_dark).
 */
export const THEME_STYLES = ["clear", "warm"] as const;
export type ThemeStyle = (typeof THEME_STYLES)[number];
export const DEFAULT_THEME_STYLE: ThemeStyle = "clear";

/** Narrow anything (a cookie, a DB value, a query param) to a theme style; unknown values are Clear. */
export function themeStyleOf(v: unknown): ThemeStyle {
  return v === "warm" ? "warm" : "clear";
}

/** Cookie the owner dashboard reads before paint: `ll-theme-<merchantId>` = "clear" | "clear-dark" | "warm". */
export const THEME_COOKIE_PREFIX = "ll-theme-";
export type ThemeCookieValue = "clear" | "clear-dark" | "warm";
export function themeCookieValue(style: ThemeStyle, dark: boolean): ThemeCookieValue {
  return style === "warm" ? "warm" : dark ? "clear-dark" : "clear";
}
