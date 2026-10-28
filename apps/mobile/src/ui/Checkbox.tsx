import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Check } from "./icons";
import { Text } from "./Text";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  caption?: string | null;
  disabled?: boolean;
  large?: boolean;
}

/** 24 x 24 box, 48 hit area; checked = brand fill + white check. */
export function Checkbox({ checked, onChange, label, caption, disabled, large }: CheckboxProps) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityHint={caption ?? undefined}
      onPress={() => !disabled && onChange(!checked)}
      style={styles.row}
    >
      <View
        style={[
          styles.box,
          large ? styles.boxLarge : null,
          { borderColor: checked ? c.brand : c.lineStrong, backgroundColor: checked ? c.brand : c.bg },
        ]}
      >
        {checked ? <Check size={large ? 24 : 18} color={c.onBrand} strokeWidth={3} /> : null}
      </View>
      <View style={styles.text}>
        <Text variant={large ? "bodyLg" : "body"}>{label}</Text>
        {caption ? (
          <Text variant="meta" color="fgMuted">
            {caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * CASL consent: the full consent sentence is the label, NEVER pre-checked
 * (callers start with `false`), and the exact text is what gets sent to the API.
 */
export function ConsentCheckbox(props: Omit<CheckboxProps, "label"> & { text: string }) {
  return <Checkbox {...props} label={props.text} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start", minHeight: 48, paddingVertical: 8 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, marginTop: 1, alignItems: "center", justifyContent: "center" },
  boxLarge: { width: 32, height: 32, borderRadius: 8 },
  text: { flex: 1, gap: 4 },
});
