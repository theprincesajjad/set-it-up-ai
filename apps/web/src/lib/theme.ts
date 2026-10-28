/**
 * Theme style switch (docs/design/v3.2-clear-build.md "Switching theme").
 *
 *   <html data-theme-style="clear" data-theme="light">   Clear, the default everywhere a shop is not known
 *   <html data-theme-style="clear" data-theme="dark">    Clear graphite dark: only when the shop opted in (never from the OS)
 *   <html data-theme-style="warm">                        Main Street Warm: no data-theme, so it follows the device as before
 *
 * Resolved before the first paint, three ways:
 *   1. The root layout's <head> script (`themeInitScript`): on /m/<id> and /door/<id> it reads the `ll-theme-<id>` cookie the dashboard wrote
 *      on the last visit. Anywhere else it sets Clear light. `?theme=clear|clear-dark|warm` overrides it for one page load (screenshots, QA).
 *   2. <ThemeStyle> renders an inline script at the top of the shop's layout with the shop's real setting (hard navigations).
 *   3. <ThemeStyle> applies the same attributes in a layout effect (client navigations) and refreshes the cookie.
 */
import { THEME_COOKIE_PREFIX, themeCookieValue, type ThemeCookieValue, type ThemeStyle } from "@ll/shared";

export type { ThemeStyle };
export const THEME_QUERY = "theme";

export interface ThemeChoice {
  style: ThemeStyle;
  /** Clear graphite dark (ignored under Warm). */
  dark: boolean;
}

export const DEFAULT_THEME: ThemeChoice = { style: "clear", dark: false };

export function parseThemeValue(v: string | null | undefined): ThemeChoice | null {
  if (v === "warm") return { style: "warm", dark: false };
  if (v === "clear") return { style: "clear", dark: false };
  if (v === "clear-dark") return { style: "clear", dark: true };
  return null;
}

export const themeValue = (c: ThemeChoice): ThemeCookieValue => themeCookieValue(c.style, c.dark);

/** The attribute-setting body shared by every script below (keep it tiny: it runs before paint). `v` is a ThemeCookieValue or null. */
const APPLY = `function a(v){var d=document.documentElement;if(v==="warm"){d.setAttribute("data-theme-style","warm");d.removeAttribute("data-theme")}else{d.setAttribute("data-theme-style","clear");d.setAttribute("data-theme",v==="clear-dark"?"dark":"light")}}`;
const QUERY = `var q=(location.search.match(/[?&]${THEME_QUERY}=(clear|clear-dark|warm)(?:&|$)/)||[])[1];`;

/** Root <head> script: the cookie for the shop in the URL, else Clear light; `?theme=` wins. */
export const themeInitScript = `(function(){try{${APPLY}${QUERY}var m=location.pathname.match(/^\\/(?:m|door)\\/([^/?#]+)/),v=null;if(m){var c=document.cookie.match(new RegExp("(?:^|; )${THEME_COOKIE_PREFIX}"+m[1]+"=([^;]*)"));v=c&&c[1]}a(q||v)}catch(e){}})()`;

/** Inline script for a known shop's setting (still honours `?theme=`). */
export function themeApplyScript(c: ThemeChoice): string {
  return `(function(){try{${APPLY}${QUERY}a(q||${JSON.stringify(themeValue(c))})}catch(e){}})()`;
}

/** Client: set the attributes now (soft navigations, the Settings preview). */
export function applyTheme(c: ThemeChoice) {
  if (typeof document === "undefined") return;
  const d = document.documentElement;
  if (c.style === "warm") {
    d.setAttribute("data-theme-style", "warm");
    d.removeAttribute("data-theme");
  } else {
    d.setAttribute("data-theme-style", "clear");
    d.setAttribute("data-theme", c.dark ? "dark" : "light");
  }
}

/** The one-page-load override from the URL, if any. */
export function themeFromQuery(): ThemeChoice | null {
  if (typeof location === "undefined") return null;
  return parseThemeValue(new URLSearchParams(location.search).get(THEME_QUERY));
}

export function writeThemeCookie(merchantId: string, c: ThemeChoice) {
  if (typeof document === "undefined") return;
  // A year; path / so /door/<id> reads it too. Not httpOnly: the head script reads it before paint.
  document.cookie = `${THEME_COOKIE_PREFIX}${merchantId}=${themeValue(c)}; path=/; max-age=31536000; samesite=lax`;
}
