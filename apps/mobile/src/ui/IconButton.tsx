import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import type { LucideIcon } from "./icons";
import { Text } from "./Text";

export interface IconButtonProps {
  icon: LucideIcon;
  /** Required: used for accessibilityLabel. */
  label: string;
  onPress?: () => void;
  variant?: "ghost" | "secondary" | "primary";
  size?: 48 | 64;
  /** Show the label under the icon (Shop detail action row). */
  showLabel?: boolean;
  badgeDot?: boolean;
  disabled?: boolean;
}

export function IconButton({ icon: Icon, label, onPress, variant = "ghost", size = 48, showLabel, badgeDot, disabled }: IconButtonProps) {
  const { c } = useTheme();
  const bg = variant === "primary" ? c.brand : variant === "secondary" ? c.surface : "transparent";
  const fg = disabled ? c.fgDisabled : variant === "primary" ? c.onBrand : variant === "secondary" ? c.fg : c.fgBrand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.wrap, { minWidth: size, minHeight: size, opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
          variant === "secondary" ? { borderWidth: 1, borderColor: c.borderStrong } : null,
        ]}
      >
        <Icon size={size >= 64 ? 28 : 24} color={fg} strokeWidth={2} />
        {badgeDot ? <View style={[styles.dot, { backgroundColor: c.danger, borderColor: c.surface }]} /> : null}
      </View>
      {showLabel ? (
        <Text variant="caption" color="fgMuted" center>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: 4 },
  circle: { alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 10, right: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
