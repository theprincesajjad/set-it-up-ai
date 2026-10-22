import { palette } from "@ll/design-tokens";
import { BRAND, type networkApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../state/api";
import { useTheme } from "../../theme";
import { Button, LogoMark, PlaceBubble, ShopLogo, Text } from "../../ui";

/** A still of the product, not an illustration: a pale street with four places on it. */
function StreetStill({ width }: { width: number }) {
  const { isDark } = useTheme();
  const land = isDark ? palette.map.landDark : palette.map.land;
  const road = isDark ? palette.map.roadDark : palette.map.road;
  const h = Math.round(width * 0.82);
  return (
    <View style={[styles.still, { width, height: h, backgroundColor: land }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.road, { backgroundColor: road, top: h * 0.46, left: -40, right: -40, height: 18, transform: [{ rotate: "-14deg" }] }]} />
      <View style={[styles.road, { backgroundColor: road, top: -40, bottom: -40, left: width * 0.58, width: 12, transform: [{ rotate: "8deg" }] }]} />
      <View style={[styles.road, { backgroundColor: road, top: h * 0.12, left: -40, right: -40, height: 8, transform: [{ rotate: "6deg" }] }]} />
      <View style={[styles.pin, { top: h * 0.08, left: width * 0.08 }]}>
        <PlaceBubble name="Pinecone Coffee" subtitle="7 / 10 stamps" category="coffee" />
      </View>
      <View style={[styles.pin, { top: h * 0.3, left: width * 0.5 }]}>
        <PlaceBubble name="Hearth & Crumb" subtitle="reward ready" accent category="bakery" />
      </View>
      <View style={[styles.pin, { top: h * 0.56, left: width * 0.12 }]}>
        <PlaceBubble name="Nonna's Table" subtitle="restaurant" category="eat" />
      </View>
      <View style={[styles.pin, { top: h * 0.76, left: width * 0.46 }]}>
        <PlaceBubble name="Bloom Hair" subtitle="salon" category="beauty" />
      </View>
    </View>
  );
}

/** 1.1 Welcome. With ?join=<qrCode> (from /j/<code>), the shop leads. */
export default function Welcome() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { join } = useLocalSearchParams<{ join?: string }>();
  const joinInfo = useQuery<networkApi.JoinInfoResponse>({
    queryKey: ["joinInfo", join ?? ""],
    queryFn: () => api.network.joinInfo(join!),
    enabled: !!join,
  });
  const shop = joinInfo.data?.merchant;
  const stillW = Math.min(width - 32, 420);
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <LogoMark size={36} />
        <Text variant="mapLabel" style={{ fontSize: 17 }}>
          {BRAND.name.toLowerCase()}
        </Text>
      </View>
      <View style={styles.hero}>{shop ? <ShopLogo shop={shop} size={88} /> : <StreetStill width={stillW} />}</View>
      <View style={styles.body}>
        <Text variant="largeTitle" accessibilityRole="header" style={{ fontSize: width < 360 ? 28 : 34, lineHeight: width < 360 ? 32 : 38 }}>
          {shop ? `join ${shop.name.toLowerCase()}` : "one card for every shop on your street"}
        </Text>
        <Text variant="body" color="fgMuted">
          {shop ? `Earn at ${shop.name} and the shops around it. Free, and your points never expire.` : "Earn at local shops. Free, and your points never expire."}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button size="lg" fullWidth onPress={() => router.push({ pathname: "/phone", params: join ? { join } : {} })}>
          Get started
        </Button>
        <Button variant="ghost" fullWidth onPress={() => router.push("/staff-sign-in")}>
          I'm a shop owner or staff
        </Button>
        <Text variant="caption" color="fgMuted" center>
          By continuing you agree to the{" "}
          <Text variant="caption" color="fg" onPress={() => Linking.openURL("https://local.example/terms")} style={{ textDecorationLine: "underline" }}>
            Terms
          </Text>{" "}
          and{" "}
          <Text variant="caption" color="fg" onPress={() => Linking.openURL("https://local.example/privacy")} style={{ textDecorationLine: "underline" }}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12 },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  still: { borderRadius: 24, overflow: "hidden" },
  road: { position: "absolute", borderRadius: 2 },
  pin: { position: "absolute" },
  body: { gap: 10, paddingBottom: 24 },
  actions: { gap: 4, paddingBottom: 12 },
});
