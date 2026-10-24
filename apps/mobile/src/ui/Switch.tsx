import { Platform, StyleSheet, Switch as RNSwitch, View } from "react-native";
import { useTheme } from "../theme";
import { haptic } from "./haptics";
import { Text } from "./Text";

/** UISwitch "on" green (systemGreen). Only used to mimic iOS in the web preview. */
const IOS_GREEN = "#34C759";

export interface SwitchRowProps {
  label: string;
  description?: string | null;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  /** Hairline under the row, inset to the text (grouped lists). */
  divider?: boolean;
}

/** Settings that apply immediately. Label left, describes the on-state. */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
  divider,
}: SwitchRowProps) {
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
      {/* RN-web positions the thumb with physical offsets, so in an RTL language (Urdu) it slides off the track. The
          switch itself stays LTR; the row around it still mirrors. */}
      <View style={Platform.OS === "web" ? styles.ltr : undefined}>
        <RNSwitch
          accessibilityLabel={label}
          value={value}
          onValueChange={(v) => {
            haptic.select();
            onValueChange(v);
          }}
          disabled={disabled}
          // iOS keeps the system switch (green). Android tints it black so it matches the black primary. The web
          // QA preview draws the iOS switch (RN-web's default is Material teal; polish-audit S7).
          {...(Platform.OS === "android"
            ? { trackColor: { false: c.bgMuted, true: c.fg }, thumbColor: c.bg }
            : Platform.OS === "web"
              ? ({
                  trackColor: { false: c.bgMuted, true: IOS_GREEN },
                  thumbColor: "#FFFFFF",
                  activeThumbColor: "#FFFFFF",
                } as object)
              : {})}
        />
      </View>
      {divider ? (
        <View style={[styles.divider, { backgroundColor: c.line }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 52,
    paddingVertical: 10,
  },
  ltr: { direction: "ltr" },
  divider: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
