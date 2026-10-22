import type { customerApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { errorMessage } from "../../api/client";
import { t } from "../../copy/en-CA";
import { useBrightScreen } from "../../features/customer/brightness";
import { useCard, useMembershipDetails, useWallet } from "../../features/customer/queries";
import { displayPhone, maskMiddle } from "../../lib/phone";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Banner, Button, Card, Check, DiscountCard, EmptyState, MemberQr, Screen, SegmentedControl, Skeleton, Text, Wallet, useToast } from "../../ui";

/** 5. My card: renders instantly from cache, works offline, brightness up while visible. */
export default function CardScreen() {
  const { c } = useTheme();
  const { user, prefs, updatePrefs } = useSession();
  const online = useOnline();
  const toast = useToast();
  const { card, isError, dataUpdatedAt } = useCard();
  const wallet = useWallet();
  const [tab, setTab] = useState<"card" | "discounts">("card");
  const [reveal, setReveal] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  useBrightScreen("my-card");

  const pass = useQuery({ queryKey: qk.walletPass, queryFn: api.wallet.status, enabled: online, retry: false, staleTime: 10 * 60_000 });
  const details = useMembershipDetails((wallet.data?.items ?? []).map((m) => m.id));
  const discountCards = details.flatMap((d) => (d.data ? d.data.discountCards.map((card) => ({ card, m: d.data!.membership })) : []));

  const addToWallet = async () => {
    setWalletBusy(true);
    try {
      if (Platform.OS === "ios") {
        const link = pass.data?.apple.downloadUrl ?? (await api.wallet.appleLink()).url;
        await Linking.openURL(link);
        updatePrefs({ inWallet: { ...prefs.inWallet, apple: true } });
      } else {
        const url = pass.data?.google.saveUrl ?? (await api.wallet.google()).saveUrl;
        await Linking.openURL(url);
        updatePrefs({ inWallet: { ...prefs.inWallet, google: true } });
      }
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e, { network: t("err.network"), server: "Wallet passes aren't available yet." }) });
    } finally {
      setWalletBusy(false);
    }
  };
  const platformKey = Platform.OS === "ios" ? "apple" : "google";
  const walletAvailable = pass.data ? pass.data[platformKey].available : true;
  const inWallet = prefs.inWallet[platformKey];
  const phone = user?.phone ?? prefs.lastPhone;

  return (
    <Screen title="My card" largeTitle banner={!online ? <Banner variant="neutral">Offline · your card still works</Banner> : null}>
      {discountCards.length > 0 ? (
        <SegmentedControl
          options={[
            { value: "card", label: "Card" },
            { value: "discounts", label: "Discount cards" },
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}

      {tab === "card" ? (
        <>
          {card ? (
            <Pressable accessibilityRole="button" accessibilityHint="Opens the QR full screen" onPress={() => router.push({ pathname: "/qr", params: { payload: card.qrPayload, code: card.memberCode } })}>
              <MemberQr payload={card.qrPayload} memberCode={card.memberCode} name={card.name?.split(" ")[0] ?? null} />
            </Pressable>
          ) : isError ? (
            <EmptyState icon={Wallet} title="Your card will appear here" body={t("err.network")} />
          ) : (
            <View style={{ alignItems: "center" }}>
              <Skeleton width={300} height={380} radius={24} />
            </View>
          )}
          {card && isError && dataUpdatedAt === 0 ? (
            <Text variant="caption" color="fgMuted" center>
              Showing your saved card. Staff can always look you up by phone.
            </Text>
          ) : null}

          {walletAvailable ? (
            inWallet ? (
              <View style={{ flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center" }}>
                <Check size={16} color={c.success} />
                <Text variant="bodySm" color="fgMuted">
                  In your Wallet
                </Text>
              </View>
            ) : (
              <Button variant="secondary" size="lg" iconStart={Wallet} loading={walletBusy} disabled={!online} onPress={addToWallet}>
                {Platform.OS === "ios" ? t("action.addToAppleWallet") : t("action.addToGoogleWallet")}
              </Button>
            )
          ) : null}

          {phone ? (
            <Pressable accessibilityRole="button" accessibilityLabel={reveal ? `Or give your number: ${displayPhone(phone)}` : "Or give your number. Tap to reveal"} onPress={() => setReveal((r) => !r)}>
              <Text color="fgMuted" center>
                {`Or give your number: ${reveal ? displayPhone(phone) : maskMiddle(phone)}`}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <View style={{ gap: 16 }}>
          {discountCards.map(({ card: dc, m }: { card: customerApi.DiscountCardDto; m: customerApi.MembershipDto }) => (
            <Pressable
              key={`${m.id}-${dc.id}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/discount",
                  params: { name: dc.name, percentOff: String(dc.percentOff), amountOffCents: String(dc.amountOffCents), terms: dc.terms ?? "", shopName: m.merchant.name, vertical: m.merchant.vertical, logoUrl: m.merchant.logoUrl ?? "" },
                })
              }
            >
              <DiscountCard card={dc} shop={m.merchant} live={false} />
            </Pressable>
          ))}
        </View>
      )}
      {card ? (
        <Card tone="sunken">
          <Text variant="bodySm" color="fgMuted">
            Staff at any shop on the network can scan this card. Show it every visit to earn.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
