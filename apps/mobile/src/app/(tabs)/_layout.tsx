import { blur, layout, shadows } from "@ll/design-tokens";
import { BlurView } from "expo-blur";
import { Redirect, router } from "expo-router";
import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProfile } from "../../features/customer/queries";
import { useTabBarHidden } from "../../features/tabBar";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Avatar, haptic, History, Map, QrCodeIcon, Wallet, type LucideIcon } from "../../ui";

const TABS: Record<string, { label: string; icon?: LucideIcon }> = {
  map: { label: "Map", icon: Map },
  wallet: { label: "Wallet", icon: Wallet },
  activity: { label: "Activity", icon: History },
  you: { label: "Profile" },
};

/** The round black card button: opens My card (QR) as a sheet over the current tab. */
function CardButton() {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="My card"
      accessibilityHint="Opens your member QR code"
      onPress={() => {
        haptic.tap();
        router.push("/card");
      }}
      style={({ pressed }) => [styles.item, { transform: pressed ? [{ scale: 0.94 }] : undefined }]}
    >
      <View style={[styles.card, { backgroundColor: c.fg }]}>
        <QrCodeIcon size={22} color={c.bg} strokeWidth={1.75} />
      </View>
    </Pressable>
  );
}

/**
 * Frosted capsule tab bar (foundations § Chrome floats): map · wallet ·
 * [black card button] · activity · avatar. Icons only, labels spoken.
 * BlurView + the 80% chrome fill; it slides away when a screen hides it.
 */
function AppTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const profile = useProfile();
  const hidden = useTabBarHidden();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(y, { toValue: hidden ? 140 : 0, duration: 200, useNativeDriver: true }).start();
  }, [hidden, y]);
  const bottom = Math.max(insets.bottom, 12);
  const routes = state.routes.filter((r) => TABS[r.name]);
  const item = (routeName: string) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    const route = state.routes[index];
    const tab = TABS[routeName];
    if (!route || !tab) return null;
    const focused = state.index === index;
    const color = focused ? c.fg : c.fgMuted;
    const Icon = tab.icon;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          if (focused) return;
          haptic.select();
          navigateToTab(route.key);
        }}
        style={styles.item}
      >
        {Icon ? (
          <Icon size={24} color={color} strokeWidth={focused ? 2.25 : 1.75} />
        ) : (
          <View style={[styles.avatarRing, { borderColor: focused ? c.fg : "transparent" }]}>
            <Avatar name={profile.data?.name ?? user?.name} size={28} />
          </View>
        )}
      </Pressable>
    );
  };
  if (routes.length === 0) return null;
  return (
    <Animated.View pointerEvents={hidden ? "none" : "box-none"} style={[styles.host, { bottom, transform: [{ translateY: y }] }]}>
      <View accessibilityRole="tablist" style={[styles.capsule, shadows.float.native, isDark ? { shadowOpacity: 0.4 } : null]}>
        <BlurView intensity={blur.nativeIntensity} tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} style={StyleSheet.absoluteFill} />
        {/* Android has no cheap live blur without a blur target: a near-opaque chrome fill instead. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === "android" ? c.bg : c.chrome, opacity: Platform.OS === "android" ? 0.96 : 1, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999 }]} />
        {item("map")}
        {item("wallet")}
        <CardButton />
        {item("activity")}
        {item("you")}
      </View>
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { status } = useSession();
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="map" />
      <Tabs.Screen name="wallet" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  capsule: { flexDirection: "row", alignItems: "center", height: layout.tabBar, borderRadius: 999, paddingHorizontal: 8, width: 320, maxWidth: "92%", overflow: "hidden" },
  item: { flex: 1, alignItems: "center", justifyContent: "center", height: layout.tabBar },
  card: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarRing: { borderRadius: 18, borderWidth: 1.5, padding: 1.5 },
});
