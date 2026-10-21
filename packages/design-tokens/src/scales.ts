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

/** Layout constants. */
export const layout = {
  /** Side gutter on phones. */
  gutterMobile: 16,
  /** Side gutter on tablet/desktop. */
  gutterDesktop: 24,
  /** Max readable width for prose/forms. */
  maxProse: 640,
  /** Max dashboard content width. */
  maxContent: 1200,
  /** Dashboard sidebar width (lg+). */
  sidebar: 248,
  /** Bottom tab bar height on mobile (excl. safe area). */
  tabBar: 56,
  /** Top app bar height. */
  appBar: 56,
} as const;

export const radii = {
  none: 0,
  xs: 4, // badges inside dense tables
  sm: 8, // inputs, chips, small buttons
  md: 12, // buttons, list rows, tiles
  lg: 16, // cards
  xl: 24, // sheets (top corners), hero cards, My Card
  full: 9999, // pills, avatars, stamps
} as const;
export type RadiusKey = keyof typeof radii;

/**
 * Elevation. Warm-tinted shadows (ink #1F1B16), never pure black. Dark mode
 * relies on surface colour steps instead; shadows there are stronger but rarely seen.
 */
export interface NativeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android */
  elevation: number;
}

export const shadows = {
  none: { css: "none", native: { shadowColor: "#1F1B16", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 } },
  /** Cards resting on canvas. */
  sm: {
    css: "0 1px 2px 0 rgb(31 27 22 / 0.06), 0 1px 3px 0 rgb(31 27 22 / 0.08)",
    native: { shadowColor: "#1F1B16", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  },
  /** Raised cards, sticky bars, dropdowns. */
  md: {
    css: "0 4px 8px -2px rgb(31 27 22 / 0.08), 0 2px 4px -2px rgb(31 27 22 / 0.06)",
    native: { shadowColor: "#1F1B16", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  },
  /** Sheets, popovers, toasts. */
  lg: {
    css: "0 12px 24px -6px rgb(31 27 22 / 0.14), 0 4px 8px -4px rgb(31 27 22 / 0.08)",
    native: { shadowColor: "#1F1B16", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 16, elevation: 8 },
  },
  /** Modals. */
  xl: {
    css: "0 24px 48px -12px rgb(31 27 22 / 0.24)",
    native: { shadowColor: "#1F1B16", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 16 },
  },
} as const satisfies Record<string, { css: string; native: NativeShadow }>;
export type ShadowKey = keyof typeof shadows;

/**
 * Motion. Keep it short: staff are mid-rush and phones are old. Honour
 * reduced motion (prefers-reduced-motion / AccessibilityInfo.isReduceMotionEnabled):
 * replace movement with a 120ms fade, drop confetti, keep the haptic.
 */
export const durations = {
  instant: 80, // press feedback
  fast: 150, // hover, toggles, chips
  base: 220, // most enter/exit, tab switches
  slow: 320, // sheets, modals
  celebrate: 600, // stamp pop, points count-up (max), success check draw
} as const;
export type DurationKey = keyof typeof durations;

export const easings = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  enter: "cubic-bezier(0, 0, 0, 1)", // decelerate
  exit: "cubic-bezier(0.3, 0, 1, 1)", // accelerate
  emphasized: "cubic-bezier(0.3, 1.4, 0.5, 1)", // small overshoot for stamp pop / success check
} as const;
export type EasingKey = keyof typeof easings;

/** Bezier control points for React Native Reanimated `Easing.bezier(...)`. */
export const easingsNative = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0, 1],
  exit: [0.3, 0, 1, 1],
  emphasized: [0.3, 1.4, 0.5, 1],
} as const satisfies Record<EasingKey, readonly [number, number, number, number]>;

/** Reanimated `withSpring` config for sheets and the success card. */
export const springs = {
  sheet: { damping: 26, stiffness: 260, mass: 1 },
  pop: { damping: 14, stiffness: 320, mass: 0.8 },
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
 * Minimum hit areas in px (the visual element can be smaller; pad the hit area).
 */
export const touchTargets = {
  /** Absolute minimum anywhere (WCAG 2.5.8 is 24; we go well past it). */
  min: 44,
  /** Default for customer app and dashboard on touch. */
  default: 48,
  /** Counter mode buttons (staff, mid-rush, one-handed). */
  counter: 64,
  /** Counter keypad keys. */
  keypad: 72,
  /** Kiosk (customer-facing tablet) keys and buttons. */
  kiosk: 88,
  /** Minimum gap between adjacent targets. */
  gap: 8,
} as const;
export type TouchTargetKey = keyof typeof touchTargets;

export const opacity = {
  disabled: 0.48,
  pressed: 0.88,
  scrim: 0.48,
} as const;

/** Border widths. */
export const borderWidths = {
  hairline: 1,
  thick: 2,
  focus: 2,
  focusOffset: 2,
} as const;

/** Icon sizes (lucide `size` prop). Stroke width 2 everywhere, 1.75 at 32+. */
export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  hero: 48,
} as const;
