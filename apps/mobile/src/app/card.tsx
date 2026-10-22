import { radii } from "@ll/design-tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { errorMessage, isApiError } from "../api/client";
import { t } from "../copy/en-CA";
import { useBrightScreen } from "../features/customer/brightness";
import { useCard, useMembershipDetails, useWallet } from "../features/customer/queries";
import { formatNumber, formatPts, groupMemberCode } from "../lib/award";
import { displayPhone, maskMiddle } from "../lib/phone";
import { api } from "../state/api";
import { useOnline } from "../state/network";
import { qk } from "../state/query";
import { useSession } from "../state/session";
import { useTheme } from "../theme";
import { Banner, Button, Check, Chip, DiscountCard, QrCode, Receipt, SegmentedControl, Sheet, Skeleton, Text, TextField, Wallet, useToast } from "../ui";

/**
 * My card — a sheet opened from the raised tab-bar button (references.md § 4).
 * Pine card with total points + name, QR in a white tile, big monospace member
 * code, brightness max, Wallet buttons, "Forgot to scan? Claim a purchase".
 * Renders from cache instantly and works offline.
 */
export default function CardSheet() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { user, prefs, updatePrefs } = useSession();
  const online = useOnline();
  const toast = useToast();
  const qc = useQueryClient();
  const { card, isError } = useCard();
  const wallet = useWallet();
  const [tab, setTab] = useState<"card" | "discounts">("card");
  const [reveal, setReveal] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimShop, setClaimShop] = useState<string | null>(null);
  const [claimCode, setClaimCode] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  useBrightScreen("my-card");

  const memberships = wallet.data?.items ?? [];
  const total = memberships.reduce((s, m) => s + m.balance, 0);
  const pass = useQuery({ queryKey: qk.walletPass, queryFn: api.wallet.status, enabled: online, retry: false, staleTime: 10 * 60_000 });
  const details = useMembershipDetails(memberships.map((m) => m.id));
  const discountCards = details.flatMap((d) => (d.data ? d.data.discountCards.map((dc) => ({ dc, m: d.data!.membership })) : []));
  const platformKey = Platform.OS === "ios" ? "apple" : "google";
  const walletAvailable = pass.data ? pass.data[platformKey].available : true;
  const inWallet = prefs.inWallet[platformKey];
  const phone = user?.phone ?? prefs.lastPhone;
  const qrSize = Math.min(240, Math.round(width * 0.6));

  const addToWallet = async () => {
    setWalletBusy(true);
    try {
      const url = Platform.OS === "ios" ? (pass.data?.apple.downloadUrl ?? (await api.wallet.appleLink()).url) : (pass.data?.google.saveUrl ?? (await api.wallet.google()).saveUrl);
      await Linking.openURL(url);
      updatePrefs({ inWallet: { ...prefs.inWallet, [platformKey]: true } });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e, { network: t("err.network"), server: "Wallet passes aren't available yet." }) });
    } finally {
      setWalletBusy(false);
    }
  };

  const claim = async () => {
    const shop = claimShop ?? memberships[0]?.merchant.id;
    if (!shop) return;
    setClaimBusy(true);
    setClaimError(null);
    try {
      const res = await api.me.claimPurchase(shop, claimCode.trim());
      const m = memberships.find((x) => x.merchant.id === shop);
      toast({ tone: "success", message: `Added ${formatPts(res.pointsAwarded, m?.terminology)}. You have ${formatPts(res.balance, m?.terminology)}.` });
      void qc.invalidateQueries({ queryKey: qk.wallet });
      setClaimOpen(false);
      setClaimCode("");
    } catch (e) {
      const code = isApiError(e) ? e.code : "";
      setClaimError(
        code === "already_claimed"
          ? "That purchase was already added."
          : code === "claim_expired"
            ? "That receipt is more than 30 days old."
            : isApiError(e) && e.status === 404
              ? "We couldn't find that receipt at this shop. Check the number on your receipt."
              : isApiError(e) && e.status === 429
                ? "You can claim up to 3 purchases a day per shop."
                : errorMessage(e, { network: t("err.network"), server: t("err.server") }),
      );
    } finally {
      setClaimBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.canvas }} contentContainerStyle={styles.content}>
      {!online ? <Banner variant="neutral">Offline · your card still works</Banner> : null}
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
          <View style={[styles.pine, { backgroundColor: c.brand }]}>
            <View style={styles.pineTop}>
              <View style={{ flex: 1 }}>
                <Text variant="overline" rawColor={c.onBrand} style={{ opacity: 0.85 }}>
                  Scan before paying
                </Text>
                <Text variant="title" rawColor={c.onBrand}>
                  {card?.name ?? user?.name ?? "Member"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text variant="h2" rawColor={c.onBrand} tabular>
                  {formatNumber(total)}
                </Text>
                <Text variant="caption" rawColor={c.onBrand}>{`across ${memberships.length} ${memberships.length === 1 ? "shop" : "shops"}`}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens the QR full screen"
              disabled={!card}
              onPress={() => card && router.push({ pathname: "/qr", params: { payload: card.qrPayload, code: card.memberCode } })}
              style={[styles.qrTile, { backgroundColor: c.qrBg }]}
            >
              {card ? <QrCode value={card.qrPayload} size={qrSize} accessibilityLabel={`Your member QR code, number ${card.memberCode.split("").join(" ")}`} /> : <Skeleton width={qrSize} height={qrSize} radius={8} />}
            </Pressable>
            <Text variant="code" rawColor={c.onBrand} center selectable style={{ fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 34, lineHeight: 40 }}>
              {card ? groupMemberCode(card.memberCode) : "•••• ••••"}
            </Text>
            <Text variant="bodySm" rawColor={c.onBrand} center>
              Show this at the counter
            </Text>
          </View>
          {!card && isError ? <Banner variant="danger">{t("err.network")}</Banner> : null}
          {walletAvailable ? (
            inWallet ? (
              <View style={styles.inWallet}>
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
          {memberships.length > 0 ? (
            <Button variant="ghost" iconStart={Receipt} onPress={() => setClaimOpen(true)}>
              Forgot to scan? Claim a purchase
            </Button>
          ) : null}
          {phone ? (
            <Pressable accessibilityRole="button" accessibilityLabel={reveal ? `Or give your number: ${displayPhone(phone)}` : "Or give your number. Tap to reveal"} onPress={() => setReveal((r) => !r)}>
              <Text color="fgMuted" center>{`Or give your number: ${reveal ? displayPhone(phone) : maskMiddle(phone)}`}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        discountCards.map(({ dc, m }) => (
          <Pressable
            key={`${m.id}-${dc.id}`}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/discount", params: { name: dc.name, percentOff: String(dc.percentOff), amountOffCents: String(dc.amountOffCents), terms: dc.terms ?? "", shopName: m.merchant.name, vertical: m.merchant.vertical, logoUrl: m.merchant.logoUrl ?? "" } })
            }
          >
            <DiscountCard card={dc} shop={m.merchant} live={false} />
          </Pressable>
        ))
      )}
      <Button variant="secondary" onPress={() => router.back()}>
        Done
      </Button>

      <Sheet
        visible={claimOpen}
        onClose={() => setClaimOpen(false)}
        title="Claim a purchase"
        footer={
          <Button fullWidth loading={claimBusy} disabled={claimCode.trim().length < 3 || !online} onPress={claim}>
            Claim points
          </Button>
        }
      >
        <Text color="fgMuted">Type the receipt or order number from your receipt. Works for shops that connect their till.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {memberships.map((m) => (
            <Chip key={m.id} label={m.merchant.name} selected={(claimShop ?? memberships[0]?.merchant.id) === m.merchant.id} onPress={() => setClaimShop(m.merchant.id)} />
          ))}
        </View>
        <TextField label="Receipt number" value={claimCode} onChangeText={setClaimCode} autoCapitalize="characters" autoCorrect={false} maxLength={40} />
        {claimError ? <Banner variant="danger">{claimError}</Banner> : null}
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 24, gap: 16, paddingBottom: 40 },
  pine: { borderRadius: radii.xl, padding: 20, gap: 12 },
  pineTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  qrTile: { alignSelf: "center", padding: 16, borderRadius: radii.lg },
  inWallet: { flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center" },
});
