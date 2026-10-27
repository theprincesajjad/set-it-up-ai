"use client";
/**
 * Add or edit one deal on the weekly flyer (docs/research/grocers.md, frame D4): the price, per kg / lb or for the pack,
 * the old price, members only, a limit, the season it belongs to and the dates. The price per 100 g is worked out for the shop.
 */
import { useState } from "react";
import { GROCER_SEASONS, per100gCents, per100gLabel, type groceryApi } from "@ll/shared";
import { SidePanel as Sheet } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { MoneyField, NumberField, centsToField, fieldToCents } from "@/components/dashboard/restaurant/common";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";

export interface DealDraft {
  title?: string;
  seasonId?: string | null;
  startsOn?: string;
  endsOn?: string;
}

export function DealSheet({ deal, draft, today, onClose, onSaved }: { deal: groceryApi.DealDto | null; draft?: DealDraft | null; today: string; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [title, setTitle] = useState(deal?.title ?? draft?.title ?? "");
  const [price, setPrice] = useState(centsToField(deal?.priceCents));
  const [unit, setUnit] = useState<groceryApi.PriceUnit>(deal?.priceUnit ?? "each");
  const [pack, setPack] = useState(deal?.packSizeG ? String(deal.packSizeG) : "");
  const [was, setWas] = useState(centsToField(deal?.wasPriceCents));
  const [members, setMembers] = useState(deal?.memberOnly ?? false);
  const [limit, setLimit] = useState(deal?.limitPerCustomer ? String(deal.limitPerCustomer) : "");
  const [season, setSeason] = useState(deal?.seasonId ?? draft?.seasonId ?? "");
  const [startsOn, setStartsOn] = useState(deal?.startsOn ?? draft?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(deal?.endsOn ?? draft?.endsOn ?? today);
  const [note, setNote] = useState(deal?.note ?? "");

  const priceCents = fieldToCents(price);
  const packG = pack ? Number.parseInt(pack, 10) : null;
  const per100 = priceCents > 0 ? per100gCents(priceCents, unit, packG) : null;
  const wasCents = was ? fieldToCents(was) : null;
  const bad = !title.trim() || priceCents <= 0 || !startsOn || !endsOn || endsOn < startsOn || (wasCents != null && wasCents <= priceCents);

  async function save() {
    const body: groceryApi.DealBody = {
      title: title.trim(),
      priceCents,
      priceUnit: unit,
      packSizeG: unit === "each" ? packG : null,
      wasPriceCents: wasCents,
      memberOnly: members,
      limitPerCustomer: limit ? Number.parseInt(limit, 10) : null,
      seasonId: season || null,
      startsOn,
      endsOn,
      note: note.trim() || null,
    };
    const r = await act.run(() => (deal ? api.grocery.updateDeal(deal.id, body) : api.grocery.createDeal(body)));
    if (r) {
      toast({ message: deal ? "Deal saved" : "Deal added to the flyer", tone: "success" });
      onSaved();
      onClose();
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={deal ? "Edit deal" : "Add a deal"}
      subtitle="It shows on your shop page the day it starts."
      label="Deal"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={bad} loading={act.busy} onClick={() => void save()}>{deal ? "Save deal" : "Add deal"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="What is on offer" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Desi ghee 1.6 kg" />
        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyField label="Price" value={price} onChange={setPrice} />
          <Select
            label="Priced"
            value={unit}
            onChange={(e) => setUnit(e.target.value as groceryApi.PriceUnit)}
            options={[
              { value: "each", label: "For the pack" },
              { value: "kg", label: "Per kg" },
              { value: "lb", label: "Per lb" },
            ]}
          />
        </div>
        {unit === "each" ? <NumberField label="Pack size" suffix="g" value={pack} onChange={setPack} hint="Optional. A 1.6 kg tin is 1600. Lets the flyer show a price per 100 g." /> : null}
        <p className="-mt-2 text-meta text-fg-muted">{per100 != null ? `Shows ${per100gLabel(per100)}` : unit === "each" ? "Add the pack size to show a price per 100 g." : null}</p>
        <MoneyField label="Old price" optionalLabel value={was} onChange={setWas} error={wasCents != null && wasCents <= priceCents ? "The old price should be higher than the deal price." : null} />
        <Switch checked={members} onChange={setMembers} label="Members only" description="They need the loyalty pass to get this price." />
        <NumberField label="Limit per customer" value={limit} onChange={setLimit} hint="Leave empty for no limit." />
        <Select
          label="Season"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          options={[{ value: "", label: "None" }, ...GROCER_SEASONS.map((s) => ({ value: s.id, label: s.name }))]}
          hint="Tags the deal and the text. Dates for lunar festivals follow moon sighting."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          <TextField label="Ends" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} error={endsOn < startsOn ? "Ends before it starts." : null} />
        </div>
        <TextField label="Note" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} maxLength={160} placeholder="While stock lasts" />
      </div>
    </Sheet>
  );
}
