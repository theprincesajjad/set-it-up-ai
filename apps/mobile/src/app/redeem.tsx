import { radii } from "@ll/design-tokens";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "../api/client";
import { useBrightScreen } from "../features/customer/brightness";
import { useMembershipDetail } from "../features/customer/queries";
import { groupCode } from "../lib/award";
import { formatCountdown } from "../lib/format";
import { useLocale } from "../lib/i18n";
import { secondsLeft } from "../lib/serverClock";
import { api } from "../state/api";
import { qk } from "../state/query";
import { useTheme } from "../theme";
import { Banner, Button, ConfirmDialog, haptic, IconButton, PulseDot, QrCode, ShopLogo, SuccessCheck, Text, X } from "../ui";

/** Legacy fallback when the API didn't send expiresAt: app codes last 10 minutes from createdAt. */
const CODE_TTL_MS = 10 * 60 * 1000;

/** 6.2 RedeemCode: code + QR + countdown; polls until staff confirm. */
export default function Redeem() {
  const p = useLocalSearchParams<{ redemptionId: string; code: string; rewardName: string; createdAt: string; expiresAt?: string; memberId: string; shopName: string; vertical: string; logoUrl?: string; brandColor?: string; slug?: string }>();
  const { c } = useTheme();
  const { t } = useLocale();
  const qc = useQueryClient();
  useBrightScreen("redeem-code");
  const [state, setState] = useState<"waiting" | "confirmed" | "expired" | "cancelled">("waiting");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // RedemptionDto.expiresAt, counted down on the server's clock. "none" = this code never expires.
  const legacy = Date.parse(p.createdAt ?? "");
  const expiresAt = p.expiresAt === "none" ? null : p.expiresAt || (Number.isNaN(legacy) ? null : new Date(legacy + CODE_TTL_MS).toISOString());
  const [left, setLeft] = useState<number | null>(() => secondsLeft(expiresAt));
  const detail = useMembershipDetail(p.memberId, { refetchInterval: state === "waiting" ? 3000 : undefined });
  const seenOpen = useRef(false);

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setLeft(secondsLeft(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Staff confirmed = the code is no longer in openRedemptions (and we didn't cancel it).
  useEffect(() => {
    if (state !== "waiting" || !detail.data) return;
    const open = detail.data.openRedemptions.some((r) => r.id === p.redemptionId);
    if (open) seenOpen.current = true;
    else if (seenOpen.current) {
      setState("confirmed");
      haptic.success();
      AccessibilityInfo.announceForAccessibility(t("cp.ok.redeemCustomer", { reward: p.rewardName }));
      void qc.invalidateQueries({ queryKey: qk.wallet });
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace("/map")), 4000);
    }
  }, [detail.data, state, p.redemptionId, p.rewardName, qc]);

  // Expired: the server voids it and refunds the points (redemptions.expire job); cancelling too makes it immediate.
  useEffect(() => {
    if (left === 0 && state === "waiting") {
      setState("expired");
      void api.me.cancelRedemption(p.redemptionId).catch(() => undefined).finally(() => qc.invalidateQueries({ queryKey: qk.wallet }));
    }
  }, [left, state, p.redemptionId, qc]);

  const cancel = async () => {
    setBusy(true);
    try {
      await api.me.cancelRedemption(p.redemptionId);
      setState("cancelled");
      await qc.invalidateQueries({ queryKey: qk.wallet });
      await qc.invalidateQueries({ queryKey: qk.membership(p.memberId) });
      router.back();
    } catch (e) {
      setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  if (state === "confirmed") {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg, justifyContent: "center" }]}>
        <View style={{ alignItems: "center", gap: 16 }} accessibilityLiveRegion="assertive">
          <SuccessCheck size={64} color={c.positive} />
          <Text variant="largeTitle" center style={{ textTransform: "none" }}>
            {t("cp.ok.redeemCustomer", { reward: p.rewardName })}
          </Text>
          <Text color="fgMuted" center>
            {p.shopName}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      {/* Leaving keeps the code open (the shop page shows "a code is waiting"); Cancel code is the bottom action. */}
      <View style={styles.top}>
        <IconButton icon={X} label={t("ms.redeem.closeKeep")} variant="secondary" size={36} onPress={() => (router.canGoBack() ? router.back() : router.replace("/wallet"))} />
      </View>
      <View style={styles.body}>
        <ShopLogo shop={{ name: p.shopName ?? "", vertical: p.vertical ?? "other", logoUrl: p.logoUrl || null, brandColor: p.brandColor || null }} size={56} />
        <View style={{ gap: 2 }}>
          <Text variant="largeTitle" center style={{ textTransform: "none" }}>
            {p.rewardName}
          </Text>
          <Text color="fgMuted" center>
            {p.shopName}
          </Text>
        </View>
        {state === "expired" ? (
          <>
            <Banner variant="neutral">{t("cp.err.redeemExpired")}</Banner>
            <Button size="lg" fullWidth onPress={() => router.replace(p.slug ? `/shop/${p.slug}` : "/rewards")}>
              {t("cp.action.getNewCode")}
            </Button>
          </>
        ) : (
          <>
            <View style={[styles.codeBox, { borderColor: c.line }]} accessible accessibilityLabel={t("ms.redeem.codeA11y", { code: (p.code ?? "").split("").join(" ") })}>
              <Text variant="code" center>
                {groupCode(p.code ?? "")}
              </Text>
              <View style={{ backgroundColor: c.qrBg, padding: 10, borderRadius: radii.input, alignSelf: "center" }}>
                <QrCode value={p.code ?? ""} size={152} />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {/* Waiting is a status, not points: a neutral pulsing dot (polish-audit M30). */}
              <PulseDot color={c.fgMuted} />
              <Text variant="meta" color="fgMuted" tabular accessibilityLiveRegion={left !== null && left <= 60 ? "polite" : "none"}>
                {left !== null ? t("ms.redeem.waitingExp", { time: formatCountdown(left) }) : t("ms.redeem.waiting")}
              </Text>
            </View>
          </>
        )}
        {error ? <Banner variant="danger">{error}</Banner> : null}
      </View>
      {state === "waiting" ? (
        <Button variant="ghost" fullWidth onPress={() => setConfirmCancel(true)}>
          {t("ms.redeem.cancelCode")}
        </Button>
      ) : (
        <Button variant="secondary" fullWidth onPress={() => router.back()}>
          {t("sh.card.close")}
        </Button>
      )}
      <ConfirmDialog
        visible={confirmCancel}
        title={t("ms.redeem.cancelTitle")}
        body={t("ms.redeem.cancelBody")}
        confirmLabel={t("ms.redeem.cancelCode")}
        cancelLabel={t("ms.redeem.keep")}
        loading={busy}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={cancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  codeBox: { borderRadius: radii.sheet, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 28, paddingVertical: 20, gap: 16, minWidth: 240 },
  top: { flexDirection: "row", minHeight: 44, alignItems: "center" },
});
