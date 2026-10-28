import { Pressable, StyleSheet, View } from "react-native";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";
import { Info, type LucideIcon } from "./icons";
import { Text } from "./Text";

export type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  children: string;
  tone?: BadgeTone;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  dot?: boolean;
}

/**
 * Status is a small pastel pill (Main Street Warm): butter = points / reward ready, mint = good, rose = problem,
 * peach = brand, sky = info; neutral is a sand capsule.
 */
export function useToneColors(tone: BadgeTone) {
  const { c, r } = useTheme();
  // Warm: pastel pills with their deep text (peach brand, butter points, mint success, rose danger, sky info).
  const map: Record<BadgeTone, { bg: string; fg: string; solid: string }> = {
    neutral: { bg: c.bgSubtle, fg: c.fgMuted, solid: c.fgMuted },
    brand: { bg: r.tilePeach, fg: r.tilePeachForeground, solid: r.tilePeachForeground },
    accent: { bg: r.tileButter, fg: r.tileButterForeground, solid: c.accent },
    success: { bg: r.tileMint, fg: r.tileMintForeground, solid: r.tileMintForeground },
    warning: { bg: r.tileButter, fg: r.tileButterForeground, solid: r.tileButterForeground },
    danger: { bg: r.tileRose, fg: r.tileRoseForeground, solid: r.tileRoseForeground },
    info: { bg: r.tileSky, fg: r.tileSkyForeground, solid: r.tileSkyForeground },
  };
  return map[tone];
}

export function Badge({ children, tone = "neutral", icon: Icon, trailingIcon: Trailing, dot }: BadgeProps) {
  const t = useToneColors(tone);
  const dotted = !!dot;
  const bare = t.bg === "transparent";
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, paddingHorizontal: bare ? 0 : 8 }]}>
      {dotted ? <View style={[styles.dot, { backgroundColor: t.solid }]} /> : null}
      {Icon ? <Icon size={13} color={t.fg} strokeWidth={2} /> : null}
      <Text variant="metaStrong" rawColor={t.fg} style={{ fontSize: 12, lineHeight: 16 }}>
        {children}
      </Text>
      {Trailing ? <Trailing size={12} color={t.fg} strokeWidth={2} /> : null}
    </View>
  );
}

/** Open / closed: a dot + word ("open · until 6 pm"). */
export function StatusDot({ open, label }: { open: boolean; label: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.status} accessible accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: open ? c.positive : c.fgSubtle }]} />
      <Text variant="meta" color={open ? "fg" : "fgMuted"}>
        {label}
      </Text>
    </View>
  );
}

/** "Sponsored" label (neutral, trailing info icon). Tapping opens "Why you're seeing this". */
export function SponsoredBadge({ onPress }: { onPress?: () => void }) {
  const { t } = useLocale();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("ui.sponsoredWhy")} onPress={onPress} hitSlop={12}>
      <Badge tone="neutral" trailingIcon={Info}>
        {t("ui.sponsored")}
      </Badge>
    </Pressable>
  );
}

export function ComingSoonBadge() {
  const { t } = useLocale();
  return <Badge tone="neutral">{t("ui.comingSoon")}</Badge>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, minHeight: 22, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
});
