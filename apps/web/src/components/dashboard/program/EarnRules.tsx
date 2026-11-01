"use client";
/**
 * wave-n: rules. The three questions of the stamp card, as controls:
 *  - EarnUnitPicker: what one stamp is worth (one visit / one purchase / one pickup / points per dollar);
 *  - EarnScopePicker: what earns (everything, or only some services, categories or items);
 *  - GoalStepper: stamps for the reward, typed or +/- within the bounds.
 */
import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { IconButton } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";
import type { EarnMode, ProgramDraft } from "@/lib/dashboard/program";

export interface UnitOption {
  value: EarnMode;
  title: string;
  hint: string;
}

/** Radio cards: one title, one plain line each. 56px rows, keyboard arrows move like a radio group. */
export function EarnUnitPicker({ options, value, onChange, disabled }: { options: UnitOption[]; value: EarnMode; onChange: (v: EarnMode) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="What one stamp is worth" className="grid gap-2 sm:grid-cols-2">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            tabIndex={on || (!options.some((x) => x.value === value) && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next = options[(i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length]!;
              onChange(next.value);
              (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]")[options.indexOf(next)])?.focus();
            }}
            className={cn(
              "flex min-h-14 flex-col items-start gap-0.5 rounded-input border px-4 py-3 text-start transition-colors focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60",
              on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-line bg-bg hover:bg-bg-subtle",
            )}
          >
            <span className="flex items-center gap-2 text-body font-semibold text-fg">
              <span aria-hidden className={cn("inline-flex size-4 items-center justify-center rounded-full border-2", on ? "border-primary" : "border-line-strong")}>
                {on ? <span className="size-2 rounded-full bg-primary" /> : null}
              </span>
              {o.title}
            </span>
            <span className="ps-6 text-meta text-fg-muted">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

type Ids = Pick<ProgramDraft, "earnScope" | "earnCategoryIds" | "earnItemIds" | "earnServiceIds">;

/** Names of the selected categories, items and services (for the plain-language preview). */
export function selectedNames(d: Ids, opts: merchantApi.EarnOptions | null): string[] {
  if (!opts || d.earnScope !== "selected") return [];
  const pick = (list: { id: string; name: string }[], ids: string[]) => list.filter((x) => ids.includes(x.id)).map((x) => x.name);
  return [...pick(opts.services, d.earnServiceIds), ...pick(opts.categories, d.earnCategoryIds), ...pick(opts.items, d.earnItemIds)];
}

function Group({ title, list, ids, onToggle, disabled }: { title: string; list: { id: string; name: string }[]; ids: string[]; onToggle: (id: string, on: boolean) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  if (!list.length) return null;
  const shown = q.trim() ? list.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase())) : list;
  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="mb-1 text-meta font-semibold text-fg-muted">
        {title} <span className="font-normal">({ids.filter((id) => list.some((x) => x.id === id)).length} of {list.length})</span>
      </legend>
      {list.length > 12 ? <TextField label={`Find ${title.toLowerCase()}`} hideLabel placeholder={`Find ${title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} className="mb-1 sm:max-w-72" /> : null}
      <div className="grid gap-x-6 sm:grid-cols-2">
        {shown.slice(0, 60).map((x) => (
          <Checkbox key={x.id} checked={ids.includes(x.id)} onChange={(on) => onToggle(x.id, on)} label={x.name} disabled={disabled} />
        ))}
      </div>
      {shown.length > 60 ? <p className="text-meta text-fg-muted">Showing 60 of {shown.length}. Search to find the rest.</p> : null}
    </fieldset>
  );
}

/** Everything earns, or only the chosen services, categories and items. An empty catalogue gets a plain explanation. */
export function EarnScopePicker({ draft, onChange, options, error, disabled, term }: { draft: Ids; onChange: (patch: Partial<Ids>) => void; options: merchantApi.EarnOptions | null; error?: string; disabled?: boolean; term: string }) {
  const cats = useMemo(() => (options?.categories ?? []).filter((c) => !c.protected), [options]);
  const empty = !!options && !options.services.length && !options.items.length && !cats.length;
  const toggle = (key: "earnCategoryIds" | "earnItemIds" | "earnServiceIds") => (id: string, on: boolean) => onChange({ [key]: on ? [...draft[key], id] : draft[key].filter((x) => x !== id) });
  const scopeOptions: UnitOption[] = [
    { value: "visit" as EarnMode, title: "Everything", hint: `Every service and item earns ${term}.` },
    { value: "purchase" as EarnMode, title: "Only some", hint: "Pick the services, categories or items that earn." },
  ];
  useEffect(() => {
    // Nothing to choose from: a shop that set "Only some" earlier and then emptied its catalogue keeps earning on everything.
    if (empty && draft.earnScope === "selected" && !draft.earnCategoryIds.length && !draft.earnItemIds.length && !draft.earnServiceIds.length) onChange({ earnScope: "all" });
  }, [empty, draft, onChange]);
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="What earns" className="grid gap-2 sm:grid-cols-2">
        {scopeOptions.map((o) => {
          const v = o.value === "visit" ? "all" : "selected";
          const on = draft.earnScope === v;
          const off = disabled || (v === "selected" && empty);
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={off}
              onClick={() => onChange({ earnScope: v })}
              className={cn(
                "flex min-h-14 flex-col items-start gap-0.5 rounded-input border px-4 py-3 text-start transition-colors focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60",
                on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-line bg-bg hover:bg-bg-subtle",
              )}
            >
              <span className="text-body font-semibold text-fg">{o.title}</span>
              <span className="text-meta text-fg-muted">{o.hint}</span>
            </button>
          );
        })}
      </div>
      {options === null ? <p className="text-meta text-fg-muted">Loading what you sell…</p> : null}
      {empty ? (
        <Banner tone="info" title="Nothing to choose from yet">
          You haven&apos;t added services, menu items or categories yet, so everything you sell earns {term}. Add them under Services or Menu, then come back here to pick only some.
        </Banner>
      ) : null}
      {draft.earnScope === "selected" && options && !empty ? (
        <div className="flex flex-col gap-4 rounded-input bg-bg-subtle p-4">
          <Group title="Services" list={options.services} ids={draft.earnServiceIds} onToggle={toggle("earnServiceIds")} disabled={disabled} />
          <Group title="Categories" list={cats} ids={draft.earnCategoryIds} onToggle={toggle("earnCategoryIds")} disabled={disabled} />
          <Group title="Items" list={options.items} ids={draft.earnItemIds} onToggle={toggle("earnItemIds")} disabled={disabled} />
          <p className="text-meta text-fg-muted">At the counter, staff pick what the customer got. Staff can still add a {term.replace(/s$/, "")} for something else with a reason; it shows in your change log.</p>
        </div>
      ) : null}
      {error ? <p className="text-meta font-medium text-negative">{error}</p> : null}
    </div>
  );
}

/** Stamps for the reward: type any number within the bounds, or nudge it with - and +. */
export function GoalStepper({ value, min, max, onChange, error, disabled }: { value: number; min: number; max: number; onChange: (n: number) => void; error?: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText((t) => (Number.parseInt(t, 10) === value ? t : String(value)));
  }, [value]);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Stamp goal">
      <IconButton icon={Minus} variant="secondary" size={48} label="Fewer stamps" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))} />
      <input
        aria-label="Stamps for the reward"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
          setText(digits);
          if (digits) onChange(Number.parseInt(digits, 10));
        }}
        onBlur={() => {
          if (!text) setText(String(value));
        }}
        className={cn("h-14 w-24 rounded-input border bg-bg text-center font-display text-3xl font-bold tabular-nums text-fg focus-visible:focus-ring", error ? "border-negative" : "border-line")}
      />
      <IconButton icon={Plus} variant="secondary" size={48} label="More stamps" disabled={disabled || value >= max} onClick={() => onChange(clamp(value + 1))} />
      <span className="text-sm text-fg-muted">
        stamps ({min} to {max})
      </span>
    </div>
  );
}
