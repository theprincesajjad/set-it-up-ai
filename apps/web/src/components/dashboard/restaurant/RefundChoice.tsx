"use client";
import { useId } from "react";
import type { restaurantApi } from "@ll/shared";
import { formatMoney } from "@/lib/format";
import { MoneyField, centsToField, fieldToCents } from "./common";

export type RefundState = { mode: "none" | "full" | "part"; amount: string };
export const NO_REFUND: RefundState = { mode: "none", amount: "" };

/** The merchant's choice for a paid deposit when cancelling, as the API body (null when the amount is not valid yet). */
export function refundBody(s: RefundState, depositCents: number): restaurantApi.DepositRefundChoice | null {
  if (s.mode === "none") return "none";
  if (s.mode === "full") return "full";
  const cents = fieldToCents(s.amount);
  return cents >= 1 && cents <= depositCents ? { amountCents: cents } : null;
}

/** Whole-deposit shortcut used by the "Refund all" label and the partial field's starting value. */
export const startingPart = (depositCents: number) => centsToField(Math.round(depositCents / 2));

/**
 * "What happens to the deposit?" for the cancel dialogs: keep it, refund it all, or refund part. Only shown for a
 * deposit paid by card in the app (anything received by hand is returned directly, outside the app).
 */
export function RefundChoice({ depositCents, value, onChange, hint }: { depositCents: number; value: RefundState; onChange: (v: RefundState) => void; hint?: string }) {
  const name = useId();
  const options: { mode: RefundState["mode"]; label: string; note?: string }[] = [
    { mode: "none", label: "Keep the deposit", note: "No refund. The customer is told you will be in touch." },
    { mode: "full", label: `Refund all ${formatMoney(depositCents)}`, note: "Goes back to the card they paid with." },
    { mode: "part", label: "Refund part" },
  ];
  const bad = value.mode === "part" && refundBody(value, depositCents) === null;
  return (
    <fieldset className="mt-3 flex flex-col gap-2">
      <legend className="pb-1 text-meta-strong text-fg">What happens to the {formatMoney(depositCents)} deposit?</legend>
      {options.map((o) => (
        <label key={o.mode} className="flex cursor-pointer items-start gap-2.5 text-meta text-fg">
          <input type="radio" name={name} checked={value.mode === o.mode} onChange={() => onChange({ mode: o.mode, amount: o.mode === "part" && !value.amount ? startingPart(depositCents) : value.amount })} className="mt-0.5 size-4 shrink-0 accent-[var(--ll-color-fg)]" />
          <span>
            {o.label}
            {o.note ? <span className="block text-fg-muted">{o.note}</span> : null}
          </span>
        </label>
      ))}
      {value.mode === "part" ? (
        <div className="max-w-48 ps-6">
          <MoneyField label="Amount to refund" value={value.amount} onChange={(v) => onChange({ ...value, amount: v })} error={bad ? `Between $0.01 and ${formatMoney(depositCents)}` : null} />
        </div>
      ) : null}
      {hint ? <p className="text-meta text-fg-muted">{hint}</p> : null}
    </fieldset>
  );
}

/** One line for DefLists and receipts: what was refunded, or null. */
export function refundedText(cents: number, when: string | null, fmt: (iso: string) => string): string | null {
  return cents > 0 ? `${formatMoney(cents)} refunded${when ? ` ${fmt(when)}` : ""}` : null;
}
