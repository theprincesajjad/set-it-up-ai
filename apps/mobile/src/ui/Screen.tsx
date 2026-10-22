import { layout, shadows } from "@ll/design-tokens";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { IconButton } from "./IconButton";
import { ChevronLeft } from "./icons";
import { Text } from "./Text";

export interface ScreenProps {
  children: ReactNode;
  title?: string;
  /** Large h1 title (Home, Rewards). */
  largeTitle?: boolean;
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
  background?: "canvas" | "surface";
  /** Full-bleed hero under the status bar with a round back button floating over it (Shop detail). */
  floatingBack?: boolean;
}

/** Canvas + safe area + 56 app bar + gutters 16. */
export function Screen({ children, title, largeTitle, subtitle, back, onBack, trailing, scroll = true, refreshing, onRefresh, footer, banner, edges = ["top"], contentStyle, background = "canvas", floatingBack }: ScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  const showBar = back || (title && !largeTitle) || trailing;
  const barShown = !floatingBack && !!showBar && !(largeTitle && !back);
  const content = (
    <>
      {largeTitle && title ? (
        <View style={styles.largeTitle}>
          <View style={{ flex: 1 }}>
            <Text variant="h1" accessibilityRole="header">
              {title}
            </Text>
            {subtitle}
          </View>
          {!showBar ? trailing : null}
        </View>
      ) : null}
      {children}
    </>
  );
  return (
    <SafeAreaView edges={floatingBack ? edges.filter((e) => e !== "top") : edges} style={[styles.root, { backgroundColor: c[background] }]}>
      {barShown ? (
        <View style={styles.bar}>
          {back ? <IconButton icon={ChevronLeft} label="Back" onPress={goBack} /> : <View style={{ width: 8 }} />}
          <Text variant="title" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
            {!largeTitle ? (title ?? "") : ""}
          </Text>
          {trailing}
        </View>
      ) : null}
      {banner}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, !barShown && !floatingBack ? styles.noBar : null, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.brand} colors={[c.brand]} /> : undefined}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.content, !barShown ? styles.noBar : null, { flex: 1 }, contentStyle]}>{content}</View>
      )}
      {floatingBack ? (
        <View style={[styles.floatingBack, { top: insets.top + 8, backgroundColor: c.surface }, shadows.sm.native]}>
          <IconButton icon={ChevronLeft} label="Back" onPress={goBack} />
        </View>
      ) : null}
      {footer ? <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c[background] }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Section({ title, action, children, style }: { title?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 12 }, style]}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text variant="h3" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { height: layout.appBar, flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 8 },
  largeTitle: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  content: { paddingHorizontal: layout.gutterMobile, paddingBottom: 32, gap: 24 },
  /** No app bar: keep the first line off the status bar / notch edge. */
  noBar: { paddingTop: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  floatingBack: { position: "absolute", left: 12, borderRadius: 999 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
});
