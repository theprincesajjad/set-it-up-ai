/** Sheets shared by several customer screens: join (CASL), redeem confirm, sponsored "why", push pre-prompt. */
import { BRAND, customerApi } from "@ll/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { formatPtsL, termWordL } from "../../lib/formatL";
import { useLocale } from "../../lib/i18n";
import { newIdempotencyKey } from "../../lib/ids";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Appear, Banner, Button, Card, ConsentCheckbox, haptic, Sheet, ShopLogo, SuccessCheck, Text, useToast } from "../../ui";
import { WalletPassButton } from "./WalletPassButton";
import { registerForCustomerPush } from "./notifications";
import { observeServerTimestamp } from "../../lib/serverClock";

export function JoinSheet({
  visible,
  onClose,
  shop,
  welcomeBonus,
  terminology,
  onJoined,
}: {
  visible: boolean;
  onClose: () => void;
  shop: { id: string; name: string; vertical: string; logoUrl?: string | null; brandColor?: string | null; consentText?: string | null };
  welcomeBonus?: number;
  terminology?: string;
  onJoined?: (res: customerApi.JoinResponse) => void;
}) {
  const { c } = useTheme();
  const L = useLocale();
  const { t } = L;
  const { prefs } = useSession();
  const qc = useQueryClient();
  // Pre-filled only from the member's own onboarding choice; never ticked by default.
  const [consent, setConsent] = useState(prefs.globalConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<customerApi.JoinResponse | null>(null);
  // CASL: what the shopper reads is what is recorded. The shop's English sentence in English, the faithful translation otherwise.
  const text = L.locale === "en" ? (shop.consentText ?? customerApi.marketingConsentText(shop.name)) : t("auth.consent.merchantApp", { shop: shop.name, brand: BRAND.name });
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.me.join({ merchantId: shop.id, ...(consent ? { consent: { text } } : {}) });
      await qc.invalidateQueries({ queryKey: qk.wallet });
      haptic.success();
      onJoined?.(res);
      // A moment, not a toast: check, what they got, and the Wallet pass (polish-audit M24).
      setJoined(res);
    } catch (e) {
      setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setBusy(false);
    }
  };
  if (joined) {
    const term = joined.membership.terminology;
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        scroll={false}
        footer={
          <>
            <WalletPassButton />
            <Button variant="ghost" size="lg" fullWidth onPress={onClose}>
              {t("auth.m.done")}
            </Button>
          </>
        }
      >
        <Appear style={{ gap: 12, alignItems: "flex-start", paddingTop: 8 }}>
          <SuccessCheck size={44} color={c.positive} />
          <Text variant="title" accessibilityRole="header">{t("ms.join.inAt", { shop: shop.name })}</Text>
          <Text color="fgMuted">
            {joined.bonusPoints > 0
              ? t("ms.join.added", { amount: formatPtsL(L, joined.bonusPoints, term) })
              : t("ms.join.next")}
          </Text>
        </Appear>
      </Sheet>
    );
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("auth.join.joinShop", { shop: shop.name })}
      footer={
        <Button size="lg" fullWidth loading={busy} onPress={join}>
          {t("auth.join.joinShop", { shop: shop.name })}
        </Button>
      }
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <ShopLogo shop={shop} size={44} />
        <Text style={{ flex: 1 }} color="fgMuted">
          {welcomeBonus ? `${t("ms.join.getBonus", { amount: formatPtsL(L, welcomeBonus, terminology) })} ` : ""}
          {t("ms.join.neverExpire", { unit: termWordL(L, terminology) })}
        </Text>
      </View>
      <ConsentCheckbox text={text} checked={consent} onChange={setConsent} caption={t(L.locale === "en" && shop.consentText ? "auth.consent.caption" : "cp.consent.sender", { sender: shop.name, shop: shop.name, brand: BRAND.name })} />
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Sheet>
  );
}

