import { BRAND } from "@ll/shared";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { usePhase2, useProfile, useWallet } from "../../features/customer/queries";
import { useRestaurantMine } from "../../features/restaurant/queries";
import { useLocale } from "../../lib/i18n";
import { maskPhone } from "../../lib/phone";
import { useSession } from "../../state/session";
import {
  Avatar,
  Bell,
  CircleHelp,
  Gift,
  Globe,
  ConfirmDialog,
  ListRow,
  LogOut,
  Screen,
  Section,
  Shield,
  Store,
  Tablet,
  Text,
  Ticket,
  UserPlus,
  Users,
  UtensilsCrossed,
  Wallet,
} from "../../ui";

/** 10. You: profile header + rows. Counter mode appears for staff. */
export default function You() {
  const { user, merchants, signOut, setMode } = useSession();
  const profile = useProfile();
  const wallet = useWallet();
  const phase2 = usePhase2();
  const restaurant = useRestaurantMine();
  const { t, info } = useLocale();
  const [confirm, setConfirm] = useState(false);
  const name = profile.data?.name ?? user?.name ?? "";
  const phone = profile.data?.phone ?? user?.phone ?? null;
  // Referrals are a paid feature: only when the shop has them switched on and a bonus set.
  const referralShop = (wallet.data?.items ?? []).find((m) => m.features?.referrals !== false && (m.program?.referralBonus ?? 0) > 0);

  return (
    <Screen title="Profile" largeTitle tabBar>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name || "Add your name"}. Edit profile`} onPress={() => router.push("/settings/profile")} style={styles.me}>
        <Avatar name={name} id={user?.id} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{name || "Add your name"}</Text>
          {phone ? (
            <Text variant="meta" color="fgMuted">
              {maskPhone(phone)}
            </Text>
          ) : null}
        </View>
        <Text variant="bodyStrong">Edit</Text>
      </Pressable>
      <Section title="Your card">
        <ListRow leadingIcon={Gift} title="Rewards" subtitle="Ready to redeem, every shop, passport" chevron onPress={() => router.push("/rewards")} />
        {phase2.enabled ? <ListRow leadingIcon={Ticket} title="Orders & tickets" chevron onPress={() => router.push("/orders")} /> : null}
        {restaurant.tiffinEnabled ? <ListRow leadingIcon={UtensilsCrossed} title={t("rest.tiffin.mine")} subtitle={t("rest.you.tiffin.sub")} chevron onPress={() => router.push("/tiffin")} /> : null}
        {restaurant.eventsEnabled ? <ListRow leadingIcon={Users} title={t("rest.events.title")} subtitle={t("rest.you.events.sub")} chevron onPress={() => router.push("/events")} /> : null}
        <ListRow leadingIcon={Wallet} title="Wallet pass" chevron onPress={() => router.push("/card")} divider={!!referralShop} />
        {referralShop ? <ListRow leadingIcon={UserPlus} title="Invite a friend" subtitle={`You both get points at ${referralShop.merchant.name}`} chevron divider={false} onPress={() => router.push("/referrals")} /> : null}
      </Section>
      <Section title="Settings">
        <ListRow leadingIcon={Globe} title={t("lang.label")} subtitle={info.name} chevron onPress={() => router.push("/settings/language")} />
        <ListRow leadingIcon={Bell} title="Notifications" chevron onPress={() => router.push("/settings/notifications")} />
        <ListRow leadingIcon={Store} title="Shops & messages" chevron onPress={() => router.push("/settings/shops")} />
        <ListRow leadingIcon={Shield} title="Privacy & data" chevron onPress={() => router.push("/settings/privacy")} />
        <ListRow leadingIcon={CircleHelp} title="Help" chevron onPress={() => Linking.openURL(`mailto:${BRAND.supportEmail}`)} divider={merchants.length > 0} />
        {merchants.length > 0 ? (
          <ListRow
            leadingIcon={Tablet}
            title="Counter mode"
            subtitle={merchants.length === 1 ? merchants[0]!.name : `${merchants.length} shops`}
            chevron
            divider={false}
            onPress={() => {
              setMode("counter");
              router.replace("/counter/select");
            }}
          />
        ) : null}
      </Section>
      <View>
        <ListRow leadingIcon={LogOut} title="Sign out" danger divider={false} onPress={() => setConfirm(true)} />
        <Text variant="caption" color="fgMuted" style={{ paddingTop: 8 }}>{`${BRAND.name} ${Constants.expoConfig?.version ?? ""} · Made in Toronto`}</Text>
      </View>
      <ConfirmDialog
        visible={confirm}
        title="Sign out?"
        body="Your points stay safe. Sign in again with your phone number anytime."
        confirmLabel="Sign out"
        variant="primary"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await signOut();
          router.replace("/welcome");
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  me: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 8 },
});
