"use client";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { commerceApi, whatsappApi } from "@ll/shared";
import { DefList, Panel } from "@/components/dashboard";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { fromLocalInput, toLocalInput } from "@/lib/dashboard/time";
import { useAction } from "@/lib/dashboard/useApi";

interface Line {
  catalogItemId: string;
  name: string;
  quantity: number;
}

/** "karahi (chicken karahi or lamb karahi?)" -> the heard phrase and the menu names it could be. */
function parseUnmatched(u: string): { phrase: string; options: string[] } {
  const m = u.match(/^(.*?)\s*\((.+?)\?\)\s*$/);
  return m ? { phrase: m[1]!, options: m[2]!.split(/\s+or\s+/i).map((s) => s.trim()).filter(Boolean) } : { phrase: u, options: [] };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Transcript with the words the assistant couldn't match marked, so the cook can see what to fix. */
function Transcript({ text, phrases }: { text: string; phrases: string[] }) {
  const parts = useMemo(() => {
    const ps = phrases.filter((p) => p.trim().length > 1);
    if (!ps.length) return [text];
    return text.split(new RegExp(`(${ps.map(esc).join("|")})`, "gi"));
  }, [text, phrases]);
  const lower = phrases.map((p) => p.toLowerCase());
  return (
    <p className="whitespace-pre-wrap text-body text-fg">
      {parts.map((p, i) =>
        lower.includes(p.toLowerCase()) && p ? (
          <mark key={i} className="rounded-sm bg-bg-muted px-0.5 text-fg underline decoration-negative decoration-2 underline-offset-4">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </p>
  );
}

/** Transcript on one side; on the other, the draft order the cook can fix, then confirm or discard. */
export function CallEditor({ call, catalog, catalogError, onChanged }: { call: whatsappApi.PhoneCallDto; catalog: commerceApi.CatalogItemDto[] | null; catalogError: string | null; onChanged: (c: whatsappApi.PhoneCallDto) => void }) {
  const { api, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const editable = call.status === "received" || call.status === "drafted" || call.status === "failed";
  const [lines, setLines] = useState<Line[]>(() => (call.draftOrder?.items ?? []).filter((i): i is Line => !!i.catalogItemId));
  const [pending, setPending] = useState<string[]>(() => [...call.unmatched, ...(call.draftOrder?.items ?? []).filter((i) => !i.catalogItemId).map((i) => i.name)]);
  const [pickup, setPickup] = useState(() => toLocalInput(call.draftOrder?.pickupAt));
  const [notes, setNotes] = useState(call.draftOrder?.notes ?? "");
  const [pay, setPay] = useState<"at_pickup" | "in_app">("at_pickup");
  const [add, setAdd] = useState("");
  const [discard, setDiscard] = useState(false);
  const [done, setDone] = useState<{ number: number } | null>(null);

  const items = useMemo(() => (catalog ?? []).filter((i) => i.available && i.orderable), [catalog]);
  const byId = useMemo(() => new Map((catalog ?? []).map((i) => [i.id, i])), [catalog]);
  const byName = (n: string) => items.find((i) => i.name.toLowerCase() === n.toLowerCase());
  const estimate = lines.reduce((s, l) => s + (byId.get(l.catalogItemId)?.priceCents ?? 0) * l.quantity, 0);

  const bump = (id: string, by: number) => setLines((ls) => ls.map((l) => (l.catalogItemId === id ? { ...l, quantity: Math.min(50, Math.max(1, l.quantity + by)) } : l)));
  const addItem = (item: commerceApi.CatalogItemDto, from?: string) => {
    setLines((ls) => (ls.some((l) => l.catalogItemId === item.id) ? ls.map((l) => (l.catalogItemId === item.id ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l)) : [...ls, { catalogItemId: item.id, name: item.name, quantity: 1 }]));
    if (from) setPending((p) => p.filter((x) => x !== from));
  };

  async function confirm() {
    if (!lines.length) return;
    const r = await act.run(() =>
      api.phone.confirm(call.id, {
        items: lines.map((l) => ({ catalogItemId: l.catalogItemId, name: l.name, quantity: l.quantity })),
        ...(pickup ? { pickupAt: fromLocalInput(pickup) ?? undefined } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        paymentMethod: pay,
      }),
    );
    if (r) {
      setDone({ number: r.order.number });
      toast({ message: `Order #${r.order.number} created`, tone: "success" });
      onChanged(r.call);
    }
  }

  // Once the call is an order (or discarded) there is nothing left to match, so the underlines go away.
  const unmatchedPhrases = editable && !done ? pending.map((p) => parseUnmatched(p).phrase) : [];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="What the caller said" description={call.language ? undefined : "The language wasn't detected, so check the wording closely."}>
        {call.transcript ? <Transcript text={call.transcript} phrases={unmatchedPhrases} /> : <p className="text-meta text-fg-muted">There is no transcript for this call. The caller may have hung up before ordering.</p>}
        {unmatchedPhrases.length ? <p className="mt-3 text-meta text-fg-muted">Underlined words didn&apos;t match anything on your menu.</p> : null}
      </Panel>

      <div className="flex min-w-0 flex-col gap-4">
        {done ? (
          <Banner tone="success" title={`Order #${done.number} is in your queue`} action={<Button size="sm" variant="secondary" href={`${base}/orders`}>Open orders</Button>}>
            The caller&apos;s number is on the order{pay === "at_pickup" ? ", and they pay at pickup" : ""}.
          </Banner>
        ) : call.status === "confirmed" ? (
          <Banner tone="success" title="This call became an order" action={<Button size="sm" variant="secondary" href={`${base}/orders`}>Open orders</Button>} />
        ) : call.status === "discarded" ? (
          <Banner tone="neutral" title="You discarded this call" />
        ) : null}
        {call.status === "failed" ? <Banner tone="warning" title="We couldn't place this order">Check the items and pickup time, then confirm again.</Banner> : null}

        <Panel
          title="Draft order"
          description={editable ? "Fix quantities, match or add dishes, then confirm. The customer is treated as a phone order." : undefined}
          footer={
            editable ? (
              <>
                <Button variant="ghost" size="sm" disabled={act.busy} onClick={() => setDiscard(true)}>
                  Discard call
                </Button>
                <Button size="sm" disabled={!lines.length} loading={act.busy} onClick={() => void confirm()}>
                  Confirm into order
                </Button>
              </>
            ) : undefined
          }
        >
          {lines.length ? (
            <ul className="divide-y divide-line border-y border-line" aria-label="Order items">
              {lines.map((l) => (
                <li key={l.catalogItemId} className="flex min-h-12 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-fg">{byId.get(l.catalogItemId)?.name ?? l.name}</span>
                    {byId.get(l.catalogItemId) ? <span className="block text-meta text-fg-muted tabular">{formatMoney(byId.get(l.catalogItemId)!.priceCents)} each</span> : null}
                  </span>
                  {editable ? (
                    <>
                      <span className="inline-flex items-center rounded-full border border-line">
                        <button type="button" aria-label={`One fewer ${l.name}`} disabled={l.quantity <= 1} onClick={() => bump(l.catalogItemId, -1)} className="inline-flex size-9 items-center justify-center rounded-full text-fg hover:bg-bg-subtle disabled:text-fg-subtle focus-visible:focus-ring">
                          <Minus aria-hidden className="size-4" />
                        </button>
                        <span className="w-7 text-center text-body tabular" aria-live="polite">{l.quantity}</span>
                        <button type="button" aria-label={`One more ${l.name}`} onClick={() => bump(l.catalogItemId, 1)} className="inline-flex size-9 items-center justify-center rounded-full text-fg hover:bg-bg-subtle focus-visible:focus-ring">
                          <Plus aria-hidden className="size-4" />
                        </button>
                      </span>
                      <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.catalogItemId !== l.catalogItemId))} className="inline-flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </>
                  ) : (
                    <span className="text-body tabular">× {l.quantity}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-meta text-fg-muted">{editable ? "No dishes matched yet. Add them from your menu below." : "No items on this draft."}</p>
          )}

          {editable && pending.length ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-meta-strong text-fg">Didn&apos;t match your menu</p>
              <ul className="flex flex-col gap-3">
                {pending.map((u) => {
                  const { phrase, options } = parseUnmatched(u);
                  const hits = options.map(byName).filter((x): x is commerceApi.CatalogItemDto => !!x);
                  return (
                    <li key={u} className="flex flex-col gap-2 border-s-2 border-negative ps-3">
                      <p className="text-body text-fg">“{phrase}”</p>
                      {hits.length ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-meta text-fg-muted">Did they mean</span>
                          {hits.map((h) => (
                            <Button key={h.id} size="sm" variant="secondary" onClick={() => addItem(h, u)}>
                              {h.name}
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <Select label="Match to a menu item" hideLabel value="" placeholder="Match to a menu item..." options={items.map((i) => ({ value: i.id, label: i.name }))} onChange={(e) => { const it = byId.get(e.target.value); if (it) addItem(it, u); }} />
                      )}
                      <button type="button" onClick={() => setPending((p) => p.filter((x) => x !== u))} className="self-start rounded-sm text-meta text-fg-muted underline decoration-line underline-offset-4 hover:text-fg focus-visible:focus-ring">
                        Ignore this
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {editable ? (
            <div className="mt-4 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select label="Add from your menu" value={add} placeholder={catalogError ? "Menu didn't load" : "Choose a dish..."} options={items.map((i) => ({ value: i.id, label: `${i.name} · ${formatMoney(i.priceCents)}` }))} onChange={(e) => setAdd(e.target.value)} />
              </div>
              <Button variant="secondary" className="mb-[22px]" disabled={!add} onClick={() => { const it = byId.get(add); if (it) addItem(it); setAdd(""); }}>
                Add
              </Button>
            </div>
          ) : null}
          {estimate > 0 ? <p className="mt-3 text-meta text-fg-muted">About {formatMoney(estimate)} before tax.</p> : null}

          {editable ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField label="Pickup time" type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} hint="Toronto time. Leave empty for as soon as it's ready." />
              <Select label="Payment" value={pay} onChange={(e) => setPay(e.target.value as "at_pickup" | "in_app")} options={[{ value: "at_pickup", label: "Pays at pickup" }, { value: "in_app", label: "Pays in the app" }]} />
              <div className="sm:col-span-2">
                <TextField type="textarea" label="Notes for the kitchen" optionalLabel value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} showCount className="min-h-20" />
              </div>
            </div>
          ) : (
            <DefList className="mt-4" items={[{ label: "Pickup time", value: call.draftOrder?.pickupAt ? new Date(call.draftOrder.pickupAt).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" }) : "As soon as ready" }, { label: "Notes", value: call.draftOrder?.notes ?? "None" }]} />
          )}
          {act.error ? <Banner tone="danger" className="mt-4">{act.error}</Banner> : null}
        </Panel>
      </div>
      <ConfirmDialog
        open={discard}
        onClose={() => setDiscard(false)}
        title="Discard this call?"
        body="The draft is thrown away and no order is created. The transcript stays in your call list."
        confirmLabel="Discard"
        danger
        onConfirm={async () => {
          const c = await api.phone.discard(call.id);
          toast({ message: "Call discarded", tone: "success" });
          onChanged(c);
        }}
      />
    </div>
  );
}
