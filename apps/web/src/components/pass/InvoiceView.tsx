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
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <ShopLogo shop={{ name: shop.name, vertical: "other", logoUrl: shop.logoUrl }} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-h3 text-fg">{shop.name}</p>
          <p className="text-body-sm text-fg-muted">
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

      <section aria-label="Invoice" className="rounded-lg bg-surface p-4 shadow-sm md:p-6">
        <table className="w-full text-body-sm">
          <caption className="sr-only">Line items</caption>
          <tbody>
            {inv.lineItems.map((l, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2 pe-2">{l.description}</td>
                <td className="py-2 pe-2 text-end tabular-nums text-fg-muted">{l.quantity > 1 ? `× ${l.quantity}` : ""}</td>
                <td className="py-2 text-end tabular-nums">{formatMoney(l.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-3 text-fg-muted">Subtotal</td>
              <td className="pt-3 text-end tabular-nums">{formatMoney(inv.subtotalCents)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="text-fg-muted">HST</td>
              <td className="text-end tabular-nums">{formatMoney(inv.taxCents)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="text-fg-muted">Total</td>
              <td className="text-end tabular-nums">{formatMoney(inv.totalCents)}</td>
            </tr>
            {inv.depositAppliedCents > 0 ? (
              <tr>
                <td colSpan={2} className="text-success">Deposit paid</td>
                <td className="text-end tabular-nums text-success">−{formatMoney(inv.depositAppliedCents)}</td>
              </tr>
            ) : null}
          </tfoot>
        </table>
        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-title">{inv.status === "paid" ? "Paid" : "Amount due"}</span>
          <span className="text-h1 tabular-nums">{formatMoney(inv.status === "paid" ? inv.totalCents - inv.depositAppliedCents : inv.amountDueCents)}</span>
        </div>
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
        <Button variant="secondary" iconStart={Printer} onClick={() => window.print()}>
          Print receipt
        </Button>
      ) : null}
      <p className="text-caption text-fg-muted">Payments processed securely by Stripe.</p>
    </div>
  );
}
