import { radii } from "@ll/design-tokens";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { errorMessage, isApiError } from "../api/client";
import { t } from "../copy/en-CA";
import { useBrightScreen } from "../features/customer/brightness";
import { useCard, useMembershipDetails, useWallet } from "../features/customer/queries";
import { WalletPassButton } from "../features/customer/WalletPassButton";
import { formatPts, groupMemberCode } from "../lib/award";
import { rewardsReadyCount } from "../lib/hero";
import { displayPhone, maskPhone } from "../lib/phone";
import { api } from "../state/api";
import { useOnline } from "../state/network";
import { qk } from "../state/query";
import { useSession } from "../state/session";
import { useTheme } from "../theme";
import { Banner, Button, Chip, DiscountCard, IconButton, ListRow, Phone, QrCode, Receipt, SegmentedControl, Sheet, Skeleton, Text, TextField, X, haptic, monoFamily, useToast } from "../ui";

/**
 * My card (foundations § My card): a white sheet opened from the black card
 * button in the tab bar. Big QR (black on white in both themes), the member
 * code in mono, one black "add to apple wallet" button, no card art.
 * Rewards ready (never a points-plus-stamps total). Renders from cache instantly and works offline.
 */
export default function CardSheet() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { user, prefs } = useSession();
  const online = useOnline();
  const toast = useToast();
  const qc = useQueryClient();
  const { card, isError } = useCard();
  const wallet = useWallet();
  const [tab, setTab] = useState<"card" | "discounts">("card");
  const [reveal, setReveal] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimShop, setClaimShop] = useState<string | null>(null);
  const [claimCode, setClaimCode] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  useBrightScreen("my-card");

  const memberships = wallet.data?.items ?? [];
  const readyCount = rewardsReadyCount(memberships);
  const details = useMembershipDetails(memberships.map((m) => m.id));
  const discountCards = details.flatMap((d) => (d.data ? d.data.discountCards.map((dc) => ({ dc, m: d.data!.membership })) : []));
  const phone = user?.phone ?? prefs.lastPhone;
  const qrSize = Math.min(280, Math.round(width * 0.68));

  const claim = async () => {
    const shop = claimShop ?? memberships[0]?.merchant.id;
    if (!shop) return;
    setClaimBusy(true);
    setClaimError(null);
    try {
      const res = await api.me.claimPurchase(shop, claimCode.trim());
      const m = memberships.find((x) => x.merchant.id === shop);
      haptic.success();
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
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text variant="largeTitle" accessibilityRole="header">
            my card
          </Text>
          <Text variant="meta" color="fgMuted">
            {card?.name ?? user?.name ?? "Member"}
            {memberships.length > 0 ? ` · ${readyCount > 0 ? `${readyCount} ${readyCount === 1 ? "reward" : "rewards"} ready` : `${memberships.length} ${memberships.length === 1 ? "shop" : "shops"}`}` : ""}
          </Text>
        </View>
        <IconButton icon={X} label="Close" variant="secondary" size={32} onPress={() => router.back()} />
      </View>
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
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens the QR full screen"
            disabled={!card}
            onPress={() => card && router.push({ pathname: "/qr", params: { payload: card.qrPayload, code: card.memberCode } })}
            style={[styles.qrTile, { backgroundColor: c.qrBg, borderColor: c.line }]}
          >
            {card ? <QrCode value={card.qrPayload} size={qrSize} accessibilityLabel={`Your member QR code, number ${card.memberCode.split("").join(" ")}`} /> : <Skeleton width={qrSize} height={qrSize} radius={8} />}
          </Pressable>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text rawColor={c.fg} center selectable style={styles.code}>
              {card ? groupMemberCode(card.memberCode) : "•••• ••••"}
            </Text>
            <Text variant="meta" color="fgMuted" center>
              Show this at the counter
            </Text>
          </View>
          {!card && isError ? <Banner variant="danger">{t("err.network")}</Banner> : null}
          <WalletPassButton />
          <View>
            {memberships.length > 0 ? <ListRow leadingIcon={Receipt} title="Forgot to scan? Claim a purchase" chevron onPress={() => setClaimOpen(true)} divider={!!phone} /> : null}
            {phone ? (
              <ListRow
                leadingIcon={Phone}
                title={`Or give your number: ${reveal ? displayPhone(phone) : maskPhone(phone)}`}
                accessibilityLabel={reveal ? `Or give your number: ${displayPhone(phone)}` : "Or give your number. Tap to reveal"}
                onPress={() => setReveal((r) => !r)}
                divider={false}
              />
            ) : null}
          </View>
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
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 24, paddingBottom: 40 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  qrTile: { alignSelf: "center", padding: 18, borderRadius: radii.sheet, borderWidth: StyleSheet.hairlineWidth * 2 },
  code: { fontFamily: monoFamily, fontSize: 28, lineHeight: 34, letterSpacing: 3, fontVariant: ["tabular-nums"] },
});
