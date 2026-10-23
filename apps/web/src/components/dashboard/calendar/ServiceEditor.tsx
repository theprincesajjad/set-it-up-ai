"use client";
import { useEffect, useState } from "react";
import type { appointmentsApi, merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";

type Service = appointmentsApi.ServiceDto;

const dollars = (cents: number) => (cents ? String(cents / 100) : "");
const toCents = (v: string) => Math.round(Number(v || 0) * 100);

/** Right-hand panel to add or edit a service (or a repair shop's price-list line). */
export function ServiceEditor({
  open,
  onClose,
  service,
  kind,
  staff,
  categories,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  service: Service | null;
  kind: appointmentsApi.ServiceKind;
  staff: appointmentsApi.BookableStaffDto[];
  categories: merchantApi.Category[];
  onSaved: () => void | Promise<void>;
}) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const repair = kind === "repair_line";
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [price, setPrice] = useState("");
  const [from, setFrom] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [buffer, setBuffer] = useState("0");
  const [category, setCategory] = useState("");
  const [rebook, setRebook] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [active, setActive] = useState(true);
  const [who, setWho] = useState<string[]>([]);
  const [tr, setTr] = useState({ hi: "", ur: "", pa: "" });
  const [tried, setTried] = useState(false);
  const [del, setDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Load the chosen service (or blanks) into the form each time the panel opens.
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(service?.name ?? "");
    setDesc(service?.description ?? "");
    setMinutes(String(service?.durationMin ?? (repair ? 0 : 30)));
    setPrice(dollars(service?.priceCents ?? 0));
    setFrom(service?.priceFrom ?? false);
    setDeposit(dollars(service?.depositCents ?? 0));
    setBuffer(String(service?.bufferMin ?? 0));
    setCategory(service?.categoryId ?? "");
    setRebook(service?.rebookAfterDays ? String(service.rebookAfterDays) : "");
    setTaxable(service?.taxable ?? true);
    setActive(service?.active ?? true);
    setWho(service?.staffIds ?? []);
    setTr({ hi: service?.translations.hi?.name ?? "", ur: service?.translations.ur?.name ?? "", pa: service?.translations.pa?.name ?? "" });
    setTried(false);
    act.setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id]);

  const errs = {
    name: !name.trim() ? "Give it a name." : undefined,
    minutes: !repair && (Number(minutes) < 5 || Number(minutes) > 720) ? "Use 5 to 720 minutes." : undefined,
    price: price === "" || Number.isNaN(Number(price)) ? "Add a price (0 for free)." : undefined,
    deposit: toCents(deposit) > toCents(price) && toCents(price) > 0 ? "The deposit can't be more than the price." : undefined,
  };

  async function save() {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const translations: Record<string, { name: string }> = {};
    for (const [k, v] of Object.entries(tr)) if (v.trim()) translations[k] = { name: v.trim() };
    const body = {
      name: name.trim(),
      description: desc.trim() || null,
      durationMin: Number(minutes || 0),
      priceCents: toCents(price),
      priceFrom: from,
      depositCents: repair ? 0 : toCents(deposit),
      bufferMin: Number(buffer || 0),
      categoryId: category || null,
      rebookAfterDays: rebook ? Number(rebook) : null,
      taxable,
      active,
      translations,
      ...(repair ? {} : { staffIds: who }),
    };
    const r = await act.run(() => (service ? api.appointments.updateService(service.id, body) : api.appointments.createService({ ...body, kind })));
    if (r) {
      toast({ message: service ? "Saved" : `${name.trim()} added`, tone: "success" });
      await onSaved();
      onClose();
    }
  }

  const label = repair ? "line" : "service";
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label={service ? `Edit ${service.name}` : `New ${label}`}
      title={service ? service.name : repair ? "New price-list line" : "New service"}
      subtitle={repair ? "A canned line for quotes." : "What clients can book, and for how long."}
      footer={
        <>
          {service ? <Button variant="ghost" onClick={() => setDel(true)} className="me-auto">Delete</Button> : null}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={act.busy} onClick={save}>{service ? "Save" : `Add ${label}`}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={tried ? errs.name : undefined} />
        <TextField label="Description" optionalLabel value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          {!repair ? <TextField label="Length" inputMode="numeric" suffix="min" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} error={tried ? errs.minutes : undefined} /> : null}
          <TextField label="Price" inputMode="decimal" prefix="$" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} error={tried ? errs.price : undefined} />
        </div>
        <Switch label="Show as “from” price" checked={from} onChange={setFrom} />
        {!repair ? (
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Deposit" optionalLabel inputMode="decimal" prefix="$" hint="Taken online, credited at checkout." value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^\d.]/g, ""))} error={tried ? errs.deposit : undefined} />
            <TextField label="Clean-up time after" inputMode="numeric" suffix="min" value={buffer} onChange={(e) => setBuffer(e.target.value.replace(/\D/g, ""))} />
          </div>
        ) : null}
        <Select label="Group" value={category} onChange={(e) => setCategory(e.target.value)} hint="Hair, Threading, Nails. A group set to earn no points keeps that rule." options={[{ value: "", label: "No group" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
        <TextField label="Rebook after" optionalLabel inputMode="numeric" suffix="days" hint="The usual gap between visits. Used for rebooking nudges." value={rebook} onChange={(e) => setRebook(e.target.value.replace(/\D/g, ""))} />
        <Switch label="Charge tax" checked={taxable} onChange={setTaxable} />
        <Switch label={active ? "Bookable" : "Hidden from booking"} checked={active} onChange={setActive} />
        {!repair && staff.length ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-meta-strong text-fg">Who does it</legend>
            <p className="text-caption text-fg-muted">Leave all unticked and anyone can.</p>
            {staff.map((s) => (
              <label key={s.userId} className="flex min-h-8 items-center gap-2 text-body text-fg">
                <input type="checkbox" className="size-4" checked={who.includes(s.userId)} onChange={(e) => setWho((cur) => (e.target.checked ? [...cur, s.userId] : cur.filter((x) => x !== s.userId)))} />
                {s.name}
              </label>
            ))}
          </fieldset>
        ) : null}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-meta-strong text-fg">Name in other languages</legend>
          <TextField label="Hindi" optionalLabel value={tr.hi} onChange={(e) => setTr({ ...tr, hi: e.target.value })} />
          <TextField label="Urdu" optionalLabel dir="rtl" value={tr.ur} onChange={(e) => setTr({ ...tr, ur: e.target.value })} />
          <TextField label="Punjabi" optionalLabel value={tr.pa} onChange={(e) => setTr({ ...tr, pa: e.target.value })} />
        </fieldset>
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      </div>
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title={`Delete ${service?.name ?? label}?`}
        body="Past visits keep their lines. It disappears from booking."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (!service) return;
          await api.appointments.deleteService(service.id);
          toast({ message: "Deleted", tone: "success" });
          await onSaved();
          onClose();
        }}
      />
    </SidePanel>
  );
}
