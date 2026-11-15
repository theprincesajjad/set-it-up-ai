import { radii } from "@ll/design-tokens";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { daysInMonth, withMonth, type Birthday } from "../../lib/birthday";
import { useLocale } from "../../lib/i18n";
import { useTheme } from "../../theme";
import { ChevronDown, Chip, CircleAlert, Sheet, Text } from "../../ui";

function PickerField({ label, placeholder, a11y, onPress }: { label: string; placeholder: boolean; a11y: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => [styles.field, { borderColor: c.lineStrong, backgroundColor: pressed ? c.bgSubtle : c.bg }]}>
      <Text color={placeholder ? "fgSubtle" : "fg"} style={{ flex: 1 }}>
        {label}
      </Text>
      <ChevronDown size={18} color={c.fgMuted} strokeWidth={2} />
    </Pressable>
  );
}

/** Birthday as a month and a day (we never ask for the year). Picker fields look like inputs (radius 10, 52 tall), not capsules. */
export function BirthdayField({ value, onChange, error, optional = true }: { value: Birthday; onChange: (b: Birthday) => void; error?: string | null; optional?: boolean }) {
  const { t, date } = useLocale();
  const { c } = useTheme();
  const [picker, setPicker] = useState<"month" | "day" | null>(null);
  const { month, day } = value;
  const monthNames = Array.from({ length: 12 }, (_, i) => date(new Date(Date.UTC(2000, i, 15)), { month: "long" }, "UTC"));
  return (
    <View style={{ gap: 6 }}>
      <Text variant="metaStrong" color="fgMuted">
        {t("auth.m.name.birthday")}
        {optional ? " " : ""}
        {optional ? (
          <Text variant="metaStrong" color="fgSubtle">
            {t("auth.m.name.optional")}
          </Text>
        ) : null}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PickerField label={month ? (monthNames[month - 1] ?? t("auth.m.name.month")) : t("auth.m.name.month")} placeholder={!month} a11y={`${t("auth.m.name.birthdayMonth")}: ${month ? monthNames[month - 1] : t("auth.m.name.notSet")}`} onPress={() => setPicker("month")} />
        <PickerField label={day ? String(day) : t("auth.m.name.day")} placeholder={!day} a11y={`${t("auth.m.name.birthdayDay")}: ${day ?? t("auth.m.name.notSet")}`} onPress={() => setPicker("day")} />
      </View>
      {error ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLiveRegion="polite">
          <CircleAlert size={16} color={c.negative} />
          <Text variant="meta" color="negative" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : null}
      <Text variant="meta" color="fgMuted">
        {t("auth.m.name.birthdayHint")}
      </Text>
      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker === "month" ? t("auth.m.name.birthdayMonth") : t("auth.m.name.birthdayDay")}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {picker === "month"
            ? monthNames.map((name, i) => (
                <Chip
                  key={name}
                  label={name}
                  selected={month === i + 1}
                  onPress={() => {
                    onChange(withMonth(value, i + 1));
                    setPicker(null);
                  }}
                />
              ))
            : Array.from({ length: daysInMonth(month) }, (_, i) => (
                <Chip
                  key={i}
                  label={String(i + 1)}
                  selected={day === i + 1}
                  onPress={() => {
                    onChange({ month, day: i + 1 });
                    setPicker(null);
                  }}
                />
              ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, minHeight: 52, borderRadius: radii.input, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
});
