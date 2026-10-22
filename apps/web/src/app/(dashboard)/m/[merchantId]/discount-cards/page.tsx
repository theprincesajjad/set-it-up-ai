"use client";
import { EmptyState, PageHeader, SkeletonRows } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DiscountCard } from "@/components/ui/DiscountCard";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const ELIGIBILITY: { value: merchantApi.DiscountCard["eligibility"]; label: string }[] = [
  { value: "members_only", label: "Any member" },
  { value: "everyone", label: "Anyone" },
  { value: "seniors", label: "Seniors 65+ (ask for proof)" },
  { value: "students", label: "Students (ask for proof)" },
  { value: "vip", label: "VIP members" },
];

type Draft = { id?: string; name: string; percentOff: string; amountOff: string; eligibility: merchantApi.DiscountCard["eligibility"]; terms: string; excluded: string[] };

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function DiscountCardsPageGated() {
  return (
    <FeatureGate keys={["discount_cards"]} title="Digital discount cards">
      <DiscountCardsPage />
    </FeatureGate>
  );
}

function DiscountCardsPage() {
  const { api, detail } = useMerchant();
  const toast = useToast();
  const cards = useApi(() => api.discountCards(), [api]);
  const cats = useApi(() => api.categories(), [api]);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [del, setDel] = useState<merchantApi.DiscountCard | null>(null);
  const act = useAction();
  const pharmacy = detail.merchant.vertical === "pharmacy";
  const locked = (cats.data?.items ?? []).filter((c) => !c.discountEligible);
  const blank = (): Draft => ({ name: "", percentOff: "10", amountOff: "", eligibility: "seniors", terms: pharmacy ? "Front-store items only. Not valid on prescriptions or pharmacy services." : "", excluded: [] });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Discount cards" description="Show-to-save cards customers carry in their wallet." actions={<Button size="sm" iconStart={Plus} onClick={() => setEdit(blank())}>Create a discount card</Button>} />
      <Async state={cards} skeleton={<SkeletonRows rows={4} />}>
        {(d) =>
          d.items.length ? (
            <ul className="grid gap-x-8 gap-y-8 md:grid-cols-2">
              {d.items.map((c) => (
                <li key={c.id} className="flex flex-col gap-3">
                  <DiscountCard card={c} shop={detail.merchant} live={false} />
                  <div className="flex items-center gap-2 border-y border-line py-1">
                    <div className="min-w-0 flex-1">
                      <Switch label="Active" checked={c.active} onChange={async (v) => {
                        await act.run(() => api.updateDiscountCard(c.id, { active: v }));
                        await cards.reload();
                      }} />
                    </div>
                    <IconButton icon={Pencil} label={`Edit ${c.name}`} onClick={() => setEdit({ id: c.id, name: c.name, percentOff: c.percentOff ? String(c.percentOff) : "", amountOff: c.amountOffCents ? String(c.amountOffCents / 100) : "", eligibility: c.eligibility, terms: c.terms ?? "", excluded: c.excludedCategoryIds })} />
                    <IconButton icon={Trash2} label={`Delete ${c.name}`} onClick={() => setDel(c)} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Give your regulars a card to show" description="Seniors' day? Student discount? Customers carry it in the app." action={<Button variant="secondary" size="sm" onClick={() => setEdit(blank())}>Create a discount card</Button>} />
          )
        }
      </Async>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit discount card" : "Create a discount card"} size="md" actions={
        <>
          <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
          <Button loading={act.busy} onClick={async () => {
            if (!edit) return;
            const pct = Number.parseInt(edit.percentOff || "0", 10);
            const amt = Math.round(Number.parseFloat(edit.amountOff || "0") * 100);
            if (!edit.name.trim() || (!pct && !amt)) return act.setError("Add a name and a percent or dollar amount off.");
            const body = { name: edit.name.trim(), percentOff: pct, amountOffCents: amt, eligibility: edit.eligibility, terms: edit.terms.trim() || null, excludedCategoryIds: [...new Set([...edit.excluded, ...locked.map((c) => c.id)])] };
            const r = await act.run(() => (edit.id ? api.updateDiscountCard(edit.id, body) : api.createDiscountCard(body)));
            if (r) {
              setEdit(null);
              toast({ message: "Saved", tone: "success" });
              await cards.reload();
            }
          }}>Save card</Button>
        </>
      }>
        {edit ? (
          <div className="flex flex-col gap-4">
            <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Seniors 10% off" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Percent off" inputMode="numeric" suffix="%" value={edit.percentOff} onChange={(e) => setEdit({ ...edit, percentOff: e.target.value.replace(/\D/g, ""), amountOff: "" })} />
              <TextField label="Or dollars off" inputMode="decimal" prefix="$" value={edit.amountOff} onChange={(e) => setEdit({ ...edit, amountOff: e.target.value, percentOff: "" })} />
            </div>
            <Select label="Who can use it" value={edit.eligibility} onChange={(e) => setEdit({ ...edit, eligibility: e.target.value as Draft["eligibility"] })} options={ELIGIBILITY} />
            <TextField type="textarea" label="Terms" optionalLabel value={edit.terms} onChange={(e) => setEdit({ ...edit, terms: e.target.value })} />
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-label text-fg">Not valid on</legend>
              {(cats.data?.items ?? []).map((c) =>
                !c.discountEligible ? (
                  <p key={c.id} className="flex min-h-11 items-center gap-2 text-body text-fg-muted">
                    <Lock aria-hidden className="size-4" /> {c.name} (always excluded)
                  </p>
                ) : (
                  <Checkbox key={c.id} label={c.name} checked={edit.excluded.includes(c.id)} onChange={(v) => setEdit({ ...edit, excluded: v ? [...edit.excluded, c.id] : edit.excluded.filter((x) => x !== c.id) })} />
                ),
              )}
            </fieldset>
            <DiscountCard card={{ name: edit.name || "Your card", percentOff: Number.parseInt(edit.percentOff || "0", 10), amountOffCents: Math.round(Number.parseFloat(edit.amountOff || "0") * 100), terms: edit.terms || null }} shop={detail.merchant} live={false} />
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Delete ${del?.name ?? "this card"}?`} body="Customers stop seeing it in their wallet." confirmLabel="Delete" danger onConfirm={async () => {
        await api.deleteDiscountCard(del!.id);
        await cards.reload();
      }} />
    </div>
  );
}
