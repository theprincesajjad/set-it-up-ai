import { radii } from "@ll/design-tokens";
import { Image, StyleSheet, View } from "react-native";
import { unitWord, type Locale } from "@ll/shared";
import { formatDistanceL, promoEndsL } from "../lib/formatL";
import { useLocale } from "../lib/i18n";
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
  /** On the shop's own page the shop row is noise (polish-audit M17). */
  hideShop?: boolean;
  /** The program's word: a 2× promo on a stamp card is "2× stamps", not points (polish-audit M18). */
  terminology?: string | null;
}

/** Accent only when the promo is about points (2x, +50 pts). */
function kindBadge(p: PromoCardProps["promo"], terminology: string | null | undefined, locale: Locale, t: ReturnType<typeof useLocale>["t"]): { tone: BadgeTone; label: string } | null {
  const word = unitWord(locale, terminology && terminology !== "points" ? terminology : "points");
  if (p.kind === "multiplier") return { tone: "accent", label: `${p.multiplierPct ? p.multiplierPct / 100 : 2}× ${word}` };
  if (p.kind === "bonus_points") return { tone: "accent", label: !terminology || terminology === "points" ? t("ui.promoPts", { n: p.bonusPoints ?? 0 }) : `+${p.bonusPoints ?? 0} ${word}` };
  if (p.kind === "discount") return { tone: "neutral", label: t("ui.promoOff", { n: p.percentOff ?? 0 }) };
  if (p.kind === "event") return { tone: "neutral", label: t("rc.ca.type") };
  return null;
}

/** Hairline card; same layout for organic and sponsored. */
export function PromoCard({ promo, shop, sponsored, onSponsoredInfo, onPress, joinLabel, onJoin, variant = "feed", hideShop, terminology }: PromoCardProps) {
  const L = useLocale();
  const { t, locale } = L;
  const badge = kindBadge(promo, terminology, locale, t);
  const ends = promoEndsL(L, promo.endsAt);
  const a11y = [sponsored ? `${t("ui.sponsored")}.` : null, shop.name, promo.title, badge?.label, ends].filter(Boolean).join(" ");
  return (
    <Card onPress={onPress} accessibilityLabel={a11y} padded={false}>
      {promo.imageUrl && variant === "feed" ? <Image source={{ uri: promo.imageUrl }} style={styles.image} accessibilityIgnoresInvertColors /> : null}
      <View style={styles.body}>
        {sponsored ? <SponsoredBadge onPress={onSponsoredInfo} /> : null}
        {hideShop ? null : (
        <View style={styles.shopRow}>
          <ShopLogo shop={shop} size={22} />
          <Text variant="metaStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {shop.name}
          </Text>
          {shop.distanceM != null ? (
            <Text variant="meta" color="fgMuted">
              {formatDistanceL(L, shop.distanceM)}
            </Text>
          ) : null}
        </View>
        )}
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
