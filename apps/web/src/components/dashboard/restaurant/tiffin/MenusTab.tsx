"use client";
import { Copy, Plus, X } from "lucide-react";
import { useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { EmptyState, ErrorLine, SaveBar, SkeletonRows } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { cn } from "@/lib/cn";
import { SPICE_LABELS, SpiceDots } from "../menu";
import { DateNav, Loader, addDaysISO, dayLabel, dowOf, dayShort, todayISO, weekStartISO } from "../common";

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };
const ALL = "__all";

/**
 * One dish row in the editor. Maps 1:1 onto tiffinApi.MenuItem (name, description, dietary), so what is saved is the same
 * shape the kitchen, manifest and public page already read; dietary fields and translations the editor doesn't show are kept.
 */
type Dish = { key: string; name: string; description: string; dietary: NonNullable<tiffinApi.MenuItem["dietary"]>; translations?: tiffinApi.MenuItem["translations"] };
type Draft = { dishes: Dish[]; notes: string };
const MAX_DISHES = 30;

let dishSeq = 0;
const newDish = (over: Partial<Dish> = {}): Dish => ({ key: `d${++dishSeq}`, name: "", description: "", dietary: {}, ...over });
const toDishes = (items: tiffinApi.MenuItem[]): Dish[] => items.map((i) => newDish({ name: i.name, description: i.description ?? "", dietary: i.dietary ?? {}, translations: i.translations }));
function fromDishes(dishes: Dish[]): tiffinApi.MenuItem[] {
  return dishes
    .filter((d) => d.name.trim())
    .slice(0, MAX_DISHES)
    .map((d) => {
      const description = d.description.trim();
      const dietary = Object.fromEntries(Object.entries(d.dietary).filter(([, v]) => v !== undefined && v !== false && v !== 0)) as Dish["dietary"];
      return { name: d.name.trim().slice(0, 120), ...(description ? { description: description.slice(0, 500) } : {}), ...(Object.keys(dietary).length ? { dietary } : {}), ...(d.translations ? { translations: d.translations } : {}) };
    });
}
/** Comparable form of a day's dishes (keys and empty rows dropped), for the dirty check. */
const sig = (dishes: Dish[]) => JSON.stringify(fromDishes(dishes));
const FLAGS = [["vegetarian", "Veg"], ["vegan", "Vegan"], ["jain", "Jain"]] as const;

const DISH_INPUT = "h-9 w-full min-w-0 rounded-input border border-line bg-bg px-3 text-meta text-fg outline-none placeholder:text-fg-subtle read-only:bg-bg-subtle focus:border-fg focus:ring-1 focus:ring-fg";
const chip = (on: boolean) => cn("inline-flex h-7 items-center rounded-full border px-2.5 text-caption transition-colors focus-visible:focus-ring disabled:cursor-default", on ? "border-fg bg-fg text-bg" : "border-line text-fg-muted hover:border-line-strong hover:text-fg");

/** Week editor per plan: a row per dish (name, optional description, dietary chips), copy last week, save the week in one go. */
export function MenusTab({ goPlans, gate }: { goPlans: () => void; gate: Gate }) {
  const { api, role } = useMerchant();
  const plans = useApi(() => api.tiffin.plans(), [api]);
  const [planKey, setPlanKey] = useState<string>("");
  const [week, setWeek] = useState(weekStartISO(todayISO()));
  const [version, setVersion] = useState(0);
  const sel = planKey || plans.data?.items[0]?.id || ALL;
  const planId = sel === ALL ? null : sel;
  const to = addDaysISO(week, 6);
  const curKey = `${sel}:${week}:${version}`;
  const menus = useApi(plans.data ? async () => ({ key: curKey, items: (await api.tiffin.menus({ from: week, to, ...(planId ? { planId } : {}) })).items }) : null, [api, plans.data, curKey]);
  const canEdit = role === "owner" || role === "manager";
  return (
    <div className="flex flex-col gap-4">
      <Loader state={plans} gate={gate}>
        {(p) =>
          p.items.length === 0 ? (
            <EmptyState title="Make a plan first" description="Menus belong to a plan, so customers see what's cooking for the plan they are on." action={<Button size="sm" onClick={goPlans}>Create a plan</Button>} />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="w-full sm:w-72">
                  <Select label="Plan" value={sel} onChange={(e) => setPlanKey(e.target.value)} options={[...p.items.map((x) => ({ value: x.id, label: x.name })), { value: ALL, label: "Every plan (shop-wide menu)" }]} className="min-h-10" />
                </div>
                <div className="pb-1.5"><DateNav label="Week" value={week} step={7} text={`${dayShort(week)} to ${dayShort(to)}`} onChange={(d) => setWeek(weekStartISO(d))} /></div>
              </div>
              {sel === ALL ? <p className="text-meta text-fg-muted">The shop-wide menu is used for any plan that has no menu of its own that day.</p> : null}
              {menus.data && menus.data.key === curKey ? (
                <WeekEditor
                  key={curKey}
                  week={week}
                  planId={planId}
                  days={p.items.find((x) => x.id === sel)?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]}
                  existing={menus.data.items.filter((m) => m.planId === planId)}
                  canEdit={canEdit}
                  onSaved={() => setVersion((v) => v + 1)}
                />
              ) : menus.error ? (
                <ErrorLine message={menus.error} onRetry={() => void menus.reload()} />
              ) : (
                <SkeletonRows rows={5} />
              )}
            </>
          )
        }
      </Loader>
    </div>
  );
}

