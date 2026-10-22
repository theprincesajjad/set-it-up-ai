/** Sheets shared by several customer screens: join (CASL), redeem confirm, sponsored "why", push pre-prompt. */
import { customerApi } from "@ll/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { formatPts, termWord } from "../../lib/award";
import { newIdempotencyKey } from "../../lib/ids";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Banner, Bell, Button, ConsentCheckbox, Sheet, ShopLogo, Text, useToast } from "../../ui";
import { registerForPush } from "../push";

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
  shop: { id: string; name: string; vertical: string; logoUrl?: string | null; consentText?: string | null };
  welcomeBonus?: number;
  terminology?: string;
  onJoined?: (res: customerApi.JoinResponse) => void;
}) {
  const { prefs } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  // Pre-filled only from the member's own onboarding choice; never ticked by default.
  const [consent, setConsent] = useState(prefs.globalConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = shop.consentText ?? customerApi.marketingConsentText(shop.name);
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.me.join({ merchantId: shop.id, ...(consent ? { consent: { text } } : {}) });
      await qc.invalidateQueries({ queryKey: qk.wallet });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast({
        tone: "success",
        message: res.bonusPoints > 0 ? t("ok.joinedBonus", { bonus: formatPts(res.bonusPoints, res.membership.terminology), shop: shop.name }) : `You're in at ${shop.name}.`,
      });
      onJoined?.(res);
      onClose();
    } catch (e) {
      setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("action.join", { shop: shop.name })}
      footer={
        <Button fullWidth loading={busy} onPress={join}>
          {t("action.join", { shop: shop.name })}
        </Button>
      }
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <ShopLogo shop={shop} size={48} />
        <Text style={{ flex: 1 }} color="fgMuted">
          {welcomeBonus ? `Get ${formatPts(welcomeBonus, terminology)} when you join. ` : ""}
          {`Your ${termWord(terminology)} never expire unless the shop says otherwise.`}
        </Text>
      </View>
      <ConsentCheckbox text={text} checked={consent} onChange={setConsent} caption={t("consent.merchant.caption.v1", { shop: shop.name })} />
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
          memberId: membership.id,
          shopName: membership.merchant.name,
          vertical: membership.merchant.vertical,
          logoUrl: membership.merchant.logoUrl ?? "",
          slug: membership.merchant.slug,
        },
      });
    } catch (e) {
      if (isApiError(e) && e.code === "insufficient_points") {
        setError(t("err.redeem.notEnough", { terminology: termWord(membership.terminology), n: Math.max(0, -after) }));
      } else setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
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
          <Button variant="accent" fullWidth loading={busy} disabled={!online} onPress={go}>
            {t("action.showCodeToStaff")}
          </Button>
          <Button variant="secondary" fullWidth onPress={onClose}>
            {t("action.notNow")}
          </Button>
        </>
      }
    >
      <Text variant="bodyStrong">{membership.merchant.name}</Text>
      <Text>{`Costs ${formatPts(reward.pointsCost, membership.terminology)}`}</Text>
      <Text color="fgMuted">{t("misc.balanceAfter", { pts: formatPts(Math.max(0, after), membership.terminology) })}</Text>
      {reward.description ? <Text variant="bodySm" color="fgMuted">{reward.description}</Text> : null}
      <Text variant="bodySm" color="fgMuted">
        Only tap this at the counter. The code lasts 10 minutes.
      </Text>
      {!online ? <Banner variant="warning">{t("err.redeem.offlineCustomer")}</Banner> : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Sheet>
  );
}

export function SponsoredWhySheet({ visible, onClose, shopName, street, terminology }: { visible: boolean; onClose: () => void; shopName: string; street?: string | null; terminology?: string }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={t("ad.why.title")} scroll={false}>
      <Text color="fgMuted">{t("ad.why.body", { shop: shopName, street: street ?? "your street", terminology: termWord(terminology) })}</Text>
      <Button variant="ghost" onPress={() => { onClose(); router.push("/settings/notifications"); }}>
        {t("ad.why.link")}
      </Button>
    </Sheet>
  );
}

/** 1.5 Notifications pre-prompt. Never the OS prompt cold. */
export function PushPrompt({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme();
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
      footer={
        <>
          <Button
            fullWidth
            loading={busy}
            onPress={async () => {
              setBusy(true);
              const res = await registerForPush().catch(() => "unavailable" as const);
              setBusy(false);
              if (res === "registered") toast({ tone: "success", message: "Notifications are on." });
              else if (res === "denied") toast("Notifications are off. You can turn them on in Settings.");
              close();
            }}
          >
            {t("action.turnOn")}
          </Button>
          <Button variant="secondary" fullWidth onPress={close}>
            {t("action.notNow")}
          </Button>
        </>
      }
    >
      <View style={{ alignItems: "center", gap: 12 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.brandSubtle, alignItems: "center", justifyContent: "center" }}>
          <Bell size={48} color={c.onBrandSubtle} />
        </View>
        <Text variant="h3" center>
          {t("consent.push.title")}
        </Text>
        <Text color="fgMuted" center>
          {t("consent.push.body")}
        </Text>
      </View>
    </Sheet>
  );
}
