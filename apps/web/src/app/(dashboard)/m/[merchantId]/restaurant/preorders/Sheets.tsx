"use client";
/** Pre-order side sheets: rules and caps (weekday caps, per-hour cap, Eid-style date overrides), per-pot recipes, and the wait list. */
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { restaurantApi } from "@ll/shared";
import { Dot, ErrorLine, SidePanel as Sheet, SkeletonRows } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { formatPhone } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { dayLabel } from "@/components/dashboard/restaurant/common";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const DAY_LABEL: Record<restaurantApi.Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const num = (v: string) => (v.trim() === "" ? null : Number.parseInt(v, 10));
const digits = (v: string) => v.replace(/\D/g, "");

interface OverrideDraft {
  label: string;
  from: string;
  to: string;
  cap: string;
  leadHours: string;
}

/** Rules and caps. `draft` pre-fills an override (the festival checklist links here with Eid's dates). */
export function RulesSheet({ rules, cancelHours, canEdit, draft, onClose, onSaved }: { rules: restaurantApi.PreorderRulesResponse; cancelHours: number | null; canEdit: boolean; draft?: Partial<OverrideDraft> | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [daily, setDaily] = useState(rules.preorderDailyCap == null ? "" : String(rules.preorderDailyCap));
  const [byDay, setByDay] = useState<Record<string, string>>(() => Object.fromEntries(restaurantApi.WEEKDAYS.map((d) => [d, rules.capByWeekday[d] == null ? "" : String(rules.capByWeekday[d])])));
  const [hour, setHour] = useState(rules.perHourCap == null ? "" : String(rules.perHourCap));
  const [cancel, setCancel] = useState(cancelHours == null ? "" : String(cancelHours));
  const [overrides, setOverrides] = useState<OverrideDraft[]>(() => {
    const list = rules.overrides.map((o) => ({ label: o.label, from: o.from, to: o.to, cap: String(o.cap), leadHours: o.leadHours == null ? "" : String(o.leadHours) }));
    return draft ? [...list, { label: draft.label ?? "", from: draft.from ?? "", to: draft.to ?? draft.from ?? "", cap: draft.cap ?? String(Math.max(20, (rules.preorderDailyCap ?? 20) * 2)), leadHours: draft.leadHours ?? "72" }] : list;
  });
  const set = (i: number, patch: Partial<OverrideDraft>) => setOverrides((os) => os.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  const bad = overrides.some((o) => !o.label.trim() || !o.from || !o.to || o.to < o.from || !(num(o.cap) && num(o.cap)! > 0));

  async function save() {
    const body: restaurantApi.PreorderRulesBody = {
      preorderDailyCap: num(daily),
      capByWeekday: Object.fromEntries(restaurantApi.WEEKDAYS.map((d) => [d, num(byDay[d] ?? "")])),
      perHourCap: num(hour),
      overrides: overrides.map((o) => ({ label: o.label.trim(), from: o.from, to: o.to, cap: num(o.cap)!, ...(num(o.leadHours) != null ? { leadHours: num(o.leadHours)! } : {}) })),
    };
    const r = await act.run(async () => {
      const saved = await api.preorders.saveRules(body);
      await api.preorders.saveCancelRule(num(cancel));
      return saved;
    });
    if (r) {
      toast({ message: "Rules saved", tone: "success" });
      onSaved();
      onClose();
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Rules and caps"
      subtitle="How many pots you take, and when."
      label="Pre-order rules"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canEdit || bad} loading={act.busy} onClick={() => void save()}>Save rules</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {!canEdit ? <Banner tone="neutral">Only owners and managers can change these rules.</Banner> : null}
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <section className="flex flex-col gap-3">
          <h3 className="text-meta-strong text-fg">Pots per day</h3>
          <TextField label="Every day, unless a weekday below says otherwise" suffix="pots" inputMode="numeric" value={daily} onChange={(e) => setDaily(digits(e.target.value))} disabled={!canEdit} hint="Leave empty for no limit." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {restaurantApi.WEEKDAYS.map((d) => (
              <TextField key={d} label={DAY_LABEL[d]} inputMode="numeric" value={byDay[d] ?? ""} onChange={(e) => setByDay({ ...byDay, [d]: digits(e.target.value) })} disabled={!canEdit} placeholder={daily || "none"} />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-meta-strong text-fg">Pickup crowding</h3>
          <TextField label="Most pots in one pickup hour" suffix="pots" inputMode="numeric" value={hour} onChange={(e) => setHour(digits(e.target.value))} disabled={!canEdit} hint="Stops six families arriving for pots at 6 pm. Leave empty for no limit." />
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-meta-strong text-fg">Cancelling</h3>
          <TextField label="Free cancel until" suffix="hours before pickup" inputMode="numeric" value={cancel} onChange={(e) => setCancel(digits(e.target.value))} disabled={!canEdit} hint="After this the guest keeps the deposit and you can still cancel and refund. Leave empty to use each dish's own notice period. 0 means free until pickup." />
        </section>
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-meta-strong text-fg">Eid and other special dates</h3>
            <Button size="sm" variant="secondary" iconStart={Plus} disabled={!canEdit} onClick={() => setOverrides([...overrides, { label: "", from: "", to: "", cap: "40", leadHours: "72" }])}>Add dates</Button>
          </div>
          <p className="text-meta text-fg-muted">A special date replaces the weekday cap for those days only. The notice is the last time guests can order, in hours before pickup. Dates follow moon sighting: confirm Eid locally before you announce it.</p>
          {overrides.length === 0 ? <p className="text-meta text-fg-muted">No special dates yet.</p> : null}
          {overrides.map((o, i) => (
            <div key={i} className="grid gap-3 rounded-card bg-card shadow-card p-4 sm:grid-cols-2">
              <TextField label="Name" value={o.label} onChange={(e) => set(i, { label: e.target.value })} disabled={!canEdit} placeholder="Eid al-Fitr" maxLength={60} />
              <TextField label="Pots per day" inputMode="numeric" value={o.cap} onChange={(e) => set(i, { cap: digits(e.target.value) })} disabled={!canEdit} />
              <TextField label="From" type="date" value={o.from} onChange={(e) => set(i, { from: e.target.value, to: o.to && o.to >= e.target.value ? o.to : e.target.value })} disabled={!canEdit} />
              <TextField label="To" type="date" value={o.to} min={o.from} onChange={(e) => set(i, { to: e.target.value })} disabled={!canEdit} error={o.to && o.from && o.to < o.from ? "The end date is before the start date." : null} />
              <TextField label="Notice (cut-off)" suffix="hours" inputMode="numeric" value={o.leadHours} onChange={(e) => set(i, { leadHours: digits(e.target.value) })} disabled={!canEdit} optionalLabel />
              <div className="flex items-end justify-end pb-6">
                <Button size="sm" variant="ghost" iconStart={Trash2} disabled={!canEdit} onClick={() => setOverrides(overrides.filter((_, k) => k !== i))}>Remove</Button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </Sheet>
  );
}

/** Per-pot recipes behind "what to cook and buy": rice, meat and cook time for each pre-order dish. Quantities are estimates. */
export function RecipeSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { api, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const catalog = useApi(() => api.catalog(), [api]);
  const dishes = useMemo(() => (catalog.data?.items ?? []).filter((i) => i.preorderOnly && i.available), [catalog.data]);
  const [draft, setDraft] = useState<Record<string, { rice: string; meat: string; kind: string; cook: string }>>({});
  useEffect(() => {
    if (!catalog.data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(Object.fromEntries(dishes.map((d) => [d.id, { rice: d.recipe?.riceKg == null ? "" : String(d.recipe.riceKg), meat: d.recipe?.meatKg == null ? "" : String(d.recipe.meatKg), kind: d.recipe?.meatKind ?? "", cook: d.cookMinutes ? String(d.cookMinutes) : "" }])));
  }, [catalog.data, dishes]);
  const canEdit = role !== "staff";
  const dec = (v: string) => v.replace(/[^0-9.]/g, "");

  async function save() {
    const r = await act.run(async () => {
      for (const d of dishes) {
        const f = draft[d.id];
        if (!f) continue;
        const rice = f.rice.trim() === "" ? undefined : Number(f.rice);
        const meat = f.meat.trim() === "" ? undefined : Number(f.meat);
        const recipe = rice != null || meat != null ? { ...(rice != null ? { riceKg: rice } : {}), ...(meat != null ? { meatKg: meat } : {}), ...(f.kind.trim() ? { meatKind: f.kind.trim().toLowerCase() } : {}) } : null;
        await api.updateItem(d.id, { recipe, cookMinutes: f.cook.trim() === "" ? 0 : Number.parseInt(f.cook, 10) });
      }
      return true;
    });
    if (r) {
      toast({ message: "Recipes saved", tone: "success" });
      onSaved();
      onClose();
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Per-pot recipes"
      subtitle="Used for the shopping list and fire times. Estimates, not measured."
      label="Per-pot recipes"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canEdit || !dishes.length} loading={act.busy} onClick={() => void save()}>Save recipes</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {catalog.error && !catalog.data ? <ErrorLine message={catalog.error} onRetry={() => void catalog.reload()} /> : null}
        {!catalog.data && !catalog.error ? <SkeletonRows rows={3} /> : null}
        {catalog.data && !dishes.length ? <p className="text-meta text-fg-muted">No pre-order dishes yet. Mark a degh as pre-order only in Menu &amp; dietary first.</p> : null}
        {dishes.map((d) => {
          const f = draft[d.id] ?? { rice: "", meat: "", kind: "", cook: "" };
          const set = (patch: Partial<typeof f>) => setDraft({ ...draft, [d.id]: { ...f, ...patch } });
          return (
            <section key={d.id} aria-label={d.name} className="grid gap-3 border-b border-line pb-5 last:border-b-0 sm:grid-cols-2">
              <h3 className="text-body-strong text-fg sm:col-span-2">{d.name}</h3>
              <TextField label="Rice per pot" suffix="kg" inputMode="decimal" value={f.rice} onChange={(e) => set({ rice: dec(e.target.value) })} disabled={!canEdit} />
              <TextField label="Meat or paneer per pot" suffix="kg" inputMode="decimal" value={f.meat} onChange={(e) => set({ meat: dec(e.target.value) })} disabled={!canEdit} />
              <TextField label="What it is" value={f.kind} onChange={(e) => set({ kind: e.target.value })} disabled={!canEdit} placeholder="chicken, goat, paneer" optionalLabel maxLength={30} />
              <TextField label="Cook time (dum)" suffix="min" inputMode="numeric" value={f.cook} onChange={(e) => set({ cook: digits(e.target.value) })} disabled={!canEdit} hint="The kitchen fires this long before pickup." optionalLabel />
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Who is waiting for a full day. */
export function WaitlistSheet({ from, to, onClose }: { from: string; to: string; onClose: () => void }) {
  const { api } = useMerchant();
  const state = useApi(() => api.preorders.waitlist({ from, to }), [api, from, to]);
  const byDate = useMemo(() => {
    const m = new Map<string, restaurantApi.WaitlistEntryDto[]>();
    for (const r of state.data?.items ?? []) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()];
  }, [state.data]);
  return (
    <Sheet open onClose={onClose} title="Wait list" subtitle="When a pot frees up, the first guest in line gets one message." label="Wait list" width={480}>
      {state.error && !state.data ? <ErrorLine message={state.error} onRetry={() => void state.reload()} /> : null}
      {!state.data && !state.error ? <SkeletonRows rows={3} /> : null}
      {state.data && !byDate.length ? <p className="text-meta text-fg-muted">No one is waiting for this week.</p> : null}
      <div className="flex flex-col gap-5">
        {byDate.map(([date, rows]) => (
          <section key={date} aria-label={dayLabel(date)}>
            <h3 className="text-meta-strong text-fg">{dayLabel(date)}</h3>
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {rows.map((r, i) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-body text-fg">{i + 1}. {r.name ?? formatPhone(r.phone)}</span>
                    <span className="block truncate text-meta text-fg-muted">{r.name ? `${formatPhone(r.phone)} · ` : ""}{r.dish ?? "Any dish"}</span>
                  </span>
                  {r.notifiedAt ? <Dot tone="positive">Messaged</Dot> : <Dot tone="info">Waiting</Dot>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
