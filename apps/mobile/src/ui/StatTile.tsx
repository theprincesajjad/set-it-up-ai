import { View } from "react-native";
import { formatNumber } from "../lib/award";
import { Card } from "./Card";
import { Text } from "./Text";

export function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <View accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: 4 }}>
        <Text variant="overline" color="fgMuted">
          {label}
        </Text>
        <Text variant="stat">{typeof value === "number" ? formatNumber(value) : value}</Text>
      </View>
    </Card>
  );
}
