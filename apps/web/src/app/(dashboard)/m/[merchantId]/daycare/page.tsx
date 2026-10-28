"use client";
import { Plus, Settings } from "lucide-react";
import { useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, PageHeader, SidePanel, SkeletonRows, StatBlock } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { MemberPicker, type PickedMember } from "@/components/dashboard/pets/MemberPicker";
import { ReportCardSheet } from "@/components/dashboard/pets/ReportCardSheet";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/dashboard/calendar";
import { stayTag } from "@/lib/dashboard/pets";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import type { petApi } from "@ll/shared";

export default function DaycarePage() {
  return (
    <FeatureGate keys={["pets.daycare"]} title="Daycare today">
      <Day />
    </FeatureGate>
  );
}

/** Daycare today (Figma frame 3): the count against capacity and dogs per staff, check in and out, and the dogs that cannot come in yet. */
function Day() {
  const { api, base, role, enabled, detail } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.daycare.day(), [api], { pollMs: 20_000 });
  const [addDog, setAddDog] = useState(false);
  const [pack, setPack] = useState(false);
  const [settings, setSettings] = useState(false);
  const [card, setCard] = useState<{ petId: string; petName: string; ownerName: string | null } | null>(null);
  const d = state.data;
  const manager = role !== "staff";
  async function run<T>(fn: () => Promise<T>, ok?: (r: T) => string) {
    const r = await act.run(fn);
    if (r !== undefined && ok) toast({ message: ok(r), tone: "success" });
    await state.reload();
    return r;
  }
  const checkIn = (s: petApi.DaycareStayDto) => run(() => api.daycare.checkIn(s.id), (r) => `${s.petName} is in${r.payKind === "pack" && r.packDaysLeft !== null ? `. ${r.packDaysLeft} pack ${r.packDaysLeft === 1 ? "day" : "days"} left` : ""}`);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title={`Daycare, ${d ? new Date(`${d.day}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" }) : "today"}`}
        description="Check dogs in, count the room, keep the ratio."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {manager ? <Button size="sm" variant="secondary" iconStart={Settings} onClick={() => setSettings(true)}>Room settings</Button> : null}
            <Button size="sm" variant="secondary" onClick={() => setPack(true)}>Sell a pack</Button>
            <Button size="sm" iconStart={Plus} onClick={() => setAddDog(true)}>Add a dog</Button>
          </div>
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <StatBlock
        label="The room now"
        loading={!d}
        items={[
          { label: "In the room", value: d ? `${d.inRoom} of ${d.settings.capacity}` : "", caption: d && d.inRoom >= d.settings.capacity ? "Full" : "dogs now", dot: d && d.inRoom >= d.settings.capacity ? "accent" : undefined },
          { label: "Staff on", value: d?.settings.staffOn ?? 0, caption: d ? `Ratio ${d.ratioNow} : 1. Your limit is ${d.settings.dogsPerStaff} : 1` : "", dot: d && d.ratioNow > d.settings.dogsPerStaff ? "accent" : undefined },
          { label: "Expected today", value: d ? `${d.expected} more` : "", caption: "not here yet" },
          { label: "Packs low", value: d?.packsLow ?? 0, caption: "1 day left", dot: d && d.packsLow ? "accent" : undefined },
        ]}
      />
      <Async state={state} skeleton={<SkeletonRows rows={5} />}>
        {(r) =>
          r.items.length === 0 ? (
            <Empty action={<Button size="sm" onClick={() => setAddDog(true)}>Add a dog</Button>}>No dogs expected today.</Empty>
          ) : (
            <section aria-label="Dogs today" className="overflow-hidden rounded-card bg-card shadow-card">
              <div className="flex items-center justify-between bg-bg-subtle px-5 py-2.5 text-caption text-fg-muted">
                <span>Dog and owner</span>
                <span>Status</span>
              </div>
              <ul className="divide-y divide-line">
                {r.items.map((s) => {
                  const tag = stayTag(s);
                  const hard = s.blocks.filter((b) => b.code !== "capacity");
                  const full = s.blocks.find((b) => b.code === "capacity");
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="text-body-strong text-fg">{s.petName} <span className="font-normal text-fg-muted">· {s.ownerName ?? "No name"}</span></p>
                        <p className="text-meta text-fg-muted">{s.payKind === "pack" ? `Pack: ${s.packDaysLeft ?? 0} ${s.packDaysLeft === 1 ? "day" : "days"} left` : `Drop-in ${money(r.settings.dropInCents)}`}{s.lateMinutes ? ` · ${s.lateMinutes} min late at pickup` : ""}</p>
                        {hard.length ? <p className="mt-1 text-meta text-negative" role="note">{hard.map((b) => b.message).join(" ")}</p> : null}
                        {!hard.length && full ? <p className="mt-1 text-meta text-fg-muted">{full.message}</p> : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <Dot tone={tag.tone}>{tag.label}</Dot>
                        {s.status === "expected" ? (
                          <>
                            <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => void run(() => api.daycare.noShow(s.id), () => `${s.petName} marked as a no-show`)}>No-show</Button>
                            {hard.length ? (
                              <Button size="sm" variant="secondary" href={`${base}/pets/${s.petId}`}>{hard.some((b) => b.code === "vaccine") ? "Update shots" : `Open ${s.petName}`}</Button>
                            ) : (
                              <Button size="sm" disabled={act.busy || (!!full && !manager)} onClick={() => void checkIn(s)}>Check in</Button>
                            )}
                          </>
                        ) : null}
                        {s.status === "in" ? (
                          <>
                            {enabled("pets.report_cards") ? <Button size="sm" variant="secondary" onClick={() => setCard({ petId: s.petId, petName: s.petName, ownerName: s.ownerName })}>Report card</Button> : null}
                            <Button size="sm" disabled={act.busy} onClick={() => void run(() => api.daycare.checkOut(s.id), (x) => (x.lateMinutes ? `${s.petName} went home, ${x.lateMinutes} min late` : `${s.petName} went home`))}>Check out</Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )
        }
      </Async>
      {d?.items.some((s) => s.blocks.some((b) => b.code === "vaccine")) ? (
        <Banner tone="danger" title="Some dogs cannot check in yet">Ask the owner to upload the new certificate from their card, or check the paper yourself and update the date on the pet&apos;s page.</Banner>
      ) : null}
      <AddDog open={addDog} onClose={() => setAddDog(false)} onAdded={() => void state.reload()} />
      <SellPack open={pack} onClose={() => setPack(false)} settings={d?.settings ?? null} onSold={() => void state.reload()} />
      {d ? <SettingsSheet open={settings} onClose={() => setSettings(false)} initial={d.settings} onSaved={() => void state.reload()} /> : null}
      {card ? <ReportCardSheet open onClose={() => setCard(null)} petId={card.petId} petName={card.petName} ownerName={card.ownerName} kind="daycare" /> : null}
      <p className="text-caption text-fg-muted">{detail.merchant.name}: a day is taken from a pack at check-in, not at booking. Capacity and dogs per staff are your own numbers.</p>
    </div>
  );
}

function AddDog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [q, setQ] = useState("");
  const list = useApi(open ? () => api.pets.list({ q: q.trim() || undefined }) : null, [api, open, q]);
  return (
    <SidePanel open={open} onClose={onClose} label="Add a dog to today" title="Add a dog to today" subtitle="Pick one of your customers' dogs. New pets are added on the Pets page.">
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="Search pets" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dog or owner" autoComplete="off" />
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-card" aria-label="Pets">
          {(list.data?.items ?? []).filter((p) => p.species === "dog").map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="text-body text-fg">{p.name} <span className="text-meta text-fg-muted">· {p.ownerName ?? "No name"}</span></span>
              <Button
                size="sm"
                variant="secondary"
                disabled={act.busy}
                onClick={async () => {
                  const r = await act.run(() => api.daycare.expect(p.id));
                  if (r) {
                    toast({ message: `${p.name} is expected today`, tone: "success" });
                    onAdded();
                    onClose();
                  }
                }}
              >
                Expect today
              </Button>
            </li>
          ))}
          {list.data && !list.data.items.some((p) => p.species === "dog") ? <li className="px-3.5 py-2.5 text-meta text-fg-muted">No dogs found.</li> : null}
        </ul>
      </div>
    </SidePanel>
  );
}

function SellPack({ open, onClose, settings, onSold }: { open: boolean; onClose: () => void; settings: petApi.PetSettingsDto | null; onSold: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [owner, setOwner] = useState<PickedMember | null>(null);
  const [choice, setChoice] = useState("0");
  const packs = settings?.packs ?? [];
  const sel = packs[Number(choice)] ?? packs[0];
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Sell a daycare pack"
      title="Sell a daycare pack"
      subtitle="Take the payment the way you do today: tap, cash or e-transfer. This records the days."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            disabled={!owner || !sel}
            onClick={async () => {
              const r = await act.run(() => api.daycare.sellPack({ memberId: owner!.memberId, days: sel!.days, priceCents: sel!.priceCents, validDays: sel!.validDays }));
              if (r) {
                toast({ message: `${r.daysTotal} days for ${r.ownerName ?? "the owner"}`, tone: "success" });
                setOwner(null);
                onSold();
                onClose();
              }
            }}
          >
            Record the pack
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <MemberPicker label="Owner" value={owner} onPick={setOwner} />
        <Select label="Pack" value={choice} onChange={(e) => setChoice(e.target.value)} options={packs.map((p, i) => ({ value: String(i), label: `${p.days} days · ${money(p.priceCents)} · good for ${p.validDays} days` }))} />
      </div>
    </SidePanel>
  );
}

const VAX = [{ k: "rabies", l: "Rabies (the law)" }, { k: "dhpp", l: "DHPP" }, { k: "bordetella", l: "Bordetella" }];

function SettingsSheet({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: petApi.PetSettingsDto; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [per, setPer] = useState(String(initial.dogsPerStaff));
  const [staff, setStaff] = useState(String(initial.staffOn));
  const [closes, setCloses] = useState(initial.closesAt);
  const [req, setReq] = useState<string[]>(initial.requiredVaccines);
  const [assess, setAssess] = useState(initial.requireAssessment);
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Room settings"
      title="Room settings"
      subtitle="Your own numbers. 15 dogs to one staff member is a common benchmark, not a rule."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              const r = await act.run(() => api.pets.saveSettings({ capacity: Number(capacity), dogsPerStaff: Number(per), staffOn: Number(staff), closesAt: closes, requiredVaccines: req, requireAssessment: assess }));
              if (r) {
                toast({ message: "Saved", tone: "success" });
                onSaved();
                onClose();
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="Dogs the room holds" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        <TextField label="Most dogs per staff member" type="number" min={1} value={per} onChange={(e) => setPer(e.target.value)} />
        <TextField label="Staff on today" type="number" min={0} value={staff} onChange={(e) => setStaff(e.target.value)} />
        <TextField label="Closing time" type="time" value={closes} onChange={(e) => setCloses(e.target.value)} hint="A pickup more than 15 minutes later is shown as late. Nothing is charged." />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-meta-strong text-fg">Shots required to check in</legend>
          {VAX.map((v) => (
            <label key={v.k} className="flex items-center gap-2 text-body text-fg">
              <input type="checkbox" className="size-4" checked={req.includes(v.k)} onChange={(e) => setReq((r) => (e.target.checked ? [...r, v.k] : r.filter((x) => x !== v.k)))} />
              {v.l}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-body text-fg">
          <input type="checkbox" className="size-4" checked={assess} onChange={(e) => setAssess(e.target.checked)} />
          A passed temperament check is required
        </label>
      </div>
    </SidePanel>
  );
}
