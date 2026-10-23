import { forwardRef } from "react";
import { StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import { applyPhoneEdit, formatNanp, toE164 } from "../lib/phone";
import { typo, useTheme } from "../theme";
import { CircleAlert } from "./icons";
import { Text } from "./Text";

export interface PhoneFieldProps {
  label?: string;
  digits: string;
  onChangeDigits: (digits: string) => void;
  onChangeE164?: (e164: string | null) => void;
  error?: string | null;
  hint?: string | null;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}

/** NANP PhoneField with "+1" chip and as-you-type "(416) 555-0123" formatting (system.md § PhoneField). */
export const PhoneField = forwardRef<TextInputInstance, PhoneFieldProps>(function PhoneField(
  { label = "Mobile number", digits, onChangeDigits, onChangeE164, error, hint, autoFocus, onSubmitEditing },
  ref,
) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text variant="metaStrong" color="fgMuted">{label}</Text>
      <View style={[styles.field, { backgroundColor: c.bg, borderColor: error ? c.negative : c.lineStrong, borderWidth: error ? 2 : 1 }]}>
        <View style={[styles.chip, { backgroundColor: c.bgSubtle }]} accessibilityElementsHidden importantForAccessibility="no">
          <Text variant="bodyStrong" color="fgMuted">
            +1
          </Text>
        </View>
        <TextInput
          ref={ref}
          value={formatNanp(digits)}
          onChangeText={(text) => {
            const next = applyPhoneEdit(digits, text);
            onChangeDigits(next);
            onChangeE164?.(toE164(next));
          }}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus={autoFocus}
          placeholder="(416) 555-0123"
          placeholderTextColor={c.fgSubtle}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint ?? undefined}
          onSubmitEditing={onSubmitEditing}
          returnKeyType="done"
          style={[typo("title"), styles.input, { color: c.fg, fontVariant: ["tabular-nums"], writingDirection: "ltr" }]}
        />
      </View>
      {error ? (
        <View style={styles.msg} accessibilityLiveRegion="polite">
          <CircleAlert size={16} color={c.negative} />
          <Text variant="meta" color="negative" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="meta" color="fgMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, minHeight: 56, paddingHorizontal: 8, gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  input: { flex: 1, minWidth: 0, width: "100%", paddingVertical: 10 },
  msg: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
});
