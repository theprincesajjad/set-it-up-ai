import { Platform, StyleSheet, Switch as RNSwitch, View } from "react-native";
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
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="meta" color="fgMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <RNSwitch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        // iOS keeps the system switch (green); Android tints it black so it matches the black primary.
        {...(Platform.OS === "android" ? { trackColor: { false: c.bgMuted, true: c.fg }, thumbColor: c.bg } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 8 },
});
