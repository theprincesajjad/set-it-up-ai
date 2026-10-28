import { radii, touchTargets, type TextStyleName } from "@ll/design-tokens";
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { glow } from "./Warm";
import { haptic } from "./haptics";
import type { LucideIcon } from "./icons";
import { Text } from "./Text";

/**
 * primary = terracotta capsule (the one strongest action on a screen);
 * secondary = white with a hairline; outline = hairline; ghost = text only;
 * danger = grey fill + red label (iOS destructive). `accent` and `tonal`
 * are v1 names: accent is reserved for points, so both render as
 * primary / secondary.
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "tonal" | "ghost" | "danger" | "accent" | "inverse";
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
  /** Light impact on press (default on for primary). */
  haptics?: boolean;
}

/** Clear button scale (audit #13): pills 32 / 44 (phone touch) / 48; counter 56 r16; the kiosk keeps its 88. */
const CLEAR_SIZES: Record<ButtonSize, { height: number; px: number; text: TextStyleName; icon: number; radius: number }> = {
  sm: { height: 32, px: 16, text: "metaStrong", icon: 16, radius: radii.full },
  md: { height: 44, px: 20, text: "bodyStrong", icon: 18, radius: radii.full },
  lg: { height: 48, px: 20, text: "bodyStrong", icon: 18, radius: radii.full },
  counter: { height: 56, px: 24, text: "headline", icon: 22, radius: 16 },
  kiosk: { height: touchTargets.kiosk, px: 32, text: "title", icon: 26, radius: 20 },
};

const SIZES: Record<ButtonSize, { height: number; px: number; text: TextStyleName; icon: number; radius: number }> = {
  sm: { height: 36, px: 14, text: "metaStrong", icon: 16, radius: radii.full },
  md: { height: touchTargets.default, px: 18, text: "bodyStrong", icon: 18, radius: radii.full },
  lg: { height: 52, px: 22, text: "bodyStrong", icon: 20, radius: radii.full },
  counter: { height: touchTargets.counter, px: 24, text: "headline", icon: 22, radius: radii.card },
  kiosk: { height: touchTargets.kiosk, px: 32, text: "title", icon: 26, radius: radii.card },
};

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
  haptics,
}: ButtonProps) {
  const { c, r, isDark, isClear, glass } = useTheme();
  const s = (isClear ? CLEAR_SIZES : SIZES)[size];
  const v = variant === "accent" ? "primary" : variant === "tonal" ? "secondary" : variant;
  const palette: Record<Exclude<ButtonVariant, "accent" | "tonal">, { bg: string; fg: string; border?: string; pressed: string }> = {
    primary: { bg: c.brand, fg: c.onBrand, pressed: c.brandPressed },
    secondary: { bg: r.card, fg: c.fg, border: r.border, pressed: c.bgSubtle },
    outline: { bg: c.bg, fg: c.fg, border: c.lineStrong, pressed: c.bgSubtle },
    ghost: { bg: "transparent", fg: c.fg, pressed: c.bgSubtle },
    danger: { bg: c.bgSubtle, fg: c.negative, pressed: c.bgMuted },
    inverse: { bg: c.bg, fg: c.fg, pressed: c.bgSubtle },
  };
  // Clear: solid black primary (white in dark), glass secondary (the seg-track fill with an inner highlight), no glow.
  if (isClear) {
    palette.secondary = { bg: glass.segTrack, fg: c.fg, pressed: c.bgMuted };
    palette.outline = { bg: r.card, fg: c.fg, border: c.borderStrong, pressed: c.bgSubtle };
  }
  const p = palette[v];
  const off = disabled || loading;
  const fg = disabled ? c.fgSubtle : p.fg;
  const hit = Math.max(0, (touchTargets.min - s.height) / 2);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={
        off
          ? undefined
          : () => {
              if (haptics ?? v === "primary") haptic.tap();
              onPress?.();
            }
      }
      onLongPress={off ? undefined : onLongPress}
      hitSlop={hit ? { top: hit, bottom: hit } : undefined}
      android_ripple={v === "ghost" || disabled ? undefined : { color: c.overlay, foreground: true }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: s.height,
          paddingHorizontal: v === "ghost" && size === "sm" ? 4 : s.px,
          borderRadius: s.radius,
          backgroundColor: disabled && v !== "ghost" ? c.bgMuted : pressed ? p.pressed : p.bg,
          borderWidth: p.border ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: p.border,
          transform: pressed ? [{ scale: 0.98 }] : undefined,
        },
        v === "primary" && !disabled && size !== "sm" ? (isClear ? ({ boxShadow: isDark ? "0 1px 2px rgba(0,0,0,0.4)" : "0 1px 2px rgba(0,0,0,0.18)" } as ViewStyle) : glow(isDark)) : null,
        isClear ? ({ borderCurve: "continuous" } as ViewStyle) : null,
        fullWidth || size === "counter" || size === "kiosk" ? styles.full : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={fg} size="small" /> : IconStart ? <IconStart size={s.icon} color={fg} strokeWidth={2} /> : null}
        <Text variant={s.text} rawColor={fg} numberOfLines={2} center maxFontSizeMultiplier={size === "kiosk" ? 1.4 : 1.6}>
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
