import { radii } from "@ll/design-tokens";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { formatNumber, unitLabel } from "../lib/award";
import { formatDistance } from "../lib/format";
import { useTheme } from "../theme";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { BellOff, Gift, verticalIcon } from "./icons";
import { Text } from "./Text";

export interface ShopTileShop {
  name: string;
  vertical: string;
  logoUrl?: string | null;
  /** Merchant brand colour; tints the initials fallback when there is no logo. */
  brandColor?: string | null;
  coverUrl?: string | null;
  neighbourhood?: string | null;
  distanceM?: number | null;
}

/**
 * Logo, or coloured initials when the shop has no logo (most pilot shops):
 * brand colour fill with whichever of white / ink reads better, or the
 * vertical tint + accent when the shop has no brand colour either.
 */
export function ShopLogo({ shop, size = 48, round = false }: { shop: Pick<ShopTileShop, "logoUrl" | "vertical" | "name" | "brandColor">; size?: number; round?: boolean }) {
  const { vertical } = useTheme();
  const radius = round ? size / 2 : size <= 28 ? radii.xs : size >= 72 ? radii.lg : radii.md;
  if (shop.logoUrl) {
    return <Image source={{ uri: shop.logoUrl }} style={{ width: size, height: size, borderRadius: radius }} accessibilityIgnoresInvertColors accessibilityLabel={`${shop.name} logo`} />;
  }
  const v = vertical(shop.vertical);
  const brand = shop.brandColor && /^#[0-9a-f]{6}$/i.test(shop.brandColor) ? shop.brandColor : null;
  const bg = brand ?? v.tint;
  const fg = brand ? readableOn(brand) : v.accent;
  const letters = shopInitials(shop.name, size < 32 ? 1 : 2);
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: radius, backgroundColor: bg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text rawColor={fg} style={{ fontFamily: "Figtree_700Bold", fontSize: Math.round(size * (letters.length > 1 ? 0.38 : 0.46)), lineHeight: Math.round(size * 0.5), letterSpacing: 0.5 }} allowFontScaling={false}>
        {letters}
      </Text>
    </View>
  );
}

const SKIP = new Set(["the", "and", "&", "of", "co", "co.", "inc", "inc.", "ltd", "ltd."]);

/** "Pinecone Coffee Co." → "PC", "The Copper Kettle Pub" → "CK", "Nonna's Table" → "NT". */
export function shopInitials(name: string, max = 2): string {
  const words = name.split(/[\s-]+/).filter((w) => w && !SKIP.has(w.toLowerCase()));
  const letters = (words.length ? words : name.split(/\s+/)).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").charAt(0)).filter(Boolean);
  return letters.slice(0, max).join("").toUpperCase() || "?";
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** White or ink (#1F1B16), whichever has the higher contrast on `hex`. */
export function readableOn(hex: string): string {
  const l = luminance(hex);
  const white = 1.05 / (l + 0.05);
  const ink = (l + 0.05) / (luminance("#1F1B16") + 0.05);
  return white >= ink ? "#FFFFFF" : "#1F1B16";
}

export interface ShopTileProps {
  shop: ShopTileShop;
  variant: "wallet" | "list" | "compact" | "hero";
  balance?: { value: number; terminology: string } | null;
  subtitle?: string | null;
  openLabel?: { open: boolean; label: string } | null;
  rewardReady?: boolean;
  muted?: boolean;
  onPress?: () => void;
  selected?: boolean;
}

/** system.md § ShopTile. */
export function ShopTile({ shop, variant, balance, subtitle, openLabel, rewardReady, muted, onPress, selected }: ShopTileProps) {
  const { c, vertical } = useTheme();
  if (variant === "hero") {
    const v = vertical(shop.vertical);
    const Icon = verticalIcon(v.icon);
    // No cover photo: a soft wash of the shop's brand colour ties the hero to its initials logo.
    const brand = shop.brandColor && /^#[0-9a-f]{6}$/i.test(shop.brandColor) ? shop.brandColor : null;
    return (
      <View>
        <View style={[styles.cover, { backgroundColor: brand ? `${brand}24` : v.tint }]}>
          {shop.coverUrl ? (
            <Image source={{ uri: shop.coverUrl }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          ) : (
            <Icon size={96} color={brand ?? v.accent} style={{ opacity: brand ? 0.22 : 0.3 }} />
          )}
        </View>
        <View style={styles.heroLogo}>
          <View style={[styles.heroLogoRing, { backgroundColor: c.canvas }]}>
            <ShopLogo shop={shop} size={72} />
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text variant="h2" accessibilityRole="header" style={{ flexShrink: 1 }}>
            {shop.name}
          </Text>
          {muted ? <BellOff size={16} color={c.fgMuted} accessibilityLabel="Muted" /> : null}
        </View>
      </View>
    );
  }

  const size = variant === "compact" ? 40 : 48;
  const nameRow = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text variant={variant === "wallet" ? "title" : "bodyStrong"} numberOfLines={1} style={{ flexShrink: 1 }}>
        {shop.name}
      </Text>
      {muted ? <BellOff size={16} color={c.fgMuted} /> : null}
    </View>
  );
  const sub = subtitle ?? [shop.neighbourhood, formatDistance(shop.distanceM)].filter(Boolean).join(" · ");
  const a11y = [
    shop.name,
    balance ? `${formatNumber(balance.value)} ${balance.terminology}` : null,
    rewardReady ? "Reward ready" : null,
    sub,
    openLabel?.label,
    muted ? "Muted" : null,
  ]
    .filter(Boolean)
    .join(". ");

  if (variant === "wallet") {
    return (
      <Card onPress={onPress} accessibilityLabel={a11y} accentEdge={rewardReady} padded={false}>
        <View style={[styles.walletRow, { minHeight: 88 }]}>
          <ShopLogo shop={shop} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            {nameRow}
            {rewardReady ? (
              <Badge tone="accent" icon={Gift}>
                Reward ready
              </Badge>
            ) : sub ? (
              <Text variant="bodySm" color="fgMuted" numberOfLines={2}>
                {sub}
              </Text>
            ) : null}
          </View>
          {balance ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="h3" color="fgBrand" tabular style={{ fontFamily: "Figtree_700Bold" }}>
                {formatNumber(balance.value)}
              </Text>
              <Text variant="caption" color="fgMuted">
                {unitLabel(balance.terminology, balance.value)}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>
    );
  }

  const row = (
    <View style={[styles.listRow, { minHeight: variant === "compact" ? 56 : 64 }, selected ? { backgroundColor: c.brandSubtle } : null]}>
      <ShopLogo shop={shop} size={size} />
      <View style={{ flex: 1, gap: 2 }}>
        {nameRow}
        {sub ? (
          <Text variant="bodySm" color="fgMuted" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
        {openLabel ? (
          <Text variant="bodySm" color={openLabel.open ? "onSuccessSubtle" : "fgMuted"}>
            {openLabel.label}
          </Text>
        ) : null}
      </View>
      {balance ? (
        <Text variant="bodyStrong" color="fgBrand" tabular>
          {`${formatNumber(balance.value)} ${unitLabel(balance.terminology, balance.value)}`}
        </Text>
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}>
      {row}
    </Pressable>
  ) : (
    row
  );
}

const styles = StyleSheet.create({
  logo: { borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  walletRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderRadius: radii.md },
  cover: { aspectRatio: 16 / 9, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  heroLogo: { marginTop: -40, paddingHorizontal: 16 },
  heroLogoRing: { alignSelf: "flex-start", padding: 4, borderRadius: radii.lg },
});
