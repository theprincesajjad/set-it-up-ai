/** Cash / card choice at the counter. With dual pricing on, each tile shows its own price and the cash saving. */
import { radii } from "@ll/design-tokens";
import type { restaurantApi } from "@ll/shared";
import { Pressable, StyleSheet, View } from "react-native";
import { tenderPrices } from "../../lib/kitchen";
import { useLocale } from "../../lib/i18n";
import { disp, useTheme } from "../../theme";
import { CreditCard, Text } from "../../ui";
import { hairline } from "../../ui/shadow";

export function TenderChoice({ subtotalCents, cashDiscountBps, value, onChange }: { subtotalCents: number; cashDiscountBps: number; value: restaurantApi.Tender; onChange: (t: restaurantApi.Tender) => void }) {
  const { c } = useTheme();
  const { t, money } = useLocale();
  const p = tenderPrices(subtotalCents, cashDiscountBps);
  const dual = cashDiscountBps > 0;
  const tiles = [
    { id: "cash" as const, label: t("tender.cash"), price: p.cash, note: dual ? t("tender.saves", { amount: money(p.saved) }) : null },
    { id: "card" as const, label: t("tender.card"), price: p.card, note: dual ? t("tender.cardPrice") : null },
  ];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t("tender.title")} style={styles.row}>
      {tiles.map((x) => {
        const on = value === x.id;
        return (
          <Pressable
            key={x.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${x.label} ${money(x.price)}${x.note ? `, ${x.note}` : ""}`}
            onPress={() => onChange(x.id)}
            style={({ pressed }) => [styles.tile, { backgroundColor: on ? c.fg : c.bg, borderColor: on ? c.fg : c.line, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={styles.top}>
              {x.id === "card" ? <CreditCard size={18} color={on ? c.bg : c.fgMuted} /> : null}
              <Text variant="bodyStrong" rawColor={on ? c.bg : c.fg}>
                {x.label}
              </Text>
            </View>
            <Text style={[disp(28, 800, 32), { fontVariant: ["tabular-nums"] }]} rawColor={on ? c.bg : c.fg}>
              {money(x.price)}
            </Text>
            <Text variant="meta" rawColor={on ? c.bg : c.fgMuted} numberOfLines={1}>
              {x.note ?? " "}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, minHeight: 112, borderRadius: radii.card, borderWidth: hairline * 2, padding: 14, gap: 4, justifyContent: "space-between" },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
});
