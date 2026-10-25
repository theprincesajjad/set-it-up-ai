"use client";
import { useEffect, useState } from "react";
import type { commerceApi } from "@ll/shared";
import { MemberWalletButtons } from "@/components/pass/MemberWalletButtons";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { pickupCode } from "@/lib/restaurant/order";
import { whatsappShareUrl } from "@/lib/restaurant/share";
import { TZ } from "@/lib/restaurant/util";
import { BigNumber, Heading, ShopHead, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);
const WINDOW_MS = 60 * 60_000;

/**
 * Confirmation for a degh pre-order (frame 12c): pickup code, what was booked, deposit paid and balance, share with the family on
 * WhatsApp, add to calendar, and the cancel rule. Polls while the deposit is still landing.
 */
export function ReservedView({ initial }: { initial: commerceApi.OrderDto }) {
  const { t, money, number, date } = useFmt();
  const [order, setOrder] = useState(initial);
  const [origin, setOrigin] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelled = order.status === "cancelled" || order.status === "refunded";
  const reserved = !cancelled && (!!order.depositPaidAt || order.paymentStatus === "paid" || order.depositCents === 0);
  const slug = order.merchantSlug ?? "";

  useEffect(() => {
    // The origin only exists in the browser; the share link needs it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    browserClient.get<{ optedIn: boolean }>(`/v1/me/merchants/${encodeURIComponent(order.merchantId)}/whatsapp-consent`).then((c) => setOptedIn(!!c.optedIn)).catch(() => undefined);
  }, [order.merchantId]);

  useEffect(() => {
    if (reserved || cancelled) return;
    const timer = setInterval(() => void api.order(order.id).then(setOrder).catch(() => undefined), 3000);
    return () => clearInterval(timer);
  }, [reserved, cancelled, order.id]);

  const start = order.pickupAt ? new Date(order.pickupAt) : null;
  const end = start ? new Date(start.getTime() + WINDOW_MS) : null;
  const dayLabel = start ? date(start, { weekday: "long", month: "long", day: "numeric" }, TZ) : "";
  const hour = (d: Date) => date(d, { hour: "numeric", ...(d.getUTCMinutes() ? { minute: "2-digit" } : {}) }, TZ);
  const free = order.cancelFreeUntil ? new Date(order.cancelFreeUntil) : null;
  const canCancel = !cancelled && (order.status === "pending" || order.status === "accepted") && !!free && free.getTime() > now;
  /** No trailing full stop ("2:00 p.m."): the sentence adds its own. */
  const stamp = (d: Date) => date(d, { weekday: "long", hour: "numeric", minute: "2-digit" }, TZ).replace(/\.$/, "");
  const shopLink = origin && slug ? `${origin}/shops/${encodeURIComponent(slug)}` : "";
  const share = start ? whatsappShareUrl(t("rs.res.shareMessage", { shop: order.merchantName, day: dayLabel, time: hour(start), link: shopLink }).trim()) : "";

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      setOrder(await api.cancelOrder(order.id));
      setConfirm(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ShopHead shop={{ name: order.merchantName }} href={slug ? `/shops/${encodeURIComponent(slug)}` : undefined} />
      <div className="flex flex-col gap-2">
        <Heading>{cancelled ? t("rs.res.cancelled") : reserved ? t("rs.res.reserved") : t("rs.res.confirming")}</Heading>
        {start && end && !cancelled ? (
          <p className="text-body text-fg-muted">
            {t("rs.res.when", { day: dayLabel, from: hour(start), to: hour(end), shop: order.merchantName, address: order.shopAddress ?? "" }).replace(/,\s*\.$/, ".")}
          </p>
        ) : null}
        {!reserved && !cancelled ? <Banner tone="info">{t("rs.res.confirmingBody")}</Banner> : null}
        {cancelled ? <p className="text-body text-fg-muted">{order.paymentStatus === "refunded" ? t("rs.res.refunded") : t("rs.res.cancelledBody")}</p> : null}
      </div>

      <section aria-label={t("rs.res.details")} className="rounded-sheet border border-line p-4">
        <p className="text-caption font-semibold uppercase text-fg-muted">{t("rs.res.code")}</p>
        <BigNumber className="mt-1 text-[36px]">{pickupCode(order.merchantName, order.number)}</BigNumber>
        <ul className="mt-4 divide-y divide-line border-y border-line text-body">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block break-words text-fg">{i.name}</span>
                {i.modifiers.length ? <span className="block break-words text-meta text-fg-muted">{i.modifiers.map((m) => m.option).join(" · ")}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums text-fg-muted">× {number(i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1 text-body">
          <div className="flex justify-between text-fg-muted">
            <dt>{t("rs.res.depositPaid")}</dt>
            <dd className="tabular-nums">{money(order.depositPaidAt ? order.depositCents + order.customerFeeCents : 0)}</dd>
          </div>
          <div className="flex justify-between text-body-strong text-fg">
            <dt>{t("rs.res.payAtPickup")}</dt>
            <dd className="tabular-nums">{money(order.balanceDueCents)}</dd>
          </div>
        </dl>
      </section>

      {!cancelled && start ? (
        <div className="flex flex-col gap-3">
          {share ? (
            <Button size="lg" fullWidth href={share}>
              {t("rs.res.share")}
            </Button>
          ) : null}
          <Button size="lg" variant="secondary" fullWidth href={`/o/${encodeURIComponent(order.id)}/calendar`}>
            {t("rs.res.calendar")}
          </Button>
          <MemberWalletButtons />
        </div>
      ) : null}

      {optedIn && !cancelled ? (
        <section className="rounded-card bg-bg-subtle px-4 py-3">
          <p className="text-body-strong text-fg">{t("rs.res.whatsappTitle")}</p>
          <p className="text-meta text-fg-muted">{t("rs.res.whatsappBody")}</p>
        </section>
      ) : null}

      {!cancelled ? (
        <div className="flex flex-col gap-3">
          <p className="text-meta text-fg-muted">
            {free && free.getTime() > now ? t("rs.res.cancelRule", { when: stamp(free) }) : free ? t("rs.res.cancelPast", { when: stamp(free) }) : t("rs.res.cancelRuleGeneric")}
          </p>
          {canCancel ? (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => setConfirm(true)}>
              {t("rs.res.cancel")}
            </Button>
          ) : null}
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </div>
      ) : null}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("rs.res.cancelConfirmTitle")}
        description={t("rs.res.cancelConfirmBody")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {t("rs.res.keep")}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void cancel()}>
              {t("rs.res.cancelYes")}
            </Button>
          </>
        }
      />
    </div>
  );
}
