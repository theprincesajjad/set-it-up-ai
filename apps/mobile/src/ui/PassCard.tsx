import { mix, radii, verticalCategory, verticalVisual } from "@ll/design-tokens";
import { useId, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { formatNumber } from "../lib/award";
import { useLocale } from "../lib/i18n";
import { capFirst } from "../lib/sentenceCase";
import { DISPLAY_HEAVY, ThemeScope, useTheme } from "../theme";
import { Glass } from "./Glass";
import { categorySource } from "./CategoryIcon";
import { Awning } from "./Warm";
import { verticalIcon } from "./icons";
import { shadow } from "./shadow";
import { Text } from "./Text";
import { shopInitials } from "./ShopTile";
import { stampColumns } from "./StampCard";

export interface PassCardProps {
  /** `themeStyle`: the shop's own look (MerchantBriefDto); a Warm shop keeps its Warm pass inside the Clear app, and vice versa. */
  shop: { name: string; vertical: string; logoUrl?: string | null; themeStyle?: "clear" | "warm" | null };
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
export function PassCard(props: PassCardProps) {
  const { style, scheme } = useTheme();
  const own = props.shop.themeStyle;
  // Customer pages wear the shop's look, light (docs/design/v3.2-clear-build.md section 1).
  if (own && own !== style) {
    return (
      <ThemeScope scheme={own === "clear" ? "light" : scheme} style={own}>
        <PassCardBody {...props} />
      </ThemeScope>
    );
  }
  return <PassCardBody {...props} />;
}

function PassCardBody(props: PassCardProps) {
  const { isClear } = useTheme();
  return isClear ? <ClearPassCard {...props} /> : <WarmPassCard {...props} />;
}

/**
 * Clear pass (mock `?s=pass`, audit #24): Apple Wallet layout in strong glass over the shop's colour. 40 mark r10, the name and a
 * second line, a small badge; stamps 5 across at 54 with a 12 gap (filled: white with the trade glyph; next: an ink ring with a
 * dot; empty: a faint ring); a hairline, then Wallet fields with 11/16 caps labels. Padding 20, radius 30, no gradient.
 */
function ClearPassCard({ shop, subtitle, count, goal, mode, sentence, unit, ready, readyLabel, onPress, accessibilityLabel, compact }: PassCardProps) {
  const { r, x, trade, isDark } = useTheme();
  const { t } = useLocale();
  const tc = trade(shop.vertical);
  const g = Math.max(1, goal);
  const filled = Math.min(Math.max(0, count), g);
  const Glyph = verticalIcon(shop.vertical ? iconNameFor(shop.vertical) : "Store");
  const stamps = mode === "stamps" && g <= 20;
  const cols = g <= 10 ? 5 : stampColumns(g);
  // 318 of stamp row inside 358 - 2 x 20; more columns shrink the circle, the 12 gap stays.
  const [rowW, setRowW] = useState(318);
  const dot = Math.max(28, Math.floor((rowW - (cols - 1) * 12) / cols));
  const ring = isDark ? "rgba(255,255,255,0.28)" : "rgba(60,40,30,0.28)";
  const label = { fontSize: 11, lineHeight: 16, fontWeight: "600", letterSpacing: 0.44, textTransform: "uppercase" } as const;
  const body = (
    <Glass variant="strong" radius={30} style={{ padding: compact ? 16 : 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 16 }}>
        <View style={{ width: 40, height: 40, borderRadius: 10, borderCurve: "continuous", backgroundColor: tc.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {shop.logoUrl ? (
            <Image source={{ uri: shop.logoUrl }} style={{ width: 40, height: 40 }} accessibilityIgnoresInvertColors />
          ) : (
            <Text rawColor={tc.foreground} allowFontScaling={false} style={{ fontSize: 14, lineHeight: 20, fontWeight: "600" }}>
              {shopInitials(shop.name).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} accessibilityRole="header" style={{ fontSize: 16, lineHeight: 20, fontWeight: "600", letterSpacing: -0.22 }}>
            {shop.name}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} color="fgMuted" style={{ fontSize: 13, lineHeight: 20 }}>
              {capFirst(subtitle)}
            </Text>
          ) : null}
        </View>
        {ready ? (
          <View style={{ height: 20, borderRadius: 8, paddingHorizontal: 8, justifyContent: "center", backgroundColor: x.successSoft }}>
            <Text rawColor={r.successText} numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: "500" }}>
              {readyLabel ?? capFirst(t("sh.wallet.rewardReady"))}
            </Text>
          </View>
        ) : mode === "stamps" && g - filled > 0 ? (
          <View style={{ height: 20, borderRadius: 8, paddingHorizontal: 8, justifyContent: "center", backgroundColor: r.muted }}>
            <Text tabular numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: "500" }}>{t("ui.stampToGo", { n: g - filled })}</Text>
          </View>
        ) : null}
      </View>
      {stamps ? (
        <View onLayout={(e) => setRowW(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingBottom: 16 }}>
          {Array.from({ length: g }, (_, i) => {
            const on = i < filled;
            const next = i === filled;
            return (
              <View
                key={i}
                style={[
                  { width: dot, height: dot, borderRadius: dot / 2, alignItems: "center", justifyContent: "center" },
                  on
                    ? ({ backgroundColor: isDark ? "rgba(255,255,255,0.92)" : "#FFFFFF", boxShadow: "0 2px 6px rgba(40,20,10,0.25)" } as object)
                    : next
                      ? { borderWidth: 1.5, borderColor: r.foreground }
                      : { borderWidth: 1.5, borderColor: ring },
                ]}
              >
                {on ? <Glyph size={Math.round(dot * 0.37)} color={isDark ? "#5A3A24" : tc.accent} strokeWidth={1.8} /> : next ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.foreground }} /> : null}
              </View>
            );
          })}
        </View>
      ) : mode === "points" ? (
        <View style={{ height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 16, backgroundColor: r.muted }}>
          <View style={{ width: `${Math.round((100 * filled) / g)}%`, height: 8, borderRadius: 4, backgroundColor: r.foreground }} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 16, paddingTop: 16, boxShadow: `inset 0 1px 0 ${r.border}` } as object}>
        <View>
          <Text color="fgMuted" style={label}>{t(mode === "stamps" ? "sh.n.unitStamps" : "sh.n.unitPoints")}</Text>
          <Text tabular style={{ fontSize: 24, lineHeight: 32, fontWeight: "600", letterSpacing: -0.48 }}>
            {mode === "stamps" ? `${filled} / ${g}` : `${formatNumber(count)}${unit ? ` ${unit}` : ""}`}
          </Text>
        </View>
        {sentence ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text color="fgMuted" style={label}>{t("pass.hero.next")}</Text>
            <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: "500", paddingTop: 6 }}>
              {capFirst(sentence)}
            </Text>
          </View>
        ) : null}
      </View>
    </Glass>
  );
  if (!onPress) return <View accessible accessibilityLabel={accessibilityLabel}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => ({ transform: pressed ? [{ scale: 0.985 }] : undefined })}>
      {body}
    </Pressable>
  );
}

function WarmPassCard({ shop, subtitle, count, goal, mode, sentence, unit, ready, readyLabel, onPress, accessibilityLabel, compact }: PassCardProps) {
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
