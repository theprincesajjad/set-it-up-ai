import { radii } from "@ll/design-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { formatMoney } from "../lib/award";
import { formatDate } from "../lib/format";
import { useTheme } from "../theme";
import { Badge } from "./Badge";
import { ShopLogo } from "./ShopTile";
import { Text } from "./Text";

/** Show-to-save card, ratio 1.586, vertical tint, live seconds clock so a screenshot can't be reused. */
export function DiscountCard({
  card,
  shop,
  memberName,
  live = true,
}: {
  card: { name: string; percentOff: number; amountOffCents: number; terms: string | null };
  shop: { name: string; vertical: string; logoUrl?: string | null };
  memberName?: string | null;
  live?: boolean;
}) {
  const { vertical } = useTheme();
  const v = vertical(shop.vertical);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [live]);
  const value = card.percentOff > 0 ? `${card.percentOff}% off` : formatMoney(card.amountOffCents) + " off";
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return (
    <View style={[styles.card, { backgroundColor: v.tint }]} accessible accessibilityLabel={`${shop.name} ${card.name}, ${value}. ${card.terms ?? ""}`}>
      <View style={styles.top}>
        <ShopLogo shop={shop} size={40} />
        <Text variant="label" rawColor={v.ink} style={{ flex: 1 }}>
          {shop.name}
        </Text>
        <Badge tone="success">Valid today</Badge>
      </View>
      <Text variant="h1" rawColor={v.ink}>
        {value}
      </Text>
      <Text variant="title" rawColor={v.ink}>
        {card.name}
      </Text>
      {card.terms ? (
        <Text variant="caption" rawColor={v.ink}>
          {card.terms}
        </Text>
      ) : null}
      {live ? (
        <View style={styles.bottom}>
          <Text variant="bodyStrong" rawColor={v.ink} style={{ flex: 1 }}>
            {memberName ?? ""}
          </Text>
          <Text variant="bodyStrong" rawColor={v.ink} tabular>
            {`${formatDate(now)} ${clock}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { aspectRatio: 1.586, borderRadius: radii.xl, padding: 20, gap: 4, justifyContent: "space-between" },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  bottom: { flexDirection: "row", alignItems: "center", gap: 8 },
});
