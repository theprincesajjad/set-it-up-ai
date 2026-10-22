import { radii } from "@ll/design-tokens";
import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import { typo, useTheme } from "../theme";
import { CircleAlert } from "./icons";
import { Text } from "./Text";

export interface TextFieldProps extends Omit<TextInputProps, "style" | "onChange"> {
  label: string;
  hint?: string | null;
  error?: string | null;
  prefix?: string;
  suffix?: string;
  optionalLabel?: boolean;
  multiline?: boolean;
  large?: boolean;
}

/** system.md § TextField: label always visible above, 48 tall, body 16, error replaces hint. */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, hint, error, prefix, suffix, optionalLabel, multiline, large, editable = true, ...input },
  ref,
) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? c.danger : focused ? c.brand : c.borderStrong;
  return (
    <View style={styles.wrap}>
      <Text variant="label" nativeID={`${label}-label`}>
        {label}
        {optionalLabel ? (
          <Text variant="label" color="fgMuted">
            {" "}
            (optional)
          </Text>
        ) : null}
      </Text>
      <View
        style={[
          styles.field,
          {
            minHeight: large ? 64 : multiline ? 96 : 48,
            backgroundColor: editable ? c.surface : c.surfaceSunken,
            borderColor,
            borderWidth: error || focused ? 2 : 1,
          },
        ]}
      >
        {prefix ? (
          <Text variant={large ? "h3" : "body"} color="fgMuted">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          {...input}
          editable={editable}
          multiline={multiline}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${label}-label`}
          accessibilityHint={error ?? hint ?? undefined}
          placeholderTextColor={c.fgMuted}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[typo(large ? "h3" : "body"), styles.input, { color: editable ? c.fg : c.onDisabled }, multiline ? { textAlignVertical: "top", paddingTop: 12 } : null]}
        />
        {suffix ? (
          <Text variant="body" color="fgMuted">
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? (
        <View style={styles.msg} accessibilityLiveRegion="polite">
          <CircleAlert size={16} color={c.danger} />
          <Text variant="bodySm" color="danger" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="bodySm" color="fgMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: radii.sm, paddingHorizontal: 12, gap: 6 },
  input: { flex: 1, paddingVertical: 10 },
  msg: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
});
