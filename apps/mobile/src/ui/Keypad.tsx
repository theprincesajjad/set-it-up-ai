import { radii, touchTargets } from "@ll/design-tokens";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Delete, X } from "./icons";
import { Text } from "./Text";

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "clear";

export interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  /** 72 (counter, default) or 88 (kiosk). */
  size?: "counter" | "kiosk";
  disabled?: boolean;
}

const ROWS: KeypadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["clear", "0", "back"],
];

/** 3 x 4 keypad, 72 px keys (kiosk 88), haptic selection, long-press backspace = clear. */
export function Keypad({ onKey, size = "counter", disabled }: KeypadProps) {
  const { c } = useTheme();
  const h = size === "kiosk" ? touchTargets.kiosk : touchTargets.keypad;
  const press = (k: KeypadKey) => {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => undefined);
    onKey(k);
  };
  return (
    <View style={styles.grid}>
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((k) => {
            const label = k === "back" ? "Delete" : k === "clear" ? "Clear" : k;
            return (
              <Pressable
                key={k}
                accessibilityRole="keyboardkey"
                accessibilityLabel={label}
                onPress={() => press(k)}
                onLongPress={k === "back" ? () => press("clear") : undefined}
                style={({ pressed }) => [
                  styles.key,
                  { height: h, backgroundColor: pressed ? c.surfaceSunken : c.surface, borderColor: c.border, opacity: disabled ? 0.48 : 1 },
                ]}
              >
                {k === "back" ? (
                  <Delete size={28} color={c.fg} />
                ) : k === "clear" ? (
                  <X size={28} color={c.fg} />
                ) : (
                  <Text variant="keypad" maxFontSizeMultiplier={1.6} style={size === "kiosk" ? { fontSize: 36, lineHeight: 40 } : null}>
                    {k}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  key: { flex: 1, borderRadius: radii.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
