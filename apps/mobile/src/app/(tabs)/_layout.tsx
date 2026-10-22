import { shadows } from "@ll/design-tokens";
import { Redirect, router } from "expo-router";
import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { History, House, Map, QrCodeIcon, Text, User, type LucideIcon } from "../../ui";

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  home: { label: "Home", icon: House },
  map: { label: "Explore", icon: Map },
  activity: { label: "Activity", icon: History },
  you: { label: "Profile", icon: User },
};

/** Raised centre button: opens My card as a sheet over the current tab (references.md § 4, § 7). */
function CardButton() {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="My card" accessibilityHint="Opens your member QR code" onPress={() => router.push("/card")} style={styles.item}>
      <View style={[styles.raised, { backgroundColor: c.brand, borderColor: c.surface }, shadows.md.native]}>
        <QrCodeIcon size={26} color={c.onBrand} />
      </View>
      <Text variant="caption" rawColor={c.fgMuted}>
        My card
      </Text>
    </Pressable>
  );
}

/** Bottom tab bar: 5 items, 56 + safe area, labels always visible; Card is the raised pine circle. */
function AppTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom, height: 56 + insets.bottom }]}>
      {state.routes.flatMap((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return [];
        const focused = state.index === index;
        const color = focused ? c.brand : c.fgMuted;
        const Icon = tab.icon;
        const onPress = () => {
          if (!focused) navigateToTab(route.key);
        };
        const tabEl = (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: focused }} onPress={onPress} style={styles.item}>
            <Icon size={24} color={color} />
            <Text variant="caption" rawColor={color}>
              {tab.label}
            </Text>
          </Pressable>
        );
        return index === 1 ? [tabEl, <CardButton key="card" />] : [tabEl];
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { status } = useSession();
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 56 },
  raised: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: -24, borderWidth: 3 },
});
