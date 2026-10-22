import { BRAND, type networkApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../state/api";
import { useTheme } from "../../theme";
import { Button, ShopLogo, StreetIllustration, Text } from "../../ui";

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
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.canvas }]}>
      <View style={styles.hero}>
        {shop ? <ShopLogo shop={shop} size={96} /> : <StreetIllustration width={Math.min(width - 32, 360)} />}
      </View>
      <View style={styles.body}>
        <Text variant={width < 360 ? "h1" : "display"} accessibilityRole="header">
          {shop ? `Join ${shop.name} on ${BRAND.name}` : "One card for every shop on your street."}
        </Text>
        <Text variant="bodyLg" color="fgMuted">
          Earn points at local shops. Free, and your points never expire.
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
          <Text variant="caption" color="fgLink" onPress={() => Linking.openURL("https://local.example/terms")} style={{ textDecorationLine: "underline" }}>
            Terms
          </Text>{" "}
          and{" "}
          <Text variant="caption" color="fgLink" onPress={() => Linking.openURL("https://local.example/privacy")} style={{ textDecorationLine: "underline" }}>
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
  hero: { flex: 55, alignItems: "center", justifyContent: "center" },
  body: { gap: 12, paddingBottom: 24 },
  actions: { gap: 8, paddingBottom: 16 },
});
