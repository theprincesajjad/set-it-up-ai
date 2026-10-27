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
  const nameErr = tried && !name.trim() ? "Add a first name" : undefined;
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
          <Button
            loading={act.busy}
            onClick={async () => {
              setTried(true);
              if (!name.trim()) return;
              const r = await act.run(() => api.barber.add({ name: name.trim(), phone: phone ?? undefined, serviceId: serviceId || null, requestedStaffId: staffId || null, textConsent: consent && !!phone }));
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
            }}
          >
            Add to the line
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="First name" value={name} onChange={(e) => setName(e.target.value)} error={nameErr} autoComplete="off" />
        <PhoneField key={fieldKey} label="Mobile number (for the text)" onChangeE164={setPhone} />
        <Select label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} options={[{ value: "", label: "Cut (default)" }, ...(board?.services ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${s.durationMin} min` }))]} />
        <Select label="Barber" value={staffId} onChange={(e) => setStaffId(e.target.value)} options={[{ value: "", label: "Anyone" }, ...(board?.chairs ?? []).filter((c) => c.takesWalkIns).map((c) => ({ value: c.staffId, label: c.name }))]} />
        <label className="flex items-start gap-2 text-meta text-fg">
          <input type="checkbox" className="mt-0.5 size-4" checked={consent} disabled={!phone} onChange={(e) => setConsent(e.target.checked)} />
          <span>They asked for a text when they are next. One text, no ads.</span>
        </label>
      </div>
    </SidePanel>
  );
}
