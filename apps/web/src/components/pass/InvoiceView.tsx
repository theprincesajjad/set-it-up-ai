"use client";
import { Printer } from "lucide-react";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatMoney, formatPoints } from "@/lib/format";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { ShopLogo } from "@/components/ui/ShopTile";
import { PaymentBox, pollUntil } from "./PaymentBox";

/** /i/<token>: invoice view and pay (customer-web-pass.md §4). */
export function InvoiceView({ token, initial }: { token: string; initial: serviceApi.PublicInvoiceResponse }) {
  const [data, setData] = useState(initial);
  const [payment, setPayment] = useState<serviceApi.PayInvoiceResponse["payment"]>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inv = data.invoice;
  const shop = data.merchant;

  async function reload() {
    const fresh = await browserApi.public.invoice(token);
    setData(fresh);
    return fresh;
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await browserApi.public.payInvoice(token);
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3 pt-2">
        <ShopLogo shop={{ name: shop.name, vertical: "other", logoUrl: shop.logoUrl }} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-strong text-fg">{shop.name}</p>
          <p className="truncate text-meta text-fg-muted">
            Invoice #{inv.number} · {formatDate(inv.createdAt)}
            {data.ticket ? ` · Ticket #${data.ticket.number}` : ""}
          </p>
        </div>
        <StatusBadge domain="invoice" status={inv.status} />
      </header>

      {inv.status === "void" ? <Banner tone="neutral">This invoice was cancelled by {shop.name}.</Banner> : null}
      {inv.status === "paid" ? (
        <Banner tone="success" title={`Paid${inv.paidAt ? ` ${formatDate(inv.paidAt)}` : ""}`}>
          {inv.pointsEarned > 0 ? copy.ok.paid(formatPoints(inv.pointsEarned, "points"), shop.name) : "Thanks. Your receipt is below."}
        </Banner>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">{inv.status === "paid" ? "Paid" : "Amount due"}</p>
        <p className="display text-[48px] leading-none tabular-nums text-fg">{formatMoney(inv.status === "paid" ? inv.totalCents - inv.depositAppliedCents : inv.amountDueCents)}</p>
      </div>

      <section aria-label="Invoice" className="rounded-card border border-line px-4">
        <table className="w-full text-body">
          <caption className="sr-only">Line items</caption>
          <tbody>
            {inv.lineItems.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-3 pe-2">{l.description}</td>
                <td className="py-3 pe-2 text-end tabular-nums text-fg-muted">{l.quantity > 1 ? `× ${l.quantity}` : ""}</td>
                <td className="py-3 text-end tabular-nums">{formatMoney(l.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-meta">
            <tr>
              <td colSpan={2} className="pt-3 text-fg-muted">Subtotal</td>
              <td className="pt-3 text-end tabular-nums">{formatMoney(inv.subtotalCents)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="text-fg-muted">HST</td>
              <td className="text-end tabular-nums">{formatMoney(inv.taxCents)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="pt-1 pb-3 text-body-strong text-fg">Total</td>
              <td className="pt-1 pb-3 text-end text-body-strong tabular-nums">{formatMoney(inv.totalCents)}</td>
            </tr>
            {inv.depositAppliedCents > 0 ? (
              <tr>
                <td colSpan={2} className="pb-3 text-fg-muted">Deposit paid</td>
                <td className="pb-3 text-end tabular-nums text-fg">−{formatMoney(inv.depositAppliedCents)}</td>
              </tr>
            ) : null}
          </tfoot>
        </table>
      </section>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {inv.status === "open" ? (
        payment ? (
          <PaymentBox paymentIntentId={payment.paymentIntentId} clientSecret={payment.clientSecret} amountCents={payment.amountCents} onPaid={paid} />
        ) : data.canPay ? (
          <Button size="lg" fullWidth loading={busy} onClick={start}>
            {`Pay ${formatMoney(inv.amountDueCents)}`}
          </Button>
        ) : (
          <Banner tone="info">Pay at the counter when you pick up. {shop.phone ? `Questions? Call ${shop.name} at ${shop.phone}.` : ""}</Banner>
        )
      ) : null}
      {inv.status === "paid" ? (
        <Button variant="secondary" size="lg" fullWidth iconStart={Printer} onClick={() => window.print()}>
          Print receipt
        </Button>
      ) : null}
      <p className="text-center text-meta text-fg-muted">Payments processed securely by Stripe.</p>
    </div>
  );
}
