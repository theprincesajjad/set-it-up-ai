import type { ColorRoles, TextStyleName } from "@ll/design-tokens";
import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { sentenceCase } from "../lib/sentenceCase";
import { useIsRtl, useLocaleCode } from "../lib/i18n";
import { isDisplayFamily, typo, useTheme } from "../theme";
import { scriptStyle } from "./scriptStyle";

const SCRIPT_LOCALES = new Set(["hi", "ur", "pa"]);

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
  const { c, isClear } = useTheme();
  // react-native-web gives every Text dir="auto": a Latin-only line (a shop or customer name) would sit at the physical left of a
  // right-to-left row. Start-aligned text is right-aligned in Urdu; Urdu text with dir="auto" resolves to RTL on its own.
  const rtl = useIsRtl();
  const locale = useLocaleCode();
  const base = typo(variant);
  const flat = StyleSheet.flatten([base, style]) ?? {};
  const script = scriptStyle(locale, flat, rest.children);
  const display = isDisplayFamily(flat.fontFamily);
  // Fraunces has no Devanagari, Gurmukhi or Nastaliq: those headings fall back to the system script face at the same (bold) weight.
  const scriptFallback: TextStyle | null = display && locale !== "en" && SCRIPT_LOCALES.has(locale) ? { fontFamily: undefined, fontWeight: "700" } : null;
  // Clear has no display serif: the same heading in the system face (SF Pro, the native twin of the spec's Inter) at 700, tracked
  // tight the way SF tracks large sizes (-0.022em at 26 and up, -0.014em at 17).
  const clearFace: TextStyle | null = display && isClear ? { fontFamily: undefined, fontWeight: "700", letterSpacing: -(flat.fontSize ?? 17) * ((flat.fontSize ?? 17) >= 24 ? 0.022 : 0.014) } : null;
  // Display strings read in sentence case ("Wallet", not "wallet"): the shared messages are lowercase, the face is not.
  const children = display && locale === "en" ? sentenceCase(rest.children) : rest.children;
  return (
    <RNText
      {...rest}
      children={children}
      style={[
        base,
        { color: rawColor ?? c[color] },
        rtl ? { textAlign: "right" } : null,
        center ? { textAlign: "center" } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
        clearFace,
        scriptFallback,
        script,
      ]}
    />
  );
}
