import { shadows } from "@ll/design-tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel?: string;
}

/** 2-4 options, height 40 (hit 48). View switches, not navigation. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.track, { backgroundColor: c.surfaceSunken }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.seg, selected ? [{ backgroundColor: c.surface }, shadows.sm.native] : null]}
          >
            <Text variant="label" color={selected ? "fg" : "fgMuted"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  seg: { flex: 1, minHeight: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
});
