import type { ColorRoles, TextStyleName } from "@ll/design-tokens";
import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useIsRtl, useLocaleCode } from "../lib/i18n";
import { typo, useTheme } from "../theme";
import { scriptStyle } from "./scriptStyle";

export interface TextProps extends RNTextProps {
  variant?: TextStyleName;
  color?: keyof ColorRoles;
  /** Raw colour (QR card ink etc.). Prefer `color`. */
  rawColor?: string;
  center?: boolean;
  tabular?: boolean;
}

/**
 * Token-driven text. Body/UI styles use the system font (SF Pro / Roboto) with
 * a fontWeight; display styles (largeTitle, displayNumber, mapLabel,
 * categoryLabel) use Bricolage Grotesque.
 */
export function Text({ variant = "body", color = "fg", rawColor, center, tabular, style, ...rest }: TextProps) {
  const { c } = useTheme();
  // react-native-web gives every Text dir="auto": a Latin-only line (a shop or customer name) would sit at the physical left of a
  // right-to-left row. Start-aligned text is right-aligned in Urdu; Urdu text with dir="auto" resolves to RTL on its own.
  const rtl = useIsRtl();
  const locale = useLocaleCode();
  const base = typo(variant);
  const script = scriptStyle(locale, StyleSheet.flatten([base, style]) ?? {}, rest.children);
  return (
    <RNText
      {...rest}
      style={[
        base,
        { color: rawColor ?? c[color] },
        rtl ? { textAlign: "right" } : null,
        center ? { textAlign: "center" } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
        script,
      ]}
    />
  );
}
