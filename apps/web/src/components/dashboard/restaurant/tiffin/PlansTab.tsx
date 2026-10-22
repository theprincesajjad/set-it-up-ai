"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { Capsules, EmptyState, Row, RowList, SidePanel as Sheet, Dot } from "@/components/dashboard/kit";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { DOW_SHORT, FormGrid, GroupLabel, Loader, MoneyField, NumberField, ToggleChips, centsToField, dietaryWords, fieldToCents } from "../common";

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LANGS = [
  { code: "hi", label: "Hindi", dir: "ltr" },
  { code: "ur", label: "Urdu", dir: "rtl" },
  { code: "pa", label: "Punjabi", dir: "ltr" },
] as const;
const FLAGS = [
  { value: "halal", label: "Halal" },
  { value: "zabihah", label: "Zabihah" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "jain", label: "Jain" },
  { value: "glutenFree", label: "Gluten-free" },
] as const;
type Flag = (typeof FLAGS)[number]["value"];

export function daysText(days: number[]): string {
  const s = [...days].sort();
  if (s.length === 7) return "Every day";
  const wk = [1, 2, 3, 4, 5];
  if (s.length === 5 && wk.every((d) => s.includes(d))) return "Mon to Fri";
  return DAY_ORDER.filter((d) => s.includes(d)).map((d) => DOW_SHORT[d]).join(", ");
}

export function PlansTab({ gate }: { gate: Gate }) {
  const { api, role } = useMerchant();
  const state = useApi(() => api.tiffin.plans(), [api]);
  const [edit, setEdit] = useState<tiffinApi.PlanDto | "new" | null>(null);
  const canEdit = role === "owner" || role === "manager";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {canEdit ? <Button size="sm" iconStart={Plus} onClick={() => setEdit("new")}>New plan</Button> : null}
      </div>
      <Loader state={state} gate={gate}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState
              title="No plans yet"
              description="A plan is what a customer subscribes to, like Veg tiffin, Mon to Fri, with a monthly price."
              action={canEdit ? <Button size="sm" onClick={() => setEdit("new")}>Create your first plan</Button> : undefined}
            />
          ) : (
            <RowList label="Tiffin plans">
              {d.items.map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  meta={`${daysText(p.daysOfWeek)} · ${p.cadence === "monthly" ? "billed monthly" : "billed weekly"} · up to ${p.maxServings} servings · skip until ${p.cutoffHours} h before`}
                  leading={<Dot tone={p.active ? "positive" : "neutral"}>{p.active ? "On" : "Off"}</Dot>}
                  trailing={
                    <span className="flex flex-col items-end">
                      <span>{formatMoney(p.priceCents)}<span className="text-meta text-fg-muted">/{p.cadence === "monthly" ? "mo" : "wk"}</span></span>
                      <span className="text-meta text-fg-muted">{p.subscriberCount ?? 0} {(p.subscriberCount ?? 0) === 1 ? "subscriber" : "subscribers"}</span>
                    </span>
                  }
                  onClick={canEdit ? () => setEdit(p) : undefined}
                />
              ))}
            </RowList>
          )
        }
      </Loader>
      {state.data?.items.some((p) => dietaryWords(p.dietary).length) ? (
        <p className="text-meta text-fg-muted">Halal and dietary tags are the shop&apos;s own claims. We show them as you enter them.</p>
      ) : null}
      {edit ? <PlanSheet plan={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void state.reload(); }} /> : null}
    </div>
  );
}

