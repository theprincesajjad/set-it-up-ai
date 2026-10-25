import { radii } from "@ll/design-tokens";
import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import { useLocale } from "../lib/i18n";
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
  const { t } = useLocale();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? c.negative : focused ? c.fg : c.lineStrong;
  return (
    <View style={styles.wrap}>
      <Text variant="metaStrong" color="fgMuted" nativeID={`${label}-label`}>
        {label}
        {optionalLabel ? (
          <Text variant="metaStrong" color="fgSubtle">
            {" "}
            {t("auth.m.name.optional")}
          </Text>
        ) : null}
      </Text>
      <View
        style={[
          styles.field,
          {
            minHeight: large ? 64 : multiline ? 96 : 48,
            backgroundColor: editable ? c.bg : c.bgSubtle,
            borderColor,
            borderWidth: error || focused ? 2 : 1,
          },
        ]}
      >
        {prefix ? (
          <Text variant={large ? "title" : "body"} color="fgMuted">
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
          placeholderTextColor={c.fgSubtle}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[typo(large ? "title" : "body"), styles.input, { color: editable ? c.fg : c.fgMuted }, multiline ? { textAlignVertical: "top", paddingTop: 12 } : null]}
        />
        {suffix ? (
          <Text variant="body" color="fgMuted">
            {suffix}
          </Text>
        ) : null}
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
  field: { flexDirection: "row", alignItems: "center", borderRadius: radii.input, paddingHorizontal: 12, gap: 6 },
  input: { flex: 1, minWidth: 0, width: "100%", paddingVertical: 10 },
  msg: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
});
