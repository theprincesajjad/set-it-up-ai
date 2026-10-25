"use client";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { buttonClasses } from "@/components/ui/Button";
import { ShopLogo } from "@/components/ui/ShopTile";
import { browserApi } from "@/lib/api/browser";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { PaymentBox, pollUntil } from "./PaymentBox";

/** Where "Back to the app" lands (apps/mobile/src/features/deepLinks.ts). */
const APP_LINK: Record<restaurantApi.PaymentIntentKind, string> = {
  tiffin: "ll://tiffin",
  hall_deposit: "ll://events",
  catering_deposit: "ll://events",
  order: "ll://card",
};

/** /pay/intent/<id>?cs=<secret>: what the app is asking you to pay, card payment, then a way back to the app. */
export function IntentPayView({ paymentIntentId, clientSecret, initial }: { paymentIntentId: string; clientSecret: string; initial: restaurantApi.PaymentIntentView }) {
  const { t, info } = useLocaleOrEnglish();
  // Always two decimals on a payment page ($130.00, not $130), unlike the compact shared formatter.
  const money = (cents: number, currency: string) => new Intl.NumberFormat(info.bcp47, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(cents / 100);
  const [data, setData] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [slow, setSlow] = useState(false);
  const { merchant: shop } = data;
  const kind = t(`payIntent.kind.${data.kind}`);
  const done = data.status === "succeeded";

  async function paid() {
    setConfirming(true);
    setSlow(false);
    const ok = await pollUntil(async () => {
      const fresh = await browserApi.public.paymentIntent(paymentIntentId, clientSecret);
      setData(fresh);
      return fresh.status === "succeeded" || fresh.status === "processing";
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
          <p className="truncate text-meta text-fg-muted">{kind}</p>
        </div>
      </header>

      {done ? (
        <Banner tone="success" title={t("payIntent.paid")}>
          {t("payIntent.paidBody", { shop: shop.name, what: kind })}
        </Banner>
      ) : null}
      {data.status === "processing" ? <Banner tone="info">{t("payIntent.processing")}</Banner> : null}
      {data.status === "canceled" ? <Banner tone="neutral">{t("payIntent.canceled")}</Banner> : null}

      <div className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">{done ? t("payIntent.paid") : t("payIntent.amountDue")}</p>
        <p className="display text-[48px] leading-none tabular-nums text-fg">{money(data.amountCents, data.currency)}</p>
        <p className="pt-1 text-body text-fg-muted"><bdi>{data.description}</bdi></p>
      </div>

      {confirming ? <Banner tone="info">{t("payIntent.confirming")}</Banner> : null}
      {slow ? <Banner tone="neutral">{t("payIntent.slow")}</Banner> : null}
      {data.status === "requires_payment" && !confirming ? (
        <PaymentBox paymentIntentId={paymentIntentId} clientSecret={clientSecret} amountCents={data.amountCents} label={t("payIntent.pay", { amount: money(data.amountCents, data.currency) })} onPaid={paid} />
      ) : null}

      {done || data.status === "processing" || data.status === "canceled" || slow ? (
        <a href={APP_LINK[data.kind]} className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true })}>
          {t("payIntent.backToApp")}
        </a>
      ) : null}
      <p className="text-center text-meta text-fg-muted">{t("payIntent.secure")}</p>
    </div>
  );
}
