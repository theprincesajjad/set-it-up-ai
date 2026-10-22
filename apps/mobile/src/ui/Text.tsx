import type { ColorRoles, TextStyleName } from "@ll/design-tokens";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { typo, useTheme } from "../theme";

export interface TextProps extends RNTextProps {
  variant?: TextStyleName;
  color?: keyof ColorRoles;
  /** Raw colour (vertical ink etc.). Prefer `color`. */
  rawColor?: string;
  center?: boolean;
  tabular?: boolean;
}

/** Token-driven text. Weight maps to a Figtree family (Android can't synthesise weights). */
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
