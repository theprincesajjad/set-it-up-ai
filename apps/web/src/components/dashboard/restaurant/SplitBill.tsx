"use client";
/**
 * Split bill sheet for one order (restaurant.split_bills, frame 02): even N ways, or by items with a dish given to one guest
 * or shared by several, and a payment method per guest (pay link, card at the table, cash). The shares are made by the API
 * with the same rule as the preview here (restaurantApi.splitCents: the odd cent goes to the first guest, so the shares always
 * add up to the bill). A cash or table-card share is marked paid by staff; a link share is paid by the guest.
 */
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { restaurantApi, type commerceApi } from "@ll/shared";
import { Dot, ErrorLine, Meter, Segmented, SidePanel as Sheet, SkeletonRows } from "../kit";
import { useMerchant } from "../MerchantContext";
import { CopyButton } from "./shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Mode = "even" | "items";
type Tender = restaurantApi.SplitTender;
export const splitLink = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/pay/split/${token}`;

const TENDER_LABEL: Record<Tender, string> = { link: "Pay link", card: "Card at table", cash: "Cash" };
const TENDERS: Tender[] = ["link", "card", "cash"];
const CHIP_COLORS = "bg-fg text-bg border-fg";

/** Can this order still be split? Open pay-at-pickup bills only (the API enforces the same). */
export const canSplit = (o: Pick<commerceApi.OrderDto, "status" | "paymentMethod" | "paymentStatus" | "kind">) =>
  o.paymentMethod === "at_pickup" && o.kind !== "preorder" && o.paymentStatus !== "paid" && o.paymentStatus !== "refunded" && o.status !== "cancelled" && o.status !== "refunded";

/** One assignable row of the bill: a whole order line, or one unit of a line with two or fewer units. */
export interface SplitRow {
  ref: string;
  label: string;
  priceCents: number;
  note?: string;
}

/** Lines of one or two units are split into one row per unit ("Chicken Tikka (1 of 2)"); bigger lines stay one shared row. */
export function splitRows(items: commerceApi.OrderDto["items"]): SplitRow[] {
  const rows: SplitRow[] = [];
  for (const i of items) {
    if (i.quantity <= 2) {
      for (let u = 1; u <= i.quantity; u++) rows.push({ ref: i.quantity === 1 ? i.id : `${i.id}:${u}`, label: i.quantity === 1 ? i.name : `${i.name} (${u} of ${i.quantity})`, priceCents: i.unitPriceCents });
    } else rows.push({ ref: i.id, label: `${i.name} × ${i.quantity}`, priceCents: i.unitPriceCents, note: `${formatMoney(i.unitPriceCents)} each, shared` });
  }
  return rows;
}

export function SplitSheet({ order, onClose, onChanged }: { order: commerceApi.OrderDto | null; onClose: () => void; onChanged?: () => void }) {
  return order ? <Body key={order.id} order={order} onClose={onClose} onChanged={onChanged} /> : null;
}

/** "1 pay link, 1 card, 1 cash" for the button. */
export function tenderSummary(tenders: Tender[]): string {
  const n = (t: Tender) => tenders.filter((x) => x === t).length;
  return [n("link") ? `${n("link")} pay ${n("link") === 1 ? "link" : "links"}` : "", n("card") ? `${n("card")} card` : "", n("cash") ? `${n("cash")} cash` : ""].filter(Boolean).join(", ");
}

function Body({ order, onClose, onChanged }: { order: commerceApi.OrderDto; onClose: () => void; onChanged?: () => void }) {
  const { api, detail } = useMerchant();
  const act = useAction();
  const state = useApi(() => api.splits.list(order.id), [api, order.id], { pollMs: 8000 });
  const [mode, setMode] = useState<Mode>("even");
  const [ways, setWays] = useState(2);
  const [guests, setGuests] = useState(3);
  const [names, setNames] = useState<string[]>([]);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [assign, setAssign] = useState<Record<string, number[]>>({});
  const [replacing, setReplacing] = useState(false);
  const [tips, setTips] = useState<Record<string, string>>({});

  const rows = useMemo(() => splitRows(order.items), [order.items]);
  const count = mode === "even" ? ways : guests;
  const nameOf = (g: number) => names[g]?.trim() || `Guest ${g + 1}`;
  const tenderOf = (g: number): Tender => tenders[g] ?? "link";

  // Each row starts on guest 1; keep assignments inside the guest list when it shrinks.
  useEffect(() => {
    setAssign((a) => Object.fromEntries(rows.map((r) => [r.ref, (a[r.ref] ?? [0]).filter((g) => g < guests).length ? (a[r.ref] ?? [0]).filter((g) => g < guests) : [0]])));
  }, [rows, guests]);

  const refsByGuest = useMemo(() => Array.from({ length: guests }, (_, g) => rows.filter((r) => (assign[r.ref] ?? [0]).includes(g)).map((r) => r.ref)), [rows, assign, guests]);
  const emptyGuest = mode === "items" && refsByGuest.some((r) => r.length === 0);
  const shares = useMemo(() => {
    try {
      if (mode === "even") return restaurantApi.splitCents(order.totalCents, new Array<number>(ways).fill(1));
      if (emptyGuest) return Array.from({ length: guests }, () => 0);
      return restaurantApi.splitByItems(order.totalCents, order.items.map((i) => ({ id: i.id, quantity: i.quantity, unitPriceCents: i.unitPriceCents })), refsByGuest);
    } catch {
      return Array.from({ length: count }, () => 0);
    }
  }, [mode, ways, guests, order, refsByGuest, emptyGuest, count]);
  /** Each guest's food before tax: a shared dish counts 1/k of its price for each guest. */
  const food = useMemo(() => {
    const out = Array.from({ length: guests }, () => 0);
    for (const r of rows) {
      const owners = assign[r.ref] ?? [0];
      for (const g of owners) if (g < guests) out[g]! += r.priceCents / owners.length;
    }
    return out.map(Math.round);
  }, [rows, assign, guests]);

  const existing = state.data?.items ?? [];
  const showResult = existing.length > 0 && !replacing;
  const anyPaid = existing.some((s) => s.status === "paid");

  async function create() {
    const labels = Array.from({ length: count }, (_, g) => nameOf(g));
    const ts = Array.from({ length: count }, (_, g) => tenderOf(g));
    const body: restaurantApi.CreateSplitsBody = mode === "even" ? { mode: "even", ways, labels, tenders: ts } : { mode: "items", splits: refsByGuest.map((itemIds, g) => ({ label: labels[g], itemIds, tender: ts[g] })) };
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
  async function markPaid(splitId: string, tender: "cash" | "card") {
    const tip = Math.round(Number.parseFloat((tips[splitId] ?? "").replace(/[^0-9.]/g, "")) * 100);
    const r = await act.run(() => api.splits.markPaid(order.id, splitId, { tender, tipCents: Number.isFinite(tip) ? tip : 0 }));
    if (r) {
      state.setData(r);
      onChanged?.();
    }
  }
  async function changeTender(splitId: string, tender: Tender) {
    const r = await act.run(() => api.splits.setTender(order.id, splitId, tender));
    if (r) state.setData(r);
  }

  const subtitle = `${formatMoney(order.totalCents)} with tax · ${showResult ? existing.length : count} guests`;

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Split bill · order #${order.number}`}
      subtitle={subtitle}
      label="Split bill"
      width={520}
      footer={
        state.data && !showResult ? (
          <>
            {replacing ? <Button variant="ghost" onClick={() => setReplacing(false)}>Keep current split</Button> : null}
            <Button className="w-full sm:w-auto" loading={act.busy} disabled={emptyGuest} onClick={create}>
              Create split: {tenderSummary(Array.from({ length: count }, (_, g) => tenderOf(g)))}
            </Button>
          </>
        ) : undefined
      }
    >
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {s.status === "paid" ? <Dot tone="positive">Paid {s.paidWith === "cash" ? "in cash" : s.tender === "card" ? "by card at the table" : "by card"}{s.tipCents ? ` · ${formatMoney(s.tipCents)} tip` : ""}</Dot> : <Dot tone="neutral">Waiting · {TENDER_LABEL[s.tender]}</Dot>}
                    {s.status === "open" ? (
                      <label className="inline-flex items-center gap-1.5 text-meta text-fg-muted">
                        <span className="sr-only">How {s.label} pays</span>
                        <select value={s.tender} onChange={(e) => void changeTender(s.id, e.target.value as Tender)} className="h-8 rounded-input border border-line bg-bg px-2 text-meta text-fg focus-visible:focus-ring">
                          {TENDERS.map((t) => (
                            <option key={t} value={t}>{TENDER_LABEL[t]}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  {s.status === "open" && s.tender === "link" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyButton text={splitLink(s.payToken)} label="Copy link" />
                      <a className="inline-flex h-8 items-center rounded-input border border-line px-3 text-meta font-medium text-fg hover:bg-bg-subtle focus-visible:focus-ring" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Your share of the bill at ${detail.merchant.name}: ${splitLink(s.payToken)}`)}`}>
                        Send on WhatsApp
                      </a>
                      <span className="break-all font-mono text-caption text-fg-muted">/pay/split/{s.payToken}</span>
                    </div>
                  ) : null}
                  {s.status === "open" && s.tender !== "link" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-meta text-fg-muted">
                        Tip $
                        <input inputMode="decimal" aria-label={`Tip for ${s.label}`} value={tips[s.id] ?? ""} onChange={(e) => setTips({ ...tips, [s.id]: e.target.value })} placeholder="0" className="h-8 w-16 rounded-input border border-line bg-bg px-2 text-meta text-fg tabular focus-visible:focus-ring" />
                      </label>
                      <Button size="sm" iconStart={Check} loading={act.busy} onClick={() => void markPaid(s.id, s.tender === "card" ? "card" : "cash")}>
                        Mark paid {s.tender === "card" ? "by card" : "in cash"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-meta text-fg-muted">A guest on a pay link pays by card and can add a tip. Cash and card at the table are marked paid here. The order is marked paid when every share is.</p>
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
            <Stepper label={mode === "even" ? "Ways" : "Guests"} value={count} min={2} max={mode === "even" ? 30 : 12} onChange={mode === "even" ? setWays : setGuests} />
            <div className="grid gap-2 sm:grid-cols-3" aria-label="Guest names">
              {Array.from({ length: Math.min(count, 12) }, (_, g) => (
                <input key={g} aria-label={`Name of guest ${g + 1}`} placeholder={`Guest ${g + 1}`} value={names[g] ?? ""} maxLength={60} onChange={(e) => setNames((n) => Object.assign([...n], { [g]: e.target.value }))} className="h-9 rounded-input border border-line bg-bg px-3 text-meta text-fg placeholder:text-fg-muted focus-visible:focus-ring" />
              ))}
            </div>

            {mode === "items" ? (
              <ul className="divide-y divide-line border-y border-line" aria-label="Order items">
                {rows.map((r) => {
                  const owners = assign[r.ref] ?? [0];
                  return (
                    <li key={r.ref} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-fg">{r.label}</p>
                        <p className="text-meta text-fg-muted tabular">{r.note ?? (owners.length > 1 ? `${formatMoney(r.priceCents)} · shared` : formatMoney(r.priceCents))}</p>
                      </div>
                      <div role="group" aria-label={`Who has ${r.label}`} className="flex flex-wrap gap-1.5">
                        {Array.from({ length: guests }, (_, g) => {
                          const on = owners.includes(g);
                          return (
                            <button
                              key={g}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setAssign({ ...assign, [r.ref]: on ? (owners.length > 1 ? owners.filter((x) => x !== g) : owners) : [...owners, g].sort((a, b) => a - b) })}
                              className={cn("inline-flex h-7 max-w-[88px] items-center truncate rounded-full border px-2.5 text-caption font-medium focus-visible:focus-ring", on ? CHIP_COLORS : "border-line text-fg-muted hover:bg-bg-subtle")}
                            >
                              {nameOf(g)}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div aria-label="Each share" className="rounded-card border border-line">
              <ul className="divide-y divide-line">
                {Array.from({ length: count }, (_, g) => (
                  <li key={g} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-strong text-fg">{nameOf(g)}</p>
                      {mode === "items" ? <p className="text-meta text-fg-muted tabular">{formatMoney(food[g] ?? 0)} + tax</p> : null}
                    </div>
                    <label className="shrink-0">
                      <span className="sr-only">How {nameOf(g)} pays</span>
                      <select value={tenderOf(g)} onChange={(e) => setTenders((t) => Object.assign(Array.from({ length: count }, (_, i) => t[i] ?? "link"), { [g]: e.target.value }))} className="h-8 rounded-full border border-line bg-bg px-3 text-meta text-fg focus-visible:focus-ring">
                        {TENDERS.map((t) => (
                          <option key={t} value={t}>{TENDER_LABEL[t]}</option>
                        ))}
                      </select>
                    </label>
                    <span className="w-20 shrink-0 text-end text-title tabular font-semibold text-fg">{formatMoney(shares[g] ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line bg-bg-subtle px-4 py-2.5 text-meta text-fg-muted">
                Odd cents go to the first guest so the shares add to {formatMoney(order.totalCents)}. Tip is added per guest when they pay.
              </p>
            </div>
            {emptyGuest ? <p className="text-meta text-negative">Every guest needs at least one item.</p> : null}
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
        <output aria-live="polite" className="w-8 text-center text-title tabular">{value}</output>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={b}>
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
