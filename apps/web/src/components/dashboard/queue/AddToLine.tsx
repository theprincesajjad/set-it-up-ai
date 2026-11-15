"use client";
import { useState } from "react";
import type { barberApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { focusFirstInvalid } from "@/lib/api/useErrorText";
import { useAction } from "@/lib/dashboard/useApi";

/** Add someone to the line from the front desk: first name, a phone for the text (optional), service and barber. */
export function AddToLine({ open, onClose, board, onAdded }: { open: boolean; onClose: () => void; board: barberApi.QueueBoardResponse | null; onAdded: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [consent, setConsent] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);
  const [tried, setTried] = useState(false);
  // A 400 from the API names the field ("name"): show its sentence under it and move focus there.
  // The first service on the list is the one picked until the owner changes it (no separate "default" that repeats it).
  const services = board?.services ?? [];
  const chosenService = serviceId || services[0]?.id || "";
  const nameErr = tried && !name.trim() ? "Add a first name" : act.fields.name;
  async function submit() {
    setTried(true);
    if (!name.trim()) return focusFirstInvalid();
    const r = await act.run(() => api.barber.add({ name: name.trim(), phone: phone ?? undefined, serviceId: chosenService || null, requestedStaffId: staffId || null, textConsent: consent && !!phone }));
    if (!r) focusFirstInvalid();
    if (r) {
      toast({ message: `${r.entry.name} is in line`, tone: "success" });
      setName("");
      setPhone(null);
      setFieldKey((k) => k + 1);
      setServiceId("");
      setStaffId("");
      setConsent(false);
      setTried(false);
      onAdded();
      onClose();
    }
  }
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Add to the line"
      title="Add to the line"
      subtitle="For someone at the door who would rather not use the tablet."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={act.busy} onClick={() => void submit()}>Add to the line</Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="First name" value={name} onChange={(e) => setName(e.target.value)} error={nameErr} autoComplete="off" />
        <PhoneField key={fieldKey} label="Mobile number (for the text)" onChangeE164={setPhone} />
        <Select label="Service" value={chosenService} onChange={(e) => setServiceId(e.target.value)} options={services.length ? services.map((s) => ({ value: s.id, label: `${s.name} · ${s.durationMin} min` })) : [{ value: "", label: "Cut" }]} />
        <Select label="Barber" value={staffId} onChange={(e) => setStaffId(e.target.value)} options={[{ value: "", label: "Anyone" }, ...(board?.chairs ?? []).filter((c) => c.takesWalkIns).map((c) => ({ value: c.staffId, label: c.name }))]} />
        <label className="flex items-start gap-2 text-meta text-fg">
          <input type="checkbox" className="mt-0.5 size-4" checked={consent} disabled={!phone} onChange={(e) => setConsent(e.target.checked)} />
          <span>They asked for a text when they are next. One text, no ads.</span>
        </label>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </SidePanel>
  );
}
