"use client";
import { Check } from "lucide-react";
import type { serviceApi } from "@ll/shared";
import { Dot, Panel } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ageText } from "@/lib/dashboard/tickets";

/** The line above the quote: sent, opened, expires. "Opened, not approved" is the call-now signal. */
export function quoteStatusLine(q: serviceApi.QuoteDto, now: Date): { text: string; tone: "info" | "positive" | "negative" | "neutral" }[] {
  if (q.status === "approved") {
    const a = q.authorizedBy;
    return [{ text: a?.method === "phone" ? `Approved by phone, ${a.name}, ${formatDateTime(a.at)}` : `Approved${q.respondedAt ? ` ${formatDateTime(q.respondedAt)}` : ""}${q.signatureName ? `, signed ${q.signatureName}` : ""}`, tone: "positive" }];
  }
  if (q.status === "declined") return [{ text: `Declined${q.declineReason ? `: ${q.declineReason}` : ""}`, tone: "negative" }];
  if (q.status === "expired") return [{ text: "Expired", tone: "neutral" }];
  if (q.status === "superseded") return [{ text: "Replaced by a newer quote", tone: "neutral" }];
  if (q.status === "draft") return [{ text: "Draft, not sent", tone: "neutral" }];
  const out: { text: string; tone: "info" | "positive" | "negative" | "neutral" }[] = [{ text: q.sentAt ? `Sent ${ageText(q.sentAt, now)} ago by text` : "Sent", tone: "info" }];
  out.push(q.firstViewedAt ? { text: `Opened ${ageText(q.firstViewedAt, now)} ago, not approved`, tone: "info" } : { text: "Not opened yet", tone: "neutral" });
  if (q.expiresAt) {
    const left = new Date(q.expiresAt).getTime() - now.getTime();
    if (left > 0 && left < 36 * 3_600_000) out.push({ text: "Expires soon", tone: "negative" });
  }
  return out;
}

/** The current quote: status line, diagnosis, lines, totals, deposit, the 10% statement, and the actions. */
export function QuotePanel({ quote, customerName, now, busy, canAct, onResend, onApproveByPhone, onPreview, onRevise }: { quote: serviceApi.QuoteDto; customerName: string; now: Date; busy: boolean; canAct: boolean; onResend: () => void; onApproveByPhone: () => void; onPreview: () => void; onRevise: () => void }) {
  const subtotal = quote.subtotalCents;
  const live = quote.status === "sent" || quote.status === "draft" || quote.status === "expired";
  const first = customerName.split(/\s+/)[0] || "customer";
  return (
    <Panel
      title="Quote"
      action={
        <span className="flex max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-1">
          {quoteStatusLine(quote, now).map((s) => (
            <Dot key={s.text} tone={s.tone} className="!whitespace-normal">{s.text}</Dot>
          ))}
        </span>
      }
    >
      {quote.diagnosis ? <p className="text-meta text-fg-muted">{quote.diagnosis}</p> : null}
      <ul className="mt-3 divide-y divide-line border-y border-line" aria-label="Quote lines">
        {quote.lineItems.map((l, i) => (
          <li key={i} className="flex items-baseline justify-between gap-4 py-2.5 text-body">
            <span className={l.totalCents < 0 ? "text-positive-text" : "text-fg"}>{l.description}{l.condition ? <span className="text-fg-muted">, {l.condition}</span> : null}{l.quantity > 1 ? <span className="text-fg-muted"> × {l.quantity}</span> : null}</span>
            <span className={`tabular ${l.totalCents < 0 ? "text-positive-text" : "text-fg"}`}>{formatMoney(l.totalCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-meta">
        <dt className="text-fg-muted">Subtotal</dt><dd className="text-end tabular">{formatMoney(subtotal)}</dd>
        {quote.taxCents > 0 ? (<><dt className="text-fg-muted">Tax</dt><dd className="text-end tabular">{formatMoney(quote.taxCents)}</dd></>) : null}
        <dt className="pt-1 text-headline text-fg">Total</dt><dd className="pt-1 text-end text-headline tabular text-fg">{formatMoney(quote.totalCents)}</dd>
        {quote.depositCents > 0 ? (<><dt className="text-fg-muted">Deposit on approval</dt><dd className="text-end tabular">{formatMoney(quote.depositCents)}{quote.depositPaidAt ? " paid" : ""}</dd></>) : null}
      </dl>
      {quote.status !== "superseded" && quote.status !== "declined" ? (
        <p className="mt-3 flex items-start gap-2 rounded-card bg-bg-subtle px-3 py-2.5 text-meta text-fg-muted">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg" strokeWidth={2} />
          <span>Customer sees: the final price will not be more than {formatMoney(quote.maxAuthorizedCents)}, 10% above this quote. Anything beyond that needs a new approval. This is how we hold invoices, for every kind of ticket.</span>
        </p>
      ) : null}
      {canAct ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {quote.status === "sent" ? <Button variant="secondary" size="sm" loading={busy} onClick={onResend}>Resend text</Button> : null}
          {quote.status === "draft" ? <Button variant="secondary" size="sm" loading={busy} onClick={onResend}>Send text</Button> : null}
          {live ? <Button variant="secondary" size="sm" onClick={onApproveByPhone}>Approved by phone</Button> : null}
          {quote.approvalUrl ? <Button variant="secondary" size="sm" onClick={onPreview}>Preview as customer</Button> : null}
          {quote.status !== "superseded" ? <Button variant="secondary" size="sm" onClick={onRevise}>Revise quote</Button> : null}
        </div>
      ) : null}
      {quote.status === "approved" && quote.authorizedBy?.method === "phone" ? (
        <p className="mt-3 text-meta text-fg-muted">
          Phone approval from {quote.authorizedBy.name}{quote.authorizedBy.phone ? ` (${quote.authorizedBy.phone})` : ""}, {formatDateTime(quote.authorizedBy.at)}.{quote.authorizedBy.note ? ` ${quote.authorizedBy.note}` : ""} {first}&apos;s deposit link was texted.
        </p>
      ) : null}
    </Panel>
  );
}
