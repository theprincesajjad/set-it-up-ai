import { radii } from "@ll/design-tokens";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./Button";
import { Check, type LucideIcon } from "./icons";
import { Text } from "./Text";

/** Staff-only "coming soon" line with Notify me. Never shown to customers, never "Upgrade". */
export function LockedFeature({ icon: Icon, title, body, onNotify }: { icon: LucideIcon; title: string; body: string; onNotify?: () => void }) {
  const { c } = useTheme();
  const [notified, setNotified] = useState(false);
  return (
    <View style={[styles.card, { borderColor: c.line }]}>
      <View style={styles.row}>
        <Icon size={20} color={c.fgMuted} strokeWidth={1.75} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      <Text variant="meta" color="fgMuted">
        {body}
      </Text>
      <Button
        variant="secondary"
        size="sm"
        iconStart={notified ? Check : undefined}
        onPress={() => {
          setNotified(true);
          onNotify?.();
        }}
        disabled={notified}
        style={{ alignSelf: "flex-start" }}
      >
        {notified ? "We'll let you know" : "Notify me"}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radii.card, padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
