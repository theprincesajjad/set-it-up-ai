"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { lbToGrams, type petApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, PageHeader, SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { MemberPicker, type PickedMember } from "@/components/dashboard/pets/MemberPicker";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { poundsLabel, punchCircles, shortDate } from "@/lib/dashboard/pets";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function FoodCardsPage() {
  return (
    <FeatureGate keys={["pets.food_cards"]} title="Food cards">
      <Food />
    </FeatureGate>
  );
}

/** Food cards (Figma frame 4): the brands on a card, who is running out, and the card at the counter. */
function Food() {
  const { api, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const programs = useApi(() => api.food.programs(), [api]);
  const runout = useApi(() => api.food.runOut(), [api]);
  const [brand, setBrand] = useState(false);
  const [sku, setSku] = useState<petApi.FoodProgramDto | null>(null);
  const manager = role !== "staff";
  const ready = runout.data?.items.filter((i) => i.readyToText).length ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Food cards" description="Buy 12 bags, the next one is free. Counted by brand and bag size, and locked until it is earned." actions={manager ? <Button size="sm" iconStart={Plus} onClick={() => setBrand(true)}>Add a brand</Button> : undefined} />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="flex flex-col gap-5">
          <Async state={programs} skeleton={<div className="skeleton h-40 w-full rounded-card" />}>
            {(r) =>
              r.programs.length === 0 ? (
                <Empty action={manager ? <Button size="sm" onClick={() => setBrand(true)}>Add a brand</Button> : undefined}>No brands on a card yet. Add Fromm, Open Farm or any brand you run a buy 12 get 1 on.</Empty>
              ) : (
                <section aria-label="Brands on a card" className="overflow-hidden rounded-card bg-card shadow-card">
                  <div className="border-b border-line px-5 py-3.5">
                    <h2 className="text-body-strong text-fg">Brands on a card</h2>
                  </div>
                  <ul className="divide-y divide-line">
                    {r.programs.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                        <div className="min-w-0">
                          <p className="text-body-strong text-fg">{p.brand}{!p.active ? <span className="ms-2 text-meta font-normal text-fg-muted">Off</span> : null}</p>
                          <p className="text-meta text-fg-muted">Buy {p.buyCount}, get 1 · same bag size · counts for {p.expiryMonths} months</p>
                          <p className="text-meta text-fg-muted">{p.skus.length ? p.skus.map((s) => `${s.name} (${poundsLabel(s.bagGrams)})`).join(", ") : "No products yet"}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-meta text-fg-muted">{p.cards} {p.cards === 1 ? "card" : "cards"}</span>
                          {manager ? <Button size="sm" variant="secondary" onClick={() => setSku(p)}>Add a product</Button> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            }
          </Async>
          <section aria-label="Running out soon" className="overflow-hidden rounded-card bg-card shadow-card">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
              <div>
                <h2 className="text-body-strong text-fg">Running out soon</h2>
                <p className="text-meta text-fg-muted">From bag size and daily amount. A text goes 5 days before, once per bag, only if they said yes.</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!ready || act.busy}
                onClick={async () => {
                  const r = await act.run(() => api.food.sendRunOut());
                  if (r) toast({ message: `${r.sent} ${r.sent === 1 ? "text" : "texts"} sent`, tone: "success" });
                  await runout.reload();
                }}
              >
                {`Text ${ready} due`}
              </Button>
            </div>
            <Async state={runout} skeleton={<div className="skeleton m-4 h-16 rounded-card" />}>
              {(r) =>
                r.items.length === 0 ? (
                  <p className="px-5 py-4 text-meta text-fg-muted">Nobody is running out in the next week. Add a daily amount when you tap a bag to start a reminder.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {r.items.map((i) => (
                      <li key={i.cardId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                        <div>
                          <p className="text-body-strong text-fg">{i.petName ? `${i.petName}, ` : ""}{i.brand} {i.skuName}</p>
                          <p className="text-meta text-fg-muted">{i.customerName ?? "No name"}</p>
                        </div>
                        <div className="flex items-center gap-3 text-meta">
                          <span className="text-fg">Out {shortDate(i.runOutOn)}</span>
                          <Dot tone="accent">{i.readyToText ? "Text due" : `Text ${shortDate(i.remindOn)}`}</Dot>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              }
            </Async>
          </section>
        </div>
        <Counter programs={programs.data?.programs ?? []} onChanged={() => { void programs.reload(); void runout.reload(); }} />
      </div>
      <BrandSheet open={brand} onClose={() => setBrand(false)} onSaved={() => void programs.reload()} />
      <SkuSheet program={sku} onClose={() => setSku(null)} onSaved={() => void programs.reload()} />
    </div>
  );
}

/** The card at the counter: pick the customer and the bag, tap Add bag; the free bag unlocks when the count is reached. */
function Counter({ programs, onChanged }: { programs: petApi.FoodProgramDto[]; onChanged: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [member, setMember] = useState<PickedMember | null>(null);
  const [skuId, setSkuId] = useState("");
  const [grams, setGrams] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const cards = useApi(member ? () => api.food.cards(member.memberId) : null, [api, member?.memberId]);
  const skus = programs.filter((p) => p.active).flatMap((p) => p.skus.filter((s) => s.active).map((s) => ({ ...s, brand: p.brand })));
  // The bag defaults to the one this customer buys most (their fullest live card), not the first product in the list.
  const usual = [...(cards.data?.cards ?? [])].filter((c) => !c.expired).sort((a, b) => b.counted - a.counted)[0]?.skuId;
  const chosen = skus.find((s) => s.id === (skuId || usual || skus[0]?.id));
  const card = cards.data?.cards.find((c) => c.skuId === chosen?.id) ?? null;
  const prog = programs.find((p) => p.skus.some((s) => s.id === chosen?.id));
  const total = card?.buyCount ?? prog?.buyCount ?? 12;
  const filled = card ? (card.canRedeem ? total : card.counted) : 0;
  async function add(qty: number) {
    if (!member || !chosen) return;
    const dg = grams.trim() ? Number(grams) : undefined;
    const r = await act.run(() => api.food.punch({ memberId: member.memberId, skuId: chosen.id, qty, ...(dg ? { dailyGrams: dg } : {}) }));
    if (r) {
      setNote(r.needsCustomerYes ? "The daily amount is saved. The run-out text starts when they switch it on in Pet food cards on their card." : null);
      toast({ message: r.canRedeem ? "The free bag is ready" : `${r.toGo} to go`, tone: "success" });
      await cards.reload();
      onChanged();
    }
  }
  return (
    <section aria-label="At the counter" className="flex flex-col gap-4 rounded-card bg-card shadow-card px-5 py-5">
      <h2 className="text-body-strong text-fg">At the counter{member?.name ? `: ${member.name}` : ""}</h2>
      <MemberPicker value={member} onPick={(m) => { setMember(m); setNote(null); }} />
      {member ? (
        <>
          {skus.length === 0 ? <p className="text-meta text-fg-muted">Add a brand and a product first.</p> : (
            <Select label="Bag" value={chosen?.id ?? ""} onChange={(e) => setSkuId(e.target.value)} options={skus.map((s) => ({ value: s.id, label: `${s.brand} ${s.name} (${poundsLabel(s.bagGrams)})` }))} />
          )}
          {chosen ? (
            <>
              <div className="flex flex-wrap gap-2" role="img" aria-label={`${filled} of ${total} bags`}>
                {punchCircles(filled, total).map((on, i) => (
                  <span key={i} className={cn("flex size-10 items-center justify-center rounded-full border text-meta-strong tabular-nums", on ? "border-primary bg-primary text-primary-foreground" : "border-line text-fg-subtle")}>{i + 1}</span>
                ))}
              </div>
              <p className="text-meta text-fg-muted" aria-live="polite">
                {card?.expired ? "The bags on this card are too old to count. The next bag starts a new card." : card?.canRedeem ? "A free bag is ready." : `${filled} of ${total} bags. ${total - filled} more and the next ${poundsLabel(chosen.bagGrams)} bag is free.`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" loading={act.busy} onClick={() => void add(1)}>Add 1 bag</Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!card?.canRedeem || act.busy}
                  onClick={async () => {
                    const r = await act.run(() => api.food.redeem(card!.id));
                    if (r) {
                      toast({ message: "Free bag given", tone: "success" });
                      await cards.reload();
                      onChanged();
                    }
                  }}
                >
                  Give the free bag
                </Button>
                {card ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={act.busy}
                    onClick={async () => {
                      const r = await act.run(() => api.food.undo(card.id));
                      if (r) {
                        await cards.reload();
                        onChanged();
                      }
                    }}
                  >
                    Undo last bag
                  </Button>
                ) : null}
              </div>
              {!card?.canRedeem ? <p className="text-caption text-fg-muted">Locked until the card is full. The server refuses early, so a till slip-up cannot give away a bag.</p> : null}
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <TextField label="Daily amount, grams (for the run-out text)" type="number" min={10} value={grams} onChange={(e) => setGrams(e.target.value)} placeholder={card?.dailyGrams ? String(card.dailyGrams) : "360"} hint={grams && Number(grams) > 0 ? `A ${poundsLabel(chosen.bagGrams)} bag lasts about ${Math.max(1, Math.floor(chosen.bagGrams / Number(grams)))} days.` : undefined} />
                <p className="text-meta text-fg-muted">The run-out text is their own choice: tell them to switch on &ldquo;Text me before it runs out&rdquo; in Pet food cards on their card. We never switch it on for them at the till.</p>
                {card?.runOutOn ? <p className="text-meta text-fg-muted">Runs out about {shortDate(card.runOutOn)}{card.remind ? `. Text goes ${shortDate(card.remindOn)}.` : ". No reminder."}</p> : null}
                {note ? <Banner tone="warning">{note}</Banner> : null}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <p className="text-meta text-fg-muted">Find the customer, pick the bag, tap Add bag.</p>
      )}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
    </section>
  );
}

function BrandSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [brand, setBrand] = useState("");
  const [buy, setBuy] = useState("12");
  const [months, setMonths] = useState("12");
  const [tried, setTried] = useState(false);
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Add a brand"
      title="Add a brand"
      subtitle="Your own terms. In Canada the offer is the shop's, so set it the way you advertise it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              setTried(true);
              if (!brand.trim()) return;
              const r = await act.run(() => api.food.addProgram({ brand: brand.trim(), buyCount: Number(buy), expiryMonths: Number(months) }));
              if (r) {
                toast({ message: `${r.brand} is on a card. Add a product next.`, tone: "success" });
                setBrand("");
                setTried(false);
                onSaved();
                onClose();
              }
            }}
          >
            Add brand
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} error={tried && !brand.trim() ? "Add the brand" : undefined} autoComplete="off" />
        <TextField label="Bags to buy, then the next is free" type="number" min={2} value={buy} onChange={(e) => setBuy(e.target.value)} />
        <TextField label="Bags count for (months)" type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} hint="Pet Valu and Mud Bay use 12 to 24 months." />
      </div>
    </SidePanel>
  );
}

function SkuSheet({ program, onClose, onSaved }: { program: petApi.FoodProgramDto | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState("");
  const [lb, setLb] = useState("");
  const [tried, setTried] = useState(false);
  return (
    <SidePanel
      open={!!program}
      onClose={onClose}
      label="Add a product"
      title={`Add a ${program?.brand ?? ""} product`}
      subtitle="Each bag size is its own card, so the free bag matches what was bought."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              setTried(true);
              if (!name.trim() || !Number(lb)) return;
              const r = await act.run(() => api.food.addSku(program!.id, { name: name.trim(), bagGrams: lbToGrams(Number(lb)) }));
              if (r) {
                toast({ message: `${r.name} added`, tone: "success" });
                setName("");
                setLb("");
                setTried(false);
                onSaved();
                onClose();
              }
            }}
          >
            Add product
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="Product" value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim() ? "Add the product name" : undefined} placeholder="Gold Adult" autoComplete="off" />
        <TextField label="Bag size (lb)" type="number" min={0.1} step="0.1" value={lb} onChange={(e) => setLb(e.target.value)} error={tried && !Number(lb) ? "Add the bag size" : undefined} hint="Used to work out when a bag runs out." />
      </div>
    </SidePanel>
  );
}
