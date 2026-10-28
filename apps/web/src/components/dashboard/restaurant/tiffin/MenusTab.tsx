"use client";
/**
 * Menus: every plan against every day of the week in one grid (design T4). A cell is one dish per line; words after " - "
 * become the dish's description. Saving writes one tiffin_menus row per (plan, date) for the cells you changed, a row for
 * "every plan" appears only when a shop-wide menu exists, and "Copy last week" fills all plans. Translations are counted,
 * never required: the counter links to a sheet to add Hindi, Urdu and Punjabi names.
 */
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { tiffinApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorLine, SaveBar, SidePanel as Sheet, SkeletonRows, Tag } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { cn } from "@/lib/cn";
import { cleanItems, fromText, toText, translated } from "@/lib/restaurant/tcb";
import { DOW_SHORT, DateNav, Loader, addDaysISO, dayShort, dietaryWords, dowOf, todayISO, weekStartISO } from "../common";
import { daysText } from "./PlansTab";

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };
const SHOP = "__shop";
const LANGS = [
  { code: "hi", label: "Hindi", dir: "ltr" },
  { code: "ur", label: "Urdu", dir: "rtl" },
  { code: "pa", label: "Punjabi", dir: "ltr" },
] as const;
const CHUNK = 31;

export function MenusTab({ goPlans, gate }: { goPlans: () => void; gate: Gate }) {
  const { api, role } = useMerchant();
  const plans = useApi(() => api.tiffin.plans(), [api]);
  const [week, setWeek] = useState(weekStartISO(todayISO()));
  const [version, setVersion] = useState(0);
  const to = addDaysISO(week, 6);
  const key = `${week}:${version}`;
  const menus = useApi(plans.data ? async () => ({ key, items: (await api.tiffin.menus({ from: week, to })).items }) : null, [api, plans.data, key]);
  const canEdit = role === "owner" || role === "manager";
  return (
    <div className="flex flex-col gap-5">
      <Loader state={plans} gate={gate}>
        {(p) =>
          p.items.length === 0 ? (
            <EmptyState title="Make a plan first" description="Menus belong to a plan, so customers see what's cooking for the plan they are on." action={<Button size="sm" onClick={goPlans}>Create a plan</Button>} />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Plans">
                {p.items.filter((x) => x.active).map((pl) => (
                  <button key={pl.id} type="button" onClick={goPlans} className="rounded-card border border-line p-4 text-start hover:bg-bg-subtle focus-visible:focus-ring">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-body-strong text-fg">{pl.name}</span>
                      <span className="tabular text-body-strong text-fg">{formatMoney(pl.priceCents)}{pl.cadence === "trial" ? " trial day" : ` / ${pl.cadence === "monthly" ? "mo" : "wk"}`}</span>
                    </span>
                    <span className="mt-1 block text-meta text-fg-muted">{daysText(pl.daysOfWeek)} · {pl.mealsPerDay} {pl.mealsPerDay === 1 ? "meal" : "meals"} · cutoff {pl.cutoffHours} h · {pl.subscriberCount ?? 0} subscribers</span>
                    <span className="mt-2 flex flex-wrap gap-1">{dietaryWords(pl.dietary).map((w) => <Tag key={w}>{w}</Tag>)}</span>
                  </button>
                ))}
              </div>
              {menus.data && menus.data.key === key ? (
                <Grid key={key} week={week} setWeek={setWeek} to={to} plans={p.items.filter((x) => x.active)} existing={menus.data.items} canEdit={canEdit} onSaved={() => setVersion((v) => v + 1)} />
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

type Cell = { text: string };
const cellKey = (planId: string | null, date: string) => `${planId ?? SHOP}|${date}`;

function Grid({ week, setWeek, to, plans, existing, canEdit, onSaved }: { week: string; setWeek: (d: string) => void; to: string; plans: tiffinApi.PlanDto[]; existing: tiffinApi.MenuDto[]; canEdit: boolean; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(week, i));
  const byKey = new Map(existing.map((m) => [cellKey(m.planId, m.date), m]));
  const hasShop = existing.some((m) => m.planId === null);
  const [showShop, setShowShop] = useState(hasShop);
  const [base] = useState<Record<string, Cell>>(() => Object.fromEntries(existing.map((m) => [cellKey(m.planId, m.date), { text: toText(m.items) }])));
  const [draft, setDraft] = useState<Record<string, Cell>>(base);
  const [words, setWords] = useState(false);
  const textOf = (k: string) => draft[k]?.text ?? "";
  const changed = [...new Set([...Object.keys(base), ...Object.keys(draft)])].filter((k) => (base[k]?.text ?? "").trim() !== (draft[k]?.text ?? "").trim());
  const rows: { id: string | null; name: string; days: number[] | null }[] = [...plans.map((p) => ({ id: p.id as string | null, name: p.name, days: p.daysOfWeek })), ...(showShop ? [{ id: null, name: "Every plan", days: null }] : [])];
  const all = existing.flatMap((m) => m.items);
  const done = all.filter(translated).length;

  // Typed but not saved is lost when the page closes or the week changes: ask first.
  useEffect(() => {
    if (!changed.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed.length]);
  const goWeek = (d: string) => {
    if (changed.length && !window.confirm("You have menu changes that are not saved. Leave this week without saving?")) return;
    setWeek(weekStartISO(d));
  };

  const setCell = (k: string, text: string) => setDraft((c) => ({ ...c, [k]: { text } }));
  const copyLast = async () => {
    const prev = await act.run(() => api.tiffin.menus({ from: addDaysISO(week, -7), to: addDaysISO(week, -1) }));
    if (!prev) return;
    if (!prev.items.length) return toast({ message: "Nothing on last week's menu to copy.", tone: "neutral" });
    if (prev.items.some((m) => m.planId === null)) setShowShop(true);
    setDraft((cur) => {
      const next = { ...cur };
      for (const m of prev.items) next[cellKey(m.planId, addDaysISO(m.date, 7))] = { text: toText(m.items) };
      return next;
    });
    toast({ message: `Copied ${prev.items.length} ${prev.items.length === 1 ? "day" : "days"} from last week for every plan. Save to keep them.`, tone: "success" });
  };
  const save = async () => {
    const r = await act.run(async () => {
      const puts: tiffinApi.PutMenusBody["menus"] = [];
      for (const k of changed) {
        const [pid, date] = k.split("|") as [string, string];
        const planId = pid === SHOP ? null : pid;
        const prev = byKey.get(k);
        const items = cleanItems(fromText(textOf(k), prev?.items ?? []));
        if (items.length) puts.push({ planId, date, items, notes: prev?.notes ?? null });
        else if (prev) await api.tiffin.deleteMenu(prev.id);
      }
      for (let i = 0; i < puts.length; i += CHUNK) await api.tiffin.putMenus({ menus: puts.slice(i, i + CHUNK) });
      return true;
    });
    if (r) {
      toast({ message: "Menus saved", tone: "success" });
      onSaved();
    }
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav label="Week" value={week} step={7} text={`${dayShort(week)} to ${dayShort(to)}`} onChange={goWeek} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-meta text-fg-muted sm:inline">Hindi, Urdu, Punjabi names:</span>
          <button type="button" onClick={() => setWords(true)} className="inline-flex h-8 items-center rounded-full border border-line px-3 text-meta text-fg hover:bg-bg-subtle focus-visible:focus-ring">
            {done} of {all.length} {all.length === 1 ? "dish" : "dishes"} translated
          </button>
          {canEdit ? <Button size="sm" variant="secondary" iconStart={Copy} loading={act.busy && !changed.length} onClick={() => void copyLast()}>Copy last week</Button> : null}
          {canEdit && !showShop ? <Button size="sm" variant="ghost" onClick={() => setShowShop(true)}>Add a shop-wide row</Button> : null}
        </div>
      </div>
      <p className="text-meta text-fg-muted">One dish per line. Add words after &quot; - &quot; for a description, like &quot;Dal tadka - made with toor dal&quot;. Put the pieces per serving in brackets, like &quot;Rotli (4)&quot;, so the kitchen sheet counts them.</p>
      <div role="table" aria-label="Menus by plan and day" className="overflow-hidden rounded-card border border-line">
        <div role="row" className="hidden grid-cols-[9rem_repeat(7,minmax(0,1fr))] border-b border-line bg-bg-subtle md:grid">
          <div role="columnheader" className="px-3 py-2.5 text-meta text-fg-muted">Plan</div>
          {dates.map((d) => (
            <div key={d} role="columnheader" className="px-3 py-2.5 text-meta text-fg-muted">{DOW_SHORT[dowOf(d)]} {Number(d.slice(8))}</div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.id ?? SHOP} role="row" className="grid border-b border-line last:border-b-0 md:grid-cols-[9rem_repeat(7,minmax(0,1fr))]">
            <div role="rowheader" className="px-3 pt-3 md:py-3">
              <p className="text-body-strong text-fg">{row.name}</p>
              <p className="text-caption text-fg-muted">dishes + notes</p>
            </div>
            {dates.map((d) => {
              const closed = row.days ? !row.days.includes(dowOf(d)) : false;
              const k = cellKey(row.id, d);
              return (
                <div key={d} role="cell" className={cn("min-w-0 border-line px-3 py-2 md:border-s", closed && "bg-bg-subtle")}>
                  <p className="text-caption text-fg-muted md:hidden">{DOW_SHORT[dowOf(d)]} {Number(d.slice(8))}</p>
                  {closed ? (
                    <p className="py-2 text-meta text-fg-muted">Closed</p>
                  ) : (
                    <textarea
                      aria-label={`${row.name}, ${DOW_SHORT[dowOf(d)]} ${Number(d.slice(8))}`}
                      readOnly={!canEdit}
                      rows={4}
                      value={textOf(k)}
                      onChange={(e) => setCell(k, e.target.value)}
                      className="w-full min-w-0 resize-y rounded-input border border-transparent bg-transparent px-1.5 py-1 text-meta leading-5 text-fg outline-none placeholder:text-fg-muted hover:border-line focus:border-fg focus:bg-bg focus:ring-1 focus:ring-fg"
                      placeholder="Dal tadka"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <SaveBar dirty={changed.length > 0} error={act.error} message={`${changed.length} ${changed.length === 1 ? "day" : "days"} changed`} onDiscard={() => setDraft(base)}>
        <Button size="sm" loading={act.busy} onClick={() => void save()}>Save week</Button>
      </SaveBar>
      {words ? <WordsSheet existing={existing} canEdit={canEdit} onClose={() => setWords(false)} onSaved={() => { setWords(false); onSaved(); }} /> : null}
    </>
  );
}

/** Add Hindi, Urdu and Punjabi names for the week's dishes that have none. Optional: customers see the English name otherwise. */
function WordsSheet({ existing, canEdit, onClose, onSaved }: { existing: tiffinApi.MenuDto[]; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const names = [...new Map(existing.flatMap((m) => m.items).filter((i) => !translated(i)).map((i) => [i.name.toLowerCase(), i])).values()];
  const [vals, setVals] = useState<Record<string, string>>({});
  const set = (name: string, lang: string, v: string) => setVals((c) => ({ ...c, [`${name.toLowerCase()}|${lang}`]: v }));
  const save = async () => {
    const r = await act.run(async () => {
      const menus: tiffinApi.PutMenusBody["menus"] = [];
      for (const m of existing) {
        let touched = false;
        const items = m.items.map((i) => {
          const tr = { ...(i.translations ?? {}) };
          for (const l of LANGS) {
            const v = vals[`${i.name.toLowerCase()}|${l.code}`]?.trim();
            if (v) {
              tr[l.code] = { ...(tr[l.code] ?? {}), name: v };
              touched = true;
            }
          }
          return { ...i, translations: tr };
        });
        if (touched) menus.push({ planId: m.planId, date: m.date, items, notes: m.notes });
      }
      for (let i = 0; i < menus.length; i += CHUNK) await api.tiffin.putMenus({ menus: menus.slice(i, i + CHUNK) });
      return menus.length;
    });
    if (r !== undefined) {
      toast({ message: r ? "Names saved" : "Nothing to save", tone: r ? "success" : "neutral" });
      if (r) onSaved();
    }
  };
  return (
    <Sheet open onClose={onClose} label="Translate dishes" title="Names in Hindi, Urdu and Punjabi" subtitle="Optional. Customers see the English name until you add one." width={480}
      footer={canEdit && names.length ? <Button size="sm" loading={act.busy} onClick={() => void save()}>Save names</Button> : undefined}>
      {names.length === 0 ? (
        <p className="text-meta text-fg-muted">Every dish this week has all three names.</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {names.map((i) => (
            <li key={i.name} className="flex flex-col gap-2">
              <p className="text-body-strong text-fg">{i.name}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {LANGS.map((l) => (
                  <TextField key={l.code} label={l.label} dir={l.dir} lang={l.code} readOnly={!canEdit} value={vals[`${i.name.toLowerCase()}|${l.code}`] ?? i.translations?.[l.code]?.name ?? ""} onChange={(e) => set(i.name, l.code, e.target.value)} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
