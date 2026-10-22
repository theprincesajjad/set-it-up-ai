"use client";
import { Copy } from "lucide-react";
import { useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { EmptyState, ErrorLine, SaveBar, SkeletonRows } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { cn } from "@/lib/cn";
import { DateNav, Loader, addDaysISO, dayLabel, dowOf, dayShort, todayISO, weekStartISO } from "../common";

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };
type Draft = { text: string; notes: string };
const ALL = "__all";

/** One dish per line; "Dal tadka - yellow lentils, cumin" puts the words after " - " in the description. */
function toText(items: tiffinApi.MenuItem[]): string {
  return items.map((i) => (i.description ? `${i.name} - ${i.description}` : i.name)).join("\n");
}
function fromText(text: string, prev: tiffinApi.MenuItem[]): tiffinApi.MenuItem[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((line) => {
      const [name, ...rest] = line.split(" - ");
      const n = name!.trim();
      const description = rest.join(" - ").trim();
      const keep = prev.find((p) => p.name === n);
      return { name: n.slice(0, 120), ...(description ? { description: description.slice(0, 500) } : {}), ...(keep?.dietary ? { dietary: keep.dietary } : {}) };
    });
}

/** Week grid per plan: type each day's dishes, copy last week, save the week in one go. */
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
  const initial = (): Record<string, Draft> => Object.fromEntries(dates.map((d) => [d, { text: toText(byDate.get(d)?.items ?? []), notes: byDate.get(d)?.notes ?? "" }]));
  const [base] = useState(initial);
  const [draft, setDraft] = useState<Record<string, Draft>>(base);
  const dirtyDates = dates.filter((d) => draft[d]!.text !== base[d]!.text || draft[d]!.notes !== base[d]!.notes);
  const filled = dates.filter((d) => draft[d]!.text.trim()).length;

  const copyLast = async () => {
    const prev = await act.run(() => api.tiffin.menus({ from: addDaysISO(week, -7), to: addDaysISO(week, -1), ...(planId ? { planId } : {}) }));
    if (!prev) return;
    const rows = prev.items.filter((m) => m.planId === planId);
    if (!rows.length) return toast({ message: "Nothing on last week's menu to copy.", tone: "neutral" });
    setDraft((cur) => {
      const next = { ...cur };
      for (const m of rows) {
        const d = addDaysISO(m.date, 7);
        if (next[d]) next[d] = { text: toText(m.items), notes: m.notes ?? "" };
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
        const items = fromText(dr.text, byDate.get(d)?.items ?? []);
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
        <p className="text-meta text-fg-muted">One dish per line. Add words after &quot; - &quot; for a short description.</p>
        {canEdit ? <Button size="sm" variant="secondary" iconStart={Copy} loading={act.busy && !dirtyDates.length} onClick={() => void copyLast()}>Copy last week</Button> : null}
      </div>
      {filled === 0 && !dirtyDates.length ? <p className="border-y border-line py-3 text-meta text-fg-muted">No menu for this week yet. Type today&apos;s dishes, like Dal tadka, Jeera rice, Aloo gobi, or copy last week and change what&apos;s different.</p> : null}
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {dates.map((d) => {
          const serves = days.includes(dowOf(d));
          return (
            <div key={d} className={cn("flex min-w-0 flex-col gap-1.5", !serves && "opacity-60")}>
              <label htmlFor={`menu-${d}`} className="flex items-baseline justify-between gap-2 text-meta-strong text-fg">
                <span>{dayLabel(d)}</span>
                {!serves ? <span className="text-caption font-normal text-fg-muted">No meals</span> : null}
              </label>
              <textarea
                id={`menu-${d}`}
                rows={5}
                readOnly={!canEdit}
                placeholder={serves ? "Dal tadka\nJeera rice\nAloo gobi" : ""}
                value={draft[d]!.text}
                onChange={(e) => setDraft((c) => ({ ...c, [d]: { ...c[d]!, text: e.target.value } }))}
                className="min-h-28 w-full resize-y rounded-input border border-line bg-bg px-3 py-2 text-meta text-fg outline-none placeholder:text-fg-subtle focus:border-fg focus:ring-1 focus:ring-fg"
              />
              <input
                aria-label={`Note for ${dayLabel(d)}`}
                readOnly={!canEdit}
                placeholder="Note, e.g. extra spicy day"
                value={draft[d]!.notes}
                onChange={(e) => setDraft((c) => ({ ...c, [d]: { ...c[d]!, notes: e.target.value } }))}
                className="h-9 w-full rounded-input border border-line bg-bg px-3 text-meta text-fg outline-none placeholder:text-fg-subtle focus:border-fg focus:ring-1 focus:ring-fg"
              />
            </div>
          );
        })}
      </div>
      <SaveBar dirty={dirtyDates.length > 0} error={act.error} message={`${dirtyDates.length} ${dirtyDates.length === 1 ? "day" : "days"} changed`} onDiscard={() => setDraft(base)}>
        <Button size="sm" loading={act.busy} onClick={() => void save()}>Save week</Button>
      </SaveBar>
    </>
  );
}
