import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  valueLabel?: string;
  tone?: "brand" | "accent";
  /** Spoken value, e.g. "6 of 25 members". */
  valueText?: string;
}

/** Height 8, radius full, track ringTrack, fill brand (accent for reward progress). */
export function ProgressBar({ value, max, label, valueLabel, tone = "brand", valueText }: ProgressBarProps) {
  const { c } = useTheme();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: Math.min(value, max), text: valueText ?? `${value} of ${max}` }}
      accessibilityLabel={label}
      style={{ gap: 6 }}
    >
      {label || valueLabel ? (
        <View style={styles.labels}>
          {label ? (
            <Text variant="label" style={{ flex: 1 }}>
              {label}
            </Text>
          ) : null}
          {valueLabel ? (
            <Text variant="label" tabular>
              {valueLabel}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.track, { backgroundColor: c.ringTrack }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: tone === "accent" ? c.accent : c.brand }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: "row", alignItems: "center" },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
});
