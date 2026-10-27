"use client";
/**
 * Weigh-in at the butcher counter (docs/research/grocers.md, frame D5): the scale reads the real weight, the customer pays the real
 * price. The customer ordered an estimate and paid a deposit on it; this sets the final price and what is left to pay at the till.
 */
import { useMemo, useState } from "react";
import type { commerceApi, groceryApi } from "@ll/shared";
import { DefList, SidePanel as Sheet } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { deltaWords, weighPreview, weightToGrams } from "@/lib/grocery";
import { useAction } from "@/lib/dashboard/useApi";

type Line = commerceApi.OrderItemDto;

export const weighedLines = (o: Pick<commerceApi.OrderDto, "items">): Line[] => o.items.filter((i) => i.weightUnit && i.perUnitCents);
/** Weighed lines the scale has not read yet. */
export const needsWeighing = (o: Pick<commerceApi.OrderDto, "items" | "status">): boolean => o.status !== "picked_up" && weighedLines(o).some((i) => i.actualWeightG == null);

export function WeighSheet({ order, onClose, onDone }: { order: commerceApi.OrderDto; onClose: () => void; onDone: (r: groceryApi.WeighResponse) => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const lines = useMemo(() => weighedLines(order), [order]);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, l.actualWeightG != null ? String(Math.round((l.actualWeightG / (l.weightUnit === "kg" ? 1000 : 453.59237)) * 100) / 100) : ""])));
  // A deposit paid by card goes back to the card; one taken at the till goes back by hand.
  const byHand = order.paymentMethod !== "in_app" && !!order.depositPaidAt && order.depositCents > 0;
  const [refundMethod, setRefundMethod] = useState<"etransfer" | "cash">("etransfer");
  const grams = (l: Line) => weightToGrams(vals[l.id] ?? "", l.weightUnit!);
  const ready = lines.length > 0 && lines.every((l) => grams(l) != null);
  const estimate = (l: Line) => l.unitPriceCents * l.quantity;
  const weighedTotal = lines.reduce((s, l) => (grams(l) != null ? s + weighPreview(l.perUnitCents!, l.weightUnit!, grams(l)!, estimate(l)).lineCents : s + estimate(l)), 0);
  const estimated = lines.reduce((s, l) => s + estimate(l), 0);

  async function confirm() {
    const body: groceryApi.WeighBody = { lines: lines.map((l) => ({ orderItemId: l.id, actualWeightG: grams(l)! })), ...(byHand ? { refundMethod } : {}) };
    const r = await act.run(() => api.grocery.weigh(order.id, body));
    if (r) {
      const back = r.refund ? (r.refund.mode === "card" ? ` ${formatMoney(r.refund.cents)} refunded to their card.` : ` Give ${formatMoney(r.refund.cents)} back by ${r.refund.method === "cash" ? "cash" : "e-transfer"}; it is recorded.`) : "";
      toast({ message: `Weighed. Total ${formatMoney(r.totalCents)}, ${r.balanceDueCents > 0 ? `${formatMoney(r.balanceDueCents)} left to pay` : "nothing left to pay"}.${back}`, tone: "success" });
      onDone(r);
      onClose();
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Weigh order #${order.number}`}
      subtitle={order.customer?.name ?? undefined}
      label="Weigh-in"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!ready} loading={act.busy} onClick={() => void confirm()}>Confirm weight</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {lines.map((l) => {
          const g = grams(l);
          const p = g != null ? weighPreview(l.perUnitCents!, l.weightUnit!, g, estimate(l)) : null;
          return (
            <div key={l.id} className="flex flex-col gap-2 rounded-card border border-line p-4">
              <div>
                <p className="text-body-strong text-fg">{l.quantity > 1 ? `${l.quantity} × ` : ""}{l.name}</p>
                <p className="text-meta text-fg-muted">
                  Ordered about {formatMoney(estimate(l))} at {formatMoney(l.perUnitCents)}/{l.weightUnit}
                </p>
              </div>
              <TextField label={`Weight on the scale (${l.weightUnit})`} inputMode="decimal" suffix={l.weightUnit ?? ""} value={vals[l.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [l.id]: e.target.value.replace(/[^0-9.]/g, "") }))} />
              {p ? (
                <p className="text-meta text-fg">
                  <span className="font-semibold tabular">{formatMoney(p.lineCents)}</span> <span className="text-fg-muted">for {p.weightText}, {deltaWords(p.deltaCents)}</span>
                </p>
              ) : null}
            </div>
          );
        })}
        <DefList
          items={[
            { label: "Meat, estimated", value: <span className="tabular">{formatMoney(estimated)}</span> },
            { label: "Meat, weighed", value: <span className="font-semibold tabular">{formatMoney(weighedTotal)}</span> },
            { label: "Deposit paid", value: <span className="tabular">{order.depositPaidAt ? formatMoney(order.depositCents) : "None"}</span> },
          ]}
        />
        {order.depositPaidAt && order.totalCents - estimated + weighedTotal < order.depositCents + order.customerFeeCents ? (
          <Banner tone="info">
            The order now comes to less than the deposit. {byHand ? "The deposit was taken at the till, so you give the difference back yourself." : "The difference is refunded to the customer's card when you confirm."}
          </Banner>
        ) : null}
        {byHand ? (
          <div className="flex flex-col gap-2">
            <p className="text-meta-strong text-fg">If we owe them change, you return it by</p>
            <div className="flex gap-2">
              {(["etransfer", "cash"] as const).map((m) => (
                <Button key={m} size="sm" variant={refundMethod === m ? "primary" : "secondary"} aria-pressed={refundMethod === m} onClick={() => setRefundMethod(m)}>
                  {m === "cash" ? "Cash" : "E-transfer"}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <p className="text-caption text-fg-muted">Weigh on your approved (legal-for-trade) scale. The customer gets a message with the final weight and price. Tax is worked out when you confirm; raw meat carries none.</p>
      </div>
    </Sheet>
  );
}
