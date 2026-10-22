import { shadows } from "@ll/design-tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import type { LucideIcon } from "./icons";
import { Text } from "./Text";

export interface IconButtonProps {
  icon: LucideIcon;
  /** Required: used for accessibilityLabel. */
  label: string;
  onPress?: () => void;
  /** ghost: bare icon · secondary: grey circle · primary: black circle · float: white circle over the map. */
  variant?: "ghost" | "secondary" | "primary" | "float";
  size?: 32 | 36 | 44 | 48 | 64;
  /** Show the label under the icon (shop action row). */
  showLabel?: boolean;
  badgeDot?: boolean;
  disabled?: boolean;
}

export function IconButton({ icon: Icon, label, onPress, variant = "ghost", size = 44, showLabel, badgeDot, disabled }: IconButtonProps) {
  const { c } = useTheme();
  const bg = variant === "primary" ? c.fg : variant === "secondary" ? c.bgSubtle : variant === "float" ? c.bg : "transparent";
  const fg = disabled ? c.fgSubtle : variant === "primary" ? c.bg : c.fg;
  const hit = Math.max(0, (44 - size) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      hitSlop={hit}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.7 : 1, transform: pressed ? [{ scale: 0.96 }] : undefined }]}
    >
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }, variant === "float" ? shadows.float.native : null]}>
        <Icon size={size >= 64 ? 26 : size <= 36 ? 18 : 20} color={fg} strokeWidth={1.75} />
        {badgeDot ? <View style={[styles.dot, { backgroundColor: c.accent, borderColor: bg === "transparent" ? c.bg : bg }]} /> : null}
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
  dot: { position: "absolute", top: 6, right: 6, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
});
