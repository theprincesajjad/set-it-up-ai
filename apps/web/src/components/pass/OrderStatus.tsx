"use client";
import { useEffect, useState } from "react";
import type { commerceApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { browserApi } from "@/lib/api/browser";
import { formatMoney } from "@/lib/format";
import { OrderTracker } from "@/components/ui/OrderTracker";

const TERMINAL = new Set(["picked_up", "cancelled", "refunded"]);

/** Live order status: polls every 10 s until picked up / cancelled. */
export function OrderStatus({ initial }: { initial: commerceApi.OrderDto }) {
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
        statusLabel={copy.orderStatus[order.status] ?? order.status}
        number={order.number}
        pickupAt={order.pickupAt}
        shopName={order.merchantName}
        cancelReason={order.cancelReason}
        refundCents={order.status === "refunded" || (order.status === "cancelled" && order.paymentStatus === "refunded") ? order.totalCents : null}
      />
      <section aria-label="Order" className="rounded-card border border-line px-4 py-1">
        <ul className="flex flex-col divide-y divide-line text-body">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-3">
              <span>
                {i.quantity} × {i.name}
                {i.modifiers.length ? <span className="block text-meta text-fg-muted">{i.modifiers.map((m) => m.option).join(", ")}</span> : null}
              </span>
              <span className="tabular-nums">{formatMoney(i.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line py-3 text-body-strong">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(order.totalCents)}</span>
        </div>
        <p className="pb-3 text-meta text-fg-muted">{order.paymentMethod === "in_app" ? (order.paymentStatus === "paid" ? "Paid in the app" : "Payment pending") : "Pay at pickup"}</p>
        {order.pointsEarned > 0 ? <p className="-mt-2 pb-3 text-meta font-semibold text-accent-text">You earned {order.pointsEarned} pts</p> : null}
      </section>
    </div>
  );
}
