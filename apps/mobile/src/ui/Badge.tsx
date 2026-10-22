import { Pressable, StyleSheet, View } from "react-native";
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
 * Status is a small dot + word, never a filled coloured card (foundations § Colour).
 * accent = points / reward ready (soft fill); success / danger = coloured dot + plain word;
 * everything else is a grey capsule.
 */
export function useToneColors(tone: BadgeTone) {
  const { c } = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string; solid: string }> = {
    neutral: { bg: c.bgSubtle, fg: c.fgMuted, solid: c.fgMuted },
    brand: { bg: c.bgSubtle, fg: c.fg, solid: c.fg },
    accent: { bg: c.accentSoft, fg: c.accentText, solid: c.accent },
    success: { bg: "transparent", fg: c.fg, solid: c.positive },
    warning: { bg: c.bgSubtle, fg: c.fg, solid: c.fg },
    danger: { bg: "transparent", fg: c.negative, solid: c.negative },
    info: { bg: c.bgSubtle, fg: c.fg, solid: c.fg },
  };
  return map[tone];
}

export function Badge({ children, tone = "neutral", icon: Icon, trailingIcon: Trailing, dot }: BadgeProps) {
  const t = useToneColors(tone);
  const dotted = dot || tone === "success" || tone === "danger";
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
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Sponsored. Why you're seeing this" onPress={onPress} hitSlop={12}>
      <Badge tone="neutral" trailingIcon={Info}>
        Sponsored
      </Badge>
    </Pressable>
  );
}

export function ComingSoonBadge() {
  return <Badge tone="neutral">Coming soon</Badge>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, minHeight: 22, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
});
