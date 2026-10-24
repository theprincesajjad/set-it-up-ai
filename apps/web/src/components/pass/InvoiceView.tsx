"use client";
import { Printer } from "lucide-react";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ShopLogo } from "@/components/ui/ShopTile";
import { BigNumber, Heading, useFmt } from "@/components/restaurant/ui";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { PaymentBox, pollUntil } from "./PaymentBox";
import { TipPicker, type TipValue } from "./TipPicker";

const TZ = "America/Toronto";

/** /i/<token>: invoice view and pay. Salon-type shops add a tip picker; the points line says tax and tips do not earn. */
export function InvoiceView({ token, initial }: { token: string; initial: serviceApi.PublicInvoiceResponse }) {
  const { t, moneyExact: money, date, number } = useFmt();
  const [data, setData] = useState(initial);
  const [payment, setPayment] = useState<serviceApi.PayInvoiceResponse["payment"]>(null);
  const [tip, setTip] = useState<TipValue>({ kind: "none", cents: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inv = data.invoice;
  const shop = data.merchant;
  const tipOn = data.tip.enabled && inv.status === "open" && data.canPay;
  const total = inv.amountDueCents + (tipOn ? tip.cents : 0);
  const stylist = data.tip.staff?.name ?? null;

  async function reload() {
    const fresh = await browserApi.public.invoice(token);
    setData(fresh);
    return fresh;
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await browserApi.public.payInvoice(token, tipOn ? tip.cents : 0);
      setData((d) => ({ ...d, invoice: r.invoice }));
      setPayment(r.payment);
      if (!r.payment) await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function paid() {
    await pollUntil(async () => (await reload()).invoice.status === "paid");
    setPayment(null);
  }

  const taxLabel = data.taxLabel ?? "HST";
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <ShopLogo shop={{ name: shop.name, vertical: shop.vertical, logoUrl: shop.logoUrl }} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-strong text-fg"><bdi>{shop.name}</bdi></p>
          <p className="truncate text-meta text-fg-muted">
            {stylist
              ? t("sv.i.kickerStaff", { n: inv.number, date: date(inv.createdAt, { weekday: "short", month: "short", day: "numeric" }, TZ), name: stylist })
              : t("sv.i.kicker", { n: inv.number, date: date(inv.createdAt, { weekday: "short", month: "short", day: "numeric" }, TZ) })}
            {data.ticket ? ` · #${data.ticket.number}` : ""}
          </p>
        </div>
      </header>
      <Heading>{t("sv.i.title", { shop: shop.name })}</Heading>

      {inv.status === "void" ? <Banner tone="neutral">{t("sv.i.void", { shop: shop.name })}</Banner> : null}
      {inv.status === "paid" ? (
        <Banner tone="success" title={t("sv.i.paidBanner", { date: inv.paidAt ? date(inv.paidAt, { month: "short", day: "numeric" }, TZ) : "" })}>
          {inv.pointsEarned > 0 ? t("sv.i.paidPoints", { n: number(inv.pointsEarned), shop: shop.name }) : t("sv.i.paidThanks")}
        </Banner>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">{inv.status === "paid" ? t("sv.i.paid") : t("sv.i.amountDue")}</p>
        <BigNumber className="text-[48px]">{money(inv.status === "paid" ? inv.totalCents - inv.depositAppliedCents : inv.amountDueCents)}</BigNumber>
      </div>

      <section aria-label={t("sv.i.title", { shop: shop.name })} className="rounded-card border border-line px-4">
        <ul>
          {inv.lineItems.map((l, i) => (
            <li key={i} className={cn("flex items-start justify-between gap-4 py-3", i > 0 && "border-t border-line")}>
              <span className={cn("text-body", l.totalCents < 0 ? "text-positive-text" : "text-fg")}>{l.description}{l.quantity > 1 ? <span className="text-fg-muted"> × {number(l.quantity)}</span> : null}</span>
              <span className={cn("shrink-0 text-body tabular-nums", l.totalCents < 0 ? "text-positive-text" : "text-fg")}>{money(l.totalCents)}</span>
            </li>
          ))}
          {inv.taxCents > 0 ? (
            <li className="flex justify-between gap-4 border-t border-line py-3 text-body text-fg-muted"><span><bdi>{taxLabel}</bdi></span><span className="tabular-nums">{money(inv.taxCents)}</span></li>
          ) : null}
          {inv.depositAppliedCents > 0 ? (
            <li className="flex justify-between gap-4 border-t border-line py-3 text-body text-positive-text"><span>{t("sv.i.depositPaid")}</span><span className="tabular-nums">−{money(inv.depositAppliedCents)}</span></li>
          ) : null}
          {inv.tipCents > 0 && inv.status === "paid" ? (
            <li className="flex justify-between gap-4 border-t border-line py-3 text-body text-fg-muted"><span>{t("sv.i.tipLine")}</span><span className="tabular-nums">{money(inv.tipCents)}</span></li>
          ) : null}
        </ul>
      </section>

      {tipOn ? (
        <TipPicker
          presets={data.tip.presets}
          baseCents={data.tip.baseCents}
          staffName={stylist}
          value={tip}
          onChange={(v) => {
            setTip(v);
            // A different tip is a different payment: start again from the button.
            setPayment(null);
          }}
        />
      ) : null}

      {inv.status === "open" && data.canPay ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-headline text-fg">{t("sv.i.total")}</span>
          <span className="text-headline tabular-nums text-fg" dir="ltr">{money(total)}</span>
        </div>
      ) : null}
      {inv.status === "open" && data.pointsPreview > 0 ? <p className="text-meta text-accent-text">{t("sv.i.points", { n: number(data.pointsPreview) })}</p> : null}

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {inv.status === "open" ? (
        payment ? (
          <PaymentBox paymentIntentId={payment.paymentIntentId} clientSecret={payment.clientSecret} amountCents={payment.amountCents} label={t("sv.i.pay", { amount: money(payment.amountCents) })} onPaid={paid} />
        ) : data.canPay ? (
          <Button size="lg" fullWidth loading={busy} onClick={start}>{t("sv.i.pay", { amount: money(total) })}</Button>
        ) : (
          <Banner tone="info">{t("sv.i.counter")}{shop.phone ? ` ${shop.phone}` : ""}</Banner>
        )
      ) : null}
      {inv.status === "paid" ? <Button variant="secondary" size="lg" fullWidth iconStart={Printer} onClick={() => window.print()}>{t("sv.i.print")}</Button> : null}
      <p className="text-center text-meta text-fg-muted">{t("payIntent.secure")}</p>
    </div>
  );
}
