import { radii, shadows } from "@ll/design-tokens";
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
  /** Inside another surface: border, no shadow. */
  inset?: boolean;
  tone?: "surface" | "sunken";
  /** 4 px accent left edge (reward ready). */
  accentEdge?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** system.md § Card: surface, radius lg, padding 16, shadow sm on canvas. */
export function Card({ children, title, action, onPress, accessibilityLabel, inset, tone = "surface", accentEdge, padded = true, style }: CardProps) {
  const { c, isDark } = useTheme();
  const body = (
    <>
      {title || action ? (
        <View style={styles.header}>
          {title ? (
            <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">
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
    {
      backgroundColor: tone === "sunken" ? c.surfaceSunken : isDark ? c.surfaceRaised : c.surface,
      padding: padded ? 16 : 0,
      borderColor: c.border,
      borderWidth: inset || isDark ? 1 : 0,
    },
    !inset && !isDark && tone === "surface" ? shadows.sm.native : null,
    accentEdge ? { borderLeftWidth: 4, borderLeftColor: c.accent } : null,
    style,
  ];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.88 : 1 }]}>
        {body}
      </Pressable>
    );
  }
  return <View style={base}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
});
