import { shadows } from "@ll/design-tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { haptic } from "./haptics";
import type { LucideIcon } from "./icons";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  /** Trailing glyph, e.g. ChevronDown for "my shops ▾". */
  trailingIcon?: LucideIcon;
  /** Counter mode: 48 visual height. */
  large?: boolean;
  /** Over the map: white capsule with the float shadow. */
  float?: boolean;
  /** Spoken label when the visible one is terse ("+2" → "Add 2 stamps"). */
  accessibilityLabel?: string;
}

/** Capsule: white with a hairline, terracotta when on. Over the map it floats on white. */
export function Chip({ label, selected, onPress, icon: Icon, trailingIcon: Trailing, large, float, accessibilityLabel }: ChipProps) {
  const { c, r } = useTheme();
  const fg = selected ? c.onBrand : c.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      hitSlop={large ? 8 : 4}
      style={({ pressed }) => [
        styles.chip,
        {
          minHeight: large ? 48 : 36,
          paddingHorizontal: large ? 18 : 14,
          backgroundColor: selected ? c.brand : float ? c.bg : r.card,
          borderWidth: selected ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: r.border,
          opacity: pressed ? 0.85 : 1,
          transform: pressed ? [{ scale: 0.98 }] : undefined,
        },
        float ? shadows.float.native : null,
      ]}
    >
      <View style={styles.row}>
        {Icon ? <Icon size={large ? 18 : 15} color={fg} strokeWidth={2} /> : null}
        <Text variant={large ? "bodyStrong" : "metaStrong"} rawColor={fg}>
          {label}
        </Text>
        {Trailing ? <Trailing size={14} color={fg} strokeWidth={2.25} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 999, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 5 },
});