export function RedeemConfirmSheet({
  visible,
  onClose,
  membership,
  reward,
}: {
  visible: boolean;
  onClose: () => void;
  membership: customerApi.MembershipDto;
  reward: customerApi.MemberRewardDto | customerApi.RewardDto;
}) {
  const L = useLocale();
  const { t } = L;
  const online = useOnline();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const after = membership.balance - reward.pointsCost;
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.me.redeem(membership.id, reward.id, key);
      // Just issued: createdAt is "now" on the server (clock fallback when the Date header is hidden).
      if (!res.duplicate) observeServerTimestamp(res.redemption.createdAt);
      haptic.success();
      void qc.invalidateQueries({ queryKey: qk.wallet });
      void qc.invalidateQueries({ queryKey: qk.membership(membership.id) });
      onClose();
      router.push({
        pathname: "/redeem",
        params: {
          redemptionId: res.redemption.id,
          code: res.redemption.code,
          rewardName: res.redemption.rewardName,
          createdAt: res.redemption.createdAt,
          expiresAt: res.redemption.expiresAt ?? "none",
          memberId: membership.id,
          shopName: membership.merchant.name,
          vertical: membership.merchant.vertical,
          logoUrl: membership.merchant.logoUrl ?? "",
          brandColor: membership.merchant.brandColor ?? "",
          slug: membership.merchant.slug,
        },
      });
    } catch (e) {
      if (isApiError(e) && e.code === "insufficient_points") {
        setError(t("cp.err.notEnough", { terminology: termWordL(L, membership.terminology), n: Math.max(0, -after) }));
      } else setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={reward.name}
      footer={
        <>
          <Button size="lg" fullWidth loading={busy} disabled={!online} onPress={go}>
            {t("sh.wallet.showCode")}
          </Button>
          <Button variant="ghost" fullWidth onPress={onClose}>
            {t("cp.action.notNow")}
          </Button>
        </>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ShopLogo shop={membership.merchant} size={40} />
        <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {membership.merchant.name}
        </Text>
      </View>
      <Card tone="sunken">
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row" }}>
            <Text color="fgMuted" style={{ flex: 1 }}>
              {t("ms.redeem.uses")}
            </Text>
            <Text variant="bodyStrong" tabular>
              {formatPtsL(L, reward.pointsCost, membership.terminology)}
            </Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            <Text color="fgMuted" style={{ flex: 1 }}>
              {t("ms.redeem.after")}
            </Text>
            <Text variant="bodyStrong" tabular>
              {formatPtsL(L, Math.max(0, after), membership.terminology)}
            </Text>
          </View>
        </View>
      </Card>
      {reward.description ? <Text variant="meta" color="fgMuted">{reward.description}</Text> : null}
      <Text variant="meta" color="fgMuted">
        {t("ms.redeem.warn")}
      </Text>
      {!online ? <Banner variant="warning">{t("cp.err.offlineRedeem")}</Banner> : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Sheet>
  );
}

export function SponsoredWhySheet({ visible, onClose, shopName, street, terminology }: { visible: boolean; onClose: () => void; shopName: string; street?: string | null; terminology?: string }) {
  const L = useLocale();
  const { t } = L;
  return (
    <Sheet visible={visible} onClose={onClose} title={t("cp.ad.whyTitle")} scroll={false}>
      <Text color="fgMuted">{t("cp.ad.whyBody", { shop: shopName, street: street ?? t("sh.wallet.street"), terminology: termWordL(L, terminology) })}</Text>
      <Button variant="ghost" onPress={() => { onClose(); router.push("/settings/notifications"); }}>
        {t("cp.ad.link")}
      </Button>
    </Sheet>
  );
}

/** 1.5 Notifications pre-prompt. Never the OS prompt cold. */
export function PushPrompt({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const { updatePrefs } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const close = () => {
    updatePrefs({ pushPrompted: true });
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      scroll={false}
      title={t("cp.consent.pushTitle")}
      footer={
        <>
          <Button
            size="lg"
            fullWidth
            loading={busy}
            onPress={async () => {
              setBusy(true);
              const res = await registerForCustomerPush().catch(() => "unavailable" as const);
              setBusy(false);
              if (res === "registered") toast({ tone: "success", message: t("ms.notif.on") });
              else if (res === "denied") toast(t("ms.notif.offHint"));
              close();
            }}
          >
            {t("sh.set.turnOn")}
          </Button>
          <Button variant="ghost" size="lg" fullWidth onPress={close}>
            {t("cp.action.notNow")}
          </Button>
        </>
      }
    >
      <Text color="fgMuted">{t("cp.consent.pushBody")}</Text>
    </Sheet>
  );
}
