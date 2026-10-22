import { radii } from "@ll/design-tokens";
import { Image, StyleSheet, View } from "react-native";
import { formatDistance, promoEnds } from "../lib/format";
import { Badge, SponsoredBadge, type BadgeTone } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";
import { ShopLogo, type ShopTileShop } from "./ShopTile";
import { Text } from "./Text";

export interface PromoCardProps {
  promo: { title: string; kind: string; endsAt: string | null; imageUrl?: string | null; multiplierPct?: number | null; bonusPoints?: number | null; percentOff?: number | null; body?: string | null };
  shop: ShopTileShop;
  /** Sponsored placements ALWAYS show the label (top-left above the shop row). */
  sponsored?: boolean;
  onSponsoredInfo?: () => void;
  onPress?: () => void;
  joinLabel?: string;
  onJoin?: () => void;
  variant?: "feed" | "compact";
}

function kindBadge(p: PromoCardProps["promo"]): { tone: BadgeTone; label: string } | null {
  if (p.kind === "multiplier") return { tone: "accent", label: `${p.multiplierPct ? p.multiplierPct / 100 : 2}x points` };
  if (p.kind === "bonus_points") return { tone: "accent", label: `+${p.bonusPoints ?? 0} pts` };
  if (p.kind === "discount") return { tone: "brand", label: `${p.percentOff ?? 0}% off` };
  if (p.kind === "event") return { tone: "info", label: "Event" };
  return null;
}

/** system.md § PromoCard. Same layout for organic and sponsored (no special colours). */
export function PromoCard({ promo, shop, sponsored, onSponsoredInfo, onPress, joinLabel, onJoin, variant = "feed" }: PromoCardProps) {
  const badge = kindBadge(promo);
  const ends = promoEnds(promo.endsAt);
  const a11y = [sponsored ? "Sponsored." : null, shop.name, promo.title, badge?.label, ends].filter(Boolean).join(" ");
  return (
    <Card onPress={onPress} accessibilityLabel={a11y} padded={false}>
      {promo.imageUrl && variant === "feed" ? <Image source={{ uri: promo.imageUrl }} style={styles.image} accessibilityIgnoresInvertColors /> : null}
      <View style={styles.body}>
        {sponsored ? <SponsoredBadge onPress={onSponsoredInfo} /> : null}
        <View style={styles.shopRow}>
          <ShopLogo shop={shop} size={24} />
          <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {shop.name}
          </Text>
          {shop.distanceM != null ? (
            <Text variant="caption" color="fgMuted">
              {formatDistance(shop.distanceM)}
            </Text>
          ) : null}
        </View>
        <Text variant="title" numberOfLines={2}>
          {promo.title}
        </Text>
        <View style={styles.meta}>
          {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
          {ends ? (
            <Text variant="bodySm" color="fgMuted">
              {ends}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {joinLabel && onJoin ? (
            <Button variant="tonal" size="sm" onPress={onJoin}>
              {joinLabel}
            </Button>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", aspectRatio: 16 / 9, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  body: { padding: 16, gap: 8 },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
