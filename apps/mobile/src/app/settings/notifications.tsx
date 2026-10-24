import { customerApi, type MessageKey } from "@ll/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { isApiError } from "../../api/client";
import { CHANNEL_LABELS, groupPrefs, useNotificationPrefs, useSetNotificationPref } from "../../features/customer/inbox";
import { usePhase2 } from "../../features/customer/queries";
import { useRestaurantMine } from "../../features/restaurant/queries";
import { registerForCustomerPush } from "../../features/customer/notifications";
import { pushPermissionDenied } from "../../features/push";
import { useLocale } from "../../lib/i18n";
import { useSession } from "../../state/session";
import { Banner, ErrorState, Globe, ListRow, Screen, Section, Skeleton, Store, SwitchRow, Text, useToast } from "../../ui";

/** A type: its push switch, then "also by text / email" when the type supports them (indented, same column). */
function TypeRows({ item, last, onChange }: { item: customerApi.NotificationPrefDto; last: boolean; onChange: (channel: customerApi.NotificationChannel, enabled: boolean) => void }) {
  const { t, locale } = useLocale();
  const typeLabel = (() => {
    const key = `sh.nt.${item.type}` as MessageKey;
    const out = t(key);
    return out === key ? item.label : out;
  })();
  const channels = (Object.keys(item.channels) as customerApi.NotificationChannel[]).sort((a, b) => ["push", "sms", "email"].indexOf(a) - ["push", "sms", "email"].indexOf(b));
  const [first, ...more] = channels;
  if (!first) return null;
  return (
    <View>
      <SwitchRow label={typeLabel} description={locale === "en" ? item.description : undefined} value={!!item.channels[first]} onValueChange={(v) => onChange(first, v)} divider={more.length === 0 && !last} />
      {more.map((ch, i) => (
        <View key={ch} style={styles.sub}>
          <SwitchRow label={locale === "en" ? `Also by ${CHANNEL_LABELS[ch].toLowerCase()}` : t("sh.set.alsoBy", { channel: t(`sh.ch.${ch}` as MessageKey) })} value={!!item.channels[ch]} onValueChange={(v) => onChange(ch, v)} divider={i === more.length - 1 && !last} />
        </View>
      ))}
    </View>
  );
}

/**
 * 10.2 Notifications: native switches grouped by type (points and rewards · orders and repairs · offers), on
 * GET/PUT /v1/me/notification-prefs. Shop offers also need per-shop consent (Shops and messages).
 * Older API (404): falls back to the two device-only switches.
 */
export default function NotificationSettings() {
  const { prefs, updatePrefs } = useSession();
  const phase2 = usePhase2();
  const restaurant = useRestaurantMine();
  const toast = useToast();
  const { t, info } = useLocale();
  const q = useNotificationPrefs();
  const set = useSetNotificationPref();
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    void pushPermissionDenied().then(setDenied).catch(() => undefined);
  }, []);
  const missingApi = isApiError(q.error) && q.error.status === 404;
  const change = (type: customerApi.NotificationType, channel: customerApi.NotificationChannel, enabled: boolean) =>
    set.mutate({ type, channel, enabled }, { onError: () => toast({ tone: "error", message: t("sh.set.saveFail") }) });
  // Orders and repairs only matter once one of your shops offers them.
  const groups = groupPrefs(q.data?.items ?? []).filter((g) => g.title !== "Orders and repairs" || phase2.enabled || restaurant.tiffinEnabled);

  return (
    <Screen back title={t("sh.set.screenTitle")}>
      {/* The language messages come in: alerts, texts and the wallet pass follow it (saved on the profile). */}
      <Section title={t("sh.set.messagesIn")}>
        <ListRow leadingIcon={Globe} title={t("sh.set.language")} subtitle={t("sh.set.messagesInHint")} trailing={<Text variant="bodyStrong">{info.name}</Text>} chevron divider={false} onPress={() => router.push("/settings/language")} />
      </Section>
      {denied ? (
        <Banner variant="neutral" actionLabel={t("sh.set.openSettings")} onAction={() => Linking.openSettings()}>
          {t("sh.set.pushOff")}
        </Banner>
      ) : !prefs.pushPrompted ? (
        <Banner
          variant="neutral"
          actionLabel={t("sh.set.turnOn")}
          onAction={async () => {
            const r = await registerForCustomerPush().catch(() => "unavailable" as const);
            toast(r === "registered" ? "Notifications are on." : r === "denied" ? "Turn notifications on in your phone's settings." : "Notifications aren't available on this device yet.");
            updatePrefs({ pushPrompted: true });
          }}
        >
          {t("sh.set.pushNotYet")}
        </Banner>
      ) : null}

      {q.isLoading ? (
        <View style={{ gap: 20 }} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="45%" height={14} radius={4} />
                <Skeleton width="80%" height={11} radius={4} />
              </View>
              <Skeleton width={51} height={31} radius={16} />
            </View>
          ))}
        </View>
      ) : missingApi ? (
        <Section title="Push notifications">
          <SwitchRow label="Points and rewards" description="When you earn, and when a reward is ready." value={prefs.notifications.rewards} onValueChange={(v) => updatePrefs({ notifications: { ...prefs.notifications, rewards: v } })} divider={phase2.enabled} />
          {phase2.enabled ? (
            <SwitchRow label="Orders and repairs" description="Order ready, quote to approve, repair updates." value={prefs.notifications.orders} onValueChange={(v) => updatePrefs({ notifications: { ...prefs.notifications, orders: v } })} />
          ) : null}
        </Section>
      ) : q.isError ? (
        <ErrorState message={t("sh.set.loadFail")} onRetry={() => void q.refetch()} />
      ) : (
        groups.map((g) => (
          <Section key={g.title} title={t(g.titleKey)}>
            {g.items.map((item, i) => (
              <TypeRows key={item.type} item={item} last={i === g.items.length - 1} onChange={(ch, v) => change(item.type, ch, v)} />
            ))}
            {g.noteKey || g.channel === "points" ? (
              <Text variant="meta" color="fgMuted" style={{ paddingTop: 8 }}>
                {g.noteKey ? t(g.noteKey) : t("sh.set.budget", { n: q.data?.limits?.routinePushesPerDay ?? customerApi.ROUTINE_PUSHES_PER_DAY })}
              </Text>
            ) : null}
          </Section>
        ))
      )}

      <Section title={t("sh.set.fromShops")}>
        <ListRow leadingIcon={Store} title={t("sh.set.offersEach")} subtitle={t("sh.set.offersEachSub")} chevron divider={false} onPress={() => router.push("/settings/shops")} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { paddingLeft: 16 },
});
