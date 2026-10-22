"use client";
import { Phone } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { TextField } from "./TextField";

export interface QuoteLine {
  description: string;
  quantity: number;
  totalCents: number;
}

export interface QuoteApprovalProps {
  title: string;
  ticketLabel?: string;
  shop: { name: string; phone?: string | null };
  lineItems: QuoteLine[];
  subtotalCents: number;
  taxCents: number;
  taxLabel?: string;
  totalCents: number;
  depositCents: number;
  diagnosis?: string | null;
  status: "sent" | "approved" | "declined" | "expired" | "superseded" | "draft";
  expiresAt?: string | null;
  respondedAt?: string | null;
  signatureName?: string | null;
  canRespond: boolean;
  onApprove?: (signatureName: string) => Promise<void>;
  onDecline?: (reason: string | undefined) => Promise<void>;
  error?: string | null;
}

const DECLINE_REASONS = ["Too expensive", "Getting it fixed elsewhere", "Not worth fixing", "Other"];

/** Quote with line items, HST, deposit, e-signature approve / decline (system.md §6 QuoteApproval). */
export function QuoteApproval(p: QuoteApprovalProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  const approveLabel = p.depositCents > 0 ? `Approve and pay ${formatMoney(p.depositCents)} deposit` : "Approve quote";

  async function approve() {
    const n = name.trim();
    if (n.length < 2) {
      setNameError("Type your full name to sign.");
      return;
    }
    setNameError(null);
    setBusy("approve");
    try {
      await p.onApprove?.(n);
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    try {
      await p.onDecline?.(reason === "Other" ? otherReason.trim() || "Other" : reason || undefined);
      setDeclineOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="quote-title" className="flex flex-col gap-5">
      <div>
        <h2 id="quote-title" className="display text-title text-fg">
          {p.title}
        </h2>
        {p.ticketLabel ? <p className="mt-0.5 text-meta text-fg-muted">{p.ticketLabel}</p> : null}
      </div>

      {p.diagnosis ? <p className="text-body text-fg">{p.diagnosis}</p> : null}

      <div className="rounded-card border border-line px-4">
        <table className="w-full text-body">
          <thead className="sr-only">
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {p.lineItems.map((l, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-3 pe-2 text-fg">{l.description}</td>
                <td className="py-3 pe-2 text-end tabular-nums text-fg-muted">{l.quantity > 1 ? `× ${l.quantity}` : ""}</td>
                <td className="py-3 text-end tabular-nums text-fg">{formatMoney(l.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-meta">
            <tr>
              <td colSpan={2} className="pt-3 text-fg-muted">
                Subtotal
              </td>
              <td className="pt-3 text-end tabular-nums text-fg">{formatMoney(p.subtotalCents)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="pt-1 text-fg-muted">
                {p.taxLabel ?? "HST 13%"}
              </td>
              <td className="pt-1 text-end tabular-nums text-fg">{formatMoney(p.taxCents)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="pt-3 pb-3 text-headline text-fg">
                Total
              </td>
              <td className="pt-3 pb-3 text-end text-headline tabular-nums text-fg">{formatMoney(p.totalCents)}</td>
            </tr>
            {p.depositCents > 0 ? (
              <tr className="border-t border-line">
                <td colSpan={2} className="py-3 text-body-strong text-fg">
                  Deposit due on approval
                </td>
                <td className="py-3 text-end text-body-strong tabular-nums text-fg">{formatMoney(p.depositCents)}</td>
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>

      <div>
        {p.status === "approved" ? (
          <Banner tone="success" title={`Approved ${p.respondedAt ? formatDateTime(p.respondedAt) : ""}${p.signatureName ? ` by ${p.signatureName}` : ""}`} />
        ) : p.status === "declined" ? (
          <Banner tone="neutral" title="You declined this quote.">
            Changed your mind? Call {p.shop.name}.
          </Banner>
        ) : p.status === "expired" ? (
          <Banner tone="neutral">
            This quote expired{p.expiresAt ? ` on ${formatDate(p.expiresAt)}` : ""}. Ask {p.shop.name} for a new one.
          </Banner>
        ) : p.status === "superseded" ? (
          <Banner tone="info">There&apos;s a newer quote. Check your latest message from {p.shop.name}.</Banner>
        ) : p.canRespond ? (
          <div className="flex flex-col gap-3">
            <TextField label="Type your name to sign" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={nameError} maxLength={120} />
            <p className="text-meta text-fg-muted">By approving you agree to the work above. Your approval is recorded with your name, time and device.</p>
            {p.error ? <Banner tone="danger">{p.error}</Banner> : null}
            <Button size="lg" fullWidth loading={busy === "approve"} onClick={approve} className="mt-1">
              {approveLabel}
            </Button>
            <Button variant="ghost" size="lg" fullWidth onClick={() => setDeclineOpen(true)} disabled={busy !== null}>
              Decline
            </Button>
          </div>
        ) : null}
        {p.shop.phone ? (
          <Button variant="secondary" size="lg" fullWidth className={cn("mt-3")} iconStart={Phone} href={`tel:${p.shop.phone}`}>
            {`Call ${p.shop.name}`}
          </Button>
        ) : null}
      </div>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline this quote?"
        description={`${p.shop.name} will let you know when to pick up your item.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              Keep quote
            </Button>
            <Button variant="danger" loading={busy === "decline"} onClick={decline}>
              Decline quote
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select label="Reason" placeholder="Choose a reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} options={DECLINE_REASONS.map((r) => ({ value: r, label: r }))} />
          {reason === "Other" ? <TextField label="Tell us more" optionalLabel value={otherReason} onChange={(e) => setOtherReason(e.target.value)} maxLength={300} /> : null}
        </div>
      </Modal>
    </section>
  );
}
