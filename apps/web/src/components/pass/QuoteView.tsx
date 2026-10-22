"use client";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { browserApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { QuoteApproval } from "@/components/ui/QuoteApproval";
import { ShopLogo } from "@/components/ui/ShopTile";
import { Timeline, ticketSteps } from "@/components/ui/Timeline";
import { PaymentBox, pollUntil } from "./PaymentBox";

function itemTitle(t: serviceApi.PublicQuoteResponse["ticket"]) {
  const d = t.itemDetails ?? {};
  const item = [d.make, d.model].filter(Boolean).join(" ");
  return item || t.issue;
}

/** /q/<token>: review, e-sign (typed name) or decline, then pay the deposit if one is due. */
export function QuoteView({ token, initial }: { token: string; initial: serviceApi.PublicQuoteResponse }) {
  const [data, setData] = useState(initial);
  const [deposit, setDeposit] = useState<serviceApi.DepositPaymentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const shop = data.merchant;
  const q = data.quote;
  const status = data.expired && q.status === "sent" ? "expired" : q.status;
  const title = `Quote for ${itemTitle(data.ticket)}`;
  const depositPaid = !!q.depositPaidAt;

  async function reload() {
    const fresh = await browserApi.public.quote(token);
    setData(fresh);
    return fresh;
  }

  async function approve(signatureName: string) {
    setError(null);
    try {
      const r = await browserApi.public.approveQuote(token, signatureName);
      setDeposit(r.deposit);
      await reload();
      setNotice(r.deposit ? null : copy.ok.quoteApproved(shop.name));
    } catch (e) {
      if (isApiError(e) && e.status === 409) await reload().catch(() => undefined);
      setError(errorMessage(e));
    }
  }

  async function decline(reason: string | undefined) {
    setError(null);
    try {
      await browserApi.public.declineQuote(token, reason);
      await reload();
      setNotice(`Declined. ${shop.name} will let you know when to pick up your item.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function resumeDeposit() {
    setResuming(true);
    try {
      const r = await browserApi.public.quoteDeposit(token);
      setDeposit(r.deposit);
      if (!r.deposit) await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setResuming(false);
    }
  }

  async function paid() {
    const ok = await pollUntil(async () => !!(await reload()).quote.depositPaidAt);
    setDeposit(null);
    setNotice(ok ? `Approved. ${shop.name} will start now.` : "Payment received. It can take a minute to show here.");
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <ShopLogo shop={{ name: shop.name, vertical: "repair_electronics", logoUrl: shop.logoUrl }} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-h3 text-fg">{shop.name}</p>
          <p className="text-body-sm text-fg-muted">
            Ticket #{data.ticket.number} · {itemTitle(data.ticket)}
          </p>
        </div>
        <StatusBadge domain="quote" status={status} />
      </header>

      {notice ? (
        <Banner tone="success" icon={CircleCheck}>
          {notice}
        </Banner>
      ) : null}

      <QuoteApproval
        title={title}
        ticketLabel={data.ticket.issue}
        shop={{ name: shop.name, phone: shop.phone }}
        lineItems={q.lineItems}
        subtotalCents={q.subtotalCents}
        taxCents={q.taxCents}
        totalCents={q.totalCents}
        depositCents={q.depositCents}
        diagnosis={q.diagnosis}
        status={status}
        expiresAt={q.expiresAt}
        respondedAt={q.respondedAt}
        signatureName={q.signatureName}
        canRespond={data.canRespond}
        onApprove={approve}
        onDecline={decline}
        error={error}
      />

      {deposit ? (
        <section aria-labelledby="deposit" className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-sm">
          <h2 id="deposit" className="text-h3 text-fg">
            Pay your {formatMoney(deposit.amountCents)} deposit
          </h2>
          <PaymentBox paymentIntentId={deposit.paymentIntentId} clientSecret={deposit.clientSecret} amountCents={deposit.amountCents} label={`Pay ${formatMoney(deposit.amountCents)} deposit`} onPaid={paid} />
        </section>
      ) : q.status === "approved" && q.depositCents > 0 && !depositPaid && data.depositDue ? (
        <Button size="lg" fullWidth loading={resuming} onClick={resumeDeposit}>
          {`Pay ${formatMoney(q.depositCents)} deposit`}
        </Button>
      ) : null}
      {q.status === "approved" && depositPaid ? <Banner tone="success">Deposit of {formatMoney(q.depositCents)} paid.</Banner> : null}

      {q.status === "approved" || q.status === "declined" ? (
        <section aria-labelledby="progress" className="rounded-lg bg-surface p-4 shadow-sm">
          <h2 id="progress" className="mb-3 text-title text-fg">
            Repair progress
          </h2>
          <Timeline steps={ticketSteps(data.ticket.status, copy.ticketStatus)} />
        </section>
      ) : null}
    </div>
  );
}
