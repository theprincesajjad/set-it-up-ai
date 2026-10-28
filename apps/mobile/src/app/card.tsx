import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { errorMessage, isApiError } from "../api/client";
import { useBrightScreen } from "../features/customer/brightness";
import { useCard, useMembershipDetails, useWallet } from "../features/customer/queries";
import { WalletPassButton } from "../features/customer/WalletPassButton";
import { groupMemberCode, shortName } from "../lib/award";
import { formatPtsL } from "../lib/formatL";
import { useLocale } from "../lib/i18n";
import { api } from "../state/api";
import { useOnline } from "../state/network";
import { qk } from "../state/query";
import { useSession } from "../state/session";
import { shadows } from "@ll/design-tokens";
import { disp, ui, useTheme } from "../theme";
import { Banner, Button, Awning, Chip, CloseGlyph, DiscountCard, hairline, QrCode, SegmentedControl, Sheet, Skeleton, Text, TextField, haptic, shadow, monoFamily, useToast } from "../ui";

/**
 * My card (foundations § My card): a white sheet opened from the black card
 * button in the tab bar. Big QR (black on white in both themes), the member
 * code in mono, one black "add to apple wallet" button, no card art.
 * Rewards ready (never a points-plus-stamps total). Renders from cache instantly and works offline.
 */
