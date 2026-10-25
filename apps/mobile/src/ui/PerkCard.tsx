import { StyleSheet, View } from "react-native";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";
import { Text } from "./Text";

/** Neighbourhood perk: one line + N dots (accent = visited, they earn points). Hairline card. */
export function PerkCard({ headline, visited, goal, done }: { headline: string; visited: number; goal: number; done: boolean }) {
  const { c } = useTheme();
  const { t } = useLocale();
  const steps = Math.min(goal, 8);
  return (
    <View style={[styles.card, { borderColor: c.line }]} accessible accessibilityLabel={t(done ? "ui.perkA11yDone" : "ui.perkA11y", { headline, visited, goal })}>
      <Text variant="bodyStrong">{headline}</Text>
      <View style={styles.row}>
        {Array.from({ length: steps }, (_, i) => (
          <View key={i} style={[styles.node, i < visited ? { backgroundColor: c.accent } : { borderColor: c.lineStrong, borderWidth: 1.5 }]} />
        ))}
        <Text variant="meta" color="fgMuted" style={{ marginStart: 6 }}>
          {done ? t("ui.perkDone") : t("ui.perkVisited", { visited, goal })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth * 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  node: { width: 12, height: 12, borderRadius: 6 },
});
