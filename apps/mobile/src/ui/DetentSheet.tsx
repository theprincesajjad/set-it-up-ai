import { layout, radii, shadows, springs } from "@ll/design-tokens";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";
import { Glass } from "./Glass";
import { shadow } from "./shadow";

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
  /** Pinned to the bottom of the visible sheet (canvas: "show my card to redeem", 30 pt above the edge). */
  footer?: ReactNode;
}

/**
 * Persistent bottom sheet with snap detents (Explore shop sheet). RN Animated
 * + PanResponder, 240 ms spring (foundations § Motion), radius 24, the float
 * shadow. Drag the header; the grabber is also a button that cycles detents.
 */
export function DetentSheet({ detents, index, onIndexChange, containerHeight, header, children, onDismiss, accessibilityLabel = "Shop", corner, footer }: DetentSheetProps) {
  const { c, isDark, isClear } = useTheme();
  const { t } = useLocale();
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
    <Animated.View
      style={[
        styles.sheet,
        { height: Math.min(maxH, containerHeight), backgroundColor: c.bg, transform: [{ translateY: y }] },
        shadow("0 -4px 24px rgba(0,0,0,.08)", shadows.float.native),
        // Clear (audit #25): a strong-glass sheet 16 from the sides and the bottom, radius 32 on every corner, over the live map.
        isClear ? styles.clearSheet : null,
      ]}
    >
      {isClear ? <Glass variant="strong" radius={32} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={t("ui.detentHint")}
          accessibilityValue={{ text: index === detents.length - 1 ? t("ui.expanded") : t("ui.collapsed") }}
          onPress={() => onIndexChange((index + 1) % detents.length)}
          style={[styles.grabberHit, isClear ? { paddingTop: 8, height: 24 } : null]}
        >
          <View style={[styles.grabber, { backgroundColor: isDark ? c.lineStrong : "#E0E0DE" }, isClear ? { width: 36, height: 5, backgroundColor: isDark ? "rgba(235,235,245,0.35)" : "rgba(60,60,67,0.35)" } : null]} />
        </Pressable>
        {header}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      {corner ? <View style={styles.corner}>{corner}</View> : null}
      {footer ? (
        // Pinned to the visible bottom edge: the sheet is translated down by (maxH - visible), so lift it by that much.
        <Animated.View style={[styles.footer, { transform: [{ translateY: Animated.multiply(y, -1) }] }]} pointerEvents="box-none">
          {footer}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, overflow: "hidden" },
  clearSheet: { left: 16, right: 16, bottom: 16, borderRadius: 32, borderCurve: "continuous", backgroundColor: "transparent", overflow: "visible" },
  corner: { position: "absolute", top: 33, end: 20 },
  footer: { position: "absolute", left: 20, right: 20, bottom: 30 },
  // Canvas: 10 pt above the grabber, 18 pt under it.
  grabberHit: { alignItems: "center", justifyContent: "flex-start", paddingTop: 10, height: 33 },
  grabber: { width: layout.grabberWidth, height: layout.grabberHeight, borderRadius: 3 },
});