function PlanSheet({ plan, onClose, onSaved }: { plan: tiffinApi.PlanDto | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [cadence, setCadence] = useState<tiffinApi.TiffinCadence>(plan?.cadence ?? "monthly");
  const [days, setDays] = useState<number[]>(plan?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [meals, setMeals] = useState(String(plan?.mealsPerDay ?? 1));
  const [price, setPrice] = useState(centsToField(plan?.priceCents ?? null));
  const [extra, setExtra] = useState(centsToField(plan?.extraServingCents ?? 0));
  const [maxServings, setMaxServings] = useState(String(plan?.maxServings ?? 6));
  const [deliveryFee, setDeliveryFee] = useState(centsToField(plan?.deliveryFeeCents ?? 0));
  const [cutoff, setCutoff] = useState(String(plan?.cutoffHours ?? 24));
  const [delivery, setDelivery] = useState(plan?.deliveryAllowed ?? true);
  const [pickup, setPickup] = useState(plan?.pickupAllowed ?? true);
  const [active, setActive] = useState(plan?.active ?? true);
  const [flags, setFlags] = useState<Flag[]>(FLAGS.filter((f) => plan?.dietary?.[f.value]).map((f) => f.value));
  const [spice, setSpice] = useState(String(plan?.dietary?.spice ?? 0));
  const [certifier, setCertifier] = useState(plan?.dietary?.halalCertifier ?? "");
  const [allergens, setAllergens] = useState((plan?.dietary?.allergens ?? []).join(", "));
  const [tr, setTr] = useState<Record<string, { name: string; description: string }>>(() =>
    Object.fromEntries(LANGS.map((l) => [l.code, { name: plan?.translations?.[l.code]?.name ?? "", description: plan?.translations?.[l.code]?.description ?? "" }])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const per = cadence === "monthly" ? "month" : "week";

  const save = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give the plan a name";
    if (fieldToCents(price) < 50) e.price = "Price must be at least $0.50";
    if (!days.length) e.days = "Pick at least one day";
    setErrors(e);
    if (Object.keys(e).length) return;
    const dietary: tiffinApi.Dietary = { ...Object.fromEntries(flags.map((f) => [f, true])), spice: Number(spice) as 0 | 1 | 2 | 3 };
    if (certifier.trim() && (flags.includes("halal") || flags.includes("zabihah"))) dietary.halalCertifier = certifier.trim();
    const al = allergens.split(",").map((a) => a.trim()).filter(Boolean);
    if (al.length) dietary.allergens = al;
    const translations: tiffinApi.TiffinTranslations = {};
    for (const l of LANGS) {
      const t = tr[l.code]!;
      if (t.name.trim() || t.description.trim()) translations[l.code] = { ...(t.name.trim() ? { name: t.name.trim() } : {}), ...(t.description.trim() ? { description: t.description.trim() } : {}) };
    }
    const body: tiffinApi.CreatePlanBody = {
      name: name.trim(), description: description.trim() || null, translations, cadence, daysOfWeek: [...days].sort(),
      mealsPerDay: Number(meals) || 1, priceCents: fieldToCents(price), extraServingCents: fieldToCents(extra),
      maxServings: Number(maxServings) || 1, dietary, deliveryFeeCents: fieldToCents(deliveryFee), pickupAllowed: pickup,
      deliveryAllowed: delivery, cutoffHours: Number(cutoff) || 0, active,
    };
    const r = await act.run(() => (plan ? api.tiffin.updatePlan(plan.id, body) : api.tiffin.createPlan(body)));
    if (r) {
      toast({ message: plan ? "Plan saved" : "Plan created", tone: "success" });
      onSaved();
    }
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        label={plan ? "Edit plan" : "New plan"}
        title={plan ? plan.name : "New tiffin plan"}
        subtitle={plan ? `${plan.subscriberCount ?? 0} subscribers` : "Customers pick this on your tiffin page."}
        width={520}
        footer={
          <>
            {plan ? <Button variant="ghost" className="me-auto" onClick={() => setConfirmDelete(true)}>Delete</Button> : null}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={act.busy} onClick={() => void save()}>{plan ? "Save plan" : "Create plan"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <TextField label="Plan name" placeholder="Veg tiffin, Mon to Fri" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} />
          <TextField type="textarea" label="What's in it" optionalLabel placeholder="Two rotis or rice, dal, one sabzi, salad. Cooked fresh each morning." value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" />
          <div className="flex flex-col gap-1.5">
            <GroupLabel>How it&apos;s billed</GroupLabel>
            <Capsules label="Billing" value={cadence} onChange={setCadence} options={[{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <GroupLabel>Days meals go out</GroupLabel>
            <ToggleChips label="Days of the week" value={days} onChange={setDays} options={DAY_ORDER.map((d) => ({ value: d, label: DOW_SHORT[d]! }))} />
            {errors.days ? <p className="text-meta text-negative">{errors.days}</p> : null}
          </div>
          <FormGrid>
            <MoneyField label={`Price per ${per}, one serving`} value={price} onChange={setPrice} error={errors.price} />
            <MoneyField label={`Each extra serving, per ${per}`} value={extra} onChange={setExtra} hint="For family plans" />
          </FormGrid>
          <FormGrid cols={3}>
            <NumberField label="Meals per day" value={meals} onChange={setMeals} />
            <NumberField label="Most servings" value={maxServings} onChange={setMaxServings} />
            <NumberField label="Skip cutoff" suffix="hours" value={cutoff} onChange={setCutoff} hint="Before 8:00 am that day" />
          </FormGrid>
          <div>
            <Switch label="Delivery" description="Driver drops it at the door" checked={delivery} onChange={setDelivery} />
            {delivery ? <div className="pb-2"><MoneyField label={`Delivery fee per ${per}`} value={deliveryFee} onChange={setDeliveryFee} /></div> : null}
            <Switch label="Pickup" description="Customer collects at the shop" checked={pickup} onChange={setPickup} />
            <Switch label="Open for new sign-ups" checked={active} onChange={setActive} />
          </div>
          <div className="flex flex-col gap-1.5">
            <GroupLabel>Dietary tags</GroupLabel>
            <ToggleChips label="Dietary tags" value={flags} onChange={setFlags} options={[...FLAGS]} />
            <p className="text-meta text-fg-muted">These are your claims, shown as you enter them.</p>
          </div>
          <FormGrid>
            <Select label="Spice level" value={spice} onChange={(e) => setSpice(e.target.value)} options={[{ value: "0", label: "Not marked" }, { value: "1", label: "Mild" }, { value: "2", label: "Medium" }, { value: "3", label: "Hot" }]} />
            <TextField label="Allergens" optionalLabel placeholder="nuts, dairy" value={allergens} onChange={(e) => setAllergens(e.target.value)} />
          </FormGrid>
          {flags.includes("halal") || flags.includes("zabihah") ? <TextField label="Halal certifier" optionalLabel placeholder="Name as it appears on your certificate" value={certifier} onChange={(e) => setCertifier(e.target.value)} /> : null}
          <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
            <legend className="text-meta-strong text-fg">Translations</legend>
            <p className="-mt-2 text-meta text-fg-muted">Shown on your tiffin page when a customer switches language. Leave blank to show English.</p>
            {LANGS.map((l) => (
              <div key={l.code} className="flex flex-col gap-2">
                <p className="text-meta text-fg-muted">{l.label} ({l.code})</p>
                <TextField label={`Name in ${l.label}`} hideLabel placeholder={`Name in ${l.label}`} dir={l.dir} lang={l.code} value={tr[l.code]!.name} onChange={(e) => setTr((t) => ({ ...t, [l.code]: { ...t[l.code]!, name: e.target.value } }))} />
                <TextField type="textarea" label={`Description in ${l.label}`} hideLabel placeholder={`Description in ${l.label}`} dir={l.dir} lang={l.code} className="min-h-16" value={tr[l.code]!.description} onChange={(e) => setTr((t) => ({ ...t, [l.code]: { ...t[l.code]!, description: e.target.value } }))} />
              </div>
            ))}
          </fieldset>
        </div>
      </Sheet>
      {plan ? (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          danger
          title={`Delete ${plan.name}?`}
          body={(plan.subscriberCount ?? 0) > 0 ? `${plan.subscriberCount} people are on this plan. It will be kept for them and closed to new sign-ups.` : "Nobody is on this plan, so it will be removed."}
          confirmLabel={(plan.subscriberCount ?? 0) > 0 ? "Close plan" : "Delete plan"}
          onConfirm={async () => {
            const r = await api.tiffin.deletePlan(plan.id);
            toast({ message: r.archived ? "Plan closed to new sign-ups. Current subscribers keep it." : "Plan deleted", tone: "success" });
            onSaved();
          }}
        />
      ) : null}
    </>
  );
}
