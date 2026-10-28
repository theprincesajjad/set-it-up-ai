"use client";
import { nowMs } from "@/lib/restaurant/util";
/**
 * Ring up an order by hand: a walk-in at the counter, a call taken on the phone ("Take a phone order", every tier), or a
 * phone pre-order for a pickup day. Posts to POST :m/orders/counter with the channel, so it shows as "Phone" in Orders and
 * on the kitchen ticket. A caller's number is matched to a member, with their usual one tap away ("Repeat usual").
 */
import { Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { commerceApi, restaurantApi } from "@ll/shared";
import { Dot, ErrorLine, SidePanel as Sheet } from "../kit";
import { useMerchant } from "../MerchantContext";
import { formatPhone } from "./shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { portionLabel } from "@/lib/restaurant/weighed";
import { fromLocalInput } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export type TakeOrderMode = "counter" | "phone" | "preorder";
interface Line {
  catalogItemId: string;
  name: string;
  quantity: number;
  priceCents: number;
}

const COPY: Record<TakeOrderMode, { title: string; subtitle: string; send: string }> = {
  counter: { title: "New counter order", subtitle: "A walk-in or a table. It goes to the kitchen at once.", send: "Send to kitchen" },
  phone: { title: "Take a phone order", subtitle: "Type what they say, in ten seconds. The kitchen sees it as a phone order.", send: "Send to kitchen" },
  preorder: { title: "Take a phone pre-order", subtitle: "Book pots for a pickup day. Caps and notice still apply.", send: "Book pre-order" },
};

/** The next whole hour after `h` hours from now, as a datetime-local value in Toronto time. */
function defaultPickup(hoursAhead: number): string {
  const d = new Date(nowMs() + hoursAhead * 3_600_000);
  d.setMinutes(0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function TakeOrderSheet({ open, mode, onClose, onPlaced, prefill }: { open: boolean; mode: TakeOrderMode; onClose: () => void; onPlaced?: (o: commerceApi.OrderDto) => void; prefill?: { phone?: string; name?: string; usual?: boolean } }) {
  return open ? <Body key={`${mode}-${prefill?.phone ?? ""}`} mode={mode} onClose={onClose} onPlaced={onPlaced} prefill={prefill} /> : null;
}

function Body({ mode, onClose, onPlaced, prefill }: { mode: TakeOrderMode; onClose: () => void; onPlaced?: (o: commerceApi.OrderDto) => void; prefill?: { phone?: string; name?: string; usual?: boolean } }) {
  const { api, enabled, detail } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const catalog = useApi(() => api.catalog(), [api]);
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [name, setName] = useState(prefill?.name ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [pickup, setPickup] = useState(mode === "preorder" ? defaultPickup(48) : "");
  const [allergy, setAllergy] = useState("");
  const [notes, setNotes] = useState("");
  const [tender, setTender] = useState<"" | "cash" | "card">("");
  const [deposit, setDeposit] = useState(false);
  const [lookup, setLookup] = useState<restaurantApi.PhoneLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPre = mode === "preorder";
  // A grocer or butcher has no kitchen screen: the same sheet takes a phone or WhatsApp order and a pre-order for pick-up.
  const grocer = detail.merchant.vertical === "grocery" || (!enabled("restaurant.kds") && (enabled("grocery.counter_preorders") || enabled("grocery.whatsapp_orders")));
  const copy = grocer ? { ...COPY[mode], title: mode === "preorder" ? "Take a pre-order" : COPY[mode].title, subtitle: mode === "preorder" ? "Book a pick-up day and hour. Caps, notice and the deposit still apply." : "Type what they say. It shows as a phone order.", send: mode === "preorder" ? COPY[mode].send : "Place order" } : COPY[mode];
  const menu = useMemo(
    () =>
      (catalog.data?.items ?? []).filter(
        // A butcher's pre-orders are every cut sold by weight as well as the animals; a restaurant's are its pre-order-only pots.
        (i) => i.available && i.orderable && (isPre && grocer ? !!i.preorderOnly || !!i.weightUnit : !!i.preorderOnly === isPre) && !(i.soldOutUntil && new Date(i.soldOutUntil).getTime() > nowMs()),
      ),
    [catalog.data, isPre, grocer],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? menu.filter((i) => i.name.toLowerCase().includes(needle)) : menu;
  }, [menu, q]);
  /** "1 kg": what one portion of a weighed cut weighs, for the line under its name. */
  const lineUnit = (id: string) => {
    const it = (catalog.data?.items ?? []).find((m) => m.id === id);
    return it?.weightUnit && it.nominalWeightG ? portionLabel(it.nominalWeightG, it.weightUnit) : null;
  };
  const total = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);

  // Who is calling: match the number to a member once it looks complete.
  useEffect(() => {
    if (mode === "counter" || phone.replace(/\D/g, "").length < 10) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLookup(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      api.orderTools.lookupPhone(phone).then((r) => live && setLookup(r), () => live && setLookup(null));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [api, phone, mode]);
  useEffect(() => {
    if (lookup?.member?.name && !name) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(lookup.member.name);
    }
  }, [lookup, name]);

  const add = (id: string, nm: string, price: number, qty = 1) => setLines((ls) => (ls.some((l) => l.catalogItemId === id) ? ls.map((l) => (l.catalogItemId === id ? { ...l, quantity: Math.min(50, l.quantity + qty) } : l)) : [...ls, { catalogItemId: id, name: nm, quantity: qty, priceCents: price }]));
  const bump = (id: string, by: number) => setLines((ls) => ls.flatMap((l) => (l.catalogItemId !== id ? [l] : l.quantity + by <= 0 ? [] : [{ ...l, quantity: Math.min(50, l.quantity + by) }])));
  const repeatUsual = () => {
    for (const u of lookup?.usual?.items ?? []) {
      const it = menu.find((m) => m.id === u.catalogItemId);
      if (it) add(it.id, it.name, it.priceCents, u.quantity);
    }
  };
  // "Repeat a regular's usual" from the header opens this sheet with the usual already on the order.
  useEffect(() => {
    if (prefill?.usual && lookup?.usual && !lines.length) {
      for (const u of lookup.usual.items) {
        const it = menu.find((m) => m.id === u.catalogItemId);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (it) add(it.id, it.name, it.priceCents, u.quantity);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, menu.length]);

  const phoneBad = (mode !== "counter" && phone.trim() !== "" && phone.replace(/\D/g, "").length < 10) || (isPre && phone.replace(/\D/g, "").length < 10);
  const canSend = lines.length > 0 && !phoneBad && (!isPre || !!pickup);

  async function send() {
    setError(null);
    const body: restaurantApi.CounterOrderBody = {
      items: lines.map((l) => ({ catalogItemId: l.catalogItemId, quantity: l.quantity, modifiers: [] })),
      channel: mode === "counter" ? "counter" : "phone",
      kind: isPre ? "preorder" : "pickup",
      ...(isPre ? { pickupAt: fromLocalInput(pickup) ?? undefined, depositCollected: deposit } : pickup ? { pickupAt: fromLocalInput(pickup) ?? undefined } : {}),
      ...(!isPre && tender ? { tender } : {}),
      ...(phone.trim() ? { customerPhone: phone.trim() } : {}),
      ...(name.trim() ? { customerName: name.trim() } : {}),
      ...(allergy.trim() ? { allergyNote: allergy.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const r = await act.run(() => api.orderTools.counterOrder(body));
    if (r) {
      toast({ message: isPre ? `Pre-order #${r.number} booked` : `Order #${r.number} ${grocer ? "placed" : "sent to the kitchen"}`, tone: "success" });
      onPlaced?.(r);
      onClose();
    } else setError(act.error);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={copy.title}
      subtitle={copy.subtitle}
      label={copy.title}
      width={560}
      footer={
        <>
          <p className="me-auto text-meta text-fg-muted tabular">{total > 0 ? `About ${formatMoney(total)} before tax` : "Add a dish to start"}</p>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSend} loading={act.busy} onClick={() => void send()}>{copy.send}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {act.error || error ? <Banner tone="danger">{act.error ?? error}</Banner> : null}

        {mode !== "counter" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={isPre ? "Caller's number" : "Caller's number"} type="tel" inputMode="tel" autoComplete="off" placeholder="(416) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} error={phoneBad ? "Enter the full phone number." : null} optionalLabel={!isPre} />
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} optionalLabel maxLength={80} />
            {lookup?.member ? (
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Dot tone="positive">
                  {lookup.member.name ?? formatPhone(lookup.phone)} · member, {lookup.member.visits} {lookup.member.visits === 1 ? "visit" : "visits"}
                </Dot>
                {lookup.usual ? (
                  <Button size="sm" variant="secondary" onClick={repeatUsual}>
                    Repeat usual: {lookup.usual.text}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <TextField label="Customer's number" type="tel" inputMode="tel" autoComplete="off" placeholder="(416) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} optionalLabel hint="Adds points if they are a member." />
        )}

        <section aria-label="Order" className="flex flex-col gap-2">
          <h3 className="text-meta-strong text-fg">Order</h3>
          {lines.length ? (
            <ul className="divide-y divide-line border-y border-line" aria-label="Order items">
              {lines.map((l) => (
                <li key={l.catalogItemId} className="flex min-h-12 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-fg">{l.name}</span>
                    <span className="block text-meta text-fg-muted tabular">{grocer && lineUnit(l.catalogItemId) ? `about ${formatMoney(l.priceCents)} each (${lineUnit(l.catalogItemId)})` : `${formatMoney(l.priceCents)} each`}</span>
                  </span>
                  <span className="inline-flex items-center rounded-full border border-line">
                    <button type="button" aria-label={`One fewer ${l.name}`} onClick={() => bump(l.catalogItemId, -1)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-bg-subtle focus-visible:focus-ring">
                      <Minus aria-hidden className="size-4" />
                    </button>
                    <span className="w-7 text-center text-body tabular" aria-live="polite">{l.quantity}</span>
                    <button type="button" aria-label={`One more ${l.name}`} onClick={() => bump(l.catalogItemId, 1)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-bg-subtle focus-visible:focus-ring">
                      <Plus aria-hidden className="size-4" />
                    </button>
                  </span>
                  <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.catalogItemId !== l.catalogItemId))} className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-meta text-fg-muted">Nothing on the order yet. Tap a dish below.</p>
          )}

          <div className="relative mt-1">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <input type="search" aria-label="Find a dish" placeholder={isPre ? (grocer ? "Find a cut or an animal" : "Find a degh or tray") : "Find a dish"} value={q} onChange={(e) => setQ(e.target.value)} className="h-10 w-full rounded-input border border-line bg-bg ps-9 pe-3 text-body text-fg placeholder:text-fg-muted focus-visible:focus-ring" />
          </div>
          {catalog.error && !catalog.data ? <ErrorLine message={catalog.error} onRetry={() => void catalog.reload()} /> : null}
          <ul aria-label="Menu" className="max-h-56 divide-y divide-line overflow-y-auto rounded-input border border-line">
            {shown.length ? (
              shown.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => add(i.id, i.name, i.priceCents)} className="flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-start hover:bg-bg-subtle focus-visible:focus-ring">
                    <span className="min-w-0 flex-1 truncate text-body text-fg">{i.name}</span>
                    <span className="shrink-0 text-meta text-fg-muted tabular">{i.weightUnit && i.unitPriceCents ? `${formatMoney(i.unitPriceCents)}/${i.weightUnit}` : formatMoney(i.priceCents)}</span>
                    <Plus aria-hidden className="size-4 shrink-0 text-fg-muted" />
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-3 text-meta text-fg-muted">{catalog.loading ? "Loading the menu..." : menu.length ? "No dish matches that." : isPre ? (grocer ? "No butcher items yet. Add them in the Butcher counter page." : "No pre-order dishes yet. Mark a degh as pre-order only in Menu & dietary.") : "No dishes on the menu yet."}</li>
            )}
          </ul>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={isPre ? "Pickup day and time" : "Pickup time"} type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} optionalLabel={!isPre} hint={isPre ? "Toronto time." : "Leave empty for as soon as it's ready."} />
          {!isPre ? (
            <Select label="Payment" value={tender} onChange={(e) => setTender(e.target.value as "" | "cash" | "card")} options={[{ value: "", label: mode === "phone" ? "Pays at pickup" : "Open tab (pay later or split)" }, { value: "cash", label: "Paid cash" }, { value: "card", label: "Paid card at the counter" }]} />
          ) : (
            <label className="flex items-start gap-2 self-end pb-6 text-body text-fg">
              <input type="checkbox" className="mt-1 size-4" checked={deposit} onChange={(e) => setDeposit(e.target.checked)} />
              <span>Deposit taken now (cash or card)</span>
            </label>
          )}
          <div className="sm:col-span-2">
            <TextField label="Allergy" optionalLabel value={allergy} onChange={(e) => setAllergy(e.target.value)} maxLength={200} placeholder="tree nuts, no onion..." hint={grocer ? "Shown on the order." : "Shows as a red band on the kitchen ticket."} />
          </div>
          <div className="sm:col-span-2">
            <TextField type="textarea" label={grocer ? "Notes for the butcher" : "Notes for the kitchen"} optionalLabel value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={cn("min-h-16")} />
          </div>
        </div>
        {isPre && !enabled("restaurant.degh_preorders") && !enabled("grocery.counter_preorders") ? <Banner tone="warning">Pre-orders need the Growth tier.</Banner> : null}
      </div>
    </Sheet>
  );
}
