"use client";
/**
 * Split bill sheet for one order (restaurant.split_bills): even N ways or by items, then one pay link per
 * guest with a copy button and the paid state. Shares are made by the API (the cents always add up).
 */
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { commerceApi, restaurantApi } from "@ll/shared";
import { Dot, ErrorLine, Meter, Segmented, SidePanel as Sheet, SkeletonRows } from "../kit";
import { useMerchant } from "../MerchantContext";
import { CopyButton } from "./shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Mode = "even" | "items";
export const splitLink = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/pay/split/${token}`;

/** Can this order still be split? Open pay-at-pickup bills only (the API enforces the same). */
export const canSplit = (o: Pick<commerceApi.OrderDto, "status" | "paymentMethod" | "paymentStatus" | "kind">) =>
  o.paymentMethod === "at_pickup" && o.kind !== "preorder" && o.paymentStatus !== "paid" && o.paymentStatus !== "refunded" && o.status !== "cancelled" && o.status !== "refunded";

export function SplitSheet({ order, onClose, onChanged }: { order: commerceApi.OrderDto | null; onClose: () => void; onChanged?: () => void }) {
  return order ? <Body key={order.id} order={order} onClose={onClose} onChanged={onChanged} /> : null;
}

function Body({ order, onClose, onChanged }: { order: commerceApi.OrderDto; onClose: () => void; onChanged?: () => void }) {
  const { api } = useMerchant();
  const act = useAction();
  const state = useApi(() => api.splits.list(order.id), [api, order.id], { pollMs: 8000 });
  const [mode, setMode] = useState<Mode>("even");
  const [ways, setWays] = useState(2);
  const [guests, setGuests] = useState(2);
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [replacing, setReplacing] = useState(false);

  const existing = state.data?.items ?? [];
  const showResult = existing.length > 0 && !replacing;
  const anyPaid = existing.some((s) => s.status === "paid");

  // Each order line starts on guest 1; fill in new lines as they appear.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssign((a) => Object.fromEntries(order.items.map((i) => [i.id, Math.min(a[i.id] ?? 0, guests - 1)])));
  }, [order.items, guests]);

  const shares = useMemo(() => {
    if (mode === "even") return even(order.totalCents, ways);
    const w = Array.from({ length: guests }, (_, g) => order.items.filter((i) => assign[i.id] === g).reduce((s, i) => s + i.unitPriceCents * i.quantity, 0));
    return w.some((x) => x > 0) ? alloc(order.totalCents, w) : w;
  }, [mode, ways, guests, assign, order]);
  const emptyGuest = mode === "items" && Array.from({ length: guests }, (_, g) => order.items.some((i) => assign[i.id] === g)).includes(false);

  async function create() {
    const body: restaurantApi.CreateSplitsBody =
      mode === "even"
        ? { mode: "even", ways }
        : { mode: "items", splits: Array.from({ length: guests }, (_, g) => ({ label: `Guest ${g + 1}`, itemIds: order.items.filter((i) => assign[i.id] === g).map((i) => i.id) })) };
    const r = await act.run(() => api.splits.create(order.id, body));
    if (r) {
      state.setData(r);
      setReplacing(false);
      onChanged?.();
    }
  }
  async function remove() {
    const r = await act.run(async () => {
      await api.splits.remove(order.id);
      return true;
    });
    if (r) {
      await state.reload();
      onChanged?.();
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Split bill · order #${order.number}`} subtitle={`${formatMoney(order.totalCents)} including tax and tip`} label="Split bill" width={500}>
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {state.error && !state.data ? <ErrorLine message={state.error} onRetry={() => void state.reload()} /> : null}
        {!state.data && !state.error ? <SkeletonRows rows={3} /> : null}

        {state.data && showResult ? (
          <>
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-meta-strong text-fg">{state.data.orderPaid ? "Bill paid" : `${formatMoney(state.data.paidCents)} of ${formatMoney(state.data.totalCents)} paid`}</p>
                <p className="text-meta text-fg-muted tabular">{existing.filter((s) => s.status === "paid").length} of {existing.length} shares</p>
              </div>
              <Meter className="mt-2" value={state.data.paidCents} max={state.data.totalCents} label="Paid so far" />
            </div>
            <ul className="divide-y divide-line border-y border-line" aria-label="Shares">
              {existing.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-body-strong text-fg">{s.label}</p>
                    <p className="text-body-strong tabular text-fg">{formatMoney(s.amountCents)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    {s.status === "paid" ? <Dot tone="positive">Paid{s.tipCents ? ` · ${formatMoney(s.tipCents)} tip` : ""}</Dot> : <Dot tone="neutral">Waiting to pay</Dot>}
                    {s.status === "open" ? <CopyButton text={splitLink(s.payToken)} label="Copy link" /> : null}
                  </div>
                  {s.status === "open" ? <p className="break-all font-mono text-caption text-fg-muted">/pay/split/{s.payToken}</p> : null}
                </li>
              ))}
            </ul>
            <p className="text-meta text-fg-muted">Send each guest their own link. Each one pays by card and can add a tip. The order is marked paid when every share is.</p>
            {!anyPaid && !state.data.orderPaid ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setReplacing(true)}>
                  Change the split
                </Button>
                <Button size="sm" variant="ghost" iconStart={Trash2} loading={act.busy} onClick={remove}>
                  Remove split
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {state.data && !showResult ? (
          <>
            <Segmented label="Split by" value={mode} onChange={setMode} options={[{ value: "even", label: "Evenly" }, { value: "items", label: "By items" }]} />
            {mode === "even" ? (
              <Stepper label="Ways" value={ways} min={2} max={30} onChange={setWays} />
            ) : (
              <>
                <Stepper label="Guests" value={guests} min={2} max={12} onChange={setGuests} />
                <ul className="divide-y divide-line border-y border-line" aria-label="Order items">
                  {order.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-fg">
                          {i.quantity} × {i.name}
                        </p>
                        <p className="text-meta text-fg-muted tabular">{formatMoney(i.lineTotalCents)}</p>
                      </div>
                      <label className="shrink-0">
                        <span className="sr-only">Guest for {i.name}</span>
                        <select value={assign[i.id] ?? 0} onChange={(e) => setAssign({ ...assign, [i.id]: Number(e.target.value) })} className="h-10 rounded-input border border-line bg-bg px-3 text-meta focus-visible:focus-ring">
                          {Array.from({ length: guests }, (_, g) => (
                            <option key={g} value={g}>
                              Guest {g + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div aria-label="Each share" className="rounded-card border border-line">
              <p className="border-b border-line px-4 py-2 text-meta text-fg-muted">Each pays, with their share of tax and tip</p>
              <ul className="divide-y divide-line">
                {shares.map((c, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2.5 text-body">
                    <span>Guest {i + 1}</span>
                    <span className="tabular font-medium">{formatMoney(c)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {emptyGuest ? <p className="text-meta text-fg-muted">Every guest needs at least one item.</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button loading={act.busy} disabled={emptyGuest} onClick={create}>
                Create {mode === "even" ? ways : guests} pay links
              </Button>
              {replacing ? (
                <Button variant="ghost" onClick={() => setReplacing(false)}>
                  Keep current split
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const b = "inline-flex size-11 items-center justify-center rounded-full border border-line hover:bg-bg-subtle focus-visible:focus-ring disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-body text-fg">{label}</p>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={b}>
          <Minus aria-hidden className="size-4" />
        </button>
        <output aria-live="polite" className={cn("w-8 text-center text-title tabular")}>{value}</output>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={b}>
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Same cent-splitting rule as the API, so the preview matches what the guests are charged. */
function alloc(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  for (const { i } of exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i)) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return out;
}
const even = (total: number, n: number) => alloc(total, new Array<number>(n).fill(1));
