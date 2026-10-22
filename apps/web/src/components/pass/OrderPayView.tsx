"use client";
import { useState } from "react";
import type { whatsappApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { ShopLogo } from "@/components/ui/ShopTile";
import { browserApi } from "@/lib/api/browser";
import { useLocale } from "@/lib/i18n";
import { PaymentBox, pollUntil } from "./PaymentBox";
import { COPY, fill } from "./restaurantCopy";

/** /pay/order/<orderId>?t=<token>: order summary and card payment for a WhatsApp order. */
export function OrderPayView({ orderId, token, initial }: { orderId: string; token: string; initial: whatsappApi.WhatsappPayView }) {
  const { locale, money, number } = useLocale();
  const c = COPY[locale];
  const [data, setData] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const { merchant: shop, order, payment } = data;
  const isPaid = order.paymentStatus === "paid";
  const cancelled = order.status === "cancelled";

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
          <p className="truncate text-body-strong text-fg">{shop.name}</p>
          <p className="truncate text-meta text-fg-muted">
            {fill(c.orderNo, { n: number(order.number) })} · {c.status[order.status] ?? order.status}
          </p>
        </div>
      </header>

      {isPaid ? (
        <Banner tone="success" title={c.paidTitle}>
          {fill(c.paidBody, { shop: shop.name })}
        </Banner>
      ) : null}
      {cancelled ? <Banner tone="neutral">{fill(c.cancelled, { shop: shop.name })}</Banner> : null}

      <div className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">{isPaid ? c.paid : c.amountDue}</p>
        <p className="display text-[48px] leading-none tabular-nums text-fg">{money(order.totalCents)}</p>
      </div>

      <section aria-label={c.yourOrder} className="rounded-card border border-line px-4">
        <table className="w-full text-body">
          <caption className="sr-only">{c.yourOrder}</caption>
          <tbody>
            {order.items.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-3 pe-2 text-start">{l.name}</td>
                <td className="py-3 pe-2 text-end tabular-nums text-fg-muted">{l.quantity > 1 ? `× ${number(l.quantity)}` : ""}</td>
                <td className="py-3 text-end tabular-nums">{money(l.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="py-3 text-start text-body-strong text-fg">{c.total}</td>
              <td className="py-3 text-end text-body-strong tabular-nums">{money(order.totalCents)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {confirming ? <Banner tone="info">{c.confirming}</Banner> : null}
      {payment?.clientSecret && !isPaid && !cancelled && !confirming ? (
        <PaymentBox paymentIntentId={payment.paymentIntentId} clientSecret={payment.clientSecret} amountCents={payment.amountCents} label={fill(c.pay, { amount: money(payment.amountCents) })} onPaid={paid} />
      ) : null}
      {!payment && !isPaid && !cancelled ? <Banner tone="info">{c.payAtPickup}</Banner> : null}
      <p className="text-center text-meta text-fg-muted">{c.secure}</p>
    </div>
  );
}
