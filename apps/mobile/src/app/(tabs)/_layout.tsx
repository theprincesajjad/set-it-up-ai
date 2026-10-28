import { blur, layout, shadowFloatDark, shadows } from "@ll/design-tokens";
import type { MessageKey } from "@ll/shared";
import { BlurView } from "expo-blur";
import { Redirect, router } from "expo-router";
import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { useProfile } from "../../features/customer/queries";
import { useTabBarHidden } from "../../features/tabBar";
import { initials } from "../../lib/award";
import { useLocale } from "../../lib/i18n";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { CardQrIcon, Glass, glow, haptic, ScrollEdge, shadow, TabDiscoverIcon, TabMapIcon, TabWalletIcon, Text, useTabBarBottom } from "../../ui";

type TabName = "map" | "discover" | "wallet" | "activity";
const LABEL_KEYS = { map: "sh.nav.map", discover: "sh.nav.discover", wallet: "sh.nav.wallet", activity: "sh.nav.activity" } as const satisfies Record<TabName, MessageKey>;
const ORDER: TabName[] = ["map", "discover", "wallet", "activity"];

/**
 * The round terracotta "my card" button, separate from the capsule and to its right (Corner's "+" button):
 * 60 pt, QR glyph, opens My card as a sheet over the current tab.
 */
function CardButton() {
  const { c, isDark, isClear } = useTheme();
  const { t } = useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sh.nav.myCard")}
      accessibilityHint={t("sh.card.cardLabel", { code: "" }).trim()}
      onPress={() => {
        haptic.tap();
        router.push("/card");
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.brand, transform: pressed ? [{ scale: 0.94 }] : undefined },
        // Clear: the solid black primary, the same height as the glass tab bar beside it, a soft drop shadow (no glow).
        isClear ? ({ width: 64, height: 64, borderRadius: 32, boxShadow: isDark ? "0 8px 20px rgba(0,0,0,0.5)" : "0 8px 20px -4px rgba(20,24,40,0.35), inset 0 1px 0 rgba(255,255,255,0.18)" } as object) : glow(isDark),
      ]}
    >
      <CardQrIcon size={24} color={c.onBrand} />
    </Pressable>
  );
}

/**
 * Tab bar (canvas Main/Discover/Wallet artboards): a frosted capsule with map · discover · wallet ·
 * avatar (activity), and the black card button beside it. Icons only, labels spoken.
 * BlurView + the 86% chrome fill; it slides away when a screen hides it (Explore's shop sheet).
 */
function AppTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c, r, x, isDark, isClear } = useTheme();
  const { t } = useLocale();
  const { user } = useSession();
  const profile = useProfile();
  const hidden = useTabBarHidden();
  const bottom = useTabBarBottom();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(y, { toValue: hidden ? 140 : 0, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
  }, [hidden, y]);
  const item = (name: TabName) => {
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    if (!route) return null;
    const focused = state.index === index;
    const color = focused ? c.brand : c.fgMuted;
    const sw = focused ? 2 : 1.8;
    const who = profile.data?.name ?? user?.name;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={t(LABEL_KEYS[name])}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          if (focused) return;
          haptic.select();
          navigateToTab(route.key);
        }}
        style={[styles.item, focused ? { backgroundColor: r.card, borderRadius: 999, width: 56 } : null, focused ? shadow(shadows.card.css, shadows.card.native) : null]}
      >
        {name === "map" ? <TabMapIcon color={color} strokeWidth={sw} /> : null}
        {name === "discover" ? <TabDiscoverIcon color={color} filled={focused} /> : null}
        {name === "wallet" ? <TabWalletIcon color={color} strokeWidth={sw} /> : null}
        {name === "activity" ? (
          <View style={[styles.avatar, { backgroundColor: focused ? r.tilePeach : c.bgMuted }]}>
            <Text allowFontScaling={false} style={styles.avatarText} rawColor={focused ? r.tilePeachForeground : c.fg}>
              {initials(who)}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };
  if (!state.routes.some((r) => ORDER.includes(r.name as TabName))) return null;
  if (isClear) {
    // Clear (audit 2.4): a 64 strong-glass capsule, radius 32, inset 4 (5 inline); equal tabs 56 tall with a 24 icon, 2, and a 10/12
    // label; the selected tab lifts into brighter glass (radius 28) in link blue. 16 from the sides, like every phone edge.
    const clearItem = (name: TabName) => {
      const index = state.routes.findIndex((rt) => rt.name === name);
      const route = state.routes[index];
      if (!route) return null;
      const focused = state.index === index;
      const color = focused ? (isDark ? "#6CB8FF" : x.link) : c.fgMuted;
      const who = profile.data?.name ?? user?.name;
      const icon =
        name === "map" ? <TabMapIcon color={color} strokeWidth={1.7} /> : name === "discover" ? <TabDiscoverIcon color={color} filled={focused} /> : name === "wallet" ? <TabWalletIcon color={color} strokeWidth={1.7} /> : (
          <View style={[styles.avatarClear, { backgroundColor: focused ? color : r.muted }]}>
            <Text allowFontScaling={false} style={styles.avatarTextClear} rawColor={focused ? (isDark ? "#000000" : "#FFFFFF") : c.fg}>
              {initials(who)}
            </Text>
          </View>
        );
      return (
        <Pressable
          key={route.key}
          accessibilityRole="tab"
          accessibilityLabel={t(LABEL_KEYS[name])}
          accessibilityState={{ selected: focused }}
          onPress={() => {
            if (focused) return;
            haptic.select();
            navigateToTab(route.key);
          }}
          style={styles.tabClear}
        >
          {focused ? <Glass variant="lift" radius={28} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} pointerEvents="none" /> : null}
          {icon}
          <Text allowFontScaling={false} numberOfLines={1} style={styles.tabLabel} rawColor={focused ? (isDark ? c.fg : x.link) : c.fgMuted}>
            {t(LABEL_KEYS[name])}
          </Text>
        </Pressable>
      );
    };
    // My card is the capsule's first cell, as in the v6 mock ("Card" first): one 358 capsule 16 from both edges instead of a 286 capsule
    // beside a separate 64 button. It is an action (it opens the card sheet over the current tab), so it is a button, not a tab.
    const cardCell = (
      <Pressable
        key="card"
        accessibilityRole="button"
        accessibilityLabel={t("sh.nav.myCard")}
        accessibilityHint={t("sh.card.cardLabel", { code: "" }).trim()}
        onPress={() => {
          haptic.tap();
          router.push("/card");
        }}
        style={({ pressed }) => [styles.tabClear, pressed ? { opacity: 0.7 } : null]}
      >
        <CardQrIcon size={24} color={c.fgMuted} strokeWidth={1.7} />
        <Text allowFontScaling={false} numberOfLines={1} style={styles.tabLabel} rawColor={c.fgMuted}>
          {t("sh.card.tabCard")}
        </Text>
      </Pressable>
    );
    return (
      <>
        {/* Scroll-edge strip: content nearing the capsule is already blurred (web; the native chrome is a real material). */}
        {hidden ? null : <ScrollEdge edge="bottom" />}
        <Animated.View pointerEvents={hidden ? "none" : "box-none"} style={[styles.host, { bottom: Math.max(16, bottom - 10), transform: [{ translateY: y }] }]}>
          <Glass variant="strong" radius={32} accessibilityRole="tablist" style={styles.capsuleClear}>
            {cardCell}
            {ORDER.map(clearItem)}
          </Glass>
        </Animated.View>
      </>
    );
  }
  return (
    <Animated.View pointerEvents={hidden ? "none" : "box-none"} style={[styles.host, { bottom, transform: [{ translateY: y }] }]}>
      <View accessibilityRole="tablist" style={[styles.capsule, shadow(isDark ? shadowFloatDark : shadows.float.css), isDark && Platform.OS !== "web" ? { shadowOpacity: 0.4 } : null]}>
        <View style={[StyleSheet.absoluteFill, styles.clip]}>
          {Platform.OS === "ios" ? <BlurView intensity={blur.nativeIntensity} tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} style={StyleSheet.absoluteFill} /> : null}
          {/* Android has no cheap live blur without a blur target: a near-opaque fill. Web frosts with backdrop-filter. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: r.sidebar, opacity: Platform.OS === "ios" ? 0.9 : 1 },
              Platform.OS === "web" ? ({ backdropFilter: `blur(${blur.chrome}px)` } as object) : null,
            ]}
          />
        </View>
        {ORDER.map(item)}
      </View>
      <CardButton />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { status } = useSession();
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="map" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="wallet" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  capsule: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around", height: layout.tabBar, borderRadius: 999, paddingHorizontal: 8 },
  clip: { borderRadius: 999, overflow: "hidden" },
  item: { width: 48, height: 44, alignItems: "center", justifyContent: "center" },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  card: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  capsuleClear: { flex: 1, flexDirection: "row", alignItems: "stretch", height: 64, paddingVertical: 4, paddingHorizontal: 5 },
  tabClear: { flex: 1, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", gap: 2, zIndex: 0 },
  tabLabel: { fontSize: 10, lineHeight: 12, fontWeight: "600" },
  avatarClear: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatarTextClear: { fontSize: 9, lineHeight: 12, fontWeight: "700" },
});
