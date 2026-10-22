/**
 * Explore map pin (references.md § 1, Corner): 36 px round logo with a white
 * ring (52 + short name when selected); a marigold balance badge for my shops and
 * a pine dot for a live promo. Shared by MapView.tsx (native) and MapView.web.tsx.
 */
import type { networkApi } from "@ll/shared";
import { StyleSheet, View } from "react-native";
import { formatNumber } from "../../lib/award";
import { useTheme } from "../../theme";
import { ShopLogo, Text } from "../../ui";

function shortLabel(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

export function ShopPin({ shop, selected }: { shop: networkApi.ShopListItemDto; selected: boolean }) {
  const { c } = useTheme();
  const size = selected ? 52 : 36;
  return (
    <View style={{ alignItems: "center", width: 96 }}>
      <View style={[styles.ring, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }, selected ? { borderColor: c.brand } : null]}>
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
          <ShopLogo shop={shop.merchant} size={size} />
        </View>
        {shop.isMember && shop.myBalance != null ? (
          <View style={[styles.badge, { backgroundColor: c.accent }]}>
            <Text variant="caption" rawColor={c.onAccent} tabular style={{ fontFamily: "Figtree_700Bold" }}>
              {formatNumber(shop.myBalance)}
            </Text>
          </View>
        ) : null}
        {shop.hasPromo ? <View style={[styles.promoDot, { backgroundColor: c.brand }]} /> : null}
      </View>
      {/* Only the selected pin carries its name, so a busy strip stays readable (Blackbird); the peek card names the rest. */}
      {selected ? (
        <View style={[styles.label, { backgroundColor: c.brand }]}>
          <Text variant="caption" rawColor={c.onBrand} numberOfLines={1}>
            {shortLabel(shop.merchant.name)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -6, right: -10, minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  promoDot: { position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#FFFFFF" },
  label: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, maxWidth: 96 },
});
