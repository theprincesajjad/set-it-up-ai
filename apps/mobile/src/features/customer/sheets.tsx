/** Sheets shared by several customer screens: join (CASL), redeem confirm, sponsored "why", push pre-prompt. */
import { customerApi } from "@ll/shared";
import { useQueryClient } from "@tanstack/react-query";
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
import { Appear, Banner, Button, Card, ConsentCheckbox, haptic, Sheet, ShopLogo, SuccessCheck, Text, useToast } from "../../ui";
import { WalletPassButton } from "./WalletPassButton";
import { registerForPush } from "../push";
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
  const { prefs } = useSession();
  const qc = useQueryClient();
  // Pre-filled only from the member's own onboarding choice; never ticked by default.
  const [consent, setConsent] = useState(prefs.globalConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<customerApi.JoinResponse | null>(null);
  const text = shop.consentText ?? customerApi.marketingConsentText(shop.name);
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
      setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
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
              Done
            </Button>
          </>
        }
      >
        <Appear style={{ gap: 12, alignItems: "flex-start", paddingTop: 8 }}>
          <SuccessCheck size={44} color={c.positive} />
          <Text variant="title" accessibilityRole="header">{`You're in at ${shop.name}.`}</Text>
          <Text color="fgMuted">
            {joined.bonusPoints > 0
              ? `${formatPts(joined.bonusPoints, term)} added. Show your card next visit to keep earning.`
              : "Show your card next visit and your first points land in your wallet."}
          </Text>
        </Appear>
      </Sheet>
    );
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("action.join", { shop: shop.name })}
      footer={
        <Button size="lg" fullWidth loading={busy} onPress={join}>
          {t("action.join", { shop: shop.name })}
        </Button>
      }
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <ShopLogo shop={shop} size={44} />
        <Text style={{ flex: 1 }} color="fgMuted">
          {welcomeBonus ? `Get ${formatPts(welcomeBonus, terminology)} when you join. ` : ""}
          {`Your ${termWord(terminology)} never expire unless the shop says otherwise.`}
        </Text>
      </View>
      <ConsentCheckbox text={text} checked={consent} onChange={setConsent} caption={t(shop.consentText ? "consent.merchant.caption.v1" : "consent.merchant.sender", { shop: shop.name })} />
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
          <Button size="lg" fullWidth loading={busy} disabled={!online} onPress={go}>
            {t("action.showCodeToStaff")}
          </Button>
          <Button variant="ghost" fullWidth onPress={onClose}>
            {t("action.notNow")}
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
              Uses
            </Text>
            <Text variant="bodyStrong" tabular>
              {formatPts(reward.pointsCost, membership.terminology)}
            </Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            <Text color="fgMuted" style={{ flex: 1 }}>
              Your balance after
            </Text>
            <Text variant="bodyStrong" tabular>
              {formatPts(Math.max(0, after), membership.terminology)}
            </Text>
          </View>
        </View>
      </Card>
      {reward.description ? <Text variant="meta" color="fgMuted">{reward.description}</Text> : null}
      <Text variant="meta" color="fgMuted">
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
      title={t("consent.push.title")}
      footer={
        <>
          <Button
            size="lg"
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
          <Button variant="ghost" size="lg" fullWidth onPress={close}>
            {t("action.notNow")}
          </Button>
        </>
      }
    >
      <Text color="fgMuted">{t("consent.push.body")}</Text>
    </Sheet>
  );
}
