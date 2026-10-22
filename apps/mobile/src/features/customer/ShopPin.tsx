/**
 * Explore map pin (canvas Main.dc.html): a 36 pt white bubble with the shop's 24 pt category object (or
 * its logo photo), the lowercase name in Bricolage 700 13 and ONE italic 11 pt grey line ("5 / 8 stamps",
 * "reward ready" in accentText, or the lowercase kind of place). The marker is symmetric around the bubble
 * so the label can sit on either side. Shared by MapView.tsx and MapView.web.tsx.
 */
import type { networkApi } from "@ll/shared";
import { View } from "react-native";
import { pinSubtitle, type PinMembership } from "../../lib/explore";
import { useTheme } from "../../theme";
import { PlaceBubble, shadow, Text } from "../../ui";

export const PIN_BUBBLE = 36;
/** Room for a label on each side of the bubble. */
export const PIN_SIDE = 158;
/** Width of the marker view; the bubble's centre is its centre. */
export const PIN_WIDTH = PIN_BUBBLE + 2 * PIN_SIDE;
export const PIN_ANCHOR_X = PIN_WIDTH / 2;
export const PIN_HEIGHT = 48;

/** The selected pin is the bare 46 pt ringed bubble: the sheet below carries the name (canvas ShopSheet). */
export function ShopPin({ shop, membership, selected, bare, side = "right" }: { shop: networkApi.ShopListItemDto; membership: PinMembership | null; selected: boolean; bare?: boolean; side?: "right" | "left" }) {
  const sub = pinSubtitle(shop.merchant.vertical, membership);
  const b = selected ? 46 : PIN_BUBBLE;
  return (
    <View style={{ width: PIN_WIDTH, height: PIN_HEIGHT, justifyContent: "center" }} pointerEvents="none">
      <View style={[{ position: "absolute" }, side === "left" ? { right: PIN_ANCHOR_X - b / 2 } : { left: PIN_ANCHOR_X - b / 2 }]}>
        <PlaceBubble name={shop.merchant.name} subtitle={sub.text} accent={sub.accent} vertical={shop.merchant.vertical} photoUrl={shop.merchant.logoUrl} selected={selected} bare={bare || selected} size={PIN_BUBBLE} side={side} />
      </View>
    </View>
  );
}

export function pinLabel(shop: networkApi.ShopListItemDto, membership: PinMembership | null): string {
  return `${shop.merchant.name}, ${pinSubtitle(shop.merchant.vertical, membership).text}`;
}

/** Overlapping pins fold into a black 24 pt count capsule (canvas), centred where the bubble would be. */
export function ClusterPin({ count }: { count: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: PIN_WIDTH, height: PIN_HEIGHT, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
      <View
        style={[
          { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", backgroundColor: c.fg },
          shadow("0 2px 8px rgba(0,0,0,.18)", { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 }),
        ]}
      >
        <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }} rawColor={c.bg}>
          {String(count)}
        </Text>
      </View>
    </View>
  );
}
