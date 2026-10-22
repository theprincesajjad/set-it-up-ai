import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Check, Sparkles } from "./icons";
import { Text } from "./Text";

/** Neighbourhood perk with an N-step progress ("Visit 3 shops on Roncesvalles this month → +50 pts"). */
export function PerkCard({ headline, visited, goal, done }: { headline: string; visited: number; goal: number; done: boolean }) {
  const { c } = useTheme();
  const steps = Math.min(goal, 6);
  return (
    <View style={[styles.card, { backgroundColor: c.brandSubtle }]} accessible accessibilityLabel={`${headline}. ${visited} of ${goal} visited.${done ? " Done." : ""}`}>
      <View style={styles.row}>
        <Sparkles size={20} color={c.onBrandSubtle} />
        <Text variant="bodyStrong" rawColor={c.onBrandSubtle} style={{ flex: 1 }}>
          {headline}
        </Text>
      </View>
      <View style={styles.row}>
        {Array.from({ length: steps }, (_, i) => (
          <View key={i} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={[styles.node, { backgroundColor: i < visited ? c.brand : c.surface, borderColor: c.brand }]}>
              {i < visited ? <Check size={14} color={c.onBrand} strokeWidth={3} /> : <Text variant="caption" rawColor={c.onBrandSubtle}>{String(i + 1)}</Text>}
            </View>
            {i < steps - 1 ? <View style={[styles.bar, { backgroundColor: i < visited - 1 ? c.brand : c.surface }]} /> : null}
          </View>
        ))}
      </View>
      <Text variant="caption" rawColor={c.onBrandSubtle}>
        {done ? "Bonus earned. Nice." : `${visited} of ${goal} visited`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  node: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  bar: { flex: 1, height: 3, borderRadius: 2 },
});
