import { mix, radii, verticalCategory, verticalVisual } from "@ll/design-tokens";
import { useId } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { formatNumber } from "../lib/award";
import { useLocale } from "../lib/i18n";
import { capFirst } from "../lib/sentenceCase";
import { DISPLAY_HEAVY, useTheme } from "../theme";
import { categorySource } from "./CategoryIcon";
import { Awning } from "./Warm";
import { verticalIcon } from "./icons";
import { shadow } from "./shadow";
import { Text } from "./Text";
import { shopInitials } from "./ShopTile";
import { stampColumns } from "./StampCard";

export interface PassCardProps {
  shop: { name: string; vertical: string; logoUrl?: string | null };
  /** Second line under the name ("Roncesvalles · 3 min"). */
  subtitle?: string | null;
  /** Stamps earned (stamp programs) or the balance (points programs). */
  count: number;
  /** Stamps in a full card, or the points the next reward costs. */
  goal: number;
  mode: "stamps" | "points";
  /** "2 more for a free latte". */
  sentence?: string | null;
  /** The numeral's unit when the program is points ("pts"). */
  unit?: string | null;
  ready?: boolean;
  readyLabel?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Shrinks the card (shop page header uses the full size, lists use compact). */
  compact?: boolean;
}

/**
 * The per-trade pass (Figma 32 / 33): a gradient from the trade accent to its second colour, the awning on top, a logo tile,
 * white (light) or espresso (dark) stamps with the trade's glyph, a Fraunces numeral and the category object bottom right.
 * `useTheme().trade(vertical)` supplies the family; text stays on the left 70% where the blend is at most 30%, so contrast holds.
 */
export function PassCard({ shop, subtitle, count, goal, mode, sentence, unit, ready, readyLabel, onPress, accessibilityLabel, compact }: PassCardProps) {
  const { r, trade, isDark } = useTheme();
  const { t } = useLocale();
  const tc = trade(shop.vertical);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g = Math.max(1, goal);
  const filled = Math.min(Math.max(0, count), g);
  const ink = tc.foreground;
  const Glyph = verticalIcon(shop.vertical ? iconNameFor(shop.vertical) : "Store");
  const stamps = mode === "stamps" && g <= 20;
  const cols = g <= 10 ? 5 : stampColumns(g);
  const dot = compact ? 36 : g > 10 ? 34 : 44;
  const mid = mix(tc.accent, tc.alt, 0.3);

  const body = (
    <View style={[styles.card, shadow(isDark ? "0 8px 24px rgba(0,0,0,.45)" : "0 10px 28px -8px rgba(42,30,20,.35)"), { borderRadius: radii.sheet - 2 }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" accessibilityElementsHidden>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={tc.accent} />
            <Stop offset="0.7" stopColor={mid} />
            <Stop offset="1" stopColor={tc.alt} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
      <Awning height={12} flat />
      <View style={[styles.inner, { padding: compact ? 16 : 22, gap: compact ? 12 : 18 }]}>
        <View style={styles.head}>
          <View style={[styles.logo, { backgroundColor: isDark ? r.cardForeground : r.card }]}>
            {shop.logoUrl ? (
              <Image source={{ uri: shop.logoUrl }} style={{ width: 48, height: 48 }} accessibilityIgnoresInvertColors />
            ) : (
              <Text rawColor={tc.accent} allowFontScaling={false} style={styles.logoText}>
                {shopInitials(shop.name)}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text rawColor={ink} numberOfLines={2} style={styles.name} accessibilityRole="header">
              {shop.name}
            </Text>
            {subtitle ? (
              <Text rawColor={ink} numberOfLines={1} style={styles.sub}>
                {capFirst(subtitle)}
              </Text>
            ) : null}
          </View>
          {ready ? (
            <View style={[styles.badge, { backgroundColor: r.tileButter }]}>
              <Text variant="metaStrong" rawColor={r.tileButterForeground} numberOfLines={1}>
                {readyLabel ?? capFirst(t("sh.wallet.rewardReady"))}
              </Text>
            </View>
          ) : null}
        </View>
        {stamps ? (
          <View style={styles.grid}>
            {Array.from({ length: g }, (_, i) => {
              const on = i < filled;
              return (
                <View key={i} style={{ width: `${100 / cols}%`, alignItems: "center", paddingVertical: 4 }}>
                  <View
                    style={[
                      { width: dot, height: dot, borderRadius: dot / 2, alignItems: "center", justifyContent: "center" },
                      on ? { backgroundColor: ink } : { borderWidth: 1.5, borderStyle: "dashed", borderColor: ink, opacity: 0.6 },
                    ]}
                  >
                    {on ? <Glyph size={Math.round(dot * 0.46)} color={tc.accent} strokeWidth={2} /> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : mode === "points" ? (
          <View style={styles.track}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: ink, opacity: 0.3 }]} />
            <View style={{ width: `${Math.round((100 * filled) / g)}%`, height: 8, borderRadius: 8, backgroundColor: ink }} />
          </View>
        ) : null}
        <View style={styles.foot}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <Text rawColor={ink} tabular style={[styles.numeral, compact ? { fontSize: 40, lineHeight: 46 } : null]}>
                {mode === "stamps" ? `${filled} / ${g}` : formatNumber(count)}
              </Text>
              {mode === "points" && unit ? (
                <Text rawColor={ink} style={styles.unit}>
                  {unit}
                </Text>
              ) : null}
            </View>
            {sentence ? (
              <Text rawColor={ink} style={styles.sentence} numberOfLines={2}>
                {sentence}
              </Text>
            ) : null}
          </View>
          <Image source={categorySource(shopCategory(shop.vertical))} style={{ width: compact ? 56 : 72, height: compact ? 56 : 72 }} resizeMode="contain" accessibilityIgnoresInvertColors accessibilityElementsHidden />
        </View>
      </View>
    </View>
  );
  if (!onPress) return <View accessible accessibilityLabel={accessibilityLabel}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => ({ transform: pressed ? [{ scale: 0.985 }] : undefined })}>
      {body}
    </Pressable>
  );
}

const shopCategory = (v: string) => verticalCategory(v);
const iconNameFor = (v: string) => verticalVisual(v).iconComponent;

const styles = StyleSheet.create({
  card: { overflow: "hidden" },
  inner: {},
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoText: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  name: { fontSize: 19, lineHeight: 24, fontWeight: "700" },
  sub: { fontSize: 13, lineHeight: 17, opacity: 0.92 },
  badge: { paddingHorizontal: 12, minHeight: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  track: { height: 8, borderRadius: 8, overflow: "hidden" },
  foot: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  numeral: { fontFamily: DISPLAY_HEAVY, fontSize: 54, lineHeight: 60, letterSpacing: -1.5 },
  unit: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  sentence: { fontSize: 14, lineHeight: 19, fontWeight: "500" },
});
