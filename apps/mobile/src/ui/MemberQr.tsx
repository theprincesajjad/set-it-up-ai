import { radii, shadows } from "@ll/design-tokens";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { groupMemberCode } from "../lib/award";
import { useTheme } from "../theme";
import { QrCode } from "./QrCode";
import { Text } from "./Text";

/**
 * My card QR: black on white inside a white rounded-xl card (even in dark
 * mode), min 220, target 260 / 70% of width, member number in code style.
 */
export function MemberQr({ payload, memberCode, name, size }: { payload: string; memberCode: string; name?: string | null; size?: number }) {
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const qr = size ?? Math.max(220, Math.min(260, Math.round(width * 0.7)));
  return (
    <View style={[styles.card, { backgroundColor: c.qrBg }, shadows.md.native]}>
      {name ? (
        <Text variant="h3" rawColor="#1F1B16" center>
          {name}
        </Text>
      ) : null}
      <View style={{ padding: 16, backgroundColor: c.qrBg }}>
        <QrCode value={payload} size={qr} accessibilityLabel={`Your member QR code. Member number ${memberCode.split("").join(" ")}`} />
      </View>
      <Text variant="code" rawColor="#1F1B16" style={{ fontSize: 28, lineHeight: 32 }} center selectable>
        {groupMemberCode(memberCode)}
      </Text>
      <Text variant="bodySm" rawColor="#655A4C" center>
        Show this at the counter
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, padding: 20, alignItems: "center", gap: 4, alignSelf: "center" },
});