function WeekEditor({ week, planId, days, existing, canEdit, onSaved }: { week: string; planId: string | null; days: number[]; existing: tiffinApi.MenuDto[]; canEdit: boolean; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(week, i));
  const byDate = new Map(existing.map((m) => [m.date, m]));
  const initial = (): Record<string, Draft> => Object.fromEntries(dates.map((d) => [d, { dishes: toDishes(byDate.get(d)?.items ?? []), notes: byDate.get(d)?.notes ?? "" }]));
  const [base] = useState(initial);
  const [draft, setDraft] = useState<Record<string, Draft>>(base);
  const dirtyDates = dates.filter((d) => sig(draft[d]!.dishes) !== sig(base[d]!.dishes) || draft[d]!.notes !== base[d]!.notes);
  const filled = dates.filter((d) => fromDishes(draft[d]!.dishes).length).length;
  const setDay = (d: string, f: (cur: Draft) => Draft) => setDraft((c) => ({ ...c, [d]: f(c[d]!) }));
  const setDish = (d: string, key: string, patch: Partial<Dish>) => setDay(d, (cur) => ({ ...cur, dishes: cur.dishes.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));

  const copyLast = async () => {
    const prev = await act.run(() => api.tiffin.menus({ from: addDaysISO(week, -7), to: addDaysISO(week, -1), ...(planId ? { planId } : {}) }));
    if (!prev) return;
    const rows = prev.items.filter((m) => m.planId === planId);
    if (!rows.length) return toast({ message: "Nothing on last week's menu to copy.", tone: "neutral" });
    setDraft((cur) => {
      const next = { ...cur };
      for (const m of rows) {
        const d = addDaysISO(m.date, 7);
        if (next[d]) next[d] = { dishes: toDishes(m.items), notes: m.notes ?? "" };
      }
      return next;
    });
    toast({ message: `Copied ${rows.length} ${rows.length === 1 ? "day" : "days"} from last week. Save to keep them.`, tone: "success" });
  };
  const save = async () => {
    const r = await act.run(async () => {
      const puts: tiffinApi.PutMenusBody["menus"] = [];
      for (const d of dirtyDates) {
        const dr = draft[d]!;
        const items = fromDishes(dr.dishes);
        if (items.length) puts.push({ planId, date: d, items, notes: dr.notes.trim() || null });
        else if (byDate.get(d)) await api.tiffin.deleteMenu(byDate.get(d)!.id);
      }
      if (puts.length) await api.tiffin.putMenus({ menus: puts });
      return true;
    });
    if (r) {
      toast({ message: "Menu saved", tone: "success" });
      onSaved();
    }
  };
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-meta text-fg-muted">Add a row per dish. Tag it veg, vegan, Jain or spice level so customers can see what is in their tiffin.</p>
        {canEdit ? <Button size="sm" variant="secondary" iconStart={Copy} loading={act.busy && !dirtyDates.length} onClick={() => void copyLast()}>Copy last week</Button> : null}
      </div>
      {filled === 0 && !dirtyDates.length ? <p className="border-y border-line py-3 text-meta text-fg-muted">No menu for this week yet. Add today&apos;s dishes, like Dal tadka, Jeera rice, Aloo gobi, or copy last week and change what&apos;s different.</p> : null}
      <div className="divide-y divide-line border-y border-line">
        {dates.map((d) => {
          const serves = days.includes(dowOf(d));
          const dr = draft[d]!;
          return (
            <section key={d} aria-label={dayLabel(d)} className={cn("flex flex-col gap-2 py-4", !serves && "opacity-60")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-meta-strong text-fg">
                  {dayLabel(d)}
                  {!serves ? <span className="ms-2 text-caption font-normal text-fg-muted">No meals</span> : null}
                </h3>
                <input
                  aria-label={`Note for ${dayLabel(d)}`}
                  readOnly={!canEdit}
                  placeholder="Note, e.g. extra spicy day"
                  value={dr.notes}
                  onChange={(e) => setDay(d, (cur) => ({ ...cur, notes: e.target.value }))}
                  className="h-8 w-full rounded-input border border-line bg-bg px-3 text-meta text-fg outline-none placeholder:text-fg-subtle focus:border-fg focus:ring-1 focus:ring-fg sm:w-64"
                />
              </div>
              <ul className="flex flex-col gap-2">
                {dr.dishes.map((x, n) => {
                  const spice = x.dietary.spice ?? 0;
                  return (
                    <li key={x.key} className="grid items-center gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto]">
                      <input aria-label={`Dish ${n + 1} name, ${dayLabel(d)}`} readOnly={!canEdit} maxLength={120} placeholder="Dish, e.g. Dal tadka" value={x.name} onChange={(e) => setDish(d, x.key, { name: e.target.value })} className={DISH_INPUT} />
                      <input aria-label={`Dish ${n + 1} description, ${dayLabel(d)} (optional)`} readOnly={!canEdit} maxLength={500} placeholder="Description (optional)" value={x.description} onChange={(e) => setDish(d, x.key, { description: e.target.value })} className={DISH_INPUT} />
                      <div className="flex flex-wrap items-center gap-1.5">
                        {FLAGS.map(([flag, label]) => (
                          <button
                            key={flag}
                            type="button"
                            disabled={!canEdit}
                            aria-pressed={!!x.dietary[flag]}
                            onClick={() => setDish(d, x.key, { dietary: { ...x.dietary, [flag]: !x.dietary[flag], ...(flag === "vegan" && !x.dietary.vegan ? { vegetarian: true } : {}) } })}
                            className={chip(!!x.dietary[flag])}
                          >
                            {label}
                          </button>
                        ))}
                        <button type="button" disabled={!canEdit} aria-pressed={spice > 0} aria-label={`Spice level: ${SPICE_LABELS[spice]}. Tap to change.`} onClick={() => setDish(d, x.key, { dietary: { ...x.dietary, spice: ((spice + 1) % 4) as 0 | 1 | 2 | 3 } })} className={cn(chip(spice > 0), "gap-1.5")}>
                          Spice
                          {spice > 0 ? <SpiceDots level={spice} className={spice > 0 ? "[&>span]:bg-bg" : ""} /> : null}
                        </button>
                        {canEdit ? (
                          <button type="button" aria-label={`Remove dish ${n + 1}, ${dayLabel(d)}`} onClick={() => setDay(d, (cur) => ({ ...cur, dishes: cur.dishes.filter((y) => y.key !== x.key) }))} className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
                            <X aria-hidden className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {canEdit && dr.dishes.length < MAX_DISHES ? (
                <div>
                  <Button size="sm" variant="ghost" iconStart={Plus} onClick={() => setDay(d, (cur) => ({ ...cur, dishes: [...cur.dishes, newDish()] }))}>Add dish</Button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <SaveBar dirty={dirtyDates.length > 0} error={act.error} message={`${dirtyDates.length} ${dirtyDates.length === 1 ? "day" : "days"} changed`} onDiscard={() => setDraft(base)}>
        <Button size="sm" loading={act.busy} onClick={() => void save()}>Save week</Button>
      </SaveBar>
    </>
  );
}
