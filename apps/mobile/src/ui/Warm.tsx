import { radii, shadows, shadowsDarkCss, type TileName } from "@ll/design-tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { DISPLAY_HEAVY, useTheme } from "../theme";
import { haptic } from "./haptics";
import type { LucideIcon } from "./icons";
import { shadow } from "./shadow";
import { Text } from "./Text";

/**
 * Main Street Warm building blocks (docs/design/v3.1-warm.md): the awning stripe, coloured IconTiles, pastel tiles, action pills.
 * Colours come from the theme roles only (`r.tile*`, `r.trade*`, `r.primary`), so light, warm dark and every trade follow.
 */

export type TileTone = TileName | "trade" | "primary";

/** Fill + deep text for a tile tone. `trade` is the shop's own family; `primary` is terracotta on its soft tint. */
export function useTileColors(tone: TileTone, vertical?: string | null): { bg: string; fg: string } {
  const { r, trade } = useTheme();
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
  return (
    <View
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
    >
      <Icon size={Math.round(size * 0.46)} color={fg} strokeWidth={2} />
    </View>
  );
}

/** The awning: terracotta and card-white stripes, once per page at the top. */
export function Awning({ height = 10, stripe = 26, flat, style }: { height?: number; stripe?: number; /** Square bottom edge (inside a card). */ flat?: boolean; style?: StyleProp<ViewStyle> }) {
  const { r } = useTheme();
  const n = 40;
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
  const { r, isDark } = useTheme();
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
  return (
    <View style={styles.cardTitle}>
      <Text accessibilityRole="header" style={{ flex: 1, fontFamily: DISPLAY_HEAVY, fontSize: 20, lineHeight: 26 }}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

/** The terracotta call to action's glow (web: exact CSS; native: the single-layer approximation). */
export function glow(isDark: boolean): ViewStyle {
  return shadow(isDark ? shadowsDarkCss.glow! : shadows.glow.css, shadows.glow.native);
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 12, minHeight: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  cardTitle: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
});
