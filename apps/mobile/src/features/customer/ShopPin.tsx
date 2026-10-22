/**
 * Explore map pin (foundations § "Places are objects, not markers"): a white
 * bubble with the shop's category object (or its logo photo), the name in
 * bold black and ONE italic grey line ("7 / 10 stamps", "reward ready" in
 * accent, or the lowercase kind of place). Shared by MapView.tsx and MapView.web.tsx.
 */
import type { networkApi } from "@ll/shared";
import { View } from "react-native";
import { pinSubtitle, type PinMembership } from "../../lib/explore";
import { shadows } from "@ll/design-tokens";
import { useTheme } from "../../theme";
import { PlaceBubble, Text } from "../../ui";

/** Width of the marker view; the bubble's centre sits PIN_ANCHOR_X px from its left edge. */
export const PIN_WIDTH = 200;
export const PIN_BUBBLE = 40;
export const PIN_ANCHOR_X = PIN_BUBBLE / 2;

export function ShopPin({ shop, membership, selected, bare }: { shop: networkApi.ShopListItemDto; membership: PinMembership | null; selected: boolean; bare?: boolean }) {
  const sub = pinSubtitle(shop.merchant.vertical, membership);
  return (
    <View style={{ width: PIN_WIDTH, paddingLeft: selected ? 0 : 4 }} pointerEvents="none">
      <View style={{ marginLeft: selected ? -4 : 0 }}>
        <PlaceBubble name={shop.merchant.name} subtitle={sub.text} accent={sub.accent} vertical={shop.merchant.vertical} photoUrl={shop.merchant.logoUrl} selected={selected} bare={bare && !selected} size={PIN_BUBBLE} />
      </View>
    </View>
  );
}

export function pinLabel(shop: networkApi.ShopListItemDto, membership: PinMembership | null): string {
  return `${shop.merchant.name}, ${pinSubtitle(shop.merchant.vertical, membership).text}`;
}

/**
 * Overlapping pins fold into a black count capsule, centred where the bubble would be: 32 pt (the pin's own
 * scale; it was 24, too small to hit, polish-audit M11). The marker around it is the full 40 x 200 pin.
 */
export function ClusterPin({ count }: { count: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: PIN_WIDTH, height: PIN_BUBBLE, justifyContent: "center" }} pointerEvents="none">
      <View style={[{ position: "absolute", left: PIN_ANCHOR_X - 16, minWidth: 32, height: 32, borderRadius: 16, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", backgroundColor: c.fg, borderWidth: 2, borderColor: c.bg }, shadows.float.native]}>
        <Text variant="metaStrong" rawColor={c.bg} tabular style={{ fontWeight: "700" }}>
          {String(count)}
        </Text>
      </View>
    </View>
  );
}
