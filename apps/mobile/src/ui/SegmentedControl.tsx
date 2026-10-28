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
  const { c, isClear, glass, isDark } = useTheme();
  // Clear: the glass track (inset 2) with a lifted selected segment, pill in pill (audit #14); 40 segments make the 44 phone target.
  const lifted = { backgroundColor: glass.lift, boxShadow: glass.solid ? `inset 0 0 0 1px ${c.line}` : isDark ? "inset 0 0 0 1px rgba(255,255,255,0.14), 0 2px 6px rgba(0,0,0,0.4)" : `inset 0 0 0 1px ${glass.edge}, 0 2px 6px rgba(20,24,40,0.14)` } as object;
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.track, { backgroundColor: c.bgMuted }, isClear ? { backgroundColor: glass.segTrack, padding: 2, gap: 0 } : null]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.seg, isClear ? { minHeight: 40 } : null, selected ? (isClear ? lifted : [{ backgroundColor: c.brand }, shadows.float.native, { shadowOpacity: 0.06, elevation: 1 }]) : null]}
          >
            <Text variant="metaStrong" color={selected ? (isClear ? "fg" : "onBrand") : isClear ? "fg" : "fgMuted"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: 999, padding: 3, gap: 2 },
  seg: { flex: 1, minHeight: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
});
