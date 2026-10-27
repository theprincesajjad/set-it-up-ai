"use client";
import { useEffect, useState } from "react";
import type { barberApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";

const MODELS = [
  { value: "employee", label: "Employee: the shop pays them outside the app" },
  { value: "commission", label: "Commission: the shop keeps a share of each service" },
  { value: "chair_rent", label: "Chair rental: they pay a weekly rent and keep the rest" },
];

/** How one team member is paid (docs/research/barbers-beauty.md 4.3): drives Payouts, and who sees whose clients. Nothing here moves money. */
export function PaySheet({ open, onClose, member }: { open: boolean; onClose: () => void; member: { userId: string; name: string | null } | null }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [model, setModel] = useState<barberApi.PayModel>("employee");
  const [share, setShare] = useState("40");
  const [rent, setRent] = useState("180");
  const [own, setOwn] = useState(false);
  const [walkIns, setWalkIns] = useState(true);
  useEffect(() => {
    if (!open || !member) return;
    void api.barber.staffPay().then((r) => {
      const p = r.items.find((i) => i.userId === member.userId);
      if (!p) return;
      setModel(p.model);
      setShare(String(p.shopShareBps / 100 || 40));
      setRent(String(p.rentCentsWeek / 100 || 180));
      setOwn(p.ownClientsOnly);
      setWalkIns(p.takesWalkIns);
    });
  }, [open, member, api]);
  if (!member) return null;
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="How this person is paid"
      title={`How ${member.name ?? "this person"} is paid`}
      subtitle="For the Payouts report. Nothing here moves money."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              const r = await act.run(() => api.barber.savePay(member.userId, { model, shopShareBps: Math.round(Number(share) * 100) || 0, rentCentsWeek: Math.round(Number(rent) * 100) || 0, ownClientsOnly: own, takesWalkIns: walkIns }));
              if (r) {
                toast({ message: "Saved", tone: "success" });
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
        <Select label="Paid as" value={model} onChange={(e) => { const m = e.target.value as barberApi.PayModel; setModel(m); if (m === "chair_rent") setOwn(true); }} options={MODELS} />
        {model === "commission" ? <TextField label="The shop keeps (%)" inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} hint="40 means the shop keeps 40% of each service." /> : null}
        {model === "chair_rent" ? <TextField label="Rent per week ($)" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} hint="Shown on Payouts. You collect it yourself." /> : null}
        <label className="flex items-start gap-2 text-meta text-fg">
          <input type="checkbox" className="mt-0.5 size-4" checked={own} onChange={(e) => setOwn(e.target.checked)} />
          <span>Own clients only. They see only their own appointments, queue calls and payout row, and not the customer list. Right for a chair renter.</span>
        </label>
        <label className="flex items-start gap-2 text-meta text-fg">
          <input type="checkbox" className="mt-0.5 size-4" checked={walkIns} onChange={(e) => setWalkIns(e.target.checked)} />
          <span>Takes walk-ins from the line. Turn off for the front desk or someone who is booked only.</span>
        </label>
      </div>
    </SidePanel>
  );
}
