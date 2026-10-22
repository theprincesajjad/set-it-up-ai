"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { Dot, EmptyState, Row, RowList, Section, SidePanel as Sheet } from "@/components/dashboard/kit";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney, formatNumber } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { FormGrid, Loader, MoneyField, NumberField, bpsToPct, centsToField, fieldToCents } from "../common";

type Gate = { featureKey: "restaurant.banquet"; title: string; what: string };
type Pkg = { key: string; name: string; perHead: string; includes: string };
let seq = 0;

export function HallsTab({ gate, adding, onAddClose }: { gate: Gate; adding: boolean; onAddClose: () => void }) {
  const { api, role } = useMerchant();
  const state = useApi(() => api.banquet.halls(), [api]);
  const [edit, setEdit] = useState<restaurantApi.HallDto | "new" | null>(null);
  const canEdit = role === "owner" || role === "manager";
  const open = edit ?? (adding ? "new" : null);
  const close = () => { setEdit(null); onAddClose(); };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{canEdit ? <Button size="sm" variant="secondary" iconStart={Plus} onClick={() => setEdit("new")}>Add a hall</Button> : null}</div>
      <Loader state={state} gate={gate}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState title="No halls yet" description="Add the room you rent out, how many it seats and what it costs, then take holds and deposits for weddings, walimas and mehndis." action={canEdit ? <Button size="sm" onClick={() => setEdit("new")}>Add your first hall</Button> : undefined} />
          ) : (
            <RowList label="Banquet halls">
              {d.items.map((h) => (
                <Row
                  key={h.id}
                  title={h.name}
                  leading={<Dot tone={h.active ? "positive" : "neutral"}>{h.active ? "Open" : "Closed"}</Dot>}
                  meta={`Seats ${formatNumber(h.capacity)} · ${h.packages.length} ${h.packages.length === 1 ? "package" : "packages"} · ${bpsToPct(h.depositBps)} deposit`}
                  trailing={<span className="flex flex-col items-end"><span>{formatMoney(h.baseCents)}</span><span className="text-meta text-fg-muted">room fee</span></span>}
                  onClick={canEdit ? () => setEdit(h) : undefined}
                />
              ))}
            </RowList>
          )
        }
      </Loader>
      {open ? <HallSheet hall={open === "new" ? null : open} onClose={close} onSaved={() => { close(); void state.reload(); }} /> : null}
    </div>
  );
}

function HallSheet({ hall, onClose, onSaved }: { hall: restaurantApi.HallDto | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState(hall?.name ?? "");
  const [capacity, setCapacity] = useState(String(hall?.capacity ?? 200));
  const [description, setDescription] = useState(hall?.description ?? "");
  const [base, setBase] = useState(centsToField(hall?.baseCents ?? 0));
  const [deposit, setDeposit] = useState(String((hall?.depositBps ?? 2500) / 100));
  const [active, setActive] = useState(hall?.active ?? true);
  const [pkgs, setPkgs] = useState<Pkg[]>((hall?.packages ?? []).map((p) => ({ key: `p${++seq}`, name: p.name, perHead: centsToField(p.perHeadCents), includes: p.includes.join("\n") })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const setPkg = (key: string, patch: Partial<Pkg>) => setPkgs((l) => l.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const save = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give the hall a name";
    if (!(Number(capacity) >= 1)) e.capacity = "How many does it seat?";
    if (pkgs.some((p) => !p.name.trim())) e.pkgs = "Every package needs a name";
    setErrors(e);
    if (Object.keys(e).length) return;
    const body = {
      name: name.trim(), capacity: Number(capacity), description: description.trim() || null, baseCents: fieldToCents(base),
      depositBps: Math.min(10_000, Math.round((Number(deposit) || 0) * 100)), active,
      packages: pkgs.map((p) => ({ name: p.name.trim(), perHeadCents: fieldToCents(p.perHead), includes: p.includes.split("\n").map((x) => x.trim()).filter(Boolean) })),
    };
    const r = await act.run(() => (hall ? api.banquet.updateHall(hall.id, body) : api.banquet.createHall(body)));
    if (r) {
      toast({ message: hall ? "Hall saved" : "Hall added", tone: "success" });
      onSaved();
    }
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        label={hall ? "Edit hall" : "New hall"}
        title={hall ? hall.name : "New hall"}
        subtitle={hall ? `Seats ${formatNumber(hall.capacity)}` : "A room customers can hold for an event."}
        width={520}
        footer={
          <>
            {hall ? <Button variant="ghost" className="me-auto" onClick={() => setConfirm(true)}>Delete</Button> : null}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={act.busy} onClick={() => void save()}>{hall ? "Save hall" : "Add hall"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <TextField label="Hall name" placeholder="Shalimar Hall" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <FormGrid cols={3}>
            <NumberField label="Seats" value={capacity} onChange={setCapacity} error={errors.capacity} />
            <MoneyField label="Room fee" value={base} onChange={setBase} hint="Before packages" />
            <TextField label="Deposit" suffix="%" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9.]/g, ""))} hint="Of the total" />
          </FormGrid>
          <TextField type="textarea" label="About the room" optionalLabel placeholder="Stage, separate men's and women's seating, parking for 80 cars" className="min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Switch label="Open for holds" description="Turn off to stop new bookings without deleting the hall" checked={active} onChange={setActive} />
          <Section title="Packages" description="A per-guest price on top of the room fee. Walima dinner, mehndi night, nikah lunch.">
            {pkgs.length === 0 ? <p className="border-y border-line py-3 text-meta text-fg-muted">No packages. Customers pay the room fee only, and you quote the food separately.</p> : null}
            <ul className="divide-y divide-line border-y border-line">
              {pkgs.map((p) => (
                <li key={p.key} className="flex flex-col gap-3 py-3">
                  <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:grid-cols-[1fr_9rem_auto]">
                    <div className="col-span-2 sm:col-span-1"><TextField label="Package name" placeholder="Walima dinner" value={p.name} onChange={(e) => setPkg(p.key, { name: e.target.value })} /></div>
                    <MoneyField label="Per guest" value={p.perHead} onChange={(v) => setPkg(p.key, { perHead: v })} />
                    <IconButton icon={Trash2} label={`Remove ${p.name || "package"}`} size={40} className="mb-3" onClick={() => setPkgs((l) => l.filter((x) => x.key !== p.key))} />
                  </div>
                  <TextField type="textarea" label="What's included" optionalLabel placeholder={"Two mains: chicken biryani, beef nihari\nNaan and raita\nChai service"} hint="One item per line" className="min-h-20" value={p.includes} onChange={(e) => setPkg(p.key, { includes: e.target.value })} />
                </li>
              ))}
            </ul>
            {errors.pkgs ? <p className="mt-1 text-meta text-negative">{errors.pkgs}</p> : null}
            <div className="mt-2"><Button variant="ghost" size="sm" iconStart={Plus} onClick={() => setPkgs((l) => [...l, { key: `p${++seq}`, name: "", perHead: "", includes: "" }])}>Add a package</Button></div>
          </Section>
        </div>
      </Sheet>
      {hall ? (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          danger
          title={`Delete ${hall.name}?`}
          body="A hall with past or upcoming bookings can't be deleted. Turn off Open for holds instead."
          confirmLabel="Delete hall"
          onConfirm={async () => {
            await api.banquet.deleteHall(hall.id);
            toast({ message: "Hall deleted", tone: "success" });
            onSaved();
          }}
        />
      ) : null}
    </>
  );
}
