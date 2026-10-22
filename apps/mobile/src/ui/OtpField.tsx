import { radii } from "@ll/design-tokens";
import { forwardRef, useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import { typo, useTheme } from "../theme";
import { Text } from "./Text";

export interface OtpFieldProps {
  value: string;
  onChange: (code: string) => void;
  /** Fires on the 6th digit (auto-submit). */
  onComplete?: (code: string) => void;
  error?: boolean;
  autoFocus?: boolean;
  length?: number;
}

/**
 * One real input (oneTimeCode / SMS autofill / paste) hidden behind 6
 * presentational boxes (system.md § OtpField). Shakes on error.
 */
export const OtpField = forwardRef<TextInputInstance, OtpFieldProps>(function OtpField({ value, onChange, onComplete, error, autoFocus, length = 6 }, ref) {
  const { c } = useTheme();
  const inner = useRef<TextInputInstance>(null);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      Animated.sequence(
        [4, -4, 4, -4, 4, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 36, useNativeDriver: true })),
      ).start();
    });
    return () => {
      cancelled = true;
    };
  }, [error, shake]);

  const setRef = (node: TextInputInstance | null) => {
    (inner as { current: TextInputInstance | null }).current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: TextInputInstance | null }).current = node;
  };

  return (
    <Pressable onPress={() => inner.current?.focus()} accessible={false}>
      <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length }, (_, i) => {
          const active = i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: c.bgSubtle,
                  borderColor: error ? c.negative : active ? c.fg : "transparent",
                  borderWidth: error || active ? 2 : 0,
                },
              ]}
            >
              <Text variant="keypad" tabular style={{ fontWeight: "500" }}>{value[i] ?? ""}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={setRef}
        value={value}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, "").slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus={autoFocus}
        accessibilityLabel={`${length}-digit code`}
        caretHidden
        style={[typo("keypad"), styles.hidden]}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "center" },
  box: { width: 48, height: 58, borderRadius: radii.input, alignItems: "center", justifyContent: "center" },
  hidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, color: "transparent" },
});
