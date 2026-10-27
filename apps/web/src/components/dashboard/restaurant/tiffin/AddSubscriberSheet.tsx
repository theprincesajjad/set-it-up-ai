"use client";
import { useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { SidePanel as Sheet } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { addDaysISO, FormGrid, todayISO } from "../common";

/** The kitchen adds a regular who phones in: name, number, plan, address, how they pay. They are texted how to pay and the kitchen records it. */
export function AddSubscriberSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const plans = useApi(() => api.tiffin.plans(), [api]);
  const live = (plans.data?.items ?? []).filter((p) => p.active);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState("");
  const [servings, setServings] = useState("1");
  const [fulfilment, setFulfilment] = useState<tiffinApi.TiffinFulfilment>("delivery");
  const [address, setAddress] = useState("");
  const [postal, setPostal] = useState("");
  const [notes, setNotes] = useState("");
  const [diet, setDiet] = useState("");
  const [start, setStart] = useState(addDaysISO(todayISO(), 1));
  const [method, setMethod] = useState<"etransfer" | "cash">("etransfer");
  const [monthly, setMonthly] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const plan = live.find((p) => p.id === planId) ?? live[0] ?? null;
  const effectiveFulfilment = plan && !plan.deliveryAllowed ? "pickup" : plan && !plan.pickupAllowed ? "delivery" : fulfilment;

  const save = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Add their name";
    if (phone.replace(/\D/g, "").length < 10) e.phone = "Enter a 10-digit phone number";
    if (!plan) e.plan = "Pick a plan";
    if (effectiveFulfilment === "delivery" && address.trim().length < 3) e.address = "Add the delivery address";
    if (effectiveFulfilment === "delivery" && postal.trim().length < 3) e.postal = "Add the postal code";
    if (!start || start < todayISO()) e.start = "Pick today or a later day";
    setErrors(e);
    if (Object.keys(e).length || !plan) return;
    const r = await act.run(() =>
      api.tiffin.addSubscriber({
        name: name.trim(),
        phone: phone.trim(),
        planId: plan.id,
        servings: Math.max(1, Number(servings) || 1),
        fulfilment: effectiveFulfilment,
        ...(effectiveFulfilment === "delivery" ? { address: address.trim(), postalCode: postal.trim(), ...(notes.trim() ? { addressNotes: notes.trim() } : {}) } : {}),
        ...(diet.trim() ? { dietaryNotes: diet.trim() } : {}),
        startDate: start,
        paymentMethod: method,
        ...(plan.cadence === "weekly" ? { billingCadence: monthly ? ("monthly" as const) : ("weekly" as const) } : {}),
      }),
    );
    if (r) {
      toast({ message: `${name.trim()} is added. They were texted how to pay${r.charge.referenceCode ? ` (reference ${r.charge.referenceCode})` : ""}.`, tone: "success" });
      onAdded();
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      label="Add subscriber"
      title="Add a subscriber"
      subtitle="For regulars who phone in. They get the e-transfer details by text."
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={act.busy} disabled={!live.length} onClick={() => void save()}>Add subscriber</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {plans.data && !live.length ? <Banner tone="warning">Make a plan first. Then you can add people to it.</Banner> : null}
        <FormGrid>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="off" maxLength={80} />
          <TextField label="Phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} placeholder="416 555 0123" autoComplete="off" />
        </FormGrid>
        <Select label="Plan" value={plan?.id ?? ""} onChange={(e) => setPlanId(e.target.value)} error={errors.plan} options={live.map((p) => ({ value: p.id, label: `${p.name} · ${formatMoney(p.priceCents)}${p.cadence === "trial" ? " trial" : p.cadence === "monthly" ? "/mo" : "/wk"}` }))} />
        <FormGrid>
          <TextField label="Servings" type="number" min={1} max={plan?.maxServings ?? 20} value={servings} onChange={(e) => setServings(e.target.value)} />
          <TextField label={plan?.cadence === "trial" ? "Trial day" : "First meal day"} type="date" min={todayISO()} value={start} onChange={(e) => setStart(e.target.value)} error={errors.start} />
        </FormGrid>
        {plan?.deliveryAllowed && plan.pickupAllowed ? (
          <Select label="Delivery or pickup" value={fulfilment} onChange={(e) => setFulfilment(e.target.value as tiffinApi.TiffinFulfilment)} options={[{ value: "delivery", label: "Delivery" }, { value: "pickup", label: "Pickup" }]} />
        ) : null}
        {effectiveFulfilment === "delivery" ? (
          <>
            <TextField label="Delivery address" value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} maxLength={300} />
            <FormGrid>
              <TextField label="Postal code" value={postal} onChange={(e) => setPostal(e.target.value.toUpperCase())} error={errors.postal} maxLength={10} />
              <TextField label="Delivery notes" optionalLabel value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </FormGrid>
          </>
        ) : null}
        <TextField label="Dietary notes" optionalLabel value={diet} onChange={(e) => setDiet(e.target.value)} maxLength={500} />
        <FormGrid>
          <Select label="Pays by" value={method} onChange={(e) => setMethod(e.target.value as "etransfer" | "cash")} options={[{ value: "etransfer", label: "E-transfer" }, { value: "cash", label: "Cash" }]} />
          {plan?.cadence === "weekly" ? <Select label="Billed" value={monthly ? "monthly" : "weekly"} onChange={(e) => setMonthly(e.target.value === "monthly")} options={[{ value: "monthly", label: "Once a month" }, { value: "weekly", label: "Every week" }]} /> : null}
        </FormGrid>
      </div>
    </Sheet>
  );
}
