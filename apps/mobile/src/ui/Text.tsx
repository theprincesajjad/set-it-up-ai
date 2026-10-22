import type { ColorRoles, TextStyleName } from "@ll/design-tokens";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { typo, useTheme } from "../theme";

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
  return (
    <RNText
      {...rest}
      style={[
        typo(variant),
        { color: rawColor ?? c[color] },
        center ? { textAlign: "center" } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    />
  );
}
