import { shadows } from "@ll/design-tokens";
import { Redirect } from "expo-router";
import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Gift, House, Map, QrCodeIcon, Text, User, type LucideIcon } from "../../ui";

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  home: { label: "Home", icon: House },
  map: { label: "Map", icon: Map },
  card: { label: "Card", icon: QrCodeIcon },
  rewards: { label: "Rewards", icon: Gift },
  you: { label: "You", icon: User },
};

/** Bottom tab bar: 5 items, 56 + safe area, labels always visible; Card is the raised pine circle. */
function AppTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom, height: 56 + insets.bottom }]}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? c.brand : c.fgMuted;
        const Icon = tab.icon;
        const onPress = () => {
          if (!focused) navigateToTab(route.key);
        };
        if (route.name === "card") {
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel="My card" accessibilityState={{ selected: focused }} onPress={onPress} style={styles.item}>
              <View style={[styles.raised, { backgroundColor: c.brand, borderColor: c.surface }, shadows.md.native]}>
                <Icon size={26} color={c.onBrand} />
              </View>
              <Text variant="caption" rawColor={color}>
                {tab.label}
              </Text>
            </Pressable>
          );
        }
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: focused }} onPress={onPress} style={styles.item}>
            <Icon size={24} color={color} />
            <Text variant="caption" rawColor={color}>
              {tab.label}
            </Text>
          </Pressable>
        );
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
      <Tabs.Screen name="card" />
      <Tabs.Screen name="rewards" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 56 },
  raised: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: -24, borderWidth: 3 },
});
