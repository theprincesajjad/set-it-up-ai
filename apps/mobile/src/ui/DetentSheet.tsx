import { radii, shadows } from "@ll/design-tokens";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";

export interface DetentSheetProps {
  /** Visible heights in px, ascending: e.g. [peek, half, full]. */
  detents: number[];
  index: number;
  onIndexChange: (i: number) => void;
  /** Total height available (the map container). */
  containerHeight: number;
  /** Drag handle area (grabber + header). */
  header?: ReactNode;
  children: ReactNode;
}

/**
 * Persistent bottom sheet with snap detents (Explore tab). Built on RN
 * Animated + PanResponder so it has no extra native dependency; drag the
 * header to move it, the grabber is also a button that cycles detents
 * (accessible alternative to dragging).
 */
export function DetentSheet({ detents, index, onIndexChange, containerHeight, header, children }: DetentSheetProps) {
  const { c } = useTheme();
  const maxH = detents[detents.length - 1] ?? 400;
  const offsetFor = (i: number) => maxH - (detents[Math.max(0, Math.min(detents.length - 1, i))] ?? 0);
  const y = useRef(new Animated.Value(offsetFor(index))).current;
  const current = useRef(offsetFor(index));
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    const to = offsetFor(index);
    current.current = to;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) y.setValue(to);
      else Animated.spring(y, { toValue: to, damping: 26, stiffness: 260, mass: 1, useNativeDriver: true }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, maxH, detents.join(",")]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          y.setValue(Math.max(0, Math.min(maxH - (detents[0] ?? 0), current.current + g.dy)));
        },
        onPanResponderRelease: (_, g) => {
          const pos = current.current + g.dy + g.vy * 120;
          let best = 0;
          let bestDist = Infinity;
          detents.forEach((_, i) => {
            const d = Math.abs(offsetFor(i) - pos);
            if (d < bestDist) {
              bestDist = d;
              best = i;
            }
          });
          if (best === indexRef.current) {
            Animated.spring(y, { toValue: offsetFor(best), damping: 26, stiffness: 260, useNativeDriver: true }).start();
          } else onIndexChange(best);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxH, detents.join(","), onIndexChange],
  );

  return (
    <Animated.View
      style={[
        styles.sheet,
        { height: Math.min(maxH, containerHeight), backgroundColor: c.surfaceRaised, transform: [{ translateY: y }] },
        shadows.lg.native,
      ]}
    >
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Shop list"
          accessibilityHint="Double-tap to show more or less"
          accessibilityValue={{ text: ["Peek", "Half", "Full"][index] ?? String(index) }}
          onPress={() => onIndexChange((index + 1) % detents.length)}
          style={styles.grabberHit}
        >
          <View style={[styles.grabber, { backgroundColor: c.borderStrong }]} />
        </Pressable>
        {header}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: "hidden" },
  grabberHit: { alignItems: "center", justifyContent: "center", height: 24 },
  grabber: { width: 36, height: 4, borderRadius: 2 },
});
