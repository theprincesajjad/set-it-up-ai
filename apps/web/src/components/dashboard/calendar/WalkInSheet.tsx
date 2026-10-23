"use client";
import { useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";
import { ServicePicker } from "./ServicePicker";

/** Walk-in: starts now, the client has arrived. Name and phone are optional (a phone is needed to pay and earn points). */
export function WalkInSheet({
  open,
  onClose,
  staff,
  services,
  defaultStaffId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  staff: appointmentsApi.BookableStaffDto[];
  services: appointmentsApi.ServiceDto[];
  defaultStaffId: string | null;
  onCreated: (a: appointmentsApi.AppointmentDto) => void;
}) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const chosen = staffId ?? defaultStaffId ?? staff[0]?.userId ?? "";
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Walk-in"
      title="Walk-in"
      subtitle="Starts now and the client is already here."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              setTried(true);
              if (!ids.length) return;
              const r = await act.run(() => api.appointments.create({ source: "walk_in", staffId: chosen || null, serviceIds: ids, customer: phone || name.trim() ? { phone: phone ?? undefined, name: name.trim() || undefined } : undefined }));
              if (r) {
                toast({ message: `${r.customer.name} is in the chair queue`, tone: "success" });
                setName("");
                setPhone(null);
                setIds([]);
                setTried(false);
                onCreated(r);
                onClose();
              }
            }}
          >
            Start now
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Name" optionalLabel value={name} onChange={(e) => setName(e.target.value)} />
        <PhoneField label="Phone" hint="Needed to text a pay link and give points." onChangeE164={setPhone} />
        <Select label="Stylist" value={chosen} onChange={(e) => setStaffId(e.target.value)} options={staff.map((s) => ({ value: s.userId, label: s.name }))} />
        <div>
          <ServicePicker services={services} value={ids} onChange={setIds} />
          {tried && !ids.length ? <p className="mt-1 text-meta text-negative">Pick at least one service.</p> : null}
        </div>
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      </div>
    </SidePanel>
  );
}
