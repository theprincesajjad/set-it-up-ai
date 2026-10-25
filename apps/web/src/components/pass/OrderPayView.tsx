"use client";
import { useState } from "react";
import { en, type MessageKey, type whatsappApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { ShopLogo } from "@/components/ui/ShopTile";
import { browserApi } from "@/lib/api/browser";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { PaymentBox, pollUntil } from "./PaymentBox";

/** /pay/order/<orderId>?t=<token>: order summary and card payment for a WhatsApp order. */
export function OrderPayView({ orderId, token, initial }: { orderId: string; token: string; initial: whatsappApi.WhatsappPayView }) {
  const { info, number, t, rich } = useLocaleOrEnglish();
  // Always two decimals on a payment page ($14.00, not $14), unlike the compact shared formatter.
  const money = (cents: number) => new Intl.NumberFormat(info.bcp47, { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol" }).format(cents / 100);
  const [data, setData] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const { merchant: shop, order, payment } = data;
  const isPaid = order.paymentStatus === "paid";
  const cancelled = order.status === "cancelled";

  const orderStatus = (st: string) => {
    const key = `orderPay.status.${st}`;
    return key in en ? t(key as MessageKey) : st;
  };

  async function paid() {
    setConfirming(true);
    await pollUntil(async () => {
      const fresh = await browserApi.public.whatsappPay(orderId, token);
      setData(fresh);
      return fresh.order.paymentStatus === "paid";
    });
    setConfirming(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3 pt-2">
        <ShopLogo shop={{ name: shop.name, vertical: "other", logoUrl: shop.logoUrl }} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-strong text-fg"><bdi>{shop.name}</bdi></p>
          <p className="truncate text-meta text-fg-muted">
            {t("orderPay.orderNo", { n: number(order.number) })} · {orderStatus(order.status)}
          </p>
        </div>
      </header>

      {isPaid ? (
        <Banner tone="success" title={t("orderPay.paidTitle")}>
          {rich("orderPay.paidBody", { shop: shop.name })}
        </Banner>
      ) : null}
      {cancelled ? <Banner tone="neutral">{rich("orderPay.cancelled", { shop: shop.name })}</Banner> : null}

      <div className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">{isPaid ? t("orderPay.paid") : t("orderPay.amountDue")}</p>
        <p dir="ltr" className="display text-[48px] leading-none tabular-nums text-fg rtl:text-end"><bdi>{money(order.totalCents)}</bdi></p>
      </div>

      <section aria-label={t("orderPay.yourOrder")} className="rounded-card border border-line px-4">
        <table className="w-full text-body">
          <caption className="sr-only">{t("orderPay.yourOrder")}</caption>
          <tbody>
            {order.items.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-3 pe-2 text-start">{l.name}</td>
                <td className="whitespace-nowrap py-3 pe-2 text-end tabular-nums text-fg-muted">{l.quantity > 1 ? `× ${number(l.quantity)}` : ""}</td>
                <td className="py-3 text-end tabular-nums"><bdi>{money(l.lineTotalCents)}</bdi></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="py-3 text-start text-body-strong text-fg">{t("orderPay.total")}</td>
              <td className="py-3 text-end text-body-strong tabular-nums"><bdi>{money(order.totalCents)}</bdi></td>
            </tr>
          </tfoot>
        </table>
      </section>

      {confirming ? <Banner tone="info">{t("orderPay.confirming")}</Banner> : null}
      {payment?.clientSecret && !isPaid && !cancelled && !confirming ? (
        <PaymentBox paymentIntentId={payment.paymentIntentId} clientSecret={payment.clientSecret} amountCents={payment.amountCents} label={t("orderPay.pay", { amount: money(payment.amountCents) })} onPaid={paid} />
      ) : null}
      {!payment && !isPaid && !cancelled ? <Banner tone="info">{t("orderPay.payAtPickup")}</Banner> : null}
      <p className="text-center text-meta text-fg-muted">{t("orderPay.secure")}</p>
    </div>
  );
}
