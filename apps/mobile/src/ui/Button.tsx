import { radii, touchTargets } from "@ll/design-tokens";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import type { LucideIcon } from "./icons";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger" | "accent" | "inverse";
export type ButtonSize = "sm" | "md" | "lg" | "counter" | "kiosk";

export interface ButtonProps {
  children: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  iconStart?: LucideIcon;
  iconEnd?: LucideIcon;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SIZES = {
  sm: { height: 36, hit: 44, px: 12, text: "label", icon: 16, radius: radii.sm },
  md: { height: touchTargets.default, hit: 48, px: 16, text: "bodyStrong", icon: 20, radius: radii.md },
  lg: { height: 56, hit: 56, px: 20, text: "bodyStrong", icon: 20, radius: radii.md },
  counter: { height: touchTargets.counter, hit: 64, px: 24, text: "h3", icon: 24, radius: radii.lg },
  kiosk: { height: touchTargets.kiosk, hit: 88, px: 32, text: "h2", icon: 28, radius: radii.lg },
} as const;

/** system.md § Button. One primary per screen; accent is reserved for Redeem / reward-ready. */
export function Button({
  children,
  onPress,
  onLongPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  fullWidth,
  iconStart: IconStart,
  iconEnd: IconEnd,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { c } = useTheme();
  const s = SIZES[size];
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string; pressed: string }> = {
    primary: { bg: c.brand, fg: c.onBrand, pressed: c.brandPressed },
    secondary: { bg: c.surface, fg: c.fg, border: c.borderStrong, pressed: c.surfaceSunken },
    tonal: { bg: c.brandSubtle, fg: c.onBrandSubtle, pressed: c.brandSubtle },
    ghost: { bg: "transparent", fg: c.fgBrand, pressed: c.brandSubtle },
    danger: { bg: c.danger, fg: c.onDanger, pressed: c.dangerHover },
    accent: { bg: c.accent, fg: c.onAccent, pressed: c.accentHover },
    // White button on a full-colour success/accent card (counter Undo).
    inverse: { bg: c.surface, fg: c.fg, pressed: c.surfaceSunken },
  };
  const p = palette[variant];
  const off = disabled || loading;
  const fg = disabled ? c.onDisabled : p.fg;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={off ? undefined : onPress}
      onLongPress={off ? undefined : onLongPress}
      hitSlop={s.hit > s.height ? { top: (s.hit - s.height) / 2, bottom: (s.hit - s.height) / 2 } : undefined}
      android_ripple={variant === "ghost" || disabled ? undefined : { color: c.overlay }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: s.height,
          paddingHorizontal: s.px,
          borderRadius: s.radius,
          backgroundColor: disabled ? c.disabledBg : pressed ? p.pressed : p.bg,
          borderWidth: p.border && !disabled ? 1 : 0,
          borderColor: p.border,
          opacity: pressed && Platform.OS === "ios" ? 0.88 : 1,
          transform: pressed ? [{ scale: 0.98 }] : undefined,
        },
        fullWidth || size === "counter" || size === "kiosk" ? styles.full : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : IconStart ? (
          <IconStart size={s.icon} color={fg} strokeWidth={2} />
        ) : null}
        <Text variant={s.text} rawColor={fg} numberOfLines={2} center maxFontSizeMultiplier={size === "kiosk" ? 1.4 : undefined}>
          {children}
        </Text>
        {IconEnd ? <IconEnd size={s.icon} color={fg} strokeWidth={2} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  full: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 6 },
});
