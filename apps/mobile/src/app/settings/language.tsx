import { LOCALE_LIST } from "@ll/shared";
import { useLocale } from "../../lib/i18n";
import { Card, Check, ListRow, Screen, Text } from "../../ui";
import { useTheme } from "../../theme";

/** Settings: language. Each language in its own script; the choice is kept on this phone. */
export default function LanguageSettings() {
  const { c } = useTheme();
  const { locale, setLocale, t } = useLocale();
  return (
    <Screen back title={t("lang.label")}>
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        {LOCALE_LIST.map((l, i) => (
          <ListRow
            key={l.code}
            title={l.name}
            subtitle={l.code === "en" ? undefined : l.englishName}
            selected={l.code === locale}
            divider={i < LOCALE_LIST.length - 1}
            trailing={l.code === locale ? <Check size={20} color={c.fg} strokeWidth={2.25} /> : undefined}
            accessibilityLabel={`${l.name}${l.code === locale ? `, ${t("rest.selected")}` : ""}`}
            onPress={() => setLocale(l.code)}
          />
        ))}
      </Card>
      <Text variant="meta" color="fgMuted">
        {t("rest.lang.note")}
      </Text>
    </Screen>
  );
}
