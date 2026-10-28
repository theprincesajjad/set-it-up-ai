"use client";
/**
 * The shop's theme style (Clear or Warm, plus Clear's opt-in dark) for everything below it. See lib/theme.ts for how it reaches <html>
 * before paint, and docs/design/v3.2-clear-build.md for the rules.
 *
 *   <ThemeStyle style={m.themeStyle} dark={m.themeDark} merchantId={m.id}>  owner dashboard (writes the cookie)
 *   <ThemeStyle style={shop.themeStyle} />                                   customer pages for one shop (light only, no cookie)
 *
 * `useThemeStyle()` reads it (Clear when there is no provider); `preview()` changes it live, e.g. right after Settings saves.
 */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { applyTheme, DEFAULT_THEME, parseThemeValue, THEME_QUERY, themeApplyScript, writeThemeCookie, type ThemeChoice, type ThemeStyle as Style } from "@/lib/theme";

const noopSubscribe = () => () => undefined;
const queryTheme = () => new URLSearchParams(location.search).get(THEME_QUERY);

interface Ctx extends ThemeChoice {
  /** True under Clear: `if (clear) <ClearChrome/> else <WarmChrome/>`. */
  clear: boolean;
  preview: (c: ThemeChoice) => void;
}

const ThemeCtx = createContext<Ctx>({ ...DEFAULT_THEME, clear: true, preview: () => undefined });

export function useThemeStyle(): Ctx {
  return useContext(ThemeCtx);
}

/** The Next.js "preventing flash" helper: runs during HTML parsing on a hard load, inert (text/plain) when React renders it on the client. */
function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ThemeStyle({ style, dark = false, merchantId, children }: { style?: Style | null; dark?: boolean | null; merchantId?: string; children?: ReactNode }) {
  const initial: ThemeChoice = { style: style === "warm" ? "warm" : "clear", dark: style !== "warm" && !!dark };
  const [override, setOverride] = useState<ThemeChoice | null>(null);
  // A new server value (another shop, or Settings saved and the layout refreshed) replaces a stale preview.
  const [seen, setSeen] = useState(initial);
  if (seen.style !== initial.style || seen.dark !== initial.dark) {
    setSeen(initial);
    setOverride(null);
  }
  // ?theme= (QA, screenshots) is read after hydration so the first client render matches the server's.
  const queryValue = useSyncExternalStore(noopSubscribe, queryTheme, () => null);
  const query = parseThemeValue(queryValue);
  const choice = override ?? query ?? initial;

  useLayoutEffect(() => {
    applyTheme(choice);
    if (merchantId && !override && !query) writeThemeCookie(merchantId, initial);
  });
  // Leaving the shop (to the marketing site, another console): back to the default, Clear light.
  useLayoutEffect(() => () => applyTheme(DEFAULT_THEME), []);

  const preview = useCallback((c: ThemeChoice) => setOverride(c), []);
  const value = useMemo<Ctx>(() => ({ style: choice.style, dark: choice.dark, clear: choice.style === "clear", preview }), [choice.style, choice.dark, preview]);
  return (
    <ThemeCtx.Provider value={value}>
      <InlineScript html={themeApplyScript(initial)} />
      {children}
    </ThemeCtx.Provider>
  );
}
