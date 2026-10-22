import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  valueLabel?: string;
  /** accent = points / reward progress; brand = neutral progress (black). */
  tone?: "brand" | "accent";
  /** Spoken value, e.g. "6 of 25 members". */
  valueText?: string;
  height?: number;
}

/** Thin bar: track bgMuted, fill accent (points) or fg. */
export function ProgressBar({ value, max, label, valueLabel, tone = "brand", valueText, height = 6 }: ProgressBarProps) {
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
            <Text variant="meta" color="fgMuted" style={{ flex: 1 }}>
              {label}
            </Text>
          ) : null}
          {valueLabel ? (
            <Text variant="metaStrong" color={tone === "accent" ? "accentText" : "fg"} tabular>
              {valueLabel}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: c.bgMuted }]}>
        <View style={{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: tone === "accent" ? c.accent : c.fg }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: "row", alignItems: "center" },
  track: { overflow: "hidden" },
});
