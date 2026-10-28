import { Image, Pressable, StyleSheet, View } from "react-native";
import { formatNumber } from "../lib/award";
import { placeKindLabel } from "@ll/shared";
import { formatDistanceL, unitLabelL } from "../lib/formatL";
import { useLocale } from "../lib/i18n";
import { typo, useTheme } from "../theme";
import { CategoryIcon } from "./CategoryIcon";
import { BellOff } from "./icons";
import { CountUp } from "./motion";
import { Text } from "./Text";

export interface ShopTileShop {
  name: string;
  vertical: string;
  logoUrl?: string | null;
  /** Merchant brand colour; shown ONLY inside the shop's own avatar. */
  brandColor?: string | null;
  coverUrl?: string | null;
  neighbourhood?: string | null;
  distanceM?: number | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A shop's avatar (round): its logo; else initials on its brand colour; else
 * the category object (cup, croissant...) on grey. The brand colour lives here
 * and nowhere else (foundations § Colour, "Shop identity").
 */
export function ShopLogo({ shop, size = 44, round = true }: { shop: Pick<ShopTileShop, "logoUrl" | "vertical" | "name" | "brandColor">; size?: number; round?: boolean }) {
  const { c, trade } = useTheme();
  const { t } = useLocale();
  const radius = round ? size / 2 : Math.round(size * 0.28);
  if (shop.logoUrl) {
    return <Image source={{ uri: shop.logoUrl }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.bgSubtle }} accessibilityIgnoresInvertColors accessibilityLabel={t("ui.logoOf", { shop: shop.name })} />;
  }
  const brand = shop.brandColor && HEX.test(shop.brandColor) ? shop.brandColor : null;
  if (!brand) {
    return (
      <View style={[styles.logo, { width: size, height: size, borderRadius: radius, backgroundColor: trade(shop.vertical).soft }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CategoryIcon vertical={shop.vertical} size={Math.round(size * 0.62)} />
      </View>
    );
  }
  const letters = shopInitials(shop.name, size < 32 ? 1 : 2);
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: radius, backgroundColor: brand }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text
        rawColor={readableOn(brand)}
        allowFontScaling={false}
        style={[typo("displayNumber"), { fontSize: Math.round(size * (letters.length > 1 ? 0.36 : 0.44)), lineHeight: Math.round(size * 0.5), letterSpacing: 0 }]}
      >
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

/** White or ink, whichever has the higher contrast on `hex`. */
export function readableOn(hex: string): string {
  const l = luminance(hex);
  const white = 1.05 / (l + 0.05);
  const ink = (l + 0.05) / (luminance("#0B0B0C") + 0.05);
  return white >= ink ? "#FFFFFF" : "#0B0B0C";
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
  divider?: boolean;
}

/**
 * Shop rows (Corner "your places"): avatar, bold name, one grey line, the
 * balance right-aligned in accent. `hero` is the header of the shop page / sheet:
 * avatar, name in the display face, italic kind of place.
 */
export function ShopTile({ shop, variant, balance, subtitle, rewardReady, muted, onPress, selected, divider = true }: ShopTileProps) {
  const { c } = useTheme();
  const L = useLocale();
  const { t } = L;
  if (variant === "hero") {
    return (
      <View style={styles.hero}>
        <ShopLogo shop={shop} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {/* Shop sheet / page title: system 22/600, never heavy (polish-audit M13). */}
            <Text variant="title" accessibilityRole="header" numberOfLines={2} style={{ flexShrink: 1 }}>
              {shop.name}
            </Text>
            {muted ? <BellOff size={16} color={c.fgMuted} accessibilityLabel={t("ui.muted")} /> : null}
          </View>
          <Text variant="placeSubtitle" color="fgMuted" numberOfLines={1}>
            {subtitle ?? placeKindLabel(L.locale, shop.vertical)}
          </Text>
        </View>
      </View>
    );
  }

  const size = variant === "compact" ? 36 : 44;
  const sub = rewardReady ? (subtitle ?? t("sh.wallet.rewardReady")) : (subtitle ?? [shop.neighbourhood, formatDistanceL(L, shop.distanceM)].filter(Boolean).join(" · "));
  const a11y = [shop.name, balance ? `${formatNumber(balance.value)} ${balance.terminology}` : null, rewardReady ? t("sh.nt.reward_ready") : null, sub, muted ? t("ui.muted") : null].filter(Boolean).join(". ");
  const zero = !!balance && balance.value === 0;
  const row = (pressed: boolean) => (
    <View style={[styles.row, { minHeight: variant === "compact" ? 56 : 68 }, pressed || selected ? { backgroundColor: c.bgSubtle } : null]}>
      <ShopLogo shop={shop} size={size} />
      <View style={{ flex: 1, gap: 2 }}>
        {/* Name and balance share one baseline (polish-audit S11): "Nonna's Table ······ 1,610 pts". */}
        <View style={styles.titleLine}>
          <Text variant="placeName" numberOfLines={1} style={{ flexShrink: 1 }}>
            {shop.name}
          </Text>
          {muted ? <BellOff size={13} color={c.fgMuted} /> : null}
          <View style={{ flex: 1 }} />
          {balance ? (
            <Text variant="bodyStrong" color={zero ? "fgMuted" : "accentText"} tabular numberOfLines={1}>
              <CountUp value={balance.value} format={formatNumber} variant="headline" color={zero ? "fgMuted" : "accentText"} />
              <Text variant="meta" color="fgMuted">{` ${unitLabelL(L, balance.terminology, balance.value)}`}</Text>
            </Text>
          ) : null}
        </View>
        {sub ? (
          <Text variant="meta" color={rewardReady ? "accentText" : "fgMuted"} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {divider ? <View style={[styles.divider, { backgroundColor: c.line, start: size + 12 }]} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} unstable_pressDelay={40}>
      {({ pressed }) => row(pressed)}
    </Pressable>
  ) : (
    row(false)
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  divider: { position: "absolute", end: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleLine: { flexDirection: "row", alignItems: "baseline", gap: 6 },
});
