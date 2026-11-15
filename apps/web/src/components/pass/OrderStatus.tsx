"use client";
import { useEffect, useState } from "react";
import type { MessageKey, commerceApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { formatMoney, formatTime } from "@/lib/format";
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
        statusLabel={order.merchantVertical === "grocery" && (order.status === "accepted" || order.status === "preparing") ? t("gr.order.cutting") : t(`ui.order.${order.status}` as MessageKey)}
        cutting={order.merchantVertical === "grocery"}
        number={order.number}
        pickupAt={order.pickupAt}
        shopName={order.merchantName}
        cancelReason={order.cancelReason}
        headingLevel={1}
        refundCents={order.status === "refunded" || (order.status === "cancelled" && order.paymentStatus === "refunded") ? order.totalCents : null}
      />
      {!TERMINAL.has(order.status) ? <PickupDetails order={order} /> : null}
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
        {/* The lines add up to the total: subtotal, discount, tax, tip and the card service fee when there is one. */}
        <dl className="flex flex-col gap-1.5 border-t border-line py-3 text-body text-fg-muted">
          {[
            { label: t("cart.subtotal"), cents: order.subtotalCents, show: true, sign: "" },
            { label: t("wp.ui.discount"), cents: order.discountCents, show: order.discountCents > 0, sign: "−" },
            { label: t("rc.ca.tax"), cents: order.taxCents, show: order.taxCents > 0, sign: "" },
            { label: t("sv.i.tipLine"), cents: order.tipCents, show: order.tipCents > 0, sign: "" },
            { label: t("wp.os.cardFee"), cents: order.customerFeeCents, show: order.customerFeeCents > 0, sign: "" },
          ]
            .filter((r) => r.show)
            .map((r) => (
              <div key={r.label} className="flex justify-between gap-3">
                <dt>{r.label}</dt>
                <dd className="tabular-nums">{r.sign}{locale === "en" ? formatMoney(r.cents) : money(r.cents)}</dd>
              </div>
            ))}
          <div className="flex justify-between gap-3 pt-1.5 text-body-strong text-fg">
            <dt>{t("cart.total")}</dt>
            <dd className="tabular-nums">{locale === "en" ? formatMoney(order.totalCents) : money(order.totalCents)}</dd>
          </div>
        </dl>
        <p className="pb-3 text-meta text-fg-muted">{order.paymentMethod === "in_app" ? (order.paymentStatus === "paid" ? t("wp.os.paid") : t("wp.os.pending")) : t("checkout.payAtPickup")}</p>
        {order.pointsEarned > 0 ? <p className="-mt-2 pb-3 text-meta font-semibold text-points-text">{t("wp.os.earned", { amount: unitsText(locale, order.pointsEarned, order.pointsTerminology ?? "points", false) })}</p> : null}
      </section>
      {/* Not a dead end: back to the shop's menu and to the wallet. */}
      <nav aria-label={order.merchantName} className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {order.merchantSlug ? (
          <Link href={`/shops/${encodeURIComponent(order.merchantSlug)}`} className="inline-flex min-h-11 items-center gap-1 text-meta-strong text-fg underline underline-offset-2 focus-visible:focus-ring">
            {t("wp.os.backToShop", { shop: order.merchantName })}
          </Link>
        ) : null}
        <Link href="/me" className="inline-flex min-h-11 items-center text-meta-strong text-fg underline underline-offset-2 focus-visible:focus-ring">
          {t("sh.fs.ctaCard")}
        </Link>
      </nav>
    </div>
  );
}

/** What a family needs at the counter: when, where, a phone to call, the number to say, and what the order earns. */
function PickupDetails({ order }: { order: commerceApi.OrderDto }) {
  const { t, locale, time, number } = useLocaleOrEnglish();
  const slug = order.merchantSlug ? encodeURIComponent(order.merchantSlug) : null;
  const tel = order.shopPhone ? order.shopPhone.replace(/[^\d+]/g, "") : "";
  const maps = order.shopAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.merchantName} ${order.shopAddress}`)}` : "";
  const estimate = order.pointsEstimate ?? 0;
  return (
    <section aria-label={t("wp.os.pickupDetails")} className="flex flex-col gap-4 rounded-card border border-line p-4">
      <dl className="flex flex-col gap-3 text-body">
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption font-semibold text-fg-muted">{t("wp.os.when")}</dt>
          <dd className="text-body-strong text-fg">{order.pickupAt ? t("wp.os.pickupAt", { time: locale === "en" ? formatTime(order.pickupAt) : time(order.pickupAt) }) : t("wp.os.pickupAsap")}</dd>
        </div>
        {order.shopAddress ? (
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption font-semibold text-fg-muted">{t("wp.os.where")}</dt>
            <dd className="text-body-strong text-fg"><bdi>{order.shopAddress}</bdi></dd>
          </div>
        ) : null}
      </dl>
      <p className="text-meta text-fg-muted">{t("wp.os.showNumber", { number: number(order.number) })}</p>
      {tel || maps ? (
        <div className="flex flex-wrap gap-2">
          {tel ? (
            <Button variant="secondary" size="md" href={`tel:${tel}`}>
              {t("wp.os.callShop", { shop: order.merchantName })}
            </Button>
          ) : null}
          {maps ? (
            <Button variant="secondary" size="md" href={maps}>
              {t("wp.os.directions")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {estimate > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-meta text-fg">{order.isMember ? t("wp.os.willEarn", { amount: unitsText(locale, estimate, order.pointsTerminology ?? "points", false) }) : t("wp.os.joinPrompt", { shop: order.merchantName, amount: unitsText(locale, estimate, order.pointsTerminology ?? "points", false) })}</p>
          {!order.isMember && slug ? (
            <Button variant="secondary" size="md" href={`/shops/${slug}`} className="self-start">
              {t("wp.os.joinCta")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
