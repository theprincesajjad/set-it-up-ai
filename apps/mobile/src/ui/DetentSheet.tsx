import { layout, radii, shadows, springs } from "@ll/design-tokens";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";

export interface DetentSheetProps {
  /** Visible heights in px, ascending: e.g. [peek, full]. */
  detents: number[];
  index: number;
  onIndexChange: (i: number) => void;
  /** Total height available (the map container). */
  containerHeight: number;
  /** Drag handle area (grabber + header). */
  header?: ReactNode;
  children: ReactNode;
  /** Drag below the lowest detent to dismiss. */
  onDismiss?: () => void;
  accessibilityLabel?: string;
  /** Drawn on top of everything, top-right (the close button). */
  corner?: ReactNode;
}

/**
 * Persistent bottom sheet with snap detents (Explore shop sheet). RN Animated
 * + PanResponder, 240 ms spring (foundations § Motion), radius 24, the float
 * shadow. Drag the header; the grabber is also a button that cycles detents.
 */
export function DetentSheet({ detents, index, onIndexChange, containerHeight, header, children, onDismiss, accessibilityLabel = "Shop", corner }: DetentSheetProps) {
  const { c } = useTheme();
  const maxH = detents[detents.length - 1] ?? 400;
  const offsetFor = (i: number) => maxH - (detents[Math.max(0, Math.min(detents.length - 1, i))] ?? 0);
  const y = useRef(new Animated.Value(maxH)).current;
  const current = useRef(offsetFor(index));
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    const to = offsetFor(index);
    current.current = to;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) y.setValue(to);
      else Animated.spring(y, { toValue: to, ...springs.sheet, useNativeDriver: true }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, maxH, detents.join(",")]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          y.setValue(Math.max(0, current.current + g.dy));
        },
        onPanResponderRelease: (_, g) => {
          const pos = current.current + g.dy + g.vy * 120;
          if (onDismiss && pos > offsetFor(0) + 60) {
            onDismiss();
            return;
          }
          let best = 0;
          let bestDist = Infinity;
          detents.forEach((_, i) => {
            const d = Math.abs(offsetFor(i) - pos);
            if (d < bestDist) {
              bestDist = d;
              best = i;
            }
          });
          if (best === indexRef.current) Animated.spring(y, { toValue: offsetFor(best), ...springs.sheet, useNativeDriver: true }).start();
          else onIndexChange(best);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxH, detents.join(","), onIndexChange, onDismiss],
  );

  return (
    <Animated.View style={[styles.sheet, { height: Math.min(maxH, containerHeight), backgroundColor: c.bg, transform: [{ translateY: y }] }, shadows.float.native]}>
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Double-tap to expand or collapse"
          accessibilityValue={{ text: index === detents.length - 1 ? "Expanded" : "Collapsed" }}
          onPress={() => onIndexChange((index + 1) % detents.length)}
          style={styles.grabberHit}
        >
          <View style={[styles.grabber, { backgroundColor: c.bgMuted }]} />
        </Pressable>
        {header}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      {corner ? <View style={styles.corner}>{corner}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, overflow: "hidden" },
  corner: { position: "absolute", top: 10, right: 12 },
  grabberHit: { alignItems: "center", justifyContent: "center", height: 22 },
  grabber: { width: layout.grabberWidth, height: layout.grabberHeight, borderRadius: 3 },
});
