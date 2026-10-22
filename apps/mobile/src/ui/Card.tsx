import { radii } from "@ll/design-tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

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

/** Cards on a white page get a hairline, not a shadow (foundations § Shape). Radius 16. */
export function Card({ children, title, action, onPress, accessibilityLabel, tone = "surface", padded = true, style }: CardProps) {
  const { c } = useTheme();
  const body = (
    <>
      {title || action ? (
        <View style={styles.header}>
          {title ? (
            <Text variant="headline" style={{ flex: 1 }} accessibilityRole="header">
              {title}
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
    tone === "sunken" ? { backgroundColor: c.bgSubtle } : { backgroundColor: c.bg, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth * 2 },
    { padding: padded ? 16 : 0 },
    style,
  ];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, pressed ? { backgroundColor: c.bgSubtle } : null]}>
        {body}
      </Pressable>
    );
  }
  return <View style={base}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
});
