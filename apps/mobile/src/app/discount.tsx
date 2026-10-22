import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBrightScreen } from "../features/customer/brightness";
import { useSession } from "../state/session";
import { useTheme } from "../theme";
import { Button, DiscountCard, Text } from "../ui";

/** Full-screen DiscountCard with a live clock (screenshots can't be reused). */
export default function DiscountFull() {
  const p = useLocalSearchParams<{ name: string; percentOff: string; amountOffCents: string; terms?: string; shopName: string; vertical: string; logoUrl?: string }>();
  const { c } = useTheme();
  const { user } = useSession();
  useBrightScreen("discount-card");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 16, justifyContent: "center", gap: 16 }}>
      <DiscountCard
        card={{ name: p.name ?? "", percentOff: Number(p.percentOff ?? 0), amountOffCents: Number(p.amountOffCents ?? 0), terms: p.terms || null }}
        shop={{ name: p.shopName ?? "", vertical: p.vertical ?? "other", logoUrl: p.logoUrl || null }}
        memberName={user?.name}
      />
      <Text color="fgMuted" center>
        Show this at the counter.
      </Text>
      <View>
        <Button variant="secondary" fullWidth onPress={() => router.back()}>
          Close
        </Button>
      </View>
    </SafeAreaView>
  );
}
