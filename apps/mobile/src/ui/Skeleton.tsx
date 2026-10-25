import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";

/** Opacity pulse 0.6 → 1 over 1.2 s (static if reduced motion). Shown after 150 ms to avoid flash. */
export function Skeleton({ width = "100%", height = 16, radius = 8, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 150);
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      clearTimeout(t);
      loop?.stop();
    };
  }, [opacity]);
  if (!visible) return <View style={[{ width, height }, style]} />;
  return <Animated.View accessibilityElementsHidden style={[{ width, height, borderRadius: radius, backgroundColor: c.skeleton, opacity }, style]} />;
}

/** Region placeholder with one "Loading..." label for screen readers. */
export function SkeletonList({ rows = 3, rowHeight = 88 }: { rows?: number; rowHeight?: number }) {
  const { t } = useLocale();
  return (
    <View accessible accessibilityLabel={t("ui.skeleton.loading")} accessibilityState={{ busy: true }} style={{ gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={rowHeight} radius={12} />
      ))}
    </View>
  );
}

/**
 * Loading rows shaped like the real list row (polish-audit S8): round avatar, a name line, a meta line and an
 * optional trailing value, at the row's own height, with the inset hairline. No spinner, no grey slab.
 */
export function SkeletonRows({ rows = 4, avatar = 44, trailing = true, height = 68 }: { rows?: number; avatar?: number; trailing?: boolean; height?: number }) {
  const { c } = useTheme();
  const { t } = useLocale();
  return (
    <View accessible accessibilityLabel={t("rc.loading")} accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: height }}>
          {avatar ? <Skeleton width={avatar} height={avatar} radius={avatar / 2} /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={`${62 - ((i * 13) % 24)}%`} height={14} radius={4} />
            <Skeleton width={`${40 - ((i * 7) % 14)}%`} height={11} radius={4} />
          </View>
          {trailing ? <Skeleton width={36} height={16} radius={4} /> : null}
          {i < rows - 1 ? <View style={{ position: "absolute", start: avatar ? avatar + 12 : 0, end: 0, bottom: 0, height: 0.5, backgroundColor: c.line }} /> : null}
        </View>
      ))}
    </View>
  );
}

/** The shop header + balance block while a shop loads (sheet and page): avatar, name, place line, status, a bar. */
export function SkeletonShop() {
  const { t } = useLocale();
  return (
    <View accessible accessibilityLabel={t("rc.loading")} accessibilityState={{ busy: true }} style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Skeleton width={56} height={56} radius={28} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="70%" height={20} radius={4} />
          <Skeleton width="45%" height={12} radius={4} />
        </View>
      </View>
      <Skeleton width="40%" height={12} radius={4} />
      <Skeleton width="100%" height={44} radius={999} />
    </View>
  );
}
