import { radii, touchTargets } from "@ll/design-tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { haptic } from "./haptics";
import { Delete } from "./icons";
import { Text } from "./Text";

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "clear";

export interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  /** 72 (counter, default) or 88 (kiosk). */
  size?: "counter" | "kiosk";
  /** Overrides the key height (kiosk on a phone shrinks keys to fit). Never below the 72 px counter keypad minimum. */
  keyHeight?: number;
  disabled?: boolean;
}

const ROWS: KeypadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["clear", "0", "back"],
];

/** 3 x 4 keypad: grey keys, black tabular digits, 72 pt (kiosk 88), haptic tick, long-press delete = clear. */
export function Keypad({ onKey, size = "counter", keyHeight, disabled }: KeypadProps) {
  const { c } = useTheme();
  const h = Math.max(touchTargets.keypad, keyHeight ?? (size === "kiosk" ? touchTargets.kiosk : touchTargets.keypad));
  const press = (k: KeypadKey) => {
    if (disabled) return;
    haptic.select();
    onKey(k);
  };
  return (
    <View style={styles.grid}>
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((k) => {
            const label = k === "back" ? "Delete" : k === "clear" ? "Clear" : k;
            const fn = k === "back" || k === "clear";
            return (
              <Pressable
                key={k}
                accessibilityRole="keyboardkey"
                accessibilityLabel={label}
                onPress={() => press(k)}
                onLongPress={k === "back" ? () => press("clear") : undefined}
                style={({ pressed }) => [styles.key, { height: h, backgroundColor: pressed ? c.bgMuted : fn ? c.bg : c.bgSubtle, opacity: disabled ? 0.4 : 1 }]}
              >
                {k === "back" ? (
                  <Delete size={26} color={c.fg} strokeWidth={1.75} />
                ) : k === "clear" ? (
                  <Text variant="bodyStrong" color="fgMuted">
                    Clear
                  </Text>
                ) : (
                  <Text variant="keypad" tabular maxFontSizeMultiplier={1.4} style={[{ fontWeight: "500", fontSize: 30, lineHeight: 36 }, size === "kiosk" ? { fontSize: 36, lineHeight: 42 } : null]}>
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
  key: { flex: 1, borderRadius: radii.card, alignItems: "center", justifyContent: "center" },
});
