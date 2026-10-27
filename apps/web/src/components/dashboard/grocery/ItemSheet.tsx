"use client";
/**
 * One item on the butcher's price list (docs/research/grocers.md, frame D5): sold by the kg or lb with a portion weight, or whole
 * animals and shares for qurbani with a deposit and notice. The estimate customers see is worked out from the price per kg or lb.
 */
import { useState } from "react";
import { portionPriceCents, type commerceApi } from "@ll/shared";
import { SidePanel as Sheet } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { MoneyField, NumberField, centsToField, fieldToCents } from "@/components/dashboard/restaurant/common";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { useAction } from "@/lib/dashboard/useApi";

type Sold = "each" | "kg" | "lb";

export function ItemSheet({ item, onClose, onSaved }: { item: commerceApi.CatalogItemDto | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState(item?.name ?? "");
  const [sold, setSold] = useState<Sold>(item?.weightUnit ?? (item ? "each" : "kg"));
  const [price, setPrice] = useState(centsToField(item?.weightUnit ? item.unitPriceCents : item?.priceCents));
  const [portion, setPortion] = useState(item?.nominalWeightG ? String(item.nominalWeightG) : "1000");
  const [taxable, setTaxable] = useState(item?.taxable ?? false);
  const [pre, setPre] = useState(item?.preorderOnly ?? false);
  const [deposit, setDeposit] = useState(item?.depositBps ? String(item.depositBps / 100) : "");
  const [notice, setNotice] = useState(item?.leadTimeHours ? String(item.leadTimeHours) : "");
  const cents = fieldToCents(price);
  const grams = Number.parseInt(portion, 10) || 0;
  const estimate = sold !== "each" && cents > 0 && grams > 0 ? portionPriceCents(cents, sold, grams) : null;
  const bad = !name.trim() || cents <= 0 || (sold !== "each" && grams <= 0);

  async function save() {
    const body: commerceApi.CreateCatalogItemBody = {
      name: name.trim(),
      priceCents: sold === "each" ? cents : (estimate ?? cents),
      weightUnit: sold === "each" ? null : sold,
      unitPriceCents: sold === "each" ? null : cents,
      nominalWeightG: sold === "each" ? null : grams,
      taxable,
      preorderOnly: pre,
      depositBps: deposit ? Math.round(Number.parseFloat(deposit) * 100) : 0,
      leadTimeHours: notice ? Number.parseInt(notice, 10) : 0,
    };
    const r = await act.run(() => (item ? api.updateItem(item.id, body) : api.createItem(body)));
    if (r) {
      toast({ message: item ? "Item saved" : "Item added", tone: "success" });
      onSaved();
      onClose();
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? "Edit item" : "Add an item"}
      subtitle="What customers can pre-order."
      label="Price list item"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={bad} loading={act.busy} onClick={() => void save()}>{item ? "Save item" : "Add item"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Goat curry cut" />
        <Select
          label="Sold"
          value={sold}
          onChange={(e) => {
            const v = e.target.value as Sold;
            setSold(v);
            if (v !== "each" && !item) setTaxable(false);
          }}
          options={[
            { value: "kg", label: "By the kg" },
            { value: "lb", label: "By the lb" },
            { value: "each", label: "Each (a tray, a pack, a bag)" },
          ]}
        />
        <MoneyField label={sold === "each" ? "Price" : `Price per ${sold}`} value={price} onChange={setPrice} />
        {sold !== "each" ? (
          <>
            <NumberField label="One portion weighs" suffix="g" value={portion} onChange={setPortion} hint="Whole goat about 20000. A kg of curry cut is 1000. Customers order portions." />
            {estimate != null ? <p className="-mt-2 text-meta text-fg-muted">Customers see about {formatMoney(estimate)} per portion. The scale sets the final price.</p> : null}
          </>
        ) : null}
        <Switch checked={taxable} onChange={setTaxable} label="Charge HST" description="Off for raw meat, flour and rice (zero-rated). On for prepared food, snacks and drinks." />
        <Switch checked={pre} onChange={setPre} label="Pre-order only" description="Whole animals and qurbani shares: counted against the animals per day." />
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Deposit" suffix="%" value={deposit} onChange={setDeposit} hint="Paid by card when they book." />
          <NumberField label="Notice" suffix="hours" value={notice} onChange={setNotice} hint="How far ahead they must book." />
        </div>
      </div>
    </Sheet>
  );
}
