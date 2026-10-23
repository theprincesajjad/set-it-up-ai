"use client";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { Capsules, Dot } from "@/components/dashboard/kit";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney } from "@/lib/format";

type Method = "cash" | "card_terminal" | "other";

/** Right-hand detail for one invoice: lines, amount due, record a counter payment, pay link, text again, void, reminder log. */
export function InvoiceDetail({ row, canVoid, busy, error, copied, onPay, onCopy, onText, onVoid, ticketHref }: { row: serviceApi.InvoiceRowDto; canVoid: boolean; busy: boolean; error: string | null; copied: boolean; onPay: (m: Method) => void; onCopy: () => void; onText: () => void; onVoid: () => Promise<unknown>; ticketHref: string | null }) {
  const [method, setMethod] = useState<Method>("card_terminal");
  const [voiding, setVoiding] = useState(false);
  const open = row.status === "open";
  const lien = open && row.overdue;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-headline text-fg">Invoice #{row.number}</h2>
          <p className="text-meta text-fg-muted">
            {row.customerName ?? "Customer"}{row.ticketNumber ? <> · {ticketHref ? <a className="underline-offset-2 hover:underline" href={ticketHref}>ticket #{row.ticketNumber}</a> : `ticket #${row.ticketNumber}`}</> : null}{row.itemLabel ? `, ${row.itemLabel}` : ""}
          </p>
        </div>
        <Dot tone={row.status === "paid" ? "positive" : row.status === "open" ? "info" : "neutral"}>{row.status === "open" ? "Open" : row.status === "paid" ? "Paid" : row.status === "draft" ? "Draft" : "Void"}</Dot>
      </div>
      <dl className="divide-y divide-line border-y border-line text-body">
        {row.lineItems.map((l, i) => (
          <div key={i} className="flex justify-between gap-3 py-2.5">
            <dt className={cn(l.totalCents < 0 ? "text-positive" : "text-fg")}>{l.description}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</dt>
            <dd className={cn("tabular", l.totalCents < 0 ? "text-positive" : "text-fg")}>{formatMoney(l.totalCents)}</dd>
          </div>
        ))}
        {row.taxCents > 0 ? (
          <div className="flex justify-between gap-3 py-2.5 text-fg-muted"><dt>Tax</dt><dd className="tabular">{formatMoney(row.taxCents)}</dd></div>
        ) : null}
        {row.depositAppliedCents > 0 ? (
          <div className="flex justify-between gap-3 py-2.5 text-positive"><dt>Deposit paid on approval</dt><dd className="tabular">-{formatMoney(row.depositAppliedCents)}</dd></div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 py-3"><dt className="text-headline text-fg">{row.status === "paid" ? "Paid" : "Amount due"}</dt><dd className="text-[28px] font-semibold tabular text-fg">{formatMoney(row.status === "paid" ? row.totalCents - row.depositAppliedCents : row.amountDueCents)}</dd></div>
        {row.tipCents > 0 ? <div className="flex justify-between gap-3 py-2.5 text-fg-muted"><dt>Tip (not taxed, no points)</dt><dd className="tabular">{formatMoney(row.tipCents)}</dd></div> : null}
      </dl>
      {open ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-meta text-fg-muted">Paid at the counter with</p>
            <Capsules label="Counter payment method" value={method} onChange={setMethod} options={[{ value: "cash", label: "Cash" }, { value: "card_terminal", label: "Debit terminal" }, { value: "other", label: "Other" }]} />
          </div>
          <Button size="lg" fullWidth loading={busy} onClick={() => onPay(method)}>Record payment, {formatMoney(row.amountDueCents)}</Button>
          <div className="flex flex-wrap gap-2">
            {row.payUrl ? <Button variant="secondary" size="sm" onClick={onCopy}>{copied ? "Copied" : "Copy pay link"}</Button> : null}
            <Button variant="secondary" size="sm" loading={busy} onClick={onText}>Text again</Button>
            {canVoid ? <Button variant="secondary" size="sm" onClick={() => setVoiding(true)}>Void</Button> : null}
          </div>
        </>
      ) : row.status === "draft" ? (
        <div className="flex gap-2"><Button size="sm" loading={busy} onClick={onText}>Send to customer</Button>{canVoid ? <Button variant="secondary" size="sm" onClick={() => setVoiding(true)}>Void</Button> : null}</div>
      ) : row.status === "paid" ? (
        <p className="text-meta text-fg-muted">Paid {formatDate(row.paidAt)}{row.pointsEarned ? `. The customer earned ${row.pointsEarned} points.` : "."}</p>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {open && row.ticketNumber ? (
        <div className="rounded-card bg-bg-subtle p-3 text-meta text-fg-muted">
          <p className="text-meta-strong text-fg">Pickup reminders for this ticket</p>
          <p className="mt-0.5">{row.lastActivity}. Day 3 and day 7 texts go out on their own while it sits ready.</p>
          {lien ? <p className="mt-2 text-caption">Still unpaid and uncollected 60 days after it was ready, you can start your notice before sale under the Ontario Repair and Storage Liens Act. We never sell on your behalf. Check the steps with your lawyer.</p> : null}
        </div>
      ) : null}
      <ConfirmDialog open={voiding} onClose={() => setVoiding(false)} title={`Void invoice #${row.number}?`} body="The customer's pay link stops working. A paid invoice can't be voided." confirmLabel="Void invoice" danger onConfirm={onVoid} />
    </div>
  );
}
