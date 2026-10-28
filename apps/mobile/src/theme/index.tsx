/**
 * Themes from @ll/design-tokens, in two looks (docs/design/v3.2-clear.md):
 * - **Clear** (default): light, graphite dark only when chosen; Liquid Glass on the chrome (`Theme.glass`).
 * - **Main Street Warm**: the v3.1 palette; follows the OS unless a scheme is forced.
 * The look comes from this device's choice, else the user's or the shop's setting, else Clear (`appearance.ts`).
 * Counter mode and kiosk nest a <ThemeScope> (light by default, bright shops; brand.md section 4).
 */
import { nativeFonts, textStyles, type TextStyleName } from "@ll/design-tokens";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, useColorScheme, type TextStyle } from "react-native";
import { getJson, setJson } from "../state/storage";
import { parseStoredPref, resolveAppearance, type Appearance, type AppearancePref, type ThemeStyle } from "./appearance";
import { buildTheme, type Theme } from "./build";

export type { Theme } from "./build";
export { buildTheme } from "./build";
export type SchemeName = "light" | "dark";
export type SchemePref = "system" | SchemeName;
export type { ThemeStyle, AppearancePref } from "./appearance";

const ThemeContext = createContext<Theme | null>(null);

/** iOS Reduce Transparency (and the web media query); false elsewhere. */
export function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.matchMedia) return;
      const mq = window.matchMedia("(prefers-reduced-transparency: reduce)");
      setOn(mq.matches);
      const fn = (e: { matches: boolean }) => setOn(e.matches);
      mq.addEventListener?.("change", fn);
      return () => mq.removeEventListener?.("change", fn);
    }
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((v) => live && setOn(!!v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (v: boolean) => setOn(!!v));
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return on;
}

const APPEARANCE_KEY = "ll.appearance.v1";

export interface AppearanceValue {
  /** The resolved look of the root provider. */
  appearance: Appearance;
  /** This device's choice (null fields follow the user / shop setting). */
  device: AppearancePref;
  setDevice: (patch: AppearancePref) => void;
  /** The signed-in user's server setting (AppearanceSync feeds it). */
  setUser: (pref: AppearancePref | null) => void;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

/**
 * Root provider: resolves the look from the device choice (persisted), the user's server setting and the OS.
 * `pref` forces a scheme (tests, previews).
 */
export function ThemeProvider({ pref, children }: { pref?: SchemePref; children: ReactNode }) {
  const os = useColorScheme();
  const reduce = useReduceTransparency();
  const [device, setDeviceState] = useState<AppearancePref>({});
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<AppearancePref | null>(null);
  useEffect(() => {
    let live = true;
    void getJson<unknown>(APPEARANCE_KEY).then((raw) => {
      if (!live) return;
      setDeviceState(parseStoredPref(raw));
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);
  const setDevice = useCallback((patch: AppearancePref) => {
    setDeviceState((d) => {
      const next = { ...d, ...patch };
      void setJson(APPEARANCE_KEY, next);
      return next;
    });
  }, []);
  const appearance = resolveAppearance({ device: pref ? { ...device, scheme: pref } : device, user, os: os === "dark" ? "dark" : "light" });
  const theme = useMemo(() => buildTheme(appearance.scheme, appearance.style, reduce), [appearance.scheme, appearance.style, reduce]);
  const value = useMemo<AppearanceValue>(() => ({ appearance, device, setDevice, setUser }), [appearance.scheme, appearance.style, device, setDevice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hold the first paint until the device choice is read, so a Warm device never flashes a frame of Clear.
  if (!loaded) return null;
  return (
    <AppearanceContext.Provider value={value}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </AppearanceContext.Provider>
  );
}

/** The device choice and its setters (Settings, AppearanceSync). */
export function useAppearance(): AppearanceValue {
  const v = useContext(AppearanceContext);
  return v ?? { appearance: { style: "clear", scheme: "light" }, device: {}, setDevice: () => undefined, setUser: () => undefined };
}

/**
 * Nested override, e.g. counter mode (light by default). `style` defaults to the parent's look, so a scope only changes what it names.
 */
export function ThemeScope({ scheme, style, children }: { scheme: SchemeName; style?: ThemeStyle; children: ReactNode }) {
  const parent = useContext(ThemeContext);
  const s = style ?? parent?.style ?? "clear";
  const reduce = parent?.reduceTransparency ?? false;
  const theme = useMemo(() => buildTheme(scheme, s, reduce), [scheme, s, reduce]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

const FALLBACK = buildTheme("light");

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  return t ?? FALLBACK;
}

/**
 * Display (Bricolage) uses its own family per weight; everything else returns
 * `undefined` = the system font (SF Pro / Roboto), which takes `fontWeight`.
 * The system font is what makes the app feel native (foundations.md § Type).
 */
export const familyForWeight = (w: number, display: boolean): string | undefined => {
  if (!display) return undefined;
  return w >= 800 ? DISPLAY_HEAVY : DISPLAY_BOLD;
};

/**
 * Main Street Warm display faces: Fraunces 800 for big numbers and titles, 600 for card titles. Fraunces has no Devanagari,
 * Gurmukhi or Nastaliq, so `Text` drops these names in hi/ur/pa and the system script face (Noto) takes the heading at the same weight.
 */
export const DISPLAY_HEAVY = "Fraunces_800ExtraBold";
export const DISPLAY_BOLD = "Fraunces_600SemiBold";
/** The Local Loyalty wordmark only (Bricolage stays for it). */
export const WORDMARK = nativeFonts.displayHeavy;
export const isDisplayFamily = (f: unknown): boolean => f === DISPLAY_HEAVY || f === DISPLAY_BOLD;

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
    // Warm voice is sentence case ("Needs you", "Good morning"): the tokens' lowercase flag is dropped, and `Text` capitalises the first letter of display strings.
  };
}


/**
 * Bricolage at an exact canvas size (the artboards set px sizes outside the token scale, e.g. 20 / 32 / 34).
 * Letter-spacing is in em like the CSS (`-.01em`).
 */
export function disp(fontSize: number, weight: 700 | 800 = 800, lineHeight?: number, trackingEm = 0): TextStyle {
  return {
    fontFamily: familyForWeight(weight, true),
    fontSize,
    lineHeight: lineHeight ?? Math.round(fontSize * 1.2),
    letterSpacing: trackingEm * fontSize,
  };
}

/** System font (SF Pro / Roboto; Inter-like on web) at an exact canvas size. */
export function ui(fontSize: number, weight: 400 | 500 | 600 | 700 = 400, lineHeight?: number): TextStyle {
  return { fontSize, fontWeight: toWeight(weight), lineHeight: lineHeight ?? Math.round(fontSize * 1.3) };
}
