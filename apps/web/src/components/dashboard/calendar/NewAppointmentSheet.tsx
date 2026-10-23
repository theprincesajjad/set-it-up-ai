"use client";
import { useEffect, useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { clock, instantAt } from "@/lib/dashboard/calendar";
import { useAction } from "@/lib/dashboard/useApi";
import { ServicePicker } from "./ServicePicker";

type Staff = appointmentsApi.BookableStaffDto;
type Service = appointmentsApi.ServiceDto;

const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "New appointment": click an empty cell and this opens with the stylist and time filled in. */
export function NewAppointmentSheet({
  open,
  onClose,
  staff,
  services,
  defaults,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  staff: Staff[];
  services: Service[];
  defaults: { date: string; minutes: number; staffId: string | null };
  onCreated: (a: appointmentsApi.AppointmentDto) => void;
}) {
  const { api, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [staffId, setStaffId] = useState<string>("");
  const [ids, setIds] = useState<string[]>([]);
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(minutesToTime(defaults.minutes));
  const [notes, setNotes] = useState("");
  const [force, setForce] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    // Reset when the sheet opens on a new cell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDate(defaults.date);
    setTime(minutesToTime(defaults.minutes));
    setStaffId(defaults.staffId ?? "");
    setForce(false);
    setTried(false);
    act.setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaults.date, defaults.minutes, defaults.staffId]);

  const reset = () => {
    setPhone(null);
    setName("");
    setIds([]);
    setNotes("");
  };
  const errs = { client: !phone && !name.trim() ? "Add the client's name or phone." : undefined, services: !ids.length ? "Pick at least one service." : undefined };
  const manager = role !== "staff";

  async function submit() {
    setTried(true);
    if (errs.client || errs.services) return;
    const [hh, mm] = time.split(":").map(Number) as [number, number];
    const r = await act.run(() =>
      api.appointments.create({
        staffId: staffId || null,
        serviceIds: ids,
        startsAt: instantAt(date, hh * 60 + mm).toISOString(),
        customer: { phone: phone ?? undefined, name: name.trim() || undefined },
        notes: notes.trim() || null,
        force,
      }),
    );
    if (r) {
      toast({ message: `Booked ${r.customer.name} at ${clock(hh * 60 + mm)}`, tone: "success" });
      reset();
      onCreated(r);
      onClose();
    }
  }
  const outside = act.error && /isn't working|time off|midnight|booked outside/i.test(act.error);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="New appointment"
      title="New appointment"
      subtitle="Book a client with a stylist."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={act.busy} onClick={submit}>Book appointment</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PhoneField label="Client phone" hint="Finds or adds the client. They get reminders and earn points." onChangeE164={setPhone} forceValidate={tried && !!phone} />
        <TextField label="Client name" value={name} onChange={(e) => setName(e.target.value)} error={tried ? errs.client : undefined} />
        <Select label="Stylist" value={staffId} onChange={(e) => setStaffId(e.target.value)} options={[{ value: "", label: "Anyone (place it later)" }, ...staff.map((s) => ({ value: s.userId, label: s.name }))]} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="Time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <ServicePicker services={services} value={ids} onChange={setIds} />
          {tried && errs.services ? <p className="mt-1 text-meta text-negative">{errs.services}</p> : null}
        </div>
        <TextField label="Note for the shop" optionalLabel value={notes} onChange={(e) => setNotes(e.target.value)} />
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {outside && manager ? (
          <label className="flex items-center gap-2 text-meta text-fg">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4" />
            Book anyway, outside working hours
          </label>
        ) : null}
      </div>
    </SidePanel>
  );
}
