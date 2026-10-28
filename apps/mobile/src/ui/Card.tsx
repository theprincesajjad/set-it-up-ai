import { radii, shadows, shadowsDarkCss } from "@ll/design-tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { DISPLAY_HEAVY, useTheme } from "../theme";
import { shadow } from "./shadow";
import { clearCard, CLEAR_CARD_TITLE } from "./Warm";
import { Text } from "./Text";
import { capFirst } from "../lib/sentenceCase";

export interface CardProps {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** v1 prop; every card is now a hairline card. */
  inset?: boolean;
  /** sunken = grey grouped block (no hairline). */
  tone?: "surface" | "sunken";
  /** v1 prop (reward-ready edge); ignored, status is a dot + word now. */
  accentEdge?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Main Street Warm card: white on the cream canvas, radius 22, a hairline under it and a soft lift. */
export function Card({ children, title, action, onPress, accessibilityLabel, tone = "surface", padded = true, style }: CardProps) {
  const theme = useTheme();
  const { c, r, isDark, isClear } = theme;
  const body = (
    <>
      {title || action ? (
        <View style={styles.header}>
          {title ? (
            <Text style={isClear ? CLEAR_CARD_TITLE : { flex: 1, fontFamily: DISPLAY_HEAVY, fontSize: 20, lineHeight: 26 }} accessibilityRole="header">
              {isClear ? capFirst(title) : title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {action}
        </View>
      ) : null}
      {children}
    </>
  );
  const base: StyleProp<ViewStyle> = [
    styles.card,
    tone === "sunken" ? { backgroundColor: c.bgSubtle } : isClear ? clearCard(theme) : [{ backgroundColor: r.card }, shadow(isDark ? shadowsDarkCss.card! : shadows.card.css, shadows.card.native)],
    isClear ? { borderRadius: 20 } : null,
    { padding: padded ? 16 : 0 },
    style,
  ];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, pressed ? { opacity: 0.85 } : null]}>
        {body}
      </Pressable>
    );
  }
  return <View style={base}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
});
