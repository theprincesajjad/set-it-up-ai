import { radii, shadows, shadowsDarkCss, type TileName } from "@ll/design-tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { DISPLAY_HEAVY, useTheme } from "../theme";
import { haptic } from "./haptics";
import type { LucideIcon } from "./icons";
import { shadow } from "./shadow";
import { Text } from "./Text";
import { capFirst } from "../lib/sentenceCase";

/**
 * Main Street Warm building blocks (docs/design/v3.1-warm.md): the awning stripe, coloured IconTiles, pastel tiles, action pills.
 * Colours come from the theme roles only (`r.tile*`, `r.trade*`, `r.primary`), so light, warm dark and every trade follow.
 */

export type TileTone = TileName | "trade" | "primary";

/** Fill + deep text for a tile tone. `trade` is the shop's own family; `primary` is terracotta on its soft tint. */
export function useTileColors(tone: TileTone, vertical?: string | null): { bg: string; fg: string } {
  const { r, x, trade, isClear } = useTheme();
  // Clear: trade colour only on icon tiles (a 14% tint with the trade glyph); every other tile is one neutral, so no pastel means anything.
  if (isClear) {
    if (tone === "trade" || vertical) {
      const t = trade(vertical);
      return { bg: t.soft, fg: t.accent };
    }
    return { bg: x.tile, fg: x.tileForeground };
  }
  if (tone === "trade") {
    const t = trade(vertical);
    return { bg: t.soft, fg: t.deep };
  }
  if (tone === "primary") return { bg: r.tilePeach, fg: r.tilePeachForeground };
  const cap = tone.charAt(0).toUpperCase() + tone.slice(1);
  const roles = r as unknown as Record<string, string>;
  return { bg: roles[`tile${cap}`]!, fg: roles[`tile${cap}Foreground`]! };
}

/** A Lucide glyph in a coloured rounded tile (never emoji). */
export function IconTile({ icon: Icon, tone = "peach", vertical, size = 44, hidden = true }: { icon: LucideIcon; tone?: TileTone; vertical?: string | null; size?: number; hidden?: boolean }) {
  const { bg, fg } = useTileColors(tone, vertical);
  const { isClear } = useTheme();
  // Clear radii: 32 tile r10, 36 tile r12 (audit #37).
  const radius = isClear ? (size <= 32 ? 10 : 12) : Math.round(size * 0.3);
  return (
    <View
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={{ width: size, height: size, borderRadius: radius, borderCurve: "continuous", backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
    >
      <Icon size={isClear ? (size <= 32 ? 16 : 18) : Math.round(size * 0.46)} color={fg} strokeWidth={isClear ? 1.8 : 2} />
    </View>
  );
}

/** The awning: terracotta and card-white stripes, once per page at the top. */
export function Awning({ height = 10, stripe = 26, flat, style }: { height?: number; stripe?: number; /** Square bottom edge (inside a card). */ flat?: boolean; style?: StyleProp<ViewStyle> }) {
  const { r, isClear } = useTheme();
  const n = 40;
  // Clear has no decoration: the awning is a Warm signature only.
  if (isClear) return null;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, flexDirection: "row", overflow: "hidden", borderBottomLeftRadius: flat ? 0 : height, borderBottomRightRadius: flat ? 0 : height }, style]}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ width: stripe, height, backgroundColor: i % 2 === 0 ? r.primary : r.card }} />
      ))}
    </View>
  );
}

/** A small pill: pastel tone, deep text. Pressable when `onPress` is given. */
export function ActionPill({ label, tone = "peach", vertical, onPress, accessibilityLabel }: { label: string; tone?: TileTone; vertical?: string | null; onPress?: () => void; accessibilityLabel?: string }) {
  const { bg, fg } = useTileColors(tone, vertical);
  const body = (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text variant="metaStrong" rawColor={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {body}
    </Pressable>
  );
}

/** White card on the cream canvas: radius 22, a hairline under it and a soft lift. */
export function WarmCard({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const theme = useTheme();
  const { r, isDark, isClear } = theme;
  if (isClear) return <View style={[clearCard(theme), { padding: padded ? 16 : 0 }, style]}>{children}</View>;
  return (
    <View
      style={[
        { backgroundColor: r.card, borderRadius: radii.card, padding: padded ? 18 : 0, borderColor: r.border, borderWidth: isDark ? StyleSheet.hairlineWidth : 0 },
        shadow(isDark ? shadowsDarkCss.card! : shadows.card.css, shadows.card.native),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Title row of a WarmCard: Fraunces title and an optional trailing node (count, link). */
export function CardTitle({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const { isClear } = useTheme();
  return (
    <View style={styles.cardTitle}>
      <Text accessibilityRole="header" style={isClear ? CLEAR_CARD_TITLE : { flex: 1, fontFamily: DISPLAY_HEAVY, fontSize: 20, lineHeight: 26 }}>
        {isClear ? capFirst(title) : title}
      </Text>
      {trailing}
    </View>
  );
}

/** The terracotta call to action's glow (web: exact CSS; native: the single-layer approximation). */
/**
 * Clear page card (audit #4, #5): white on the #F2F2F7 canvas, radius 20, the hairline as an inset ring (no layout) plus the soft
 * Apple elevation. Flat content layer: never glass.
 */
export function clearCard(t: { r: { card: string; border: string }; x: { shadowCard: string } }): ViewStyle {
  return { backgroundColor: t.r.card, borderRadius: 20, borderCurve: "continuous", boxShadow: `inset 0 0 0 1px ${t.r.border}, ${t.x.shadowCard}` } as ViewStyle;
}

/** Clear card title: 14/20 at 650 (Polaris headingSm, one step up for the display optical size). */
export const CLEAR_CARD_TITLE: TextStyle = { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", letterSpacing: -0.15 };

export function glow(isDark: boolean): ViewStyle {
  return shadow(isDark ? shadowsDarkCss.glow! : shadows.glow.css, shadows.glow.native);
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 12, minHeight: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  cardTitle: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
});
