import { radii } from "@ll/design-tokens";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { groupMemberCode } from "../lib/award";
import { useTheme } from "../theme";
import { QrCode } from "./QrCode";
import { Text } from "./Text";

/** Big QR, black on white in both themes, member code in mono under it. */
export function MemberQr({ payload, memberCode, name, size }: { payload: string; memberCode: string; name?: string | null; size?: number }) {
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const qr = size ?? Math.max(220, Math.min(280, Math.round(width * 0.7)));
  return (
    <View style={[styles.card, { backgroundColor: c.qrBg }]}>
      {name ? (
        <Text variant="headline" rawColor="#0B0B0C" center>
          {name}
        </Text>
      ) : null}
      <View style={{ padding: 12, backgroundColor: c.qrBg }}>
        <QrCode value={payload} size={qr} accessibilityLabel={`Your member QR code. Member number ${memberCode.split("").join(" ")}`} />
      </View>
      <Text rawColor="#0B0B0C" center selectable style={styles.code}>
        {groupMemberCode(memberCode)}
      </Text>
    </View>
  );
}

export const monoFamily = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" });

const styles = StyleSheet.create({
  card: { borderRadius: radii.sheet, padding: 16, alignItems: "center", gap: 4, alignSelf: "center" },
  code: { fontFamily: monoFamily, fontSize: 24, lineHeight: 30, letterSpacing: 2, fontVariant: ["tabular-nums"] },
});
