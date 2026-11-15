import { Platform, type ViewStyle } from "react-native";

/**
 * Layout direction for a subtree. On the web preview the `dir` attribute is what resolves start/end and flips rows, and
 * react-native-web rejects a `direction` style (it logs an error on every render), so the style is native-only.
 */
export function dirStyle(dir: "ltr" | "rtl"): Pick<ViewStyle, "direction"> {
  return Platform.OS === "web" ? {} : { direction: dir };
}

/** Props that pin a View to left-to-right (phone keypads, digit boxes, map pins never mirror in a right-to-left language). */
export function ltrProps(): { dir: "ltr"; style: Pick<ViewStyle, "direction"> } {
  return { dir: "ltr", style: dirStyle("ltr") };
}

/** `accessibilityElementsHidden` and `importantForAccessibility` are native-only; on web they leak onto the DOM node, so hide it with aria. */
export const hiddenFromA11y: Record<string, unknown> = Platform.OS === "web" ? { "aria-hidden": true } : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" };
