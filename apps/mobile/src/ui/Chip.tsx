import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Check, type LucideIcon } from "./icons";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  /** Counter mode: 48 visual height. */
  large?: boolean;
  /** Spoken label when the visible one is terse ("+2" → "Add 2 stamps"). */
  accessibilityLabel?: string;
}

/** Interactive filter chip: height 36 (hit 48), radius full, selected = brandSubtle + check. */
export function Chip({ label, selected, onPress, icon: Icon, large, accessibilityLabel }: ChipProps) {
  const { c } = useTheme();
  const fg = selected ? c.onBrandSubtle : c.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={large ? 8 : 6}
      style={({ pressed }) => [
        styles.chip,
        {
          minHeight: large ? 48 : 36,
          paddingHorizontal: large ? 16 : 12,
          backgroundColor: selected ? c.brandSubtle : c.surface,
          borderColor: selected ? c.brandSubtle : c.borderStrong,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {selected ? <Check size={16} color={fg} /> : Icon ? <Icon size={16} color={fg} /> : null}
        <Text variant={large ? "bodyStrong" : "label"} rawColor={fg}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
