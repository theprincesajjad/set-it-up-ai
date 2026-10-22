import { StyleSheet, Switch as RNSwitch, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export interface SwitchRowProps {
  label: string;
  description?: string | null;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

/** Settings that apply immediately. Label left, describes the on-state. */
export function SwitchRow({ label, description, value, onValueChange, disabled }: SwitchRowProps) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="bodySm" color="fgMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <RNSwitch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: c.borderStrong, true: c.brand }}
        thumbColor={c.surface}
        ios_backgroundColor={c.borderStrong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 },
});
