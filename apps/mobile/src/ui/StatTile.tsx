import { View } from "react-native";
import { formatNumber } from "../lib/award";
import { Text } from "./Text";

/** A plain number with its label above (no box; group them inside one bordered block). */
export function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: 2, flex: 1, minWidth: 120, paddingVertical: 4 }}>
      <Text variant="meta" color="fgMuted">
        {label}
      </Text>
      <Text variant="displayNumber" tabular style={{ fontSize: 32, lineHeight: 36 }}>
        {typeof value === "number" ? formatNumber(value) : value}
      </Text>
    </View>
  );
}
