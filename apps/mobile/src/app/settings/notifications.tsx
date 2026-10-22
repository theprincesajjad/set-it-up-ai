import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { pushPermissionDenied, registerForPush } from "../../features/push";
import { usePhase2 } from "../../features/customer/queries";
import { useSession } from "../../state/session";
import { Banner, Button, Card, Screen, SwitchRow, Text, useToast } from "../../ui";
import { router } from "expo-router";

/** 10.2 Notifications. Offers need per-shop consent (Shops & messages). */
export default function NotificationSettings() {
  const { prefs, updatePrefs } = useSession();
  const phase2 = usePhase2();
  const toast = useToast();
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    void pushPermissionDenied().then(setDenied).catch(() => undefined);
  }, []);
  return (
    <Screen back title="Notifications">
      {denied ? (
        <Banner variant="info" actionLabel="Open settings" onAction={() => Linking.openSettings()}>
          Notifications are off for this app in your phone's settings.
        </Banner>
      ) : null}
      <Card>
        <SwitchRow label="Rewards & points" description="When you earn, and when a reward is ready." value={prefs.notifications.rewards} onValueChange={(v) => updatePrefs({ notifications: { ...prefs.notifications, rewards: v } })} />
        {phase2.enabled ? (
          <SwitchRow label="Orders & repairs" description="Order ready, quote to approve, repair updates." value={prefs.notifications.orders} onValueChange={(v) => updatePrefs({ notifications: { ...prefs.notifications, orders: v } })} />
        ) : null}
      </Card>
      <Card>
        <Text variant="bodyStrong">Offers from shops</Text>
        <Text variant="bodySm" color="fgMuted">
          Off unless you say yes to a shop. Change it per shop.
        </Text>
        <Button variant="ghost" onPress={() => router.push("/settings/shops")}>
          Shops & messages
        </Button>
      </Card>
      <Button
        variant="tonal"
        onPress={async () => {
          const r = await registerForPush().catch(() => "unavailable" as const);
          toast(r === "registered" ? "Notifications are on." : r === "denied" ? "Turn notifications on in your phone's settings." : "Notifications aren't available on this device yet.");
          updatePrefs({ pushPrompted: true });
        }}
      >
        Turn on notifications
      </Button>
    </Screen>
  );
}
