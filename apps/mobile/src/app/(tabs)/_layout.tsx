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
import { CardQrIcon, glow, haptic, shadow, TabDiscoverIcon, TabMapIcon, TabWalletIcon, Text, useTabBarBottom } from "../../ui";

type TabName = "map" | "discover" | "wallet" | "activity";
const LABEL_KEYS = { map: "sh.nav.map", discover: "sh.nav.discover", wallet: "sh.nav.wallet", activity: "sh.nav.activity" } as const satisfies Record<TabName, MessageKey>;
const ORDER: TabName[] = ["map", "discover", "wallet", "activity"];

/**
 * The round terracotta "my card" button, separate from the capsule and to its right (Corner's "+" button):
 * 60 pt, QR glyph, opens My card as a sheet over the current tab.
 */
function CardButton() {
  const { c, isDark } = useTheme();
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
      style={({ pressed }) => [styles.card, { backgroundColor: c.brand, transform: pressed ? [{ scale: 0.94 }] : undefined }, glow(isDark)]}
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
  const { c, r, isDark } = useTheme();
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
});