export default function CardSheet() {
  const { c, r } = useTheme();
  const L = useLocale();
  const { t: lt } = L;
  const { width } = useWindowDimensions();
  const { user } = useSession();
  const online = useOnline();
  const toast = useToast();
  const qc = useQueryClient();
  const { card, isError } = useCard();
  const wallet = useWallet();
  const [tab, setTab] = useState<"card" | "discounts">("card");
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimShop, setClaimShop] = useState<string | null>(null);
  const [claimCode, setClaimCode] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  useBrightScreen("my-card");

  const memberships = wallet.data?.items ?? [];
  const details = useMembershipDetails(memberships.map((m) => m.id));
  const discountCards = details.flatMap((d) => (d.data ? d.data.discountCards.map((dc) => ({ dc, m: d.data!.membership })) : []));
  // Canvas: a 200 pt code in an 18 pt padded, hairline-bordered tile.
  const qrSize = Math.min(200, Math.round(width * 0.52));

  const claim = async () => {
    const shop = claimShop ?? memberships[0]?.merchant.id;
    if (!shop) return;
    setClaimBusy(true);
    setClaimError(null);
    try {
      const res = await api.me.claimPurchase(shop, claimCode.trim());
      const m = memberships.find((x) => x.merchant.id === shop);
      haptic.success();
      toast({ tone: "success", message: lt("ms.card.added", { amount: formatPtsL(L, res.pointsAwarded, m?.terminology), balance: formatPtsL(L, res.balance, m?.terminology) }) });
      void qc.invalidateQueries({ queryKey: qk.wallet });
      setClaimOpen(false);
      setClaimCode("");
    } catch (e) {
      const code = isApiError(e) ? e.code : "";
      setClaimError(
        code === "already_claimed"
          ? lt("ms.card.claimDup")
          : code === "claim_expired"
            ? lt("ms.card.claimOld")
            : isApiError(e) && e.status === 404
              ? lt("ms.card.claimNotFound")
              : isApiError(e) && e.status === 429
                ? lt("ms.card.claimLimit")
                : errorMessage(e, { network: lt("auth.err.network"), server: lt("auth.err.server") }),
      );
    } finally {
      setClaimBusy(false);
    }
  };

  const web = Platform.OS === "web";
  const body = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: web ? 10 : 20 }]}>
      {/* Native formSheet draws its own grabber; the web preview draws the canvas one. */}
      {web ? <View style={[styles.grabber, { backgroundColor: "#E0E0DE" }]} /> : null}
      <View style={styles.head}>
        <Text style={disp(20, 800, 26)} accessibilityRole="header">
          {lt("sh.card.title")}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={lt("sh.card.close")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/wallet"))} style={[styles.close, { backgroundColor: r.card }]}>
          <CloseGlyph size={16} color={c.fg} />
        </Pressable>
      </View>
      {!online ? <View style={{ alignSelf: "stretch", marginTop: 12 }}><Banner variant="neutral">{lt("sh.card.offline")}</Banner></View> : null}
      {discountCards.length > 0 ? (
        <View style={{ alignSelf: "stretch", marginTop: 16 }}>
          <SegmentedControl
            options={[
              { value: "card", label: lt("sh.card.tabCard") },
              { value: "discounts", label: lt("sh.card.tabDiscounts") },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
      ) : null}
      {tab === "card" ? (
        <>
          <Text style={[disp(28, 800, 32, -0.01), { marginTop: 40, textAlign: "center" }]}>{lt("sh.card.show")}</Text>
          <Text style={[ui(15, 400, 20), { marginTop: 8, textAlign: "center" }]} rawColor={c.fgMuted}>
            {lt("sh.card.sub")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityHint={lt("ms.card.qrHint")}
            disabled={!card}
            onPress={() => card && router.push({ pathname: "/qr", params: { payload: card.qrPayload, code: card.memberCode } })}
            style={[styles.qrTile, { backgroundColor: c.qrBg, borderColor: r.border }, shadow(shadows.card.css, shadows.card.native)]}
          >
            {card ? <QrCode value={card.qrPayload} size={qrSize} accessibilityLabel={lt("ui.memberQr", { code: card.memberCode.split("").join(" ") })} /> : <Skeleton width={qrSize} height={qrSize} radius={8} />}
          </Pressable>
          <Text rawColor={c.fg} center selectable style={styles.code}>
            {card ? groupMemberCode(card.memberCode) : "•••• ••••"}
          </Text>
          <Text style={[ui(13, 400, 17), { marginTop: 4, textAlign: "center" }]} rawColor={c.fgMuted}>
            {lt("sh.card.staffCode", { name: shortName(card?.name ?? user?.name) })}
          </Text>
          {!card && isError ? <View style={{ alignSelf: "stretch", marginTop: 12 }}><Banner variant="danger">{lt("auth.err.network")}</Banner></View> : null}
          <View style={styles.bottom}>
            <WalletPassButton />
            {memberships.length > 0 ? (
              <View style={styles.claim}>
                <Text style={ui(13, 400, 17)} rawColor={c.fgMuted}>
                  {lt("sh.card.forgot")}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`${lt("sh.card.forgot")} ${lt("sh.card.claim")}`} onPress={() => setClaimOpen(true)} hitSlop={10}>
                  <Text style={ui(13, 600, 17)} rawColor={c.brand}>{lt("sh.card.claim")}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </>
      ) : (
        <View style={{ alignSelf: "stretch", gap: 12, marginTop: 16 }}>
          {discountCards.map(({ dc, m }) => (
            <Pressable
              key={`${m.id}-${dc.id}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/discount", params: { name: dc.name, percentOff: String(dc.percentOff), amountOffCents: String(dc.amountOffCents), terms: dc.terms ?? "", shopName: m.merchant.name, vertical: m.merchant.vertical, logoUrl: m.merchant.logoUrl ?? "" } })
              }
            >
              <DiscountCard card={dc} shop={m.merchant} live={false} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: web ? "#6B6B70" : c.bg }}>
      {/* Web preview: the canvas sheet over a dimmed backdrop (native presents it as a real formSheet). */}
      {web ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF", opacity: 0.35 }]} /> : null}
      <View style={web ? [styles.webSheet, { backgroundColor: c.bg }] : { flex: 1 }}>
        <Awning height={10} />
        {body}
      </View>
      <Sheet
        visible={claimOpen}
        onClose={() => setClaimOpen(false)}
        title={lt("sh.card.claimTitle")}
        footer={
          <Button fullWidth loading={claimBusy} disabled={claimCode.trim().length < 3 || !online} onPress={claim}>
            {lt("sh.card.claimPoints")}
          </Button>
        }
      >
        <Text color="fgMuted">{lt("sh.card.claimHelp")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {memberships.map((m) => (
            <Chip key={m.id} label={m.merchant.name} selected={(claimShop ?? memberships[0]?.merchant.id) === m.merchant.id} onPress={() => setClaimShop(m.merchant.id)} />
          ))}
        </View>
        <TextField label={lt("sh.card.receipt")} value={claimCode} onChangeText={setClaimCode} autoCapitalize="characters" autoCorrect={false} maxLength={40} />
        {claimError ? <Banner variant="danger">{claimError}</Banner> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingBottom: 30, flexGrow: 1, alignItems: "center" },
  webSheet: { position: "absolute", left: 0, right: 0, top: 64, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  grabber: { width: 36, height: 5, borderRadius: 999, marginBottom: 14 },
  head: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  qrTile: { marginTop: 32, padding: 18, borderRadius: 22, borderWidth: hairline },
  code: { marginTop: 22, fontFamily: monoFamily, fontSize: 24, lineHeight: 30, letterSpacing: 24 * 0.14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  bottom: { marginTop: "auto", paddingTop: 24, alignSelf: "stretch", gap: 10 },
  claim: { flexDirection: "row", justifyContent: "center", gap: 6 },
});
