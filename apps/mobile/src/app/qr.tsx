import { router, useLocalSearchParams } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useBrightScreen } from "../features/customer/brightness";
import { groupMemberCode } from "../lib/award";
import { monoFamily, QrCode, Text } from "../ui";

/** Full-screen QR (tap to close). Always black on white. */
export default function FullQr() {
  const { payload, code } = useLocalSearchParams<{ payload: string; code: string }>();
  const { width, height } = useWindowDimensions();
  useBrightScreen("qr-full");
  const size = Math.min(width, height) - 48;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close full screen card" onPress={() => router.back()} style={{ flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <QrCode value={payload ?? ""} size={size} accessibilityLabel="Member QR code" />
      <View>
        <Text rawColor="#0B0B0C" center style={{ fontFamily: monoFamily, fontSize: 28, lineHeight: 34, letterSpacing: 3 }}>
          {groupMemberCode(code ?? "")}
        </Text>
        <Text rawColor="#6B6B70" center>
          Tap anywhere to close
        </Text>
      </View>
    </Pressable>
  );
}
