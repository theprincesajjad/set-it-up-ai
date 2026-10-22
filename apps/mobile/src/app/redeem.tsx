import { radii } from "@ll/design-tokens";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "../api/client";
import { t } from "../copy/en-CA";
import { useBrightScreen } from "../features/customer/brightness";
import { useMembershipDetail } from "../features/customer/queries";
import { groupCode } from "../lib/award";
import { formatCountdown } from "../lib/format";
import { api } from "../state/api";
import { qk } from "../state/query";
import { useTheme } from "../theme";
import { Banner, Button, CircleCheck, ConfirmDialog, QrCode, ShopLogo, Text } from "../ui";

const CODE_TTL_S = 10 * 60;

/** 6.2 RedeemCode: code + QR + countdown; polls until staff confirm. */
export default function Redeem() {
  const p = useLocalSearchParams<{ redemptionId: string; code: string; rewardName: string; createdAt: string; memberId: string; shopName: string; vertical: string; logoUrl?: string; slug?: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  useBrightScreen("redeem-code");
  const [state, setState] = useState<"waiting" | "confirmed" | "expired" | "cancelled">("waiting");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = new Date(p.createdAt ?? Date.now()).getTime();
  const [left, setLeft] = useState(() => Math.max(0, CODE_TTL_S - Math.floor((Date.now() - started) / 1000)));
  const detail = useMembershipDetail(p.memberId, { refetchInterval: state === "waiting" ? 3000 : undefined });
  const seenOpen = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, CODE_TTL_S - Math.floor((Date.now() - started) / 1000))), 1000);
    return () => clearInterval(id);
  }, [started]);

  // Staff confirmed = the code is no longer in openRedemptions (and we didn't cancel it).
  useEffect(() => {
    if (state !== "waiting" || !detail.data) return;
    const open = detail.data.openRedemptions.some((r) => r.id === p.redemptionId);
    if (open) seenOpen.current = true;
    else if (seenOpen.current) {
      setState("confirmed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      AccessibilityInfo.announceForAccessibility(t("ok.redeem.customer", { reward: p.rewardName }));
      void qc.invalidateQueries({ queryKey: qk.wallet });
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace("/home")), 4000);
    }
  }, [detail.data, state, p.redemptionId, p.rewardName, qc]);

  // Expired: return the points (the code can't be used any more).
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
      setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  if (state === "confirmed") {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.success, justifyContent: "center" }]}>
        <View style={{ alignItems: "center", gap: 16 }} accessibilityLiveRegion="assertive">
          <CircleCheck size={72} color={c.onSuccess} />
          <Text variant="h2" rawColor={c.onSuccess} center>
            {t("ok.redeem.customer", { reward: p.rewardName })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.canvas }]}>
      <View style={styles.body}>
        <ShopLogo shop={{ name: p.shopName ?? "", vertical: p.vertical ?? "other", logoUrl: p.logoUrl || null }} size={56} />
        <Text variant="h2" center>
          {p.rewardName}
        </Text>
        <Text color="fgMuted" center>
          {p.shopName}
        </Text>
        {state === "expired" ? (
          <>
            <Banner variant="neutral">{t("err.redeem.expired")}</Banner>
            <Button variant="accent" fullWidth onPress={() => router.replace(p.slug ? `/shop/${p.slug}` : "/rewards")}>
              {t("action.getNewCode")}
            </Button>
          </>
        ) : (
          <>
            <View style={[styles.codeBox, { backgroundColor: c.surfaceSunken }]} accessible accessibilityLabel={`Code ${(p.code ?? "").split("").join(" ")}`}>
              <Text variant="code" center>
                {groupCode(p.code ?? "")}
              </Text>
            </View>
            <View style={{ backgroundColor: c.qrBg, padding: 12, borderRadius: radii.md }}>
              <QrCode value={p.code ?? ""} size={160} />
            </View>
            <Text variant="bodyStrong" rawColor={left <= 60 ? c.onWarningSubtle : c.fg} accessibilityLiveRegion={left <= 60 ? "polite" : "none"}>
              {`Expires in ${formatCountdown(left)}`}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.dot, { backgroundColor: c.brand }]} />
              <Text color="fgMuted">Waiting for staff...</Text>
            </View>
          </>
        )}
        {error ? <Banner variant="danger">{error}</Banner> : null}
      </View>
      {state === "waiting" ? (
        <Button variant="secondary" fullWidth onPress={() => setConfirmCancel(true)}>
          Cancel code
        </Button>
      ) : (
        <Button variant="secondary" fullWidth onPress={() => router.back()}>
          Close
        </Button>
      )}
      <ConfirmDialog
        visible={confirmCancel}
        title="Cancel this code?"
        body="Your points go back to your card. You can get a new code anytime."
        confirmLabel="Cancel code"
        cancelLabel="Keep code"
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
  codeBox: { borderRadius: radii.lg, paddingHorizontal: 24, paddingVertical: 16, minWidth: 220 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
