import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Info, Sprout, type LucideIcon } from "./icons";
import { Text } from "./Text";

export type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  children: string;
  tone?: BadgeTone;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  dot?: boolean;
}

export function useToneColors(tone: BadgeTone) {
  const { c } = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string; solid: string }> = {
    neutral: { bg: c.neutralSubtle, fg: c.onNeutralSubtle, solid: c.fgMuted },
    brand: { bg: c.brandSubtle, fg: c.onBrandSubtle, solid: c.brand },
    accent: { bg: c.accentSubtle, fg: c.onAccentSubtle, solid: c.accent },
    success: { bg: c.successSubtle, fg: c.onSuccessSubtle, solid: c.success },
    warning: { bg: c.warningSubtle, fg: c.onWarningSubtle, solid: c.warning },
    danger: { bg: c.dangerSubtle, fg: c.onDangerSubtle, solid: c.danger },
    info: { bg: c.infoSubtle, fg: c.onInfoSubtle, solid: c.info },
  };
  return map[tone];
}

/** Status badge: height 24, radius full, caption 12/600. Always text, never colour alone. */
export function Badge({ children, tone = "neutral", icon: Icon, trailingIcon: Trailing, dot }: BadgeProps) {
  const t = useToneColors(tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      {Icon ? <Icon size={14} color={t.fg} strokeWidth={2} /> : null}
      <Text variant="caption" rawColor={t.fg} style={{ fontFamily: "Figtree_600SemiBold" }}>
        {children}
      </Text>
      {Trailing ? <Trailing size={12} color={t.fg} strokeWidth={2} /> : null}
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
  return (
    <Badge tone="neutral" icon={Sprout}>
      Coming soon
    </Badge>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, minHeight: 24, paddingHorizontal: 8, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
