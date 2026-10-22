import { radii } from "@ll/design-tokens";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { ComingSoonBadge } from "./Badge";
import { Button } from "./Button";
import { Check, type LucideIcon } from "./icons";
import { Text } from "./Text";

/** "Coming soon" card: dashed border, honest reason, Notify me. Never "Upgrade". */
export function LockedFeature({ icon: Icon, title, body, onNotify }: { icon: LucideIcon; title: string; body: string; onNotify?: () => void }) {
  const { c } = useTheme();
  const [notified, setNotified] = useState(false);
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
      <View style={styles.row}>
        <View style={[styles.circle, { backgroundColor: c.neutralSubtle }]}>
          <Icon size={20} color={c.onNeutralSubtle} />
        </View>
        <Text variant="title" style={{ flex: 1 }}>
          {title}
        </Text>
        <ComingSoonBadge />
      </View>
      <Text variant="bodySm" color="fgMuted">
        {body}
      </Text>
      <Button
        variant="tonal"
        size="sm"
        iconStart={notified ? Check : undefined}
        onPress={() => {
          setNotified(true);
          onNotify?.();
        }}
        disabled={notified}
      >
        {notified ? "We'll let you know" : "Notify me"}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderStyle: "dashed", borderRadius: radii.lg, padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
