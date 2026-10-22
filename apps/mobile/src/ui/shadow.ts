import { shadows, type NativeShadow } from "@ll/design-tokens";
import { Platform, StyleSheet, type ViewStyle } from "react-native";

/**
 * A shadow drawn exactly as the canvas CSS on web (react-native-web passes `boxShadow` through, so the
 * two-layer float shadow is pixel-exact in the QA preview); native keeps the single-layer approximation.
 */
export function shadow(css: string, native: Partial<NativeShadow> = shadows.float.native): ViewStyle {
  return Platform.OS === "web" ? ({ boxShadow: css } as ViewStyle) : (native as ViewStyle);
}

/** foundations § Shadow: 0 1px 2px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.08). */
export const floatShadow: ViewStyle = shadow(shadows.float.css);

/** foundations § Colour: hairlines are 1 px (the canvas) on web, 0.5 pt on retina native. */
export const hairline: number = Platform.OS === "web" ? 1 : StyleSheet.hairlineWidth;
