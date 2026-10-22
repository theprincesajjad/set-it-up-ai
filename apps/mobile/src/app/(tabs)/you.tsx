import { BRAND } from "@ll/shared";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { usePhase2, useProfile, useWallet } from "../../features/customer/queries";
import { maskPhone } from "@ll/shared";
import { useSession } from "../../state/session";
import {
  Avatar,
  Bell,
  Button,
  Card,
  CircleHelp,
  Gift,
  ConfirmDialog,
  History,
  Info,
  ListRow,
  LogOut,
  Pencil,
  Screen,
  Shield,
  Store,
  Tablet,
  Text,
  Ticket,
  UserPlus,
  Wallet,
} from "../../ui";

/** 10. You: profile header + rows. Counter mode appears for staff. */
export default function You() {
  const { user, merchants, signOut, setMode } = useSession();
  const profile = useProfile();
  const wallet = useWallet();
  const phase2 = usePhase2();
  const [confirm, setConfirm] = useState(false);
  const name = profile.data?.name ?? user?.name ?? "";
  const phone = profile.data?.phone ?? user?.phone ?? null;
  const referralShop = (wallet.data?.items ?? []).find((m) => (m.program?.referralBonus ?? 0) > 0);

  return (
    <Screen title="Profile" largeTitle>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={name} id={user?.id} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="title">{name || "Add your name"}</Text>
            {phone ? (
              <Text variant="bodySm" color="fgMuted">
                {maskPhone(phone)}
              </Text>
            ) : null}
          </View>
          <Button variant="ghost" size="sm" iconStart={Pencil} onPress={() => router.push("/settings/profile")}>
            Edit profile
          </Button>
        </View>
      </Card>
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <ListRow leadingIcon={Gift} title="Rewards" subtitle="Ready to redeem, all shops, passport" chevron onPress={() => router.push("/rewards")} />
        <ListRow leadingIcon={History} title="Activity" chevron onPress={() => router.push("/activity")} />
        {phase2.enabled ? <ListRow leadingIcon={Ticket} title="Orders & tickets" chevron onPress={() => router.push("/orders")} /> : null}
        <ListRow leadingIcon={Wallet} title="Wallet pass" chevron onPress={() => router.push("/card")} />
        <ListRow leadingIcon={Bell} title="Notifications" chevron onPress={() => router.push("/settings/notifications")} />
        <ListRow leadingIcon={Store} title="Shops & messages" chevron onPress={() => router.push("/settings/shops")} />
        {referralShop ? <ListRow leadingIcon={UserPlus} title="Invite a friend" subtitle={`You both get points at ${referralShop.merchant.name}`} chevron onPress={() => router.push("/referrals")} /> : null}
        <ListRow leadingIcon={CircleHelp} title="Help" chevron onPress={() => Linking.openURL(`mailto:${BRAND.supportEmail}`)} />
        <ListRow leadingIcon={Shield} title="Privacy & data" chevron onPress={() => router.push("/settings/privacy")} />
        <ListRow leadingIcon={Info} title="About" subtitle={`${BRAND.name} ${Constants.expoConfig?.version ?? ""} · Made in Toronto`} divider={merchants.length > 0} />
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
      </Card>
      <Button variant="secondary" iconStart={LogOut} onPress={() => setConfirm(true)}>
        Sign out
      </Button>
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
