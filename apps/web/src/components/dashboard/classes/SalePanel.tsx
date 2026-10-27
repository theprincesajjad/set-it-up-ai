"use client";
import { useState } from "react";
import type { classesApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/dashboard/calendar";
import { useAction } from "@/lib/dashboard/useApi";

/** Sell a pack or an intro offer at the desk, paid by hand (cash, e-transfer or the card reader). Carries no platform fee. */
export function SalePanel({ open, onClose, packs, onSaved }: { open: boolean; onClose: () => void; packs: classesApi.ProductDto[]; onSaved: () => void | Promise<void> }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [productId, setProductId] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [method, setMethod] = useState("cash");
  const pid = productId || packs[0]?.id || "";
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Record a desk sale"
      subtitle="For someone paying at the desk. The pack lands on their member card straight away."
      label="Desk sale"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            disabled={!pid || phone.replace(/\D/g, "").length < 10}
            onClick={async () => {
              const r = await act.run(() => api.classes.recordSale({ productId: pid, phone, customerName: name.trim() || undefined, method }));
              if (r) {
                toast({ message: `${r.name} added to ${name.trim() || "their card"}`, tone: "success" });
                setPhone("");
                setName("");
                await onSaved();
                onClose();
              }
            }}
          >
            Record sale
          </Button>
        </div>
      }
    >
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div className="flex flex-col gap-4">
        <Select label="What they bought" value={pid} onChange={(e) => setProductId(e.target.value)} options={packs.map((p) => ({ value: p.id, label: `${p.name}, ${money(p.priceCents)}` }))} />
        <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="416 555 0100" />
        <TextField label="Name, if new" optionalLabel value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Paid by" value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: "cash", label: "Cash" }, { value: "etransfer", label: "Interac e-transfer" }, { value: "card_reader", label: "Your own card reader" }]} />
      </div>
    </SidePanel>
  );
}
