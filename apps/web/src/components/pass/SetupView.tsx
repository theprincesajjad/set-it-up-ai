"use client";
import { useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { buttonClasses } from "@/components/ui/Button";
import { ShopLogo } from "@/components/ui/ShopTile";
import { browserApi } from "@/lib/api/browser";
import { useLocale } from "@/lib/i18n";
import { SetupBox } from "./SetupBox";
import { pollUntil } from "./PaymentBox";
import { cardLabel } from "./cardLabel";

/** /pay/setup/<id>?cs=<secret>: where the mobile app (no Stripe SDK) sends "change card" for a tiffin subscription. Same shape as IntentPayView, without a charge. */
export function SetupView({ setupIntentId, clientSecret, initial }: { setupIntentId: string; clientSecret: string; initial: tiffinApi.SetupIntentView }) {
  const { t } = useLocale();
  const [data, setData] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [slow, setSlow] = useState(false);
  const { merchant: shop } = data;
  const done = data.status === "succeeded" && !!data.cardOnFile;

  async function saved() {
    setConfirming(true);
    setSlow(false);
    // The API saves the method from Stripe's webhook, so wait for the card to show up on the view.
    const ok = await pollUntil(async () => {
      const fresh = await browserApi.public.setupIntent(setupIntentId, clientSecret);
      setData(fresh);
      return (fresh.status === "succeeded" && !!fresh.cardOnFile) || fresh.status === "processing";
    });
    setSlow(!ok);
    setConfirming(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3 pt-2">
        <ShopLogo shop={{ name: shop.name, vertical: "restaurant", logoUrl: shop.logoUrl }} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-strong text-fg"><bdi>{shop.name}</bdi></p>
          <p className="truncate text-meta text-fg-muted"><bdi>{data.description}</bdi></p>
        </div>
      </header>

      {done && data.cardOnFile ? (
        <Banner tone="success" title={t("paySetup.saved")}>
          {t("paySetup.savedBody", { shop: shop.name, card: cardLabel(data.cardOnFile) })}
        </Banner>
      ) : null}
      {data.status === "processing" ? <Banner tone="info">{t("paySetup.processing")}</Banner> : null}
      {data.status === "canceled" ? <Banner tone="neutral">{t("paySetup.canceled")}</Banner> : null}

      {!done ? (
        <div className="flex flex-col gap-2">
          <h1 className="display text-[32px] leading-tight text-fg">{t("paySetup.heading")}</h1>
          <p className="text-body text-fg-muted">{t("paySetup.body", { shop: shop.name, what: t("payIntent.kind.tiffin") })}</p>
        </div>
      ) : null}

      {confirming ? <Banner tone="info">{t("paySetup.confirming")}</Banner> : null}
      {slow ? <Banner tone="neutral">{t("paySetup.slow")}</Banner> : null}
      {data.status === "requires_payment" && !confirming ? <SetupBox setupIntentId={setupIntentId} clientSecret={clientSecret} label={t("paySetup.save")} onSaved={saved} /> : null}

      {done || data.status === "processing" || data.status === "canceled" || slow ? (
        <a href="ll://tiffin" className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true })}>
          {t("payIntent.backToApp")}
        </a>
      ) : null}
      <p className="text-center text-meta text-fg-muted">{t("payIntent.secure")}</p>
    </div>
  );
}
