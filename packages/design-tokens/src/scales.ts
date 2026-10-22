/**
 * Spacing, radii, elevation, motion, layering, breakpoints, touch targets.
 * Numbers are px (React Native units). The CSS build converts to rem where it
 * makes sense.
 */

/** 4px grid. Keys match Tailwind's spacing scale (1 = 4px) so `p-4` = spacing[4] = 16px. */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;
export type SpacingKey = keyof typeof spacing;

/** Layout constants (px). */
export const layout = {
  /** Side gutter on phones. */
  gutterMobile: 16,
  /** Side gutter on tablet/desktop. */
  gutterDesktop: 24,
  /** Side gutter on wide desktop. */
  gutterWide: 32,
  /** Max readable width for prose/forms. */
  maxProse: 640,
  /** Max dashboard content width. */
  maxContent: 1200,
  /** Dashboard sidebar width (lg+). */
  sidebar: 248,
  /** Dashboard sidebar item row height. */
  sidebarRow: 32,
  /** Table row height. */
  tableRow: 44,
  /** Frosted capsule tab bar height on mobile (excl. safe area). */
  tabBar: 60,
  /** Floating capsule / round chrome button height over the map. */
  chrome: 44,
  /** Top app bar height. */
  appBar: 44,
  /** Bottom sheet grabber: width x height. */
  grabberWidth: 36,
  grabberHeight: 5,
} as const;

/**
 * Radii (v2): 10 inputs & small buttons · 16 cards & sheets' inner blocks ·
 * 24 bottom sheets · full for capsules, chips, map chrome, avatars.
 * Legacy keys xs/sm/md/lg/xl are kept for compile-compat and collapse onto those values.
 */
export const radii = {
  none: 0,
  input: 10,
  card: 16,
  sheet: 24,
  /** @deprecated use input */ xs: 10,
  /** @deprecated use input */ sm: 10,
  /** @deprecated use input (or full for capsule buttons) */ md: 10,
  /** @deprecated use card */ lg: 16,
  /** @deprecated use sheet */ xl: 24,
  full: 9999,
} as const;
export type RadiusKey = keyof typeof radii;

export interface NativeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android */
  elevation: number;
}

const NO_SHADOW = { css: "none", native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 } };
/** The one v2 shadow. RN can only draw one shadow layer, so native approximates the pair. */
const FLOAT = {
  css: "0 1px 2px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.08)",
  native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
};

/**
 * Elevation (v2): ONE shadow, `float`, only for things that float over the
 * map or content (chrome capsules, the tab bar, sheets, toasts, popovers).
 * Cards on a white page get a `line` hairline, not a shadow.
 * Legacy keys: sm (cards) → none; md/lg/xl → float.
 */
export const shadows = {
  none: NO_SHADOW,
  float: FLOAT,
  /** @deprecated cards get a hairline, not a shadow */ sm: NO_SHADOW,
  /** @deprecated use float */ md: FLOAT,
  /** @deprecated use float */ lg: FLOAT,
  /** @deprecated use float */ xl: FLOAT,
} as const satisfies Record<string, { css: string; native: NativeShadow }>;
export type ShadowKey = keyof typeof shadows;

/** Dark-mode float: shadows barely read on near-black, so it leans on a deeper, neutral shadow. */
export const shadowFloatDark = "0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.5)";

/**
 * Frosted chrome (tab bar, top capsules): `colors.*.chrome` (bg at 80%) + 20px blur.
 * Native: expo-blur `<BlurView intensity={blur.nativeIntensity} tint="systemChromeMaterial">`
 * with the chrome colour as an overlay. Web: `backdrop-filter: blur(20px) saturate(180%)`.
 * Frosting is for map chrome ONLY (anti-slop: no glassmorphism elsewhere).
 */
export const blur = {
  chrome: 20,
  chromeOpacity: 0.8,
  nativeIntensity: 80,
  saturate: 1.8,
} as const;

/**
 * Motion (v2): 150 ms ease-out for taps, 240 ms spring for sheets; nothing
 * bounces twice. Honour reduced motion (replace movement with a 150 ms fade, keep haptics).
 */
export const durations = {
  tap: 150,
  sheet: 240,
  /** @deprecated use tap */ fast: 150,
  /** @deprecated use tap */ base: 150,
  /** @deprecated use sheet */ slow: 240,
} as const;
export type DurationKey = keyof typeof durations;

export const easings = {
  /** Taps, hovers, toggles, fades. */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** CSS stand-in for the sheet spring (no overshoot). */
  sheet: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;
export type EasingKey = keyof typeof easings;

/** Bezier control points for React Native Reanimated `Easing.bezier(...)`. */
export const easingsNative = {
  out: [0.16, 1, 0.3, 1],
  sheet: [0.32, 0.72, 0, 1],
} as const satisfies Record<EasingKey, readonly [number, number, number, number]>;

/**
 * Reanimated `withSpring` configs. Damping ratio ~0.9 so a sheet settles in
 * ~240 ms with at most one imperceptible overshoot (nothing bounces twice).
 */
export const springs = {
  sheet: { damping: 32, stiffness: 320, mass: 1 },
  /** Stamp fill / award check: a single small overshoot. */
  pop: { damping: 22, stiffness: 380, mass: 0.8 },
} as const;

export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 100, // sticky headers, tab bar
  banner: 200, // offline banner (must stay above sticky header)
  dropdown: 300,
  overlay: 400, // scrim
  modal: 500, // modal + sheet
  popover: 600,
  toast: 700,
  tooltip: 800,
} as const;
export type ZIndexKey = keyof typeof zIndex;

/** Min-width breakpoints in px. Same as Tailwind defaults on purpose. */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;
export type BreakpointKey = keyof typeof breakpoints;

/**
 * Minimum hit areas in px/pt (the visual element can be smaller; pad the hit area).
 * v2: >= 44 everywhere; counter keys 72; kiosk 88.
 */
export const touchTargets = {
  min: 44,
  default: 44,
  /** Counter mode buttons and keys (staff, mid-rush, one-handed). */
  counter: 72,
  keypad: 72,
  /** Kiosk (customer-facing tablet) keys and buttons. */
  kiosk: 88,
  /** Minimum gap between adjacent targets. */
  gap: 8,
} as const;
export type TouchTargetKey = keyof typeof touchTargets;

export const opacity = {
  disabled: 0.4,
  pressed: 0.7,
  scrim: 0.4,
} as const;

/** Border widths (px). Native hairlines use StyleSheet.hairlineWidth (0.5 on retina). */
export const borderWidths = {
  hairline: 1,
  thick: 2,
  focus: 2,
  focusOffset: 2,
} as const;

/** Lucide icon sizes; stroke width is always `iconStroke`. */
export const iconSizes = {
  md: 20,
  lg: 24,
} as const;
export const iconStroke = 1.75;

/** Category object illustrations (assets/categories): rail and pin-bubble sizes. */
export const categoryIconSizes = {
  pin: 28,
  rail: 40,
} as const;
