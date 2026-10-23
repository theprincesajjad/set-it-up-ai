"use client";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { Panel, StatusDot } from "@/components/dashboard/kit";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/format";

/** The ticket's invoices, with the 409 over_estimate message shown in plain words. */
export function InvoicePanel({ invoices, hasApprovedQuote, busy, error, canAct, onCreate, onMarkPaid }: { invoices: serviceApi.InvoiceDto[]; hasApprovedQuote: boolean; busy: boolean; error: string | null; canAct: boolean; onCreate: () => void; onMarkPaid: (id: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const open = invoices.find((i) => i.status === "open" || i.status === "draft");
  return (
    <Panel title="Invoice">
      {invoices.length ? (
        <ul className="divide-y divide-line">
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-meta">
              <StatusDot domain="invoice" status={i.status} />
              <span className="flex-1 tabular">#{i.number} · {formatMoney(i.totalCents)}{i.depositAppliedCents ? ` (deposit ${formatMoney(i.depositAppliedCents)})` : ""} · due {formatMoney(i.amountDueCents)}{i.tipCents ? ` · tip ${formatMoney(i.tipCents)}` : ""}</span>
              {i.status === "open" && canAct ? (
                confirm === i.id ? (
                  <Button size="sm" loading={busy} onClick={() => { onMarkPaid(i.id); setConfirm(null); }}>Confirm paid, {formatMoney(i.amountDueCents)}</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setConfirm(i.id)}>Paid at counter</Button>
                )
              ) : null}
              {i.payUrl ? <a href={i.payUrl} className="text-fg underline" target="_blank" rel="noreferrer">Pay link</a> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <div className="mt-3"><Banner tone="danger" title="This invoice needs a new approval">{error}</Banner></div> : null}
      {!open && hasApprovedQuote && canAct ? (
        <Button className="mt-3" loading={busy} onClick={onCreate}>Send invoice from quote</Button>
      ) : !invoices.length ? (
        <p className="text-meta text-fg-muted">Send the invoice from the approved quote when the work is done. Extra lines are added there, and anything past the 10% limit goes back to the customer as a new quote to approve.</p>
      ) : null}
    </Panel>
  );
}
