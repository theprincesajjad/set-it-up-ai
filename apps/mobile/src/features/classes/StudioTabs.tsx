import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useLocale } from "../../lib/i18n";
import { hairline, Text } from "../../ui";
import { useTheme } from "../../theme";

/**
 * The studio's three tabs along the bottom (Figma frame 05): Schedule, Passes and the loyalty Card. A plain bar, not the app's
 * floating tab bar: these screens sit one level inside a shop.
 */
export function StudioTabs({ slug, current }: { slug: string; current: "schedule" | "passes" }) {
  const { c } = useTheme();
  const { t } = useLocale();
  const items = [
    { key: "schedule", label: t("cl.app.tabSchedule"), go: () => current !== "schedule" && router.replace(`/classes/${slug}`) },
    { key: "passes", label: t("cl.ui.passes.title"), go: () => current !== "passes" && router.replace({ pathname: "/classes/passes", params: { slug } }) },
    { key: "card", label: t("cl.app.tabCard"), go: () => router.push(`/shop/${slug}`) },
  ] as const;
  return (
    <View style={[styles.bar, { borderTopColor: c.line, backgroundColor: c.bg }]} accessibilityRole="tablist">
      {items.map((i) => {
        const on = i.key === current;
        return (
          <Pressable key={i.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={i.go} style={styles.tab} testID={`studio-tab-${i.key}`}>
            <Text variant={on ? "bodyStrong" : "body"} color={on ? "fg" : "fgMuted"}>
              {i.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: hairline, paddingTop: 8, marginHorizontal: -16 },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
});
