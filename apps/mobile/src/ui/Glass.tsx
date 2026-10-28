import { BlurView } from "expo-blur";
import { useId, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View, type AccessibilityRole, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../theme";

export type GlassVariant = "regular" | "strong" | "lift";

export interface GlassProps {
  children?: ReactNode;
  /** regular: toolbar, capsules, buttons; strong: tab bar, sheets, pass card (text-heavy); lift: a selected segment or tab. */
  variant?: GlassVariant;
  radius: number;
  style?: StyleProp<ViewStyle>;
  /** Counter bars: flat blur, no specular rim (spec 2.8 performance budget). */
  flat?: boolean;
  /** No drop shadow (glass inside glass). */
  noShadow?: boolean;
  pointerEvents?: "box-none" | "none" | "auto" | "box-only";
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
}

/**
 * Liquid Glass (docs/design/v3.2-clear.md 2.8) for chrome only: tab bar, headers, sheets, segmented controls, the pass card.
 * - iOS: an expo-blur material under the `--lg-*` fill; web: `backdrop-filter: blur() saturate()`; Android: the fill alone
 *   (no cheap live blur), which reads as frosted over the canvas.
 * - The 1px luminous edge and inner sheen are inset box-shadows (no layout); the 2px specular rim is an SVG gradient stroke.
 * - Reduce Transparency: the theme hands over opaque fills with no blur and no rim, so the layout is identical and flat.
 */
export function Glass({ children, variant = "regular", radius, style, flat, noShadow, pointerEvents, accessibilityRole, accessibilityLabel }: GlassProps) {
  const { glass: g, isDark } = useTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fill = variant === "strong" ? g.fillStrong : variant === "lift" ? g.lift : g.fill;
  const blurPx = variant === "strong" ? g.blurStrong : g.blur;
  const solid = g.solid;
  const ring = !solid && !flat;
  const inset = solid
    ? `inset 0 0 0 1px ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`
    : variant === "strong"
      ? `inset 0 0 0 1px ${g.edge}, inset 2px 3px 8px -2px ${g.inner}, inset 0 0 28px ${g.inner}`
      : `inset 0 0 0 1px ${g.edge}, inset 2px 3px 6px -2px ${g.inner}, inset -2px -3px 8px -4px ${g.inner}`;
  const drop = noShadow ? null : flat ? (isDark ? "0 0 24px rgba(0,0,0,0.4)" : "0 0 24px rgba(20,24,40,0.08)") : variant === "strong" ? g.shadowLg : variant === "lift" ? (isDark ? "0 3px 10px rgba(0,0,0,0.45)" : "0 3px 10px rgba(20,24,40,0.16), 0 1px 2px rgba(20,24,40,0.10)") : g.shadow;
  const onLayout = ring ? (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }) : undefined;
  const web = Platform.OS === "web" && !solid ? ({ backdropFilter: `blur(${blurPx}px) saturate(${g.saturate})`, WebkitBackdropFilter: `blur(${blurPx}px) saturate(${g.saturate})` } as object) : null;
  return (
    <View
      pointerEvents={pointerEvents}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      // zIndex 0 makes the glass its own stacking context, so the material layers (zIndex -1) sit under every child on the web too
      // (an absolutely positioned layer otherwise paints over in-flow children such as an SVG icon).
      style={[{ borderRadius: radius, borderCurve: "continuous", zIndex: 0 }, drop ? ({ boxShadow: drop } as ViewStyle) : null, style]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderCurve: "continuous", overflow: "hidden", zIndex: -1 }]}>
        {Platform.OS === "ios" && !solid ? <BlurView intensity={variant === "strong" ? 80 : g.intensity} tint={g.tint} style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === "android" && !solid ? opaqueFor(fill, isDark) : fill }, web]} />
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, boxShadow: inset } as ViewStyle]} />
      </View>
      {ring && size ? (
        <Svg pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: -1 }]} width={size.w} height={size.h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Defs>
            {/* 140deg: rim-a at the top-left, rim-b at 28% and 74%, clear at 52%, rim-c at the bottom-right. */}
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={g.rimA} />
              <Stop offset="0.28" stopColor={g.rimB} />
              <Stop offset="0.52" stopColor={g.rimB} stopOpacity={0} />
              <Stop offset="0.74" stopColor={g.rimB} />
              <Stop offset="1" stopColor={g.rimC} />
            </LinearGradient>
          </Defs>
          <Rect x={1} y={1} width={Math.max(0, size.w - 2)} height={Math.max(0, size.h - 2)} rx={Math.max(0, radius - 1)} ry={Math.max(0, radius - 1)} fill="none" stroke={`url(#${gid})`} strokeWidth={variant === "strong" ? 2 : 1.5} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** Android draws no live blur, so a translucent fill would show text straight through: lift the alpha toward opaque. */
function opaqueFor(rgba: string, isDark: boolean): string {
  const m = /rgba\(([^)]+)\)/.exec(rgba);
  if (!m) return rgba;
  const [r, g, b, a] = m[1]!.split(",").map((s) => Number(s.trim()));
  return `rgba(${r},${g},${b},${Math.max(a ?? 1, isDark ? 0.94 : 0.92)})`;
}

/**
 * Glass as a plain style for small controls that already own their layout (map circles, chips, capsules): the strong fill (no live
 * blur needed to stay legible over the map), the luminous edge and the chrome shadow; web adds the backdrop blur. Opaque under
 * Reduce Transparency.
 */
export function glassStyle(t: { glass: { fill: string; fillStrong: string; edge: string; shadow: string; solid: boolean; blur: number; saturate: number } }, variant: "regular" | "strong" = "strong"): ViewStyle {
  const g = t.glass;
  return {
    backgroundColor: variant === "strong" ? g.fillStrong : g.fill,
    boxShadow: `inset 0 0 0 1px ${g.edge}, ${g.shadow}`,
    ...(Platform.OS === "web" && !g.solid ? ({ backdropFilter: `blur(${g.blur}px) saturate(${g.saturate})` } as object) : null),
  } as ViewStyle;
}

/**
 * Apple's scroll-edge effect (the v6 mock's `.sedge`, docs/design/v3.2-clear-build.md 3): a fixed, non-interactive strip under top or bottom
 * glass chrome that blurs the content scrolling toward it, so text is soft colour by the time the glass sees it instead of readable through
 * the capsule. 84 tall under the top capsules, 120 above the tab bar; the blur fades out with a mask. Web only: iOS chrome is a real
 * expo-blur material and Android chrome is near-opaque. Off under Reduce Transparency (opaque chrome needs no edge).
 */
export function ScrollEdge({ edge, offset = 0 }: { edge: "top" | "bottom"; /** Extra height for a safe-area inset. */ offset?: number }) {
  const { glass: g } = useTheme();
  if (Platform.OS !== "web" || g.solid) return null;
  const top = edge === "top";
  const mask = top ? "linear-gradient(to bottom, #000 0, #000 62%, transparent 100%)" : "linear-gradient(to top, #000 0, #000 58%, transparent 100%)";
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { position: "absolute", left: 0, right: 0, height: (top ? 84 : 120) + offset },
        top ? { top: 0 } : { bottom: 0 },
        { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", maskImage: mask, WebkitMaskImage: mask } as object,
      ]}
    />
  );
}
