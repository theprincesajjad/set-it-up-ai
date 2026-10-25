import { router, useLocalSearchParams } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useBrightScreen } from "../features/customer/brightness";
import { groupMemberCode } from "../lib/award";
import { useLocale } from "../lib/i18n";
import { monoFamily, QrCode, Text } from "../ui";

/** Full-screen QR (tap to close). Always black on white. */
export default function FullQr() {
  const { payload, code } = useLocalSearchParams<{ payload: string; code: string }>();
  const { width, height } = useWindowDimensions();
  const { t } = useLocale();
  useBrightScreen("qr-full");
  const size = Math.min(width, height) - 48;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("ms.qr.close")} onPress={() => router.back()} style={{ flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <QrCode value={payload ?? ""} size={size} accessibilityLabel={t("ms.qr.label")} />
      <View>
        <Text rawColor="#0B0B0C" center style={{ fontFamily: monoFamily, fontSize: 28, lineHeight: 34, letterSpacing: 3 }}>
          {groupMemberCode(code ?? "")}
        </Text>
        <Text rawColor="#6B6B70" center>
          {t("ms.qr.tap")}
        </Text>
      </View>
    </Pressable>
  );
}
