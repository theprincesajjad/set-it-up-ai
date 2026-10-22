import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
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
  return (
    <View accessible accessibilityLabel="Loading..." accessibilityState={{ busy: true }} style={{ gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={rowHeight} radius={12} />
      ))}
    </View>
  );
}
