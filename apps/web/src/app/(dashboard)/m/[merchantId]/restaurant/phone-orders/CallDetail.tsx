"use client";
import { nowMs } from "@/lib/restaurant/util";
/**
 * One call in the right pane (frame 09): what we heard in the caller's language, what we understood in English, and the
 * draft order with only the uncertain item flagged. A heard phrase that fits several dishes ("biryani") shows chips of the
 * dishes and keeps the spoken quantity when one is picked. The order cannot be confirmed until every flagged item is settled.
 */
import { Minus, Plus, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { commerceApi, whatsappApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { formatPhone, whenTor } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useAction } from "@/lib/dashboard/useApi";
import { addLine, resolveAmbiguous, type DraftLine } from "@/lib/restaurant/phoneDraft";
import { languageName } from "./CallStatus";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Transcript with the phrases we could not place marked, so the cook can see what to fix. */
function Transcript({ text, phrases, rtl }: { text: string; phrases: string[]; rtl: boolean }) {
  const parts = useMemo(() => {
    const ps = phrases.filter((p) => p.trim().length > 1);
    return ps.length ? text.split(new RegExp(`(${ps.map(esc).join("|")})`, "gi")) : [text];
  }, [text, phrases]);
  const lower = phrases.map((p) => p.toLowerCase());
  return (
    <p dir={rtl ? "rtl" : "ltr"} className={cn("whitespace-pre-wrap text-[16px] text-fg", rtl && "leading-[2]")}>
      {parts.map((p, i) =>
        p && lower.includes(p.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-transparent px-0.5 text-fg underline decoration-negative decoration-2 underline-offset-4">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </p>
  );
}

export function CallDetail({ call, catalog, onChanged }: { call: whatsappApi.PhoneCallDto; catalog: commerceApi.CatalogItemDto[] | null; onChanged: (c: whatsappApi.PhoneCallDto) => void }) {
  const { api, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const editable = call.status === "received" || call.status === "drafted" || call.status === "failed";
  const items = useMemo(() => (catalog ?? []).filter((i) => i.available && i.orderable && !i.preorderOnly && !(i.soldOutUntil && new Date(i.soldOutUntil).getTime() > nowMs())), [catalog]);
  const byId = useMemo(() => new Map((catalog ?? []).map((i) => [i.id, i])), [catalog]);
  const [lines, setLines] = useState<DraftLine[]>(() => (call.draftOrder?.items ?? []).filter((i): i is DraftLine => !!i.catalogItemId).map((i) => ({ catalogItemId: i.catalogItemId, name: i.name, quantity: i.quantity, uncertain: !!i.uncertain })));
  const [ambiguous, setAmbiguous] = useState(call.ambiguous);
  const [pending, setPending] = useState<string[]>(() => [...call.unmatched, ...(call.draftOrder?.items ?? []).filter((i) => !i.catalogItemId).map((i) => i.name)]);
  const [notes, setNotes] = useState(call.draftOrder?.notes ?? "");
  const [add, setAdd] = useState("");
  const [discard, setDiscard] = useState(false);
  const [done, setDone] = useState<{ number: number } | null>(null);

  const rtl = call.language === "ur";
  const unresolved = ambiguous.length + lines.filter((l) => l.uncertain).length;
  const estimate = lines.reduce((s, l) => s + (byId.get(l.catalogItemId)?.priceCents ?? 0) * l.quantity, 0);
  const phrases = editable && !done ? [...pending, ...ambiguous.map((a) => a.phrase)] : [];
  const caller = call.callerName ?? formatPhone(call.fromPhone);

  const bump = (id: string, by: number) => setLines((ls) => ls.map((l) => (l.catalogItemId === id ? { ...l, quantity: Math.min(50, Math.max(1, l.quantity + by)) } : l)));
  const addItem = (item: commerceApi.CatalogItemDto, qty = 1) => setLines((ls) => addLine(ls, item, qty));
  const pick = (idx: number, option: { catalogItemId: string; name: string }) => {
    const a = ambiguous[idx];
    if (!a) return;
    const hit = resolveAmbiguous(a, option, items);
    if (!hit) return;
    // The spoken quantity travels with the pick ("two biryani" -> 2 of the one you choose).
    addItem(hit, a.quantity);
    setAmbiguous((x) => x.filter((_, i) => i !== idx));
  };

  async function confirm(payInApp: boolean) {
    if (!lines.length || unresolved) return;
    const r = await act.run(() =>
      api.phone.confirm(call.id, {
        items: lines.map((l) => ({ catalogItemId: l.catalogItemId, name: l.name, quantity: l.quantity })),
        ...(call.draftOrder?.pickupAt ? { pickupAt: call.draftOrder.pickupAt } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        paymentMethod: payInApp ? "in_app" : "at_pickup",
      }),
    );
    if (r) {
      setDone({ number: r.order.number });
      toast({ message: `Order #${r.order.number} created`, tone: "success" });
      onChanged(r.call);
    }
  }
  async function doDiscard() {
    const c = await act.run(() => api.phone.discard(call.id));
    if (c) {
      toast({ message: "Call discarded", tone: "success" });
      setDiscard(false);
      onChanged(c);
    }
  }

  const pickupText = call.draftOrder?.pickupAt ? new Date(call.draftOrder.pickupAt).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).replace(/\./g, "").toLowerCase() : null;
  return (
    <div className="flex min-h-0 flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-headline text-fg">
            {call.callerName ? `${call.callerName} · ` : ""}
            {formatPhone(call.fromPhone)}
          </h2>
          <p className="mt-0.5 text-meta text-fg-muted">
            Called {whenTor(call.createdAt)} · {languageName(call.language)}
            {call.member ? ` · matched to a member: ${call.member.visits} ${call.member.visits === 1 ? "visit" : "visits"}` : " · not a member yet"}
          </p>
        </div>
      </header>

      {call.transcript ? (
        <section aria-label="What we heard" className="border-b border-line bg-bg-subtle px-6 py-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-muted">What we heard</p>
          <div className="mt-1.5">
            <Transcript text={call.transcript} phrases={phrases} rtl={rtl} />
          </div>
          {call.understood && call.language !== "en" ? <p className="mt-2 text-meta text-fg-muted">What we understood: {call.understood}</p> : null}
          {phrases.length ? <p className="mt-2 text-meta text-fg-muted">Underlined words didn&apos;t match one dish on your menu.</p> : null}
        </section>
      ) : (
        <p className="border-b border-line bg-bg-subtle px-6 py-4 text-meta text-fg-muted">There is no transcript for this call. The caller may have hung up before ordering.</p>
      )}

      <div className="flex flex-col gap-4 px-6 py-5">
        {done ? (
          <Banner tone="success" title={`Order #${done.number} is in your queue`} action={<Button size="sm" variant="secondary" href={`${base}/orders`}>Open orders</Button>}>
            The caller&apos;s number is on the order and the kitchen sees it as a phone order.
          </Banner>
        ) : call.status === "confirmed" ? (
          <Banner tone="success" title={call.orderNumber ? `This call became order #${call.orderNumber}` : "This call became an order"} action={<Button size="sm" variant="secondary" href={`${base}/orders`}>Open orders</Button>} />
        ) : call.status === "discarded" ? (
          <Banner tone="neutral" title="You discarded this call" />
        ) : null}
        {call.status === "failed" ? <Banner tone="warning" title="We couldn't place this order">Check the items, then confirm again.</Banner> : null}
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

        <h3 className="text-[15px] font-semibold text-fg">Draft order</h3>
        {lines.length ? (
          <ul className="divide-y divide-line border-y border-line" aria-label="Order items">
            {lines.map((l) => {
              const it = byId.get(l.catalogItemId);
              return (
                <li key={l.catalogItemId} className="flex min-h-14 flex-wrap items-center gap-3 py-2.5">
                  <span className="w-9 shrink-0 text-body font-semibold tabular">{l.quantity} ×</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-fg">{it?.name ?? l.name}</span>
                    {l.uncertain && editable ? <span className="block text-meta text-negative">The assistant isn&apos;t sure of this match. Check it, then tap Looks right.</span> : null}
                  </span>
                  {editable ? (
                    <>
                      {l.uncertain ? (
                        <Button size="sm" variant="secondary" onClick={() => setLines((ls) => ls.map((x) => (x.catalogItemId === l.catalogItemId ? { ...x, uncertain: false } : x)))}>Looks right</Button>
                      ) : null}
                      <span className="inline-flex items-center rounded-full border border-line">
                        <button type="button" aria-label={`One fewer ${l.name}`} disabled={l.quantity <= 1} onClick={() => bump(l.catalogItemId, -1)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-bg-subtle disabled:text-fg-subtle focus-visible:focus-ring"><Minus aria-hidden className="size-4" /></button>
                        <span className="w-7 text-center text-body tabular" aria-live="polite">{l.quantity}</span>
                        <button type="button" aria-label={`One more ${l.name}`} onClick={() => bump(l.catalogItemId, 1)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-bg-subtle focus-visible:focus-ring"><Plus aria-hidden className="size-4" /></button>
                      </span>
                      <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.catalogItemId !== l.catalogItemId))} className="inline-flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring"><Trash2 aria-hidden className="size-4" /></button>
                    </>
                  ) : null}
                  {it ? <span className="w-16 text-end text-body tabular">{formatMoney(it.priceCents * l.quantity)}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-meta text-fg-muted">{editable ? "No dish matched yet. Pick from the chips below or add one from your menu." : "No items on this draft."}</p>
        )}

        {editable && ambiguous.length ? (
          <ul className="flex flex-col gap-3" aria-label="Which dish did they mean">
            {ambiguous.map((a, idx) => {
              const opts = a.options.map((o) => ({ ...o, hit: resolveAmbiguous(a, o, items) })).filter((o) => o.hit);
              return (
                <li key={`${a.phrase}-${idx}`} className="flex flex-col gap-2 border-s-2 border-negative ps-3">
                  <p className="text-body font-semibold text-fg">{a.quantity} × “{a.phrase}”</p>
                  <p className="text-meta text-negative">Which one? They said it could be more than one dish.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {opts.map((o) => (
                      <Button key={o.hit!.id} size="sm" variant="secondary" onClick={() => pick(idx, o)}>
                        {o.hit!.name}
                      </Button>
                    ))}
                    <button type="button" onClick={() => setAmbiguous((x) => x.filter((_, i) => i !== idx))} className="rounded-sm text-meta text-fg-muted underline decoration-line underline-offset-4 hover:text-fg focus-visible:focus-ring">Ignore this</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {editable && pending.length ? (
          <ul className="flex flex-col gap-3" aria-label="Not on the menu">
            {pending.map((u) => (
              <li key={u} className="flex flex-col gap-2 border-s-2 border-negative ps-3">
                <p className="text-body text-fg">“{u}” isn&apos;t on your menu</p>
                <Select label="Match to a menu item" hideLabel value="" placeholder="Match to a menu item..." options={items.map((i) => ({ value: i.id, label: i.name }))} onChange={(e) => { const it = byId.get(e.target.value); if (it) { addItem(it); setPending((p) => p.filter((x) => x !== u)); } }} />
                <button type="button" onClick={() => setPending((p) => p.filter((x) => x !== u))} className="self-start rounded-sm text-meta text-fg-muted underline decoration-line underline-offset-4 hover:text-fg focus-visible:focus-ring">Ignore this</button>
              </li>
            ))}
          </ul>
        ) : null}

        {editable ? (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Select label="Add from your menu" value={add} placeholder="Choose a dish..." options={items.map((i) => ({ value: i.id, label: `${i.name} · ${formatMoney(i.priceCents)}` }))} onChange={(e) => setAdd(e.target.value)} />
            </div>
            <Button variant="secondary" className="mb-[22px]" disabled={!add} onClick={() => { const it = byId.get(add); if (it) addItem(it); setAdd(""); }}>Add</Button>
          </div>
        ) : null}

        <p className="text-meta text-fg-muted">
          {pickupText ? <>Pickup <span className="font-medium text-fg">{pickupText}</span> · </> : "Pickup as soon as it's ready · "}
          Pay at pickup{call.member ? " · member points will be added" : ""}
          {estimate > 0 ? ` · about ${formatMoney(estimate)} before tax` : ""}
        </p>
        {editable ? (
          <label className="flex flex-col gap-1.5 text-meta-strong text-fg">
            Notes for the kitchen <span className="font-normal text-fg-muted">(optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={400} className="h-11 rounded-input border border-line bg-bg px-3 text-body font-normal text-fg focus-visible:focus-ring" />
          </label>
        ) : null}
      </div>

      {editable ? (
        <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-bg-subtle px-6 py-4">
          <p className="min-w-0 flex-1 text-meta text-fg-muted">
            {unresolved ? `${unresolved} ${unresolved === 1 ? "item needs" : "items need"} a look before you can confirm.` : call.usualText ? `${caller}'s usual is ${call.usualText.toLowerCase()}` : null}
          </p>
          <Button variant="secondary" size="md" disabled={act.busy} onClick={() => setDiscard(true)}>Discard</Button>
          <Button variant="secondary" size="md" disabled={!lines.length || !!unresolved} onClick={() => void confirm(true)}>Send a pay link instead</Button>
          <Button size="md" disabled={!lines.length || !!unresolved} loading={act.busy} onClick={() => void confirm(false)}>Confirm order</Button>
        </footer>
      ) : null}
      {discard ? (
        <div role="alertdialog" aria-label="Discard this call" className="border-t border-line bg-bg px-6 py-4">
          <p className="text-body-strong text-fg">Discard this call?</p>
          <p className="mt-0.5 text-meta text-fg-muted">The draft is thrown away and no order is created. The transcript stays in your call list.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" loading={act.busy} onClick={() => void doDiscard()}>Discard</Button>
            <Button variant="ghost" size="sm" onClick={() => setDiscard(false)}>Keep it</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
