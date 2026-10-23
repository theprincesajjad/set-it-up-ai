"use client";
/**
 * Record a payment taken by hand (Interac e-transfer, cash, cheque): one side panel for tiffin
 * subscribers, catering deposits and balances, and hall instalments (design T2, C2, B1).
 * Method chips, amount (prefilled), received on (not in the future), optional bank reference,
 * "send a receipt", and a reminder to check the bank first. Carries no platform fee.
 */
import { useState } from "react";
import type { paymentsManualApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { DefList, SidePanel } from "@/components/dashboard/kit";
import { formatMoney } from "@/lib/format";
import { useAction } from "@/lib/dashboard/useApi";
import { MoneyField, centsToField, fieldToCents, todayISO } from "./common";

const METHODS: { value: paymentsManualApi.ManualMethod; label: string }[] = [
  { value: "etransfer", label: "Interac e-transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export interface RecordPaymentPanelProps {
  title?: string;
  subtitle: string;
  /** Summary rows above the form: period, amount due, who to send to, reference. */
  rows: { label: string; value: React.ReactNode }[];
  /** Prefilled amount, cents. */
  amountCents: number;
  defaultMethod?: paymentsManualApi.ManualMethod;
  /** Short name for the receipt checkbox ("Send a receipt"). */
  receiptLabel?: string;
  note?: string;
  onClose: () => void;
  /** Throws on failure; the panel shows the message. */
  onRecord: (body: paymentsManualApi.RecordPaymentBody) => Promise<unknown>;
  successMessage?: string;
}

export function RecordPaymentPanel({ title = "Record payment", subtitle, rows, amountCents, defaultMethod = "etransfer", receiptLabel = "Send a receipt", note, onClose, onRecord, successMessage = "Payment recorded" }: RecordPaymentPanelProps) {
  const toast = useToast();
  const act = useAction();
  const today = todayISO();
  const [method, setMethod] = useState<paymentsManualApi.ManualMethod>(defaultMethod);
  const [amount, setAmount] = useState(centsToField(amountCents));
  const [on, setOn] = useState(today);
  const [ref, setRef] = useState("");
  const [receipt, setReceipt] = useState(true);
  const [noteText, setNoteText] = useState("");
  const cents = fieldToCents(amount);
  const bad = cents < 1 ? "Enter the amount you received" : on > today ? "The date can't be in the future" : null;
  const submit = async () => {
    const ok = await act.run(async () => {
      await onRecord({ method, amountCents: cents, receivedOn: on, bankReference: ref.trim() || null, note: noteText.trim() || null, sendReceipt: receipt });
      return true;
    });
    if (ok) {
      toast({ message: successMessage, tone: "success" });
      onClose();
    }
  };
  return (
    <SidePanel open onClose={onClose} label={title} title={title} subtitle={subtitle} width={440}>
      <div className="flex flex-col gap-4">
        <DefList items={rows} />
        <div role="group" aria-label="How did they pay?" className="flex flex-col gap-2">
          <p className="text-meta-strong text-fg">How did they pay?</p>
          <div className="flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={method === m.value}
                onClick={() => setMethod(m.value)}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-meta font-medium focus-visible:focus-ring ${method === m.value ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-bg-subtle"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneyField label="Amount received" value={amount} onChange={setAmount} />
          <TextField type="date" label="Received on" value={on} max={today} onChange={(e) => setOn(e.target.value)} />
        </div>
        {method === "etransfer" ? <TextField label="Interac reference" optionalLabel placeholder="Optional: C1AbCdEf... from your bank email" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} /> : <TextField label="Note" optionalLabel value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={300} />}
        <Checkbox checked={receipt} onChange={setReceipt} label={receiptLabel} />
        <Banner tone="info">{note ?? "Check the deposit in your bank first. Marking paid starts the meals. If you made a mistake, void the payment and it reopens."}</Banner>
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {bad ? <p className="text-meta text-negative">{bad}</p> : null}
        <div>
          <Button loading={act.busy} disabled={!!bad} onClick={() => void submit()}>
            Mark paid {formatMoney(cents)}
          </Button>
        </div>
        <p className="text-meta text-fg-muted">No platform fee on payments you record by hand.</p>
      </div>
    </SidePanel>
  );
}
