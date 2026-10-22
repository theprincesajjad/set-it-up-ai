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
  /** Sponsored placements ALWAYS show the label. */
  sponsored?: boolean;
  onSponsoredInfo?: () => void;
  onPress?: () => void;
  joinLabel?: string;
  onJoin?: () => void;
  variant?: "feed" | "compact";
}

/** Accent only when the promo is about points (2x, +50 pts). */
function kindBadge(p: PromoCardProps["promo"]): { tone: BadgeTone; label: string } | null {
  if (p.kind === "multiplier") return { tone: "accent", label: `${p.multiplierPct ? p.multiplierPct / 100 : 2}× points` };
  if (p.kind === "bonus_points") return { tone: "accent", label: `+${p.bonusPoints ?? 0} pts` };
  if (p.kind === "discount") return { tone: "neutral", label: `${p.percentOff ?? 0}% off` };
  if (p.kind === "event") return { tone: "neutral", label: "Event" };
  return null;
}

/** Hairline card; same layout for organic and sponsored. */
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
          <ShopLogo shop={shop} size={22} />
          <Text variant="metaStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {shop.name}
          </Text>
          {shop.distanceM != null ? (
            <Text variant="meta" color="fgMuted">
              {formatDistance(shop.distanceM)}
            </Text>
          ) : null}
        </View>
        <Text variant="headline" numberOfLines={2}>
          {promo.title}
        </Text>
        <View style={styles.meta}>
          {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
          {ends ? (
            <Text variant="meta" color="fgMuted">
              {ends}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {joinLabel && onJoin ? (
            <Button variant="secondary" size="sm" onPress={onJoin}>
              {joinLabel}
            </Button>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", aspectRatio: 16 / 9, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card },
  body: { padding: 16, gap: 6 },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
