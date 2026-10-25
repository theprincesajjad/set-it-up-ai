"use client";
import { useEffect, useState } from "react";
import type { MessageKey, commerceApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { formatMoney } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { unitsText } from "@/lib/units";
import { OrderTracker } from "@/components/ui/OrderTracker";

const TERMINAL = new Set(["picked_up", "cancelled", "refunded"]);

/** Live order status: polls every 10 s until picked up / cancelled. */
export function OrderStatus({ initial }: { initial: commerceApi.OrderDto }) {
  const { t, locale, money } = useLocaleOrEnglish();
  const [order, setOrder] = useState(initial);
  useEffect(() => {
    if (TERMINAL.has(order.status)) return;
    const t = setInterval(async () => {
      try {
        setOrder(await browserApi.me.order(order.id));
      } catch {
        /* keep last known */
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [order.id, order.status]);

  return (
    <div className="flex flex-col gap-6 pt-2">
      <OrderTracker
        status={order.status}
        statusLabel={t(`ui.order.${order.status}` as MessageKey)}
        number={order.number}
        pickupAt={order.pickupAt}
        shopName={order.merchantName}
        cancelReason={order.cancelReason}
        refundCents={order.status === "refunded" || (order.status === "cancelled" && order.paymentStatus === "refunded") ? order.totalCents : null}
      />
      <section aria-label={t("wp.os.order")} className="rounded-card border border-line px-4 py-1">
        <ul className="flex flex-col divide-y divide-line text-body">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-3">
              <span>
                {i.quantity} × {i.name}
                {i.modifiers.length ? <span className="block text-meta text-fg-muted">{i.modifiers.map((m) => m.option).join(", ")}</span> : null}
              </span>
              <span className="tabular-nums">{locale === "en" ? formatMoney(i.lineTotalCents) : money(i.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line py-3 text-body-strong">
          <span>{t("cart.total")}</span>
          <span className="tabular-nums">{locale === "en" ? formatMoney(order.totalCents) : money(order.totalCents)}</span>
        </div>
        <p className="pb-3 text-meta text-fg-muted">{order.paymentMethod === "in_app" ? (order.paymentStatus === "paid" ? t("wp.os.paid") : t("wp.os.pending")) : t("checkout.payAtPickup")}</p>
        {order.pointsEarned > 0 ? <p className="-mt-2 pb-3 text-meta font-semibold text-accent-text">{t("wp.os.earned", { amount: unitsText(locale, order.pointsEarned, "points") })}</p> : null}
      </section>
    </div>
  );
}
