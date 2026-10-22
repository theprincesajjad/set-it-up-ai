import { layout, shadows } from "@ll/design-tokens";
import { router } from "expo-router";
import { useRef, type ReactNode } from "react";
import { Animated, RefreshControl, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { IconButton } from "./IconButton";
import { ChevronLeft } from "./icons";
import { Text } from "./Text";

/** Distance from the screen bottom to the tab bar (canvas: 26 pt; never into the home indicator). */
export function useTabBarBottom(): number {
  const insets = useSafeAreaInsets();
  return Math.max(26, insets.bottom - 8);
}

/** Height the floating capsule tab bar takes from the bottom of a tab screen (bar + its offset + a gap). */
export function useTabBarSpace(): number {
  return layout.tabBar + useTabBarBottom() + 12;
}

export interface ScreenProps {
  children: ReactNode;
  title?: string;
  /** iOS large title (lowercase, display face) that collapses into the bar on scroll. */
  largeTitle?: boolean;
  /** Page titles are lowercase (the voice); pass "as-is" for proper names (shop pages). */
  titleCase?: "lower" | "as-is";
  subtitle?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  trailing?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  banner?: ReactNode;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  background?: "canvas" | "surface" | "subtle";
  /** Full-bleed content under the status bar with a round back button floating over it. */
  floatingBack?: boolean;
  /** A tab screen: leaves room for the floating tab bar. */
  tabBar?: boolean;
  /** The content shows the title itself (shop header): the bar title fades in once it scrolls away. */
  collapseTitle?: boolean;
}

/**
 * The page frame: safe area, a 44 pt bar (round back button, centred title),
 * gutters 16. With `largeTitle` the title sits big under the bar and fades
 * into the bar as you scroll (SF-style), with a hairline appearing under it.
 */
export function Screen({
  children,
  title,
  largeTitle,
  titleCase = "lower",
  subtitle,
  back,
  onBack,
  trailing,
  scroll = true,
  refreshing,
  onRefresh,
  footer,
  banner,
  edges = ["top"],
  contentStyle,
  background = "canvas",
  floatingBack,
  tabBar,
  collapseTitle,
}: ScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const y = useRef(new Animated.Value(0)).current;
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  const bg = background === "subtle" ? c.bgSubtle : c.bg;
  const shownTitle = title ? (titleCase === "lower" ? title.toLowerCase() : title) : "";
  const barShown = !floatingBack && (back || !!title || !!trailing);
  const smallTitleOpacity = largeTitle
    ? y.interpolate({ inputRange: [24, 44], outputRange: [0, 1], extrapolate: "clamp" })
    : collapseTitle
      ? y.interpolate({ inputRange: [48, 72], outputRange: [0, 1], extrapolate: "clamp" })
      : 1;
  const ruleOpacity = y.interpolate({ inputRange: [0, 12], outputRange: [0, 1], extrapolate: "clamp" });
  const bottomPad = (tabBar ? tabSpace : 0) + (footer ? 16 : 40);

  const content = (
    <>
      {largeTitle && title ? (
        <View style={styles.largeTitle}>
          <Text variant="largeTitle" accessibilityRole="header" style={titleCase === "as-is" ? { textTransform: "none" } : null}>
            {shownTitle}
          </Text>
          {subtitle}
        </View>
      ) : null}
      {/* Inside the content so a banner that renders nothing (online) adds no space (polish-audit M31). */}
      {banner}
      {children}
    </>
  );

  return (
    <SafeAreaView edges={floatingBack ? edges.filter((e) => e !== "top") : edges} style={[styles.root, { backgroundColor: bg }]}>
      {barShown ? (
        <View style={[styles.bar, { backgroundColor: bg }]}>
          <View style={styles.side}>{back ? <IconButton icon={ChevronLeft} label="Back" variant="secondary" size={36} onPress={goBack} /> : null}</View>
          <Animated.View style={[styles.center, { opacity: smallTitleOpacity }]} accessibilityElementsHidden={largeTitle} importantForAccessibility={largeTitle ? "no-hide-descendants" : "auto"}>
            <Text variant="headline" numberOfLines={1} accessibilityRole={largeTitle ? undefined : "header"}>
              {shownTitle}
            </Text>
          </Animated.View>
          <View style={[styles.side, { justifyContent: "flex-end" }]}>{trailing}</View>
          <Animated.View style={[styles.rule, { backgroundColor: c.line, opacity: ruleOpacity }]} />
        </View>
      ) : null}
      {scroll ? (
        <Animated.ScrollView
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }, !barShown && !floatingBack ? styles.noBar : null, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.fgMuted} colors={[c.fg]} /> : undefined}
        >
          {content}
        </Animated.ScrollView>
      ) : (
        <View style={[styles.content, !barShown ? styles.noBar : null, { flex: 1, paddingBottom: tabBar ? tabSpace : 16 }, contentStyle]}>{content}</View>
      )}
      {floatingBack ? (
        <View style={[styles.floatingBack, { top: insets.top + 8 }]}>
          <IconButton icon={ChevronLeft} label="Back" variant="float" size={36} onPress={goBack} />
        </View>
      ) : null}
      {footer ? <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: bg, paddingBottom: Math.max(12, tabBar ? tabSpace : 0) }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/**
 * A group with a lowercase grey header over a hairline ("rewards ready").
 * `rule={false}` drops the hairline (when the children draw their own box).
 */
export function Section({ title, action, children, style, rule = true, spaced }: { title?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>; rule?: boolean; /** Prose / buttons under the rule: 12 above and between (rows bring their own padding). */ spaced?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[{ gap: rule ? 0 : 10 }, style]}>
      {title ? (
        <View style={[styles.sectionHeader, rule ? { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 } : null]}>
          <Text variant="metaStrong" color="fgMuted" accessibilityRole="header" style={{ flex: 1 }}>
            {title.toLowerCase()}
          </Text>
          {action}
        </View>
      ) : null}
      {spaced ? <View style={{ gap: 12, paddingTop: rule ? 12 : 0 }}>{children}</View> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /** 16: the back button's circle sits on the same left edge as the content (polish-audit S2). */
  bar: { height: layout.appBar, flexDirection: "row", alignItems: "center", paddingHorizontal: layout.gutterMobile },
  side: { width: 88, flexDirection: "row", alignItems: "center", gap: 4 },
  center: { flex: 1, alignItems: "center" },
  rule: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  largeTitle: { gap: 4, marginTop: 0, marginBottom: -4 },
  content: { paddingHorizontal: layout.gutterMobile, paddingTop: 8, gap: 24 },
  /** No app bar: keep the first line off the status bar / notch edge. */
  noBar: { paddingTop: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  floatingBack: { position: "absolute", left: layout.gutterMobile, borderRadius: 999, ...shadows.none.native },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 },
});
